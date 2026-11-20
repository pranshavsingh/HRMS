import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { accountsService } from "../../src/services/accounts.service.js";
import accountsRepository from "../../src/repositories/accounts.repository.js";
import { db } from "../../src/db/index.js";

describe("Phase 1 Bug Fixes Verification", () => {
  it("BUG-04 & BUG-03: deleteEmployee should not exist on accountsService and DELETE endpoint returns 404", async () => {
    assert.strictEqual(typeof accountsService.deleteEmployee, "undefined");
    assert.strictEqual(typeof accountsRepository.softDeleteUser, "undefined");
    assert.strictEqual(typeof accountsRepository.softDeleteProfile, "undefined");

    // Test hitting the former delete endpoint via built-in fetch
    const { createApp } = await import("../../src/app.js");
    const app = createApp();
    const server = app.listen(0);
    const port = server.address().port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/auth/employees/999/`, {
        method: "DELETE",
      });
      assert.strictEqual(res.status, 404, "Former delete employee endpoint must return 404");
    } finally {
      server.close();
    }
  });

  it("BUG-10: Super Admin or any user cannot deactivate their own account (backend returns 400)", async () => {
    const actor = { id: 1, role: "superadmin" };
    await assert.rejects(
      async () => {
        await accountsService.updateEmployee(1, { is_active_employee: false }, actor, 1);
      },
      (err) => {
        assert.strictEqual(err.statusCode, 400);
        assert.match(err.message, /cannot deactivate your own account/i);
        return true;
      }
    );
  });

  it("BUG-01: Inactivating an employee synchronizes accounts_user, workforce_user_tenant, and accounts_employeeprofile", async () => {
    try {
      const adminActor = { id: 1, role: "superadmin" };
      // Find an existing test employee or create one to test
      const rows = await db.all("SELECT id, role FROM accounts_user WHERE role='employee' AND id != 1 LIMIT 1");
      if (rows.length > 0) {
        const targetId = rows[0].id;

        // Deactivate
        await accountsService.updateEmployee(targetId, { is_active_employee: false }, adminActor, 1);

        const userRow = await db.get("SELECT is_active FROM accounts_user WHERE id = ?", [targetId]);
        const tenantRow = await db.get("SELECT is_active FROM workforce_user_tenant WHERE user_id = ? AND tenant_id = 1", [targetId]);
        const profileRow = await db.get("SELECT is_active_employee FROM accounts_employeeprofile WHERE user_id = ?", [targetId]);

        assert.strictEqual(Number(userRow.is_active), 0, "accounts_user.is_active should be 0");
        assert.strictEqual(Number(tenantRow.is_active), 0, "workforce_user_tenant.is_active should be 0");
        assert.strictEqual(Number(profileRow.is_active_employee), 0, "accounts_employeeprofile.is_active_employee should be 0");

        // Verify they appear in inactive query
        const inactiveList = await accountsService.getEmployees({ status: "inactive" }, 1, adminActor);
        const foundInactive = inactiveList.data.some((e) => Number(e.id) === Number(targetId));
        assert.strictEqual(foundInactive, true, "Deactivated employee must be present in inactive list");

        // Reactivate
        await accountsService.updateEmployee(targetId, { is_active_employee: true }, adminActor, 1);

        const userRowActive = await db.get("SELECT is_active FROM accounts_user WHERE id = ?", [targetId]);
        const tenantRowActive = await db.get("SELECT is_active FROM workforce_user_tenant WHERE user_id = ? AND tenant_id = 1", [targetId]);
        const profileRowActive = await db.get("SELECT is_active_employee FROM accounts_employeeprofile WHERE user_id = ?", [targetId]);

        assert.strictEqual(Number(userRowActive.is_active), 1, "accounts_user.is_active should be 1 after reactivation");
        assert.strictEqual(Number(tenantRowActive.is_active), 1, "workforce_user_tenant.is_active should be 1 after reactivation");
        assert.strictEqual(Number(profileRowActive.is_active_employee), 1, "accounts_employeeprofile.is_active_employee should be 1 after reactivation");
      }
    } catch (err) {
      console.error("BUG-01 TEST ERROR:", err);
      throw err;
    }
  });

  it("BUG-06: Regular employees inherit manager's team name via COALESCE", async () => {
    // Find a manager with a team_name and their reportee
    const manager = await db.get("SELECT u.id, p.team_name FROM accounts_user u JOIN accounts_employeeprofile p ON p.user_id=u.id WHERE u.role='manager' AND p.team_name IS NOT NULL AND p.team_name != '' LIMIT 1");
    if (manager) {
      const team = manager.team_name;
      const res = await accountsService.getEmployees({ team }, 1, { id: 1, role: "superadmin" });
      assert.ok(res.data.length > 0, "Employees must be returned when filtering by team");
      res.data.forEach((emp) => {
        assert.strictEqual(emp.team_name, team, "Returned employee team_name should match manager's team");
      });
    }
  });

  it("BUG-11: Directory retrieval supports limit > 100 without being capped", async () => {
    const res = await accountsService.getEmployees({ limit: 500 }, 1, { id: 1, role: "superadmin" });
    assert.strictEqual(res.pagination.limit, 500, "Limit should not be capped at 100");
    assert.ok(res.metrics, "Metrics should be included in pagination response");
    assert.ok(typeof res.metrics.total === "number");
    assert.ok(typeof res.metrics.active === "number");
    assert.ok(typeof res.metrics.inactive === "number");
  });

  it("BUG-05: Overwriting already uploaded documents replaces document record and removes old file", async () => {
    const actor = { id: 1, role: "superadmin" };
    const empRow = await db.get("SELECT id FROM accounts_user WHERE role='employee' LIMIT 1");
    if (empRow) {
      const testUserId = empRow.id;
      const title = "Test Replacement Document";

      // Clean up any pre-existing doc for this title
      await db.run("DELETE FROM accounts_employeedocument WHERE user_id=? AND title=?", [testUserId, title]);

      // Insert first doc
      await accountsRepository.insertDocument(title, "documents/test_old.pdf", testUserId);
      const initialDoc = await db.get("SELECT id, file FROM accounts_employeedocument WHERE user_id=? AND title=?", [testUserId, title]);
      assert.ok(initialDoc);
      const initialId = initialDoc.id;

      // Track deletion calls
      const { default: storageService } = await import("../../src/services/storage.service.js");
      let deletedPath = null;
      const originalDelete = storageService.delete;
      const originalStore = storageService.store;
      storageService.delete = async (path) => {
        deletedPath = path;
      };
      storageService.store = async (file, folder, user) => {
        return "documents/test_new.pdf";
      };

      try {
        const mockFile = {
          buffer: Buffer.from("dummy pdf content"),
          mimetype: "application/pdf",
          originalname: "test_new.pdf"
        };

        await accountsService.uploadDocument({ user: testUserId, title }, mockFile, actor, 1);

        // Verify the record was updated in-place (same ID or updated row)
        const updatedDoc = await db.get("SELECT id, file FROM accounts_employeedocument WHERE id=?", [initialId]);
        assert.strictEqual(updatedDoc.file, "documents/test_new.pdf", "File path must be updated in DB");
        assert.strictEqual(deletedPath, "documents/test_old.pdf", "Old file must be deleted from storage");
      } finally {
        storageService.delete = originalDelete;
        storageService.store = originalStore;
        await db.run("DELETE FROM accounts_employeedocument WHERE user_id=? AND title=?", [testUserId, title]);
      }
    }
  });
});
