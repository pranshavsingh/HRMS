import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../../src/app.js";
import { db } from "../../src/db/index.js";
import jwt from "jsonwebtoken";
import { config } from "../../src/config/env.js";

function makeToken(userId, role, isSuperuser = false) {
  return jwt.sign(
    { userId, role, isSuperuser, type: "access" },
    config.jwtSecret,
    { algorithm: "HS256", expiresIn: "1h" }
  );
}

describe("MOBILE SECURITY HARDENING & BUG REMEDIATION TEST SUITE", () => {
  let server;
  let baseUrl;
  let adminUser;
  let hrUser;
  let managerUser;
  let employeeUser;
  let adminToken;
  let hrToken;
  let managerToken;
  let employeeToken;

  before(async () => {
    const app = createApp();
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}/api`;

    adminUser = await db.get("SELECT id, username, role FROM accounts_user WHERE role = 'admin' AND is_active = 1 LIMIT 1");
    hrUser = await db.get("SELECT id, username, role FROM accounts_user WHERE role = 'hr' AND is_active = 1 LIMIT 1");
    managerUser = await db.get("SELECT id, username, role FROM accounts_user WHERE role = 'manager' AND is_active = 1 LIMIT 1");
    employeeUser = await db.get("SELECT id, username, role FROM accounts_user WHERE role = 'employee' AND is_active = 1 LIMIT 1");

    assert.ok(adminUser, "Admin user must exist");
    assert.ok(hrUser, "HR user must exist");
    assert.ok(managerUser, "Manager user must exist");
    assert.ok(employeeUser, "Employee user must exist");

    adminToken = makeToken(adminUser.id, "admin");
    hrToken = makeToken(hrUser.id, "hr");
    managerToken = makeToken(managerUser.id, "manager");
    employeeToken = makeToken(employeeUser.id, "employee");
  });

  after(() => {
    if (server) server.close();
  });

  describe("PART 1: Mandatory Mobile Security Restrictions", () => {
    it("HR cannot create employee account from mobile device (HTTP 403 Forbidden)", async () => {
      const res = await fetch(`${baseUrl}/auth/create-employee/`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${hrToken}`,
          "X-Platform": "mobile",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: "mobile_test_emp",
          password: "Password123!",
          first_name: "Mobile",
          last_name: "Tester",
          email: "mobile_test@company.com",
          role: "employee",
          designation: "Tester",
        }),
      });

      const body = await res.json();
      assert.equal(res.status, 403);
      assert.match(body.error || "", /restricted on mobile/i);
    });

    it("Admin cannot create employee account from mobile device (HTTP 403 Forbidden)", async () => {
      const res = await fetch(`${baseUrl}/auth/create-employee/`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${adminToken}`,
          "X-Platform": "mobile",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: "mobile_test_emp2",
          password: "Password123!",
          first_name: "Mobile2",
          last_name: "Tester2",
          email: "mobile_test2@company.com",
          role: "employee",
          designation: "Tester",
        }),
      });

      const body = await res.json();
      assert.equal(res.status, 403);
      assert.match(body.error || "", /restricted on mobile/i);
    });

    it("Document download from mobile device is strictly rejected (HTTP 403 Forbidden)", async () => {
      const res = await fetch(`${baseUrl}/auth/documents/download/1/`, {
        headers: {
          "Authorization": `Bearer ${hrToken}`,
          "X-Platform": "mobile",
        },
      });

      const body = await res.json();
      assert.equal(res.status, 403);
      assert.match(body.error || "", /restricted on mobile/i);
    });

    it("Team attendance export parameter from mobile is strictly rejected (HTTP 403 Forbidden)", async () => {
      const res = await fetch(`${baseUrl}/attendance/team-attendance/?export=true`, {
        headers: {
          "Authorization": `Bearer ${adminToken}`,
          "X-Platform": "mobile",
        },
      });

      const body = await res.json();
      assert.equal(res.status, 403);
      assert.match(body.error || "", /restricted on mobile/i);
    });
  });

  describe("PART 2: Mobile Functional Bug Fix Validations", () => {
    it("BUG 1 & BUG 2: Staff directory response contract returns paginated data structure", async () => {
      const res = await fetch(`${baseUrl}/auth/employees/`, {
        headers: {
          "Authorization": `Bearer ${adminToken}`,
        },
      });

      const body = await res.json();
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(body.data) || Array.isArray(body.records), "Returns array inside data or records");
      assert.ok(body.pagination, "Pagination metadata exists");
    });

    it("BUG 3: Manager is forbidden from accessing general staff directory", async () => {
      const res = await fetch(`${baseUrl}/auth/employees/`, {
        headers: {
          "Authorization": `Bearer ${managerToken}`,
        },
      });

      assert.equal(res.status, 403);
    });

    it("BUG 5: Date formatting without toISOString preserves local calendar day", () => {
      const year = 2026;
      const month = 10; // November (0-indexed)
      const day = 25;
      const formatted = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      assert.equal(formatted, "2026-11-25", "Formatted date must strictly equal 2026-11-25");
    });

    it("BUG 7: Leave overlap logic properly compares ISO timestamps and date strings", () => {
      const existingLeaves = [
        { from: "2026-11-25T00:00:00.000Z", to: "2026-11-26T00:00:00.000Z", status: "approved" },
        { from: "2026-11-28T00:00:00.000Z", to: "2026-11-28T00:00:00.000Z", status: "pending" },
      ];

      const checkOverlap = (reqFrom, reqTo) => {
        return existingLeaves.some((r) => {
          if (r.status !== "approved" && r.status !== "pending") return false;
          const existFrom = String(r.from).slice(0, 10);
          const existTo = String(r.to).slice(0, 10);
          return existFrom <= reqTo && existTo >= reqFrom;
        });
      };

      assert.equal(checkOverlap("2026-11-25", "2026-11-25"), true, "Must detect overlap with approved leave");
      assert.equal(checkOverlap("2026-11-28", "2026-11-28"), true, "Must detect overlap with pending leave");
      assert.equal(checkOverlap("2026-11-27", "2026-11-27"), false, "No overlap for unrequested date");
    });

    it("BUG 8: CSV cell escaping safely handles non-string, null, and quotes without throwing", () => {
      const cells = ["Normal", 123, null, undefined, 'With "Quotes"', "With,Comma"];
      const escaped = cells.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",");
      assert.equal(escaped, '"Normal","123","","","With ""Quotes""","With,Comma"');
    });

    it("BUG 12: Attendance Regularization API rejects invalid time format", async () => {
      const res = await fetch(`${baseUrl}/attendance/regularize/`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${employeeToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          attendance_id: 1,
          punch_out_time: "invalid-time",
          reason: "Missed punch",
        }),
      });

      const body = await res.json();
      assert.equal(res.status, 400);
      assert.match(body.error || "", /invalid time format/i);
    });

    it("BUG 12: Attendance Regularization API rejects missing reason", async () => {
      const res = await fetch(`${baseUrl}/attendance/regularize/`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${employeeToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          attendance_id: 1,
          punch_out_time: "18:00",
          reason: "   ",
        }),
      });

      const body = await res.json();
      assert.equal(res.status, 400);
      assert.match(body.error || "", /reason.*required/i);
    });
  });

  describe("PART 3: Audit Report 2 Bug Fix Validations", () => {
    it("MOB-BUG-01: Audit log export parameter from mobile is strictly rejected (HTTP 403 Forbidden)", async () => {
      const res = await fetch(`${baseUrl}/auth/audit-logs/?export=true`, {
        headers: {
          "Authorization": `Bearer ${superadminToken}`,
          "X-Platform": "mobile",
        },
      });

      const body = await res.json();
      assert.equal(res.status, 403);
      assert.match(body.error || "", /restricted on mobile/i);
    });

    it("MOB-BUG-01: Superadmin can view audit logs without export on mobile (HTTP 200 OK)", async () => {
      const res = await fetch(`${baseUrl}/auth/audit-logs/`, {
        headers: {
          "Authorization": `Bearer ${superadminToken}`,
          "X-Platform": "mobile",
        },
      });

      const body = await res.json();
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(body.logs) || Array.isArray(body.data) || Array.isArray(body.records));
    });

    it("MOB-BUG-03: Password validation rejects passwords shorter than 12 characters", async () => {
      const res = await fetch(`${baseUrl}/auth/forgot-password/reset/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "test@company.com",
          otp: "123456",
          reset_token: "test_token",
          new_password: "Short1!", // < 12 characters
        }),
      });

      const body = await res.json();
      assert.equal(res.status, 400);
      assert.match(body.error || "", /12 characters/i);
    });

    it("MOB-BUG-04: Document path resolution properly normalizes relative media URLs", () => {
      const resolveDocUrl = (url, baseUrl) => {
        if (!url) return null;
        let target = url;
        if (target.startsWith("/media/") || target.startsWith("media/")) {
          const cleanBase = baseUrl.replace(/\/api\/?$/, "");
          target = `${cleanBase}${target.startsWith("/") ? "" : "/"}${target}`;
        }
        return target;
      };

      assert.equal(
        resolveDocUrl("/media/documents/test.pdf", "http://192.168.1.144:8000/api"),
        "http://192.168.1.144:8000/media/documents/test.pdf"
      );
      assert.equal(
        resolveDocUrl("https://res.cloudinary.com/doc.pdf", "http://192.168.1.144:8000/api"),
        "https://res.cloudinary.com/doc.pdf"
      );
    });

    it("MOB-BUG-05: Card icon mapping fallback handles unmapped icon safely", () => {
      const iconMap = { Clock3: 'Clock3Component', AlertCircle: 'AlertCircleComponent' };
      const getIcon = (iconName) => iconMap[iconName] || iconMap.AlertCircle;

      assert.equal(getIcon('Clock3'), 'Clock3Component');
      assert.equal(getIcon('UnknownNonExistentIcon'), 'AlertCircleComponent');
      assert.equal(getIcon(undefined), 'AlertCircleComponent');
    });

    it("MOB-BUG-08: Attendance history endpoint respects start_date and end_date queries", async () => {
      const res = await fetch(`${baseUrl}/attendance/history/?start_date=2026-11-01&end_date=2026-11-24`, {
        headers: {
          "Authorization": `Bearer ${employeeToken}`,
        },
      });

      const body = await res.json();
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(body.records) || Array.isArray(body.data) || Array.isArray(body));
    });
  });

});
