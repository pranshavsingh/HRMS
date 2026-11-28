import crypto from "crypto";
import jwt from "jsonwebtoken";
import { config } from "../config/env.js";
import accountsService from "../services/accounts.service.js";
import accountsRepository from "../repositories/accounts.repository.js";
import attendanceService from "../services/attendance.service.js";
import leaveService from "../services/leave.service.js";
import redisService from "../services/redis.service.js";
import cloudinaryService from "../services/cloudinary.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middleware/errorHandler.js";
import { resolveTenantId } from "../utils/tenant.js";
import logger from "../utils/logger.js";
import { db } from "../db/index.js";

function isWebClient(req) {
  const platformHeader = (req.headers["x-platform"] || "").toLowerCase();
  const bodyPlatform = (req.body?.platform || "").toLowerCase();
  if (["mobile", "android", "ios"].includes(platformHeader) || ["mobile", "android", "ios"].includes(bodyPlatform)) {
    return false;
  }
  if (platformHeader === "web" || bodyPlatform === "web") {
    return true;
  }
  if (req.cookies && req.cookies.refreshToken) {
    return true;
  }
  if (req.body?.refresh_token && !req.cookies?.refreshToken) {
    return false;
  }
  return true;
}

/**
 * Handle user login.
 */
export const login = asyncHandler(async (req, res) => {
  const { username, password, device_id, device_name, platform } = req.body || {};
  const isWeb = isWebClient(req);
  const deviceInfo = {
    deviceId: device_id || null,
    deviceName: device_name || null,
    platform: platform || (isWeb ? "web" : "unknown"),
    ipAddress: req.ip || null
  };
  const result = await accountsService.login(username, password, deviceInfo);

  if (isWeb) {
    const isProduction = process.env.NODE_ENV === "production";
    res.cookie("refreshToken", result.refresh, {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
      path: "/api",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days = 2592000s
    });
    return res.json({
      status: "success",
      access: result.access,
      refresh: null,
      user: result.user,
      data: {
        access: result.access,
        refresh: null,
        user: result.user
      }
    });
  }

  return res.json({
    status: "success",
    access: result.access,
    refresh: result.refresh,
    user: result.user,
    data: {
      access: result.access,
      refresh: result.refresh,
      user: result.user
    }
  });
});

/**
 * Refresh access token using refresh token.
 */
export const refreshToken = asyncHandler(async (req, res) => {
  const isWeb = isWebClient(req);
  const rawToken = req.body?.refresh_token || req.cookies?.refreshToken;
  if (!rawToken) {
    throw new AppError("Refresh token is required", 400);
  }

  const { device_id, device_name, platform } = req.body || {};
  const deviceInfo = {
    deviceId: device_id || null,
    deviceName: device_name || null,
    platform: platform || (isWeb ? "web" : "unknown"),
    ipAddress: req.ip || null
  };
  const result = await accountsService.refreshSession(rawToken, deviceInfo);

  if (isWeb) {
    // Only set cookie if NOT a concurrent grace window response
    if (!result.concurrent_refresh && result.refresh) {
      const isProduction = process.env.NODE_ENV === "production";
      res.cookie("refreshToken", result.refresh, {
        httpOnly: true,
        sameSite: "lax",
        secure: isProduction,
        path: "/api",
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });
    }
    return res.json({
      status: "success",
      access: result.access,
      refresh: null,
      concurrent_refresh: Boolean(result.concurrent_refresh),
      user: result.user,
      data: {
        access: result.access,
        refresh: null,
        concurrent_refresh: Boolean(result.concurrent_refresh),
        user: result.user
      }
    });
  }

  return res.json({
    status: "success",
    access: result.access,
    refresh: result.refresh,
    concurrent_refresh: Boolean(result.concurrent_refresh),
    user: result.user,
    data: {
      access: result.access,
      refresh: result.refresh,
      concurrent_refresh: Boolean(result.concurrent_refresh),
      user: result.user
    }
  });
});

/**
 * Invalidate refresh token and sessions on logout.
 */
