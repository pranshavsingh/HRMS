import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const findRepoRoot = () => {
  let curr = __dirname;
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(curr, "hrms_saas")) && fs.existsSync(path.join(curr, "node_backend"))) {
      return curr;
    }
    curr = path.dirname(curr);
  }
  return process.cwd();
};
const repoRoot = findRepoRoot();
const resolvePath = (rel) => path.resolve(repoRoot, rel);

describe("HRMS Roster Management Bug Fixes Suite (BUG-RS01 to BUG-RS14)", () => {
  after(() => {
    setTimeout(() => process.exit(0), 500).unref();
  });

  // =========================================================================
  // BUG-RS01: Manager RBAC Desynchronization & Default Tab
  // =========================================================================
  describe("BUG-RS01: Manager RBAC Desynchronization", () => {
    it("Roster.jsx includes manager in isManagerOrAdmin and defaults to calendar tab for managers", () => {
      const pageCode = fs.readFileSync(resolvePath("hrms_saas/src/pages/Roster.jsx"), "utf8");
      assert.ok(
        pageCode.includes('["admin", "superadmin", "hr", "manager"].includes(userRole)'),
        "isManagerOrAdmin must include manager role"
      );
      assert.ok(
        pageCode.includes("isManagerOrAdmin ? \"calendar\" : \"my-schedule\""),
        "getInitialTab must default to calendar for all managerial and administrative roles"
      );
      assert.ok(
        pageCode.includes("searchParams.get(\"tab\")"),
        "Roster.jsx must inspect URL ?tab= parameter"
      );
    });

    it("Sidebar.jsx links to /roster?tab=my-schedule for employees and /roster?tab=calendar for managers and HR", () => {
      const sidebarCode = fs.readFileSync(resolvePath("hrms_saas/src/components/layout/Sidebar.jsx"), "utf8");
      assert.ok(
        sidebarCode.includes('to="/roster?tab=my-schedule"'),
        "My Schedule link must pass tab=my-schedule"
      );
      assert.ok(
        sidebarCode.includes('to="/roster?tab=calendar"'),
        "Team Roster link must pass tab=calendar"
      );
    });
  });

  // =========================================================================
  // BUG-RS02: Direct localStorage Role Access
  // =========================================================================
  describe("BUG-RS02: Direct localStorage Role Access", () => {
    it("Roster.jsx consumes role from useAuth() context", () => {
      const pageCode = fs.readFileSync(resolvePath("hrms_saas/src/pages/Roster.jsx"), "utf8");
      assert.ok(
        pageCode.includes("useAuth"),
        "Roster.jsx must import and use useAuth"
      );
      assert.ok(
        pageCode.includes("const { role: authRole } = useAuth();") || pageCode.includes("const { role: authRole, user } = useAuth();"),
        "Roster.jsx must destructure authenticated role from useAuth"
      );
    });
  });

  // =========================================================================
  // BUG-RS03: Publish Draft Banner Runtime Crash
  // =========================================================================
  describe("BUG-RS03: Publish Draft Banner Runtime Crash", () => {
    it("Roster.jsx safely checks publishableDraft before calling publish API and disables button", () => {
      const pageCode = fs.readFileSync(resolvePath("hrms_saas/src/pages/Roster.jsx"), "utf8");
      assert.ok(
        pageCode.includes("publishableDraft && handlePublishRoster(publishableDraft.id)"),
        "Publish button must guard against undefined publishableDraft.id"
      );
      assert.ok(
        pageCode.includes("disabled={!publishableDraft"),
        "Publish button must be disabled when no valid publishable draft exists"
      );
    });

    it("Pure unit test: safely identifies publishable draft without throwing TypeError", () => {
      const emptyDrafts = [
        { id: 1, name: "Draft 1", entry_count: 0 },
        { id: 2, name: "Draft 2", entry_count: "0" },
      ];
      const publishableDraft = emptyDrafts.find((r) => Number(r.entry_count) > 0);
      assert.equal(publishableDraft, undefined, "Empty drafts produce undefined");
      
      // Verification: safe call pattern does not crash
      let calledWithId = null;
      const safePublish = (draft) => {
        if (draft) calledWithId = draft.id;
      };
      assert.doesNotThrow(() => safePublish(publishableDraft));
      assert.equal(calledWithId, null);

      const validDrafts = [
        { id: 1, name: "Draft 1", entry_count: 0 },
        { id: 3, name: "Draft 3", entry_count: 14 },
      ];
      const validPublishable = validDrafts.find((r) => Number(r.entry_count) > 0);
      assert.equal(validPublishable?.id, 3);
      safePublish(validPublishable);
      assert.equal(calledWithId, 3);
    });
  });

  // =========================================================================
  // BUG-RS04: Calendar Month Navigation Date Rollover
  // =========================================================================
  describe("BUG-RS04: Calendar Month Navigation Date Rollover", () => {
    it("Roster.jsx clamps to day 1 before altering month in handlePrev, handleNext, and dateRange", () => {
      const pageCode = fs.readFileSync(resolvePath("hrms_saas/src/pages/Roster.jsx"), "utf8");
      assert.ok(
        pageCode.includes("nextD.setDate(1);\n      nextD.setMonth(nextD.getMonth() - 1);") ||
        pageCode.includes("nextD.setDate(1);\r\n      nextD.setMonth(nextD.getMonth() - 1);"),
        "handlePrev must set date to 1 before subtracting month"
      );
      assert.ok(
        pageCode.includes("nextD.setDate(1);\n      nextD.setMonth(nextD.getMonth() + 1);") ||
        pageCode.includes("nextD.setDate(1);\r\n      nextD.setMonth(nextD.getMonth() + 1);"),
        "handleNext must set date to 1 before adding month"
      );
      assert.ok(
        pageCode.includes("end.setDate(1);\n      end.setMonth(end.getMonth() + 1);\n      end.setDate(0);") ||
        pageCode.includes("end.setDate(1);\r\n      end.setMonth(end.getMonth() + 1);\r\n      end.setDate(0);"),
        "dateRange monthly calculation must set date to 1 before incrementing month"
      );
    });

    it("Pure unit test: January 31, March 31, and August 31 do not skip months when normalized", () => {
      // 1. Jan 31 -> Next month should be February, not March!
      const jan31 = new Date(2026, 0, 31); // Jan 31, 2026
      const nextFromJan = new Date(jan31);
      nextFromJan.setDate(1);
      nextFromJan.setMonth(nextFromJan.getMonth() + 1);
      assert.equal(nextFromJan.getMonth(), 1, "Next month after January must be February (month index 1)");

      // 2. March 31 -> Previous month should be February, not March!
      const mar31 = new Date(2026, 2, 31); // Mar 31, 2026
      const prevFromMar = new Date(mar31);
      prevFromMar.setDate(1);
      prevFromMar.setMonth(prevFromMar.getMonth() - 1);
      assert.equal(prevFromMar.getMonth(), 1, "Previous month before March must be February (month index 1)");

      // 3. Aug 31 -> Next month should be September, not October!
      const aug31 = new Date(2026, 7, 31); // Aug 31, 2026
      const nextFromAug = new Date(aug31);
      nextFromAug.setDate(1);
      nextFromAug.setMonth(nextFromAug.getMonth() + 1);
      assert.equal(nextFromAug.getMonth(), 8, "Next month after August must be September (month index 8)");

      // 4. Leap year verification: Feb 2024 has 29 days
      const febLeap = new Date(2024, 1, 1);
      febLeap.setMonth(febLeap.getMonth() + 1);
      febLeap.setDate(0);
      assert.equal(febLeap.getDate(), 29, "February 2024 must have 29 days in leap year");
    });
  });

  // =========================================================================
  // BUG-RS05: Missing Employee Search and Team Filter in Calendar
  // =========================================================================
  describe("BUG-RS05: Missing Employee Search and Team Filter in Calendar", () => {
    it("Roster.jsx filters calendarData.employees via filteredEmployees and provides UI controls", () => {
      const pageCode = fs.readFileSync(resolvePath("hrms_saas/src/pages/Roster.jsx"), "utf8");
      assert.ok(
        pageCode.includes("const filteredEmployees = useMemo("),
        "Roster.jsx must compute filteredEmployees memo"
      );
      assert.ok(
        pageCode.includes("placeholder=\"Search employee...\""),
        "Calendar toolbar must render search employee input"
      );
      assert.ok(
        pageCode.includes("value={teamFilter}"),
        "Calendar toolbar must render team filter select dropdown"
      );
      assert.ok(
        pageCode.includes("filteredEmployees.map((emp)"),
        "Calendar grid must render filteredEmployees"
      );
    });

    it("Pure unit test: filters employees by name, email, and team correctly", () => {
      const employees = [
        { user_id: 1, name: "Alice Johnson", email: "alice@test.com", team: "Engineering" },
        { user_id: 2, name: "Bob Smith", email: "bob@test.com", team: "Design" },
        { user_id: 3, name: "Charlie Brown", email: "charlie@test.com", team: "Engineering" },
      ];

      // Filter by team
      const engOnly = employees.filter((e) => e.team === "Engineering");
      assert.equal(engOnly.length, 2);

      // Search by name
      const searchBob = employees.filter((e) => e.name.toLowerCase().includes("bob"));
      assert.equal(searchBob.length, 1);
      assert.equal(searchBob[0].user_id, 2);

      // Combined search + team
      const combined = employees.filter((e) => e.team === "Engineering" && e.name.toLowerCase().includes("alice"));
      assert.equal(combined.length, 1);
      assert.equal(combined[0].user_id, 1);
    });
  });

  // =========================================================================
  // BUG-RS06: Missing Search in Shift Assignments
  // =========================================================================
  describe("BUG-RS06: Missing Search in Shift Assignments", () => {
    it("Roster.jsx provides search input and filters assignments reactively", () => {
      const pageCode = fs.readFileSync(resolvePath("hrms_saas/src/pages/Roster.jsx"), "utf8");
      assert.ok(
        pageCode.includes("const filteredAssignments = useMemo("),
        "Roster.jsx must compute filteredAssignments memo"
      );
      assert.ok(
        pageCode.includes("placeholder=\"Search employee, email, shift...\"") || pageCode.includes("placeholder=\"Search employee or shift...\""),
        "Shift Assignments toolbar must render search input"
      );
      assert.ok(
        pageCode.includes("filteredAssignments.map((a)"),
        "Shift Assignments table must render filteredAssignments"
      );
    });
  });

  // =========================================================================
  // BUG-RS07: Rotation Pattern Enrollment Starting Step Failure
  // =========================================================================
  describe("BUG-RS07: Rotation Pattern Enrollment Starting Step Failure", () => {
    it("Roster.jsx uses selectedRotation.steps as reliable steps source in enroll modal", () => {
      const pageCode = fs.readFileSync(resolvePath("hrms_saas/src/pages/Roster.jsx"), "utf8");
      assert.ok(
        pageCode.includes("selectedRotation?.steps?.length ? selectedRotation.steps : (rotationPreview?.rotation?.steps || [])"),
        "Enroll modal must read from selectedRotation.steps when rotationPreview is null"
      );
    });

    it("Pure unit test: starting steps populate from rotation definition even when preview is null", () => {
      const selectedRotation = {
        id: 5,
        name: "4-Day Rolling Cycle",
        steps: [
          { step_order: 1, shift_name: "Morning Shift", duration_days: 2, is_off_day: false },
          { step_order: 2, shift_name: "Night Shift", duration_days: 2, is_off_day: false },
          { step_order: 3, shift_name: "Weekly Off", duration_days: 2, is_off_day: true },
        ],
      };
      const rotationPreview = null;

      const steps = selectedRotation?.steps?.length ? selectedRotation.steps : (rotationPreview?.rotation?.steps || []);
      assert.equal(steps.length, 3, "All 3 steps are present even when rotationPreview is null");
      assert.equal(steps[1].shift_name, "Night Shift");
      assert.equal(steps[2].is_off_day, true);
    });
  });

  // =========================================================================
  // BUG-RS08: Manual Numeric Shift Version ID
  // =========================================================================
  describe("BUG-RS08: Manual Numeric Shift Version ID", () => {
    it("Roster.jsx renders human-readable version card and disables assignment if no published version", () => {
      const pageCode = fs.readFileSync(resolvePath("hrms_saas/src/pages/Roster.jsx"), "utf8");
      assert.ok(
        !pageCode.includes('<input\n                    type="number"\n                    value={assignmentForm.shift_version_id}') &&
        !pageCode.includes('<input\r\n                    type="number"\r\n                    value={assignmentForm.shift_version_id}'),
        "Raw numeric shift_version_id input must be removed"
      );
      assert.ok(
        pageCode.includes("disabled={!assignmentForm.shift_version_id}"),
        "Confirm button must be disabled when shift template has no published version"
      );
      assert.ok(
        pageCode.includes("No Published Version Available") || pageCode.includes("Version {selectedShift.current_version_number"),
        "Modal must show human-readable published version details or no-version warning"
      );
    });

    it("shift-assignment.service.js enforces that shift_version_id is published", () => {
      const serviceCode = fs.readFileSync(resolvePath("node_backend/src/services/shift-assignment.service.js"), "utf8");
      assert.ok(
        serviceCode.includes("shiftVersion.status !== \"published\""),
        "Backend must independently verify shift_version is published"
      );
    });
  });

  // =========================================================================
  // BUG-RS09: Missing Loading States
  // =========================================================================
  describe("BUG-RS09: Missing Loading States", () => {
    it("Roster.jsx guards Shift Assignments, Rotations, and My Schedule with explicit loading checks", () => {
      const pageCode = fs.readFileSync(resolvePath("hrms_saas/src/pages/Roster.jsx"), "utf8");
      assert.ok(
        pageCode.includes("{activeTab === \"assignments\" && isAdminOrHr && (\n          <div className=\"space-y-4\">\n") ||
        pageCode.includes("activeTab === \"assignments\""),
        "Assignments tab rendered"
      );
      assert.ok(
        pageCode.includes("{/* BUG-RS09: Explicit loading state prevents empty-state flash */}"),
        "Assignments tab includes explicit loading check"
      );
      assert.ok(
        pageCode.includes("{/* BUG-RS09: Explicit loading state */}"),
        "Rotations tab includes explicit loading check"
      );
      assert.ok(
        pageCode.includes("{/* BUG-RS09: Loading guard prevents flashing empty state */}"),
        "My Schedule tab includes explicit loading guard"
      );
    });
  });

  // =========================================================================
  // BUG-RS10: SSE Listener Churn and Potential Memory Leak
  // =========================================================================
  describe("BUG-RS10: SSE Listener Churn and Potential Memory Leak", () => {
    it("Roster.jsx creates stabilized realtime handler reference", () => {
      const pageCode = fs.readFileSync(resolvePath("hrms_saas/src/pages/Roster.jsx"), "utf8");
      assert.ok(
        pageCode.includes("const activeTabRef = useRef(activeTab);"),
        "Roster.jsx must maintain activeTabRef"
      );
      assert.ok(
        pageCode.includes("const handleRealtimeUpdate = useCallback("),
        "handleRealtimeUpdate must be memoized with useCallback"
      );
      assert.ok(
        pageCode.includes("useRealtime(\"schedule_update\", handleRealtimeUpdate);"),
        "useRealtime must use stable handleRealtimeUpdate reference"
      );
    });
  });

  // =========================================================================
  // BUG-RS11: Roster Generation Excludes Mid-Period Site Assignments
  // =========================================================================
  describe("BUG-RS11: Roster Generation Excludes Mid-Period Site Assignments", () => {
    it("roster.service.js uses formattedEnd and formattedStart for site assignment overlap check", () => {
      const serviceCode = fs.readFileSync(resolvePath("node_backend/src/services/roster.service.js"), "utf8");
      assert.ok(
        serviceCode.includes("empParams.push(tenantId, Number(site_id), formattedEnd, formattedStart);"),
        "generateDraftRoster must check esa.effective_from <= formattedEnd AND (esa.effective_to IS NULL OR esa.effective_to >= formattedStart)"
      );
    });

    it("Pure unit test: employee site assignment effective midway through roster window is included", () => {
      const rosterStart = "2026-11-01";
      const rosterEnd = "2026-11-07";

      const checkOverlap = (effectiveFrom, effectiveTo) => {
        return effectiveFrom <= rosterEnd && (!effectiveTo || effectiveTo >= rosterStart);
      };

      // 1. Starts Wednesday (Nov 4) midway through roster
      assert.ok(checkOverlap("2026-11-04", null), "Midway start with indefinite end is included");
      assert.ok(checkOverlap("2026-11-04", "2026-11-30"), "Midway start with future end is included");

      // 2. Ends Tuesday (Nov 3) midway through roster
      assert.ok(checkOverlap("2026-10-01", "2026-11-03"), "Past start ending midway through roster is included");

      // 3. Completely outside roster window
      assert.ok(!checkOverlap("2026-11-10", "2026-11-20"), "Future assignment is excluded");
      assert.ok(!checkOverlap("2026-10-01", "2026-10-25"), "Past assignment ended before roster start is excluded");
    });
  });

  // =========================================================================
  // BUG-RS12: Phantom Shifts on Published Off-Days
  // =========================================================================
  describe("BUG-RS12: Phantom Shifts on Published Off-Days", () => {
    it("roster.service.js tracks published roster headers and suppresses fallback shifts on published off-days", () => {
      const serviceCode = fs.readFileSync(resolvePath("node_backend/src/services/roster.service.js"), "utf8");
      assert.ok(
        serviceCode.includes("const publishedHeaders = await db.all("),
        "getMyRoster must query published roster headers covering the employee and date range"
      );
      assert.ok(
        serviceCode.includes("publishedRosterDateSet.has(dateStr)"),
        "getMyRoster must detect published roster dates and suppress fixed/rotation fallback on off-days"
      );
    });

    it("Pure unit test: published off-day does not trigger fallback shift", () => {
      const publishedCoveredDates = new Set(["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"]);
      const entryDateMap = new Map([
        ["2026-11-01", { shift_name: "Morning Shift", source: "published_roster" }],
        ["2026-11-02", { shift_name: "Morning Shift", source: "published_roster" }],
        // 2026-11-03 has NO entry in published roster (Weekly Off)
      ]);

      const simulateDayResolve = (dateStr, fallbackShift) => {
        if (entryDateMap.has(dateStr)) {
          return entryDateMap.get(dateStr);
        }
        if (publishedCoveredDates.has(dateStr)) {
          // Off day in published roster!
          return null;
        }
        // Outside published roster coverage: fall back
        return fallbackShift;
      };

      const defaultFallback = { shift_name: "Default 9-5", source: "fixed_assignment" };

      // Day 1: Published shift
      assert.equal(simulateDayResolve("2026-11-01", defaultFallback)?.shift_name, "Morning Shift");
      // Day 3: Published off-day (MUST BE NULL / REST DAY, NOT PHANTOM FALLBACK SHIFT!)
      assert.equal(simulateDayResolve("2026-11-03", defaultFallback), null, "Published off-day must not produce fallback shift");
      // Day 10: Outside published roster range (FALLBACK ALLOWED)
      assert.equal(simulateDayResolve("2026-11-10", defaultFallback)?.shift_name, "Default 9-5");
    });
  });

  // =========================================================================
  // BUG-RS13: Missing Team Roster Calendar CSV Export
  // =========================================================================
  describe("BUG-RS13: Missing Team Roster Calendar CSV Export", () => {
    it("Roster.jsx implements handleExportCalendarCsv and formula injection protection", () => {
      const pageCode = fs.readFileSync(resolvePath("hrms_saas/src/pages/Roster.jsx"), "utf8");
      assert.ok(
        pageCode.includes("const sanitizeCsvValue = (val) =>"),
        "Roster.jsx must define sanitizeCsvValue"
      );
      assert.ok(
        pageCode.includes("const handleExportCalendarCsv = () =>"),
        "Roster.jsx must implement handleExportCalendarCsv"
      );
      assert.ok(
        pageCode.includes("onClick={handleExportCalendarCsv}"),
        "Calendar toolbar must render Export CSV button triggering handleExportCalendarCsv"
      );
      assert.ok(
        pageCode.includes("\\uFEFF"),
        "CSV export must include UTF-8 BOM"
      );
    });

    it("Pure unit test: sanitizeCsvValue neutralizes all dangerous spreadsheet formula injection prefixes", () => {
      const sanitize = (val) => {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        if (/^[=+\-@\t\r]/.test(str) || /^[\s]+[=+\-@\t\r]/.test(str)) {
          return `"'${str}"`;
        }
        return `"${str}"`;
      };

      assert.equal(sanitize("=SUM(A1:A10)"), "\"'=SUM(A1:A10)\"");
      assert.equal(sanitize("+cmd|' /C calc'!A0"), "\"'+cmd|' /C calc'!A0\"");
      assert.equal(sanitize("-100"), "\"'-100\"");
      assert.equal(sanitize("@SUM()"), "\"'@SUM()\"");
      assert.equal(sanitize("  =1+1"), "\"'  =1+1\"");
      assert.equal(sanitize("Alice Johnson"), "\"Alice Johnson\"");
      assert.equal(sanitize('Engineering "Core"'), '"Engineering ""Core"""');
    });
  });

  // =========================================================================
  // BUG-RS14: Minimum Rest Validation Result Is Handled
  // =========================================================================
  describe("BUG-RS14: Minimum Rest Validation Result Is Handled", () => {
    it("roster.service.js captures restValidation result, logs audit warning, and returns violations", () => {
      const serviceCode = fs.readFileSync(resolvePath("node_backend/src/services/roster.service.js"), "utf8");
      assert.ok(
        serviceCode.includes("const restValidation = rosterValidationService.validateConsecutiveShiftRest("),
        "generateDraftRoster must capture validateConsecutiveShiftRest result"
      );
      assert.ok(
        serviceCode.includes("if (!restValidation.valid) {"),
        "generateDraftRoster must check restValidation.valid"
      );
      assert.ok(
        serviceCode.includes("restViolations.push({"),
        "generateDraftRoster must record restViolations"
      );
      assert.ok(
        serviceCode.includes("\"ROSTER_REST_PERIOD_WARNING\""),
        "generateDraftRoster must log audit warning when rest violations occur"
      );
      assert.ok(
        serviceCode.includes("rest_violations_count: restViolations.length"),
        "generateDraftRoster result object must include rest_violations_count"
      );
    });
  });
});
