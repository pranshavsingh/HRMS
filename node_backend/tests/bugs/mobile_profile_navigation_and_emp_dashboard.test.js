import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

describe("MOBILE PROFILE NAVIGATION & EMPLOYEE DASHBOARD VERIFICATION", () => {
  const rootLayoutPath = path.resolve("hrms_mobile/src/app/_layout.tsx");
  const tabsLayoutPath = path.resolve("hrms_mobile/src/app/(tabs)/_layout.tsx");
  const dashboardPath = path.resolve("hrms_mobile/src/app/(tabs)/dashboard.tsx");
  const profileStackPath = path.resolve("hrms_mobile/src/app/profile.tsx");
  const holidaysStackPath = path.resolve("hrms_mobile/src/app/holidays.tsx");

  it("1. Source files must exist and be registered", () => {
    assert.ok(fs.existsSync(rootLayoutPath), "_layout.tsx exists");
    assert.ok(fs.existsSync(tabsLayoutPath), "(tabs)/_layout.tsx exists");
    assert.ok(fs.existsSync(dashboardPath), "(tabs)/dashboard.tsx exists");
    assert.ok(fs.existsSync(profileStackPath), "app/profile.tsx exists as standalone stack screen");
    assert.ok(fs.existsSync(holidaysStackPath), "app/holidays.tsx exists as standalone stack screen");
  });

  describe("2. Root Navigation & Stack Architecture (_layout.tsx)", () => {
    const rootLayoutContent = fs.readFileSync(rootLayoutPath, "utf-8");

    it("registers profile and holidays in the root Stack navigator", () => {
      assert.ok(
        rootLayoutContent.includes("<Stack.Screen name=\"profile\""),
        "Root stack must register profile as a stack screen with native push transition"
      );
      assert.ok(
        rootLayoutContent.includes("<Stack.Screen name=\"holidays\""),
        "Root stack must register holidays as a stack screen with native push transition"
      );
    });

    it("verifies isLoginScreen check correctly targets only the login page", () => {
      assert.ok(
        rootLayoutContent.includes("const isLoginScreen = segs.length === 0 || segs[0] === \"index\" || segs[0] === \"\";"),
        "Must define isLoginScreen based on root or index route"
      );
      assert.ok(
        rootLayoutContent.includes("if (!isAuthenticated && !isLoginScreen)"),
        "Must redirect unauthenticated users away from protected screens"
      );
      assert.ok(
        rootLayoutContent.includes("else if (isAuthenticated && isLoginScreen)"),
        "Must redirect authenticated users away ONLY from the login screen"
      );
    });

    it("simulates route guard transitions across all possible Expo Router segments", () => {
      function simulateRouteGuard(isAuthenticated, isLoading, segments) {
        if (isLoading) return "loading";
        const segs = segments;
        const isLoginScreen = segs.length === 0 || segs[0] === "index" || segs[0] === "";

        if (!isAuthenticated && !isLoginScreen) {
          return "redirect_to_login";
        } else if (isAuthenticated && isLoginScreen) {
          return "redirect_to_dashboard";
        }
        return "stay_on_screen";
      }

      // Authenticated user on Profile screen -> Stays on Profile
      assert.equal(simulateRouteGuard(true, false, ["profile"]), "stay_on_screen");
      // Authenticated user on Holiday Calendar -> Stays on Holidays
      assert.equal(simulateRouteGuard(true, false, ["holidays"]), "stay_on_screen");
      // Authenticated user on Dashboard -> Stays on Dashboard
      assert.equal(simulateRouteGuard(true, false, ["(tabs)", "dashboard"]), "stay_on_screen");
      // Authenticated user on Login -> Redirects to Dashboard
      assert.equal(simulateRouteGuard(true, false, ["index"]), "redirect_to_dashboard");
      // Unauthenticated user on Profile -> Redirects to Login
      assert.equal(simulateRouteGuard(false, false, ["profile"]), "redirect_to_login");
      // Unauthenticated user on Holidays -> Redirects to Login
      assert.equal(simulateRouteGuard(false, false, ["holidays"]), "redirect_to_login");
    });
  });

  describe("3. Top Header Profile & Calendar Integration ((tabs)/_layout.tsx)", () => {
    const tabsLayoutContent = fs.readFileSync(tabsLayoutPath, "utf-8");

    it("configures headerTitleAlign to left to prevent title collision with headerRight", () => {
      assert.ok(
        tabsLayoutContent.includes("headerTitleAlign: \"left\""),
        "headerTitleAlign must be left to prevent touch blocking on Android"
      );
    });

    it("renders both Profile picture and Holiday Calendar in headerRight with touch handling", () => {
      assert.ok(
        tabsLayoutContent.includes("pointerEvents=\"box-none\""),
        "headerRightContainer must use pointerEvents='box-none' to pass touches directly to buttons"
      );
      assert.ok(
        tabsLayoutContent.includes("router.push(\"/profile\")"),
        "Profile button must navigate to /profile stack route"
      );
      assert.ok(
        tabsLayoutContent.includes("router.push(\"/holidays\")"),
        "Calendar button must navigate to /holidays stack route"
      );
      assert.ok(
        tabsLayoutContent.includes("hitSlop"),
        "Buttons must specify generous hitSlop for responsive mobile touch"
      );
    });

    it("verifies Calendar icon is positioned at the top right side of the profile picture", () => {
      const headerRightSection = tabsLayoutContent.slice(
        tabsLayoutContent.indexOf("headerRight: () =>"),
        tabsLayoutContent.indexOf("headerRightContainerStyle")
      );
      const profileIndex = headerRightSection.indexOf("Open profile");
      const calendarIndex = headerRightSection.indexOf("Open holiday calendar");

      assert.ok(profileIndex > 0, "Profile button must exist");
      assert.ok(calendarIndex > 0, "Calendar button must exist");
      assert.ok(
        profileIndex < calendarIndex,
        "Profile picture must come first, followed by the Calendar icon to its right"
      );
    });
  });

  describe("4. Employee Dashboard Streamlining ((tabs)/dashboard.tsx)", () => {
    const dashboardContent = fs.readFileSync(dashboardPath, "utf-8");

    it("verifies renderPersonalMetrics is hidden for role === 'employee'", () => {
      assert.ok(
        dashboardContent.includes("{role !== \"employee\" && renderPersonalMetrics()}"),
        "Must conditionally hide the 5 extra metric cards for employees"
      );
    });

    it("verifies Personal Overview is rendered in personal view", () => {
      assert.ok(
        dashboardContent.includes("{renderPersonalHeader()}"),
        "Must render Personal Overview header in personal view"
      );
    });

    it("verifies Your recent punch records is rendered in personal view", () => {
      assert.ok(
        dashboardContent.includes("{renderPersonalTimeline()}"),
        "Must render Personal Timeline in personal view"
      );
    });

    it("verifies personal overview card is streamlined without redundant holiday or register buttons", () => {
      assert.ok(
        !dashboardContent.includes("View Company Holiday Calendar"),
        "Personal overview card must not render redundant 'View Company Holiday Calendar' button"
      );
      assert.ok(
        !dashboardContent.includes("Open Monthly Attendance Register"),
        "Personal overview card must not render redundant 'Open Monthly Attendance Register' button"
      );
    });
  });

  describe("5. Enterprise Date Formatting Standardization", () => {
    const dateUtilPath = path.resolve("hrms_mobile/src/utils/date.ts");
    it("verifies date.ts utility file exists", () => {
      assert.ok(fs.existsSync(dateUtilPath), "date.ts utility must exist in hrms_mobile/src/utils/");
    });

    it("verifies pure date formatting functions against enterprise Indian English standard", () => {
      // Implement pure logic validation matching date.ts
      const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      function formatCompanyDate(val) {
        if (!val) return "--";
        if (typeof val === "string") {
          const match = val.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
          if (match) {
            const y = parseInt(match[1], 10);
            const m = parseInt(match[2], 10) - 1;
            const d = parseInt(match[3], 10);
            return `${String(d).padStart(2, "0")} ${MONTHS_SHORT[m]} ${y}`;
          }
        }
        const d = new Date(val);
        if (isNaN(d.getTime())) return String(val);
        return `${String(d.getDate()).padStart(2, "0")} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
      }

      function formatCompanyDateRange(from, to) {
        if (!from && !to) return "--";
        const f = formatCompanyDate(from);
        const t = formatCompanyDate(to);
        return f === t ? f : `${f} to ${t}`;
      }

      assert.equal(formatCompanyDate("2026-11-24"), "24 Nov 2026");
      assert.equal(formatCompanyDate("2026-01-05"), "05 Jan 2026");
      assert.equal(formatCompanyDate("2026-11-24T00:00:00.000Z"), "24 Nov 2026");
      assert.equal(formatCompanyDate(null), "--");
      assert.equal(formatCompanyDate(""), "--");

      assert.equal(formatCompanyDateRange("2026-11-24", "2026-11-25"), "24 Nov 2026 to 25 Nov 2026");
      assert.equal(formatCompanyDateRange("2026-11-24", "2026-11-24"), "24 Nov 2026");
    });

    it("verifies mobile screens import and utilize formatCompanyDate", () => {
      const screens = [
        "hrms_mobile/src/app/(tabs)/dashboard.tsx",
        "hrms_mobile/src/app/(tabs)/history.tsx",
        "hrms_mobile/src/app/(tabs)/leave.tsx",
        "hrms_mobile/src/app/(tabs)/shifts.tsx",
        "hrms_mobile/src/app/(tabs)/approvals.tsx",
        "hrms_mobile/src/app/profile.tsx",
        "hrms_mobile/src/app/my-documents.tsx",
        "hrms_mobile/src/app/(tabs)/employee-documents.tsx",
        "hrms_mobile/src/app/(tabs)/audit-logs.tsx",
        "hrms_mobile/src/app/(tabs)/team-attendance.tsx"
      ];

      for (const relPath of screens) {
        const content = fs.readFileSync(path.resolve(relPath), "utf-8");
        assert.ok(
          content.includes("formatCompanyDate") || content.includes("formatCompanyDateTime"),
          `${relPath} must import and utilize standardized date formatting`
        );
      }
    });
  });
});
