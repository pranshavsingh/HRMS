import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { attendanceService, getExceptionCategory } from "../../src/services/attendance.service.js";
import { attendanceApprovalActionSchema } from "../../src/middleware/validation.js";

describe("HRMS Attendance Approvals Bug Fixes Suite (BUG-01 to BUG-09)", () => {
  const superadminActor = { id: 1, role: "superadmin" };
  const adminActor = { id: 2, role: "admin" };
  const tenantId = 1;

  after(() => {
    setTimeout(() => process.exit(0), 500).unref();
  });

  // =========================================================================
  // BUG-01: Data Truncation Capped at 50 Records
  // =========================================================================
  describe("BUG-01: Server-side Pagination & Removal of 50-Record Cap", () => {
    it("approvals() should support dynamic pagination (page, limit) and return pagination envelope", async () => {
      const res = await attendanceService.approvals(superadminActor.id, superadminActor.role, { page: 1, limit: 5 }, tenantId);
      assert.ok(res.pagination, "Response must include pagination envelope");
      assert.equal(res.pagination.page, 1);
      assert.equal(res.pagination.limit, 5);
      assert.ok(typeof res.pagination.total === "number", "Total must be numeric");
      assert.ok(Array.isArray(res.data), "data must be an array");
      assert.ok(res.data.length <= 5, "Result length must respect the limit parameter");
    });

    it("approvals() should support server-side search filtering", async () => {
      const res = await attendanceService.approvals(superadminActor.id, superadminActor.role, { search: "nonexistent_employee_xyz_123" }, tenantId);
      assert.equal(res.data.length, 0, "Non-matching search should yield 0 records");
    });

    it("Frontend AttendanceApprovals.jsx consumes server-side pagination with dynamic page and limit", () => {
      const frontendCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/AttendanceApprovals.jsx"), "utf8");
      assert.ok(frontendCode.includes("page: currentPage"), "Must send page: currentPage to backend");
      assert.ok(frontendCode.includes("limit: pageSize"), "Must send limit: pageSize to backend");
      assert.ok(!frontendCode.includes("usePagination(filteredRecords)"), "Must not rely on client-side slicing of 50 items");
    });
  });

  // =========================================================================
  // BUG-02: Policy Exception Clobbering (Early Departure / Overtime)
  // =========================================================================
  describe("BUG-02: Independent Policy Exceptions vs Location Punch", () => {
    it("getExceptionCategory should accurately distinguish policy exceptions from location punches", () => {
      assert.equal(getExceptionCategory("Early departure by 30 minutes", "out"), "early_departure");
      assert.equal(getExceptionCategory("early_departure policy review", "out"), "early_departure");
      assert.equal(getExceptionCategory("Overtime of 45 minutes", "out"), "overtime");
      assert.equal(getExceptionCategory(null, "out"), "location_out");
      assert.equal(getExceptionCategory("", "in"), "location_in");
    });

    it("attendance.service.js uses composite key including exception category to prevent clobbering", () => {
      const serviceCode = fs.readFileSync(path.resolve("node_backend/src/services/attendance.service.js"), "utf8");
      assert.ok(
        serviceCode.includes("`${record.attendance_id}-${record.review_type}-${record.exception_category}`"),
        "Deduplication key must include exception_category"
      );
    });

    it("attendance.repository.js updatePendingApprovalsForAttendanceExcept supports exceptionCategory isolation", () => {
      const repoCode = fs.readFileSync(path.resolve("node_backend/src/repositories/attendance.repository.js"), "utf8");
      assert.ok(repoCode.includes("exceptionCategory = null"), "Repository must accept exceptionCategory parameter");
      assert.ok(repoCode.includes("comment LIKE '%early departure%'"), "Repository must support early departure category filtering");
      assert.ok(repoCode.includes("comment LIKE '%overtime%'"), "Repository must support overtime category filtering");
    });
  });

  // =========================================================================
  // BUG-03: Missing Route Guards
  // =========================================================================
  describe("BUG-03: Route Guards in App.jsx", () => {
    it("App.jsx must restrict attendance approvals routes to authorized roles", () => {
      const appCode = fs.readFileSync(path.resolve("hrms_saas/src/App.jsx"), "utf8");
      assert.ok(
        /<ProtectedRoute allowedRoles=\{.+?manager.+?hr.+?admin.+?superadmin.+?\}>\s*<AttendanceApprovals \/>/.test(appCode),
        "attendance-approvals route must have allowedRoles"
      );
      assert.ok(
        /path="\/team-attendance-approvals"[\s\S]+?<ProtectedRoute allowedRoles=\{.+?manager.+?hr.+?admin.+?superadmin.+?\}>/.test(appCode),
        "team-attendance-approvals route must have allowedRoles"
      );
    });
  });

  // =========================================================================
  // BUG-04: Missing Punch Selfie & Geolocation Visual Proof
  // =========================================================================
  describe("BUG-04: Punch Selfie Preview & Geolocation Visual Proof", () => {
    it("approvals() returns photo URLs and coordinates in payload records", async () => {
      const res = await attendanceService.approvals(superadminActor.id, superadminActor.role, { limit: 10 }, tenantId);
      if (res.data.length > 0) {
        const item = res.data[0];
        assert.ok("punch_in_photo" in item, "Item must have punch_in_photo field");
        assert.ok("punch_out_photo" in item, "Item must have punch_out_photo field");
        assert.ok("latitude" in item, "Item must have latitude field");
        assert.ok("longitude" in item, "Item must have longitude field");
      }
    });

    it("AttendanceApprovals.jsx renders selfie preview modal and Google Maps coordinates link", () => {
      const frontendCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/AttendanceApprovals.jsx"), "utf8");
      assert.ok(frontendCode.includes("google.com/maps?q="), "Must render Google Maps link with coordinates");
      assert.ok(frontendCode.includes("previewPhoto"), "Must include photo preview modal state");
      assert.ok(frontendCode.includes("currentPhoto"), "Must render punch photo preview thumbnail");
    });
  });

  // =========================================================================
  // BUG-05: Rejection Destroys Photo & Confirmation Modal
  // =========================================================================
  describe("BUG-05: Rejection Does Not Delete Photo & Requires Confirmation", () => {
    it("attendance.service.js must not call storageService.delete during approval rejection", () => {
      const serviceCode = fs.readFileSync(path.resolve("node_backend/src/services/attendance.service.js"), "utf8");
      // Find the rejection block in approvalAction
      const actionMethod = serviceCode.slice(serviceCode.indexOf("async approvalAction("));
      assert.ok(
        !actionMethod.includes("storageService.delete(att.punch_out_photo)"),
        "Must NOT delete punch out photo from storage on rejection"
      );
    });

    it("AttendanceApprovals.jsx includes a Rejection Confirmation Modal with cancel and confirm actions", () => {
      const frontendCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/AttendanceApprovals.jsx"), "utf8");
      assert.ok(frontendCode.includes("rejectModal"), "Must have rejectModal state");
      assert.ok(frontendCode.includes("openRejectModal"), "Must have openRejectModal handler");
      assert.ok(frontendCode.includes("Confirm Rejection"), "Must have Confirm Rejection button");
    });
  });

  // =========================================================================
  // BUG-06: Missing Backend Payload Validation for Approval Action
  // =========================================================================
  describe("BUG-06: Strict Route Parameter & Payload Validation", () => {
    it("attendanceApprovalActionSchema should accept valid status and numeric approval_id", () => {
      const valid = attendanceApprovalActionSchema.safeParse({
        params: { approval_id: "123" },
        body: { status: "approved", comment: "Looks good" }
      });
      assert.ok(valid.success, "Should succeed for valid params and body");
    });

    it("attendanceApprovalActionSchema should reject invalid status", () => {
      const invalidStatus = attendanceApprovalActionSchema.safeParse({
        params: { approval_id: "123" },
        body: { status: "cancelled" }
      });
      assert.ok(!invalidStatus.success, "Should fail when status is not approved or rejected");
    });

    it("attendanceApprovalActionSchema should reject non-numeric approval_id", () => {
      const invalidId = attendanceApprovalActionSchema.safeParse({
        params: { approval_id: "abc-xyz" },
        body: { status: "approved" }
      });
      assert.ok(!invalidId.success, "Should fail for non-numeric approval_id");
    });

    it("attendance.routes.js applies validation middleware to /approvals/:approval_id/", () => {
      const routesCode = fs.readFileSync(path.resolve("node_backend/src/routes/attendance.routes.js"), "utf8");
      assert.ok(
        routesCode.includes("validate(attendanceApprovalActionSchema)"),
        "Route must apply validate(attendanceApprovalActionSchema)"
      );
    });
  });

  // =========================================================================
  // BUG-07: Insecure Role Resolution via LocalStorage
  // =========================================================================
  describe("BUG-07: Secure Role Resolution via useAuth Hook", () => {
    it("AttendanceApprovals.jsx uses useAuth hook for authenticated role", () => {
      const frontendCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/AttendanceApprovals.jsx"), "utf8");
      assert.ok(frontendCode.includes("useAuth"), "Must import and use useAuth");
      assert.ok(frontendCode.includes("const { role: authRole } = useAuth()"), "Must read role from useAuth context");
      assert.ok(!frontendCode.includes('const role = localStorage.getItem("role") || "hr";'), "Must not fallback insecurely to hr directly");
    });
  });

  // =========================================================================
  // BUG-08: Uncontrolled Search Filtering without Debounce
  // =========================================================================
  describe("BUG-08: Debounced Search Input", () => {
    it("AttendanceApprovals.jsx implements debounced search with timer cleanup", () => {
      const frontendCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/AttendanceApprovals.jsx"), "utf8");
      assert.ok(frontendCode.includes("debouncedSearch"), "Must maintain debouncedSearch state");
      assert.ok(frontendCode.includes("setTimeout"), "Must use setTimeout for debouncing");
      assert.ok(frontendCode.includes("clearTimeout"), "Must clean up timer in useEffect return");
    });
  });

  // =========================================================================
  // BUG-09: Timezone Date Shift in formatDate Utility
  // =========================================================================
  describe("BUG-09: Timezone Date Shift Prevention", () => {
    it("AttendanceApprovals.jsx uses calendar date parsing and Asia/Kolkata timezone", () => {
      const frontendCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/AttendanceApprovals.jsx"), "utf8");
      assert.ok(frontendCode.includes('timeZone: "Asia/Kolkata"'), "Must specify Asia/Kolkata timezone");
      assert.ok(frontendCode.includes("match(/^(\\d{4})-(\\d{2})-(\\d{2})/);"), "Must parse calendar YYYY-MM-DD components directly");
    });
  });
});
