// ============================================================================
// Controller: node_backend/src/controllers/shift.controller.js
// Description: Express controller for shift templates, versions, and break endpoints.
// ============================================================================

import { shiftService } from "../services/shift.service.js";
import { shiftVersionService } from "./../services/shift-version.service.js";
import { shiftBreakService } from "../services/shift-break.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// ============================================================================
// Shift Templates
// ============================================================================

export const listShifts = asyncHandler(async (req, res) => {
  const result = await shiftService.listShifts(req.tenantId, req.query);
  res.json(result);
});

export const getShift = asyncHandler(async (req, res) => {
  const shift = await shiftService.getShiftById(req.tenantId, req.params.id);
  res.json(shift);
});

export const createShift = asyncHandler(async (req, res) => {
  const shift = await shiftService.createShift(req.tenantId, req.body, req.user);
  res.status(201).json(shift);
});

export const updateShift = asyncHandler(async (req, res) => {
  const shift = await shiftService.updateShift(req.tenantId, req.params.id, req.body, req.user);
  res.json(shift);
});

export const toggleShiftStatus = asyncHandler(async (req, res) => {
  const { is_active } = req.body;
  const shift = await shiftService.toggleShiftStatus(req.tenantId, req.params.id, is_active, req.user);
  res.json(shift);
});

export const deleteShift = asyncHandler(async (req, res) => {
  const result = await shiftService.deleteShift(req.tenantId, req.params.id, req.user);
  res.json(result);
});

// ============================================================================
// Shift Versions
// ============================================================================

export const listShiftVersions = asyncHandler(async (req, res) => {
  const versions = await shiftVersionService.listVersions(req.tenantId, req.params.id);
  res.json({ versions });
});

export const getShiftVersion = asyncHandler(async (req, res) => {
  const version = await shiftVersionService.getVersionById(req.tenantId, req.params.id, req.params.versionId);
  res.json(version);
});

export const createDraftVersion = asyncHandler(async (req, res) => {
  const version = await shiftVersionService.createDraftVersion(req.tenantId, req.params.id, req.body, req.user);
  res.status(201).json(version);
});

export const updateDraftVersion = asyncHandler(async (req, res) => {
  const result = await shiftVersionService.updateDraftVersion(
    req.tenantId,
    req.params.id,
    req.params.versionId,
    req.body,
    req.user
  );
  res.json(result);
});

export const publishVersion = asyncHandler(async (req, res) => {
  const result = await shiftVersionService.publishVersion(
    req.tenantId,
    req.params.id,
    req.params.versionId,
    req.user
  );
  res.json(result);
});

export const archiveVersion = asyncHandler(async (req, res) => {
  const result = await shiftVersionService.archiveVersion(
    req.tenantId,
    req.params.id,
    req.params.versionId,
    req.user
  );
  res.json(result);
});

// ============================================================================
// Shift Breaks
// ============================================================================

export const listBreaks = asyncHandler(async (req, res) => {
  const breaks = await shiftBreakService.getBreaksByVersionId(
    req.tenantId,
    req.params.id,
    req.params.versionId
  );
  res.json({ breaks });
});

export const addBreak = asyncHandler(async (req, res) => {
  const breakRecord = await shiftBreakService.addBreak(
    req.tenantId,
    req.params.id,
    req.params.versionId,
    req.body,
    req.user
  );
  res.status(201).json(breakRecord);
});

export const updateBreak = asyncHandler(async (req, res) => {
  const updated = await shiftBreakService.updateBreak(
    req.tenantId,
    req.params.id,
    req.params.versionId,
    req.params.breakId,
    req.body,
    req.user
  );
  res.json(updated);
});

export const deleteBreak = asyncHandler(async (req, res) => {
  const result = await shiftBreakService.deleteBreak(
    req.tenantId,
    req.params.id,
    req.params.versionId,
    req.params.breakId,
    req.user
  );
  res.json(result);
});
