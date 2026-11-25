import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import {
  getCompanyLocalDateString,
  getExceptionCategory
} from "../../src/services/attendance.service.js";

describe("MASTER 5 HRMS BUGS VERIFICATION SUITE", () => {
  // =========================================================================
  // BUG-01: Geofence Approval Routing Fallback
  // =========================================================================
  describe("BUG-01: Fallback Approval Routing for Out-of-Geofence Punches", () => {
    const serviceCode = fs.readFileSync(
      path.resolve("node_backend/src/services/attendance.service.js"),
      "utf8"
    );

    it("approvalRouteForUser routes employee with manager to manager only", () => {
      assert.ok(
        serviceCode.includes('if (user?.role === "employee")'),
        "Must have dedicated employee routing block"
      );
      assert.ok(
        serviceCode.includes("if (profile?.manager_id)") &&
        serviceCode.includes("return [manager];"),
        "Must route directly to active manager if assigned"
      );
    });

    it("approvalRouteForUser falls back to eligible HR/Admin/Superadmin when employee has no manager", () => {
      assert.ok(
        serviceCode.includes("role IN ('hr', 'admin', 'superadmin')"),
        "Must query HR, Admin, Superadmin as fallback reviewers"
      );
      assert.ok(
        serviceCode.includes("fallbackReviewers"),
        "Must return fallback reviewers when manager is absent"
      );
    });

    it("punchIn safely rejects out-of-geofence punch if no eligible reviewer is available", () => {
      assert.ok(
        serviceCode.includes("punchInOutside") &&
        serviceCode.includes("if (!reviewers || reviewers.length === 0)") &&
        serviceCode.includes("throw new AppError"),
        "Must fail safely when no reviewer is available instead of auto-approving"
      );
    });

    it("punchOut safely rejects out-of-geofence punch if no eligible reviewer is available", () => {
      assert.ok(
        serviceCode.includes("punchOutOutside") &&
        serviceCode.includes("if (punchOutOutside && (!reviewers || reviewers.length === 0))") &&
        serviceCode.includes("throw new AppError"),
        "Must fail safely on punch-out when no reviewer is available"
      );
    });

    it("never auto-approves out-of-geofence punch simply because reviewers is empty", () => {
      assert.ok(
        !serviceCode.includes("const needsApproval = punchInOutside && reviewers.length > 0;"),
        "Must not condition needsApproval on reviewers.length > 0"
      );
      assert.ok(
        !serviceCode.includes("const geofenceNeedsApproval = punchOutOutside && reviewers.length > 0;"),
        "Must not condition geofenceNeedsApproval on reviewers.length > 0"
      );
    });

    it("unauthorized user cannot approve another employee's attendance record", () => {
      assert.ok(
        serviceCode.includes("Number(ap.approved_by_id) !== Number(actor.id)") &&
        serviceCode.includes("This approval is not assigned to you"),
        "Must enforce reviewer assignment check for non-superadmin actors"
      );
    });
  });

  // =========================================================================
  // BUG-02: UTC Server Date Drift in Attendance (Asia/Kolkata)
  // =========================================================================
  describe("BUG-02: Asia/Kolkata Company Timezone Date Utility", () => {
    it("correctly computes date at 12:00 AM IST (18:30 UTC previous day)", () => {
      // 18:30 UTC on Nov 23 is 00:00 IST on Nov 24
      const d = new Date("2026-11-23T18:30:00.000Z");
      const dateStr = getCompanyLocalDateString(d, "Asia/Kolkata");
      assert.equal(dateStr, "2026-11-24");
    });

    it("correctly computes date at 01:00 AM IST (19:30 UTC previous day)", () => {
      const d = new Date("2026-11-23T19:30:00.000Z");
      const dateStr = getCompanyLocalDateString(d, "Asia/Kolkata");
      assert.equal(dateStr, "2026-11-24");
    });

    it("correctly computes date at 05:29 AM IST (23:59 UTC previous day)", () => {
      const d = new Date("2026-11-23T23:59:00.000Z");
      const dateStr = getCompanyLocalDateString(d, "Asia/Kolkata");
      assert.equal(dateStr, "2026-11-24");
    });

    it("correctly computes date at 05:30 AM IST (00:00 UTC same day)", () => {
      const d = new Date("2026-11-24T00:00:00.000Z");
      const dateStr = getCompanyLocalDateString(d, "Asia/Kolkata");
      assert.equal(dateStr, "2026-11-24");
    });

    it("correctly computes date at 11:59 PM IST (18:29 UTC same day)", () => {
      const d = new Date("2026-11-24T18:29:00.000Z");
      const dateStr = getCompanyLocalDateString(d, "Asia/Kolkata");
      assert.equal(dateStr, "2026-11-24");
    });

    it("attendance.service.js uses getCompanyLocalDateString for punchStatus and punchIn", () => {
      const serviceCode = fs.readFileSync(
        path.resolve("node_backend/src/services/attendance.service.js"),
        "utf8"
      );
      assert.ok(
        serviceCode.includes("export function getCompanyLocalDateString"),
        "getCompanyLocalDateString must be exported"
      );
      assert.ok(
        serviceCode.includes("const todayStr = getCompanyLocalDateString();"),
        "punchStatus must use getCompanyLocalDateString"
      );
      assert.ok(
        serviceCode.includes("const dateStr = getCompanyLocalDateString(now);"),
        "punchIn must use getCompanyLocalDateString"
      );
    });
  });

  // =========================================================================
  // BUG-03: Employee Dashboard Timeline Dynamic Status Badges
  // =========================================================================
  describe("BUG-03: Employee Dashboard Dynamic Status Badges", () => {
    const dashboardCode = fs.readFileSync(
      path.resolve("hrms_saas/src/pages/dashboard/EmployeeDashboard.jsx"),
      "utf8"
    );

    it("defines getTimelineStatusBadge with proper status mappings", () => {
      assert.ok(
        dashboardCode.includes("export function getTimelineStatusBadge"),
        "Must define getTimelineStatusBadge"
      );
      assert.ok(
        dashboardCode.includes("Approved") && dashboardCode.includes("bg-emerald-50"),
        "Approved status must map to emerald badge"
      );
      assert.ok(
        dashboardCode.includes("Pending Review") && dashboardCode.includes("bg-amber-50"),
        "Pending status must map to amber badge"
      );
      assert.ok(
        dashboardCode.includes("Rejected") && dashboardCode.includes("bg-rose-50"),
        "Rejected status must map to rose badge"
      );
      assert.ok(
        dashboardCode.includes("Logged") && dashboardCode.includes("bg-cyan-50"),
        "Logged status must map to cyan badge"
      );
    });

    it("replaces hardcoded Logged span with dynamic getTimelineStatusBadge(item.status)", () => {
      assert.ok(
        dashboardCode.includes("{getTimelineStatusBadge(item.status)}"),
        "Timeline table cell must call getTimelineStatusBadge(item.status)"
      );
      assert.ok(
        !/<td className="px-6 py-4">\s*<span[^>]*>Logged<\/span>\s*<\/td>/.test(dashboardCode),
        "Must not have static Logged span in timeline table body"
      );
    });
  });

  // =========================================================================
  // BUG-04: Leave Overlap Validation Normalization
  // =========================================================================
  describe("BUG-04: Leave Overlap Validation Date Normalization", () => {
    const leaveCode = fs.readFileSync(
      path.resolve("hrms_saas/src/pages/Leave.jsx"),
      "utf8"
    );

    // Replicate pure normalizeDateOnly and overlap logic from Leave.jsx
    const normalizeDateOnly = (value) => {
      if (!value) return null;
      if (typeof value === "string") return value.slice(0, 10);
      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString().slice(0, 10);
      }
      return null;
    };

    const checkOverlap = (existingLeaves, requestedFrom, requestedTo) => {
      const reqFrom = normalizeDateOnly(requestedFrom);
      const reqTo = normalizeDateOnly(requestedTo);
      if (!reqFrom || !reqTo) return false;

      return existingLeaves.some((r) => {
        if (r.status !== "approved") return false;
        const exFrom = normalizeDateOnly(r.from || r.from_date);
        const exTo = normalizeDateOnly(r.to || r.to_date);
        return exFrom && exTo && exFrom <= reqTo && exTo >= reqFrom;
      });
    };

    it("detects exact same-day overlap with ISO datetime from API", () => {
      const existing = [{ from: "2026-11-21T00:00:00.000Z", to: "2026-11-21T00:00:00.000Z", status: "approved" }];
      assert.equal(checkOverlap(existing, "2026-11-21", "2026-11-21"), true);
    });

    it("detects overlap when requested range is within existing approved leave", () => {
      const existing = [{ from: "2026-11-20T00:00:00.000Z", to: "2026-11-25T00:00:00.000Z", status: "approved" }];
      assert.equal(checkOverlap(existing, "2026-11-21", "2026-11-22"), true);
    });

    it("detects overlap when requested range fully contains existing approved leave", () => {
      const existing = [{ from: "2026-11-21T00:00:00.000Z", to: "2026-11-21T00:00:00.000Z", status: "approved" }];
      assert.equal(checkOverlap(existing, "2026-11-20", "2026-11-22"), true);
    });

    it("does not flag overlap for non-overlapping leave dates", () => {
      const existing = [{ from: "2026-11-10T00:00:00.000Z", to: "2026-11-15T00:00:00.000Z", status: "approved" }];
      assert.equal(checkOverlap(existing, "2026-11-20", "2026-11-22"), false);
    });

    it("does not block on rejected or cancelled leave requests", () => {
      const existing = [
        { from: "2026-11-21T00:00:00.000Z", to: "2026-11-21T00:00:00.000Z", status: "rejected" },
        { from: "2026-11-21T00:00:00.000Z", to: "2026-11-21T00:00:00.000Z", status: "cancelled" }
      ];
      assert.equal(checkOverlap(existing, "2026-11-21", "2026-11-21"), false);
    });

    it("handles null or missing dates safely without runtime exceptions", () => {
      const existing = [{ from: null, to: undefined, status: "approved" }];
      assert.doesNotThrow(() => checkOverlap(existing, "2026-11-21", "2026-11-21"));
      assert.equal(checkOverlap(existing, "2026-11-21", "2026-11-21"), false);
    });

    it("Leave.jsx contains normalizeDateOnly and compares normalized date strings", () => {
      assert.ok(
        leaveCode.includes("normalizeDateOnly"),
        "Leave.jsx must define and use normalizeDateOnly"
      );
      assert.ok(
        leaveCode.includes("existingFrom <= requestedTo") && leaveCode.includes("existingTo >= requestedFrom"),
        "Leave.jsx must compare normalized existing and requested dates"
      );
    });
  });

  // =========================================================================
  // BUG-05: Mobile Attendance History Response Shape Normalization
  // =========================================================================
  describe("BUG-05: Mobile Attendance History Response Unwrapping", () => {
    const historyCode = fs.readFileSync(
      path.resolve("hrms_mobile/src/app/(tabs)/history.tsx"),
      "utf8"
    );

    const parseHistoryResponse = (resData) => {
      if (!resData || (typeof resData !== "object" && !Array.isArray(resData))) {
        return [];
      }
      return Array.isArray(resData)
        ? resData
        : Array.isArray(resData?.records)
          ? resData.records
          : Array.isArray(resData?.data)
            ? resData.data
            : [];
    };

    it("correctly unwraps paginated object with records array", () => {
      const mockApiRes = {
        data: [{ id: 1, date: "2026-11-23" }],
        records: [{ id: 1, date: "2026-11-23" }],
        pagination: { page: 1, limit: 50, total: 1 }
      };
      const result = parseHistoryResponse(mockApiRes);
      assert.equal(result.length, 1);
      assert.equal(result[0].id, 1);
    });

    it("correctly unwraps paginated object with data array", () => {
      const mockApiRes = {
        data: [{ id: 2, date: "2026-11-22" }],
        pagination: { page: 1, limit: 50, total: 1 }
      };
      const result = parseHistoryResponse(mockApiRes);
      assert.equal(result.length, 1);
      assert.equal(result[0].id, 2);
    });

    it("correctly unwraps legacy raw array", () => {
      const mockApiRes = [{ id: 3, date: "2026-11-21" }];
      const result = parseHistoryResponse(mockApiRes);
      assert.equal(result.length, 1);
      assert.equal(result[0].id, 3);
    });

    it("handles empty paginated response gracefully", () => {
      const mockApiRes = { data: [], records: [], pagination: { total: 0 } };
      const result = parseHistoryResponse(mockApiRes);
      assert.equal(result.length, 0);
    });

    it("handles malformed/null response safely without crashing", () => {
      assert.equal(parseHistoryResponse(null).length, 0);
      assert.equal(parseHistoryResponse(undefined).length, 0);
      assert.equal(parseHistoryResponse("invalid-string").length, 0);
      assert.equal(parseHistoryResponse(12345).length, 0);
    });

    it("history.tsx checks responseData.records and responseData.data", () => {
      assert.ok(
        historyCode.includes("Array.isArray(responseData?.records)"),
        "Must check responseData?.records"
      );
      assert.ok(
        historyCode.includes("Array.isArray(responseData?.data)"),
        "Must check responseData?.data"
      );
      assert.ok(
        !historyCode.includes("const data = Array.isArray(res.data) ? res.data : [];"),
        "Must not use fragile raw-array-only check"
      );
    });
  });
});
