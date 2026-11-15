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

const ALLOWED_MIMES = ["application/pdf", "image/jpeg", "image/jpg", "image/webp"];
const ALLOWED_EXTS = ["pdf", "jpg", "jpeg", "webp"];

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
    username: z.string({ required_error: "username, first_name, password, role are required" }).min(1, "username, first_name, password, role are required"),
    first_name: z.string({ required_error: "username, first_name, password, role are required" }).min(1, "username, first_name, password, role are required"),
    password: z.string({ required_error: "username, first_name, password, role are required" })
      .min(12, "Password must be at least 12 characters")
      .max(128, "Password must not exceed 128 characters"),
    role: z.enum(["employee", "manager", "hr", "admin", "superadmin"], {
      errorMap: () => ({ message: "Only employee, manager, hr, admin, or superadmin can be created" })
    }),
    manager: z.coerce.number().int().positive().nullable().optional(),
    team_name: z.string().max(120).nullable().optional(),
    joining_date: z.string().nullable().optional(),
    leave_allotted: z.coerce.number().int().min(0).max(365).optional(),
    latitude: z.coerce.number().min(-90).max(90).nullable().optional(),
    longitude: z.coerce.number().min(-180).max(180).nullable().optional(),
    allowed_radius: z.coerce.number().int().min(1).max(50000).optional(),
    designation: z.string().max(255).nullable().optional(),
    locations: z.any().optional()
  }),
  files: z.object({
    aadhar_file: z.array(z.any()).min(1, "Aadhar, PAN and bank details documents are required"),
    pan_file: z.array(z.any()).min(1, "Aadhar, PAN and bank details documents are required"),
    bank_file: z.array(z.any()).min(1, "Aadhar, PAN and bank details documents are required"),
    cv_file: z.array(z.any()).optional(),
    voter_file: z.array(z.any()).optional(),
    dl_file: z.array(z.any()).optional()
  }, { required_error: "Aadhar, PAN and bank details documents are required" })
}).superRefine(async (data, ctx) => {
  const fields = ["aadhar_file", "pan_file", "bank_file", "cv_file", "voter_file", "dl_file"];
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
    reason: z.string({ required_error: "leave_type, from_date, to_date, reason are required" }).min(1, "leave_type, from_date, to_date, reason are required")
  })
});

// 8. Leave Action
export const leaveActionSchema = z.object({
  body: z.object({
    status: z.enum(["approved", "rejected"], {
      errorMap: () => ({ message: "Invalid leave action" })
    })
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
