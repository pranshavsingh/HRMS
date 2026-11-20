import { Router } from "express";
import { authenticate, authorize, authenticateRealtime } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";
import {
  validate,
  loginSchema,
  refreshTokenSchema,
  logoutSchema,
  requestOtpSchema,
  verifyOtpSchema,
  resetPasswordSchema,
  changePasswordSchema,
  createEmployeeSchema,
  updateEmployeeSchema,
  uploadDocumentSchema
} from "../middleware/validation.js";
import * as c from "../controllers/accounts.controller.js";
import { attachTenantContext } from "../utils/tenant.js";

const r = Router();

// Public auth endpoints
r.post("/login/", validate(loginSchema), c.login);
r.post("/refresh/", validate(refreshTokenSchema), c.refreshToken);
r.post("/logout/", validate(logoutSchema), c.logout);
r.post("/forgot-password/request-otp/", validate(requestOtpSchema), c.requestPasswordResetOtp);
r.post("/forgot-password/verify-otp/", validate(verifyOtpSchema), c.verifyPasswordResetOtp);
r.post("/forgot-password/reset/", validate(resetPasswordSchema), c.resetPasswordWithOtp);
r.post("/change-password/", authenticate, validate(changePasswordSchema), c.changePassword);

// Employee management endpoints
r.post(
  "/create-employee/",
  authenticate,
  attachTenantContext,
  authorize(["admin", "hr", "superadmin"]),
  upload.fields([
    { name: "photo_copy", maxCount: 1 },
    { name: "photo_file", maxCount: 1 },
    { name: "aadhar_file", maxCount: 1 },
    { name: "pan_file", maxCount: 1 },
    { name: "bank_file", maxCount: 1 },
    { name: "cv_file", maxCount: 1 },
    { name: "voter_file", maxCount: 1 },
    { name: "dl_file", maxCount: 1 }
  ]),
  validate(createEmployeeSchema),
  c.createEmployee
);

r.get("/admin-summary/", authenticate, authorize(["admin", "superadmin"]), c.adminSummary);
r.get("/managers/", authenticate, authorize(["admin", "hr", "superadmin"]), c.managers);
r.get("/employees/", authenticate, attachTenantContext, authorize(["admin", "hr", "superadmin"]), c.employees);
r.put("/employees/:user_id/", authenticate, attachTenantContext, authorize(["admin", "hr", "superadmin"]), validate(updateEmployeeSchema), c.updateEmployee);

// Document upload & retrieval endpoints
r.post(
  "/documents/upload/",
  authenticate,
  upload.single("file"),
  validate(uploadDocumentSchema),
  c.uploadDocument
);

r.get("/documents/my/", authenticate, c.myDocuments);
r.get("/documents/:user_id/", authenticate, attachTenantContext, authorize(["admin", "hr", "manager", "superadmin"]), c.employeeDocuments);

// Cloudinary signature, direct document registration, and secure detail endpoints
import rateLimit from "express-rate-limit";
const signatureLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Limit to 20 uploads per hour per user
  message: { error: "Signature request limit exceeded. Max 20 uploads per hour." },
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => (req.user ? String(req.user.id) : (req.ip || "unknown")),
});

r.get("/cloudinary/signature/", authenticate, signatureLimiter, c.getCloudinarySignature);
r.post("/documents/register/", authenticate, c.registerDirectDocument);
r.get("/documents/detail/:id/", authenticate, c.getDocumentDetailRedirect);
r.get("/documents/download/:id/", authenticate, attachTenantContext, c.downloadDocument);
r.delete("/documents/:id/", authenticate, attachTenantContext, authorize(["superadmin"]), c.deleteDocument);
r.get("/audit-logs/", authenticate, authorize(["superadmin"]), c.getAuditLogs);
r.post("/realtime/ticket/", authenticate, c.createRealtimeTicket);
r.get("/realtime/", authenticateRealtime, c.realtimeUpdatesStream);

export default r;
