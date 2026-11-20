// ============================================================================
// Service: node_backend/src/services/company-policy.service.js
// Description: Company attendance policy & versioning management with monotonic
//              locking and race-safe publication (Findings C1, C2, C6, C7).
// ============================================================================

import { db } from "../db/index.js";
import { AppError } from "../middleware/errorHandler.js";
import { validateEffectiveDates } from "./shift-validation.service.js";
import { auditService } from "./audit.service.js";

export const companyPolicyService = {
  /**
   * List all company policies for a tenant.
   */
  async listPolicies(tenantId) {
    const rows = await db.all(
      `SELECT p.id, p.tenant_id, p.name, p.is_active, p.created_at, p.updated_at,
              pv.id as current_version_id, pv.version_number as current_version_number,
              pv.status as current_version_status, pv.effective_from, pv.effective_to,
              pv.min_rest_period_minutes, pv.grace_period_in_minutes,
              pv.early_departure_grace_minutes, pv.early_departure_requires_approval,
              pv.allow_unscheduled_punch, pv.overtime_enabled,
              pv.overtime_min_qualifying_minutes, pv.overtime_rounding_minutes,
              pv.overtime_requires_approval
       FROM workforce_company_policy p
       LEFT JOIN workforce_company_policy_version pv 
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
      `SELECT * FROM workforce_company_policy WHERE id = ? AND tenant_id = ?`,
      [policyId, tenantId]
    );
    if (!policy) {
      throw new AppError("Company policy not found.", 404);
    }
    const versions = await db.all(
      `SELECT * FROM workforce_company_policy_version 
       WHERE policy_id = ? AND tenant_id = ? 
       ORDER BY version_number DESC`,
      [policyId, tenantId]
    );
    return { ...policy, versions };
  },

  /**
   * Create a new company policy header and initial draft version.
   */
  async createPolicy(tenantId, data, actorUser) {
    return db.transaction(async (tx) => {
      const name = (data.name || "Company Attendance Policy").trim();
      const isActive = data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1;

      const [headerResult] = await tx.execute(
        `INSERT INTO workforce_company_policy (tenant_id, name, is_active, created_at, updated_at)
         VALUES (?, ?, ?, NOW(), NOW())`,
        [tenantId, name, isActive]
      );
      const policyId = headerResult.insertId;

      const effectiveFrom = data.effective_from || new Date().toISOString().slice(0, 10);
      validateEffectiveDates(effectiveFrom, data.effective_to);

      const minRest = Number(data.min_rest_period_minutes ?? 660);
      const graceIn = Number(data.grace_period_in_minutes ?? 15);
      const graceEarly = Number(data.early_departure_grace_minutes ?? 15);
      const earlyApproval = data.early_departure_requires_approval !== undefined ? (data.early_departure_requires_approval ? 1 : 0) : 1;
      const allowUnscheduled = data.allow_unscheduled_punch ? 1 : 0;
      const overtimeEnabled = data.overtime_enabled ? 1 : 0;
      const overtimeMin = Number(data.overtime_min_qualifying_minutes ?? 60);
      const overtimeRounding = Number(data.overtime_rounding_minutes ?? 15);
      const overtimeApproval = data.overtime_requires_approval !== undefined ? (data.overtime_requires_approval ? 1 : 0) : 1;

      const [verResult] = await tx.execute(
        `INSERT INTO workforce_company_policy_version (
           tenant_id, policy_id, version_number, status, effective_from, effective_to,
           min_rest_period_minutes, grace_period_in_minutes, early_departure_grace_minutes,
           early_departure_requires_approval, allow_unscheduled_punch,
           overtime_enabled, overtime_min_qualifying_minutes, overtime_rounding_minutes,
           overtime_requires_approval, created_at
         ) VALUES (?, ?, 1, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          tenantId,
          policyId,
          effectiveFrom,
          data.effective_to || null,
          minRest,
          graceIn,
          graceEarly,
          earlyApproval,
          allowUnscheduled,
          overtimeEnabled,
          overtimeMin,
          overtimeRounding,
          overtimeApproval
        ]
      );

      const versionId = verResult.insertId;

      if (actorUser) {
        await auditService.log(
          actorUser,
          "WORKFORCE_COMPANY_POLICY_CREATED",
          policyId,
          { name, initialVersionId: versionId },
          null,
          "INFO",
          tx
        );
      }

      return {
        id: policyId,
        tenant_id: tenantId,
        name,
        is_active: isActive,
        initial_version_id: versionId
      };
    });
  },

  /**
   * List all versions of a company policy.
   */
  async listVersions(tenantId, policyId) {
    const rows = await db.all(
      `SELECT * FROM workforce_company_policy_version 
       WHERE policy_id = ? AND tenant_id = ? 
       ORDER BY version_number DESC`,
      [policyId, tenantId]
    );
    return rows;
  },

  /**
   * Create a new draft version for an existing policy.
   */
  async createDraftVersion(tenantId, policyId, data, actorUser) {
    return db.transaction(async (tx) => {
      // 1. Monotonic Lock: Lock parent policy header
      const [pRows] = await tx.execute(
        `SELECT id FROM workforce_company_policy WHERE id = ? AND tenant_id = ? FOR UPDATE`,
        [policyId, tenantId]
      );
      if (pRows.length === 0) {
        throw new AppError("Company policy not found.", 404);
      }

      // 2. Check draft uniqueness
      const [draftRows] = await tx.execute(
        `SELECT id FROM workforce_company_policy_version 
         WHERE policy_id = ? AND tenant_id = ? AND status = 'draft'`,
        [policyId, tenantId]
      );
      if (draftRows.length > 0) {
        throw new AppError("A draft version already exists for this company policy. Edit or discard the existing draft.", 409);
      }

      // 3. Get next version number
      const [maxRows] = await tx.execute(
        `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_ver 
         FROM workforce_company_policy_version 
         WHERE policy_id = ? AND tenant_id = ?`,
        [policyId, tenantId]
      );
      const nextVer = maxRows[0].next_ver;

      const effectiveFrom = data.effective_from || new Date().toISOString().slice(0, 10);
      validateEffectiveDates(effectiveFrom, data.effective_to);

      const minRest = Number(data.min_rest_period_minutes ?? 660);
      const graceIn = Number(data.grace_period_in_minutes ?? 15);
      const graceEarly = Number(data.early_departure_grace_minutes ?? 15);
      const earlyApproval = data.early_departure_requires_approval !== undefined ? (data.early_departure_requires_approval ? 1 : 0) : 1;
      const allowUnscheduled = data.allow_unscheduled_punch ? 1 : 0;
      const overtimeEnabled = data.overtime_enabled ? 1 : 0;
      const overtimeMin = Number(data.overtime_min_qualifying_minutes ?? 60);
      const overtimeRounding = Number(data.overtime_rounding_minutes ?? 15);
      const overtimeApproval = data.overtime_requires_approval !== undefined ? (data.overtime_requires_approval ? 1 : 0) : 1;

      const [res] = await tx.execute(
        `INSERT INTO workforce_company_policy_version (
           tenant_id, policy_id, version_number, status, effective_from, effective_to,
           min_rest_period_minutes, grace_period_in_minutes, early_departure_grace_minutes,
           early_departure_requires_approval, allow_unscheduled_punch,
           overtime_enabled, overtime_min_qualifying_minutes, overtime_rounding_minutes,
           overtime_requires_approval, created_at
         ) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          tenantId,
          policyId,
          nextVer,
          effectiveFrom,
          data.effective_to || null,
          minRest,
          graceIn,
          graceEarly,
          earlyApproval,
          allowUnscheduled,
          overtimeEnabled,
          overtimeMin,
          overtimeRounding,
          overtimeApproval
        ]
      );

      const versionId = res.insertId;

      if (actorUser) {
        await auditService.log(
          actorUser,
          "WORKFORCE_COMPANY_POLICY_DRAFT_CREATED",
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
        `SELECT id FROM workforce_company_policy WHERE id = ? AND tenant_id = ? FOR UPDATE`,
        [policyId, tenantId]
      );
      if (pRows.length === 0) throw new AppError("Company policy not found.", 404);

      const [vRows] = await tx.execute(
        `SELECT * FROM workforce_company_policy_version WHERE id = ? AND policy_id = ? AND tenant_id = ? FOR UPDATE`,
        [versionId, policyId, tenantId]
      );
      const existing = vRows[0];
      if (!existing) throw new AppError("Policy version not found.", 404);
      if (existing.status !== "draft") throw new AppError("Cannot edit a published or archived policy version.", 400);

      const effectiveFrom = data.effective_from || existing.effective_from;
      const effectiveTo = data.effective_to !== undefined ? data.effective_to : existing.effective_to;
      validateEffectiveDates(effectiveFrom, effectiveTo);

      await tx.execute(
        `UPDATE workforce_company_policy_version
         SET effective_from = ?,
             effective_to = ?,
             min_rest_period_minutes = COALESCE(?, min_rest_period_minutes),
             grace_period_in_minutes = COALESCE(?, grace_period_in_minutes),
             early_departure_grace_minutes = COALESCE(?, early_departure_grace_minutes),
             early_departure_requires_approval = COALESCE(?, early_departure_requires_approval),
             allow_unscheduled_punch = COALESCE(?, allow_unscheduled_punch),
             overtime_enabled = COALESCE(?, overtime_enabled),
             overtime_min_qualifying_minutes = COALESCE(?, overtime_min_qualifying_minutes),
             overtime_rounding_minutes = COALESCE(?, overtime_rounding_minutes),
             overtime_requires_approval = COALESCE(?, overtime_requires_approval)
         WHERE id = ? AND tenant_id = ?`,
        [
          effectiveFrom,
          effectiveTo,
          data.min_rest_period_minutes,
          data.grace_period_in_minutes,
          data.early_departure_grace_minutes,
          data.early_departure_requires_approval,
          data.allow_unscheduled_punch,
          data.overtime_enabled,
          data.overtime_min_qualifying_minutes,
          data.overtime_rounding_minutes,
          data.overtime_requires_approval,
          versionId,
          tenantId
        ]
      );

      if (actorUser) {
        await auditService.log(
          actorUser,
          "WORKFORCE_COMPANY_POLICY_DRAFT_UPDATED",
          versionId,
          { policyId },
          null,
          "INFO",
          tx
        );
      }

      return { success: true, message: "Draft policy version updated." };
    });
  },

  /**
   * Publish a draft company policy version (Findings C1, C2, C6).
   */
  async publishPolicyVersion(tenantId, policyId, versionId, actorUser) {
    return db.transaction(async (tx) => {
      // 1. Monotonic Lock: Lock parent policy header
      const [pRows] = await tx.execute(
        `SELECT id FROM workforce_company_policy WHERE id = ? AND tenant_id = ? FOR UPDATE`,
        [policyId, tenantId]
      );
      if (pRows.length === 0) throw new AppError("Company policy not found.", 404);

      // 2. Lock and re-verify candidate draft version
      const [vRows] = await tx.execute(
        `SELECT * FROM workforce_company_policy_version 
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

      // 3. Atomically close any prior active published version that remains open
      const [priorRows] = await tx.execute(
        `SELECT id, effective_from, effective_to 
         FROM workforce_company_policy_version
         WHERE policy_id = ? AND tenant_id = ? AND status = 'published' AND id <> ?
           AND effective_from < ?
           AND (effective_to IS NULL OR effective_to >= ?)
         ORDER BY id ASC
         FOR UPDATE`,
        [policyId, tenantId, versionId, effectiveFrom, effectiveFrom]
      );

      for (const prior of priorRows) {
        await tx.execute(
          `UPDATE workforce_company_policy_version
           SET effective_to = DATE_SUB(?, INTERVAL 1 DAY)
           WHERE id = ? AND tenant_id = ?`,
          [effectiveFrom, prior.id, tenantId]
        );
      }

      // 4. Publish candidate version
      await tx.execute(
        `UPDATE workforce_company_policy_version
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
          "WORKFORCE_COMPANY_POLICY_PUBLISHED",
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
  },

  /**
   * Archive an expired policy version (Finding C7).
   */
  async archivePolicyVersion(tenantId, policyId, versionId, actorUser) {
    return db.transaction(async (tx) => {
      const [pRows] = await tx.execute(
        `SELECT id FROM workforce_company_policy WHERE id = ? AND tenant_id = ? FOR UPDATE`,
        [policyId, tenantId]
      );
      if (pRows.length === 0) throw new AppError("Company policy not found.", 404);

      const [vRows] = await tx.execute(
        `SELECT * FROM workforce_company_policy_version WHERE id = ? AND policy_id = ? AND tenant_id = ? FOR UPDATE`,
        [versionId, policyId, tenantId]
      );
      const version = vRows[0];
      if (!version) throw new AppError("Policy version not found.", 404);
      if (version.status !== "published") throw new AppError("Only published versions can be archived.", 400);

      const now = new Date().toISOString().slice(0, 10);
      if (!version.effective_to || version.effective_to > now) {
        throw new AppError("Cannot archive a policy version until its effective_to date has passed.", 400);
      }

      await tx.execute(
        `UPDATE workforce_company_policy_version
         SET status = 'archived', archived_at = NOW(), archived_by = ?
         WHERE id = ? AND tenant_id = ?`,
        [actorUser?.id || null, versionId, tenantId]
      );

      if (actorUser) {
        await auditService.log(
          actorUser,
          "WORKFORCE_COMPANY_POLICY_ARCHIVED",
          versionId,
          { policyId },
          null,
          "INFO",
          tx
        );
      }

      return { success: true, message: "Policy version archived." };
    });
  }
};
