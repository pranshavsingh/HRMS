import leaveRepository from "../repositories/leave.repository.js";
import accountsRepository from "../repositories/accounts.repository.js";
import attendanceRepository from "../repositories/attendance.repository.js";
import { realtimeManager } from "../utils/realtime.js";
import auditService from "./audit.service.js";
import { AppError } from "../middleware/errorHandler.js";
import { db } from "../db/index.js";
import { parsePagination, formatPaginationResponse } from "../utils/pagination.js";

function fullName(user) {
  const name = `${user.first_name || ""} ${user.last_name || ""}`.trim();
  return name || user.username;
}

function leaveDays(fromDate, toDate) {
  const from = new Date(fromDate);
  const to = new Date(toDate);
  return Math.max(0, Math.floor((to - from) / (1000 * 60 * 60 * 24)) + 1);
}

function approvalRoute(requestor, managerName) {
  if (requestor.role === "employee") return managerName ? "Manager / HR / Admin / Superadmin" : "HR / Admin / Superadmin";
  if (requestor.role === "manager") return "HR / Admin / Superadmin";
  if (requestor.role === "hr") return "Admin / Superadmin";
  if (requestor.role === "admin") return "Superadmin";
  return "Not applicable";
}

function canReview(viewer, leave, requestor, managerId) {
  if (leave.status !== "pending") return false;
  if (Number(requestor.id) === Number(viewer.id)) return false;

  if (requestor.role === "employee") {
    if (viewer.role === "manager" && Number(managerId) === Number(viewer.id)) return true;
    if (["hr", "admin", "superadmin"].includes(viewer.role)) return true;
  }
  if (requestor.role === "manager") {
    if (["hr", "admin", "superadmin"].includes(viewer.role)) return true;
  }
  if (requestor.role === "hr") {
    if (["admin", "superadmin"].includes(viewer.role)) return true;
  }
  if (requestor.role === "admin") {
    if (viewer.role === "superadmin") return true;
  }
  return false;
}

function serializeLeave(leave, requestor, profile, manager, viewer = null) {
  const managerName = manager ? fullName(manager) : null;
  return {
    id: leave.id,
    employee: requestor.username,
    employee_name: fullName(requestor),
    employee_email: requestor.email,
    employee_role: requestor.role,
    team_name: profile?.team_name || null,
    reporting_manager: managerName,
    type: leave.leave_type,
    from: leave.from_date,
    to: leave.to_date,
    days: leaveDays(leave.from_date, leave.to_date),
    reason: leave.reason,
    status: leave.status,
    created_at: leave.created_at,
    action_at: leave.action_at,
    action_by_name: leave.action_by_name || null,
    approval_route: approvalRoute(requestor, managerName),
    can_approve: viewer ? canReview(viewer, leave, requestor, profile?.manager_id) : false,
  };
}

