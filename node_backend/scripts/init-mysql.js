import "dotenv/config";
import fs from "fs";
import path from "path";
import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 5,
});

const schemaPath = path.resolve(process.cwd(), "scripts", "schema.mysql.sql");
const sql = fs.readFileSync(schemaPath, "utf8");
const statements = sql
  .split(/;\s*\n/)
  .map((s) => s.trim())
  .filter(Boolean);

for (const stmt of statements) {
  await pool.query(stmt);
}

console.log("MySQL schema initialized successfully.");
await pool.end();