// ============================================================================
// Routes: node_backend/src/routes/shift.routes.js
// Description: Shift templates, versions, and break endpoints.
// ============================================================================

import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth.js";
import { attachTenantContext } from "../utils/tenant.js";
import * as shiftController from "../controllers/shift.controller.js";

const router = Router();

const SHIFT_MANAGEMENT_ROLES = ["admin", "hr", "superadmin"];

router.use(authenticate);
router.use(authorize(SHIFT_MANAGEMENT_ROLES));
router.use(attachTenantContext);

// --- Shift Templates ---
router.get("/", shiftController.listShifts);
router.post("/", shiftController.createShift);
router.get("/:id", shiftController.getShift);
router.patch("/:id", shiftController.updateShift);
router.put("/:id", shiftController.updateShift);
router.patch("/:id/status", shiftController.toggleShiftStatus);
router.delete("/:id", shiftController.deleteShift);

// --- Shift Versions ---
router.get("/:id/versions", shiftController.listShiftVersions);
router.post("/:id/versions", shiftController.createDraftVersion);
router.get("/:id/versions/:versionId", shiftController.getShiftVersion);
router.patch("/:id/versions/:versionId", shiftController.updateDraftVersion);
router.post("/:id/versions/:versionId/publish", shiftController.publishVersion);
router.post("/:id/versions/:versionId/archive", shiftController.archiveVersion);

// --- Shift Breaks ---
router.get("/:id/versions/:versionId/breaks", shiftController.listBreaks);
router.post("/:id/versions/:versionId/breaks", shiftController.addBreak);
router.patch("/:id/versions/:versionId/breaks/:breakId", shiftController.updateBreak);
router.delete("/:id/versions/:versionId/breaks/:breakId", shiftController.deleteBreak);

export default router;
