import Redis from "ioredis";
import { config } from "../config/env.js";
import logger from "./logger.js";

let clients = [];
let pubClient = null;
let subClient = null;
const SSE_CHANNEL = "hrms:sse:events";

try {
  const redisOptions = {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    lazyConnect: true,
    retryStrategy() {
      return null;
    }
  };

  pubClient = new Redis(config.redisUrl, redisOptions);
  subClient = new Redis(config.redisUrl, redisOptions);

  pubClient.on("error", () => {});
  subClient.on("error", () => {});

  // Connect clients
  Promise.all([pubClient.connect(), subClient.connect()])
    .then(() => {
      logger.info("[Realtime] Redis Pub/Sub initialized successfully for multi-worker SSE");
      subClient.subscribe(SSE_CHANNEL, (err) => {
        if (err) {
          logger.warn("[Realtime] Failed to subscribe to Redis channel %s: %s", SSE_CHANNEL, err.message);
        }
      });

      subClient.on("message", (channel, message) => {
        if (channel === SSE_CHANNEL) {
          try {
            const parsed = JSON.parse(message);
            dispatchLocal(parsed.eventName, parsed.data, parsed.filter);
          } catch (e) {
            logger.error("[Realtime] Error processing PubSub message: %s", e.message);
          }
        }
      });
    })
    .catch((err) => {
      logger.warn("[Realtime] Redis Pub/Sub offline, operating in single-instance mode: %s", err.message);
    });
} catch (e) {
  logger.warn("[Realtime] Redis setup skipped: %s", e.message);
}

function dispatchLocal(eventName, data, filter = {}) {
  const payload = JSON.stringify(data);
  let sentCount = 0;

  clients.forEach((client) => {
    try {
      // 1. Role-based targeting
      if (filter.targetRoles && filter.targetRoles.length > 0) {
        if (!filter.targetRoles.includes(client.role)) {
          // If not in target roles, check if targeted by user ID
          if (!filter.targetUserIds || !filter.targetUserIds.includes(Number(client.userId))) {
            return;
          }
        }
      }

      // 2. User ID targeting
      if (filter.targetUserIds && filter.targetUserIds.length > 0 && !filter.targetRoles) {
        if (!filter.targetUserIds.includes(Number(client.userId))) {
          return;
        }
      }

      client.res.write(`event: ${eventName}\n`);
      client.res.write(`data: ${payload}\n\n`);
      if (typeof client.res.flush === "function") {
        client.res.flush();
      }
      sentCount++;
    } catch (err) {
      logger.error(`[Realtime] Failed to send message to client ${client.username}: ${err.message}`);
    }
  });

  logger.debug(`[Realtime] Dispatched [${eventName}] to ${sentCount}/${clients.length} local workers clients`);
}

export const realtimeManager = {
  addClient(res, user) {
    const client = {
      res,
      userId: user.id,
      role: user.role,
      username: user.username,
    };
    clients.push(client);
    logger.info(`[Realtime] SSE client connected: User [${user.username}], Role [${user.role}]. Total local: ${clients.length}`);

    res.on("close", () => {
      clients = clients.filter((c) => c.res !== res);
      logger.info(`[Realtime] SSE client disconnected: User [${user.username}]. Total local: ${clients.length}`);
    });
  },

  /**
   * Broadcast an event across all cluster workers via Redis Pub/Sub.
   * @param {string} eventName - Name of the event
   * @param {object} data - Payload data
   * @param {object} filter - Optional { targetRoles: string[], targetUserIds: number[] }
   */
  broadcast(eventName, data, filter = {}) {
    const message = JSON.stringify({ eventName, data, filter });

    if (pubClient && pubClient.status === "ready") {
      pubClient.publish(SSE_CHANNEL, message).catch((err) => {
        logger.warn("[Realtime] Redis publish failed, falling back to local dispatch: %s", err.message);
        dispatchLocal(eventName, data, filter);
      });
    } else {
      dispatchLocal(eventName, data, filter);
    }
  },
};

export default realtimeManager;
