import "dotenv/config";
import path from "path";
import { open } from "sqlite";
import sqlite3 from "sqlite3";
import mysql from "mysql2/promise";

const sqliteFile = path.resolve(process.cwd(), process.env.DB_PATH || "./db.sqlite3");
const sqliteDb = await open({ filename: sqliteFile, driver: sqlite3.Database });

const mysqlPool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 5,
});

const tables = [
  "accounts_user",
  "accounts_employeeprofile",
  "accounts_employeedocument",
  "attendance_attendance",
  "attendance_attendanceapproval",
  "leave_leave",
];

for (const table of tables) {
  const rows = await sqliteDb.all(`SELECT * FROM ${table}`);
  if (!rows.length) {
    console.log(`${table}: 0 rows`);
    continue;
  }

  const cols = Object.keys(rows[0]);
  const placeholders = cols.map(() => "?").join(",");
  const colSql = cols.join(",");
  const insertSql = `INSERT INTO ${table} (${colSql}) VALUES (${placeholders})`;

  await mysqlPool.query(`DELETE FROM ${table}`);

  for (const row of rows) {
    await mysqlPool.execute(insertSql, cols.map((c) => row[c]));
  }

  console.log(`${table}: migrated ${rows.length} rows`);
}

await sqliteDb.close();
await mysqlPool.end();
console.log("SQLite -> MySQL migration completed.");