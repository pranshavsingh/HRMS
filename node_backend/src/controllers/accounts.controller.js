import accountsService from "../services/accounts.service.js";
import cloudinaryService from "../services/cloudinary.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * Handle user login.
 */
export const login = asyncHandler(async (req, res) => {
  const { username, password, device_id, device_name, platform } = req.body;
  const deviceInfo = {
    deviceId: device_id || null,
    deviceName: device_name || null,
    platform: platform || (req.headers["user-agent"] ? "web" : "unknown"),
    ipAddress: req.ip || null
  };
  const result = await accountsService.login(username, password, deviceInfo);
  res.json(result);
});

/**
 * Refresh access token using refresh token.
 */
export const refreshToken = asyncHandler(async (req, res) => {
  const { refresh_token, device_id, device_name, platform } = req.body;
  const deviceInfo = {
    deviceId: device_id || null,
    deviceName: device_name || null,
    platform: platform || (req.headers["user-agent"] ? "web" : "unknown"),
    ipAddress: req.ip || null
  };
  const result = await accountsService.refreshSession(refresh_token, deviceInfo);
  res.json(result);
});

/**
 * Invalidate refresh token on logout.
 */
export const logout = asyncHandler(async (req, res) => {
  const { refresh_token } = req.body;
  const result = await accountsService.logoutSession(refresh_token);
  res.json(result);
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
  res.status(201).json(result);
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

import { realtimeManager } from "../utils/realtime.js";

/**
 * Server-Sent Events stream for real-time notifications.
 */
export const realtimeUpdatesStream = (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

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
};
