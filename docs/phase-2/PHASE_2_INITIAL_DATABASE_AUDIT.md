# HRMS Phase 2: Initial Database Architecture & Concurrency Audit

## 1. Executive Summary & Workload Scope

This audit establishes the baseline database architecture, query performance bottlenecks, concurrency risks, and connection capacity for the HRMS application on branch `feat/phase-2-database-performance` (base commit `6394c7d08a1a91bb193e70ff2ca23b6f679ebf17`).

### Workload Profile & Target Capacity
- **Registered Employee Accounts:** 5,000 to 8,000 users.
- **Concurrent Active Users:** 1,000 to 2,000 simultaneous users during peak windows.
- **Traffic Patterns:** Extreme morning burst (08:30–09:30 AM IST) and evening burst (05:30–06:30 PM IST) for attendance punch-in/out, GPS geolocation validation, and exception approval workflows.
- **Compute Topology:** Hostinger KVM 4 vCPU VPS running PM2:
  - 4 API cluster instances (`hrms-api`) handling incoming HTTP traffic.
  - 1 dedicated worker process (`hrms-worker`) handling background cron schedules and queues.

---

## 2. Database Engine & Driver Specifications

| Attribute | Specification |
| :--- | :--- |
| **Engine** | MySQL 8.0.x / MariaDB 10.6+ compatible |
| **Storage Engine** | InnoDB (ACID compliant, row-level locking, foreign key integrity) |
| **Character Set & Collation** | `utf8mb4` with `utf8mb4_unicode_ci` |
| **Node.js Client** | `mysql2/promise` (connection pooling with prepared statements) |
| **Fallback / Local Dev Engine** | SQLite 3 via `sqlite3` and `sqlite` wrapper |
| **Cache & Realtime** | Redis 7.x (distributed sessions, rate limiting, pub/sub, locks) |

---

## 3. Schema & Entity Inventory

The database comprises 10 primary relational tables:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                             DATABASE ENTITY GRAPH                           │
└─────────────────────────────────────────────────────────────────────────────┘

        ┌─────────────────────────┐
        │      accounts_user      │◄──────────────┐
        │  (Authentication & PII) │               │
        └────────────┬────────────┘               │
                     │ 1:1                        │ 1:N
                     ▼                            │
        ┌─────────────────────────┐    ┌──────────┴───────────────┐
        │ accounts_employeeprofile│    │ accounts_employeedocument│
        │  (Manager, Geofence)    │    │   (Cloudinary / Local)   │
        └─────────────────────────┘    └──────────────────────────┘
                     │ 1:N
                     ▼
        ┌─────────────────────────┐
        │ accounts_employeelocation│
        │   (Multiple Geofences)  │
        └─────────────────────────┘

        ┌─────────────────────────┐    ┌──────────────────────────┐
        │   accounts_refreshtoken │    │    password_reset_otp    │
        │ (Rotation & Session Fam)│    │(Cryptographic Hash & Exp)│
        └─────────────────────────┘    └──────────────────────────┘

        ┌─────────────────────────┐    ┌──────────────────────────┐
        │  attendance_attendance  │◄───┤attendance_approval (1:N) │
        │  (Punches, Coordinates) │    │(Workflow Decision Ledger)│
        └────────────┬────────────┘    └──────────────────────────┘
                     │
                     ▼
        ┌─────────────────────────┐    ┌──────────────────────────┐
        │       leave_leave       │    │        audit_logs        │
        │  (Approved/Pending Req) │    │ (Tamper-evident Trail)   │
        └─────────────────────────┘    └──────────────────────────┘
