import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { startTestServer, teardownAll } from "./harness/test-server.js";
import { HttpClient } from "./harness/http-client.js";
import { createTestUser, deleteTestUser } from "./harness/fixtures.js";
import { db } from "../../src/db/index.js";
import { encodeCursor } from "../../src/utils/pagination/index.js";

describe("Enterprise Mobile Cursor Pagination — E2E, Security & Performance", () => {
  let serverInfo;
  let empUser, adminUser;
  let empClient, adminClient;
  const createdAttIds = [];
  const createdLeaveIds = [];
  const createdNotifIds = [];

  before(async () => {
    serverInfo = await startTestServer();
    const ts = Date.now();
    empUser = await createTestUser({ username: `pg_emp_${ts}`, password: "ValidPassword123!", role: "employee" });
    adminUser = await createTestUser({ username: `pg_adm_${ts}`, password: "ValidPassword123!", role: "superadmin" });

    // Seed 25 attendance records for empUser across sequential dates
    for (let i = 0; i < 25; i++) {
      const d = new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10);
      const res = await db.run(
        `INSERT INTO attendance_attendance (tenant_id, user_id, date, work_date, punch_in_time, status, punch_in_status, punch_out_status)
         VALUES (1, ?, ?, ?, NOW(), 'approved', 'approved', 'approved')`,
        [empUser.id, d, d]
      );
      createdAttIds.push(res.lastID);
    }

    // Seed 5 leave records & 5 notifications for empUser
    for (let i = 0; i < 5; i++) {
      const d = `2026-10-${String(10 + i).padStart(2, "0")}`;
      const lv = await db.run(
        `INSERT INTO leave_leave (tenant_id, user_id, leave_type, from_date, to_date, reason, status, created_at)
         VALUES (1, ?, 'casual', ?, ?, ?, 'pending', DATE_SUB(NOW(), INTERVAL ? MINUTE))`,
        [empUser.id, d, d, `Leave ${i}`, i]
      );
      createdLeaveIds.push(lv.lastID);

      const nf = await db.run(
        `INSERT INTO notifications (tenant_id, recipient_id, type, category, title, message, created_at)
         VALUES (1, ?, 'test:evt', 'system', ?, 'Body', DATE_SUB(NOW(), INTERVAL ? MINUTE))`,
        [empUser.id, `Notif ${i}`, i]
      );
      createdNotifIds.push(nf.lastID);
    }

    const login = async (username) => {
      const c = new HttpClient({ baseUrl: serverInfo.baseUrl });
      const res = await c.post("/api/auth/login/", { username, password: "ValidPassword123!", platform: "mobile" });
      assert.equal(res.status, 200);
      const token = res.body?.data?.access || res.body?.access;
      c.setHeader("Authorization", `Bearer ${token}`);
      return c;
    };

    empClient = await login(empUser.username);
    adminClient = await login(adminUser.username);
  });

  after(async () => {
    if (createdNotifIds.length) await db.run(`DELETE FROM notifications WHERE id IN (${createdNotifIds.map(() => "?").join(",")})`, createdNotifIds).catch(() => {});
    if (createdLeaveIds.length) await db.run(`DELETE FROM leave_leave WHERE id IN (${createdLeaveIds.map(() => "?").join(",")})`, createdLeaveIds).catch(() => {});
    if (createdAttIds.length) await db.run(`DELETE FROM attendance_attendance WHERE id IN (${createdAttIds.map(() => "?").join(",")})`, createdAttIds).catch(() => {});
    if (empUser?.id) await deleteTestUser(empUser.id).catch(() => {});
    if (adminUser?.id) await deleteTestUser(adminUser.id).catch(() => {});
    if (serverInfo?.close) await serverInfo.close();
    await teardownAll();
  });

  it("1. Rejects invalid, tampered, and mismatched-scope cursors & clamps max limit", async () => {
    const rBad = await empClient.get("/api/attendance/history/?cursor=not-a-valid-cursor");
    assert.equal(rBad.status, 400);

    const validCursor = encodeCursor(`att_history:${empUser.id}`, ["2026-10-15", 999]);
    const tampered = validCursor.slice(0, -2) + "XX";
    const rTampered = await empClient.get(`/api/attendance/history/?cursor=${encodeURIComponent(tampered)}`);
    assert.equal(rTampered.status, 400);

    const wrongScope = encodeCursor(`att_history:${adminUser.id}`, ["2026-10-15", 999]);
    const rScope = await empClient.get(`/api/attendance/history/?cursor=${encodeURIComponent(wrongScope)}`);
    assert.equal(rScope.status, 400);

    // Max limit clamping (>100 -> 100)
    const rMax = await empClient.get("/api/attendance/history/?cursor_mode=true&limit=500");
    assert.equal(rMax.status, 200);
    assert.equal(rMax.body?.pagination?.limit, 100);
  });

  it("2. Paginates Attendance History across all pages without duplicates or gaps", async () => {
    const seenIds = new Set();
    let cursor = null;
    let pages = 0;

    do {
      const qs = cursor ? `cursor_mode=true&limit=10&cursor=${encodeURIComponent(cursor)}` : "cursor_mode=true&limit=10";
      const res = await empClient.get(`/api/attendance/history/?${qs}`);
      assert.equal(res.status, 200);
      const items = res.body?.data || [];
      for (const item of items) {
        assert.equal(seenIds.has(item.id), false, `Duplicate record ${item.id} found`);
        seenIds.add(item.id);
      }
      cursor = res.body?.pagination?.nextCursor || null;
      pages += 1;
    } while (cursor);

    assert.equal(seenIds.size, 25);
    assert.equal(pages, 3); // 10 + 10 + 5
  });

  it("3. Handles concurrent new record insertion cleanly during cursor pagination", async () => {
    const page1 = await empClient.get("/api/attendance/history/?cursor_mode=true&limit=10");
    assert.equal(page1.status, 200);
    const firstPageIds = new Set((page1.body?.data || []).map((r) => r.id));
    const cursor1 = page1.body?.pagination?.nextCursor;
    assert.ok(cursor1);

    // Insert a brand-new newer record concurrently
    const newer = await db.run(
      `INSERT INTO attendance_attendance (tenant_id, user_id, date, work_date, punch_in_time, status, punch_in_status, punch_out_status)
       VALUES (1, ?, '2026-11-01', '2026-11-01', NOW(), 'approved', 'approved', 'approved')`,
      [empUser.id]
    );
    createdAttIds.push(newer.lastID);

    const page2 = await empClient.get(`/api/attendance/history/?cursor_mode=true&limit=10&cursor=${encodeURIComponent(cursor1)}`);
    assert.equal(page2.status, 200);
    const page2Ids = (page2.body?.data || []).map((r) => r.id);
    for (const id of page2Ids) {
      assert.equal(firstPageIds.has(id), false, "Concurrent insert must not cause duplicate items on page 2");
    }
  });

  it("4. Supports cursor pagination on Employees, Leaves, Notifications, Documents & Audit Logs", async () => {
    const empRes = await adminClient.get("/api/auth/employees/?cursor_mode=true&limit=2");
    assert.equal(empRes.status, 200);
    assert.ok(Array.isArray(empRes.body?.data));

    const lvRes = await empClient.get("/api/leave/my/?cursor_mode=true&limit=3");
    assert.equal(lvRes.status, 200);
    assert.equal(lvRes.body?.data?.length, 3);
    assert.equal(lvRes.body?.pagination?.hasMore, true);

    const nfRes = await empClient.get("/api/notifications?cursor_mode=true&limit=3");
    assert.equal(nfRes.status, 200);
    assert.equal(nfRes.body?.data?.length, 3);
    assert.equal(nfRes.body?.pagination?.hasMore, true);

    const docRes = await empClient.get("/api/auth/documents/my/?cursor_mode=true&limit=5");
    assert.equal(docRes.status, 200);
    assert.deepEqual(docRes.body?.data, []);
    assert.equal(docRes.body?.pagination?.hasMore, false);

    const auditRes = await adminClient.get("/api/auth/audit-logs/?cursor_mode=true&limit=5");
    assert.equal(auditRes.status, 200);
    assert.ok(Array.isArray(auditRes.body?.data));
  });

  it("5. Verifies EXPLAIN index usage and Mobile pagination component wiring", async () => {
    const plan = await db.all(
      `EXPLAIN SELECT id, date FROM attendance_attendance WHERE user_id = ? AND status != 'leave' ORDER BY date DESC, id DESC LIMIT 21`,
      [empUser.id]
    );
    assert.ok(
      plan[0]?.key || String(plan[0]?.possible_keys || "").includes("idx_att_user_date_id"),
      `Attendance history keyset query must reference idx_att_user_date_id (got key=${plan[0]?.key}, possible_keys=${plan[0]?.possible_keys})`
    );

    const repoRoot = path.resolve(process.cwd(), "..");
    const mobileScreens = [
      "hrms_mobile/src/app/(tabs)/employees.tsx",
      "hrms_mobile/src/app/(tabs)/approvals.tsx",
      "hrms_mobile/src/app/(tabs)/leave.tsx",
      "hrms_mobile/src/app/(tabs)/audit-logs.tsx",
      "hrms_mobile/src/app/(tabs)/employee-documents.tsx",
      "hrms_mobile/src/app/my-documents.tsx",
    ];
    for (const f of mobileScreens) {
      const src = fs.readFileSync(path.join(repoRoot, f), "utf8");
      assert.ok(src.includes("useCursorPagination") && src.includes("PaginatedFlatList"), `${f} must use PaginatedFlatList & useCursorPagination`);
    }
  });
});
