import crypto from "crypto";
import attendanceRepository from "../repositories/attendance.repository.js";
import accountsRepository from "../repositories/accounts.repository.js";
import { realtimeManager } from "../utils/realtime.js";
import auditService from "./audit.service.js";
import storageService from "./storage.service.js";
import cloudinaryService from "./cloudinary.service.js";
import { config } from "../config/env.js";
import { AppError } from "../middleware/errorHandler.js";
import { db } from "../db/index.js";
import logger from "../utils/logger.js";
import { parsePagination, formatPaginationResponse } from "../utils/pagination.js";
import { shiftAttendanceService } from "./shift-attendance.service.js";
import { siteService } from "./site.service.js";
import { financialLeaveService } from "./financial-leave.service.js";

const APPROVAL_CLOSED_STATUS = "closed";
const REVIEW_ROLES_BY_REQUESTOR = {
  employee: ["manager", "hr", "admin", "superadmin"],
  manager: ["hr", "admin", "superadmin"],
  hr: ["admin", "superadmin"],
  admin: ["superadmin"],
};

function dbTimeToIso(dbVal) {
  if (!dbVal) return null;
  if (dbVal instanceof Date) {
    return dbVal.toISOString();
  }
  if (typeof dbVal === "string") {
    if (dbVal.includes("T") || dbVal.includes("Z")) {
      return new Date(dbVal).toISOString();
    }
    return `${dbVal.replace(" ", "T")}Z`;
  }
  return new Date(dbVal).toISOString();
}

