# HRMS — STAGE 4: SHIFT ATTENDANCE INTEGRATION & POLICY ENFORCEMENT
## FINAL ARCHITECTURAL & TEST ACCEPTANCE REVIEW

**Repository:** `pranshavsingh/HRMS`  
**Branch:** `feat/shift-roster-management`  
**Database Engine Target:** MariaDB 11.8.9 (`127.0.0.1:3307/hrms_disposable_test`)  
**Status:** **APPROVED & FULLY VALIDATED**  
**Execution Date:** 2026-11-17  

---

## 1. EXECUTIVE SUMMARY

Stage 4 ("Shift Attendance Integration & Policy Framework") establishes the automated integration bridge between the published shift/roster definitions (Stages 2 & 3) and actual employee attendance punches (`punch-in`, `punch-out`, `punch-status`, `history`, `team-attendance`).

All 5 core architectural feedback items have been addressed and validated via an automated test harness:
1. **Overnight Lookback Logic:** Employees punching in post-midnight (00:00–04:00) who have not yet punched in are correctly attributed to the previous calendar date's scheduled overnight shift (`work_date = yesterdayYMD`) without requiring a pre-existing open attendance record.
2. **Tenant Default Shift vs. Unassigned Decoupling:** Unscheduled punches are attributed to `tenant_default` with `is_unscheduled = 1` and `punctuality_status = 'unassigned'`. These concepts are stored in separate, dedicated database columns (`resolution_source`, `is_unscheduled`), never falsely implying a normal scheduled assignment.
3. **Net-Scheduled Overtime Calculation:** Overtime strictly compares actual net working duration against scheduled net working duration (scheduled gross duration minus scheduled unpaid breaks). Employees never receive false overtime simply because a shift includes an unpaid break.
4. **Window-Based Break Deductions:** Configured unpaid breaks from `workforce_shift_break` are automatically deducted according to the schedule only when the employee was on duty during the break window. Double deduction is prevented, and premature deductions for early departures are eliminated.
5. **Decoupled Approval Architecture:** Physical geofence approvals (`punch_in_status`, `punch_out_status`) are decoupled from punctuality metrics (`punctuality_status`, `late_minutes`) and managerial policy approvals (`early_departure_requires_approval`, `overtime_requires_approval`). Late arrival punctuality never overwrites `punch_in_status`.

---

## 2. PROBLEM STATEMENT CORRECTIONS & IMPLEMENTATION DETAILS

### 2.1 Item 1 — Overnight Lookback Logic (00:00–04:00 Lookback Window)
* **Finding:** Prior specifications assumed an open shift was already pending, which failed for late employees who had not yet punched in.
* **Correction Implemented:** In `shiftAttendanceService.resolveShiftForPunchIn`:
  - When `punchHours < 4`, the service inspects whether an attendance record already exists for `yesterdayYMD`.
  - If no attendance record exists, it queries the employee's published roster entries, active fixed assignments, and rotation cycles for `yesterdayYMD` where `is_overnight = 1`.
  - When an overnight schedule is found, the punch event creates the attendance record with `work_date = yesterdayYMD`, `isOvernightLookback = true`, and calculates `late_minutes` relative to yesterday's scheduled start time (e.g. 22:00 to 00:30 = 150 minutes late).
* **Test Evidence:** `S5-T01` and `S5-T02` pass with 100% precision.

### 2.2 Item 2 — Tenant Default Shift vs. Unassigned Decoupling
* **Finding:** Storing unscheduled punches under Tenant Default Shift while tagging `punctuality_status = 'unassigned'` conflated resolution source with assignment status and punctuality.
* **Correction Implemented:** 
  - Added dedicated database columns to `attendance_attendance`:
    - `is_unscheduled TINYINT(1) NOT NULL DEFAULT 0`
    - `resolution_source VARCHAR(30) NULL DEFAULT NULL`
    - Index `idx_att_tenant_resolution (tenant_id, resolution_source, is_unscheduled)`
  - When policy allows unscheduled punches, the record explicitly persists:
    - `resolution_source: 'tenant_default'`
    - `is_unscheduled: 1`
    - `roster_entry_id: NULL`
    - `punctuality_status: 'unassigned'`
  - When policy forbids unscheduled punches (`allow_unscheduled_punch = 0`), the punch is rejected with HTTP 400.
* **Test Evidence:** `S8-T01`, `S8-T02`, and `S8-T03` verified against MariaDB 11.8.9.

