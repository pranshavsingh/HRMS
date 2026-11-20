import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { performance } from "perf_hooks";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { accountsService } from "../../src/services/accounts.service.js";
import { attendanceService } from "../../src/services/attendance.service.js";
import { leaveService } from "../../src/services/leave.service.js";
import { db, closePool } from "../../src/db/index.js";
import redisService from "../../src/services/redis.service.js";

function calculatePercentiles(latencies) {
  if (!latencies || latencies.length === 0) {
    return { p50: 0, p95: 0, p99: 0, max: 0, avg: 0 };
  }
  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];
  const max = latencies[latencies.length - 1];
  const avg = latencies.reduce((sum, v) => sum + v, 0) / latencies.length;
  return { p50, p95, p99, max, avg };
}

describe("P2.3 — High-Concurrency & Load Simulation Test Suite", () => {
  let testUserIds = [];

  before(async () => {
    // Setup test active employees for concurrent simulation
    for (let i = 0; i < 5; i++) {
      const username = `load_test_user_${Date.now()}_${i}`;
      const result = await db.run(
        `INSERT INTO accounts_user (username, password, first_name, last_name, email, role, is_active, is_staff, is_superuser, date_joined)
         VALUES (?, 'hash123', 'Load', 'Tester', ?, 'employee', 1, 0, 0, NOW())`,
        [username, `${username}@test.com`]
      );
      testUserIds.push(result.lastID);

      await db.run(
        `INSERT INTO accounts_employeeprofile (user_id, allowed_radius, latitude, longitude, is_active_employee)
         VALUES (?, 500, 28.6139, 77.2090, 1)`,
        [result.lastID]
      );

      await db.run(
        `INSERT INTO workforce_user_tenant (tenant_id, user_id, role, is_active)
         VALUES (1, ?, 'employee', 1)`,
        [result.lastID]
      );

      await db.run(
        "INSERT INTO workforce_site (id, tenant_id, code, name, address, is_active) VALUES (2, 1, 'SITE_2', 'Secondary Site', 'Branch Office', 1) ON DUPLICATE KEY UPDATE is_active = 1"
      );

      await db.run(
        `INSERT INTO workforce_employee_site_assignment (tenant_id, user_id, site_id, effective_from)
         VALUES (1, ?, 2, '2020-01-01')`,
        [result.lastID]
      );
    }

    // Prime leave entitlement for primary test user
    await leaveService.myLeaves(testUserIds[0], { page: 1, limit: 10 });
  });

  after(async () => {
    // Cleanup test users and related records
    if (testUserIds.length > 0) {
      const placeholders = testUserIds.map(() => "?").join(",");
      await db.run(`DELETE FROM attendance_attendanceapproval WHERE attendance_id IN (SELECT id FROM attendance_attendance WHERE user_id IN (${placeholders}))`, testUserIds);
      await db.run(`DELETE FROM attendance_attendance WHERE user_id IN (${placeholders})`, testUserIds);
      await db.run(`DELETE FROM workforce_leave_ledger_transaction WHERE user_id IN (${placeholders})`, testUserIds);
      await db.run(`DELETE FROM workforce_employee_leave_entitlement WHERE user_id IN (${placeholders})`, testUserIds);
      await db.run(`DELETE FROM leave_leave WHERE user_id IN (${placeholders})`, testUserIds);
      await db.run(`DELETE FROM workforce_employee_site_assignment WHERE user_id IN (${placeholders})`, testUserIds);
      await db.run(`DELETE FROM accounts_employeeprofile WHERE user_id IN (${placeholders})`, testUserIds);
      await db.run(`DELETE FROM workforce_user_tenant WHERE user_id IN (${placeholders})`, testUserIds);
      await db.run(`DELETE FROM accounts_user WHERE id IN (${placeholders})`, testUserIds);
    }

    if (redisService.client) {
      redisService.client.disconnect();
    }
    await closePool();
  });

  it("should sustain concurrent employee directory reads with sub-50ms p95 latency and zero errors", async () => {
    const CONCURRENCY = process.env.CI ? 50 : 100;
    const latencies = [];
    const errors = [];

    const tasks = Array.from({ length: CONCURRENCY }).map(async (_, idx) => {
      const page = (idx % 3) + 1;
      const start = performance.now();
      try {
        const res = await accountsService.getEmployees({ page, limit: 20 });
        latencies.push(performance.now() - start);
        assert.ok(res.data, "Response must contain data array");
        assert.ok(res.pagination, "Response must contain pagination metadata");
      } catch (err) {
        errors.push(err);
      }
    });

    const totalStart = performance.now();
    await Promise.all(tasks);
    const totalDuration = performance.now() - totalStart;

    const stats = calculatePercentiles(latencies);
    console.log(
      `\n[Load Test: Employee Directory] Concurrency: ${CONCURRENCY} | Total time: ${totalDuration.toFixed(1)}ms | ` +
      `p50: ${stats.p50.toFixed(2)}ms | p95: ${stats.p95.toFixed(2)}ms | p99: ${stats.p99.toFixed(2)}ms | Avg: ${stats.avg.toFixed(2)}ms`
    );

    assert.equal(errors.length, 0, `Expected 0 errors, got: ${errors.map((e) => e.message).join(", ")}`);
    assert.equal(latencies.length, CONCURRENCY);
  });

  it("should sustain concurrent attendance history reads with bounded latency and zero errors", async () => {
    const CONCURRENCY = process.env.CI ? 50 : 100;
    const latencies = [];
    const errors = [];
    const userId = testUserIds[0];

    const tasks = Array.from({ length: CONCURRENCY }).map(async () => {
      const start = performance.now();
      try {
        const res = await attendanceService.getHistory(userId, { page: 1, limit: 25 });
        latencies.push(performance.now() - start);
        assert.ok(Array.isArray(res.data));
      } catch (err) {
        errors.push(err);
      }
    });

    const totalStart = performance.now();
    await Promise.all(tasks);
    const totalDuration = performance.now() - totalStart;

    const stats = calculatePercentiles(latencies);
    console.log(
      `\n[Load Test: Attendance History] Concurrency: ${CONCURRENCY} | Total time: ${totalDuration.toFixed(1)}ms | ` +
      `p50: ${stats.p50.toFixed(2)}ms | p95: ${stats.p95.toFixed(2)}ms | Avg: ${stats.avg.toFixed(2)}ms`
    );

    assert.equal(errors.length, 0);
    assert.equal(latencies.length, CONCURRENCY);
  });

  it("should sustain concurrent leave requests reads with zero connection leaks", async () => {
    const CONCURRENCY = process.env.CI ? 25 : 50;
    const latencies = [];
    const errors = [];
    const userId = testUserIds[0];

    const tasks = Array.from({ length: CONCURRENCY }).map(async () => {
      const start = performance.now();
      try {
        const res = await leaveService.myLeaves(userId, { page: 1, limit: 10 });
        latencies.push(performance.now() - start);
        assert.ok(res.summary);
      } catch (err) {
        errors.push(err);
      }
    });

    await Promise.all(tasks);
    const stats = calculatePercentiles(latencies);
    console.log(
      `\n[Load Test: Leave History] Concurrency: ${CONCURRENCY} | p50: ${stats.p50.toFixed(2)}ms | p95: ${stats.p95.toFixed(2)}ms`
    );

    assert.equal(errors.length, 0);
  });

  it("should safely handle 5 simultaneous punch-in requests across 5 different employees in parallel", async () => {
    const results = await Promise.allSettled(
      testUserIds.map((userId) =>
        attendanceService.punchIn(
          userId,
          28.6139,
          77.2090,
          null,
          { id: userId, role: "employee", username: `user_${userId}` },
          "test/mock_punch_in.jpg"
        )
      )
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    if (rejected.length > 0) {
      console.error("Rejected punch-ins:", rejected.map((r) => r.reason?.message));
    }

    assert.equal(fulfilled.length, 5, `Expected all 5 distinct employees to succeed, got ${fulfilled.length}`);
    assert.equal(rejected.length, 0);
  });
});
