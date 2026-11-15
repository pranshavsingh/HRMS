# HRMS SaaS — Milestone M3.3 Implementation Report
## Dedicated Background Worker Isolation, Lifecycle & Health Management

**Date:** November 16, 2026  
**Author:** Principal Backend Architect & Distributed Systems Engineer  
**Repository:** `pranshavsingh/HRMS`  
**Active Implementation Branch:** `feat/phase-3-distributed-backend`  
**Milestone:** M3.3 — Worker Isolation, PM2 Orchestration & Lifecycle Resilience  
**Status:** **IMPLEMENTED & VERIFIED**  

---

## 1. Executive Summary

Milestone M3.3 establishes total process-level isolation between user-facing HTTP API instances and asynchronous background processing. 

Under the previous monolithic setup, background cron jobs and asynchronous queue tasks risked running across multiple clustered API processes, leading to race conditions, duplicated automated actions, unhandled worker crashes taking down API traffic, and unobservable worker health.

In M3.3:
1. **Zero Background Work in API Instances:** API cluster processes (`hrms-api`) do not consume BullMQ jobs and strictly skip scheduled cron execution unless explicitly configured with `RUN_CRON_IN_API="true"`.
2. **Dedicated Background Worker:** The background worker (`src/worker.js`) runs in an isolated PM2 fork process with its own conservative database connection budget (5 connections vs 15 per API instance).
3. **HTTP Health & Readiness Probes:** The worker exposes a lightweight HTTP monitoring server (`src/services/worker-health.service.js`) on a dedicated port (default 8001), serving `/health` (liveness), `/health/ready` (dependency and subsystem readiness), and `/health/status` (telemetry, memory, and outbox metrics).
4. **PM2 `wait_ready` Signaling:** The worker sends `process.send("ready")` only after database health, BullMQ workers, outbox dispatchers, and health servers are fully booted, ensuring zero-downtime rolling deployments.
5. **Deterministic Graceful Shutdown:** Catches `SIGTERM` and `SIGINT`, immediately marks readiness as degraded (HTTP 503), closes outbox dispatching, allows in-flight BullMQ job handlers to complete, closes queue producers, closes the health server, and closes the database connection pool with a hard 15-second timeout guard.

---

## 2. Process Topology & PM2 Ecosystem Architecture

```
                          ┌─────────────────────────┐
                          │    Nginx Reverse Proxy  │
                          └────────────┬────────────┘
                                       │
                 ┌─────────────────────┴─────────────────────┐
                 │                                           │
       Port 8000 │ HTTP API Traffic                Port 8001 │ Internal Health/Metrics
                 ▼                                           ▼
      ┌─────────────────────┐                     ┌─────────────────────┐
      │   PM2 Cluster       │                     │    PM2 Fork Worker  │
      │   "hrms-api"        │                     │   "hrms-worker"     │
      │   (4 Instances)     │                     │   (1 Instance)      │
      ├─────────────────────┤                     ├─────────────────────┤
      │ • Express API       │                     │ • BullMQ Consumers  │
      │ • JWT Auth / RBAC   │                     │ • Outbox Dispatcher │
      │ • DB Pool: 15/proc  │                     │ • Cron Scheduler    │
      │ • No Queue Handlers │                     │ • DB Pool: 5/proc   │
      │ • Cron Disabled     │                     │ • Worker Health API │
      └──────────┬──────────┘                     └──────────┬──────────┘
                 │                                           │
                 └─────────────────────┬─────────────────────┘
                                       │
                                       ▼
                     ┌───────────────────────────────────┐
                     │ Shared MySQL 8.0 & Redis 7 Infra │
                     └───────────────────────────────────┘
```

### Configuration: `node_backend/ecosystem.config.cjs`

```javascript
module.exports = {
  apps: [
    {
      name: "hrms-api",
      script: "src/server.js",
      instances: 4,
      exec_mode: "cluster",
      watch: false,
      wait_ready: true,
      listen_timeout: 10000,
      kill_timeout: 15000,
      max_memory_restart: "1G",
      env_production: {
        NODE_ENV: "production",
        RUN_CRON_IN_API: "false",
      },
    },
    {
      name: "hrms-worker",
      script: "src/worker.js",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      wait_ready: true,
      listen_timeout: 10000,
      kill_timeout: 15000,
      max_memory_restart: "1G",
      restart_delay: 2000,
      env_production: {
        NODE_ENV: "production",
        IS_WORKER: "true",
        RUN_CRON_IN_API: "false",
        WORKER_HEALTH_PORT: 8001,
      },
    },
  ],
};
```

---

## 3. Worker Health API Specification

| Endpoint | Method | Response Codes | Description & Invariants |
| :--- | :---: | :---: | :--- |
| `/health` | `GET` | 200 | Liveness check. Returns `{ status: "alive", role: "worker", pid, uptime_seconds }`. |
| `/health/ready` | `GET` | 200 / 503 | Readiness probe. Evaluates database connection, Redis connectivity, Outbox Dispatcher status, and BullMQ worker status. Returns 503 if any subsystem is down or during graceful drain. |
| `/health/status` | `GET` | 200 | Telemetry endpoint. Reports active worker queues, outbox metrics (pending, claimed, published, dead-letter), and process memory utilization. |

---

## 4. Lifecycle & Failure Recovery Invariants

1. **Crash Isolation:** A fatal worker crash or memory exhaustion restart in `hrms-worker` has zero impact on `hrms-api` processes. API HTTP requests continue uninterrupted.
2. **Deterministic Startup:** BullMQ workers and Outbox dispatchers initialize only after verifying healthy database connectivity. If the database is offline at boot, the worker exits cleanly, allowing PM2 to restart with a 2-second backoff.
3. **Graceful Draining:** Upon receiving `SIGTERM` (e.g. during PM2 reload), `workerHealthService.setShuttingDown(true)` immediately turns `/health/ready` to HTTP 503, preventing new job dispatches while in-flight job handlers are given up to 15 seconds to complete.
