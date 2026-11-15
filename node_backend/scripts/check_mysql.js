import mysql from "mysql2/promise";
import { config } from "../src/config/env.js";

async function main() {
  const connection = await mysql.createConnection({
    host: config.mysqlHost,
    port: config.mysqlPort,
    user: config.mysqlUser,
    password: config.mysqlPassword,
    database: config.mysqlDatabase,
  });

  console.log("Connected to Hostinger MySQL!");

  const [users] = await connection.execute("SELECT id, username, role FROM accounts_user WHERE username='emp1'");
  console.log("Users:", users);

  if (users.length > 0) {
    const userId = users[0].id;
    const [attendance] = await connection.execute(
      "SELECT * FROM attendance_attendance WHERE user_id=? ORDER BY date DESC LIMIT 5",
      [userId]
    );
    console.log("Attendance records for emp1:");
    attendance.forEach(row => {
      console.log({
        id: row.id,
        date_raw: row.date,
        date_type: typeof row.date,
        date_string: String(row.date),
        date_iso: row.date instanceof Date ? row.date.toISOString() : null,
        punch_in_time: row.punch_in_time,
        punch_out_time: row.punch_out_time,
      });
    });
  }

  await connection.end();
}

main().catch(console.error);
