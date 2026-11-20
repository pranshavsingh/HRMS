import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { workerHealthService } from "../../src/services/worker-health.service.js";
import outboxDispatcherService from "../../src/services/outbox-dispatcher.service.js";
import queueWorkerManager from "../../src/jobs/index.js";
import { healthCheck, closePool } from "../../src/db/index.js";
import redisService from "../../src/services/redis.service.js";

function makeHttpRequest(port, pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}${pathname}`, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on("error", reject);
  });
}

describe("P3.5 — Dedicated Worker Isolation & Lifecycle Test Suite", () => {
  let boundPort = null;

  before(async () => {
    // Start health service on dynamic port (0)
    boundPort = await workerHealthService.start(0);
  });

  after(async () => {
    await queueWorkerManager.close();
    await workerHealthService.stop();
    if (redisService.client) {
      try { redisService.client.disconnect(); } catch {}
    }
    await closePool();
  });

  it("should respond with alive status and worker role on GET /health (Liveness)", async () => {
    const res = await makeHttpRequest(boundPort, "/health");
    assert.equal(res.status, 200);
    assert.equal(res.body.status, "alive");
    assert.equal(res.body.role, "worker");
    assert.equal(res.body.pid, process.pid);
    assert.ok(res.body.uptime_seconds >= 0);
  });

  it("should respond with detailed telemetry on GET /health/status", async () => {
    const res = await makeHttpRequest(boundPort, "/health/status");
    assert.equal(res.status, 200);
    assert.equal(res.body.role, "worker");
    assert.ok(Array.isArray(res.body.activeWorkers));
    assert.ok(res.body.memory && res.body.memory.rss_mb > 0);
    assert.ok(res.body.outboxDispatcher);
  });

  it("should report readiness status on GET /health/ready when services are operational", async () => {
    // Ensure dispatcher is marked running for test
    const prevDispatcherRunning = outboxDispatcherService.isRunning;
    outboxDispatcherService.isRunning = true;

    const res = await makeHttpRequest(boundPort, "/health/ready");
    assert.ok([200, 503].includes(res.status)); // 200 if Redis & DB online, 503 if offline in dev
    assert.ok(res.body.checks);
    assert.ok(res.body.checks.database);
    assert.equal(res.body.checks.outboxDispatcher, "running");

    outboxDispatcherService.isRunning = prevDispatcherRunning;
  });

  it("should return HTTP 503 and degraded status when worker is shutting down", async () => {
    workerHealthService.setShuttingDown(true);

    const res = await makeHttpRequest(boundPort, "/health/ready");
    assert.equal(res.status, 503);
    assert.equal(res.body.status, "degraded");
    assert.equal(res.body.reason, "SHUTTING_DOWN");

    // Reset shutdown state
    workerHealthService.setShuttingDown(false);
  });

  it("should enforce process role isolation: worker does not expose API routes", async () => {
    const res = await makeHttpRequest(boundPort, "/api/v1/auth/login");
    assert.equal(res.status, 404, "Worker health server must return 404 for API endpoints");
  });

  it("should report active worker status and queue names in queueWorkerManager", () => {
    assert.ok(typeof queueWorkerManager.isRunning === "function");
    assert.ok(typeof queueWorkerManager.getActiveWorkerNames === "function");
    const names = queueWorkerManager.getActiveWorkerNames();
    assert.ok(Array.isArray(names));
  });
});