export const logout = asyncHandler(async (req, res) => {
  const rawToken = req.cookies?.refreshToken || req.body?.refresh_token;

  let tokenPayload = null;
  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    try {
      tokenPayload = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] });
    } catch {
      tokenPayload = jwt.decode(token);
    }
  }

  const result = await accountsService.logoutSession(rawToken, tokenPayload, req.user);

  const isProduction = process.env.NODE_ENV === "production";
  res.clearCookie("refreshToken", {
    path: "/api",
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
  });

  res.json({
    status: "success",
    message: result.message || "Logged out successfully"
  });
});

/**
 * Send password reset OTP email.
 */
export const requestPasswordResetOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const result = await accountsService.requestPasswordResetOtp(email);
  res.json(result);
});

/**
 * Verify password reset OTP code.
 */
export const verifyPasswordResetOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  const result = await accountsService.verifyPasswordResetOtp(email, otp);
  res.json(result);
});

/**
 * Reset password using verified cryptographic reset token.
 */
export const resetPasswordWithOtp = asyncHandler(async (req, res) => {
  const { email, reset_token, new_password } = req.body;
  const result = await accountsService.resetPasswordWithOtp(email, reset_token, new_password);
  res.json(result);
});

/**
 * Change password for authenticated user with current-password verification.
 */
export const changePassword = asyncHandler(async (req, res) => {
  const { current_password, new_password } = req.body;
  const result = await accountsService.changePassword(req.user.id, current_password, new_password);
  res.json(result);
});

/**
 * Create a new employee (admin/hr only).
 */
export const createEmployee = asyncHandler(async (req, res) => {
  const platform = (req.headers["x-platform"] || req.body?.platform || req.query?.platform || "").toLowerCase();
  if (["mobile", "android", "ios"].includes(platform)) {
    throw new AppError("Employee account creation is restricted on mobile devices in accordance with security policy", 403);
  }
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const result = await accountsService.createEmployee(req.body, req.files, req.user, tenantId);
  const employeeId = result.employee?.id || result.id;
  res.status(201).json({
    ...result,
    id: employeeId,
    data: {
      ...result,
      id: employeeId
    }
  });
});

/**
 * List active managers.
 */
export const managers = asyncHandler(async (req, res) => {
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const result = await accountsService.getManagers(req.query, tenantId, req.user);
  res.json(result);
});

/**
 * List all active employees.
 */
export const employees = asyncHandler(async (req, res) => {
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const result = await accountsService.getEmployees(req.query, tenantId, req.user);
  res.json(result);
});

/**
 * Admin dashboard overview stats.
 */
export const adminSummary = asyncHandler(async (req, res) => {
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const result = await accountsService.getAdminSummary(tenantId);
  res.json(result);
});

/**
 * Update employee record.
 */
export const updateEmployee = asyncHandler(async (req, res) => {
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const result = await accountsService.updateEmployee(req.params.user_id, req.body, req.user, tenantId);
  res.json(result);
});

/**
 * Delete employee record (admin/superadmin only).
 */
export const deleteEmployee = asyncHandler(async (req, res) => {
  const targetId = parseInt(req.params.user_id, 10);
  if (!Number.isSafeInteger(targetId) || targetId <= 0) {
    throw new AppError("Invalid employee ID", 400);
  }
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const result = await accountsService.deleteEmployee(targetId, req.user, tenantId);
  res.json({ status: "success", message: "Employee deleted successfully", data: result });
});

/**
 * Upload general employee documents.
 */
export const uploadDocument = asyncHandler(async (req, res) => {
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const result = await accountsService.uploadDocument(req.body, req.file, req.user, tenantId);
  res.json(result);
});

/**
 * Get current employee's documents.
 */
export const myDocuments = asyncHandler(async (req, res) => {
  const result = await accountsService.getMyDocuments(req.user.id, req.query);
  res.json(result);
});

/**
 * Get targeted employee's documents (admin/hr/manager only).
 */
export const employeeDocuments = asyncHandler(async (req, res) => {
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const result = await accountsService.getEmployeeDocuments(req.params.user_id, req.user, req.query, tenantId);
  res.json(result);
});

/**
 * Generate upload signature for direct frontend uploads.
 */
