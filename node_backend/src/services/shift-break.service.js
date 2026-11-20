// ============================================================================
// Service: node_backend/src/services/shift-break.service.js
// Description: Break management service serialized by parent shift version row lock
//              (Finding C5).
// ============================================================================

import { db } from "../db/index.js";
import { AppError } from "../middleware/errorHandler.js";
import { validateBreaks } from "./shift-validation.service.js";
import { auditService } from "./audit.service.js";

export const shiftBreakService = {
  /**
   * List all breaks for a shift version.
   */
  async getBreaksByVersionId(tenantId, shiftId, versionId) {
    const rows = await db.all(
      `SELECT id, tenant_id, shift_id, shift_version_id, break_name, break_type,
              start_offset_minutes, end_offset_minutes, duration_minutes,
              is_mandatory, display_order, created_at, updated_at
       FROM workforce_shift_break
       WHERE tenant_id = ? AND shift_id = ? AND shift_version_id = ?
       ORDER BY display_order ASC, start_offset_minutes ASC`,
      [tenantId, shiftId, versionId]
    );
    return rows;
  },

  /**
   * Add a break to a draft shift version.
   * Serialized via parent shift version row lock.
   */
  async addBreak(tenantId, shiftId, versionId, breakData, actorUser) {
    return db.transaction(async (tx) => {
      // 1. Serialization Anchor: Lock parent version row
      const [versionRows] = await tx.execute(
        `SELECT id, tenant_id, shift_id, status, duration_minutes 
         FROM workforce_shift_version 
         WHERE id = ? AND shift_id = ? AND tenant_id = ?
         FOR UPDATE`,
        [versionId, shiftId, tenantId]
      );
      const parentVersion = versionRows[0];

      if (!parentVersion) {
        throw new AppError("Shift version not found.", 404);
      }
      if (parentVersion.status !== "draft") {
        throw new AppError("Cannot add breaks to a published or archived shift version.", 400);
      }

      // 2. Fetch sibling breaks under lock
      const [siblingRows] = await tx.execute(
        `SELECT id, break_name, break_type, start_offset_minutes, end_offset_minutes, duration_minutes, is_mandatory, display_order
         FROM workforce_shift_break
         WHERE shift_version_id = ? AND tenant_id = ?
         ORDER BY start_offset_minutes ASC`,
        [versionId, tenantId]
      );

      const start = Number(breakData.start_offset_minutes);
      const end = Number(breakData.end_offset_minutes);
      const duration = Number(breakData.duration_minutes ?? (end - start));
      const breakName = (breakData.break_name || "Break").trim();
      const breakType = breakData.break_type === "paid" ? "paid" : "unpaid";
      const isMandatory = breakData.is_mandatory !== undefined ? (breakData.is_mandatory ? 1 : 0) : 1;
      const displayOrder = Number(breakData.display_order ?? (siblingRows.length + 1));

      const candidateBreak = {
        break_name: breakName,
        break_type: breakType,
        start_offset_minutes: start,
        end_offset_minutes: end,
        duration_minutes: duration,
        is_mandatory: isMandatory,
        display_order: displayOrder
      };

      // 3. Mathematical validation against siblings
      validateBreaks([...siblingRows, candidateBreak], parentVersion.duration_minutes);

      // 4. Insert new break
      const [insertResult] = await tx.execute(
        `INSERT INTO workforce_shift_break (
           tenant_id, shift_id, shift_version_id, break_name, break_type,
           start_offset_minutes, end_offset_minutes, duration_minutes,
           is_mandatory, display_order, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          tenantId,
          shiftId,
          versionId,
          breakName,
          breakType,
          start,
          end,
          duration,
          isMandatory,
          displayOrder
        ]
      );

      const newBreakId = insertResult.insertId;

      // 5. Audit log
      if (actorUser) {
        await auditService.log(
          actorUser,
          "WORKFORCE_SHIFT_BREAK_CREATED",
          newBreakId,
          { shiftId, versionId, breakName, duration, start, end },
          null,
          "INFO",
          tx
        );
      }

      return {
        id: newBreakId,
        tenant_id: tenantId,
        shift_id: shiftId,
        shift_version_id: versionId,
        ...candidateBreak
      };
    });
  },

  /**
   * Update an existing break on a draft shift version.
   * Serialized via parent shift version row lock.
   */
  async updateBreak(tenantId, shiftId, versionId, breakId, updateData, actorUser) {
    return db.transaction(async (tx) => {
      // 1. Serialization Anchor: Lock parent version row
      const [versionRows] = await tx.execute(
        `SELECT id, tenant_id, shift_id, status, duration_minutes 
         FROM workforce_shift_version 
         WHERE id = ? AND shift_id = ? AND tenant_id = ?
         FOR UPDATE`,
        [versionId, shiftId, tenantId]
      );
      const parentVersion = versionRows[0];

      if (!parentVersion) {
        throw new AppError("Shift version not found.", 404);
      }
      if (parentVersion.status !== "draft") {
        throw new AppError("Cannot modify breaks on a published or archived shift version.", 400);
      }

      // 2. Fetch existing break under lock
      const [existingBreakRows] = await tx.execute(
        `SELECT * FROM workforce_shift_break 
         WHERE id = ? AND shift_version_id = ? AND tenant_id = ?`,
        [breakId, versionId, tenantId]
      );
      const existingBreak = existingBreakRows[0];
      if (!existingBreak) {
        throw new AppError("Shift break not found.", 404);
      }

      // 3. Fetch sibling breaks (excluding this break)
      const [siblingRows] = await tx.execute(
        `SELECT id, break_name, break_type, start_offset_minutes, end_offset_minutes, duration_minutes, is_mandatory, display_order
         FROM workforce_shift_break
         WHERE shift_version_id = ? AND tenant_id = ? AND id <> ?
         ORDER BY start_offset_minutes ASC`,
        [versionId, tenantId, breakId]
      );

      const start = updateData.start_offset_minutes !== undefined
        ? Number(updateData.start_offset_minutes)
        : existingBreak.start_offset_minutes;
      const end = updateData.end_offset_minutes !== undefined
        ? Number(updateData.end_offset_minutes)
        : existingBreak.end_offset_minutes;
      const duration = Number(updateData.duration_minutes ?? (end - start));
      const breakName = (updateData.break_name || existingBreak.break_name).trim();
      const breakType = updateData.break_type || existingBreak.break_type;
      const isMandatory = updateData.is_mandatory !== undefined ? (updateData.is_mandatory ? 1 : 0) : existingBreak.is_mandatory;
      const displayOrder = updateData.display_order !== undefined ? Number(updateData.display_order) : existingBreak.display_order;

      const candidateBreak = {
        id: breakId,
        break_name: breakName,
        break_type: breakType,
        start_offset_minutes: start,
        end_offset_minutes: end,
        duration_minutes: duration,
        is_mandatory: isMandatory,
        display_order: displayOrder
      };

      // 4. Mathematical validation against siblings
      validateBreaks([...siblingRows, candidateBreak], parentVersion.duration_minutes);

      // 5. Update break
      await tx.execute(
        `UPDATE workforce_shift_break
         SET break_name = ?, break_type = ?, start_offset_minutes = ?, end_offset_minutes = ?,
             duration_minutes = ?, is_mandatory = ?, display_order = ?, updated_at = NOW()
         WHERE id = ? AND tenant_id = ?`,
        [breakName, breakType, start, end, duration, isMandatory, displayOrder, breakId, tenantId]
      );

      // 6. Audit log
      if (actorUser) {
        await auditService.log(
          actorUser,
          "WORKFORCE_SHIFT_BREAK_UPDATED",
          breakId,
          { shiftId, versionId, candidateBreak },
          null,
          "INFO",
          tx
        );
      }

      return candidateBreak;
    });
  },

  /**
   * Delete a break from a draft shift version.
   * Serialized via parent shift version row lock.
   */
  async deleteBreak(tenantId, shiftId, versionId, breakId, actorUser) {
    return db.transaction(async (tx) => {
      // 1. Serialization Anchor: Lock parent version row
      const [versionRows] = await tx.execute(
        `SELECT id, tenant_id, shift_id, status 
         FROM workforce_shift_version 
         WHERE id = ? AND shift_id = ? AND tenant_id = ?
         FOR UPDATE`,
        [versionId, shiftId, tenantId]
      );
      const parentVersion = versionRows[0];

      if (!parentVersion) {
        throw new AppError("Shift version not found.", 404);
      }
      if (parentVersion.status !== "draft") {
        throw new AppError("Cannot delete breaks from a published or archived shift version.", 400);
      }

      const [existingBreakRows] = await tx.execute(
        `SELECT * FROM workforce_shift_break 
         WHERE id = ? AND shift_version_id = ? AND tenant_id = ?`,
        [breakId, versionId, tenantId]
      );
      if (existingBreakRows.length === 0) {
        throw new AppError("Shift break not found.", 404);
      }

      await tx.execute(
        `DELETE FROM workforce_shift_break WHERE id = ? AND tenant_id = ?`,
        [breakId, tenantId]
      );

      if (actorUser) {
        await auditService.log(
          actorUser,
          "WORKFORCE_SHIFT_BREAK_DELETED",
          breakId,
          { shiftId, versionId },
          null,
          "INFO",
          tx
        );
      }

      return { success: true, message: "Shift break deleted." };
    });
  }
};
