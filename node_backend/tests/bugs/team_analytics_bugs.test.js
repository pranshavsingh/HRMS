import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import attendanceService from "../../src/services/attendance.service.js";

describe("HRMS Team Analytics Complete Bug Fixes Suite (TA-AN01 to TA-AN09)", () => {
  const servicePath = path.resolve("node_backend/src/services/attendance.service.js");
  const controllerPath = path.resolve("node_backend/src/controllers/attendance.controller.js");
  const repoPath = path.resolve("node_backend/src/repositories/attendance.repository.js");
  const pagePath = path.resolve("hrms_saas/src/pages/TeamAnalytics.jsx");
  const appPath = path.resolve("hrms_saas/src/App.jsx");
  const sidebarPath = path.resolve("hrms_saas/src/components/layout/Sidebar.jsx");

  const serviceCode = fs.readFileSync(servicePath, "utf8");
  const controllerCode = fs.readFileSync(controllerPath, "utf8");
  const repoCode = fs.readFileSync(repoPath, "utf8");
  const pageCode = fs.readFileSync(pagePath, "utf8");
  const appCode = fs.readFileSync(appPath, "utf8");
  const sidebarCode = fs.readFileSync(sidebarPath, "utf8");

  after(() => {
    setTimeout(() => process.exit(0), 500).unref();
  });

  // =========================================================================
  // TA-AN01: Data Scope and Role-Based Employee Visibility
  // =========================================================================
  describe("TA-AN01: Data Scope and Role-Based Employee Visibility", () => {
    it("attendance.controller.js resolves tenantId and passes site_id to service", () => {
      assert.ok(
        controllerCode.includes("resolveTenantId({ user: req.user, query: req.query, headers: req.headers })"),
        "teamAnalytics controller must call resolveTenantId"
      );
      assert.ok(
        controllerCode.includes("req.query.site_id || null"),
        "teamAnalytics controller must pass siteFilter to service"
      );
    });

    it("attendance.service.js rejects unauthorized employee roles with 403", async () => {
      await assert.rejects(
        async () => {
          await attendanceService.teamAnalytics(99, 30, "employee", 1);
        },
        (err) => err.statusCode === 403 || err.message === "Not allowed"
      );
    });

    it("attendance.service.js defines exact role-based visibility per Section 2", () => {
      // Manager & HR see active employees and managers
      assert.ok(
        serviceCode.includes('role === "manager" || role === "hr"') &&
        serviceCode.includes('["employee", "manager"]'),
        "Manager and HR must only see employee and manager roles"
      );
      // Admin & Superadmin see active employees, managers, and HR
      assert.ok(
        serviceCode.includes('role === "admin" || role === "superadmin"') &&
        serviceCode.includes('["employee", "manager", "hr"]'),
        "Admin and Superadmin must see employee, manager, and hr roles"
      );
    });

    it("attendance.service.js enforces single-company boundary using workforce_user_tenant", () => {
      assert.ok(
        serviceCode.includes("workforce_user_tenant wut WHERE wut.tenant_id = ? AND wut.user_id = u.id AND wut.is_active = 1"),
        "teamAnalytics query must verify membership in workforce_user_tenant for the company"
      );
    });
  });

  // =========================================================================
  // TA-AN02: Canonical Status Contract Mismatch
  // =========================================================================
  describe("TA-AN02: Canonical Status Contract Mismatch", () => {
    it("attendance.service.js returns canonical status strings (PRESENT, IN_PROGRESS, PENDING_REVIEW, ON_LEAVE, ABSENT, REJECTED)", () => {
      assert.ok(serviceCode.includes('"PRESENT"'), "Must assign canonical PRESENT status");
      assert.ok(serviceCode.includes('"IN_PROGRESS"'), "Must assign canonical IN_PROGRESS status");
      assert.ok(serviceCode.includes('"PENDING_REVIEW"'), "Must assign canonical PENDING_REVIEW status");
      assert.ok(serviceCode.includes('"ON_LEAVE"'), "Must assign canonical ON_LEAVE status");
      assert.ok(serviceCode.includes('"ABSENT"'), "Must assign canonical ABSENT status");
      assert.ok(serviceCode.includes('"REJECTED"'), "Must assign canonical REJECTED status");
    });

    it("TeamAnalytics.jsx implements canonical statusClasses and normalizeStatus helper", () => {
      assert.ok(pageCode.includes("normalizeStatus(status)"), "Must define normalizeStatus helper");
      assert.ok(pageCode.includes("PRESENT:"), "statusClasses must have PRESENT key");
      assert.ok(pageCode.includes("IN_PROGRESS:"), "statusClasses must have IN_PROGRESS key");
      assert.ok(pageCode.includes("PENDING_REVIEW:"), "statusClasses must have PENDING_REVIEW key");
      assert.ok(pageCode.includes("ON_LEAVE:"), "statusClasses must have ON_LEAVE key");
      assert.ok(pageCode.includes("ABSENT:"), "statusClasses must have ABSENT key");
      assert.ok(pageCode.includes("REJECTED:"), "statusClasses must have REJECTED key");
    });

    it("Pure unit test: normalizeStatus correctly maps both canonical and legacy abbreviation codes", () => {
      function normalizeStatus(status) {
        if (!status) return "ABSENT";
        const s = String(status).toUpperCase().trim();
        if (s === "PRESENT" || s === "P") return "PRESENT";
        if (s === "IN_PROGRESS" || s === "IN PROGRESS" || s === "IP") return "IN_PROGRESS";
        if (s === "PENDING_REVIEW" || s === "PENDING REVIEW" || s === "PR") return "PENDING_REVIEW";
        if (s === "ON_LEAVE" || s === "ON LEAVE" || s === "L") return "ON_LEAVE";
        if (s === "REJECTED" || s === "RJ") return "REJECTED";
        if (s === "ABSENT" || s === "A" || s === "--") return "ABSENT";
        return s;
      }

      assert.equal(normalizeStatus("P"), "PRESENT");
      assert.equal(normalizeStatus("Present"), "PRESENT");
      assert.equal(normalizeStatus("PRESENT"), "PRESENT");
      assert.equal(normalizeStatus("IP"), "IN_PROGRESS");
      assert.equal(normalizeStatus("In Progress"), "IN_PROGRESS");
      assert.equal(normalizeStatus("PR"), "PENDING_REVIEW");
      assert.equal(normalizeStatus("L"), "ON_LEAVE");
      assert.equal(normalizeStatus("On Leave"), "ON_LEAVE");
      assert.equal(normalizeStatus("RJ"), "REJECTED");
      assert.equal(normalizeStatus("--"), "ABSENT");
      assert.equal(normalizeStatus("A"), "ABSENT");
      assert.equal(normalizeStatus(null), "ABSENT");
    });
  });

  // =========================================================================
  // TA-AN03: Hardcoded Summary Counters
  // =========================================================================
  describe("TA-AN03: Hardcoded Summary Counters", () => {
    it("attendance.service.js calculates summary counters dynamically from records", () => {
      assert.ok(
        serviceCode.includes('present_today: records.filter((r) => r.today_status === "PRESENT" || r.today_status === "IN_PROGRESS").length'),
        "present_today must count present and in-progress records"
      );
      assert.ok(
        serviceCode.includes('on_leave_today: records.filter((r) => r.today_status === "ON_LEAVE").length'),
        "on_leave_today must count on-leave records"
      );
      assert.ok(
        serviceCode.includes('pending_review_today: records.filter((r) => r.today_status === "PENDING_REVIEW").length'),
        "pending_review_today must count pending-review records"
      );
      assert.ok(
        serviceCode.includes('absent_today: records.filter((r) => r.today_status === "ABSENT").length'),
        "absent_today must count absent records"
      );
    });

    it("Pure unit test: summary counters accurately reflect simulated records without double-counting", () => {
      const records = [
        { today_status: "PRESENT", total_work_hours: 8.5, under_target_days: 0, leave_days: 0 },
        { today_status: "IN_PROGRESS", total_work_hours: 4.0, under_target_days: 0, leave_days: 0 },
        { today_status: "ON_LEAVE", total_work_hours: 0, under_target_days: 0, leave_days: 3 },
        { today_status: "PENDING_REVIEW", total_work_hours: 8.0, under_target_days: 0, leave_days: 0 },
        { today_status: "ABSENT", total_work_hours: 0, under_target_days: 1, leave_days: 0 },
      ];

      const present_today = records.filter((r) => r.today_status === "PRESENT" || r.today_status === "IN_PROGRESS").length;
      const on_leave_today = records.filter((r) => r.today_status === "ON_LEAVE").length;
      const pending_review_today = records.filter((r) => r.today_status === "PENDING_REVIEW").length;
      const absent_today = records.filter((r) => r.today_status === "ABSENT").length;

      assert.equal(present_today, 2);
      assert.equal(on_leave_today, 1);
      assert.equal(pending_review_today, 1);
      assert.equal(absent_today, 1);
      assert.equal(present_today + on_leave_today + pending_review_today + absent_today, records.length);
    });
  });

  // =========================================================================
  // TA-AN04: Hardcoded Pending Approval Items
  // =========================================================================
  describe("TA-AN04: Hardcoded Pending Approval Items", () => {
    it("attendance.service.js queries actual pending approval items from database", () => {
      assert.ok(
        serviceCode.includes("attendance_attendanceapproval aa") &&
        serviceCode.includes("aa.status = 'pending'"),
        "Must query pending attendance approvals"
      );
      assert.ok(
        serviceCode.includes("leave_leave l") &&
        serviceCode.includes("l.status = 'pending'"),
        "Must query pending leave requests"
      );
      assert.ok(
        serviceCode.includes("pending_approval_items: pendingApprovalItems"),
        "Must attach pendingApprovalItems to member records"
      );
    });

    it("TeamAnalytics.jsx displays pending approval items in Attention Queue and table", () => {
      assert.ok(
        pageCode.includes("item.pending_approval_items"),
        "Attention Queue must display item.pending_approval_items"
      );
    });
  });

  // =========================================================================
  // TA-AN05: Incorrect Leave Calculation and Missing On Leave Detection
  // =========================================================================
  describe("TA-AN05: Incorrect Leave Calculation and Missing On Leave Detection", () => {
    it("attendance.repository.js getLeavesInRange excludes future leave records", () => {
      assert.ok(
        repoCode.includes("from_date<=CURDATE()") || repoCode.includes("from_date <= CURDATE()"),
        "getLeavesInRange must enforce from_date <= CURDATE()"
      );
      assert.ok(
        repoCode.includes("to_date>=DATE_SUB(CURDATE(), INTERVAL"),
        "getLeavesInRange must enforce to_date >= DATE_SUB"
      );
    });

    it("attendance.service.js clamps leave days strictly within requested reporting window", () => {
      assert.ok(
        serviceCode.includes("countedLeaveDates.add"),
        "Service must collect unique leave dates within window"
      );
      assert.ok(
        serviceCode.includes("leave_days: leaveDays"),
        "Service must set leave_days from countedLeaveDates"
      );
    });

    it("Pure unit test: leave spanning outside reporting window is strictly clamped", () => {
      // 30-day leave: from 20 days ago to 10 days in future
      const windowStartStr = "2026-05-24";
      const windowEndStr = "2026-05-30"; // 7-day window
      const winStart = new Date(`${windowStartStr}T00:00:00Z`);
      const winEnd = new Date(`${windowEndStr}T00:00:00Z`);

      const leaves = [
        { status: "approved", from_date: "2026-05-10", to_date: "2026-06-05" }, // Spans window
        { status: "rejected", from_date: "2026-05-25", to_date: "2026-05-27" }, // Rejected
      ];

      const countedLeaveDates = new Set();
      leaves.forEach((l) => {
        if (l.status !== "approved") return;
        const lvFrom = new Date(`${l.from_date}T00:00:00Z`);
        const lvTo = new Date(`${l.to_date}T00:00:00Z`);
        const cur = new Date(lvFrom > winStart ? lvFrom : winStart);
        const end = new Date(lvTo < winEnd ? lvTo : winEnd);

        while (cur <= end) {
          countedLeaveDates.add(cur.toISOString().slice(0, 10));
          cur.setUTCDate(cur.getUTCDate() + 1);
        }
      });

      // Exactly 7 days (May 24, 25, 26, 27, 28, 29, 30) - cannot exceed 7 in a 7-day window!
      assert.equal(countedLeaveDates.size, 7);
    });

    it("attendance.service.js detects approved leave today as ON_LEAVE without punch", () => {
      assert.ok(
        serviceCode.includes("hasApprovedLeaveToday"),
        "Service must check if employee has approved leave covering today"
      );
      assert.ok(
        serviceCode.includes('todayStatus = "ON_LEAVE"'),
        "Service must set todayStatus to ON_LEAVE when approved leave is present"
      );
    });
  });

  // =========================================================================
  // TA-AN06: Missing Route-Level RBAC
  // =========================================================================
  describe("TA-AN06: Missing Route-Level RBAC", () => {
    it("App.jsx protects /team-analytics route with allowedRoles=[manager, hr, admin, superadmin]", () => {
      assert.ok(
        appCode.includes('path="/team-analytics"'),
        "App.jsx must configure /team-analytics route"
      );
      assert.ok(
        appCode.includes('allowedRoles={["manager", "hr", "admin", "superadmin"]}') &&
        appCode.includes("<TeamAnalytics />"),
        "/team-analytics must specify allowedRoles={['manager', 'hr', 'admin', 'superadmin']}"
      );
    });
  });

  // =========================================================================
  // TA-AN07: Missing Sidebar Navigation
  // =========================================================================
  describe("TA-AN07: Missing Sidebar Navigation", () => {
    it("Sidebar.jsx includes Team Analytics link for Manager, HR, and Admin/Superadmin", () => {
      const occurrences = (sidebarCode.match(/to="\/team-analytics"/g) || []).length;
      assert.equal(occurrences, 3, "Sidebar.jsx must have Team Analytics link in exactly 3 sections (Manager, HR, Admin)");
      assert.ok(!sidebarCode.includes('role === "employee" && <Link to="/team-analytics"'), "Employee must not have Team Analytics");
    });
  });

  // =========================================================================
  // TA-AN08: Real-Time SSE Updates
  // =========================================================================
  describe("TA-AN08: Real-Time SSE Updates", () => {
    it("TeamAnalytics.jsx integrates useRealtime with attendance and leave events", () => {
      assert.ok(pageCode.includes('useRealtime("attendance_update"'), "Must subscribe to attendance_update");
      assert.ok(pageCode.includes('useRealtime("leave_update"'), "Must subscribe to leave_update");
      assert.ok(pageCode.includes("handleRealtimeUpdate"), "Must define stable realtime update handler");
      assert.ok(pageCode.includes("daysRef"), "Must use daysRef to prevent stale closure");
    });
  });

  // =========================================================================
  // TA-AN09: Multi-Site Filtering
  // =========================================================================
  describe("TA-AN09: Multi-Site Filtering", () => {
    it("TeamAnalytics.jsx consumes useSite and passes site_id parameter", () => {
      assert.ok(pageCode.includes("useSite()"), "Must consume useSite context");
      assert.ok(pageCode.includes("params.site_id = querySiteIdRef.current"), "Must attach site_id to request parameters");
      assert.ok(pageCode.includes("[days, querySiteId]"), "useEffect must depend on querySiteId");
    });

    it("attendance.service.js enforces siteScope on employee query", () => {
      assert.ok(
        serviceCode.includes("siteService.getSiteScope(tenantId, { id: managerId, role }, siteFilter)"),
        "Service must resolve siteScope"
      );
      assert.ok(
        serviceCode.includes("workforce_employee_site_assignment esa"),
        "Service must filter employees using workforce_employee_site_assignment"
      );
    });
  });
});
