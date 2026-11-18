import "dotenv/config";
import fs from "fs";
import path from "path";
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "hrms_ci_test",
  waitForConnections: true,
  connectionLimit: 5,
});

const schemaPath = path.resolve(process.cwd(), "scripts", "schema.mysql.sql");
const sql = fs.readFileSync(schemaPath, "utf8");
const statements = sql
  .split(/;\s*\n/)
  .map((s) => s.trim())
  .filter(Boolean);

const conn = await pool.getConnection();
try {
  for (let stmt of statements) {
    // Strip comments if present
    const cleanedStmt = stmt.replace(/^(\s*--[^\n]*\n)+/, "").trim();

    // If it's a CREATE INDEX IF NOT EXISTS statement, convert for MySQL 8.0 compatibility:
    // MySQL 8.0 doesn't support IF NOT EXISTS in CREATE INDEX.
    if (/^CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS/i.test(cleanedStmt)) {
      const match = cleanedStmt.match(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+([`\w]+)\s+ON\s+([`\w]+)/i);
      if (match) {
        const [, indexName, tableName] = match;
        const [existing] = await conn.query(
          "SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?",
          [tableName.replace(/`/g, ""), indexName.replace(/`/g, "")]
        );
        if (existing.length > 0) {
          continue; // Index already exists
        }
        stmt = cleanedStmt.replace(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS/i, "CREATE INDEX");
      }
    }

    try {
      await conn.query(stmt);
    } catch (err) {
      if (err.code === "ER_DUP_KEYNAME" || err.code === "ER_TABLE_EXISTS_ERROR") {
        // already exists, harmless
      } else {
        console.warn(`[Warning during schema init] ${err.message}`);
      }
    }
  }

  // Ensure default test user exists if table is empty (for CI test execution)
  const [users] = await conn.query("SELECT id FROM accounts_user WHERE username = 'admin' LIMIT 1");
  if (users.length === 0) {
    const bcrypt = await import("bcryptjs");
    const hashed = await bcrypt.default.hash("AdminPassword123!", 12);
    await conn.query(
      `INSERT INTO accounts_user (password, username, first_name, last_name, email, is_superuser, is_staff, is_active, date_joined, role)
       VALUES (?, 'admin', 'System', 'Admin', 'admin@hrms.internal', 1, 1, 1, NOW(), 'superadmin')`,
      [hashed]
    );
    console.log("Seeded default test admin user.");
  }

  console.log("MySQL schema initialized successfully.");
} finally {
  conn.release();
  await pool.end();
}
