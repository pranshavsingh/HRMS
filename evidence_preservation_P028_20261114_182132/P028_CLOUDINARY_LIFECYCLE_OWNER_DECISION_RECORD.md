# P028 Cloudinary Lifecycle Owner Decision Record

## 1. Task metadata and authorization boundary

- **Project:** Enterprise HRMS
- **Phase:** 0.2.8
- **Task:** P028-CLOUDINARY-LIFECYCLE-OWNER-DECISION-RECORD-01
- **Decision recorded:** 2026-11-14. The supplied decision instruction gives no separate decision timestamp; this is the record date, not an asserted time of owner action.
- **Authorization:** Record the owner decision and perform a read-only documentation and technical-impact assessment.
- **Output:** This standalone record in the evidence preservation directory.
- **Status:** Phase 0.2.8 remains OPEN / NOT ACCEPTED.

This task authorizes no edits to existing documentation, audit outputs, code, tests, configuration, schemas, database, Cloudinary assets/settings, infrastructure, or Git state. It authorizes neither an independent audit nor acceptance or phase progression. The owner decision is not blanket implementation approval.

## 2. Exact owner decision

The project owner selected **OPTION A — PARTITIONED TWO-PATH CLOUDINARY UPLOAD LIFECYCLE**:

1. Successfully committed attendance media is terminal and protected from abandoned-upload cleanup.
2. Only abandoned or uncommitted upload candidates may enter cleanup.
3. Cleanup candidates require reference and ownership checks before deletion.
4. The abandoned-upload cleanup process must not delete a committed attendance photo.

This settles the policy-selection question. It does not establish that the lifecycle has been implemented, that the code or database enforces these invariants, or that the behavior is safe under retries, crashes, or concurrency.

## 3. Governing-document comparison and physical references

The five current documents were read directly from `F:\hrms\docs`. Current versions are taken from their headers and corroborated by matching preservation-manifest hashes; the workspace root has no Git repository, so Git history does not independently establish version lineage.

| File | Physical lines | Lifecycle text / impact |
|---|---:|---|
| `F:\hrms\docs\PHASE_0_FINAL_DECISION_REGISTER.md` (v2.7.1) | 246–324 | Section 3.4 explicitly partitions successful and abandoned/failed paths (249 onward); committed terminal state is shown at 272; only pending/failed candidates are eligible at 278; schema reference query at 309–317; safety, two-hour qualification, leases/fencing, idempotent recovery, and no Phase 0.2.8 Cloudinary operations at 320–324. This is aligned with Option A as a proposed design. The same section marks worker leases/fencing as requiring implementation and staging validation. |
| `F:\hrms\docs\PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md` (v2.7.1) | 215 | The upload-intent acceptance/design row describes committed terminal state, uncommitted cleanup candidates, reference checks, and deletion safety. It is aligned as a design requirement; it is not evidence that the criteria passed. |
| `F:\hrms\docs\PHASE_0_2_8_COMPLETION_REPORT.md` (v1.4.0) | 136–143; 345–348 | Lines 136–142 describe the partitioned lifecycle and deletion safety. Line 143 expressly says proposed design, needs technical validation, and zero Cloudinary operations. Lines 345–348 repeat the two paths. The design text aligns with Option A; any implication that DEF-01 is fully resolved must be limited to policy wording/document harmonization, not technical implementation or runtime safety. |
| `F:\hrms\docs\PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md` (v1.3.0) | 98–115; 171 | Lines 99–112 quote the earlier linear pipeline as the “Before” state and describe it as an inconsistency; lines 103–115 describe the partitioned correction. This is a historical explanation, not an operative instruction to use the linear pipeline. Line 171 says DEF-01 was resolved; qualify that as documentation-level resolution only. |
| `F:\hrms\docs\PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md` (v2.8.0) | 99–115; 268; 282–283 | Lines 99–114 recount the old linear wording as the defect and assert the corrected partitioned wording; line 115 says PASS/100% consistent; line 268 marks DEF-01 RESOLVED (PASS); lines 282–283 claim completely resolved and defect-free. These are overbroad if read as technical verification. The owner decision now settles lifecycle direction, but runtime implementation and safety remain unverified. |

### Conflicting wording assessment

