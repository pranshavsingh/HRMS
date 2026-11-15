# HRMS SaaS — Milestone M3.2 Migration Verification Report
## Migration 003: Transactional Outbox Events Table

**Migration File:** `node_backend/scripts/migrations/003_phase3_outbox_events.sql`  
**Target Table:** `outbox_events`  
**Database Engines Tested:** MySQL 8.0, MariaDB 10.11, SQLite 3.x  
**Checksum (SHA-256):** Verified against `schema_migrations` tracking table.

---

## 1. Migration Specification

```sql
-- Migration: 003_phase3_outbox_events.sql
-- Description: Creates the outbox_events table for transactional messaging and distributed queue dispatching

CREATE TABLE IF NOT EXISTS outbox_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  event_type VARCHAR(100) NOT NULL,
  aggregate_type VARCHAR(100) NOT NULL,
  aggregate_id VARCHAR(100) NOT NULL,
  payload JSON NOT NULL,
  status ENUM('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED', 'DEAD_LETTER') NOT NULL DEFAULT 'PENDING',
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 5,
  last_error TEXT NULL,
  claimed_at DATETIME NULL,
  claimed_by VARCHAR(100) NULL,
  lease_expires_at DATETIME NULL,
  published_at DATETIME NULL,
  idempotency_key VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_outbox_idempotency UNIQUE (idempotency_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_outbox_status_claim ON outbox_events (status, lease_expires_at, created_at);
CREATE INDEX idx_outbox_event_type ON outbox_events (event_type, created_at);
CREATE INDEX idx_outbox_aggregate ON outbox_events (aggregate_type, aggregate_id);
```

---

## 2. Index Design & Execution Plan Analysis

### Index 1: `idx_outbox_status_claim (status, lease_expires_at, created_at)`
- **Query Served:**
  ```sql
  SELECT id FROM outbox_events
  WHERE (status = 'PENDING')
     OR (status = 'PROCESSING' AND lease_expires_at < NOW())
  ORDER BY created_at ASC
  LIMIT ? FOR UPDATE SKIP LOCKED;
  ```
- **Rationale:** This is the primary polling query executed every 1000ms by the `OutboxDispatcherService`.
- **Query Plan Impact:** Provides an index range scan directly on `status = 'PENDING'`, avoiding full table scans. With `FOR UPDATE SKIP LOCKED`, MySQL locks only the matched index records, enabling concurrent workers to claim distinct batches simultaneously with zero contention or deadlock risk.

### Index 2: `uq_outbox_idempotency (idempotency_key)`
- **Query Served:**
  ```sql
  SELECT id FROM outbox_events WHERE idempotency_key = ?;
  ```
- **Rationale:** Guarantees strict uniqueness across all generated events. Duplicate web requests (e.g. repeated user clicks, retried webhook deliveries) trigger `ER_DUP_ENTRY` (MySQL error 1062) and are gracefully discarded with zero duplicate side effects.

### Index 3: `idx_outbox_aggregate (aggregate_type, aggregate_id)`
- **Query Served:**
  ```sql
  SELECT * FROM outbox_events WHERE aggregate_type = 'User' AND aggregate_id = ? ORDER BY created_at DESC;
  ```
- **Rationale:** Enables instant audit tracking and reconciliation of all state transitions associated with a particular entity (e.g., all emails or notifications dispatched for employee `id = 42`).

---

## 3. Migration Runner Verification

The migration was applied using the unified migration runner:
```bash
node scripts/run-migrations.js
```

### Execution Output:
```
[INFO] Running migrations in mode: mysql
[INFO] Migration 001_phase2_indexes_and_constraints.sql already applied. Skipping.
[INFO] Migration 002_phase2_performance_indexes.sql already applied. Skipping.
[INFO] Applying migration: 003_phase3_outbox_events.sql ...
[SUCCESS] Applied migration: 003_phase3_outbox_events.sql (checksum: a4e1bf5c8d28a3f2...)
[SUCCESS] All database migrations are up to date.
```

### Idempotency Repeat Test:
Running `node scripts/run-migrations.js` immediately after:
```
[INFO] Running migrations in mode: mysql
[INFO] Migration 001_phase2_indexes_and_constraints.sql already applied. Skipping.
[INFO] Migration 002_phase2_performance_indexes.sql already applied. Skipping.
[INFO] Migration 003_phase3_outbox_events.sql already applied. Skipping.
[SUCCESS] Database is completely up to date. Zero migrations required.
```

---

## 4. Dual-Dialect Compatibility (SQLite Fallback)

To support local offline development and fast in-memory CI unit testing, `run-migrations.js` parses and transforms `003_phase3_outbox_events.sql` for SQLite:
1. `BIGINT AUTO_INCREMENT` is converted to `INTEGER PRIMARY KEY AUTOINCREMENT`.
2. `JSON` and `ENUM` columns are converted to `TEXT` with `CHECK(status IN ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED', 'DEAD_LETTER'))`.
3. `DATETIME ON UPDATE CURRENT_TIMESTAMP` is normalized to SQLite `DATETIME DEFAULT CURRENT_TIMESTAMP`.

All unit and integration tests run identically across both MySQL 8 and SQLite.

---

## 5. Rollback & Downgrade Safety Analysis

In the unlikely event that rollback is required:
```sql
DROP TABLE IF EXISTS outbox_events;
DELETE FROM schema_migrations WHERE migration_name = '003_phase3_outbox_events.sql';
```

## 6. Migration 004: Durable Consumer Idempotency Table

**Migration File:** `node_backend/scripts/migrations/004_phase3_consumer_idempotency.sql`  
**Target Table:** `consumer_processed_jobs`  
**Database Engines Tested:** MySQL 8.0, MariaDB 10.11, SQLite 3.x  

### Schema Specification
```sql
CREATE TABLE IF NOT EXISTS consumer_processed_jobs (
  job_id VARCHAR(128) NOT NULL,
  handler_name VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED',
  result JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (job_id, handler_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_consumer_processed_at ON consumer_processed_jobs (created_at);
```

### Design Rationale
- **Primary Key `(job_id, handler_name)`**: Enforces atomic execution claiming at the RDBMS level. When a BullMQ worker begins processing a job, it executes an atomic INSERT. If a duplicate job delivery arrives (e.g. from network retry or duplicate queue dispatch), the database rejects the duplicate with error 1062, preventing duplicate side-effects (e.g. double email delivery).
- **Transient Failure Release**: If a retryable transient failure occurs (such as an SMTP outage), `releaseFailedClaim` removes the `PROCESSING` record, allowing BullMQ's exponential backoff to re-attempt execution cleanly.

