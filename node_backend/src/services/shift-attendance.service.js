// ============================================================================
// Service: node_backend/src/services/shift-attendance.service.js
// Description: Core shift attendance integration engine.
//              Handles tiered shift resolution, overnight attribution,
//              lookback windows, punctuality evaluation, window-based break
//              deductions, early departure, and net-scheduled overtime calculations.
// ============================================================================

import { db } from "../db/index.js";
import { AppError } from "../middleware/errorHandler.js";
import { formatDateToYMD } from "./shift-validation.service.js";
import { rotationService } from "./rotation.service.js";

/**
 * Format Date object to YYYY-MM-DD string in local date.
 */
function toLocalDateString(dateInput) {
  if (!dateInput) return null;
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

/**
 * Add or subtract calendar days from a YYYY-MM-DD string.
 */
function offsetDateYMD(dateYMD, dayOffset) {
  const d = new Date(`${dateYMD}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  return d.toISOString().slice(0, 10);
}

/**
 * Build a JavaScript Date object from a YYYY-MM-DD and HH:MM:SS string.
 */
function createDateTimeFromDateAndTime(dateYMD, timeStr) {
  if (!dateYMD || !timeStr) return null;
  const parts = String(timeStr).split(":");
  const hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;
  const seconds = parseInt(parts[2], 10) || 0;

  const d = new Date(`${dateYMD}T00:00:00`);
  d.setHours(hours, minutes, seconds, 0);
  return d;
}

export const shiftAttendanceService = {
  /**
   * Resolve an employee's shift for a given punch-in time using tiered resolution.
   * 1. Overnight lookback (00:00 - 04:00 attribution to prior evening if scheduled)
   * 2. Published Roster entry
   * 3. Published Fixed Assignment or Rotation cycle
   * 4. Tenant Default Shift (subject to policy allow_unscheduled_punch)
   * 5. Fallback unassigned
   */
  async resolveShiftForPunchIn(tenantId, userId, punchDateTime = new Date(), tx = null) {
    const executor = tx || db;
    const punchDateObj = punchDateTime instanceof Date ? punchDateTime : new Date(punchDateTime);
    const todayYMD = toLocalDateString(punchDateObj);
    const punchHours = punchDateObj.getHours();

    // ------------------------------------------------------------------------
    // Step 1: Overnight Lookback Check (Midnight to 04:00)
    // If a late employee hasn't punched in yet, search for an eligible scheduled
    // overnight shift from the previous work date using roster/assignment/rotation.
    // ------------------------------------------------------------------------
    if (punchHours < 4) {
      const yesterdayYMD = offsetDateYMD(todayYMD, -1);

      // Check if user already has an attendance record for yesterday's work_date
      const existingYesterdayAtt = await executor.get(
        "SELECT id FROM attendance_attendance WHERE user_id = ? AND work_date = ? LIMIT 1",
        [userId, yesterdayYMD]
      );

      if (!existingYesterdayAtt) {
        // A. Check if user had an overnight roster entry yesterday
        const yesterdayRoster = await executor.get(
          `SELECT 
             re.id as roster_entry_id,
             re.shift_id,
             re.shift_version_id,
             re.work_date,
             s.name as shift_name,
             s.code as shift_code,
             s.timezone,
             sv.version_number,
             sv.start_time,
             sv.end_time,
             sv.is_overnight,
             sv.duration_minutes,
             sv.late_grace_minutes,
             sv.early_departure_grace_minutes,
             sv.policy_id,
             sv.policy_version_id
           FROM workforce_roster_entry re
           JOIN workforce_roster_header rh ON rh.id = re.roster_header_id AND rh.tenant_id = re.tenant_id
           JOIN workforce_shift s ON s.id = re.shift_id AND s.tenant_id = re.tenant_id
           JOIN workforce_shift_version sv ON sv.id = re.shift_version_id AND sv.tenant_id = re.tenant_id
           WHERE re.tenant_id = ? AND re.user_id = ? AND re.work_date = ?
             AND rh.status = 'published' AND sv.is_overnight = 1
           LIMIT 1`,
          [tenantId, userId, yesterdayYMD]
        );

        if (yesterdayRoster) {
          return {
            source: "roster",
            isUnscheduled: false,
            workDate: yesterdayYMD,
            isOvernightLookback: true,
            rosterEntryId: yesterdayRoster.roster_entry_id,
            shiftVersionId: yesterdayRoster.shift_version_id,
            shift: yesterdayRoster,
          };
        }

        // B. Check if user had an overnight fixed assignment yesterday
        const yesterdayFixed = await executor.get(
          `SELECT 
             wefa.id as assignment_id,
             wefa.shift_id,
             wefa.shift_version_id,
             s.name as shift_name,
             s.code as shift_code,
             s.timezone,
             sv.version_number,
             sv.start_time,
             sv.end_time,
             sv.is_overnight,
             sv.duration_minutes,
             sv.late_grace_minutes,
             sv.early_departure_grace_minutes,
             sv.policy_id,
             sv.policy_version_id
           FROM workforce_employee_fixed_assignment wefa
           JOIN workforce_shift s ON s.id = wefa.shift_id AND s.tenant_id = wefa.tenant_id
           JOIN workforce_shift_version sv ON sv.id = wefa.shift_version_id AND sv.tenant_id = wefa.tenant_id
           WHERE wefa.tenant_id = ? AND wefa.user_id = ? AND wefa.status = 'published'
             AND wefa.effective_from <= ? AND (wefa.effective_to IS NULL OR wefa.effective_to >= ?)
             AND sv.is_overnight = 1
           ORDER BY wefa.effective_from DESC, wefa.id DESC
           LIMIT 1`,
          [tenantId, userId, yesterdayYMD, yesterdayYMD]
        );

        if (yesterdayFixed) {
          return {
            source: "fixed",
            isUnscheduled: false,
            workDate: yesterdayYMD,
            isOvernightLookback: true,
            rosterEntryId: null,
            shiftVersionId: yesterdayFixed.shift_version_id,
            shift: yesterdayFixed,
          };
        }

        // C. Check if user had an overnight rotation schedule yesterday
        try {
          const rotYesterday = await rotationService.calculateShiftForDate(tenantId, userId, yesterdayYMD, executor);
          if (rotYesterday && !rotYesterday.is_off_day) {
            const rotVer = await executor.get(
              `SELECT sv.*, s.name as shift_name, s.code as shift_code, s.timezone
               FROM workforce_shift_version sv
               JOIN workforce_shift s ON s.id = sv.shift_id AND s.tenant_id = sv.tenant_id
               WHERE sv.id = ? AND sv.tenant_id = ? AND sv.is_overnight = 1`,
              [rotYesterday.shift_version_id, tenantId]
            );
            if (rotVer) {
              return {
                source: "rotation",
                isUnscheduled: false,
                workDate: yesterdayYMD,
                isOvernightLookback: true,
                rosterEntryId: null,
                shiftVersionId: rotVer.id,
                shift: rotVer,
              };
            }
          }
        } catch {
          // Non-fatal
        }
      }
    }

    // ------------------------------------------------------------------------
    // Step 2: Tier 1 — Published Roster Entry for Today
    // ------------------------------------------------------------------------
    const todayRoster = await executor.get(
      `SELECT 
         re.id as roster_entry_id,
         re.shift_id,
         re.shift_version_id,
         re.work_date,
         s.name as shift_name,
         s.code as shift_code,
         s.timezone,
         sv.version_number,
         sv.start_time,
         sv.end_time,
         sv.is_overnight,
         sv.duration_minutes,
         sv.late_grace_minutes,
         sv.early_departure_grace_minutes,
         sv.policy_id,
         sv.policy_version_id
       FROM workforce_roster_entry re
       JOIN workforce_roster_header rh ON rh.id = re.roster_header_id AND rh.tenant_id = re.tenant_id
       JOIN workforce_shift s ON s.id = re.shift_id AND s.tenant_id = re.tenant_id
       JOIN workforce_shift_version sv ON sv.id = re.shift_version_id AND sv.tenant_id = re.tenant_id
       WHERE re.tenant_id = ? AND re.user_id = ? AND re.work_date = ?
         AND rh.status = 'published'
       LIMIT 1`,
      [tenantId, userId, todayYMD]
    );

    if (todayRoster) {
      return {
        source: "roster",
        isUnscheduled: false,
        workDate: todayYMD,
        isOvernightLookback: false,
        rosterEntryId: todayRoster.roster_entry_id,
        shiftVersionId: todayRoster.shift_version_id,
        shift: todayRoster,
      };
    }

    // ------------------------------------------------------------------------
    // Step 3: Tier 2 — Published Fixed Assignment or Rotation
    // ------------------------------------------------------------------------
    const activeFixed = await executor.get(
      `SELECT 
         wefa.id as assignment_id,
         wefa.shift_id,
         wefa.shift_version_id,
         s.name as shift_name,
         s.code as shift_code,
         s.timezone,
         sv.version_number,
         sv.start_time,
         sv.end_time,
         sv.is_overnight,
         sv.duration_minutes,
         sv.late_grace_minutes,
         sv.early_departure_grace_minutes,
         sv.policy_id,
         sv.policy_version_id
       FROM workforce_employee_fixed_assignment wefa
       JOIN workforce_shift s ON s.id = wefa.shift_id AND s.tenant_id = wefa.tenant_id
       JOIN workforce_shift_version sv ON sv.id = wefa.shift_version_id AND sv.tenant_id = wefa.tenant_id
       WHERE wefa.tenant_id = ? AND wefa.user_id = ? AND wefa.status = 'published'
         AND wefa.effective_from <= ? AND (wefa.effective_to IS NULL OR wefa.effective_to >= ?)
       ORDER BY wefa.effective_from DESC, wefa.id DESC
       LIMIT 1`,
      [tenantId, userId, todayYMD, todayYMD]
    );

    if (activeFixed) {
      return {
        source: "fixed",
        isUnscheduled: false,
        workDate: todayYMD,
        isOvernightLookback: false,
        rosterEntryId: null,
        shiftVersionId: activeFixed.shift_version_id,
        shift: activeFixed,
      };
    }

    // Check rotation schedule
    let rotShift = null;
    try {
      rotShift = await rotationService.calculateShiftForDate(tenantId, userId, todayYMD, executor);
    } catch {
      rotShift = null;
    }

    if (rotShift) {
      if (rotShift.is_off_day) {
        // Scheduled off-day! Check company policy if unscheduled punch is permitted
        await this.assertUnscheduledPunchAllowed(tenantId, todayYMD, executor);
        return this.resolveTenantDefaultShift(tenantId, todayYMD, "off_day", executor);
      }

      const rotVersion = await executor.get(
        `SELECT 
           sv.id as shift_version_id,
           sv.shift_id,
           sv.version_number,
           s.name as shift_name,
           s.code as shift_code,
           s.timezone,
           sv.start_time,
           sv.end_time,
           sv.is_overnight,
           sv.duration_minutes,
           sv.late_grace_minutes,
           sv.early_departure_grace_minutes,
           sv.policy_id,
           sv.policy_version_id
         FROM workforce_shift_version sv
         JOIN workforce_shift s ON s.id = sv.shift_id AND s.tenant_id = sv.tenant_id
         WHERE sv.id = ? AND sv.tenant_id = ?`,
        [rotShift.shift_version_id, tenantId]
      );

      if (rotVersion) {
        return {
          source: "rotation",
          isUnscheduled: false,
          workDate: todayYMD,
          isOvernightLookback: false,
          rosterEntryId: null,
          shiftVersionId: rotVersion.shift_version_id,
          shift: rotVersion,
        };
      }
    }

    // ------------------------------------------------------------------------
    // Step 4: Tier 3 — Tenant Default Shift (Unscheduled Punch)
    // Explicitly preserved as resolution source 'tenant_default' and isUnscheduled: true.
    // ------------------------------------------------------------------------
    await this.assertUnscheduledPunchAllowed(tenantId, todayYMD, executor);
    return this.resolveTenantDefaultShift(tenantId, todayYMD, "unscheduled", executor);
  },

  /**
   * Enforce company policy rule for allow_unscheduled_punch.
   */
  async assertUnscheduledPunchAllowed(tenantId, workDateYMD, executor = db) {
    const policy = await executor.get(
      `SELECT allow_unscheduled_punch
       FROM workforce_company_policy_version
       WHERE tenant_id = ? AND status = 'published'
         AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)
       ORDER BY effective_from DESC, id DESC
       LIMIT 1`,
      [tenantId, workDateYMD, workDateYMD]
    );

    if (policy && Number(policy.allow_unscheduled_punch) === 0) {
      throw new AppError("Unscheduled punch-in is not permitted for your policy", 400);
    }
  },

  /**
   * Resolve default shift for a tenant when employee has no scheduled assignment.
   * Explicitly preserves resolution source as tenant_default and marks isUnscheduled: true.
   */
  async resolveTenantDefaultShift(tenantId, workDateYMD, reason = "unscheduled", executor = db) {
    const defaultShift = await executor.get(
      `SELECT 
         s.id as shift_id,
         s.name as shift_name,
         s.code as shift_code,
         s.timezone,
         sv.id as shift_version_id,
         sv.version_number,
         sv.start_time,
         sv.end_time,
         sv.is_overnight,
         sv.duration_minutes,
         sv.late_grace_minutes,
         sv.early_departure_grace_minutes,
         sv.policy_id,
         sv.policy_version_id
       FROM workforce_shift s
       JOIN workforce_shift_version sv ON sv.shift_id = s.id AND sv.tenant_id = s.tenant_id AND sv.status = 'published'
       WHERE s.tenant_id = ? AND s.is_active = 1
       ORDER BY s.id ASC, sv.version_number DESC
       LIMIT 1`,
      [tenantId]
    );

    if (!defaultShift) {
      return {
        source: "unassigned",
        isUnscheduled: true,
        unscheduledReason: reason,
        workDate: workDateYMD,
        rosterEntryId: null,
        shiftVersionId: null,
        shift: null,
      };
    }

    return {
      source: "tenant_default",
      isUnscheduled: true,
      unscheduledReason: reason,
      workDate: workDateYMD,
      rosterEntryId: null,
      shiftVersionId: defaultShift.shift_version_id,
      shift: defaultShift,
    };
  },

  /**
   * Evaluate punctuality for a punch-in event.
   * Compares punch-in time with shift scheduled start_time and late_grace_minutes.
   */
  evaluatePunchInPunctuality(shiftInfo, punchDateTime = new Date()) {
    if (!shiftInfo || !shiftInfo.shift || !shiftInfo.shift.start_time || shiftInfo.isUnscheduled) {
      return {
        punctualityStatus: "unassigned",
        lateMinutes: 0,
        isLate: false,
      };
    }

    const { shift, workDate } = shiftInfo;
    const scheduledStart = createDateTimeFromDateAndTime(workDate, shift.start_time);
    if (!scheduledStart) {
      return { punctualityStatus: "unassigned", lateMinutes: 0, isLate: false };
    }

    const punchDateObj = punchDateTime instanceof Date ? punchDateTime : new Date(punchDateTime);
    const diffMillis = punchDateObj.getTime() - scheduledStart.getTime();
    const diffMinutes = Math.floor(diffMillis / 60000);
    const graceMinutes = shift.late_grace_minutes !== undefined && shift.late_grace_minutes !== null
      ? Number(shift.late_grace_minutes)
      : 15;

    if (diffMinutes <= 0) {
      return {
        punctualityStatus: "on_time",
        lateMinutes: 0,
        isLate: false,
      };
    } else if (diffMinutes <= graceMinutes) {
      return {
        punctualityStatus: "grace_period",
        lateMinutes: 0,
        isLate: false,
      };
    } else {
      return {
        punctualityStatus: "late",
        lateMinutes: diffMinutes,
        isLate: true,
      };
    }
  },

  /**
   * Evaluate working hours, window-based break deductions, early departure,
   * and net-scheduled overtime calculations for punch-out.
   */
  async evaluatePunchOut(attendanceRecord, punchOutDateTime = new Date(), tx = null) {
    const executor = tx || db;
    const punchInTime = new Date(attendanceRecord.punch_in_time);
    const punchOutTime = punchOutDateTime instanceof Date ? punchOutDateTime : new Date(punchOutDateTime);

    const grossMillis = Math.max(0, punchOutTime.getTime() - punchInTime.getTime());
    const grossMinutes = Math.floor(grossMillis / 60000);

    let actualUnpaidBreakMinutes = 0;
    let scheduledUnpaidBreakMinutes = 0;
    let scheduledNetMinutes = 0;
    let shiftVersion = null;
    let policyVersion = null;

    if (attendanceRecord.shift_version_id) {
      // 1. Fetch shift version details
      shiftVersion = await executor.get(
        `SELECT sv.*, s.name as shift_name, s.code as shift_code
         FROM workforce_shift_version sv
         JOIN workforce_shift s ON s.id = sv.shift_id AND s.tenant_id = sv.tenant_id
         WHERE sv.id = ?`,
        [attendanceRecord.shift_version_id]
      );

      // 2. Fetch all breaks configured for this shift version
      const breaks = await executor.all(
        `SELECT *
         FROM workforce_shift_break
         WHERE shift_version_id = ?
         ORDER BY start_offset_minutes ASC`,
        [attendanceRecord.shift_version_id]
      );

      const workDateStr = formatDateToYMD(attendanceRecord.work_date);

      // Calculate scheduled unpaid breaks and actual window-based deductions
      if (shiftVersion && shiftVersion.start_time) {
        const scheduledShiftStart = createDateTimeFromDateAndTime(workDateStr, shiftVersion.start_time);
        const shiftStartEpoch = scheduledShiftStart ? scheduledShiftStart.getTime() : null;

        for (const b of breaks) {
          if (b.break_type === "unpaid") {
            const bDuration = Number(b.duration_minutes || 0);
            scheduledUnpaidBreakMinutes += bDuration;

            // Window-based deduction: check if employee was on duty during configured break window
            if (shiftStartEpoch && b.start_offset_minutes !== null && b.end_offset_minutes !== null) {
              const breakWindowStart = shiftStartEpoch + (Number(b.start_offset_minutes) * 60000);
              const breakWindowEnd = shiftStartEpoch + (Number(b.end_offset_minutes) * 60000);

              if (punchInTime.getTime() < breakWindowEnd && punchOutTime.getTime() > breakWindowStart) {
                // Actual overlap with this break window
                const overlapStart = Math.max(punchInTime.getTime(), breakWindowStart);
                const overlapEnd = Math.min(punchOutTime.getTime(), breakWindowEnd);
                const overlapMinutes = Math.max(0, Math.floor((overlapEnd - overlapStart) / 60000));
                actualUnpaidBreakMinutes += Math.min(overlapMinutes, bDuration);
              }
            } else {
              // Fallback if offsets not defined: deduct configured duration once if gross >= duration
              if (grossMinutes >= bDuration) {
                actualUnpaidBreakMinutes += bDuration;
              }
            }
          }
        }
      }

      // Scheduled Net Working Duration = Scheduled Gross - Scheduled Unpaid Breaks
      const scheduledGrossMinutes = Number(shiftVersion?.duration_minutes || 480);
      scheduledNetMinutes = Math.max(0, scheduledGrossMinutes - scheduledUnpaidBreakMinutes);

      // 3. Fetch applicable policy version
      if (shiftVersion && shiftVersion.policy_version_id) {
        policyVersion = await executor.get(
          "SELECT * FROM workforce_company_policy_version WHERE id = ?",
          [shiftVersion.policy_version_id]
        );
      }
    }

    // Actual Net Working Duration = Actual Gross - Actual Deducted Unpaid Breaks
    const netMinutes = Math.max(0, grossMinutes - actualUnpaidBreakMinutes);
    const totalHours = Number((netMinutes / 60.0).toFixed(2));

    // ------------------------------------------------------------------------
    // Early Departure Evaluation
    // ------------------------------------------------------------------------
    let earlyDepartureMinutes = 0;
    let isEarlyDeparture = false;

    if (shiftVersion && shiftVersion.end_time && !attendanceRecord.is_unscheduled) {
      const workDateStr = formatDateToYMD(attendanceRecord.work_date);
      const isOvernight = Boolean(shiftVersion.is_overnight);
      const endWorkDateStr = isOvernight ? offsetDateYMD(workDateStr, 1) : workDateStr;
      const scheduledEnd = createDateTimeFromDateAndTime(endWorkDateStr, shiftVersion.end_time);

      if (scheduledEnd) {
        const earlyGrace = shiftVersion.early_departure_grace_minutes !== undefined && shiftVersion.early_departure_grace_minutes !== null
          ? Number(shiftVersion.early_departure_grace_minutes)
          : (policyVersion?.early_departure_grace_minutes !== undefined ? Number(policyVersion.early_departure_grace_minutes) : 0);

        const graceThresholdTime = scheduledEnd.getTime() - (earlyGrace * 60000);

        if (punchOutTime.getTime() < graceThresholdTime) {
          const diffMinutes = Math.floor((scheduledEnd.getTime() - punchOutTime.getTime()) / 60000);
          earlyDepartureMinutes = Math.max(0, diffMinutes);
          isEarlyDeparture = true;
        }
      }
    }

    // ------------------------------------------------------------------------
    // Overtime Evaluation: Compare Actual Net Duration with Scheduled Net Duration
    // ------------------------------------------------------------------------
    let overtimeMinutes = 0;
    let isOvertime = false;

    if (policyVersion && Number(policyVersion.overtime_enabled) === 1 && shiftVersion && scheduledNetMinutes > 0) {
      const excessNetMinutes = netMinutes - scheduledNetMinutes;
      const minQualifying = Number(policyVersion.overtime_min_qualifying_minutes || 60);
      const roundingMinutes = Number(policyVersion.overtime_rounding_minutes || 15);

      if (excessNetMinutes >= minQualifying) {
        overtimeMinutes = Math.floor(excessNetMinutes / roundingMinutes) * roundingMinutes;
        isOvertime = overtimeMinutes > 0;
      }
    }

    return {
      grossMinutes,
      unpaidBreakMinutes: actualUnpaidBreakMinutes,
      scheduledUnpaidBreakMinutes,
      scheduledNetMinutes,
      netMinutes,
      totalHours,
      earlyDepartureMinutes,
      isEarlyDeparture,
      earlyDepartureRequiresApproval: Boolean(isEarlyDeparture && policyVersion?.early_departure_requires_approval),
      overtimeMinutes,
      isOvertime,
      overtimeRequiresApproval: Boolean(isOvertime && policyVersion?.overtime_requires_approval),
      shiftName: shiftVersion?.shift_name || null,
      shiftCode: shiftVersion?.shift_code || null,
    };
  },
};
