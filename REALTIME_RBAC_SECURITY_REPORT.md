# HRMS REAL-TIME RBAC & MULTI-TENANT SECURITY REPORT

**Date:** 24 Nov 2026  
**Auditor:** Application Security & Infrastructure Architecture  
**Scope:** Socket.IO Authentication, Multi-Tenant Isolation, Room Authorization, Session Revocation  
**Primary Implementations:** [node_backend/src/services/realtime.service.js](file:///f:/hrms/node_backend/src/services/realtime.service.js), [node_backend/src/utils/tenant.js](file:///f:/hrms/node_backend/src/utils/tenant.js)

---

## 1. AUTHENTICATION & HANDSHAKE SECURITY

Real-time connections require cryptographic verification during the Socket.IO handshake. Unauthenticated connections are rejected immediately before socket allocation.

### 1.1 Handshake Middleware Architecture
1. **Token Extraction:** The handshake middleware verifies tokens supplied in `socket.handshake.auth.token` or the standard `Authorization: Bearer <token>` header.
2. **Algorithm Enforcement:** Verification strictly enforces `HS256`. Asymmetric bypasses and `none` algorithm attacks are prohibited.
3. **Token Blacklist Check:**
   - Evaluates Redis key `token:blacklist:<jti>` (<0.5ms).
   - If Redis is unavailable, queries MySQL `accounts_revoked_token`:
     ```sql
     SELECT id FROM accounts_revoked_token WHERE jti = ? AND expires_at > NOW() LIMIT 1
     ```
   - If revoked, the handshake is rejected with: `Authentication error: Token has been revoked`.
4. **User Session Revocation Check:**
   - Evaluates `user:revoked:<userId>`.
   - Compares the token issuance timestamp (`iat * 1000`) against the revocation timestamp.
   - If issued prior to revocation, the connection is rejected with: `Authentication error: Session has been terminated`.

---

## 2. MULTI-TENANT ISOLATION MODEL

Multi-tenancy is enforced at the transport and room subscription layer to guarantee that no organizational data leaks across tenant boundaries.

### 2.1 Deterministic Room Strategy
Upon successful authentication, the server deterministically assigns the socket to specific authorized rooms based on verified token claims:

| Room Name Pattern | Intended Scope | Join Authorization Policy |
|---|---|---|
| `user:{userId}` | Private user channel | Restricted strictly to the matching `userId`. |
| `tenant:{tenantId}` | Entire tenant broadcast (e.g. holidays) | Restricted to authenticated users belonging to `tenantId`. |
| `tenant:{tenantId}:user:{userId}` | Targeted tenant user | User must belong to `tenantId` AND have matching `userId`. |
| `tenant:{tenantId}:role:{role}` | Targeted role (e.g. `manager`, `hr`) | User must belong to `tenantId` AND have the exact role claim. |
| `manager:{managerId}` | Manager team channel | Restricted to users with roles `manager`, `hr`, `admin`, `superadmin`. |
| `role:superadmin` | Global platform administration | Restricted strictly to system-level `superadmin`. |

### 2.2 Server-Side Room Join Gate (`canJoinRoom`)
Clients are never permitted to join arbitrary rooms. When a client emits a `join_room` event, the server evaluates `canJoinRoom(user, roomName)`:
```javascript
canJoinRoom(user, roomName) {
  if (!roomName || typeof roomName !== "string") return false;
  const role = (user.role || "").toLowerCase();

  if (roomName.startsWith("tenant:")) {
    const parts = roomName.split(":");
    const targetTenantId = parts[1];
    // Enforce tenant boundary
    if (String(user.tenant_id) !== String(targetTenantId)) return false;

    // tenant:<id>
    if (parts.length === 2) return true;

    // tenant:<id>:role:<role>
    if (parts[2] === "role") return role === (parts[3] || "").toLowerCase();

    // Administrative channels
    if (["attendance", "leave", "approvals"].includes(parts[2])) {
      return ["admin", "hr", "manager", "superadmin"].includes(role);
    }
    return false;
  }

  // Personal room
  if (roomName === `user:${user.id}`) return true;

  // Manager room
  if (roomName === `manager:${user.id}`) {
    return ["manager", "hr", "admin", "superadmin"].includes(role);
  }

  return false;
}
```
Any unauthorized join attempt immediately triggers a warning log, emits `join_room_error` to the socket, and rejects the client callback.

---

## 3. SESSION TERMINATION & ACTIVE DISCONNECTION

When an administrator deactivates an employee or revokes permissions:
1. The backend invokes `realtimeService.disconnectUser(userId, reason)` in [node_backend/src/services/realtime.service.js](file:///f:/hrms/node_backend/src/services/realtime.service.js#L363).
2. The server locates all active socket connections belonging to `user:{userId}`.
3. The server broadcasts a `session:revoked` event to those sockets:
   ```json
   {
     "action": "session_revoked",
     "userId": 101,
     "reason": "Account deactivated by HR administrator"
   }
   ```
4. Each socket is forcefully disconnected: `s.disconnect(true)`.
5. On the client, the root layout ([hrms_mobile/src/app/_layout.tsx](file:///f:/hrms/hrms_mobile/src/app/_layout.tsx#L12)) captures `session:revoked`, alerts the user, and triggers `logout()`, purging local tokens from secure storage.

---

## 4. VERIFICATION EVIDENCE

Multi-tenant isolation and security controls were verified via automated tests in [node_backend/tests/realtime/realtime_e2e_multiclient.test.js](file:///f:/hrms/node_backend/tests/realtime/realtime_e2e_multiclient.test.js#L400):
- **Cross-Tenant Leakage Test:** Events emitted in Tenant 1 were monitored on a Tenant 2 client; Tenant 2 received 0 events (PASS).
- **Unauthorized Room Join Test:** An employee client attempting to join `tenant:1:role:superadmin` was rejected by the server with `join_room_error` (PASS).
- **Session Revocation Test:** Invoking `disconnectUser()` delivered `session:revoked` and disconnected the socket within 151ms (PASS).
