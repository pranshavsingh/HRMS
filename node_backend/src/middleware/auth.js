import jwt from "jsonwebtoken";
import { config } from "../config/env.js";
import { db } from "../db/index.js";
import { AppError } from "./errorHandler.js";
import redisService from "../services/redis.service.js";

/**
 * Authentication Middleware - Validates the JWT and fetches the user (with Redis cache).
 */
export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    let token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    
    if (!token && req.query.token) {
      token = req.query.token;
    }
    
    if (!token) {
      return next(new AppError("Authentication required", 401));
    }

    const payload = jwt.verify(token, config.jwtSecret);
    const cacheKey = `user:session:${payload.userId}`;

    // Fast-path: Check Redis session cache (<0.5ms)
    let user = await redisService.get(cacheKey);

    if (!user) {
      // Slow-path: Query MySQL and populate cache
      user = await db.get(
        "SELECT * FROM accounts_user WHERE id=? AND deleted_at IS NULL", 
        [payload.userId]
      );

      if (!user || !user.is_active) {
        return next(new AppError("Invalid token", 401));
      }

      if (user.is_superuser === 1 || user.is_superuser === true) {
        user.role = "superadmin";
      }

      // Cache for 5 minutes (300 seconds)
      await redisService.set(cacheKey, user, 300);
    }

    if (!user || !user.is_active) {
      return next(new AppError("Invalid token", 401));
    }

    req.user = user;
    next();
  } catch (err) {
    return next(new AppError("Invalid token", 401));
  }
}

/**
 * Authorization Middleware - Verifies if the authenticated user has any of the permitted roles.
 * @param {string[]} allowedRoles 
 */
export function authorize(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError("Authentication required", 401));
    }
    
    if (allowedRoles && !allowedRoles.includes(req.user.role)) {
      return next(new AppError("Not allowed", 403));
    }
    
    next();
  };
}