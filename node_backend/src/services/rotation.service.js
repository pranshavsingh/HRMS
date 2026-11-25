// ============================================================================
// Service: node_backend/src/services/rotation.service.js
// Description: Deterministic rotating shift assignment engine.
//              Supports configurable cycle length, multi-step shift sequences,
//              off-day steps, minimum rest period validation, employee enrollment,
//              and historical schedule reproducibility.
// ============================================================================

import { db } from "../db/index.js";
import { AppError } from "../middleware/errorHandler.js";
import { formatDateToYMD } from "./shift-validation.service.js";
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

/**
 * Helper to compute date difference in integer calendar days (UTC based).
 */
function getDateDifferenceInDays(startDateStr, targetDateStr) {
  const d1 = new Date(`${startDateStr}T00:00:00Z`);
  const d2 = new Date(`${targetDateStr}T00:00:00Z`);
  const diffMs = d2.getTime() - d1.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export const rotationService = {
  /**
   * List rotation pattern definitions for a tenant.
   */
  async listRotations(tenantId, { status = null, search = "" } = {}) {
    const whereConditions = ["tenant_id = ?"];
    const params = [tenantId];

    if (status) {
      whereConditions.push("status = ?");
      params.push(status);
    }
    if (search) {
      whereConditions.push("(name LIKE ? OR code LIKE ?)");
      params.push(`%${search}%`, `%${search}%`);
    }

    const sql = `
      SELECT r.*,
             (SELECT COUNT(*) FROM workforce_rotation_step WHERE rotation_id = r.id AND tenant_id = r.tenant_id) as step_count,
             (SELECT COUNT(*) FROM workforce_employee_rotation WHERE rotation_id = r.id AND tenant_id = r.tenant_id AND is_active = 1) as enrolled_count
      FROM workforce_rotation_definition r
      WHERE ${whereConditions.join(" AND ")}
      ORDER BY r.id DESC
    `;

    return db.all(sql, params);
  },

  /**
   * Get rotation definition by ID with all steps and resolved shifts.
   */
  async getRotationById(tenantId, rotationId, existingTx = null) {
    const executor = existingTx || db;
    const rot = await executor.get(
      "SELECT * FROM workforce_rotation_definition WHERE id = ? AND tenant_id = ?",
      [rotationId, tenantId]
    );
    if (!rot) {
      throw new AppError("Rotation definition not found", 404);
    }

    const stepsSql = `
      SELECT rs.*,
             s.name as shift_name,
             s.code as shift_code,
             sv.start_time,
             sv.end_time,
             ROUND(sv.duration_minutes / 60.0, 2) as total_work_hours,
             sv.duration_minutes
      FROM workforce_rotation_step rs
      LEFT JOIN workforce_shift s ON s.id = rs.shift_id AND s.tenant_id = rs.tenant_id
      LEFT JOIN workforce_shift_version sv ON sv.id = rs.shift_version_id AND sv.tenant_id = rs.tenant_id
      WHERE rs.rotation_id = ? AND rs.tenant_id = ?
      ORDER BY rs.step_order ASC
    `;
    const steps = await executor.all(stepsSql, [rotationId, tenantId]);

    return {
      ...rot,
      steps,
    };
  },

  async createRotationPattern(...args) {
    return this.createRotation(...args);
  },

  /**
   * Create a rotation pattern definition with steps.
   */
  async createRotation(tenantId, data, actorUserId, existingTx = null) {
    return runWithTx(existingTx, async (tx) => {
      const { code, name, description = null, steps = [] } = data;
      const cycle_length_days = data.cycle_length_days || data.cycle_days || 7;

      if (!Number.isInteger(Number(cycle_length_days)) || Number(cycle_length_days) < 1) {
        throw new AppError("Rotation cycle length must be a positive whole number of days", 400);
      }
      if (!Array.isArray(steps) || steps.length === 0) {
        throw new AppError("A rotation pattern must contain at least one step", 400);
      }

      if (!code || !name) {
        throw new AppError("Rotation code and name are required", 400);
      }

      const existingCode = await tx.get(
        "SELECT id FROM workforce_rotation_definition WHERE tenant_id = ? AND code = ?",
        [tenantId, code]
      );
      if (existingCode) {
        throw new AppError(`Rotation definition with code '${code}' already exists`, 409);
      }

      // Insert definition
      const insertSql = `
        INSERT INTO workforce_rotation_definition
          (tenant_id, code, name, description, cycle_length_days, status, is_active, created_by)
        VALUES
          (?, ?, ?, ?, ?, 'draft', 1, ?)
      `;
      const res = await tx.run(insertSql, [
        tenantId,
        code,
        name,
        description,
        cycle_length_days,
        actorUserId || null,
      ]);
      const rotationId = res.lastID || res.insertId;

      // Insert steps if provided
      let order = 1;
      let totalStepDays = 0;
      for (const step of steps) {
        const { shift_id = null, shift_version_id = null, duration_days = 1, is_off_day = false } = step;

        if (!Number.isInteger(Number(duration_days)) || Number(duration_days) < 1) {
          throw new AppError(`Step ${order} duration must be a positive whole number of days`, 400);
        }

        if (!is_off_day && !shift_id) {
          throw new AppError(`Step ${order} must specify shift_id or be marked as is_off_day`, 400);
        }

        await tx.run(
          `INSERT INTO workforce_rotation_step
             (tenant_id, rotation_id, step_order, shift_id, shift_version_id, duration_days, is_off_day)
           VALUES
             (?, ?, ?, ?, ?, ?, ?)`,
          [
            tenantId,
            rotationId,
            order,
            is_off_day ? null : (shift_id || null),
            is_off_day ? null : (shift_version_id || null),
            duration_days,
            is_off_day ? 1 : 0,
          ]
        );
        totalStepDays += duration_days;
        order++;
      }

      // The cycle length is defined by the sum of its steps; keep both values aligned.
      if (totalStepDays !== Number(cycle_length_days)) {
        await tx.run("UPDATE workforce_rotation_definition SET cycle_length_days = ? WHERE id = ?", [totalStepDays, rotationId]);
      }

      await auditService.log(
        { id: actorUserId, role: "admin" },
        "ROTATION_PATTERN_CREATED",
        rotationId,
        `Created rotation pattern '${code}' with ${steps.length} steps`,
        null,
        "INFO",
        tx
      );

      return this.getRotationById(tenantId, rotationId, tx);
    });
  },

  /**
   * Validate minimum rest between rotation steps.
   * Ensures consecutive non-off-day shifts have >= minRestHours (default 11h).
   */
  async validateMinimumRest(steps, minRestHours = 11) {
    if (!steps || steps.length <= 1) return { valid: true };

    const violations = [];
    for (let i = 0; i < steps.length; i++) {
      const current = steps[i];
      const next = steps[(i + 1) % steps.length]; // Checks wrap-around cycle

      if (!current.is_off_day && !next.is_off_day && current.end_time && next.start_time) {
        // Calculate rest hours
        const [cEndH, cEndM] = current.end_time.split(":").map(Number);
        const [nStartH, nStartM] = next.start_time.split(":").map(Number);

        let restMinutes = (nStartH * 60 + nStartM) - (cEndH * 60 + cEndM);
        if (restMinutes <= 0) {
          restMinutes += 24 * 60; // Cross-midnight or next calendar day
        }

        const restHours = restMinutes / 60;
        if (restHours < minRestHours) {
          violations.push({
            step_order: current.step_order,
            next_step_order: next.step_order,
            current_end: current.end_time,
            next_start: next.start_time,
            actual_rest_hours: Number(restHours.toFixed(2)),
            required_rest_hours: minRestHours,
          });
        }
      }
    }

    return {
      valid: violations.length === 0,
      violations,
    };
  },

  /**
   * Publish rotation pattern.
   */
  async publishRotation(tenantId, rotationId, actorUserId, existingTx = null) {
    return runWithTx(existingTx, async (tx) => {
      const rot = await this.getRotationById(tenantId, rotationId, tx);
      if (rot.status === "published") {
        throw new AppError("Rotation pattern is already published", 400);
      }
      if (!rot.steps || rot.steps.length === 0) {
        throw new AppError("Cannot publish rotation pattern with 0 steps", 400);
      }
      const configuredDays = rot.steps.reduce((sum, step) => sum + Number(step.duration_days || 0), 0);
      if (rot.steps.some((step) => !Number.isInteger(Number(step.duration_days)) || Number(step.duration_days) < 1)
        || configuredDays !== Number(rot.cycle_length_days)) {
        throw new AppError("Rotation steps must have positive whole-day durations that add up to the cycle length", 400);
      }
      for (const step of rot.steps.filter((item) => !item.is_off_day)) {
        const validShift = await tx.get(
          "SELECT id FROM workforce_shift WHERE id = ? AND tenant_id = ? AND is_active = 1",
          [step.shift_id, tenantId]
        );
        if (!validShift) throw new AppError(`Step ${step.step_order} refers to an unavailable shift`, 400);
      }

      // Check rest period validation
      const restValidation = await this.validateMinimumRest(rot.steps);
      if (!restValidation.valid) {
        throw new AppError(
          `Minimum rest period violation between rotation steps: ${JSON.stringify(restValidation.violations)}`,
          400
        );
      }

      await tx.run(
        `UPDATE workforce_rotation_definition
         SET status = 'published',
             published_by = ?,
             published_at = CURRENT_TIMESTAMP,
             updated_by = ?
         WHERE id = ? AND tenant_id = ?`,
        [actorUserId || null, actorUserId || null, rotationId, tenantId]
      );

      await auditService.log(
        { id: actorUserId, role: "admin" },
        "ROTATION_PATTERN_PUBLISHED",
        rotationId,
        `Published rotation pattern '${rot.code}'`,
        null,
        "INFO",
        tx
      );

      return { id: rotationId, status: "published" };
    });
  },

  /**
   * Enroll an employee into a rotation pattern.
   */
  async enrollEmployee(tenantId, data, actorUserId, existingTx = null) {
    const result = await runWithTx(existingTx, async (tx) => {
      const { user_id, rotation_id, start_date, effective_to = null, offset_days = 0, initial_step_order = 1 } = data;

      if (!user_id || !rotation_id || !start_date) {
        throw new AppError("user_id, rotation_id, and start_date are required", 400);
      }

      const formattedStart = formatDateToYMD(start_date);
      const formattedEnd = effective_to ? formatDateToYMD(effective_to) : null;

      // Verify user in tenant
      const user = await tx.get(
        "SELECT user_id FROM workforce_user_tenant WHERE tenant_id = ? AND user_id = ? AND is_active = 1",
        [tenantId, user_id]
      );
      if (!user) throw new AppError("Employee not found in tenant", 404);

      // Verify rotation is published
      const rot = await tx.get(
        "SELECT id, status, cycle_length_days FROM workforce_rotation_definition WHERE tenant_id = ? AND id = ?",
        [tenantId, rotation_id]
      );
      if (!rot || rot.status !== "published") {
        throw new AppError("Rotation pattern does not exist or is not published", 400);
      }
      const initialStep = await tx.get(
        "SELECT step_order FROM workforce_rotation_step WHERE tenant_id = ? AND rotation_id = ? AND step_order = ?",
        [tenantId, rotation_id, initial_step_order]
      );
      if (!initialStep) throw new AppError("Starting step does not exist in this rotation pattern", 400);
      if (formattedEnd && formattedEnd < formattedStart) throw new AppError("effective_to cannot be earlier than start_date", 400);

      // Check single active enrollment
      const existingEnrollment = await tx.get(
        "SELECT id FROM workforce_employee_rotation WHERE tenant_id = ? AND user_id = ? AND status = 'published' AND is_active = 1",
        [tenantId, user_id]
      );
      if (existingEnrollment) {
        // Supersede previous enrollment
        await tx.run(
          "UPDATE workforce_employee_rotation SET status = 'superseded', is_active = 0 WHERE id = ?",
          [existingEnrollment.id]
        );
      }

      const insertSql = `
        INSERT INTO workforce_employee_rotation
          (tenant_id, user_id, rotation_id, start_date, effective_to, initial_step_order, offset_days, status, is_active, created_by, published_by, published_at)
        VALUES
          (?, ?, ?, ?, ?, ?, ?, 'published', 1, ?, ?, CURRENT_TIMESTAMP)
      `;
      const res = await tx.run(insertSql, [
        tenantId,
        user_id,
        rotation_id,
        formattedStart,
        formattedEnd,
        initial_step_order,
        offset_days,
        actorUserId || null,
        actorUserId || null,
      ]);

      const enrollmentId = res.lastID || res.insertId;

      await auditService.log(
        { id: actorUserId, role: "admin" },
        "EMPLOYEE_ROTATION_ENROLLED",
        enrollmentId,
        `Enrolled employee ${user_id} into rotation ${rotation_id} starting ${formattedStart}`,
        null,
        "INFO",
        tx
      );

      return {
        id: enrollmentId,
        user_id,
        rotation_id,
        start_date: formattedStart,
        effective_to: formattedEnd,
        status: "published",
      };
    });
    if (!existingTx) realtimeService.emitToTenant(tenantId, "schedule_update", { type: "rotation_enrolled", userId: Number(result.user_id), rotationId: Number(rotation_id) });
    return result;
  },

  /**
   * Deterministic Rotation Engine:
   * Given an employee rotation enrollment and a work date, compute the scheduled shift.
   */
  async calculateShiftForDate(tenantId, userId, workDate, existingTx = null) {
    const executor = existingTx || db;
    const formattedDate = formatDateToYMD(workDate);

    // 1. Find active rotation enrollment covering workDate
    const enrollment = await executor.get(
      `SELECT wer.*, rd.cycle_length_days
       FROM workforce_employee_rotation wer
       JOIN workforce_rotation_definition rd ON rd.id = wer.rotation_id AND rd.tenant_id = wer.tenant_id
       WHERE wer.tenant_id = ?
         AND wer.user_id = ?
         AND wer.status = 'published'
         AND wer.is_active = 1
         AND wer.start_date <= ?
         AND (wer.effective_to IS NULL OR wer.effective_to >= ?)
       ORDER BY wer.start_date DESC
       LIMIT 1`,
      [tenantId, userId, formattedDate, formattedDate]
    );

    if (!enrollment) {
      return null; // No rotation assigned
    }

    const startDate = formatDateToYMD(enrollment.start_date);
    const deltaDays = getDateDifferenceInDays(startDate, formattedDate);
    if (deltaDays < 0) return null;

    const cycleLength = Number(enrollment.cycle_length_days || 7);
    const offset = enrollment.offset_days || 0;

    // Modulo calculation
    // 2. Fetch steps
    const steps = await executor.all(
      `SELECT rs.*,
              s.name as shift_name,
              s.code as shift_code,
              s.timezone
       FROM workforce_rotation_step rs
       LEFT JOIN workforce_shift s ON s.id = rs.shift_id AND s.tenant_id = rs.tenant_id
       WHERE rs.rotation_id = ? AND rs.tenant_id = ?
       ORDER BY rs.step_order ASC`,
      [enrollment.rotation_id, tenantId]
    );

    if (!steps || steps.length === 0) return null;

    const initialStepIndex = Math.max(0, steps.findIndex((step) => Number(step.step_order) === Number(enrollment.initial_step_order || 1)));
    const initialStepOffset = steps.slice(0, initialStepIndex).reduce((sum, step) => sum + Number(step.duration_days || 0), 0);
    const cyclePosition = ((deltaDays + offset + initialStepOffset) % cycleLength + cycleLength) % cycleLength;

    // Resolve matching step via cumulative duration days
    let cumulative = 0;
    let matchedStep = null;
    for (const step of steps) {
      cumulative += step.duration_days;
      if (cumulative > cyclePosition) {
        matchedStep = step;
        break;
      }
    }
    if (!matchedStep) {
      matchedStep = steps[steps.length - 1];
    }

    if (matchedStep.is_off_day) {
      return {
        work_date: formattedDate,
        is_off_day: true,
        shift_id: null,
        shift_version_id: null,
        shift_name: "Weekly Off (Rotation)",
        rotation_id: enrollment.rotation_id,
        step_order: matchedStep.step_order,
      };
    }

    // Resolve published shift version
    let shiftVersionId = matchedStep.shift_version_id;
    if (!shiftVersionId) {
      const activeVersion = await executor.get(
        `SELECT id, start_time, end_time, ROUND(duration_minutes / 60.0, 2) as total_work_hours, duration_minutes
         FROM workforce_shift_version
         WHERE tenant_id = ? AND shift_id = ? AND status = 'published' AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)
         ORDER BY version_number DESC
         LIMIT 1`,
        [tenantId, matchedStep.shift_id, formattedDate, formattedDate]
      );
      if (activeVersion) {
        shiftVersionId = activeVersion.id;
      }
    }

    const versionRow = await executor.get(
      "SELECT * FROM workforce_shift_version WHERE id = ? AND tenant_id = ?",
      [shiftVersionId, tenantId]
    );

    const calculatedHours = versionRow?.duration_minutes
      ? Number((versionRow.duration_minutes / 60.0).toFixed(2))
      : 8;

    return {
      work_date: formattedDate,
      is_off_day: false,
      shift_id: matchedStep.shift_id,
      shift_version_id: shiftVersionId,
      shift_name: matchedStep.shift_name,
      shift_code: matchedStep.shift_code,
      start_time: versionRow?.start_time,
      end_time: versionRow?.end_time,
      timezone: matchedStep.timezone || "UTC",
      version_number: versionRow?.version_number,
      duration_minutes: versionRow?.duration_minutes,
      total_work_hours: calculatedHours,
      rotation_id: enrollment.rotation_id,
      step_order: matchedStep.step_order,
    };
  },

  /**
   * Preview rotation schedule for a date range.
   */
  async previewRotationSchedule(tenantId, rotationId, startDate, endDate) {
    if (!startDate || !endDate) {
      throw new AppError("startDate and endDate are required", 400);
    }
    const startStr = formatDateToYMD(startDate);
    const endStr = formatDateToYMD(endDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startStr) || !/^\d{4}-\d{2}-\d{2}$/.test(endStr)) {
      throw new AppError("startDate and endDate must be valid YYYY-MM-DD dates", 400);
    }
    if (startStr > endStr) {
      throw new AppError("startDate must be on or before endDate", 400);
    }
    const totalDays = getDateDifferenceInDays(startStr, endStr) + 1;
    if (totalDays > 366) {
      throw new AppError("Rotation preview range cannot exceed 366 days", 400);
    }
    const rot = await this.getRotationById(tenantId, rotationId);

    const schedule = [];
    const cycleLength = rot.cycle_length_days || 7;

    for (let i = 0; i < totalDays; i++) {
      const curDate = new Date(`${startStr}T00:00:00Z`);
      curDate.setUTCDate(curDate.getUTCDate() + i);
      const dateStr = curDate.toISOString().slice(0, 10);

      const cyclePos = i % cycleLength;
      let cumulative = 0;
      let matchedStep = rot.steps[0];
      for (const step of rot.steps) {
        cumulative += step.duration_days;
        if (cumulative > cyclePos) {
          matchedStep = step;
          break;
        }
      }

      let startTime = matchedStep.start_time || null;
      let endTime = matchedStep.end_time || null;
      if (!matchedStep.is_off_day && (!startTime || !endTime)) {
        const version = await db.get(
          `SELECT start_time, end_time FROM workforce_shift_version
           WHERE tenant_id = ? AND shift_id = ? AND status = 'published'
             AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)
           ORDER BY effective_from DESC, version_number DESC LIMIT 1`,
          [tenantId, matchedStep.shift_id, dateStr, dateStr]
        );
        startTime = version?.start_time || null;
        endTime = version?.end_time || null;
      }
      schedule.push({
        work_date: dateStr,
        day_of_week: curDate.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
        step_order: matchedStep.step_order,
        is_off_day: Boolean(matchedStep.is_off_day),
        shift_id: matchedStep.shift_id,
        shift_name: matchedStep.is_off_day ? "Off Day" : (matchedStep.shift_name || "Assigned Shift"),
        start_time: startTime,
        end_time: endTime,
      });
    }

    return {
      rotation: rot,
      start_date: startStr,
      end_date: endStr,
      total_days: totalDays,
      schedule,
    };
  }
};
