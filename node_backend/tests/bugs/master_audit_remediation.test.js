import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { getCompanyLocalDate } from "../../../hrms_saas/src/utils/date.js";
import { db } from "../../src/db/index.js";

describe("MASTER AUDIT REMEDIATION VERIFICATION SUITE", () => {
  // =========================================================================
  // BUG-A01: HR Dashboard Authorization Parity (Admin Allowed)
  // =========================================================================
  describe("BUG-A01: HR Dashboard RBAC Parity", () => {
    const routeCode = fs.readFileSync(
      path.resolve("node_backend/src/routes/attendance.routes.js"),
      "utf8"
    );
    const serviceCode = fs.readFileSync(
      path.resolve("node_backend/src/services/attendance.service.js"),
      "utf8"
    );

    it("route authorizes admin alongside hr and superadmin for hr-dashboard", () => {
      assert.ok(
        routeCode.includes('authorize(["hr", "admin", "superadmin"])') &&
        routeCode.includes('/hr-dashboard/'),
        "attendance.routes.js must allow hr, admin, and superadmin on hr-dashboard"
      );
    });

    it("service allows admin role without throwing 403 in hrDashboard", () => {
      assert.ok(
        serviceCode.includes('role !== "hr" && role !== "admin" && role !== "superadmin"') &&
        serviceCode.includes('hrDashboard'),
        "attendance.service.js must allow admin in hrDashboard"
      );
    });
  });

  // =========================================================================
  // BUG-A02: Manager Team Analytics Scoped to Direct Reports
  // =========================================================================
  describe("BUG-A02: Manager Scoping in Team Analytics", () => {
    const serviceCode = fs.readFileSync(
      path.resolve("node_backend/src/services/attendance.service.js"),
      "utf8"
    );

    it("enforces manager direct report filter for manager role", () => {
      assert.ok(
        serviceCode.includes('const isGlobalViewer = role === "hr" || role === "admin" || role === "superadmin";'),
        "Must distinguish global viewers from managers"
      );
      assert.ok(
        serviceCode.includes('ep.manager_id = ?') &&
        serviceCode.includes('params.push(managerId'),
        "Must filter ep.manager_id = managerId when role is manager"
      );
    });
  });

  // =========================================================================
  // BUG-A03: Inactive User Enumeration Fix
  // =========================================================================
  describe("BUG-A03: Password Check Before Account Status (Anti-Enumeration)", () => {
    const serviceCode = fs.readFileSync(
      path.resolve("node_backend/src/services/accounts.service.js"),
      "utf8"
    );

    it("verifies password before checking is_active flag", () => {
      const verifyIdx = serviceCode.indexOf("verifyPassword(password, user.password)");
      const activeIdx = serviceCode.indexOf("!user.is_active");
      assert.ok(verifyIdx !== -1, "Must call verifyPassword");
      assert.ok(activeIdx !== -1, "Must check user.is_active");
      assert.ok(
        verifyIdx < activeIdx,
        "verifyPassword must execute before is_active check to prevent user status enumeration"
      );
    });

    it("returns generic 'Invalid credentials' error for inactive user", () => {
      assert.ok(
        serviceCode.includes('throw new AppError("Invalid credentials", 400);'),
        "Must throw generic 400 error"
      );
    });
  });

  // =========================================================================
  // BUG-A04: Site Management Navigation and Routing
  // =========================================================================
  describe("BUG-A04: Site Management Frontend Navigation & Routing", () => {
    const appCode = fs.readFileSync(path.resolve("hrms_saas/src/App.jsx"), "utf8");
    const sidebarCode = fs.readFileSync(path.resolve("hrms_saas/src/components/layout/Sidebar.jsx"), "utf8");
    const sitePageCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/SiteManagement.jsx"), "utf8");

    it("registers /site-management and /sites in App.jsx", () => {
      assert.ok(appCode.includes('path="/site-management"'), "Must define /site-management route");
      assert.ok(appCode.includes('path="/sites"'), "Must define /sites route alias");
    });

    it("includes Site Management link in Sidebar for admin/superadmin", () => {
      assert.ok(sidebarCode.includes('to="/site-management"'), "Sidebar must link to /site-management");
      assert.ok(sidebarCode.includes("Site Management"), "Sidebar must display Site Management label");
    });

    it("SiteManagement page is wrapped in standard Layout", () => {
      assert.ok(sitePageCode.includes("<Layout>"), "SiteManagement page must wrap content in <Layout>");
    });
  });

  // =========================================================================
  // BUG-A06: Roster Generation Work Site Dropdown
  // =========================================================================
  describe("BUG-A06: Work Site Dropdown in Roster Generation Modal", () => {
    const rosterCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/Roster.jsx"), "utf8");

    it("uses sites from useSite context in Roster.jsx", () => {
      assert.ok(rosterCode.includes("useSite()"), "Must access useSite hook");
      assert.ok(rosterCode.includes("loadingSites"), "Must handle site loading state");
    });

    it("includes work site selector inside Generate Draft Roster modal", () => {
      assert.ok(
        rosterCode.includes("Work Site") && rosterCode.includes("generateForm.site_id"),
        "Must render Work Site selector field bound to generateForm.site_id"
      );
    });
  });

  // =========================================================================
  // BUG-A07: Database Fallback for Revoked Tokens
  // =========================================================================
  describe("BUG-A07: Database Token Blacklist Resiliency", () => {
    const authCode = fs.readFileSync(path.resolve("node_backend/src/middleware/auth.js"), "utf8");
    const accountsCode = fs.readFileSync(path.resolve("node_backend/src/services/accounts.service.js"), "utf8");

    it("stores revoked JTI in accounts_revoked_token table on logout", () => {
      assert.ok(
        accountsCode.includes("INSERT INTO accounts_revoked_token") ||
        accountsCode.includes("INSERT IGNORE INTO accounts_revoked_token"),
        "Must persist revoked token to accounts_revoked_token on logout"
      );
    });

    it("auth middleware checks accounts_revoked_token when Redis is unavailable", () => {
      assert.ok(
        authCode.includes("FROM accounts_revoked_token WHERE jti = ?"),
        "Auth middleware must query DB token blacklist"
      );
    });
  });

  // =========================================================================
  // BUG-A08: Removal of Insecure localStorage Token Fallbacks
  // =========================================================================
  describe("BUG-A08: Enforce In-Memory Token in RealtimeContext", () => {
    const realtimeCode = fs.readFileSync(
      path.resolve("hrms_saas/src/context/RealtimeContext.jsx"),
      "utf8"
    );

    it("does not fall back to localStorage.getItem('token')", () => {
      assert.ok(
        !realtimeCode.includes('localStorage.getItem("token")') &&
        !realtimeCode.includes("localStorage.getItem('token')"),
        "RealtimeContext must not use localStorage token fallback"
      );
    });

    it("uses getInMemoryToken() for ticket acquisition", () => {
      assert.ok(
        realtimeCode.includes("getInMemoryToken()"),
        "Must strictly retrieve token from in-memory accessor"
      );
    });
  });

  // =========================================================================
  // BUG-A09: Attendance Regularization Workflow
  // =========================================================================
  describe("BUG-A09: Attendance Regularization Workflow (API & UI)", () => {
    const routeCode = fs.readFileSync(path.resolve("node_backend/src/routes/attendance.routes.js"), "utf8");
    const serviceCode = fs.readFileSync(path.resolve("node_backend/src/services/attendance.service.js"), "utf8");
    const historyCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/AttendanceHistory.jsx"), "utf8");

    it("backend exposes POST /attendance/regularize/ endpoint", () => {
      assert.ok(
        routeCode.includes('regularize/'),
        "attendance.routes.js must have regularize route"
      );
      assert.ok(
        serviceCode.includes("regularizeAttendance"),
        "attendance.service.js must implement regularizeAttendance"
      );
    });

    it("history page includes Regularize Now action and modal dialog", () => {
      assert.ok(
        historyCode.includes("Regularize Now"),
        "AttendanceHistory must render Regularize Now button"
      );
      assert.ok(
        historyCode.includes("regularizeModalOpen"),
        "AttendanceHistory must have regularizeModalOpen state"
      );
      assert.ok(
        historyCode.includes("/attendance/regularize/"),
        "AttendanceHistory must submit to /attendance/regularize/"
      );
    });
  });

  // =========================================================================
  // BUG-A10: Standardized GPS Accuracy Threshold (<= 100m)
  // =========================================================================
  describe("BUG-A10: Standardized GPS Accuracy (100m Threshold)", () => {
    const serviceCode = fs.readFileSync(path.resolve("node_backend/src/services/attendance.service.js"), "utf8");
    const webAttendanceCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/Attendance.jsx"), "utf8");
    const mobilePunchCode = fs.readFileSync(path.resolve("hrms_mobile/src/app/(tabs)/punch.tsx"), "utf8");

    it("backend rejects accuracy > 100 with clear message", () => {
      assert.ok(
        serviceCode.includes("Number(accuracy) > 100") &&
        serviceCode.includes("GPS accuracy is too low"),
        "Backend must reject punch requests with accuracy > 100 meters"
      );
    });

    it("web frontend checks accuracy <= 100 and passes accuracy in payload", () => {
      assert.ok(
        webAttendanceCode.includes("accuracy > 100"),
        "Web attendance must validate accuracy <= 100"
      );
      assert.ok(
        webAttendanceCode.includes("accuracy: coords.accuracy") ||
        webAttendanceCode.includes("accuracy: coords.accuracy != null"),
        "Web attendance must transmit accuracy in payload"
      );
    });

    it("mobile app checks accuracy <= 100 and passes accuracy in multipart form", () => {
      assert.ok(
        mobilePunchCode.includes("accuracy > 100"),
        "Mobile app must check accuracy <= 100 meters"
      );
      assert.ok(
        mobilePunchCode.includes('formData.append("accuracy"'),
        "Mobile app must append accuracy to multipart form"
      );
    });
  });

  // =========================================================================
  // BUG-A11: Timezone and Roster Date Boundary Handling
  // =========================================================================
  describe("BUG-A11: Roster Date Handling & Timezone Consistency", () => {
    const rosterCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/Roster.jsx"), "utf8");

    it("Roster.jsx imports getCompanyLocalDate and anchors visibleDates to UTC noon", () => {
      assert.ok(
        rosterCode.includes("getCompanyLocalDate"),
        "Roster.jsx must import and use getCompanyLocalDate"
      );
      assert.ok(
        rosterCode.includes("Date.UTC(sY, sM - 1, sD, 12, 0, 0)"),
        "visibleDates must anchor to UTC noon to avoid timezone shift defects"
      );
    });

    it("getCompanyLocalDate formats dates accurately in Asia/Kolkata", () => {
      const fixedDate = new Date("2026-11-23T23:30:00.000Z"); // 5:00 AM next day IST (Nov 24)
      const istDate = getCompanyLocalDate(fixedDate);
      assert.equal(istDate, "2026-11-24", "Must convert UTC midnight to next calendar day in IST");
    });
  });

  // =========================================================================
  // Phase 6 Database Performance: Composite Index on leave_leave (status, user_id)
  // =========================================================================
  describe("Phase 6: Database Performance Composite Index", () => {
    it("idx_leave_status_user composite index exists in MariaDB", async () => {
      const rawIndexes = await db.all(
        "SHOW INDEX FROM leave_leave WHERE Key_name = 'idx_leave_status_user'"
      );
      const indexes = [...rawIndexes].sort((a, b) => a.Seq_in_index - b.Seq_in_index);
      assert.equal(indexes.length, 2, "Index idx_leave_status_user must cover 2 columns");
      assert.equal(indexes[0].Column_name, "status", "First column in composite index must be status");
      assert.equal(indexes[1].Column_name, "user_id", "Second column in composite index must be user_id");
    });
  });

  // =========================================================================
  // BUG-A12: Approved Leave Balance & Used Deductions
  // =========================================================================
  describe("BUG-A12: Approved Leave Deductions in Leave Summary", () => {
    it("myLeaves reflects approved leaves in leaves_taken and decrements available_balance", async () => {
      const { leaveService } = await import("../../src/services/leave.service.js");
      const res = await leaveService.myLeaves(608, {}, 1);
      assert.ok(res.summary.leaves_taken >= 1, "Approved leave must be counted in leaves_taken");
      assert.equal(
        res.summary.leave_balance,
        res.summary.leave_allotted + (res.summary.management_concession || 0) - res.summary.leaves_taken,
        "Available balance must equal allotted + concession - leaves_taken"
      );
    });
  });

  // =========================================================================
  // BUG-A13: Exclude Leave Records from Personal Attendance History
  // =========================================================================
  describe("BUG-A13: Exclude Leave Records from Personal Attendance History", () => {
    it("getHistory excludes records where status = 'leave'", async () => {
      const { attendanceService } = await import("../../src/services/attendance.service.js");
      const res = await attendanceService.getHistory(608, {});
      assert.ok(
        res.records.every((r) => r.status !== "leave" && r.punch_in_status !== "leave"),
        "Personal attendance history must not show leave records"
      );
    });
  });

  // =========================================================================
  // BUG-A14: Mobile API 502 Failover & Dev Host Resolution
  // =========================================================================
  describe("BUG-A14: Mobile API 502 Failover & Dynamic Host Resolution", () => {
    const apiCode = fs.readFileSync(path.resolve("hrms_mobile/src/services/api.ts"), "utf8");
    const authContextCode = fs.readFileSync(path.resolve("hrms_mobile/src/context/AuthContext.tsx"), "utf8");
    const mobileEnv = fs.readFileSync(path.resolve("hrms_mobile/.env"), "utf8");

    it("hrms_mobile/.env does not point to expired temporary lhr.life tunnel", () => {
      assert.ok(!mobileEnv.includes(".lhr.life"), "Expired temporary tunnel must not be hardcoded in mobile .env");
      assert.ok(mobileEnv.includes("EXPO_PUBLIC_API_URL=http"), "Must define valid HTTP URL for backend API");
    });

    it("api.ts provides getDevApiUrl with Metro host fallback", () => {
      assert.ok(apiCode.includes("getDevApiUrl"), "api.ts must export/provide getDevApiUrl");
      assert.ok(apiCode.includes("Constants.expoConfig?.hostUri"), "Must resolve Metro bundler host IP");
    });

    it("api.ts implements 502 tunnel failover interceptor in development", () => {
      assert.ok(
        apiCode.includes("error.response?.status === 502"),
        "api.ts must catch 502 tunnel failures and trigger failover"
      );
      assert.ok(
        apiCode.includes("_fallbackAttempted"),
        "api.ts must guard against infinite retry loops with _fallbackAttempted"
      );
    });

    it("AuthContext provides descriptive message for 502 Bad Gateway", () => {
      assert.ok(
        authContextCode.includes("502 Bad Gateway"),
        "AuthContext must handle 502 status with informative error message"
      );
    });
  });
});
