// ============================================================================
// Service: node_backend/src/services/shift-assignment.service.js
// Description: Production-grade employee shift assignment engine.
//              Handles fixed shift assignments, lifecycle states, exact shift
//              version pinning, canonical snapshot freezing, and bulk assignment.
// ============================================================================

import { db } from "../db/index.js";
import { config } from "../config/env.js";
import { AppError } from "../middleware/errorHandler.js";
import { formatDateToYMD } from "./shift-validation.service.js";
import { canonicalizeJson, generateSnapshotPayloadHash } from "./shift-snapshot.service.js";
import { auditService } from "./audit.service.js";
import realtimeService from "./realtime.service.js";

function wrapTx(conn) {
  if (!conn) return conn;
  if (!conn.get) conn.get = (sql, params = []) => db.get(sql, params, conn);
  if (!conn.all) conn.all = (sql, params = []) => db.all(sql, params, conn);
  if (!conn.run) conn.run = (sql, params = []) => db.run(sql, params, conn);
  return conn;
}

async function runWithTx(existingTx, fn) {
  if (existingTx) {
    return fn(wrapTx(existingTx));
  }
  return db.transaction(fn);
}

const schemaColumnChecks = new Map();
function hasColumn(tableName, columnName) {
  const key = `${tableName}.${columnName}`;
  if (!schemaColumnChecks.has(key)) {
    const check = config.dbClient === "mysql"
      ? db.get(
        `SELECT 1 AS present FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`,
        [tableName, columnName]
      ).then(Boolean)
      : db.all(`PRAGMA table_info(${tableName})`).then((columns) =>
        columns.some((column) => column.name === columnName)
      );
    schemaColumnChecks.set(key, check.catch((error) => {
      schemaColumnChecks.delete(key);
      throw error;
    }));
  }
  return schemaColumnChecks.get(key);
}

async function hasAssignmentLifecycleSchema() {
  return (await hasColumn("workforce_employee_fixed_assignment", "shift_version_id"))
    && (await hasColumn("workforce_employee_fixed_assignment", "status"));
}