No current operative lifecycle instruction was found in these five documents that directs a committed photo into cleanup. The explicit linear sequence `pending -> uploading -> committed -> cleanup_claimed -> cleaned` occurs in Reconciliation Report lines 99–102 and Acceptance Verification Report lines 111–112 as quoted **before/defect history**. Those passages identify the unsafe implication and are not instructions for current behavior. They may remain as historical evidence if clearly contextualized.

The principal remaining inconsistency is status language: documents state “resolved,” “PASS,” “100% consistent,” or “defect-free” without consistently distinguishing corrected design text from unverified code/runtime behavior. The owner decision resolves the design choice, but does not convert proposed controls into verified controls.

## 4. Read-only technical impact assessment

Classifications below concern what the existing documentation/evidence establishes. No application code, tests, schema, or live services were inspected or executed for this decision record. No runtime verification is claimed.

| Assessment area | Status | Evidence-based impact / open point |
|---|---|---|
| Upload candidate creation and ownership | PARTIALLY VERIFIED | Decision Register lines 256–259 specify UUID upload token, deterministic public ID, and pending intent. Lines 278 onward refer to worker lease ownership. Database constraints tying owner, intent, and asset are not established by this documentation review. |
| Upload completion and atomic commitment | PARTIALLY VERIFIED | Decision Register lines 261–270 and Checklist line 215 specify upload outside the transaction followed by a transaction that associates attendance, marks committed, and commits. Runtime atomicity, transaction boundaries, rollback, and actual ownership checks are not verified. |
| Protection of committed attendance media | VERIFIED FROM EXISTING EVIDENCE (design requirement only) | Decision Register lines 272, 320, and 324 state committed is terminal and excluded from deletion; Completion Report lines 137 and 142 does likewise. This verifies the written invariant, not enforcement by running code. |
| Cleanup eligibility for abandoned/uncommitted candidates | PARTIALLY VERIFIED | Decision Register lines 274–280 and 320 scope cleanup to pending/failed candidates and qualify the two-hour threshold as insufficient proof of abandonment. Actual candidate selection and state transition guards are unverified. |
| Reference checks before deletion | PARTIALLY VERIFIED | Decision Register lines 309–317 specifies a pre-deletion query for attendance photos and employee documents; lines 324 require preserving inconclusive cases. Query correctness, transaction isolation, complete reference coverage, and use immediately before deletion are not runtime verified. |
| Concurrent upload and cleanup races | NOT VERIFIED | The documents propose worker leases, ownership validation, fencing, and a second reference check. They do not provide executed race tests proving a cleanup worker cannot win against an in-flight upload or attendance commit. |
| Retry and idempotency behavior | PARTIALLY VERIFIED | Decision Register line 323 specifies an asset-not-found recovery after successful deletion with failed DB status update. Idempotency across upload retries, duplicate workers, ambiguous provider responses, and state-update retries is not demonstrated. |
| Failure recovery and orphaned media | PARTIALLY VERIFIED | The design describes failed/old candidates, manual review on inconclusive checks, and cleanup recovery (Decision Register lines 278–324). Crash windows, orphan discovery completeness, and recovery operations are not tested. |
| Audit logging and traceability | NOT VERIFIED | The five reviewed lifecycle passages do not establish immutable per-upload/per-cleanup audit events with actor, ownership, decision inputs, provider response, retries, and final state. No runtime logs were inspected. |

## 5. Unresolved engineering questions

1. What durable identifier links upload token, employee/owner, intent row, attendance record, and Cloudinary public ID, and how is cross-owner association prevented?
2. Is the attendance row and intent transition to committed performed in one database transaction, with rollback behavior defined if either write fails?
3. How does the worker prove the intent is uncommitted and still owned by its lease at the point of deletion? Are lease renewal and fencing tokens enforced atomically?
4. Can a cleanup claim race with an upload completion or attendance commit? What lock/order or conditional state update prevents deletion during that race?
5. Does the reference query cover every persisted use of a Cloudinary asset, including historical formats, alternate document tables, and references created concurrently after the query?
6. Is the reference check serialized with the deletion decision, or can a new reference appear between query and provider deletion?
7. How are provider timeouts with unknown deletion outcome, duplicate retries, asset-not-found, and database update failures handled idempotently?
8. What age threshold and evidence distinguish abandoned from slow/in-flight uploads? The documented two-hour threshold is provisional and expressly not sufficient proof by itself.
9. What is the safe recovery and manual-review workflow for inconclusive references, orphaned provider assets, or a committed DB reference to a missing asset?
10. Which durable audit event records candidate eligibility, owner check, reference-query result, worker/lease, deletion attempt/result, retries, and final state, and how is that log protected from alteration?
11. What staging tests cover interleavings, process crashes, provider failure, database failure, and duplicate workers? No such results are evidenced in this task.

