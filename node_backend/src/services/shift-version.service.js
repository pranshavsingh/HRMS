// ============================================================================
// Service: node_backend/src/services/shift-version.service.js
// Description: Shift version lifecycle service enforcing monotonic locking,
//              draft-first editing, snapshot freezing, and race-safe publication
//              (Findings C1, C2, C4, C5, C6, C7).
// ============================================================================

import { db } from "../db/index.js";
import { AppError } from "../middleware/errorHandler.js";
import {
  calculateShiftDuration,
  validateBreaks,
  validateEffectiveDates,
  formatDateToYMD
} from "./shift-validation.service.js";
import {
  buildShiftSnapshot,
  verifySnapshotIntegrity
} from "./shift-snapshot.service.js";
import { auditService } from "./audit.service.js";

async function runWithTx(existingTx, fn) {
  if (existingTx) {
    return fn(existingTx);
  }
  return db.transaction(fn);
}

export const shiftVersionService = {
  /**
   * List all versions of a shift.
   */
  async listVersions(tenantId, shiftId) {
    const rows = await db.all(
      `SELECT v.*,
              cp.name as policy_name,
              wop.name as weekly_off_policy_name
       FROM workforce_shift_version v
       LEFT JOIN workforce_company_policy cp ON cp.id = v.policy_id AND cp.tenant_id = v.tenant_id
       LEFT JOIN workforce_weekly_off_policy wop ON wop.id = v.weekly_off_policy_id AND wop.tenant_id = v.tenant_id
       WHERE v.shift_id = ? AND v.tenant_id = ?
       ORDER BY v.version_number DESC`,
      [shiftId, tenantId]
    );

    return rows.map((r) => {
      let snapshot = null;
      if (r.config_snapshot) {
        try {
          snapshot = typeof r.config_snapshot === "string" ? JSON.parse(r.config_snapshot) : r.config_snapshot;
        } catch (e) {}
      }
      return {
        ...r,
        config_snapshot: snapshot,
        is_snapshot_verified: snapshot ? verifySnapshotIntegrity(snapshot) : false
      };
    });
  },

  /**
   * Get single shift version by ID with breaks and snapshot.
   */
  async getVersionById(tenantId, shiftId, versionId) {
    const version = await db.get(
      `SELECT v.*,
              s.code as shift_code, s.name as shift_name, s.timezone as shift_timezone,
              cp.name as policy_name,
              wop.name as weekly_off_policy_name
       FROM workforce_shift_version v
       JOIN workforce_shift s ON s.id = v.shift_id AND s.tenant_id = v.tenant_id
       LEFT JOIN workforce_company_policy cp ON cp.id = v.policy_id AND cp.tenant_id = v.tenant_id
       LEFT JOIN workforce_weekly_off_policy wop ON wop.id = v.weekly_off_policy_id AND wop.tenant_id = v.tenant_id
       WHERE v.id = ? AND v.shift_id = ? AND v.tenant_id = ?`,
      [versionId, shiftId, tenantId]
    );

    if (!version) {
      throw new AppError("Shift version not found.", 404);
    }

    const breaks = await db.all(
      `SELECT * FROM workforce_shift_break
       WHERE shift_version_id = ? AND tenant_id = ?
       ORDER BY display_order ASC, start_offset_minutes ASC`,
      [versionId, tenantId]
    );

    let snapshot = null;
    if (version.config_snapshot) {
      try {
        snapshot = typeof version.config_snapshot === "string" ? JSON.parse(version.config_snapshot) : version.config_snapshot;
      } catch (e) {}
    }

    return {
      ...version,
      breaks,
      config_snapshot: snapshot,
      is_snapshot_verified: snapshot ? verifySnapshotIntegrity(snapshot) : false
    };
  },

  /**
   * Create a new draft shift version.
   * Can clone an existing version or start fresh.
   */
  async createDraftVersion(tenantId, shiftId, data, actorUser, existingTx = null) {
    return runWithTx(existingTx, async (tx) => {
      // 1. Monotonic Lock: Lock shift header
      const [shiftRows] = await tx.execute(
        `SELECT id, tenant_id, code, name, timezone, is_active 
         FROM workforce_shift 
         WHERE id = ? AND tenant_id = ? FOR UPDATE`,
        [shiftId, tenantId]
      );
      const shift = shiftRows[0];
      if (!shift) {
        throw new AppError("Shift not found.", 404);
      }

      // 2. Draft uniqueness check
      const [existingDrafts] = await tx.execute(
        `SELECT id FROM workforce_shift_version 
         WHERE shift_id = ? AND tenant_id = ? AND status = 'draft'`,
        [shiftId, tenantId]
      );
      if (existingDrafts.length > 0) {
        throw new AppError("A draft version already exists for this shift. Edit or discard the existing draft.", 409);
      }

      // 3. Determine next version number
      const [maxRows] = await tx.execute(
        `SELECT COALESCE(MAX(version_number), 0) + 1 AS next_ver 
         FROM workforce_shift_version 
         WHERE shift_id = ? AND tenant_id = ?`,
        [shiftId, tenantId]
      );
      const nextVer = maxRows[0].next_ver;

      // Base timings from input or cloned version
      let startTime = data.start_time;
      let endTime = data.end_time;
      let isOvernight = data.is_overnight;
      let lateGrace = Number(data.late_grace_minutes ?? 15);
      let earlyDepartureGrace = Number(data.early_departure_grace_minutes ?? 15);
      let policyId = data.policy_id || null;
      let weeklyOffPolicyId = data.weekly_off_policy_id || null;
      let effectiveFrom = data.effective_from || new Date().toISOString().slice(0, 10);
      let cloneBreaks = [];

      if (data.clone_from_version_id) {
        const [sourceRows] = await tx.execute(
          `SELECT * FROM workforce_shift_version WHERE id = ? AND shift_id = ? AND tenant_id = ?`,
          [data.clone_from_version_id, shiftId, tenantId]
        );
        const source = sourceRows[0];
        if (source) {
          startTime = startTime || source.start_time;
          endTime = endTime || source.end_time;
          isOvernight = isOvernight !== undefined ? isOvernight : source.is_overnight;
          lateGrace = data.late_grace_minutes !== undefined ? lateGrace : source.late_grace_minutes;
          earlyDepartureGrace = data.early_departure_grace_minutes !== undefined ? earlyDepartureGrace : source.early_departure_grace_minutes;
          policyId = policyId || source.policy_id;
          weeklyOffPolicyId = weeklyOffPolicyId || source.weekly_off_policy_id;

          const [srcBreaks] = await tx.execute(
            `SELECT break_name, break_type, start_offset_minutes, end_offset_minutes, duration_minutes, is_mandatory, display_order
             FROM workforce_shift_break WHERE shift_version_id = ? AND tenant_id = ?`,
            [data.clone_from_version_id, tenantId]
          );
          cloneBreaks = srcBreaks;
        }
      }

      if (!startTime || !endTime) {
        throw new AppError("start_time and end_time are required.", 400);
      }

      const { durationMinutes, isOvernight: detectedOvernight } = calculateShiftDuration(
        startTime,
        endTime,
        isOvernight
      );

      validateEffectiveDates(effectiveFrom, data.effective_to);

      // 4. Insert draft version
      const [insertResult] = await tx.execute(
        `INSERT INTO workforce_shift_version (
           tenant_id, shift_id, version_number, status, start_time, end_time,
           is_overnight, duration_minutes, late_grace_minutes, early_departure_grace_minutes,
           policy_id, weekly_off_policy_id, effective_from, effective_to, created_at
         ) VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          tenantId,
          shiftId,
          nextVer,
          startTime,
          endTime,
          detectedOvernight ? 1 : 0,
          durationMinutes,
          lateGrace,
          earlyDepartureGrace,
          policyId,
          weeklyOffPolicyId,
          effectiveFrom,
          data.effective_to || null
        ]
      );

      const newVersionId = insertResult.insertId;

      // 5. Clone breaks if requested
      const inputBreaks = data.breaks || cloneBreaks;
      if (Array.isArray(inputBreaks) && inputBreaks.length > 0) {
        validateBreaks(inputBreaks, durationMinutes);
        for (const b of inputBreaks) {
          await tx.execute(
            `INSERT INTO workforce_shift_break (
               tenant_id, shift_id, shift_version_id, break_name, break_type,
               start_offset_minutes, end_offset_minutes, duration_minutes,
               is_mandatory, display_order, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [
              tenantId,
              shiftId,
              newVersionId,
              b.break_name || "Break",
              b.break_type || "unpaid",
              b.start_offset_minutes,
              b.end_offset_minutes,
              b.duration_minutes || (b.end_offset_minutes - b.start_offset_minutes),
              b.is_mandatory !== undefined ? (b.is_mandatory ? 1 : 0) : 1,
              b.display_order || 1
            ]
          );
        }
      }

      if (actorUser) {
        await auditService.log(
          actorUser,
          "WORKFORCE_SHIFT_DRAFT_CREATED",
          newVersionId,
          { shiftId, versionNumber: nextVer },
          null,
          "INFO",
          tx
        );
      }

      return {
        id: newVersionId,
        tenant_id: tenantId,
        shift_id: shiftId,
        version_number: nextVer,
        status: "draft",
        duration_minutes: durationMinutes,
        is_overnight: detectedOvernight,
        effective_from: effectiveFrom,
        effective_to: null
      };
    });
  },

  /**
   * Update a draft shift version parameters.
   */
  async updateDraftVersion(tenantId, shiftId, versionId, data, actorUser, existingTx = null) {
    return runWithTx(existingTx, async (tx) => {
      // 1. Lock parent shift header
      const [sRows] = await tx.execute(
        `SELECT id FROM workforce_shift WHERE id = ? AND tenant_id = ? FOR UPDATE`,
        [shiftId, tenantId]
      );
      if (sRows.length === 0) throw new AppError("Shift not found.", 404);

      // 2. Lock shift version row
      const [vRows] = await tx.execute(
        `SELECT * FROM workforce_shift_version WHERE id = ? AND shift_id = ? AND tenant_id = ? FOR UPDATE`,
        [versionId, shiftId, tenantId]
      );
      const version = vRows[0];
      if (!version) throw new AppError("Shift version not found.", 404);
      if (version.status !== "draft") {
        throw new AppError("Cannot edit a published or archived shift version.", 400);
      }

      const startTime = data.start_time || version.start_time;
      const endTime = data.end_time || version.end_time;
      const isOvernightParam = data.is_overnight !== undefined ? data.is_overnight : version.is_overnight;

      const { durationMinutes, isOvernight } = calculateShiftDuration(startTime, endTime, isOvernightParam);

      const effectiveFrom = data.effective_from || version.effective_from;
      const effectiveTo = data.effective_to !== undefined ? data.effective_to : version.effective_to;
      validateEffectiveDates(effectiveFrom, effectiveTo);

      // Validate breaks against new duration if duration decreased
      const [existingBreaks] = await tx.execute(
        `SELECT * FROM workforce_shift_break WHERE shift_version_id = ? AND tenant_id = ?`,
        [versionId, tenantId]
      );
      if (existingBreaks.length > 0) {
        validateBreaks(existingBreaks, durationMinutes);
      }

      await tx.execute(
        `UPDATE workforce_shift_version
         SET start_time = ?,
             end_time = ?,
             is_overnight = ?,
             duration_minutes = ?,
             late_grace_minutes = COALESCE(?, late_grace_minutes),
             early_departure_grace_minutes = COALESCE(?, early_departure_grace_minutes),
             policy_id = COALESCE(?, policy_id),
             weekly_off_policy_id = COALESCE(?, weekly_off_policy_id),
             effective_from = ?,
             effective_to = ?
         WHERE id = ? AND tenant_id = ?`,
        [
          startTime,
          endTime,
          isOvernight ? 1 : 0,
          durationMinutes,
          data.late_grace_minutes,
          data.early_departure_grace_minutes,
          data.policy_id,
          data.weekly_off_policy_id,
          effectiveFrom,
          effectiveTo,
          versionId,
          tenantId
        ]
      );

      if (actorUser) {
        await auditService.log(
          actorUser,
          "WORKFORCE_SHIFT_DRAFT_UPDATED",
          versionId,
          { shiftId },
          null,
          "INFO",
          tx
        );
      }

      return { success: true, message: "Draft shift version updated." };
    });
  },

  /**
   * Publish a draft shift version (Findings C1, C2, C4, C5, C6).
   */
  async publishVersion(tenantId, shiftId, versionId, actorUser, existingTx = null) {
    return runWithTx(existingTx, async (tx) => {
      // 1. First, read draft version to discover policy references
      const [initialRows] = await tx.execute(
        `SELECT id, shift_id, policy_id, weekly_off_policy_id, status 
         FROM workforce_shift_version 
         WHERE id = ? AND shift_id = ? AND tenant_id = ?`,
        [versionId, shiftId, tenantId]
      );
      const initialDraft = initialRows[0];
      if (!initialDraft) throw new AppError("Shift version not found.", 404);
      if (initialDraft.status !== "draft") throw new AppError("Only draft versions can be published.", 400);

      // Fallback to active tenant policy if not explicitly set on draft
      let targetPolicyId = initialDraft.policy_id;
      if (!targetPolicyId) {
        const [defaultPolicy] = await tx.execute(
          `SELECT id FROM workforce_company_policy WHERE tenant_id = ? AND is_active = 1 ORDER BY id ASC LIMIT 1`,
          [tenantId]
        );
        targetPolicyId = defaultPolicy[0]?.id;
      }

      let targetWeeklyOffPolicyId = initialDraft.weekly_off_policy_id;
      if (!targetWeeklyOffPolicyId) {
        const [defaultWeekly] = await tx.execute(
          `SELECT id FROM workforce_weekly_off_policy WHERE tenant_id = ? AND is_active = 1 ORDER BY id ASC LIMIT 1`,
          [tenantId]
        );
        targetWeeklyOffPolicyId = defaultWeekly[0]?.id;
      }

      if (!targetPolicyId) {
        throw new AppError("Cannot publish shift: No company attendance policy is configured for this tenant.", 400);
      }
      if (!targetWeeklyOffPolicyId) {
        throw new AppError("Cannot publish shift: No weekly-off policy is configured for this tenant.", 400);
      }

      // 2. Global Monotonic Lock Sequence (Finding C2)
      // Lock company policy header -> weekly-off policy header -> shift header
      if (targetPolicyId) {
        await tx.execute(
          `SELECT id FROM workforce_company_policy WHERE id = ? AND tenant_id = ? FOR UPDATE`,
          [targetPolicyId, tenantId]
        );
      }
      if (targetWeeklyOffPolicyId) {
        await tx.execute(
          `SELECT id FROM workforce_weekly_off_policy WHERE id = ? AND tenant_id = ? FOR UPDATE`,
          [targetWeeklyOffPolicyId, tenantId]
        );
      }
      const [shiftRows] = await tx.execute(
        `SELECT id, code, name, timezone, is_active 
         FROM workforce_shift 
         WHERE id = ? AND tenant_id = ? FOR UPDATE`,
        [shiftId, tenantId]
      );
      const shift = shiftRows[0];
      if (!shift) throw new AppError("Shift not found.", 404);

      // Lock draft version row
      const [vRows] = await tx.execute(
        `SELECT * FROM workforce_shift_version 
         WHERE id = ? AND shift_id = ? AND tenant_id = ? 
         FOR UPDATE`,
        [versionId, shiftId, tenantId]
      );
      const version = vRows[0];
      if (!version) throw new AppError("Shift version not found.", 404);
      if (version.status !== "draft") throw new AppError("Only draft versions can be published.", 400);

      // 3. Lock and validate sibling breaks under lock
      const [breaks] = await tx.execute(
        `SELECT * FROM workforce_shift_break 
         WHERE shift_version_id = ? AND tenant_id = ?
         ORDER BY display_order ASC, start_offset_minutes ASC
         FOR UPDATE`,
        [versionId, tenantId]
      );
      validateBreaks(breaks, version.duration_minutes);

      const effectiveFrom = formatDateToYMD(version.effective_from);

      // 4. Verify exactly 1 covering company policy version
      const [coveringCpRows] = await tx.execute(
        `SELECT * FROM workforce_company_policy_version
         WHERE policy_id = ? AND tenant_id = ? AND status = 'published'
           AND effective_from <= ?
           AND (effective_to IS NULL OR effective_to >= ?)
         ORDER BY id ASC
         FOR UPDATE`,
        [targetPolicyId, tenantId, effectiveFrom, effectiveFrom]
      );
      if (coveringCpRows.length === 0) {
        throw new AppError(`No published company policy covers effective_from date (${effectiveFrom}).`, 400);
      }
      if (coveringCpRows.length > 1) {
        throw new AppError(`Ambiguous company policy: Multiple published policy versions cover date (${effectiveFrom}).`, 400);
      }
      const coveringCp = coveringCpRows[0];

      // 5. Verify exactly 1 covering weekly-off policy version
      const [coveringWopRows] = await tx.execute(
        `SELECT * FROM workforce_weekly_off_policy_version
         WHERE policy_id = ? AND tenant_id = ? AND status = 'published'
           AND effective_from <= ?
           AND (effective_to IS NULL OR effective_to >= ?)
         ORDER BY id ASC
         FOR UPDATE`,
        [targetWeeklyOffPolicyId, tenantId, effectiveFrom, effectiveFrom]
      );
      if (coveringWopRows.length === 0) {
        throw new AppError(`No published weekly-off policy covers effective_from date (${effectiveFrom}).`, 400);
      }
      if (coveringWopRows.length > 1) {
        throw new AppError(`Ambiguous weekly-off policy: Multiple published versions cover date (${effectiveFrom}).`, 400);
      }
      const coveringWop = coveringWopRows[0];

      // 6. Build and freeze Authoritative Configuration Snapshot (Finding C4)
      const publishedAt = new Date().toISOString();
      const snapshot = buildShiftSnapshot({
        tenantId,
        shift,
        version,
        breaks,
        companyPolicy: { id: targetPolicyId, name: "Company Policy" },
        companyPolicyVersion: coveringCp,
        weeklyOffPolicy: { id: targetWeeklyOffPolicyId, code: "WEEKLY_OFF", name: "Weekly Off Policy" },
        weeklyOffPolicyVersion: coveringWop,
        publishedBy: actorUser?.id || null,
        publishedAt,
        tier: "fully_reconstructable"
      });

      // 7. Atomically close any prior active published shift version (Finding C1, C7)
      const [priorPublished] = await tx.execute(
        `SELECT id, effective_from, effective_to 
         FROM workforce_shift_version
         WHERE shift_id = ? AND tenant_id = ? AND status = 'published' AND id <> ?
           AND effective_from < ?
           AND (effective_to IS NULL OR effective_to >= ?)
         ORDER BY id ASC
         FOR UPDATE`,
        [shiftId, tenantId, versionId, effectiveFrom, effectiveFrom]
      );

      for (const prior of priorPublished) {
        await tx.execute(
          `UPDATE workforce_shift_version
           SET effective_to = DATE_SUB(?, INTERVAL 1 DAY)
           WHERE id = ? AND tenant_id = ?`,
          [effectiveFrom, prior.id, tenantId]
        );
      }

      // 8. Publish candidate version
      await tx.execute(
        `UPDATE workforce_shift_version
         SET status = 'published',
             policy_id = ?,
             policy_version_id = ?,
             weekly_off_policy_id = ?,
             weekly_off_policy_version_id = ?,
             config_snapshot = ?,
             published_at = NOW(),
             published_by = ?
         WHERE id = ? AND tenant_id = ?`,
        [
          targetPolicyId,
          coveringCp.id,
          targetWeeklyOffPolicyId,
          coveringWop.id,
          JSON.stringify(snapshot),
          actorUser?.id || null,
          versionId,
          tenantId
        ]
      );

      // 9. Audit log
      if (actorUser) {
        await auditService.log(
          actorUser,
          "WORKFORCE_SHIFT_PUBLISHED",
          versionId,
          {
            shiftId,
            effectiveFrom,
            snapshotHash: snapshot.integrity.payload_hash
          },
          null,
          "INFO",
          tx
        );
      }

      return {
        id: versionId,
        shift_id: shiftId,
        status: "published",
        effective_from: effectiveFrom,
        snapshot_hash: snapshot.integrity.payload_hash
      };
    });
  },

  /**
   * Archive an expired shift version (Finding C7).
   */
  async archiveVersion(tenantId, shiftId, versionId, actorUser, existingTx = null) {
    return runWithTx(existingTx, async (tx) => {
      // 1. Lock parent shift header
      const [sRows] = await tx.execute(
        `SELECT id FROM workforce_shift WHERE id = ? AND tenant_id = ? FOR UPDATE`,
        [shiftId, tenantId]
      );
      if (sRows.length === 0) throw new AppError("Shift not found.", 404);

      // 2. Lock version row
      const [vRows] = await tx.execute(
        `SELECT * FROM workforce_shift_version 
         WHERE id = ? AND shift_id = ? AND tenant_id = ? 
         FOR UPDATE`,
        [versionId, shiftId, tenantId]
      );
      const version = vRows[0];
      if (!version) throw new AppError("Shift version not found.", 404);
      if (version.status !== "published") throw new AppError("Only published shift versions can be archived.", 400);

      const now = new Date().toISOString().slice(0, 10);
      if (!version.effective_to || version.effective_to > now) {
        throw new AppError("Cannot archive a shift version until its effective_to date has passed.", 400);
      }

      await tx.execute(
        `UPDATE workforce_shift_version
         SET status = 'archived',
             archived_at = NOW(),
             archived_by = ?
         WHERE id = ? AND tenant_id = ?`,
        [actorUser?.id || null, versionId, tenantId]
      );

      if (actorUser) {
        await auditService.log(
          actorUser,
          "WORKFORCE_SHIFT_VERSION_ARCHIVED",
          versionId,
          { shiftId },
          null,
          "INFO",
          tx
        );
      }

      return { success: true, message: "Shift version archived." };
    });
  }
};