export const getCloudinarySignature = asyncHandler(async (req, res) => {
  const params = {};
  if (req.query.folder) {
    const folder = String(req.query.folder).trim();
    if (folder.includes("..")) {
      throw new AppError("Invalid upload folder", 400);
    }
    const isPrivileged = ["admin", "hr", "superadmin"].includes(req.user?.role);
    const ownDocPrefix = `employee-documents/${req.user.id}`;
    const isOwnDocFolder = folder === ownDocPrefix || folder.startsWith(`${ownDocPrefix}/`);
    const isAttendanceFolder = folder.startsWith("attendance/");
    if (!isPrivileged && !isOwnDocFolder && !isAttendanceFolder) {
      throw new AppError("Forbidden: You are not authorized to upload to this folder", 403);
    }
    params.folder = folder;
  }
  if (req.query.public_id) params.public_id = String(req.query.public_id).trim();
  if (req.query.upload_preset) params.upload_preset = String(req.query.upload_preset).trim();

  const result = cloudinaryService.generateUploadSignature(params);
  res.json(result);
});

/**
 * Register a document uploaded directly to Cloudinary.
 */
export const registerDirectDocument = asyncHandler(async (req, res) => {
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const result = await accountsService.registerDirectDocument(req.body, req.user, tenantId);
  res.status(201).json(result);
});

/**
 * Access a secure document detail and redirect to its signed URL.
 */
export const getDocumentDetailRedirect = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const isDownload = req.query.download === "true" || req.query.download === "1";
  const platform = (req.headers["x-platform"] || req.query?.platform || "").toLowerCase();
  if (isDownload && ["mobile", "android", "ios"].includes(platform)) {
    throw new AppError("Document and data exports are restricted on mobile devices in accordance with security policy", 403);
  }
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const fileUrl = await accountsService.getDocumentDetail(id, req.user, req.ip, tenantId, {
    attachment: isDownload,
    download: isDownload,
  });
  res.redirect(302, fileUrl);
});

/**
 * Access a secure document and redirect to its signed attachment download URL.
 */
export const downloadDocument = asyncHandler(async (req, res) => {
  const platform = (req.headers["x-platform"] || req.query?.platform || "").toLowerCase();
  if (["mobile", "android", "ios"].includes(platform)) {
    throw new AppError("Document and data exports are restricted on mobile devices in accordance with security policy", 403);
  }
  const { id } = req.params;
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const fileUrl = await accountsService.getDocumentDetail(id, req.user, req.ip, tenantId, {
    attachment: true,
    download: true,
  });
  res.redirect(302, fileUrl);
});

/**
 * Delete employee document (superadmin only).
 */
export const deleteDocument = asyncHandler(async (req, res) => {
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const result = await accountsService.deleteDocument(req.params.id, req.user, tenantId);
  res.json(result);
});

/**
 * Get audit logs (superadmin only).
 */
export const getAuditLogs = asyncHandler(async (req, res) => {
  const isExport = req.query.export === "true" || req.query.format === "csv" || req.query.download === "true";
  if (isExport) {
    const platform = (req.headers["x-platform"] || req.query?.platform || "").toLowerCase();
    if (["mobile", "android", "ios"].includes(platform)) {
      throw new AppError("Data and document exports are restricted on mobile devices in accordance with security policy", 403);
    }
  }
  const result = await accountsService.getAuditLogs(req.user, req.query);
  res.json(result);
});

/**
 * Create a single-use ephemeral ticket for SSE streams (Mechanism 3).
 */
export const createRealtimeTicket = asyncHandler(async (req, res) => {
  const ticketId = crypto.randomUUID();
  const ticketKey = `sse:ticket:${ticketId}`;
  const userPayload = {
    id: req.user.id,
    username: req.user.username,
    email: req.user.email,
    role: req.user.role,
    organization_id: req.user.organization_id || null,
  };
  const stored = await redisService.set(ticketKey, userPayload, 30);
  if (!stored) {
    throw new AppError("Realtime ticket service is unavailable. Please try again.", 503);
  }
  res.json({
    status: "success",
    ticket: ticketId,
    expires_in: 30,
    data: {
      ticket: ticketId,
      expires_in: 30,
      expiresIn: 30,
    }
  });
});

