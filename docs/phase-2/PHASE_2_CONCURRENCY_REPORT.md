# HRMS Phase 2: Attendance Concurrency & Transaction Hardening Report

## 1. Executive Summary

This report documents the architectural fixes and automated test verification for concurrency defects across employee attendance punch-in/out workflows, leave applications, and administrative approvals on branch `feat/phase-2-database-performance`.

### Core Requirements Verified
- **Atomic Punch-In:** Zero duplicate active sessions permitted under concurrent requests.
- **Atomic Punch-Out:** Exactly one concurrent punch-out request succeeds; redundant requests are safely rejected without data corruption.
- **Multi-Session Preservation:** No blanket unique constraint on `(user_id, date)`. Legitimate multi-session work patterns (split shifts, breaks, re-entry) are fully supported.
- **Reviewer Race Safety:** Simultaneous approval or rejection actions by multiple managers/superadmins result in exactly one successful status transition with atomic row-level locks.

---

## 2. Root Cause Analysis of Pre-existing Defects

### Pre-fix Vulnerability 1: Time-of-Check to Time-of-Use (TOCTOU) in Punch-In
- **Flaw:** State checks (`findOpenAttendance` and `onLeave`) were executed outside the database transaction without row-level locks.
- **Race Condition:** Two concurrent punch-in requests from an employee arriving within the same 50ms window would both observe `open === null`. Both requests proceeded into separate transactions, resulting in duplicate active attendance records for the employee.

### Pre-fix Vulnerability 2: Non-Atomic Punch-Out
- **Flaw:** `findOpenAttendance` was queried prior to entering the transaction. Multiple concurrent punch-out requests retrieved the same active attendance record and both executed updates and inserted redundant approval records.

### Pre-fix Vulnerability 3: Leave Record Masking as Open Attendance
- **Flaw:** Leave attendance records are inserted with `status = 'leave'` and `punch_out_time = NULL`. The previous query `WHERE user_id = ? AND punch_out_time IS NULL AND punch_in_status <> 'rejected'` erroneously matched leave records as unclosed punch sessions, blocking legitimate punches with "Already punched in".

---

## 3. Implementation Details

### 1. Serialized Row Locking on `accounts_user`
In `node_backend/src/services/attendance.service.js`:
All attendance punch operations are wrapped in `db.transaction`. The transaction begins by acquiring an exclusive row lock on the user's primary identity record:
```sql
SELECT id, is_active FROM accounts_user WHERE id = ? FOR UPDATE;
```
- **Serialization:** Any secondary request for the same employee blocks until the first transaction completes.
- **Performance:** Because the lock is row-level on `accounts_user.id`, different employees punch in simultaneously without any cross-employee blocking or database-level lock contention.

### 2. Guard Invariant Checks Under Lock
Under the exclusive row lock, the following invariants are evaluated:
1. Verify user account is active (`is_active = 1`).
2. Verify employee is not on approved leave today.
3. Verify latest attendance does not have punch-out pending approval.
4. Verify no open punch session exists:
   ```sql
   SELECT id FROM attendance_attendance 
   WHERE user_id = ? 
     AND punch_out_time IS NULL 
     AND punch_in_status NOT IN ('rejected', 'leave') 
     AND status <> 'leave' 
   LIMIT 1 FOR UPDATE;
   ```

### 3. Atomic Conditional Updates in Punch-Out
In `punchOut`, after acquiring the user lock and reading the open session:
```sql
UPDATE attendance_attendance 
SET punch_out_time = ?, punch_out_photo = ?, punch_out_lat = ?, punch_out_lng = ?, 
    punch_out_outside = ?, punch_out_status = ?, status = ?, is_outside_location = ?
WHERE id = ? AND punch_out_time IS NULL;
```
If `result.changes === 0`, the transaction aborts and throws HTTP 400 "Punch in first", ensuring duplicate punch-outs cannot commit.

### 4. Atomic Decision Locks in Approvals
In `approvalAction` (`attendance.service.js`) and `action` (`leave.service.js`):
1. Acquire row lock on the target approval or leave record using `SELECT ... FOR UPDATE`.
2. Verify `status === 'pending'`.
3. Execute conditional update:
   ```sql
   UPDATE attendance_attendanceapproval 
   SET status = ?, comment = ?, action_at = NOW() 
   WHERE id = ? AND status = 'pending';
   ```
4. If `result.changes === 0`, throw HTTP 400 "This approval item is already closed".

---

## 4. Automated Verification Results

Automated concurrency regression test executed at `node_backend/tests/concurrency/attendance_concurrency.test.js`:

| Test Case | Concurrent Load | Expected Result | Actual Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Simultaneous Punch-In** | 10 parallel requests | Exactly 1 success, 9 rejections | 1 success, 9 rejections | **PASS** |
| **Simultaneous Punch-Out** | 10 parallel requests | Exactly 1 success, 9 rejections | 1 success, 9 rejections | **PASS** |
| **Multi-Session Workflows** | 2 sequential sessions on same date | 2 distinct rows committed | 2 distinct rows committed | **PASS** |
| **Concurrent Leave Approval** | 5 parallel manager approvals | Exactly 1 success, 4 rejections | 1 success, 4 rejections | **PASS** |
| **Concurrent Exception Approval** | 5 parallel approval decisions | Exactly 1 success, 4 rejections | 1 success, 4 rejections | **PASS** |

### Test Runner Evidence
```
TAP version 13
# Subtest: P2.1 — Attendance & Transactional Concurrency Test Suite
    ok 1 - should safely handle 10 simultaneous punch-in requests for the same employee, allowing exactly 1 to succeed
    ok 2 - should safely handle 10 simultaneous punch-out requests for the same employee, allowing exactly 1 to succeed
    ok 3 - should support multiple distinct punch sessions per day for the same employee without constraint violation
    ok 4 - should safely handle concurrent leave approval actions, allowing exactly 1 reviewer decision to succeed
    ok 5 - should safely handle concurrent attendance exception approval actions
1..1
# tests 5
# suites 1
# pass 5
# fail 0
```
