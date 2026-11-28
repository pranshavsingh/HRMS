# HRMS Attendance & Data Integrity Report (Bug 10 & Bug 14)

## 1. Bug 10 – Regularized Attendance Work Hours Calculation (`node_backend/src/services/attendance.service.js`)
- **Root Cause:** When approving a regularized punch-out (`ap.type === "out"`), `approvalAction` updated `status` without computing `total_hours`, `early_departure_minutes`, or `overtime_minutes`.
- **Fix:** In `approvalAction`'s approved branch, when `ap.type === "out"` and `att.punch_in_time` & `att.punch_out_time` exist with `total_hours == null || Number(att.total_hours) === 0`, `shiftAttendanceService.evaluatePunchOut(att, outDt, tx)` is invoked and `total_hours`, `early_departure_minutes`, and `overtime_minutes` are persisted atomically.

## 2. Bug 14 – Leave Pre-Submit Overlap Validation (`hrms_saas/src/pages/Leave.jsx`)
- **Root Cause:** `handleSubmit` blocked submission client-side using `hasOverlap` computed only over the currently loaded 10-row page.
- **Fix:** Removed the client-side blocking `if (hasOverlap) return;` guard in `handleSubmit` so the backend `/api/leave/apply/` transaction (`leaveRepository.findOverlappingApprovedLeaves`) acts as the authoritative overlap validator across all pages.
