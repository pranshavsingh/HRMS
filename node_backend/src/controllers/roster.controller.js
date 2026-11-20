// ============================================================================
// Controller: node_backend/src/controllers/roster.controller.js
// Description: HTTP controllers for roster generation, calendar queries, publication,
//              and employee self-service schedule retrieval.
// ============================================================================

import { rosterService } from "../services/roster.service.js";
import { siteService } from "../services/site.service.js";
import { AppError } from "../middleware/errorHandler.js";

export async function listRosters(req, res, next) {
  try {
    const { status, teamName, startDate, endDate } = req.query;
    const siteScope = await siteService.getSiteScope(req.tenantId, req.user, req.query.site_id || null);
    const rosters = await rosterService.listRosterHeaders(req.tenantId, {
      status,
      teamName,
      startDate,
      endDate,
      siteScope,
    });
    return res.status(200).json(rosters);
  } catch (err) {
    next(err);
  }
}

export async function getRosterById(req, res, next) {
  try {
    const roster = await rosterService.getRosterHeaderById(req.tenantId, req.params.id, req.user.role === "manager" ? req.user.id : null);
    if (roster.site_id == null && !siteService.isGlobalRole(req.user.role)) throw new AppError("Roster does not belong to an assigned site", 403);
    await siteService.getSiteScope(req.tenantId, req.user, roster.site_id || null);
    return res.status(200).json(roster);
  } catch (err) {
    next(err);
  }
}

export async function generateDraftRoster(req, res, next) {
  try {
    const siteScope = await siteService.getSiteScope(req.tenantId, req.user, req.body.site_id || null);
    const result = await rosterService.generateDraftRoster(req.tenantId, { ...req.body, siteScope }, req.user.id);
    return res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getRosterCalendar(req, res, next) {
  try {
    const { startDate, endDate, teamName, userId, status } = req.query;
    const siteScope = await siteService.getSiteScope(req.tenantId, req.user, req.query.site_id || null);
    const calendar = await rosterService.getRosterCalendar(req.tenantId, {
      start_date: startDate,
      end_date: endDate,
      team_name: teamName,
      user_id: userId,
      status,
      siteScope,
      manager_id: req.user.role === "manager" ? req.user.id : null,
    });
    return res.status(200).json(calendar);
  } catch (err) {
    next(err);
  }
}

export async function publishRoster(req, res, next) {
  try {
    const roster = await rosterService.getRosterHeaderById(req.tenantId, req.params.id);
    if (roster.site_id == null && !siteService.isGlobalRole(req.user.role)) throw new AppError("Roster does not belong to an assigned site", 403);
    await siteService.getSiteScope(req.tenantId, req.user, roster.site_id || null);
    const result = await rosterService.publishRoster(req.tenantId, req.params.id, req.user.id);
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getMyRoster(req, res, next) {
  try {
    const { startDate, endDate } = req.query;
    const schedule = await rosterService.getMyRoster(req.tenantId, req.user.id, {
      start_date: startDate,
      end_date: endDate,
    });
    return res.status(200).json(schedule);
  } catch (err) {
    next(err);
  }
}
