import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth.js";
import { attachTenantContext } from "../utils/tenant.js";
import * as controller from "../controllers/company-holiday.controller.js";

const router = Router();
const HOLIDAY_EDITORS = ["hr", "admin", "superadmin"];

router.use(authenticate);
router.get("/tenants", authorize(["superadmin"]), controller.tenants);
router.use(attachTenantContext);

router.get("/upcoming", controller.upcoming);
router.get("/", controller.list);
router.get("/:id", controller.get);
router.post("/", authorize(HOLIDAY_EDITORS), controller.create);
router.patch("/:id", authorize(HOLIDAY_EDITORS), controller.update);
router.delete("/:id", authorize(HOLIDAY_EDITORS), controller.remove);

export default router;
