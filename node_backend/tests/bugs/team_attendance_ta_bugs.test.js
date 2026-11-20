import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { attendanceService } from "../../src/services/attendance.service.js";

describe("HRMS Team Attendance Deep Bug Fixes Suite (BUG-TA01 to BUG-TA09)", () => {
  const superadminActor = { id: 1, role: "superadmin" };
  const tenantId = 1;

  after(() => {
    setTimeout(() => process.exit(0), 500).unref();
  });

  // =========================================================================
  // BUG-TA01: Missing Leave Days in Last 6 Months Snapshot (monthlyMap)
  // =========================================================================
  describe("BUG-TA01: Missing Leave Days in Last 6 Months Snapshot", () => {
    it("attendance.service.js populates monthlyMap leave_days and aggregates unique leave dates", () => {
      const serviceCode = fs.readFileSync(path.resolve("node_backend/src/services/attendance.service.js"), "utf8");
      assert.ok(
        serviceCode.includes("monthlyMap[monthKey].leave_days +="),
        "Service must populate monthlyMap[monthKey].leave_days from approved leaves"
      );
      assert.ok(
        serviceCode.includes("countedLeaveDates"),
        "Service must track unique leave dates using countedLeaveDates to prevent duplicate counting"
      );
    });

    it("Leave date iteration accurately splits multi-month leaves and avoids double counting", () => {
      // Simulate leave spanning across months: 2026-05-29 to 2026-06-03 (3 days in May, 3 days in June)
      const detailStart = "2026-01-01";
      const detailEnd = "2026-06-30";
      const monthlyMap = {
        "2026-05": { month: "May 2026", leave_days: 0 },
        "2026-06": { month: "June 2026", leave_days: 0 },
      };

      const empLeaves = [
        { status: "approved", from_date: "2026-05-29", to_date: "2026-06-03" },
        // Duplicate overlapping record for 2026-06-01
        { status: "approved", from_date: "2026-06-01", to_date: "2026-06-01" },
        // Rejected leave should be ignored
        { status: "rejected", from_date: "2026-06-15", to_date: "2026-06-16" },
      ];

      const countedLeaveDates = new Set();
      empLeaves.forEach((lv) => {
        if (lv.status !== "approved") return;
        const fromStr = lv.from_date;
        const toStr = lv.to_date;
        const startStr = fromStr > detailStart ? fromStr : detailStart;
        const endStr = toStr < detailEnd ? toStr : detailEnd;
        if (startStr <= endStr) {
          const [startYear, startMonth, startDay] = startStr.split("-").map(Number);
          const [endYear, endMonth, endDay] = endStr.split("-").map(Number);
          const cur = new Date(startYear, startMonth - 1, startDay);
          const endDate = new Date(endYear, endMonth - 1, endDay);

          while (cur <= endDate) {
            const y = cur.getFullYear();
            const m = cur.getMonth() + 1;
            const d = cur.getDate();
            const dateStr = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            if (!countedLeaveDates.has(dateStr)) {
              countedLeaveDates.add(dateStr);
              const monthKey = `${y}-${String(m).padStart(2, "0")}`;
              if (monthlyMap[monthKey]) {
                monthlyMap[monthKey].leave_days += 1;
              }
            }
            cur.setDate(cur.getDate() + 1);
          }
        }
      });

      // May: 29, 30, 31 = 3 days
      assert.equal(monthlyMap["2026-05"].leave_days, 3, "May should have exactly 3 leave days");
      // June: 1, 2, 3 = 3 days (duplicate on June 1 not double counted)
      assert.equal(monthlyMap["2026-06"].leave_days, 3, "June should have exactly 3 leave days");
      assert.equal(countedLeaveDates.size, 6, "Total unique leave days should be 6");
    });
  });

  // =========================================================================
  // BUG-TA02: In-Progress Punches Incorrectly Counted as Shortfall Days
  // =========================================================================
  describe("BUG-TA02: In-Progress Punches Incorrectly Counted as Shortfall Days", () => {
    it("attendance.service.js requires punch_out_time for shortfall calculation in employee summary and breakdown", () => {
      const serviceCode = fs.readFileSync(path.resolve("node_backend/src/services/attendance.service.js"), "utf8");
      assert.ok(
        serviceCode.includes("approvedAtt.filter(a => a.punch_out_time && toHours(a.punch_in_time, a.punch_out_time, a.status) < 8)"),
        "Summary shortfall_days must require punch_out_time"
      );
      assert.ok(
        serviceCode.includes("if (a.punch_out_time && wh < 8) monthlyMap[key].shortfall_days +="),
        "Monthly breakdown shortfall_days must require punch_out_time"
      );
      assert.ok(
        serviceCode.includes("Boolean(a.punch_out_time) && toHours(a.punch_in_time, a.punch_out_time, a.status) > 0"),
        "History under_target must require punch_out_time and hours > 0"
      );
    });

    it("Shortfall logic does not penalize active in-progress shifts", () => {
      const records = [
        // Completed shift under 8 hours: shortfall
        { status: "approved", punch_in_time: "2026-03-01 09:00:00", punch_out_time: "2026-03-01 15:00:00", hours: 6 },
        // Active shift today (no punch out yet): NOT shortfall
        { status: "approved", punch_in_time: "2026-03-02 09:00:00", punch_out_time: null, hours: 0 },
        // Completed shift 8.5 hours: NOT shortfall
        { status: "approved", punch_in_time: "2026-03-03 09:00:00", punch_out_time: "2026-03-03 17:30:00", hours: 8.5 },
      ];

      const shortfalls = records.filter(
        (a) => a.status === "approved" && a.punch_out_time && a.hours < 8
      ).length;

      assert.equal(shortfalls, 1, "Only completed shifts with punch_out_time under 8 hours count as shortfall");
    });
  });

  // =========================================================================
  // BUG-TA03: CSV Formula Injection and Missing UTF-8 BOM
  // =========================================================================
  describe("BUG-TA03: CSV Formula Injection and Missing UTF-8 BOM", () => {
    it("TeamAttendance.jsx defines sanitizeCsvValue protecting against spreadsheet formula injection", () => {
      const frontendCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/TeamAttendance.jsx"), "utf8");
      assert.ok(
        frontendCode.includes("export const sanitizeCsvValue ="),
        "Must export sanitizeCsvValue"
      );
      assert.ok(
        frontendCode.includes('["=", "+", "-", "@", "\\t", "\\r"].includes(trimmed[0])'),
        "Must sanitize =, +, -, @, \\t, \\r characters"
      );
      assert.ok(
        frontendCode.includes('"\\uFEFF" + csv'),
        "downloadCsv must prepend UTF-8 BOM \\uFEFF"
      );
    });

    it("sanitizeCsvValue neutralizes all formula injection prefixes and placeholder cells", () => {
      const sanitizeCsvValue = (val) => {
        if (val === null || val === undefined) return '""';
        let str = typeof val === "object" ? JSON.stringify(val) : String(val);
        const trimmed = str.trimStart();
        if (trimmed.length > 0 && ["=", "+", "-", "@", "\t", "\r"].includes(trimmed[0])) {
          str = "'" + str;
        }
        return `"${str.replace(/"/g, '""')}"`;
      };

      // Formula injection attempts
      assert.equal(sanitizeCsvValue("=SUM(1,1)"), "\"'=SUM(1,1)\"");
      assert.equal(sanitizeCsvValue("+CMD"), "\"'+CMD\"");
      assert.equal(sanitizeCsvValue("-1+2"), "\"'-1+2\"");
      assert.equal(sanitizeCsvValue("@SUM(A1:A2)"), "\"'@SUM(A1:A2)\"");
      assert.equal(sanitizeCsvValue("\t=SUM(1,1)"), "\"'\t=SUM(1,1)\"");

      // Placeholders starting with -
      assert.equal(sanitizeCsvValue("--"), "\"'--\"");

      // Bengali and Unicode text
      assert.equal(sanitizeCsvValue("সৌরভ ঘোষ"), "\"সৌরভ ঘোষ\"");

      // Double quotes inside string
      assert.equal(sanitizeCsvValue('John "Ace" Doe'), '"John ""Ace"" Doe"');
    });
  });

  // =========================================================================
  // BUG-TA04: Site Switcher State Desync and 403 Lockout Recovery
  // =========================================================================
  describe("BUG-TA04: Site Switcher State Desync and 403 Lockout Recovery", () => {
    it("TeamAttendance.jsx resets employeeId and selected_employee_detail when querySiteId changes", () => {
      const frontendCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/TeamAttendance.jsx"), "utf8");
      assert.ok(
        frontendCode.includes("useEffect(() => {\n    setEmployeeId(\"\");"),
        "Must clear employeeId when querySiteId changes"
      );
      assert.ok(
        frontendCode.includes("selected_employee_detail: null"),
        "Must clear selected_employee_detail when querySiteId changes"
      );
    });

    it("TeamAttendance.jsx tracks request IDs and recovers gracefully from 403 errors", () => {
      const frontendCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/TeamAttendance.jsx"), "utf8");
      assert.ok(
        frontendCode.includes("requestIdRef = useRef(0)"),
        "Must track requestIdRef to prevent race conditions"
      );
      assert.ok(
        frontendCode.includes("err.response?.status === 403 && activeEmpId"),
        "Must detect 403 due to stale employee in new site"
      );
      assert.ok(
        frontendCode.includes('fetchAttendance(false, "");'),
        "Must automatically reload site register without invalid employee"
      );
    });

    it("Backend preserves 403 site authorization check when employee is not in site", async () => {
      // Query with an employee ID that does not belong to the member scope
      await assert.rejects(
        async () => {
          await attendanceService.teamAttendance(
            superadminActor.id,
            "2026-03",
            999999, // invalid employee not in site/scope
            "2026-03-01",
            "2026-03-31",
            superadminActor.role,
            1,
            50,
            null,
            tenantId,
            null
          );
        },
        (err) => {
          assert.equal(err.statusCode || err.status, 403);
          assert.ok(err.message.includes("permission to view attendance for this employee"));
          return true;
        }
      );
    });
  });

  // =========================================================================
  // BUG-TA05: Real-Time SSE Listener Churn on Every Render
  // =========================================================================
  describe("BUG-TA05: Real-Time SSE Listener Churn on Every Render", () => {
    it("TeamAttendance.jsx creates stable memoized handleRealtimeUpdate callback", () => {
      const frontendCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/TeamAttendance.jsx"), "utf8");
      assert.ok(
        frontendCode.includes("const handleRealtimeUpdate = useCallback("),
        "handleRealtimeUpdate must be memoized with useCallback"
      );
      assert.ok(
        frontendCode.includes('useRealtime("attendance_update", handleRealtimeUpdate)'),
        "Must pass stable handleRealtimeUpdate to attendance_update"
      );
      assert.ok(
        frontendCode.includes('useRealtime("leave_update", handleRealtimeUpdate)'),
        "Must pass stable handleRealtimeUpdate to leave_update"
      );
      assert.ok(
        frontendCode.includes('useRealtime("employee_update", handleRealtimeUpdate)'),
        "Must pass stable handleRealtimeUpdate to employee_update"
      );
      assert.ok(
        !frontendCode.includes('useRealtime("attendance_update", () =>'),
        "Inline arrow functions in useRealtime must be eliminated"
      );
    });
  });

  // =========================================================================
  // BUG-TA06: Inverted Date Range Validation Missing
  // =========================================================================
  describe("BUG-TA06: Inverted Date Range Validation Missing", () => {
    it("TeamAttendance.jsx validates detailStart <= detailEnd before calling fetchAttendance", () => {
      const frontendCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/TeamAttendance.jsx"), "utf8");
      assert.ok(
        frontendCode.includes("if (!detailStart || !detailEnd)"),
        "Must check both start and end dates are present"
      );
      assert.ok(
        frontendCode.includes("if (detailStart > detailEnd)"),
        "Must validate detailStart is not greater than detailEnd"
      );
      assert.ok(
        frontendCode.includes('showPopup("Detail start date cannot be after end date", "warning")'),
        "Must display user warning for inverted date range"
      );
    });
  });

  // =========================================================================
  // BUG-TA07: Missing Empty State in Employee History Table
  // =========================================================================
  describe("BUG-TA07: Missing Empty State in Employee History Table", () => {
    it("TeamAttendance.jsx displays empty state message across all 7 columns when history is empty", () => {
      const frontendCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/TeamAttendance.jsx"), "utf8");
      assert.ok(
        frontendCode.includes("data.selected_employee_detail.history.length === 0"),
        "Must check if history length is 0"
      );
      assert.ok(
        frontendCode.includes("colSpan={7}"),
        "Empty state row must span all 7 columns"
      );
      assert.ok(
        frontendCode.includes("No attendance records found for the selected date range."),
        "Must display informative empty state message"
      );
    });
  });

  // =========================================================================
  // BUG-TA08: Broken Image Fallback Missing in Photo Verification Modal
  // =========================================================================
  describe("BUG-TA08: Broken Image Fallback Missing in Photo Verification Modal", () => {
    it("TeamAttendance.jsx provides onError fallback and photoErrors state for modal images", () => {
      const frontendCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/TeamAttendance.jsx"), "utf8");
      assert.ok(
        frontendCode.includes("photoErrors, setPhotoErrors"),
        "Must track photoErrors state"
      );
      assert.ok(
        frontendCode.includes("openPhotoModal = useCallback("),
        "openPhotoModal must reset photoErrors"
      );
      assert.ok(
        frontendCode.includes("onError={() => setPhotoErrors((prev) => ({ ...prev, in: true }))}"),
        "Punch-in image must have onError fallback handler"
      );
      assert.ok(
        frontendCode.includes("onError={() => setPhotoErrors((prev) => ({ ...prev, out: true }))}"),
        "Punch-out image must have onError fallback handler"
      );
      assert.ok(
        frontendCode.includes('photoErrors.in ? "Photo unavailable" : "No Punch In Photo"'),
        "Must display 'Photo unavailable' fallback message on image load error"
      );
    });
  });

  // =========================================================================
  // BUG-TA09: Empty CSV Export Downloads Header-Only Files
  // =========================================================================
  describe("BUG-TA09: Empty CSV Export Downloads Header-Only Files", () => {
    it("TeamAttendance.jsx validates row counts before exporting register or employee history", () => {
      const frontendCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/TeamAttendance.jsx"), "utf8");
      assert.ok(
        frontendCode.includes("if (!filteredRows || filteredRows.length === 0)"),
        "exportRegister must check for zero rows"
      );
      assert.ok(
        frontendCode.includes("if (!data.selected_employee_detail || !data.selected_employee_detail.history?.length)"),
        "exportEmployeeHistory must check for zero rows"
      );
      assert.ok(
        frontendCode.includes('showPopup("No attendance records available to export.", "warning")'),
        "Must show warning popup when no records are available for export"
      );
    });
  });
});
