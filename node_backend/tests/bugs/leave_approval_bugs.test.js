import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { leaveService } from "../../src/services/leave.service.js";
import { leaveActionSchema } from "../../src/middleware/validation.js";

describe("HRMS Leave Approvals Bug Fixes Suite (BUG-L01 to BUG-L09)", () => {
  const superadminActor = { id: 1, role: "superadmin" };
  const adminActor = { id: 2, role: "admin" };
  const hrActor = { id: 3, role: "hr" };
  const tenantId = 1;

  after(() => {
    setTimeout(() => process.exit(0), 500).unref();
  });

  // =========================================================================
  // BUG-L01: Hardcoded 50-Record Data Truncation & Server-Side Pagination
  // =========================================================================
  describe("BUG-L01: Server-side Pagination & Removal of 50-Record Truncation", () => {
    it("approvals() should accept page and limit query parameters and return pagination envelope", async () => {
      const res = await leaveService.approvals(superadminActor.role, superadminActor.id, { page: 1, limit: 5 }, tenantId);
      assert.ok(res.pagination, "Response must include pagination envelope");
      assert.equal(res.pagination.page, 1);
      assert.equal(res.pagination.limit, 5);
      assert.ok(typeof res.pagination.total === "number", "Total must be numeric");
      assert.ok(typeof res.pagination.totalPages === "number", "TotalPages must be numeric");
      assert.ok(Array.isArray(res.data), "data must be an array");
      assert.ok(res.data.length <= 5, "Result length must respect the limit parameter");
    });

    it("approvals() should filter by search string before pagination slicing", async () => {
      const res = await leaveService.approvals(
        superadminActor.role,
        superadminActor.id,
        { search: "nonexistent_employee_unique_search_xyz" },
        tenantId
      );
      assert.equal(res.data.length, 0, "Non-matching search must return 0 records");
      assert.equal(res.pagination.total, 0, "Pagination total must be 0 for non-matching search");
    });

    it("approvals() should filter by status before pagination slicing", async () => {
      const pendingRes = await leaveService.approvals(
        superadminActor.role,
        superadminActor.id,
        { status: "pending", limit: 50 },
        tenantId
      );
      assert.ok(Array.isArray(pendingRes.data), "Pending data must be an array");
      for (const item of pendingRes.data) {
        assert.equal(item.status, "pending", "All records must match requested status filter");
      }
    });

    it("Frontend LeaveApprovals.jsx consumes server-side pagination with dynamic page, limit, and total count", () => {
      const frontendCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/LeaveApprovals.jsx"), "utf8");
      assert.ok(frontendCode.includes("page: currentPage"), "Must send page: currentPage to backend");
      assert.ok(frontendCode.includes("limit: pageSize"), "Must send limit: pageSize to backend");
      assert.ok(!frontendCode.includes("usePagination(filteredRecords)"), "Must not use client-side slicing");
      assert.ok(frontendCode.includes("<Pagination"), "Must render Pagination component with server metadata");
    });
  });

  // =========================================================================
  // BUG-L02: Missing Route Guards and Backend Authorization
  // =========================================================================
  describe("BUG-L02: Route Guards and Backend Authorization", () => {
    it("Backend leave.routes.js restricts /approvals/ to authorized roles", () => {
      const routeCode = fs.readFileSync(path.resolve("node_backend/src/routes/leave.routes.js"), "utf8");
      assert.ok(
        routeCode.includes('authorize(["manager", "hr", "admin", "superadmin"]), c.approvals'),
        "Backend /approvals/ route must enforce authorize middleware"
      );
    });

    it("Frontend App.jsx protects /leave-approvals and /team-leave-approvals with allowedRoles", () => {
      const appCode = fs.readFileSync(path.resolve("hrms_saas/src/App.jsx"), "utf8");
      assert.ok(
        /<ProtectedRoute allowedRoles=\{.+?manager.+?hr.+?admin.+?superadmin.+?\}>\s*<LeaveApprovals \/>/.test(appCode),
        "/leave-approvals route in App.jsx must have allowedRoles"
      );
      assert.ok(
        appCode.includes('path="/team-leave-approvals"'),
        "/team-leave-approvals route must be declared"
      );
    });

    it("leaveService.approvals returns empty response for unauthorized roles (e.g. employee)", async () => {
      const res = await leaveService.approvals("employee", 999, {}, tenantId);
      assert.equal(res.data.length, 0, "Unauthorized role should receive 0 records");
    });
  });

  // =========================================================================
  // BUG-L03: Route Parameter Type Insecurity and Missing Validation
  // =========================================================================
  describe("BUG-L03: Route Parameter Type Insecurity and leaveActionSchema Validation", () => {
    it("leaveActionSchema validates numeric leave_id and valid status enum", () => {
      const valid = leaveActionSchema.safeParse({
        params: { leave_id: "42" },
        body: { status: "approved" },
      });
      assert.ok(valid.success, "Numeric leave_id with valid status must pass validation");
    });

    it("leaveActionSchema rejects non-numeric or malformed leave_id", () => {
      const invalidParam = leaveActionSchema.safeParse({
        params: { leave_id: "abc" },
        body: { status: "approved" },
      });
      assert.equal(invalidParam.success, false, "Alpha leave_id must fail validation");

      const negativeParam = leaveActionSchema.safeParse({
        params: { leave_id: "-5" },
        body: { status: "rejected" },
      });
      assert.equal(negativeParam.success, false, "Negative leave_id must fail validation");
    });

    it("leaveActionSchema rejects invalid status values", () => {
      const invalidStatus = leaveActionSchema.safeParse({
        params: { leave_id: "10" },
        body: { status: "cancelled" },
      });
      assert.equal(invalidStatus.success, false, "Unsupported status must fail validation");
    });
  });

  // =========================================================================
  // BUG-L04: Insecure Role Derivation via LocalStorage
  // =========================================================================
  describe("BUG-L04: Role Derivation via AuthContext and useAuth Hook", () => {
    it("LeaveApprovals.jsx imports and uses useAuth hook for authenticated role", () => {
      const frontendCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/LeaveApprovals.jsx"), "utf8");
      assert.ok(
        frontendCode.includes('import { useAuth } from "../context/AuthContext";'),
        "Must import useAuth from AuthContext"
      );
      assert.ok(
        frontendCode.includes("const { role: authRole } = useAuth();"),
        "Must destructure role from useAuth"
      );
      assert.ok(
        frontendCode.includes("const role = authRole || localStorage.getItem(\"role\") || \"hr\";"),
        "Must prioritize authRole from memory"
      );
    });
  });

  // =========================================================================
  // BUG-L05: Missing Superadmin Hero and Role Viewport
  // =========================================================================
  describe("BUG-L05: Superadmin Hero Definition in heroByRole", () => {
    it("LeaveApprovals.jsx heroByRole includes explicit superadmin definition", () => {
      const frontendCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/LeaveApprovals.jsx"), "utf8");
      assert.ok(frontendCode.includes("superadmin: {"), "heroByRole must define superadmin");
      assert.ok(frontendCode.includes('tag: "Executive Leave Console"'), "Must include dedicated superadmin tag");
      assert.ok(frontendCode.includes('title: "Oversee enterprise-wide leave governance and audit trail"'), "Must include superadmin title");
    });
  });

  // =========================================================================
  // BUG-L06: UTC Midnight Timezone Shift in Leave Window Dates
  // =========================================================================
  describe("BUG-L06: Timezone-Safe Date Parsing and Asia/Kolkata Formatting", () => {
    it("LeaveApprovals.jsx formatDate implements regex calendar date parsing and Asia/Kolkata timezone", () => {
      const frontendCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/LeaveApprovals.jsx"), "utf8");
      assert.ok(
        frontendCode.includes('const match = value.match(/^(\\d{4})-(\\d{2})-(\\d{2})/);'),
        "formatDate must match calendar year, month, and day components"
      );
      assert.ok(
        frontendCode.includes('timeZone: "Asia/Kolkata"'),
        "formatDate and formatDateTime must enforce Asia/Kolkata timezone"
      );
    });
  });

  // =========================================================================
  // BUG-L07: Immediate Search API Spam and Missing Debounce
  // =========================================================================
  describe("BUG-L07: 300ms Debounced Search Input with Timer Cleanup", () => {
    it("LeaveApprovals.jsx implements debounced search with 300ms delay and page reset", () => {
      const frontendCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/LeaveApprovals.jsx"), "utf8");
      assert.ok(frontendCode.includes("debouncedSearch"), "Must maintain debouncedSearch state");
      assert.ok(
        frontendCode.includes("setTimeout(() => {"),
        "Must use setTimeout for search debounce"
      );
      assert.ok(frontendCode.includes("300"), "Must set debounce duration to 300ms");
      assert.ok(
        frontendCode.includes("clearTimeout(timer)"),
        "Must return cleanup function clearing debounce timer"
      );
      assert.ok(
        frontendCode.includes("setCurrentPage(1)"),
        "Must reset currentPage to 1 upon search query change"
      );
    });
  });

  // =========================================================================
  // BUG-L08: Action Button Instant State Transition without Confirmation
  // =========================================================================
  describe("BUG-L08: Rejection Confirmation Modal", () => {
    it("LeaveApprovals.jsx requires confirmation modal before rejecting leave", () => {
      const frontendCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/LeaveApprovals.jsx"), "utf8");
      assert.ok(frontendCode.includes("rejectModal"), "Must maintain rejectModal state");
      assert.ok(
        frontendCode.includes("openRejectModal(item)"),
        "Reject button must invoke openRejectModal instead of immediate handleAction"
      );
      assert.ok(
        frontendCode.includes("Confirm Leave Rejection"),
        "Confirmation dialog must display rejection prompt"
      );
      assert.ok(
        frontendCode.includes("closeRejectModal"),
        "Must provide cancel/close modal handler"
      );
    });
  });

  // =========================================================================
  // BUG-L09: Duplicate Fetch Operations in Action Submission
  // =========================================================================
  describe("BUG-L09: Single Fetch Execution in handleAction", () => {
    it("LeaveApprovals.jsx handleAction does not execute duplicate fetch in finally block", () => {
      const frontendCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/LeaveApprovals.jsx"), "utf8");
      const handleActionDef = frontendCode.substring(
        frontendCode.indexOf("const handleAction = async"),
        frontendCode.indexOf("const openRejectModal =")
      );
      assert.ok(
        handleActionDef.includes("await fetchApprovals(false);"),
        "Must call fetchApprovals once inside try upon success"
      );
      const finallyBlock = handleActionDef.substring(handleActionDef.indexOf("finally {"));
      assert.ok(
        !finallyBlock.includes("fetchApprovals"),
        "finally block must NOT contain redundant fetchApprovals call"
      );
    });
  });
});
