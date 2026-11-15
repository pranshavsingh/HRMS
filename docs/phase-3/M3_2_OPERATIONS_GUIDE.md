# HRMS SaaS — Milestone M3.2 Operations & Deployment Guide
## Distributed Backend Operations, Queue Management & Worker Process Runbook

---

## 1. Process Topology & Runtime Roles

In production, the backend runs in a partitioned process topology managed by PM2:

| Process Name | Entrypoint | Cluster Mode | Instances | Primary Responsibilities |
| :--- | :--- | :---: | :---: | :--- |
| **`hrms-api`** | `src/server.js` | `cluster` | 4 | Handles incoming HTTP requests, serves REST endpoints, writes business data and outbox events to MySQL. |
| **`hrms-worker`** | `src/worker.js` | `fork` | 1 | Executes Outbox Dispatcher polling, runs BullMQ queue workers, executes scheduled cron jobs, sends emails. |

> **IMPORTANT:** Never run multiple `hrms-worker` instances without verifying that each worker has a unique identifier or is participating in the atomic row-claim protocol. The transactional outbox safely supports multiple concurrent workers because of row-level `FOR UPDATE SKIP LOCKED`.

---

## 2. Environment Variables Configuration

Ensure the following environment variables are configured in the production `.env` file:

```ini
# Database Connection (MySQL 8 / MariaDB)
DB_CLIENT=mysql
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=hrms_user
MYSQL_PASSWORD=strong_database_password
MYSQL_DATABASE=hrms_production
MYSQL_CONNECTION_LIMIT=30

# Redis Cache & Rate Limiting
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=strong_redis_password
REDIS_URL=redis://:strong_redis_password@127.0.0.1:6379/0

# BullMQ Distributed Queue Configuration (Phase 3)
QUEUE_REDIS_URL=redis://:strong_redis_password@127.0.0.1:6379/0
QUEUE_PREFIX=bull:hrms
QUEUE_DEFAULT_ATTEMPTS=3
QUEUE_DEFAULT_BACKOFF_MS=3000
QUEUE_JOB_REMOVE_ON_COMPLETE=100
QUEUE_JOB_REMOVE_ON_FAIL=500
QUEUE_CONCURRENCY=5

# Outbox Dispatcher & Cryptography Configuration (Phase 3)
OUTBOX_ENCRYPTION_KEY=your_64_hex_character_aes_256_gcm_master_key
OUTBOX_POLL_INTERVAL_MS=1000
OUTBOX_BATCH_SIZE=50
OUTBOX_LEASE_TIMEOUT_SECONDS=60
```

### Generating an AES-256-GCM Encryption Key:
Run the following Node.js one-liner to generate a cryptographically strong 256-bit hexadecimal key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 3. Deployment & Process Startup Commands

### Step 1: Run Database Migrations
Always apply database migrations prior to restarting application processes:
```bash
cd node_backend
npm run db:migrate
```

### Step 2: Start or Reload PM2 Processes
```bash
# Reload cluster with zero downtime
pm2 reload ecosystem.config.cjs --env production

# Or initial start:
npm run start:cluster
```

### Step 3: Verify Process Health
```bash
pm2 status
pm2 logs hrms-worker --lines 50
```

Expected log output on worker boot:
```
[INFO] HRMS Background Worker Process Started [PID: 12345]
[INFO] BullMQ Worker initialized for queue: mail-queue (concurrency: 5)
[INFO] Outbox Dispatcher Service started (poll interval: 1000ms, batch size: 50)
[INFO] Scheduled cron jobs registered.
```

---

## 4. Monitoring & Telemetry

### 4.1 Monitoring Outbox Table Metrics
You can query outbox event metrics directly via SQL:
```sql
SELECT status, COUNT(*) AS count
FROM outbox_events
GROUP BY status;
```

Healthy baseline metrics:
- `PENDING`: 0 to 10 (spikes briefly during burst traffic, drains within seconds).
- `PROCESSING`: 0 to 5 (active in-flight claims).
- `PUBLISHED`: Growing counter of successfully dispatched events.
- `FAILED`: 0.
- `DEAD_LETTER`: 0.

### 4.2 BullMQ Queue Telemetry
The BullMQ workers log completion and failure events automatically:
```
[INFO] BullMQ Job mail-queue:outbox_1042 completed in 142ms.
```
If a job fails:
```
[WARN] BullMQ Job mail-queue:outbox_1042 failed (attempt 1/3): Connection timeout. Retrying in 3000ms...
```

---

## 5. Troubleshooting & Runbook Procedures

### Incident 1: Dead-Letter Events Detected (`DEAD_LETTER > 0`)
1. Query the failed events to inspect the root cause:
   ```sql
   SELECT id, event_type, aggregate_id, retry_count, last_error, updated_at
   FROM outbox_events
   WHERE status = 'DEAD_LETTER'
   ORDER BY updated_at DESC LIMIT 10;
   ```
2. Common causes:
   - **Invalid Email Address**: SMTP rejects delivery with `550 User unknown`.
   - **Decryption Key Mismatch**: `OUTBOX_ENCRYPTION_KEY` changed or missing.
3. To replay dead-lettered events after resolving the root cause:
   ```sql
   UPDATE outbox_events
   SET status = 'PENDING', retry_count = 0, last_error = NULL
   WHERE status = 'DEAD_LETTER' AND id IN (...);
   ```

### Incident 2: Redis Service Restart or Network Partition
- When Redis drops, the Outbox Dispatcher encounters connection errors when calling BullMQ.
- **Expected Action**: The dispatcher records the connection error in `outbox_events.last_error`, releases the claim, and leaves the record in `PENDING` status.
- Once Redis restores, the dispatcher automatically resumes enqueueing with zero data loss.
- To verify claim recovery:
  ```sql
  SELECT COUNT(*) FROM outbox_events WHERE status = 'PROCESSING' AND lease_expires_at < NOW();
  ```
  The dispatcher sweeps and resets these to `PENDING` on its next poll cycle.

### Incident 3: Graceful Worker Teardown
When terminating or restarting the worker process:
- PM2 issues `SIGTERM`.
- The worker stops accepting new outbox polls immediately.
- Active BullMQ workers are granted a **15-second grace period** to complete running jobs (`await worker.close()`).
- Redis and database connection pools are closed cleanly.
