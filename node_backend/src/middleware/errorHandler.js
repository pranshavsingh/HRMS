import logger from "../utils/logger.js";

export class AppError extends Error {
  constructor(message, statusCode, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  
  if (statusCode === 500) {
    logger.error("Internal Server Error: %s\nStack: %s", err.message, err.stack);
    return res.status(500).json({ error: "Internal server error" });
  }

  logger.warn("Operational Error (%d): %s", statusCode, err.message);

  // If there are field-specific validation details, return them directly
  if (err.details) {
    return res.status(statusCode).json(err.details);
  }

  return res.status(statusCode).json({ error: err.message });
}
