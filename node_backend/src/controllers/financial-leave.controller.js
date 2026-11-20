import financialLeaveService from "../services/financial-leave.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { resolveTenantId } from "../utils/tenant.js";

const tenant = (req) => resolveTenantId({ user: req.user, query: req.query, headers: req.headers });

export const availableTypes = asyncHandler(async (req, res) => {
  const tenantId = await tenant(req);
  res.json({ leave_types: await financialLeaveService.availableTypes(tenantId) });
});

export const getPolicy = asyncHandler(async (req, res) => {
  res.json(await financialLeaveService.getCompanyPolicy(await tenant(req), req.user));
});

export const saveDraft = asyncHandler(async (req, res) => {
  res.status(201).json(await financialLeaveService.saveDraft(await tenant(req), req.body, req.user));
});

export const previewPolicy = asyncHandler(async (req, res) => {
  res.json(await financialLeaveService.previewPolicy(await tenant(req), req.params.version_id, req.user));
});

export const publishPolicy = asyncHandler(async (req, res) => {
  res.json(await financialLeaveService.publishPolicy(await tenant(req), req.params.version_id, req.user));
});

export const resetRuns = asyncHandler(async (req, res) => {
  res.json({ records: await financialLeaveService.listResetRuns(await tenant(req), req.user) });
});

export const employeeBalances = asyncHandler(async (req, res) => {
  res.json(await financialLeaveService.employeeBalances(await tenant(req), req.user, req.query));
});

export const reconcileReset = asyncHandler(async (req, res) => {
  res.json(await financialLeaveService.runReset(await tenant(req), req.body.financial_year_start || null, req.user));
});

export const setEligibility = asyncHandler(async (req, res) => {
  res.status(201).json(await financialLeaveService.setEmployeeEligibility(await tenant(req), req.body, req.user));
});
