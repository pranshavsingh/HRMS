import { Router } from "express";
import { authenticate, authorize } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";
import { validate, punchSchema } from "../middleware/validation.js";
import * as c from "../controllers/attendance.controller.js";

const r = Router();

r.get("/upload-params/", authenticate, c.getAttendanceUploadSignature);
r.post("/punch-in/", authenticate, upload.single("photo"), validate(punchSchema), c.punchIn);
r.post("/punch-out/", authenticate, upload.single("photo"), validate(punchSchema), c.punchOut);
r.get("/status/", authenticate, c.status);
r.get("/approvals/", authenticate, c.approvals);
r.post("/approvals/:approval_id/", authenticate, authorize(["manager", "hr", "admin", "superadmin"]), c.approvalAction);
r.get("/dashboard/", authenticate, c.dashboard);
r.get("/hr-dashboard/", authenticate, authorize(["hr", "superadmin"]), c.hrDashboard);
r.get("/manager-dashboard/", authenticate, authorize(["manager", "superadmin"]), c.managerDashboard);
r.get("/team-analytics/", authenticate, authorize(["manager", "hr", "admin", "superadmin"]), c.teamAnalytics);
r.get("/team-attendance/", authenticate, authorize(["manager", "hr", "admin", "superadmin"]), c.teamAttendance);
r.get("/history/", authenticate, c.history);

export default r;
