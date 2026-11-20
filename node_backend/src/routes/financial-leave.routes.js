import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth.js";
import { attachTenantContext } from "../utils/tenant.js";
import { validate, leavePolicyDraftSchema, employeeLeaveEligibilitySchema } from "../middleware/validation.js";
import * as controller from "../controllers/financial-leave.controller.js";

const router = Router();
const managementRoles = ["hr", "admin", "superadmin"];

router.use(authenticate, attachTenantContext);
router.get("/available-types/", controller.availableTypes);
router.use(authorize(managementRoles));
router.get("/", controller.getPolicy);
router.post("/drafts/", validate(leavePolicyDraftSchema), controller.saveDraft);
router.get("/balances/", controller.employeeBalances);
router.post("/:version_id/preview/", controller.previewPolicy);
router.post("/:version_id/publish/", controller.publishPolicy);
router.get("/reset-runs/", controller.resetRuns);
router.post("/reset-runs/reconcile/", controller.reconcileReset);
router.post("/employee-eligibility/", validate(employeeLeaveEligibilitySchema), controller.setEligibility);

export default router;
