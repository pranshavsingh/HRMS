import { describe, it } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

describe("MASTER ENGINEERING VERIFICATION: All 17 Identified Bugs", () => {
  // =========================================================================
  // GROUP A: ROUTING, NAVIGATION AND RBAC
  // =========================================================================

  describe("BUG-01: Admin/Superadmin Personal Dashboard Routing", () => {
    it("Dashboard.jsx allows admin/superadmin to access personal dashboard when view=personal", () => {
      const code = fs.readFileSync(path.resolve("hrms_saas/src/pages/Dashboard.jsx"), "utf8");
      assert.ok(
        code.includes('if (view === "personal") return <EmployeeDashboard />;'),
        "Personal dashboard view condition must not exclude admin or superadmin"
      );
      assert.ok(
        !code.includes('if (view === "personal" && role !== "admin" && role !== "superadmin")'),
        "Inverted role condition must be removed"
      );
    });
  });

  describe("BUG-02: HR Dashboard Routing", () => {
    it("Dashboard.jsx directs HR users to HRDashboard", () => {
      const code = fs.readFileSync(path.resolve("hrms_saas/src/pages/Dashboard.jsx"), "utf8");
      assert.ok(
        code.includes('if (role === "hr") return <HRDashboard />;'),
        "HR role must render HRDashboard, not EmployeeDashboard"
      );
    });
  });

  describe("BUG-03: RBAC Protection to Employees Route", () => {
    it("App.jsx restricts /employees route to authorized roles", () => {
      const code = fs.readFileSync(path.resolve("hrms_saas/src/App.jsx"), "utf8");
      assert.ok(
        code.includes('path="/employees"\n              element={\n                <ProtectedRoute allowedRoles={["admin", "hr", "superadmin"]}>') ||
        code.includes('path="/employees"\r\n              element={\r\n                <ProtectedRoute allowedRoles={["admin", "hr", "superadmin"]}>'),
        "/employees route must be protected with admin, hr, superadmin roles"
      );
    });
  });

  describe("BUG-04: Role Guards to HR and Team Dashboards", () => {
    it("App.jsx protects /team-dashboard and /hr-dashboard with role guards", () => {
      const code = fs.readFileSync(path.resolve("hrms_saas/src/App.jsx"), "utf8");
      assert.ok(
        code.includes('allowedRoles={["manager", "admin", "superadmin"]}>\n                  <TeamDashboard />') ||
        code.includes('allowedRoles={["manager", "admin", "superadmin"]}>\r\n                  <TeamDashboard />'),
        "/team-dashboard must be protected for manager, admin, superadmin"
      );
      assert.ok(
        code.includes('allowedRoles={["hr", "admin", "superadmin"]}>\n                  <HRDashboard />') ||
        code.includes('allowedRoles={["hr", "admin", "superadmin"]}>\r\n                  <HRDashboard />'),
        "/hr-dashboard must be protected for hr, admin, superadmin"
      );
    });
  });

  describe("BUG-05: Holidays Link in Sidebar", () => {
    it("Sidebar.jsx includes navigation link to /holidays", () => {
      const code = fs.readFileSync(path.resolve("hrms_saas/src/components/layout/Sidebar.jsx"), "utf8");
      assert.ok(
        code.includes('to="/holidays"'),
        "Sidebar must contain navigation link to /holidays"
      );
    });
  });

  describe("BUG-06: UploadDocuments.jsx Redirection", () => {
    it("UploadDocuments.jsx redirects safely to /employee-documents", () => {
      const code = fs.readFileSync(path.resolve("hrms_saas/src/pages/UploadDocuments.jsx"), "utf8");
      assert.ok(
        code.includes('to="/employee-documents" replace'),
        "UploadDocuments must redirect to /employee-documents"
      );
    });
  });

  // =========================================================================
  // GROUP B: ATTENDANCE AND LEAVE LOGIC
  // =========================================================================

  describe("BUG-07: Unclosed Attendance Cleanup in Cron", () => {
    it("cron.js does NOT auto-approve abandoned shifts with fabricated punch_out_time", () => {
      const code = fs.readFileSync(path.resolve("node_backend/src/utils/cron.js"), "utf8");
      assert.ok(
        !code.includes("punch_out_time = NOW(), punch_out_status = 'approved', status = 'approved'"),
        "Cron job must NOT auto-approve abandoned shifts with fake NOW() timestamps"
      );
      assert.ok(
        code.includes("punch_out_status = 'pending'") && code.includes("status = 'pending'"),
        "Cron job must keep unclosed records pending review"
      );
    });
  });

  describe("BUG-08: AttendanceHistory Date Localization (IST)", () => {
    it("AttendanceHistory.jsx calculates dates using Asia/Kolkata timezone", () => {
      const code = fs.readFileSync(path.resolve("hrms_saas/src/pages/AttendanceHistory.jsx"), "utf8");
      assert.ok(
        code.includes('timeZone: "Asia/Kolkata"'),
        "Date calculations must specify Asia/Kolkata timezone"
      );
    });
  });

  describe("BUG-09: AttendanceHistory Draft vs Applied Filters", () => {
    it("AttendanceHistory.jsx decouples draft filter changes from automatic fetch", () => {
      const code = fs.readFileSync(path.resolve("hrms_saas/src/pages/AttendanceHistory.jsx"), "utf8");
      assert.ok(
        code.includes("draftFilters") && code.includes("appliedFilters"),
        "Must maintain separate draftFilters and appliedFilters states"
      );
      assert.ok(
        code.includes("useEffect(() => {\n    fetchHistory(appliedFilters, true);") ||
        code.includes("useEffect(() => {\r\n    fetchHistory(appliedFilters, true);"),
        "useEffect must depend on appliedFilters, not immediate draft input"
      );
    });
  });

  describe("BUG-10: CompanyLeavePolicy Search Debounce", () => {
    it("CompanyLeavePolicy.jsx debounces search query and supports AbortController", () => {
      const code = fs.readFileSync(path.resolve("hrms_saas/src/pages/leave/CompanyLeavePolicy.jsx"), "utf8");
      assert.ok(
        code.includes("debouncedSearch"),
        "Search input must be debounced"
      );
      assert.ok(
        code.includes("AbortController"),
        "Search requests must support AbortController cancellation"
      );
    });
  });

  // =========================================================================
  // GROUP C: SECURITY, FORMATTING AND CSV EXPORT
  // =========================================================================

  describe("BUG-11: AuthContext Role as Single Source of Truth", () => {
    it("Pages and components do not fall back to raw localStorage for role", () => {
      const empCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/Employees.jsx"), "utf8");
      assert.ok(
        !empCode.includes('localStorage.getItem("role")'),
        "Employees.jsx must not fall back to localStorage.getItem('role')"
      );

      const empDocsCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/EmployeeDocuments.jsx"), "utf8");
      assert.ok(
        !empDocsCode.includes('localStorage.getItem("role")'),
        "EmployeeDocuments.jsx must not read role from localStorage"
      );

      const sidebarCode = fs.readFileSync(path.resolve("hrms_saas/src/components/layout/Sidebar.jsx"), "utf8");
      assert.ok(
        !sidebarCode.includes('authRole || localStorage.getItem("role")'),
        "Sidebar.jsx must not fall back to localStorage for role"
      );
    });
  });

  describe("BUG-12: Reports.jsx Cell Code Style Type Safety", () => {
    it("Reports.jsx safely handles non-string values without throwing TypeError", () => {
      const code = fs.readFileSync(path.resolve("hrms_saas/src/pages/Reports.jsx"), "utf8");
      assert.ok(
        code.includes('if (typeof val !== "string") return "bg-slate-50 text-slate-600 border border-slate-200";'),
        "cellCodeStyle must guard against non-string values before string methods"
      );
    });
  });

  describe("BUG-13: TeamAttendance CSV Sanitizer Export", () => {
    it("TeamAttendance.jsx exports sanitizeCsvValue for testability and reuse", () => {
      const code = fs.readFileSync(path.resolve("hrms_saas/src/pages/TeamAttendance.jsx"), "utf8");
      assert.ok(
        code.includes("export const sanitizeCsvValue ="),
        "sanitizeCsvValue must be exported"
      );
    });
  });

  // =========================================================================
  // GROUP D: BACKEND DATABASE AND API
  // =========================================================================

  describe("BUG-14: Safe hasColumn Implementation in Shift Assignment Service", () => {
    it("shift-assignment.service.js uses information_schema and validates identifiers", () => {
      const code = fs.readFileSync(path.resolve("node_backend/src/services/shift-assignment.service.js"), "utf8");
      assert.ok(
        code.includes("information_schema.COLUMNS") || code.includes("INFORMATION_SCHEMA.COLUMNS"),
        "hasColumn must query information_schema.COLUMNS"
      );
      assert.ok(
        code.includes("/^[a-zA-Z0-9_]+$/"),
        "hasColumn must validate table and column identifiers against regex"
      );
      assert.ok(
        !code.includes("PRAGMA table_info(${tableName})"),
        "Unsanitized SQLite PRAGMA interpolation must be eliminated"
      );
    });
  });

  describe("BUG-15: Hard-Delete Employee Route Retired", () => {
    it("accounts.routes.js does not expose hard-delete employee endpoint", () => {
      const code = fs.readFileSync(path.resolve("node_backend/src/routes/accounts.routes.js"), "utf8");
      assert.ok(
        !code.includes('r.delete("/employees/:user_id/"'),
        "DELETE /employees/:user_id/ route must be retired in favor of soft-delete"
      );
    });
  });

  // =========================================================================
  // GROUP E: MOBILE EXPO IMPORT
  // =========================================================================

  describe("BUG-16: Mobile FileSystem Public Import", () => {
    it("hrms_mobile punch.tsx imports from public expo-file-system package", () => {
      const code = fs.readFileSync(path.resolve("hrms_mobile/src/app/(tabs)/punch.tsx"), "utf8");
      assert.ok(
        code.includes('import * as FileSystem from "expo-file-system";') || code.includes('import * as FileSystem from "expo-file-system/legacy";'),
        "Must import from public 'expo-file-system' module"
      );
      assert.ok(
        !code.includes("expo-file-system/src/legacy"),
        "Must not import from private 'expo-file-system/src/legacy' path"
      );
    });
  });

  // =========================================================================
  // GROUP F: IN-MEMORY TOKEN SECURITY HARDENING
  // =========================================================================

  describe("BUG-17: In-Memory Token Architecture", () => {
    it("AuthContext.jsx and axios.js do NOT store access token in localStorage", () => {
      const authContextCode = fs.readFileSync(path.resolve("hrms_saas/src/context/AuthContext.jsx"), "utf8");
      assert.ok(
        !authContextCode.includes('localStorage.setItem("token", token)'),
        "AuthContext must never persist access tokens into localStorage"
      );
      assert.ok(
        authContextCode.includes('localStorage.removeItem("token");'),
        "AuthContext must clean up any legacy token"
      );

      const axiosCode = fs.readFileSync(path.resolve("hrms_saas/src/api/axios.js"), "utf8");
      assert.ok(
        !axiosCode.includes('localStorage.setItem("token", access)'),
        "Axios interceptor must never persist refreshed token to localStorage"
      );
      assert.ok(
        axiosCode.includes("const token = inMemoryAccessToken;"),
        "Axios request interceptor must attach tokens strictly from memory"
      );
    });
  });
});
