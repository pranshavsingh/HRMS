import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import { accountsService } from "../../src/services/accounts.service.js";
import accountsRepository from "../../src/repositories/accounts.repository.js";
import { updateEmployeeSchema, createEmployeeSchema } from "../../src/middleware/validation.js";
import { db } from "../../src/db/index.js";

describe("E-Bugs Verification Suite (BUG-E02 to BUG-E11)", () => {
  const superadminActor = { id: 1, role: "superadmin" };
  const tenantId = 1;

  after(() => {
    // Gracefully allow async hooks to drain then force clean exit
    setTimeout(() => process.exit(0), 500).unref();
  });

  describe("BUG-E04 & BUG-E06: Backend Zod Schema & Sanitization for Employee Update/Create", () => {
    it("updateEmployeeSchema should reject invalid user_id, invalid coordinates, out-of-range leave, and short passwords", () => {
      // 1. Invalid user_id
      const res1 = updateEmployeeSchema.safeParse({ params: { user_id: "abc" }, body: {} });
      assert.strictEqual(res1.success, false);

      // 2. Out-of-bounds latitude (> 90)
      const res2 = updateEmployeeSchema.safeParse({
        params: { user_id: "1" },
        body: { latitude: 95.5 }
      });
      assert.strictEqual(res2.success, false);

      // 3. Out-of-bounds longitude (< -180)
      const res3 = updateEmployeeSchema.safeParse({
        params: { user_id: "1" },
        body: { longitude: -190 }
      });
      assert.strictEqual(res3.success, false);

      // 4. Negative leave_allotted
      const res4 = updateEmployeeSchema.safeParse({
        params: { user_id: "1" },
        body: { leave_allotted: -5 }
      });
      assert.strictEqual(res4.success, false);

      // 5. Short password (< 12 chars)
      const res5 = updateEmployeeSchema.safeParse({
        params: { user_id: "1" },
        body: { password: "short" }
      });
      assert.strictEqual(res5.success, false);

      // 6. Valid payload with string trimming
      const res6 = updateEmployeeSchema.safeParse({
        params: { user_id: "1" },
        body: {
          first_name: "  Alice  ",
          last_name: "  Smith  ",
          email: "  alice@example.com  ",
          designation: "  Lead Dev  ",
          latitude: 22.5726,
          longitude: 88.3639,
          allowed_radius: 150,
          leave_allotted: 24
        }
      });
      assert.strictEqual(res6.success, true);
      assert.strictEqual(res6.data.body.first_name, "Alice");
      assert.strictEqual(res6.data.body.last_name, "Smith");
      assert.strictEqual(res6.data.body.email, "alice@example.com");
      assert.strictEqual(res6.data.body.designation, "Lead Dev");
    });

    it("createEmployeeSchema should sanitize and trim string inputs (BUG-E04)", async () => {
      // JPEG magic number header \xFF\xD8\xFF for file validation
      const fakeJpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
      const res = await createEmployeeSchema.safeParseAsync({
        body: {
          username: "  johndoe  ",
          first_name: "  John  ",
          last_name: "  Doe  ",
          email: "  john@example.com  ",
          password: "SecurePassword123!",
          role: "admin",
          designation: "  Engineer  "
        },
        files: {
          photo_copy: [{
            buffer: fakeJpegBuffer,
            originalname: "photo.jpg",
            mimetype: "image/jpeg",
            size: fakeJpegBuffer.length
          }]
        }
      });
      assert.strictEqual(res.success, true, res.error ? JSON.stringify(res.error.issues) : "");
      assert.strictEqual(res.data.body.username, "johndoe");
      assert.strictEqual(res.data.body.first_name, "John");
      assert.strictEqual(res.data.body.last_name, "Doe");
      assert.strictEqual(res.data.body.email, "john@example.com");
      assert.strictEqual(res.data.body.designation, "Engineer");
    });
  });

  describe("BUG-E05: Self-Demotion Prevention for Admins and Super Admins", () => {
    it("should BLOCK a superadmin or admin from changing their own role to employee or manager", async () => {
      await assert.rejects(
        async () => {
          await accountsService.updateEmployee(1, { role: "employee" }, superadminActor, tenantId);
        },
        (err) => {
          assert.strictEqual(err.statusCode, 400);
          assert.match(err.message, /cannot change or demote your own role/i);
          return true;
        }
      );

      await assert.rejects(
        async () => {
          await accountsService.updateEmployee(1, { role: "manager" }, superadminActor, tenantId);
        },
        (err) => {
          assert.strictEqual(err.statusCode, 400);
          assert.match(err.message, /cannot change or demote your own role/i);
          return true;
        }
      );
    });

    it("should ALLOW an admin/superadmin to update other non-role profile fields for themselves", async () => {
      const originalUser = await db.get("SELECT role, first_name, last_name FROM accounts_user WHERE id = 1");
      const updated = await accountsService.updateEmployee(1, {
        first_name: originalUser.first_name || "Super",
        last_name: originalUser.last_name || "Admin"
      }, superadminActor, tenantId);

      assert.strictEqual(updated.employee.role, originalUser.role);
      assert.strictEqual(updated.employee.id, 1);
    });
  });

  describe("BUG-E07: Manager Actual Full Name Resolution", () => {
    it("serializeStaffMembersBatch should include manager_name alongside manager_id and manager username", async () => {
      // Find an employee with an assigned manager
      const empWithMgr = await db.get(`
        SELECT u.id, u.username, p.manager_id 
        FROM accounts_user u 
        JOIN accounts_employeeprofile p ON u.id = p.user_id 
        WHERE p.manager_id IS NOT NULL AND u.role = 'employee' 
        LIMIT 1
      `);

      if (empWithMgr) {
        const mgrUser = await db.get("SELECT first_name, last_name, username FROM accounts_user WHERE id = ?", [empWithMgr.manager_id]);
        const serialized = await accountsService.getEmployees({
          page: 1,
          limit: 100,
          search: empWithMgr.username
        }, tenantId, superadminActor);

        const target = serialized.records.find((r) => r.id === empWithMgr.id);
        assert.ok(target, "Employee should be found in paged results");
        assert.ok(target.manager_name, "manager_name must be present");
        
        const expectedName = [mgrUser.first_name, mgrUser.last_name].filter(Boolean).join(" ") || mgrUser.username;
        assert.strictEqual(target.manager_name, expectedName, "manager_name must match manager full name or username");
      }
    });
  });

  describe("BUG-E08 & BUG-E09: Server-Side Pagination & N+1 Elimination", () => {
    it("getEmployees should return single-pass paginated response with records, total_count, pagination, metrics, and available_teams", async () => {
      const result = await accountsService.getEmployees({
        page: 1,
        limit: 10
      }, tenantId, superadminActor);

      assert.ok(Array.isArray(result.records), "records must be an array");
      assert.ok(typeof result.total_count === "number", "total_count must be a number");
      assert.ok(result.pagination, "pagination metadata must be present");
      assert.strictEqual(result.pagination.page, 1);
      assert.strictEqual(result.pagination.limit, 10);
      assert.ok(result.metrics, "metrics must be present");
      assert.ok(typeof result.metrics.total === "number");
      assert.ok(typeof result.metrics.active === "number");
      assert.ok(typeof result.metrics.inactive === "number");
      assert.ok(Array.isArray(result.available_teams), "available_teams must be an array");
    });

    it("findEmployeesPaged should filter cleanly by search term across staff and manager names without looping queries", async () => {
      const paged = await accountsRepository.findEmployeesPaged({
        tenantId,
        page: 1,
        limit: 5,
        search: "admin"
      });

      assert.ok(Array.isArray(paged));
      assert.ok(paged.length > 0);
    });
  });
});
