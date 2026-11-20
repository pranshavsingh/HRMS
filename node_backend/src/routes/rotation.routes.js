// ============================================================================
// Routes: node_backend/src/routes/rotation.routes.js
// Description: REST endpoints for rotation patterns and employee rotation enrollments.
// ============================================================================

import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth.js";
import { attachTenantContext } from "../utils/tenant.js";
import * as rotationController from "../controllers/rotation.controller.js";

const router = Router();

const ROTATION_MANAGEMENT_ROLES = ["admin", "hr", "superadmin"];

router.use(authenticate);
router.use(attachTenantContext);

router.get("/", authorize([...ROTATION_MANAGEMENT_ROLES, "manager"]), rotationController.listRotations);
router.get("/:id", authorize([...ROTATION_MANAGEMENT_ROLES, "manager"]), rotationController.getRotationById);
router.get("/:id/preview", authorize([...ROTATION_MANAGEMENT_ROLES, "manager"]), rotationController.previewRotation);

router.post("/", authorize(ROTATION_MANAGEMENT_ROLES), rotationController.createRotation);
router.post("/:id/publish", authorize(ROTATION_MANAGEMENT_ROLES), rotationController.publishRotation);
router.post("/:id/enroll", authorize(ROTATION_MANAGEMENT_ROLES), rotationController.enrollEmployee);

export default router;
