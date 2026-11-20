import leaveService from "../services/leave.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { resolveTenantId } from "../utils/tenant.js";

/**
 * Apply for a leave.
 */
export const applyLeave = asyncHandler(async (req, res) => {
  const { leave_type, from_date, to_date, reason, confirm_insufficient_balance, confirmed_available_balance, confirmed_projected_balance, confirmed_balance_snapshot } = req.body;
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const result = await leaveService.applyLeave(req.user.id, leave_type, from_date, to_date, reason, tenantId, confirm_insufficient_balance, { available: confirmed_available_balance, projected: confirmed_projected_balance, serialized: confirmed_balance_snapshot });
  res.json(result);
});

export const grantConcession = asyncHandler(async (req, res) => {
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const result = await leaveService.grantConcession(req.body, req.user, tenantId);
  res.status(201).json(result);
});

export const reverseConcession = asyncHandler(async (req, res) => {
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const result = await leaveService.reverseConcession(req.params.concession_id, req.body, req.user, tenantId);
  res.json(result);
});

export const concessionsForEmployee = asyncHandler(async (req, res) => {
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const result = await leaveService.concessionsForEmployee(req.params.employee_id, req.user, tenantId);
  res.json({ records: result });
});

/**
 * Get leave history of the logged-in employee.
 */
export const myLeaves = asyncHandler(async (req, res) => {
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const result = await leaveService.myLeaves(req.user.id, req.query, tenantId);
  res.json(result);
});

/**
 * List leave approvals actionable or visible to the user based on role.
 */
export const approvals = asyncHandler(async (req, res) => {
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const result = await leaveService.approvals(req.user.role, req.user.id, req.query, tenantId);
  res.json(result);
});

/**
 * Approve or reject a leave request.
 */
export const action = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const result = await leaveService.action(req.params.leave_id, status, req.user, tenantId);
  res.json(result);
});
