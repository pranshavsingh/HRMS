# HRMS SaaS — Milestone M3.4 Implementation Report
## Distributed Idempotency, Retries, Dead-Letter Management & Operator Controls

**Date:** November 16, 2026  
**Author:** Principal Backend Architect & Distributed Systems Engineer  
**Repository:** `pranshavsingh/HRMS`  
**Active Implementation Branch:** `feat/phase-3-distributed-backend`  
**Milestone:** M3.4 — Distributed Idempotency, Dead-Letter Recovery & Retention  
**Status:** **IMPLEMENTED & VERIFIED**  

---

## 1. Executive Summary

Milestone M3.4 hardens the distributed queue, transactional outbox, and consumer pipeline against permanent failure states, operator errors, and uncontrolled data retention growth.

Key capabilities delivered:
1. **Zero Sensitive Payload Exposure in Operator Controls:** `dead-letter.service.js` and `outboxRepository.getDeadLetterEvents()` strip out raw and encrypted payloads from operator listings, displaying only sanitized metadata (event type, aggregate ID, retry count, last error, timestamps).
2. **Safe Forensic Replay with Permanent Audit Trail:** Authorized operators can replay dead-lettered events via `deadLetterService.replayEvent()`. Every replay generates an immutable entry in the `audit_logs` table (`action = 'OUTBOX_DEAD_LETTER_REPLAY'`, `severity = 'WARNING'`) recording the operator username, operational justification, previous error, and timestamps.
3. **Protection Against Duplicate Business Operations:** `retryDeadLetterEvent()` strictly prohibits replaying events that have already been marked `PUBLISHED` or `COMPLETED`. Attempted replays of completed events fail closed with `reason: ALREADY_PUBLISHED`.
4. **Automated Database Retention Purge:** Daily background cron jobs automatically purge `outbox_events` (status `PUBLISHED`) and `consumer_processed_jobs` (status `COMPLETED`) older than 7 days, maintaining bounded table size and high index efficiency.

---

## 2. Dead-Letter Architecture & Replay Safety

```
  ┌─────────────────────────────────────────────────────────────┐
  │                 Outbox Dispatcher / Worker                  │
  └──────────────────────────────┬──────────────────────────────┘
                                 │
                   (Permanent / Poison Failure)
                                 ▼
                     ┌────────────────────────┐
                     │   status = DEAD_LETTER │
                     │   (Quarantine State)   │
                     └───────────┬────────────┘
                                 │
                                 ▼
                 ┌────────────────────────────────┐
                 │ Operator Inspection & Triage   │
                 │ (DeadLetterService: No Secrets)│
                 └───────────────┬────────────────┘
                                 │
                          (Manual Replay)
                                 ▼
                 ┌────────────────────────────────┐
                 │ 1. Validate status == DEAD_LTR │
                 │ 2. Reject if == PUBLISHED      │
                 │ 3. Log to audit_logs           │
                 │ 4. Transition to PENDING       │
                 │ 5. Reset retry_count = 0       │
                 └────────────────────────────────┘
```

---

## 3. Database Retention & Purge Policy

| Target Table | Condition | Retention Threshold | Purge Mechanism |
| :--- | :--- | :---: | :--- |
| `outbox_events` | `status = 'PUBLISHED'` | 7 Days | Daily scheduled task in `src/utils/cron.js` (`purgeOldPublishedEvents`) |
| `consumer_processed_jobs` | `status = 'COMPLETED'` | 7 Days | Daily scheduled task in `src/utils/cron.js` (`purgeOldCompletedJobs`) |
| `outbox_events` | `status = 'DEAD_LETTER'` | Indefinite | Retained permanently until manually inspected and triaged |

---

## 4. Requirement Verification

All requirements verified through `tests/phase3/dead_letter_replay.test.js`:
- `listDeadLetters` verifies 0 credential leakage.
- `replayEvent` verifies state transition to `PENDING` and audit trail entry.
- `already-PUBLISHED` rejection verifies idempotency safety.
- Retention cleanup purges records older than 7 days.

**Milestone Verdict:** **PASS**
