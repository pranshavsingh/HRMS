// ============================================================================
// Controller: node_backend/src/controllers/rotation.controller.js
// Description: HTTP controllers for rotation pattern management and enrollment.
// ============================================================================

import { rotationService } from "../services/rotation.service.js";
import { siteService } from "../services/site.service.js";

export async function listRotations(req, res, next) {
  try {
    const { status, search } = req.query;
    const rotations = await rotationService.listRotations(req.tenantId, { status, search });
    return res.status(200).json(rotations);
  } catch (err) {
    next(err);
  }
}

export async function getRotationById(req, res, next) {
  try {
    const rotation = await rotationService.getRotationById(req.tenantId, req.params.id);
    return res.status(200).json(rotation);
  } catch (err) {
    next(err);
  }
}

export async function createRotation(req, res, next) {
  try {
    const created = await rotationService.createRotation(req.tenantId, req.body, req.user.id);
    return res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}

export async function publishRotation(req, res, next) {
  try {
    const published = await rotationService.publishRotation(req.tenantId, req.params.id, req.user.id);
    return res.status(200).json(published);
  } catch (err) {
    next(err);
  }
}

export async function enrollEmployee(req, res, next) {
  try {
    await siteService.ensureEmployeeVisible(req.tenantId, req.user, req.body.user_id, { workDate: req.body.start_date });
    const enrollment = await rotationService.enrollEmployee(
      req.tenantId,
      {
        ...req.body,
        rotation_id: req.params.id,
      },
      req.user.id
    );
    return res.status(201).json(enrollment);
  } catch (err) {
    next(err);
  }
}

export async function previewRotation(req, res, next) {
  try {
    const { startDate, endDate } = req.query;
    const preview = await rotationService.previewRotationSchedule(
      req.tenantId,
      req.params.id,
      startDate,
      endDate
    );
    return res.status(200).json(preview);
  } catch (err) {
    next(err);
  }
}
