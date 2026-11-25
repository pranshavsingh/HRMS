import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";

import { db } from "../../src/db/index.js";
import leaveService from "../../src/services/leave.service.js";
import attendanceService from "../../src/services/attendance.service.js";
import accountsService from "../../src/services/accounts.service.js";
import { siteService } from "../../src/services/site.service.js";
import { rotationService } from "../../src/services/rotation.service.js";
import attendanceRepository from "../../src/repositories/attendance.repository.js";
import accountsRepository from "../../src/repositories/accounts.repository.js";
import auditService from "../../src/services/audit.service.js";
import redisService from "../../src/services/redis.service.js";
import { realtimeManager } from "../../src/utils/realtime.js";
import { realtimeService } from "../../src/services/realtime.service.js";
import {
  validate,
  loginSchema,
  applyLeaveSchema,
  uploadDocumentSchema,
  regularizeAttendanceSchema,
  registerDocumentSchema,
  auditLogsQuerySchema,
  paramIdSchema,
} from "../../src/middleware/validation.js";
import { authenticateRealtime } from "../../src/middleware/auth.js";
import { createApiLimiter } from "../../src/middleware/rateLimiter.js";
import { getCloudinarySignature, realtimeSync } from "../../src/controllers/accounts.controller.js";

describe("HRMS COMPLETE REMEDIATION REGRESSION SUITE", () => {
  // =========================================================================
  // BUG-01: Leave Concession Grant & Reversal
  // =========================================================================
  describe("BUG-01: Leave Concession Grant & Reversal", () => {
    it("grantConcession completes without ReferenceError and survives realtime failure", async () => {
      const txStub = {
        get: async (sql) => {
          if (sql.includes("FROM workforce_user_tenant")) return { role: "employee" };
          if (sql.includes("FROM accounts_employeeprofile")) return { user_id: 42 };
          if (sql.includes("FROM leave_concession_ledger")) return null;
          if (sql.includes("FROM workforce_leave_policy_version")) return null;
          return { leave_allotted: 10, total: 2, granted: 0 };
        },
        run: async () => ({ lastID: 101 }),
        execute: async (sql) => [[await txStub.get(sql)]],
      };

      const mDbGet = mock.method(db, "get", async (sql) => {
        if (sql.includes("information_schema.tables")) return { count: 0 };
        if (sql.includes("FROM accounts_employeeprofile")) return { leave_allotted: 10 };
        if (sql.includes("FROM leave_leave")) return { days: 0, requests: 0 };
        if (sql.includes("FROM leave_concession_ledger")) return { days: 0 };
        return null;
      });
      const mTx = mock.method(db, "transaction", async (fn) => fn(txStub));
      const mVis = mock.method(siteService, "ensureEmployeeVisible", async () => true);
      const mAudit = mock.method(auditService, "log", async () => {});
      const mBroadcast = mock.method(realtimeManager, "broadcast", () => {
        throw new Error("Simulated realtime failure");
      });

      try {
        const res = await leaveService.grantConcession(
          {
            employee_id: 42,
            leave_type: "casual",
            additional_days: 2,
            effective_date: "2026-11-25",
            reason: "Compensatory off",
            idempotency_key: "idem-grant-001",
          },
          { id: 1, role: "hr" },
          1
        );
        assert.equal(res.id, 101);
        assert.equal(res.duplicate, false);
        assert.ok(mBroadcast.mock.callCount() >= 1);
      } finally {
        mDbGet.mock.restore();
        mTx.mock.restore();
        mVis.mock.restore();
        mAudit.mock.restore();
        mBroadcast.mock.restore();
      }
    });

    it("reverseConcession rejects invalid concession ID", async () => {
      await assert.rejects(
        () =>
          leaveService.reverseConcession(
            "abc",
            { reason: "Mistake", idempotency_key: "idem-rev-001" },
            { id: 1, role: "admin" },
            1
          ),
        (err) => err.statusCode === 400
      );
    });
  });

  // =========================================================================
  // BUG-02: Attendance Regularization DateTime & Bounds
  // =========================================================================
  describe("BUG-02: Attendance Regularization DateTime & Validation", () => {
    it("rejects out-of-bounds time 99:99 and 24:00", async () => {
      await assert.rejects(
        () => attendanceService.regularizeAttendance(10, 5, "99:99", "Forgot punch out", 1),
        (err) => err.statusCode === 400 && err.message.includes("Invalid time bounds")
      );
      await assert.rejects(
        () => attendanceService.regularizeAttendance(10, 5, "24:00", "Forgot punch out", 1),
        (err) => err.statusCode === 400
      );
    });

    it("stores valid Date object in punch_out_time and rejects leave/rejected records", async () => {
      let updatedPayload = null;
      const mTx = mock.method(db, "transaction", async (fn) => fn({}));
      const mFind = mock.method(attendanceRepository, "findAttendanceById", async (id) => {
        if (id === 50) {
          return {
            id: 50,
            user_id: 10,
            tenant_id: 1,
            date: "2026-11-24",
            work_date: "2026-11-24",
            punch_in_time: "2026-11-24T04:00:00.000Z",
            punch_out_time: null,
            status: "present",
          };
        }
        return { id: 51, user_id: 10, tenant_id: 1, status: "leave", punch_out_time: null };
      });
      const mDbGet = mock.method(db, "get", async (sql) => {
        if (sql.includes("FROM attendance_attendanceapproval")) return null;
        if (sql.includes("FROM accounts_user")) return { id: 2, role: "manager", is_active: 1 };
        return null;
      });
      const mProfile = mock.method(accountsRepository, "findProfileByUserId", async () => ({ manager_id: 2 }));
      const mUser = mock.method(accountsRepository, "findById", async () => ({ id: 10, role: "employee" }));
      const mUpdate = mock.method(attendanceRepository, "updateAttendance", async (_id, data) => {
        updatedPayload = data;
      });
      const mCreateApp = mock.method(attendanceRepository, "insertApproval", async () => {});
      const mBroadcast = mock.method(realtimeManager, "broadcast", () => {});

      try {
        await assert.rejects(
          () => attendanceService.regularizeAttendance(10, 51, "18:30", "Forgot", 1),
          (err) => err.statusCode === 400 && err.message.includes("leave")
        );

        const result = await attendanceService.regularizeAttendance(10, 50, "18:30", "Forgot punch out", 1);
        assert.ok(updatedPayload.punch_out_time instanceof Date);
        assert.equal(updatedPayload.punch_out_time.toISOString(), "2026-11-24T13:00:00.000Z");
        assert.equal(result.punch_out_time, "2026-11-24T13:00:00.000Z");
      } finally {
        mTx.mock.restore();
        mFind.mock.restore();
        mDbGet.mock.restore();
        mProfile.mock.restore();
        mUser.mock.restore();
        mUpdate.mock.restore();
        mCreateApp.mock.restore();
        mBroadcast.mock.restore();
      }
    });
  });

  // =========================================================================
  // STAGE C: Security & Multi-Tenant Isolation
  // =========================================================================
  describe("Stage C: Security & Multi-Tenant Isolation", () => {
    it("getAdminSummary scopes all SQL queries by tenantId", async () => {
      const capturedSql = [];
      const mGet = mock.method(db, "get", async (sql, params) => {
        capturedSql.push({ sql, params });
        return { staff: 1, managers: 0, employees: 1, hr: 0, c: 0 };
      });
      const mAll = mock.method(db, "all", async (sql, params) => {
        capturedSql.push({ sql, params });
        return [];
      });
      try {
        await accountsService.getAdminSummary(7);
        assert.ok(capturedSql.length === 5);
        for (const q of capturedSql) {
          assert.ok(q.params.includes(7), `Expected tenantId 7 in params for SQL: ${q.sql}`);
        }
      } finally {
        mGet.mock.restore();
        mAll.mock.restore();
      }
    });

    it("hrDashboard scopes all SQL queries by tenantId", async () => {
      const capturedSql = [];
      const mDash = mock.method(attendanceService, "dashboard", async () => ({}));
      const mGet = mock.method(db, "get", async (sql, params) => {
        capturedSql.push({ sql, params });
        return { c: 0 };
      });
      const mAll = mock.method(db, "all", async (sql, params) => {
        capturedSql.push({ sql, params });
        return [];
      });
      try {
        await attendanceService.hrDashboard(5, "hr", 9);
        assert.equal(capturedSql.length, 5);
        for (const q of capturedSql) {
          assert.ok(q.params.includes(9), `Expected tenantId 9 in params for SQL: ${q.sql}`);
        }
      } finally {
        mDash.mock.restore();
        mGet.mock.restore();
        mAll.mock.restore();
      }
    });

    it("getCloudinarySignature blocks unauthorized user from signing another user's folder", async () => {
      const req = { user: { id: 10, role: "employee" }, query: { folder: "employee-documents/999" } };
      await assert.rejects(
        () => new Promise((resolve, reject) => getCloudinarySignature(req, { json: resolve }, reject)),
        (err) => err.statusCode === 403
      );
    });

    it("authenticateRealtime rejects revoked SSE ticket users", async () => {
      const mGetDel = mock.method(redisService, "getdel", async () => ({ id: 77, username: "revoked_user", role: "employee" }));
      const mGet = mock.method(redisService, "get", async () => "1700000000");
      try {
        let nextErr = null;
        await authenticateRealtime({ query: { ticket: "t123" }, headers: {} }, {}, (err) => {
          nextErr = err;
        });
        assert.ok(nextErr);
        assert.equal(nextErr.statusCode, 401);
      } finally {
        mGetDel.mock.restore();
        mGet.mock.restore();
      }
    });

    it("rateLimiter generates distinct keys for different Bearer tokens", () => {
      const limiter = createApiLimiter();
      assert.equal(typeof limiter, "function");
      const rateLimiterSrc = fs.readFileSync(path.resolve("src/middleware/rateLimiter.js"), "utf8");
      assert.ok(!rateLimiterSrc.includes("auth.slice(7, 40)"));
      assert.ok(rateLimiterSrc.includes("jwt.verify") && rateLimiterSrc.includes("sha256"));
    });
  });

  // =========================================================================
  // BUG-03 & BUG-04: Mounted DELETE employee & realtimeSync SQL
  // =========================================================================
  describe("BUG-03 & BUG-04: Employee Delete Route & realtimeSync", () => {
    it("accounts.routes.js mounts DELETE /employees/:user_id/", () => {
      const routesSrc = fs.readFileSync(path.resolve("src/routes/accounts.routes.js"), "utf8");
      assert.ok(routesSrc.includes('r.delete("/employees/:user_id/"'));
    });

    it("realtimeSync queries attendance_attendanceapproval and leave_leave with tenant_id", async () => {
      const queries = [];
      const mEvents = mock.method(realtimeService, "getEventsSince", () => []);
      const mGet = mock.method(db, "get", async (sql, params) => {
        queries.push({ sql, params });
        return { count: 3 };
      });
      try {
        const payload = await new Promise((resolve, reject) => {
          realtimeSync(
            { user: { id: 1, role: "admin" }, tenantId: 4, query: {} },
            { json: (d) => resolve(d) },
            (err) => { if (err) reject(err); }
          );
        });
        assert.equal(payload.degraded, false);
        assert.equal(payload.metrics.pendingAttendanceApprovals, 3);
        assert.equal(payload.metrics.pendingLeaveApprovals, 3);
        assert.ok(queries[0].sql.includes("attendance_attendanceapproval"));
        assert.ok(queries[1].sql.includes("leave_leave"));
        assert.deepEqual(queries[0].params, [4]);
        assert.deepEqual(queries[1].params, [4]);
      } finally {
        mEvents.mock.restore();
        mGet.mock.restore();
      }
    });
  });

  // =========================================================================
  // PHASE 6 & 7: Validation Hardening & Migration 025
  // =========================================================================
  describe("Phase 6 & 7: Validation Schemas & Roster Migration", () => {
    it("loginSchema returns clean required error on empty body", async () => {
      const mw = validate(loginSchema);
      let errOut = null;
      await mw({ body: {}, query: {}, params: {}, cookies: {}, headers: {} }, {}, (e) => { errOut = e; });
      assert.equal(errOut.statusCode, 400);
      assert.equal(errOut.message, "username and password are required");
    });

    it("applyLeaveSchema rejects invalid calendar date and inverted range", async () => {
      const mw = validate(applyLeaveSchema);
      let err1 = null;
      await mw(
        { body: { leave_type: "casual", from_date: "2026-02-30", to_date: "2026-03-01", reason: "Test" }, query: {}, params: {}, cookies: {}, headers: {} },
        {},
        (e) => { err1 = e; }
      );
      assert.equal(err1.statusCode, 400);

      let err2 = null;
      await mw(
        { body: { leave_type: "casual", from_date: "2026-11-10", to_date: "2026-11-05", reason: "Test" }, query: {}, params: {}, cookies: {}, headers: {} },
        {},
        (e) => { err2 = e; }
      );
      assert.equal(err2.statusCode, 400);
      assert.ok(err2.message.includes("on or before"));
    });

    it("uploadDocumentSchema rejects missing file and does not mask error message", async () => {
      const mw = validate(uploadDocumentSchema);
      let err = null;
      await mw(
        { originalUrl: "/api/auth/documents/upload/", body: { user: "1", title: "PAN" }, query: {}, params: {}, cookies: {}, headers: {} },
        {},
        (e) => { err = e; }
      );
      assert.equal(err.statusCode, 400);
      assert.equal(err.message, "Validation Error");
      assert.equal(err.details?.photo?.[0], "File upload is required");
    });

    it("regularizeAttendanceSchema, registerDocumentSchema, auditLogsQuerySchema, paramIdSchema validate correctly", async () => {
      let e1 = null;
      await validate(regularizeAttendanceSchema)(
        { body: { attendance_id: 1, punch_out_time: "99:99", reason: "x" }, query: {}, params: {}, cookies: {}, headers: {} },
        {},
        (e) => { e1 = e; }
      );
      assert.equal(e1.statusCode, 400);

      let e2 = null;
      await validate(registerDocumentSchema)(
        { body: { public_id: "abc" }, query: {}, params: {}, cookies: {}, headers: {} },
        {},
        (e) => { e2 = e; }
      );
      assert.equal(e2.statusCode, 400);

      let e3 = null;
      await validate(auditLogsQuerySchema)(
        { body: {}, query: { page: "notanumber" }, params: {}, cookies: {}, headers: {} },
        {},
        (e) => { e3 = e; }
      );
      assert.equal(e3.statusCode, 400);

      let e4 = null;
      await validate(paramIdSchema("user_id"))(
        { body: {}, query: {}, params: { user_id: "abc" }, cookies: {}, headers: {} },
        {},
        (e) => { e4 = e; }
      );
      assert.equal(e4.statusCode, 400);
    });

    it("rotationService.previewRotationSchedule rejects inverted or >366 day ranges", async () => {
      await assert.rejects(
        () => rotationService.previewRotationSchedule(1, 1, "2026-12-10", "2026-12-01"),
        (err) => err.statusCode === 400
      );
      await assert.rejects(
        () => rotationService.previewRotationSchedule(1, 1, "2026-01-01", "2027-06-01"),
        (err) => err.statusCode === 400
      );
    });

    it("Migration 025 exists and updates uq_wre_employee_date to uq_wre_roster_employee_date", () => {
      const migPath = path.resolve("scripts/migrations/025_workforce_roster_constraints.sql");
      assert.ok(fs.existsSync(migPath));
      const sql = fs.readFileSync(migPath, "utf8");
      assert.ok(sql.includes("uq_wre_employee_date") && sql.includes("uq_wre_roster_employee_date"));
    });
  });
});
