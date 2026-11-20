// ============================================================================
// Service: node_backend/src/services/roster-validation.service.js
// Description: Validations for employee roster schedules.
//              Enforces minimum rest periods, detects duplicate assignments,
//              and handles overnight cross-midnight date attribution.
// ============================================================================

import { formatDateToYMD } from "./shift-validation.service.js";

export const rosterValidationService = {
  /**
   * Validate minimum rest between two consecutive shifts.
   * Accounts for cross-midnight overnight shifts.
   *
   * @param {Object} prevShift { work_date, end_time, is_overnight }
   * @param {Object} nextShift { work_date, start_time }
   * @param {number} minRestHours Minimum required rest in hours (e.g. 11)
   * @returns {Object} { valid: boolean, restHours: number, violation: string|null }
   */
  validateConsecutiveShiftRest(prevShift, nextShift, minRestHours = 11) {
    if (!prevShift || !nextShift) return { valid: true, restHours: null };

    const pDate = formatDateToYMD(prevShift.work_date);
    const nDate = formatDateToYMD(nextShift.work_date);

    // Calculate prev shift end datetime
    let prevEndIso = `${pDate}T${prevShift.end_time}Z`;
    const prevEndDate = new Date(prevEndIso);
    if (prevShift.is_overnight) {
      prevEndDate.setUTCDate(prevEndDate.getUTCDate() + 1);
    }

    // Calculate next shift start datetime
    const nextStartIso = `${nDate}T${nextShift.start_time}Z`;
    const nextStartDate = new Date(nextStartIso);

    const diffMs = nextStartDate.getTime() - prevEndDate.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);

    if (diffHours < minRestHours) {
      return {
        valid: false,
        restHours: Number(diffHours.toFixed(2)),
        requiredRestHours: minRestHours,
        violation: `Insufficient rest period: ${diffHours.toFixed(2)}h provided, ${minRestHours}h required between ${pDate} shift and ${nDate} shift`,
      };
    }

    return {
      valid: true,
      restHours: Number(diffHours.toFixed(2)),
      violation: null,
    };
  },

  /**
   * Verify an employee does not have conflicting shifts on the same work_date.
   */
  detectDateCollisions(entries) {
    const seen = new Set();
    const collisions = [];

    for (const e of entries) {
      const key = `${e.user_id}_${formatDateToYMD(e.work_date)}`;
      if (seen.has(key)) {
        collisions.push({
          user_id: e.user_id,
          work_date: formatDateToYMD(e.work_date),
          reason: "Duplicate roster entry for the same employee on the same work date",
        });
      } else {
        seen.add(key);
      }
    }

    return collisions;
  }
};
