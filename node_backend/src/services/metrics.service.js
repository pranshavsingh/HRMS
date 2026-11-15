import client from "prom-client";
import { getPoolMetrics, db } from "../db/index.js";
import outboxRepository from "../repositories/outbox.repository.js";
import realtimeService from "./realtime.service.js";
import logger from "../utils/logger.js";

/**
 * Enterprise Production Observability & Prometheus Metrics Service
 */
class MetricsService {
  constructor() {
    this.register = new client.Registry();

    // Default Node.js process and runtime metrics (memory, CPU, event loop, handles)
    client.collectDefaultMetrics({
      register: this.register,
      prefix: "hrms_"
    });

    // 1. HTTP Telemetry Metrics
    this.httpRequestsTotal = new client.Counter({
      name: "hrms_http_requests_total",
      help: "Total count of HTTP requests processed by the HRMS backend",
      labelNames: ["method", "route", "status_code"],
      registers: [this.register]
    });

    this.httpRequestDurationSeconds = new client.Histogram({
      name: "hrms_http_request_duration_seconds",
      help: "Histogram of HTTP request latencies in seconds",
      labelNames: ["method", "route", "status_code"],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.register]
    });

    // 2. Database Connection Pool Metrics
    this.dbPoolActive = new client.Gauge({
      name: "hrms_db_pool_active_connections",
      help: "Number of active leased database connections currently in use",
      registers: [this.register]
    });

    this.dbPoolIdle = new client.Gauge({
      name: "hrms_db_pool_idle_connections",
      help: "Number of idle database connections currently available in the pool",
      registers: [this.register]
    });

    this.dbPoolTotal = new client.Gauge({
      name: "hrms_db_pool_total_connections",
      help: "Total physical database connections allocated in the pool",
      registers: [this.register]
    });

    this.dbPoolWaiting = new client.Gauge({
      name: "hrms_db_pool_waiting_requests",
      help: "Number of queued requests currently waiting for a database connection",
      registers: [this.register]
    });

    this.dbPoolLimit = new client.Gauge({
      name: "hrms_db_pool_max_limit",
      help: "Configured maximum connection limit for the database pool",
      registers: [this.register]
    });

    // 3. Transactional Outbox Lag & Partition Metrics
    this.outboxEventsCount = new client.Gauge({
      name: "hrms_outbox_events_count",
      help: "Count of transactional outbox events partitioned by status",
      labelNames: ["status"],
      registers: [this.register]
    });

    this.outboxLagSeconds = new client.Gauge({
      name: "hrms_outbox_oldest_pending_lag_seconds",
      help: "Age in seconds of the oldest unconsumed PENDING transactional outbox event",
      registers: [this.register]
    });

    // 4. BullMQ Distributed Queue Metrics
    this.queueJobsCount = new client.Gauge({
      name: "hrms_queue_jobs_count",
      help: "Number of background jobs in BullMQ partitioned by queue and state",
      labelNames: ["queue", "state"],
      registers: [this.register]
    });

    // 5. Realtime Socket.IO Clients
    this.realtimeConnectedClients = new client.Gauge({
      name: "hrms_realtime_connected_clients",
      help: "Number of currently active WebSocket / Socket.IO connections on this instance",
      registers: [this.register]
    });

