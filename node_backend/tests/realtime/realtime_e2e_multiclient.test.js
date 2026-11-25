import { describe, it, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import express from "express";
import jwt from "jsonwebtoken";
import { io as ClientIO } from "socket.io-client";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { config } from "../../src/config/env.js";
import { realtimeService, createRealtimeEnvelope } from "../../src/services/realtime.service.js";

function createTestToken(payload) {
  return jwt.sign(
    {
      userId: payload.id,
      id: payload.id,
      username: payload.username,
      role: payload.role,
      organization_id: payload.tenant_id || 1,
      tenant_id: payload.tenant_id || 1,
      type: "access",
    },
    config.jwtSecret,
    { expiresIn: "2h" }
  );
}

function connectClient(port, token, platform = "web") {
  return new Promise((resolve, reject) => {
    const socket = ClientIO(`http://127.0.0.1:${port}`, {
      auth: { token },
      extraHeaders: {
        "x-client-platform": platform,
      },
      transports: ["websocket"],
      reconnection: false,
      timeout: 4000,
    });

    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error(`Socket connection timed out for platform: ${platform}`));
    }, 4000);

    socket.on("connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });

    socket.on("connect_error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function waitForEvent(socket, eventName, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for event: ${eventName}`));
    }, timeoutMs);

    socket.once(eventName, (data) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

describe("HRMS Full Real-Time System & Socket.IO Hardening Multi-Client E2E Suite", () => {
  let server = null;
  let port = null;
  let app = null;

  // Mock User Sessions
  const emp1 = { id: 101, username: "emp_arjun", role: "employee", tenant_id: 1 };
  const emp2 = { id: 102, username: "emp_priya", role: "employee", tenant_id: 1 };
  const mgr1 = { id: 201, username: "mgr_vikram", role: "manager", tenant_id: 1 };
  const hr1 = { id: 301, username: "hr_ananya", role: "hr", tenant_id: 1 };
  const tenant2Emp = { id: 901, username: "t2_emp", role: "employee", tenant_id: 2 };

  let tokenEmp1, tokenEmp2, tokenMgr1, tokenHr1, tokenTenant2Emp;

  before(async () => {
    tokenEmp1 = createTestToken(emp1);
    tokenEmp2 = createTestToken(emp2);
    tokenMgr1 = createTestToken(mgr1);
    tokenHr1 = createTestToken(hr1);
    tokenTenant2Emp = createTestToken(tenant2Emp);

    app = express();
    app.use(express.json());

    // Mount real-time sync recovery endpoint matching the production contract
    app.get("/api/v1/auth/realtime/sync/", (req, res) => {
      const auth = req.headers.authorization;
      if (!auth || !auth.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      let decoded;
      try {
        decoded = jwt.verify(auth.slice(7), config.jwtSecret);
      } catch {
        return res.status(401).json({ error: "Invalid token" });
      }

      const since = req.query.since || req.query.after;
      const sinceTimestamp = since ? new Date(since).toISOString() : new Date(Date.now() - 3600000).toISOString();
      const missed = realtimeService.getEventsSince(sinceTimestamp, {
        userId: decoded.userId || decoded.id,
        tenantId: decoded.organization_id || decoded.tenant_id || 1,
        role: decoded.role,
      });

      return res.status(200).json({
        success: true,
        timestamp: new Date().toISOString(),
        missed_events: missed,
      });
    });

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    port = server.address().port;

    await realtimeService.init(server, { disableRedis: true });
  });

  after(async () => {
    try {
      await realtimeService.close();
    } catch {}
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // =========================================================================
  // SCENARIO A: Web <-> Web (Leave Application & Management Approval Flow)
  // =========================================================================
  describe("Scenario A: Web <-> Web (Leave Application & Manager Approval)", () => {
    let clientEmp = null;
    let clientMgr = null;

    afterEach(() => {
      if (clientEmp) clientEmp.disconnect();
      if (clientMgr) clientMgr.disconnect();
    });

    it("should notify manager in real-time when employee submits leave application", async () => {
      clientEmp = await connectClient(port, tokenEmp1, "web");
      clientMgr = await connectClient(port, tokenMgr1, "web");

      const managerEventPromise = waitForEvent(clientMgr, "leave_update");

      // Employee applies leave via backend domain emitter
      realtimeService.emitLeaveEvent("applied", {
        id: 501,
        employee_id: emp1.id,
        employee_name: "Arjun Sharma",
        leave_type: "casual",
        days: 2,
        status: "pending",
      }, {
        tenantId: 1,
        targetRoles: ["manager", "hr", "admin"],
      });

      const received = await managerEventPromise;
      assert.ok(received, "Manager should receive leave_update event");
      const payload = received.payload || received;
      assert.equal(payload.id, 501);
      assert.equal(payload.status, "pending");
      assert.equal(payload.action, "applied");
    });

    it("should notify employee in real-time when manager approves leave", async () => {
      clientEmp = await connectClient(port, tokenEmp1, "web");
      clientMgr = await connectClient(port, tokenMgr1, "web");

      const employeeEventPromise = waitForEvent(clientEmp, "leave_update");
      const employeeNoticePromise = waitForEvent(clientEmp, "leave_notice");

      // Manager approves leave
      realtimeService.emitLeaveEvent("approved", {
        id: 501,
        employee_id: emp1.id,
        leave_type: "casual",
        status: "approved",
        updated_balance: 10,
      }, {
        tenantId: 1,
        userId: emp1.id,
      });

      const [leaveUpdate, leaveNotice] = await Promise.all([
        employeeEventPromise,
        employeeNoticePromise,
      ]);

      assert.ok(leaveUpdate, "Employee should receive leave_update");
      assert.ok(leaveNotice, "Employee should receive leave_notice alert");
      const updatePayload = leaveUpdate.payload || leaveUpdate;
      const noticePayload = leaveNotice.payload || leaveNotice;
      assert.equal(updatePayload.status, "approved");
      assert.equal(noticePayload.status, "approved");
    });
  });

  // =========================================================================
  // SCENARIO B: Web <-> Mobile (Cross-Platform Attendance Punch & Approval)
  // =========================================================================
  describe("Scenario B: Web <-> Mobile (Cross-Platform Punch In & Approval)", () => {
    let clientMobile = null;
    let clientWebMgr = null;

    afterEach(() => {
      if (clientMobile) clientMobile.disconnect();
      if (clientWebMgr) clientWebMgr.disconnect();
    });

    it("should synchronize mobile punch in to web manager dashboard without manual refresh", async () => {
      clientMobile = await connectClient(port, tokenEmp1, "mobile");
      clientWebMgr = await connectClient(port, tokenMgr1, "web");

      const webManagerPromise = waitForEvent(clientWebMgr, "attendance_update");

      // Mobile app punches in
      realtimeService.emitAttendanceEvent("punch_in", {
        user_id: emp1.id,
        employee_name: "Arjun Sharma",
        status: "pending_approval",
        punch_time: new Date().toISOString(),
        is_outside_geofence: true,
      }, {
        tenantId: 1,
        targetRoles: ["manager", "hr", "admin"],
      });

      const webEvent = await webManagerPromise;
      assert.ok(webEvent, "Web Manager must receive real-time attendance update");
      const payload = webEvent.payload || webEvent;
      assert.equal(payload.user_id, emp1.id);
      assert.equal(payload.status, "pending_approval");
    });

    it("should notify mobile client immediately when web manager approves punch", async () => {
      clientMobile = await connectClient(port, tokenEmp1, "mobile");
      clientWebMgr = await connectClient(port, tokenMgr1, "web");

      const mobilePromise = waitForEvent(clientMobile, "attendance_update");

      // Web Manager approves attendance
      realtimeService.emitAttendanceEvent("approved", {
        id: 777,
        user_id: emp1.id,
        review_type: "in",
        approval_status: "approved",
      }, {
        tenantId: 1,
        userId: emp1.id,
      });

      const mobileEvent = await mobilePromise;
      assert.ok(mobileEvent, "Mobile app must receive approved punch update");
      const payload = mobileEvent.payload || mobileEvent;
      assert.equal(payload.approval_status, "approved");
    });
  });

  // =========================================================================
  // SCENARIO C: Mobile <-> Web (Attendance Regularization Request Flow)
  // =========================================================================
  describe("Scenario C: Mobile <-> Web (Attendance Regularization)", () => {
    let clientMobile = null;
    let clientWebHr = null;

    afterEach(() => {
      if (clientMobile) clientMobile.disconnect();
      if (clientWebHr) clientWebHr.disconnect();
    });

    it("should deliver mobile regularization request to HR approvals screen in real-time", async () => {
      clientMobile = await connectClient(port, tokenEmp1, "mobile");
      clientWebHr = await connectClient(port, tokenHr1, "web");

      const hrPromise = waitForEvent(clientWebHr, "attendance_update");

      // Mobile user regularizes missed punch
      realtimeService.broadcastMapped("attendance_update", {
        action: "regularization_requested",
        user_id: emp1.id,
        date: "2026-11-24",
        reason: "Field meeting with client",
      }, {
        tenantId: 1,
        targetRoles: ["hr", "admin"],
      });

      const hrEvent = await hrPromise;
      assert.ok(hrEvent, "HR web client should receive attendance_update");
      const payload = hrEvent.payload || hrEvent;
      assert.equal(payload.action, "regularization_requested");
    });
  });

  // =========================================================================
  // SCENARIO D: Mobile <-> Mobile (Multi-Device Active Synchronization)
  // =========================================================================
  describe("Scenario D: Mobile <-> Mobile (Multi-Device Concurrency)", () => {
    let mobileDeviceA = null;
    let mobileDeviceB = null;

    afterEach(() => {
      if (mobileDeviceA) mobileDeviceA.disconnect();
      if (mobileDeviceB) mobileDeviceB.disconnect();
    });

    it("should update Device B when user punches on Device A", async () => {
      // Same user on two distinct mobile sessions
      mobileDeviceA = await connectClient(port, tokenEmp1, "mobile");
      mobileDeviceB = await connectClient(port, tokenEmp1, "mobile");

      const deviceBPromise = waitForEvent(mobileDeviceB, "attendance_update");

      // Action on Device A
      realtimeService.emitAttendanceEvent("punch_out", {
        user_id: emp1.id,
        punch_out_time: new Date().toISOString(),
        status: "present",
      }, {
        tenantId: 1,
        userId: emp1.id,
      });

      const deviceBEvent = await deviceBPromise;
      assert.ok(deviceBEvent, "Device B must receive the punch_out event");
      const payload = deviceBEvent.payload || deviceBEvent;
      assert.equal(payload.status, "present");
    });
  });

  // =========================================================================
  // SCENARIO E: Reconnection, Buffer Storage & Missed-Event Synchronization
  // =========================================================================
  describe("Scenario E: Reconnection & Missed-Event Recovery Endpoint", () => {
    it("should buffer events and return them via GET /api/v1/auth/realtime/sync/", async () => {
      const offlineClient = await connectClient(port, tokenEmp1, "mobile");
      offlineClient.disconnect();

      const disconnectTime = new Date(Date.now() - 5000).toISOString();

      // Server emits 2 events while client is offline
      realtimeService.broadcastMapped("attendance_update", {
        action: "status_changed",
        user_id: emp1.id,
        detail: "Approved while offline",
      }, {
        tenantId: 1,
        userId: emp1.id,
        targetUserIds: [emp1.id],
      });

      realtimeService.broadcastMapped("schedule_update", {
        action: "roster_published",
        week: "2026-W48",
      }, {
        tenantId: 1,
        targetRoles: ["employee"],
      });

      // Verify the buffered events via realtimeService.getEventsSince
      const missedFromBuffer = realtimeService.getEventsSince(disconnectTime, {
        userId: emp1.id,
        tenantId: 1,
        role: "employee",
      });

      assert.ok(missedFromBuffer.length >= 2, "Buffer must contain at least 2 missed events");

      // Reconnecting client calls the HTTP sync endpoint
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/auth/realtime/sync/?since=${encodeURIComponent(disconnectTime)}`, {
        headers: {
          Authorization: `Bearer ${tokenEmp1}`,
        },
      });

      assert.equal(response.status, 200, "Sync endpoint must return HTTP 200");
      const body = await response.json();
      assert.equal(body.success, true);
      assert.ok(Array.isArray(body.missed_events), "Missed events must be an array");
      assert.ok(body.missed_events.length >= 2, "Should return at least the 2 missed events");
    });
  });

  // =========================================================================
  // SCENARIO F: Security, RBAC, Multi-Tenant Isolation & Session Revocation
  // =========================================================================
  describe("Scenario F: RBAC, Multi-Tenant Isolation & Session Revocation", () => {
    let clientTenant1 = null;
    let clientTenant2 = null;

    afterEach(() => {
      if (clientTenant1) clientTenant1.disconnect();
      if (clientTenant2) clientTenant2.disconnect();
    });

    it("should enforce multi-tenant isolation and never leak events across tenants", async () => {
      clientTenant1 = await connectClient(port, tokenEmp1, "web");
      clientTenant2 = await connectClient(port, tokenTenant2Emp, "web");

      let tenant2Received = false;
      clientTenant2.on("employee_update", () => {
        tenant2Received = true;
      });

      const tenant1Promise = waitForEvent(clientTenant1, "employee_update");

      // Broadcast exclusively inside Tenant 1
      realtimeService.emitEmployeeEvent("updated", {
        id: emp1.id,
        department: "Engineering",
      }, {
        tenantId: 1,
      });

      const received1 = await tenant1Promise;
      assert.ok(received1, "Tenant 1 client should receive event");

      // Give 200ms to verify Tenant 2 didn't receive it
      await new Promise((r) => setTimeout(r, 200));
      assert.equal(tenant2Received, false, "Tenant 2 must NEVER receive Tenant 1 events");
    });

    it("should reject client attempt to arbitrarily join unauthorized administrative room", async () => {
      const employeeClient = await connectClient(port, tokenEmp1, "mobile");

      const joinErrorPromise = new Promise((resolve) => {
        employeeClient.on("join_room_error", (data) => {
          resolve(data);
        });
      });

      // Employee tries to join superadmin room
      employeeClient.emit("join_room", "tenant:1:role:superadmin");

      const error = await joinErrorPromise;
      assert.ok(error, "Server must emit join_room_error");
      assert.ok(error.error.includes("Unauthorized") || error.room.includes("superadmin"));

      employeeClient.disconnect();
    });

    it("should forcefully disconnect active client when session is revoked by admin", async () => {
      const activeClient = await connectClient(port, tokenEmp2, "mobile");

      const disconnectPromise = new Promise((resolve) => {
        activeClient.on("session:revoked", (data) => {
          resolve(data);
        });
      });

      // Administrator terminates/revokes user session
      realtimeService.disconnectUser(emp2.id, "Account deactivated by HR administrator");

      const revocationData = await disconnectPromise;
      assert.ok(revocationData, "Client should receive session:revoked event");
      assert.equal(revocationData.reason, "Account deactivated by HR administrator");

      // Verify socket is disconnected
      await new Promise((r) => setTimeout(r, 100));
      assert.equal(activeClient.connected, false, "Socket must be disconnected");
    });
  });

  // =========================================================================
  // SCENARIO G: Canonical Envelope Integrity & Deduplication Verification
  // =========================================================================
  describe("Scenario G: Canonical Envelope Integrity & Deduplication", () => {
    let client = null;

    afterEach(() => {
      if (client) client.disconnect();
    });

    it("should format all events with compliant metadata envelope (eventId, timestamp, version)", async () => {
      client = await connectClient(port, tokenEmp1, "web");

      const eventPromise = waitForEvent(client, "holiday:updated");

      realtimeService.broadcastMapped("holiday:updated", {
        id: 99,
        name: "Republic Day",
        date: "2027-01-26",
      }, {
        tenantId: 1,
      });

      const received = await eventPromise;
      assert.ok(received, "Should receive event");
      assert.ok(received.eventId, "Event must have unique eventId UUID");
      assert.ok(received.timestamp, "Event must have ISO timestamp");
      assert.equal(received.version, 1, "Event envelope version must be 1");
      assert.equal(received.payload.id, 99);
    });

    it("should correctly handle client-side deduplication when receiving duplicate event IDs", async () => {
      client = await connectClient(port, tokenEmp1, "web");

      const processedEvents = new Set();
      let executionCount = 0;

      client.onAny((eventName, data) => {
        const eventId = data?.eventId;
        if (eventId) {
          if (processedEvents.has(eventId)) return; // Deduplicated
          processedEvents.add(eventId);
        }
        executionCount++;
      });

      const fixedEnvelope = createRealtimeEnvelope("attendance_update", { action: "ping" }, 1);

      // Emit exact duplicate envelope twice
      const room = `user:${emp1.id}`;
      realtimeService.io.to(room).emit("attendance_update", fixedEnvelope);
      realtimeService.io.to(room).emit("attendance_update", fixedEnvelope);

      await new Promise((r) => setTimeout(r, 200));

      assert.equal(executionCount, 1, "Duplicate event with identical eventId must only execute once");
    });
  });
});
