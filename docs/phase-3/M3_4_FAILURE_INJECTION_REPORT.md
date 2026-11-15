# HRMS SaaS — Milestone M3.4 Failure Injection & Resilience Report
## Operator Replay Safety, Idempotency Bounds & Retention Verification

**Date:** November 16, 2026  
**Test Suite:** `node_backend/tests/phase3/dead_letter_replay.test.js`  
**Execution Environment:** Node.js v22.23.4 / MySQL 8.0  
**Status:** **100% PASS**  

---

## 1. Automated Test Execution Evidence

```
TAP version 13
# Subtest: P3.6 — Dead-Letter Management, Operator Replay & Retention Suite
    # Subtest: should list dead-letter events with sanitized metadata and ZERO sensitive payload exposure
    ok 1 - should list dead-letter events with sanitized metadata and ZERO sensitive payload exposure
      ---
      duration_ms: 852.8768
      type: 'test'
      ...
    # Subtest: should provide safe event detail with payload presence flag without leaking contents
    ok 2 - should provide safe event detail with payload presence flag without leaking contents
      ---
      duration_ms: 221.3977
      type: 'test'
      ...
    # Subtest: should record forensic audit log when operator replays a dead-letter event
    ok 3 - should record forensic audit log when operator replays a dead-letter event
      ---
      duration_ms: 794.2484
      type: 'test'
      ...
    # Subtest: should reject replay attempts for already-PUBLISHED events (Protection Against Duplicate Business Operations)
    ok 4 - should reject replay attempts for already-PUBLISHED events (Protection Against Duplicate Business Operations)
      ---
      duration_ms: 204.7857
      type: 'test'
      ...
    # Subtest: should enforce retention policy by purging published events and completed consumer receipts older than threshold
    ok 5 - should enforce retention policy by purging published events and completed consumer receipts older than threshold
      ---
      duration_ms: 1198.9514
      type: 'test'
      ...
    1..5
ok 1 - P3.6 — Dead-Letter Management, Operator Replay & Retention Suite
  ---
  duration_ms: 3702.7053
  type: 'suite'
  ...
1..1
# tests 5
# suites 1
# pass 5
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 4102.2782
```

---

## 2. Failure Scenarios Verified

| Scenario | Injected Condition | Expected Behavior | Observed Result |
| :--- | :--- | :--- | :---: |
| **Credential Leakage via DLQ API** | Outbox event with sensitive OTP and JWT tokens placed in `DEAD_LETTER` | `deadLetterService.listDeadLetters` strips all payload fields | **PASS** — Zero sensitive tokens exposed |
| **Accidental Operator Replay** | Operator invokes `replayEvent` on an event that was already `PUBLISHED` | System fails closed with `reason: ALREADY_PUBLISHED` and refuses mutation | **PASS** — Zero duplicate publication |
| **Audit Accountability** | Operator replays a genuine dead-letter event | Event moves to `PENDING` and row written to `audit_logs` | **PASS** — Operator name & reason captured |
| **Unbounded Table Growth** | `outbox_events` and `consumer_processed_jobs` older than 7 days | Scheduled purge deletes records | **PASS** — Cleaned up with zero active claim impact |
