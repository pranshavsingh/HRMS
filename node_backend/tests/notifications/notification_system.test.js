import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import jwt from "jsonwebtoken";
import { io as ioClient } from "socket.io-client";
import { createApp } from "../../src/app.js";
import { db, closePool } from "../../src/db/index.js";
import { config } from "../../src/config/env.js";
import realtimeService from "../../src/services/realtime.service.js";
import notificationService from "../../src/services/notification.service.js";
import { sanitizeActionUrl } from "../../src/constants/notification-types.js";

describe("Enterprise Notification System — Integration, Security & Socket.IO Suite", () => {
  let server;
  let baseUrl;
  let userA;
  let userB;
  let empUser;
  let tokenA;
  let tokenB;
  let tokenEmp;
  const createdNotifIds = [];
  const testTokenStr = `ExponentPushToken[test_token_${Date.now()}]`;

  before(async () => {
    const app = createApp();
    server = http.createServer(app);
    await realtimeService.init(server, { disableRedis: true });

    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    baseUrl = `http://127.0.0.1:${port}`;

    const users = await db.all(
      `SELECT id, username, role FROM accounts_user WHERE is_active = 1 AND deleted_at IS NULL ORDER BY id ASC LIMIT 2`
    );
    assert.ok(users.length >= 2, "Need at least 2 active users in DB for isolation tests");
    userA = users[0];
    userB = users[1];

    empUser = await db.get(
      `SELECT id, username, role FROM accounts_user WHERE role = 'employee' AND is_active = 1 AND deleted_at IS NULL LIMIT 1`
    );

    tokenA = jwt.sign(
      { userId: userA.id, id: userA.id, username: userA.username, role: userA.role },
      config.jwtSecret,
      { expiresIn: "15m" }
    );
    tokenB = jwt.sign(
      { userId: userB.id, id: userB.id, username: userB.username, role: userB.role },
      config.jwtSecret,
      { expiresIn: "15m" }
    );
    if (empUser) {
      tokenEmp = jwt.sign(
        { userId: empUser.id, id: empUser.id, username: empUser.username, role: empUser.role },
        config.jwtSecret,
        { expiresIn: "15m" }
      );
    }
  });

  after(async () => {
    if (createdNotifIds.length > 0) {
      const ph = createdNotifIds.map(() => "?").join(",");
      await db.run(`DELETE FROM notifications WHERE id IN (${ph})`, createdNotifIds).catch(() => {});
    }
    await db.run(`DELETE FROM notification_push_tokens WHERE token = ?`, [testTokenStr]).catch(() => {});
    await realtimeService.close();
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await closePool();
  });

  it("rejects unauthenticated requests with 401", async () => {
    const res = await fetch(`${baseUrl}/api/notifications`);
    assert.equal(res.status, 401);

    const res2 = await fetch(`${baseUrl}/api/notifications/unread-count`);
    assert.equal(res2.status, 401);
  });

  it("sanitizes unsafe actionUrl values and preserves valid internal routes", () => {
    assert.equal(sanitizeActionUrl("javascript:alert(1)"), null);
    assert.equal(sanitizeActionUrl("https://evil.example.com/phish"), null);
    assert.equal(sanitizeActionUrl("//evil.example.com"), null);
    assert.equal(sanitizeActionUrl("/leave-approvals"), "/leave-approvals");
    assert.equal(sanitizeActionUrl("/shifts?tab=upcoming"), "/shifts?tab=upcoming");
  });

  it("creates persistent notifications and prevents duplicates via dedupeKey", async () => {
    const dedupe = `test_dedupe_${Date.now()}`;
    const n1 = await notificationService.createNotification({
      tenantId: 1,
      recipientId: userA.id,
      actorId: userB.id,
      type: "leave:applied",
      category: "LEAVE",
      title: "Test Leave Notification",
      message: "Leave request submitted for review.",
      actionUrl: "/leave-approvals",
      priority: "NORMAL",
      dedupeKey: dedupe,
    });
    assert.ok(n1 && n1.id);
    createdNotifIds.push(n1.id);

    const nDup = await notificationService.createNotification({
      tenantId: 1,
      recipientId: userA.id,
      actorId: userB.id,
      type: "leave:applied",
      category: "LEAVE",
      title: "Test Leave Notification",
      message: "Duplicate should be skipped.",
      actionUrl: "/leave-approvals",
      priority: "NORMAL",
      dedupeKey: dedupe,
    });
    assert.equal(nDup, null);
  });

  it("supports bulk creation, pagination, category filter, and unread count", async () => {
    const bulk = await notificationService.createBulkNotifications([
      {
        tenantId: 1,
        recipientId: userA.id,
        type: "attendance:approved",
        category: "ATTENDANCE",
        title: "Bulk Attendance 1",
        message: "Attendance approved.",
        actionUrl: "/history",
        dedupeKey: `test_bulk_1_${Date.now()}`,
      },
      {
        tenantId: 1,
        recipientId: userA.id,
        type: "roster:published",
        category: "ROSTER",
        title: "Bulk Roster 2",
        message: "Roster published.",
        actionUrl: "/shifts",
        dedupeKey: `test_bulk_2_${Date.now()}`,
      },
    ]);
    assert.equal(bulk.length, 2);
    bulk.forEach((b) => createdNotifIds.push(b.id));

    const res = await fetch(`${baseUrl}/api/notifications?page=1&limit=2&category=ATTENDANCE&unreadOnly=true`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.records));
    assert.ok(body.records.length >= 1);
    assert.ok(body.records.every((r) => r.category === "ATTENDANCE" && r.readAt === null));
    assert.ok(typeof body.unreadCount === "number" && body.unreadCount >= 1);
  });

  it("enforces strict recipient ownership (User B cannot access or mark User A notifications)", async () => {
    const targetId = createdNotifIds[0];
    const getRes = await fetch(`${baseUrl}/api/notifications/${targetId}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.equal(getRes.status, 404);

    const patchRes = await fetch(`${baseUrl}/api/notifications/${targetId}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.equal(patchRes.status, 404);

    const delRes = await fetch(`${baseUrl}/api/notifications/${targetId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert.equal(delRes.status, 404);
  });

  it("notifies tenant users on holiday updates with dedupe", async () => {
    const res = await notificationService.notifyTenantUsers({
      tenantId: 1,
      actorId: userA.id,
      type: "holiday:created",
      category: "HOLIDAY",
      title: "Test Holiday Update",
      message: "Republic Day added to holiday calendar.",
      actionUrl: "/holidays",
      dedupePrefix: `test_holiday_${Date.now()}`,
    });
    assert.ok(res.sentCount >= 1);
    await db.run(`DELETE FROM notifications WHERE title = 'Test Holiday Update'`);
  });

  it("delivers real-time Socket.IO events to target recipient only and syncs read status", async () => {
    const socketA = ioClient(baseUrl, { auth: { token: tokenA }, transports: ["websocket"] });
    const socketB = ioClient(baseUrl, { auth: { token: tokenB }, transports: ["websocket"] });

    await Promise.all([
      new Promise((resolve) => socketA.on("connect", resolve)),
      new Promise((resolve) => socketB.on("connect", resolve)),
    ]);

    try {
      let receivedByB = false;
      socketB.on("notification:new", () => {
        receivedByB = true;
      });

      const receivedByAPromise = new Promise((resolve) => {
        socketA.once("notification:new", (evt) => resolve(evt));
      });

      const created = await notificationService.createNotification({
        tenantId: 1,
        recipientId: userA.id,
        type: "document:uploaded",
        category: "DOCUMENT",
        title: "Socket Realtime Test",
        message: "Document uploaded realtime test.",
        actionUrl: "/documents",
        dedupeKey: `test_socket_${Date.now()}`,
      });
      createdNotifIds.push(created.id);

      const evtA = await receivedByAPromise;
      assert.equal(evtA.payload.notification.id, created.id);

      // Give socketB a brief window to ensure isolation
      await new Promise((r) => setTimeout(r, 150));
      assert.equal(receivedByB, false);

      // Mark as read via REST and verify socketA receives notification:read
      const readEvtPromise = new Promise((resolve) => {
        socketA.once("notification:read", (evt) => resolve(evt));
      });
      const readRes = await fetch(`${baseUrl}/api/notifications/${created.id}/read`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      assert.equal(readRes.status, 200);
      const readEvt = await readEvtPromise;
      assert.equal(Number(readEvt.payload.id), created.id);
    } finally {
      socketA.disconnect();
      socketB.disconnect();
    }
  });

  it("registers and unregisters mobile push tokens cleanly", async () => {
    const regRes = await fetch(`${baseUrl}/api/notifications/push-token`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenA}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        token: testTokenStr,
        platform: "android",
        provider: "expo",
      }),
    });
    assert.equal(regRes.status, 200);
    const regBody = await regRes.json();
    assert.equal(regBody.registered, true);

    const delRes = await fetch(`${baseUrl}/api/notifications/push-token`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${tokenA}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token: testTokenStr }),
    });
    assert.equal(delRes.status, 200);
  });
});
