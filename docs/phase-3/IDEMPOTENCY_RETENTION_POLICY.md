# HRMS SaaS — Idempotency, Retention & Replay Policy
## Distributed Reliability, Forensic Auditability & Storage Management Framework

- **Target Audience**: SRE, Database Administrators, Security Officers, Backend Engineers
- **Governing Architecture**: Transactional Outbox + Consumer Idempotency Ledger + Dead-Letter Quarantine

---

## 1. Data Retention Policy Matrix

| Ledger / Table | Status Partition | Retention Period | Purge Automation | Rationale |
| :--- | :--- | :--- | :--- | :--- |
| `outbox_events` | `PUBLISHED` | **7 Days** | Daily cron (3:00 AM UTC) | Sufficient for delayed consumer reconciliation, post-mortem analysis, and short-term deduplication. |
| `outbox_events` | `PENDING` | Indefinite until claimed | Never auto-purged | Active events awaiting worker dispatch. Purging would cause silent data loss. |
| `outbox_events` | `CLAIMED` | 60-Second Lease | Auto-recovered | Expired claims released back to `PENDING` every 60s or during batch claims. |
| `outbox_events` | `FAILED` | Bounded (5 retries) | Never auto-purged | Retried up to 5 times with exponential backoff before transitioning to `DEAD_LETTER`. |
| `outbox_events` | `DEAD_LETTER` | **Indefinite (30+ Days)** | Manual operator resolution | Poison or unparseable events preserved permanently for root cause analysis. |
| `consumer_processed_jobs` | `COMPLETED` | **7 Days** | Daily cron (3:00 AM UTC) | Protects against duplicate BullMQ deliveries and at-least-once retries within 7 days. |
| `consumer_processed_jobs` | `PROCESSING` | 60-Second Lease | Auto-recovered | Stalled worker leases reclaimed with monotonic fencing token advance. |
| `consumer_processed_jobs` | `DEAD_LETTER` | **Indefinite** | Manual operator resolution | Preserves poison job execution receipts. |
| `audit_logs` | All actions | **365 Days (1 Year)** | Archive to cold storage | Mandatory compliance and SOC2 / ISO-27001 forensic audit requirement. |

---

## 2. Dead-Letter Queue & Replay Governance

### 2.1 Replay Eligibility Criteria
An outbox event is eligible for operator replay **only** if:
1. `status === 'DEAD_LETTER'`
2. The root cause has been remediated (e.g., SMTP credential restored, downstream API unblocked).
3. The event payload is verified valid and not a poison attack.

### 2.2 Strict Idempotency Guards on Replay
- **Already-`PUBLISHED` Events**:
  Replay is **strictly rejected** (`reason: ALREADY_PUBLISHED`) if `status === 'PUBLISHED'`.
  Attempting to replay an already-published event would cause duplicate side-effects (e.g. duplicate OTP emails, double leave accruals).
- **Concurrent Status Changes**:
  Replay executes inside a database transaction with optimistic locking (`WHERE id = ? AND status = 'DEAD_LETTER'`). If status changed concurrently, replay aborts with `CONCURRENT_STATUS_CHANGE`.

### 2.3 Forensic Replay Audit Trail
Every manual or automated replay execution **must** record an immutable row in `audit_logs`:
- `action`: `'OUTBOX_DEAD_LETTER_REPLAY'`
- `user_id`: ID of operator or `NULL` for system
- `username`: Operator username
- `target_id`: Outbox event ID
- `details`: JSON payload containing `{ operator, eventType, previousStatus, reason, timestamp }`

---

## 3. Stalled Job Reconciliation Policy

If an outbox event was marked `PUBLISHED` (sent to BullMQ) but has **no** `COMPLETED` receipt in `consumer_processed_jobs` after **15 minutes**:
1. The event is classified as `STALLED_JOB`.
2. The automated Reconciliation Service (`reconciliationService.reconcileUnprocessedJobs(15)`) runs every 15 minutes.
3. Stalled events are reset back to `PENDING` with `retry_count = 0` and `last_error = 'Reconciled: Stalled without consumer receipt'`.
4. The Outbox Dispatcher re-claims and re-enqueues the event.
5. The downstream consumer checks idempotency (`claimExecution`). If the job was never finished, it completes normally. If it was finished, it deduplicates permanently.
6. A permanent audit log is created: `action = 'OUTBOX_STALLED_JOB_RECONCILED'`.
