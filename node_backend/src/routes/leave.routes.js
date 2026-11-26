import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth.js";
import { validate, applyLeaveSchema, leaveActionSchema, leaveConcessionSchema, leaveConcessionReversalSchema } from "../middleware/validation.js";
import * as c from "../controllers/leave.controller.js";

const r = Router();

r.post("/apply/", authenticate, validate(applyLeaveSchema), c.applyLeave);
r.get("/my/", authenticate, c.myLeaves);
r.get("/approvals/", authenticate, authorize(["manager", "hr", "admin", "superadmin"]), c.approvals);
r.get("/approvals/pending-count", authenticate, authorize(["manager", "hr", "admin", "superadmin"]), c.pendingApprovalsCount);
r.post("/action/:leave_id/", authenticate, authorize(["manager", "hr", "admin", "superadmin"]), validate(leaveActionSchema), c.action);
r.post("/concessions/", authenticate, authorize(["hr", "admin", "superadmin"]), validate(leaveConcessionSchema), c.grantConcession);
r.get("/concessions/:employee_id/", authenticate, authorize(["hr", "admin", "superadmin"]), c.concessionsForEmployee);
r.post("/concessions/:concession_id/reverse/", authenticate, authorize(["hr", "admin", "superadmin"]), validate(leaveConcessionReversalSchema), c.reverseConcession);

export default r;
