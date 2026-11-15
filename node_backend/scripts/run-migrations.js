import "dotenv/config";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";
import { open } from "sqlite";
import sqlite3 from "sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function computeChecksum(content) {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

function parseSqlStatements(content) {
  // Strip comments (-- ...) and split statements by semicolon
  const lines = content.split("\n");
  const filtered = lines.map((line) => {
    const commentIdx = line.indexOf("--");
    if (commentIdx >= 0) {
      return line.substring(0, commentIdx);
    }
    return line;
  }).join("\n");

  return filtered
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

async function runMigrations() {
  const isMysql = process.env.DB_CLIENT === "mysql" || Boolean(process.env.MYSQL_HOST);
  console.log(`[Migration] Target database engine: ${isMysql ? "MySQL/MariaDB" : "SQLite"}`);

  const migrationsDir = path.resolve(__dirname, "migrations");
  if (!fs.existsSync(migrationsDir)) {
    console.log(`[Migration] Directory not found: ${migrationsDir}`);
    return;
  }

  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  console.log(`[Migration] Found ${migrationFiles.length} migration file(s):`, migrationFiles.join(", "));

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
    let lockAcquired = false;

    try {
      console.log("[Migration] Connected to MySQL/MariaDB database:", process.env.MYSQL_DATABASE || "hrms_db");

      // 1. Acquire distributed advisory lock
      const [lockRows] = await conn.query("SELECT GET_LOCK('hrms_db_migration_lock', 15) AS acquired");
      if (!lockRows || !lockRows[0] || Number(lockRows[0].acquired) !== 1) {
        throw new Error("Could not acquire distributed migration lock 'hrms_db_migration_lock' within 15 seconds. Another migration is currently executing.");
      }
      lockAcquired = true;
      console.log("[Migration] Acquired distributed advisory lock 'hrms_db_migration_lock'");

      // 2. Ensure schema_migrations table exists
      await conn.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version VARCHAR(50) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          checksum VARCHAR(64) NOT NULL,
          applied_at DATETIME NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      // 3. Query existing applied migrations
      const [appliedRows] = await conn.query("SELECT version, name, checksum, applied_at FROM schema_migrations");
      const appliedMap = new Map();
      for (const row of appliedRows) {
        appliedMap.set(row.version, row);
      }

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

      // 4. Process each migration file
      for (const file of migrationFiles) {
        const version = file.split("_")[0];
        const filePath = path.join(migrationsDir, file);
        const content = fs.readFileSync(filePath, "utf8");
        const checksum = computeChecksum(content);

        if (appliedMap.has(version)) {
          const applied = appliedMap.get(version);
          if (applied.checksum !== checksum) {
            console.warn(`[Migration Warning] Checksum mismatch for migration ${file}! Recorded: ${applied.checksum}, Current: ${checksum}`);
          } else {
            console.log(`[Migration] ${file}: Already applied on ${applied.applied_at} (checksum verified).`);
          }
          continue;
        }

        console.log(`[Migration] Applying ${file} (checksum: ${checksum.slice(0, 8)})...`);

        // Migration-specific safe execution
        if (file.startsWith("001_")) {
          // Check if Phase 1 was previously applied procedurally
          const hasFamilyId = await columnExists("accounts_refreshtoken", "family_id");
          if (!hasFamilyId) {
            // Apply columns
            await conn.query("ALTER TABLE accounts_refreshtoken ADD COLUMN family_id VARCHAR(64) NULL AFTER user_id");
            await conn.query("ALTER TABLE accounts_refreshtoken ADD COLUMN is_revoked BOOLEAN NOT NULL DEFAULT 0 AFTER expires_at");
            await conn.query("ALTER TABLE accounts_refreshtoken ADD COLUMN replaced_by_hash VARCHAR(255) NULL AFTER is_revoked");
          }
          if (!(await indexExists("accounts_refreshtoken", "idx_refresh_family"))) {
            await conn.query("CREATE INDEX idx_refresh_family ON accounts_refreshtoken(family_id)");
          }
          if (!(await indexExists("accounts_refreshtoken", "idx_refresh_token_revoked"))) {
            await conn.query("CREATE INDEX idx_refresh_token_revoked ON accounts_refreshtoken(token_hash, is_revoked)");
          }

          const hasResetHash = await columnExists("password_reset_otp", "reset_token_hash");
          if (!hasResetHash) {
            await conn.query("ALTER TABLE password_reset_otp ADD COLUMN reset_token_hash VARCHAR(128) NULL AFTER otp_hash");
            await conn.query("ALTER TABLE password_reset_otp ADD COLUMN verified_at DATETIME NULL AFTER verified");
            await conn.query("ALTER TABLE password_reset_otp ADD COLUMN consumed_at DATETIME NULL AFTER verified_at");
          }
          if (!(await indexExists("password_reset_otp", "idx_otp_email_verified"))) {
            await conn.query("CREATE INDEX idx_otp_email_verified ON password_reset_otp(email, verified)");
          }

          if (await columnExists("audit_logs", "id") && !(await columnExists("audit_logs", "severity"))) {
            await conn.query("ALTER TABLE audit_logs ADD COLUMN severity VARCHAR(20) NOT NULL DEFAULT 'INFO'");
          }
        } else if (file.startsWith("002_")) {
          // Phase 2 indexes
          const statements = parseSqlStatements(content);
          for (const statement of statements) {
            try {
              await conn.query(statement);
            } catch (err) {
              // Ignore duplicate key name errors
              if (err.errno === 1061 || err.code === "ER_DUP_KEYNAME") {
                console.log(`  - Index already exists (skipped duplicate)`);
              } else {
                throw err;
              }
            }
          }
        } else {
          // Generic migration
          const statements = parseSqlStatements(content);
          for (const statement of statements) {
            await conn.query(statement);
          }
        }

        // Record in schema_migrations
        await conn.query(
          "INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, NOW())",
          [version, file, checksum]
        );
        console.log(`[Migration] Successfully applied and recorded ${file}`);
      }

      console.log("[Migration] All MySQL/MariaDB migrations successfully executed and verified.");
    } finally {
      if (lockAcquired) {
        await conn.query("SELECT RELEASE_LOCK('hrms_db_migration_lock')");
        console.log("[Migration] Released distributed advisory lock 'hrms_db_migration_lock'");
      }
      conn.release();
      await pool.end();
    }
  } else {
    // SQLite migration
    const dbPath = path.resolve(process.cwd(), process.env.DB_PATH || "./db.sqlite3");
    const sqliteDb = await open({ filename: dbPath, driver: sqlite3.Database });
    try {
      console.log("[Migration] Connected to SQLite database:", dbPath);

      // Ensure schema_migrations exists
      await sqliteDb.run(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          checksum TEXT NOT NULL,
          applied_at TEXT NOT NULL
        )
      `);

      const appliedRows = await sqliteDb.all("SELECT version, name, checksum, applied_at FROM schema_migrations");
      const appliedMap = new Map();
      for (const row of appliedRows) {
        appliedMap.set(row.version, row);
      }

      async function sqliteColumnExists(table, column) {
        try {
          const cols = await sqliteDb.all(`PRAGMA table_info(${table})`);
          return cols.some((c) => c.name === column);
        } catch {
          return false;
        }
      }

      for (const file of migrationFiles) {
        const version = file.split("_")[0];
        const filePath = path.join(migrationsDir, file);
        const content = fs.readFileSync(filePath, "utf8");
        const checksum = computeChecksum(content);

        if (appliedMap.has(version)) {
          const applied = appliedMap.get(version);
          if (applied.checksum !== checksum) {
            console.warn(`[Migration Warning] Checksum mismatch for migration ${file}! Recorded: ${applied.checksum}, Current: ${checksum}`);
          } else {
            console.log(`[Migration] ${file}: Already applied on ${applied.applied_at} (checksum verified).`);
          }
          continue;
        }

        console.log(`[Migration] Applying SQLite migration ${file}...`);

        if (file.startsWith("001_")) {
          if (!(await sqliteColumnExists("accounts_refreshtoken", "family_id"))) {
            await sqliteDb.run("ALTER TABLE accounts_refreshtoken ADD COLUMN family_id VARCHAR(64) NULL");
          }
          if (!(await sqliteColumnExists("accounts_refreshtoken", "is_revoked"))) {
            await sqliteDb.run("ALTER TABLE accounts_refreshtoken ADD COLUMN is_revoked BOOLEAN NOT NULL DEFAULT 0");
          }
          if (!(await sqliteColumnExists("accounts_refreshtoken", "replaced_by_hash"))) {
            await sqliteDb.run("ALTER TABLE accounts_refreshtoken ADD COLUMN replaced_by_hash VARCHAR(255) NULL");
          }
          await sqliteDb.run("CREATE INDEX IF NOT EXISTS idx_refresh_family ON accounts_refreshtoken(family_id)");
          await sqliteDb.run("CREATE INDEX IF NOT EXISTS idx_refresh_token_revoked ON accounts_refreshtoken(token_hash, is_revoked)");

          if (!(await sqliteColumnExists("password_reset_otp", "reset_token_hash"))) {
            await sqliteDb.run("ALTER TABLE password_reset_otp ADD COLUMN reset_token_hash VARCHAR(128) NULL");
          }
          if (!(await sqliteColumnExists("password_reset_otp", "verified_at"))) {
            await sqliteDb.run("ALTER TABLE password_reset_otp ADD COLUMN verified_at DATETIME NULL");
          }
          if (!(await sqliteColumnExists("password_reset_otp", "consumed_at"))) {
            await sqliteDb.run("ALTER TABLE password_reset_otp ADD COLUMN consumed_at DATETIME NULL");
          }
          await sqliteDb.run("CREATE INDEX IF NOT EXISTS idx_otp_email_verified ON password_reset_otp(email, verified)");
        } else if (file.startsWith("002_")) {
          const statements = parseSqlStatements(content);
          for (const statement of statements) {
            await sqliteDb.run(statement);
          }
        } else {
          const statements = parseSqlStatements(content);
          for (const statement of statements) {
            await sqliteDb.run(statement);
          }
        }

        await sqliteDb.run(
          "INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, datetime('now'))",
          [version, file, checksum]
        );
        console.log(`[Migration] Successfully applied and recorded ${file}`);
      }

      console.log("[Migration] All SQLite migrations successfully applied and verified.");
    } finally {
      await sqliteDb.close();
    }
  }
}

runMigrations().catch((err) => {
  console.error("[Migration Error]", err);
  process.exit(1);
});
