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
  mysqlConnectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 30),
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

// Security Check: Fail-fast in production if secrets are unconfigured or default placeholders
if (process.env.NODE_ENV === "production") {
  const insecure = [];
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.includes("change-me")) {
    insecure.push("JWT_SECRET");
  }
  if (!process.env.OTP_SECRET || process.env.OTP_SECRET.includes("change-me")) {
    insecure.push("OTP_SECRET");
  }
  if (!process.env.MYSQL_PASSWORD) {
    insecure.push("MYSQL_PASSWORD");
  }
  if (insecure.length > 0) {
    console.error(`\x1b[31m[SECURITY FATAL] Production startup rejected! Default or missing credentials detected for: ${insecure.join(", ")}. Configure strong values in your server .env file.\x1b[0m`);
    process.exit(1);
  }
}
