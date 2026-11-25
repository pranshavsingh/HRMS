# 07. Socket.IO Live Test Results

## Multi-Client Socket.IO E2E Suite (`node_backend/tests/realtime/realtime_e2e_multiclient.test.js`)
**Command:** `node --test --test-force-exit tests/realtime/*.test.js` (with `MYSQL_HOST=127.0.0.1`)  
**Result:** **PASS (12/12 tests, 8/8 suites, 0 failures, 1296ms)**

| Scenario | Verified Behaviour | Result |
|---|---|---|
| Scenario A (Web <-> Web) | Real-time leave application to manager & approval notification to employee | **PASS** |
| Scenario B (Web <-> Mobile) | Mobile punch-in sync to web manager dashboard & approval notification back to mobile | **PASS** |
| Scenario C (Mobile <-> Web) | Mobile regularization request delivered to HR approvals in real-time | **PASS** |
| Scenario D (Mobile <-> Mobile) | Multi-device concurrency sync on punch | **PASS** |
| Scenario E (Reconnection) | Event buffering & missed-event recovery via `GET /api/v1/auth/realtime/sync/` | **PASS** |
| Scenario F (RBAC & Isolation) | Multi-tenant isolation, unauthorized room join rejection, admin session revocation disconnect | **PASS** |
| Scenario G (Envelope & Dedup) | Canonical envelope (`eventId`, `timestamp`, `version`) & client-side deduplication | **PASS** |

## Distributed Redis Pub/Sub (`tests/phase3/realtime_pubsub.test.js`)
- **Result:** **4/4 non-Redis tests PASS; 2/2 Redis Pub/Sub multi-instance tests SKIPPED** (`Local Redis offline — ECONNREFUSED 127.0.0.1:6379`).
