# P028 Three-Report Correction Plan v1.4

## 1. Document control and authorization boundary

**Task:** `P028-THREE-REPORT-CORRECTION-PLAN-REFINEMENT-04`  
**Mode:** Strict read-only planning and evidence validation.  
**Status:** Phase 0.2.8 remains **OPEN / NOT ACCEPTED**.

This task creates only this planning artifact. No target report or prior correction plan was edited. No code, database, infrastructure, or Git repository was modified; no SQL query was executed; no technical implementation or independent audit occurred. The owner-approved Cloudinary decision is policy only; implementation and runtime safety remain unverified unless separately evidenced. Separate explicit owner authorization is required before report editing, and separate owner acceptance is required to close the phase.

## 2. Sources reviewed and metadata directly calculated

| Artifact | Exact path | Bytes | Lines | SHA-256 | Evidence classification |
|---|---|---:|---:|---|---|
| Decision Register v2.7.1 | `F:\hrms\docs\PHASE_0_FINAL_DECISION_REGISTER.md` | 40,701 | 489 | `26320E36175631FB17693E61C4DDE5C876377248C8DAC0A7918303E689C78E59` | Metadata directly calculated from current file; content directly inspected where cited |
| Implementation Checklist v2.7.1 | `F:\hrms\docs\PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md` | 44,169 | 306 | `5F0B5Bdfa81F97A7717D68C3C85000CAF836DDFCE8C49C1379AD10E605DADBDB` | Metadata directly calculated from current file; content directly inspected where cited |
| Completion Report v1.4.0 | `F:\hrms\docs\PHASE_0_2_8_COMPLETION_REPORT.md` | 35,489 | 360 | `024BE8EB7C1AAD735F03312014A868514EBC5A68B7C93D455F88C779AD42565A` | Directly inspected current file / metadata directly calculated |
| Reconciliation Report v1.3.0 | `F:\hrms\docs\PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md` | 17,983 | 220 | `75C89810EF1AC4CAAB9A2C3C44A71E6914433DFF3640827FF13573AA80460D9E` | Directly inspected current file / metadata directly calculated |
| Acceptance Report v2.8.0 | `F:\hrms\docs\PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md` | 44,320 | 287 | `A67FFA8D135A418AC1DE1291F4927F869DCF09FD4BCF8C2D5C6FD1EB87EF849E` | Directly inspected current file / metadata directly calculated |
| Owner Decision Record | `F:\hrms\evidence_preservation_P028_20261114_182132\P028_CLOUDINARY_LIFECYCLE_OWNER_DECISION_RECORD.md` | 14,191 | 107 | `91A986BDF846975DF13B464091A372AC1F4D9BE965A4E8688771DA16704F9291` | Directly inspected current file |
| Final Remediation Audit | `F:\hrms\docs\PHASE_0_2_8_FINAL_REMEDIATION_AUDIT_REPORT.md` | 105,943 | 292 | `763597026C835294CCD692DC10C102560BD37F96249BB50223056BABF013C20E` | Content summarized from cited report / metadata directly calculated |

## 3. Owner policy and evidence boundaries

The Owner Decision Record lines 15–24 records **Option A — Partitioned Two-Path Cloudinary Upload Lifecycle**. Committed attendance media is terminal and protected from abandoned-upload cleanup. Only abandoned/uncommitted candidates may enter cleanup after validation. The two-hour threshold is only a provisional screening/filter condition: age alone never proves abandonment or authorizes deletion. This is policy, not proof of implementation, transaction atomicity, race prevention, retry/idempotency, or runtime safety.

## 4. R-02 — Markdown-safe complete proposed replacement

**Current Reconciliation Report passage, verbatim, lines 98–116:**

