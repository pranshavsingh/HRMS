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
  const normalized = content.replace(/\r\n/g, "\n");
  return crypto.createHash("sha256").update(normalized, "utf8").digest("hex");
}

function parseSqlStatements(content) {
  const lines = content.split("\n");
  const statements = [];
  let currentDelimiter = ";";
  let buffer = "";

  for (let rawLine of lines) {
    const commentIdx = rawLine.indexOf("--");
    const line = commentIdx >= 0 ? rawLine.substring(0, commentIdx) : rawLine;
    const trimmed = line.trim();

    if (trimmed.toUpperCase().startsWith("DELIMITER ")) {
      if (buffer.trim().length > 0) {
        statements.push(buffer.trim());
        buffer = "";
      }
      currentDelimiter = trimmed.substring(10).trim();
      continue;
    }

    buffer += line + "\n";

    if (currentDelimiter && buffer.includes(currentDelimiter)) {
      const parts = buffer.split(currentDelimiter);
      for (let i = 0; i < parts.length - 1; i++) {
        const stmt = parts[i].trim();
        if (stmt.length > 0) {
          statements.push(stmt);
        }
      }
      buffer = parts[parts.length - 1];
    }
  }

  if (buffer.trim().length > 0) {
    statements.push(buffer.trim());
  }

  return statements;
}

