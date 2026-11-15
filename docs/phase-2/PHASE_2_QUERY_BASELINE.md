# HRMS Phase 2: Database Query Baseline & Performance Inventory

## 1. Overview & Query Catalog

This document details the primary SQL queries executed across the HRMS application, their current query execution plans (EXPLAIN analysis), indexing status, and identified performance bottlenecks under high concurrency.

---

## 2. High-Frequency Query Inventory

### Q1: Employee Directory Query
- **Endpoint:** `GET /api/accounts/employees/`
- **Current Query Pattern (Unoptimized N+1):**
  ```sql
  -- Base Query (1 query)
  SELECT * FROM accounts_user WHERE role IN ('employee', 'manager', 'hr') AND deleted_at IS NULL;

  -- Nested Loop Queries (4 queries per employee):
  SELECT * FROM accounts_employeeprofile WHERE user_id = ?;
  SELECT * FROM accounts_user WHERE id = ?; -- Manager lookup
  SELECT COUNT(*) as c FROM accounts_employeedocument WHERE user_id = ?;
  SELECT * FROM accounts_employeelocation WHERE user_id = ?;
  ```
- **Query Count for 5,000 Employees:** `1 + (5,000 * 4) = 20,001 queries`.
- **EXPLAIN Analysis:** Full table scans on `accounts_user`, followed by 20,000 individual primary key / foreign key lookups.
- **Optimization Strategy:**
  1. Server-side pagination (`LIMIT 50 OFFSET ?`).
  2. Single SQL `LEFT JOIN` for user, profile, and manager details.
  3. Two batched queries for the 50 employees on the active page:
     - Document counts: `SELECT user_id, COUNT(*) AS count FROM accounts_employeedocument WHERE user_id IN (...) GROUP BY user_id`
     - Geofence locations: `SELECT * FROM accounts_employeelocation WHERE user_id IN (...)`
  4. Query reduction: from 20,001 queries to **exactly 3 queries**.

---

### Q2: Admin Dashboard Summary Metrics
- **Endpoint:** `GET /api/accounts/admin-summary/`
- **Current Query Pattern (Multiple Roundtrips):**
  ```sql
  SELECT COUNT(*) c FROM accounts_user WHERE role IN ('employee','manager','hr') AND is_active=1 AND deleted_at IS NULL;
  SELECT COUNT(*) c FROM accounts_user WHERE role='manager' AND deleted_at IS NULL;
  SELECT COUNT(*) c FROM accounts_user WHERE role='employee' AND deleted_at IS NULL;
  SELECT COUNT(*) c FROM accounts_user WHERE role='hr' AND deleted_at IS NULL;
  SELECT COUNT(*) c FROM attendance_attendanceapproval WHERE status='pending';
  SELECT COUNT(*) c FROM leave_leave WHERE status='pending';
  SELECT COUNT(DISTINCT a.user_id) c FROM attendance_attendance a JOIN accounts_user u ON u.id = a.user_id WHERE a.date = CURDATE() AND a.status = 'approved' AND u.deleted_at IS NULL;
  ```
- **EXPLAIN Analysis:** 4 separate scans over `accounts_user` checking different role predicates.
- **Optimization Strategy:**
  Combine all user-level aggregations into a single conditional `SELECT`:
  ```sql
  SELECT 
    COUNT(CASE WHEN role IN ('employee','manager','hr') AND is_active = 1 THEN 1 END) AS staff,
    COUNT(CASE WHEN role = 'manager' THEN 1 END) AS managers,
    COUNT(CASE WHEN role = 'employee' THEN 1 END) AS employees,
    COUNT(CASE WHEN role = 'hr' THEN 1 END) AS hr_count
  FROM accounts_user
  WHERE deleted_at IS NULL;
  ```
  Reduces total database roundtrips from 7 to 4.

---

### Q3: Attendance Punch-In Race & Validation Query
- **Endpoint:** `POST /api/attendance/punch-in/`
- **Current Query Pattern (Vulnerable to Concurrency):**
  ```sql
  -- Step 1 (Outside TX): Check approved leave
  SELECT to_date FROM leave_leave WHERE user_id=? AND status='approved' AND ? BETWEEN from_date AND to_date LIMIT 1;
  -- Step 2 (Outside TX): Check latest attendance status
  SELECT * FROM attendance_attendance WHERE user_id=? ORDER BY date DESC, punch_in_time DESC LIMIT 1;
  -- Step 3 (Outside TX): Check open attendance
  SELECT * FROM attendance_attendance WHERE user_id=? AND punch_out_time IS NULL AND punch_in_status <> 'rejected' LIMIT 1;
  -- Step 4 (Inside TX): Insert attendance
  INSERT INTO attendance_attendance (...) VALUES (...);
  ```
