import { z } from "zod";
import { AppError } from "./errorHandler.js";
import { fileTypeFromBuffer } from "file-type";
import logger from "../utils/logger.js";

// Helper function to create validation middleware (async-capable)
export const validate = (schema) => async (req, res, next) => {
  const result = await schema.safeParseAsync({
    body: req.body,
    query: req.query,
    params: req.params,
    cookies: req.cookies,
    headers: req.headers,
    file: req.file,
    files: req.files
  });

  if (!result.success) {
    const formattedErrors = {};
    let firstGenericError = null;

    for (const issue of result.error.issues) {
      let field = issue.path[issue.path.length - 1];
      const message = issue.message;

      // Map 'file' validation error to 'photo' to match the frontend expectations for punch routes
      if (field === "file") {
        field = "photo";
      }

      if (!firstGenericError) {
        firstGenericError = message;
      }

      if (!formattedErrors[field]) {
        formattedErrors[field] = [];
      }
      formattedErrors[field].push(message);
    }

    // Document upload generic format requirement check
    if (req.originalUrl.includes("/documents/upload/")) {
      return next(new AppError("user, title, file are required", 400));
    }

    // Return field-specific arrays if required by the frontend client
    if (
      formattedErrors.photo ||
      formattedErrors.photo_copy ||
      formattedErrors.photo_file ||
      formattedErrors.role ||
      formattedErrors.aadhar_file ||
      formattedErrors.pan_file ||
      formattedErrors.bank_file
    ) {
      return next(new AppError("Validation Error", 400, formattedErrors));
    }

    return next(new AppError(firstGenericError, 400));
  }

  req.validated = result.data;
  next();
};

const ALLOWED_MIMES = ["application/pdf", "image/jpeg", "image/jpg", "image/webp", "image/png"];
const ALLOWED_EXTS = ["pdf", "jpg", "jpeg", "webp", "png"];

async function validateFileBuffer(file, maxSize = 2 * 1024 * 1024) {
  if (!file || !file.buffer) {
    return { valid: false, error: "File upload is required" };
  }

  if (file.size > maxSize) {
    return { valid: false, error: `File size exceeds the limit of ${maxSize / (1024 * 1024)}MB` };
  }

  try {
    const typeInfo = await fileTypeFromBuffer(file.buffer);
    if (!typeInfo) {
      return { valid: false, error: "Unrecognized or corrupted file format" };
    }

    const mime = typeInfo.mime.toLowerCase();
    const ext = typeInfo.ext.toLowerCase();

    if (!ALLOWED_MIMES.includes(mime) || !ALLOWED_EXTS.includes(ext)) {
      return { valid: false, error: "Only PDF, JPEG, JPG, and WEBP formats are accepted" };
    }
  } catch (err) {
    logger.error("File MIME validation failed: %s", err.message);
    return { valid: false, error: "File validation failed" };
  }

  return { valid: true };
}

const ALLOWED_PHOTO_MIMES = ["image/jpeg", "image/jpg", "image/webp"];
const ALLOWED_PHOTO_EXTS = ["jpg", "jpeg", "webp"];

async function validatePhotoBuffer(file) {
  if (!file || !file.buffer) {
    return { valid: false, error: "Photo upload is required" };
  }

  try {
    const typeInfo = await fileTypeFromBuffer(file.buffer);
    if (!typeInfo) {
      return { valid: false, error: "Unrecognized or corrupted photo format" };
    }

    const mime = typeInfo.mime.toLowerCase();
    const ext = typeInfo.ext.toLowerCase();

    if (!ALLOWED_PHOTO_MIMES.includes(mime) || !ALLOWED_PHOTO_EXTS.includes(ext)) {
      return { valid: false, error: "Only JPEG, JPG, and WEBP formats are accepted for attendance photos" };
    }
  } catch (err) {
    logger.error("Photo MIME validation failed: %s", err.message);
    return { valid: false, error: "Photo validation failed" };
  }

  return { valid: true };
}

// 1. Authentication
export const loginSchema = z.object({
  body: z.object({
    username: z.string({ required_error: "username and password are required" }).min(1, "username and password are required"),
    password: z.string({ required_error: "username and password are required" }).min(1, "username and password are required")
  })
});

