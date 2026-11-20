// ============================================================================
// Service: node_backend/src/services/shift.service.js
// Description: Core shift template management, search, filtering, and tenant scoping.
// ============================================================================

import { db } from "../db/index.js";
import { AppError } from "../middleware/errorHandler.js";
import { calculateShiftDuration } from "./shift-validation.service.js";
import { shiftVersionService } from "./shift-version.service.js";
import { auditService } from "./audit.service.js";

async function runWithTx(existingTx, fn) {
  if (existingTx) {
    return fn(existingTx);
  }
  return db.transaction(fn);
}

export const shiftService = {
  /**
   * List shifts for a tenant with filtering, search, and pagination.
   */
  async listShifts(tenantId, query = {}) {
    const page = Math.max(1, parseInt(query.page || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || "20", 10)));
    const offset = (page - 1) * limit;

    const whereConditions = ["s.tenant_id = ?"];
    const params = [tenantId];

    if (query.is_active !== undefined) {
      whereConditions.push("s.is_active = ?");
      params.push(query.is_active === "true" || query.is_active === "1" || query.is_active === 1 ? 1 : 0);
    }

    if (query.search) {
      whereConditions.push("(s.name LIKE ? OR s.code LIKE ?)");
      const term = `%${query.search}%`;
      params.push(term, term);
    }

    // BUG-SH04: Support type filtering (overnight vs daytime) before pagination
    if (query.type === "overnight" || query.is_overnight === "true" || query.is_overnight === "1" || query.is_overnight === 1) {
      whereConditions.push("pv.is_overnight = 1");
    } else if (query.type === "daytime" || query.is_overnight === "false" || query.is_overnight === "0" || query.is_overnight === 0) {
      whereConditions.push("(pv.is_overnight = 0 OR pv.is_overnight IS NULL)");
    }

    const whereClause = whereConditions.join(" AND ");

    const countSql = `SELECT COUNT(*) as total FROM workforce_shift s
       LEFT JOIN workforce_shift_version pv 
         ON pv.shift_id = s.id AND pv.tenant_id = s.tenant_id AND pv.status = 'published'
            AND pv.effective_from <= CURRENT_DATE() 
            AND (pv.effective_to IS NULL OR pv.effective_to >= CURRENT_DATE())
       WHERE ${whereClause}`;

    const [countRows] = await db.all(countSql, params);
    const total = countRows ? countRows.total : 0;

    const listParams = [...params, limit, offset];
    const rows = await db.all(
      `SELECT s.id, s.tenant_id, s.code, s.name, s.description, s.timezone, s.is_active,
              s.created_at, s.updated_at,
              pv.id as current_version_id, pv.version_number as current_version_number,
              pv.start_time, pv.end_time, pv.is_overnight, pv.duration_minutes,
              pv.late_grace_minutes, pv.early_departure_grace_minutes,
              pv.effective_from, pv.effective_to,
              dv.id as active_draft_version_id, dv.version_number as active_draft_version_number
       FROM workforce_shift s
       LEFT JOIN workforce_shift_version pv 
         ON pv.shift_id = s.id AND pv.tenant_id = s.tenant_id AND pv.status = 'published'
            AND pv.effective_from <= CURRENT_DATE() 
            AND (pv.effective_to IS NULL OR pv.effective_to >= CURRENT_DATE())
       LEFT JOIN workforce_shift_version dv
         ON dv.shift_id = s.id AND dv.tenant_id = s.tenant_id AND dv.status = 'draft'
       WHERE ${whereClause}
       ORDER BY s.id DESC
       LIMIT ? OFFSET ?`,
      listParams
    );

    return {
      shifts: rows,
      items: rows,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  },

  /**
   * Get single shift by ID with current published and draft versions.
   */
  async getShiftById(tenantId, shiftId) {
    const shift = await db.get(
      `SELECT s.*,
              u1.email as created_by_email,
              u2.email as updated_by_email
       FROM workforce_shift s
       LEFT JOIN accounts_user u1 ON u1.id = s.created_by
       LEFT JOIN accounts_user u2 ON u2.id = s.updated_by
       WHERE s.id = ? AND s.tenant_id = ?`,
      [shiftId, tenantId]
    );

    if (!shift) {
      throw new AppError("Shift not found.", 404);
    }

    const versions = await shiftVersionService.listVersions(tenantId, shiftId);
    const activeVersion = versions.find(v => v.status === "published" && (!v.effective_to || v.effective_to >= new Date().toISOString().slice(0, 10))) || versions[0];

    return {
      ...shift,
      start_time: activeVersion?.start_time,
      end_time: activeVersion?.end_time,
      is_overnight: activeVersion?.is_overnight,
      duration_minutes: activeVersion?.duration_minutes,
      version_number: activeVersion?.version_number,
      effective_from: activeVersion?.effective_from,
      effective_to: activeVersion?.effective_to,
      versions
    };
  },

  /**
   * Create a new shift and its initial version.
   */
  async createShift(tenantId, data, actorUser, existingTx = null) {
    return runWithTx(existingTx, async (tx) => {
      const code = (data.code || "").trim().toUpperCase();
      const name = (data.name || "").trim();
      const description = data.description || null;
      const timezone = data.timezone || "UTC";
      const isActive = data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1;

      if (!code || !name) {
        throw new AppError("Shift code and name are required.", 400);
      }

      if (Number(data.late_grace_minutes) > 240 || Number(data.early_departure_grace_minutes) > 240) {
        throw new AppError("Grace period cannot exceed 240 minutes.", 400);
      }

      // Check unique code in tenant
      const [existingCode] = await tx.execute(
        `SELECT id FROM workforce_shift WHERE tenant_id = ? AND code = ?`,
        [tenantId, code]
      );
      if (existingCode.length > 0) {
        throw new AppError(`A shift with code '${code}' already exists in this tenant.`, 409);
      }

      const startTime = data.start_time || "09:00:00";
      const endTime = data.end_time || "17:00:00";
      const { durationMinutes, isOvernight } = calculateShiftDuration(startTime, endTime, data.is_overnight);

      if (data.duration_minutes !== undefined && Number(data.duration_minutes) !== durationMinutes) {
        throw new AppError(`Supplied duration_minutes (${data.duration_minutes}) does not match calculated duration (${durationMinutes}).`, 400);
      }

      // Insert shift header
      const [shiftResult] = await tx.execute(
        `INSERT INTO workforce_shift (
           tenant_id, code, name, description, timezone, is_active, created_by, updated_by, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          tenantId,
          code,
          name,
          description,
          timezone,
          isActive,
          actorUser?.id || null,
          actorUser?.id || null
        ]
      );

      const shiftId = shiftResult.insertId;

      // Automatically create initial version 1 passing existing transaction tx
      const effectiveFrom = data.effective_from || new Date().toISOString().slice(0, 10);
      const versionResult = await shiftVersionService.createDraftVersion(
        tenantId,
        shiftId,
        {
          start_time: startTime,
          end_time: endTime,
          is_overnight: isOvernight,
          late_grace_minutes: data.late_grace_minutes ?? 15,
          early_departure_grace_minutes: data.early_departure_grace_minutes ?? 15,
          effective_from: effectiveFrom,
          policy_id: data.policy_id,
          weekly_off_policy_id: data.weekly_off_policy_id,
          breaks: data.breaks || []
        },
        actorUser,
        tx
      );

      // Publish initial version 1
      await shiftVersionService.publishVersion(
        tenantId,
        shiftId,
        versionResult.id,
        actorUser,
        tx
      );

      if (actorUser) {
        await auditService.log(
          actorUser,
          "WORKFORCE_SHIFT_CREATED",
          shiftId,
          { code, name, initialVersionId: versionResult.id },
          null,
          "INFO",
          tx
        );
      }

      return {
        id: shiftId,
        tenant_id: tenantId,
        code,
        name,
        description,
        timezone,
        is_active: isActive,
        version_number: 1,
        duration_minutes: durationMinutes,
        is_overnight: isOvernight,
        effective_from: effectiveFrom,
        effective_to: null,
        initial_version: versionResult
      };
    });
  },

  /**
   * Update shift. If timings change, publishes next immutable version and closes prior.
   */
  async updateShift(tenantId, shiftId, data, actorUser, existingTx = null) {
    return runWithTx(existingTx, async (tx) => {
      const [shiftRows] = await tx.execute(
        `SELECT * FROM workforce_shift WHERE id = ? AND tenant_id = ? FOR UPDATE`,
        [shiftId, tenantId]
      );
      const shift = shiftRows[0];
      if (!shift) {
        throw new AppError("Shift not found.", 404);
      }

      // BUG-SH03: Shift code is immutable after creation
      if (data.code && data.code.trim().toUpperCase() !== shift.code.toUpperCase()) {
        throw new AppError("Shift code is immutable and cannot be changed after creation.", 400);
      }

      // BUG-SH02: Retrieve latest version to compare actual values before spawning immutable versions
      const [latestRows] = await tx.execute(
        `SELECT * FROM workforce_shift_version WHERE shift_id = ? AND tenant_id = ? ORDER BY version_number DESC LIMIT 1`,
        [shiftId, tenantId]
      );
      const latest = latestRows[0] || null;

      const normTime = (t) => {
        if (!t) return "";
        const parts = String(t).trim().split(":");
        return parts.length >= 2 ? `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}` : String(t).trim();
      };

      let timingChanged = false;

      if (latest) {
        const incomingStart = data.start_time ? normTime(data.start_time) : normTime(latest.start_time);
        const latestStart = normTime(latest.start_time);
        const startTimeChanged = Boolean(data.start_time) && incomingStart !== latestStart;

        const incomingEnd = data.end_time ? normTime(data.end_time) : normTime(latest.end_time);
        const latestEnd = normTime(latest.end_time);
        const endTimeChanged = Boolean(data.end_time) && incomingEnd !== latestEnd;

        const lateGraceChanged = data.late_grace_minutes !== undefined && data.late_grace_minutes !== null &&
          Number(data.late_grace_minutes) !== Number(latest.late_grace_minutes);

        const earlyGraceChanged = data.early_departure_grace_minutes !== undefined && data.early_departure_grace_minutes !== null &&
          Number(data.early_departure_grace_minutes) !== Number(latest.early_departure_grace_minutes);

        const isOvernightChanged = data.is_overnight !== undefined &&
          Boolean(data.is_overnight) !== Boolean(latest.is_overnight);

        let breaksChanged = false;
        if (Array.isArray(data.breaks)) {
          const [existingBreaks] = await tx.execute(
            `SELECT break_name, break_type, start_offset_minutes, end_offset_minutes, duration_minutes, is_mandatory
             FROM workforce_shift_break WHERE shift_version_id = ? AND tenant_id = ? ORDER BY start_offset_minutes ASC`,
            [latest.id, tenantId]
          );
          if (data.breaks.length !== existingBreaks.length) {
            breaksChanged = true;
          } else {
            const sortedInput = [...data.breaks].sort((a, b) => Number(a.start_offset_minutes) - Number(b.start_offset_minutes));
            for (let i = 0; i < sortedInput.length; i++) {
              const inB = sortedInput[i];
              const exB = existingBreaks[i];
              if (
                inB.break_name !== exB.break_name ||
                Number(inB.start_offset_minutes) !== Number(exB.start_offset_minutes) ||
                Number(inB.end_offset_minutes) !== Number(exB.end_offset_minutes) ||
                (inB.break_type || "unpaid") !== (exB.break_type || "unpaid")
              ) {
                breaksChanged = true;
                break;
              }
            }
          }
        }

        timingChanged = startTimeChanged || endTimeChanged || lateGraceChanged || earlyGraceChanged || isOvernightChanged || breaksChanged;
      } else {
        timingChanged = Boolean(data.start_time || data.end_time);
      }

      const name = data.name !== undefined ? data.name.trim() : shift.name;
      const description = data.description !== undefined ? data.description : shift.description;
      const timezone = data.timezone !== undefined ? data.timezone : shift.timezone;
      const isActive = data.is_active !== undefined ? (data.is_active ? 1 : 0) : shift.is_active;

      await tx.execute(
        `UPDATE workforce_shift
         SET name = ?, description = ?, timezone = ?, is_active = ?, updated_by = ?, updated_at = NOW()
         WHERE id = ? AND tenant_id = ?`,
        [name, description, timezone, isActive, actorUser?.id || null, shiftId, tenantId]
      );

      let newVersionInfo = null;

      if (timingChanged && latest) {
        const startTime = data.start_time || latest.start_time;
        const endTime = data.end_time || latest.end_time;
        const effectiveFrom = data.effective_from || new Date().toISOString().slice(0, 10);

        const { durationMinutes, isOvernight } = calculateShiftDuration(startTime, endTime, data.is_overnight);

        if (data.duration_minutes !== undefined && Number(data.duration_minutes) !== durationMinutes) {
          throw new AppError(`Supplied duration_minutes does not match calculated duration.`, 400);
        }

        // Create draft version under tx
        const draftVer = await shiftVersionService.createDraftVersion(
          tenantId,
          shiftId,
          {
            clone_from_version_id: latest.id,
            start_time: startTime,
            end_time: endTime,
            is_overnight: isOvernight,
            late_grace_minutes: data.late_grace_minutes !== undefined ? data.late_grace_minutes : latest.late_grace_minutes,
            early_departure_grace_minutes: data.early_departure_grace_minutes !== undefined ? data.early_departure_grace_minutes : latest.early_departure_grace_minutes,
            effective_from: effectiveFrom,
            policy_id: data.policy_id || latest.policy_id,
            weekly_off_policy_id: data.weekly_off_policy_id || latest.weekly_off_policy_id,
            breaks: data.breaks
          },
          actorUser,
          tx
        );

        // Publish version immediately under tx
        const publishedVer = await shiftVersionService.publishVersion(
          tenantId,
          shiftId,
          draftVer.id,
          actorUser,
          tx
        );

        newVersionInfo = {
          version_generated: true,
          version_number: draftVer.version_number,
          duration_minutes: durationMinutes,
          is_overnight: isOvernight,
          effective_from: effectiveFrom,
          effective_to: null,
          snapshot_hash: publishedVer.snapshot_hash
        };
      } else {
        const [currVer] = await tx.execute(
          `SELECT version_number, duration_minutes, is_overnight, effective_from, effective_to
           FROM workforce_shift_version WHERE shift_id = ? AND tenant_id = ? ORDER BY version_number DESC LIMIT 1`,
          [shiftId, tenantId]
        );
        newVersionInfo = {
          version_generated: false,
          version_number: currVer[0]?.version_number || latest?.version_number || 1,
          duration_minutes: currVer[0]?.duration_minutes || latest?.duration_minutes,
          is_overnight: currVer[0]?.is_overnight ?? latest?.is_overnight,
          effective_from: currVer[0]?.effective_from || latest?.effective_from,
          effective_to: currVer[0]?.effective_to ?? latest?.effective_to
        };
      }

      if (actorUser) {
        await auditService.log(
          actorUser,
          "WORKFORCE_SHIFT_UPDATED",
          shiftId,
          { name, isActive, versionGenerated: timingChanged },
          null,
          "INFO",
          tx
        );
      }

      return {
        id: shiftId,
        tenant_id: tenantId,
        code: shift.code,
        name,
        description,
        timezone,
        is_active: isActive,
        ...newVersionInfo
      };
    });
  },

  /**
   * Toggle shift active status.
   */
  async toggleShiftStatus(tenantId, shiftId, isActive, actorUser) {
    return this.updateShift(tenantId, shiftId, { is_active: isActive }, actorUser);
  },

  /**
   * Delete a shift if unreferenced in rosters or employee assignments.
   */
  async deleteShift(tenantId, shiftId, actorUser, existingTx = null) {
    return runWithTx(existingTx, async (tx) => {
      const [rosterRows] = await tx.execute(
        `SELECT COUNT(*) as cnt FROM workforce_roster_entry WHERE shift_id = ? AND tenant_id = ?`,
        [shiftId, tenantId]
      );
      if (rosterRows[0].cnt > 0) {
        throw new AppError("Cannot delete shift: It is referenced by active or historical roster entries.", 409);
      }

      const [assignRows] = await tx.execute(
        `SELECT COUNT(*) as cnt FROM workforce_employee_fixed_assignment WHERE shift_id = ? AND tenant_id = ?`,
        [shiftId, tenantId]
      );
      if (assignRows[0].cnt > 0) {
        throw new AppError("Cannot delete shift: It is referenced by employee shift assignments.", 409);
      }

      await tx.execute(
        `DELETE FROM workforce_shift_break WHERE shift_id = ? AND tenant_id = ?`,
        [shiftId, tenantId]
      );

      await tx.execute(
        `DELETE FROM workforce_shift_version WHERE shift_id = ? AND tenant_id = ?`,
        [shiftId, tenantId]
      );

      await tx.execute(
        `DELETE FROM workforce_shift WHERE id = ? AND tenant_id = ?`,
        [shiftId, tenantId]
      );

      if (actorUser) {
        await auditService.log(
          actorUser,
          "WORKFORCE_SHIFT_DELETED",
          shiftId,
          {},
          null,
          "INFO",
          tx
        );
      }

      return { success: true, message: "Shift deleted successfully." };
    });
  }
};
