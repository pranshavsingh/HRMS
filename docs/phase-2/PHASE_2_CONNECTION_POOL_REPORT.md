# HRMS Phase 2: Database Connection Pool & Background Worker Budget Report
**Milestone:** M2.6 & M2.7 — Connection Pool Allocation, Background Scheduler & Distributed Locking  
**Repository:** `pranshavsingh/HRMS`  
**Branch:** `feat/phase-2-database-performance`  
**Date:** November 2026  
**Status:** Completed & Verified  

---

## 1. Context & Architectural Challenge

The HRMS infrastructure runs on a Hostinger VPS (4 vCPUs) managed via PM2:
- 4 $\times$ `hrms-api` processes (Node.js cluster mode)
- 1 $\times$ `hrms-worker` process (dedicated background cron scheduler)
- 1 $\times$ MySQL 8.0 server instance (typical `max_connections` limit: 100 to 150)
- 1 $\times$ Redis 7.x instance (distributed locks, session tokens, SSE pub/sub)

If each Node.js process blindly instantiates a connection pool with default settings (e.g., 30 connections), aggregate connection demand reaches:
$$5 \times 30 = 150 \text{ connections}$$
During peak morning/evening attendance surges, this saturates the MySQL connection table, triggering `ER_CON_COUNT_ERROR: Too many connections`, crashing the API workers and preventing administrative or backup access.

---

## 2. Connection Pool Allocation & Budgeting

We configured role-aware connection pool limits:

| Process Type | Instances | Pool per Instance | Max Pool Connections | Queue Limit | Connect Timeout |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `hrms-api` (HTTP/REST) | 4 | 15 | 60 | 100 | 10,000 ms |
| `hrms-worker` (Background Cron) | 1 | 5 | 5 | 20 | 10,000 ms |
| **Total Application Reserved** | **5** | — | **65** | — | — |
| **System Headroom (Admin, Backups, Migrations)** | — | — | **35–85** | — | — |

### Code Implementation (`node_backend/src/config/env.js` & `src/db/index.js`):
- `process.env.IS_WORKER === "true"` automatically defaults pool limit to 5.
- API cluster instances default to 15.
- `queueLimit: 100` prevents unbounded memory queueing under severe database stalls, failing fast instead of causing process Out-Of-Memory (OOM) crashes.
- `enableKeepAlive: true` and `keepAliveInitialDelay: 10000` reduce TCP handshake latency on connection re-use.

---

## 3. Slow Query Detection & Observability

To catch performance regressions before they impact users, `db.get`, `db.all`, and `db.run` are instrumented with high-resolution performance timers:
- **Threshold:** $\ge 200\,\text{ms}$.
- **Logging:** When an execution exceeds 200ms, an alert is logged with high-resolution duration and sanitized SQL.
- **Sanitization:** Excess whitespace is trimmed, query length is bounded, and parameter binding protects PII.

---

## 4. Background Job Safety & Overnight Shift Fix

### 4.1 Distributed Job Locking
In clustered environments, background jobs must never run concurrently across multiple workers. All scheduled tasks in `node_backend/src/utils/cron.js` are wrapped in `runWithLock(jobName, ttlSeconds, fn)`:
1. Acquires a distributed Redis key `hrms:cron:lock:<jobName>` with `NX` (not exists) and `EX` (TTL).
2. If another instance holds the lock, execution is safely skipped.
3. Upon completion, the lock is released in a `finally` block.

### 4.2 Critical Overnight Shift Bug Fix
**The Bug:** The previous cron job ran at 23:59 daily with:
```sql
UPDATE attendance_attendance 
SET punch_out_time=NOW(), ... 
WHERE punch_out_time IS NULL;
```
This prematurely auto-closed night-shift employees who punched in at 22:00 or 23:30, after less than 2 hours of work.

**The Fix:**
```sql
UPDATE attendance_attendance 
SET punch_out_time = NOW(), punch_out_status = 'approved', status = 'approved' 
WHERE punch_out_time IS NULL 
  AND punch_in_time < DATE_SUB(NOW(), INTERVAL 16 HOUR);
```
Only punches left open for $\ge 16$ hours are classified as abandoned and auto-closed, fully protecting legitimate overnight shifts.
