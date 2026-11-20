// ============================================================================
// Controller: node_backend/src/controllers/weekly-off-policy.controller.js
// Description: Express controller for weekly-off policy endpoints.
// ============================================================================

import { weeklyOffPolicyService } from "../services/weekly-off-policy.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const listPolicies = asyncHandler(async (req, res) => {
  const policies = await weeklyOffPolicyService.listPolicies(req.tenantId);
  res.json({ policies });
});

export const getPolicy = asyncHandler(async (req, res) => {
  const policy = await weeklyOffPolicyService.getPolicyById(req.tenantId, req.params.id);
  res.json(policy);
});

export const createPolicy = asyncHandler(async (req, res) => {
  const policy = await weeklyOffPolicyService.createPolicy(req.tenantId, req.body, req.user);
  res.status(201).json(policy);
});

export const listPolicyVersions = asyncHandler(async (req, res) => {
  const versions = await weeklyOffPolicyService.listVersions(req.tenantId, req.params.id);
  res.json({ versions });
});

export const createDraftVersion = asyncHandler(async (req, res) => {
  const version = await weeklyOffPolicyService.createDraftVersion(req.tenantId, req.params.id, req.body, req.user);
  res.status(201).json(version);
});

export const updateDraftVersion = asyncHandler(async (req, res) => {
  const result = await weeklyOffPolicyService.updateDraftVersion(
    req.tenantId,
    req.params.id,
    req.params.versionId,
    req.body,
    req.user
  );
  res.json(result);
});

export const publishPolicyVersion = asyncHandler(async (req, res) => {
  const result = await weeklyOffPolicyService.publishPolicyVersion(
    req.tenantId,
    req.params.id,
    req.params.versionId,
    req.user
  );
  res.json(result);
});

export const archivePolicyVersion = asyncHandler(async (req, res) => {
  const result = await weeklyOffPolicyService.archivePolicyVersion(
    req.tenantId,
    req.params.id,
    req.params.versionId,
    req.user
  );
  res.json(result);
});