export function getCompanyLocalDateString(date = new Date(), timezone = "Asia/Kolkata") {
  const d = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function getLocalDateString(date = new Date()) {
  return getCompanyLocalDateString(date);
}

function getYYYYMMDD(val) {
  if (!val) return "";
  if (val instanceof Date) {
    const year = val.getUTCFullYear();
    const month = String(val.getUTCMonth() + 1).padStart(2, "0");
    const day = String(val.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const str = String(val);
  if (str.includes("T")) {
    return str.split("T")[0];
  }
  return str.slice(0, 10);
}

function getYYYYMM(val) {
  const yyyymmdd = getYYYYMMDD(val);
  return yyyymmdd.slice(0, 7);
}

function fullName(u) {
  if (!u) return null;
  const name = `${u.first_name || ""} ${u.last_name || ""}`.trim();
  return name || u.username || null;
}

function toHours(punchIn, punchOut, status) {
  if (status !== "approved" || !punchIn || !punchOut) return 0;
  const inDate = new Date(dbTimeToIso(punchIn));
  const outDate = new Date(dbTimeToIso(punchOut));
  const diff = (outDate - inDate) / (1000 * 60 * 60);
  return Number(Math.max(0, diff).toFixed(2));
}

function distanceMeters(lat1, lng1, lat2, lng2) {
  const toRad = (value) => (Number(value) * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
    Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) *
    Math.sin(dLng / 2);
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function isOutsideAllottedArea(userId, latitude, longitude, tx = null) {
  const locations = await accountsRepository.findLocationsByUserId(userId, tx);
  const punchLat = Number(latitude);
  const punchLng = Number(longitude);

  if (!Number.isFinite(punchLat) || !Number.isFinite(punchLng)) {
    return false;
  }

  if (locations && locations.length > 0) {
    for (const loc of locations) {
      const officeLat = Number(loc.latitude);
      const officeLng = Number(loc.longitude);
      const radius = Number(loc.allowed_radius || 100);

      if (Number.isFinite(officeLat) && Number.isFinite(officeLng) && Number.isFinite(radius)) {
        const dist = distanceMeters(officeLat, officeLng, punchLat, punchLng);
        if (dist <= radius) {
          return false; // punch is inside this allowed area
        }
      }
    }
    return true; // outside all allowed areas
  }

  // Fallback to profile coordinates
  const profile = await accountsRepository.findProfileByUserId(userId, tx);
  const officeLat = Number(profile?.latitude);
  const officeLng = Number(profile?.longitude);
  const radius = Number(profile?.allowed_radius || 100);

  if (
    !Number.isFinite(officeLat) ||
    !Number.isFinite(officeLng) ||
    !Number.isFinite(radius)
  ) {
    return false;
  }

  return distanceMeters(officeLat, officeLng, punchLat, punchLng) > radius;
}

function overallAttendanceStatus(attendance) {
  if (attendance.punch_in_status === "rejected" || attendance.punch_out_status === "rejected") {
    return "rejected";
  }
  if (attendance.punch_in_status === "pending" || attendance.punch_out_status === "pending") {
    return "pending";
  }
  return "approved";
}

export function getExceptionCategory(comment, type) {
  const c = (comment || "").toLowerCase();
  if (c.includes("early departure") || c.includes("early_departure")) return "early_departure";
  if (c.includes("overtime")) return "overtime";
  return type === "in" ? "location_in" : "location_out";
}

async function approvalRouteForUser(userId, tx = null, tenantId = null) {
  const user = await accountsRepository.findById(userId, tx);
  const profile = await accountsRepository.findProfileByUserId(userId, tx);
  let effectiveTenantId = tenantId;
  if (effectiveTenantId == null) {
    const membership = await db.get(
      "SELECT tenant_id FROM workforce_user_tenant WHERE user_id = ? AND is_active = 1 LIMIT 1",
      [userId],
      tx
    );
    effectiveTenantId = membership?.tenant_id || 1;
  }
  const route = [];

  if (user?.role === "employee") {
    if (profile?.manager_id) {
      const manager = await db.get(
        `SELECT u.* FROM accounts_user u
         JOIN workforce_user_tenant w ON w.user_id = u.id AND w.tenant_id = ? AND w.is_active = 1
         WHERE u.id = ? AND u.is_active = 1 AND u.deleted_at IS NULL LIMIT 1`,
        [effectiveTenantId, profile.manager_id],
        tx
      );
      if (manager && Number(manager.id) !== Number(userId)) {
        return [manager];
      }
    }
    // Check if employee belongs to a team and route to that team's manager within the same tenant
    if (profile?.team_name) {
      const teamManager = await db.get(
        `SELECT u.* FROM accounts_user u 
         JOIN accounts_employeeprofile ep ON ep.user_id = u.id 
         JOIN workforce_user_tenant w ON w.user_id = u.id AND w.tenant_id = ? AND w.is_active = 1
         WHERE u.role = 'manager' AND ep.team_name = ? AND u.is_active = 1 AND u.deleted_at IS NULL AND u.id <> ? LIMIT 1`,
        [effectiveTenantId, profile.team_name, userId],
        tx
      );
      if (teamManager) {
        return [teamManager];
      }
    }
    // Fallback: If no manager is assigned or active, route to eligible HR / Admin / Superadmin within the same tenant
    const fallbackReviewers = await db.all(
      `SELECT u.* FROM accounts_user u
       JOIN workforce_user_tenant w ON w.user_id = u.id AND w.tenant_id = ? AND w.is_active = 1
       WHERE u.role IN ('hr', 'admin', 'superadmin') AND u.is_active=1 AND u.deleted_at IS NULL AND u.id <> ?`,
      [effectiveTenantId, userId],
      tx
    );
    return fallbackReviewers;
  }

  const routeRoles = REVIEW_ROLES_BY_REQUESTOR[user?.role] || [];
  if (routeRoles.includes("manager") && (profile?.manager_id || profile?.team_name)) {
    if (profile?.manager_id) {
      const manager = await db.get(
        `SELECT u.* FROM accounts_user u
         JOIN workforce_user_tenant w ON w.user_id = u.id AND w.tenant_id = ? AND w.is_active = 1
         WHERE u.id = ? AND u.is_active = 1 AND u.deleted_at IS NULL LIMIT 1`,
        [effectiveTenantId, profile.manager_id],
        tx
      );
      if (manager && Number(manager.id) !== Number(userId)) {
        route.push(manager);
      }
    } else if (profile?.team_name) {
      const teamManager = await db.get(
        `SELECT u.* FROM accounts_user u 
         JOIN accounts_employeeprofile ep ON ep.user_id = u.id 
         JOIN workforce_user_tenant w ON w.user_id = u.id AND w.tenant_id = ? AND w.is_active = 1
         WHERE u.role = 'manager' AND ep.team_name = ? AND u.is_active = 1 AND u.deleted_at IS NULL AND u.id <> ? LIMIT 1`,
        [effectiveTenantId, profile.team_name, userId],
        tx
      );
      if (teamManager) {
        route.push(teamManager);
      }
    }
  }

  const globalRoles = routeRoles.filter((role) => role !== "manager");
  if (globalRoles.length) {
    const placeholders = globalRoles.map(() => "?").join(",");
    const reviewers = await db.all(
      `SELECT u.* FROM accounts_user u
       JOIN workforce_user_tenant w ON w.user_id = u.id AND w.tenant_id = ? AND w.is_active = 1
       WHERE u.role IN (${placeholders}) AND u.is_active=1 AND u.deleted_at IS NULL AND u.id <> ?`,
      [effectiveTenantId, ...globalRoles, userId],
      tx
    );
    route.push(...reviewers);
  }

  const unique = new Map();
  for (const reviewer of route) {
    if (Number(reviewer.id) !== Number(userId)) {
      unique.set(Number(reviewer.id), reviewer);
    }
  }

  return [...unique.values()];
}

function approvalRouteLabel(employeeRole, managerName) {
  if (employeeRole === "employee") {
    return managerName
      ? "Team Manager"
      : "HR / Admin / Superadmin";
  }
  if (employeeRole === "manager") return "HR / Admin / Superadmin";
  if (employeeRole === "hr") return "Admin / Superadmin";
  if (employeeRole === "admin") return "Superadmin";
  return "Not applicable";
}

export const attendanceService = {
  async punchStatus(userId) {
    const todayStr = getCompanyLocalDateString();
    const onLeave = await db.get(
      "SELECT to_date FROM leave_leave WHERE user_id=? AND status='approved' AND ? BETWEEN from_date AND to_date LIMIT 1",
      [userId, todayStr]
    );

    const onLeaveInfo = onLeave ? {
      on_leave: true,
      leave_last_date: getYYYYMMDD(onLeave.to_date)
    } : {
      on_leave: false,
      leave_last_date: null
    };

    let scheduledShift = null;
    try {
      const tenantRow = await db.get(
        "SELECT tenant_id FROM workforce_user_tenant WHERE user_id = ? AND is_active = 1 LIMIT 1",
        [userId]
      );
      const tenantId = tenantRow?.tenant_id || 1;
      const resolved = await shiftAttendanceService.resolveShiftForPunchIn(tenantId, userId, new Date());
      if (resolved && resolved.shift) {
        scheduledShift = {
          shift_id: resolved.shift.shift_id,
          shift_name: resolved.shift.shift_name,
          shift_code: resolved.shift.shift_code,
          start_time: resolved.shift.start_time,
          end_time: resolved.shift.end_time,
          is_overnight: Boolean(resolved.shift.is_overnight),
          work_date: resolved.workDate,
          resolution_source: resolved.source,
          is_unscheduled: Boolean(resolved.isUnscheduled),
        };
      }
    } catch {
      // Non-fatal for status check
    }

    const latest = await attendanceRepository.findLatestAttendance(userId);

    const latestShiftInfo = latest ? {
      shift_version_id: latest.shift_version_id || null,
      roster_entry_id: latest.roster_entry_id || null,
      work_date: latest.work_date || latest.date || null,
      is_unscheduled: Boolean(latest.is_unscheduled),
      resolution_source: latest.resolution_source || null,
      punctuality_status: latest.punctuality_status || null,
      late_minutes: latest.late_minutes || 0,
      early_departure_minutes: latest.early_departure_minutes || 0,
      overtime_minutes: latest.overtime_minutes || 0,
    } : {};

    if (!latest || latest.status === "leave" || latest.punch_in_status === "leave" || !latest.punch_in_time) {
      return {
        is_punched_in: false,
        punch_in_time: null,
        punch_in_status: null,
        scheduled_shift: scheduledShift,
        ...latestShiftInfo,
        ...onLeaveInfo
      };
    }

    if (latest.punch_in_status === "rejected") {
      return {
        is_punched_in: false,
        punch_in_time: null,
        punch_in_status: null,
        scheduled_shift: scheduledShift,
        ...latestShiftInfo,
        ...onLeaveInfo
      };
    }

    if (latest.punch_out_status === "pending") {
      return {
        is_punched_in: false,
        is_punch_out_pending: true,
        punch_in_time: dbTimeToIso(latest.punch_in_time),
        punch_in_status: latest.punch_in_status,
        punch_out_time: dbTimeToIso(latest.punch_out_time),
        punch_out_status: latest.punch_out_status,
        scheduled_shift: scheduledShift,
        ...latestShiftInfo,
        ...onLeaveInfo
      };
    }

    if (latest.punch_out_time === null && latest.punch_in_time !== null) {
      return {
        is_punched_in: true,
        punch_in_time: dbTimeToIso(latest.punch_in_time),
        punch_in_status: latest.punch_in_status,
        scheduled_shift: scheduledShift,
        ...latestShiftInfo,
        ...onLeaveInfo
      };
    }

    return {
      is_punched_in: false,
      punch_in_time: null,
      punch_in_status: null,
      scheduled_shift: scheduledShift,
      ...latestShiftInfo,
      ...onLeaveInfo
    };
  },

  getUploadSignature(userId) {
    if (!config.cloudinaryCloudName || !config.cloudinaryApiKey || !config.cloudinaryApiSecret) {
      throw new AppError("Cloudinary storage service is not configured.", 500);
    }
    const date = new Date();
    const folder = `attendance/${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}`;
    const uuid = crypto.randomUUID();
    const params = {
      folder,
      public_id: uuid,
    };
    const signatureData = cloudinaryService.generateUploadSignature(params);
    return {
      ...signatureData,
      folder,
      public_id: uuid,
      upload_url: `https://api.cloudinary.com/v1_1/${config.cloudinaryCloudName}/image/upload`,
    };
  },

  async punchIn(userId, latitude, longitude, file, actor, directPath = null, accuracy = null) {
    const relativePath = directPath || (file ? await storageService.store(file, "attendance") : null);
    if (!relativePath) {
      throw new AppError("Photo is required for attendance punch", 400);
    }

    try {
      const result = await db.transaction(async (tx) => {
        // 1. Acquire exclusive lock on the user record in accounts_user to serialize all attendance operations
        const user = await db.get("SELECT id, is_active FROM accounts_user WHERE id = ? FOR UPDATE", [userId], tx);
        if (!user || !user.is_active) {
          throw new AppError("Active user account required", 400);
        }

        // Validate coordinates and GPS accuracy (BUG-A10: 100m maximum acceptable accuracy tolerance)
        if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
          throw new AppError("Invalid GPS coordinates. Finite latitude and longitude are required.", 400);
        }
        if (accuracy != null && Number.isFinite(Number(accuracy)) && Number(accuracy) > 100) {
          throw new AppError(`GPS accuracy is too low (${Math.round(Number(accuracy))}m). A fix within 100m is required.`, 400);
        }

        // 2. Check approved leave under lock
        const todayStr = getCompanyLocalDateString();
        const onLeave = await db.get(
          "SELECT to_date FROM leave_leave WHERE user_id=? AND status='approved' AND ? BETWEEN from_date AND to_date LIMIT 1",
          [userId, todayStr],
          tx
        );
        if (onLeave) {
          const lastDate = getYYYYMMDD(onLeave.to_date);
          throw new AppError(`You cannot punch in today as you are on approved leave. You can punch in after ${lastDate}`, 400);
        }

        // 3. Check latest attendance for pending punch-out under lock
        const latest = await db.get(
          "SELECT punch_out_status FROM attendance_attendance WHERE user_id=? ORDER BY date DESC, punch_in_time DESC LIMIT 1",
          [userId],
          tx
        );
        if (latest && latest.punch_out_status === "pending") {
          throw new AppError("Cannot punch in while punch out is pending approval", 400);
        }

        // 4. Check for existing open attendance under serialized user lock
        const open = await attendanceRepository.findOpenAttendance(userId, tx, false);
        if (open) {
          throw new AppError("Already punched in", 400);
        }

        const punchInOutside = await isOutsideAllottedArea(userId, latitude, longitude, tx);
        let reviewers = [];
        if (punchInOutside) {
          reviewers = await approvalRouteForUser(userId, tx);
          if (!reviewers || reviewers.length === 0) {
            throw new AppError("Out-of-geofence punch requires approval, but no eligible reviewers (manager, HR, or admin) are available.", 400);
          }
        }
        const needsApproval = Boolean(punchInOutside);

        const punchInStatus = needsApproval ? "pending" : "approved";
        const attendanceStatus = needsApproval ? "pending" : "approved";

        const now = new Date();
        const dateStr = getCompanyLocalDateString(now);

        // 5. Resolve Tenant ID
        const tenantRow = await db.get(
          "SELECT tenant_id FROM workforce_user_tenant WHERE user_id = ? AND is_active = 1 LIMIT 1",
          [userId],
          tx
        );
        const tenantId = tenantRow?.tenant_id || 1;

        // 6. Tiered Shift Resolution & Punctuality Calculation
        const resolvedShift = await shiftAttendanceService.resolveShiftForPunchIn(tenantId, userId, now, tx);
        const punctuality = shiftAttendanceService.evaluatePunchInPunctuality(resolvedShift, now);
        const workDate = resolvedShift.workDate || dateStr;
        const siteId = await siteService.getEmployeeSiteId(tenantId, userId, workDate, tx);

        const attId = await attendanceRepository.insertAttendance({
          tenant_id: tenantId,
          site_id: siteId,
          date: dateStr,
          work_date: workDate,
          punch_in_time: now,
          punch_in_photo: relativePath,
          punch_in_lat: Number(latitude),
          punch_in_lng: Number(longitude),
          punch_in_outside: Number(punchInOutside),
          geofence_status: punchInOutside ? "outside" : "inside",
          punch_in_status: punchInStatus,
          punch_out_status: "approved",
          status: attendanceStatus,
          user_id: userId,
          shift_version_id: resolvedShift.shiftVersionId || null,
          roster_entry_id: resolvedShift.rosterEntryId || null,
          is_unscheduled: resolvedShift.isUnscheduled ? 1 : 0,
          resolution_source: resolvedShift.source,
          punctuality_status: punctuality.punctualityStatus,
          late_minutes: punctuality.lateMinutes,
        }, tx);

        if (needsApproval) {
          await attendanceRepository.updateAttendance(attId, {
            punch_in_status: punchInStatus,
            status: attendanceStatus,
            is_outside_location: Number(punchInOutside)
          }, tx);

          const approvalRows = reviewers.map((reviewer) => ({
            role: reviewer.role,
            status: "pending",
            comment: null,
            created_at: now,
            approved_by_id: reviewer.id,
            attendance_id: attId,
            type: "in"
          }));
          await attendanceRepository.insertApprovalsBatch(approvalRows, tx);
        }

        return {
          message: needsApproval ? "Punch In submitted for approval" : "Punch In Successful",
          outside_location: punchInOutside,
          requires_approval: needsApproval,
          status: attendanceStatus,
          punch_in_status: punchInStatus,
          punch_in_time: dbTimeToIso(now),
          // Additive shift metadata
          work_date: workDate,
          shift_name: resolvedShift.shift?.shift_name || null,
          shift_code: resolvedShift.shift?.shift_code || null,
          shift_version_id: resolvedShift.shiftVersionId || null,
          roster_entry_id: resolvedShift.rosterEntryId || null,
          is_unscheduled: Boolean(resolvedShift.isUnscheduled),
          resolution_source: resolvedShift.source,
          punctuality_status: punctuality.punctualityStatus,
          late_minutes: punctuality.lateMinutes,
          is_overnight: Boolean(resolvedShift.shift?.is_overnight),
        };
      });

      realtimeManager.broadcast(
        "attendance_update",
        { actorId: actor.id },
        { targetRoles: ["hr", "admin", "superadmin", "manager"], targetUserIds: [Number(userId)] }
      );
      return result;
    } catch (err) {
      if (file && !directPath) {
        try {
          await storageService.delete(relativePath);
        } catch (cleanupErr) {
          logger.error("Failed to clean up uploaded asset %s during punchIn rollback: %s", relativePath, cleanupErr.message);
        }
      }
      throw err;
    }
  },

  async punchOut(userId, latitude, longitude, file, actor, directPath = null, accuracy = null) {
    const relativePath = directPath || (file ? await storageService.store(file, "attendance") : null);
    if (!relativePath) {
      throw new AppError("Photo is required for attendance punch", 400);
    }

    try {
      const result = await db.transaction(async (tx) => {
        // 1. Acquire exclusive lock on the user record in accounts_user to serialize attendance operations
        const user = await db.get("SELECT id FROM accounts_user WHERE id = ? FOR UPDATE", [userId], tx);
        if (!user) {
          throw new AppError("User not found", 404);
        }

        // Validate coordinates and GPS accuracy (BUG-A10: 100m maximum acceptable accuracy tolerance)
        if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
          throw new AppError("Invalid GPS coordinates. Finite latitude and longitude are required.", 400);
        }
        if (accuracy != null && Number.isFinite(Number(accuracy)) && Number(accuracy) > 100) {
          throw new AppError(`GPS accuracy is too low (${Math.round(Number(accuracy))}m). A fix within 100m is required.`, 400);
        }

        // 2. Locate open attendance record
        const att = await attendanceRepository.findOpenAttendance(userId, tx, false);
        if (!att) {
          throw new AppError("Punch in first", 400);
        }

        const punchOutOutside = await isOutsideAllottedArea(userId, latitude, longitude, tx);
        const now = new Date();
        const outEval = await shiftAttendanceService.evaluatePunchOut(att, now, tx);

        let reviewers = [];
        const policyApprovalRequired = Boolean(outEval.earlyDepartureRequiresApproval || outEval.overtimeRequiresApproval);
        if (punchOutOutside || policyApprovalRequired) {
          reviewers = await approvalRouteForUser(userId, tx);
          if (punchOutOutside && (!reviewers || reviewers.length === 0)) {
            throw new AppError("Out-of-geofence punch-out requires approval, but no eligible reviewers (manager, HR, or admin) are available.", 400);
          }
        }

        // Geofence location approval: affects punch_out_status and overall punch approval
        const geofenceNeedsApproval = Boolean(punchOutOutside);
        const punchOutStatus = geofenceNeedsApproval ? "pending" : "approved";
        const nextAttendance = {
          ...att,
          punch_out_status: punchOutStatus,
        };
        const finalStatus = overallAttendanceStatus(nextAttendance);

        let punctualityStatus = att.punctuality_status || "on_time";
        if (outEval.isEarlyDeparture && punctualityStatus !== "late") {
          punctualityStatus = "early_departure";
        }

        // 3. Atomic conditional update: punch_out_time must still be NULL
        const updateResult = await attendanceRepository.updateAttendance(att.id, {
          punch_out_time: now,
          punch_out_photo: relativePath,
          punch_out_lat: Number(latitude),
          punch_out_lng: Number(longitude),
          punch_out_outside: Number(punchOutOutside),
          punch_out_status: punchOutStatus,
          status: finalStatus,
          is_outside_location: Number(Boolean(att.punch_in_outside) || punchOutOutside),
          total_hours: outEval.totalHours,
          early_departure_minutes: outEval.earlyDepartureMinutes,
          overtime_minutes: outEval.overtimeMinutes,
          punctuality_status: punctualityStatus,
        }, tx, "punch_out_time IS NULL");

        if (updateResult.changes === 0) {
          throw new AppError("Punch in first", 400);
        }

        // Geofence exception approval request
        if (punchOutOutside && reviewers.length > 0) {
          const approvalRows = reviewers.map((reviewer) => ({
            role: reviewer.role,
            status: "pending",
            comment: null,
            created_at: now,
            approved_by_id: reviewer.id,
            attendance_id: att.id,
            type: "out"
          }));
          await attendanceRepository.insertApprovalsBatch(approvalRows, tx);
        }

        // Manager policy approvals (decoupled from physical punch status)
        if (outEval.earlyDepartureRequiresApproval && reviewers.length > 0) {
          const earlyApprovalRows = reviewers.map((reviewer) => ({
            role: reviewer.role,
            status: "pending",
            comment: `Early departure by ${outEval.earlyDepartureMinutes} minutes`,
            created_at: now,
            approved_by_id: reviewer.id,
            attendance_id: att.id,
            type: "out"
          }));
          await attendanceRepository.insertApprovalsBatch(earlyApprovalRows, tx);
        }

        if (outEval.overtimeRequiresApproval && reviewers.length > 0) {
          const overtimeApprovalRows = reviewers.map((reviewer) => ({
            role: reviewer.role,
            status: "pending",
            comment: `Overtime of ${outEval.overtimeMinutes} minutes`,
            created_at: now,
            approved_by_id: reviewer.id,
            attendance_id: att.id,
            type: "out"
          }));
          await attendanceRepository.insertApprovalsBatch(overtimeApprovalRows, tx);
        }

        const updated = await attendanceRepository.findAttendanceById(att.id, tx);
        const requiresApproval = Boolean(geofenceNeedsApproval || policyApprovalRequired);

        return {
          message: requiresApproval ? "Punch Out submitted for approval" : "Punch Out Successful",
          outside_location: punchOutOutside,
          requires_approval: requiresApproval,
          requires_location_approval: geofenceNeedsApproval,
          requires_manager_approval: policyApprovalRequired,
          final_status: updated.status,
          punch_in_status: updated.punch_in_status,
          punch_out_status: updated.punch_out_status,
          work_hours: outEval.totalHours,
          punch_out_time: dbTimeToIso(now),
          // Additive shift metadata
          total_hours: outEval.totalHours,
          gross_minutes: outEval.grossMinutes,
          net_minutes: outEval.netMinutes,
          unpaid_break_minutes: outEval.unpaidBreakMinutes,
          scheduled_net_minutes: outEval.scheduledNetMinutes,
          early_departure_minutes: outEval.earlyDepartureMinutes,
          is_early_departure: outEval.isEarlyDeparture,
          overtime_minutes: outEval.overtimeMinutes,
          is_overtime: outEval.isOvertime,
          shift_name: outEval.shiftName,
          shift_code: outEval.shiftCode,
          resolution_source: att.resolution_source || null,
          is_unscheduled: Boolean(att.is_unscheduled),
        };
      });

      realtimeManager.broadcast(
        "attendance_update",
        { actorId: actor.id },
        { targetRoles: ["hr", "admin", "superadmin", "manager"], targetUserIds: [Number(userId)] }
      );
      return result;
    } catch (err) {
      if (file && !directPath) {
        try {
          await storageService.delete(relativePath);
        } catch (cleanupErr) {
          logger.error("Failed to clean up uploaded asset %s during punchOut rollback: %s", relativePath, cleanupErr.message);
        }
      }
      throw err;
    }
  },

  async approvals(userId, role, query = {}, tenantId = 1) {
    if (!["manager", "hr", "admin", "superadmin"].includes(role)) {
      return formatPaginationResponse([], 0, 1, 50, { records: [], summary: {} });
    }

    const siteScope = await siteService.getSiteScope(tenantId, { id: userId, role }, query.site_id || null);
    const rows = await attendanceRepository.findApprovalsForReviewer(userId, role);

    const records = [];
    for (const r of rows) {
      if (Number(r.tenant_id) !== Number(tenantId)) continue;
      const effectiveSite = r.site_id == null
        ? await siteService.getEmployeeSiteId(tenantId, r.employee_id, getYYYYMMDD(r.attendance_date))
        : Number(r.site_id);
      if (siteScope.unassigned ? effectiveSite !== null : (siteScope.siteIds && !siteScope.siteIds.includes(effectiveSite))) continue;
      const employeeName = `${r.employee_first_name || ""} ${r.employee_last_name || ""}`.trim() || r.employee_username;
      const managerName = r.manager_username ? `${r.manager_first_name || ""} ${r.manager_last_name || ""}`.trim() || r.manager_username : null;
      const reviewStatus = r.type === "in" ? r.punch_in_status : r.punch_out_status;
      const outside = r.type === "in" ? Boolean(r.punch_in_outside) : Boolean(r.punch_out_outside);
      const latitude = r.type === "in" ? r.punch_in_lat : r.punch_out_lat;
      const longitude = r.type === "in" ? r.punch_in_lng : r.punch_out_lng;

      const category = getExceptionCategory(r.comment, r.type);
      let reviewLabel = r.type === "in" ? "Punch In" : "Punch Out";
      if (category === "early_departure") reviewLabel = "Early Departure";
      if (category === "overtime") reviewLabel = "Overtime";

      records.push({
        approval_id: r.id,
        attendance_id: r.attendance_id,
        employee: r.employee_username,
        employee_name: employeeName,
        employee_email: r.employee_email,
        employee_role: r.employee_role,
        team_name: r.team_name,
        site_id: effectiveSite,
        reporting_manager: managerName,
        date: r.attendance_date,
        review_type: r.type,
        exception_category: category,
        review_label: reviewLabel,
        approval_status: r.status,
        review_status: reviewStatus,
        attendance_status: r.attendance_status,
        approval_route: approvalRouteLabel(r.employee_role, managerName),
        is_outside: outside,
        location_label: outside ? "Outside allotted area" : "Inside allotted area",
        latitude,
        longitude,
        punch_in_time: dbTimeToIso(r.punch_in_time),
        punch_out_time: dbTimeToIso(r.punch_out_time),
        punch_in_status: r.punch_in_status,
        punch_out_status: r.punch_out_status,
        punch_in_photo: storageService.getUrl(r.punch_in_photo),
        punch_out_photo: storageService.getUrl(r.punch_out_photo),
        work_hours: toHours(r.punch_in_time, r.punch_out_time, r.attendance_status),
        comment: r.comment,
        final_decision: r.resolved_status || null,
        action_at: dbTimeToIso(r.resolved_action_at),
        action_by_name: r.decider_name || null,
        can_approve: r.status === "pending" && ((category === "early_departure" || category === "overtime") || reviewStatus === "pending") && Number(r.employee_id) !== Number(userId),
      });
    }

    // Deduplicate records to show each exception exactly once, prioritizing pending/active decisions
    const getStatusPriority = (status) => {
      if (status === "approved" || status === "rejected") return 3;
      if (status === "pending") return 2;
      return 1; // "closed"
    };

    const uniqueMap = new Map();
    for (const record of records) {
      const key = `${record.attendance_id}-${record.review_type}-${record.exception_category}`;
      const existing = uniqueMap.get(key);
      if (!existing || getStatusPriority(record.approval_status) > getStatusPriority(existing.approval_status)) {
        uniqueMap.set(key, record);
      }
    }
    const uniqueRecords = [...uniqueMap.values()];

    let filteredRecords = uniqueRecords;
    if (query.status && query.status !== "all") {
      filteredRecords = filteredRecords.filter((r) => r.approval_status === query.status);
    }
    if (query.type && query.type !== "all") {
      if (query.type === "in" || query.type === "location_in") {
        filteredRecords = filteredRecords.filter((r) => r.review_type === "in" && r.exception_category === "location_in");
      } else if (query.type === "out" || query.type === "location_out") {
        filteredRecords = filteredRecords.filter((r) => r.review_type === "out" && r.exception_category === "location_out");
      } else {
        filteredRecords = filteredRecords.filter((r) => r.exception_category === query.type);
      }
    }
    if (query.search && query.search.trim()) {
      const q = query.search.trim().toLowerCase();
      filteredRecords = filteredRecords.filter((item) =>
        [
          item.employee,
          item.employee_name,
          item.employee_email,
          item.employee_role,
          item.team_name,
          item.reporting_manager,
          item.review_label,
          item.location_label,
          item.action_by_name,
          item.approval_route,
          item.comment,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q))
      );
    }

    const defaultLimit = Number(query.limit) > 0 ? Number(query.limit) : 15;
    const { page, limit, offset } = parsePagination(query, defaultLimit, 100);
    const total = filteredRecords.length;
    const paginatedRecords = filteredRecords.slice(offset, offset + limit);

    return formatPaginationResponse(paginatedRecords, total, page, limit, {
      records: paginatedRecords,
      all_records: filteredRecords,
      summary: {
        scope_label: role === "manager"
          ? "Direct-report attendance exceptions"
          : role === "superadmin"
            ? "All attendance exception approvals"
            : "Assigned attendance exception approvals",
        total_items: uniqueRecords.length,
        pending_items: uniqueRecords.filter((r) => r.approval_status === "pending").length,
        approved_items: uniqueRecords.filter((r) => r.approval_status === "approved").length,
        rejected_items: uniqueRecords.filter((r) => r.approval_status === "rejected").length,
        closed_items: uniqueRecords.filter((r) => r.approval_status === APPROVAL_CLOSED_STATUS).length,
        actionable_items: uniqueRecords.filter((r) => r.can_approve).length,
      },
    });
  },

  async approvalAction(approvalId, status, comment = "", actor, tenantId = 1) {
    const response = await db.transaction(async (tx) => {
      // 1. Lock the approval row to serialize concurrent reviews
      const ap = await attendanceRepository.findApprovalById(approvalId, tx, true, tenantId);
      if (!ap) {
        throw new AppError("Approval not found", 404);
      }
      if (Number(ap.employee_id) === Number(actor.id)) {
        throw new AppError("You cannot approve your own exception request", 403);
      }
      if (actor.role !== "superadmin") {
        let isAuthorized = Number(ap.approved_by_id) === Number(actor.id);
        if (!isAuthorized && ["admin", "hr"].includes(actor.role)) {
          isAuthorized = true;
        }
        if (!isAuthorized && actor.role === "manager") {
          const employeeProfile = await accountsRepository.findProfileByUserId(ap.employee_id, tx);
          const managerProfile = await accountsRepository.findProfileByUserId(actor.id, tx);
          if (
            (employeeProfile && Number(employeeProfile.manager_id) === Number(actor.id)) ||
            (employeeProfile?.team_name && managerProfile?.team_name && employeeProfile.team_name === managerProfile.team_name)
          ) {
            isAuthorized = true;
          }
        }
        if (!isAuthorized) {
          throw new AppError("This approval is not assigned to you", 403);
        }
      }
      await siteService.ensureEmployeeVisible(tenantId, actor, ap.employee_id, {
        requireDirectReport: actor.role === "manager",
        workDate: getYYYYMMDD(ap.attendance_date) || undefined,
      });
      if (ap.status !== "pending") {
        throw new AppError("This approval item is already closed", 400);
      }

      const now = new Date();

      // 2. Update this specific approval row atomically (verifying pending)
      const updateResult = await attendanceRepository.updateApproval(ap.id, {
        status,
        comment,
        action_at: now
      }, tx, true);

      if (updateResult.changes === 0) {
        throw new AppError("This approval item is already closed", 400);
      }

      // 3. Log administrative action
      await auditService.log(
        actor,
        `attendance_approval_${status}`,
        ap.attendance_id.toString(),
        { approval_id: approvalId, review_type: ap.type, comment },
        null,
        tx
      );

      const category = getExceptionCategory(ap.comment, ap.type);
      const isPolicyException = category === "early_departure" || category === "overtime";

      // 4. Handle rejection flow (reverts punch but keeps approval records)
      if (status === "rejected") {
        if (isPolicyException) {
          // Rejecting early departure or overtime: do NOT wipe punch out or photo!
          await attendanceRepository.updatePendingApprovalsForAttendanceExcept(
            ap.attendance_id,
            ap.type,
            APPROVAL_CLOSED_STATUS,
            `Closed (${category}) after rejection by ${fullName(actor)}`,
            actor.id,
            ap.id,
            tx,
            category
          );

          const att = await attendanceRepository.findAttendanceById(ap.attendance_id, tx);
          return {
            message: `${category === "early_departure" ? "Early departure" : "Overtime"} rejected successfully`,
            attendance_status: att.status,
            review_type: ap.type,
            review_status: "rejected",
            work_hours: toHours(att.punch_in_time, att.punch_out_time, att.status),
          };
        } else if (ap.type === "in") {
          // Rejecting punch in: update status to rejected and close others instead of deleting
          await attendanceRepository.updateAttendance(ap.attendance_id, {
            punch_in_status: "rejected",
            status: "rejected"
          }, tx);

          // Close other pending approvals for this punch-in
          await attendanceRepository.updatePendingApprovalsForAttendanceExcept(
            ap.attendance_id,
            "in",
            APPROVAL_CLOSED_STATUS,
            `Closed (location_in) after rejection by ${fullName(actor)}`,
            actor.id,
            ap.id,
            tx,
            "location_in"
          );

          return {
            message: "Punch In rejected successfully",
            attendance_status: "rejected",
            review_type: "in",
            review_status: "rejected",
            work_hours: 0,
          };
        } else {
          // Rejecting punch out: reset punch-out fields to null (BUG-05: preserve photo for audit trail)
          await attendanceRepository.updateAttendance(ap.attendance_id, {
            punch_out_time: null,
            punch_out_photo: null,
            punch_out_lat: null,
            punch_out_lng: null,
            punch_out_outside: 0,
            punch_out_status: "rejected",
            status: "rejected"
          }, tx);

          // Close other pending approvals for this punch-out
          await attendanceRepository.updatePendingApprovalsForAttendanceExcept(
            ap.attendance_id,
            "out",
            APPROVAL_CLOSED_STATUS,
            `Closed (location_out) after rejection by ${fullName(actor)}`,
            actor.id,
            ap.id,
            tx,
            "location_out"
          );

          const updated = await attendanceRepository.findAttendanceById(ap.attendance_id, tx);
          return {
            message: "Punch Out rejected and attendance record reset to active punch in successfully",
            attendance_status: updated.status,
            review_type: "out",
            review_status: updated.punch_out_status,
            work_hours: 0,
          };
        }
      }

      // 5. Handle approved flow
      if (isPolicyException) {
        await attendanceRepository.updatePendingApprovalsForAttendanceExcept(
          ap.attendance_id,
          ap.type,
          APPROVAL_CLOSED_STATUS,
          `Closed (${category}) after ${status} by ${fullName(actor)}`,
          actor.id,
          ap.id,
          tx,
          category
        );
      } else if (ap.type === "in") {
        await attendanceRepository.updateAttendance(ap.attendance_id, { punch_in_status: status }, tx);
        await attendanceRepository.updatePendingApprovalsForAttendanceExcept(
          ap.attendance_id,
          "in",
          APPROVAL_CLOSED_STATUS,
          `Closed (location_in) after ${status} by ${fullName(actor)}`,
          actor.id,
          ap.id,
          tx,
          "location_in"
        );
      } else {
        await attendanceRepository.updateAttendance(ap.attendance_id, { punch_out_status: status }, tx);
        await attendanceRepository.updatePendingApprovalsForAttendanceExcept(
          ap.attendance_id,
          "out",
          APPROVAL_CLOSED_STATUS,
          `Closed (location_out) after ${status} by ${fullName(actor)}`,
          actor.id,
          ap.id,
          tx,
          "location_out"
        );
      }

      // Re-calculate and update overall attendance status
      const att = await attendanceRepository.findAttendanceById(ap.attendance_id, tx);
      const finalStatus = overallAttendanceStatus(att);
      await attendanceRepository.updateAttendance(ap.attendance_id, { status: finalStatus }, tx);

      const updated = await attendanceRepository.findAttendanceById(ap.attendance_id, tx);

      return {
        message: `${isPolicyException ? (category === "early_departure" ? "Early Departure" : "Overtime") : ("Punch " + (ap.type === "in" ? "In" : "Out"))} ${status} successfully`,
        user_id: ap.user_id,
        attendance_status: updated.status,
        review_type: ap.type,
        review_status: ap.type === "in" ? updated.punch_in_status : updated.punch_out_status,
        work_hours: toHours(updated.punch_in_time, updated.punch_out_time, updated.status),
      };
    });

    realtimeManager.broadcast(
      "attendance_update",
      { actorId: actor.id, userId: response.user_id, status: response.attendance_status },
      { targetRoles: ["hr", "admin", "superadmin", "manager"], targetUserIds: [Number(response.user_id)] }
    );
    return response;
  },

  async dashboard(userId, tenantId = 1) {
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const fromDate = since.toISOString().slice(0, 10);

    const { totalHours, daily } = await this.attendanceStatusSummary(userId, fromDate);
    const leaveBalance = await financialLeaveService.getBalance(userId, tenantId);
    const leavesTaken = leaveBalance.leaves_used;

    return {
      total_working_hours: totalHours,
      leave_balance: leaveBalance.available_balance,
      leaves_taken: leavesTaken,
      pending_approvals: await attendanceRepository.getPendingApprovalsCount(userId),
      total_leaves_allocated: leaveBalance.base_entitlement,
      daily_work: daily,
    };
  },

  async hrDashboard(userId, role, tenantId = 1) {
    if (role !== "hr" && role !== "admin" && role !== "superadmin") {
      throw new AppError("Not allowed", 403);
    }
    const effectiveTenantId = Number(tenantId || 1);
    const own = await this.dashboard(userId, effectiveTenantId);

    const totalPeopleRow = await db.get(
      `SELECT COUNT(*) c FROM accounts_user u
       JOIN workforce_user_tenant w ON w.user_id = u.id AND w.tenant_id = ? AND w.is_active = 1
       WHERE u.role IN ('employee','manager') AND u.is_active=1 AND u.deleted_at IS NULL`,
      [effectiveTenantId]
    );
    const presentRow = await db.get(
      `SELECT COUNT(DISTINCT a.user_id) c FROM attendance_attendance a
       JOIN workforce_user_tenant w ON w.user_id = a.user_id AND w.tenant_id = ? AND w.is_active = 1
       WHERE a.tenant_id = ? AND a.date=CURDATE() AND a.status NOT IN ('rejected', 'leave')`,
      [effectiveTenantId, effectiveTenantId]
    );
    const pendingLeaveRow = await db.get(
      "SELECT COUNT(*) c FROM leave_leave WHERE tenant_id = ? AND status='pending'",
      [effectiveTenantId]
    );
    const pendingAttendanceRow = await db.get(
      `SELECT COUNT(*) c FROM attendance_attendanceapproval aa
       JOIN attendance_attendance a ON a.id = aa.attendance_id
       WHERE a.tenant_id = ? AND aa.status='pending'`,
      [effectiveTenantId]
    );

    const recentRows = await db.all(
      `SELECT a.*, u.username as employee, u.role 
       FROM attendance_attendance a 
       JOIN accounts_user u ON u.id=a.user_id 
       JOIN workforce_user_tenant w ON w.user_id = u.id AND w.tenant_id = ? AND w.is_active = 1
       WHERE a.tenant_id = ? AND u.deleted_at IS NULL AND a.status <> 'rejected'
       ORDER BY a.date DESC, a.punch_in_time DESC LIMIT 10`,
      [effectiveTenantId, effectiveTenantId]
    );

    const recentPeopleAttendance = recentRows.map((r) => ({
      employee: r.employee,
      role: r.role,
      date: r.date,
      status: r.status,
      work_hours: toHours(r.punch_in_time, r.punch_out_time, r.status)
    }));

    return {
      own_summary: own,
      people_summary: {
        total_people: Number(totalPeopleRow?.c || 0),
        present_today: Number(presentRow?.c || 0),
        pending_leave_requests: Number(pendingLeaveRow?.c || 0),
        pending_attendance_approvals: Number(pendingAttendanceRow?.c || 0),
        recent_people_attendance: recentPeopleAttendance
      }
    };
  },

  async managerDashboard(userId, role, tenantId = 1) {
    if (role !== "manager" && role !== "superadmin") {
      throw new AppError("Not allowed", 403);
    }

    const own = await this.dashboard(userId, tenantId);
    const teamUsers = await attendanceRepository.findTeamActiveUsers(userId);
    const teamIds = teamUsers.map((u) => u.id);

    const presentCount = await attendanceRepository.getTeamAttendanceTodayCount(teamIds);
    const teamWeekRows = await attendanceRepository.getTeamAttendanceInLast7Days(teamIds);

    const teamTotalHours = teamWeekRows.reduce((sum, r) => sum + toHours(r.punch_in_time, r.punch_out_time, r.status), 0);
    const pendingAttendance = await attendanceRepository.getPendingAttendanceApprovalsCount(userId);
    const pendingLeave = await attendanceRepository.getPendingLeaveApprovalsCount(userId);

    const recentTeamAttendance = teamWeekRows.slice(0, 8).map((r) => ({
      employee: teamUsers.find((u) => u.id === r.user_id)?.username || "--",
      date: r.date,
      status: r.status,
      work_hours: toHours(r.punch_in_time, r.punch_out_time, r.status),
    }));

    return {
      own_summary: own,
      team_summary: {
        team_members: teamUsers.length,
        present_today: presentCount,
        team_total_hours: Number(teamTotalHours.toFixed(2)),
        pending_attendance_approvals: pendingAttendance,
        pending_leave_approvals: pendingLeave,
        recent_team_attendance: recentTeamAttendance,
      },
    };
  },

  async teamAnalytics(managerId, daysQuery, role, tenantId = 1, siteFilter = null) {
    if (role !== "manager" && role !== "hr" && role !== "admin" && role !== "superadmin") {
      throw new AppError("Not allowed", 403);
    }
    const days = [7, 30, 90].includes(Number(daysQuery)) ? Number(daysQuery) : 30;

    // TA-AN01: Role-based employee visibility rules
    // Manager & HR: see all active Employees and Managers (exclude HR, Admin, Superadmin for Manager; exclude Admin, Superadmin for HR)
    // Admin & Superadmin: see all active Employees, Managers, and HR (exclude Admin, Superadmin)
    let allowedRoles = [];
    if (role === "manager" || role === "hr") {
      allowedRoles = ["employee", "manager"];
    } else if (role === "admin" || role === "superadmin") {
      allowedRoles = ["employee", "manager", "hr"];
    }

    const todayStr = getYYYYMMDD(new Date());
    const windowEndStr = todayStr;
    const windowStartDate = new Date();
    windowStartDate.setDate(windowStartDate.getDate() - (days - 1));
    const windowStartStr = getYYYYMMDD(windowStartDate);

    // TA-AN09: Site-level authorization and filtering
    const siteScope = await siteService.getSiteScope(tenantId, { id: managerId, role }, siteFilter);

    // TA-AN01: Single-company scope with workforce_user_tenant
    const whereConditions = [
      "u.deleted_at IS NULL",
      "u.is_active = 1",
      "ep.is_active_employee = 1",
      `u.role IN (${allowedRoles.map(() => "?").join(",")})`,
      "EXISTS (SELECT 1 FROM workforce_user_tenant wut WHERE wut.tenant_id = ? AND wut.user_id = u.id AND wut.is_active = 1)",
    ];
    const params = [...allowedRoles, tenantId];

    // BUG-A02: Scoping for managers (direct reports or matching team); HR/Admin/Superadmin retain global site scope
    const isGlobalViewer = role === "hr" || role === "admin" || role === "superadmin";
    if (!isGlobalViewer) {
      whereConditions.push("(ep.manager_id = ? OR (ep.team_name IS NOT NULL AND ep.team_name != '' AND ep.team_name = (SELECT mgr_ep.team_name FROM accounts_employeeprofile mgr_ep WHERE mgr_ep.user_id = ?)))");
      params.push(managerId, managerId);
    }

    if (siteScope) {
      if (siteScope.unassigned) {
        whereConditions.push(`NOT EXISTS (SELECT 1 FROM workforce_employee_site_assignment esa WHERE esa.tenant_id = ? AND esa.user_id = u.id AND esa.effective_from <= ? AND (esa.effective_to IS NULL OR esa.effective_to >= ?))`);
        params.push(tenantId, windowEndStr, windowStartStr);
      } else if (siteScope.siteIds) {
        if (!siteScope.siteIds.length) {
          whereConditions.push("1 = 0");
        } else {
          whereConditions.push(`EXISTS (SELECT 1 FROM workforce_employee_site_assignment esa WHERE esa.tenant_id = ? AND esa.user_id = u.id AND esa.site_id IN (${siteScope.siteIds.map(() => "?").join(",")}) AND esa.effective_from <= ? AND (esa.effective_to IS NULL OR esa.effective_to >= ?))`);
          params.push(tenantId, ...siteScope.siteIds, windowEndStr, windowStartStr);
        }
      }
    }

    const members = await db.all(
      `SELECT u.id, u.username, u.email, u.first_name, u.last_name, u.role, ep.team_name, ep.joining_date 
       FROM accounts_user u 
       JOIN accounts_employeeprofile ep ON ep.user_id = u.id 
       WHERE ${whereConditions.join(" AND ")} 
       ORDER BY u.first_name, u.username`,
      params
    );

    if (!members.length) {
      return {
        summary: {
          period_days: days,
          required_hours_per_day: 8,
          team_members: 0,
          present_today: 0,
          on_leave_today: 0,
          pending_review_today: 0,
          absent_today: 0,
          total_present_days: 0,
          total_leave_days: 0,
          total_work_hours: 0,
          average_hours_per_member: 0,
          average_hours_per_present_day: 0,
          under_target_days: 0,
          members_below_target: 0,
          total_shortfall_hours: 0,
        },
        insights: {
          highest_hours_member: null,
          highest_leave_member: null,
          most_under_target_member: null,
        },
        members: [],
      };
    }

    const memberIds = members.map((m) => m.id);

    const attendance = await attendanceRepository.getAttendanceInRange(memberIds, days);
    const leaves = await attendanceRepository.getLeavesInRange(memberIds, days);

    // TA-AN04: Count actual pending approval items per member
    const pendingAttendanceRows = await db.all(
      `SELECT a.user_id, COUNT(*) as c 
       FROM attendance_attendanceapproval aa 
       JOIN attendance_attendance a ON a.id = aa.attendance_id 
       WHERE a.user_id IN (${memberIds.map(() => "?").join(",")}) AND aa.status = 'pending' 
       GROUP BY a.user_id`,
      memberIds
    );
    const pendingAttendanceMap = new Map();
    pendingAttendanceRows.forEach((r) => pendingAttendanceMap.set(Number(r.user_id), Number(r.c || 0)));

    const pendingLeaveRows = await db.all(
      `SELECT l.user_id, COUNT(*) as c 
       FROM leave_leave l 
       WHERE l.user_id IN (${memberIds.map(() => "?").join(",")}) AND l.status = 'pending' 
       GROUP BY l.user_id`,
      memberIds
    );
    const pendingLeaveMap = new Map();
    pendingLeaveRows.forEach((r) => pendingLeaveMap.set(Number(r.user_id), Number(r.c || 0)));

    const winStart = new Date(`${windowStartStr}T00:00:00Z`);
    const winEnd = new Date(`${windowEndStr}T00:00:00Z`);

    const records = members.map((m) => {
      const att = attendance.filter((a) => Number(a.user_id) === Number(m.id));
      const lvs = leaves.filter((l) => Number(l.user_id) === Number(m.id));
      const approvedAtt = att.filter((a) => a.status === "approved");
      const approvedDays = approvedAtt.length;
      const totalWorkHours = approvedAtt.reduce((sum, a) => sum + toHours(a.punch_in_time, a.punch_out_time, a.status), 0);

      // TA-AN03: Only completed shifts (punch_out_time present) count as shortfall
      const underTargetDays = approvedAtt.filter((a) => a.punch_out_time && toHours(a.punch_in_time, a.punch_out_time, a.status) > 0 && toHours(a.punch_in_time, a.punch_out_time, a.status) < 8).length;
      const shortfallHours = approvedAtt.reduce((sum, a) => {
        if (a.punch_out_time) {
          const h = toHours(a.punch_in_time, a.punch_out_time, a.status);
          if (h > 0 && h < 8) return sum + (8 - h);
        }
        return sum;
      }, 0);

      // TA-AN05: Clamp leave days strictly within requested reporting window
      const countedLeaveDates = new Set();
      lvs.forEach((l) => {
        if (l.status !== "approved") return;
        const lvFrom = new Date(`${getYYYYMMDD(l.from_date)}T00:00:00Z`);
        const lvTo = new Date(`${getYYYYMMDD(l.to_date)}T00:00:00Z`);

        const cur = new Date(lvFrom > winStart ? lvFrom : winStart);
        const end = new Date(lvTo < winEnd ? lvTo : winEnd);

        while (cur <= end) {
          countedLeaveDates.add(cur.toISOString().slice(0, 10));
          cur.setUTCDate(cur.getUTCDate() + 1);
        }
      });
      const leaveDays = countedLeaveDates.size;

      // TA-AN02 & TA-AN05: Canonical today_status
      const todayAtt = att.find((a) => getYYYYMMDD(a.work_date || a.date) === todayStr);
      const hasApprovedLeaveToday = lvs.some((l) => {
        const fromStr = getYYYYMMDD(l.from_date);
        const toStr = getYYYYMMDD(l.to_date);
        return l.status === "approved" && fromStr <= todayStr && toStr >= todayStr;
      });

      let todayStatus = "ABSENT";
      let todayStatusCode = "A";

      if (todayAtt) {
        if (todayAtt.status === "approved") {
          if (todayAtt.punch_out_time) {
            todayStatus = "PRESENT";
            todayStatusCode = "P";
          } else {
            todayStatus = "IN_PROGRESS";
            todayStatusCode = "IP";
          }
        } else if (todayAtt.status === "pending") {
          todayStatus = "PENDING_REVIEW";
          todayStatusCode = "PR";
        } else if (todayAtt.status === "rejected") {
          todayStatus = "REJECTED";
          todayStatusCode = "RJ";
        } else if (todayAtt.status === "leave") {
          todayStatus = "ON_LEAVE";
          todayStatusCode = "L";
        }
      } else if (hasApprovedLeaveToday) {
        todayStatus = "ON_LEAVE";
        todayStatusCode = "L";
      }

      // TA-AN04: Count actual pending approval items
      const pendingApprovalItems =
        (pendingAttendanceMap.get(Number(m.id)) || 0) +
        (pendingLeaveMap.get(Number(m.id)) || 0);

      const fulfilledDays = approvedAtt.filter((a) => a.punch_out_time && toHours(a.punch_in_time, a.punch_out_time, a.status) >= 8).length;
      const completionRate = approvedDays ? Number(((fulfilledDays / approvedDays) * 100).toFixed(1)) : 0;

      return {
        user_id: m.id,
        username: m.username,
        employee_name: fullName(m),
        email: m.email,
        role: m.role,
        team_name: m.team_name,
        joining_date: m.joining_date,
        today_status: todayStatus,
        today_status_code: todayStatusCode,
        present_days: att.length,
        approved_days: approvedDays,
        pending_days: att.filter((a) => a.status === "pending").length,
        rejected_days: att.filter((a) => a.status === "rejected").length,
        leave_days: leaveDays,
        total_work_hours: Number(totalWorkHours.toFixed(2)),
        average_hours: approvedDays ? Number((totalWorkHours / approvedDays).toFixed(2)) : 0,
        fulfilled_days: fulfilledDays,
        under_target_days: underTargetDays,
        shortfall_hours: Number(shortfallHours.toFixed(2)),
        completion_rate: completionRate,
        pending_approval_items: pendingApprovalItems,
        last_attendance_date: att.length ? att.sort((a, b) => new Date(b.date || b.work_date) - new Date(a.date || a.work_date))[0].date || att[0].work_date : null,
      };
    });

    return {
      summary: {
        period_days: days,
        required_hours_per_day: 8,
        team_members: records.length,
        present_today: records.filter((r) => r.today_status === "PRESENT" || r.today_status === "IN_PROGRESS").length,
        on_leave_today: records.filter((r) => r.today_status === "ON_LEAVE").length,
        pending_review_today: records.filter((r) => r.today_status === "PENDING_REVIEW").length,
        absent_today: records.filter((r) => r.today_status === "ABSENT").length,
        total_present_days: records.reduce((s, r) => s + r.present_days, 0),
        total_leave_days: records.reduce((s, r) => s + r.leave_days, 0),
        total_work_hours: Number(records.reduce((s, r) => s + r.total_work_hours, 0).toFixed(2)),
        average_hours_per_member: records.length ? Number((records.reduce((s, r) => s + r.total_work_hours, 0) / records.length).toFixed(2)) : 0,
        average_hours_per_present_day: records.reduce((s, r) => s + r.present_days, 0)
          ? Number((records.reduce((s, r) => s + r.total_work_hours, 0) / records.reduce((s, r) => s + r.present_days, 0)).toFixed(2))
          : 0,
        under_target_days: records.reduce((s, r) => s + r.under_target_days, 0),
        members_below_target: records.filter((r) => r.under_target_days > 0).length,
        total_shortfall_hours: Number(records.reduce((s, r) => s + r.shortfall_hours, 0).toFixed(2)),
      },
      insights: {
        highest_hours_member: records.slice().sort((a, b) => b.total_work_hours - a.total_work_hours)[0] || null,
        highest_leave_member: records.slice().sort((a, b) => b.leave_days - a.leave_days)[0] || null,
        most_under_target_member: records.slice().sort((a, b) => b.under_target_days - a.under_target_days)[0] || null,
      },
      members: records,
    };
  },

  async teamAttendance(managerId, queryMonth, queryEmployeeId, queryDetailStart, queryDetailEnd, role, queryPage = 1, queryLimit = 50, queryTeam = null, tenantId = 1, siteFilter = null) {
    if (role !== "manager" && role !== "hr" && role !== "admin" && role !== "superadmin") {
      throw new AppError("Not allowed", 403);
    }

    const month = queryMonth || new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw new AppError("Invalid month format. Expected YYYY-MM", 400);
    }
    const [y, m] = month.split("-").map(Number);
    const monthStart = new Date(y, m - 1, 1);
    const monthEnd = new Date(y, m, 0);
    const lastDay = new Date(y, m, 0).getDate();
    const monthStartStr = `${y}-${String(m).padStart(2, "0")}-01`;
    const monthEndStr = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
    const siteScope = await siteService.getSiteScope(tenantId, { id: managerId, role }, siteFilter);

    const isGlobalViewer = role === "hr" || role === "admin" || role === "superadmin";

    // Build filter conditions
    const whereConditions = ["u.deleted_at IS NULL", "u.is_active = 1", "EXISTS (SELECT 1 FROM workforce_user_tenant wut WHERE wut.tenant_id = ? AND wut.user_id = u.id AND wut.is_active = 1)"];
    const params = [tenantId];

    if (!isGlobalViewer) {
      whereConditions.push("ep.is_active_employee = 1");
      whereConditions.push("(ep.manager_id = ? OR (ep.team_name IS NOT NULL AND ep.team_name != '' AND ep.team_name = (SELECT mgr_ep.team_name FROM accounts_employeeprofile mgr_ep WHERE mgr_ep.user_id = ?)))");
      params.push(managerId, managerId);
    } else {
      whereConditions.push("(ep.user_id IS NULL OR ep.is_active_employee = 1)");
    }

    if (queryTeam) {
      whereConditions.push("ep.team_name = ?");
      params.push(queryTeam);
    }

    if (siteScope.unassigned) {
      whereConditions.push(`NOT EXISTS (SELECT 1 FROM workforce_employee_site_assignment esa WHERE esa.tenant_id = ? AND esa.user_id = u.id AND esa.effective_from <= ? AND (esa.effective_to IS NULL OR esa.effective_to >= ?))`);
      params.push(tenantId, monthEndStr, monthStartStr);
    } else if (siteScope.siteIds) {
      if (!siteScope.siteIds.length) whereConditions.push("1 = 0");
      else {
        whereConditions.push(`EXISTS (SELECT 1 FROM workforce_employee_site_assignment esa WHERE esa.tenant_id = ? AND esa.user_id = u.id AND esa.site_id IN (${siteScope.siteIds.map(() => "?").join(",")}) AND esa.effective_from <= ? AND (esa.effective_to IS NULL OR esa.effective_to >= ?))`);
        params.push(tenantId, ...siteScope.siteIds, monthEndStr, monthStartStr);
      }
    }

    const whereClause = whereConditions.join(" AND ");

    // Count total matching members for pagination
    const countRow = await db.get(
      `SELECT COUNT(*) as c FROM accounts_user u LEFT JOIN accounts_employeeprofile ep ON ep.user_id = u.id WHERE ${whereClause}`,
      params
    );
    const totalMembers = Number(countRow?.c || 0);

    // Pagination calculations
    const isAll = queryPage === "all";
    const pageNum = Math.max(1, parseInt(queryPage, 10) || 1);
    const limitNum = Math.min(200, Math.max(10, parseInt(queryLimit, 10) || 50));
    const offsetNum = (pageNum - 1) * limitNum;

    let memberQuery = `SELECT u.id, u.username, u.first_name, u.last_name, u.email, ep.team_name
       FROM accounts_user u 
       LEFT JOIN accounts_employeeprofile ep ON ep.user_id = u.id 
       WHERE ${whereClause} 
       ORDER BY u.first_name, u.username`;

    const queryParams = [...params];
    if (!isAll) {
      memberQuery += ` LIMIT ? OFFSET ?`;
      queryParams.push(limitNum, offsetNum);
    }

    const members = await db.all(memberQuery, queryParams);
    const memberIds = members.map((x) => x.id);

    const assignmentRows = memberIds.length ? await db.all(
      `SELECT user_id, site_id, effective_from, effective_to FROM workforce_employee_site_assignment
       WHERE tenant_id = ? AND user_id IN (${memberIds.map(() => "?").join(",")})
         AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)
       ORDER BY effective_from DESC, id DESC`,
      [tenantId, ...memberIds, monthEndStr, monthStartStr]
    ) : [];
    const assignmentsByUser = new Map();
    for (const assignment of assignmentRows) {
      const key = Number(assignment.user_id);
      const list = assignmentsByUser.get(key) || [];
      list.push(assignment);
      assignmentsByUser.set(key, list);
    }
    const holidayRows = await db.all(
      `SELECT holiday_date, name, is_optional FROM workforce_company_holiday
       WHERE tenant_id = ? AND holiday_date BETWEEN ? AND ?`,
      [tenantId, monthStartStr, monthEndStr]
    );
    const holidayByDate = new Map(holidayRows.map((holiday) => [getYYYYMMDD(holiday.holiday_date), holiday]));
    const attendance = memberIds.length > 0
      ? await attendanceRepository.getAttendanceInMonth(memberIds, monthStartStr, monthEndStr)
      : [];

    // O(M) Pre-indexing: group attendance by userId to eliminate O(N*M) nested filter
    const attendanceByUser = new Map();
    for (const a of attendance) {
      if (siteScope.unassigned && a.site_id != null) continue;
      if (siteScope.siteIds && a.site_id != null && !siteScope.siteIds.includes(Number(a.site_id))) continue;
      if (a.site_id == null) {
        const historicalSite = await siteService.getEmployeeSiteId(tenantId, a.user_id, getYYYYMMDD(a.work_date || a.date));
        if (siteScope.unassigned ? historicalSite !== null : (siteScope.siteIds && !siteScope.siteIds.includes(historicalSite))) continue;
      }
      const uid = Number(a.user_id);
      let list = attendanceByUser.get(uid);
      if (!list) {
        list = [];
        attendanceByUser.set(uid, list);
      }
      list.push(a);
    }

    const registerDates = [];
    for (let day = 1; day <= lastDay; day++) {
      const d = new Date(y, m - 1, day);
      registerDates.push({
        date: `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        day,
        weekday: d.toLocaleDateString("en-US", { weekday: "short" }),
        is_week_off: d.getDay() === 0
      });
    }

      const todayD = new Date();
      const todayStr = `${todayD.getFullYear()}-${String(todayD.getMonth() + 1).padStart(2, "0")}-${String(todayD.getDate()).padStart(2, "0")}`;

      const registerRows = members.map((member) => {
        const memberAttendance = attendanceByUser.get(Number(member.id)) || [];

        // Build a map of date -> attendance record, prioritizing approved > pending > rejected
        const map = new Map();
        memberAttendance.forEach((a) => {
          const dateKey = getYYYYMMDD(a.date);
          const existing = map.get(dateKey);
          if (!existing) {
            map.set(dateKey, a);
          } else {
            const statusPriority = { approved: 3, pending: 2, rejected: 1 };
            const existingPriority = statusPriority[existing.status] || 0;
            const currentPriority = statusPriority[a.status] || 0;
            if (currentPriority > existingPriority) {
              map.set(dateKey, a);
            }
          }
        });

        let present = 0, leave = 0, pending = 0, absent = 0, rejected = 0, weekOff = 0, holidayCount = 0, shortfall = 0, totalHours = 0;
        const cells = registerDates.map((day) => {
          const assignmentForDay = (assignmentsByUser.get(Number(member.id)) || []).find((assignment) => {
            const from = getYYYYMMDD(assignment.effective_from);
            const to = assignment.effective_to ? getYYYYMMDD(assignment.effective_to) : "9999-12-31";
            return from <= day.date && to >= day.date;
          });
          const assignedSiteForDay = assignmentForDay ? Number(assignmentForDay.site_id) : null;
          const withinSelectedSite = siteScope.unassigned
            ? assignedSiteForDay === null
            : siteScope.siteIds
              ? siteScope.siteIds.includes(assignedSiteForDay)
              : true;
          if (!withinSelectedSite) return { date: day.date, code: "--", work_hours: 0, punch_in: "--", punch_out: "--", status: null, holiday_name: null, holiday_optional: null, punch_in_photo: null, punch_out_photo: null };
          const a = map.get(day.date);
          const holiday = holidayByDate.get(day.date) || null;
          let code = "A";
          let wh = 0;
          if (a) {
            if (a.status === "approved" && !a.punch_out_time) code = "IP";
            else if (a.status === "approved") code = "P";
            else if (a.status === "pending") code = "PR";
            else if (a.status === "rejected") code = "RJ";
            else if (a.status === "leave") code = "L";
            wh = toHours(a.punch_in_time, a.punch_out_time, a.status);
          } else if (holiday) {
            code = "H";
          } else if (day.is_week_off) {
            code = "WO";
          }

          if (code === "P") present++;
          else if (code === "L") leave++;
          else if (code === "PR" || code === "IP") pending++;
          else if (code === "A") absent++;
          else if (code === "RJ") rejected++;
          else if (code === "WO") weekOff++;
          else if (code === "H") holidayCount++;

          if (a && a.status === "approved" && a.punch_out_time) {
            totalHours += wh;
            if (wh < 8) shortfall++;
          }

          return {
            date: day.date,
            code,
            work_hours: wh,
            punch_in: a?.punch_in_time ? new Date(a.punch_in_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : "--",
            punch_out: a?.punch_out_time ? new Date(a.punch_out_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : "--",
            status: a?.status || null,
            holiday_name: code === "H" ? holiday.name : null,
            holiday_optional: code === "H" ? Boolean(holiday.is_optional) : null,
            punch_in_photo: storageService.getUrl(a?.punch_in_photo),
            punch_out_photo: storageService.getUrl(a?.punch_out_photo),
          };
        });

        const todayCell = cells.find((c) => c.date === todayStr);
        const todayStatus = todayCell && todayCell.code !== "--" ? todayCell.code : "--";

        return {
          user_id: member.id,
          username: member.username,
          employee_name: fullName(member),
          employee_code: member.username,
          today_status: todayStatus,
          pending_approval_items: 0,
          present_marks: present,
          leave_marks: leave,
          pending_marks: pending,
          absent_marks: absent,
          rejected_marks: rejected,
          week_off_marks: weekOff,
          holiday_marks: holidayCount,
          shortfall_days: shortfall,
          total_work_hours: Number(totalHours.toFixed(2)),
          cells,
        };
      });

      let selectedEmployeeDetail = null;
      if (queryEmployeeId) {
        const detailStart = queryDetailStart || monthStartStr;
        const detailEnd = queryDetailEnd || monthEndStr;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(detailStart) || !/^\d{4}-\d{2}-\d{2}$/.test(detailEnd) || detailStart > detailEnd) {
          throw new AppError("Invalid detail date range. Expected YYYY-MM-DD with start <= end", 400);
        }

        // IDOR Scope Check: Managers can view direct reportees or matching team members
        if (!isGlobalViewer) {
          await siteService.ensureEmployeeVisible(tenantId, { id: managerId, role }, queryEmployeeId);
        }
        if (!memberIds.some((memberId) => Number(memberId) === Number(queryEmployeeId))) {
          throw new AppError("You do not have permission to view attendance for this employee in the selected site", 403);
        }

        const emp = await accountsRepository.findById(queryEmployeeId);
        if (emp) {
          let empAttendance = await attendanceRepository.getAttendanceByEmployeeIdAndRange(queryEmployeeId, detailStart, detailEnd);
          empAttendance = await Promise.all(empAttendance.map(async (record) => {
            const recordSite = record.site_id == null
              ? await siteService.getEmployeeSiteId(tenantId, queryEmployeeId, getYYYYMMDD(record.work_date || record.date))
              : Number(record.site_id);
            return siteScope.unassigned ? recordSite === null ? record : null
              : (siteScope.siteIds && !siteScope.siteIds.includes(recordSite)) ? null : record;
          }));
          empAttendance = empAttendance.filter(Boolean);
          let empLeaves = await attendanceRepository.getApprovedLeavesInMonthRange(queryEmployeeId, detailStart, detailEnd);
          empLeaves = await Promise.all(empLeaves.map(async (leave) => {
            const recordSite = leave.site_id == null
              ? await siteService.getEmployeeSiteId(tenantId, queryEmployeeId, getYYYYMMDD(leave.created_at))
              : Number(leave.site_id);
            return siteScope.unassigned ? recordSite === null ? leave : null
              : (siteScope.siteIds && !siteScope.siteIds.includes(recordSite)) ? null : leave;
          }));
          empLeaves = empLeaves.filter(Boolean);

          const approvedAtt = empAttendance.filter(a => a.status === 'approved');
          const presentDays = approvedAtt.length;
          const totalWorkHours = approvedAtt.reduce((sum, a) => sum + toHours(a.punch_in_time, a.punch_out_time, a.status), 0);
          // BUG-TA02: Only count completed shifts (punch_out_time present) as shortfall days
          const shortfallDays = approvedAtt.filter(a => a.punch_out_time && toHours(a.punch_in_time, a.punch_out_time, a.status) < 8).length;

          const [sY, sM] = detailStart.split("-").map(Number);
          const [eY, eM] = detailEnd.split("-").map(Number);
          const monthlyMap = {};

          let curY = sY;
          let curM = sM;
          while (curY < eY || (curY === eY && curM <= eM)) {
              const key = `${curY}-${String(curM).padStart(2, "0")}`;
              const d = new Date(curY, curM - 1, 1);
              monthlyMap[key] = {
                month: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
                present_days: 0,
                leave_days: 0,
                total_work_hours: 0,
                shortfall_days: 0
              };
              curM++;
              if (curM > 12) {
                curM = 1;
                curY++;
              }
            }

            // BUG-TA01: Distribute approved leaves accurately into monthlyMap and avoid double counting
            const countedLeaveDates = new Set();
            empLeaves.forEach(lv => {
              if (lv.status !== "approved") return;
              const fromStr = getYYYYMMDD(lv.from_date);
              const toStr = getYYYYMMDD(lv.to_date);
              const startStr = fromStr > detailStart ? fromStr : detailStart;
              const endStr = toStr < detailEnd ? toStr : detailEnd;
              if (startStr <= endStr) {
                const [startYear, startMonth, startDay] = startStr.split("-").map(Number);
                const [endYear, endMonth, endDay] = endStr.split("-").map(Number);
                const cur = new Date(startYear, startMonth - 1, startDay);
                const endDate = new Date(endYear, endMonth - 1, endDay);

                while (cur <= endDate) {
                  const y = cur.getFullYear();
                  const m = cur.getMonth() + 1;
                  const d = cur.getDate();
                  const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                  if (!countedLeaveDates.has(dateStr)) {
                    countedLeaveDates.add(dateStr);
                    const monthKey = `${y}-${String(m).padStart(2, "0")}`;
                    if (monthlyMap[monthKey]) {
                      monthlyMap[monthKey].leave_days += 1;
                    }
                  }
                  cur.setDate(cur.getDate() + 1);
                }
              }
            });
            const leaveDays = countedLeaveDates.size;

            approvedAtt.forEach(a => {
              const key = getYYYYMM(a.date);
              if (monthlyMap[key]) {
                monthlyMap[key].present_days += 1;
                const wh = toHours(a.punch_in_time, a.punch_out_time, a.status);
                monthlyMap[key].total_work_hours += wh;
                // BUG-TA02: Only completed shifts with punch_out_time count as shortfall in monthly breakdown
                if (a.punch_out_time && wh < 8) monthlyMap[key].shortfall_days += 1;
              }
            });

            Object.keys(monthlyMap).forEach(key => {
              monthlyMap[key].total_work_hours = Number(monthlyMap[key].total_work_hours.toFixed(2));
            });

            const history = empAttendance.map(a => {
              return {
                date: getYYYYMMDD(a.date),
                work_date: a.work_date || getYYYYMMDD(a.date),
                shift_version_id: a.shift_version_id || null,
                roster_entry_id: a.roster_entry_id || null,
                is_unscheduled: Boolean(a.is_unscheduled),
                resolution_source: a.resolution_source || null,
                punctuality_status: a.punctuality_status || null,
                late_minutes: Number(a.late_minutes || 0),
                early_departure_minutes: Number(a.early_departure_minutes || 0),
                overtime_minutes: Number(a.overtime_minutes || 0),
                status: a.status,
                punch_in: a.punch_in_time ? new Date(a.punch_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }) : "--",
                punch_out: a.punch_out_time ? new Date(a.punch_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }) : "--",
                work_hours: toHours(a.punch_in_time, a.punch_out_time, a.status),
                // BUG-TA02: Only completed approved shifts with punch_out_time count as under_target
                under_target: a.status === "approved" && Boolean(a.punch_out_time) && toHours(a.punch_in_time, a.punch_out_time, a.status) > 0 && toHours(a.punch_in_time, a.punch_out_time, a.status) < 8,
                punch_in_status: a.punch_in_status,
                punch_out_status: a.punch_out_status,
                punch_in_photo: storageService.getUrl(a.punch_in_photo),
                punch_out_photo: storageService.getUrl(a.punch_out_photo),
              };
            });

            selectedEmployeeDetail = {
              employee_name: fullName(emp),
              username: emp.username,
              range_start: detailStart,
              range_end: detailEnd,
              summary: {
                present_days: presentDays,
                leave_days: leaveDays,
                total_work_hours: Number(totalWorkHours.toFixed(2)),
                shortfall_days: shortfallDays,
              },
              monthly_breakdown: Object.values(monthlyMap),
              history: history.sort((a, b) => new Date(b.date) - new Date(a.date)),
            };
          }
        }

        // Compute summary totals for all members
        let totalPresentMarks = 0;
        let totalLeaveMarks = 0;
        let totalPendingMarks = 0;
        let totalAbsentMarks = 0;
        let totalShortfallDays = 0;
        let totalWorkHours = 0;
        let presentTodayCount = 0;

        registerRows.forEach((row) => {
          totalPresentMarks += row.present_marks || 0;
          totalLeaveMarks += row.leave_marks || 0;
          totalPendingMarks += row.pending_marks || 0;
          totalAbsentMarks += row.absent_marks || 0;
          totalShortfallDays += row.shortfall_days || 0;
          totalWorkHours += row.total_work_hours || 0;

          const todayCell = row.cells.find(c => c.date === todayStr);
          if (todayCell && (todayCell.code === "P" || todayCell.code === "IP")) {
            presentTodayCount++;
          }
        });

        return {
          summary: {
            month,
            month_label: new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
            team_members: members.length,
            present_today: presentTodayCount,
            total_present_marks: totalPresentMarks,
            total_leave_marks: totalLeaveMarks,
            total_pending_marks: totalPendingMarks,
            total_absent_marks: totalAbsentMarks,
            total_shortfall_days: totalShortfallDays,
            total_work_hours: Number(totalWorkHours.toFixed(2)),
          },
          employees: members.map(m => ({
            user_id: m.id,
            employee_name: fullName(m),
            username: m.username
          })),
          register_dates: registerDates,
          register_rows: registerRows,
          selected_employee_detail: selectedEmployeeDetail,
          pagination: {
            page: isAll ? 1 : pageNum,
            limit: isAll ? totalMembers : limitNum,
            total: totalMembers,
            total_pages: isAll ? 1 : Math.ceil(totalMembers / limitNum),
          },
        };
      },

  async attendanceStatusSummary(userId, fromDate) {
        const allRows = await attendanceRepository.getAttendanceRecordsSince(userId, fromDate);
        const rows = allRows.filter((r) => r.status !== "rejected");
        let totalHours = 0;
        const daily = rows.map((att) => {
          const punchInIso = dbTimeToIso(att.punch_in_time);
          const punchOutIso = dbTimeToIso(att.punch_out_time);
          const workHours = toHours(punchInIso, punchOutIso, att.status);
          totalHours += workHours;
          return {
            date: att.date,
            punch_in: att.punch_in_status === "pending"
              ? "Pending"
              : (punchInIso ? new Date(punchInIso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }) : null),
            punch_out: att.punch_out_status === "pending"
              ? "Pending"
              : (punchOutIso ? new Date(punchOutIso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }) : (att.punch_in_time ? "Pending" : null)),
            work_hours: workHours,
            status: att.status,
          };
        });

        return { rows, totalHours: Number(totalHours.toFixed(2)), daily };
      },

  async myMonthlyRegister(userId, queryMonth, tenantId = 1) {
    const month = queryMonth || new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw new AppError("Invalid month format. Expected YYYY-MM", 400);
    }
    const [y, m] = month.split("-").map(Number);
    if (!y || !m || m < 1 || m > 12) {
      throw new AppError("Invalid month format (expected YYYY-MM)", 400);
    }
    const lastDay = new Date(y, m, 0).getDate();
    const monthStartStr = `${y}-${String(m).padStart(2, "0")}-01`;
    const monthEndStr = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    // 1. Fetch user information
    const user = await db.get(
      `SELECT u.id, u.username, u.first_name, u.last_name, u.email, ep.team_name, ep.designation
       FROM accounts_user u
       LEFT JOIN accounts_employeeprofile ep ON ep.user_id = u.id
       WHERE u.id = ?`,
      [userId]
    );
    if (!user) {
      throw new AppError("User not found", 404);
    }

    // 2. Fetch company holidays in this month
    const holidayRows = await db.all(
      `SELECT holiday_date, name, is_optional FROM workforce_company_holiday
       WHERE tenant_id = ? AND holiday_date BETWEEN ? AND ?`,
      [tenantId, monthStartStr, monthEndStr]
    );
    const holidayByDate = new Map(holidayRows.map((h) => [getYYYYMMDD(h.holiday_date), h]));

    // 3. Fetch approved leaves for this user overlapping this month
    const leaveRows = await db.all(
      `SELECT leave_type, from_date, to_date, status, reason
       FROM leave_leave
       WHERE user_id = ? AND status = 'approved' AND to_date >= ? AND from_date <= ?`,
      [userId, monthStartStr, monthEndStr]
    );
    const leaveDateMap = new Map();
    for (const lv of leaveRows) {
      const from = new Date(lv.from_date);
      const to = new Date(lv.to_date);
      for (let cur = new Date(from); cur <= to; cur.setDate(cur.getDate() + 1)) {
        const dStr = cur.toISOString().slice(0, 10);
        if (dStr >= monthStartStr && dStr <= monthEndStr) {
          leaveDateMap.set(dStr, lv);
        }
      }
    }

    // 4. Fetch attendance records in this month
    const attendanceRows = await db.all(
      `SELECT * FROM attendance_attendance
       WHERE user_id = ? AND date BETWEEN ? AND ?
       ORDER BY date ASC, punch_in_time ASC`,
      [userId, monthStartStr, monthEndStr]
    );

    const attendanceByDate = new Map();
    const statusPriority = { approved: 3, pending: 2, rejected: 1 };
    for (const a of attendanceRows) {
      const dateKey = getYYYYMMDD(a.date);
      const existing = attendanceByDate.get(dateKey);
      if (!existing || (statusPriority[a.status] || 0) > (statusPriority[existing.status] || 0)) {
        attendanceByDate.set(dateKey, a);
      }
    }

    // 5. Build dates array
    const registerDates = [];
    for (let day = 1; day <= lastDay; day++) {
      const d = new Date(y, m - 1, day);
      registerDates.push({
        date: `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        day,
        weekday: d.toLocaleDateString("en-US", { weekday: "short" }),
        is_week_off: d.getDay() === 0,
      });
    }

    const todayD = new Date();
    const todayStr = `${todayD.getFullYear()}-${String(todayD.getMonth() + 1).padStart(2, "0")}-${String(todayD.getDate()).padStart(2, "0")}`;

    let present = 0, leave = 0, pending = 0, absent = 0, rejected = 0, weekOff = 0, holidayCount = 0, shortfall = 0, totalHours = 0;

    const cells = registerDates.map((day) => {
      const a = attendanceByDate.get(day.date);
      const holiday = holidayByDate.get(day.date) || null;
      const leaveRecord = leaveDateMap.get(day.date);

      let code = "A";
      let wh = 0;

      if (a) {
        if (a.status === "approved" && !a.punch_out_time) code = "IP";
        else if (a.status === "approved") code = "P";
        else if (a.status === "pending") code = "PR";
        else if (a.status === "rejected") code = "RJ";
        else if (a.status === "leave") code = "L";
        wh = toHours(a.punch_in_time, a.punch_out_time, a.status);
      } else if (leaveRecord) {
        code = "L";
      } else if (holiday) {
        code = "H";
      } else if (day.is_week_off) {
        code = "WO";
      } else if (day.date > todayStr) {
        code = "--";
      }

      if (code === "P") present++;
      else if (code === "L") leave++;
      else if (code === "PR" || code === "IP") pending++;
      else if (code === "A") absent++;
      else if (code === "RJ") rejected++;
      else if (code === "WO") weekOff++;
      else if (code === "H") holidayCount++;

      if (a && a.status === "approved" && a.punch_out_time) {
        totalHours += wh;
        if (wh < 8) shortfall++;
      }

      return {
        date: day.date,
        day: day.day,
        weekday: day.weekday,
        is_week_off: day.is_week_off,
        code,
        work_hours: Number(wh.toFixed(2)),
        punch_in: a?.punch_in_time ? new Date(a.punch_in_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : "--",
        punch_out: a?.punch_out_time ? new Date(a.punch_out_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : "--",
        status: a?.status || (leaveRecord ? "leave" : (code === "H" ? "holiday" : (code === "WO" ? "weekly_off" : (code === "A" ? "absent" : null)))),
        holiday_name: code === "H" ? holiday?.name : null,
        holiday_optional: code === "H" ? Boolean(holiday?.is_optional) : null,
        leave_type: leaveRecord?.leave_type || null,
        punch_in_photo: storageService.getUrl(a?.punch_in_photo),
        punch_out_photo: storageService.getUrl(a?.punch_out_photo),
        attendance_id: a?.id || null,
      };
    });

    const monthLabel = new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

    const summary = {
      month,
      month_label: monthLabel,
      total_days: lastDay,
      present_marks: present,
      leave_marks: leave,
      pending_marks: pending,
      absent_marks: absent,
      rejected_marks: rejected,
      week_off_marks: weekOff,
      holiday_marks: holidayCount,
      total_work_hours: Number(totalHours.toFixed(2)),
      shortfall_days: shortfall,
    };

    return {
      month,
      month_label: monthLabel,
      summary,
      employee: {
        id: user.id,
        username: user.username,
        name: fullName(user),
        department: user.team_name || "General",
        designation: user.designation || "Employee",
        team_name: user.team_name || "General",
      },
      register_dates: registerDates,
      cells,
      register_rows: [
        {
          user_id: user.id,
          username: user.username,
          employee_name: fullName(user),
          employee_code: user.username,
          cells,
          present_marks: present,
          leave_marks: leave,
          pending_marks: pending,
          absent_marks: absent,
          total_work_hours: Number(totalHours.toFixed(2)),
          shortfall_days: shortfall,
        },
      ],
    };
  },

  async getHistory(userId, query = {}) {
    const defaultLimit = (query.start_date && query.end_date) ? 500 : 50;
    const { page, limit, offset } = parsePagination(query, defaultLimit, 500);

        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (query.start_date && !dateRegex.test(query.start_date)) {
          throw new AppError("Invalid start_date format (expected YYYY-MM-DD)", 400);
        }
        if (query.end_date && !dateRegex.test(query.end_date)) {
          throw new AppError("Invalid end_date format (expected YYYY-MM-DD)", 400);
        }
        if (query.start_date && query.end_date && query.start_date > query.end_date) {
          throw new AppError("start_date cannot be after end_date", 400);
        }

        const whereConditions = ["user_id = ?", "status != 'leave'"];
        const params = [userId];

        if (query.start_date && query.end_date) {
          whereConditions.push("date BETWEEN ? AND ?");
          params.push(query.start_date, query.end_date);
        } else if (query.start_date) {
          whereConditions.push("date >= ?");
          params.push(query.start_date);
        } else if (query.end_date) {
          whereConditions.push("date <= ?");
          params.push(query.end_date);
        }

        const whereClause = whereConditions.join(" AND ");

        const countRow = await db.get(
          `SELECT COUNT(*) as c FROM attendance_attendance WHERE ${whereClause}`,
          params
        );
        const total = Number(countRow?.c || 0);

        const rows = await db.all(
          `SELECT * FROM attendance_attendance 
       WHERE ${whereClause} 
       ORDER BY date DESC, punch_in_time DESC 
       LIMIT ? OFFSET ?`,
          [...params, limit, offset]
        );

        const daily = rows.map((att) => {
          const punchInIso = dbTimeToIso(att.punch_in_time);
          const punchOutIso = dbTimeToIso(att.punch_out_time);
          const workHours = toHours(punchInIso, punchOutIso, att.status);
          return {
            id: att.id,
            date: att.date,
            work_date: att.work_date || att.date,
            shift_version_id: att.shift_version_id || null,
            roster_entry_id: att.roster_entry_id || null,
            is_unscheduled: Boolean(att.is_unscheduled),
            resolution_source: att.resolution_source || null,
            punctuality_status: att.punctuality_status || null,
            late_minutes: Number(att.late_minutes || 0),
            early_departure_minutes: Number(att.early_departure_minutes || 0),
            overtime_minutes: Number(att.overtime_minutes || 0),
            punch_in_time: punchInIso,
            punch_out_time: punchOutIso,
            punch_in_status: att.punch_in_status || null,
            punch_out_status: att.punch_out_status || null,
            punch_in: att.punch_in_status === "pending"
              ? "Pending"
              : (punchInIso ? new Date(punchInIso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }) : null),
            punch_out: att.punch_out_status === "pending"
              ? "Pending"
              : (punchOutIso ? new Date(punchOutIso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }) : (att.punch_in_time && att.status === "pending" ? "Pending" : null)),
            work_hours: workHours,
            status: att.status,
            punch_in_outside: Boolean(att.punch_in_outside),
            punch_out_outside: Boolean(att.punch_out_outside),
            punch_in_photo: storageService.getUrl(att.punch_in_photo),
            punch_out_photo: storageService.getUrl(att.punch_out_photo),
          };
        });

    return formatPaginationResponse(daily, total, page, limit, { records: daily });
  },

  /**
   * Regularize an incomplete or forgotten attendance record (BUG-A09 / BUG-02).
   */
  async regularizeAttendance(userId, attendanceId, punchOutTime, reason, tenantId = null) {
    const parsedId = Number(attendanceId);
    if (!Number.isSafeInteger(parsedId) || parsedId <= 0 || !punchOutTime) {
      throw new AppError("Valid attendance ID and punch out time are required", 400);
    }
    const cleanReason = String(reason || "").trim();
    if (!cleanReason) {
      throw new AppError("A reason for attendance regularization is required", 400);
    }
    const timeStr = String(punchOutTime).trim();
    const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!timeMatch) {
      throw new AppError("Invalid time format. Please provide HH:mm or HH:mm:ss", 400);
    }
    const hh = Number(timeMatch[1]);
    const mm = Number(timeMatch[2]);
    const ss = timeMatch[3] !== undefined ? Number(timeMatch[3]) : 0;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59 || ss < 0 || ss > 59) {
      throw new AppError("Invalid time bounds. Hour must be 00-23 and minute/second 00-59", 400);
    }
    const cleanTime = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;

    return db.transaction(async (tx) => {
      const att = await attendanceRepository.findAttendanceById(parsedId, tx);
      if (!att) {
        throw new AppError("Attendance record not found", 404);
      }
      if (Number(att.user_id) !== Number(userId)) {
        throw new AppError("Unauthorized: You can only regularize your own attendance", 403);
      }
      if (tenantId != null && att.tenant_id != null && Number(att.tenant_id) !== Number(tenantId)) {
        throw new AppError("Attendance record not found in this organization", 404);
      }
      if (att.punch_out_time) {
        throw new AppError("Attendance record already has a punch-out time", 400);
      }
      const currentStatus = String(att.status || "").toLowerCase();
      if (currentStatus === "leave" || currentStatus === "rejected") {
        throw new AppError(`Cannot regularize an attendance record with status '${currentStatus}'`, 400);
      }
      const existingPending = await db.get(
        "SELECT id FROM attendance_attendanceapproval WHERE attendance_id = ? AND type = 'out' AND status = 'pending' LIMIT 1",
        [parsedId],
        tx
      );
      if (existingPending) {
        throw new AppError("A pending regularization request already exists for this attendance record", 400);
      }

      const attDateYmd = getYYYYMMDD(att.work_date || att.date);
      if (!attDateYmd) {
        throw new AppError("Attendance record is missing a valid work date", 400);
      }
      let proposedPunchOut = new Date(`${attDateYmd}T${cleanTime}+05:30`);
      if (Number.isNaN(proposedPunchOut.getTime())) {
        throw new AppError("Unable to construct a valid punch-out datetime", 400);
      }
      if (att.punch_in_time) {
        const punchInDate = new Date(dbTimeToIso(att.punch_in_time));
        if (!Number.isNaN(punchInDate.getTime()) && proposedPunchOut < punchInDate) {
          // Support overnight shift regularization if punch-out is on the next calendar day
          const nextDayDt = new Date(proposedPunchOut.getTime() + 24 * 60 * 60 * 1000);
          if (nextDayDt - punchInDate <= 24 * 60 * 60 * 1000) {
            proposedPunchOut = nextDayDt;
          } else {
            throw new AppError("Punch-out time cannot be earlier than punch-in time", 400);
          }
        }
      }

      const effectiveTenantId = tenantId || att.tenant_id || 1;
      const reviewers = await approvalRouteForUser(userId, tx, effectiveTenantId);
      if (!reviewers || reviewers.length === 0) {
        throw new AppError("No eligible reviewer (Manager, HR, or Admin) available to approve regularization", 400);
      }

      // Update attendance with proposed UTC DateTime and pending status
      await attendanceRepository.updateAttendance(
        parsedId,
        {
          punch_out_time: proposedPunchOut,
          punch_out_status: "pending",
          status: "pending",
          is_outside_location: 1
        },
        tx
      );

      // Create pending approval records for assigned reviewers
      const now = new Date();
      for (const reviewer of reviewers) {
        await attendanceRepository.insertApproval(
          {
            role: reviewer.role,
            status: "pending",
            comment: `[Regularization Request] ${cleanReason}`,
            created_at: now,
            approved_by_id: reviewer.id,
            attendance_id: parsedId,
            type: "out",
          },
          tx
        );
      }

      try {
        realtimeManager.broadcast(
          "attendance_update",
          { actorId: userId, attendanceId: parsedId },
          { tenantId: effectiveTenantId, targetRoles: ["hr", "admin", "superadmin", "manager"], targetUserIds: [Number(userId)] }
        );
      } catch (rtErr) {
        logger.warn("[regularizeAttendance] realtime broadcast failed: %s", rtErr.message);
      }

      return {
        message: "Attendance regularization request submitted successfully and routed for review",
        attendance_id: parsedId,
        punch_out_time: proposedPunchOut.toISOString(),
        status: "pending"
      };
    });
  }
};

export default attendanceService;
