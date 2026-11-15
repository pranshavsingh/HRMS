# HRMS SaaS — Milestone M3.5 Implementation Report
## Redis Pub/Sub, Multi-Instance Socket.IO Realtime & Room Authorization

**Date:** November 16, 2026  
**Author:** Principal Backend Architect & Distributed Systems Engineer  
**Repository:** `pranshavsingh/HRMS`  
**Active Implementation Branch:** `feat/phase-3-distributed-backend`  
**Milestone:** M3.5 — Distributed Realtime Architecture & Cross-Instance Pub/Sub  
**Status:** **IMPLEMENTED & VERIFIED**  

---

## 1. Executive Summary

Milestone M3.5 implements distributed, multi-instance realtime event delivery across all clustered API instances using **Socket.IO** and the official **`@socket.io/redis-adapter`**.

Key capabilities delivered:
1. **Dedicated Pub/Sub Redis Clients:** Socket.IO mounts two dedicated Redis connections (`pubClient` and `subClient`) via `realtime.service.js`, respecting the Redis protocol requirement that subscriber connections cannot execute standard key-value commands.
2. **Cross-Instance Event Broadcast:** An event emitted from API instance 2 or 3 is published to Redis and fanned out automatically to clients connected to API instance 1 or 4.
3. **Connection Security & JWT Authentication:** Socket.IO enforces strict handshake authentication. Connections without a valid Bearer token are rejected with `Authentication error`.
4. **Deterministic Room & Tenant Authorization:** Connected sockets auto-join authenticated rooms:
   - Private personal room: `user:<id>`
   - Verified role room: `role:<role>` (e.g. `role:admin`, `role:hr`, `role:employee`)
   - Tenant/organization room: `org:<id>`
   Explicit `join_room` requests are verified against the user's role and identity, strictly preventing unauthorized access to other employees' private notifications or sensitive administrative events.
5. **Standardized Event Envelope:** Every emitted event follows an immutable enterprise envelope containing `eventId`, `eventType`, `version`, `aggregateType`, `aggregateId`, `timestamp`, `payload`, and `correlationId`.
6. **Graceful Single-Instance Fallback:** If Redis is temporarily unreachable during startup, `realtimeService` falls back to the in-memory Socket.IO adapter, ensuring API instances remain operational while logging a clear warning.

---

## 2. Distributed Realtime Architecture

```
                                  Client Browser / Mobile App
                                                │
                                    (WebSocket / Polling)
                                                │
                                                ▼
         ┌──────────────────────────────────────────────────────────────┐
         │                    API Cluster Instances                     │
         │                                                              │
         │    ┌──────────────────┐              ┌──────────────────┐    │
         │    │  API Instance 1  │              │  API Instance 2  │    │
         │    │  (Port 8000)     │              │  (Port 8000)     │    │
         │    │  Socket.IO       │              │  Socket.IO       │    │
         │    └────────┬─────────┘              └────────┬─────────┘    │
         └─────────────┼─────────────────────────────────┼──────────────┘
                       │ (Pub/Sub)                       │ (Pub/Sub)
                       ▼                                 ▼
         ┌──────────────────────────────────────────────────────────────┐
         │                 Redis 7 Pub/Sub Event Bus                    │
         │              (Channel: socket.io#/#...)                      │
         └──────────────────────────────────────────────────────────────┘
```

---

## 3. Realtime Event Envelope Specification

```json
{
  "eventId": "evt_1794773000000_a1b2c3d4",
  "eventType": "ATTENDANCE_PUNCH_RECORDED",
  "version": 1,
  "aggregateType": "Attendance",
  "aggregateId": "12345",
  "timestamp": "2026-11-16T01:24:00.000Z",
  "payload": {
    "employeeId": 7001,
    "status": "approved",
    "punchTime": "2026-11-16T09:00:00.000Z"
  },
  "correlationId": "corr_e4f5a6"
}
```

---

## 4. Requirement Verification Matrix

| Requirement | Implementation & File | Verification Status |
| :--- | :--- | :---: |
| **Dedicated Pub/Sub Connections** | `pubClient` & `subClient` in `realtime.service.js` | **PASS** |
| **JWT Handshake Security** | Handshake middleware validating `config.jwtSecret` | **PASS** |
| **Room Authorization Guard** | `canJoinRoom()` strictly enforcing role & identity | **PASS** |
| **Cross-Instance Distribution** | `@socket.io/redis-adapter` Redis channel fan-out | **PASS** |
| **Standardized Envelope** | `createRealtimeEnvelope()` in `realtime.service.js` | **PASS** |
| **Graceful Shutdown** | `realtimeService.close()` disconnecting clients & sockets | **PASS** |

**Milestone Verdict:** **PASS**