import { realtimeManager } from "../utils/realtime.js";

/**
 * Server-Sent Events stream for real-time notifications.
 * Supports Mechanism 2 (Bearer Header) and Mechanism 3 (single-use ticket).
 */
export const realtimeUpdatesStream = asyncHandler(async (req, res) => {
  // 1. Strict rejection of raw JWT URL query parameters (VULN-04 fix)
  if (req.query?.token || req.query?.access_token || req.query?.jwt) {
    return res.status(401).json({ error: "Raw tokens in URL query parameters are strictly forbidden" });
  }

  // If user not set by middleware, authenticate using Bearer header or ticket
  if (!req.user) {
    const authHeader = req.headers.authorization || "";
    if (authHeader.startsWith("Bearer ")) {
      const token = authHeader.slice(7).trim();
      try {
        const payload = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] });
        if (payload.type && payload.type !== "access") {
          return res.status(401).json({ error: "Invalid token type" });
        }
        if (payload.jti) {
          let isBlacklisted = await redisService.get(`token:blacklist:${payload.jti}`);
          if (!isBlacklisted) {
            try {
              const revokedRow = await db.get(
                "SELECT id FROM accounts_revoked_token WHERE jti = ? AND expires_at > NOW() LIMIT 1",
                [payload.jti]
              );
              if (revokedRow) isBlacklisted = true;
            } catch {
              // Suppress fallback error
            }
          }
          if (isBlacklisted) {
            return res.status(401).json({ error: "Token has been revoked" });
          }
        }
        const user = await accountsRepository.findById(payload.userId);
        if (!user || !user.is_active) {
          return res.status(401).json({ error: "Invalid token" });
        }
        req.user = user;
      } catch (e) {
        return res.status(401).json({ error: "Invalid token" });
      }
    } else if (req.query?.ticket) {
      const ticketKey = `sse:ticket:${req.query.ticket}`;
      const userPayload = await redisService.getdel(ticketKey);
      if (!userPayload) {
        return res.status(401).json({ error: "Invalid, expired, or already consumed ticket" });
      }
      req.user = userPayload;
    } else {
      return res.status(401).json({ error: "Authentication required" });
    }
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  if (typeof res.flushHeaders === "function") {
    res.flushHeaders();
  }

  realtimeManager.addClient(res, req.user);

  const heartbeat = setInterval(() => {
    res.write(":\n\n");
    if (typeof res.flush === "function") {
      res.flush();
    }
  }, 30000);
  if (heartbeat.unref) {
    heartbeat.unref();
  }

  res.on("close", () => {
    clearInterval(heartbeat);
  });
});

/**
 * Authoritative Realtime State Synchronization Endpoint
 * Reconciles missed events and counters when clients reconnect or foreground.
 */
export const realtimeSync = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const role = (req.user.role || "").toLowerCase();
  const tenantId = req.tenantId || 1;
  const since = req.query.since || null;

  const { realtimeService } = await import("../services/realtime.service.js");
  const events = realtimeService.getEventsSince(since, {
    tenantId,
    userId,
    role,
  });

  let pendingAttendanceApprovals = 0;
  let pendingLeaveApprovals = 0;
  let degraded = false;

  if (["manager", "hr", "admin", "superadmin"].includes(role)) {
    try {
      const attCountRes = await attendanceService.pendingApprovalsCount(userId, role, req.query, tenantId);
      pendingAttendanceApprovals = Number(attCountRes?.count || 0);
    } catch (err) {
      degraded = true;
      logger.error("[realtimeSync] Failed to query pending attendance approvals: %s", err.message);
    }

    try {
      const leaveCountRes = await leaveService.pendingApprovalsCount(role, userId, req.query, tenantId);
      pendingLeaveApprovals = Number(leaveCountRes?.count || 0);
    } catch (err) {
      degraded = true;
      logger.error("[realtimeSync] Failed to query pending leave approvals: %s", err.message);
    }
  }

  res.json({
    timestamp: new Date().toISOString(),
    userId,
    tenantId,
    role,
    degraded,
    metrics: {
      pendingAttendanceApprovals,
      pendingLeaveApprovals,
    },
    events,
  });
});