// 2. Request OTP
export const requestOtpSchema = z.object({
  body: z.object({
    email: z.string({ required_error: "Email is required" }).min(1, "Email is required")
  })
});

// 3. Verify OTP
export const verifyOtpSchema = z.object({
  body: z.object({
    email: z.string({ required_error: "Email and OTP are required" }).min(1, "Email and OTP are required"),
    otp: z.string({ required_error: "Email and OTP are required" }).min(1, "Email and OTP are required")
  })
});

// 4. Reset Password (Strict Cryptographic Reset Token Required)
export const resetPasswordSchema = z.object({
  body: z.object({
    email: z.string({ required_error: "Email is required" }).min(1, "Email is required"),
    reset_token: z.string({ required_error: "Cryptographic reset token is required" })
      .min(32, "Reset token must be a valid cryptographic token")
      .max(128, "Invalid reset token length"),
    new_password: z.string({ required_error: "New password is required" })
      .min(12, "Password must be at least 12 characters")
      .max(128, "Password must not exceed 128 characters")
  })
});

// 4b. Authenticated Change Password
export const changePasswordSchema = z.object({
  body: z.object({
    current_password: z.string({ required_error: "Current password is required" }).min(1, "Current password is required"),
    new_password: z.string({ required_error: "New password is required" })
      .min(12, "New password must be at least 12 characters")
      .max(128, "New password must not exceed 128 characters")
  })
});

// 5. Create Employee
export const createEmployeeSchema = z.object({
  body: z.object({
    username: z.string({ required_error: "username, first_name, password, role are required" }).trim().min(1, "username, first_name, password, role are required"),
    first_name: z.string({ required_error: "username, first_name, password, role are required" }).trim().min(1, "username, first_name, password, role are required"),
    last_name: z.string().trim().max(150).nullable().optional(),
    email: z.string().trim().max(254).nullable().optional(),
    password: z.string({ required_error: "username, first_name, password, role are required" })
      .min(12, "Password must be at least 12 characters")
      .max(128, "Password must not exceed 128 characters"),
    role: z.enum(["employee", "manager", "hr", "admin", "superadmin"], {
      errorMap: () => ({ message: "Only employee, manager, hr, admin, or superadmin can be created" })
    }),
    site_id: z.coerce.number().int().positive().nullable().optional(),
    manager: z.coerce.number().int().positive().nullable().optional(),
    team_name: z.string().trim().max(120).nullable().optional(),
    joining_date: z.string().nullable().optional(),
    leave_allotted: z.coerce.number().int().min(0).max(365).optional(),
    latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
    longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
    allowed_radius: z.coerce.number().int().min(1).max(50000).optional(),
    designation: z.string().trim().max(255).nullable().optional(),
    locations: z.any().optional()
  }),
  files: z.object({
    photo_copy: z.array(z.any()).optional(),
    photo_file: z.array(z.any()).optional(),
    aadhar_file: z.array(z.any()).optional(),
    pan_file: z.array(z.any()).optional(),
    bank_file: z.array(z.any()).optional(),
    cv_file: z.array(z.any()).optional(),
    voter_file: z.array(z.any()).optional(),
    dl_file: z.array(z.any()).optional()
  }).optional()
}).superRefine(async (data, ctx) => {
  if (["employee", "manager", "hr"].includes(data.body.role) && !data.body.site_id) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A work site is required for employee, manager, and HR accounts", path: ["body", "site_id"] });
  }
  const photoList = data.files?.photo_copy || data.files?.photo_file;
  if (!photoList || photoList.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Photo Copy document is required",
      path: ["photo_copy"]
    });
  }
  if (!data.files) return;
  const fields = ["photo_copy", "photo_file", "aadhar_file", "pan_file", "bank_file", "cv_file", "voter_file", "dl_file"];
  for (const field of fields) {
    const list = data.files[field];
    if (list && list.length > 0) {
      const check = await validateFileBuffer(list[0]);
      if (!check.valid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: check.error,
          path: [field],
        });
      }
    }
  }
});

