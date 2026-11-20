// ============================================================================
// Service: node_backend/src/services/shift-validation.service.js
// Description: Core mathematical and business rule validation for shift timings,
//              breaks, and date intervals.
// ============================================================================

import { AppError } from "../middleware/errorHandler.js";

/**
 * Convert HH:MM:SS or HH:MM time string to total minutes from midnight.
 */
export function timeStringToMinutes(timeStr) {
  if (!timeStr) return null;
  const parts = String(timeStr).split(":");
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new AppError("Invalid time format. Expected HH:MM or HH:MM:SS (24-hour).", 400);
  }
  return hours * 60 + minutes;
}

/**
 * Validate and calculate shift duration.
 */
export function calculateShiftDuration(startTimeStr, endTimeStr, isOvernightParam) {
  const startMins = timeStringToMinutes(startTimeStr);
  const endMins = timeStringToMinutes(endTimeStr);

  let isOvernight = Boolean(isOvernightParam);
  let durationMinutes = 0;

  if (startMins === endMins) {
    throw new AppError("Shift start time and end time cannot be identical (zero duration).", 400);
  }

  if (startMins < endMins) {
    if (isOvernight) {
      // Overnight explicitly requested for same-day start < end? That is contradictory.
      throw new AppError("Shift has start_time < end_time but is flagged as overnight. Overnight shifts must cross midnight.", 400);
    }
    durationMinutes = endMins - startMins;
  } else {
    // startMins > endMins => crosses midnight
    isOvernight = true;
    durationMinutes = 1440 - startMins + endMins;
  }

  if (durationMinutes <= 0 || durationMinutes > 1440) {
    throw new AppError("Invalid shift duration. Must be between 1 minute and 1440 minutes (24 hours).", 400);
  }

  return { durationMinutes, isOvernight };
}

/**
 * Validate a set of breaks for a shift version.
 */
export function validateBreaks(breaks, shiftDurationMinutes) {
  if (!Array.isArray(breaks) || breaks.length === 0) {
    return [];
  }

  let totalBreakMinutes = 0;
  const sorted = [...breaks].sort((a, b) => a.start_offset_minutes - b.start_offset_minutes);

  for (let i = 0; i < sorted.length; i++) {
    const b = sorted[i];
    const start = Number(b.start_offset_minutes);
    const end = Number(b.end_offset_minutes);
    const duration = Number(b.duration_minutes ?? (end - start));

    if (isNaN(start) || start < 0) {
      throw new AppError(`Break '${b.break_name || i}': start_offset_minutes must be >= 0.`, 400);
    }
    if (isNaN(end) || end <= start) {
      throw new AppError(`Break '${b.break_name || i}': end_offset_minutes must be strictly greater than start_offset_minutes.`, 400);
    }
    if (duration !== (end - start)) {
      throw new AppError(`Break '${b.break_name || i}': duration_minutes (${duration}) does not match offset difference (${end - start}).`, 400);
    }
    if (end > shiftDurationMinutes) {
      throw new AppError(`Break '${b.break_name || i}': end offset (${end}m) exceeds total shift duration (${shiftDurationMinutes}m).`, 400);
    }

    // Check sibling overlap
    if (i > 0) {
      const prev = sorted[i - 1];
      if (start < Number(prev.end_offset_minutes)) {
        throw new AppError(
          `Break interval overlap: '${prev.break_name}' (${prev.start_offset_minutes}-${prev.end_offset_minutes}m) overlaps with '${b.break_name}' (${start}-${end}m).`,
          400
        );
      }
    }

    totalBreakMinutes += duration;
  }

  if (totalBreakMinutes >= shiftDurationMinutes) {
    throw new AppError(
      `Total break duration (${totalBreakMinutes}m) must be strictly less than total shift duration (${shiftDurationMinutes}m).`,
      400
    );
  }

  return sorted;
}

/**
 * Format any Date or date string to canonical YYYY-MM-DD.
 */
export function formatDateToYMD(val) {
  if (!val) return null;
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const s = String(val).trim();
  if (s.length >= 10 && /^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10);
  }
  const dt = new Date(val);
  if (!isNaN(dt.getTime())) {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return s;
}

/**
 * Validate effective date range.
 */
export function validateEffectiveDates(effectiveFrom, effectiveTo = null) {
  if (!effectiveFrom) {
    throw new AppError("effective_from is required (YYYY-MM-DD).", 400);
  }
  const fromYMD = formatDateToYMD(effectiveFrom);
  const toYMD = effectiveTo ? formatDateToYMD(effectiveTo) : null;

  if (toYMD && toYMD < fromYMD) {
    throw new AppError("effective_to cannot be earlier than effective_from.", 400);
  }

  return {
    effectiveFrom: fromYMD,
    effectiveTo: toYMD
  };
}
