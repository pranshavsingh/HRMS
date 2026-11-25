// ============================================================================
// Service: node_backend/src/services/weekly-off-policy.service.js
// Description: Weekly-off policy & versioning management with monotonic locking
//              and race-safe publication (Findings C1, C2, C6, C7).
// ============================================================================

import { db } from "../db/index.js";
import { AppError } from "../middleware/errorHandler.js";
import { validateEffectiveDates } from "./shift-validation.service.js";
import { auditService } from "./audit.service.js";
import { realtimeService } from "./realtime.service.js";

export const weeklyOffPolicyService = {
  /**
   * List all weekly-off policies for a tenant.
   */
  async listPolicies(tenantId) {
    const rows = await db.all(
      `SELECT p.id, p.tenant_id, p.code, p.name, p.description, p.is_active, p.created_at, p.updated_at,
              pv.id as current_version_id, pv.version_number as current_version_number,
              pv.status as current_version_status, pv.effective_from, pv.effective_to,
              pv.policy_type, pv.days_of_week, pv.rules_config
       FROM workforce_weekly_off_policy p
       LEFT JOIN workforce_weekly_off_policy_version pv 
         ON pv.policy_id = p.id AND pv.tenant_id = p.tenant_id AND pv.status = 'published'
            AND pv.effective_from <= CURRENT_DATE() 
            AND (pv.effective_to IS NULL OR pv.effective_to >= CURRENT_DATE())
       WHERE p.tenant_id = ?
       ORDER BY p.id ASC`,
      [tenantId]
    );
    return rows;
  },

  /**
   * Get single policy by ID.
   */
  async getPolicyById(tenantId, policyId) {
    const policy = await db.get(
      `SELECT * FROM workforce_weekly_off_policy WHERE id = ? AND tenant_id = ?`,
      [policyId, tenantId]
    );
    if (!policy) {
      throw new AppError("Weekly-off policy not found.", 404);
    }
    const versions = await db.all(
      `SELECT * FROM workforce_weekly_off_policy_version 
       WHERE policy_id = ? AND tenant_id = ? 
       ORDER BY version_number DESC`,
      [policyId, tenantId]
    );
    return { ...policy, versions };
  },

  /**
   * Create a new weekly-off policy header and initial draft version.
   */
  async createPolicy(tenantId, data, actorUser) {
    return db.transaction(async (tx) => {
      const code = (data.code || "WEEKLY_OFF").trim().toUpperCase();
      const name = (data.name || "Weekly Off Policy").trim();
      const description = data.description || null;
      const isActive = data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1;

      const [headerResult] = await tx.execute(
        `INSERT INTO workforce_weekly_off_policy (tenant_id, code, name, description, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
        [tenantId, code, name, description, isActive]
      );
      const policyId = headerResult.insertId;

      const effectiveFrom = data.effective_from || new Date().toISOString().slice(0, 10);
      validateEffectiveDates(effectiveFrom, data.effective_to);

      const policyType = data.policy_type || "fixed";
      const daysOfWeek = JSON.stringify(Array.isArray(data.days_of_week) ? data.days_of_week : [0]);
      const rulesConfig = data.rules_config ? JSON.stringify(data.rules_config) : null;

      const [verResult] = await tx.execute(
        `INSERT INTO workforce_weekly_off_policy_version (
           tenant_id, policy_id, version_number, status, policy_type,
           days_of_week, rules_config, effective_from, effective_to, created_at
         ) VALUES (?, ?, 1, 'draft', ?, ?, ?, ?, ?, NOW())`,
        [tenantId, policyId, policyType, daysOfWeek, rulesConfig, effectiveFrom, data.effective_to || null]
      );

      const versionId = verResult.insertId;

      if (actorUser) {
        await auditService.log(
          actorUser,
          "WORKFORCE_WEEKLY_OFF_POLICY_CREATED",
          policyId,
          { code, name, initialVersionId: versionId },
          null,
          "INFO",
          tx
        );
      }

      return {
        id: policyId,
        tenant_id: tenantId,
        code,
        name,
        is_active: isActive,
        initial_version_id: versionId
      };
    });
  },

  /**
   * List all versions of a weekly-off policy.
   */
  async listVersions(tenantId, policyId) {
    const rows = await db.all(
      `SELECT * FROM workforce_weekly_off_policy_version 
       WHERE policy_id = ? AND tenant_id = ? 
       ORDER BY version_number DESC`,
      [policyId, tenantId]
    );
    return rows;
  },

  /**
   * Create a new draft version for an existing weekly-off policy.
   */
  async createDraftVersion(tenantId, policyId, data, actorUser) {
    return db.transaction(async (tx) => {
      // 1. Monotonic Lock: Lock parent policy header
      const [pRows] = await tx.execute(
        `SELECT id FROM workforce_weekly_off_policy WHERE id = ? AND tenant_id = ? FOR UPDATE`,
        [policyId, tenantId]
      );
      if (pRows.length === 0) {
        throw new AppError("Weekly-off policy not found.", 404);
      }

      // 2. Check draft uniqueness
      const [draftRows] = await tx.execute(
        `SELECT id FROM workforce_weekly_off_policy_version 
         WHERE policy_id = ? AND tenant_id = ? AND status = 'draft'`,
        [policyId, tenantId]
      );
      if (draftRows.length > 0) {
        throw new AppError("A draft version already exists for this weekly-off policy. Edit or discard the existing draft.", 409);
      }

      // 3. Get next version number
      const [maxRows] = await tx.execute(
        `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_ver 
         FROM workforce_weekly_off_policy_version 
         WHERE policy_id = ? AND tenant_id = ?`,
        [policyId, tenantId]
      );
      const nextVer = maxRows[0].next_ver;

      const effectiveFrom = data.effective_from || new Date().toISOString().slice(0, 10);
      validateEffectiveDates(effectiveFrom, data.effective_to);

      const policyType = data.policy_type || "fixed";
      const daysOfWeek = JSON.stringify(Array.isArray(data.days_of_week) ? data.days_of_week : [0]);
      const rulesConfig = data.rules_config ? JSON.stringify(data.rules_config) : null;

      const [res] = await tx.execute(
        `INSERT INTO workforce_weekly_off_policy_version (
           tenant_id, policy_id, version_number, status, policy_type,
           days_of_week, rules_config, effective_from, effective_to, created_at
         ) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, NOW())`,
        [tenantId, policyId, nextVer, policyType, daysOfWeek, rulesConfig, effectiveFrom, data.effective_to || null]
      );

      const versionId = res.insertId;

      if (actorUser) {
        await auditService.log(
          actorUser,
          "WORKFORCE_WEEKLY_OFF_POLICY_DRAFT_CREATED",
          versionId,
          { policyId, versionNumber: nextVer },
          null,
          "INFO",
          tx
        );
      }

      return {
        id: versionId,
        tenant_id: tenantId,
        policy_id: policyId,
        version_number: nextVer,
        status: "draft"
      };
    });
  },

  /**
   * Update draft version parameters.
   */
  async updateDraftVersion(tenantId, policyId, versionId, data, actorUser) {
    return db.transaction(async (tx) => {
      // Monotonic lock: parent policy header
      const [pRows] = await tx.execute(
        `SELECT id FROM workforce_weekly_off_policy WHERE id = ? AND tenant_id = ? FOR UPDATE`,
        [policyId, tenantId]
      );
      if (pRows.length === 0) throw new AppError("Weekly-off policy not found.", 404);

      const [vRows] = await tx.execute(
        `SELECT * FROM workforce_weekly_off_policy_version WHERE id = ? AND policy_id = ? AND tenant_id = ? FOR UPDATE`,
        [versionId, policyId, tenantId]
      );
      const existing = vRows[0];
      if (!existing) throw new AppError("Policy version not found.", 404);
      if (existing.status !== "draft") throw new AppError("Cannot edit a published or archived policy version.", 400);

      const effectiveFrom = data.effective_from || existing.effective_from;
      const effectiveTo = data.effective_to !== undefined ? data.effective_to : existing.effective_to;
      validateEffectiveDates(effectiveFrom, effectiveTo);

      const policyType = data.policy_type || existing.policy_type;
      const daysOfWeek = data.days_of_week ? JSON.stringify(data.days_of_week) : existing.days_of_week;
      const rulesConfig = data.rules_config !== undefined ? (data.rules_config ? JSON.stringify(data.rules_config) : null) : existing.rules_config;

      await tx.execute(
        `UPDATE workforce_weekly_off_policy_version
         SET effective_from = ?,
             effective_to = ?,
             policy_type = ?,
             days_of_week = ?,
             rules_config = ?
         WHERE id = ? AND tenant_id = ?`,
        [effectiveFrom, effectiveTo, policyType, daysOfWeek, rulesConfig, versionId, tenantId]
      );

      if (actorUser) {
        await auditService.log(
          actorUser,
          "WORKFORCE_WEEKLY_OFF_POLICY_DRAFT_UPDATED",
          versionId,
          { policyId },
          null,
          "INFO",
          tx
        );
      }

      return { success: true, message: "Draft weekly-off policy version updated." };
    });
  },

  /**
   * Publish a draft weekly-off policy version (Findings C1, C2, C6).
   */
  async publishPolicyVersion(tenantId, policyId, versionId, actorUser) {
    const result = await db.transaction(async (tx) => {
      // 1. Monotonic Lock: Lock parent policy header
      const [pRows] = await tx.execute(
        `SELECT id FROM workforce_weekly_off_policy WHERE id = ? AND tenant_id = ? FOR UPDATE`,
        [policyId, tenantId]
      );
      if (pRows.length === 0) throw new AppError("Weekly-off policy not found.", 404);

      // 2. Lock and re-verify candidate draft version
      const [vRows] = await tx.execute(
        `SELECT * FROM workforce_weekly_off_policy_version 
         WHERE id = ? AND policy_id = ? AND tenant_id = ? 
         FOR UPDATE`,
        [versionId, policyId, tenantId]
      );
      const draft = vRows[0];
      if (!draft) throw new AppError("Policy version not found.", 404);
      if (draft.status !== "draft") {
        throw new AppError("Only draft versions can be published.", 400);
      }

      const effectiveFrom = draft.effective_from;

      // 3. Atomically close any prior active published version
      const [priorRows] = await tx.execute(
        `SELECT id, effective_from, effective_to 
         FROM workforce_weekly_off_policy_version
         WHERE policy_id = ? AND tenant_id = ? AND status = 'published' AND id <> ?
           AND effective_from < ?
           AND (effective_to IS NULL OR effective_to >= ?)
         ORDER BY id ASC
         FOR UPDATE`,
        [policyId, tenantId, versionId, effectiveFrom, effectiveFrom]
      );

      for (const prior of priorRows) {
        await tx.execute(
          `UPDATE workforce_weekly_off_policy_version
           SET effective_to = DATE_SUB(?, INTERVAL 1 DAY)
           WHERE id = ? AND tenant_id = ?`,
          [effectiveFrom, prior.id, tenantId]
        );
      }

      // 4. Publish candidate version
      await tx.execute(
        `UPDATE workforce_weekly_off_policy_version
         SET status = 'published',
             published_at = NOW(),
             published_by = ?
         WHERE id = ? AND tenant_id = ?`,
        [actorUser?.id || null, versionId, tenantId]
      );

      // 5. Audit log
      if (actorUser) {
        await auditService.log(
          actorUser,
          "WORKFORCE_WEEKLY_OFF_POLICY_PUBLISHED",
          versionId,
          { policyId, effectiveFrom },
          null,
          "INFO",
          tx
        );
      }

      return {
        id: versionId,
        policy_id: policyId,
        status: "published",
        effective_from: effectiveFrom
      };
    });
    realtimeService.emitToTenant(tenantId, "policy:updated", { policyId, versionId, type: "weekly_off_policy_published" });
    return result;
  },

  /**
   * Archive an expired weekly-off policy version (Finding C7).
   */
  async archivePolicyVersion(tenantId, policyId, versionId, actorUser) {
    return db.transaction(async (tx) => {
      const [pRows] = await tx.execute(
        `SELECT id FROM workforce_weekly_off_policy WHERE id = ? AND tenant_id = ? FOR UPDATE`,
        [policyId, tenantId]
      );
      if (pRows.length === 0) throw new AppError("Weekly-off policy not found.", 404);

      const [vRows] = await tx.execute(
        `SELECT * FROM workforce_weekly_off_policy_version WHERE id = ? AND policy_id = ? AND tenant_id = ? FOR UPDATE`,
        [versionId, policyId, tenantId]
      );
      const version = vRows[0];
      if (!version) throw new AppError("Policy version not found.", 404);
      if (version.status !== "published") throw new AppError("Only published versions can be archived.", 400);

      const now = new Date().toISOString().slice(0, 10);
      if (!version.effective_to || version.effective_to > now) {
        throw new AppError("Cannot archive a weekly-off policy version until its effective_to date has passed.", 400);
      }

      await tx.execute(
        `UPDATE workforce_weekly_off_policy_version
         SET status = 'archived', archived_at = NOW(), archived_by = ?
         WHERE id = ? AND tenant_id = ?`,
        [actorUser?.id || null, versionId, tenantId]
      );

      if (actorUser) {
        await auditService.log(
          actorUser,
          "WORKFORCE_WEEKLY_OFF_POLICY_ARCHIVED",
          versionId,
          { policyId },
          null,
          "INFO",
          tx
        );
      }

      return { success: true, message: "Weekly-off policy version archived." };
    });
  }
};
