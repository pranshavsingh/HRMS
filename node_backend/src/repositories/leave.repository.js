import { db } from "../db/index.js";

export const leaveRepository = {
  async insertLeave(userId, leaveType, fromDate, toDate, reason, tx = null) {
    await db.run(
      "INSERT INTO leave_leave (leave_type, from_date, to_date, reason, status, created_at, user_id) VALUES (?, ?, ?, ?, 'pending', NOW(), ?)",
      [leaveType, fromDate, toDate, reason, userId],
      tx
    );
  },

  async findLeavesByUserId(userId, tx = null) {
    return db.all(
      `SELECT l.*, 
              ab.username as action_by_username, ab.first_name as action_by_first_name, ab.last_name as action_by_last_name, ab.role as action_by_role
       FROM leave_leave l
       LEFT JOIN accounts_user ab ON ab.id=l.action_by_id
       WHERE l.user_id=? 
       ORDER BY l.created_at DESC`,
      [userId],
      tx
    );
  },

  async findLeavesForApprovals(role, viewerUserId, tx = null) {
    let where = "";
    const params = [];
    
    if (role === "superadmin") {
      where = "";
    } else if (role === "admin") {
      where = "WHERE u.role IN ('employee', 'manager', 'hr')";
    } else if (role === "hr") {
      where = "WHERE u.role IN ('employee', 'manager')";
    } else {
      where = "WHERE u.role='employee' AND ep.manager_id=?";
      params.push(viewerUserId);
    }

    return db.all(
      `SELECT l.*, u.id as user_id_ref, u.username, u.first_name, u.last_name, u.email, u.role,
              ep.team_name, ep.manager_id,
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

  async findLeaveById(leaveId, tx = null) {
    return db.get(
      `SELECT l.*, u.id as requestor_id, u.role as requestor_role, ep.manager_id,
              ab.username as action_by_username, ab.first_name as action_by_first_name, ab.last_name as action_by_last_name
       FROM leave_leave l
       JOIN accounts_user u ON u.id=l.user_id
       LEFT JOIN accounts_employeeprofile ep ON ep.user_id=u.id
       LEFT JOIN accounts_user ab ON ab.id=l.action_by_id
       WHERE l.id=?`,
      [leaveId],
      tx
    );
  },

  async updateLeave(leaveId, data, tx = null) {
    const fields = [];
    const params = [];
    
    for (const [key, val] of Object.entries(data)) {
      fields.push(`${key}=?`);
      params.push(val);
    }
    
    params.push(leaveId);
    
    await db.run(
      `UPDATE leave_leave SET ${fields.join(", ")}, action_at=NOW() WHERE id=?`, 
      params, 
      tx
    );
  },

  async findOverlappingApprovedLeaves(userId, fromDate, toDate, tx = null) {
    return db.all(
      "SELECT * FROM leave_leave WHERE user_id=? AND status='approved' AND from_date <= ? AND to_date >= ?",
      [userId, toDate, fromDate],
      tx
    );
  }
};

export default leaveRepository;
