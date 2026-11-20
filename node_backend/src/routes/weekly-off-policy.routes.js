// ============================================================================
// Routes: node_backend/src/routes/weekly-off-policy.routes.js
// Description: Weekly-off policy routes.
// ============================================================================

import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth.js";
import { attachTenantContext } from "../utils/tenant.js";
import * as weeklyOffController from "../controllers/weekly-off-policy.controller.js";

const router = Router();

const POLICY_MANAGEMENT_ROLES = ["admin", "hr", "superadmin"];
const POLICY_READ_ROLES = ["admin", "hr", "superadmin", "manager"];

router.use(authenticate);
router.use(attachTenantContext);

router.get("/", authorize(POLICY_READ_ROLES), weeklyOffController.listPolicies);
router.post("/", authorize(POLICY_MANAGEMENT_ROLES), weeklyOffController.createPolicy);
router.get("/:id", authorize(POLICY_READ_ROLES), weeklyOffController.getPolicy);

router.get("/:id/versions", authorize(POLICY_READ_ROLES), weeklyOffController.listPolicyVersions);
router.post("/:id/versions", authorize(POLICY_MANAGEMENT_ROLES), weeklyOffController.createDraftVersion);
router.patch("/:id/versions/:versionId", authorize(POLICY_MANAGEMENT_ROLES), weeklyOffController.updateDraftVersion);
router.post("/:id/versions/:versionId/publish", authorize(POLICY_MANAGEMENT_ROLES), weeklyOffController.publishPolicyVersion);
router.post("/:id/versions/:versionId/archive", authorize(POLICY_MANAGEMENT_ROLES), weeklyOffController.archivePolicyVersion);

export default router;