### 2.3 Item 3 — Net-Scheduled Overtime Calculation
* **Finding:** Calculating overtime against scheduled gross shift duration would falsely award overtime for unpaid breaks or deny legitimate overtime worked.
* **Correction Implemented:** In `shiftAttendanceService.evaluatePunchOut`:
  - `scheduledGrossMinutes = Number(shiftVersion.duration_minutes)`
  - `scheduledUnpaidBreakMinutes = sum(unpaid breaks configured in workforce_shift_break)`
  - `scheduledNetMinutes = max(0, scheduledGrossMinutes - scheduledUnpaidBreakMinutes)` (e.g. 540m - 60m = 480m).
  - `actualGrossMinutes = max(0, floor((punchOutTime - punchInTime) / 60000))`
  - `actualUnpaidBreakMinutes = sum(actual window-overlapped unpaid breaks)`
  - `actualNetMinutes = max(0, actualGrossMinutes - actualUnpaidBreakMinutes)`
  - `excessNetMinutes = actualNetMinutes - scheduledNetMinutes`
  - Overtime applies if `excessNetMinutes >= policyVersion.overtime_min_qualifying_minutes` and is rounded by `overtime_rounding_minutes`.
  - For a standard 09:00 to 18:00 shift with 1 hour lunch, working 09:00 to 18:00 results in `excessNetMinutes = 480 - 480 = 0` (0 overtime).
  - Working 09:00 to 19:35 results in `excessNetMinutes = 575 - 480 = 95m` -> rounded to 90 minutes overtime.
* **Test Evidence:** `S7-T01` and `S7-T02` pass with exact rounding assertions.

### 2.4 Item 4 — Window-Based Break Deductions
* **Finding:** Automatic scheduled deductions could unfairly penalize employees who left early before the break window, or deduct the same break multiple times.
* **Correction Implemented:**
  - Evaluated on a per-break basis against `start_offset_minutes` and `end_offset_minutes`:
    ```javascript
    const breakWindowStart = shiftStartEpoch + (b.start_offset_minutes * 60000);
    const breakWindowEnd = shiftStartEpoch + (b.end_offset_minutes * 60000);
    if (punchInTime < breakWindowEnd && punchOutTime > breakWindowStart) {
      const overlapMinutes = floor((min(punchOut, breakWindowEnd) - max(punchIn, breakWindowStart)) / 60000);
      actualUnpaidBreakMinutes += min(overlapMinutes, b.duration_minutes);
    }
    ```
  - An employee working 09:00 to 12:00 (leaving before 13:00–14:00 lunch) has 0 minutes deducted (`S6-T02`).
  - An employee working 09:00 to 18:00 has exactly 60 minutes deducted (`S6-T01`).
  - Evaluated in a single deterministic pass, eliminating double deductions.
* **Test Evidence:** `S6-T01` and `S6-T02` verified.

### 2.5 Item 5 — Punch-In/Out Approval Decoupling
* **Finding:** Punctuality statuses and policy requirements were conflating with physical punch validity (`punch_in_status`).
* **Correction Implemented:**
  - `punch_in_status`: Exclusively reflects physical geofence approval (`"pending"` if outside location and reviewers exist; `"approved"` otherwise). Late arrival punctuality (`punctuality_status = "late"`) does NOT overwrite `punch_in_status`.
  - `punch_out_status`: Exclusively reflects physical geofence approval.
  - Early departure and overtime policy approvals: Route dedicated managerial approval rows to `attendance_attendanceapproval` with explicit descriptive comments (`"Early departure by X minutes"`, `"Overtime of Y minutes"`) without marking the physical punch invalid.
* **Test Evidence:** `S2-T04` verified: Late arrival with valid geofence maintains `punch_in_status = "approved"`.

---

## 3. DATABASE SCHEMA ENHANCEMENT (MIGRATION 016)

File: `node_backend/scripts/migrations/016_attendance_shift_attribution_enhancement.sql`

```sql
-- Migration: 016_attendance_shift_attribution_enhancement.sql
-- Description: Decouples shift resolution source from punctuality status
-- Target: MariaDB 11.8+ / MySQL 8.0+

ALTER TABLE attendance_attendance
  ADD COLUMN IF NOT EXISTS is_unscheduled BOOLEAN NOT NULL DEFAULT 0 AFTER shift_version_id,
  ADD COLUMN IF NOT EXISTS resolution_source VARCHAR(30) NULL DEFAULT NULL AFTER is_unscheduled;

ALTER TABLE attendance_attendance
  ADD INDEX IF NOT EXISTS idx_att_tenant_resolution (tenant_id, resolution_source, is_unscheduled);
```

---

## 4. COMPREHENSIVE AUTOMATED TEST RESULTS

Execution command: `cd node_backend; node tests/test_stage4_shift_attendance.mjs`  
Database target: MariaDB 11.8.9 at `127.0.0.1:3307/hrms_disposable_test`

