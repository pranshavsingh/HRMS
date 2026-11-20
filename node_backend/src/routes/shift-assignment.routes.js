// ============================================================================
// Routes: node_backend/src/routes/shift-assignment.routes.js
// Description: REST endpoints for employee shift assignments and bulk scheduling.
// ============================================================================

import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth.js";
import { attachTenantContext } from "../utils/tenant.js";
import * as assignmentController from "../controllers/shift-assignment.controller.js";

const router = Router();

const ASSIGNMENT_MANAGEMENT_ROLES = ["admin", "hr", "superadmin"];

router.use(authenticate);
router.use(attachTenantContext);

// --- Administrative Endpoints ---
router.get("/", authorize([...ASSIGNMENT_MANAGEMENT_ROLES, "manager"]), assignmentController.listAssignments);
router.get("/:id", authorize([...ASSIGNMENT_MANAGEMENT_ROLES, "manager"]), assignmentController.getAssignmentById);

router.post("/", authorize(ASSIGNMENT_MANAGEMENT_ROLES), assignmentController.createDraftAssignment);
router.post("/bulk", authorize(ASSIGNMENT_MANAGEMENT_ROLES), assignmentController.bulkAssign);
router.post("/:id/publish", authorize(ASSIGNMENT_MANAGEMENT_ROLES), assignmentController.publishAssignment);
router.post("/:id/cancel", authorize(ASSIGNMENT_MANAGEMENT_ROLES), assignmentController.cancelAssignment);

export default router;
