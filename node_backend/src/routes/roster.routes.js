// ============================================================================
// Routes: node_backend/src/routes/roster.routes.js
// Description: REST endpoints for roster generation, calendar matrices,
//              atomic publication, and employee self-service (`my-roster`).
// ============================================================================

import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth.js";
import { attachTenantContext } from "../utils/tenant.js";
import * as rosterController from "../controllers/roster.controller.js";

const router = Router();

const ROSTER_MANAGEMENT_ROLES = ["admin", "hr", "superadmin"];

router.use(authenticate);
router.use(attachTenantContext);

// --- 1. Employee Self-Service Endpoint (Available to all authenticated employees) ---
router.get("/my-roster", rosterController.getMyRoster);

// --- 2. Interactive Calendar Matrix (Management + Managers for their team) ---
router.get("/calendar", authorize([...ROSTER_MANAGEMENT_ROLES, "manager"]), rosterController.getRosterCalendar);

// --- 3. Administrative Roster Management ---
router.get("/", authorize([...ROSTER_MANAGEMENT_ROLES, "manager"]), rosterController.listRosters);
router.get("/:id", authorize([...ROSTER_MANAGEMENT_ROLES, "manager"]), rosterController.getRosterById);

router.post("/generate", authorize(ROSTER_MANAGEMENT_ROLES), rosterController.generateDraftRoster);
router.post("/:id/publish", authorize(ROSTER_MANAGEMENT_ROLES), rosterController.publishRoster);

export default router;
