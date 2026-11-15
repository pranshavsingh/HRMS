import http from "http";
import { healthCheck } from "../db/index.js";
import redisService from "./redis.service.js";
import outboxDispatcherService from "./outbox-dispatcher.service.js";
import queueWorkerManager from "../jobs/index.js";
import outboxRepository from "../repositories/outbox.repository.js";
import metricsService from "./metrics.service.js";
import logger from "../utils/logger.js";

class WorkerHealthService {
  constructor() {
    this.server = null;
    this.isShuttingDown = false;
    this.port = Number(process.env.WORKER_HEALTH_PORT || 8001);
  }

  /**
   * Set shutdown state to signal degraded readiness probe during graceful drain.
   */
  setShuttingDown(val) {
    this.isShuttingDown = Boolean(val);
  }

  /**
   * Start lightweight HTTP health server for dedicated worker.
   * @param {number} [port=null] - Optional override port
   * @returns {Promise<number>} Bound port
   */
  async start(port = null) {
    if (this.server) {
      return this.port;
    }

    const listenPort = port !== null ? port : this.port;

    return new Promise((resolve, reject) => {
      this.server = http.createServer(async (req, res) => {
        const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
        const pathname = url.pathname;

        res.setHeader("Content-Type", "application/json");

        // 1. Liveness check: Is worker process running?
        if (pathname === "/health" || pathname === "/") {
          res.writeHead(200);
          return res.end(
            JSON.stringify({
              status: "alive",
              role: "worker",
              pid: process.pid,
              uptime_seconds: Number(process.uptime().toFixed(1)),
              timestamp: new Date().toISOString()
            })
          );
        }

        // 2. Readiness probe: Are database, outbox dispatcher, and queues ready?
        if (pathname === "/health/ready") {
          if (this.isShuttingDown) {
            res.writeHead(503);
            return res.end(
              JSON.stringify({
                status: "degraded",
                reason: "SHUTTING_DOWN",
                timestamp: new Date().toISOString()
              })
            );
          }

          const checks = {
            database: "unknown",
            redis: "unknown",
            outboxDispatcher: outboxDispatcherService.isRunning ? "running" : "stopped",
            queueWorkers: queueWorkerManager.isRunning() ? "running" : "stopped"
          };

          let isHealthy = true;

          // Database connectivity check
          try {
            await healthCheck();
            checks.database = "connected";
          } catch (dbErr) {
            checks.database = "disconnected";
            checks.databaseError = dbErr.message;
            isHealthy = false;
          }

          // Redis status check
          if (redisService.isReady()) {
            checks.redis = "connected";
          } else {
            checks.redis = "offline";
            // In production, Redis is mandatory for BullMQ distributed queues
            if (process.env.NODE_ENV === "production") {
              isHealthy = false;
            }
          }

          if (!outboxDispatcherService.isRunning) {
            isHealthy = false;
          }

          const statusCode = isHealthy ? 200 : 503;
          res.writeHead(statusCode);
          return res.end(
            JSON.stringify({
              status: isHealthy ? "ready" : "degraded",
              pid: process.pid,
              uptime_seconds: Number(process.uptime().toFixed(1)),
              checks,
              timestamp: new Date().toISOString()
            })
          );
        }

        // 3. Telemetry & Metrics Status check
        if (pathname === "/health/status") {
          let outboxMetrics = null;
          try {
            outboxMetrics = await outboxRepository.getMetrics();
          } catch {
            outboxMetrics = { error: "Failed to collect outbox metrics" };
          }

          res.writeHead(200);
          return res.end(
            JSON.stringify({
              status: "running",
              pid: process.pid,
              role: "worker",
              concurrency: Number(process.env.QUEUE_CONCURRENCY || 5),
              activeWorkers: queueWorkerManager.getActiveWorkerNames(),
              outboxDispatcher: {
                running: outboxDispatcherService.isRunning,
                workerId: outboxDispatcherService.workerId
              },
              outboxMetrics,
              memory: {
                rss_mb: Number((process.memoryUsage().rss / (1024 * 1024)).toFixed(1)),
                heap_used_mb: Number((process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(1))
              },
              timestamp: new Date().toISOString()
            })
          );
        }

        // 4. Prometheus Scrape Endpoint
        if (pathname === "/metrics") {
          try {
            const metrics = await metricsService.getMetrics();
            res.setHeader("Content-Type", metricsService.getContentType());
            res.writeHead(200);
            return res.end(metrics);
          } catch (mErr) {
            res.setHeader("Content-Type", "text/plain");
            res.writeHead(500);
            return res.end(`Error scraping metrics: ${mErr.message}`);
          }
        }

        // 404 for unknown routes
        res.writeHead(404);
        return res.end(JSON.stringify({ error: "Not found" }));
      });

      this.server.on("error", (err) => {
        logger.error("[WorkerHealth] Server listen error: %s", err.message);
        reject(err);
      });

      this.server.listen(listenPort, () => {
        this.port = this.server.address().port;
        logger.info("[WorkerHealth] Worker health & readiness server listening on port %d", this.port);
        resolve(this.port);
      });
    });
  }

  /**
   * Gracefully close HTTP health server.
   */
  async stop() {
    if (!this.server) return;
    return new Promise((resolve) => {
      this.server.close(() => {
        logger.info("[WorkerHealth] Worker health server closed.");
        this.server = null;
        resolve();
      });
    });
  }
}

export const workerHealthService = new WorkerHealthService();
export default workerHealthService;
