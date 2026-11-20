import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth.js";
import { attachTenantContext } from "../utils/tenant.js";
import * as controller from "../controllers/site.controller.js";

const router = Router();
const siteAdmins = ["admin", "superadmin"];

router.use(authenticate, attachTenantContext);
router.get("/", authorize(["admin", "hr", "manager", "superadmin"]), controller.list);
router.post("/", authorize(siteAdmins), controller.create);
router.patch("/:siteId", authorize(siteAdmins), controller.update);
router.delete("/:siteId", authorize(["superadmin"]), controller.remove);
router.put("/:siteId/assignments/:userId", authorize(siteAdmins), controller.assignEmployee);
router.get("/:siteId/assignments", authorize(siteAdmins), controller.listAssignments);
router.get("/:siteId/access", authorize(siteAdmins), controller.listAccess);
router.put("/:siteId/access/:userId", authorize(siteAdmins), controller.grantAccess);
router.delete("/:siteId/access/:userId", authorize(siteAdmins), controller.revokeAccess);

export default router;
