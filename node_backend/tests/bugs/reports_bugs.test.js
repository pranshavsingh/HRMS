import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

describe("HRMS Reports Center Bug Fixes Suite (BUG-REP01 to BUG-REP05)", () => {
  after(() => {
    setTimeout(() => process.exit(0), 500).unref();
  });

  // =========================================================================
  // BUG-REP01: Missing Route Role Guard on /reports
  // =========================================================================
  describe("BUG-REP01: Route Role Guard in App.jsx", () => {
    it("App.jsx protects /reports with allowedRoles to prevent employee access", () => {
      const appCode = fs.readFileSync(path.resolve("hrms_saas/src/App.jsx"), "utf8");
      assert.ok(
        /<ProtectedRoute allowedRoles=\{.+?manager.+?hr.+?admin.+?superadmin.+?\}>\s*<Reports \/>/.test(appCode),
        "/reports route must be protected with allowedRoles"
      );
    });
  });

  // =========================================================================
  // BUG-REP02: 50-Record Data Truncation on Preview and CSV Export
  // =========================================================================
  describe("BUG-REP02: Complete Workforce Dataset via page: 'all'", () => {
    it("Reports.jsx passes page: 'all' in loadPreviewData and handleExportMonthlyAttendance", () => {
      const reportsCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/Reports.jsx"), "utf8");
      assert.ok(
        reportsCode.includes('params: { month: targetMonth, site_id: querySiteId, page: "all" }'),
        "loadPreviewData must pass page: 'all'"
      );
      assert.ok(
        reportsCode.includes('params: { month, site_id: querySiteId, page: "all" }'),
        "handleExportMonthlyAttendance must pass page: 'all'"
      );
    });
  });

  // =========================================================================
  // BUG-REP03: Missing Holiday 'H' Column in Preview Table & CSV Export
  // =========================================================================
  describe("BUG-REP03: Holiday 'H' Column in Preview and CSV Export", () => {
    it("CSV export header and rows include Holidays column", () => {
      const reportsCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/Reports.jsx"), "utf8");
      assert.ok(
        reportsCode.includes('"Holidays"'),
        "CSV export header must include Holidays"
      );
      assert.ok(
        reportsCode.includes("row.holiday_marks || 0"),
        "CSV export row must include row.holiday_marks"
      );
    });

    it("Live Preview table includes Holidays header and row cell", () => {
      const reportsCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/Reports.jsx"), "utf8");
      assert.ok(
        reportsCode.includes('<th className="px-3 py-3 border-r border-slate-200 text-center min-w-[60px]">Holidays</th>'),
        "Live Preview table header must include Holidays"
      );
      assert.ok(
        reportsCode.includes('<td className="px-3 py-3 text-center font-bold text-teal-700 border-r border-slate-200">{row.holiday_marks || 0}</td>'),
        "Live Preview table row must render row.holiday_marks"
      );
    });
  });

  // =========================================================================
  // BUG-REP04: Duration Report Format and Cell Code Styling
  // =========================================================================
  describe("BUG-REP04: Safe Cell Formatting and Accurate Code Styles", () => {
    it("cellCodeStyle does NOT style '--' as emerald duration", () => {
      const reportsCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/Reports.jsx"), "utf8");
      assert.ok(
        reportsCode.includes('if (val === "--") return "bg-slate-50 text-slate-400 border border-slate-200";'),
        "Empty cell '--' must be styled as muted slate"
      );
      assert.ok(
        reportsCode.includes('if (val.includes("-") && val !== "--")'),
        "Hyphen duration check must exclude '--'"
      );
    });

    it("cellCodeStyle provides distinct styling for 'H' and 'L'", () => {
      const reportsCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/Reports.jsx"), "utf8");
      assert.ok(
        reportsCode.includes('if (val === "H") return "bg-teal-50 text-teal-700 border border-teal-200 font-bold";'),
        "Holidays 'H' must have teal styling"
      );
      assert.ok(
        reportsCode.includes('if (val === "L") return "bg-violet-50 text-violet-700 border border-violet-200 font-bold";'),
        "Leaves 'L' must have violet styling"
      );
    });

    it("formatCell handles in-progress punches cleanly", () => {
      const reportsCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/Reports.jsx"), "utf8");
      assert.ok(
        reportsCode.includes('const outTime = cell.punch_out && cell.punch_out !== "--" ? cell.punch_out : "In Progress";'),
        "formatCell must display 'In Progress' when punch out is missing"
      );
    });
  });

  // =========================================================================
  // BUG-REP05: Realtime Synchronization
  // =========================================================================
  describe("BUG-REP05: Realtime Updates", () => {
    it("Reports.jsx listens to attendance_update and leave_update events", () => {
      const reportsCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/Reports.jsx"), "utf8");
      assert.ok(
        reportsCode.includes('useRealtime("attendance_update", () => loadPreviewData(month));'),
        "Must listen to attendance_update"
      );
      assert.ok(
        reportsCode.includes('useRealtime("leave_update", () => loadPreviewData(month));'),
        "Must listen to leave_update"
      );
    });
  });
});
