import test, { describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import { createApp } from "../../src/app.js";
import { workerHealthService } from "../../src/services/worker-health.service.js";
import metricsService from "../../src/services/metrics.service.js";
import { db, closePool } from "../../src/db/index.js";

describe("M3.6: Production Observability & Prometheus Telemetry", () => {
  let apiServer;
  let apiPort;
  let workerPort;

  before(async () => {
    // 1. Start test Express API server
    const app = createApp();
    await new Promise((resolve) => {
      apiServer = app.listen(0, () => {
        apiPort = apiServer.address().port;
        resolve();
      });
    });

    // 2. Start Worker Health server on an ephemeral port
    workerPort = await workerHealthService.start(0);
  });

  after(async () => {
    if (apiServer) {
      await new Promise((resolve) => apiServer.close(resolve));
    }
    await workerHealthService.stop();
    await closePool();
  });

  function fetchUrl(port, path, options = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path,
          method: options.method || "GET",
          headers: options.headers || {}
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => {
            resolve({ statusCode: res.statusCode, headers: res.headers, body: data });
          });
        }
      );
      req.on("error", reject);
      if (options.body) {
        req.write(options.body);
      }
      req.end();
    });
  }

  test("API exposes Prometheus scrape format at /metrics with 200 OK", async () => {
    const res = await fetchUrl(apiPort, "/metrics");
    assert.strictEqual(res.statusCode, 200);
    assert.ok(
      res.headers["content-type"].includes("text/plain"),
      `Expected text/plain, got ${res.headers["content-type"]}`
    );
    assert.ok(res.body.includes("# HELP hrms_process_cpu_seconds_total"));
    assert.ok(res.body.includes("# TYPE hrms_process_cpu_seconds_total counter"));
  });

  test("HTTP telemetry middleware accurately records request counts and latency histograms", async () => {
    // Perform several requests to /health
    await fetchUrl(apiPort, "/health");
    await fetchUrl(apiPort, "/health");

    const metricsRes = await fetchUrl(apiPort, "/metrics");
    assert.strictEqual(metricsRes.statusCode, 200);
    const body = metricsRes.body;

    // Check request count counter
    assert.ok(
      body.includes('hrms_http_requests_total{method="GET",route="/health",status_code="200"}'),
      "Metrics must contain recorded /health request counter"
    );

    // Check duration histogram
    assert.ok(
      body.includes('hrms_http_request_duration_seconds_bucket{le="'),
      "Metrics must contain duration histogram buckets"
    );
    assert.ok(
      body.includes('hrms_http_request_duration_seconds_count{method="GET",route="/health",status_code="200"}'),
      "Metrics must contain duration count"
    );
  });

  test("Route normalizer prevents metric label cardinality explosion", () => {
    const req1 = {
      baseUrl: "/api/documents",
      route: { path: "/:id" },
      path: "/api/documents/999"
    };
    assert.strictEqual(metricsService.normalizeRoute(req1), "/api/documents/:id");

    const req2 = {
      originalUrl: "/api/v1/auth/reset/a1b2c3d4-e5f6-7890-abcd-ef1234567890?key=val"
    };
    assert.strictEqual(
      metricsService.normalizeRoute(req2),
      "/api/v1/auth/reset/:uuid"
    );

    const req3 = {
      path: "/api/attendance/records/12345"
    };
    assert.strictEqual(
      metricsService.normalizeRoute(req3),
      "/api/attendance/records/:id"
    );
  });

  test("Database connection pool metrics and gauges are properly exported", async () => {
    const metricsRes = await fetchUrl(apiPort, "/metrics");
    assert.strictEqual(metricsRes.statusCode, 200);
    const body = metricsRes.body;

    assert.ok(body.includes("# HELP hrms_db_pool_active_connections"));
    assert.ok(body.includes("# TYPE hrms_db_pool_active_connections gauge"));
    assert.ok(body.includes("hrms_db_pool_active_connections "));

    assert.ok(body.includes("# HELP hrms_db_pool_idle_connections"));
    assert.ok(body.includes("hrms_db_pool_idle_connections "));

    assert.ok(body.includes("# HELP hrms_db_pool_total_connections"));
    assert.ok(body.includes("hrms_db_pool_total_connections "));

    assert.ok(body.includes("# HELP hrms_db_pool_waiting_requests"));
    assert.ok(body.includes("hrms_db_pool_waiting_requests "));

    assert.ok(body.includes("# HELP hrms_db_pool_max_limit"));
    assert.ok(body.includes("hrms_db_pool_max_limit "));
  });

  test("Transactional outbox metrics, statuses, and lag are correctly exported", async () => {
    const metricsRes = await fetchUrl(apiPort, "/metrics");
    assert.strictEqual(metricsRes.statusCode, 200);
    const body = metricsRes.body;

    assert.ok(body.includes("# HELP hrms_outbox_events_count"));
    assert.ok(body.includes('hrms_outbox_events_count{status="PENDING"}'));
    assert.ok(body.includes('hrms_outbox_events_count{status="PUBLISHED"}'));
    assert.ok(body.includes('hrms_outbox_events_count{status="DEAD_LETTER"}'));

    assert.ok(body.includes("# HELP hrms_outbox_oldest_pending_lag_seconds"));
    assert.ok(body.includes("hrms_outbox_oldest_pending_lag_seconds "));
  });

  test("Worker health server exposes /metrics endpoint with identical telemetry standard", async () => {
    const workerRes = await fetchUrl(workerPort, "/metrics");
    assert.strictEqual(workerRes.statusCode, 200);
    assert.ok(workerRes.headers["content-type"].includes("text/plain"));
    assert.ok(workerRes.body.includes("# HELP hrms_process_resident_memory_bytes"));
    assert.ok(workerRes.body.includes("hrms_db_pool_max_limit"));
  });

  test("Metrics endpoint strictly redacts sensitive credentials and environment secrets", async () => {
    const res = await fetchUrl(apiPort, "/metrics");
    const body = res.body;

    // Check for leakages of common secret keys or sensitive tokens
    assert.ok(!body.includes("secret"), "Metrics should never contain raw secret keywords");
    assert.ok(!body.includes("password"), "Metrics should never contain raw passwords");
    assert.ok(!body.includes("Bearer"), "Metrics should never contain authorization bearer tokens");
    assert.ok(!body.includes("JWT_SECRET"), "Metrics should never contain JWT_SECRET variable");
    assert.ok(!body.includes("PRIVATE_KEY"), "Metrics should never contain private keys");
  });
});
