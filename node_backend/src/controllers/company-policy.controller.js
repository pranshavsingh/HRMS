// ============================================================================
// Controller: node_backend/src/controllers/company-policy.controller.js
// Description: Express controller for company attendance policy endpoints.
// ============================================================================

import { companyPolicyService } from "../services/company-policy.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const listPolicies = asyncHandler(async (req, res) => {
  const policies = await companyPolicyService.listPolicies(req.tenantId);
  res.json({ policies });
});

export const getPolicy = asyncHandler(async (req, res) => {
  const policy = await companyPolicyService.getPolicyById(req.tenantId, req.params.id);
  res.json(policy);
});

export const createPolicy = asyncHandler(async (req, res) => {
  const policy = await companyPolicyService.createPolicy(req.tenantId, req.body, req.user);
  res.status(201).json(policy);
});

export const listPolicyVersions = asyncHandler(async (req, res) => {
  const versions = await companyPolicyService.listVersions(req.tenantId, req.params.id);
  res.json({ versions });
});

export const createDraftVersion = asyncHandler(async (req, res) => {
  const version = await companyPolicyService.createDraftVersion(req.tenantId, req.params.id, req.body, req.user);
  res.status(201).json(version);
});

export const updateDraftVersion = asyncHandler(async (req, res) => {
  const result = await companyPolicyService.updateDraftVersion(
    req.tenantId,
    req.params.id,
    req.params.versionId,
    req.body,
    req.user
  );
  res.json(result);
});

export const publishPolicyVersion = asyncHandler(async (req, res) => {
  const result = await companyPolicyService.publishPolicyVersion(
    req.tenantId,
    req.params.id,
    req.params.versionId,
    req.user
  );
  res.json(result);
});

export const archivePolicyVersion = asyncHandler(async (req, res) => {
  const result = await companyPolicyService.archivePolicyVersion(
    req.tenantId,
    req.params.id,
    req.params.versionId,
    req.user
  );
  res.json(result);
});
