import crypto from "crypto";
import jwt from "jsonwebtoken";
import { rateLimit } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import redisService from "../services/redis.service.js";
import { config } from "../config/env.js";

/**
 * Enterprise Route-Tiered Rate Limiter
 * - Authenticated requests: Tracked per verified user ID (1,200 req/min) so enterprise corporate office IPs are never blocked
 * - Login endpoint: Tracked per IP (30 attempts / 15 min) to prevent credential stuffing
 */

export function createApiLimiter() {
  const store = redisService.isReady()
    ? new RedisStore({
        sendCommand: (...args) => redisService.client.call(...args),
        prefix: "rl:api:",
      })
    : undefined;

  return rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 1200, // 20 requests/second burst ceiling per user
    standardHeaders: true,
    legacyHeaders: false,
    validate: { keyGeneratorIpFallback: false },
    store,
    keyGenerator: (req) => {
      const auth = req.headers.authorization;
      if (auth && auth.startsWith("Bearer ")) {
        const token = auth.slice(7).trim();
        try {
          const decoded = jwt.verify(token, config.jwtSecret);
          const uid = decoded.userId || decoded.user_id || decoded.id || decoded.sub;
          if (uid) return `user:${uid}`;
        } catch {
          // Fall back to full-token SHA-256 hash so invalid/expired tokens don't share a single JWT-header bucket
          return `tok:${crypto.createHash("sha256").update(token).digest("hex").slice(0, 32)}`;
        }
      }
      return req.ip || "unknown";
    },
    message: { error: "Rate limit exceeded. Please wait a moment." },
  });
}

export function createLoginLimiter() {
  const store = redisService.isReady()
    ? new RedisStore({
        sendCommand: (...args) => redisService.client.call(...args),
        prefix: "rl:login:",
      })
    : undefined;

  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30, // 30 attempts per IP per 15 minutes
    standardHeaders: true,
    legacyHeaders: false,
    validate: { keyGeneratorIpFallback: false },
    store,
    keyGenerator: (req) => req.ip || "unknown",
    message: { error: "Too many login attempts from this IP. Please try again in 15 minutes." },
  });
}
