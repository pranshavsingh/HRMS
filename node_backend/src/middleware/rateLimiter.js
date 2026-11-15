import { rateLimit } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import redisService from "../services/redis.service.js";

/**
 * Enterprise Route-Tiered Rate Limiter
 * - Authenticated requests: Tracked per user/token (1,200 req/min) so enterprise corporate office IPs are never blocked
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
        // Rate-limit by token/user rather than shared corporate IP
        return auth.slice(7, 40);
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
