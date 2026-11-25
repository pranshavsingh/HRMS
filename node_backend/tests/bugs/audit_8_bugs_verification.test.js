import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { getCompanyLocalDate, formatCompanyDate, COMPANY_TIMEZONE } from "../../../hrms_saas/src/utils/date.js";

describe("AUDIT VERIFICATION: 8 Newly Identified HRMS Web App Bugs", () => {
  // =========================================================================
  // BUG-01: Dashboard Layout Loading Shell Stability
  // =========================================================================
  describe("BUG-01: Dashboard Layout Shell Collapse Prevention", () => {
    it("EmployeeDashboard.jsx wraps loading state inside Layout", () => {
      const code = fs.readFileSync(path.resolve("hrms_saas/src/pages/dashboard/EmployeeDashboard.jsx"), "utf8");
      assert.ok(
        code.includes("if (!data) {\n    return (\n      <Layout>\n        <Loader />\n      </Layout>\n    );\n  }") ||
        code.includes("if (!data) {\r\n    return (\r\n      <Layout>\r\n        <Loader />\r\n      </Layout>\r\n    );\r\n  }"),
        "EmployeeDashboard must wrap loading state in Layout to prevent shell collapse"
      );
      assert.ok(
        !code.includes("if (!data) return <Loader />;"),
        "Bare <Loader /> return must be eliminated"
      );
    });

    it("ManagerDashboard.jsx wraps loading state inside Layout", () => {
      const code = fs.readFileSync(path.resolve("hrms_saas/src/pages/dashboard/ManagerDashboard.jsx"), "utf8");
      assert.ok(
        code.includes("if (loading) {\n    return (\n      <Layout>\n        <Loader />\n      </Layout>\n    );\n  }") ||
        code.includes("if (loading) {\r\n    return (\r\n      <Layout>\r\n        <Loader />\r\n      </Layout>\r\n    );\r\n  }"),
        "ManagerDashboard must wrap loading state in Layout to prevent shell collapse"
      );
      assert.ok(
        !code.includes("if (loading) return <Loader />;"),
        "Bare <Loader /> return must be eliminated"
      );
    });

    it("HRDashboard.jsx wraps loading state inside Layout", () => {
      const code = fs.readFileSync(path.resolve("hrms_saas/src/pages/dashboard/HRDashboard.jsx"), "utf8");
      assert.ok(
        code.includes("if (loading) {\n    return (\n      <Layout>\n        <Loader />\n      </Layout>\n    );\n  }") ||
        code.includes("if (loading) {\r\n    return (\r\n      <Layout>\r\n        <Loader />\r\n      </Layout>\r\n    );\r\n  }"),
        "HRDashboard must wrap loading state in Layout to prevent shell collapse"
      );
      assert.ok(
        !code.includes("if (loading) return <Loader />;"),
        "Bare <Loader /> return must be eliminated"
      );
    });
  });

  // =========================================================================
  // BUG-02: Dynamic Navbar Page Titles
  // =========================================================================
  describe("BUG-02: Dynamic Navbar Page Titles", () => {
    it("Navbar.jsx contains centralized route title mapping and resolves titles dynamically", () => {
      const code = fs.readFileSync(path.resolve("hrms_saas/src/components/layout/Navbar.jsx"), "utf8");
      assert.ok(
        code.includes("ROUTE_TITLES"),
        "Navbar must define ROUTE_TITLES dictionary"
      );
      assert.ok(
        code.includes("getPageTitle"),
        "Navbar must contain a dynamic getPageTitle resolver"
      );
      assert.ok(
        code.includes("useLocation"),
        "Navbar must use useLocation() from react-router-dom"
      );
      assert.ok(
        code.includes('"/attendance": "Attendance"') &&
        code.includes('"/leave": "Leave Management"') &&
        code.includes('"/shifts": "Shift Management"') &&
        code.includes('"/reports": "Reports & Analytics"'),
        "ROUTE_TITLES must map core HRMS routes"
      );
    });
  });

  // =========================================================================
  // BUG-03: Catch-All 404 Route
  // =========================================================================
  describe("BUG-03: Proper Catch-All 404 Route and Page", () => {
    it("App.jsx registers wildcard * route pointing to NotFound", () => {
      const code = fs.readFileSync(path.resolve("hrms_saas/src/App.jsx"), "utf8");
      assert.ok(
        code.includes('import NotFound from "./pages/NotFound";'),
        "App.jsx must import NotFound page"
      );
      assert.ok(
        code.includes('<Route path="*" element={<NotFound />} />'),
        "App.jsx must include catch-all wildcard route at the end of Routes"
      );
    });

    it("NotFound.jsx page exists and provides navigation back to Dashboard/Login", () => {
      const notFoundPath = path.resolve("hrms_saas/src/pages/NotFound.jsx");
      assert.ok(fs.existsSync(notFoundPath), "NotFound.jsx file must exist");
      const code = fs.readFileSync(notFoundPath, "utf8");
      assert.ok(
        code.includes("404") && code.includes("Page Not Found"),
        "NotFound page must display 404 and Page Not Found heading"
      );
      assert.ok(
        code.includes('to={isAuthenticated ? "/dashboard" : "/"}'),
        "NotFound page must direct authenticated users to dashboard and unauthenticated to login"
      );
    });
  });

  // =========================================================================
  // BUG-04: Login Page Authenticated Session Redirection
  // =========================================================================
  describe("BUG-04: Redirect Authenticated Users Away From Login", () => {
    it("Login.jsx checks isAuthenticated and navigates to /dashboard", () => {
      const code = fs.readFileSync(path.resolve("hrms_saas/src/pages/Login.jsx"), "utf8");
      assert.ok(
        code.includes("isAuthenticated"),
        "Login.jsx must check isAuthenticated from useAuth()"
      );
      assert.ok(
        code.includes('navigate("/dashboard", { replace: true })'),
        "Login.jsx must redirect authenticated users to /dashboard"
      );
      assert.ok(
        code.includes("authLoading"),
        "Login.jsx must handle auth loading state gracefully before rendering form"
      );
    });
  });

  // =========================================================================
  // BUG-05: Timeline Date UTC Shift Elimination
  // =========================================================================
  describe("BUG-05: Timeline Date Timezone Formatting", () => {
    it("EmployeeDashboard.jsx and AdminDashboard.jsx do NOT hardcode timeZone: 'UTC'", () => {
      const empCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/dashboard/EmployeeDashboard.jsx"), "utf8");
      assert.ok(
        !empCode.includes('timeZone: "UTC"'),
        "EmployeeDashboard must not hardcode UTC in timeline formatting"
      );
      assert.ok(
        empCode.includes("formatCompanyDate"),
        "EmployeeDashboard must use formatCompanyDate"
      );

      const adminCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/dashboard/AdminDashboard.jsx"), "utf8");
      assert.ok(
        !adminCode.includes('timeZone: "UTC"'),
        "AdminDashboard must not hardcode UTC in timeline formatting"
      );
      assert.ok(
        adminCode.includes("formatCompanyDate"),
        "AdminDashboard must use formatCompanyDate"
      );
    });

    it("formatCompanyDate properly formats timestamps around IST midnight without back-shifting", () => {
      // 2026-11-23 00:30:00 IST is 2026-11-22 19:00:00 UTC
      const lateUtc = new Date("2026-11-22T19:00:00.000Z");
      const formatted = formatCompanyDate(lateUtc);
      assert.strictEqual(formatted, "23 Nov 2026", "00:30 IST must format as 23 Nov 2026 in Asia/Kolkata");

      // 2026-11-23 05:29:00 IST is 2026-11-22 23:59:00 UTC
      const earlyMorningUtc = new Date("2026-11-22T23:59:00.000Z");
      const formattedEarly = formatCompanyDate(earlyMorningUtc);
      assert.strictEqual(formattedEarly, "23 Nov 2026", "05:29 IST must format as 23 Nov 2026 in Asia/Kolkata");
    });
  });

  // =========================================================================
  // BUG-06: Centralized Date Utility and Form Default Dates
  // =========================================================================
  describe("BUG-06: Centralized Date Utility in Company Timezone (Asia/Kolkata)", () => {
    it("getCompanyLocalDate generates YYYY-MM-DD in Asia/Kolkata timezone", () => {
      assert.strictEqual(COMPANY_TIMEZONE, "Asia/Kolkata");
      // Instant at 2026-11-23 01:00:00 IST (2026-11-22 19:30:00 UTC)
      const instant = new Date("2026-11-22T19:30:00.000Z");
      const localDate = getCompanyLocalDate(instant);
      assert.strictEqual(localDate, "2026-11-23", "Must be 2026-11-23 in Asia/Kolkata, not UTC 2026-11-22");
    });

    it("Leave.jsx uses getCompanyLocalDate() for today's default", () => {
      const code = fs.readFileSync(path.resolve("hrms_saas/src/pages/Leave.jsx"), "utf8");
      assert.ok(
        code.includes("const today = getCompanyLocalDate();"),
        "Leave.jsx must use getCompanyLocalDate()"
      );
      assert.ok(
        !code.includes('new Date().toISOString().split("T")[0]'),
        "Leave.jsx must eliminate direct UTC toISOString split"
      );
    });

    it("Shifts.jsx uses getCompanyLocalDate() for policy and shift defaults", () => {
      const code = fs.readFileSync(path.resolve("hrms_saas/src/pages/Shifts.jsx"), "utf8");
      assert.ok(
        code.includes("effective_from: getCompanyLocalDate()"),
        "Shifts.jsx must use getCompanyLocalDate() for effective_from"
      );
      assert.ok(
        !code.includes('new Date().toISOString().slice(0, 10)'),
        "Shifts.jsx must eliminate UTC toISOString slicing"
      );
    });
  });

  // =========================================================================
  // BUG-07: Attendance History Date Range Validation
  // =========================================================================
  describe("BUG-07: Attendance History Date Range Validation", () => {
    it("AttendanceHistory.jsx validates startDate <= endDate before applying filters", () => {
      const code = fs.readFileSync(path.resolve("hrms_saas/src/pages/AttendanceHistory.jsx"), "utf8");
      assert.ok(
        code.includes("draftFilters.startDate > draftFilters.endDate"),
        "AttendanceHistory must check if draftFilters.startDate > draftFilters.endDate"
      );
      assert.ok(
        code.includes('showPopup("Start date cannot be after end date", "warning")'),
        "AttendanceHistory must display warning popup when start date is after end date"
      );
    });
  });

  // =========================================================================
  // BUG-08: Complete Removal of localStorage Role Fallbacks
  // =========================================================================
  describe("BUG-08: Elimination of Direct localStorage Role Fallbacks", () => {
    it("AttendanceApprovals.jsx does not read role from localStorage", () => {
      const code = fs.readFileSync(path.resolve("hrms_saas/src/pages/AttendanceApprovals.jsx"), "utf8");
      assert.ok(!code.includes('localStorage.getItem("role")'));
    });

    it("LeaveApprovals.jsx does not read role from localStorage", () => {
      const code = fs.readFileSync(path.resolve("hrms_saas/src/pages/LeaveApprovals.jsx"), "utf8");
      assert.ok(!code.includes('localStorage.getItem("role")'));
    });

    it("Roster.jsx does not read role from localStorage", () => {
      const code = fs.readFileSync(path.resolve("hrms_saas/src/pages/Roster.jsx"), "utf8");
      assert.ok(!code.includes('localStorage.getItem("role")'));
    });

    it("AdminDashboard.jsx does not read role from localStorage", () => {
      const code = fs.readFileSync(path.resolve("hrms_saas/src/pages/dashboard/AdminDashboard.jsx"), "utf8");
      assert.ok(!code.includes('localStorage.getItem("role")'));
    });

    it("SiteManagement.jsx does not read role from localStorage", () => {
      const code = fs.readFileSync(path.resolve("hrms_saas/src/pages/SiteManagement.jsx"), "utf8");
      assert.ok(!code.includes('localStorage.getItem("role")'));
    });

    it("Navbar.jsx does not read role from localStorage", () => {
      const code = fs.readFileSync(path.resolve("hrms_saas/src/components/layout/Navbar.jsx"), "utf8");
      assert.ok(!code.includes('localStorage.getItem("role")'));
    });

    it("RealtimeContext.jsx does not read role from localStorage", () => {
      const code = fs.readFileSync(path.resolve("hrms_saas/src/context/RealtimeContext.jsx"), "utf8");
      assert.ok(!code.includes('localStorage.getItem("role")'));
    });
  });
});
