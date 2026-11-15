import { db } from "../db/index.js";
import { config } from "../config/env.js";
import logger from "../utils/logger.js";

let auditTableReady = false;

async function ensureAuditTable() {
  if (auditTableReady) return;
  await db.run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NULL,
      username VARCHAR(150) NULL,
      action VARCHAR(255) NOT NULL,
      target_id VARCHAR(100) NULL,
      details TEXT NULL,
      ip_address VARCHAR(45) NULL,
      severity VARCHAR(20) NOT NULL DEFAULT 'INFO',
      created_at DATETIME NOT NULL
    )
  `);

  try {
    if (config.dbClient === "mysql") {
      const columns = await db.all("SHOW COLUMNS FROM audit_logs LIKE 'severity'");
      if (columns.length === 0) {
        await db.run("ALTER TABLE audit_logs ADD COLUMN severity VARCHAR(20) NOT NULL DEFAULT 'INFO'");
      }
    } else {
      const columns = await db.all("PRAGMA table_info(audit_logs)");
      const hasSeverity = columns.some(c => c.name === "severity");
      if (!hasSeverity) {
        await db.run("ALTER TABLE audit_logs ADD COLUMN severity VARCHAR(20) NOT NULL DEFAULT 'INFO'");
      }
    }
  } catch (err) {
    if (!err.message?.includes("duplicate column") && err.code !== "ER_DUP_FIELDNAME") {
      logger.warn(`Audit table schema alteration warning: ${err.message}`);
    }
  }
  auditTableReady = true;
}

export const auditRepository = {
  /**
   * Log an audit event.
   */
  async log(userId, username, action, targetId = null, details = null, ipAddress = null, severity = "INFO", tx = null) {
    await ensureAuditTable();
    const detailsStr = details ? JSON.stringify(details) : null;
    const cleanUserId = userId !== undefined ? userId : null;
    const cleanUsername = username !== undefined ? username : null;
    const cleanTargetId = targetId !== undefined ? targetId : null;
    const cleanIpAddress = ipAddress !== undefined ? ipAddress : null;
    const cleanSeverity = severity !== undefined ? severity : "INFO";
    
    // SQLite/MySQL standard query
    const insertSql = config.dbClient === "mysql"
      ? "INSERT INTO audit_logs (user_id, username, action, target_id, details, ip_address, severity, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())"
      : "INSERT INTO audit_logs (user_id, username, action, target_id, details, ip_address, severity, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))";

    await db.run(
      insertSql,
      [cleanUserId, cleanUsername, action, cleanTargetId, detailsStr, cleanIpAddress, cleanSeverity],
      tx
    );
  },

  /**
   * Find audit logs matching search criteria.
   */
  async findAuditLogs({ limit = 50, offset = 0, search = "", sort = "desc", startDate = "", endDate = "", actionType = "" } = {}, tx = null) {
    await ensureAuditTable();
    
    let query = `
      SELECT l.*, 
             u.username as target_username, 
             u.first_name as target_first_name, 
             u.last_name as target_last_name 
      FROM audit_logs l 
      LEFT JOIN accounts_user u ON u.id = l.target_id 
      WHERE 1=1
    `;
    const params = [];

    if (search.trim()) {
      const q = `%${search.trim()}%`;
      query += " AND (l.username LIKE ? OR l.action LIKE ? OR l.target_id LIKE ? OR l.details LIKE ? OR u.username LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?)";
      params.push(q, q, q, q, q, q, q);
    }

    if (actionType.trim()) {
      query += " AND l.action = ?";
      params.push(actionType.trim());
    }

    if (startDate.trim()) {
      query += " AND l.created_at >= ?";
      params.push(startDate.trim());
    }

    if (endDate.trim()) {
      const ed = endDate.trim().includes(" ") ? endDate.trim() : `${endDate.trim()} 23:59:59`;
      query += " AND l.created_at <= ?";
      params.push(ed);
    }

    const order = sort.toLowerCase() === "asc" ? "ASC" : "DESC";
    query += ` ORDER BY l.created_at ${order}`;

    query += " LIMIT ? OFFSET ?";
    params.push(limit, offset);

    return db.all(query, params, tx);
  },

  /**
   * Get matching audit logs count.
   */
  async getAuditLogsCount({ search = "", startDate = "", endDate = "", actionType = "" } = {}, tx = null) {
    await ensureAuditTable();
    
    let query = `
      SELECT COUNT(*) as c 
      FROM audit_logs l 
      LEFT JOIN accounts_user u ON u.id = l.target_id 
      WHERE 1=1
    `;
    const params = [];

    if (search.trim()) {
      const q = `%${search.trim()}%`;
      query += " AND (l.username LIKE ? OR l.action LIKE ? OR l.target_id LIKE ? OR l.details LIKE ? OR u.username LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?)";
      params.push(q, q, q, q, q, q, q);
    }

    if (actionType.trim()) {
      query += " AND l.action = ?";
      params.push(actionType.trim());
    }

    if (startDate.trim()) {
      query += " AND l.created_at >= ?";
      params.push(startDate.trim());
    }

    if (endDate.trim()) {
      const ed = endDate.trim().includes(" ") ? endDate.trim() : `${endDate.trim()} 23:59:59`;
      query += " AND l.created_at <= ?";
      params.push(ed);
    }

    const row = await db.get(query, params, tx);
    return row?.c || 0;
  }
};

export default auditRepository;
