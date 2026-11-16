import crypto from "crypto";
import jwt from "jsonwebtoken";
import { config } from "../config/env.js";
import accountsService from "../services/accounts.service.js";
import accountsRepository from "../repositories/accounts.repository.js";
import redisService from "../services/redis.service.js";
import cloudinaryService from "../services/cloudinary.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AppError } from "../middleware/errorHandler.js";

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
  const result = await accountsService.createEmployee(req.body, req.files, req.user);
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
  const result = await accountsService.getManagers(req.query);
  res.json(result);
});

/**
 * List all active employees.
 */
export const employees = asyncHandler(async (req, res) => {
  const result = await accountsService.getEmployees(req.query);
  res.json(result);
});

/**
 * Admin dashboard overview stats.
 */
export const adminSummary = asyncHandler(async (req, res) => {
  const result = await accountsService.getAdminSummary();
  res.json(result);
});

/**
 * Update employee record.
 */
export const updateEmployee = asyncHandler(async (req, res) => {
  const result = await accountsService.updateEmployee(req.params.user_id, req.body, req.user);
  res.json(result);
});

/**
 * Delete employee (soft-delete).
 */
export const deleteEmployee = asyncHandler(async (req, res) => {
  const result = await accountsService.deleteEmployee(req.params.user_id, req.user);
  res.json(result);
});

/**
 * Upload general employee documents.
 */
export const uploadDocument = asyncHandler(async (req, res) => {
  const result = await accountsService.uploadDocument(req.body, req.file, req.user);
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
  const result = await accountsService.getEmployeeDocuments(req.params.user_id, req.user, req.query);
  res.json(result);
});

/**
 * Generate upload signature for direct frontend uploads.
 */
export const getCloudinarySignature = asyncHandler(async (req, res) => {
  const params = {};
  if (req.query.folder) params.folder = req.query.folder;
  if (req.query.public_id) params.public_id = req.query.public_id;
  if (req.query.upload_preset) params.upload_preset = req.query.upload_preset;

  const result = cloudinaryService.generateUploadSignature(params);
  res.json(result);
});

/**
 * Register a document uploaded directly to Cloudinary.
 */
export const registerDirectDocument = asyncHandler(async (req, res) => {
  const result = await accountsService.registerDirectDocument(req.body, req.user);
  res.status(201).json(result);
});

/**
 * Access a secure document detail and redirect to its signed URL.
 */
export const getDocumentDetailRedirect = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const fileUrl = await accountsService.getDocumentDetail(id, req.user, req.ip);
  res.redirect(302, fileUrl);
});

/**
 * Delete employee document (superadmin only).
 */
export const deleteDocument = asyncHandler(async (req, res) => {
  const result = await accountsService.deleteDocument(req.params.id, req.user);
  res.json(result);
});

/**
 * Get audit logs (superadmin only).
 */
export const getAuditLogs = asyncHandler(async (req, res) => {
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
  await redisService.set(ticketKey, userPayload, 30);
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
          const isBlacklisted = await redisService.get(`token:blacklist:${payload.jti}`);
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

  res.on("close", () => {
    clearInterval(heartbeat);
  });
});