// 5b. Update Employee
export const updateEmployeeSchema = z.object({
  params: z.object({
    user_id: z.coerce.number().int().positive({ message: "Invalid employee ID" })
  }),
  body: z.object({
    username: z.string().trim().min(1, "Username cannot be empty").max(150).optional(),
    first_name: z.string().trim().min(1, "First name cannot be empty").max(150).optional(),
    last_name: z.string().trim().max(150).nullable().optional(),
    email: z.string().trim().max(254).nullable().optional().or(z.literal("")),
    password: z.string().min(12, "Password must be between 12 and 128 characters").max(128, "Password must be between 12 and 128 characters").nullable().optional().or(z.literal("")),
    role: z.enum(["employee", "manager", "hr", "admin", "superadmin"], {
      errorMap: () => ({ message: "Only employee, manager, hr, admin, or superadmin can be assigned" })
    }).optional(),
    site_id: z.coerce.number().int().positive().nullable().optional(),
    manager: z.coerce.number().int().positive().nullable().optional().or(z.literal("")),
    team_name: z.string().trim().max(120).nullable().optional(),
    joining_date: z.string().nullable().optional(),
    leave_allotted: z.coerce.number().int().min(0, "Leave allotted cannot be negative").max(365, "Leave allotted cannot exceed 365 days").optional().or(z.literal("")),
    latitude: z.coerce.number().min(-90, "Latitude must be between -90 and 90").max(90, "Latitude must be between -90 and 90").nullable().optional().or(z.literal("")),
    longitude: z.coerce.number().min(-180, "Longitude must be between -180 and 180").max(180, "Longitude must be between -180 and 180").nullable().optional().or(z.literal("")),
    allowed_radius: z.coerce.number().int().min(1, "Allowed radius must be at least 1 meter").max(50000, "Allowed radius cannot exceed 50000 meters").optional().or(z.literal("")),
    designation: z.string().trim().max(255).nullable().optional(),
    is_active_employee: z.boolean().optional(),
    is_active: z.boolean().optional(),
    locations: z.any().optional()
  }).passthrough()
});

// 6. Punch In / Out
export const punchSchema = z.object({
  body: z.object({
    latitude: z.coerce.number({ required_error: "latitude and longitude are required" })
      .min(-90, "Latitude must be between -90 and 90")
      .max(90, "Latitude must be between -90 and 90"),
    longitude: z.coerce.number({ required_error: "latitude and longitude are required" })
      .min(-180, "Longitude must be between -180 and 180")
      .max(180, "Longitude must be between -180 and 180"),
    photo_public_id: z.string().optional(),
    photo_url: z.string().optional(),
  }),
  file: z.any().optional()
}).superRefine(async (data, ctx) => {
  if (data.file) {
    const check = await validatePhotoBuffer(data.file);
    if (!check.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: check.error,
        path: ["file"],
      });
    }
  } else if (!data.body?.photo_public_id && !data.body?.photo_url) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "This field is required.",
      path: ["file"],
    });
  }
});

// 7. Apply Leave
export const applyLeaveSchema = z.object({
  body: z.object({
    leave_type: z.string({ required_error: "leave_type, from_date, to_date, reason are required" }).min(1, "leave_type, from_date, to_date, reason are required"),
    from_date: z.string({ required_error: "leave_type, from_date, to_date, reason are required" }).min(1, "leave_type, from_date, to_date, reason are required"),
    to_date: z.string({ required_error: "leave_type, from_date, to_date, reason are required" }).min(1, "leave_type, from_date, to_date, reason are required"),
    reason: z.string({ required_error: "leave_type, from_date, to_date, reason are required" }).min(1, "leave_type, from_date, to_date, reason are required"),
    confirm_insufficient_balance: z.boolean().optional().default(false),
    confirmed_available_balance: z.number().finite().optional(),
    confirmed_projected_balance: z.number().finite().optional(),
    confirmed_balance_snapshot: z.string().max(5000).optional()
  })
});

export const leaveConcessionSchema = z.object({
  body: z.object({
    employee_id: z.number().int().positive(),
    leave_type: z.string().min(1).max(20),
    additional_days: z.number().finite().positive().max(365),
    effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    expiry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    reason: z.string().trim().min(1).max(2000),
    idempotency_key: z.string().min(8).max(100),
  })
});

export const leaveConcessionReversalSchema = z.object({
  body: z.object({ reason: z.string().trim().min(1).max(2000), idempotency_key: z.string().min(8).max(100) })
});

