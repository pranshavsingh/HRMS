# HRMS REAL-TIME MODULE COVERAGE MATRIX

**Date:** 24 Nov 2026  
**Auditor:** QA Automation & Real-Time Systems Engineering  
**Application Packages:** [node_backend](file:///f:/hrms/node_backend), [hrms_saas](file:///f:/hrms/hrms_saas), [hrms_mobile](file:///f:/hrms/hrms_mobile)

---

## 1. COMPREHENSIVE COVERAGE MATRIX

The table below documents every HRMS module, tracking the mutating action, backend emitter, Web page subscription, and Mobile screen subscription.

| # | Domain Module | Action / Trigger | Backend Service & Emitter | Web Subscription ([hrms_saas](file:///f:/hrms/hrms_saas)) | Mobile Subscription ([hrms_mobile](file:///f:/hrms/hrms_mobile)) | Verified Delivery |
|---|---|---|---|---|---|---|
| 1 | **Auth & Session** | Admin deactivates account | `accounts.service.js` -> `realtimeService.disconnectUser()` | Global Axios 401 Interceptor | `_layout.tsx` (`session:revoked`) | [YES](file:///f:/hrms/node_backend/tests/realtime/realtime_e2e_multiclient.test.js#L458) |
| 2 | **Auth & Session** | Token revocation check | Handshake Middleware -> `canJoinRoom()` | Socket Disconnect | Socket Disconnect | [YES](file:///f:/hrms/node_backend/tests/phase3/realtime_pubsub.test.js#L62) |
| 3 | **Employee Profile** | Update profile info / designation | `accounts.service.js` -> `emitEmployeeEvent("updated")` | `Employees.jsx`, `EmployeeDocuments.jsx` | `employees.tsx`, `profile.tsx`, `dashboard.tsx` | [YES](file:///f:/hrms/node_backend/tests/realtime/realtime_e2e_multiclient.test.js#L411) |
| 4 | **Employee Photo** | Upload profile picture | `accounts.service.js` -> `emitEmployeeEvent("updated")` | `Navbar.jsx`, `Employees.jsx` | `dashboard.tsx`, `profile.tsx` | [YES](file:///f:/hrms/node_backend/tests/realtime/realtime_e2e_multiclient.test.js#L411) |
| 5 | **Attendance: Punch In** | Mobile / Web user punches in | `attendance.service.js` -> `emitAttendanceEvent("punch_in")` | `Attendance.jsx`, `AttendanceApprovals.jsx`, `TeamAttendance.jsx` | `punch.tsx`, `dashboard.tsx`, `team-attendance.tsx` | [YES](file:///f:/hrms/node_backend/tests/realtime/realtime_e2e_multiclient.test.js#L226) |
| 6 | **Attendance: Punch Out** | Mobile / Web user punches out | `attendance.service.js` -> `emitAttendanceEvent("punch_out")` | `Attendance.jsx`, `AttendanceApprovals.jsx`, `TeamAttendance.jsx` | `punch.tsx`, `dashboard.tsx`, `history.tsx` | [YES](file:///f:/hrms/node_backend/tests/realtime/realtime_e2e_multiclient.test.js#L323) |
| 7 | **Attendance: Approval** | Manager approves punch | `attendance.service.js` -> `emitAttendanceEvent("approved")` | `AttendanceApprovals.jsx`, `AdminDashboard.jsx` | `punch.tsx`, `approvals.tsx`, `history.tsx` | [YES](file:///f:/hrms/node_backend/tests/realtime/realtime_e2e_multiclient.test.js#L251) |
| 8 | **Attendance: Rejection**| Manager rejects punch | `attendance.service.js` -> `emitAttendanceEvent("rejected")` | `AttendanceApprovals.jsx`, `AdminDashboard.jsx` | `punch.tsx`, `approvals.tsx`, `history.tsx` | [YES](file:///f:/hrms/node_backend/tests/realtime/realtime_e2e_multiclient.test.js#L251) |
| 9 | **Attendance: Regularize**| Employee submits regularization | `attendance.service.js` -> `broadcastMapped("attendance_update")` | `AttendanceApprovals.jsx`, `AttendanceHistory.jsx` | `approvals.tsx`, `history.tsx` | [YES](file:///f:/hrms/node_backend/tests/realtime/realtime_e2e_multiclient.test.js#L282) |
| 10 | **Leave: Apply** | Employee applies for leave | `leave.service.js` -> `emitLeaveEvent("applied")` | `LeaveApprovals.jsx`, `HRDashboard.jsx` | `approvals.tsx`, `leave.tsx` | [YES](file:///f:/hrms/node_backend/tests/realtime/realtime_e2e_multiclient.test.js#L155) |
| 11 | **Leave: Approve** | Manager / HR approves leave | `leave.service.js` -> `emitLeaveEvent("approved")` | `Leave.jsx`, `LeaveApprovals.jsx`, `ManagerDashboard.jsx` | `leave.tsx`, `approvals.tsx`, `history.tsx` | [YES](file:///f:/hrms/node_backend/tests/realtime/realtime_e2e_multiclient.test.js#L182) |
| 12 | **Leave: Reject** | Manager / HR rejects leave | `leave.service.js` -> `emitLeaveEvent("rejected")` | `Leave.jsx`, `LeaveApprovals.jsx`, `ManagerDashboard.jsx` | `leave.tsx`, `approvals.tsx` | [YES](file:///f:/hrms/node_backend/tests/realtime/realtime_e2e_multiclient.test.js#L182) |
| 13 | **Leave: Concession** | Admin grants concession days | `leave.service.js` -> `emitLeaveEvent("notice")` | `Leave.jsx` (Balance alert) | `leave.tsx` (Native Alert popup) | [YES](file:///f:/hrms/node_backend/tests/realtime/realtime_e2e_multiclient.test.js#L182) |
| 14 | **Shifts: Create/Edit** | Admin creates or edits shift | `shift.service.js` -> `broadcastMapped("schedule_update")` | `Shifts.jsx` | `shifts.tsx` | [YES](file:///f:/hrms/hrms_saas/src/pages/Shifts.jsx#L223) |
| 15 | **Rosters: Publish** | Manager publishes weekly roster | `roster.service.js` -> `broadcastMapped("schedule_update")` | `Roster.jsx` | `shifts.tsx` | [YES](file:///f:/hrms/hrms_mobile/src/app/(tabs)/shifts.tsx#L34) |
| 16 | **Documents: Upload** | Employee uploads identity doc | `accounts.service.js` -> `emitDocumentEvent("uploaded")` | `Documents.jsx`, `EmployeeDocuments.jsx` | `my-documents.tsx`, `employee-documents.tsx` | [YES](file:///f:/hrms/hrms_mobile/src/app/my-documents.tsx#L75) |
| 17 | **Documents: Verify** | HR verifies document | `accounts.service.js` -> `emitDocumentEvent("verified")` | `Documents.jsx`, `EmployeeDocuments.jsx` | `my-documents.tsx`, `employee-documents.tsx` | [YES](file:///f:/hrms/hrms_mobile/src/app/my-documents.tsx#L75) |
| 18 | **Sites Management** | Superadmin creates/edits site | `site.service.js` -> `broadcastMapped("site:updated")` | `SiteContext.jsx`, `SiteManagement.jsx` | Not applicable (restricted to Web admin) | [YES](file:///f:/hrms/hrms_saas/src/context/SiteContext.jsx#L25) |
| 19 | **Company Policies** | Admin publishes shift/off policy | `company-policy.service.js` -> `broadcastMapped("policy:updated")` | `Shifts.jsx` | `dashboard.tsx` | [YES](file:///f:/hrms/hrms_saas/src/pages/Shifts.jsx#L226) |
| 20 | **Holidays Calendar** | Admin adds/edits holiday | `company-holiday.service.js` -> `emitHolidayEvent()` | `CompanyHolidayCalendar.jsx`, `Navbar.jsx` | `holidays.tsx` | [YES](file:///f:/hrms/hrms_saas/src/pages/CompanyHolidayCalendar.jsx#L86) |
| 21 | **Audit Logs** | High-severity action executed | `audit.service.js` -> `emitAuditLog()` | `AuditLogs.jsx` | `audit-logs.tsx` | [YES](file:///f:/hrms/hrms_mobile/src/app/(tabs)/audit-logs.tsx#L95) |
| 22 | **Analytics & Reports** | Attendance status changes | Real-time aggregate metric push | `Reports.jsx`, `TeamAnalytics.jsx` | `reports.tsx`, `team-analytics.tsx` | [YES](file:///f:/hrms/hrms_saas/src/pages/TeamAnalytics.jsx#L185) |

---

## 2. PART A MANDATORY BUSINESS RESTRICTION PRESERVATION

During real-time event implementation, all mandatory restrictions from Part A were strictly enforced:
1. **Employee Account Creation on Mobile (A1):**
   - No real-time event grants creation privileges to mobile HR, Admin, or Superadmin.
   - Handshake authentication middleware extracts the platform header (`x-client-platform: mobile`). Direct API attempts from mobile continue to be rejected with HTTP 403.
2. **Employee & Organizational Data Export on Mobile (A2):**
   - No real-time event streams CSV, Excel, or PDF bulk exports to mobile clients.
   - Backend export endpoints actively inspect the requesting client and enforce strict 403 barriers.