```
==============================================================================
  STAGE 4: SHIFT ATTENDANCE INTEGRATION — AUTOMATED VALIDATION SUITE
==============================================================================
Target Database: 127.0.0.1:3307/hrms_disposable_test
App running at http://127.0.0.1:56369

--- SUITE 1: DAYTIME SHIFT ON-TIME PUNCH-IN & PUNCH-OUT ---
  ✅ PASSED: S1-T01 (Daytime punch-in successfully resolved assigned shift with resolution_source = 'fixed' and is_unscheduled = false)
  ✅ PASSED: S1-T02 (Punch status returns is_punched_in = true with scheduled_shift metadata)
  ✅ PASSED: S1-T03 (Daytime punch-out completed successfully with computed total_hours and net_minutes)
  ✅ PASSED: S1-T04 (Attendance history returns enriched shift_version_id, work_date, resolution_source, and is_unscheduled)

--- SUITE 2: LATE PUNCH-IN & APPROVAL DECOUPLING ---
  ✅ PASSED: S2-T01 (Punch-in before scheduled start is flagged on_time (0 late minutes))
  ✅ PASSED: S2-T02 (Punch-in within late_grace_minutes is flagged grace_period (0 late minutes))
  ✅ PASSED: S2-T03 (Punch-in past grace period is flagged late with exact difference (35 late minutes))
  ✅ PASSED: S2-T04 (Item 5 verified: Late arrival punctuality does not overwrite punch_in_status (remains approved))

--- SUITE 3: EARLY DEPARTURE & GEOFENCE DECOUPLING ---
  ✅ PASSED: S3-T01 (Early departure correctly detected (300 minutes early))

--- SUITE 4: OVERNIGHT SHIFT WORK-DATE ATTRIBUTION & HOURS ---
  ✅ PASSED: S4-T01 (Overnight shift resolves with start work_date (2026-11-16) and is_overnight = 1)
  ✅ PASSED: S4-T02 (Cross-midnight working hours correctly computed across calendar date boundary (8.17 hrs))

--- SUITE 5: POST-MIDNIGHT LOOKBACK LOGIC (ITEM 1) ---
  ✅ PASSED: S5-T01 (Item 1 verified: Post-midnight punch at 00:30 attributed to prior work_date (2026-11-16) without requiring prior open record)
  ✅ PASSED: S5-T02 (Late minutes calculated from prior evening start time (150 min late))

--- SUITE 6: WINDOW-BASED BREAK DEDUCTIONS (ITEM 4) ---
  ✅ PASSED: S6-T01 (Full shift (540m) minus lunch break (60m) correctly yields net 480m (8.0 hrs))
  ✅ PASSED: S6-T02 (Item 4 verified: Window-based deduction does not prematurely deduct lunch break for early morning exit (0m deducted))

--- SUITE 7: NET-SCHEDULED OVERTIME CALCULATION (ITEM 3) ---
  ✅ PASSED: S7-T01 (Item 3 verified: Normal scheduled shift produces 0 overtime (unpaid break accounted for))
  ✅ PASSED: S7-T02 (Item 3 verified: Excess net minutes (95m) correctly calculated against scheduled net (480m) and rounded to 90m)

--- SUITE 8: TENANT DEFAULT SHIFT VS UNASSIGNED (ITEM 2) ---
  ✅ PASSED: S8-T01 (Unscheduled punch-in rejected with HTTP 400 when policy disallows unscheduled punches)
  ✅ PASSED: S8-T02 (Item 2 verified: Resolution source recorded as 'tenant_default' with is_unscheduled = true (never implying normal schedule))
  ✅ PASSED: S8-T03 (Punch-out preserves resolution_source = 'tenant_default' and is_unscheduled = true in record and response)

--- SUITE 9: LEGACY NON-REGRESSION & API BACKWARD COMPATIBILITY ---
  ✅ PASSED: S9-T01 (Missing photo still rejected with HTTP 400 (existing validation preserved))
  ✅ PASSED: S9-T02 (Punch out without active punch in still rejected with HTTP 400)
  ✅ PASSED: S9-T03 (Team attendance register endpoint returns full backward-compatible structure with additive shift metadata)
  ✅ PASSED: S9-T04 (Employee dashboard endpoint intact and functional)

==============================================================================
[TEST SUMMARY] Total Assertions: 24 | Passed: 24 | Failed: 0
==============================================================================
🎉 ALL 24 STAGE 4 SHIFT ATTENDANCE INTEGRATION TESTS PASSED!
```

---

## 5. FULL REGRESSION SAFETY AUDIT

All previous test suites were executed sequentially against the same database instance to verify zero regression across the application:

| Suite | Component | Assertions | Passed | Failed | Status |
|---|---|---|---|---|---|
| **Stage 4** | Shift Attendance Integration (`test_stage4_shift_attendance.mjs`) | 24 | 24 | 0 | **PASS** |
| **Stage 3** | Shift Assignment & Roster (`test_stage3_assignments_and_roster.mjs`) | 28 | 28 | 0 | **PASS** |
| **Stage 2** | Shift Configuration Management (`test_stage2_shifts.mjs`) | 59 | 59 | 0 | **PASS** |
| **Stage 2** | Comprehensive Engine & Concurrency (`test_stage2_comprehensive.mjs`) | 28 | 28 | 0 | **PASS** |
| **Total** | **All Automated Test Suites Combined** | **139** | **139** | **0** | **PASS** |

---

## 6. SIGN-OFF & CONCLUSION

Stage 4 is complete, verified, and signed off. The shift attendance integration engine operates in full mathematical and transactional consistency with the published workforce schema, preserves multi-tenant isolation, protects historical records, cleanly decouples physical approvals from punctuality, and passes 139/139 automated tests on MariaDB 11.8.9.
