# HRMS SaaS — Operations & Alert Runbook
## Distributed Backend Production Resilience & Incident Mitigation Guide

- **Target Audience**: Site Reliability Engineers (SRE), DevOps Engineers, Platform Engineers
- **Scope**: Multi-instance API, Dedicated Worker, BullMQ, Redis Pub/Sub, Transactional Outbox, MySQL 8.0

---

## 1. Quick Reference: Prometheus Alert Thresholds

| Alert Name | Prometheus Metric Expression | Threshold Condition | Severity |
| :--- | :--- | :--- | :--- |
| **HighOutboxLag** | `hrms_outbox_oldest_pending_lag_seconds > 60` | Lag > 60s for 3 min | Warning |
| **CriticalOutboxStall** | `hrms_outbox_oldest_pending_lag_seconds > 300` | Lag > 300s for 1 min | Critical |
| **DeadLetterSpike** | `increase(hrms_outbox_events_count{status="DEAD_LETTER"}[5m]) > 5` | Rate > 5/5min | Warning |
| **DbPoolExhaustion** | `(hrms_db_pool_active_connections / hrms_db_pool_max_limit) > 0.85` | Ratio > 85% for 2 min | Critical |
| **DbPoolQueuing** | `hrms_db_pool_waiting_requests > 5` | Waiting > 5 for 30s | Critical |
| **WorkerDown** | `up{job="hrms-worker"} == 0` | Process unreachable for 1m | Critical |
| **HighErrorRate** | `sum(rate(hrms_http_requests_total{status_code=~"5.."}[5m])) / sum(rate(hrms_http_requests_total[5m])) > 0.05` | Error rate > 5% | Critical |
| **RedisDegraded** | `hrms_realtime_connected_clients == 0 and hrms_http_requests_total > 100` | Redis cluster alert | Warning |

---

## 2. Standard Operating Procedures (SOPs)

### SOP-01: Resolving Outbox Lag & Dispatcher Stalls
**Symptom**: `HighOutboxLag` or `CriticalOutboxStall` alert triggers.
1. **Verify Outbox Dispatcher Status**:
   ```bash
   curl -s http://127.0.0.1:8001/health/status | jq .outboxDispatcher
   ```
2. **Inspect Expired Claims**:
   If an outbox worker crashed mid-batch, claims expire after 30 seconds. The dispatcher automatically releases expired claims every 60 seconds. To verify expired claims recovery:
   ```sql
   SELECT COUNT(*) FROM outbox_events WHERE status = 'CLAIMED' AND claimed_until < NOW();
   ```
3. **Check Worker Logs via PM2**:
   ```bash
   pm2 logs hrms-worker --lines 100
   ```
4. **Restart Dedicated Worker if Stalled**:
   ```bash
   pm2 reload hrms-worker
   ```

---

### SOP-02: Dead-Letter Event Forensic Inspection & Safe Replay
**Symptom**: `DeadLetterSpike` alert fires indicating poisoned or unparseable payloads.
1. **Query Dead-Letter Queue (Without Exposing Payload PII)**:
   ```sql
   SELECT id, event_type, aggregate_type, aggregate_id, retry_count, last_error, updated_at 
   FROM outbox_events 
   WHERE status = 'DEAD_LETTER' 
   ORDER BY updated_at DESC LIMIT 20;
   ```
2. **Inspect Failure Reason**:
   - `INVALID_PAYLOAD_STRUCTURE`: Malformed schema emitted by publisher. Fix application code before replaying.
   - `EMAIL_SERVER_TIMEOUT`: Downstream SMTP temporary failure. Replay is safe.
   - `CONSUMER_CRASH`: Ephemeral worker memory limit. Safe to replay once worker is healthy.
3. **Execute Forensic Operator Replay**:
   Call the safe replay method via REPL or admin CLI:
   ```bash
   node -e "
     import('./src/repositories/outbox.repository.js').then(async (m) => {
       const res = await m.default.retryDeadLetterEvent(123, 'ops-admin', 'SMTP outage resolved');
       console.log('Replay Result:', res);
       process.exit(0);
     });
   "
   ```
   *Note: Replaying already-`PUBLISHED` events is strictly rejected to prevent duplicate transactions.*

---

### SOP-03: Mitigating Database Connection Pool Exhaustion
**Symptom**: `DbPoolExhaustion` or `DbPoolQueuing` alert fires.
1. **Inspect Active Connection Allocation**:
   Scrape `/metrics` or query pool telemetry:
   ```bash
   curl -s http://127.0.0.1:8001/metrics | grep hrms_db_pool
   ```
2. **Identify Long-Running or Blocking Queries**:
   ```sql
   SELECT id, user, host, db, command, time, state, info 
   FROM information_schema.processlist 
   WHERE command != 'Sleep' AND time > 5 
   ORDER BY time DESC;
   ```
3. **Inspect PM2 Allocation**:
   Verify connection limit math across clustered processes:
   $$\text{Max DB Connections} = (N_{\text{API instances}} \times \text{limit}_{\text{API}}) + (1 \times \text{limit}_{\text{Worker}})$$
   Ensure $\text{Max DB Connections} \le \text{max\_connections}$ on MySQL (`SHOW VARIABLES LIKE 'max_connections';`).
4. **Kill Rogue Locks**:
   If a deadlocked transaction holds rows:
   ```sql
   SELECT * FROM performance_schema.data_locks;
   KILL <thread_id>;
   ```

---

### SOP-04: Redis Failover & Recovery
**Symptom**: Redis offline; worker logging `[BullMQ] Redis error` or API logging `mode: in-memory fallback`.
1. **Check Redis Service**:
   ```bash
   redis-cli -u redis://127.0.0.1:6379 ping
   ```
2. **Behavior During Outage**:
   - **API Ingress**: Survives without losing requests. Database transactions continue committing. Outbox events are safely stored in MySQL `outbox_events` table (`status: PENDING`).
   - **Background Worker**: BullMQ waits; outbox dispatcher retries with exponential backoff.
   - **Realtime**: Socket.IO falls back to single-instance local broadcasts.
3. **Recovery Procedure**:
   Once Redis connectivity is restored:
   - Worker automatically reconnects via `retryStrategy`.
   - Dispatcher claims pending outbox events and pushes them to Redis BullMQ.
   - Realtime Pub/Sub adapter re-subscribes automatically.
   - Verify outbox lag drains to 0 within 2 minutes.

---

### SOP-05: Outbox & Consumer Job Retention Purging
**Symptom**: Outbox table growth over time.
1. **Automated Cleanup**:
   Every day at 3:00 AM UTC, the dedicated worker executes:
   - `outboxRepository.purgeOldPublishedEvents(7)`: Deletes `PUBLISHED` events older than 7 days.
   - `consumerIdempotencyRepository.purgeOldCompletedJobs(7)`: Deletes idempotency records older than 7 days.
2. **Manual Forced Purge (High Storage Condition)**:
   ```bash
   node -e "
     import('./src/repositories/outbox.repository.js').then(async (m) => {
       const purged = await m.default.purgeOldPublishedEvents(3);
       console.log('Purged Outbox Events:', purged);
       process.exit(0);
     });
   "
   ```
