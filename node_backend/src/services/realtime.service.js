import { Server as SocketIOServer } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { config } from "../config/env.js";
import { sanitizeRedisUrl } from "../config/queue.js";
import { resolveTenantId } from "../utils/tenant.js";
import logger from "../utils/logger.js";
import { redisService } from "./redis.service.js";
import { db } from "../db/index.js";
import { REALTIME_EVENTS } from "../constants/realtime-events.js";

/**
 * Standardized Distributed Realtime Event Envelope
 */
export function createRealtimeEnvelope({
  eventType,
  aggregateType = "System",
  aggregateId = "0",
  payload = {},
  correlationId = null,
  version = 1,
  tenantId = null,
  actorId = null,
}) {
  return {
    eventId: `evt_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
    eventType,
    version,
    aggregateType,
    aggregateId: String(aggregateId),
    timestamp: new Date().toISOString(),
    payload,
    correlationId: correlationId || `corr_${crypto.randomBytes(3).toString("hex")}`,
    tenantId: tenantId ? Number(tenantId) : null,
    actorId: actorId ? Number(actorId) : null,
  };
}

export class RealtimeService {
  constructor() {
    this.io = null;
    this.pubClient = null;
    this.subClient = null;
    this.isInitialized = false;
    this.eventBuffer = []; // Rolling buffer for reconnection synchronization (last 200 events)
    this.maxBufferSize = 200;
  }

  /**
   * Initialize Socket.IO with optional Redis Pub/Sub Adapter.
   * 
   * @param {import("http").Server} httpServer - Node.js HTTP server instance
   * @param {object} [options={}] - Custom options
   * @returns {SocketIOServer} Configured Socket.IO instance
   */
  async init(httpServer, options = {}) {
    if (this.isInitialized && this.io) {
      return this.io;
    }

    const isProduction = process.env.NODE_ENV === "production";
    const allowedOrigins = config.corsOrigin && config.corsOrigin !== "*"
      ? config.corsOrigin.split(",").map((s) => s.trim()).filter(Boolean)
      : (isProduction ? [] : "*");

    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: (origin, callback) => {
          if (!origin || allowedOrigins === "*") {
            return callback(null, true);
          }
          if (Array.isArray(allowedOrigins) && allowedOrigins.includes(origin)) {
            return callback(null, true);
          }
          return callback(new Error("Not allowed by Socket.IO CORS"));
        },
        credentials: true
      },
      transports: ["websocket", "polling"],
      pingTimeout: 20000,
      pingInterval: 25000,
    });

    const redisUrl = options.redisUrl || config.redisUrl || "redis://127.0.0.1:6379";
    const useRedis = options.disableRedis !== true;

    if (useRedis) {
      try {
        const sanitized = sanitizeRedisUrl(redisUrl);
        this.pubClient = new Redis(redisUrl, {
          lazyConnect: true,
          connectTimeout: 5000,
          maxRetriesPerRequest: 3,
          retryStrategy(times) {
            return Math.min(times * 200, 3000);
          }
        });

        this.subClient = this.pubClient.duplicate();

        await Promise.all([this.pubClient.connect(), this.subClient.connect()]);

        this.io.adapter(createAdapter(this.pubClient, this.subClient));
        logger.info("[Realtime] Connected to Redis Pub/Sub adapter at %s", sanitized);
      } catch (redisErr) {
        logger.warn(
          "[Realtime] Redis Pub/Sub adapter failed to connect (%s). Running in single-instance memory adapter mode.",
          redisErr.message
        );
        if (this.pubClient) {
          try { this.pubClient.disconnect(); } catch {}
          this.pubClient = null;
        }
        if (this.subClient) {
          try { this.subClient.disconnect(); } catch {}
          this.subClient = null;
        }
      }
    }

    // 1. Strict Authentication and Revocation Middleware
    this.io.use(async (socket, next) => {
      const authHeader = socket.handshake.headers.authorization || "";
      const token = socket.handshake.auth?.token || (authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null);

      if (!token) {
        return next(new Error("Authentication error: Missing token"));
      }

      try {
        const decoded = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] });
        const userId = decoded.userId || decoded.id;

        // Check token revocation (JTI blacklist in Redis / DB)
        if (decoded.jti) {
          let isBlacklisted = await redisService.get(`token:blacklist:${decoded.jti}`);
          if (!isBlacklisted) {
            try {
              const revokedRow = await db.get(
                "SELECT id FROM accounts_revoked_token WHERE jti = ? AND expires_at > NOW() LIMIT 1",
                [decoded.jti]
              );
              if (revokedRow) isBlacklisted = true;
            } catch {}
          }
          if (isBlacklisted) {
            logger.warn("[Realtime:Auth] Rejected connection with revoked token (JTI: %s)", decoded.jti);
            return next(new Error("Authentication error: Token has been revoked"));
          }
        }

        // Check user session revocation timestamp
        const userRevokedAt = await redisService.get(`user:revoked:${userId}`);
        if (userRevokedAt && decoded.iat && decoded.iat * 1000 < Number(userRevokedAt)) {
          logger.warn("[Realtime:Auth] Rejected connection for revoked user session (User: %s)", userId);
          return next(new Error("Authentication error: Session has been terminated"));
        }

        const user = { ...decoded, id: userId };
        const requestedTenantId = socket.handshake.auth?.tenantId;
        const tenant_id = await resolveTenantId({
          user,
          headers: requestedTenantId ? { "x-tenant-id": String(requestedTenantId) } : {},
          query: {},
        });
        socket.user = { ...user, tenant_id };
        next();
      } catch (err) {
        logger.warn("[Realtime:Auth] Token validation rejected: %s", err.message);
        return next(new Error("Authentication error: Invalid or expired token"));
      }
    });

    // 2. Deterministic Room Assignment & Connection Lifecycle
    this.io.on("connection", (socket) => {
      const user = socket.user || {};
      const role = (user.role || "").toLowerCase();
      logger.info("[Realtime] Client connected: SocketID [%s], UserID [%s], Role [%s], Tenant [%s]", socket.id, user.id, role, user.tenant_id);

      // Auto-join personal user room
      if (user.id) {
        socket.join(`user:${user.id}`);
      }

      // Auto-join tenant-scoped user room
      if (user.id && user.tenant_id) {
        socket.join(`tenant:${user.tenant_id}:user:${user.id}`);
      }

      // Auto-join tenant room
      if (user.tenant_id) {
        socket.join(`tenant:${user.tenant_id}`);
      }

      // Auto-join tenant role room (e.g. tenant:1:role:manager)
      if (role && user.tenant_id) {
        socket.join(`tenant:${user.tenant_id}:role:${role}`);
      }

      // Auto-join manager room if authorized
      if (["manager", "hr", "admin", "superadmin"].includes(role) && user.id) {
        socket.join(`manager:${user.id}`);
      }

      // Auto-join organization rooms if applicable
      if (user.organization_id) {
        socket.join(`org:${user.organization_id}`);
        socket.join(`org:${user.organization_id}:user:${user.id}`);
        if (role) socket.join(`org:${user.organization_id}:role:${role}`);
      }

      // Global system role room only for system-level superadmins
      if (role && !user.organization_id && ["superadmin", "system"].includes(role)) {
        socket.join(`role:${role}`);
      }

      // Explicit room joining authorization gate
      socket.on("join_room", (roomName, callback) => {
        const allowed = this.canJoinRoom(user, roomName);
        if (allowed) {
          socket.join(roomName);
          logger.info("[Realtime] User [%s] joined authorized room: %s", user.id, roomName);
          if (typeof callback === "function") callback({ success: true, room: roomName });
        } else {
          logger.warn("[Realtime:Security] User [%s] attempted unauthorized room join: %s", user.id, roomName);
          socket.emit("join_room_error", { error: "Unauthorized room access", room: roomName });
          if (typeof callback === "function") callback({ success: false, error: "Unauthorized room access" });
        }
      });

      socket.on("disconnect", (reason) => {
        logger.debug("[Realtime] Client disconnected: SocketID [%s], UserID [%s], Reason: %s", socket.id, user.id, reason);
      });
    });

    this.isInitialized = true;
    return this.io;
  }

  /**
   * Verify if a user is authorized to join a requested room.
   */
  canJoinRoom(user, roomName) {
    if (!roomName || typeof roomName !== "string") return false;
    const role = (user.role || "").toLowerCase();

    // 1. Tenant-scoped rooms
    if (roomName.startsWith("tenant:")) {
      const parts = roomName.split(":");
      const targetTenantId = parts[1];
      if (String(user.tenant_id) !== String(targetTenantId)) return false;

      // tenant:<id>
      if (parts.length === 2) return true;

      // tenant:<id>:user:<userId>
      if (parts[2] === "user") return String(user.id) === String(parts[3]);

      // tenant:<id>:role:<role>
      if (parts[2] === "role") return role === (parts[3] || "").toLowerCase();

      // tenant:<id>:<channel>
      if (["attendance", "leave", "notifications", "approvals"].includes(parts[2])) {
        return ["admin", "hr", "manager", "superadmin"].includes(role);
      }
      return false;
    }

    // 2. Personal user room
    if (roomName === `user:${user.id}`) return true;

    // 3. Manager room
    if (roomName === `manager:${user.id}`) {
      return ["manager", "hr", "admin", "superadmin"].includes(role);
    }

    // 4. Organization-scoped rooms
    if (roomName.startsWith("org:")) {
      const parts = roomName.split(":");
      if (String(user.organization_id) !== String(parts[1])) return false;
      if (parts.length === 2) return true;
      if (parts[2] === "role") return role === (parts[3] || "").toLowerCase();
      if (parts[2] === "user") return String(user.id) === String(parts[3]);
      return false;
    }

    // 5. Global un-scoped role rooms: only system superadmin
    if (roomName.startsWith("role:")) {
      const targetRole = roomName.slice(5).toLowerCase();
      return !user.organization_id && ["superadmin", "system"].includes(role) && role === targetRole;
    }

    return false;
  }

  /**
   * Record event in rolling history buffer for reconnection synchronization.
   */
  recordEvent(envelope) {
    if (!envelope || !envelope.eventId) return;
    this.eventBuffer.push(envelope);
    if (this.eventBuffer.length > this.maxBufferSize) {
      this.eventBuffer.shift();
    }
  }

  /**
   * Retrieve missed events since a timestamp for a specific client.
   */
  getEventsSince(sinceTimestamp, { tenantId = null, userId = null, role = null } = {}) {
    if (!sinceTimestamp) return [];
    const sinceMs = new Date(sinceTimestamp).getTime();
    if (isNaN(sinceMs)) return [];

    return this.eventBuffer.filter((evt) => {
      const evtMs = new Date(evt.timestamp).getTime();
      if (evtMs <= sinceMs) return false;

      // Tenant isolation filter
      if (evt.tenantId && tenantId && evt.tenantId !== Number(tenantId)) {
        return false;
      }

      // User targeting filter
      if (evt.aggregateType === "User" && userId && String(evt.aggregateId) !== String(userId)) {
        return false;
      }

      return true;
    });
  }

  /**
   * Disconnect all active sockets for a specific user (e.g. on revocation / deactivation).
   */
  disconnectUser(userId, reason = "Session terminated") {
    if (!this.io) return;
    const room = `user:${userId}`;
    const sockets = this.io.sockets.adapter.rooms.get(room);
    if (sockets) {
      for (const socketId of sockets) {
        const clientSocket = this.io.sockets.sockets.get(socketId);
        if (clientSocket) {
          clientSocket.emit("session:revoked", { reason });
          clientSocket.disconnect(true);
        }
      }
    }
  }

  /**
   * Broadcast an event to a specific user across all API instances.
   */
  emitToUser(userId, eventType, data = {}, aggregateId = null, tenantId = null) {
    if (!this.io) return;
    const envelope = createRealtimeEnvelope({
      eventType,
      aggregateType: "User",
      aggregateId: aggregateId || userId,
      payload: data,
      tenantId,
      actorId: data?.actorId || null,
    });
    this.recordEvent(envelope);
    this.io.to(`user:${userId}`).emit(eventType, envelope);
    return envelope;
  }

  /**
   * Broadcast an event to a role within a tenant.
   */
  emitToRole(role, eventType, data = {}, aggregateId = null, organizationId = null, tenantId = null) {
    if (!this.io) return;
    const envelope = createRealtimeEnvelope({
      eventType,
      aggregateType: "Role",
      aggregateId: aggregateId || role,
      payload: data,
      tenantId,
      actorId: data?.actorId || null,
    });
    this.recordEvent(envelope);

    if (tenantId) {
      this.io.to(`tenant:${tenantId}:role:${role.toLowerCase()}`).emit(eventType, envelope);
    } else if (organizationId) {
      this.io.to(`org:${organizationId}:role:${role.toLowerCase()}`).emit(eventType, envelope);
    } else {
      this.io.to(`role:${role.toLowerCase()}`).emit(eventType, envelope);
    }
    return envelope;
  }

  /**
   * Broadcast an event to an entire tenant.
   */
  emitToTenant(tenantId, eventType, data = {}, aggregateId = null) {
    if (!this.io || !tenantId) return;
    const envelope = createRealtimeEnvelope({
      eventType,
      aggregateType: "Tenant",
      aggregateId: aggregateId || tenantId,
      payload: data,
      tenantId,
      actorId: data?.actorId || null,
    });
    this.recordEvent(envelope);
    this.io.to(`tenant:${tenantId}`).emit(eventType, envelope);
    return envelope;
  }

  /**
   * Broadcast an event to all authenticated clients.
   */
  emitToAll(eventType, data = {}, aggregateType = "System", aggregateId = "0", tenantId = null) {
    if (!this.io) return;
    const envelope = createRealtimeEnvelope({
      eventType,
      aggregateType,
      aggregateId,
      payload: data,
      tenantId,
      actorId: data?.actorId || null,
    });
    this.recordEvent(envelope);
    this.io.emit(eventType, envelope);
    return envelope;
  }

  /**
   * Unified dispatcher for events coming from legacy realtimeManager.broadcast calls.
   * Emits to appropriate rooms and transmits both canonical and legacy event names.
   */
  broadcastMapped(eventName, data = {}, filter = {}) {
    if (!this.io) return;

    const tenantId = filter.tenantId || data.tenant_id || data.tenantId || null;
    const targetUserIds = filter.targetUserIds || (data.userId ? [data.userId] : null);
    const targetRoles = filter.targetRoles || null;

    const envelope = createRealtimeEnvelope({
      eventType: eventName,
      aggregateType: data.type || "System",
      aggregateId: data.id || data.userId || "0",
      payload: data,
      tenantId,
      actorId: data.actorId || null,
    });
    this.recordEvent(envelope);

    // Determine target rooms
    if (targetUserIds && targetUserIds.length > 0 && !targetRoles) {
      targetUserIds.forEach((uid) => {
        this.io.to(`user:${uid}`).emit(eventName, envelope);
      });
      return envelope;
    }

    if (targetRoles && targetRoles.length > 0) {
      targetRoles.forEach((role) => {
        if (tenantId) {
          this.io.to(`tenant:${tenantId}:role:${role.toLowerCase()}`).emit(eventName, envelope);
        } else {
          this.io.to(`role:${role.toLowerCase()}`).emit(eventName, envelope);
        }
      });
      if (targetUserIds && targetUserIds.length > 0) {
        targetUserIds.forEach((uid) => {
          this.io.to(`user:${uid}`).emit(eventName, envelope);
        });
      }
      return envelope;
    }

    if (tenantId) {
      this.io.to(`tenant:${tenantId}`).emit(eventName, envelope);
      return envelope;
    }

    // Global fallback
    this.io.emit(eventName, envelope);
    return envelope;
  }

  /**
   * Rich Post-Commit Domain Emitters
   */

  emitAttendanceEvent(action, payload, { tenantId = 1, userId = null, managerId = null } = {}) {
    if (!this.io) return;
    const data = { action, ...payload, tenantId: Number(tenantId) };
    const envelope = createRealtimeEnvelope({
      eventType: `attendance:${action}`,
      aggregateType: "Attendance",
      aggregateId: payload.attendanceId || payload.id || userId || "0",
      payload: data,
      tenantId: Number(tenantId),
      actorId: payload.actorId || userId,
    });
    this.recordEvent(envelope);

    // Emit to tenant (so dashboards update)
    this.io.to(`tenant:${tenantId}`).emit(`attendance:${action}`, envelope);
    this.io.to(`tenant:${tenantId}`).emit("attendance_update", envelope);

    // Emit to specific employee
    if (userId) {
      this.io.to(`user:${userId}`).emit(`attendance:${action}`, envelope);
      this.io.to(`user:${userId}`).emit("attendance_update", envelope);
    }

    // Emit to manager
    if (managerId) {
      this.io.to(`manager:${managerId}`).emit(`attendance:${action}`, envelope);
      this.io.to(`manager:${managerId}`).emit("attendance_update", envelope);
    }

    return envelope;
  }

  emitLeaveEvent(action, payload, { tenantId = 1, userId = null, managerId = null } = {}) {
    if (!this.io) return;
    const data = { action, ...payload, tenantId: Number(tenantId) };
    const envelope = createRealtimeEnvelope({
      eventType: `leave:${action}`,
      aggregateType: "Leave",
      aggregateId: payload.leaveId || payload.id || userId || "0",
      payload: data,
      tenantId: Number(tenantId),
      actorId: payload.actorId || userId,
    });
    this.recordEvent(envelope);

    // Emit to tenant
    this.io.to(`tenant:${tenantId}`).emit(`leave:${action}`, envelope);
    this.io.to(`tenant:${tenantId}`).emit("leave_update", envelope);

    // Emit to specific employee
    if (userId) {
      this.io.to(`user:${userId}`).emit(`leave:${action}`, envelope);
      this.io.to(`user:${userId}`).emit("leave_update", envelope);
      if (action === "notice" || payload.status) {
        this.io.to(`user:${userId}`).emit("leave_notice", envelope);
      }
    }

    // Emit to manager
    if (managerId) {
      this.io.to(`manager:${managerId}`).emit(`leave:${action}`, envelope);
      this.io.to(`manager:${managerId}`).emit("leave_update", envelope);
    }

    return envelope;
  }

  emitEmployeeEvent(action, payload, { tenantId = 1, userId = null } = {}) {
    if (!this.io) return;
    const data = { action, ...payload, tenantId: Number(tenantId) };
    const envelope = createRealtimeEnvelope({
      eventType: `employee:${action}`,
      aggregateType: "Employee",
      aggregateId: userId || payload.userId || "0",
      payload: data,
      tenantId: Number(tenantId),
      actorId: payload.actorId || null,
    });
    this.recordEvent(envelope);

    this.io.to(`tenant:${tenantId}`).emit(`employee:${action}`, envelope);
    this.io.to(`tenant:${tenantId}`).emit("employee_update", envelope);

    if (userId) {
      this.io.to(`user:${userId}`).emit(`employee:${action}`, envelope);
      this.io.to(`user:${userId}`).emit("employee_update", envelope);
    }

    return envelope;
  }

  emitDocumentEvent(action, payload, { tenantId = 1, userId = null } = {}) {
    if (!this.io) return;
    const data = { action, ...payload, tenantId: Number(tenantId) };
    const envelope = createRealtimeEnvelope({
      eventType: `document:${action}`,
      aggregateType: "Document",
      aggregateId: payload.documentId || payload.id || "0",
      payload: data,
      tenantId: Number(tenantId),
      actorId: payload.actorId || null,
    });
    this.recordEvent(envelope);

    this.io.to(`tenant:${tenantId}`).emit(`document:${action}`, envelope);
    this.io.to(`tenant:${tenantId}`).emit("document_update", envelope);

    if (userId) {
      this.io.to(`user:${userId}`).emit(`document:${action}`, envelope);
      this.io.to(`user:${userId}`).emit("document_update", envelope);
    }

    return envelope;
  }

  emitScheduleEvent(action, payload, { tenantId = 1, userId = null } = {}) {
    if (!this.io) return;
    const data = { action, ...payload, tenantId: Number(tenantId) };
    const envelope = createRealtimeEnvelope({
      eventType: `schedule:${action}`,
      aggregateType: "Schedule",
      aggregateId: payload.shiftId || payload.rosterId || "0",
      payload: data,
      tenantId: Number(tenantId),
    });
    this.recordEvent(envelope);

    this.io.to(`tenant:${tenantId}`).emit("schedule_update", envelope);
    if (userId) {
      this.io.to(`user:${userId}`).emit("schedule_update", envelope);
    }

    return envelope;
  }

  emitAuditLog(log, tenantId = 1) {
    if (!this.io) return;
    const envelope = createRealtimeEnvelope({
      eventType: "new_audit_log",
      aggregateType: "AuditLog",
      aggregateId: log.id || "0",
      payload: log,
      tenantId: Number(tenantId),
    });
    this.recordEvent(envelope);
    this.io.to("role:superadmin").emit("new_audit_log", envelope);
    this.io.to(`tenant:${tenantId}:role:superadmin`).emit("new_audit_log", envelope);
    return envelope;
  }

  getConnectedClientCount() {
    if (!this.io || !this.io.sockets) return 0;
    return this.io.sockets.sockets ? this.io.sockets.sockets.size : 0;
  }

  async close() {
    if (this.io) {
      await new Promise((resolve) => this.io.close(resolve));
      this.io = null;
    }
    if (this.pubClient) {
      try {
        await Promise.race([
          this.pubClient.quit(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 1000))
        ]);
      } catch {
        try { this.pubClient.disconnect(); } catch {}
      }
      this.pubClient = null;
    }
    if (this.subClient) {
      try {
        await Promise.race([
          this.subClient.quit(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 1000))
        ]);
      } catch {
        try { this.subClient.disconnect(); } catch {}
      }
      this.subClient = null;
    }
    this.isInitialized = false;
    logger.info("[Realtime] Realtime service closed gracefully.");
  }
}

export const realtimeService = new RealtimeService();
export default realtimeService;
