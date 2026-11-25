# HRMS REAL-TIME MOBILE IMPLEMENTATION REPORT

**Date:** 24 Nov 2026  
**Author:** Senior React Native & Mobile Systems Engineer  
**Core Mobile Files:**
- [hrms_mobile/src/context/RealtimeContext.tsx](file:///f:/hrms/hrms_mobile/src/context/RealtimeContext.tsx)
- [hrms_mobile/src/app/_layout.tsx](file:///f:/hrms/hrms_mobile/src/app/_layout.tsx)
- [hrms_mobile/src/app/(tabs)/shifts.tsx](file:///f:/hrms/hrms_mobile/src/app/(tabs)/shifts.tsx)
- [hrms_mobile/src/app/(tabs)/punch.tsx](file:///f:/hrms/hrms_mobile/src/app/(tabs)/punch.tsx)
- [hrms_mobile/src/app/(tabs)/approvals.tsx](file:///f:/hrms/hrms_mobile/src/app/(tabs)/approvals.tsx)
- [hrms_mobile/src/app/(tabs)/leave.tsx](file:///f:/hrms/hrms_mobile/src/app/(tabs)/leave.tsx)
- [hrms_mobile/src/app/(tabs)/history.tsx](file:///f:/hrms/hrms_mobile/src/app/(tabs)/history.tsx)
- [hrms_mobile/src/app/my-documents.tsx](file:///f:/hrms/hrms_mobile/src/app/my-documents.tsx)
- [hrms_mobile/src/app/documents.tsx](file:///f:/hrms/hrms_mobile/src/app/documents.tsx)

---

## 1. MOBILE CLIENT ARCHITECTURE & LIFECYCLE MANAGEMENT

Mobile real-time systems face unique constraints: OS-level socket suspension during app backgrounding, unreliable mobile data connectivity, battery optimization, and device-level session revocation.

### 1.1 AppState Lifecycle Synchronization
In [hrms_mobile/src/context/RealtimeContext.tsx](file:///f:/hrms/hrms_mobile/src/context/RealtimeContext.tsx#L148), we integrated React Native `AppState`:
```typescript
useEffect(() => {
  const subscription = AppState.addEventListener("change", (nextAppState: AppStateStatus) => {
    if (appStateRef.current.match(/inactive|background/) && nextAppState === "active") {
      console.log("[Realtime] App returned to active foreground. Re-verifying synchronization...");
      if (socketRef.current && !socketRef.current.connected) {
        socketRef.current.connect();
      }
      triggerEvent("realtime:connected", {});
      syncMissedEvents();
    }
    appStateRef.current = nextAppState;
  });

  return () => {
    subscription.remove();
  };
}, [triggerEvent, syncMissedEvents]);
```
When an employee returns the mobile app to the foreground after lock or switching apps:
1. The socket connection is verified and immediately re-established.
2. The `realtime:connected` synthetic event is triggered, prompting active screens to refresh silently.
3. `syncMissedEvents()` queries the `/api/v1/auth/realtime/sync/` endpoint to catch any mutations that occurred while the phone was suspended.

---

## 2. SCREEN IMPLEMENTATION DETAILS

### 2.1 Root Layout Session Guard ([hrms_mobile/src/app/_layout.tsx](file:///f:/hrms/hrms_mobile/src/app/_layout.tsx#L12))
Listens for session revocation and account deactivation events:
```typescript
useRealtime("session:revoked", (data) => {
  Alert.alert(
    "Session Terminated",
    data?.message || "Your session has been terminated by an administrator. Please log in again."
  );
  logout();
});
```

### 2.2 Shift Details Screen ([hrms_mobile/src/app/(tabs)/shifts.tsx](file:///f:/hrms/hrms_mobile/src/app/(tabs)/shifts.tsx#L34))
Replaced pull-only loading with reactive subscriptions:
```typescript
useRealtime("schedule_update", () => loadRoster(false));
useRealtime("roster:published", () => loadRoster(false));
useRealtime("realtime:connected", () => loadRoster(false));
```

### 2.3 Punch Screen ([hrms_mobile/src/app/(tabs)/punch.tsx](file:///f:/hrms/hrms_mobile/src/app/(tabs)/punch.tsx#L385))
Immediately removes the "Pending Approval" overlay when a manager approves the punch on the Web app:
```typescript
useRealtime("attendance_update", fetchStatus);
useRealtime("leave_update", fetchStatus);
useRealtime("realtime:connected", fetchStatus);
```

### 2.4 Approvals Screen ([hrms_mobile/src/app/(tabs)/approvals.tsx](file:///f:/hrms/hrms_mobile/src/app/(tabs)/approvals.tsx#L153))
Listens for punch exceptions, regularization requests, and leave applications from team members:
```typescript
useRealtime("leave_update", () => fetchQueues(false));
useRealtime("attendance_update", () => fetchQueues(false));
useRealtime("realtime:connected", () => fetchQueues(false));
```

### 2.5 Leave Screen ([hrms_mobile/src/app/(tabs)/leave.tsx](file:///f:/hrms/hrms_mobile/src/app/(tabs)/leave.tsx#L108))
Captures leave approvals, rejections, and discretionary concessions, displaying native alerts:
```typescript
useRealtime("leave_update", () => fetchLeaveData(false));
useRealtime("leave_notice", (notice: any) => {
  fetchLeaveData(false);
  if (notice?.status === "concession_granted") {
    Alert.alert("Leave Concession Granted", `${notice.additional_days} ${notice.leave_type} leave days granted.`);
  }
});
```

### 2.6 Document Screens ([hrms_mobile/src/app/my-documents.tsx](file:///f:/hrms/hrms_mobile/src/app/my-documents.tsx#L75))
Automatically refreshes document verification statuses and uploads:
```typescript
useRealtime("document_update", () => fetchMyDocuments(false));
useRealtime("realtime:connected", () => fetchMyDocuments(false));
```

---

## 3. TYPE VERIFICATION

The TypeScript compilation was verified across all mobile files:
```powershell
node hrms_mobile/node_modules/typescript/lib/tsc.js --noEmit --project hrms_mobile/tsconfig.json
```
- **Exit Code:** 0
- **Errors:** 0
- **Type Safety:** 100% compliant with React Native, Expo, and Socket.IO types.