export const leavePolicyDraftSchema = z.object({
  body: z.object({
    reason: z.string().trim().min(1).max(2000),
    timezone: z.string().min(1).max(64),
    effective_from_fy_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    financial_year_start_month: z.number().int().min(1).max(12),
    financial_year_start_day: z.number().int().min(1).max(28),
    automatic_reset: z.boolean(),
    legacy_shared_pool_enabled: z.boolean(),
    proration_method: z.enum(["none", "monthly"]),
    leave_types: z.array(z.object({
      leave_code: z.string().trim().min(1).max(20), leave_name: z.string().trim().min(1).max(100),
      annual_entitlement: z.number().finite().min(0).max(365), is_paid: z.boolean(),
      carry_forward_enabled: z.boolean(), max_carry_forward_days: z.number().finite().min(0).max(365),
      carry_forward_expiry_days: z.number().int().min(1).max(3650).nullable().optional(),
      expired_balance_forfeited: z.boolean(), carry_forward_requires_approval: z.boolean(),
      minimum_application_days: z.number().finite().positive().max(365), maximum_consecutive_days: z.number().finite().positive().max(365).nullable().optional(),
      half_day_allowed: z.boolean(), requires_approval: z.boolean(), requires_document: z.boolean(),
      accrual_frequency: z.enum(["none", "monthly", "quarterly", "yearly"]), probation_restriction_months: z.number().int().min(0).max(60),
      active_status: z.boolean(), eligibility_rules: z.record(z.string(), z.unknown()).optional(),
    })).max(100),
  })
});

export const employeeLeaveEligibilitySchema = z.object({
  body: z.object({
    employee_id: z.number().int().positive(), leave_code: z.string().min(1).max(20), eligible: z.boolean(),
    entitlement_override: z.number().finite().min(0).max(365).nullable().optional(),
    effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), effective_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    reason: z.string().trim().min(1).max(2000),
  })
});

// 8. Leave Action
export const leaveActionSchema = z.object({
  params: z.object({
    leave_id: z.string().regex(/^\d+$/, "Invalid leave ID")
  }),
  body: z.object({
    status: z.enum(["approved", "rejected"], {
      errorMap: () => ({ message: "Invalid leave action" })
    })
  })
});

// 8b. Attendance Approval Action
export const attendanceApprovalActionSchema = z.object({
  params: z.object({
    approval_id: z.string().regex(/^\d+$/, "Invalid approval ID")
  }),
  body: z.object({
    status: z.enum(["approved", "rejected"], {
      errorMap: () => ({ message: "Status must be either 'approved' or 'rejected'" })
    }),
    comment: z.string().max(500, "Comment cannot exceed 500 characters").optional().nullable()
  })
});

// 9. Document Upload
export const uploadDocumentSchema = z.object({
  body: z.object({
    user: z.string({ required_error: "user, title, file are required" }).min(1, "user, title, file are required"),
    title: z.string({ required_error: "user, title, file are required" }).min(1, "user, title, file are required")
  }),
  file: z.any({ required_error: "user, title, file are required" })
}).superRefine(async (data, ctx) => {
  if (data.file) {
    const check = await validateFileBuffer(data.file);
    if (!check.valid) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: check.error,
        path: ["file"],
      });
    }
  }
});

// 10. Refresh Token
export const refreshTokenSchema = z.object({
  body: z.object({
    refresh_token: z.string().min(1).optional(),
    device_id: z.string().nullable().optional(),
    device_name: z.string().nullable().optional(),
    platform: z.enum(["web", "android", "ios", "mobile"]).optional(),
  }).passthrough().optional().default({}),
  cookies: z.object({
    refreshToken: z.string().min(1).optional(),
  }).passthrough().optional()
}).superRefine((data, ctx) => {
  const hasBodyToken = Boolean(data.body?.refresh_token);
  const hasCookieToken = Boolean(data.cookies?.refreshToken);
  if (!hasBodyToken && !hasCookieToken) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Refresh token is required",
      path: ["refresh_token"]
    });
  }
});

// 11. Logout
export const logoutSchema = z.object({
  body: z.object({
    refresh_token: z.string().optional(),
    platform: z.string().optional(),
  }).passthrough().optional().default({}),
  cookies: z.object({
    refreshToken: z.string().optional(),
  }).passthrough().optional()
});
