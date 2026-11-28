import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth.js";
import * as c from "../controllers/manager.controller.js";

const r = Router();

r.get("/team", authenticate, authorize(["manager", "hr", "admin", "superadmin"]), c.getTeamMembers);
r.get("/team/attendance", authenticate, authorize(["manager", "hr", "admin", "superadmin"]), c.getTeamAttendance);
r.get("/team/:employeeId/attendance", authenticate, authorize(["manager", "hr", "admin", "superadmin"]), c.getEmployeeMonthlyRegister);
r.get("/team/:employeeId/attendance/:date", authenticate, authorize(["manager", "hr", "admin", "superadmin"]), c.getEmployeeDailyAttendance);

export default r;
