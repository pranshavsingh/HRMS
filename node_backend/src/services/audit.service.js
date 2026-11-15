import auditRepository from "../repositories/audit.repository.js";
import logger from "../utils/logger.js";
import { db } from "../db/index.js";
import { realtimeManager } from "../utils/realtime.js";
import { AppError } from "../middleware/errorHandler.js";

export const auditService = {
  /**
   * Log an administrative or sensitive action.
   * Handles signature overload for backward compatibility with previous calls (where tx was the 6th arg).
   */
  async log(user, action, targetId = null, details = null, ipAddress = null, severityOrTx = "INFO", tx = null) {
    let severity = "INFO";
    let finalTx = tx;

    // Signature overload detection
    if (severityOrTx && typeof severityOrTx !== "string") {
      finalTx = severityOrTx;
      severity = "INFO";
    } else if (typeof severityOrTx === "string") {
      severity = severityOrTx;
    }

    // Auto-map severity based on action keyword cues if it is default INFO
    if (severity === "INFO" && action) {
      const lowerAction = action.toLowerCase();
      if (
        lowerAction.includes("delete") || 
        lowerAction.includes("archive") || 
        lowerAction.includes("remove") || 
        lowerAction.includes("reject")
      ) {
        severity = "WARNING";
      } else if (
        lowerAction.includes("fail") || 
        lowerAction.includes("alert") || 
        lowerAction.includes("spam") || 
        lowerAction.includes("unauthorized")
      ) {
        severity = "CRITICAL";
      }
    }

    const userId = user ? user.id : null;
    const username = user ? user.username : "system";
    try {
      const result = await auditRepository.log(userId, username, action, targetId, details, ipAddress, severity, finalTx);
      logger.info(`Audit Log: User [${username}] performed action [${action}] on target [${targetId}] (${severity})`);

      if (result && result.lastID) {
        const fullLog = await db.get(`
          SELECT l.*, 
                 u.username as target_username, 
                 u.first_name as target_first_name, 
                 u.last_name as target_last_name 
          FROM audit_logs l 
          LEFT JOIN accounts_user u ON u.id = l.target_id 
          WHERE l.id = ?
        `, [result.lastID], finalTx);

        if (fullLog) {
          let parsedDetails = null;
          if (fullLog.details) {
            try {
              parsedDetails = JSON.parse(fullLog.details);
            } catch (e) {
              parsedDetails = fullLog.details;
            }
          }
          let targetDisplay = null;
          if (fullLog.target_username) {
            const name = `${fullLog.target_first_name || ""} ${fullLog.target_last_name || ""}`.trim();
            targetDisplay = name ? `${name} (${fullLog.target_username})` : fullLog.target_username;
          }

          const serializedLog = {
            id: fullLog.id,
            user_id: fullLog.user_id,
            username: fullLog.username,
            action: fullLog.action,
            target_id: fullLog.target_id,
            target_display: targetDisplay,
            details: parsedDetails,
            ip_address: fullLog.ip_address,
            severity: fullLog.severity || "INFO",
            created_at: fullLog.created_at
          };

          realtimeManager.broadcast("new_audit_log", serializedLog, (client) => client.role === "superadmin");
        }
      }
    } catch (err) {
      logger.error(`Audit Log Fail: ${err.message}`);
      if (finalTx || severity === "CRITICAL") {
        throw new AppError(`Durable audit logging failed: ${err.message}`, 500);
      }
    }
  }
};

export default auditService;
