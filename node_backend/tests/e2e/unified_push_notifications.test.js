import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../src/db/index.js";
import { startTestServer, teardownAll } from "./harness/test-server.js";
import { HttpClient } from "./harness/http-client.js";
import { createTestUser, deleteTestUser } from "./harness/fixtures.js";
import {
  pushService,
  setWebPushClientForTest,
  buildSafePushTitle,
  buildSafePushBody,
} from "../../src/services/push.service.js";
import { notificationRepository } from "../../src/repositories/notification.repository.js";

const SAMPLE_KEYS = {
  p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM",
  auth: "tBHItJI5svbpez7KI4CCXg",
};

describe("Unified Web Push + Mobile Push Notifications — Production Blocker Regression Suite", () => {
  let serverInfo;
  let emp1, emp2, otherTenantUser;
  let emp1Client, emp2Client, otherTenantClient;
  let tenant2Id = null;
  const createdNotificationIds = [];

  before(async () => {
    serverInfo = await startTestServer();
    const ts = Date.now();

    const tRes = await db.run(
      "INSERT INTO workforce_tenant (name, code, is_active) VALUES (?, ?, 1)",
      [`PushTestTenant_${ts}`, `PUSH_${ts}`]
    );
    tenant2Id = tRes.lastID;

    emp1 = await createTestUser({ username: `push_emp1_${ts}`, password: "ValidPassword123!", role: "employee" });
    emp2 = await createTestUser({ username: `push_emp2_${ts}`, password: "ValidPassword123!", role: "employee" });
    otherTenantUser = await createTestUser({ username: `push_t2_${ts}`, password: "ValidPassword123!", role: "employee" });

    await db.run("DELETE FROM workforce_employee_site_assignment WHERE user_id = ?", [otherTenantUser.id]);
    await db.run("DELETE FROM workforce_site_access WHERE user_id = ?", [otherTenantUser.id]);
    await db.run("UPDATE workforce_user_tenant SET tenant_id = ? WHERE user_id = ?", [tenant2Id, otherTenantUser.id]);

    const login = async (username) => {
      const c = new HttpClient({ baseUrl: serverInfo.baseUrl });
      const res = await c.post("/api/auth/login/", { username, password: "ValidPassword123!", platform: "web" });
      assert.equal(res.status, 200);
      const token = res.body?.data?.access || res.body?.access;
      c.setHeader("Authorization", `Bearer ${token}`);
      return c;
    };

    [emp1Client, emp2Client, otherTenantClient] = await Promise.all([
      login(emp1.username),
      login(emp2.username),
      login(otherTenantUser.username),
    ]);
  });

  after(async () => {
    if (createdNotificationIds.length > 0) {
      const placeholders = createdNotificationIds.map(() => "?").join(", ");
      await db.run(`DELETE FROM notification_deliveries WHERE notification_id IN (${placeholders})`, createdNotificationIds);
      await db.run(`DELETE FROM notifications WHERE id IN (${placeholders})`, createdNotificationIds);
    }
    const userIds = [emp1?.id, emp2?.id, otherTenantUser?.id].filter(Boolean);
    for (const uid of userIds) {
      await db.run("DELETE FROM notification_push_tokens WHERE user_id = ?", [uid]);
      await db.run("DELETE FROM notification_preferences WHERE user_id = ?", [uid]);
      await deleteTestUser(uid);
    }
    if (tenant2Id) {
      await db.run("DELETE FROM workforce_tenant WHERE id = ?", [tenant2Id]);
    }
    await teardownAll();
  });

  it("1. GET /api/notifications/vapid-public-key returns configured VAPID public key", async () => {
    const res = await emp1Client.get("/api/notifications/vapid-public-key");
    assert.equal(res.status, 200);
    assert.equal(typeof res.body?.publicKey, "string");
    assert.ok(res.body.publicKey.length > 20);
    assert.equal(res.body?.configured, true);
  });

  it("2. Supports >500-char endpoints, prevents 255-char prefix collisions, and blocks active cross-user token hijacking", async () => {
    const ts = Date.now();
    const sharedPrefix = `https://fcm.googleapis.com/fcm/send/${"A".repeat(260)}_${ts}_`;
    const longEndpoint1 = `${sharedPrefix}${"1".repeat(320)}`;
    const longEndpoint2 = `${sharedPrefix}${"2".repeat(320)}`;
    assert.ok(longEndpoint1.length > 600);

    const r1 = await emp1Client.post("/api/notifications/push-token", {
      platform: "web",
      provider: "webpush",
      deviceId: `long-1-${ts}`,
      deviceName: "Chrome Long 1",
      subscription: { endpoint: longEndpoint1, keys: SAMPLE_KEYS },
    });
    assert.equal(r1.status, 200);

    // Second user with same first 260 chars but different suffix must NOT collide
    const r2 = await emp2Client.post("/api/notifications/push-token", {
      platform: "web",
      provider: "webpush",
      deviceId: `long-2-${ts}`,
      deviceName: "Chrome Long 2",
      subscription: { endpoint: longEndpoint2, keys: SAMPLE_KEYS },
    });
    assert.equal(r2.status, 200);

    // Active token belonging to emp1 cannot be silently claimed by emp2 or another tenant
    const hijackSameTenant = await emp2Client.post("/api/notifications/push-token", {
      platform: "web",
      provider: "webpush",
      subscription: { endpoint: longEndpoint1, keys: SAMPLE_KEYS },
    });
    assert.equal(hijackSameTenant.status, 409);

    const hijackCrossTenant = await otherTenantClient.post("/api/notifications/push-token", {
      platform: "web",
      provider: "webpush",
      subscription: { endpoint: longEndpoint1, keys: SAMPLE_KEYS },
    });
    assert.equal(hijackCrossTenant.status, 409);

    // Verify full >600-char token stored intact & unregister matches by token_hash
    const stored = await db.get("SELECT token, LENGTH(token) AS len FROM notification_push_tokens WHERE user_id = ? AND device_id = ?", [
      emp1.id,
      `long-1-${ts}`,
    ]);
    assert.equal(stored.token, longEndpoint1);
    assert.ok(stored.len > 600);

    // Logout / unregister emp1, then emp2 CAN claim the device on account switch
    const delRes = await emp1Client.delete("/api/notifications/push-token", { token: longEndpoint1 });
    assert.equal(delRes.status, 200);

    const switchRes = await emp2Client.post("/api/notifications/push-token", {
      platform: "web",
      provider: "webpush",
      deviceId: `switched-${ts}`,
      subscription: { endpoint: longEndpoint1, keys: SAMPLE_KEYS },
    });
    assert.equal(switchRes.status, 200);
  });

  it("3. Enforces device ownership, partial preference merges, and per-channel click tracking", async () => {
    const ts = Date.now();
    // Partial preference updates: set mobile_push_enabled=false & disabled_categories=['SYSTEM'], then update ONLY web_push_enabled=false
    const put1 = await emp1Client.put("/api/notifications/preferences", {
      mobile_push_enabled: false,
      disabled_categories: ["SYSTEM"],
    });
    assert.equal(put1.status, 200);
    assert.equal(put1.body?.web_push_enabled, true);
    assert.equal(put1.body?.mobile_push_enabled, false);
    assert.deepEqual(put1.body?.disabled_categories, ["SYSTEM"]);

    const put2 = await emp1Client.put("/api/notifications/preferences", {
      web_push_enabled: false,
    });
    assert.equal(put2.status, 200);
    assert.equal(put2.body?.web_push_enabled, false);
    assert.equal(put2.body?.mobile_push_enabled, false, "omitted mobile_push_enabled must be preserved");
    assert.deepEqual(put2.body?.disabled_categories, ["SYSTEM"], "omitted disabled_categories must be preserved");

    const invalidPref = await emp1Client.put("/api/notifications/preferences", {
      web_push_enabled: "not-a-boolean",
    });
    assert.equal(invalidPref.status, 400);

    // Per-channel click tracking
    const tenantRow = await db.get("SELECT tenant_id FROM workforce_user_tenant WHERE user_id = ? LIMIT 1", [emp1.id]);
    const notif = await notificationRepository.insertOne({
      tenantId: tenantRow.tenant_id,
      recipientId: emp1.id,
      type: "LEAVE_APPROVED",
      category: "LEAVE",
      title: "Sensitive Title: John Doe Sick Leave",
      message: "Your leave request was approved.",
      actionUrl: "/leave",
      priority: "NORMAL",
      dedupeKey: `click-channel-${ts}`,
    });
    createdNotificationIds.push(notif.id);

    await notificationRepository.logDelivery({ notificationId: notif.id, channel: "web_push", status: "SENT" });
    await notificationRepository.logDelivery({ notificationId: notif.id, channel: "mobile_push", status: "SENT" });

    // Cross-tenant click must 404
    const crossClick = await otherTenantClient.post(`/api/notifications/${notif.id}/click`, { channel: "mobile_push" });
    assert.equal(crossClick.status, 404);

    // Click mobile_push only
    const clickRes = await emp1Client.post(`/api/notifications/${notif.id}/click`, { channel: "mobile_push" });
    assert.equal(clickRes.status, 200);

    const mobileDelivery = await db.get(
      "SELECT clicked_at FROM notification_deliveries WHERE notification_id = ? AND channel = 'mobile_push' LIMIT 1",
      [notif.id]
    );
    const webDelivery = await db.get(
      "SELECT clicked_at FROM notification_deliveries WHERE notification_id = ? AND channel = 'web_push' LIMIT 1",
      [notif.id]
    );
    assert.ok(mobileDelivery?.clicked_at, "mobile_push delivery should be marked clicked");
    assert.equal(webDelivery?.clicked_at, null, "web_push delivery should remain unclicked");

    // Existing notification history compatibility check
    const historyRes = await emp1Client.get("/api/notifications?page=1&limit=10");
    assert.equal(historyRes.status, 200);
    assert.ok(Array.isArray(historyRes.body?.records));
  });

  it("4. Logs SENT (not DELIVERED), uses generic lock-screen titles/bodies, retries 429/408, and polls Expo receipts", async () => {
    const ts = Date.now();
    const tenantRow = await db.get("SELECT tenant_id FROM workforce_user_tenant WHERE user_id = ? LIMIT 1", [emp2.id]);
    const tenantId = tenantRow.tenant_id;

    // Ensure emp2 has both web & mobile enabled
    await notificationRepository.upsertPreferences(tenantId, emp2.id, {
      webPushEnabled: true,
      mobilePushEnabled: true,
      disabledCategories: [],
    });

    await notificationRepository.upsertPushToken({
      tenantId,
      userId: emp2.id,
      token: `https://push.example.test/retry-${ts}`,
      platform: "web",
      provider: "webpush",
      deviceId: `retry-${ts}`,
      subscriptionJson: JSON.stringify({ endpoint: `https://push.example.test/retry-${ts}`, keys: SAMPLE_KEYS }),
    });
    await notificationRepository.upsertPushToken({
      tenantId,
      userId: emp2.id,
      token: `ExponentPushToken[ok-${ts}]`,
      platform: "android",
      provider: "expo",
      deviceId: `expo-ok-${ts}`,
    });
    await notificationRepository.upsertPushToken({
      tenantId,
      userId: emp2.id,
      token: `ExponentPushToken[unreg-${ts}]`,
      platform: "ios",
      provider: "expo",
      deviceId: `expo-unreg-${ts}`,
    });

    const notif = await notificationRepository.insertOne({
      tenantId,
      recipientId: emp2.id,
      type: "HOLIDAY_UPDATED",
      category: "HOLIDAY",
      title: "Confidential Executive Retreat - John Doe ₹150,000",
      message: "Confidential body details",
      actionUrl: "/holidays",
      priority: "HIGH",
      dedupeKey: `receipt-test-${ts}`,
    });
    createdNotificationIds.push(notif.id);

    assert.equal(buildSafePushTitle(notif), "Holiday Update");
    assert.ok(!buildSafePushBody(notif).includes("John Doe"));

    const origFetch = globalThis.fetch;
    const webPayloads = [];
    let webAttempt = 0;
    let expoSendAttempt = 0;

    setWebPushClientForTest({
      sendNotification: async (_sub, payloadStr) => {
        webPayloads.push(JSON.parse(payloadStr));
        webAttempt += 1;
        if (webAttempt === 1) {
          const err = new Error("Rate limited");
          err.statusCode = 429;
          err.headers = { "retry-after": "0" };
          throw err;
        }
        return { statusCode: 201 };
      },
    });

    globalThis.fetch = async (url, init) => {
      if (String(url).includes("/push/send")) {
        expoSendAttempt += 1;
        if (expoSendAttempt === 1) {
          return { status: 408, ok: false, headers: { get: () => null }, json: async () => ({}) };
        }
        const batch = JSON.parse(init.body);
        return {
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: async () => ({
            data: batch.map((m, idx) => ({
              status: "ok",
              id: `ticket-${ts}-${idx}-${m.to.includes("unreg") ? "unreg" : "ok"}`,
            })),
          }),
        };
      }
      if (String(url).includes("/push/getReceipts")) {
        const body = JSON.parse(init.body);
        const data = {};
        for (const id of body.ids) {
          if (id.includes("unreg")) {
            data[id] = { status: "error", message: "Not registered", details: { error: "DeviceNotRegistered" } };
          } else {
            data[id] = { status: "ok" };
          }
        }
        return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({ data }) };
      }
      return origFetch(url, init);
    };

    try {
      await pushService.sendForNotifications([notif]);

      assert.ok(webAttempt >= 2, "expected 429 Web Push to retry");
      assert.equal(expoSendAttempt, 2, "expected 408 Expo send to retry");
      assert.equal(webPayloads[0].title, "Holiday Update");
      assert.ok(!JSON.stringify(webPayloads[0]).includes("150,000"));

      const webDelivery = await db.get(
        "SELECT status FROM notification_deliveries WHERE notification_id = ? AND channel = 'web_push' LIMIT 1",
        [notif.id]
      );
      assert.equal(webDelivery.status, "SENT", "Web Push must log SENT (not DELIVERED) on push-service acceptance");

      // Poll Expo receipts
      const pollRes = await pushService.pollExpoPushReceipts({ minAgeMinutes: 0, limit: 100 });
      assert.ok(pollRes.processed >= 1);
      assert.ok(pollRes.failed >= 1);
      assert.ok(pollRes.deactivated >= 1);

      // Re-poll should be idempotent (0 new transitions for this notification)
      const secondPoll = await pushService.pollExpoPushReceipts({ minAgeMinutes: 0, limit: 100 });
      assert.equal(secondPoll.processed, 0);
      assert.equal(secondPoll.failed, 0);

      // Verify unreg token was deactivated while ok token remains active
      const activeDevices = await notificationRepository.listUserDevices(tenantId, emp2.id);
      const deviceIds = activeDevices.map((d) => d.device_id);
      assert.ok(deviceIds.includes(`expo-ok-${ts}`));
      assert.ok(!deviceIds.includes(`expo-unreg-${ts}`));
    } finally {
      setWebPushClientForTest(null);
      globalThis.fetch = origFetch;
    }
  });
});
