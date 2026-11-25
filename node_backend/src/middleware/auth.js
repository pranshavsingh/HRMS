import jwt from "jsonwebtoken";
import { config } from "../config/env.js";
import { db } from "../db/index.js";
import { AppError } from "./errorHandler.js";
import redisService from "../services/redis.service.js";

/**
 * Authentication Middleware - Validates the JWT and fetches the user (with Redis cache).
 * Strictly requires Authorization: Bearer <token> header. Rejects URL query-string tokens.
 */
export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
    
    if (!token) {
      return next(new AppError("Authentication required", 401));
    }

    // Explicit algorithm enforcement
    const payload = jwt.verify(token, config.jwtSecret, {
      algorithms: ["HS256"]
    });

    // Enforce token type: refresh tokens cannot be used as access tokens
    if (payload.type && payload.type !== "access") {
      return next(new AppError("Invalid token type", 401));
    }

    // Check Redis token revocation blacklist (if JTI is present) with DB fallback (BUG-A07)
    if (payload.jti) {
      let isBlacklisted = await redisService.get(`token:blacklist:${payload.jti}`);
      if (!isBlacklisted) {
        try {
          const revokedRow = await db.get(
            "SELECT id FROM accounts_revoked_token WHERE jti = ? AND expires_at > NOW() LIMIT 1",
            [payload.jti]
          );
          if (revokedRow) isBlacklisted = true;
        } catch {
          // Suppress fallback DB query errors
        }
      }
      if (isBlacklisted) {
        return next(new AppError("Token has been revoked", 401));
      }
    }

    // Check user-level session revocation timestamp
    const userRevokedAt = await redisService.get(`user:revoked:${payload.userId}`);
    if (userRevokedAt && payload.iat && payload.iat < Math.floor(Number(userRevokedAt) / 1000)) {
      return next(new AppError("Session revoked. Please login again.", 401));
    }

    const cacheKey = `user:session:${payload.userId}`;

    // Fast-path: Check Redis session cache (<0.5ms)
    let user = await redisService.get(cacheKey);

    if (!user) {
      // Slow-path: Query MySQL and populate cache
      user = await db.get(
        "SELECT * FROM accounts_user WHERE id=?", 
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
    req.tokenPayload = payload;
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

/**
 * Mobile Security Restriction: Restrict Employee Account / ID Creation on Mobile Devices.
 * Strictly enforces that HR, Admin, Superadmin, and any client on mobile cannot create employees.
 */
export function restrictMobileEmployeeCreation(req, res, next) {
  const platform = (req.headers["x-platform"] || req.body?.platform || req.query?.platform || "").toLowerCase();
  if (["mobile", "android", "ios"].includes(platform)) {
    return next(new AppError("Employee account creation is restricted on mobile devices in accordance with security policy", 403));
  }
  next();
}

/**
 * Mobile Security Restriction: Restrict Employee Data, Payroll, and Document Exports on Mobile Devices.
 * Strictly enforces that HR, Admin, Superadmin, and any client on mobile cannot export or bulk download.
 */
export function restrictMobileDataExport(req, res, next) {
  const platform = (req.headers["x-platform"] || req.query?.platform || "").toLowerCase();
  if (["mobile", "android", "ios"].includes(platform)) {
    return next(new AppError("Data and document exports are restricted on mobile devices in accordance with security policy", 403));
  }
  next();
}

/**
 * Realtime Stream Authentication Middleware.
 * Supports Mechanism 2 (Bearer Header) and Mechanism 3 (Single-use ephemeral ticket via GETDEL).
 * Strictly forbids raw tokens in URL query parameters (VULN-04).
 */
export async function authenticateRealtime(req, res, next) {
  try {
    // 1. Strict rejection of raw JWT URL query parameters (VULN-04 fix)
    if (req.query?.token || req.query?.access_token || req.query?.jwt) {
      return next(new AppError("Raw tokens in URL query parameters are strictly forbidden", 401));
    }

    // 2. Mechanism 2: Header Bearer Auth (Primary Standard)
    const authHeader = req.headers.authorization || "";
    if (authHeader.startsWith("Bearer ")) {
      return authenticate(req, res, next);
    }

    // 3. Mechanism 3: Ephemeral Single-Use Ticket (Permitted URL Query Fallback)
    const ticketId = req.query?.ticket;
    if (ticketId) {
      const ticketKey = `sse:ticket:${ticketId}`;
      const userPayload = await redisService.getdel(ticketKey);
      if (!userPayload || !userPayload.id) {
        return next(new AppError("Invalid, expired, or already consumed ticket", 401));
      }
      const revokedTs = await redisService.get(`user:revoked:${userPayload.id}`);
      if (revokedTs) {
        return next(new AppError("Session revoked", 401));
      }
      const freshUser = await accountsRepository.findById(userPayload.id);
      if (!freshUser || !freshUser.is_active) {
        return next(new AppError("Account inactive or disabled", 401));
      }
      req.user = {
        ...userPayload,
        role: freshUser.is_superuser ? "superadmin" : freshUser.role,
      };
      return next();
    }

    // 4. Missing credentials
    return next(new AppError("Authentication required", 401));
  } catch (err) {
    return next(new AppError("Authentication failed", 401));
  }
}