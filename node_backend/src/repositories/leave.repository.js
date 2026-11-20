import { db } from "../db/index.js";

export const leaveRepository = {
  async insertLeave(userId, tenantId, leaveType, fromDate, toDate, reason, tx = null, siteId = null) {
    await db.run(
      "INSERT INTO leave_leave (leave_type, from_date, to_date, reason, status, created_at, user_id, tenant_id, site_id) VALUES (?, ?, ?, ?, 'pending', NOW(), ?, ?, ?)",
      [leaveType, fromDate, toDate, reason, userId, tenantId, siteId],
      tx
    );
  },

  async findLeavesByUserId(userId, tenantId = 1, tx = null) {
    return db.all(
      `SELECT l.*, 
              ab.username as action_by_username, ab.first_name as action_by_first_name, ab.last_name as action_by_last_name, ab.role as action_by_role
       FROM leave_leave l
       LEFT JOIN accounts_user ab ON ab.id=l.action_by_id
       WHERE l.user_id=? AND l.tenant_id=?
       ORDER BY l.created_at DESC`,
      [userId, tenantId],
      tx
    );
  },

  async findLeavesPagedByUserId(userId, tenantId = 1, { limit = 50, offset = 0 } = {}, tx = null) {
    return db.all(
      `SELECT l.*, 
              ab.username as action_by_username, ab.first_name as action_by_first_name, ab.last_name as action_by_last_name, ab.role as action_by_role
       FROM leave_leave l
       LEFT JOIN accounts_user ab ON ab.id=l.action_by_id
       WHERE l.user_id=? AND l.tenant_id=?
       ORDER BY l.created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, tenantId, limit, offset],
      tx
    );
  },

  async countLeavesByUserId(userId, tenantId = 1, tx = null) {
    const row = await db.get("SELECT COUNT(*) as c FROM leave_leave WHERE user_id=? AND tenant_id=?", [userId, tenantId], tx);
    return Number(row?.c || 0);
  },

  async findLeavesForApprovals(role, viewerUserId, tenantId = 1, tx = null) {
    let where = "";
    const params = [];
    
    if (role === "superadmin") {
      where = "WHERE l.tenant_id=?";
      params.push(tenantId);
    } else if (role === "admin") {
      where = "WHERE l.tenant_id=? AND u.role IN ('employee', 'manager', 'hr')";
      params.push(tenantId);
    } else if (role === "hr") {
      where = "WHERE l.tenant_id=? AND u.role IN ('employee', 'manager')";
      params.push(tenantId);
    } else {
      where = "WHERE l.tenant_id=? AND u.role='employee' AND ep.manager_id=?";
      params.push(tenantId, viewerUserId);
    }

    return db.all(
      `SELECT l.*, u.id as user_id_ref, u.username, u.first_name, u.last_name, u.email, u.role,
              ep.team_name, ep.manager_id, ep.designation,
              m.username as manager_username, m.first_name as manager_first_name, m.last_name as manager_last_name,
              ab.username as action_by_username, ab.first_name as action_by_first_name, ab.last_name as action_by_last_name, ab.role as action_by_role
       FROM leave_leave l
       JOIN accounts_user u ON u.id=l.user_id
       LEFT JOIN accounts_employeeprofile ep ON ep.user_id=u.id
       LEFT JOIN accounts_user m ON m.id=ep.manager_id
       LEFT JOIN accounts_user ab ON ab.id=l.action_by_id
       ${where}
       ORDER BY l.created_at DESC`,
      params,
      tx
    );
  },

  async findLeavesForApprovalsPaged(role, viewerUserId, tenantId = 1, { limit = 50, offset = 0 } = {}, tx = null) {
    let where = "";
    const params = [];
    
    if (role === "superadmin") {
      where = "WHERE l.tenant_id=?";
      params.push(tenantId);
    } else if (role === "admin") {
      where = "WHERE l.tenant_id=? AND u.role IN ('employee', 'manager', 'hr')";
      params.push(tenantId);
    } else if (role === "hr") {
      where = "WHERE l.tenant_id=? AND u.role IN ('employee', 'manager')";
      params.push(tenantId);
    } else {
      where = "WHERE l.tenant_id=? AND u.role='employee' AND ep.manager_id=?";
      params.push(tenantId, viewerUserId);
    }

    params.push(limit, offset);

    return db.all(
      `SELECT l.*, u.id as user_id_ref, u.username, u.first_name, u.last_name, u.email, u.role,
              ep.team_name, ep.manager_id, ep.designation,
              m.username as manager_username, m.first_name as manager_first_name, m.last_name as manager_last_name,
              ab.username as action_by_username, ab.first_name as action_by_first_name, ab.last_name as action_by_last_name, ab.role as action_by_role
       FROM leave_leave l
       JOIN accounts_user u ON u.id=l.user_id
       LEFT JOIN accounts_employeeprofile ep ON ep.user_id=u.id
       LEFT JOIN accounts_user m ON m.id=ep.manager_id
       LEFT JOIN accounts_user ab ON ab.id=l.action_by_id
       ${where}
       ORDER BY l.created_at DESC
       LIMIT ? OFFSET ?`,
      params,
      tx
    );
  },

  async countLeavesForApprovals(role, viewerUserId, tenantId = 1, tx = null) {
    let where = "";
    const params = [];
    
    if (role === "superadmin") {
      where = "WHERE l.tenant_id=?";
      params.push(tenantId);
    } else if (role === "admin") {
      where = "WHERE l.tenant_id=? AND u.role IN ('employee', 'manager', 'hr')";
      params.push(tenantId);
    } else if (role === "hr") {
      where = "WHERE l.tenant_id=? AND u.role IN ('employee', 'manager')";
      params.push(tenantId);
    } else {
      where = "WHERE l.tenant_id=? AND u.role='employee' AND ep.manager_id=?";
      params.push(tenantId, viewerUserId);
    }

    const row = await db.get(
      `SELECT COUNT(*) as c 
       FROM leave_leave l
       JOIN accounts_user u ON u.id=l.user_id
       LEFT JOIN accounts_employeeprofile ep ON ep.user_id=u.id
       ${where}`,
      params,
      tx
    );
    return Number(row?.c || 0);
  },

  async findLeaveById(leaveId, tenantId = 1, tx = null, forUpdate = false) {
    const lock = forUpdate ? " FOR UPDATE" : "";
    return db.get(
      `SELECT l.*, u.id as requestor_id, u.role as requestor_role, ep.manager_id,
              ab.username as action_by_username, ab.first_name as action_by_first_name, ab.last_name as action_by_last_name
       FROM leave_leave l
       JOIN accounts_user u ON u.id=l.user_id
       LEFT JOIN accounts_employeeprofile ep ON ep.user_id=u.id
       LEFT JOIN accounts_user ab ON ab.id=l.action_by_id
       WHERE l.id=? AND l.tenant_id=?${lock}`,
      [leaveId, tenantId],
      tx
    );
  },

  async updateLeave(leaveId, data, tx = null, onlyPending = true) {
    const fields = [];
    const params = [];
    
    for (const [key, val] of Object.entries(data)) {
      fields.push(`${key}=?`);
      params.push(val);
    }
    
    params.push(leaveId);
    const pendingClause = onlyPending ? " AND status='pending'" : "";
    return db.run(
      `UPDATE leave_leave SET ${fields.join(", ")}, action_at=NOW() WHERE id=?${pendingClause}`, 
      params, 
      tx
    );
  },

  async findOverlappingApprovedLeaves(userId, tenantId, fromDate, toDate, tx = null) {
    return db.all(
      "SELECT * FROM leave_leave WHERE user_id=? AND tenant_id=? AND status='approved' AND from_date <= ? AND to_date >= ?",
      [userId, tenantId, toDate, fromDate],
      tx
    );
  }
};

export default leaveRepository;