## 6. Documents potentially requiring a future correction

No existing document was changed. After a separate written authorization naming exact files and permitted edits, consider:

- `docs/PHASE_0_2_8_COMPLETION_REPORT.md`: clarify that DEF-01 is resolved at the selected design/documentation level while implementation and runtime safety remain pending; retain the explicit “NEEDS TECHNICAL VALIDATION” qualification.
- `docs/PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md`: qualify “resolved” statements as documentation harmonization and preserve the quoted linear wording as historical “before” evidence.
- `docs/PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md`: qualify PASS/100%/defect-free claims so they do not imply runtime safety; record owner decision date/source and unresolved engineering validation.
- `docs/PHASE_0_FINAL_DECISION_REGISTER.md` and `docs/PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md`: no lifecycle-direction correction appears necessary from this read-only review; future edits may be needed only if owner decision metadata or technical validation criteria are to be added.

Any such correction requires separate written authorization identifying the files and scope. Source-code implementation and a fresh independent audit require their own separate authorizations.

## 7. Evidence and integrity boundary

Before this report was created, SHA-256 values were calculated for the five governing documents. They were recalculated after it was written and matched those pre-write values:

| Existing document | SHA-256 before | SHA-256 after | Result |
|---|---|---|---|
| `PHASE_0_FINAL_DECISION_REGISTER.md` | `26320e36175631fb17693e61c4dde5c876377248c8dac0a7918303e689c78e59` | `26320e36175631fb17693e61c4dde5c876377248c8dac0a7918303e689c78e59` | Unchanged during this task |
| `PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md` | `5f0b5bdfa81f97a7717d68c3c85000caf836ddfce8c49c1379ad10e605dadbdb` | `5f0b5bdfa81f97a7717d68c3c85000caf836ddfce8c49c1379ad10e605dadbdb` | Unchanged during this task |
| `PHASE_0_2_8_COMPLETION_REPORT.md` | `024be8eb7c1aad735f03312014a868514ebc5a68b7c93d455f88c779ad42565a` | `024be8eb7c1aad735f03312014a868514ebc5a68b7c93d455f88c779ad42565a` | Unchanged during this task |
| `PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md` | `75c89810ef1ac4caab9a2c3c44a71e6914433dff3640827ff13573aa80460d9e` | `75c89810ef1ac4caab9a2c3c44a71e6914433dff3640827ff13573aa80460d9e` | Unchanged during this task |
| `PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md` | `a67ffa8d135a418ac1de1291f4927f869dcf09fd4bcf8c2d5c6fd1eb87ef849e` | `a67ffa8d135a418ac1de1291f4927f869dcf09fd4bcf8c2d5c6fd1eb87ef849e` | Unchanged during this task |

This before/after check supports that the five inspected governing documents were not modified during this task. It does not prove the integrity of unrelated files or historical assertions. The only authorized filesystem write was creation of this decision record.

## 8. Artifact identity and stopping declaration

A whole-file SHA-256 cannot be embedded as its own final content without changing the bytes and therefore changing that hash. The digest below is explicitly for the report body before this identity block; the actual whole-file SHA-256, exact byte size, and physical line count are calculated from the saved file and returned with this task result.
Body SHA-256 (before this identity block): `731086377838090e86cbf47cd7220225cc639e521795aeb5076b105e1039dd00`
Whole-file SHA-256: Reported in task completion response to avoid a self-referential digest.
Byte size: 14191 bytes
Physical line count: 108

Phase 0.2.8 remains OPEN / NOT ACCEPTED. The owner-selected lifecycle direction is recorded; technical implementation, runtime safety, existing-document corrections, independent audit, phase acceptance, and phase progression remain unauthorized. STOP and await further explicit project-owner instructions.
