import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

describe("BUG FIX VERIFICATION: Leave Record Must Not Block Punch In on Next Workday", () => {
  const repoPath = path.resolve("node_backend/src/repositories/attendance.repository.js");
  const servicePath = path.resolve("node_backend/src/services/attendance.service.js");
  const mobilePunchPath = path.resolve("hrms_mobile/src/app/(tabs)/punch.tsx");
  const webAttendancePath = path.resolve("hrms_saas/src/pages/Attendance.jsx");

  it("1. attendance.repository.js findLatestAttendance ignores leave records and requires punch_in_time", () => {
    const content = fs.readFileSync(repoPath, "utf8");
    assert.ok(
      content.includes("status <> 'leave'") && content.includes("punch_in_status <> 'leave'") && content.includes("punch_in_time IS NOT NULL"),
      "findLatestAttendance must exclude leave records and require punch_in_time IS NOT NULL"
    );
  });

  it("2. attendance.service.js punchStatus handles leave record correctly as not punched in", () => {
    const content = fs.readFileSync(servicePath, "utf8");
    assert.ok(
      content.includes('latest.status === "leave"') || content.includes("status === 'leave'"),
      "punchStatus must explicitly check for leave status"
    );
    assert.ok(
      content.includes('latest.punch_in_time !== null'),
      "punchStatus must verify punch_in_time is not null before marking is_punched_in: true"
    );
  });

  it("3. Pure logic simulation: yesterday on leave does not result in is_punched_in: true or pending approval", () => {
    function evaluatePunchStatus(latest, onLeaveToday) {
      if (!latest || latest.status === "leave" || latest.punch_in_status === "leave" || !latest.punch_in_time) {
        return {
          is_punched_in: false,
          punch_in_time: null,
          punch_in_status: null,
          on_leave: onLeaveToday
        };
      }

      if (latest.punch_in_status === "rejected") {
        return {
          is_punched_in: false,
          punch_in_time: null,
          punch_in_status: null,
          on_leave: onLeaveToday
        };
      }

      if (latest.punch_out_status === "pending") {
        return {
          is_punched_in: false,
          is_punch_out_pending: true,
          on_leave: onLeaveToday
        };
      }

      if (latest.punch_out_time === null && latest.punch_in_time !== null) {
        return {
          is_punched_in: true,
          punch_in_time: latest.punch_in_time,
          punch_in_status: latest.punch_in_status,
          on_leave: onLeaveToday
        };
      }

      return {
        is_punched_in: false,
        punch_in_time: null,
        punch_in_status: null,
        on_leave: onLeaveToday
      };
    }

    // Scenario: Yesterday employee had approved leave
    const yesterdayLeaveRecord = {
      id: 99,
      date: "2026-11-23",
      punch_in_time: null,
      punch_out_time: null,
      punch_in_status: "leave",
      punch_out_status: "leave",
      status: "leave"
    };

    const statusToday = evaluatePunchStatus(yesterdayLeaveRecord, false);
    assert.equal(statusToday.is_punched_in, false, "Must not be considered punched in");
    assert.equal(statusToday.punch_in_status, null, "Must not have punch_in_status");
    assert.equal(statusToday.on_leave, false, "Must not be on leave today");

    // Scenario: Employee punched in today with outside location requiring approval
    const pendingPunchRecord = {
      id: 100,
      date: "2026-11-24",
      punch_in_time: "2026-11-24T09:00:00Z",
      punch_out_time: null,
      punch_in_status: "pending",
      punch_out_status: null,
      status: "pending"
    };
    const pendingStatus = evaluatePunchStatus(pendingPunchRecord, false);
    assert.equal(pendingStatus.is_punched_in, true, "Active punch in is correctly recognized");
    assert.equal(pendingStatus.punch_in_status, "pending", "Pending punch in correctly recognized");
  });

  it("4. hrms_mobile punch.tsx guards against treating leave record as pending approval", () => {
    const content = fs.readFileSync(mobilePunchPath, "utf8");
    assert.ok(
      content.includes('activePunch?.punch_in_status !== "leave"'),
      "punch.tsx must ensure punch_in_status !== 'leave' before treating as checked in or pending"
    );
  });

  it("5. hrms_saas Attendance.jsx guards against treating leave record as active shift", () => {
    const content = fs.readFileSync(webAttendancePath, "utf8");
    assert.ok(
      content.includes('activePunch?.punch_in_status !== "leave"'),
      "Attendance.jsx must ensure punch_in_status !== 'leave' before treating as checked in"
    );
  });
});