async function listLegacyAssignments(tenantId, { userId = null, team = null, status = null, page = 1, limit = 50, siteScope = null, actor = null } = {}) {
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const offset = (pageNum - 1) * limitNum;
  const conditions = ["wefa.tenant_id = ?"];
  const params = [tenantId];
  if (userId) { conditions.push("wefa.user_id = ?"); params.push(userId); }
  if (team) { conditions.push("ep.team_name = ?"); params.push(team); }
  if (actor?.role === "manager") { conditions.push("ep.manager_id = ?"); params.push(actor.id); }
  if (siteScope?.unassigned) conditions.push(`NOT EXISTS (SELECT 1 FROM workforce_employee_site_assignment esa WHERE esa.tenant_id=wefa.tenant_id AND esa.user_id=wefa.user_id AND esa.effective_from<=wefa.effective_from AND (esa.effective_to IS NULL OR esa.effective_to>=wefa.effective_from))`);
  else if (siteScope?.siteIds) {
    if (!siteScope.siteIds.length) conditions.push("1 = 0");
    else { conditions.push(`EXISTS (SELECT 1 FROM workforce_employee_site_assignment esa WHERE esa.tenant_id=wefa.tenant_id AND esa.user_id=wefa.user_id AND esa.site_id IN (${siteScope.siteIds.map(() => "?").join(",")}) AND esa.effective_from<=wefa.effective_from AND (esa.effective_to IS NULL OR esa.effective_to>=wefa.effective_from))`); params.push(...siteScope.siteIds); }
  }
  if (status === "published") conditions.push("wefa.is_active = 1");
  else if (status && status !== "all") conditions.push("1 = 0");
  const whereSql = conditions.join(" AND ");
  const hasVersionStatus = await hasColumn("workforce_shift_version", "status");
  const versionStatusFilter = hasVersionStatus ? "AND sv2.status = 'published'" : "";
  const count = await db.get(
    `SELECT COUNT(*) AS total FROM workforce_employee_fixed_assignment wefa
     LEFT JOIN accounts_employeeprofile ep ON ep.user_id = wefa.user_id
     WHERE ${whereSql}`,
    params
  );
  const rows = await db.all(
    `SELECT wefa.id, wefa.tenant_id, wefa.user_id,
        u.first_name, u.last_name, u.email, ep.team_name,
        wefa.shift_id, s.name AS shift_name, s.code AS shift_code,
        sv.id AS shift_version_id, sv.version_number AS shift_version_number,
        sv.start_time, sv.end_time,
        ROUND(sv.duration_minutes / 60.0, 2) AS total_work_hours,
        sv.duration_minutes, wefa.effective_from, wefa.effective_to,
        CASE WHEN wefa.is_active = 1 THEN 'legacy' ELSE 'inactive' END AS status,
        NULL AS snapshot_hash, NULL AS created_by, NULL AS published_by,
        NULL AS published_at, NULL AS cancelled_by, NULL AS cancelled_at,
        NULL AS cancellation_reason, wefa.created_at, wefa.updated_at
     FROM workforce_employee_fixed_assignment wefa
     JOIN accounts_user u ON u.id = wefa.user_id
     LEFT JOIN accounts_employeeprofile ep ON ep.user_id = wefa.user_id
     JOIN workforce_shift s ON s.id = wefa.shift_id AND s.tenant_id = wefa.tenant_id
     LEFT JOIN workforce_shift_version sv ON sv.id = (
       SELECT sv2.id FROM workforce_shift_version sv2
       WHERE sv2.tenant_id = wefa.tenant_id AND sv2.shift_id = wefa.shift_id
         AND sv2.effective_from <= wefa.effective_from
         AND (sv2.effective_to IS NULL OR sv2.effective_to >= wefa.effective_from)
         ${versionStatusFilter}
       ORDER BY sv2.effective_from DESC, sv2.version_number DESC LIMIT 1
     )
     WHERE ${whereSql}
     ORDER BY wefa.effective_from DESC, wefa.id DESC
     LIMIT ? OFFSET ?`,
    [...params, limitNum, offset]
  );
  return {
    assignments: rows.map((row) => ({
      ...row,
      effective_from: formatDateToYMD(row.effective_from),
      effective_to: row.effective_to ? formatDateToYMD(row.effective_to) : null,
    })),
    pagination: { page: pageNum, limit: limitNum, total: Number(count?.total || 0), totalPages: Math.ceil(Number(count?.total || 0) / limitNum) || 1 },
  };
}

