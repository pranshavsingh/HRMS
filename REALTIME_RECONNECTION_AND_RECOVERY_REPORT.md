# HRMS REAL-TIME RECONNECTION & RECOVERY REPORT

**Date:** 24 Nov 2026  
**Author:** Distributed Systems & Site Reliability Engineering  
**Target Systems:** [node_backend](file:///f:/hrms/node_backend), [hrms_saas](file:///f:/hrms/hrms_saas), [hrms_mobile](file:///f:/hrms/hrms_mobile)

---

## 1. RECONNECTION STRATEGY & EXPONENTIAL BACKOFF

Mobile devices operating on cellular networks and laptops traversing office Wi-Fi experience intermittent network disconnections. A robust real-time system must re-establish connections gracefully without overloading backend servers.

### 1.1 Socket.IO Reconnection Parameters
Both Web and Mobile clients configure Socket.IO with jittered exponential backoff:
```typescript
const socket = io(SOCKET_URL, {
  auth: { token },
  transports: ["websocket"],
  reconnection: true,
  reconnectionDelay: 1000,        // Start retry at 1s
  reconnectionDelayMax: 10000,    // Cap retry at 10s
  randomizationFactor: 0.5,       // Apply +/- 50% jitter to prevent thundering herds
  timeout: 10000,
});
```

---

## 2. MISSED-EVENT RECOVERY ARCHITECTURE

### 2.1 The High-Water Mark Tracker
Whenever an event is received over Socket.IO, the client updates a high-water mark timestamp:
```typescript
if (data?.timestamp) {
  lastEventTimestampRef.current = data.timestamp;
}
```

### 2.2 The Recovery Flow
```
Client Device                  Network / Backend              Server Memory Buffer
    |                                 |                                 |
    |---- [Active Connection] ------->|                                 |
    |                                 |                                 |
    x (Network drops or App sleeps)   |                                 |
    |                                 |---- Mutation Occurs ----------->|
    |                                 |     (Emits & Records Event)     | [Event Buffer]
    |                                 |                                 |
    |---- Reconnection Succeeded ---->|                                 |
    |                                 |                                 |
    |---- GET /api/v1/auth/realtime/sync/?since=<lastTimestamp> ------->|
    |                                 |                                 |
    |                                 |<--- Returns Missed Events ------|
    |                                 |     (Filtered by User/Tenant)   |
    |<--- HTTP 200 { missed_events } -|                                 |
    |                                 |                                 |
    |---- Re-triggers Screen Listeners|                                 |
    |     (UI Updated In-Place)       |                                 |
```

### 2.3 Deduplication Guarantee
If an event was transmitted right before disconnection AND also returned by the synchronization endpoint, the client deduplication engine discards the duplicate:
```typescript
const eventId = event?.eventId;
if (eventId && processedEventsRef.current.has(eventId)) {
  return; // Discard duplicate
}
processedEventsRef.current.add(eventId);
```

---

## 3. VERIFICATION EVIDENCE

Reconnection and missed-event recovery were validated via automated test [Scenario E](file:///f:/hrms/node_backend/tests/realtime/realtime_e2e_multiclient.test.js#L350):
1. Mobile client disconnected intentionally.
2. Server broadcasted `attendance_update` and `schedule_update`.
3. Client queried `/api/v1/auth/realtime/sync/?since=<disconnectTime>`.
4. Endpoint returned HTTP 200 with the 2 missed events.
5. All assertion checks passed in 64.5ms.
