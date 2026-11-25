# HRMS REAL-TIME EVENT CATALOG & SPECIFICATION

**Version:** 1.0.0 (Production)  
**Effective Date:** 24 Nov 2026  
**Standard Compliance:** Canonical Realtime Envelope Specification v1  
**Target Environments:** Web ([hrms_saas](file:///f:/hrms/hrms_saas)), Mobile ([hrms_mobile](file:///f:/hrms/hrms_mobile)), Backend ([node_backend](file:///f:/hrms/node_backend))

---

## 1. CANONICAL EVENT ENVELOPE FORMAT

All events broadcast across Socket.IO conform to the canonical JSON envelope structure created by `createRealtimeEnvelope` in [node_backend/src/services/realtime.service.js](file:///f:/hrms/node_backend/src/services/realtime.service.js):

```json
{
  "eventId": "evt_1732450800000_a1b2c3d4",
  "eventType": "attendance:punch_in",
  "version": 1,
  "aggregateType": "Attendance",
  "aggregateId": "101",
  "timestamp": "2026-11-24T09:30:00.000Z",
  "correlationId": "corr_9f8e7d",
  "tenantId": 1,
  "actorId": 101,
  "payload": {
    "action": "punch_in",
    "user_id": 101,
    "employee_name": "Arjun Sharma",
    "punch_time": "2026-11-24T09:30:00.000Z",
    "status": "pending_approval",
    "is_outside_geofence": false
  }
}
```

### Envelope Fields
| Field | Type | Description |
|---|---|---|
| `eventId` | String | Globally unique identifier (`evt_<timestamp>_<hex>`) used for client deduplication. |
| `eventType` | String | Canonical namespaced event name (e.g., `attendance:approved`, `leave:applied`). |
| `version` | Number | Schema contract version (currently `1`). |
| `aggregateType` | String | Domain boundary (`Attendance`, `Leave`, `Employee`, `Schedule`, `Document`, `Policy`, `System`). |
| `aggregateId` | String | Primary domain entity ID. |
| `timestamp` | String | ISO 8601 UTC timestamp of event generation. |
| `correlationId` | String | Trace correlation ID tracking request lifecycle. |
| `tenantId` | Number/null | Multi-tenant isolation boundary identifier. |
| `actorId` | Number/null | ID of the authenticated user whose action triggered the event. |
| `payload` | Object | Domain-specific entity data. |

---

## 2. EVENT CATALOG BY DOMAIN MODULE

### 2.1 Attendance Management

| Canonical Event Name | Legacy Event Alias | Trigger Action | Emitted By | Target Room / Recipients | Payload Summary |
|---|---|---|---|---|---|
| `attendance:punch_in` | `attendance_update`, `punch_in` | Employee punches in (normal or pending approval) | `attendance.service.js` | `tenant:{id}`, `user:{id}`, `manager:{id}` | `{ action: "punch_in", user_id, status, punch_time }` |
| `attendance:punch_out` | `attendance_update`, `punch_out` | Employee punches out | `attendance.service.js` | `tenant:{id}`, `user:{id}`, `manager:{id}` | `{ action: "punch_out", user_id, status, punch_out_time }` |
| `attendance:approved` | `attendance_update` | Manager/HR approves punch exception or regularisation | `attendance.service.js` | `tenant:{id}`, `user:{id}`, `tenant:{id}:role:manager` | `{ action: "approved", approval_status: "approved", user_id }` |
| `attendance:rejected` | `attendance_update` | Manager/HR rejects punch exception | `attendance.service.js` | `tenant:{id}`, `user:{id}`, `tenant:{id}:role:manager` | `{ action: "rejected", approval_status: "rejected", user_id }` |
| `attendance:regularized`| `attendance_update` | Employee submits regularization request | `attendance.service.js` | `tenant:{id}:role:manager`, `tenant:{id}:role:hr` | `{ action: "regularization_requested", user_id, date, reason }` |

---

### 2.2 Leave Management

| Canonical Event Name | Legacy Event Alias | Trigger Action | Emitted By | Target Room / Recipients | Payload Summary |
|---|---|---|---|---|---|
| `leave:applied` | `leave_update` | Employee submits leave application | `leave.service.js` | `tenant:{id}:role:manager`, `tenant:{id}:role:hr`, `tenant:{id}:role:admin` | `{ action: "applied", id, employee_id, employee_name, leave_type, days, status: "pending" }` |
| `leave:approved` | `leave_update`, `leave_notice` | Manager or HR approves leave request | `leave.service.js` | `user:{id}`, `tenant:{id}` | `{ action: "approved", id, employee_id, leave_type, status: "approved", updated_balance }` |
| `leave:rejected` | `leave_update`, `leave_notice` | Manager or HR rejects leave request | `leave.service.js` | `user:{id}`, `tenant:{id}` | `{ action: "rejected", id, employee_id, leave_type, status: "rejected", updated_balance }` |
| `leave:cancelled` | `leave_update` | Employee cancels pending/approved leave | `leave.service.js` | `user:{id}`, `tenant:{id}:role:manager` | `{ action: "cancelled", id, employee_id, status: "cancelled" }` |
| `leave:concession` | `leave_update`, `leave_notice` | Management grants/reverses discretionary concession | `leave.service.js` | `user:{id}` | `{ action: "concession_granted", employee_id, additional_days, updated_balance }` |

---

### 2.3 Workforce, Shifts & Rosters

| Canonical Event Name | Legacy Event Alias | Trigger Action | Emitted By | Target Room / Recipients | Payload Summary |
|---|---|---|---|---|---|
| `schedule:shift_created` | `schedule_update` | Admin/HR creates work shift | `shift.service.js` | `tenant:{id}` | `{ action: "shift_created", shift_id, shift_name, timing }` |
| `schedule:shift_updated` | `schedule_update` | Shift timings or parameters modified | `shift.service.js` | `tenant:{id}` | `{ action: "shift_updated", shift_id, shift_name }` |
| `schedule:shift_deleted` | `schedule_update` | Shift is removed/deactivated | `shift.service.js` | `tenant:{id}` | `{ action: "shift_deleted", shift_id }` |
| `roster:published` | `schedule_update`, `roster:published` | Weekly roster published for site/department | `roster.service.js` | `tenant:{id}`, `tenant:{id}:role:employee` | `{ action: "roster_published", week_start, site_id, count }` |

---

### 2.4 Employee & User Management

| Canonical Event Name | Legacy Event Alias | Trigger Action | Emitted By | Target Room / Recipients | Payload Summary |
|---|---|---|---|---|---|
| `employee:updated` | `employee_update` | Profile, designation, department, or photo updated | `accounts.service.js` | `tenant:{id}`, `user:{id}` | `{ action: "updated", id, department, designation, profile_picture }` |
| `employee:deactivated` | `employee_update`, `session:revoked` | Admin deactivates employee account | `accounts.service.js` | `user:{id}`, `tenant:{id}:role:hr` | `{ action: "deactivated", id, is_active: false }` |
| `auth:session_revoked` | `session:revoked` | Admin terminates session or revokes security token | `accounts.service.js` | `user:{id}` | `{ action: "revoked", reason: "Session terminated by administrator" }` |

---

### 2.5 Document Management

| Canonical Event Name | Legacy Event Alias | Trigger Action | Emitted By | Target Room / Recipients | Payload Summary |
|---|---|---|---|---|---|
| `document:uploaded` | `document_update` | Employee or HR uploads identity/contract document | `accounts.service.js` | `user:{id}`, `tenant:{id}:role:hr`, `tenant:{id}:role:admin` | `{ action: "uploaded", id, userId, title, file_url }` |
| `document:verified` | `document_update` | HR verifies uploaded document | `accounts.service.js` | `user:{id}` | `{ action: "verified", id, userId, status: "verified" }` |
| `document:deleted` | `document_update` | Document is archived or deleted | `accounts.service.js` | `user:{id}`, `tenant:{id}:role:hr` | `{ action: "deleted", id, userId }` |

---

### 2.6 Sites, Policies & Holidays

| Canonical Event Name | Legacy Event Alias | Trigger Action | Emitted By | Target Room / Recipients | Payload Summary |
|---|---|---|---|---|---|
| `site:updated` | `site:updated` | Superadmin/Admin creates or updates work site | `site.service.js` | `tenant:{id}`, `tenant:{id}:role:admin` | `{ action: "site_updated", site_id, name, is_active }` |
| `policy:updated` | `policy:updated` | Company policy or weekly-off policy published | `company-policy.service.js`, `weekly-off-policy.service.js` | `tenant:{id}` | `{ action: "policy_updated", policy_id, version }` |
| `holiday:created` | `holiday:created` | Company holiday added to calendar | `company-holiday.service.js` | `tenant:{id}` | `{ id, name, date, type }` |
| `holiday:updated` | `holiday:updated` | Company holiday date or details edited | `company-holiday.service.js` | `tenant:{id}` | `{ id, name, date, type }` |
| `holiday:deleted` | `holiday:deleted` | Company holiday removed | `company-holiday.service.js` | `tenant:{id}` | `{ id }` |

---

### 2.7 Audit Logs & Observability

| Canonical Event Name | Legacy Event Alias | Trigger Action | Emitted By | Target Room / Recipients | Payload Summary |
|---|---|---|---|---|---|
| `audit:logged` | `new_audit_log` | Security-sensitive action logged in system | `audit.service.js` | `tenant:{id}:role:superadmin`, `tenant:{id}:role:admin` | `{ id, action, actor_id, actor_name, severity, timestamp }` |

---

## 3. BACKWARD-COMPATIBILITY ALIAS MATRIX

To ensure zero regressions across existing screens that listen to legacy event strings, `realtimeService.broadcastMapped()` dispatches **both** the canonical namespaced event and the legacy alias simultaneously:

```javascript
// Transmit legacy event name alongside canonical event
this.io.to(targetRoom).emit(eventName, envelope);
if (legacyAlias && legacyAlias !== eventName) {
  this.io.to(targetRoom).emit(legacyAlias, envelope);
}
```
Existing hooks using `useRealtime("attendance_update", ...)` or `useRealtime("leave_update", ...)` receive the events without modification.
