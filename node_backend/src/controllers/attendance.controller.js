import attendanceService from "../services/attendance.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * Log punch-in event.
 */
export const punchIn = asyncHandler(async (req, res) => {
  const { latitude, longitude, photo_public_id, photo_url } = req.body;
  const directPath = photo_public_id ? `cloudinary://${photo_public_id}` : (photo_url || null);
  const result = await attendanceService.punchIn(req.user.id, latitude, longitude, req.file, req.user, directPath);
  res.json(result);
});

/**
 * Log punch-out event.
 */
export const punchOut = asyncHandler(async (req, res) => {
  const { latitude, longitude, photo_public_id, photo_url } = req.body;
  const directPath = photo_public_id ? `cloudinary://${photo_public_id}` : (photo_url || null);
  const result = await attendanceService.punchOut(req.user.id, latitude, longitude, req.file, req.user, directPath);
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
  const result = await attendanceService.approvals(req.user.id, req.user.role, req.query);
  res.json(result);
});

/**
 * Approve or reject location exception punches.
 */
export const approvalAction = asyncHandler(async (req, res) => {
  const { status: decision, comment } = req.body;
  const result = await attendanceService.approvalAction(req.params.approval_id, decision, comment, req.user);
  res.json(result);
});

/**
 * Employee dashboard metrics.
 */
export const dashboard = asyncHandler(async (req, res) => {
  const result = await attendanceService.dashboard(req.user.id);
  res.json(result);
});

/**
 * HR Operations Dashboard Overview.
 */
export const hrDashboard = asyncHandler(async (req, res) => {
  const result = await attendanceService.hrDashboard(req.user.id, req.user.role);
  res.json(result);
});

/**
 * Manager dashboard metrics.
 */
export const managerDashboard = asyncHandler(async (req, res) => {
  const result = await attendanceService.managerDashboard(req.user.id, req.user.role);
  res.json(result);
});

/**
 * Team analytics insights (under target hours, shortfall analysis).
 */
export const teamAnalytics = asyncHandler(async (req, res) => {
  const result = await attendanceService.teamAnalytics(req.user.id, req.query.days, req.user.role);
  res.json(result);
});

/**
 * Team attendance register summary.
 */
export const teamAttendance = asyncHandler(async (req, res) => {
  const { month, employee_id, detail_start, detail_end, page, limit, team } = req.query;
  const result = await attendanceService.teamAttendance(
    req.user.id,
    month,
    employee_id,
    detail_start,
    detail_end,
    req.user.role,
    page,
    limit,
    team
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
