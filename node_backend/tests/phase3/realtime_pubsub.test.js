import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import jwt from "jsonwebtoken";
import { io as ClientIO } from "socket.io-client";
import { Server as SocketIOServer } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { config } from "../../src/config/env.js";
import { createRealtimeEnvelope, realtimeService, RealtimeService } from "../../src/services/realtime.service.js";
import { db, closePool } from "../../src/db/index.js";
import redisService from "../../src/services/redis.service.js";

async function isRedisOnline() {
  const client = new Redis(config.redisUrl || "redis://127.0.0.1:6379", {
    connectTimeout: 800,
    maxRetriesPerRequest: 1,
    lazyConnect: true
  });
  try {
    await client.connect();
    const pong = await client.ping();
    client.disconnect();
    return pong === "PONG";
  } catch {
    try { client.disconnect(); } catch {}
    return false;
  }
}

describe("P3.7 — Distributed Realtime & Redis Pub/Sub Test Suite", () => {
  let server1 = null;
  let port1 = null;
  let testTokenValid = null;
  let testTokenAdmin = null;

  before(async () => {
    testTokenValid = jwt.sign(
      { id: 7001, username: "emp_john", role: "employee", organization_id: 10 },
      config.jwtSecret,
      { expiresIn: "1h" }
    );

    testTokenAdmin = jwt.sign(
      { id: 9999, username: "admin_boss", role: "admin", organization_id: 10 },
      config.jwtSecret,
      { expiresIn: "1h" }
    );

    server1 = http.createServer();
    await new Promise((resolve) => server1.listen(0, resolve));
    port1 = server1.address().port;
    await realtimeService.init(server1, { disableRedis: true });
  });

  after(async () => {
    await realtimeService.close();
    if (server1) {
      await new Promise((resolve) => server1.close(resolve));
    }
    if (redisService.client) {
      try { redisService.client.disconnect(); } catch {}
    }
    await closePool();
  });

  it("should generate compliant standardized event envelope", () => {
    const envelope = createRealtimeEnvelope({
      eventType: "ATTENDANCE_PUNCH_RECORDED",
      aggregateType: "Attendance",
      aggregateId: "12345",
      payload: { employeeId: 7001, status: "approved" },
      correlationId: "corr_test_999"
    });

    assert.ok(envelope.eventId.startsWith("evt_"), "Event ID must have standard prefix");
    assert.equal(envelope.eventType, "ATTENDANCE_PUNCH_RECORDED");
    assert.equal(envelope.aggregateType, "Attendance");
    assert.equal(envelope.aggregateId, "12345");
    assert.equal(envelope.version, 1);
    assert.equal(envelope.correlationId, "corr_test_999");
    assert.ok(envelope.timestamp);
    assert.equal(envelope.payload.employeeId, 7001);
  });

  it("should reject connection attempts without JWT authentication", async () => {
    await assert.rejects(
      () =>
        new Promise((resolve, reject) => {
          const client = ClientIO(`http://127.0.0.1:${port1}`, {
            transports: ["websocket"],
            reconnection: false
          });
          client.on("connect", () => {
            client.disconnect();
            resolve();
          });
          client.on("connect_error", (err) => {
            client.disconnect();
            reject(err);
          });
        }),
      /Authentication error/i
    );
  });

  it("should accept connection with valid JWT and auto-join personal and role rooms", async () => {
    const client = ClientIO(`http://127.0.0.1:${port1}`, {
      auth: { token: testTokenValid },
      transports: ["websocket"],
      reconnection: false
    });

    await new Promise((resolve, reject) => {
      client.on("connect", resolve);
      client.on("connect_error", reject);
    });

    assert.ok(client.connected);

    // Test receiving an event directed to user's personal room
    const receivedPromise = new Promise((resolve) => {
      client.on("NOTIFICATION_RECEIVED", (data) => resolve(data));
    });

    realtimeService.emitToUser(7001, "NOTIFICATION_RECEIVED", { text: "Your leave was approved" });

    const received = await receivedPromise;
    assert.ok(received);
    assert.equal(received.eventType, "NOTIFICATION_RECEIVED");
    assert.equal(received.payload.text, "Your leave was approved");

    client.disconnect();
  });

  it("should enforce room authorization and reject unauthorized room joins", async () => {
    const client = ClientIO(`http://127.0.0.1:${port1}`, {
      auth: { token: testTokenValid }, // Employee role
      transports: ["websocket"],
      reconnection: false
    });

    await new Promise((resolve) => client.on("connect", resolve));

    // Employee attempts to join an admin-only room
    const unauthorizedResult = await new Promise((resolve) => {
      client.emit("join_room", "role:admin", (res) => resolve(res));
    });
    assert.equal(unauthorizedResult.success, false);
    assert.equal(unauthorizedResult.error, "Unauthorized room access");

    // Employee attempts to join another user's private room
    const foreignUserResult = await new Promise((resolve) => {
      client.emit("join_room", "user:8888", (res) => resolve(res));
    });
    assert.equal(foreignUserResult.success, false);
    assert.equal(foreignUserResult.error, "Unauthorized room access");

    client.disconnect();
  });

  it("should distribute realtime events across two independent API instances via Redis Pub/Sub", async (t) => {
    const redisOnline = await isRedisOnline();
    if (!redisOnline) {
      if (process.env.CI) {
        throw new Error("Redis service is mandatory in CI for distributed Pub/Sub verification.");
      }
      t.skip("Local Redis offline. Multi-instance Pub/Sub integration verified in containerized CI.");
      return;
    }

    const redisUrl = config.redisUrl || "redis://127.0.0.1:6379";

    // Setup Instance A with lazyConnect so connect() is safely explicit
    const srvA = http.createServer();
    await new Promise((r) => srvA.listen(0, r));
    const portA = srvA.address().port;

    const ioA = new SocketIOServer(srvA, { transports: ["websocket"] });
    const pubA = new Redis(redisUrl, { lazyConnect: true });
    const subA = pubA.duplicate();
    await Promise.all([pubA.connect(), subA.connect()]);
    ioA.adapter(createAdapter(pubA, subA));

    ioA.use((socket, next) => {
      socket.user = jwt.verify(socket.handshake.auth.token, config.jwtSecret);
      next();
    });
    ioA.on("connection", async (socket) => {
      await socket.join(`user:${socket.user.id}`);
    });

    // Setup Instance B with lazyConnect
    const srvB = http.createServer();
    await new Promise((r) => srvB.listen(0, r));
    const portB = srvB.address().port;

    const ioB = new SocketIOServer(srvB, { transports: ["websocket"] });
    const pubB = new Redis(redisUrl, { lazyConnect: true });
    const subB = pubB.duplicate();
    await Promise.all([pubB.connect(), subB.connect()]);
    ioB.adapter(createAdapter(pubB, subB));

    // Connect Client to Instance A
    const clientA = ClientIO(`http://127.0.0.1:${portA}`, {
      auth: { token: testTokenValid },
      transports: ["websocket"]
    });
    await new Promise((r) => clientA.on("connect", r));

    // Allow Redis Pub/Sub room subscription to register across nodes
    await new Promise((r) => setTimeout(r, 200));

    // Instance B broadcasts to room 'user:7001' with bounded timeout
    const eventReceivedPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timeout (5000ms) waiting for cross-instance event")), 5000);
      clientA.on("CROSS_INSTANCE_EVENT", (data) => {
        clearTimeout(timer);
        resolve(data);
      });
    });

    // Emitted on Server B!
    ioB.to("user:7001").emit("CROSS_INSTANCE_EVENT", { from: "server_b", success: true });

    const received = await eventReceivedPromise;
    assert.ok(received);
    assert.equal(received.from, "server_b");
    assert.equal(received.success, true);

    clientA.disconnect();
    await Promise.all([
      new Promise((r) => ioA.close(r)),
      new Promise((r) => ioB.close(r)),
      Promise.race([pubA.quit(), new Promise((r) => setTimeout(r, 800))]).then(() => { try { pubA.disconnect(); } catch {} }),
      Promise.race([subA.quit(), new Promise((r) => setTimeout(r, 800))]).then(() => { try { subA.disconnect(); } catch {} }),
      Promise.race([pubB.quit(), new Promise((r) => setTimeout(r, 800))]).then(() => { try { pubB.disconnect(); } catch {} }),
      Promise.race([subB.quit(), new Promise((r) => setTimeout(r, 800))]).then(() => { try { subB.disconnect(); } catch {} }),
      new Promise((r) => srvA.close(r)),
      new Promise((r) => srvB.close(r))
    ]);
  });

  it("should enforce tenant isolation and room authorization across two independent instances via Redis Pub/Sub", async (t) => {
    const redisOnline = await isRedisOnline();
    if (!redisOnline) {
      if (process.env.CI) {
        throw new Error("Redis service is mandatory in CI for distributed Pub/Sub verification.");
      }
      t.skip("Local Redis offline. Multi-instance Pub/Sub integration verified in containerized CI.");
      return;
    }

    const redisUrl = config.redisUrl || "redis://127.0.0.1:6379";

    const tokenOrg10 = jwt.sign(
      { id: 8001, username: "admin_org10", role: "admin", organization_id: 10 },
      config.jwtSecret,
      { expiresIn: "1h" }
    );

    const tokenOrg20 = jwt.sign(
      { id: 8002, username: "admin_org20", role: "admin", organization_id: 20 },
      config.jwtSecret,
      { expiresIn: "1h" }
    );

    // Setup Instance 1 using production RealtimeService
    const srv1 = http.createServer();
    await new Promise((r) => srv1.listen(0, r));
    const portSrv1 = srv1.address().port;
    const service1 = new RealtimeService();
    await service1.init(srv1, { redisUrl });

    // Setup Instance 2 using production RealtimeService
    const srv2 = http.createServer();
    await new Promise((r) => srv2.listen(0, r));
    const portSrv2 = srv2.address().port;
    const service2 = new RealtimeService();
    await service2.init(srv2, { redisUrl });

    // Client 1 (Org 10) connects to Instance 1
    const clientOrg10 = ClientIO(`http://127.0.0.1:${portSrv1}`, {
      auth: { token: tokenOrg10 },
      transports: ["websocket"]
    });
    await new Promise((r) => clientOrg10.on("connect", r));

    // Client 2 (Org 20) connects to Instance 2
    const clientOrg20 = ClientIO(`http://127.0.0.1:${portSrv2}`, {
      auth: { token: tokenOrg20 },
      transports: ["websocket"]
    });
    await new Promise((r) => clientOrg20.on("connect", r));

    await new Promise((r) => setTimeout(r, 200));

    // Verify tenant admins are FORBIDDEN from joining un-scoped global 'role:admin' room
    const globalJoinOrg10 = await new Promise((resolve) => {
      clientOrg10.emit("join_room", "role:admin", (res) => resolve(res));
    });
    assert.equal(globalJoinOrg10.success, false, "Tenant admin must NOT be permitted to join global un-scoped role:admin room");
    assert.equal(globalJoinOrg10.error, "Unauthorized room access");

    const globalJoinOrg20 = await new Promise((resolve) => {
      clientOrg20.emit("join_room", "role:admin", (res) => resolve(res));
    });
    assert.equal(globalJoinOrg20.success, false, "Tenant admin from Org 20 must NOT join global role:admin room");

    // Cross-tenant join attempt: Client 2 tries to join Org 10's role room
    const crossTenantJoinResult = await new Promise((resolve) => {
      clientOrg20.emit("join_room", "org:10:role:admin", (res) => resolve(res));
    });
    assert.equal(crossTenantJoinResult.success, false, "Cross-tenant join must be rejected");
    assert.equal(crossTenantJoinResult.error, "Unauthorized room access");

    // Verify Cross-Tenant Message Isolation:
    // Instance 2 broadcasts strictly to Org 10's admins using production emitToRole
    let org20Received = false;
    clientOrg20.on("CONFIDENTIAL_TENANT_EVENT", () => {
      org20Received = true;
    });

    const org10ReceivedPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timeout waiting for Org 10 event")), 5000);
      clientOrg10.on("CONFIDENTIAL_TENANT_EVENT", (data) => {
        clearTimeout(timer);
        resolve(data);
      });
    });

    // Emitted across nodes: from Instance 2 to Org 10 role room via service2
    service2.emitToRole("admin", "CONFIDENTIAL_TENANT_EVENT", { tenantId: 10, secret: "payroll_batch_ok" }, null, 10);

    const receivedEnvelope = await org10ReceivedPromise;
    assert.ok(receivedEnvelope);
    assert.equal(receivedEnvelope.payload.tenantId, 10);
    assert.equal(receivedEnvelope.payload.secret, "payroll_batch_ok");

    // Allow time to guarantee Client 2 never receives Org 10's message
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(org20Received, false, "Client in Org 20 must NOT receive events dispatched to Org 10 role room");

    clientOrg10.disconnect();
    clientOrg20.disconnect();

    await Promise.all([
      service1.close(),
      service2.close(),
      new Promise((r) => srv1.close(r)),
      new Promise((r) => srv2.close(r))
    ]);
  });
});
