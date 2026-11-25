# HRMS REAL-TIME BACKEND IMPLEMENTATION REPORT

**Date:** 24 Nov 2026  
**Author:** Node.js Backend & Real-Time Infrastructure Engineer  
**Core Files:**
- [node_backend/src/services/realtime.service.js](file:///f:/hrms/node_backend/src/services/realtime.service.js)
- [node_backend/src/utils/realtime.js](file:///f:/hrms/node_backend/src/utils/realtime.js)
- [node_backend/src/constants/realtime-events.js](file:///f:/hrms/node_backend/src/constants/realtime-events.js)
- [node_backend/src/controllers/accounts.controller.js](file:///f:/hrms/node_backend/src/controllers/accounts.controller.js)
- [node_backend/src/routes/accounts.routes.js](file:///f:/hrms/node_backend/src/routes/accounts.routes.js)

---

## 1. BACKEND ARCHITECTURE OVERVIEW

The backend real-time system bridges database mutations to authorized WebSocket clients via a hardened Socket.IO layer with an automatic fallback mechanism.

### Key Components:
1. **`RealtimeService` Singleton:** Manages Socket.IO server initialization, Redis pub/sub adapters, client handshakes, deterministic room assignments, canonical envelope generation, and a rolling event buffer.
2. **`RealtimeManager` Bridge:** Intercepts existing `realtimeManager.broadcast(eventName, data, filter)` invocations and routes them directly through `realtimeService.broadcastMapped()`.
3. **Rolling Event Ring Buffer:** Stores the last 200 broadcast events in memory, enabling clients to recover events missed during network disconnections or background sleep.
4. **Synchronization Controller (`realtimeSync`):** Exposes `GET /api/v1/auth/realtime/sync/?since=<timestamp>` to allow reconnecting clients to reconcile state without requiring full page or application reloads.

---

## 2. DETAILED IMPLEMENTATION BREAKDOWN

### 2.1 The Outbox & Broadcast Bridge ([node_backend/src/utils/realtime.js](file:///f:/hrms/node_backend/src/utils/realtime.js))
Rather than refactoring hundreds of existing database mutation call-sites across attendance, leave, shift, and document controllers, `realtimeManager.broadcast()` was converted into an outbox bridge:
```javascript
broadcast(eventName, data = {}, filter = {}) {
  // 1. Dispatch over Socket.IO with canonical wrapping and room targeting
  try {
    realtimeService.broadcastMapped(eventName, data, filter);
  } catch (err) {
    logger.warn("[RealtimeManager] Socket.IO broadcast delegation error:", err.message);
  }
  // 2. Dispatch over SSE for legacy consumers
  ...
}
```

### 2.2 Canonical Envelope Wrapping & Deduplication Keys
Every event dispatched through `broadcastMapped()` is assigned a unique event ID, timestamp, and envelope version:
```javascript
const envelope = createRealtimeEnvelope({
  eventType: eventName,
  aggregateType: data.type || "System",
  aggregateId: data.id || data.userId || "0",
  payload: data,
  tenantId,
  actorId: data.actorId || null,
});
this.recordEvent(envelope);
```

### 2.3 Rolling Ring Buffer & Event Recording
To prevent unbounded memory growth while supporting reconnection recovery, `recordEvent()` implements a 200-event circular buffer:
```javascript
recordEvent(envelope) {
  this.eventBuffer.push(envelope);
  if (this.eventBuffer.length > this.maxBufferSize) {
    this.eventBuffer.shift();
  }
}
```

### 2.4 Recovery Endpoint Registration ([node_backend/src/routes/accounts.routes.js](file:///f:/hrms/node_backend/src/routes/accounts.routes.js#L88))
The synchronization route is registered under authenticated accounts routes:
```javascript
router.get("/realtime/sync/", authenticate, realtimeSync);
```
Controller implementation in [node_backend/src/controllers/accounts.controller.js](file:///f:/hrms/node_backend/src/controllers/accounts.controller.js#L495):
```javascript
export async function realtimeSync(req, res, next) {
  try {
    const since = req.query.since || req.query.after;
    const sinceTimestamp = since ? new Date(since).toISOString() : new Date(Date.now() - 3600000).toISOString();
    const missedEvents = realtimeService.getEventsSince(sinceTimestamp, {
      userId: req.user?.id,
      tenantId: req.user?.organization_id || req.user?.tenant_id || 1,
      role: req.user?.role,
    });
    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      missed_events: missedEvents,
    });
  } catch (err) {
    next(err);
  }
}
```

### 2.5 Redis Adapter with Automatic Single-Instance Fallback
In multi-instance production environments (e.g. PM2 cluster or containerized Kubernetes), Socket.IO distributes room events via Redis Pub/Sub using `@socket.io/redis-adapter`.
If Redis is temporarily unavailable or in local offline mode, `RealtimeService` gracefully logs a warning and falls back to memory adapter mode without crashing the API process.

---

## 3. VERIFICATION

All backend real-time mechanisms were verified via the multi-client E2E test suite in [node_backend/tests/realtime/realtime_e2e_multiclient.test.js](file:///f:/hrms/node_backend/tests/realtime/realtime_e2e_multiclient.test.js):
- Envelope structure, UUID generation, and ISO timestamps passed.
- Room routing and selective targeting passed.
- Missed event buffer filtering and HTTP sync recovery passed.
