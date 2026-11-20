import Redis from "ioredis";
import { config } from "../config/env.js";
import logger from "../utils/logger.js";

class RedisService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.init();
  }

  init() {
    try {
      this.client = new Redis(config.redisUrl, {
        maxRetriesPerRequest: 2,
        enableOfflineQueue: false,
        retryStrategy(times) {
          // Keep retrying with a capped delay so Redis can come back after
          // the API starts without leaving cache and ticket services offline.
          return Math.min(times * 250, 5000);
        },
      });

      this.client.on("ready", () => {
        this.isConnected = true;
        logger.info("[Redis] Connected to Redis server successfully");
      });

      this.client.on("error", (err) => {
        this.isConnected = false;
        logger.warn("[Redis] Connection error: %s (Operating in DB fallback mode)", err.message);
      });

      this.client.on("close", () => {
        this.isConnected = false;
      });
    } catch (err) {
      this.isConnected = false;
      logger.warn("[Redis] Failed to initialize Redis client: %s", err.message);
    }
  }

  isReady() {
    return this.isConnected && this.client && this.client.status === "ready";
  }

  async get(key) {
    if (!this.isReady()) return null;
    try {
      const data = await this.client.get(key);
      if (!data) return null;
      return JSON.parse(data);
    } catch (err) {
      logger.warn("[Redis] GET failed for key %s: %s", key, err.message);
      return null;
    }
  }

  async set(key, value, ttlSeconds = 300) {
    if (!this.isReady()) return false;
    try {
      const payload = JSON.stringify(value);
      if (ttlSeconds) {
        await this.client.set(key, payload, "EX", ttlSeconds);
      } else {
        await this.client.set(key, payload);
      }
      return true;
    } catch (err) {
      logger.warn("[Redis] SET failed for key %s: %s", key, err.message);
      return false;
    }
  }

  async del(key) {
    if (!this.isReady()) return false;
    try {
      await this.client.del(key);
      return true;
    } catch (err) {
      logger.warn("[Redis] DEL failed for key %s: %s", key, err.message);
      return false;
    }
  }

  /**
   * Atomically get and delete key (for single-use tickets)
   */
  async getdel(key) {
    if (!this.isReady()) return null;
    try {
      let data;
      if (typeof this.client.getdel === "function") {
        data = await this.client.getdel(key);
      } else {
        data = await this.client.get(key);
        if (data) {
          await this.client.del(key);
        }
      }
      if (!data) return null;
      return JSON.parse(data);
    } catch (err) {
      // Fallback if GETDEL command failed or was unsupported
      try {
        const data = await this.client.get(key);
        if (data) {
          await this.client.del(key);
          return JSON.parse(data);
        }
      } catch {}
      logger.warn("[Redis] GETDEL failed for key %s: %s", key, err.message);
      return null;
    }
  }

  /**
   * Delete all keys matching pattern (e.g. user:* or sse:*)
   */
  async delByPattern(pattern) {
    if (!this.isReady()) return;
    try {
      const keys = await this.client.keys(pattern);
      if (keys && keys.length > 0) {
        await this.client.del(...keys);
      }
    } catch (err) {
      logger.warn("[Redis] delByPattern failed for %s: %s", pattern, err.message);
    }
  }
}

export const redisService = new RedisService();
export default redisService;
