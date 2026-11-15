import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { config } from "../config/env.js";
import logger from "./logger.js";
import { db } from "../db/index.js";

const execAsync = promisify(exec);

export async function runDatabaseBackup() {
  const backupDir = path.resolve(process.cwd(), "backups");
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `hrms_backup_${timestamp}.sql`;
  const filePath = path.join(backupDir, fileName);

  logger.info("[Backup] Starting scheduled database backup...");

  try {
    // 1. Primary: Use mysqldump if available on the system
    if (config.mysqlHost && config.mysqlUser && config.mysqlDatabase) {
      const dumpCmd = `mysqldump -h ${config.mysqlHost} -P ${config.mysqlPort} -u ${config.mysqlUser} -p"${config.mysqlPassword}" ${config.mysqlDatabase} > "${filePath}"`;
      
      try {
        await execAsync(dumpCmd);
        const stats = fs.statSync(filePath);
        logger.info("[Backup] mysqldump completed successfully: %s (%d bytes)", fileName, stats.size);
      } catch (dumpErr) {
        logger.warn("[Backup] mysqldump command failed (%s), falling back to SQL table stream backup...", dumpErr.message);
        await exportDatabaseFallback(filePath);
      }
    } else {
      await exportDatabaseFallback(filePath);
    }

    // 2. Retention Policy: Purge backups older than 30 days
    await pruneOldBackups(backupDir, 30);
  } catch (err) {
    logger.error("[Backup] Database backup routine encountered an error: %s", err.message);
  }
}

/**
 * Portable fallback backup: exports core enterprise tables into an SQL dump
 */
async function exportDatabaseFallback(filePath) {
  const tables = [
    "accounts_user",
    "accounts_employeeprofile",
    "accounts_employeelocation",
    "attendance_attendance",
    "attendance_attendanceapproval",
    "leave_leave",
    "audit_logs"
  ];

  let sqlDump = `-- HRMS Automated Fallback Backup\n-- Generated: ${new Date().toISOString()}\n\n`;

  for (const table of tables) {
    try {
      const rows = await db.all(`SELECT * FROM ${table}`);
      if (rows && rows.length > 0) {
        sqlDump += `-- Table: ${table} (${rows.length} rows)\n`;
        for (const row of rows) {
          const keys = Object.keys(row);
          const values = Object.values(row).map((v) => {
            if (v === null || v === undefined) return "NULL";
            if (typeof v === "number" || typeof v === "boolean") return Number(v);
            return `'${String(v).replace(/'/g, "''")}'`;
          });
          sqlDump += `INSERT INTO ${table} (${keys.join(", ")}) VALUES (${values.join(", ")});\n`;
        }
        sqlDump += "\n";
      }
    } catch (tblErr) {
      logger.warn("[Backup] Skipping table %s: %s", table, tblErr.message);
    }
  }

  await fs.promises.writeFile(filePath, sqlDump, "utf8");
  const stats = fs.statSync(filePath);
  logger.info("[Backup] Fallback database export completed: %s (%d bytes)", path.basename(filePath), stats.size);
}

/**
 * Remove backups older than retentionDays
 */
async function pruneOldBackups(backupDir, retentionDays = 30) {
  const files = await fs.promises.readdir(backupDir);
  const now = Date.now();
  const maxAgeMs = retentionDays * 24 * 60 * 60 * 1000;
  let prunedCount = 0;

  for (const file of files) {
    if (file.startsWith("hrms_backup_") && file.endsWith(".sql")) {
      const fullPath = path.join(backupDir, file);
      try {
        const stats = await fs.promises.stat(fullPath);
        if (now - stats.mtimeMs > maxAgeMs) {
          await fs.promises.unlink(fullPath);
          prunedCount++;
          logger.info("[Backup] Pruned expired backup file: %s", file);
        }
      } catch (err) {
        logger.warn("[Backup] Failed to inspect file %s: %s", file, err.message);
      }
    }
  }

  if (prunedCount > 0) {
    logger.info("[Backup] Retention cleanup complete: removed %d expired backup(s).", prunedCount);
  }
}
