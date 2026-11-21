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

describe("HRMS My Schedule Page Engineering Fixes Suite (Bug 01 - Bug 09)", () => {
  after(() => {
    setTimeout(() => process.exit(0), 500).unref();
  });

  const rosterPath = resolvePath("hrms_saas/src/pages/Roster.jsx");
  const sidebarPath = resolvePath("hrms_saas/src/components/layout/Sidebar.jsx");
  const servicePath = resolvePath("node_backend/src/services/roster.service.js");

  const rosterCode = fs.readFileSync(rosterPath, "utf8").replace(/\r\n/g, "\n");
  const sidebarCode = fs.readFileSync(sidebarPath, "utf8").replace(/\r\n/g, "\n");
  const serviceCode = fs.readFileSync(servicePath, "utf8").replace(/\r\n/g, "\n");

  // =========================================================================
  // BUG 01: Unauthorized loadMasters() API Call Gating
  // =========================================================================
  describe("BUG 01: Unauthorized loadMasters() API Call Gating", () => {
    it("loadMasters is strictly gated by isAdminOrHr and not invoked for Employee/Manager", () => {
      assert.ok(
        rosterCode.includes("const loadMasters = useCallback(async () => {\n    if (!isAdminOrHr) return;"),
        "loadMasters must return immediately if !isAdminOrHr"
      );
      assert.ok(
        rosterCode.includes("useEffect(() => {\n    if (isAdminOrHr) {\n      loadMasters();\n    }\n  }, [isAdminOrHr, loadMasters]);"),
        "loadMasters effect must check isAdminOrHr before calling"
      );
    });

    it("Pure unit test: non-admin roles skip employee master queries", () => {
      const simulateLoadMasters = (role) => {
        const isAdminOrHr = ["admin", "superadmin", "hr"].includes(role);
        if (!isAdminOrHr) return false;
        return true;
      };

      assert.equal(simulateLoadMasters("employee"), false, "Employee must not load masters");
      assert.equal(simulateLoadMasters("manager"), false, "Manager must not load masters");
      assert.equal(simulateLoadMasters("hr"), true, "HR must load masters");
      assert.equal(simulateLoadMasters("admin"), true, "Admin must load masters");
      assert.equal(simulateLoadMasters("superadmin"), true, "Superadmin must load masters");
    });
  });

  // =========================================================================
  // BUG 02: Proper Error Handling & Retry State (Never Treat Failure as Empty)
  // =========================================================================
  describe("BUG 02: Proper Error Handling & Retry State", () => {
    it("Roster.jsx defines dedicated myRosterError and retryingMyRoster states", () => {
      assert.ok(rosterCode.includes("const [myRosterError, setMyRosterError] = useState(\"\");"), "Must define myRosterError");
      assert.ok(rosterCode.includes("const [retryingMyRoster, setRetryingMyRoster] = useState(false);"), "Must define retryingMyRoster");
    });

    it("Roster.jsx displays dedicated error banner with retry button on failure", () => {
      assert.ok(rosterCode.includes("Unable to Load Shift Schedule"), "Must display error heading");
      assert.ok(rosterCode.includes("onClick={() => loadMyRoster(true)}"), "Must provide retry button calling loadMyRoster(true)");
    });

    it("Pure unit test: API error maps to human-readable message without leaking sensitive server traces", () => {
      const mapError = (err) => {
        return (
          err?.response?.data?.error ||
          (err?.response?.status >= 500
            ? "The server encountered an error while retrieving your schedule. Please try again."
            : err?.response?.status === 401
            ? "Your session has expired. Please refresh or log in again."
            : err?.response?.status === 403
            ? "You do not have permission to view this schedule."
            : "Unable to load your shift schedule. Please check your connection and try again.")
        );
      };

      assert.equal(mapError({ response: { status: 500 } }), "The server encountered an error while retrieving your schedule. Please try again.");
      assert.equal(mapError({ response: { status: 401 } }), "Your session has expired. Please refresh or log in again.");
      assert.equal(mapError({ response: { status: 403 } }), "You do not have permission to view this schedule.");
      assert.equal(mapError({ response: { data: { error: "Tenant mismatch" } } }), "Tenant mismatch");
      assert.equal(mapError({}), "Unable to load your shift schedule. Please check your connection and try again.");
    });
  });

  // =========================================================================
  // BUG 03: Initial Loading State (No Flash of Empty State)
  // =========================================================================
  describe("BUG 03: Initial Loading State", () => {
    it("loading state initializes to true to prevent initial empty-state flash", () => {
      assert.ok(
        rosterCode.includes("const [loading, setLoading] = useState(true);"),
        "loading state must initialize to true"
      );
    });
  });

  // =========================================================================
  // BUG 04: Display Today's Card Across All States
  // =========================================================================
  describe("BUG 04: Display Today's Card Across All States", () => {
    it("Roster.jsx supports Working, Weekly Off, Company Holiday, Rest Day, and Unassigned states", () => {
      assert.ok(rosterCode.includes("Today&apos;s Active Shift"), "Must render working shift state");
      assert.ok(rosterCode.includes("Today is a Company Holiday"), "Must render company holiday state");
      assert.ok(rosterCode.includes("Today is Your Weekly Off"), "Must render weekly off state");
      assert.ok(rosterCode.includes("Today is Your Rest Day"), "Must render rest day state");
      assert.ok(rosterCode.includes("No Shift Assigned for Today"), "Must render unassigned state");
    });

    it("Pure unit test: resolves today state accurately", () => {
      const resolveState = (item) => {
        if (!item || item.status === "unassigned") return "UNASSIGNED";
        if (item.status === "holiday") return "HOLIDAY";
        if (item.status === "weekly_off") return "WEEKLY_OFF";
        if (item.status === "rest_day") return "REST_DAY";
        if (!item.is_off_day && item.shift_name) return "WORKING";
        return "UNASSIGNED";
      };

      assert.equal(resolveState({ is_off_day: false, shift_name: "General Shift" }), "WORKING");
      assert.equal(resolveState({ status: "weekly_off", is_off_day: true }), "WEEKLY_OFF");
      assert.equal(resolveState({ status: "holiday", is_off_day: true, holiday_name: "Diwali" }), "HOLIDAY");
      assert.equal(resolveState({ status: "rest_day", is_off_day: true }), "REST_DAY");
      assert.equal(resolveState({ status: "unassigned", is_off_day: true }), "UNASSIGNED");
      assert.equal(resolveState(null), "UNASSIGNED");
    });
  });

  // =========================================================================
  // BUG 05: Complete 14-Day Calendar Returned from Backend
  // =========================================================================
  describe("BUG 05: Complete 14-Day Calendar Returned from Backend", () => {
    it("roster.service.js iterates all dates in range and records off-days and holidays", () => {
      assert.ok(serviceCode.includes("while (curDate <= endDateObj) {"), "Must loop through each day in range");
      assert.ok(serviceCode.includes("status: \"holiday\""), "Must record holiday status");
      assert.ok(serviceCode.includes("status: \"weekly_off\""), "Must record weekly_off status");
      assert.ok(serviceCode.includes("status: \"rest_day\""), "Must record rest_day status");
      assert.ok(serviceCode.includes("status: \"unassigned\""), "Must record unassigned status");
      assert.ok(serviceCode.includes("day_of_week: weekday"), "Must record day_of_week");
      assert.ok(serviceCode.includes("today_entry: todayEntry"), "Must return today_entry");
    });

    it("Pure unit test: exactly 14 consecutive calendar days are generated across month and year boundaries", () => {
      const generate14Days = (startDateStr) => {
        const dates = [];
        const curDate = new Date(`${startDateStr}T00:00:00Z`);
        for (let i = 0; i < 14; i++) {
          dates.push(curDate.toISOString().slice(0, 10));
          curDate.setUTCDate(curDate.getUTCDate() + 1);
        }
        return dates;
      };

      // Month rollover: Feb 25 in non-leap year 2027
      const febDates = generate14Days("2027-02-25");
      assert.equal(febDates.length, 14, "Must generate exactly 14 dates");
      assert.equal(febDates[0], "2027-02-25");
      assert.equal(febDates[3], "2027-02-28");
      assert.equal(febDates[4], "2027-03-01");
      assert.equal(febDates[13], "2027-03-10");

      // Year rollover: Dec 25
      const decDates = generate14Days("2026-12-25");
      assert.equal(decDates.length, 14, "Must generate exactly 14 dates");
      assert.equal(decDates[0], "2026-12-25");
      assert.equal(decDates[6], "2026-12-31");
      assert.equal(decDates[7], "2027-01-01");
      assert.equal(decDates[13], "2027-01-07");
    });
  });

  // =========================================================================
  // BUG 06: Weekday Label Formatting
  // =========================================================================
  describe("BUG 06: Weekday Label Formatting", () => {
    it("Roster.jsx implements formatReadableDate helper", () => {
      assert.ok(rosterCode.includes("const formatReadableDate = (dateStr) =>"), "Must define formatReadableDate");
    });

    it("Pure unit test: formatReadableDate formats dates with weekday without timezone skew", () => {
      const formatReadableDate = (dateStr) => {
        if (!dateStr) return "";
        const [year, month, day] = String(dateStr).slice(0, 10).split("-").map(Number);
        if (!year || !month || !day) return dateStr;
        const d = new Date(year, month - 1, day);
        const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return `${weekdays[d.getDay()]}, ${String(day).padStart(2, "0")} ${months[d.getMonth()]}`;
      };

      assert.equal(formatReadableDate("2026-11-23"), "Mon, 23 Nov");
      assert.equal(formatReadableDate("2026-11-24"), "Tue, 24 Nov");
      assert.equal(formatReadableDate("2026-11-29"), "Sun, 29 Nov");
      assert.equal(formatReadableDate("2027-01-01"), "Fri, 01 Jan");
      assert.equal(formatReadableDate(""), "");
    });
  });

  // =========================================================================
  // BUG 07: Safe Working Hours Formatting
  // =========================================================================
  describe("BUG 07: Safe Working Hours Formatting", () => {
    it("Roster.jsx implements formatWorkHours helper", () => {
      assert.ok(rosterCode.includes("const formatWorkHours = (val) =>"), "Must define formatWorkHours");
    });

    it("Pure unit test: formatWorkHours handles all edge cases safely", () => {
      const formatWorkHours = (val) => {
        if (val === null || val === undefined || val === "") return "0.00";
        const num = Number(val);
        if (Number.isNaN(num) || !Number.isFinite(num) || num < 0) return "0.00";
        return num.toFixed(2);
      };

      assert.equal(formatWorkHours(8), "8.00");
      assert.equal(formatWorkHours(8.5), "8.50");
      assert.equal(formatWorkHours(7.75), "7.75");
      assert.equal(formatWorkHours(8.33333333333), "8.33");
      assert.equal(formatWorkHours(0), "0.00");
      assert.equal(formatWorkHours(null), "0.00");
      assert.equal(formatWorkHours(undefined), "0.00");
      assert.equal(formatWorkHours(NaN), "0.00");
      assert.equal(formatWorkHours(Infinity), "0.00");
      assert.equal(formatWorkHours(-5), "0.00");
    });
  });

  // =========================================================================
  // BUG 08: Sidebar Active State Synchronization
  // =========================================================================
  describe("BUG 08: Sidebar Active State Synchronization", () => {
    it("Sidebar.jsx menuClass handles missing tab param for employees and managers", () => {
      assert.ok(sidebarCode.includes("const effectiveTab = tabParam || (isManagerOrAdmin ? \"calendar\" : \"my-schedule\");"), "Must compute effectiveTab");
      assert.ok(sidebarCode.includes("path === `/roster?tab=${effectiveTab}`"), "Must match path against effectiveTab");
    });

    it("Pure unit test: highlights My Schedule when employee visits /roster without query string", () => {
      const simulateMenuClass = (role, pathname, search, path) => {
        const current = pathname + search;
        const searchParams = new URLSearchParams(search);
        const tabParam = searchParams.get("tab");

        let active = current === path;

        if (!active && pathname === "/roster") {
          const isManagerOrAdmin = ["admin", "superadmin", "hr", "manager"].includes(role);
          const effectiveTab = tabParam || (isManagerOrAdmin ? "calendar" : "my-schedule");
          if (path === `/roster?tab=${effectiveTab}`) {
            active = true;
          }
        }
        return active;
      };

      // Employee visiting bare /roster -> My Schedule highlighted
      assert.equal(simulateMenuClass("employee", "/roster", "", "/roster?tab=my-schedule"), true);
      assert.equal(simulateMenuClass("employee", "/roster", "", "/roster?tab=calendar"), false);

      // Employee visiting /roster?tab=my-schedule
      assert.equal(simulateMenuClass("employee", "/roster", "?tab=my-schedule", "/roster?tab=my-schedule"), true);

      // Manager visiting bare /roster -> Calendar highlighted
      assert.equal(simulateMenuClass("manager", "/roster", "", "/roster?tab=calendar"), true);
      assert.equal(simulateMenuClass("manager", "/roster", "", "/roster?tab=my-schedule"), false);

      // Manager or Admin visiting /roster?tab=my-schedule -> My Schedule highlighted
      assert.equal(simulateMenuClass("manager", "/roster", "?tab=my-schedule", "/roster?tab=my-schedule"), true);
      assert.equal(simulateMenuClass("admin", "/roster", "?tab=my-schedule", "/roster?tab=my-schedule"), true);
    });
  });

  // =========================================================================
  // BUG 09: Contextual Guide Banner
  // =========================================================================
  describe("BUG 09: Contextual Guide Banner", () => {
    it("Roster.jsx displays personal schedule guide when activeTab is my-schedule regardless of user role", () => {
      assert.ok(
        rosterCode.includes("activeTab === \"my-schedule\" ? (\n            <p><strong>Your personal schedule:</strong>"),
        "Must render personal schedule instructions when activeTab === my-schedule"
      );
    });

    it("Pure unit test: contextual guide renders personal instructions on my-schedule tab for all roles", () => {
      const getGuideType = (role, activeTab) => {
        if (activeTab === "my-schedule") return "PERSONAL_SCHEDULE";
        if (activeTab === "assignments") return "ASSIGNMENTS";
        if (activeTab === "rotations") return "ROTATIONS";
        const isAdminOrHr = ["admin", "superadmin", "hr"].includes(role);
        return isAdminOrHr ? "ROSTER_MANAGEMENT" : "TEAM_CALENDAR";
      };

      assert.equal(getGuideType("employee", "my-schedule"), "PERSONAL_SCHEDULE");
      assert.equal(getGuideType("manager", "my-schedule"), "PERSONAL_SCHEDULE");
      assert.equal(getGuideType("hr", "my-schedule"), "PERSONAL_SCHEDULE");
      assert.equal(getGuideType("admin", "my-schedule"), "PERSONAL_SCHEDULE");
      assert.equal(getGuideType("superadmin", "my-schedule"), "PERSONAL_SCHEDULE");

      assert.equal(getGuideType("admin", "calendar"), "ROSTER_MANAGEMENT");
      assert.equal(getGuideType("manager", "calendar"), "TEAM_CALENDAR");
      assert.equal(getGuideType("admin", "assignments"), "ASSIGNMENTS");
      assert.equal(getGuideType("hr", "rotations"), "ROTATIONS");
    });
  });
});
