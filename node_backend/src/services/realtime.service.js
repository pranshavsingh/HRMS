import { Server as SocketIOServer } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { config } from "../config/env.js";
import { sanitizeRedisUrl } from "../config/queue.js";
import logger from "../utils/logger.js";

/**
 * Standardized Distributed Realtime Event Envelope
 */
export function createRealtimeEnvelope({
  eventType,
  aggregateType = "System",
  aggregateId = "0",
  payload = {},
  correlationId = null,
  version = 1
}) {
  return {
    eventId: `evt_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
    eventType,
    version,
    aggregateType,
    aggregateId: String(aggregateId),
    timestamp: new Date().toISOString(),
    payload,
    correlationId: correlationId || `corr_${crypto.randomBytes(3).toString("hex")}`
  };
}

class RealtimeService {
  constructor() {
    this.io = null;
    this.pubClient = null;
    this.subClient = null;
    this.isInitialized = false;
  }

  /**
   * Initialize Socket.IO with optional Redis Pub/Sub Adapter.
   * 
   * @param {import("http").Server} httpServer - Node.js HTTP server instance
   * @param {object} [options={}] - Custom options (e.g. override redisUrl or disableRedis)
   * @returns {SocketIOServer} Configured Socket.IO instance
   */
  async init(httpServer, options = {}) {
    if (this.isInitialized && this.io) {
      return this.io;
    }

    const corsOrigins = config.corsOrigin && config.corsOrigin !== "*"
      ? config.corsOrigin.split(",").map((s) => s.trim())
      : "*";

    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: corsOrigins,
        credentials: true
      },
      transports: ["websocket", "polling"],
      pingTimeout: 20000,
      pingInterval: 25000
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

    // Authentication and Room Authorization Middleware
    this.io.use((socket, next) => {
      const authHeader = socket.handshake.headers.authorization || "";
      const token = socket.handshake.auth?.token || (authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null);

      if (!token) {
        return next(new Error("Authentication error: Missing token"));
      }

      try {
        const decoded = jwt.verify(token, config.jwtSecret);
        socket.user = decoded;
        next();
      } catch (err) {
        logger.warn("[Realtime:Auth] Token validation rejected: %s", err.message);
        return next(new Error("Authentication error: Invalid or expired token"));
      }
    });

    // Connection lifecycle and deterministic room assignment
    this.io.on("connection", (socket) => {
      const user = socket.user || {};
      logger.info("[Realtime] Client connected: SocketID [%s], UserID [%s]", socket.id, user.id);

      // Auto-join personal user room
      if (user.id) {
        socket.join(`user:${user.id}`);
      }

      // Auto-join role-based room (e.g. role:admin, role:hr, role:employee)
      const role = (user.role || "").toLowerCase();
      if (role) {
        socket.join(`role:${role}`);
      }

      // Auto-join organization/tenant room if available
      if (user.organization_id) {
        socket.join(`org:${user.organization_id}`);
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
          if (typeof callback === "function") callback({ success: false, error: "Unauthorized room access" });
        }
      });

      socket.on("disconnect", (reason) => {
        logger.debug("[Realtime] Client disconnected: SocketID [%s], Reason: %s", socket.id, reason);
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
    const [type, id] = roomName.split(":");

    // Users can always join their own user room
    if (type === "user" && String(id) === String(user.id)) {
      return true;
    }

    // Role-based rooms require matching user role
    const role = (user.role || "").toLowerCase();
    if (type === "role" && role === String(id).toLowerCase()) {
      return true;
    }

    // Admins and HR have access to administrative event rooms
    if (["admin", "hr", "manager"].includes(role) && ["attendance", "leave", "notifications"].includes(roomName)) {
      return true;
    }

    // Org-level rooms require matching organization ID
    if (type === "org" && String(user.organization_id) === String(id)) {
      return true;
    }

    return false;
  }

  /**
   * Broadcast an event to a specific user across all API instances.
   */
  emitToUser(userId, eventType, data = {}, aggregateId = null) {
    if (!this.io) return;
    const envelope = createRealtimeEnvelope({
      eventType,
      aggregateType: "User",
      aggregateId: aggregateId || userId,
      payload: data
    });
    this.io.to(`user:${userId}`).emit(eventType, envelope);
    return envelope;
  }

  /**
   * Broadcast an event to a role (e.g. all admins or HR) across all API instances.
   */
  emitToRole(role, eventType, data = {}, aggregateId = null) {
    if (!this.io) return;
    const envelope = createRealtimeEnvelope({
      eventType,
      aggregateType: "Role",
      aggregateId: aggregateId || role,
      payload: data
    });
    this.io.to(`role:${role.toLowerCase()}`).emit(eventType, envelope);
    return envelope;
  }

  /**
   * Broadcast an event to all authenticated clients.
   */
  emitToAll(eventType, data = {}, aggregateType = "System", aggregateId = "0") {
    if (!this.io) return;
    const envelope = createRealtimeEnvelope({
      eventType,
      aggregateType,
      aggregateId,
      payload: data
    });
    this.io.emit(eventType, envelope);
    return envelope;
  }

  /**
   * Gracefully close Socket.IO server and Redis Pub/Sub connections.
   */
  async close() {
    if (this.io) {
      await new Promise((resolve) => this.io.close(resolve));
      this.io = null;
    }
    if (this.pubClient) {
      try { await this.pubClient.quit(); } catch { this.pubClient.disconnect(); }
      this.pubClient = null;
    }
    if (this.subClient) {
      try { await this.subClient.quit(); } catch { this.subClient.disconnect(); }
      this.subClient = null;
    }
    this.isInitialized = false;
    logger.info("[Realtime] Realtime service closed gracefully.");
  }
}

export const realtimeService = new RealtimeService();
export default realtimeService;