```markdown
### Inconsistency 2: Cloudinary Upload Intent State Machine & Deletion Safety (Correction B)
* **Inconsistency Found:** Linear state diagram `pending -> uploading -> committed -> cleanup_claimed -> cleaned` unintentionally implied that committed attendance photos could transition into the orphan cleanup workflow.
* **Before:**
  - `status` ('pending', 'uploading', 'committed', 'cleanup_claimed', 'cleaned', 'failed') presented as a single pipeline where committed records could be evaluated by cleanup workers.
* **After:**
  - Partitioned into two mutually exclusive paths:
    1. **Successful Attendance Path:** `pending` $\rightarrow$ upload outside DB tx $\rightarrow$ DB tx associates with attendance and marks `committed` $\rightarrow$ commit. Committed intents are terminal and **NEVER** selected for cleanup.
    2. **Abandoned / Failed Upload Path (Uncommitted Candidates Only):** Intents in `pending` or `failed` $> 2\text{h}$ claimed via worker lease (`cleanup_claimed`, `worker_id`, `lease_expires_at`).
  - Pre-deletion check strictly verifies actual schema columns:
    ```sql
    SELECT id FROM attendance_attendance 
    WHERE punch_in_photo LIKE CONCAT('%', :publicId, '%') 
       OR punch_out_photo LIKE CONCAT('%', :publicId, '%')
    UNION ALL
    SELECT id FROM accounts_employeedocument 
    WHERE file LIKE CONCAT('%', :publicId, '%');
    ```
  - **Absolute Deletion Safety Rule:** Committed records and active references are **NEVER** deleted. Inconclusive checks preserve the asset for manual review.
* **Reason for Correction:** Prevents accidental deletion of legitimate employee attendance photos and establishes safe crash recovery semantics.
```

**Copy-ready proposed replacement; outer fence has four backticks and inner SQL fence has three:**

````markdown
### Inconsistency 2: Cloudinary Upload Intent State Machine & Deletion Safety (Historical Defect; Owner-Selected Policy)
* **Historical evidence:** The former linear state diagram and single-pipeline wording remain historical defect evidence; they are not the current governing lifecycle instruction.
* **Owner-approved policy:** Option A — Partitioned Two-Path Cloudinary Upload Lifecycle. Committed attendance media is terminal and protected from abandoned-upload cleanup. Only abandoned/uncommitted candidates may enter cleanup, and cleanup must not delete committed attendance media.
* **Proposed technical design:** Successful path is `pending` $\rightarrow$ upload outside proposed DB transaction $\rightarrow$ parent-user lock, attendance association, `committed`, commit. Cleanup consideration requires independently validated uncommitted state. The two-hour age threshold is only a provisional screening/filter condition; age alone never proves abandonment or authorizes deletion. Proposed `cleanup_claimed`, `worker_id`, and `lease_expires_at` controls require validated worker ownership and lease/fencing authority.
* **Required pre-deletion reference check:**
  ```sql
  SELECT id FROM attendance_attendance 
  WHERE punch_in_photo LIKE CONCAT('%', :publicId, '%') 
     OR punch_out_photo LIKE CONCAT('%', :publicId, '%')
  UNION ALL
  SELECT id FROM accounts_employeedocument 
  WHERE file LIKE CONCAT('%', :publicId, '%');
  ```
* **Ambiguity rule:** Reference and ownership checks are required before deletion. Ambiguous/inconclusive state, eligibility, ownership, lease/fencing, or reference evidence requires preservation and manual/inconclusive review, not automatic deletion.
* **Verification limit:** This is owner policy plus proposed design. It does not prove implementation, SQL execution, transaction atomicity, race prevention, retry/idempotency, or runtime safety.
````

Fence-pairing inspection: the outer four-backtick opener/closer and inner three-backtick SQL opener/closer are paired. This is a formatting inspection only, not a new independent audit.

## 5. R-03 — copy-ready five-document evidence classification

```markdown
## 4. Current Five-Document Comparison and Evidence Classification

This comparison is not a five-document occurrence inventory, independent-audit reproducibility verification, implementation verification, runtime-safety verification, or phase acceptance.

1. **`PHASE_0_FINAL_DECISION_REGISTER.md` — v2.7.1; 489 lines; 40,701 bytes.** Specific comparison: Section 3.4 partitioned-lifecycle design. Evidence basis: **Directly inspected current file; metadata directly calculated from current file.** It does not establish implementation or runtime safety.
2. **`PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md` — v2.7.1; 306 lines; 44,169 bytes.** Specific comparison: lines 81, 165–168, and 209–220 describe implementation/testing work. Evidence basis: **Directly inspected current file; metadata directly calculated from current file.** It does not prove those tasks ran or passed.
3. **`PHASE_0_2_8_COMPLETION_REPORT.md` — v1.4.0; 360 lines; 35,489 bytes.** Specific comparison: current lifecycle terminology. Evidence basis: **Directly inspected current file; metadata directly calculated from current file.** Its wording does not independently prove implementation or runtime safety.
4. **`PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md` — v1.3.0; 220 lines; 17,983 bytes.** Specific comparison: historical linear wording and current reconciliation claims. Evidence basis: **Directly inspected current file; metadata directly calculated; historical claim retained from an earlier report.** Historical claims are not independently verified by this comparison.
5. **`PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md` — v2.8.0; 287 lines; 44,320 bytes.** Specific comparison: OCC-001–OCC-078 and acceptance claims. Evidence basis: **Directly inspected current file; metadata directly calculated; fifth-document OCC taxonomy not independently verified.** Its existing table covers four external documents and is not a complete five-document inventory.

Owner Decision Record, Final Remediation Audit Report, and correction plans are related evidence, not additional governing reports. They do not convert the comparison into implementation, runtime-safety, reproducibility, or acceptance evidence.
```