async function runMigrations() {
  const isMysql = process.env.DB_CLIENT === "mysql" || Boolean(process.env.MYSQL_HOST);
  console.log(`[Migration] Target database engine: ${isMysql ? "MySQL/MariaDB" : "SQLite"}`);

  const migrationsDir = path.resolve(__dirname, "migrations");
  if (!fs.existsSync(migrationsDir)) {
    console.log(`[Migration] Directory not found: ${migrationsDir}`);
    return;
  }

  const maxVersion = process.env.MAX_MIGRATION_VERSION || null;
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql") && (!maxVersion || f.split("_")[0] <= maxVersion))
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

      // 2. Ensure schema_migrations and critical base tables exist
      await conn.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version VARCHAR(50) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          checksum VARCHAR(64) NOT NULL,
          applied_at DATETIME NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          user_id BIGINT NULL,
          username VARCHAR(150) NULL,
          action VARCHAR(255) NOT NULL,
          target_id VARCHAR(100) NULL,
          details TEXT NULL,
          ip_address VARCHAR(45) NULL,
          severity VARCHAR(20) NOT NULL DEFAULT 'INFO',
          created_at DATETIME NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
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

      // Helper to check table existence
      async function tableExists(table) {
        const [rows] = await conn.query(
          "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
          [table]
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

      // Helper to get index columns
      async function getIndexColumns(table, indexName) {
        const [rows] = await conn.query(
          "SELECT COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? ORDER BY SEQ_IN_INDEX ASC",
          [table, indexName]
        );
        return rows.map((r) => r.COLUMN_NAME);
      }

      // Helper to check foreign key existence
      async function foreignKeyExists(table, fkName) {
        const [rows] = await conn.query(
          "SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'",
          [table, fkName]
        );
        return rows.length > 0;
      }

      // Helper to get complete column metadata
      async function getColumnDefinition(table, columnName) {
        const [rows] = await conn.query(
          `SELECT 
             COLUMN_NAME,
             DATA_TYPE,
             COLUMN_TYPE,
             CHARACTER_MAXIMUM_LENGTH,
             NUMERIC_PRECISION,
             NUMERIC_SCALE,
             IS_NULLABLE,
             COLUMN_DEFAULT,
             EXTRA
           FROM information_schema.COLUMNS
           WHERE TABLE_SCHEMA = DATABASE()
             AND TABLE_NAME = ?
             AND COLUMN_NAME = ?`,
          [table, columnName]
        );
        if (rows.length === 0) return null;
        return rows[0];
      }

      // Helper to verify column definition and fail closed on incompatibility
      async function verifyColumnDefinition(table, spec) {
        const actual = await getColumnDefinition(table, spec.name);
        if (!actual) return false; // Column absent

        const issues = [];
        if (spec.dataType && actual.DATA_TYPE.toLowerCase() !== spec.dataType.toLowerCase()) {
          issues.push(`data type mismatch (expected: ${spec.dataType}, found: ${actual.DATA_TYPE})`);
        }
        if (spec.isNullable && actual.IS_NULLABLE.toUpperCase() !== spec.isNullable.toUpperCase()) {
          issues.push(`nullability mismatch (expected: ${spec.isNullable}, found: ${actual.IS_NULLABLE})`);
        }
        if (spec.columnType && actual.COLUMN_TYPE.toLowerCase() !== spec.columnType.toLowerCase()) {
          issues.push(`column type mismatch (expected: ${spec.columnType}, found: ${actual.COLUMN_TYPE})`);
        }
        if (spec.columnDefault !== undefined) {
          const normalizeDef = (val) => {
            if (val === null || val === undefined || String(val).toUpperCase() === "NULL") return null;
            return String(val).replace(/^['`\(]|['`\)]$/g, "").trim().toLowerCase();
          };
          const actualDef = normalizeDef(actual.COLUMN_DEFAULT);
          const expectedDef = normalizeDef(spec.columnDefault);
          if (actualDef !== expectedDef) {
            issues.push(`default value mismatch (expected: ${spec.columnDefault}, found: ${actual.COLUMN_DEFAULT})`);
          }
        }

        if (issues.length > 0) {
          throw new Error(
            `MIGRATION VERIFICATION FAILED: Column '${spec.name}' on '${table}' has incompatible definition: ${issues.join("; ")}. Manual intervention required.`
          );
        }
        return true;
      }

      // Helper to get complete foreign key definition
      async function getForeignKeyDefinition(table, fkName) {
        const [rows] = await conn.query(
          `SELECT 
             kcu.CONSTRAINT_NAME,
             kcu.TABLE_NAME,
             kcu.COLUMN_NAME,
             kcu.REFERENCED_TABLE_NAME,
             kcu.REFERENCED_COLUMN_NAME,
             kcu.ORDINAL_POSITION,
             rc.DELETE_RULE,
             rc.UPDATE_RULE
           FROM information_schema.KEY_COLUMN_USAGE kcu
           JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
             ON kcu.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA
             AND kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
             AND kcu.TABLE_NAME = rc.TABLE_NAME
           WHERE kcu.CONSTRAINT_SCHEMA = DATABASE()
             AND kcu.TABLE_NAME = ?
             AND kcu.CONSTRAINT_NAME = ?
           ORDER BY kcu.ORDINAL_POSITION ASC`,
          [table, fkName]
        );
        if (rows.length === 0) return null;
        return {
          name: rows[0].CONSTRAINT_NAME,
          table: rows[0].TABLE_NAME,
          referencedTable: rows[0].REFERENCED_TABLE_NAME,
          columns: rows.map((r) => r.COLUMN_NAME),
          referencedColumns: rows.map((r) => r.REFERENCED_COLUMN_NAME),
          deleteRule: rows[0].DELETE_RULE,
          updateRule: rows[0].UPDATE_RULE,
        };
      }

      // Helper to verify foreign key definition and fail closed on incompatibility
      async function verifyForeignKeyDefinition(table, spec) {
        const actual = await getForeignKeyDefinition(table, spec.name);
        if (!actual) return false; // Foreign key absent

        // In MySQL InnoDB, RESTRICT and NO ACTION are functionally equivalent
        const normalizeRule = (r) => {
          const rule = (r || "").toUpperCase();
          return rule === "NO ACTION" ? "RESTRICT" : rule;
        };

        const issues = [];
        if (actual.table.toLowerCase() !== spec.table.toLowerCase()) {
          issues.push(`source table mismatch (expected: ${spec.table}, found: ${actual.table})`);
        }
        if (actual.referencedTable.toLowerCase() !== spec.referencedTable.toLowerCase()) {
          issues.push(`referenced table mismatch (expected: ${spec.referencedTable}, found: ${actual.referencedTable})`);
        }
        if (actual.columns.join(",").toLowerCase() !== spec.columns.join(",").toLowerCase()) {
          issues.push(`source columns mismatch (expected: [${spec.columns.join(", ")}], found: [${actual.columns.join(", ")}])`);
        }
        if (actual.referencedColumns.join(",").toLowerCase() !== spec.referencedColumns.join(",").toLowerCase()) {
          issues.push(`referenced columns mismatch (expected: [${spec.referencedColumns.join(", ")}], found: [${actual.referencedColumns.join(", ")}])`);
        }
        if (spec.deleteRule && normalizeRule(actual.deleteRule) !== normalizeRule(spec.deleteRule)) {
          issues.push(`ON DELETE rule mismatch (expected: ${spec.deleteRule}, found: ${actual.deleteRule})`);
        }
        if (spec.updateRule && normalizeRule(actual.updateRule) !== normalizeRule(spec.updateRule)) {
          issues.push(`ON UPDATE rule mismatch (expected: ${spec.updateRule}, found: ${actual.updateRule})`);
        }

        if (issues.length > 0) {
          throw new Error(
            `MIGRATION VERIFICATION FAILED: Foreign key '${spec.name}' on '${table}' has incompatible definition: ${issues.join("; ")}. Manual intervention required.`
          );
        }
        return true;
      }

      function splitAlterClauses(body) {
        const clauses = [];
        let current = "";
        let depth = 0;
        let inQuote = null;

        for (let i = 0; i < body.length; i++) {
          const ch = body[i];
          if (inQuote) {
            current += ch;
            if (ch === inQuote && body[i - 1] !== "\\") {
              inQuote = null;
            }
          } else {
            if (ch === "'" || ch === '"' || ch === "`") {
              inQuote = ch;
              current += ch;
            } else if (ch === "(") {
              depth++;
              current += ch;
            } else if (ch === ")") {
              depth--;
              current += ch;
            } else if (ch === "," && depth === 0) {
              if (current.trim().length > 0) {
                clauses.push(current.trim());
              }
              current = "";
            } else {
              current += ch;
            }
          }
        }
        if (current.trim().length > 0) {
          clauses.push(current.trim());
        }
        return clauses;
      }

      // Helper to safely execute a SQL statement on MySQL
      async function executeStatementMysql(rawStmt) {
        let stmt = rawStmt.trim();

        // 1. Check if standalone CREATE [UNIQUE] INDEX [IF NOT EXISTS]
        const indexMatch = stmt.match(/^CREATE\s+(UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?([`\w]+)\s+ON\s+([`\w]+)/i);
        if (indexMatch) {
          const [, isUnique, indexName, tableName] = indexMatch;
          const cleanTable = tableName.replace(/`/g, "");
          const cleanIndex = indexName.replace(/`/g, "");
          if (await indexExists(cleanTable, cleanIndex)) {
            console.log(`  - Index ${cleanIndex} already exists on ${cleanTable} (skipped)`);
            return;
          }
          stmt = stmt.replace(/CREATE\s+(UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS/i, isUnique ? "CREATE UNIQUE INDEX" : "CREATE INDEX");
        }

        // 2. Check if ALTER TABLE with IF NOT EXISTS clauses (MySQL 8.0 compatibility)
        const alterMatch = stmt.match(/^ALTER\s+TABLE\s+([`\w]+)\s+([\s\S]+)$/i);
        if (alterMatch && /IF\s+NOT\s+EXISTS/i.test(stmt)) {
          const cleanTable = alterMatch[1].replace(/`/g, "");
          const rawClauses = splitAlterClauses(alterMatch[2]);
          const keptClauses = [];

          for (const clause of rawClauses) {
            const addColMatch = clause.match(/^ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+([`\w]+)\s+([\s\S]+)$/i);
            const addIdxMatch = clause.match(/^ADD\s+(UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS\s+([`\w]+)\s+([\s\S]+)$/i);

            if (addColMatch) {
              const colName = addColMatch[1].replace(/`/g, "");
              const colDef = addColMatch[2];
              const exists = await getColumnDefinition(cleanTable, colName);
              if (exists) {
                console.log(`  - Column ${colName} already exists on ${cleanTable} (skipped)`);
              } else {
                keptClauses.push(`ADD COLUMN ${colName} ${colDef}`);
              }
            } else if (addIdxMatch) {
              const isUnique = Boolean(addIdxMatch[1]);
              const idxName = addIdxMatch[2].replace(/`/g, "");
              const idxDef = addIdxMatch[3];
              const exists = await indexExists(cleanTable, idxName);
              if (exists) {
                console.log(`  - Index ${idxName} already exists on ${cleanTable} (skipped)`);
              } else {
                keptClauses.push(`ADD ${isUnique ? "UNIQUE INDEX" : "INDEX"} ${idxName} ${idxDef}`);
              }
            } else {
              keptClauses.push(clause.replace(/IF\s+NOT\s+EXISTS/gi, "").trim());
            }
          }

          if (keptClauses.length === 0) {
            console.log(`  - All clauses in ALTER TABLE ${cleanTable} already applied (skipped)`);
            return;
          }
          stmt = `ALTER TABLE ${cleanTable} ${keptClauses.join(", ")}`;
        }

        try {
          await conn.query(stmt);
        } catch (err) {
          if (err.errno === 1060 || err.code === "ER_DUP_FIELDNAME") {
            console.log("  - Column already exists (skipped duplicate)");
          } else if (err.errno === 1061 || err.code === "ER_DUP_KEYNAME") {
            console.log("  - Index already exists (skipped duplicate)");
          } else {
            throw err;
          }
        }
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
            throw new Error(
              `[CHECKSUM INTEGRITY VIOLATION] Migration '${file}' has been tampered or modified after it was applied.\n` +
              `  Recorded checksum : ${applied.checksum}\n` +
              `  Current checksum  : ${checksum}\n` +
              `  Applied at        : ${applied.applied_at}\n` +
              `This is a critical integrity error. All subsequent migrations have been blocked.\n` +
              `Manual DBA investigation and recovery are required before migrations can proceed.\n` +
              `Do NOT rewrite the stored checksum automatically — investigate the source of the discrepancy first.`
            );
          }
          console.log(`[Migration] ${file}: Already applied on ${applied.applied_at} (checksum verified).`);
          continue;
        }

        console.log(`[Migration] Applying ${file} (checksum: ${checksum.slice(0, 8)})...`);

        // Migration-specific safe execution
        if (file.startsWith("001_")) {
          // Check if Phase 1 was previously applied procedurally
          const hasFamilyId = await columnExists("accounts_refreshtoken", "family_id");
          if (!hasFamilyId) {
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
        } else if (file.startsWith("005_")) {
          const hasClaimedBy = await columnExists("consumer_processed_jobs", "claimed_by");
          if (!hasClaimedBy) {
            await conn.query("ALTER TABLE consumer_processed_jobs ADD COLUMN claimed_by VARCHAR(100) NULL AFTER handler_name");
            await conn.query("ALTER TABLE consumer_processed_jobs ADD COLUMN lease_expires_at DATETIME NULL AFTER claimed_by");
            await conn.query("ALTER TABLE consumer_processed_jobs ADD COLUMN fencing_token BIGINT NOT NULL DEFAULT 1 AFTER lease_expires_at");
            await conn.query("ALTER TABLE consumer_processed_jobs ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at");
          }
          if (!(await indexExists("consumer_processed_jobs", "idx_consumer_lease"))) {
            await conn.query("CREATE INDEX idx_consumer_lease ON consumer_processed_jobs(status, lease_expires_at)");
          }
        } else if (file.startsWith("010_")) {
          // Parse and safely execute each statement first
          const statements = parseSqlStatements(content);
          for (const statement of statements) {
            await executeStatementMysql(statement);
          }

          // Strict Specification Reconciliation & Verification for Migration 010
          console.log("  - Running strict specification verification and reconciliation for Migration 010...");

          // 1. Verify all 4 expected tables exist
          const expectedTables = [
            "workforce_employee_fixed_assignment",
            "workforce_rotation_definition",
            "workforce_rotation_step",
            "workforce_employee_rotation",
          ];
          for (const tbl of expectedTables) {
            if (!(await tableExists(tbl))) {
              throw new Error(`MIGRATION 010 VERIFICATION FAILED: Table '${tbl}' is absent!`);
            }
          }

          // 2. Table: workforce_employee_fixed_assignment
          const effectiveToSpec = {
            name: "effective_to",
            dataType: "date",
            isNullable: "YES",
            columnDefault: null,
          };
          if (!(await verifyColumnDefinition("workforce_employee_fixed_assignment", effectiveToSpec))) {
            console.log("  - [Repair] Adding missing column 'effective_to' on workforce_employee_fixed_assignment");
            await conn.query("ALTER TABLE workforce_employee_fixed_assignment ADD COLUMN effective_to DATE NULL AFTER effective_from");
            await verifyColumnDefinition("workforce_employee_fixed_assignment", effectiveToSpec);
          }

          const isActiveSpec = {
            name: "is_active",
            dataType: "tinyint",
            columnType: "tinyint(1)",
            isNullable: "NO",
            columnDefault: "1",
          };
          if (!(await verifyColumnDefinition("workforce_employee_fixed_assignment", isActiveSpec))) {
            console.log("  - [Repair] Adding missing column 'is_active' on workforce_employee_fixed_assignment");
            await conn.query("ALTER TABLE workforce_employee_fixed_assignment ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT 1 AFTER effective_to");
            await verifyColumnDefinition("workforce_employee_fixed_assignment", isActiveSpec);
          }

          // Index validation: idx_wefa_tenant_user_active
          if (await indexExists("workforce_employee_fixed_assignment", "idx_wefa_tenant_user_active")) {
            const cols = await getIndexColumns("workforce_employee_fixed_assignment", "idx_wefa_tenant_user_active");
            const expectedCols = ["tenant_id", "user_id", "is_active"];
            const matches = cols.length === expectedCols.length && cols.every((c, i) => c === expectedCols[i]);
            if (!matches) {
              throw new Error(`MIGRATION 010 VERIFICATION FAILED: Index 'idx_wefa_tenant_user_active' has incompatible columns [${cols.join(", ")}]. Expected [${expectedCols.join(", ")}]. Manual intervention required.`);
            }
          } else {
            console.log("  - [Repair] Creating missing index 'idx_wefa_tenant_user_active'");
            await conn.query("CREATE INDEX idx_wefa_tenant_user_active ON workforce_employee_fixed_assignment(tenant_id, user_id, is_active)");
          }

          // Foreign keys on workforce_employee_fixed_assignment
          const fk_wefa_user_spec = {
            name: "fk_wefa_user",
            table: "workforce_employee_fixed_assignment",
            columns: ["user_id"],
            referencedTable: "accounts_user",
            referencedColumns: ["id"],
            deleteRule: "RESTRICT",
            updateRule: "RESTRICT",
          };
          if (!(await verifyForeignKeyDefinition("workforce_employee_fixed_assignment", fk_wefa_user_spec))) {
            console.log("  - [Repair] Adding missing foreign key 'fk_wefa_user'");
            await conn.query("ALTER TABLE workforce_employee_fixed_assignment ADD CONSTRAINT fk_wefa_user FOREIGN KEY (user_id) REFERENCES accounts_user(id) ON DELETE RESTRICT");
            await verifyForeignKeyDefinition("workforce_employee_fixed_assignment", fk_wefa_user_spec);
          }

          const fk_wefa_shift_spec = {
            name: "fk_wefa_shift",
            table: "workforce_employee_fixed_assignment",
            columns: ["tenant_id", "shift_id"],
            referencedTable: "workforce_shift",
            referencedColumns: ["tenant_id", "id"],
            deleteRule: "RESTRICT",
            updateRule: "RESTRICT",
          };
          if (!(await verifyForeignKeyDefinition("workforce_employee_fixed_assignment", fk_wefa_shift_spec))) {
            console.log("  - [Repair] Adding missing foreign key 'fk_wefa_shift'");
            await conn.query("ALTER TABLE workforce_employee_fixed_assignment ADD CONSTRAINT fk_wefa_shift FOREIGN KEY (tenant_id, shift_id) REFERENCES workforce_shift(tenant_id, id) ON DELETE RESTRICT");
            await verifyForeignKeyDefinition("workforce_employee_fixed_assignment", fk_wefa_shift_spec);
          }

          const fk_wefa_user_tenant_spec = {
            name: "fk_wefa_user_tenant",
            table: "workforce_employee_fixed_assignment",
            columns: ["tenant_id", "user_id"],
            referencedTable: "workforce_user_tenant",
            referencedColumns: ["tenant_id", "user_id"],
            deleteRule: "RESTRICT",
            updateRule: "RESTRICT",
          };
          if (!(await verifyForeignKeyDefinition("workforce_employee_fixed_assignment", fk_wefa_user_tenant_spec))) {
            console.log("  - [Repair] Adding missing foreign key 'fk_wefa_user_tenant'");
            await conn.query("ALTER TABLE workforce_employee_fixed_assignment ADD CONSTRAINT fk_wefa_user_tenant FOREIGN KEY (tenant_id, user_id) REFERENCES workforce_user_tenant(tenant_id, user_id) ON DELETE RESTRICT");
            await verifyForeignKeyDefinition("workforce_employee_fixed_assignment", fk_wefa_user_tenant_spec);
          }

          // 3. Table: workforce_rotation_definition
          const fk_wrd_tenant_spec = {
            name: "fk_wrd_tenant",
            table: "workforce_rotation_definition",
            columns: ["tenant_id"],
            referencedTable: "workforce_tenant",
            referencedColumns: ["id"],
            deleteRule: "RESTRICT",
            updateRule: "RESTRICT",
          };
          if (!(await verifyForeignKeyDefinition("workforce_rotation_definition", fk_wrd_tenant_spec))) {
            console.log("  - [Repair] Adding missing foreign key 'fk_wrd_tenant'");
            await conn.query("ALTER TABLE workforce_rotation_definition ADD CONSTRAINT fk_wrd_tenant FOREIGN KEY (tenant_id) REFERENCES workforce_tenant(id) ON DELETE RESTRICT");
            await verifyForeignKeyDefinition("workforce_rotation_definition", fk_wrd_tenant_spec);
          }

          // 4. Table: workforce_rotation_step
          const fk_wrs_rotation_spec = {
            name: "fk_wrs_rotation",
            table: "workforce_rotation_step",
            columns: ["tenant_id", "rotation_id"],
            referencedTable: "workforce_rotation_definition",
            referencedColumns: ["tenant_id", "id"],
            deleteRule: "RESTRICT",
            updateRule: "RESTRICT",
          };
          if (!(await verifyForeignKeyDefinition("workforce_rotation_step", fk_wrs_rotation_spec))) {
            console.log("  - [Repair] Adding missing foreign key 'fk_wrs_rotation'");
            await conn.query("ALTER TABLE workforce_rotation_step ADD CONSTRAINT fk_wrs_rotation FOREIGN KEY (tenant_id, rotation_id) REFERENCES workforce_rotation_definition(tenant_id, id) ON DELETE RESTRICT");
            await verifyForeignKeyDefinition("workforce_rotation_step", fk_wrs_rotation_spec);
          }

          const fk_wrs_shift_spec = {
            name: "fk_wrs_shift",
            table: "workforce_rotation_step",
            columns: ["tenant_id", "shift_id"],
            referencedTable: "workforce_shift",
            referencedColumns: ["tenant_id", "id"],
            deleteRule: "RESTRICT",
            updateRule: "RESTRICT",
          };
          if (!(await verifyForeignKeyDefinition("workforce_rotation_step", fk_wrs_shift_spec))) {
            console.log("  - [Repair] Adding missing foreign key 'fk_wrs_shift'");
            await conn.query("ALTER TABLE workforce_rotation_step ADD CONSTRAINT fk_wrs_shift FOREIGN KEY (tenant_id, shift_id) REFERENCES workforce_shift(tenant_id, id) ON DELETE RESTRICT");
            await verifyForeignKeyDefinition("workforce_rotation_step", fk_wrs_shift_spec);
          }

          // 5. Table: workforce_employee_rotation
          if (await indexExists("workforce_employee_rotation", "idx_wer_tenant_user_active")) {
            const cols = await getIndexColumns("workforce_employee_rotation", "idx_wer_tenant_user_active");
            const expectedCols = ["tenant_id", "user_id", "is_active"];
            const matches = cols.length === expectedCols.length && cols.every((c, i) => c === expectedCols[i]);
            if (!matches) {
              throw new Error(`MIGRATION 010 VERIFICATION FAILED: Index 'idx_wer_tenant_user_active' has incompatible columns [${cols.join(", ")}]. Expected [${expectedCols.join(", ")}]. Manual intervention required.`);
            }
          } else {
            console.log("  - [Repair] Creating missing index 'idx_wer_tenant_user_active'");
            await conn.query("CREATE INDEX idx_wer_tenant_user_active ON workforce_employee_rotation(tenant_id, user_id, is_active)");
          }

          const fk_wer_user_spec = {
            name: "fk_wer_user",
            table: "workforce_employee_rotation",
            columns: ["user_id"],
            referencedTable: "accounts_user",
            referencedColumns: ["id"],
            deleteRule: "RESTRICT",
            updateRule: "RESTRICT",
          };
          if (!(await verifyForeignKeyDefinition("workforce_employee_rotation", fk_wer_user_spec))) {
            console.log("  - [Repair] Adding missing foreign key 'fk_wer_user'");
            await conn.query("ALTER TABLE workforce_employee_rotation ADD CONSTRAINT fk_wer_user FOREIGN KEY (user_id) REFERENCES accounts_user(id) ON DELETE RESTRICT");
            await verifyForeignKeyDefinition("workforce_employee_rotation", fk_wer_user_spec);
          }

          const fk_wer_rotation_spec = {
            name: "fk_wer_rotation",
            table: "workforce_employee_rotation",
            columns: ["tenant_id", "rotation_id"],
            referencedTable: "workforce_rotation_definition",
            referencedColumns: ["tenant_id", "id"],
            deleteRule: "RESTRICT",
            updateRule: "RESTRICT",
          };
          if (!(await verifyForeignKeyDefinition("workforce_employee_rotation", fk_wer_rotation_spec))) {
            console.log("  - [Repair] Adding missing foreign key 'fk_wer_rotation'");
            await conn.query("ALTER TABLE workforce_employee_rotation ADD CONSTRAINT fk_wer_rotation FOREIGN KEY (tenant_id, rotation_id) REFERENCES workforce_rotation_definition(tenant_id, id) ON DELETE RESTRICT");
            await verifyForeignKeyDefinition("workforce_employee_rotation", fk_wer_rotation_spec);
          }

          const fk_wer_user_tenant_spec = {
            name: "fk_wer_user_tenant",
            table: "workforce_employee_rotation",
            columns: ["tenant_id", "user_id"],
            referencedTable: "workforce_user_tenant",
            referencedColumns: ["tenant_id", "user_id"],
            deleteRule: "RESTRICT",
            updateRule: "RESTRICT",
          };
          if (!(await verifyForeignKeyDefinition("workforce_employee_rotation", fk_wer_user_tenant_spec))) {
            console.log("  - [Repair] Adding missing foreign key 'fk_wer_user_tenant'");
            await conn.query("ALTER TABLE workforce_employee_rotation ADD CONSTRAINT fk_wer_user_tenant FOREIGN KEY (tenant_id, user_id) REFERENCES workforce_user_tenant(tenant_id, user_id) ON DELETE RESTRICT");
            await verifyForeignKeyDefinition("workforce_employee_rotation", fk_wer_user_tenant_spec);
          }

          console.log("  - Strict verification for Migration 010 PASSED: all 4 tables, columns, indexes, and FKs validated.");
        } else {
          // Parse and safely execute each statement
          const statements = parseSqlStatements(content);
          for (const statement of statements) {
            await executeStatementMysql(statement);
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

      // Ensure schema_migrations and critical base tables exist
      await sqliteDb.run(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          checksum TEXT NOT NULL,
          applied_at TEXT NOT NULL
        )
      `);

      await sqliteDb.run(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NULL,
          username TEXT NULL,
          action TEXT NOT NULL,
          target_id TEXT NULL,
          details TEXT NULL,
          ip_address TEXT NULL,
          severity TEXT NOT NULL DEFAULT 'INFO',
          created_at TEXT NOT NULL
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
            throw new Error(
              `[CHECKSUM INTEGRITY VIOLATION] Migration '${file}' has been tampered or modified after it was applied.\n` +
              `  Recorded checksum : ${applied.checksum}\n` +
              `  Current checksum  : ${checksum}\n` +
              `  Applied at        : ${applied.applied_at}\n` +
              `This is a critical integrity error. All subsequent migrations have been blocked.\n` +
              `Manual DBA investigation and recovery are required before migrations can proceed.\n` +
              `Do NOT rewrite the stored checksum automatically — investigate the source of the discrepancy first.`
            );
          }
          console.log(`[Migration] ${file}: Already applied on ${applied.applied_at} (checksum verified).`);
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
        } else if (file.startsWith("003_")) {
          await sqliteDb.run(`
            CREATE TABLE IF NOT EXISTS outbox_events (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              event_type TEXT NOT NULL,
              aggregate_type TEXT NOT NULL,
              aggregate_id TEXT NOT NULL,
              payload TEXT NOT NULL,
              idempotency_key TEXT NOT NULL UNIQUE,
              status TEXT NOT NULL DEFAULT 'PENDING',
              retry_count INTEGER NOT NULL DEFAULT 0,
              claimed_by TEXT NULL,
              claimed_until TEXT NULL,
              last_error TEXT NULL,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              published_at TEXT NULL,
              updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
          `);
          await sqliteDb.run("CREATE INDEX IF NOT EXISTS idx_outbox_pending ON outbox_events(status, id)");
          await sqliteDb.run("CREATE INDEX IF NOT EXISTS idx_outbox_claim ON outbox_events(status, claimed_until, id)");
          await sqliteDb.run("CREATE INDEX IF NOT EXISTS idx_outbox_created ON outbox_events(created_at)");
        } else if (file.startsWith("004_")) {
          await sqliteDb.run(`
            CREATE TABLE IF NOT EXISTS consumer_processed_jobs (
              job_id TEXT NOT NULL,
              handler_name TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'COMPLETED',
              result TEXT NULL,
              created_at TEXT NOT NULL DEFAULT (datetime('now')),
              PRIMARY KEY (job_id, handler_name)
            )
          `);
          await sqliteDb.run("CREATE INDEX IF NOT EXISTS idx_consumer_processed_at ON consumer_processed_jobs(created_at)");
        } else if (file.startsWith("005_")) {
          if (!(await sqliteColumnExists("consumer_processed_jobs", "claimed_by"))) {
            await sqliteDb.run("ALTER TABLE consumer_processed_jobs ADD COLUMN claimed_by TEXT NULL");
          }
          if (!(await sqliteColumnExists("consumer_processed_jobs", "lease_expires_at"))) {
            await sqliteDb.run("ALTER TABLE consumer_processed_jobs ADD COLUMN lease_expires_at TEXT NULL");
          }
          if (!(await sqliteColumnExists("consumer_processed_jobs", "fencing_token"))) {
            await sqliteDb.run("ALTER TABLE consumer_processed_jobs ADD COLUMN fencing_token INTEGER NOT NULL DEFAULT 1");
          }
          if (!(await sqliteColumnExists("consumer_processed_jobs", "updated_at"))) {
            await sqliteDb.run("ALTER TABLE consumer_processed_jobs ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))");
          }
          await sqliteDb.run("CREATE INDEX IF NOT EXISTS idx_consumer_lease ON consumer_processed_jobs(status, lease_expires_at)");
        } else {
          const statements = parseSqlStatements(content);
          for (let statement of statements) {
            // For SQLite, ensure CREATE INDEX statements use IF NOT EXISTS
            if (statement.toUpperCase().startsWith("CREATE INDEX") && !statement.toUpperCase().includes("IF NOT EXISTS")) {
              statement = statement.replace(/CREATE\s+INDEX/i, "CREATE INDEX IF NOT EXISTS");
            }
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
