# HRMS Phase 2: Database Migration Strategy & Versioning Ledger
**Milestone:** M2.5 — Safe, Versioned Migrations, Checksums & Distributed Locking  
**Repository:** `pranshavsingh/HRMS`  
**Branch:** `feat/phase-2-database-performance`  
**Date:** November 2026  
**Status:** Completed & Verified  

---

## 1. Principles of Enterprise Schema Migration

In production clusters running multiple Node.js worker instances (e.g. 4 PM2 instances + 1 background worker), uncoordinated database migrations introduce critical hazards:
1. **Race Conditions:** Multiple processes attempting `ALTER TABLE` simultaneously trigger metadata locks and deadlocks.
2. **Schema Drift & Partial Execution:** Migrations that fail halfway leave databases in an unrecoverable, untracked state.
3. **Silent Alteration:** Altering a previously applied migration file can lead to divergent database states between development, staging, and production.

---

## 2. Migration Architecture

The migration runner (`node_backend/scripts/run-migrations.js`) incorporates three defensive pillars:

```
+-------------------------------------------------------------+
|                PM2 Worker / API Startup                     |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| Step 1: Distributed Advisory Lock                           |
| SELECT GET_LOCK('hrms_db_migration_lock', 15)               |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| Step 2: Query / Initialize 'schema_migrations' Ledger       |
| (version, name, checksum, applied_at)                       |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| Step 3: Iterate migrations in alphabetical order             |
| Compute SHA-256 Checksum                                    |
|   - If applied: Verify checksum equality                    |
|   - If pending: Execute statements + Record in Ledger       |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
| Step 4: Release Advisory Lock in finally block              |
| SELECT RELEASE_LOCK('hrms_db_migration_lock')               |
+-------------------------------------------------------------+
```

---

## 3. The `schema_migrations` Ledger Table

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  checksum VARCHAR(64) NOT NULL,
  applied_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### Ledger Entry Example:
| version | name | checksum | applied_at |
| :--- | :--- | :--- | :--- |
| `001` | `001_phase1_security_hardening.sql` | `76407d903f0b2f693cb7462fa11d6199df4824bb8ba243553257ad6d877f052d` | `2026-11-15 16:51:35` |
| `002` | `002_phase2_performance_indexes.sql` | `7035757188967e21e4295d16e2d1c0700a650f2ba5391ec01a28b9f0ba4505e9` | `2026-11-15 16:51:38` |

---

## 4. Idempotency & Multi-Dialect Support

- **MySQL / MariaDB:** Uses transactional DDL where supported and pre-flight existence checks (`information_schema.COLUMNS`, `information_schema.STATISTICS`) to safely handle legacy schema states without aborting on duplicate keys.
- **SQLite:** Supports local development and continuous integration environments with SQLite PRAGMA checks and `IF NOT EXISTS` index definitions.
- **Automated Verification:** Verified across repeated runs; re-running `npm run db:migrate` validates checksums, confirms zero-change state, and exits with code 0 in $< 50\text{ms}$.