## 6. A-03 Git evidence and v1.1 discrepancy preserved

A-03 replacement remains: root `F:\hrms` has no `.git`, so root Git history/working-tree state is **NOT VERIFIED**. `F:\hrms\hrms_mobile` is separate; the Final Remediation Audit Report lines 11, 13, 33, and 284 reports pre-existing staged additions, staged modifications/deletions, and untracked files on unborn `master`. This does not establish changes during this task or that all repositories were clean. Git actions differ from ordinary filesystem changes; historical documentation modifications are not Git commits/working-tree proof.

The v1.1 uploaded-copy reference `2563e5c17b191fd3703652777f99c02f6641c861b7c78af73edd71fef719f57f` differs from the current-path value `3E7DD2E58B037BA3B3C796CFE49E0B81E1198A8ADA553D8584EADC76A8C0323F`. **NOT VERIFIED — ORIGINAL UPLOADED ARTIFACT UNAVAILABLE.** No inference follows.

## 7. Sixteen-entry revalidation

| IDs | Result |
|---|---|
| C-01–C-04 | Retained: self-version, two lifecycle passages, and readiness wording remain evidence-supported proposed corrections. |
| R-01 | Retained: preserve historical row plus same-date clarification. |
| R-02 | Retained and formatting-corrected in §4. |
| R-03 | Retained and metadata-completed in §5. |
| R-04 | **NO CHANGE**: it is scoped to code/infrastructure, not Git state. |
| A-01–A-02 | Retained: remove defect-free/ready and fully-harmonized overstatement. |
| A-03 | Retained and repository-scope-corrected in §6. |
| A-04 | Retained: current Acceptance metadata row requires measured values. |
| A-05 | Retained: preserve OCC-001–078; no complete fifth-document inventory/no new ID. |
| A-06–A-08 | Retained: documentation-policy alignment only; no zero-defect or acceptance verdict. |

All 16 identifiers are retained. Detailed passages not changed by these three v1.4 findings remain exactly as copy-ready planned in v1.3; no new policy, performance target, historical claim, implementation claim, or acceptance claim is introduced.

## 8. OCC, preservation, risks, and authorization

The earlier Final Remediation Audit, not this task, reports identifier integrity for OCC-001–OCC-078 and separately says the table is four external documents, not a complete fifth-document inventory. Preserve original/mutated audit outputs, historical linear wording, and unauthorized-change disclosures. No technical evidence establishes transaction atomicity, race prevention, retries, idempotency, or runtime safety. Separate authorization is required for report edits, technical work, a full five-document inventory, or a new independent audit.

## 9. Final artifact metadata

**Self-metadata limitation:** A whole-file SHA-256 cannot be both inserted into and exactly equal to the file containing it without a preimage/fixed-point construction. Inserting a calculated hash changes the file and therefore its hash. To avoid inventing a value, final v1.4 SHA-256, byte size, line count, and calculation timestamp are reported externally in this task’s completion response after the final write. This document contains no false self-hash.

## 10. Final planning-only conclusion

This task is planning-only. No target report or previous plan was edited; no code, database, infrastructure, or Git repository was modified; no SQL query, technical implementation, or independent audit was performed. The owner-approved lifecycle is policy only, not proof of implementation or runtime safety. Phase 0.2.8 remains **OPEN / NOT ACCEPTED**. STOP and await explicit project-owner authorization.
