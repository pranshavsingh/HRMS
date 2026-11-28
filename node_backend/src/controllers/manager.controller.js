import managerTeamService from "../services/manager-team.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { resolveTenantId } from "../utils/tenant.js";

export const getTeamMembers = asyncHandler(async (req, res) => {
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const result = await managerTeamService.getTeamMembers(req.user, req.query, tenantId);
  res.json(result);
});

export const getTeamAttendance = asyncHandler(async (req, res) => {
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const result = await managerTeamService.getTeamAttendanceByDate(req.user, req.query, tenantId);
  res.json(result);
});

export const getEmployeeMonthlyRegister = asyncHandler(async (req, res) => {
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const result = await managerTeamService.getEmployeeMonthlyRegister(req.user, req.params.employeeId, req.query, tenantId);
  res.json(result);
});

export const getEmployeeDailyAttendance = asyncHandler(async (req, res) => {
  const tenantId = await resolveTenantId({ user: req.user, query: req.query, headers: req.headers });
  const result = await managerTeamService.getEmployeeDailyAttendance(req.user, req.params.employeeId, req.params.date, tenantId);
  res.json(result);
});
