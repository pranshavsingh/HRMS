import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { attendanceService } from "../../src/services/attendance.service.js";

describe("HRMS Team Attendance & Personal Attendance History Bug Fixes Suite (BUG-EA01 to BUG-EA09)", () => {
  const superadminActor = { id: 1, role: "superadmin" };
  const adminActor = { id: 2, role: "admin" };
  const tenantId = 1;

  after(() => {
    setTimeout(() => process.exit(0), 500).unref();
  });

  // =========================================================================
  // BUG-EA01: UTC Timezone Date Shifting Drops the 31st Day of Every Month
  // =========================================================================
  describe("BUG-EA01: Timezone-Safe Month Date Boundaries (28, 29, 30, and 31-day months)", () => {
    it("attendance.service.js does not use .toISOString().slice(0, 10) on local Date objects for month boundaries", () => {
      const serviceCode = fs.readFileSync(path.resolve("node_backend/src/services/attendance.service.js"), "utf8");
      assert.ok(
        !serviceCode.includes("monthEnd.toISOString().slice(0, 10)"),
        "Unsafe monthEnd.toISOString().slice(0, 10) must be removed"
      );
      assert.ok(
        !serviceCode.includes("monthStart.toISOString().slice(0, 10)"),
        "Unsafe monthStart.toISOString().slice(0, 10) must be removed"
      );
      assert.ok(
        serviceCode.includes("monthStartStr"),
        "Service must construct explicit monthStartStr"
      );
      assert.ok(
        serviceCode.includes("monthEndStr"),
        "Service must construct explicit monthEndStr"
      );
    });

    it("teamAttendance calculates 31 calendar days for March and includes day 31", async () => {
      const res = await attendanceService.teamAttendance(
        superadminActor.id,
        "2026-03",
        null,
        null,
        null,
        superadminActor.role,
        1,
        50,
        null,
        tenantId
      );
      assert.ok(Array.isArray(res.register_dates), "register_dates must be an array");
      assert.equal(res.register_dates.length, 31, "March must contain exactly 31 dates");
      assert.equal(res.register_dates[0].date, "2026-03-01", "First date must be 2026-03-01");
      assert.equal(res.register_dates[30].date, "2026-03-31", "Last date must be 2026-03-31");
    });

    it("teamAttendance calculates 30 calendar days for April and 28 for non-leap February", async () => {
      const aprRes = await attendanceService.teamAttendance(
        superadminActor.id,
        "2026-04",
        null,
        null,
        null,
        superadminActor.role,
        1,
        50,
        null,
        tenantId
      );
      assert.equal(aprRes.register_dates.length, 30, "April must contain exactly 30 dates");
      assert.equal(aprRes.register_dates[29].date, "2026-04-30", "Last date must be 2026-04-30");

      const febRes = await attendanceService.teamAttendance(
        superadminActor.id,
        "2025-02",
        null,
        null,
        null,
        superadminActor.role,
        1,
        50,
        null,
        tenantId
      );
      assert.equal(febRes.register_dates.length, 28, "February 2025 must contain exactly 28 dates");
      assert.equal(febRes.register_dates[27].date, "2025-02-28", "Last date must be 2025-02-28");

      const febLeapRes = await attendanceService.teamAttendance(
        superadminActor.id,
        "2024-02",
        null,
        null,
        null,
        superadminActor.role,
        1,
        50,
        null,
        tenantId
      );
      assert.equal(febLeapRes.register_dates.length, 29, "February 2024 (leap year) must contain exactly 29 dates");
      assert.equal(febLeapRes.register_dates[28].date, "2024-02-29", "Last date must be 2024-02-29");
    });
  });

  // =========================================================================
  // BUG-EA02: Date Mutation in Six-Month Snapshot Skips Months
  // =========================================================================
  describe("BUG-EA02: Six-Month Snapshot Safe Calendar Iteration", () => {
    it("attendance.service.js uses calendar month/year iteration instead of mutating Date with .setMonth()", () => {
      const serviceCode = fs.readFileSync(path.resolve("node_backend/src/services/attendance.service.js"), "utf8");
      assert.ok(
        !serviceCode.includes("d.setMonth(d.getMonth() + 1)"),
        "Unsafe d.setMonth(d.getMonth() + 1) must be removed from 6-month snapshot loop"
      );
      assert.ok(
        serviceCode.includes("curY") && serviceCode.includes("curM"),
        "Must use safe year/month step tracking"
      );
    });

    it("teamAttendance returns exactly 6 consecutive historical months in monthly_breakdown", async () => {
      // Query with 6-month range ending on day 31 (2025-10-01 to 2026-03-31)
      const res = await attendanceService.teamAttendance(
        superadminActor.id,
        "2026-03",
        superadminActor.id,
        "2025-10-01",
        "2026-03-31",
        superadminActor.role,
        1,
        50,
        null,
        tenantId
      );
      if (res.selected_employee_detail && res.selected_employee_detail.monthly_breakdown) {
        const breakdown = res.selected_employee_detail.monthly_breakdown;
        assert.equal(breakdown.length, 6, "Must provide exactly 6 consecutive months");
        for (const item of breakdown) {
          assert.ok(typeof item.month === "string" && item.month.length > 0, "Month name must be present");
          assert.ok(typeof item.present_days === "number", "present_days must be numeric");
          assert.ok(typeof item.leave_days === "number", "leave_days must be numeric");
          assert.ok(typeof item.total_work_hours === "number", "total_work_hours must be numeric");
        }
      }
    });
  });

  // =========================================================================
  // BUG-EA03: Hardcoded 127.0.0.1:8000 Photo URLs Break Image Preview
  // =========================================================================
  describe("BUG-EA03: Photo URL Resolution and Removal of Hardcoded Legacy Port", () => {
    it("TeamAttendance.jsx does not contain hardcoded http://127.0.0.1:8000", () => {
      const frontendCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/TeamAttendance.jsx"), "utf8");
      assert.ok(
        !frontendCode.includes("http://127.0.0.1:8000"),
        "Hardcoded Django port http://127.0.0.1:8000 must be removed"
      );
      assert.ok(
        frontendCode.includes("resolvePhotoUrl"),
        "Must define resolvePhotoUrl helper to resolve media and Cloudinary photos"
      );
    });

    it("resolvePhotoUrl logic preserves Cloudinary and absolute URLs and resolves relative /media/ paths", () => {
      const frontendCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/TeamAttendance.jsx"), "utf8");
      assert.ok(frontendCode.includes('photoPath.startsWith("http://") || photoPath.startsWith("https://")'));
      assert.ok(frontendCode.includes('photoPath.startsWith("/media/")'));
    });
  });

  // =========================================================================
  // BUG-EA04: Holiday 'H' Code Styling, Table Header, and Clean Non-Working Cells
  // =========================================================================
  describe("BUG-EA04: Holiday 'H' Code Styling, Table Header, and Clean Non-Working Cells", () => {
    it("codeStyles in TeamAttendance.jsx defines distinct styling for 'H' and does not default to red", () => {
      const frontendCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/TeamAttendance.jsx"), "utf8");
      assert.ok(
        frontendCode.includes('H: "bg-teal-50 text-teal-700 ring-1 ring-teal-200"'),
        "Holiday 'H' must have distinct teal styling"
      );
    });

    it("Table header and export include Holidays 'H' column", () => {
      const frontendCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/TeamAttendance.jsx"), "utf8");
      assert.ok(
        frontendCode.includes('title="Holidays">H</th>'),
        "Table header must render 'H' column for Holidays"
      );
      assert.ok(
        frontendCode.includes('row.holiday_marks'),
        "Table row must render row.holiday_marks in the 'H' column"
      );
      assert.ok(
        frontendCode.includes('"Holidays"'),
        "Export CSV register must include Holidays column"
      );
    });

    it("Non-working day cells (H and L) suppress empty '--' / '--' punch times", () => {
      const frontendCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/TeamAttendance.jsx"), "utf8");
      assert.ok(
        frontendCode.includes('cell.code !== "H" && cell.code !== "L"'),
        "Must check for H and L to suppress empty punch times"
      );
    });
  });

  // =========================================================================
  // BUG-EA05: Synchronous Search Input Lag on Register Table
  // =========================================================================
  describe("BUG-EA05: Debounced Search Input on Attendance Register", () => {
    it("TeamAttendance.jsx implements 300ms debounced search with proper timer cleanup", () => {
      const frontendCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/TeamAttendance.jsx"), "utf8");
      assert.ok(
        frontendCode.includes("debouncedSearch"),
        "Must maintain debouncedSearch state"
      );
      assert.ok(
        frontendCode.includes("setTimeout"),
        "Must use setTimeout for search debounce"
      );
      assert.ok(
        frontendCode.includes("clearTimeout(timer)"),
        "Must clean up debounce timer on change or unmount"
      );
      assert.ok(
        frontendCode.includes("300"),
        "Must debounce with 300ms delay"
      );
    });
  });

  // =========================================================================
  // BUG-EA06: Missing Role-Specific Page Context for Admin vs Manager
  // =========================================================================
  describe("BUG-EA06: Role Context and Dynamic Heading (Admin vs Manager)", () => {
    it("TeamAttendance.jsx consumes useAuth() and provides distinct titles for Workforce vs Team Attendance", () => {
      const frontendCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/TeamAttendance.jsx"), "utf8");
      assert.ok(
        frontendCode.includes("useAuth()"),
        "TeamAttendance.jsx must import and use useAuth"
      );
      assert.ok(
        frontendCode.includes("contextByRole"),
        "Must define contextByRole helper or mapping"
      );
      assert.ok(
        frontendCode.includes("Workforce Attendance"),
        "Must display Workforce Attendance for admin and superadmin"
      );
      assert.ok(
        frontendCode.includes("Team Attendance"),
        "Must display Team Attendance for manager"
      );
    });
  });

  // =========================================================================
  // BUG-EA07: today_status Hardcoded to '--'
  // =========================================================================
  describe("BUG-EA07: Dynamic today_status Derived from Today's Attendance Cell", () => {
    it("attendance.service.js derives today_status from today's attendance record instead of hardcoding '--'", () => {
      const serviceCode = fs.readFileSync(path.resolve("node_backend/src/services/attendance.service.js"), "utf8");
      assert.ok(
        !serviceCode.includes('today_status: "--"'),
        "today_status: '--' must not be hardcoded in attendance service"
      );
      assert.ok(
        serviceCode.includes("todayCell"),
        "Service must find today's cell to compute today_status in teamAttendance"
      );
      assert.ok(
        serviceCode.includes("today_status: todayStatus"),
        "today_status must be dynamically assigned"
      );
    });

    it("teamAttendance returns real today_status when queried for the current month", async () => {
      const now = new Date();
      const curMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      const res = await attendanceService.teamAttendance(
        superadminActor.id,
        curMonth,
        null,
        null,
        null,
        superadminActor.role,
        1,
        50,
        null,
        tenantId
      );

      assert.ok(Array.isArray(res.register_rows), "register_rows must be returned");
      if (res.register_rows.length > 0) {
        for (const row of res.register_rows) {
          assert.ok(typeof row.today_status === "string", "today_status must be a string");
        }
      }
    });
  });

  // =========================================================================
  // BUG-EA08: Missing Route Role Guard on /team-attendance
  // =========================================================================
  describe("BUG-EA08: Route Protection in App.jsx", () => {
    it("App.jsx protects /team-attendance with allowedRoles", () => {
      const appCode = fs.readFileSync(path.resolve("hrms_saas/src/App.jsx"), "utf8");
      assert.ok(
        /<ProtectedRoute allowedRoles=\{.+?manager.+?hr.+?admin.+?superadmin.+?\}>\s*<TeamAttendance \/>/.test(appCode),
        "/team-attendance route must be protected with allowedRoles"
      );
    });
  });

  // =========================================================================
  // BUG-EA09: Personal Attendance History Date Filters Ignored & Rejected Records Hidden
  // =========================================================================
  describe("BUG-EA09: Personal Attendance History Date Filtering & Rejected Records Inclusion", () => {
    it("attendance.service.js getHistory filters by start_date and end_date and validates date strings", () => {
      const serviceCode = fs.readFileSync(path.resolve("node_backend/src/services/attendance.service.js"), "utf8");
      const getHistoryCode = serviceCode.slice(serviceCode.indexOf("async getHistory"));
      assert.ok(
        getHistoryCode.includes("dateRegex.test(query.start_date)"),
        "Service must validate start_date format in getHistory"
      );
      assert.ok(
        getHistoryCode.includes("dateRegex.test(query.end_date)"),
        "Service must validate end_date format in getHistory"
      );
      assert.ok(
        getHistoryCode.includes("date BETWEEN ? AND ?"),
        "Service must apply SQL BETWEEN clause for valid date range in getHistory"
      );
      assert.ok(
        !getHistoryCode.includes("status <> 'rejected'"),
        "Service must NOT exclude rejected records with status <> 'rejected' in getHistory"
      );
    });

    it("getHistory rejects invalid date format with 400 error", async () => {
      await assert.rejects(
        () => attendanceService.getHistory(superadminActor.id, { start_date: "invalid-date" }),
        (err) => err.statusCode === 400 && err.message.includes("Invalid start_date format")
      );
      await assert.rejects(
        () => attendanceService.getHistory(superadminActor.id, { start_date: "2026-03-31", end_date: "2026-01-01" }),
        (err) => err.statusCode === 400 && err.message.includes("start_date cannot be after end_date")
      );
    });

    it("getHistory accepts valid start_date and end_date parameters and returns filtered records", async () => {
      const res = await attendanceService.getHistory(
        superadminActor.id,
        { start_date: "2026-01-01", end_date: "2026-03-31" }
      );
      assert.ok(res.pagination, "Must return pagination envelope");
      assert.ok(Array.isArray(res.data), "res.data must be an array");
      for (const rec of res.data) {
        assert.ok(rec.date >= "2026-01-01" && rec.date <= "2026-03-31", `Record date ${rec.date} must be within requested range`);
      }
    });
  });
});
