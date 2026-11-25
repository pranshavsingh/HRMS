# HRMS REAL-TIME WEB IMPLEMENTATION REPORT

**Date:** 24 Nov 2026  
**Author:** Senior React & Frontend Architecture Engineer  
**Core Web Files:**
- [hrms_saas/src/context/RealtimeContext.jsx](file:///f:/hrms/hrms_saas/src/context/RealtimeContext.jsx)
- [hrms_saas/src/context/SiteContext.jsx](file:///f:/hrms/hrms_saas/src/context/SiteContext.jsx)
- [hrms_saas/src/pages/Shifts.jsx](file:///f:/hrms/hrms_saas/src/pages/Shifts.jsx)
- [hrms_saas/src/pages/Attendance.jsx](file:///f:/hrms/hrms_saas/src/pages/Attendance.jsx)
- [hrms_saas/src/pages/AttendanceApprovals.jsx](file:///f:/hrms/hrms_saas/src/pages/AttendanceApprovals.jsx)
- [hrms_saas/src/pages/Leave.jsx](file:///f:/hrms/hrms_saas/src/pages/Leave.jsx)
- [hrms_saas/src/pages/LeaveApprovals.jsx](file:///f:/hrms/hrms_saas/src/pages/LeaveApprovals.jsx)
- [hrms_saas/src/pages/Employees.jsx](file:///f:/hrms/hrms_saas/src/pages/Employees.jsx)

---

## 1. WEB CLIENT REAL-TIME ARCHITECTURE

The Web application connects to the backend Socket.IO cluster via the React context provider [RealtimeContext.jsx](file:///f:/hrms/hrms_saas/src/context/RealtimeContext.jsx).

### Architectural Upgrades:
1. **Removal of Prefix Filter:** Completely removed `if (event.startsWith("holiday:"))`. All domain events now reach their subscribed components.
2. **Client-Side Deduplication Cache:** Implemented a Set-based deduplication buffer tracking up to 200 `eventId` UUIDs. Multiple transmissions of the same event ID are discarded before calling registered listeners.
3. **Reconnection Synchronization (`syncMissedEvents`):** When the Socket reconnects after network blips, it queries `/api/v1/auth/realtime/sync/?since=<lastTimestamp>` to fetch missed events and trigger UI updates without full page reload.
4. **Zero-Reload UX:** Every page binds data-fetching methods to relevant domain events via `useRealtime`, eliminating the need for users to press browser refresh.

---

## 2. COMPONENT WIRING DETAILS

### 2.1 Shifts Management ([hrms_saas/src/pages/Shifts.jsx](file:///f:/hrms/hrms_saas/src/pages/Shifts.jsx#L223))
Subscribed to schedule and policy updates:
```jsx
useRealtime("schedule_update", () => {
  loadShifts(pagination.page || 1);
});
useRealtime("policy:updated", () => {
  if (activeTab === "policies" || activeTab === "weekly-off") {
    loadPolicies(activeTab);
  }
});
useRealtime("realtime:connected", () => {
  loadShifts(pagination.page || 1);
  if (activeTab === "policies" || activeTab === "weekly-off") {
    loadPolicies(activeTab);
  }
});
```

### 2.2 Site Context ([hrms_saas/src/context/SiteContext.jsx](file:///f:/hrms/hrms_saas/src/context/SiteContext.jsx#L25))
Automatically updates the global site list and active work site selector whenever sites are added, renamed, or deactivated:
```jsx
useRealtime("site:updated", () => { refreshSites(); });
useRealtime("realtime:connected", () => { refreshSites(); });
```

### 2.3 Attendance & Approvals ([hrms_saas/src/pages/AttendanceApprovals.jsx](file:///f:/hrms/hrms_saas/src/pages/AttendanceApprovals.jsx#L219))
Updates pending queue counters and approval tables immediately when a field employee punches in or requests regularisation:
```jsx
useRealtime("attendance_update", () => fetchApprovals(false));
```

### 2.4 Leave Management & Approvals ([hrms_saas/src/pages/Leave.jsx](file:///f:/hrms/hrms_saas/src/pages/Leave.jsx#L195))
Updates employee balance counters and displays instant concession or approval notices:
```jsx
useRealtime("leave_update", () => fetchLeaves(false));
useRealtime("leave_notice", (notice) => {
  fetchLeaves(false);
  if (notice?.status === "concession_granted") {
    // Show concession notice banner
  }
});
```

---

## 3. BUILD VERIFICATION

The Web application was built using Vite:
```powershell
npm --prefix hrms_saas run build
```
- **Modules Transformed:** 1,855
- **Build Duration:** 2.12 seconds
- **Errors:** 0
- **Integrity:** Production-ready asset bundles generated under `hrms_saas/dist/`.
