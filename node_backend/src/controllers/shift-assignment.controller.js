// ============================================================================
// Controller: node_backend/src/controllers/shift-assignment.controller.js
// Description: HTTP controllers for shift assignments and bulk operations.
// ============================================================================

import { shiftAssignmentService } from "../services/shift-assignment.service.js";
import { siteService } from "../services/site.service.js";

export async function listAssignments(req, res, next) {
  try {
    const { userId, team, status, page, limit } = req.query;
    const siteScope = await siteService.getSiteScope(req.tenantId, req.user, req.query.site_id || null);
    const result = await shiftAssignmentService.listAssignments(req.tenantId, {
      userId,
      team,
      status,
      page,
      limit,
      siteScope,
      actor: req.user,
    });
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function getAssignmentById(req, res, next) {
  try {
    const assignment = await shiftAssignmentService.getAssignmentById(req.tenantId, req.params.id);
    await siteService.ensureEmployeeVisible(req.tenantId, req.user, assignment.user_id, { requireDirectReport: req.user.role === "manager", workDate: assignment.effective_from });
    return res.status(200).json(assignment);
  } catch (err) {
    next(err);
  }
}

export async function createDraftAssignment(req, res, next) {
  try {
    await siteService.ensureEmployeeVisible(req.tenantId, req.user, req.body.user_id, { requireDirectReport: req.user.role === "manager", workDate: req.body.effective_from });
    const draft = await shiftAssignmentService.createDraftAssignment(
      req.tenantId,
      req.body,
      req.user.id
    );
    return res.status(201).json(draft);
  } catch (err) {
    next(err);
  }
}

export async function publishAssignment(req, res, next) {
  try {
    const assignment = await shiftAssignmentService.getAssignmentById(req.tenantId, req.params.id);
    await siteService.ensureEmployeeVisible(req.tenantId, req.user, assignment.user_id, { requireDirectReport: req.user.role === "manager", workDate: assignment.effective_from });
    const published = await shiftAssignmentService.publishAssignment(
      req.tenantId,
      req.params.id,
      req.user.id
    );
    return res.status(200).json(published);
  } catch (err) {
    next(err);
  }
}

export async function cancelAssignment(req, res, next) {
  try {
    const { reason } = req.body;
    const assignment = await shiftAssignmentService.getAssignmentById(req.tenantId, req.params.id);
    await siteService.ensureEmployeeVisible(req.tenantId, req.user, assignment.user_id, { requireDirectReport: req.user.role === "manager", workDate: assignment.effective_from });
    const result = await shiftAssignmentService.cancelAssignment(
      req.tenantId,
      req.params.id,
      reason,
      req.user.id
    );
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

export async function bulkAssign(req, res, next) {
  try {
    for (const userId of req.body.userIds || []) {
      await siteService.ensureEmployeeVisible(req.tenantId, req.user, userId, { requireDirectReport: req.user.role === "manager", workDate: req.body.effectiveFrom });
    }
    const result = await shiftAssignmentService.bulkAssign(
      req.tenantId,
      req.body,
      req.user.id
    );
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
