import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { accountsService } from "../../src/services/accounts.service.js";
import { attendanceService } from "../../src/services/attendance.service.js";
import accountsRepository from "../../src/repositories/accounts.repository.js";
import redisService from "../../src/services/redis.service.js";

describe("P1.3 — RBAC & Object-Level Authorization (IDOR) Security Suite", () => {
  after(async () => {
    if (redisService.client) {
      redisService.client.disconnect();
    }
    const { closePool } = await import("../../src/db/index.js");
    await closePool();
  });

  describe("Document Access Control & IDOR Prevention", () => {
    it("should BLOCK a manager from viewing documents of employees outside their team (VULN-05 fix)", async () => {
      // Mock actor: Manager 101
      const managerActor = { id: 101, role: "manager", username: "mgr_alpha" };
      const nonReporteeEmployeeId = 202;

      // Mock repository profile lookup: employee 202 reports to manager 999 (NOT 101)
      const originalFindProfile = accountsRepository.findProfileByUserId;
      accountsRepository.findProfileByUserId = async (userId) => {
        if (Number(userId) === 202) {
          return { user_id: 202, manager_id: 999 };
        }
        return null;
      };

      try {
        let errorThrown = null;
        try {
          await accountsService.getEmployeeDocuments(nonReporteeEmployeeId, managerActor);
        } catch (err) {
          errorThrown = err;
        }

        assert.ok(errorThrown, "Manager must be blocked from accessing non-reportee documents");
        assert.equal(errorThrown.statusCode, 403);
        assert.match(errorThrown.message, /You do not have permission to view documents for this employee/);
      } finally {
        accountsRepository.findProfileByUserId = originalFindProfile;
      }
    });

    it("should ALLOW a manager to view documents of their direct reportee", async () => {
      const managerActor = { id: 101, role: "manager", username: "mgr_alpha" };
      const directReportEmployeeId = 203;

      const originalFindProfile = accountsRepository.findProfileByUserId;
      const originalFindDocs = accountsRepository.findDocumentsByUserId;

      accountsRepository.findProfileByUserId = async (userId) => {
        if (Number(userId) === 203) {
          return { user_id: 203, manager_id: 101 }; // reports to 101
        }
        return null;
      };
      accountsRepository.findDocumentsByUserId = async (userId) => [
        { id: 1, title: "Aadhar Card", file: "cloudinary://doc_1", uploaded_at: new Date() }
      ];

      try {
        const docs = await accountsService.getEmployeeDocuments(directReportEmployeeId, managerActor);
        assert.ok(Array.isArray(docs));
        assert.equal(docs.length, 1);
        assert.equal(docs[0].title, "Aadhar Card");
      } finally {
        accountsRepository.findProfileByUserId = originalFindProfile;
        accountsRepository.findDocumentsByUserId = originalFindDocs;
      }
    });

    it("should BLOCK an employee from viewing another employee's documents", async () => {
      const employeeActor = { id: 501, role: "employee", username: "emp_alice" };
      const otherEmployeeId = 502;

      let errorThrown = null;
      try {
        await accountsService.getEmployeeDocuments(otherEmployeeId, employeeActor);
      } catch (err) {
        errorThrown = err;
      }

      assert.ok(errorThrown, "Employee must be blocked from viewing peer documents");
      assert.equal(errorThrown.statusCode, 403);
    });

    it("should ALLOW admin, hr, and superadmin to view employee documents", async () => {
      const adminActor = { id: 1, role: "admin", username: "admin_user" };
      const originalFindDocs = accountsRepository.findDocumentsByUserId;
      accountsRepository.findDocumentsByUserId = async () => [];

      try {
        const docs = await accountsService.getEmployeeDocuments(202, adminActor);
        assert.ok(Array.isArray(docs));
      } finally {
        accountsRepository.findDocumentsByUserId = originalFindDocs;
      }
    });
  });

  describe("Attendance Register IDOR Prevention", () => {
    it("should BLOCK a manager from inspecting attendance of employees outside their team", async () => {
      const managerId = 101;
      const nonReporteeEmployeeId = 303;

      const originalFindProfile = accountsRepository.findProfileByUserId;
      accountsRepository.findProfileByUserId = async (userId) => {
        if (Number(userId) === 303) {
          return { user_id: 303, manager_id: 888 }; // does not report to 101
        }
        return null;
      };

      try {
        let errorThrown = null;
        try {
          await attendanceService.teamAttendance(
            managerId,
            "2026-11",
            nonReporteeEmployeeId,
            null,
            null,
            "manager"
          );
        } catch (err) {
          errorThrown = err;
        }

        assert.ok(errorThrown, "Manager must be blocked from inspecting non-reportee attendance");
        assert.equal(errorThrown.statusCode, 403);
        assert.match(errorThrown.message, /You do not have permission to view attendance for this employee/);
      } finally {
        accountsRepository.findProfileByUserId = originalFindProfile;
      }
    });
  });

  describe("Self-Approval Workflow Security", () => {
    it("should BLOCK users from approving their own attendance or leave requests", async () => {
      const actor = { id: 401, role: "superadmin" };
      const selfApprovalItem = {
        id: 99,
        employee_id: 401, // same as actor
        approved_by_id: 401,
        status: "pending"
      };

      const originalFindApproval = (await import("../../src/repositories/attendance.repository.js")).default.findApprovalById;
      (await import("../../src/repositories/attendance.repository.js")).default.findApprovalById = async () => selfApprovalItem;

      try {
        let errorThrown = null;
        try {
          await attendanceService.approvalAction(99, "approved", "Self approving", actor);
        } catch (err) {
          errorThrown = err;
        }

        assert.ok(errorThrown, "Self approval must be rejected");
        assert.equal(errorThrown.statusCode, 403);
        assert.match(errorThrown.message, /You cannot approve your own exception request/);
      } finally {
        (await import("../../src/repositories/attendance.repository.js")).default.findApprovalById = originalFindApproval;
      }
    });
  });
});
