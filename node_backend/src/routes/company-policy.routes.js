// ============================================================================
// Routes: node_backend/src/routes/company-policy.routes.js
// Description: Company attendance policy routes.
// ============================================================================

import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth.js";
import { attachTenantContext } from "../utils/tenant.js";
import * as policyController from "../controllers/company-policy.controller.js";

const router = Router();

const POLICY_MANAGEMENT_ROLES = ["admin", "hr", "superadmin"];
const POLICY_READ_ROLES = ["admin", "hr", "superadmin", "manager"];

router.use(authenticate);
router.use(attachTenantContext);

router.get("/", authorize(POLICY_READ_ROLES), policyController.listPolicies);
router.post("/", authorize(POLICY_MANAGEMENT_ROLES), policyController.createPolicy);
router.get("/:id", authorize(POLICY_READ_ROLES), policyController.getPolicy);

router.get("/:id/versions", authorize(POLICY_READ_ROLES), policyController.listPolicyVersions);
router.post("/:id/versions", authorize(POLICY_MANAGEMENT_ROLES), policyController.createDraftVersion);
router.patch("/:id/versions/:versionId", authorize(POLICY_MANAGEMENT_ROLES), policyController.updateDraftVersion);
router.post("/:id/versions/:versionId/publish", authorize(POLICY_MANAGEMENT_ROLES), policyController.publishPolicyVersion);
router.post("/:id/versions/:versionId/archive", authorize(POLICY_MANAGEMENT_ROLES), policyController.archivePolicyVersion);

export default router;
