import "dotenv/config";

export const config = {
  port: Number(process.env.PORT || 8000),
  jwtSecret: process.env.JWT_SECRET || "change-me-node-secret",
  dbClient: process.env.DB_CLIENT || "mysql",
  dbPath: process.env.DB_PATH || "./db.sqlite3",
  mysqlHost: process.env.MYSQL_HOST || "",
  mysqlPort: Number(process.env.MYSQL_PORT || 3306),
  mysqlUser: process.env.MYSQL_USER || "",
  mysqlPassword: process.env.MYSQL_PASSWORD || "",
  mysqlDatabase: process.env.MYSQL_DATABASE || "",
  mysqlConnectionLimit: Number(
    process.env.MYSQL_CONNECTION_LIMIT || (process.env.IS_WORKER === "true" ? 5 : 15)
  ),
  redisUrl: process.env.REDIS_URL || "redis://127.0.0.1:6379",
  smtpHost: process.env.SMTP_HOST || "smtp.hostinger.com",
  smtpPort: Number(process.env.SMTP_PORT || 465),
  smtpSecure: String(process.env.SMTP_SECURE || "true") === "true",
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  mailFrom: process.env.MAIL_FROM || "",
  otpSecret: process.env.OTP_SECRET || "change-me-otp-secret",
  otpExpiryMinutes: Number(process.env.OTP_EXPIRY_MINUTES || 10),
  mediaRoot: process.env.MEDIA_ROOT || "./src/uploads",
  corsOrigin: process.env.CORS_ORIGIN || "*",
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || "",
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY || "",
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET || "",
  cloudinaryAttendancePreset: process.env.CLOUDINARY_ATTENDANCE_PRESET || "attendance_preset",
  cloudinaryDocumentsPreset: process.env.CLOUDINARY_DOCUMENTS_PRESET || "documents_preset",
};

export function validateProductionEnv(env = process.env) {
  const errors = [];

  // 1. JWT Secret Validation
  const jwtSecret = env.JWT_SECRET || "";
  if (!jwtSecret || jwtSecret.includes("change-me") || jwtSecret.length < 32) {
    errors.push("JWT_SECRET must be configured with a cryptographically strong secret of at least 32 characters.");
  }

  // 2. OTP Secret Validation
  const otpSecret = env.OTP_SECRET || "";
  if (!otpSecret || otpSecret.includes("change-me") || otpSecret.length < 32) {
    errors.push("OTP_SECRET must be configured with a cryptographically strong secret of at least 32 characters.");
  }

  // 3. Secret Separation
  if (jwtSecret && otpSecret && jwtSecret === otpSecret) {
    errors.push("JWT_SECRET and OTP_SECRET must not be identical.");
  }

  // 4. Database Credentials Validation
  if (!env.MYSQL_HOST) errors.push("MYSQL_HOST is required in production.");
  if (!env.MYSQL_USER) errors.push("MYSQL_USER is required in production.");
  if (!env.MYSQL_PASSWORD) errors.push("MYSQL_PASSWORD is required in production.");
  if (!env.MYSQL_DATABASE) errors.push("MYSQL_DATABASE is required in production.");

  // 5. Strict Production CORS Allowlist (No Wildcard)
  const corsOrigin = env.CORS_ORIGIN || "";
  if (!corsOrigin || corsOrigin.trim() === "*" || corsOrigin.includes("*")) {
    errors.push("CORS_ORIGIN must be explicitly configured with allowed domain(s) in production. Wildcards (*) are strictly forbidden.");
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

// Security Check: Fail-fast in production if secrets are unconfigured or default placeholders
if (process.env.NODE_ENV === "production") {
  const check = validateProductionEnv(process.env);
  if (!check.valid) {
    console.error(`\x1b[31m[SECURITY FATAL] Production startup rejected!\n- ${check.errors.join("\n- ")}\x1b[0m`);
    process.exit(1);
  }
}
