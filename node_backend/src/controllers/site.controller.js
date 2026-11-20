import { asyncHandler } from "../utils/asyncHandler.js";
import { siteService } from "../services/site.service.js";

export const list = asyncHandler(async (req, res) => {
  const sites = await siteService.listSites(req.tenantId, req.user, { includeInactive: req.query.include_inactive === "true" });
  res.json({ sites, can_view_all: siteService.isGlobalRole(req.user.role) });
});

export const create = asyncHandler(async (req, res) => {
  const site = await siteService.createSite(req.tenantId, req.body, req.user);
  res.status(201).json(site);
});

export const update = asyncHandler(async (req, res) => {
  const site = await siteService.updateSite(req.tenantId, req.params.siteId, req.body, req.user);
  res.json(site);
});

export const assignEmployee = asyncHandler(async (req, res) => {
  const assignmentId = await siteService.assignEmployee(
    req.tenantId,
    req.params.userId,
    req.params.siteId,
    req.body.effective_from,
    req.user
  );
  res.status(201).json({ id: assignmentId, user_id: Number(req.params.userId), site_id: Number(req.params.siteId) });
});

export const listAssignments = asyncHandler(async (req, res) => {
  await siteService.getSiteScope(req.tenantId, req.user, req.params.siteId);
  const assignments = await siteService.listSiteAssignments(req.tenantId, req.params.siteId);
  res.json({ assignments });
});

export const listAccess = asyncHandler(async (req, res) => {
  const site = await siteService.getSiteScope(req.tenantId, req.user, req.params.siteId);
  res.json({ access: site.siteIds?.length ? await siteService.listSiteAccess(req.tenantId, req.params.siteId) : [] });
});

export const grantAccess = asyncHandler(async (req, res) => {
  const result = await siteService.grantSiteAccess(req.tenantId, req.params.userId, req.params.siteId, req.user);
  res.status(201).json(result);
});

export const revokeAccess = asyncHandler(async (req, res) => {
  const result = await siteService.revokeSiteAccess(req.tenantId, req.params.userId, req.params.siteId);
  res.json(result);
});

export const remove = asyncHandler(async (req, res) => {
  const result = await siteService.deleteSite(req.tenantId, req.params.siteId, req.user);
  res.json(result);
});
