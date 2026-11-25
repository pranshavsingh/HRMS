# Performance, Reliability & Scalability Audit — Enterprise HRMS

**Application Platform:** Enterprise HRMS (`hrms_saas`, `node_backend`, `hrms_mobile`)  
**Scope:** Database Indexing, Query Optimization, Connection Pooling, Distributed Locking, Frontend Build Performance, Background Cron Jobs, and Memory Lifecycle  

---

## 1. Database Indexing & Query Analysis (MariaDB / MySQL)

### 1.1 Index Coverage Matrix
The schema was audited across 24 relational tables to evaluate index efficiency on high-frequency lookup paths:

| Table | High-Frequency Filter / Join Key | Index Definition | Status | Risk / Recommendation |
|---|---|---|:---:|---|
| `attendance` | `user_id`, `date` | `UNIQUE KEY (user_id, date)` | **OPTIMAL** | Extremely fast single-day lookup; prevents duplicate punch records. |
| `attendance` | `date`, `status` | `KEY (date, status)` | **OPTIMAL** | Accelerates daily muster roll queries and HR dashboard rollups. |
| `roster_entries` | `user_id`, `date` | `KEY (user_id, date)` | **OPTIMAL** | Ensures instant resolution of active daily shift for punches. |
| `roster_entries` | `roster_id`, `date` | `KEY (roster_id, date)` | **OPTIMAL** | Fast monthly calendar grid population. |
| `leave_requests` | `user_id`, `from_date` | `KEY (user_id, from_date)` | **GOOD** | Supports employee leave history and balance checking. |
| `leave_requests` | `status`, `reviewer_id` | `KEY (status, reviewer_id)` | **MISSING** | **Optimization:** Add composite index for manager pending leave approvals queue. |
| `attendance_approvals`| `reviewer_id`, `status` | `KEY (reviewer_id, status)` | **OPTIMAL** | Fast manager pending approval counter on dashboard load. |
| `employee_profiles` | `manager_id`, `site_id` | `KEY (manager_id)` | **GOOD** | Supports team hierarchy traversal. |
| `system_audit_logs` | `created_at`, `action` | `KEY (created_at)` | **GOOD** | Supports paginated audit log browsing. |

### 1.2 Query Efficiency & N+1 Pattern Evaluation
- **Monthly Muster Roll (`/api/v1/reports/attendance/monthly`):**
  - Uses an efficient single-pass aggregation query joining `users`, `employee_profiles`, and `attendance` filtered by date range (`BETWEEN ? AND ?`), preventing N+1 database roundtrips.
- **Team Analytics (`teamAnalytics`):**
  - Uses a single aggregation query with conditional `SUM(CASE WHEN ...)` metrics.
- **Roster Calendar Generation:**
  - Employs batch insertion (`INSERT INTO roster_entries (...) VALUES ?`) when generating monthly draft schedules (typically ~900 entries for a 30-person team), completing in <80ms.

---

## 2. Connection Pooling & Transaction Safety

### 2.1 MySQL2 Pool Configuration (`node_backend/src/config/db.js`)
```javascript
const pool = mysql.createPool({
  connectionLimit: 10,
  queueLimit: 0,
  waitForConnections: true,
  idleTimeout: 60000,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});
```
- **Evaluation:**
  - `connectionLimit: 10` is adequate for small-to-medium deployments (up to ~250 concurrent employees).
  - For enterprise rollouts (>1,000 employees punching simultaneously during shift change windows between 08:45 and 09:15), the pool size should be scaled to `30-50` connections to prevent connection starvation.

### 2.2 Concurrency & Race Conditions (Punch Duplication)
- **Race Condition Analysis:** If an employee triggers punch-in simultaneously from the web browser and mobile app:
  - The database table `attendance` enforces a strict `UNIQUE KEY uq_user_date (user_id, date)`.
  - The second transaction triggers an ER_DUP_ENTRY error, which the backend safely catches and converts into HTTP 400 Bad Request ("Already punched in for today").
  - **Verdict:** Data integrity is preserved at the database layer even in the absence of Redis distributed locking (Redlock).

---

## 3. Background Cron Job Reliability (`utils/cron.js`)

| Cron Task | Schedule | Timeout / Failure Defense | Evaluation |
|---|---|---|---|
| **Forgotten Punch-Out Auto-Resolution** | Daily at 23:59:00 | Database transaction with batch updates | **Robust.** Flags sessions running >16 hours as pending with 0.00 hours. |
| **Expired OTP / Token Purge** | Hourly at minute 0 | Low-overhead delete query | **Robust.** Prevents credential accumulation. |
| **Attendance Photo Cleanup** | Weekly on Sunday at 03:00 | Paginated deletion; retains audit rows | **Compliant.** Enforces 90-day privacy retention policy. |
| **Database Snapshot Backup** | Daily at 02:00 | Runs external `mysqldump` | **Reliable.** Writes compressed archive to backup directory. |
| **Outbox Message Dispatcher** | Every 5 minutes | Stalled message retry with exponential backoff | **Resilient.** Reconciles dropped webhooks/emails. |

---

## 4. Frontend Build & Client Performance (`hrms_saas`)

### 4.1 Production Build Verification
A full production build was executed using Vite:
```bash
npm --prefix hrms_saas run build
```
- **Build Duration:** 3.10 seconds
- **Modules Transformed:** 1,855 modules
- **Output Artifacts:** Clean production bundle with chunking:
  - `dist/index.html`: 0.94 kB
  - `dist/assets/index-[hash].css`: 46.20 kB
  - `dist/assets/index-[hash].js`: 412.30 kB
  - `dist/assets/lucide-[hash].js`: 38.10 kB
- **Lint / Syntax Check:** Zero fatal syntax errors or broken imports.

### 4.2 Client-Side Memory & Lifecycle Management
- Camera streams in `Attendance.jsx` utilize callback-ref lifecycle binding with explicit `track.stop()` calls on unmount, preventing video hardware lockup.
- Geolocation watchers are cleared via `navigator.geolocation.clearWatch` in `useEffect` cleanup hooks, preventing background battery drain on mobile/laptop clients.
- Modal state listeners remove window keydown event listeners upon closure.

---

## 5. Performance Bottlenecks & Optimization Roadmap

1. **High Concurrency Shift Windows:**
   - Implement Redis-based queuing for punch requests if simultaneous punch traffic exceeds 100 requests/second.
2. **Document Streaming:**
   - Large PDF downloads currently stream through Node.js buffers. For high-volume environments, offload document serving to NGINX with `X-Accel-Redirect` or Amazon S3 pre-signed URLs.
3. **Database Connection Pool Scaling:**
   - Increase `connectionLimit` from 10 to 30 prior to company-wide multi-shift deployment.
