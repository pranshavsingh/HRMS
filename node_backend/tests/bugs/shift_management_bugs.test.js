import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

describe("HRMS Shift Management Bug Fixes Suite (BUG-SH01 to BUG-SH14)", () => {
  after(() => {
    setTimeout(() => process.exit(0), 500).unref();
  });

  // =========================================================================
  // BUG-SH01: Missing Grace Period Fields in Shift List Query
  // =========================================================================
  describe("BUG-SH01: Missing Grace Period Fields in Shift List Query", () => {
    it("shift.service.js includes pv.late_grace_minutes and pv.early_departure_grace_minutes in listShifts query", () => {
      const serviceCode = fs.readFileSync(path.resolve("node_backend/src/services/shift.service.js"), "utf8");
      assert.ok(
        serviceCode.includes("pv.late_grace_minutes") && serviceCode.includes("pv.early_departure_grace_minutes"),
        "listShifts SQL query must select both grace period columns"
      );
    });

    it("Shifts.jsx preserves zero grace periods without defaulting to 15", () => {
      const pageCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/Shifts.jsx"), "utf8");
      assert.ok(
        pageCode.includes("shift.late_grace_minutes !== undefined && shift.late_grace_minutes !== null"),
        "Shifts.jsx must check undefined/null explicitly to preserve 0 minutes"
      );
    });
  });

  // =========================================================================
  // BUG-SH02: Unnecessary Immutable Version Creation
  // =========================================================================
  describe("BUG-SH02: Unnecessary Immutable Version Creation", () => {
    it("shift.service.js compares incoming timing and grace values against latest version before spawning a new version", () => {
      const serviceCode = fs.readFileSync(path.resolve("node_backend/src/services/shift.service.js"), "utf8");
      assert.ok(
        serviceCode.includes("normTime") && serviceCode.includes("startTimeChanged") && serviceCode.includes("lateGraceChanged"),
        "updateShift must normalize and compare actual values against latest version"
      );
    });

    it("Shifts.jsx submits only header fields when timings have not changed", () => {
      const pageCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/Shifts.jsx"), "utf8");
      assert.ok(
        pageCode.includes("const payload = hasTimingChanges") &&
        pageCode.includes("name: formData.name.trim()") &&
        pageCode.includes("is_active: formData.is_active"),
        "Shifts.jsx must avoid sending timing fields when timings have not changed"
      );
    });
  });

  // =========================================================================
  // BUG-SH03: Shift Code Immutability
  // =========================================================================
  describe("BUG-SH03: Shift Code Immutability", () => {
    it("shift.service.js rejects attempts to change immutable shift code", () => {
      const serviceCode = fs.readFileSync(path.resolve("node_backend/src/services/shift.service.js"), "utf8");
      assert.ok(
        serviceCode.includes("data.code.trim().toUpperCase() !== shift.code.toUpperCase()"),
        "Backend must reject shift code modifications after creation"
      );
    });

    it("Shifts.jsx renders Shift Code as disabled/read-only in Edit modal", () => {
      const pageCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/Shifts.jsx"), "utf8");
      assert.ok(
        pageCode.includes("Shift code cannot be changed after creation"),
        "Shifts.jsx Edit modal must communicate that shift code is immutable"
      );
    });
  });

  // =========================================================================
  // BUG-SH04: Server-Side Daytime/Overnight Type Filtering
  // =========================================================================
  describe("BUG-SH04: Server-Side Daytime/Overnight Type Filtering", () => {
    it("shift.service.js filters pv.is_overnight and joins pv in count query", () => {
      const serviceCode = fs.readFileSync(path.resolve("node_backend/src/services/shift.service.js"), "utf8");
      assert.ok(
        serviceCode.includes('query.type === "overnight"') && serviceCode.includes("pv.is_overnight = 1"),
        "listShifts must filter pv.is_overnight in where conditions"
      );
      assert.ok(
        serviceCode.includes("LEFT JOIN workforce_shift_version pv"),
        "Count query must join pv when type filter is applied"
      );
    });

    it("Shifts.jsx sends type parameter to backend and renders server-filtered shifts directly", () => {
      const pageCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/Shifts.jsx"), "utf8");
      assert.ok(
        pageCode.includes('if (type !== "all") params.type = type;'),
        "loadShifts must pass type parameter to API"
      );
      assert.ok(
        !pageCode.includes("visibleShifts = useMemo"),
        "Shifts.jsx must not slice type filters client-side"
      );
    });
  });

  // =========================================================================
  // BUG-SH05: Clear Filters Stale Search Term
  // =========================================================================
  describe("BUG-SH05: Clear Filters Stale Search Term", () => {
    it("Shifts.jsx passes explicit cleared parameters to loadShifts on Clear Filters", () => {
      const pageCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/Shifts.jsx"), "utf8");
      assert.ok(
        pageCode.includes('loadShifts(1, { search: "", status: "all", type: "all" })'),
        "Clear filters must explicitly pass empty search to loadShifts"
      );
    });
  });

  // =========================================================================
  // BUG-SH06: Status Filter Immediate Pagination Reset
  // =========================================================================
  describe("BUG-SH06: Status Filter Immediate Pagination Reset", () => {
    it("Shifts.jsx resets pagination page to 1 synchronously on status change", () => {
      const pageCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/Shifts.jsx"), "utf8");
      assert.ok(
        pageCode.includes("setPagination((prev) => ({ ...prev, page: 1 }))"),
        "Status and type filter handlers must immediately reset page to 1"
      );
    });
  });

  // =========================================================================
  // BUG-SH07: Policy Configuration Entry Point and Versioning
  // =========================================================================
  describe("BUG-SH07: Policy Configuration Entry Point and Versioning", () => {
    it("Shifts.jsx keeps policy configuration accessible and supports creating new policy versions", () => {
      const pageCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/Shifts.jsx"), "utf8");
      assert.ok(
        pageCode.includes('Configure {activeTab === "policies" ? "Attendance" : "Weekly-Off"} Policy'),
        "Policy configure button must remain accessible"
      );
      assert.ok(
        pageCode.includes("+ New Version"),
        "Existing policies must provide a + New Version button"
      );
    });
  });

  // =========================================================================
  // BUG-SH08: Human-Readable Weekly-Off Days Display
  // =========================================================================
  describe("BUG-SH08: Human-Readable Weekly-Off Days Display", () => {
    it("Shifts.jsx formats weekly-off day indices to friendly names", () => {
      const pageCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/Shifts.jsx"), "utf8");
      assert.ok(
        pageCode.includes("formatWeeklyOffDays"),
        "Shifts.jsx must implement formatWeeklyOffDays"
      );
      assert.ok(
        pageCode.includes('["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]'),
        "formatWeeklyOffDays must map numbers to day names"
      );
    });
  });

  // =========================================================================
  // BUG-SH09: Grace Period and Break Change Detection
  // =========================================================================
  describe("BUG-SH09: Grace Period and Break Change Detection", () => {
    it("Shifts.jsx hasTimingChanges detects grace period modifications", () => {
      const pageCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/Shifts.jsx"), "utf8");
      assert.ok(
        pageCode.includes("lateChanged") && pageCode.includes("earlyChanged"),
        "hasTimingChanges must check both grace periods"
      );
    });
  });

  // =========================================================================
  // BUG-SH10: Timezone Safe Date Formatting in Version History
  // =========================================================================
  describe("BUG-SH10: Timezone Safe Date Formatting in Version History", () => {
    it("Shifts.jsx formats effective dates with safe string slicing instead of new Date().toISOString()", () => {
      const pageCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/Shifts.jsx"), "utf8");
      assert.ok(
        pageCode.includes("String(v.effective_from).slice(0, 10)") && pageCode.includes("String(v.effective_to).slice(0, 10)"),
        "Version history effective dates must use safe string slicing"
      );
      assert.ok(
        !pageCode.includes("new Date(v.effective_from).toISOString()"),
        "Version history must not convert date-only strings through new Date().toISOString()"
      );
    });
  });

  // =========================================================================
  // BUG-SH11: Reactive useAuth Role Check
  // =========================================================================
  describe("BUG-SH11: Reactive useAuth Role Check", () => {
    it("Shifts.jsx consumes user role from useAuth context instead of localStorage directly", () => {
      const pageCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/Shifts.jsx"), "utf8");
      assert.ok(
        pageCode.includes('const { role } = useAuth();'),
        "Shifts.jsx must import and use role from useAuth context"
      );
      assert.ok(
        pageCode.includes('const canManageSites = ["admin", "superadmin"].includes(role);'),
        "canManageSites must check context role"
      );
    });
  });

  // =========================================================================
  // BUG-SH12: Admin Role Site Editing Permissions
  // =========================================================================
  describe("BUG-SH12: Admin Role Site Editing Permissions", () => {
    it("SiteManagement.jsx permits both admin and superadmin to edit work sites", () => {
      const siteCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/SiteManagement.jsx"), "utf8");
      assert.ok(
        siteCode.includes('const canEditSites = ["admin", "superadmin"].includes(userRole);'),
        "SiteManagement must allow both admin and superadmin to edit sites"
      );
      assert.ok(
        siteCode.includes("canEditSites &&"),
        "Edit button must be visible to canEditSites"
      );
    });
  });

  // =========================================================================
  // BUG-SH13: Shift Break Configuration UI
  // =========================================================================
  describe("BUG-SH13: Shift Break Configuration UI", () => {
    it("Shifts.jsx provides shift break configuration in both create and edit modals", () => {
      const pageCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/Shifts.jsx"), "utf8");
      assert.ok(
        pageCode.includes("handleAddBreak") && pageCode.includes("Shift Breaks"),
        "Shifts.jsx must provide break configuration UI"
      );
      assert.ok(
        pageCode.includes("shiftsApi.getBreaks"),
        "handleOpenEdit must retrieve existing shift breaks"
      );
    });
  });

  // =========================================================================
  // BUG-SH14: Dedicated Version History Audit View
  // =========================================================================
  describe("BUG-SH14: Dedicated Version History Audit View", () => {
    it("Shifts.jsx displays a dedicated read-only version history audit view on versions tab", () => {
      const pageCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/Shifts.jsx"), "utf8");
      assert.ok(
        pageCode.includes('activeTab === "versions"'),
        "Shifts.jsx must have a dedicated branch for activeTab === 'versions'"
      );
      assert.ok(
        pageCode.includes("Immutable Version Audit Trail"),
        "Dedicated version history view must render the audit trail"
      );
    });
  });
});
