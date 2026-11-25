import attendanceService from "../services/attendance.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { resolveTenantId } from "../utils/tenant.js";
import { AppError } from "../middleware/errorHandler.js";

/**
 * Log punch-in event.
 */
export const punchIn = asyncHandler(async (req, res) => {
  const { latitude, longitude, photo_public_id, photo_url, accuracy } = req.body;
  const directPath = photo_public_id ? `cloudinary://${photo_public_id}` : (photo_url || null);
  const result = await attendanceService.punchIn(req.user.id, latitude, longitude, req.file, req.user, directPath, accuracy);
  res.json(result);
});

/**
 * Log punch-out event.
 */
export const punchOut = asyncHandler(async (req, res) => {
  const { latitude, longitude, photo_public_id, photo_url, accuracy } = req.body;
  const directPath = photo_public_id ? `cloudinary://${photo_public_id}` : (photo_url || null);
  const result = await attendanceService.punchOut(req.user.id, latitude, longitude, req.file, req.user, directPath, accuracy);
  res.json(result);
});

/**
 * Generate upload signature for direct client-to-Cloudinary upload.
 */
export const getAttendanceUploadSignature = asyncHandler(async (req, res) => {
  const result = attendanceService.getUploadSignature(req.user.id);
  res.json(result);
});

/**
 * Check today's punch-in/out status.
 */
export const status = asyncHandler(async (req, res) => {
  const result = await attendanceService.punchStatus(req.user.id);
  res.json(result);
});

/**
 * Retrieve actionable/visible punch approvals list.
 */
export const approvals = asyncHandler(async (req, res) => {
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const result = await attendanceService.approvals(req.user.id, req.user.role, req.query, tenantId);
  res.json(result);
});

/**
 * Approve or reject location exception punches.
 */
export const approvalAction = asyncHandler(async (req, res) => {
  const { status: decision, comment } = req.body;
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const result = await attendanceService.approvalAction(req.params.approval_id, decision, comment, req.user, tenantId);
  res.json(result);
});

/**
 * Employee dashboard metrics.
 */
export const dashboard = asyncHandler(async (req, res) => {
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const result = await attendanceService.dashboard(req.user.id, tenantId);
  res.json(result);
});

/**
 * HR Operations Dashboard Overview.
 */
export const hrDashboard = asyncHandler(async (req, res) => {
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const result = await attendanceService.hrDashboard(req.user.id, req.user.role, tenantId);
  res.json(result);
});

/**
 * Manager dashboard metrics.
 */
export const managerDashboard = asyncHandler(async (req, res) => {
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const result = await attendanceService.managerDashboard(req.user.id, req.user.role, tenantId);
  res.json(result);
});

/**
 * Team analytics insights (under target hours, shortfall analysis).
 */
export const teamAnalytics = asyncHandler(async (req, res) => {
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const result = await attendanceService.teamAnalytics(
    req.user.id,
    req.query.days,
    req.user.role,
    tenantId,
    req.query.site_id || null
  );
  res.json(result);
});

/**
 * Team attendance register summary.
 */
export const teamAttendance = asyncHandler(async (req, res) => {
  const platform = (req.headers["x-platform"] || req.query?.platform || "").toLowerCase();
  const isExport = req.query.export === "true" || req.query.format === "csv" || req.headers["x-export"] === "true";
  if (isExport && ["mobile", "android", "ios"].includes(platform)) {
    throw new AppError("Data and attendance exports are restricted on mobile devices in accordance with security policy", 403);
  }
  const { month, employee_id, detail_start, detail_end, page, limit, team } = req.query;
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const result = await attendanceService.teamAttendance(
    req.user.id,
    month,
    employee_id,
    detail_start,
    detail_end,
    req.user.role,
    page,
    limit,
    team,
    tenantId,
    req.query.site_id || null
  );
  res.json(result);
});

/**
 * Retrieve personal punch history logs.
 */
export const history = asyncHandler(async (req, res) => {
  const result = await attendanceService.getHistory(req.user.id, req.query);
  res.json(result);
});

/**
 * Retrieve personal monthly attendance register.
 */
export const myMonthlyRegister = asyncHandler(async (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const result = await attendanceService.myMonthlyRegister(req.user.id, month, tenantId);
  res.json(result);
});

/**
 * Regularize an incomplete or forgotten attendance record (BUG-A09).
 */
export const regularizeAttendance = asyncHandler(async (req, res) => {
  const { attendance_id, punch_out_time, reason } = req.body || {};
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const result = await attendanceService.regularizeAttendance(req.user.id, attendance_id, punch_out_time, reason, tenantId);
  res.json({ success: true, ...result });
});
