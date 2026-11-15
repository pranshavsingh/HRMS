import winston from "winston";
import path from "path";

const SENSITIVE_KEYS = new Set([
  "password",
  "new_password",
  "current_password",
  "token",
  "refresh_token",
  "access_token",
  "otp",
  "otp_hash",
  "reset_token",
  "reset_token_hash",
  "secret",
  "authorization",
  "cookie",
  "pan",
  "aadhaar",
  "account_number"
]);

export function redactSensitiveData(key, val) {
  if (val === null || val === undefined) return val;
  if (typeof key === "string" && SENSITIVE_KEYS.has(key.toLowerCase())) {
    return "[REDACTED]";
  }
  if (typeof val === "string") {
    return val
      .replace(/Bearer\s+[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/gi, "Bearer [REDACTED_TOKEN]")
      .replace(/eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]*/g, "[REDACTED_JWT]")
      .replace(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/g, "[REDACTED_PAN]")
      .replace(/\b\d{4}\s?\d{4}\s?\d{4}\b/g, "[REDACTED_AADHAAR]");
  }
  if (Array.isArray(val)) {
    return val.map((item) => redactSensitiveData(key, item));
  }
  if (typeof val === "object") {
    const redactedObj = {};
    for (const [k, v] of Object.entries(val)) {
      redactedObj[k] = redactSensitiveData(k, v);
    }
    return redactedObj;
  }
  return val;
}

const redactFormat = winston.format((info) => {
  return redactSensitiveData(null, info);
});

const logFormat = winston.format.combine(
  redactFormat(),
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: logFormat,
  defaultMeta: { service: "hrms-backend" },
  transports: [
    new winston.transports.File({ filename: path.join("logs", "error.log"), level: "error" }),
    new winston.transports.File({ filename: path.join("logs", "combined.log") }),
  ],
});

if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
}

export default logger;
