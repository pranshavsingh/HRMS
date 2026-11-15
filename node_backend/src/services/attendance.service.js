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

function getLocalDateString() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 10);
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

async function approvalRouteForUser(userId, tx = null) {
  const user = await accountsRepository.findById(userId, tx);
  const profile = await accountsRepository.findProfileByUserId(userId, tx);
  const routeRoles = REVIEW_ROLES_BY_REQUESTOR[user?.role] || [];
  const route = [];

  if (routeRoles.includes("manager") && profile?.manager_id) {
    const manager = await accountsRepository.findById(profile.manager_id, tx);
    if (manager && manager.is_active) route.push(manager);
  }

  const globalRoles = routeRoles.filter((role) => role !== "manager");
  if (globalRoles.length) {
    const placeholders = globalRoles.map(() => "?").join(",");
    const reviewers = await db.all(
      `SELECT * FROM accounts_user WHERE role IN (${placeholders}) AND is_active=1 AND deleted_at IS NULL`,
      globalRoles,
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
      ? "Team Manager / HR / Admin / Superadmin"
      : "HR / Admin / Superadmin";
  }
  if (employeeRole === "manager") return "HR / Admin / Superadmin";
  if (employeeRole === "hr") return "Admin / Superadmin";
  if (employeeRole === "admin") return "Superadmin";
  return "Not applicable";
}

export const attendanceService = {
  async punchStatus(userId) {
    const todayStr = getLocalDateString();
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

    const latest = await attendanceRepository.findLatestAttendance(userId);
    if (!latest) {
      return {
        is_punched_in: false,
        punch_in_time: null,
        punch_in_status: null,
        ...onLeaveInfo
      };
    }

    if (latest.punch_in_status === "rejected") {
      return {
        is_punched_in: false,
        punch_in_time: null,
        punch_in_status: null,
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
        ...onLeaveInfo
      };
    }

    if (latest.punch_out_time === null) {
      return {
        is_punched_in: true,
        punch_in_time: dbTimeToIso(latest.punch_in_time),
        punch_in_status: latest.punch_in_status,
        ...onLeaveInfo
      };
    }

    return {
      is_punched_in: false,
      punch_in_time: null,
      punch_in_status: null,
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
      upload_preset: config.cloudinaryAttendancePreset,
    };
    const signatureData = cloudinaryService.generateUploadSignature(params);
    return {
      ...signatureData,
      folder,
      public_id: uuid,
      upload_preset: config.cloudinaryAttendancePreset,
      upload_url: `https://api.cloudinary.com/v1_1/${config.cloudinaryCloudName}/image/upload`,
    };
  },

  async punchIn(userId, latitude, longitude, file, actor, directPath = null) {
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

        // 2. Check approved leave under lock
        const todayStr = getLocalDateString();
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

        // 4. Check for existing open attendance under lock
        const open = await attendanceRepository.findOpenAttendance(userId, tx, true);
        if (open) {
          throw new AppError("Already punched in", 400);
        }

        const punchInOutside = await isOutsideAllottedArea(userId, latitude, longitude, tx);
        const reviewers = await approvalRouteForUser(userId, tx);
        const needsApproval = punchInOutside && reviewers.length > 0;

        const punchInStatus = needsApproval ? "pending" : "approved";
        const attendanceStatus = needsApproval ? "pending" : "approved";

        const now = new Date();
        const dateStr = getLocalDateString();

        const attId = await attendanceRepository.insertAttendance({
          date: dateStr,
          punch_in_time: now,
          punch_in_photo: relativePath,
          punch_in_lat: Number(latitude),
          punch_in_lng: Number(longitude),
          punch_in_outside: Number(punchInOutside),
          punch_in_status: punchInStatus,
          punch_out_status: "approved",
          status: attendanceStatus,
          user_id: userId
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
          punch_in_time: dbTimeToIso(now)
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

  async punchOut(userId, latitude, longitude, file, actor, directPath = null) {
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

        // 2. Lock open attendance record
        const att = await attendanceRepository.findOpenAttendance(userId, tx, true);
        if (!att) {
          throw new AppError("Punch in first", 400);
        }

        const punchOutOutside = await isOutsideAllottedArea(userId, latitude, longitude, tx);
        const reviewers = await approvalRouteForUser(userId, tx);
        const needsApproval = punchOutOutside && reviewers.length > 0;

        const punchOutStatus = needsApproval ? "pending" : "approved";
        const nextAttendance = {
          ...att,
          punch_out_status: punchOutStatus,
        };
        const finalStatus = overallAttendanceStatus(nextAttendance);
        const now = new Date();

        // 3. Atomic conditional update: punch_out_time must still be NULL
        const updateResult = await attendanceRepository.updateAttendance(att.id, {
          punch_out_time: now,
          punch_out_photo: relativePath,
          punch_out_lat: Number(latitude),
          punch_out_lng: Number(longitude),
          punch_out_outside: Number(punchOutOutside),
          punch_out_status: punchOutStatus,
          status: finalStatus,
          is_outside_location: Number(Boolean(att.punch_in_outside) || punchOutOutside)
        }, tx, "punch_out_time IS NULL");

        if (updateResult.changes === 0) {
          throw new AppError("Punch in first", 400);
        }

        if (needsApproval) {
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

        const updated = await attendanceRepository.findAttendanceById(att.id, tx);
        
        return {
          message: needsApproval ? "Punch Out submitted for approval" : "Punch Out Successful",
          outside_location: punchOutOutside,
          requires_approval: needsApproval,
          final_status: updated.status,
          punch_in_status: updated.punch_in_status,
          punch_out_status: updated.punch_out_status,
          work_hours: toHours(updated.punch_in_time, updated.punch_out_time, updated.status),
          punch_out_time: dbTimeToIso(now),
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

  async approvals(userId, role, query = {}) {
    if (!["manager", "hr", "admin", "superadmin"].includes(role)) {
      return formatPaginationResponse([], 0, 1, 50, { records: [], summary: {} });
    }

    const rows = await attendanceRepository.findApprovalsForReviewer(userId, role);

    const records = rows.map((r) => {
      const employeeName = `${r.employee_first_name || ""} ${r.employee_last_name || ""}`.trim() || r.employee_username;
      const managerName = r.manager_username ? `${r.manager_first_name || ""} ${r.manager_last_name || ""}`.trim() || r.manager_username : null;
      const reviewStatus = r.type === "in" ? r.punch_in_status : r.punch_out_status;
      const outside = r.type === "in" ? Boolean(r.punch_in_outside) : Boolean(r.punch_out_outside);
      const latitude = r.type === "in" ? r.punch_in_lat : r.punch_out_lat;
      const longitude = r.type === "in" ? r.punch_in_lng : r.punch_out_lng;

      return {
        approval_id: r.id,
        attendance_id: r.attendance_id,
        employee: r.employee_username,
        employee_name: employeeName,
        employee_email: r.employee_email,
        employee_role: r.employee_role,
        team_name: r.team_name,
        reporting_manager: managerName,
        date: r.attendance_date,
        review_type: r.type,
        review_label: r.type === "in" ? "Punch In" : "Punch Out",
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
        can_approve: r.status === "pending" && reviewStatus === "pending" && Number(r.employee_id) !== Number(userId),
      };
    });

    // Deduplicate records to show each exception exactly once, prioritizing pending/active decisions
    const getStatusPriority = (status) => {
      if (status === "approved" || status === "rejected") return 3;
      if (status === "pending") return 2;
      return 1; // "closed"
    };

    const uniqueMap = new Map();
    for (const record of records) {
      const key = `${record.attendance_id}-${record.review_type}`;
      const existing = uniqueMap.get(key);
      if (!existing || getStatusPriority(record.approval_status) > getStatusPriority(existing.approval_status)) {
        uniqueMap.set(key, record);
      }
    }
    const uniqueRecords = [...uniqueMap.values()];

    const { page, limit, offset } = parsePagination(query, 50, 100);
    const total = uniqueRecords.length;
    const paginatedRecords = uniqueRecords.slice(offset, offset + limit);

    return formatPaginationResponse(paginatedRecords, total, page, limit, {
      records: paginatedRecords,
      all_records: uniqueRecords,
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

  async approvalAction(approvalId, status, comment = "", actor) {
    const response = await db.transaction(async (tx) => {
      // 1. Lock the approval row to serialize concurrent reviews
      const ap = await attendanceRepository.findApprovalById(approvalId, tx, true);
      if (!ap) {
        throw new AppError("Approval not found", 404);
      }
      if (actor.role === "superadmin") {
        if (Number(ap.employee_id) === Number(actor.id)) {
          throw new AppError("You cannot approve your own exception request", 403);
        }
      } else {
        if (Number(ap.approved_by_id) !== Number(actor.id)) {
          throw new AppError("This approval is not assigned to you", 403);
        }
      }
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

      // 4. Handle rejection flow (reverts punch but keeps approval records)
      if (status === "rejected") {
        if (ap.type === "in") {
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
            `Closed after rejection by ${fullName(actor)}`,
            actor.id,
            ap.id,
            tx
          );

          return {
            message: "Punch In rejected successfully",
            attendance_status: "rejected",
            review_type: "in",
            review_status: "rejected",
            work_hours: 0,
          };
        } else {
          // Rejecting punch out: reset punch-out fields to null and set punch_out_status = 'rejected'
          const att = await attendanceRepository.findAttendanceById(ap.attendance_id, tx);
          if (att && att.punch_out_photo) {
            await storageService.delete(att.punch_out_photo);
          }
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
            `Closed after rejection by ${fullName(actor)}`,
            actor.id,
            ap.id,
            tx
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
      if (ap.type === "in") {
        await attendanceRepository.updateAttendance(ap.attendance_id, { punch_in_status: status }, tx);
      } else {
        await attendanceRepository.updateAttendance(ap.attendance_id, { punch_out_status: status }, tx);
      }

      // Close all other redundant approvals for the same attendance and type
      await attendanceRepository.updatePendingApprovalsForAttendanceExcept(
        ap.attendance_id,
        ap.type,
        APPROVAL_CLOSED_STATUS,
        `Closed after ${status} by ${fullName(actor)}`,
        actor.id,
        ap.id,
        tx
      );

      // Re-calculate and update overall attendance status
      const att = await attendanceRepository.findAttendanceById(ap.attendance_id, tx);
      const finalStatus = overallAttendanceStatus(att);
      await attendanceRepository.updateAttendance(ap.attendance_id, { status: finalStatus }, tx);

      const updated = await attendanceRepository.findAttendanceById(ap.attendance_id, tx);

      return {
        message: `Punch ${ap.type === "in" ? "In" : "Out"} ${status} successfully`,
        attendance_status: updated.status,
        review_type: ap.type,
        review_status: ap.type === "in" ? updated.punch_in_status : updated.punch_out_status,
        work_hours: toHours(updated.punch_in_time, updated.punch_out_time, updated.status),
      };
    });

    realtimeManager.broadcast(
      "attendance_update",
      { actorId: actor.id },
      { targetRoles: ["hr", "admin", "superadmin", "manager"] }
    );
    return response;
  },

  async dashboard(userId) {
    const since = new Date();
    since.setDate(since.getDate() - 7);
    const fromDate = since.toISOString().slice(0, 10);

    const { totalHours, daily } = await this.attendanceStatusSummary(userId, fromDate);
    const profile = await accountsRepository.findProfileByUserId(userId);
    
    // Approved leaves count
    const approvedLeaves = await db.all("SELECT from_date, to_date FROM leave_leave WHERE user_id=? AND status='approved'", [userId]);
    const leavesTaken = approvedLeaves.reduce((sum, l) => {
      const from = new Date(l.from_date);
      const to = new Date(l.to_date);
      const diff = Math.floor((to - from) / (1000 * 60 * 60 * 24)) + 1;
      return sum + Math.max(0, diff);
    }, 0);

    return {
      total_working_hours: totalHours,
      leave_balance: Math.max(Number(profile?.leave_allotted || 0) - leavesTaken, 0),
      leaves_taken: leavesTaken,
      pending_approvals: await attendanceRepository.getPendingApprovalsCount(userId),
      total_leaves_allocated: Number(profile?.leave_allotted || 0),
      daily_work: daily,
    };
  },

  async hrDashboard(userId, role) {
    if (role !== "hr" && role !== "superadmin") {
      throw new AppError("Not allowed", 403);
    }
    const own = await this.dashboard(userId);
    
    const totalPeopleRow = await db.get("SELECT COUNT(*) c FROM accounts_user WHERE role IN ('employee','manager') AND is_active=1 AND deleted_at IS NULL");
    const presentRow = await db.get("SELECT COUNT(DISTINCT user_id) c FROM attendance_attendance WHERE date=CURDATE() AND status NOT IN ('rejected', 'leave')");
    const pendingLeaveRow = await db.get("SELECT COUNT(*) c FROM leave_leave WHERE status='pending'");
    const pendingAttendanceRow = await db.get("SELECT COUNT(*) c FROM attendance_attendanceapproval WHERE status='pending'");
    
    const recentRows = await db.all(
      `SELECT a.*, u.username as employee, u.role 
       FROM attendance_attendance a 
       JOIN accounts_user u ON u.id=a.user_id 
       WHERE u.deleted_at IS NULL AND a.status <> 'rejected'
       ORDER BY a.date DESC, a.punch_in_time DESC LIMIT 10`
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

  async managerDashboard(userId, role) {
    if (role !== "manager" && role !== "superadmin") {
      throw new AppError("Not allowed", 403);
    }

    const own = await this.dashboard(userId);
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

  async teamAnalytics(managerId, daysQuery, role) {
    if (role !== "manager" && role !== "hr" && role !== "admin" && role !== "superadmin") {
      throw new AppError("Not allowed", 403);
    }
    const days = [7, 30, 90].includes(Number(daysQuery)) ? Number(daysQuery) : 30;

    const members = (role === "hr" || role === "admin" || role === "superadmin")
      ? await db.all(
          "SELECT u.id, u.username, u.email, u.first_name, u.last_name, ep.team_name, ep.joining_date FROM accounts_user u JOIN accounts_employeeprofile ep ON ep.user_id=u.id WHERE u.role IN ('employee','manager','hr') AND ep.is_active_employee=1 AND u.deleted_at IS NULL ORDER BY u.first_name, u.username"
        )
      : await db.all(
          "SELECT u.id, u.username, u.email, u.first_name, u.last_name, ep.team_name, ep.joining_date FROM accounts_user u JOIN accounts_employeeprofile ep ON ep.user_id=u.id WHERE ep.manager_id=? AND ep.is_active_employee=1 AND u.deleted_at IS NULL ORDER BY u.first_name, u.username",
          [managerId]
        );
    const memberIds = members.map((m) => m.id);

    const attendance = await attendanceRepository.getAttendanceInRange(memberIds, days);
    const leaves = await attendanceRepository.getLeavesInRange(memberIds, days);

    const records = members.map((m) => {
      const att = attendance.filter((a) => Number(a.user_id) === Number(m.id));
      const lvs = leaves.filter((l) => Number(l.user_id) === Number(m.id));
      const approvedDays = att.filter((a) => a.status === "approved").length;
      const totalWorkHours = att.reduce((sum, a) => sum + toHours(a.punch_in_time, a.punch_out_time, a.status), 0);
      const underTargetDays = att.filter((a) => a.status === "approved" && toHours(a.punch_in_time, a.punch_out_time, a.status) > 0 && toHours(a.punch_in_time, a.punch_out_time, a.status) < 8).length;
      const shortfallHours = att.reduce((sum, a) => {
        const h = toHours(a.punch_in_time, a.punch_out_time, a.status);
        if (a.status === "approved" && h > 0 && h < 8) return sum + (8 - h);
        return sum;
      }, 0);
      const leaveDays = lvs.reduce((sum, l) => {
        const from = new Date(l.from_date);
        const to = new Date(l.to_date);
        return sum + Math.max(0, Math.floor((to - from) / (1000 * 60 * 60 * 24)) + 1);
      }, 0);

      return {
        user_id: m.id,
        username: m.username,
        employee_name: fullName(m),
        email: m.email,
        team_name: m.team_name,
        joining_date: m.joining_date,
        today_status: "--",
        present_days: att.length,
        approved_days: approvedDays,
        pending_days: att.filter((a) => a.status === "pending").length,
        rejected_days: att.filter((a) => a.status === "rejected").length,
        leave_days: leaveDays,
        total_work_hours: Number(totalWorkHours.toFixed(2)),
        average_hours: approvedDays ? Number((totalWorkHours / approvedDays).toFixed(2)) : 0,
        fulfilled_days: att.filter((a) => a.status === "approved" && toHours(a.punch_in_time, a.punch_out_time, a.status) >= 8).length,
        under_target_days: underTargetDays,
        shortfall_hours: Number(shortfallHours.toFixed(2)),
        completion_rate: approvedDays ? Number(((att.filter((a) => a.status === "approved" && toHours(a.punch_in_time, a.punch_out_time, a.status) >= 8).length / approvedDays) * 100).toFixed(1)) : 0,
        pending_approval_items: 0,
        last_attendance_date: att.length ? att.sort((a, b) => new Date(b.date) - new Date(a.date))[0].date : null,
      };
    });

    return {
      summary: {
        period_days: days,
        required_hours_per_day: 8,
        team_members: records.length,
        present_today: 0,
        on_leave_today: 0,
        pending_review_today: 0,
        absent_today: 0,
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

  async teamAttendance(managerId, queryMonth, queryEmployeeId, queryDetailStart, queryDetailEnd, role, queryPage = 1, queryLimit = 50, queryTeam = null) {
    if (role !== "manager" && role !== "hr" && role !== "admin" && role !== "superadmin") {
      throw new AppError("Not allowed", 403);
    }

    const month = queryMonth || new Date().toISOString().slice(0, 7);
    const [y, m] = month.split("-").map(Number);
    const monthStart = new Date(y, m - 1, 1);
    const monthEnd = new Date(y, m, 0);

    const isGlobalViewer = role === "hr" || role === "admin" || role === "superadmin";

    // Build filter conditions
    const whereConditions = ["u.deleted_at IS NULL", "ep.is_active_employee = 1"];
    const params = [];

    if (!isGlobalViewer) {
      whereConditions.push("ep.manager_id = ?");
      params.push(managerId);
    } else {
      whereConditions.push("u.role IN ('employee', 'manager', 'hr')");
    }

    if (queryTeam) {
      whereConditions.push("ep.team_name = ?");
      params.push(queryTeam);
    }

    const whereClause = whereConditions.join(" AND ");

    // Count total matching members for pagination
    const countRow = await db.get(
      `SELECT COUNT(*) as c FROM accounts_user u JOIN accounts_employeeprofile ep ON ep.user_id = u.id WHERE ${whereClause}`,
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
       JOIN accounts_employeeprofile ep ON ep.user_id = u.id 
       WHERE ${whereClause} 
       ORDER BY u.first_name, u.username`;

    const queryParams = [...params];
    if (!isAll) {
      memberQuery += ` LIMIT ? OFFSET ?`;
      queryParams.push(limitNum, offsetNum);
    }

    const members = await db.all(memberQuery, queryParams);
    const memberIds = members.map((x) => x.id);

    const monthStartStr = monthStart.toISOString().slice(0, 10);
    const monthEndStr = monthEnd.toISOString().slice(0, 10);
    const attendance = memberIds.length > 0
      ? await attendanceRepository.getAttendanceInMonth(memberIds, monthStartStr, monthEndStr)
      : [];

    // O(M) Pre-indexing: group attendance by userId to eliminate O(N*M) nested filter
    const attendanceByUser = new Map();
    for (const a of attendance) {
      const uid = Number(a.user_id);
      let list = attendanceByUser.get(uid);
      if (!list) {
        list = [];
        attendanceByUser.set(uid, list);
      }
      list.push(a);
    }

    const registerDates = [];
    for (let d = new Date(monthStart); d <= monthEnd; d.setDate(d.getDate() + 1)) {
      registerDates.push({
        date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
        day: d.getDate(),
        weekday: d.toLocaleDateString("en-US", { weekday: "short" }),
        is_week_off: d.getDay() === 0
      });
    }

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

      let present = 0, leave = 0, pending = 0, absent = 0, rejected = 0, weekOff = 0, shortfall = 0, totalHours = 0;
      const cells = registerDates.map((day) => {
        const a = map.get(day.date);
        let code = "A";
        let wh = 0;
        if (a) {
          if (a.status === "approved" && !a.punch_out_time) code = "IP";
          else if (a.status === "approved") code = "P";
          else if (a.status === "pending") code = "PR";
          else if (a.status === "rejected") code = "RJ";
          else if (a.status === "leave") code = "L";
          wh = toHours(a.punch_in_time, a.punch_out_time, a.status);
        } else if (day.is_week_off) {
          code = "WO";
        }

        if (code === "P") present++;
        else if (code === "L") leave++;
        else if (code === "PR" || code === "IP") pending++;
        else if (code === "A") absent++;
        else if (code === "RJ") rejected++;
        else if (code === "WO") weekOff++;

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
          punch_in_photo: storageService.getUrl(a?.punch_in_photo),
          punch_out_photo: storageService.getUrl(a?.punch_out_photo),
        };
      });

      return {
        user_id: member.id,
        username: member.username,
        employee_name: fullName(member),
        employee_code: member.username,
        today_status: "--",
        pending_approval_items: 0,
        present_marks: present,
        leave_marks: leave,
        pending_marks: pending,
        absent_marks: absent,
        rejected_marks: rejected,
        week_off_marks: weekOff,
        shortfall_days: shortfall,
        total_work_hours: Number(totalHours.toFixed(2)),
        cells,
      };
    });

    let selectedEmployeeDetail = null;
    if (queryEmployeeId) {
      const detailStart = queryDetailStart || monthStartStr;
      const detailEnd = queryDetailEnd || monthEndStr;

      // IDOR Scope Check: Managers can only view details of their direct reportees
      if (!isGlobalViewer) {
        const empProfile = await accountsRepository.findProfileByUserId(queryEmployeeId);
        if (!empProfile || Number(empProfile.manager_id) !== Number(managerId)) {
          throw new AppError("You do not have permission to view attendance for this employee", 403);
        }
      }

      const emp = await accountsRepository.findById(queryEmployeeId);
      if (emp) {
        const empAttendance = await attendanceRepository.getAttendanceByEmployeeIdAndRange(queryEmployeeId, detailStart, detailEnd);
        const empLeaves = await attendanceRepository.getApprovedLeavesInMonthRange(queryEmployeeId, detailStart, detailEnd);

        const approvedAtt = empAttendance.filter(a => a.status === 'approved');
        const presentDays = approvedAtt.length;
        const totalWorkHours = approvedAtt.reduce((sum, a) => sum + toHours(a.punch_in_time, a.punch_out_time, a.status), 0);
        const shortfallDays = approvedAtt.filter(a => toHours(a.punch_in_time, a.punch_out_time, a.status) < 8).length;

        let leaveDays = 0;
        empLeaves.forEach(lv => {
          const start = new Date(Math.max(new Date(lv.from_date), new Date(detailStart)));
          const end = new Date(Math.min(new Date(lv.to_date), new Date(detailEnd)));
          const diff = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
          if (diff > 0) leaveDays += diff;
        });

        const startD = new Date(detailStart);
        const endD = new Date(detailEnd);
        const monthlyMap = {};

        for (let d = new Date(startD); d <= endD; d.setMonth(d.getMonth() + 1)) {
          const key = d.toISOString().slice(0, 7);
          monthlyMap[key] = {
            month: d.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
            present_days: 0,
            leave_days: 0,
            total_work_hours: 0,
            shortfall_days: 0
          };
        }

        approvedAtt.forEach(a => {
          const key = getYYYYMM(a.date);
          if (monthlyMap[key]) {
            monthlyMap[key].present_days += 1;
            const wh = toHours(a.punch_in_time, a.punch_out_time, a.status);
            monthlyMap[key].total_work_hours += wh;
            if (wh < 8) monthlyMap[key].shortfall_days += 1;
          }
        });

        Object.keys(monthlyMap).forEach(key => {
          monthlyMap[key].total_work_hours = Number(monthlyMap[key].total_work_hours.toFixed(2));
        });

        const history = empAttendance.map(a => {
          return {
            date: getYYYYMMDD(a.date),
            status: a.status,
            punch_in: a.punch_in_time ? new Date(a.punch_in_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }) : "--",
            punch_out: a.punch_out_time ? new Date(a.punch_out_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }) : "--",
            work_hours: toHours(a.punch_in_time, a.punch_out_time, a.status),
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

    const todayStr = new Date().toISOString().slice(0, 10);

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
        month_label: monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
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
          : (punchInIso ? new Date(punchInIso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : null),
        punch_out: att.punch_out_status === "pending"
          ? "Pending"
          : (punchOutIso ? new Date(punchOutIso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : (att.punch_in_time ? "Pending" : null)),
        work_hours: workHours,
        status: att.status,
      };
    });

    return { rows, totalHours: Number(totalHours.toFixed(2)), daily };
  },

  async getHistory(userId, query = {}) {
    const { page, limit, offset } = parsePagination(query, 50, 100);
    const countRow = await db.get(
      "SELECT COUNT(*) as c FROM attendance_attendance WHERE user_id=? AND status <> 'rejected'",
      [userId]
    );
    const total = Number(countRow?.c || 0);

    const rows = await db.all(
      `SELECT * FROM attendance_attendance 
       WHERE user_id=? AND status <> 'rejected' 
       ORDER BY date DESC, punch_in_time DESC 
       LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );

    const daily = rows.map((att) => {
      const punchInIso = dbTimeToIso(att.punch_in_time);
      const punchOutIso = dbTimeToIso(att.punch_out_time);
      const workHours = toHours(punchInIso, punchOutIso, att.status);
      return {
        id: att.id,
        date: att.date,
        punch_in: att.punch_in_status === "pending"
          ? "Pending"
          : (punchInIso ? new Date(punchInIso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : null),
        punch_out: att.punch_out_status === "pending"
          ? "Pending"
          : (punchOutIso ? new Date(punchOutIso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : (att.punch_in_time ? "Pending" : null)),
        work_hours: workHours,
        status: att.status,
        punch_in_outside: Boolean(att.punch_in_outside),
        punch_out_outside: Boolean(att.punch_out_outside),
        punch_in_photo: storageService.getUrl(att.punch_in_photo),
        punch_out_photo: storageService.getUrl(att.punch_out_photo),
      };
    });

    return formatPaginationResponse(daily, total, page, limit, { records: daily });
  }
};

export default attendanceService;
