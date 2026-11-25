import leaveRepository from "../repositories/leave.repository.js";
import attendanceRepository from "../repositories/attendance.repository.js";
import { realtimeManager } from "../utils/realtime.js";
import auditService from "./audit.service.js";
import { AppError } from "../middleware/errorHandler.js";
import { db } from "../db/index.js";
import { parsePagination, formatPaginationResponse } from "../utils/pagination.js";
import { siteService } from "./site.service.js";
import { financialLeaveService } from "./financial-leave.service.js";
import logger from "../utils/logger.js";

function fullName(user) {
  const name = `${user.first_name || ""} ${user.last_name || ""}`.trim();
  return name || user.username;
}

function leaveDays(fromDate, toDate) {
  const from = new Date(`${dateOnly(fromDate)}T00:00:00Z`);
  const to = new Date(`${dateOnly(toDate)}T00:00:00Z`);
  return Math.max(0, Math.floor((to - from) / (1000 * 60 * 60 * 24)) + 1);
}

function dateOnly(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function daysThrough(fromDate, toDate, asOf) {
  const end = dateOnly(toDate) > asOf ? asOf : dateOnly(toDate);
  return end < dateOnly(fromDate) ? 0 : leaveDays(fromDate, end);
}

async function balanceFor(userId, tenantId, leaveType = null, asOf = new Date().toISOString().slice(0, 10), tx = null) {
  const result = await financialLeaveService.getBalance(userId, tenantId, leaveType, asOf, tx);
  return {
    ...result,
    leaves_used: result.leaves_used,
    available_balance: result.available_balance,
  };
}

export function calculateLeaveBalance({ baseEntitlement = 0, concessions = [], leaves = [], leaveType = null, asOf = new Date().toISOString().slice(0, 10) }) {
  const validConcessions = concessions.filter((c) => dateOnly(c.effective_date) <= asOf && (!c.expiry_date || dateOnly(c.expiry_date) >= asOf));
  const typedConcessions = validConcessions.filter((c) => leaveType == null || c.leave_type === leaveType)
    .reduce((sum, c) => sum + Number(c.adjustment_days), 0);
  const approvedDays = leaves.filter((l) => l.status === "approved")
    .reduce((sum, l) => sum + daysThrough(l.from_date, l.to_date, asOf), 0);
  const pending = leaves.filter((l) => l.status === "pending");
  return {
    base_entitlement: Number(baseEntitlement || 0),
    management_concession: typedConcessions,
    leaves_used: approvedDays,
    pending_days: pending.reduce((sum, l) => sum + leaveDays(l.from_date, l.to_date), 0),
    pending_requests: pending.length,
    available_balance: Number(baseEntitlement || 0) + typedConcessions - approvedDays,
  };
}

function assertConcessionManager(actor) {
  if (!['hr', 'admin', 'superadmin'].includes(actor.role)) throw new AppError('Not allowed to grant leave concessions', 403);
}

function approvalRoute(requestor, managerName) {
  if (requestor.role === "employee") return managerName ? "Manager / HR / Admin / Superadmin" : "HR / Admin / Superadmin";
  if (requestor.role === "manager") return "HR / Admin / Superadmin";
  if (requestor.role === "hr") return "Admin / Superadmin";
  if (requestor.role === "admin") return "Superadmin";
  return "Not applicable";
}

function canReview(viewer, leave, requestor, managerId, matchingTeam = false) {
  if (leave.status !== "pending") return false;
  if (Number(requestor.id) === Number(viewer.id)) return false;

  if (requestor.role === "employee") {
    if (viewer.role === "manager" && (Number(managerId) === Number(viewer.id) || matchingTeam)) return true;
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
    site_id: leave.site_id == null ? null : Number(leave.site_id),
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
  async applyLeave(userId, leaveType, fromDate, toDate, reason, tenantId = 1, confirmInsufficient = false, confirmedSnapshot = {}) {
    const requestedDays = leaveDays(fromDate, toDate);
    const result = await db.transaction(async (tx) => {
      const user = await db.get("SELECT id, is_active FROM accounts_user WHERE id = ? FOR UPDATE", [userId], tx);
      if (!user || !user.is_active) {
        throw new AppError("Active user account required", 400);
      }
      const tenantMembership = await db.get("SELECT 1 AS present FROM workforce_user_tenant WHERE tenant_id=? AND user_id=? AND is_active=1", [tenantId, userId], tx);
      if (!tenantMembership) throw new AppError("User is not part of this organization", 403);

      const profile = await tx.get("SELECT user_id,joining_date,team_name,designation FROM accounts_employeeprofile WHERE user_id=? FOR UPDATE", [userId]);
      const portions = await financialLeaveService.splitFinancialYearDays(tenantId, fromDate, toDate, tx);
      const projectedSegments = [];
      for (const portion of portions) {
        const { policy, type } = await financialLeaveService.leaveTypePolicy(tenantId, portion.financial_year_start, leaveType, tx);
        if (policy && !policy.legacy_shared_pool_enabled) {
          if (!type || !type.active_status) throw new AppError(`Leave type ${leaveType} is not active for the selected financial year`, 400);
          if (requestedDays < Number(type.minimum_application_days || 1)) throw new AppError(`Minimum application for ${type.leave_name} is ${type.minimum_application_days} day(s)`, 400);
          if (type.maximum_consecutive_days != null && requestedDays > Number(type.maximum_consecutive_days)) throw new AppError(`Maximum consecutive ${type.leave_name} leave is ${type.maximum_consecutive_days} day(s)`, 400);
          let rules = type.eligibility_rules || {};
          if (typeof rules === "string") {
            try { rules = JSON.parse(rules || "{}"); } catch { throw new AppError(`Eligibility rules for ${type.leave_name} are invalid`, 409); }
          }
          const allowedTeams = rules.allowed_teams || rules.teams;
          const allowedDesignations = rules.allowed_designations || rules.designations;
          if (Array.isArray(allowedTeams) && allowedTeams.length && !allowedTeams.includes(profile?.team_name)) throw new AppError(`You are not eligible for ${type.leave_name} under the team policy`, 403);
          if (Array.isArray(allowedDesignations) && allowedDesignations.length && !allowedDesignations.includes(profile?.designation)) throw new AppError(`You are not eligible for ${type.leave_name} under the designation policy`, 403);
          if (Number(type.probation_restriction_months) > 0 && profile?.joining_date) {
            const eligibleDate = new Date(`${dateOnly(profile.joining_date)}T00:00:00Z`);
            eligibleDate.setUTCMonth(eligibleDate.getUTCMonth() + Number(type.probation_restriction_months));
            if (dateOnly(fromDate) < dateOnly(eligibleDate)) throw new AppError(`${type.leave_name} is unavailable until your probation restriction ends`, 403);
          }
        }
        const asOf = dateOnly(fromDate) > portion.financial_year_start ? dateOnly(fromDate) : portion.financial_year_start;
        const balance = await balanceFor(userId, tenantId, leaveType, asOf, tx);
        projectedSegments.push({
          financial_year_start: portion.financial_year_start,
          current_available_balance: balance.available_balance,
          requested_days: portion.days,
          projected_balance: balance.available_balance - portion.days,
        });
      }
      const currentAvailable = projectedSegments.reduce((sum, item) => sum + item.current_available_balance, 0);
      const projected = projectedSegments.reduce((sum, item) => sum + item.projected_balance, 0);
      const insufficient = projectedSegments.some((item) => item.projected_balance < 0);
      const snapshot = JSON.stringify(projectedSegments);
      const staleConfirmation = confirmInsufficient && confirmedSnapshot.serialized !== snapshot;
      if (insufficient && (!confirmInsufficient || staleConfirmation)) {
        throw new AppError("Insufficient Leave Balance", 409, {
          code: "INSUFFICIENT_LEAVE_BALANCE",
          error: "Insufficient Leave Balance",
          current_available_balance: currentAvailable,
          requested_days: requestedDays,
          projected_balance: projected,
          year_balances: projectedSegments,
          confirmation_snapshot: snapshot,
        });
      }

      const overlapping = await leaveRepository.findOverlappingApprovedLeaves(userId, tenantId, fromDate, toDate, tx);
      if (overlapping && overlapping.length > 0) {
        throw new AppError("You already have an approved leave during this date range", 400);
      }

      const siteId = await siteService.getEmployeeSiteId(tenantId, userId, new Date().toISOString().slice(0, 10), tx);
      await leaveRepository.insertLeave(userId, tenantId, leaveType, fromDate, toDate, reason, tx, siteId);
      return { current_available_balance: currentAvailable, requested_days: requestedDays, projected_balance: projected, year_balances: projectedSegments };
    });
    realtimeManager.broadcast(
      "leave_update",
      { actorId: userId, userId: Number(userId), action: "applied" },
      { targetRoles: ["hr", "admin", "superadmin", "manager"], targetUserIds: [Number(userId)] }
    );
    return { message: "Leave applied", balance: result };
  },

  async myLeaves(userId, query = {}, tenantId = 1) {
    const { page, limit, offset } = parsePagination(query, 50, 100);
    const [total, leaves, allLeaves] = await Promise.all([
      leaveRepository.countLeavesByUserId(userId, tenantId),
      leaveRepository.findLeavesPagedByUserId(userId, tenantId, { limit, offset }),
      leaveRepository.findLeavesByUserId(userId, tenantId)
    ]);

    const balance = await balanceFor(userId, tenantId);
    const approvedDays = balance.leaves_used;
    const leaveAllotted = balance.base_entitlement;

    const roleLabels = {
      manager: "Manager",
      hr: "HR",
      admin: "Admin",
      superadmin: "Superadmin",
      employee: "Employee",
    };

    const records = await Promise.all(leaves.map(async (l) => {
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
    }));

    return formatPaginationResponse(records, total, page, limit, {
      records,
      summary: {
        leave_allotted: leaveAllotted,
        leaves_taken: approvedDays,
        leave_balance: balance.available_balance,
        management_concession: balance.management_concession,
        pending_leave_days: balance.pending_days,
        total_requests: total,
        approved_requests: allLeaves.filter((l) => l.status === "approved").length,
        pending_requests: allLeaves.filter((l) => l.status === "pending").length,
        rejected_requests: allLeaves.filter((l) => l.status === "rejected").length,
      },
    });
  },

  async approvals(role, viewerUserId, query = {}, tenantId = 1) {
    if (!["manager", "hr", "admin", "superadmin"].includes(role)) {
      return formatPaginationResponse([], 0, 1, 50, { records: [], summary: {} });
    }

    const siteScope = await siteService.getSiteScope(tenantId, { id: viewerUserId, role }, query.site_id || null);
    const sourceRows = await leaveRepository.findLeavesForApprovals(role, viewerUserId, tenantId);
    const allApprovals = [];
    for (const row of sourceRows) {
      const member = await db.get("SELECT 1 AS present FROM workforce_user_tenant WHERE tenant_id=? AND user_id=? AND is_active=1", [tenantId, row.user_id_ref]);
      if (!member) continue;
      const siteId = row.site_id == null
        ? await siteService.getEmployeeSiteId(tenantId, row.user_id_ref, dateOnly(row.created_at))
        : Number(row.site_id);
      if (siteScope.unassigned ? siteId !== null : (siteScope.siteIds && !siteScope.siteIds.includes(siteId))) continue;
      allApprovals.push({ ...row, site_id: siteId });
    }

    // Apply server-side filters on authorized scoped records before pagination
    let filteredApprovals = allApprovals;
    if (query.status && query.status !== "all") {
      filteredApprovals = filteredApprovals.filter((r) => r.status === query.status);
    }
    if (query.role && query.role !== "all") {
      filteredApprovals = filteredApprovals.filter((r) => r.role === query.role);
    }
    if (query.search && query.search.trim()) {
      const q = query.search.trim().toLowerCase();
      filteredApprovals = filteredApprovals.filter((r) => {
        const empName = `${r.first_name || ""} ${r.last_name || ""}`.trim() || r.username;
        const managerName = `${r.manager_first_name || ""} ${r.manager_last_name || ""}`.trim() || r.manager_username || "";
        const actionByName = `${r.action_by_first_name || ""} ${r.action_by_last_name || ""}`.trim() || r.action_by_username || "";
        return [
          r.id,
          r.user_id_ref,
          r.username,
          empName,
          r.email,
          r.role,
          r.team_name,
          r.designation,
          managerName,
          r.leave_type,
          r.reason,
          actionByName,
          r.status,
        ]
          .filter(Boolean)
          .some((val) => String(val).toLowerCase().includes(q));
      });
    }

    const defaultLimit = Number(query.limit) > 0 ? Number(query.limit) : 15;
    const { page, limit, offset } = parsePagination(query, defaultLimit, 100);
    const total = filteredApprovals.length;
    const leaves = filteredApprovals.slice(offset, offset + limit);

    const roleLabels = {
      manager: "Manager",
      hr: "HR",
      admin: "Admin",
      superadmin: "Superadmin",
      employee: "Employee",
    };

    const records = await Promise.all(leaves.map(async (l) => {
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
      const serialized = serializeLeave({ ...l, action_by_name: actionByName }, requestor, profile, manager, viewerUser);
      const balance = await balanceFor(l.user_id_ref, tenantId, l.leave_type, dateOnly(l.from_date));
      return {
        ...serialized,
        employee_id: Number(l.user_id_ref),
        designation: l.designation || null,
        application_date: l.created_at,
        balance: {
          ...balance,
          requested_days: serialized.days,
          projected_balance: balance.available_balance - serialized.days,
        },
      };
    }));

    const scopeLabel = role === "manager"
      ? "Direct-report employee requests"
      : role === "hr"
        ? "Employee and manager leave requests"
        : role === "admin"
          ? "Employee, manager, and HR leave requests"
          : "All leave requests in the system";

    const managerProfile = role === "manager" ? await db.get("SELECT team_name FROM accounts_employeeprofile WHERE user_id = ?", [viewerUserId]) : null;
    const managerTeamName = managerProfile?.team_name || null;

    return formatPaginationResponse(records, total, page, limit, {
      records,
      all_records: filteredApprovals,
      summary: {
        scope_label: scopeLabel,
        total_requests: allApprovals.length,
        pending_requests: allApprovals.filter((r) => r.status === "pending").length,
        approved_requests: allApprovals.filter((r) => r.status === "approved").length,
        rejected_requests: allApprovals.filter((r) => r.status === "rejected").length,
        actionable_requests: allApprovals.filter((r) => r.status === "pending" && canReview({ id: viewerUserId, role }, r, { id: r.user_id_ref, role: r.role }, r.manager_id, Boolean(managerTeamName && r.team_name && r.team_name === managerTeamName))).length,
      },
    });
  },

  async action(leaveId, status, actor, tenantId = 1) {
    const actionResult = await db.transaction(async (tx) => {
      // Lock the employee allocation row as well as the request to serialize approvals and grants.
      const leave = await leaveRepository.findLeaveById(leaveId, tenantId, tx, true);
      if (!leave) {
        throw new AppError("Leave request not found", 404);
      }
      const member = await tx.get("SELECT 1 AS present FROM workforce_user_tenant WHERE tenant_id=? AND user_id=? AND is_active=1", [tenantId, leave.user_id]);
      if (!member) throw new AppError("Leave request not found in this organization", 404);

      let matchingTeam = false;
      if (actor.role === "manager") {
        const teamCheck = await tx.get(
          `SELECT 1 as allowed FROM accounts_employeeprofile ep
           LEFT JOIN accounts_employeeprofile mgr_ep ON mgr_ep.user_id = ?
           WHERE ep.user_id = ? AND (
             ep.manager_id = ? 
             OR (ep.team_name IS NOT NULL AND ep.team_name != '' AND ep.team_name = mgr_ep.team_name)
           )`,
          [actor.id, leave.user_id, actor.id]
        );
        matchingTeam = Boolean(teamCheck);
      }

      const requestor = { id: leave.requestor_id, role: leave.requestor_role };
      const canApprove = canReview(actor, leave, requestor, leave.manager_id, matchingTeam);

      if (!canApprove) {
        if (leave.status !== "pending") {
          const actionName = leave.action_by_username
            ? `${leave.action_by_first_name || ""} ${leave.action_by_last_name || ""}`.trim() || leave.action_by_username
            : "another reviewer";
          throw new AppError(`Leave already ${leave.status} by ${actionName}`, 400);
        }
        throw new AppError("Not allowed", 403);
      }

      await tx.get("SELECT user_id FROM accounts_employeeprofile WHERE user_id=? FOR UPDATE", [leave.user_id]);
      const balanceBefore = await balanceFor(leave.user_id, tenantId, leave.leave_type, dateOnly(leave.from_date), tx);

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

          const attendanceSiteId = await siteService.getEmployeeSiteId(tenantId, leave.user_id, dateStr, tx);
          await attendanceRepository.insertOrUpdateLeaveAttendance(leave.user_id, dateStr, tx, attendanceSiteId, tenantId);
          current.setDate(current.getDate() + 1);
        }
      }

      const financialYearTransactions = status === "approved"
        ? await financialLeaveService.recordApprovedLeave(tx, tenantId, leave.user_id, Number(leaveId), leave.leave_type, leave.from_date, leave.to_date, actor)
        : [];

      const balanceAfter = status === "approved"
        ? await balanceFor(leave.user_id, tenantId, leave.leave_type, dateOnly(leave.to_date), tx)
        : balanceBefore;
      const previousBalance = financialYearTransactions.length
        ? financialYearTransactions.reduce((sum, row) => sum + row.balance_before, 0)
        : balanceBefore.available_balance;
      const newBalance = financialYearTransactions.length
        ? financialYearTransactions.reduce((sum, row) => sum + row.balance_after, 0)
        : balanceAfter.available_balance;

      await auditService.log(
        actor,
        `leave_approval_${status}`,
        leaveId.toString(),
        {
          leave_type: leave.leave_type, from_date: leave.from_date, to_date: leave.to_date,
          previous_balance: previousBalance,
          adjustment_amount: status === "approved" ? -leaveDays(leave.from_date, leave.to_date) : 0,
          new_balance: newBalance,
          financial_year_transactions: financialYearTransactions,
        },
        null,
        tx
      );
      return {
        employeeId: Number(leave.user_id),
        leaveType: leave.leave_type,
        days: leaveDays(leave.from_date, leave.to_date),
        balance: newBalance,
      };
    });

    realtimeManager.broadcast(
      "leave_update",
      { actorId: actor.id, userId: actionResult.employeeId, action: status },
      { targetRoles: ["hr", "admin", "superadmin", "manager"], targetUserIds: [actionResult.employeeId] }
    );
    realtimeManager.broadcast("leave_notice", {
      status,
      leave_id: Number(leaveId),
      leave_type: actionResult.leaveType,
      days: actionResult.days,
      updated_balance: actionResult.balance,
    }, { targetUserIds: [actionResult.employeeId] });
    return { message: `Leave ${status} successfully` };
  },

  async grantConcession(input, actor, tenantId = 1) {
    assertConcessionManager(actor);
    const employeeId = Number(input.employee_id);
    if (!Number.isSafeInteger(employeeId) || employeeId <= 0 || employeeId === Number(actor.id)) throw new AppError("Choose another valid employee", 400);
    if (!input.reason?.trim()) throw new AppError("A reason is required", 400);
    const effective = dateOnly(input.effective_date);
    const expiry = input.expiry_date ? dateOnly(input.expiry_date) : null;
    if (expiry && expiry < effective) throw new AppError("Expiry date must be on or after the effective date", 400);
    await siteService.ensureEmployeeVisible(tenantId, actor, employeeId);
    const result = await db.transaction(async (tx) => {
      const member = await tx.get(`SELECT u.role FROM workforce_user_tenant w
        JOIN accounts_user u ON u.id=w.user_id WHERE w.tenant_id=? AND w.user_id=? AND w.is_active=1 AND u.is_active=1`, [tenantId, employeeId]);
      if (!member) throw new AppError("Employee not found in this organization", 404);
      if (member.role !== "employee") throw new AppError("Concessions can only be granted to employee accounts", 400);
      await tx.get("SELECT user_id FROM accounts_employeeprofile WHERE user_id=? FOR UPDATE", [employeeId]);
      const duplicate = await tx.get("SELECT id FROM leave_concession_ledger WHERE tenant_id=? AND user_id=? AND idempotency_key=?", [tenantId, employeeId, input.idempotency_key]);
      if (duplicate) return { id: Number(duplicate.id), duplicate: true };
      const before = await balanceFor(employeeId, tenantId, input.leave_type, effective, tx);
      const amount = Number(input.additional_days);
      const after = before.available_balance + amount;
      const inserted = await tx.run(
        `INSERT INTO leave_concession_ledger
         (tenant_id,user_id,leave_type,adjustment_days,effective_date,expiry_date,reason,granted_by_id,created_at,balance_before,balance_after,idempotency_key)
         VALUES (?,?,?,?,?,?,?,?,NOW(),?,?,?)`,
        [tenantId, employeeId, input.leave_type, amount, effective, expiry, input.reason.trim(), actor.id, before.available_balance, after, input.idempotency_key]
      );
      await auditService.log(actor, "leave_concession_granted", String(inserted.lastID), {
        employee_id: employeeId, leave_type: input.leave_type, previous_balance: before.available_balance,
        adjustment_amount: amount, new_balance: after, reason: input.reason.trim(), effective_date: effective, expiry_date: expiry,
      }, null, tx);
      const currentBalance = await balanceFor(employeeId, tenantId, input.leave_type, new Date().toISOString().slice(0, 10), tx);
      return { id: Number(inserted.lastID), duplicate: false, balance: currentBalance.available_balance };
    });
    if (!result.duplicate) {
      try {
        realtimeManager.broadcast(
          "leave_update",
          { actorId: actor.id, userId: employeeId, action: "concession_granted" },
          { tenantId, targetRoles: ["hr", "admin", "superadmin", "manager"], targetUserIds: [employeeId] }
        );
        realtimeManager.broadcast(
          "leave_notice",
          { status: "concession_granted", leave_type: input.leave_type, additional_days: Number(input.additional_days), updated_balance: result.balance },
          { tenantId, targetUserIds: [employeeId] }
        );
      } catch (rtErr) {
        logger.warn("[grantConcession] realtime broadcast failed: %s", rtErr.message);
      }
    }
    return { message: result.duplicate ? "Concession was already processed" : "Leave concession granted", ...result };
  },

  async reverseConcession(concessionId, input, actor, tenantId = 1) {
    assertConcessionManager(actor);
    const parsedConcessionId = Number(concessionId);
    if (!Number.isSafeInteger(parsedConcessionId) || parsedConcessionId <= 0) {
      throw new AppError("Invalid concession ID", 400);
    }
    const result = await db.transaction(async (tx) => {
      const grant = await tx.get("SELECT * FROM leave_concession_ledger WHERE id=? AND tenant_id=? FOR UPDATE", [parsedConcessionId, tenantId]);
      if (!grant || grant.reverses_id) throw new AppError("Original concession not found", 404);
      if (Number(grant.user_id) === Number(actor.id)) throw new AppError("You cannot reverse your own concession", 403);
      await siteService.ensureEmployeeVisible(tenantId, actor, Number(grant.user_id));
      const duplicate = await tx.get("SELECT id FROM leave_concession_ledger WHERE tenant_id=? AND user_id=? AND idempotency_key=?", [tenantId, grant.user_id, input.idempotency_key]);
      if (duplicate) return { id: Number(duplicate.id), duplicate: true, employeeId: Number(grant.user_id) };
      const alreadyReversed = await tx.get("SELECT id FROM leave_concession_ledger WHERE reverses_id=?", [grant.id]);
      if (alreadyReversed) throw new AppError("Concession has already been reversed", 409);
      await tx.get("SELECT user_id FROM accounts_employeeprofile WHERE user_id=? FOR UPDATE", [grant.user_id]);
      const before = await balanceFor(grant.user_id, tenantId, grant.leave_type, new Date().toISOString().slice(0, 10), tx);
      const amount = -Number(grant.adjustment_days);
      const today = new Date().toISOString().slice(0, 10);
      const activeToday = dateOnly(grant.effective_date) <= today && (!grant.expiry_date || dateOnly(grant.expiry_date) >= today);
      const after = before.available_balance + (activeToday ? amount : 0);
      const inserted = await tx.run(
        `INSERT INTO leave_concession_ledger
         (tenant_id,user_id,leave_type,adjustment_days,effective_date,expiry_date,reason,granted_by_id,created_at,balance_before,balance_after,idempotency_key,reverses_id)
         VALUES (?,?,?,?,?,?,?,?,NOW(),?,?,?,?)`,
        [tenantId, grant.user_id, grant.leave_type, amount, grant.effective_date, grant.expiry_date, `Reversal: ${input.reason.trim()}`, actor.id, before.available_balance, after, input.idempotency_key, grant.id]
      );
      await auditService.log(actor, "leave_concession_reversed", String(inserted.lastID), {
        employee_id: Number(grant.user_id), leave_type: grant.leave_type, previous_balance: before.available_balance,
        adjustment_amount: amount, new_balance: after, reason: input.reason.trim(), related_concession_id: Number(grant.id),
      }, null, tx);
      const currentBalance = await balanceFor(grant.user_id, tenantId, grant.leave_type, new Date().toISOString().slice(0, 10), tx);
      return { id: Number(inserted.lastID), duplicate: false, employeeId: Number(grant.user_id), balance: currentBalance.available_balance };
    });
    if (!result.duplicate) {
      try {
        realtimeManager.broadcast(
          "leave_update",
          { actorId: actor.id, userId: result.employeeId, action: "concession_reversed" },
          { tenantId, targetRoles: ["hr", "admin", "superadmin", "manager"], targetUserIds: [result.employeeId] }
        );
        if (result.employeeId) {
          realtimeManager.broadcast(
            "leave_notice",
            { status: "concession_reversed", updated_balance: result.balance },
            { tenantId, targetUserIds: [result.employeeId] }
          );
        }
      } catch (rtErr) {
        logger.warn("[reverseConcession] realtime broadcast failed: %s", rtErr.message);
      }
    }
    return { message: result.duplicate ? "Concession reversal was already processed" : "Concession reversal recorded", ...result };
  },

  async concessionsForEmployee(employeeId, actor, tenantId = 1) {
    assertConcessionManager(actor);
    const id = Number(employeeId);
    if (!Number.isSafeInteger(id) || id <= 0) throw new AppError("Invalid employee", 400);
    await siteService.ensureEmployeeVisible(tenantId, actor, id);
    return db.all(`SELECT c.*, u.username AS granted_by_username, u.first_name AS granted_by_first_name, u.last_name AS granted_by_last_name
      FROM leave_concession_ledger c JOIN accounts_user u ON u.id=c.granted_by_id
      WHERE c.tenant_id=? AND c.user_id=? ORDER BY c.created_at DESC`, [tenantId, id]);
  }
};

export default leaveService;