- **Defect:** Race window between Step 3 and Step 4 allows duplicate open sessions.
- **Optimization & Hardening:**
  Execute entirely inside `db.transaction`:
  ```sql
  -- 1. Acquire exclusive lock on employee record
  SELECT id, is_active FROM accounts_user WHERE id = ? FOR UPDATE;
  -- 2. Verify no active open session under lock
  SELECT id FROM attendance_attendance WHERE user_id = ? AND punch_out_time IS NULL AND punch_in_status <> 'rejected' LIMIT 1 FOR UPDATE;
  -- 3. Atomic insert
  INSERT INTO attendance_attendance (...) VALUES (...);
  ```

---

### Q4: Attendance Punch-Out Query
- **Endpoint:** `POST /api/attendance/punch-out/`
- **Current Query Pattern:**
  ```sql
  -- Step 1 (Outside TX):
  SELECT * FROM attendance_attendance WHERE user_id=? AND punch_out_time IS NULL AND punch_in_status <> 'rejected' LIMIT 1;
  -- Step 2 (Inside TX):
  UPDATE attendance_attendance SET punch_out_time = NOW(), ... WHERE id = ?;
  ```
- **Defect:** Duplicate punch-out submissions both update the same record and duplicate approvals.
- **Optimization & Hardening:**
  ```sql
  -- Atomic conditional update with row lock
  UPDATE attendance_attendance 
  SET punch_out_time = ?, punch_out_photo = ?, punch_out_lat = ?, punch_out_lng = ?, punch_out_outside = ?, punch_out_status = ?, status = ?, is_outside_location = ?
  WHERE id = ? AND punch_out_time IS NULL;
  ```
  Verify `result.changes === 1`. If `0`, reject immediately with HTTP 400.

---

### Q5: Team Attendance Register Query
- **Endpoint:** `GET /api/attendance/team-attendance/`
- **Current Query Pattern:**
  - Paginates team members via `LIMIT / OFFSET`.
  - Batch queries monthly attendance for visible member IDs:
    ```sql
    SELECT * FROM attendance_attendance WHERE user_id IN (?) AND date >= ? AND date <= ?;
    ```
- **Indexing Requirement:**
  To prevent scanning millions of attendance rows across historical years, queries on `(user_id, date)` require a composite B-Tree index:
  ```sql
  CREATE INDEX idx_att_user_date ON attendance_attendance(user_id, date);
  ```

---

### Q6: Attendance & Leave History Pagination
- **Endpoints:** `GET /api/attendance/history/`, `GET /api/leave/my/`
- **Current Query Pattern:**
  Unbounded `SELECT * FROM attendance_attendance WHERE user_id = ? ORDER BY date DESC` returns all historical records since account inception.
- **Optimization Strategy:**
  Enforce pagination envelope:
  ```sql
  SELECT * FROM attendance_attendance 
  WHERE user_id = ? 
  ORDER BY date DESC, punch_in_time DESC 
  LIMIT ? OFFSET ?;
  ```
  Along with `SELECT COUNT(*) AS total FROM attendance_attendance WHERE user_id = ?`.

---

## 3. Query Latency & Index Summary Table

| Query Target | Bottleneck | Target Latency (p95) | Index Applied |
| :--- | :--- | :--- | :--- |
| `accounts_user` by Role | Full table scan | < 5ms | `idx_user_role_active (role, is_active)` |
| `accounts_employeeprofile` Manager | Filtering direct reports | < 2ms | `idx_profile_manager (manager_id, is_active_employee)` |
| `attendance_attendance` Open Punch | Searching unclosed punch | < 1ms | `idx_att_user_open (user_id, punch_out_time, punch_in_status)` |
| `attendance_attendance` Range Scan | Date range filters | < 3ms | `idx_att_user_date (user_id, date)` |
| `attendance_attendanceapproval` Pending | Pending workflow queues | < 2ms | `idx_appr_by_status (approved_by_id, status)` |
| `leave_leave` Active Overlap | Date range collision check | < 2ms | `idx_leave_user_dates (user_id, status, from_date, to_date)` |
| `audit_logs` History & Severity | Administrative audit queries | < 5ms | `idx_audit_created_severity (created_at, severity)` |
