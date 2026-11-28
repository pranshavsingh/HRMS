import { db } from "../db/index.js";
import { AppError } from "../middleware/errorHandler.js";
import { parsePagination, formatPaginationResponse } from "../utils/pagination.js";
import { siteService } from "./site.service.js";
import storageService from "./storage.service.js";
import attendanceService from "./attendance.service.js";

function getCompanyLocalDateString(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function ymd(val) {
  if (!val) return "";
  if (val instanceof Date) {
    return val.toISOString().slice(0, 10);
  }
  return String(val).slice(0, 10);
}

function dbTimeToIso(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString();
  const s = String(val).trim();
  if (!s) return null;
  if (s.includes("T") && (s.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(s))) return s;
  const normalized = s.includes(" ") ? s.replace(" ", "T") : s;
  const d = new Date(normalized.endsWith("Z") ? normalized : `${normalized}Z`);
  return Number.isNaN(d.getTime()) ? s : d.toISOString();
}

function fullName(row) {
  const name = `${row?.first_name || ""} ${row?.last_name || ""}`.trim();
  return name || row?.username || "Employee";
}

function formatEmployeeCode(id) {
  return `EMP-${String(id).padStart(4, "0")}`;
}

function buildManagerTeamWhere({ actor, tenantId, siteScope, search = "", department = "", targetDate }) {
  const isGlobalViewer = ["hr", "admin", "superadmin"].includes(actor.role);
  const conditions = [
    "u.deleted_at IS NULL",
    "u.is_active = 1",
    "EXISTS (SELECT 1 FROM workforce_user_tenant wut WHERE wut.tenant_id = ? AND wut.user_id = u.id AND wut.is_active = 1)",
  ];
  const params = [tenantId];

  if (!isGlobalViewer) {
    conditions.push("u.id != ?");
    conditions.push("ep.is_active_employee = 1");
    conditions.push(
      `(ep.manager_id = ? OR (ep.team_name IS NOT NULL AND ep.team_name != '' AND ep.team_name = (
        SELECT mgr_ep.team_name FROM accounts_employeeprofile mgr_ep WHERE mgr_ep.user_id = ? LIMIT 1
      )))`
    );
    params.push(actor.id, actor.id, actor.id);
  } else {
    conditions.push("(ep.user_id IS NULL OR ep.is_active_employee = 1)");
  }

  if (department && department !== "all") {
    conditions.push("ep.team_name = ?");
    params.push(department);
  }

  if (search && search.trim()) {
    const q = `%${search.trim().toLowerCase()}%`;
    const numericId = Number(search.trim().replace(/^emp-?/i, ""));
    if (Number.isInteger(numericId) && numericId > 0) {
      conditions.push("(LOWER(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))) LIKE ? OR LOWER(u.username) LIKE ? OR u.id = ?)");
      params.push(q, q, numericId);
    } else {
      conditions.push("(LOWER(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))) LIKE ? OR LOWER(u.username) LIKE ?)");
      params.push(q, q);
    }
  }

  if (siteScope.unassigned) {
    conditions.push(
      `NOT EXISTS (SELECT 1 FROM workforce_employee_site_assignment esa
       WHERE esa.tenant_id = ? AND esa.user_id = u.id AND esa.effective_from <= ?
         AND (esa.effective_to IS NULL OR esa.effective_to >= ?))`
    );
    params.push(tenantId, targetDate, targetDate);
  } else if (Array.isArray(siteScope.siteIds)) {
    if (siteScope.siteIds.length === 0) {
      conditions.push("1 = 0");
    } else {
      conditions.push(
        `EXISTS (SELECT 1 FROM workforce_employee_site_assignment esa
         WHERE esa.tenant_id = ? AND esa.user_id = u.id
           AND esa.site_id IN (${siteScope.siteIds.map(() => "?").join(",")})
           AND esa.effective_from <= ? AND (esa.effective_to IS NULL OR esa.effective_to >= ?))`
      );
      params.push(tenantId, ...siteScope.siteIds, targetDate, targetDate);
    }
  }

  return { whereClause: conditions.join(" AND "), params };
}

export const managerTeamService = {
  async getTeamMembers(actor, query = {}, tenantId = 1) {
    if (!["manager", "hr", "admin", "superadmin"].includes(actor.role)) {
      throw new AppError("Manager permissions required", 403);
    }
    const todayStr = getCompanyLocalDateString(new Date());
    const siteScope = await siteService.getSiteScope(tenantId, actor, query.site_id || null);
    const { whereClause, params } = buildManagerTeamWhere({
      actor,
      tenantId,
      siteScope,
      search: query.search || "",
      department: query.department || "",
      targetDate: todayStr,
    });

    const countRow = await db.get(
      `SELECT COUNT(*) AS cnt
       FROM accounts_user u
       LEFT JOIN accounts_employeeprofile ep ON ep.user_id = u.id
       WHERE ${whereClause}`,
      params
    );
    const total = Number(countRow?.cnt || 0);
    const { page, limit, offset } = parsePagination(query, 20, 100);

    const rows = await db.all(
      `SELECT u.id, u.username, u.first_name, u.last_name, u.role,
              ep.team_name, ep.designation, ep.profile_picture, ep.manager_id,
              m.first_name AS mgr_first, m.last_name AS mgr_last, m.username AS mgr_username
       FROM accounts_user u
       LEFT JOIN accounts_employeeprofile ep ON ep.user_id = u.id
       LEFT JOIN accounts_user m ON m.id = ep.manager_id
       WHERE ${whereClause}
       ORDER BY u.first_name ASC, u.username ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const deptScope = buildManagerTeamWhere({
      actor,
      tenantId,
      siteScope,
      targetDate: todayStr,
    });
    const deptRows = await db.all(
      `SELECT DISTINCT ep.team_name
       FROM accounts_user u
       LEFT JOIN accounts_employeeprofile ep ON ep.user_id = u.id
       WHERE ${deptScope.whereClause} AND ep.team_name IS NOT NULL AND ep.team_name != ''
       ORDER BY ep.team_name ASC`,
      deptScope.params
    );

    const records = rows.map((r) => ({
      id: Number(r.id),
      employee_code: formatEmployeeCode(r.id),
      name: fullName(r),
      username: r.username,
      role: r.role,
      designation: r.designation || null,
      department: r.team_name || null,
      profile_picture: r.profile_picture ? storageService.getUrl(r.profile_picture) : null,
      reporting_manager: r.mgr_username
        ? `${r.mgr_first || ""} ${r.mgr_last || ""}`.trim() || r.mgr_username
        : null,
    }));

    return formatPaginationResponse(records, total, page, limit, {
      records,
      departments: deptRows.map((d) => d.team_name),
    });
  },

  async getTeamAttendanceByDate(actor, query = {}, tenantId = 1) {
    if (!["manager", "hr", "admin", "superadmin"].includes(actor.role)) {
      throw new AppError("Manager permissions required", 403);
    }

    const todayStr = getCompanyLocalDateString(new Date());
    const targetDate = query.date && /^\d{4}-\d{2}-\d{2}$/.test(query.date) ? query.date : todayStr;
    const isPastDate = targetDate < todayStr;
    const isFutureDate = targetDate > todayStr;

    const siteScope = await siteService.getSiteScope(tenantId, actor, query.site_id || null);

    // Fetch all authorized members (for accurate date summary + department list), filtered by department/search if provided
    const { whereClause, params } = buildManagerTeamWhere({
      actor,
      tenantId,
      siteScope,
      search: query.search || "",
      department: query.department || "",
      targetDate,
    });

    const sortDir = String(query.sort_dir || "asc").toLowerCase() === "desc" ? "DESC" : "ASC";
    const orderBy = query.sort_by === "employee_id" ? `u.id ${sortDir}` : `u.first_name ${sortDir}, u.username ${sortDir}`;

    const allMatchingMembers = await db.all(
      `SELECT u.id, u.username, u.first_name, u.last_name, u.role,
              ep.team_name, ep.designation, ep.profile_picture, ep.manager_id,
              m.first_name AS mgr_first, m.last_name AS mgr_last, m.username AS mgr_username
       FROM accounts_user u
       LEFT JOIN accounts_employeeprofile ep ON ep.user_id = u.id
       LEFT JOIN accounts_user m ON m.id = ep.manager_id
       WHERE ${whereClause}
       ORDER BY ${orderBy}`,
      params
    );

    const memberIds = allMatchingMembers.map((m) => Number(m.id));
    if (memberIds.length === 0) {
      const { page, limit } = parsePagination(query, 20, 100);
      return formatPaginationResponse([], 0, page, limit, {
        records: [],
        date: targetDate,
        departments: [],
        summary: {
          total_team_members: 0,
          present: 0,
          absent: 0,
          late_arrivals: 0,
          on_leave: 0,
          not_checked_in: 0,
        },
      });
    }

    const placeholders = memberIds.map(() => "?").join(",");

    const [attendanceRows, leaveRows, holidayRow, rosterRows] = await Promise.all([
      db.all(
        `SELECT * FROM attendance_attendance
         WHERE tenant_id = ? AND date = ? AND user_id IN (${placeholders})
         ORDER BY id DESC`,
        [tenantId, targetDate, ...memberIds]
      ),
      db.all(
        `SELECT user_id, leave_type, reason FROM leave_leave
         WHERE tenant_id = ? AND status = 'approved' AND from_date <= ? AND to_date >= ? AND user_id IN (${placeholders})`,
        [tenantId, targetDate, targetDate, ...memberIds]
      ),
      db.get(
        `SELECT name, is_optional FROM workforce_company_holiday
         WHERE tenant_id = ? AND holiday_date = ? LIMIT 1`,
        [tenantId, targetDate]
      ),
      db.all(
        `SELECT re.user_id, wopv.days_of_week
         FROM workforce_roster_entry re
         JOIN workforce_roster_header rh ON rh.id = re.roster_header_id AND rh.tenant_id = re.tenant_id AND rh.status = 'published'
         LEFT JOIN workforce_shift_version sv ON sv.id = re.shift_version_id AND sv.tenant_id = re.tenant_id
         LEFT JOIN workforce_weekly_off_policy_version wopv ON wopv.id = sv.weekly_off_policy_version_id
           AND wopv.tenant_id = sv.tenant_id AND wopv.status = 'published'
           AND wopv.effective_from <= ? AND (wopv.effective_to IS NULL OR wopv.effective_to >= ?)
         WHERE re.tenant_id = ? AND re.work_date = ? AND re.user_id IN (${placeholders})`,
        [targetDate, targetDate, tenantId, targetDate, ...memberIds]
      ),
    ]);

    const attByUser = new Map();
    const prio = { approved: 3, pending: 2, rejected: 1 };
    for (const a of attendanceRows) {
      const uid = Number(a.user_id);
      const existing = attByUser.get(uid);
      if (!existing || (prio[a.status] || 0) > (prio[existing.status] || 0)) {
        attByUser.set(uid, a);
      }
    }

    const leaveByUser = new Map(leaveRows.map((l) => [Number(l.user_id), l]));
    const rosterByUser = new Map(rosterRows.map((r) => [Number(r.user_id), r]));

    const targetDateObj = new Date(`${targetDate}T12:00:00Z`);
    const targetDayOfWeek = targetDateObj.getUTCDay();
    const isSunday = targetDayOfWeek === 0;

    const summary = {
      total_team_members: allMatchingMembers.length,
      present: 0,
      absent: 0,
      late_arrivals: 0,
      on_leave: 0,
      not_checked_in: 0,
    };

    const enrichedRows = [];
    for (const m of allMatchingMembers) {
      const uid = Number(m.id);
      const att = attByUser.get(uid);
      const lv = leaveByUser.get(uid);
      const roster = rosterByUser.get(uid);
      let isWeeklyOff = isSunday;
      if (roster && roster.days_of_week != null) {
        try {
          const parsedDays = typeof roster.days_of_week === "string"
            ? JSON.parse(roster.days_of_week)
            : roster.days_of_week;
          if (Array.isArray(parsedDays)) {
            isWeeklyOff = parsedDays.map(Number).includes(targetDayOfWeek);
          }
        } catch {
          isWeeklyOff = isSunday;
        }
      }

      let status = "not_checked_in";
      let statusCode = "--";
      let punchInTime = null;
      let punchOutTime = null;
      let workHours = 0;
      let lateMinutes = 0;
      let earlyDepartureMinutes = 0;
      let isLate = false;

      if (att && att.status !== "leave") {
        punchInTime = dbTimeToIso(att.punch_in_time);
        punchOutTime = dbTimeToIso(att.punch_out_time);
        workHours = Number(att.total_hours || 0);
        lateMinutes = Number(att.late_minutes || 0);
        earlyDepartureMinutes = Number(att.early_departure_minutes || 0);
        isLate = att.punctuality_status === "late" || lateMinutes > 0;

        if (att.status === "rejected") {
          status = "absent";
          statusCode = "RJ";
          summary.absent += 1;
        } else if (att.punch_in_time && att.punch_out_time && workHours > 0 && workHours < 4) {
          status = "half_day";
          statusCode = "HD";
          summary.present += 1;
          if (isLate) summary.late_arrivals += 1;
        } else if (isLate) {
          status = "late";
          statusCode = "P";
          summary.present += 1;
          summary.late_arrivals += 1;
        } else {
          status = "present";
          statusCode = att.punch_out_time ? "P" : "IP";
          summary.present += 1;
        }
      } else if (lv || att?.status === "leave") {
        status = "on_leave";
        statusCode = "L";
        summary.on_leave += 1;
      } else if (holidayRow) {
        status = "holiday";
        statusCode = "H";
      } else if (isWeeklyOff) {
        status = "weekly_off";
        statusCode = "WO";
      } else if (isPastDate && !isFutureDate) {
        status = "absent";
        statusCode = "A";
        summary.absent += 1;
      } else {
        status = "not_checked_in";
        statusCode = "--";
        summary.not_checked_in += 1;
      }

      enrichedRows.push({
        employee_id: uid,
        employee_code: formatEmployeeCode(uid),
        name: fullName(m),
        username: m.username,
        designation: m.designation || null,
        department: m.team_name || null,
        profile_picture: m.profile_picture ? storageService.getUrl(m.profile_picture) : null,
        reporting_manager: m.mgr_username
          ? `${m.mgr_first || ""} ${m.mgr_last || ""}`.trim() || m.mgr_username
          : null,
        date: targetDate,
        status,
        status_code: statusCode,
        is_late: isLate,
        late_minutes: lateMinutes,
        early_departure_minutes: earlyDepartureMinutes,
        punch_in_time: punchInTime,
        punch_out_time: punchOutTime,
        work_hours: workHours,
      });
    }

    const statusFilter = String(query.status || "all").toLowerCase();
    const filteredRows = statusFilter && statusFilter !== "all"
      ? enrichedRows.filter((r) => {
          if (statusFilter === "late") return r.is_late || r.status === "late";
          if (statusFilter === "present") return ["present", "late", "half_day"].includes(r.status);
          return r.status === statusFilter;
        })
      : enrichedRows;

    const totalFiltered = filteredRows.length;
    const { page, limit, offset } = parsePagination(query, 20, 100);
    const paginatedRecords = filteredRows.slice(offset, offset + limit);

    const departments = [...new Set(allMatchingMembers.map((m) => m.team_name).filter(Boolean))].sort();

    return formatPaginationResponse(paginatedRecords, totalFiltered, page, limit, {
      records: paginatedRecords,
      date: targetDate,
      departments,
      holiday: holidayRow ? { name: holidayRow.name, is_optional: Boolean(holidayRow.is_optional) } : null,
      summary,
    });
  },

  async getEmployeeMonthlyRegister(actor, employeeId, query = {}, tenantId = 1) {
    if (!["manager", "hr", "admin", "superadmin"].includes(actor.role)) {
      throw new AppError("Manager permissions required", 403);
    }
    const targetId = Number(employeeId);
    if (!Number.isInteger(targetId) || targetId < 1) {
      throw new AppError("Invalid employee ID", 400);
    }

    // Strict RBAC & Reporting Hierarchy Check
    await siteService.ensureEmployeeVisible(tenantId, actor, targetId, { requireDirectReport: false });

    const empRow = await db.get(
      `SELECT u.id, u.username, u.first_name, u.last_name, u.role,
              ep.team_name, ep.designation, ep.profile_picture, ep.manager_id,
              m.first_name AS mgr_first, m.last_name AS mgr_last, m.username AS mgr_username
       FROM accounts_user u
       LEFT JOIN accounts_employeeprofile ep ON ep.user_id = u.id
       LEFT JOIN accounts_user m ON m.id = ep.manager_id
       WHERE u.id = ?`,
      [targetId]
    );
    if (!empRow) throw new AppError("Employee not found", 404);

    const month = query.month || getCompanyLocalDateString(new Date()).slice(0, 7);
    const registerData = await attendanceService.myMonthlyRegister(targetId, month, tenantId);

    const [y, m] = month.split("-").map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const monthStartStr = `${y}-${String(m).padStart(2, "0")}-01`;
    const monthEndStr = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    const [attDetails, regApprovals] = await Promise.all([
      db.all(
        `SELECT a.id, a.date, a.punch_in_time, a.punch_out_time, a.total_hours,
                a.late_minutes, a.early_departure_minutes, a.punctuality_status,
                a.status, a.punch_in_status, a.punch_out_status, a.shift_version_id,
                s.name AS shift_name, sv.start_time AS shift_start, sv.end_time AS shift_end
         FROM attendance_attendance a
         LEFT JOIN workforce_shift_version sv ON sv.id = a.shift_version_id
         LEFT JOIN workforce_shift s ON s.id = sv.shift_id
         WHERE a.tenant_id = ? AND a.user_id = ? AND a.date BETWEEN ? AND ?`,
        [tenantId, targetId, monthStartStr, monthEndStr]
      ),
      db.all(
        `SELECT aa.attendance_id, aa.status, aa.comment, aa.type
         FROM attendance_attendanceapproval aa
         JOIN attendance_attendance a ON a.id = aa.attendance_id
         WHERE a.tenant_id = ? AND a.user_id = ? AND a.date BETWEEN ? AND ?
           AND (aa.comment IS NULL OR (aa.comment NOT LIKE '%early departure%' AND aa.comment NOT LIKE '%early_departure%'))`,
        [tenantId, targetId, monthStartStr, monthEndStr]
      ),
    ]);

    const attDetailByDate = new Map();
    for (const a of attDetails) {
      attDetailByDate.set(ymd(a.date), a);
    }
    const approvalByAttId = new Map();
    for (const ap of regApprovals) {
      const list = approvalByAttId.get(Number(ap.attendance_id)) || [];
      list.push(ap);
      approvalByAttId.set(Number(ap.attendance_id), list);
    }

    const enrichedDays = (registerData.cells || registerData.days || []).map((dayItem) => {
      const detail = attDetailByDate.get(dayItem.date);
      const aps = detail ? (approvalByAttId.get(Number(detail.id)) || []) : [];
      const hasMissingPunch = Boolean(detail && detail.punch_in_time && !detail.punch_out_time && dayItem.date < getCompanyLocalDateString(new Date()));
      const regAp = aps.find((ap) => String(ap.comment || "").toLowerCase().includes("regulariz"));
      return {
        ...dayItem,
        late_minutes: Number(detail?.late_minutes || 0),
        early_departure_minutes: Number(detail?.early_departure_minutes || 0),
        punctuality_status: detail?.punctuality_status || null,
        shift_name: detail?.shift_name || null,
        has_missing_punch: hasMissingPunch,
        regularization_status: regAp ? regAp.status : null,
      };
    });

    const statusFilter = String(query.status || "all").toLowerCase();
    const filteredDays = statusFilter && statusFilter !== "all"
      ? enrichedDays.filter((d) => {
          if (statusFilter === "late") return d.late_minutes > 0 || d.punctuality_status === "late";
          if (statusFilter === "present") return ["P", "IP"].includes(d.code);
          if (statusFilter === "absent") return ["A", "RJ"].includes(d.code);
          if (statusFilter === "on_leave") return d.code === "L";
          if (statusFilter === "holiday") return d.code === "H";
          if (statusFilter === "weekly_off") return d.code === "WO";
          return true;
        })
      : enrichedDays;

    return {
      employee: {
        id: Number(empRow.id),
        employee_code: formatEmployeeCode(empRow.id),
        name: fullName(empRow),
        username: empRow.username,
        designation: empRow.designation || null,
        department: empRow.team_name || null,
        profile_picture: empRow.profile_picture ? storageService.getUrl(empRow.profile_picture) : null,
        reporting_manager: empRow.mgr_username
          ? `${empRow.mgr_first || ""} ${empRow.mgr_last || ""}`.trim() || empRow.mgr_username
          : null,
      },
      month,
      summary: registerData.summary,
      days: filteredDays,
    };
  },

  async getEmployeeDailyAttendance(actor, employeeId, dateStr, tenantId = 1) {
    if (!["manager", "hr", "admin", "superadmin"].includes(actor.role)) {
      throw new AppError("Manager permissions required", 403);
    }
    const targetId = Number(employeeId);
    if (!Number.isInteger(targetId) || targetId < 1) {
      throw new AppError("Invalid employee ID", 400);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr || ""))) {
      throw new AppError("Invalid date format. Expected YYYY-MM-DD", 400);
    }

    await siteService.ensureEmployeeVisible(tenantId, actor, targetId, {
      requireDirectReport: false,
      workDate: dateStr,
    });

    const [empRow, attRow, leaveRow, holidayRow] = await Promise.all([
      db.get(
        `SELECT u.id, u.username, u.first_name, u.last_name,
                ep.team_name, ep.designation, ep.profile_picture, ep.manager_id,
                m.first_name AS mgr_first, m.last_name AS mgr_last, m.username AS mgr_username
         FROM accounts_user u
         LEFT JOIN accounts_employeeprofile ep ON ep.user_id = u.id
         LEFT JOIN accounts_user m ON m.id = ep.manager_id
         WHERE u.id = ?`,
        [targetId]
      ),
      db.get(
        `SELECT a.*, s.name AS shift_name, sv.start_time AS shift_start_time, sv.end_time AS shift_end_time
         FROM attendance_attendance a
         LEFT JOIN workforce_shift_version sv ON sv.id = a.shift_version_id
         LEFT JOIN workforce_shift s ON s.id = sv.shift_id
         WHERE a.tenant_id = ? AND a.user_id = ? AND a.date = ?
         ORDER BY a.id DESC LIMIT 1`,
        [tenantId, targetId, dateStr]
      ),
      db.get(
        `SELECT leave_type, from_date, to_date, status, reason FROM leave_leave
         WHERE tenant_id = ? AND user_id = ? AND status = 'approved' AND from_date <= ? AND to_date >= ? LIMIT 1`,
        [tenantId, targetId, dateStr, dateStr]
      ),
      db.get(
        `SELECT name, is_optional FROM workforce_company_holiday
         WHERE tenant_id = ? AND holiday_date = ? LIMIT 1`,
        [tenantId, dateStr]
      ),
    ]);

    if (!empRow) throw new AppError("Employee not found", 404);

    let approvalHistory = [];
    if (attRow) {
      const aps = await db.all(
        `SELECT aa.id, aa.type, aa.status, aa.comment, aa.created_at, aa.action_at,
                COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''), u.username) AS reviewer_name
         FROM attendance_attendanceapproval aa
         LEFT JOIN accounts_user u ON u.id = aa.approved_by_id
         WHERE aa.attendance_id = ?
           AND (aa.comment IS NULL OR (aa.comment NOT LIKE '%early departure%' AND aa.comment NOT LIKE '%early_departure%'))
         ORDER BY aa.created_at DESC`,
        [attRow.id]
      );
      approvalHistory = aps.map((ap) => ({
        id: Number(ap.id),
        type: ap.type,
        status: ap.status,
        comment: ap.comment || null,
        reviewer_name: ap.reviewer_name || null,
        created_at: dbTimeToIso(ap.created_at),
        action_at: dbTimeToIso(ap.action_at),
      }));
    }

    const dObj = new Date(`${dateStr}T12:00:00Z`);
    const weekday = dObj.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });

    return {
      employee: {
        id: Number(empRow.id),
        employee_code: formatEmployeeCode(empRow.id),
        name: fullName(empRow),
        username: empRow.username,
        designation: empRow.designation || null,
        department: empRow.team_name || null,
        profile_picture: empRow.profile_picture ? storageService.getUrl(empRow.profile_picture) : null,
        reporting_manager: empRow.mgr_username
          ? `${empRow.mgr_first || ""} ${empRow.mgr_last || ""}`.trim() || empRow.mgr_username
          : null,
      },
      date: dateStr,
      weekday,
      shift: attRow?.shift_name
        ? {
            name: attRow.shift_name,
            start_time: attRow.shift_start_time || null,
            end_time: attRow.shift_end_time || null,
          }
        : null,
      attendance: attRow
        ? {
            id: Number(attRow.id),
            status: attRow.status,
            punch_in_status: attRow.punch_in_status,
            punch_out_status: attRow.punch_out_status,
            punch_in_time: dbTimeToIso(attRow.punch_in_time),
            punch_out_time: dbTimeToIso(attRow.punch_out_time),
            work_hours: Number(attRow.total_hours || 0),
            late_minutes: Number(attRow.late_minutes || 0),
            early_departure_minutes: Number(attRow.early_departure_minutes || 0),
            punctuality_status: attRow.punctuality_status || null,
            punch_in_location:
              attRow.punch_in_lat != null && attRow.punch_in_lng != null
                ? {
                    latitude: Number(attRow.punch_in_lat),
                    longitude: Number(attRow.punch_in_lng),
                    outside: Boolean(attRow.punch_in_outside),
                  }
                : null,
            punch_out_location:
              attRow.punch_out_lat != null && attRow.punch_out_lng != null
                ? {
                    latitude: Number(attRow.punch_out_lat),
                    longitude: Number(attRow.punch_out_lng),
                    outside: Boolean(attRow.punch_out_outside),
                  }
                : null,
            punch_in_photo: attRow.punch_in_photo ? storageService.getUrl(attRow.punch_in_photo) : null,
            punch_out_photo: attRow.punch_out_photo ? storageService.getUrl(attRow.punch_out_photo) : null,
          }
        : null,
      leave: leaveRow
        ? {
            leave_type: leaveRow.leave_type,
            reason: leaveRow.reason,
          }
        : null,
      holiday: holidayRow
        ? {
            name: holidayRow.name,
            is_optional: Boolean(holidayRow.is_optional),
          }
        : null,
      approval_history: approvalHistory,
    };
  },
};

export default managerTeamService;
