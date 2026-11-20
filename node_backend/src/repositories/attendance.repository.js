import { db } from "../db/index.js";

export const attendanceRepository = {
  async findOpenAttendance(userId, tx = null, forUpdate = false) {
    const lockClause = forUpdate ? " FOR UPDATE" : "";
    return db.get(
      `SELECT * FROM attendance_attendance WHERE user_id=? AND punch_out_time IS NULL AND punch_in_status NOT IN ('rejected', 'leave') AND status <> 'leave' ORDER BY punch_in_time DESC LIMIT 1${lockClause}`,
      [userId],
      tx
    );
  },

  async findLatestAttendance(userId, tx = null) {
    return db.get("SELECT * FROM attendance_attendance WHERE user_id=? ORDER BY date DESC, punch_in_time DESC LIMIT 1", [userId], tx);
  },

  async insertAttendance(data, tx = null) {
    const fields = [];
    const placeholders = [];
    const params = [];

    for (const [key, val] of Object.entries(data)) {
      fields.push(key);
      placeholders.push("?");
      params.push(val);
    }

    const sql = `INSERT INTO attendance_attendance (${fields.join(", ")}) VALUES (${placeholders.join(", ")})`;
    const result = await db.run(sql, params, tx);
    return result.lastID;
  },

  async findAttendanceById(id, tx = null) {
    return db.get("SELECT * FROM attendance_attendance WHERE id=?", [id], tx);
  },

  async updateAttendance(id, data, tx = null, extraCondition = null) {
    const fields = [];
    const params = [];
    
    for (const [key, val] of Object.entries(data)) {
      fields.push(`${key}=?`);
      params.push(val);
    }
    
    params.push(id);
    const extraSql = extraCondition ? ` AND ${extraCondition}` : "";
    const sql = `UPDATE attendance_attendance SET ${fields.join(", ")} WHERE id=?${extraSql}`;
    return db.run(sql, params, tx);
  },

  async insertApproval(data, tx = null) {
    const { role, status, comment, created_at, approved_by_id, attendance_id, type } = data;
    await db.run(
      "INSERT INTO attendance_attendanceapproval (role, status, comment, created_at, approved_by_id, attendance_id, type, action_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)",
      [role, status, comment, created_at, approved_by_id, attendance_id, type],
      tx
    );
  },

  async insertApprovalsBatch(approvals, tx = null) {
    if (!approvals || approvals.length === 0) return;
    const valuePlaceholders = [];
    const params = [];

    for (const a of approvals) {
      valuePlaceholders.push("(?, ?, ?, ?, ?, ?, ?, NULL)");
      params.push(
        a.role,
        a.status,
        a.comment || null,
        a.created_at,
        a.approved_by_id,
        a.attendance_id,
        a.type
      );
    }

    const sql = `INSERT INTO attendance_attendanceapproval (role, status, comment, created_at, approved_by_id, attendance_id, type, action_at) VALUES ${valuePlaceholders.join(", ")}`;
    await db.run(sql, params, tx);
  },

  async findApprovalsForReviewer(reviewerId, role = null, tx = null) {
    let whereClause = "WHERE aa.approved_by_id=?";
    const params = [reviewerId];
    if (role === "superadmin") {
      whereClause = "";
      params.length = 0;
    }

    return db.all(
      `SELECT aa.id, aa.role, aa.status, aa.comment, aa.created_at, aa.approved_by_id, aa.attendance_id, aa.type, aa.action_at,
              a.tenant_id, a.user_id as employee_id, a.date as attendance_date, a.status as attendance_status, a.site_id,
              a.punch_in_time, a.punch_out_time, a.punch_in_status, a.punch_out_status, a.punch_in_outside, a.punch_out_outside,
              a.punch_in_photo, a.punch_out_photo, a.punch_in_lat, a.punch_in_lng, a.punch_out_lat, a.punch_out_lng,
              u.username as employee_username, u.first_name as employee_first_name, u.last_name as employee_last_name, u.email as employee_email, u.role as employee_role,
              ep.team_name, ep.manager_id,
              m.username as manager_username, m.first_name as manager_first_name, m.last_name as manager_last_name,
              CASE 
                WHEN aa.status IN ('approved', 'rejected') THEN aa.status
                WHEN aa.status = 'closed' THEN (
                  SELECT daa.status FROM attendance_attendanceapproval daa
                  WHERE daa.attendance_id = aa.attendance_id 
                    AND daa.type = aa.type 
                    AND (
                      (aa.comment LIKE '%early departure%' AND daa.comment LIKE '%early departure%')
                      OR (aa.comment LIKE '%overtime%' AND daa.comment LIKE '%overtime%')
                      OR ((aa.comment IS NULL OR (aa.comment NOT LIKE '%early departure%' AND aa.comment NOT LIKE '%overtime%')) 
                          AND (daa.comment IS NULL OR (daa.comment NOT LIKE '%early departure%' AND daa.comment NOT LIKE '%overtime%')))
                    )
                    AND daa.status IN ('approved', 'rejected')
                  ORDER BY daa.action_at DESC LIMIT 1
                )
                ELSE NULL
              END as resolved_status,
              CASE 
                WHEN aa.status IN ('approved', 'rejected') THEN (
                  SELECT COALESCE(NULLIF(TRIM(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, ''))), ''), username)
                  FROM accounts_user WHERE id = aa.approved_by_id
                )
                WHEN aa.status = 'closed' THEN (
                  SELECT COALESCE(NULLIF(TRIM(CONCAT(COALESCE(du.first_name, ''), ' ', COALESCE(du.last_name, ''))), ''), du.username)
                  FROM attendance_attendanceapproval daa
                  JOIN accounts_user du ON du.id = daa.approved_by_id
                  WHERE daa.attendance_id = aa.attendance_id 
                    AND daa.type = aa.type 
                    AND (
                      (aa.comment LIKE '%early departure%' AND daa.comment LIKE '%early departure%')
                      OR (aa.comment LIKE '%overtime%' AND daa.comment LIKE '%overtime%')
                      OR ((aa.comment IS NULL OR (aa.comment NOT LIKE '%early departure%' AND aa.comment NOT LIKE '%overtime%')) 
                          AND (daa.comment IS NULL OR (daa.comment NOT LIKE '%early departure%' AND daa.comment NOT LIKE '%overtime%')))
                    )
                    AND daa.status IN ('approved', 'rejected')
                  ORDER BY daa.action_at DESC LIMIT 1
                )
                ELSE NULL
              END as decider_name,
              CASE 
                WHEN aa.status IN ('approved', 'rejected') THEN aa.action_at
                WHEN aa.status = 'closed' THEN (
                  SELECT daa.action_at FROM attendance_attendanceapproval daa
                  WHERE daa.attendance_id = aa.attendance_id 
                    AND daa.type = aa.type 
                    AND (
                      (aa.comment LIKE '%early departure%' AND daa.comment LIKE '%early departure%')
                      OR (aa.comment LIKE '%overtime%' AND daa.comment LIKE '%overtime%')
                      OR ((aa.comment IS NULL OR (aa.comment NOT LIKE '%early departure%' AND aa.comment NOT LIKE '%overtime%')) 
                          AND (daa.comment IS NULL OR (daa.comment NOT LIKE '%early departure%' AND daa.comment NOT LIKE '%overtime%')))
                    )
                    AND daa.status IN ('approved', 'rejected')
                  ORDER BY daa.action_at DESC LIMIT 1
                )
                ELSE NULL
              END as resolved_action_at
       FROM attendance_attendanceapproval aa
       JOIN attendance_attendance a ON a.id=aa.attendance_id
       JOIN accounts_user u ON u.id=a.user_id
       LEFT JOIN accounts_employeeprofile ep ON ep.user_id=u.id
       LEFT JOIN accounts_user m ON m.id=ep.manager_id
       ${whereClause}
       ORDER BY aa.created_at DESC`,
      params,
      tx
    );
  },

  async findApprovalById(approvalId, tx = null, forUpdate = false, tenantId = 1) {
    const lockClause = forUpdate ? " FOR UPDATE" : "";
    return db.get(
      `SELECT aa.id, aa.role, aa.status, aa.comment, aa.created_at, aa.approved_by_id, aa.attendance_id, aa.type, aa.action_at,
              a.punch_in_status, a.punch_out_status, a.status as attendance_status, a.punch_out_time, a.user_id as employee_id, a.date as attendance_date, a.site_id
       FROM attendance_attendanceapproval aa
       JOIN attendance_attendance a ON a.id=aa.attendance_id
       WHERE aa.id=? AND a.tenant_id=?${lockClause}`,
      [approvalId, tenantId],
      tx
    );
  },

  async updateApproval(id, data, tx = null, onlyPending = true) {
    const fields = [];
    const params = [];
    
    for (const [key, val] of Object.entries(data)) {
      fields.push(`${key}=?`);
      params.push(val);
    }
    
    params.push(id);
    const pendingSql = onlyPending ? " AND status='pending'" : "";
    const sql = `UPDATE attendance_attendanceapproval SET ${fields.join(", ")} WHERE id=?${pendingSql}`;
    return db.run(sql, params, tx);
  },

  async updatePendingApprovalsForAttendanceExcept(attendanceId, type, status, comment, actionByUserId, approvedByIdToExclude, tx = null, exceptionCategory = null) {
    let categorySql = "";
    if (exceptionCategory === "early_departure") {
      categorySql = " AND (comment LIKE '%early departure%' OR comment LIKE '%Early departure%')";
    } else if (exceptionCategory === "overtime") {
      categorySql = " AND (comment LIKE '%overtime%' OR comment LIKE '%Overtime%')";
    } else if (exceptionCategory === "location_in" || exceptionCategory === "location_out" || exceptionCategory === "location") {
      categorySql = " AND (comment IS NULL OR (comment NOT LIKE '%early departure%' AND comment NOT LIKE '%Early departure%' AND comment NOT LIKE '%overtime%' AND comment NOT LIKE '%Overtime%'))";
    }

    await db.run(
      `UPDATE attendance_attendanceapproval 
       SET status=?, comment=?, action_at=NOW() 
       WHERE attendance_id=? AND type=? AND status='pending' AND id<>?${categorySql}`,
      [status, comment, attendanceId, type, approvedByIdToExclude],
      tx
    );
  },

  async deleteAttendance(id, tx = null) {
    await db.run("DELETE FROM attendance_attendance WHERE id=?", [id], tx);
  },

  async deleteApprovalsByAttendanceId(attendanceId, tx = null) {
    await db.run("DELETE FROM attendance_attendanceapproval WHERE attendance_id=?", [attendanceId], tx);
  },

  async deleteApprovalsByAttendanceIdAndType(attendanceId, type, tx = null) {
    await db.run("DELETE FROM attendance_attendanceapproval WHERE attendance_id=? AND type=?", [attendanceId, type], tx);
  },

  async getPendingApprovalsCount(userId, tx = null) {
    const row = await db.get("SELECT COUNT(*) c FROM attendance_attendanceapproval WHERE status='pending' AND approved_by_id=?", [userId], tx);
    return Number(row?.c || 0);
  },

  async getAttendanceRecordsSince(userId, fromDate, tx = null) {
    return db.all("SELECT * FROM attendance_attendance WHERE user_id=? AND date>=? ORDER BY date DESC", [userId, fromDate], tx);
  },

  async findTeamActiveUsers(managerId, tx = null) {
    return db.all(
      "SELECT u.id, u.username FROM accounts_user u JOIN accounts_employeeprofile ep ON ep.user_id=u.id WHERE ep.manager_id=? AND ep.is_active_employee=1 AND u.deleted_at IS NULL",
      [managerId],
      tx
    );
  },

  async getTeamAttendanceTodayCount(teamIds, tx = null) {
    if (!teamIds.length) return 0;
    const row = await db.get(
      `SELECT COUNT(DISTINCT user_id) c FROM attendance_attendance WHERE user_id IN (${teamIds.map(() => "?").join(",")}) AND date=CURDATE() AND status NOT IN ('rejected', 'leave')`,
      teamIds,
      tx
    );
    return Number(row?.c || 0);
  },

  async getTeamAttendanceInLast7Days(teamIds, tx = null) {
    if (!teamIds.length) return [];
    return db.all(
      `SELECT user_id, date, status, punch_in_time, punch_out_time FROM attendance_attendance WHERE user_id IN (${teamIds.map(() => "?").join(",")}) AND date>=DATE_SUB(CURDATE(), INTERVAL 7 DAY) AND status NOT IN ('rejected', 'leave') ORDER BY date DESC`,
      teamIds,
      tx
    );
  },

  async getPendingAttendanceApprovalsCount(managerId, tx = null) {
    const row = await db.get(
      "SELECT COUNT(*) c FROM attendance_attendanceapproval aa JOIN attendance_attendance a ON a.id=aa.attendance_id JOIN accounts_employeeprofile ep ON ep.user_id=a.user_id WHERE aa.approved_by_id=? AND aa.status='pending' AND ep.manager_id=?",
      [managerId, managerId],
      tx
    );
    return Number(row?.c || 0);
  },

  async getPendingLeaveApprovalsCount(managerId, tx = null) {
    const row = await db.get(
      "SELECT COUNT(*) c FROM leave_leave l JOIN accounts_employeeprofile ep ON ep.user_id=l.user_id WHERE ep.manager_id=? AND l.status='pending'",
      [managerId],
      tx
    );
    return Number(row?.c || 0);
  },

  async getAttendanceInRange(memberIds, days, tx = null) {
    if (!memberIds.length) return [];
    return db.all(
      `SELECT * FROM attendance_attendance WHERE user_id IN (${memberIds.map(() => "?").join(",")}) AND date>=DATE_SUB(CURDATE(), INTERVAL ${days - 1} DAY)`,
      memberIds,
      tx
    );
  },

  async getLeavesInRange(memberIds, days, tx = null) {
    if (!memberIds.length) return [];
    return db.all(
      `SELECT * FROM leave_leave WHERE user_id IN (${memberIds.map(() => "?").join(",")}) AND status='approved' AND from_date<=CURDATE() AND to_date>=DATE_SUB(CURDATE(), INTERVAL ${days - 1} DAY)`,
      memberIds,
      tx
    );
  },

  async getAttendanceInMonth(memberIds, monthStart, monthEnd, tx = null) {
    if (!memberIds.length) return [];
    return db.all(
      `SELECT * FROM attendance_attendance WHERE user_id IN (${memberIds.map(() => "?").join(",")}) AND date BETWEEN ? AND ?`,
      [...memberIds, monthStart, monthEnd],
      tx
    );
  },

  async getApprovedLeavesInMonthRange(employeeId, start, end, tx = null) {
    return db.all(
      "SELECT * FROM leave_leave WHERE user_id=? AND status='approved' AND to_date>=? AND from_date<=?",
      [employeeId, start, end],
      tx
    );
  },

  async getAttendanceByEmployeeIdAndRange(employeeId, start, end, tx = null) {
    return db.all(
      "SELECT * FROM attendance_attendance WHERE user_id=? AND date BETWEEN ? AND ?",
      [employeeId, start, end],
      tx
    );
  },

  async insertOrUpdateLeaveAttendance(userId, date, tx = null, siteId = null, tenantId = 1) {
    const existing = await db.get("SELECT id FROM attendance_attendance WHERE tenant_id=? AND user_id=? AND date=?", [tenantId, userId, date], tx);
    if (existing) {
      await db.run(
        `UPDATE attendance_attendance 
         SET status='leave', punch_in_status='leave', punch_out_status='leave', site_id=?,
             punch_in_time=NULL, punch_out_time=NULL, punch_in_photo=NULL, punch_out_photo=NULL, 
             punch_in_lat=NULL, punch_in_lng=NULL, punch_in_outside=0, punch_out_outside=0, is_outside_location=0 
         WHERE id=?`,
        [siteId, existing.id],
        tx
      );
    } else {
      await db.run(
        `INSERT INTO attendance_attendance 
         (date, work_date, tenant_id, site_id, punch_in_time, punch_in_photo, punch_in_lat, punch_in_lng, punch_in_outside, punch_out_outside, punch_in_status, punch_out_status, status, is_outside_location, user_id) 
         VALUES (?, ?, ?, ?, NULL, NULL, NULL, NULL, 0, 0, 'leave', 'leave', 'leave', 0, ?)`,
        [date, date, tenantId, siteId, userId],
        tx
      );
    }
  }
};

export default attendanceRepository;
