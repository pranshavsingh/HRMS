import Redis from "ioredis";
import { config } from "./env.js";
import logger from "../utils/logger.js";

/**
 * Reusable Queue Names across HRMS Distributed Backend
 */
export const QUEUE_NAMES = {
  EMAIL_NOTIFICATIONS: "email-notifications",
  MAINTENANCE: "maintenance",
  DEAD_LETTER: "dead-letter"
};

/**
 * Sanitize Redis URL for safe logging without exposing passwords or tokens.
 * @param {string} rawUrl 
 * @returns {string} Sanitized URL
 */
export function sanitizeRedisUrl(rawUrl) {
  if (!rawUrl) return "redis://127.0.0.1:6379";
  try {
    const parsed = new URL(rawUrl);
    if (parsed.password) {
      parsed.password = "***";
    }
    return parsed.toString();
  } catch {
    return "redis://***";
  }
}

/**
 * Create a dedicated Redis connection for BullMQ.
 * BullMQ requires `maxRetriesPerRequest: null` and `enableOfflineQueue: true` on worker connections.
 * 
 * @param {string} role - "client" (Queue Producer) or "bclient" (BullMQ Worker)
 * @returns {Redis} ioredis instance
 */
export function createQueueConnection(role = "client") {
  const sanitized = sanitizeRedisUrl(config.queueRedisUrl);

  const client = new Redis(config.queueRedisUrl, {
    maxRetriesPerRequest: null, // Mandatory for BullMQ workers and reliable producers
    enableOfflineQueue: true,
    lazyConnect: true,
    connectTimeout: 10000,
    retryStrategy(times) {
      const delay = Math.min(times * 150, 3000);
      return delay;
    }
  });

  client.on("connect", () => {
    logger.info(`[BullMQ:${role}] Connected to Redis at ${sanitized}`);
  });

  client.on("error", (err) => {
    logger.warn(`[BullMQ:${role}] Redis error: ${err.message}`);
  });

  client.on("close", () => {
    logger.debug(`[BullMQ:${role}] Redis connection closed.`);
  });

  return client;
}

/**
 * Return Redis connection options object for BullMQ Queue and Worker instances.
 * When options are provided instead of an instantiated client, BullMQ manages
 * connection lifecycles automatically upon close().
 * 
 * @returns {object} ioredis connection options
 */
export function getRedisConnectionOptions() {
  const rawUrl = config.queueRedisUrl || config.redisUrl || "redis://127.0.0.1:6379";
  try {
    const parsed = new URL(rawUrl);
    const opts = {
      host: parsed.hostname || "127.0.0.1",
      port: Number(parsed.port || 6379),
      maxRetriesPerRequest: null,
      enableOfflineQueue: true,
      connectTimeout: 10000
    };
    if (parsed.password) {
      opts.password = decodeURIComponent(parsed.password);
    }
    if (parsed.username && parsed.username !== "default") {
      opts.username = decodeURIComponent(parsed.username);
    }
    if (parsed.pathname && parsed.pathname.length > 1) {
      const db = Number(parsed.pathname.slice(1));
      if (!Number.isNaN(db)) opts.db = db;
    }
    return opts;
  } catch {
    return {
      host: "127.0.0.1",
      port: 6379,
      maxRetriesPerRequest: null,
      enableOfflineQueue: true,
      connectTimeout: 10000
    };
  }
}

/**
 * Standard Default Job Options for Durable Enqueueing
 */
export const defaultJobOptions = {
  attempts: config.queueDefaultAttempts,
  backoff: {
    type: "exponential",
    delay: config.queueDefaultBackoffMs
  },
  removeOnComplete: {
    count: config.queueJobRemoveOnComplete,
    age: 86400 // 24 hours
  },
  removeOnFail: {
    count: config.queueJobRemoveOnFail,
    age: 604800 // 7 days retention for dead-letter inspection
  }
};

export const queueConfig = {
  prefix: config.queuePrefix,
  defaultJobOptions
};

export default {
  QUEUE_NAMES,
  sanitizeRedisUrl,
  createQueueConnection,
  getRedisConnectionOptions,
  defaultJobOptions,
  queueConfig
};

