import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth.js";
import { validate, applyLeaveSchema, leaveActionSchema } from "../middleware/validation.js";
import * as c from "../controllers/leave.controller.js";

const r = Router();

r.post("/apply/", authenticate, validate(applyLeaveSchema), c.applyLeave);
r.get("/my/", authenticate, c.myLeaves);
r.get("/approvals/", authenticate, c.approvals);
r.post("/action/:leave_id/", authenticate, authorize(["manager", "hr", "admin", "superadmin"]), validate(leaveActionSchema), c.action);

export default r;