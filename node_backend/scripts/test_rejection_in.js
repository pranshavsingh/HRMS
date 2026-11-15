import mysql from "mysql2/promise";
import dotenv from "dotenv";
import { attendanceService } from "../src/services/attendance.service.js";
import { db } from "../src/db/index.js";

dotenv.config();

async function main() {
  const userId = 7; // employe1

  // 1. Create a dummy attendance record with pending punch-in
  const now = new Date();
  const dateStr = "2026-06-01";
  const attResult = await db.run(
    `INSERT INTO attendance_attendance 
     (date, punch_in_time, punch_out_time, punch_in_photo, punch_out_photo, punch_in_lat, punch_in_lng, punch_out_lat, punch_out_lng, status, is_outside_location, user_id, punch_in_outside, punch_out_outside, punch_in_status, punch_out_status)
     VALUES (?, ?, NULL, 'photo_in.jpg', NULL, 22.6, 88.4, NULL, NULL, 'pending', 1, ?, 1, 0, 'pending', 'approved')`,
    [dateStr, now, userId]
  );
  const attId = attResult.lastID;
  console.log("Created dummy attendance ID:", attId);

  // 2. Insert a pending approval record for the punch-in
  const appResult = await db.run(
    `INSERT INTO attendance_attendanceapproval 
     (role, status, comment, created_at, approved_by_id, attendance_id, type)
     VALUES ('hr', 'pending', '', ?, 3, ?, 'in')`,
    [now, attId]
  );
  const approvalId = appResult.lastID;
  console.log("Created dummy approval ID:", approvalId);

  // 3. Call approvalAction with 'rejected' by hr1 (user_id = 3)
  const actor = { id: 3, role: "hr", first_name: "HR", last_name: "One", username: "hr1" };
  const res = await attendanceService.approvalAction(approvalId, "rejected", "Test rejection comment", actor);
  console.log("Rejection service result:", res);

  // 4. Retrieve and print database rows
  const dbApproval = await db.get("SELECT * FROM attendance_attendanceapproval WHERE id=?", [approvalId]);
  console.log("--- RESULTING APPROVAL ROW (should be undefined) ---");
  console.log(dbApproval);

  const dbAttendance = await db.get("SELECT * FROM attendance_attendance WHERE id=?", [attId]);
  console.log("--- RESULTING ATTENDANCE ROW (should be undefined) ---");
  console.log(dbAttendance);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