export const shiftAssignmentService = {
  /**
   * List fixed assignments with filtering and pagination.
   */
  async listAssignments(tenantId, { userId = null, team = null, status = null, page = 1, limit = 50, siteScope = null, actor = null } = {}) {
    if (!(await hasAssignmentLifecycleSchema())) {
      return listLegacyAssignments(tenantId, { userId, team, status, page, limit, siteScope, actor });
    }
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (pageNum - 1) * limitNum;

    const whereConditions = ["wefa.tenant_id = ?"];
    const params = [tenantId];

    if (userId) {
      whereConditions.push("wefa.user_id = ?");
      params.push(userId);
    }
    if (status) {
      whereConditions.push("wefa.status = ?");
      params.push(status);
    }
    if (team) {
      whereConditions.push("ep.team_name = ?");
      params.push(team);
    }
    if (actor?.role === "manager") { whereConditions.push("ep.manager_id = ?"); params.push(actor.id); }
    if (siteScope?.unassigned) whereConditions.push(`NOT EXISTS (SELECT 1 FROM workforce_employee_site_assignment esa WHERE esa.tenant_id=wefa.tenant_id AND esa.user_id=wefa.user_id AND esa.effective_from<=wefa.effective_from AND (esa.effective_to IS NULL OR esa.effective_to>=wefa.effective_from))`);
    else if (siteScope?.siteIds) {
      if (!siteScope.siteIds.length) whereConditions.push("1 = 0");
      else { whereConditions.push(`EXISTS (SELECT 1 FROM workforce_employee_site_assignment esa WHERE esa.tenant_id=wefa.tenant_id AND esa.user_id=wefa.user_id AND esa.site_id IN (${siteScope.siteIds.map(() => "?").join(",")}) AND esa.effective_from<=wefa.effective_from AND (esa.effective_to IS NULL OR esa.effective_to>=wefa.effective_from))`); params.push(...siteScope.siteIds); }
    }

    const whereSql = whereConditions.join(" AND ");

    const countSql = `
      SELECT COUNT(*) as total
      FROM workforce_employee_fixed_assignment wefa
      LEFT JOIN accounts_employeeprofile ep ON ep.user_id = wefa.user_id
      WHERE ${whereSql}
    `;
    const countRows = await db.all(countSql, params);
    const total = countRows[0]?.total || 0;

    const selectSql = `
      SELECT 
        wefa.id,
        wefa.tenant_id,
        wefa.user_id,
        u.first_name,
        u.last_name,
        u.email,
        ep.team_name,
        wefa.shift_id,
        s.name as shift_name,
        s.code as shift_code,
        wefa.shift_version_id,
        sv.version_number as shift_version_number,
        sv.start_time,
        sv.end_time,
        ROUND(sv.duration_minutes / 60.0, 2) as total_work_hours,
        sv.duration_minutes,
        wefa.effective_from,
        wefa.effective_to,
        wefa.status,
        wefa.snapshot_hash,
        wefa.created_by,
        wefa.published_by,
        wefa.published_at,
        wefa.cancelled_by,
        wefa.cancelled_at,
        wefa.cancellation_reason,
        wefa.created_at,
        wefa.updated_at
      FROM workforce_employee_fixed_assignment wefa
      JOIN accounts_user u ON u.id = wefa.user_id
      LEFT JOIN accounts_employeeprofile ep ON ep.user_id = wefa.user_id
      JOIN workforce_shift s ON s.id = wefa.shift_id AND s.tenant_id = wefa.tenant_id
      JOIN workforce_shift_version sv ON sv.id = wefa.shift_version_id AND sv.tenant_id = wefa.tenant_id
      WHERE ${whereSql}
      ORDER BY wefa.effective_from DESC, wefa.id DESC
      LIMIT ? OFFSET ?
    `;

    const rows = await db.all(selectSql, [...params, limitNum, offset]);

    return {
      assignments: rows.map(r => ({
        ...r,
        effective_from: formatDateToYMD(r.effective_from),
        effective_to: r.effective_to ? formatDateToYMD(r.effective_to) : null,
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1,
      }
    };
  },

  /**
   * Get single assignment by ID with full details.
   */
  async getAssignmentById(tenantId, assignmentId) {
    const sql = `
      SELECT 
        wefa.*,
        u.first_name,
        u.last_name,
        u.email,
        ep.team_name,
        s.name as shift_name,
        s.code as shift_code,
        sv.version_number as shift_version_number,
        sv.start_time,
        sv.end_time,
        ROUND(sv.duration_minutes / 60.0, 2) as total_work_hours,
        sv.duration_minutes
      FROM workforce_employee_fixed_assignment wefa
      JOIN accounts_user u ON u.id = wefa.user_id
      LEFT JOIN accounts_employeeprofile ep ON ep.user_id = wefa.user_id
      JOIN workforce_shift s ON s.id = wefa.shift_id AND s.tenant_id = wefa.tenant_id
      JOIN workforce_shift_version sv ON sv.id = wefa.shift_version_id AND sv.tenant_id = wefa.tenant_id
      WHERE wefa.id = ? AND wefa.tenant_id = ?
    `;
    const rows = await db.all(sql, [assignmentId, tenantId]);
    if (!rows || rows.length === 0) {
      throw new AppError("Shift assignment not found", 404);
    }
    const a = rows[0];
    return {
      ...a,
      effective_from: formatDateToYMD(a.effective_from),
      effective_to: a.effective_to ? formatDateToYMD(a.effective_to) : null,
      assignment_snapshot: a.assignment_snapshot ? JSON.parse(a.assignment_snapshot) : null,
    };
  },

  /**
   * Create a draft fixed assignment for an employee.
   * Enforces exact published shift version pinning.
   */
  async createDraftAssignment(tenantId, data, actorUserId, existingTx = null) {
    return runWithTx(existingTx, async (tx) => {
      const { user_id, shift_id, shift_version_id, effective_from, effective_to = null } = data;

      if (!user_id || !shift_id || !shift_version_id || !effective_from) {
        throw new AppError("user_id, shift_id, shift_version_id, and effective_from are required", 400);
      }

      const formattedFrom = formatDateToYMD(effective_from);
      const formattedTo = effective_to ? formatDateToYMD(effective_to) : null;

      if (formattedTo && formattedFrom > formattedTo) {
        throw new AppError("effective_from cannot be later than effective_to", 400);
      }

      // 1. Verify user belongs to tenant
      const userTenant = await tx.get(
        "SELECT user_id, role, is_active FROM workforce_user_tenant WHERE tenant_id = ? AND user_id = ?",
        [tenantId, user_id]
      );
      if (!userTenant || !userTenant.is_active) {
        throw new AppError(`User ${user_id} not found in this tenant or is inactive`, 404);
      }

      // 2. Verify shift version is published and belongs to tenant & shift
      const shiftVersion = await tx.get(
        `SELECT sv.id, sv.shift_id, sv.tenant_id, sv.version_number, sv.status, sv.start_time, sv.end_time, sv.effective_from, sv.effective_to
         FROM workforce_shift_version sv
         JOIN workforce_shift s ON s.id = sv.shift_id AND s.tenant_id = sv.tenant_id
         WHERE sv.id = ? AND sv.shift_id = ? AND sv.tenant_id = ?`,
        [shift_version_id, shift_id, tenantId]
      );

      if (!shiftVersion) {
        throw new AppError(`Shift version ${shift_version_id} does not exist for shift ${shift_id}`, 404);
      }

      if (shiftVersion.status !== "published") {
        throw new AppError(`Cannot assign an unpublished shift version (current status: ${shiftVersion.status})`, 400);
      }

      // 3. Check for existing active draft for this employee
      const existingDraft = await tx.get(
        "SELECT id FROM workforce_employee_fixed_assignment WHERE tenant_id = ? AND user_id = ? AND status = 'draft'",
        [tenantId, user_id]
      );
      if (existingDraft) {
        throw new AppError(`Employee ${user_id} already has an active draft assignment (ID: ${existingDraft.id})`, 409);
      }

      // 4. Insert draft assignment
      const insertSql = `
        INSERT INTO workforce_employee_fixed_assignment
          (tenant_id, user_id, shift_id, shift_version_id, effective_from, effective_to, status, is_active, created_by)
        VALUES
          (?, ?, ?, ?, ?, ?, 'draft', 1, ?)
      `;
      const result = await tx.run(insertSql, [
        tenantId,
        user_id,
        shift_id,
        shift_version_id,
        formattedFrom,
        formattedTo,
        actorUserId || null,
      ]);

      const assignmentId = result.lastID || result.insertId;

      await auditService.log(
        { id: actorUserId, role: "admin" },
        "ASSIGNMENT_DRAFT_CREATED",
        assignmentId,
        `Created draft shift assignment for user ${user_id}, shift ${shift_id}, version ${shift_version_id}`,
        null,
        "INFO",
        tx
      );

      return {
        id: assignmentId,
        tenant_id: tenantId,
        user_id,
        shift_id,
        shift_version_id,
        effective_from: formattedFrom,
        effective_to: formattedTo,
        status: "draft",
      };
    });
  },

  /**
   * Atomically publish a draft assignment.
   * Freezes canonical RFC 8785 snapshot, checks for overlaps, supersedes active prior assignments.
   */
  async publishAssignment(tenantId, assignmentId, actorUserId, existingTx = null) {
    const result = await runWithTx(existingTx, async (tx) => {
      // 1. Lock user row as serialization anchor (Monotonic hierarchy: accounts_user -> assignment)
      const assignmentRow = await tx.get(
        "SELECT * FROM workforce_employee_fixed_assignment WHERE id = ? AND tenant_id = ?",
        [assignmentId, tenantId]
      );
      if (!assignmentRow) {
        throw new AppError("Shift assignment not found", 404);
      }

      // Serializing per user to avoid concurrent assignment races
      await tx.get("SELECT id FROM accounts_user WHERE id = ? FOR UPDATE", [assignmentRow.user_id]);

      // Lock target assignment row
      const lockedAssignment = await tx.get(
        "SELECT * FROM workforce_employee_fixed_assignment WHERE id = ? AND tenant_id = ? FOR UPDATE",
        [assignmentId, tenantId]
      );

      if (lockedAssignment.status === "published") {
        throw new AppError("Assignment is already published", 400);
      }
      if (lockedAssignment.status !== "draft") {
        throw new AppError(`Cannot publish assignment with status '${lockedAssignment.status}'`, 400);
      }

      const effectiveFrom = formatDateToYMD(lockedAssignment.effective_from);
      const effectiveTo = lockedAssignment.effective_to ? formatDateToYMD(lockedAssignment.effective_to) : null;

      // 2. Fetch full shift version details + breaks + policies for canonical snapshot
      const shiftVersion = await tx.get(
        `SELECT sv.*, s.name as shift_name, s.code as shift_code, s.timezone
         FROM workforce_shift_version sv
         JOIN workforce_shift s ON s.id = sv.shift_id AND s.tenant_id = sv.tenant_id
         WHERE sv.id = ? AND sv.tenant_id = ?`,
        [lockedAssignment.shift_version_id, tenantId]
      );

      const breaks = await tx.all(
        `SELECT id, break_name, break_type, start_offset_minutes, end_offset_minutes, duration_minutes, is_mandatory
         FROM workforce_shift_break
         WHERE shift_version_id = ? AND tenant_id = ?
         ORDER BY start_offset_minutes ASC`,
        [lockedAssignment.shift_version_id, tenantId]
      );

      const employee = await tx.get(
        `SELECT u.id, u.username, u.first_name, u.last_name, u.email, ep.team_name, ep.designation
         FROM accounts_user u
         LEFT JOIN accounts_employeeprofile ep ON ep.user_id = u.id
         WHERE u.id = ?`,
        [lockedAssignment.user_id]
      );

      // Build canonical snapshot
      const snapshotPayload = {
        schema_version: "1.0",
        assignment_id: lockedAssignment.id,
        tenant_id: tenantId,
        user: {
          id: employee.id,
          username: employee.username,
          full_name: `${employee.first_name || ""} ${employee.last_name || ""}`.trim(),
          email: employee.email,
          team: employee.team_name || null,
        },
        shift: {
          id: shiftVersion.shift_id,
          name: shiftVersion.shift_name,
          code: shiftVersion.shift_code,
          version_id: shiftVersion.id,
          version_number: shiftVersion.version_number,
          start_time: shiftVersion.start_time,
          end_time: shiftVersion.end_time,
          total_work_hours: Number((shiftVersion.duration_minutes / 60.0).toFixed(2)),
          duration_minutes: shiftVersion.duration_minutes,
          breaks: breaks.map(b => ({
            name: b.break_name,
            type: b.break_type,
            start_offset: b.start_offset_minutes,
            end_offset: b.end_offset_minutes,
            duration: b.duration_minutes,
            is_mandatory: Boolean(b.is_mandatory),
          })),
        },
        effective_from: effectiveFrom,
        effective_to: effectiveTo,
        published_at: new Date().toISOString(),
      };

      const canonicalJson = canonicalizeJson(snapshotPayload);
      const snapshotHash = generateSnapshotPayloadHash(canonicalJson);

      // 3. Check and supersede currently active published assignments for this user
      const activeAssignments = await tx.all(
        `SELECT id, effective_from, effective_to
         FROM workforce_employee_fixed_assignment
         WHERE tenant_id = ? AND user_id = ? AND status = 'published' AND id != ?
         ORDER BY effective_from ASC`,
        [tenantId, lockedAssignment.user_id, lockedAssignment.id]
      );

      for (const active of activeAssignments) {
        const activeFrom = formatDateToYMD(active.effective_from);
        const activeTo = active.effective_to ? formatDateToYMD(active.effective_to) : "9999-12-31";
        const newTo = effectiveTo || "9999-12-31";

        // Overlap condition: activeFrom <= newTo AND activeTo >= effectiveFrom
        if (activeFrom <= newTo && activeTo >= effectiveFrom) {
          if (activeFrom < effectiveFrom) {
            // Case: Prior active assignment started before new one. Supersede by setting effective_to to day before effectiveFrom
            const prevDayDate = new Date(effectiveFrom);
            prevDayDate.setDate(prevDayDate.getDate() - 1);
            const closedEffectiveTo = prevDayDate.toISOString().slice(0, 10);

            await tx.run(
              `UPDATE workforce_employee_fixed_assignment
               SET effective_to = ?, status = 'superseded', updated_by = ?
               WHERE id = ?`,
              [closedEffectiveTo, actorUserId || null, active.id]
            );
          } else {
            // Case: Direct collision starting at or before new one -> Cancel or reject
            throw new AppError(
              `Cannot publish assignment: Overlaps with existing published assignment ID ${active.id} (${activeFrom} to ${activeTo})`,
              409
            );
          }
        }
      }

      // 4. Update and publish target assignment
      await tx.run(
        `UPDATE workforce_employee_fixed_assignment
         SET status = 'published',
             assignment_snapshot = ?,
             snapshot_hash = ?,
             published_by = ?,
             published_at = CURRENT_TIMESTAMP,
             updated_by = ?
         WHERE id = ?`,
        [canonicalJson, snapshotHash, actorUserId || null, actorUserId || null, assignmentId]
      );

      await auditService.log(
        { id: actorUserId, role: "admin" },
        "ASSIGNMENT_PUBLISHED",
        assignmentId,
        `Published fixed assignment for user ${lockedAssignment.user_id}, shift version ${lockedAssignment.shift_version_id}`,
        null,
        "INFO",
        tx
      );

      return {
        id: assignmentId,
        tenant_id: tenantId,
        user_id: lockedAssignment.user_id,
        shift_id: lockedAssignment.shift_id,
        shift_version_id: lockedAssignment.shift_version_id,
        effective_from: effectiveFrom,
        effective_to: effectiveTo,
        status: "published",
        snapshot_hash: snapshotHash,
      };
    });
    if (!existingTx) realtimeService.emitToTenant(tenantId, "schedule_update", { type: "assignment_published", userId: result.user_id, assignmentId: Number(assignmentId) });
    return result;
  },

  /**
   * Cancel an active or published assignment with reason.
   */
  async cancelAssignment(tenantId, assignmentId, reason, actorUserId, existingTx = null) {
    const result = await runWithTx(existingTx, async (tx) => {
      const assignment = await tx.get(
        "SELECT * FROM workforce_employee_fixed_assignment WHERE id = ? AND tenant_id = ? FOR UPDATE",
        [assignmentId, tenantId]
      );
      if (!assignment) {
        throw new AppError("Shift assignment not found", 404);
      }

      if (assignment.status === "cancelled") {
        throw new AppError("Assignment is already cancelled", 400);
      }

      await tx.run(
        `UPDATE workforce_employee_fixed_assignment
         SET status = 'cancelled',
             cancelled_by = ?,
             cancelled_at = CURRENT_TIMESTAMP,
             cancellation_reason = ?,
             updated_by = ?
         WHERE id = ?`,
        [actorUserId || null, reason || "Cancelled by administrator", actorUserId || null, assignmentId]
      );

      await auditService.log(
        { id: actorUserId, role: "admin" },
        "ASSIGNMENT_CANCELLED",
        assignmentId,
        `Cancelled shift assignment ID ${assignmentId}. Reason: ${reason || "No reason specified"}`,
        null,
        "WARN",
        tx
      );

      return { id: assignmentId, user_id: assignment.user_id, status: "cancelled", cancellation_reason: reason };
    });
    if (!existingTx) realtimeService.emitToTenant(tenantId, "schedule_update", { type: "assignment_cancelled", userId: result.user_id, assignmentId: Number(assignmentId) });
    return result;
  },

  /**
   * Bulk shift assignment across multiple employees or an entire team.
   * Returns structured result detailing successes, rejections, and conflict reasons.
   */
  async bulkAssign(tenantId, { userIds = [], teamName = null, shiftId, shiftVersionId, effectiveFrom, effectiveTo = null, publishImmediately = true }, actorUserId) {
    if (!shiftId || !shiftVersionId || !effectiveFrom) {
      throw new AppError("shiftId, shiftVersionId, and effectiveFrom are required for bulk assignment", 400);
    }

    // Resolve target employee userIds
    let targetUserIds = [...userIds];

    if (teamName) {
      const teamEmployees = await db.all(
        `SELECT u.id
         FROM accounts_user u
         JOIN workforce_user_tenant wut ON wut.user_id = u.id AND wut.tenant_id = ?
         JOIN accounts_employeeprofile ep ON ep.user_id = u.id
         WHERE ep.team_name = ? AND wut.is_active = 1`,
        [tenantId, teamName]
      );
      const teamUserIds = teamEmployees.map(e => e.id);
      targetUserIds = [...new Set([...targetUserIds, ...teamUserIds])];
    }

    if (targetUserIds.length === 0) {
      throw new AppError("No valid employees selected for bulk assignment", 400);
    }

    // Sort numerically for monotonic lock acquisition
    targetUserIds.sort((a, b) => a - b);

    const result = {
      total_selected: targetUserIds.length,
      successfully_assigned: 0,
      rejected: 0,
      skipped: 0,
      assignments: [],
      conflicts: [],
    };

    for (const userId of targetUserIds) {
      try {
        const draft = await this.createDraftAssignment(
          tenantId,
          {
            user_id: userId,
            shift_id: shiftId,
            shift_version_id: shiftVersionId,
            effective_from: effectiveFrom,
            effective_to: effectiveTo,
          },
          actorUserId
        );

        if (publishImmediately) {
          const published = await this.publishAssignment(tenantId, draft.id, actorUserId);
          result.assignments.push(published);
        } else {
          result.assignments.push(draft);
        }
        result.successfully_assigned++;
      } catch (err) {
        result.rejected++;
        result.conflicts.push({
          user_id: userId,
          reason: err.message,
        });
      }
    }

    return result;
  },

  /**
   * Get active fixed assignment for an employee on a given date.
   */
  async getActiveAssignmentForEmployee(tenantId, userId, workDate, existingTx = null) {
    const executor = existingTx || db;
    const formattedDate = formatDateToYMD(workDate);

    if (!(await hasAssignmentLifecycleSchema())) {
      const hasVersionStatus = await hasColumn("workforce_shift_version", "status");
      const versionStatusFilter = hasVersionStatus ? "AND sv2.status = 'published'" : "";
      const legacyRows = await executor.all(
        `SELECT wefa.*, s.name AS shift_name, s.code AS shift_code,
          sv.version_number, sv.start_time, sv.end_time,
          ROUND(sv.duration_minutes / 60.0, 2) AS total_work_hours,
          sv.duration_minutes
         FROM workforce_employee_fixed_assignment wefa
         JOIN workforce_shift s ON s.id = wefa.shift_id AND s.tenant_id = wefa.tenant_id
         LEFT JOIN workforce_shift_version sv ON sv.id = (
           SELECT sv2.id FROM workforce_shift_version sv2
           WHERE sv2.tenant_id = wefa.tenant_id AND sv2.shift_id = wefa.shift_id
             AND sv2.effective_from <= ?
             AND (sv2.effective_to IS NULL OR sv2.effective_to >= ?)
             ${versionStatusFilter}
           ORDER BY sv2.effective_from DESC, sv2.version_number DESC LIMIT 1
         )
         WHERE wefa.tenant_id = ? AND wefa.user_id = ? AND wefa.is_active = 1
           AND wefa.effective_from <= ?
           AND (wefa.effective_to IS NULL OR wefa.effective_to >= ?)
         ORDER BY wefa.effective_from DESC, wefa.id DESC LIMIT 1`,
        [formattedDate, formattedDate, tenantId, userId, formattedDate, formattedDate]
      );
      return legacyRows[0] || null;
    }

    const sql = `
      SELECT 
        wefa.*,
        s.name as shift_name,
        s.code as shift_code,
        s.timezone,
        sv.version_number,
        sv.start_time,
        sv.end_time,
        ROUND(sv.duration_minutes / 60.0, 2) as total_work_hours,
        sv.duration_minutes
      FROM workforce_employee_fixed_assignment wefa
      JOIN workforce_shift s ON s.id = wefa.shift_id AND s.tenant_id = wefa.tenant_id
      JOIN workforce_shift_version sv ON sv.id = wefa.shift_version_id AND sv.tenant_id = wefa.tenant_id
      WHERE wefa.tenant_id = ?
        AND wefa.user_id = ?
        AND wefa.status = 'published'
        AND wefa.effective_from <= ?
        AND (wefa.effective_to IS NULL OR wefa.effective_to >= ?)
      ORDER BY wefa.effective_from DESC, wefa.id DESC
      LIMIT 1
    `;
    const rows = await executor.all(sql, [tenantId, userId, formattedDate, formattedDate]);
    return rows[0] || null;
  }
};
