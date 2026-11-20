import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { accountsService } from "../../src/services/accounts.service.js";
import accountsRepository from "../../src/repositories/accounts.repository.js";
import { db } from "../../src/db/index.js";

describe("Phase 2 Bug Fixes Verification (BUG-07, BUG-08, BUG-09)", () => {
  const adminActor = { id: 1, role: "superadmin" };
  const tenantId = 1;

  describe("BUG-07: Clearing Optional Employee Fields", () => {
    it("should save NULL when designation, manager, or team_name are explicitly cleared", async () => {
      // Find a test employee
      const emp = await db.get("SELECT id FROM accounts_user WHERE role='employee' AND id != 1 LIMIT 1");
      assert.ok(emp, "Test employee must exist");
      const employeeId = emp.id;

      // 1. Set initial non-null values
      await accountsService.updateEmployee(employeeId, {
        designation: "Senior Software Engineer",
        team_name: "Core Platform"
      }, adminActor, tenantId);

      let profile = await db.get("SELECT designation, team_name, manager_id FROM accounts_employeeprofile WHERE user_id = ?", [employeeId]);
      assert.strictEqual(profile.designation, "Senior Software Engineer");
      assert.strictEqual(profile.team_name, "Core Platform");

      // 2. Explicitly clear designation (send null)
      await accountsService.updateEmployee(employeeId, {
        designation: null
      }, adminActor, tenantId);

      profile = await db.get("SELECT designation, team_name, manager_id FROM accounts_employeeprofile WHERE user_id = ?", [employeeId]);
      assert.strictEqual(profile.designation, null, "Designation must be cleared to NULL in database");
      assert.strictEqual(profile.team_name, "Core Platform", "Omitted team_name must retain its previous value");

      // 3. Explicitly clear team_name (send "")
      await accountsService.updateEmployee(employeeId, {
        team_name: ""
      }, adminActor, tenantId);

      profile = await db.get("SELECT designation, team_name, manager_id FROM accounts_employeeprofile WHERE user_id = ?", [employeeId]);
      assert.strictEqual(profile.team_name, null, "Team name must be cleared to NULL in database when empty string is sent");

      // 4. Assign a manager and then explicitly clear manager (send null)
      const mgr = await db.get("SELECT id FROM accounts_user WHERE role='manager' AND id != ? LIMIT 1", [employeeId]);
      if (mgr) {
        await accountsService.updateEmployee(employeeId, {
          manager: mgr.id
        }, adminActor, tenantId);

        profile = await db.get("SELECT manager_id FROM accounts_employeeprofile WHERE user_id = ?", [employeeId]);
        assert.strictEqual(Number(profile.manager_id), Number(mgr.id));

        // Clear manager
        await accountsService.updateEmployee(employeeId, {
          manager: null
        }, adminActor, tenantId);

        profile = await db.get("SELECT manager_id FROM accounts_employeeprofile WHERE user_id = ?", [employeeId]);
        assert.strictEqual(profile.manager_id, null, "Manager must be cleared to NULL in database when null is sent");
      }

      // 5. Update an unrelated field (e.g. leave_allotted) without sending optional fields
      await accountsService.updateEmployee(employeeId, {
        leave_allotted: 25
      }, adminActor, tenantId);

      profile = await db.get("SELECT designation, team_name, manager_id, leave_allotted FROM accounts_employeeprofile WHERE user_id = ?", [employeeId]);
      assert.strictEqual(Number(profile.leave_allotted), 25);
      assert.strictEqual(profile.designation, null, "Designation should remain unchanged (null)");
      assert.strictEqual(profile.team_name, null, "Team name should remain unchanged (null)");
      assert.strictEqual(profile.manager_id, null, "Manager should remain unchanged (null)");
    });
  });

  describe("BUG-08: Stale Site Access on Manager Demotion & Work Site as Pure Tag", () => {
    it("should remove obsolete manager site access when a manager is demoted to employee", async () => {
      // Find or create a manager for testing
      const mgr = await db.get("SELECT id FROM accounts_user WHERE role='manager' AND id != 1 LIMIT 1");
      assert.ok(mgr, "Test manager must exist");
      const managerId = mgr.id;

      // Seed a site access record in workforce_site_access for this manager
      const site = await db.get("SELECT id FROM workforce_site WHERE tenant_id=1 LIMIT 1");
      const siteId = site ? site.id : 1;

      await db.run(
        "INSERT INTO workforce_site_access (tenant_id, user_id, site_id, created_by) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE id=id",
        [tenantId, managerId, siteId, 1]
      );

      let accessRecords = await db.all("SELECT id FROM workforce_site_access WHERE tenant_id=? AND user_id=?", [tenantId, managerId]);
      assert.ok(accessRecords.length > 0, "Manager should have site access record before demotion");

      // Demote manager to employee
      await accountsService.updateEmployee(managerId, {
        role: "employee"
      }, adminActor, tenantId);

      // Verify obsolete manager-specific site access records were completely removed
      accessRecords = await db.all("SELECT id FROM workforce_site_access WHERE tenant_id=? AND user_id=?", [tenantId, managerId]);
      assert.strictEqual(accessRecords.length, 0, "Demoted manager must have all workforce_site_access records removed");

      // Verify employee account and profile remain completely intact
      const user = await accountsRepository.findById(managerId);
      assert.strictEqual(user.role, "employee");
      assert.strictEqual(Number(user.is_active), 1);

      // Restore role back to manager
      await accountsService.updateEmployee(managerId, {
        role: "manager"
      }, adminActor, tenantId);
    });

    it("should NOT modify workforce_site_access permissions when changing Work Site tag alone", async () => {
      const emp = await db.get("SELECT id FROM accounts_user WHERE role='employee' AND id != 1 LIMIT 1");
      assert.ok(emp, "Test employee must exist");
      const employeeId = emp.id;

      // Ensure no site access exists for regular employee
      await db.run("DELETE FROM workforce_site_access WHERE tenant_id=? AND user_id=?", [tenantId, employeeId]);

      // Change only the Work Site tag
      const sites = await db.all("SELECT id FROM workforce_site WHERE tenant_id=1 LIMIT 2");
      if (sites.length >= 1) {
        const targetSiteId = sites[0].id;
        await accountsService.updateEmployee(employeeId, {
          site_id: targetSiteId
        }, adminActor, tenantId);

        // Verify workforce_site_access is NOT modified
        const access = await db.all("SELECT id FROM workforce_site_access WHERE tenant_id=? AND user_id=?", [tenantId, employeeId]);
        assert.strictEqual(access.length, 0, "Changing Work Site tag alone must NOT grant or modify workforce_site_access");
      }
    });
  });

  describe("BUG-09: Manager Selection Scoped Globally Without Work Site Dependency", () => {
    it("should retrieve all active managers regardless of site_id parameter in getManagers", async () => {
      // Query without site_id
      const allManagers = await accountsService.getManagers({}, tenantId, adminActor);
      assert.ok(allManagers.data.length > 0, "Active managers must be returned");

      // Query with site_id passed (e.g. from navbar or form)
      const managersWithSiteParam = await accountsService.getManagers({ site_id: 99999 }, tenantId, adminActor);
      // Because Work Site is strictly a tag and must NOT restrict manager selection,
      // getManagers strips site_id and returns all eligible managers!
      assert.strictEqual(managersWithSiteParam.data.length, allManagers.data.length, "getManagers must not filter managers by site_id");
    });

    it("should reject invalid manager IDs and self-reporting on updateEmployee", async () => {
      const emp = await db.get("SELECT id FROM accounts_user WHERE role='employee' AND id != 1 LIMIT 1");
      assert.ok(emp);
      const employeeId = emp.id;

      // 1. Cannot report to oneself
      await assert.rejects(
        async () => {
          await accountsService.updateEmployee(employeeId, { manager: employeeId }, adminActor, tenantId);
        },
        (err) => {
          assert.strictEqual(err.statusCode, 400);
          assert.match(err.message, /cannot be their own reporting manager/i);
          return true;
        }
      );

      // 2. Cannot report to non-existent or invalid manager ID
      await assert.rejects(
        async () => {
          await accountsService.updateEmployee(employeeId, { manager: 9999999 }, adminActor, tenantId);
        },
        (err) => {
          assert.strictEqual(err.statusCode, 400);
          assert.match(err.message, /Invalid reporting manager/i);
          return true;
        }
      );
    });
  });
});