    // Initialize baseline labels to 0
    const statuses = ["PENDING", "CLAIMED", "PUBLISHED", "FAILED", "DEAD_LETTER"];
    for (const s of statuses) {
      this.outboxEventsCount.set({ status: s }, 0);
    }
  }

  /**
   * Normalize incoming request paths to prevent metric cardinality explosion.
   * Replaces UUIDs, numeric IDs, and query strings with parameterized placeholders.
   */
  normalizeRoute(req) {
    if (req.route && req.baseUrl) {
      return `${req.baseUrl}${req.route.path}`;
    }
    if (req.route && req.route.path) {
      return req.route.path;
    }

    const rawPath = (req.originalUrl || req.url || req.path || "/").split("?")[0];
    return rawPath
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ":uuid")
      .replace(/\/\d+(?=\/|$)/g, "/:id");
  }

  /**
   * Express middleware for recording request count and duration.
   */
  httpMetricsMiddleware() {
    return (req, res, next) => {
      // Exclude scraping the /metrics endpoint itself to prevent skew
      if (req.path === "/metrics") {
        return next();
      }

      const start = process.hrtime.bigint();

      res.on("finish", () => {
        const durationSec = Number(process.hrtime.bigint() - start) / 1e9;
        const route = this.normalizeRoute(req);
        const method = req.method || "GET";
        const statusCode = String(res.statusCode || 200);

        this.httpRequestsTotal.inc({ method, route, status_code: statusCode });
        this.httpRequestDurationSeconds.observe({ method, route, status_code: statusCode }, durationSec);
      });

      next();
    };
  }

  /**
   * Update Queue job metrics from BullMQ inspection.
   * @param {string} queueName 
   * @param {{waiting?: number, active?: number, completed?: number, failed?: number, delayed?: number}} counts 
   */
  setQueueJobCounts(queueName, counts = {}) {
    const states = ["waiting", "active", "completed", "failed", "delayed"];
    for (const state of states) {
      const val = Number(counts[state] || 0);
      this.queueJobsCount.set({ queue: queueName, state }, val);
    }
  }

  /**
   * Asynchronously collect live gauges (DB pool, Outbox, Realtime) and return Prometheus scrape payload.
   * @returns {Promise<string>}
   */
  async getMetrics() {
    // 1. Collect Database Pool Gauges
    try {
      const poolMetrics = getPoolMetrics();
      this.dbPoolActive.set(poolMetrics.active);
      this.dbPoolIdle.set(poolMetrics.free);
      this.dbPoolTotal.set(poolMetrics.total);
      this.dbPoolWaiting.set(poolMetrics.queued);
      this.dbPoolLimit.set(poolMetrics.limit);
    } catch (err) {
      logger.debug("[Metrics] Failed to update DB pool metrics: %s", err.message);
    }

    // 2. Collect Outbox Partition Counts & Lag
    try {
      const metrics = await outboxRepository.getMetrics();
      this.outboxEventsCount.set({ status: "PENDING" }, metrics.pending || 0);
      this.outboxEventsCount.set({ status: "CLAIMED" }, metrics.claimed || 0);
      this.outboxEventsCount.set({ status: "PUBLISHED" }, metrics.published || 0);
      this.outboxEventsCount.set({ status: "FAILED" }, metrics.failed || 0);
      this.outboxEventsCount.set({ status: "DEAD_LETTER" }, metrics.dead_letter || 0);

      const oldestRow = await db.get(
        "SELECT created_at FROM outbox_events WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT 1"
      );
      if (oldestRow && oldestRow.created_at) {
        const oldestTime = new Date(oldestRow.created_at).getTime();
        const lagSec = Math.max(0, (Date.now() - oldestTime) / 1000);
        this.outboxLagSeconds.set(Number(lagSec.toFixed(2)));
      } else {
        this.outboxLagSeconds.set(0);
      }
    } catch (err) {
      logger.debug("[Metrics] Outbox metrics unavailable: %s", err.message);
    }

    // 3. Collect Realtime Connected Clients
    try {
      const clientCount = realtimeService.getConnectedClientCount();
      this.realtimeConnectedClients.set(clientCount);
    } catch (err) {
      logger.debug("[Metrics] Realtime metrics unavailable: %s", err.message);
    }

    return this.register.metrics();
  }

  /**
   * Return standard Prometheus scrape content-type.
   * @returns {string}
   */
  getContentType() {
    return this.register.contentType;
  }

  /**
   * Reset all metric registers (primarily used during automated test runs).
   */
  clear() {
    this.register.clear();
  }
}

export const metricsService = new MetricsService();
export default metricsService;
