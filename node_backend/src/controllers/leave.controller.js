import leaveService from "../services/leave.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/**
 * Apply for a leave.
 */
export const applyLeave = asyncHandler(async (req, res) => {
  const { leave_type, from_date, to_date, reason } = req.body;
  const result = await leaveService.applyLeave(req.user.id, leave_type, from_date, to_date, reason);
  res.json(result);
});

/**
 * Get leave history of the logged-in employee.
 */
export const myLeaves = asyncHandler(async (req, res) => {
  const result = await leaveService.myLeaves(req.user.id, req.query);
  res.json(result);
});

/**
 * List leave approvals actionable or visible to the user based on role.
 */
export const approvals = asyncHandler(async (req, res) => {
  const result = await leaveService.approvals(req.user.role, req.user.id, req.query);
  res.json(result);
});

/**
 * Approve or reject a leave request.
 */
export const action = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const result = await leaveService.action(req.params.leave_id, status, req.user);
  res.json(result);
});