export const leaveService = {
  async applyLeave(userId, leaveType, fromDate, toDate, reason) {
    await db.transaction(async (tx) => {
      const user = await db.get("SELECT id, is_active FROM accounts_user WHERE id = ? FOR UPDATE", [userId], tx);
      if (!user || !user.is_active) {
        throw new AppError("Active user account required", 400);
      }

      const overlapping = await leaveRepository.findOverlappingApprovedLeaves(userId, fromDate, toDate, tx);
      if (overlapping && overlapping.length > 0) {
        throw new AppError("You already have an approved leave during this date range", 400);
      }

      await leaveRepository.insertLeave(userId, leaveType, fromDate, toDate, reason, tx);
    });
    realtimeManager.broadcast("leave_update", { actorId: userId });
    return { message: "Leave applied" };
  },

  async myLeaves(userId, query = {}) {
    const { page, limit, offset } = parsePagination(query, 50, 100);
    const [total, leaves, allLeaves] = await Promise.all([
      leaveRepository.countLeavesByUserId(userId),
      leaveRepository.findLeavesPagedByUserId(userId, { limit, offset }),
      leaveRepository.findLeavesByUserId(userId)
    ]);

    const approvedDays = allLeaves.filter((l) => l.status === "approved").reduce((sum, l) => sum + leaveDays(l.from_date, l.to_date), 0);
    const profile = await accountsRepository.findProfileByUserId(userId);
    const leaveAllotted = Number(profile?.leave_allotted || 0);

    const roleLabels = {
      manager: "Manager",
      hr: "HR",
      admin: "Admin",
      superadmin: "Superadmin",
      employee: "Employee",
    };

    const records = leaves.map((l) => {
      let actionByName = null;
      if (l.action_by_username) {
        const name = `${l.action_by_first_name || ""} ${l.action_by_last_name || ""}`.trim() || l.action_by_username;
        const roleLabel = roleLabels[l.action_by_role] || l.action_by_role;
        actionByName = `${name} (${roleLabel})`;
      }

      return {
        id: l.id,
        user_id: l.user_id,
        leave_type: l.leave_type,
        from_date: l.from_date,
        to_date: l.to_date,
        reason: l.reason,
        status: l.status,
        created_at: l.created_at,
        action_at: l.action_at,
        action_by_id: l.action_by_id,
        type: l.leave_type,
        from: l.from_date,
        to: l.to_date,
        days: leaveDays(l.from_date, l.to_date),
        action_by_name: actionByName,
      };
    });

    return formatPaginationResponse(records, total, page, limit, {
      records,
      summary: {
        leave_allotted: leaveAllotted,
        leaves_taken: approvedDays,
        leave_balance: Math.max(leaveAllotted - approvedDays, 0),
        total_requests: total,
        approved_requests: allLeaves.filter((l) => l.status === "approved").length,
        pending_requests: allLeaves.filter((l) => l.status === "pending").length,
        rejected_requests: allLeaves.filter((l) => l.status === "rejected").length,
      },
    });
  },

  async approvals(role, viewerUserId, query = {}) {
    if (!["manager", "hr", "admin", "superadmin"].includes(role)) {
      return formatPaginationResponse([], 0, 1, 50, { records: [], summary: {} });
    }

    const { page, limit, offset } = parsePagination(query, 50, 100);
    const [total, leaves, allApprovals] = await Promise.all([
      leaveRepository.countLeavesForApprovals(role, viewerUserId),
      leaveRepository.findLeavesForApprovalsPaged(role, viewerUserId, { limit, offset }),
      leaveRepository.findLeavesForApprovals(role, viewerUserId)
    ]);

    const roleLabels = {
      manager: "Manager",
      hr: "HR",
      admin: "Admin",
      superadmin: "Superadmin",
      employee: "Employee",
    };

    const records = leaves.map((l) => {
      const requestor = { id: l.user_id_ref, username: l.username, first_name: l.first_name, last_name: l.last_name, email: l.email, role: l.role };
      const profile = { team_name: l.team_name, manager_id: l.manager_id };
      const manager = l.manager_username
        ? { username: l.manager_username, first_name: l.manager_first_name, last_name: l.manager_last_name }
        : null;
      let actionByName = null;
      if (l.action_by_username) {
        const name = `${l.action_by_first_name || ""} ${l.action_by_last_name || ""}`.trim() || l.action_by_username;
        const roleLabel = roleLabels[l.action_by_role] || l.action_by_role;
        actionByName = `${name} (${roleLabel})`;
      }
      const viewerUser = { id: viewerUserId, role };
      return serializeLeave({ ...l, action_by_name: actionByName }, requestor, profile, manager, viewerUser);
    });

    const scopeLabel = role === "manager"
      ? "Direct-report employee requests"
      : role === "hr"
        ? "Employee and manager leave requests"
        : role === "admin"
          ? "Employee, manager, and HR leave requests"
          : "All leave requests in the system";

    return formatPaginationResponse(records, total, page, limit, {
      records,
      summary: {
        scope_label: scopeLabel,
        total_requests: total,
        pending_requests: allApprovals.filter((r) => r.status === "pending").length,
        approved_requests: allApprovals.filter((r) => r.status === "approved").length,
        rejected_requests: allApprovals.filter((r) => r.status === "rejected").length,
        actionable_requests: allApprovals.filter((r) => r.status === "pending" && Number(r.user_id_ref) !== Number(viewerUserId)).length,
      },
    });
  },

  async action(leaveId, status, actor) {
    await db.transaction(async (tx) => {
      // 1. Lock the leave request row to prevent race conditions during concurrent approval
      const leave = await leaveRepository.findLeaveById(leaveId, tx, true);
      if (!leave) {
        throw new AppError("Leave request not found", 404);
      }

      const requestor = { id: leave.requestor_id, role: leave.requestor_role };
      const canApprove = canReview(actor, leave, requestor, leave.manager_id);
      
      if (!canApprove) {
        if (leave.status !== "pending") {
          const actionName = leave.action_by_username
            ? `${leave.action_by_first_name || ""} ${leave.action_by_last_name || ""}`.trim() || leave.action_by_username
            : "another reviewer";
          throw new AppError(`Leave already ${leave.status} by ${actionName}`, 400);
        }
        throw new AppError("Not allowed", 403);
      }

      if (leave.status !== "pending") {
        throw new AppError(`Leave already ${leave.status}`, 400);
      }

      // 2. Atomic conditional update: status must be pending
      const updateResult = await leaveRepository.updateLeave(leaveId, {
        status,
        action_by_id: actor.id
      }, tx, true);

      if (updateResult.changes === 0) {
        throw new AppError("Leave request is already processed", 400);
      }

      if (status === "approved") {
        const parseDate = (val) => {
          if (!val) return new Date();
          if (val instanceof Date) return val;
          if (typeof val === "string") {
            if (val.includes("T")) return new Date(val);
            return new Date(val + "T00:00:00");
          }
          return new Date(val);
        };
        const start = parseDate(leave.from_date);
        const end = parseDate(leave.to_date);
        const current = new Date(start);
        while (current <= end) {
          const yyyy = current.getFullYear();
          const mm = String(current.getMonth() + 1).padStart(2, "0");
          const dd = String(current.getDate()).padStart(2, "0");
          const dateStr = `${yyyy}-${mm}-${dd}`;
          
          await attendanceRepository.insertOrUpdateLeaveAttendance(leave.user_id, dateStr, tx);
          current.setDate(current.getDate() + 1);
        }
      }

      await auditService.log(
        actor,
        `leave_approval_${status}`,
        leaveId.toString(),
        { leave_type: leave.leave_type, from_date: leave.from_date, to_date: leave.to_date },
        null,
        tx
      );
    });

    realtimeManager.broadcast("leave_update", { actorId: actor.id });
    return { message: `Leave ${status} successfully` };
  }
};

export default leaveService;