```

### Table Definitions & Relations
1. **`accounts_user`**: Primary user table with Bcrypt credentials, role (`employee`, `manager`, `hr`, `admin`, `superadmin`), status flags (`is_active`, `deleted_at`).
2. **`accounts_employeeprofile`**: One-to-one extension containing `manager_id` (FK to `accounts_user`), office geofence (`latitude`, `longitude`, `allowed_radius`), leave allotments, and team designations.
3. **`accounts_employeedocument`**: Sensitive employee identity records (Aadhaar, PAN, Bank, CV, DL).
4. **`accounts_employeelocation`**: Multi-location geofencing for employees assigned to multiple authorized client sites.
5. **`accounts_refreshtoken`**: Phase 1 hardened session table supporting Refresh Token Rotation (RTR) and family replay revocation.
6. **`password_reset_otp`**: Phase 1 hardened OTP storage with HMAC-SHA256 hashes, attempt limits, and single-use cryptographic reset tokens.
7. **`attendance_attendance`**: Clock-in and clock-out timestamps, GPS coordinates, geofence compliance flags, and approval state. **Crucial rule: Must permit multiple sessions per employee per day (lunch, split-shift) while strictly preventing concurrent open sessions.**
8. **`attendance_attendanceapproval`**: Multi-tiered approval workflow records for out-of-bounds or manual punch overrides.
9. **`leave_leave`**: Leave applications with calendar boundaries, leave types, and approval states.
10. **`audit_logs`**: Administrative audit trail with actor details, action types, severity levels, and client IP addresses.

---

## 4. Connection Pool Budgeting Analysis

### Current Configuration
- API instances: 4 PM2 cluster workers.
- Background worker: 1 PM2 fork instance.
- Default `MYSQL_CONNECTION_LIMIT`: `30` connections per process.
- **Total Potential Pool Demand:** `(4 API + 1 Worker) * 30 = 150 connections`.

### The Problem
Standard Hostinger VPS / MySQL deployments typically enforce `max_connections = 100` or `150`. If all 5 instances saturate their default pools simultaneously:
1. MySQL rejects connections with `ER_CON_COUNT_ERROR` ("Too many connections").
2. API requests fail with 500 errors.
3. Background workers crash or drop queued tasks.
4. Administrative SSH / CLI access is blocked.

### Calibrated Pool Budget
To maintain 100% stability under high concurrency without exceeding MySQL limits:
- **API Worker Pool:** 15 connections per process (`4 * 15 = 60 connections`).
- **Background Worker Pool:** 5 connections (`1 * 5 = 5 connections`).
- **Total Application Pool:** **65 connections**.
- **Headroom Reserved:** At least 35–85 connections reserved for MySQL administration, migrations, and monitoring.
- **Connection Acquisition Timeout:** 10,000ms with a queue limit of 100 to prevent unbounded memory queuing.

---

## 5. Critical Database Deficiencies Identified

### Defect 1: Catastrophic N+1 Query in Employee Directory
- **Location:** `node_backend/src/services/accounts.service.js:526` (`getEmployees`)
- **Mechanism:** The service queries all employees (`SELECT * FROM accounts_user`) and loops over every user calling `serializeStaffMember(user)`.
- **Impact:** Each user triggers 4 additional independent queries (`findProfileByUserId`, `findById` for manager, `findDocumentCountByUserId`, `findLocationsByUserId`).
- **Scale at 5,000 Employees:** `1 + (5,000 * 4) = 20,001 SQL queries` per page visit.
- **Result:** Event loop starvation, connection pool exhaustion, and API timeouts.

### Defect 2: Attendance Concurrency Race Conditions
- **Location:** `node_backend/src/services/attendance.service.js` (`punchIn` and `punchOut`)
- **Mechanism:**
  - In `punchIn`: `findOpenAttendance` and `onLeave` checks execute *before* entering `db.transaction`. Two simultaneous requests from the same user both see `open === null` and insert duplicate active sessions.
  - In `punchOut`: `findOpenAttendance` executes outside the transaction. Two simultaneous punch-out requests both update the same session and duplicate approval records.
- **Solution:** Wrap entire operation in `db.transaction`, acquire an exclusive row lock on `accounts_user` via `SELECT ... FOR UPDATE`, check invariants under lock, and use atomic conditional updates (`WHERE id = ? AND punch_out_time IS NULL`).

### Defect 3: Overnight Shift Disruption in Automated Cron
- **Location:** `node_backend/src/utils/cron.js` (Job 1)
- **Mechanism:** Runs daily at 23:59:00 with:
  ```sql
  UPDATE attendance_attendance SET punch_out_time=NOW(), punch_out_status='approved', status='approved' WHERE punch_out_time IS NULL
  ```
- **Impact:** Night-shift employees (e.g., 20:00 to 04:00) who punch in at 22:00 have their shifts forcefully terminated at 23:59!
- **Solution:** Only auto-close stale sessions older than 16 hours (`WHERE punch_out_time IS NULL AND punch_in_time < DATE_SUB(NOW(), INTERVAL 16 HOUR)`).

### Defect 4: Unbounded Collection Endpoints
- **Endpoints:** `GET /api/accounts/employees/`, `GET /api/attendance/history/`, `GET /api/leave/my/`, `GET /api/accounts/documents/:user_id/`.
- **Mechanism:** Endpoints return all matching rows without enforcing server-side `LIMIT` or pagination envelopes.
- **Scale Risk:** As historical records accumulate into hundreds of thousands of rows, payload sizes explode into tens of megabytes, causing high latency and memory pressure.

### Defect 5: Unversioned Schema Migrations & Distributed Lock Absence
- **Location:** `node_backend/scripts/run-migrations.js`
- **Mechanism:** DDL statements are executed imperatively without a `schema_migrations` tracking table or checksum validation. In multi-process PM2 environments, concurrent startup can attempt simultaneous schema alterations.
- **Solution:** Build a versioned migration framework with a `schema_migrations` ledger table, SHA-256 checksum verification, and MySQL distributed advisory locking (`GET_LOCK`).
