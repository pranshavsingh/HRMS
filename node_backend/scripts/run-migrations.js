import "dotenv/config";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import { open } from "sqlite";
import sqlite3 from "sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  const isMysql = process.env.DB_CLIENT === "mysql" || Boolean(process.env.MYSQL_HOST);
  console.log(`[Migration] Target engine: ${isMysql ? "MySQL/MariaDB" : "SQLite"}`);

  if (isMysql) {
    const pool = mysql.createPool({
      host: process.env.MYSQL_HOST || "localhost",
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER || "root",
      password: process.env.MYSQL_PASSWORD || "",
      database: process.env.MYSQL_DATABASE || "hrms_db",
      waitForConnections: true,
      connectionLimit: 5,
    });

    const conn = await pool.getConnection();
    try {
      console.log("[Migration] Connected to MySQL/MariaDB database:", process.env.MYSQL_DATABASE || "hrms_db");

      // Helper to check column existence
      async function columnExists(table, column) {
        const [rows] = await conn.query(
          "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
          [table, column]
        );
        return rows.length > 0;
      }

      // Helper to check index existence
      async function indexExists(table, indexName) {
        const [rows] = await conn.query(
          "SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?",
          [table, indexName]
        );
        return rows.length > 0;
      }

      // 1. Hardening accounts_refreshtoken
      console.log("[Migration] Applying Phase 1 schema to accounts_refreshtoken...");
      if (!(await columnExists("accounts_refreshtoken", "family_id"))) {
        await conn.query("ALTER TABLE accounts_refreshtoken ADD COLUMN family_id VARCHAR(64) NULL AFTER user_id");
        console.log("  + Added column accounts_refreshtoken.family_id");
      }
      if (!(await columnExists("accounts_refreshtoken", "is_revoked"))) {
        await conn.query("ALTER TABLE accounts_refreshtoken ADD COLUMN is_revoked BOOLEAN NOT NULL DEFAULT 0 AFTER expires_at");
        console.log("  + Added column accounts_refreshtoken.is_revoked");
      }
      if (!(await columnExists("accounts_refreshtoken", "replaced_by_hash"))) {
        await conn.query("ALTER TABLE accounts_refreshtoken ADD COLUMN replaced_by_hash VARCHAR(255) NULL AFTER is_revoked");
        console.log("  + Added column accounts_refreshtoken.replaced_by_hash");
      }

      if (!(await indexExists("accounts_refreshtoken", "idx_refresh_family"))) {
        await conn.query("CREATE INDEX idx_refresh_family ON accounts_refreshtoken(family_id)");
        console.log("  + Created index idx_refresh_family");
      }
      if (!(await indexExists("accounts_refreshtoken", "idx_refresh_token_revoked"))) {
        await conn.query("CREATE INDEX idx_refresh_token_revoked ON accounts_refreshtoken(token_hash, is_revoked)");
        console.log("  + Created index idx_refresh_token_revoked");
      }

      // 2. Hardening password_reset_otp
      console.log("[Migration] Applying Phase 1 schema to password_reset_otp...");
      if (!(await columnExists("password_reset_otp", "reset_token_hash"))) {
        await conn.query("ALTER TABLE password_reset_otp ADD COLUMN reset_token_hash VARCHAR(128) NULL AFTER otp_hash");
        console.log("  + Added column password_reset_otp.reset_token_hash");
      }
      if (!(await columnExists("password_reset_otp", "verified_at"))) {
        await conn.query("ALTER TABLE password_reset_otp ADD COLUMN verified_at DATETIME NULL AFTER verified");
        console.log("  + Added column password_reset_otp.verified_at");
      }
      if (!(await columnExists("password_reset_otp", "consumed_at"))) {
        await conn.query("ALTER TABLE password_reset_otp ADD COLUMN consumed_at DATETIME NULL AFTER verified_at");
        console.log("  + Added column password_reset_otp.consumed_at");
      }

      if (!(await indexExists("password_reset_otp", "idx_otp_email_verified"))) {
        await conn.query("CREATE INDEX idx_otp_email_verified ON password_reset_otp(email, verified)");
        console.log("  + Created index idx_otp_email_verified");
      }

      // 3. Audit logs severity column
      if (await columnExists("audit_logs", "id") && !(await columnExists("audit_logs", "severity"))) {
        await conn.query("ALTER TABLE audit_logs ADD COLUMN severity VARCHAR(20) NOT NULL DEFAULT 'INFO'");
        console.log("  + Added column audit_logs.severity");
      }

      console.log("[Migration] All MySQL/MariaDB Phase 1 migrations successfully applied and verified.");
    } finally {
      conn.release();
      await pool.end();
    }
  } else {
    // SQLite migration
    const dbPath = path.resolve(process.cwd(), process.env.DB_PATH || "./db.sqlite3");
    const sqliteDb = await open({ filename: dbPath, driver: sqlite3.Database });
    try {
      console.log("[Migration] Connected to SQLite database:", dbPath);

      async function sqliteColumnExists(table, column) {
        try {
          const cols = await sqliteDb.all(`PRAGMA table_info(${table})`);
          return cols.some((c) => c.name === column);
        } catch {
          return false;
        }
      }

      // Check and add to accounts_refreshtoken
      if (!(await sqliteColumnExists("accounts_refreshtoken", "family_id"))) {
        await sqliteDb.run("ALTER TABLE accounts_refreshtoken ADD COLUMN family_id VARCHAR(64) NULL");
        console.log("  + Added SQLite column accounts_refreshtoken.family_id");
      }
      if (!(await sqliteColumnExists("accounts_refreshtoken", "is_revoked"))) {
        await sqliteDb.run("ALTER TABLE accounts_refreshtoken ADD COLUMN is_revoked BOOLEAN NOT NULL DEFAULT 0");
        console.log("  + Added SQLite column accounts_refreshtoken.is_revoked");
      }
      if (!(await sqliteColumnExists("accounts_refreshtoken", "replaced_by_hash"))) {
        await sqliteDb.run("ALTER TABLE accounts_refreshtoken ADD COLUMN replaced_by_hash VARCHAR(255) NULL");
        console.log("  + Added SQLite column accounts_refreshtoken.replaced_by_hash");
      }

      await sqliteDb.run("CREATE INDEX IF NOT EXISTS idx_refresh_family ON accounts_refreshtoken(family_id)");
      await sqliteDb.run("CREATE INDEX IF NOT EXISTS idx_refresh_token_revoked ON accounts_refreshtoken(token_hash, is_revoked)");

      // Check and add to password_reset_otp
      if (!(await sqliteColumnExists("password_reset_otp", "reset_token_hash"))) {
        await sqliteDb.run("ALTER TABLE password_reset_otp ADD COLUMN reset_token_hash VARCHAR(128) NULL");
        console.log("  + Added SQLite column password_reset_otp.reset_token_hash");
      }
      if (!(await sqliteColumnExists("password_reset_otp", "verified_at"))) {
        await sqliteDb.run("ALTER TABLE password_reset_otp ADD COLUMN verified_at DATETIME NULL");
        console.log("  + Added SQLite column password_reset_otp.verified_at");
      }
      if (!(await sqliteColumnExists("password_reset_otp", "consumed_at"))) {
        await sqliteDb.run("ALTER TABLE password_reset_otp ADD COLUMN consumed_at DATETIME NULL");
        console.log("  + Added SQLite column password_reset_otp.consumed_at");
      }

      await sqliteDb.run("CREATE INDEX IF NOT EXISTS idx_otp_email_verified ON password_reset_otp(email, verified)");

      console.log("[Migration] All SQLite Phase 1 migrations successfully applied and verified.");
    } finally {
      await sqliteDb.close();
    }
  }
}

runMigrations().catch((err) => {
  console.error("[Migration Error]", err);
  process.exit(1);
});
