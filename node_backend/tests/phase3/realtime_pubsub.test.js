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
import { createRealtimeEnvelope, realtimeService } from "../../src/services/realtime.service.js";

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

    // Setup Instance A
    const srvA = http.createServer();
    await new Promise((r) => srvA.listen(0, r));
    const portA = srvA.address().port;

    const ioA = new SocketIOServer(srvA, { transports: ["websocket"] });
    const pubA = new Redis(redisUrl);
    const subA = pubA.duplicate();
    await Promise.all([pubA.connect(), subA.connect()]);
    ioA.adapter(createAdapter(pubA, subA));

    ioA.use((socket, next) => {
      socket.user = jwt.verify(socket.handshake.auth.token, config.jwtSecret);
      next();
    });
    ioA.on("connection", (socket) => socket.join(`user:${socket.user.id}`));

    // Setup Instance B
    const srvB = http.createServer();
    await new Promise((r) => srvB.listen(0, r));
    const portB = srvB.address().port;

    const ioB = new SocketIOServer(srvB, { transports: ["websocket"] });
    const pubB = new Redis(redisUrl);
    const subB = pubB.duplicate();
    await Promise.all([pubB.connect(), subB.connect()]);
    ioB.adapter(createAdapter(pubB, subB));

    // Connect Client to Instance A
    const clientA = ClientIO(`http://127.0.0.1:${portA}`, {
      auth: { token: testTokenValid },
      transports: ["websocket"]
    });
    await new Promise((r) => clientA.on("connect", r));

    // Instance B broadcasts to room 'user:7001'
    const eventReceivedPromise = new Promise((resolve) => {
      clientA.on("CROSS_INSTANCE_EVENT", (data) => resolve(data));
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
      pubA.quit(),
      subA.quit(),
      pubB.quit(),
      subB.quit(),
      new Promise((r) => srvA.close(r)),
      new Promise((r) => srvB.close(r))
    ]);
  });
});
