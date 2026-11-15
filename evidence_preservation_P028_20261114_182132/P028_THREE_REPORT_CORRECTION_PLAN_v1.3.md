# P028 Three-Report Correction Plan v1.3

## Document control and boundary

**Task:** `P028-THREE-REPORT-CORRECTION-PLAN-REFINEMENT-03`  
**Mode:** strict read-only planning. **Phase:** OPEN / NOT ACCEPTED.

This plan is planning-only. No target report, prior plan, code, database, infrastructure, Git repository, audit artifact, or historical evidence was edited. No Git operation, technical implementation, or independent audit was performed. Owner approval is required before editing any governing report; a separate owner decision is required for acceptance.

## Sources and metadata directly calculated

| Artifact | Path | Bytes | Lines | SHA-256 |
|---|---|---:|---:|---|
| v1.0 | `F:\hrms\evidence_preservation_P028_20261114_182132\P028_THREE_REPORT_CORRECTION_PLAN.md` | 49,776 | 446 | `59F91568438339FC7C63832014628BF36AA74BD61588C529DDF9075E73125242` |
| v1.1 | `F:\hrms\evidence_preservation_P028_20261114_182132\P028_THREE_REPORT_CORRECTION_PLAN_v1.1.md` | 45,806 | 531 | `3E7DD2E58B037BA3B3C796CFE49E0B81E1198A8ADA553D8584EADC76A8C0323F` |
| v1.2 | `F:\hrms\evidence_preservation_P028_20261114_182132\P028_THREE_REPORT_CORRECTION_PLAN_v1.2.md` | 35,042 | 411 | `ED3AA8588EA0E4E11F9A1A264A75D39DE20C9058C2FD01321A0D222E7E2521A6` |
| Completion v1.4.0 | `F:\hrms\docs\PHASE_0_2_8_COMPLETION_REPORT.md` | 35,489 | 360 | `024BE8EB7C1AAD735F03312014A868514EBC5A68B7C93D455F88C779AD42565A` |
| Reconciliation v1.3.0 | `F:\hrms\docs\PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md` | 17,983 | 220 | `75C89810EF1AC4CAAB9A2C3C44A71E6914433DFF3640827FF13573AA80460D9E` |
| Acceptance v2.8.0 | `F:\hrms\docs\PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md` | 44,320 | 287 | `A67FFA8D135A418AC1DE1291F4927F869DCF09FD4BCF8C2D5C6FD1EB87EF849E` |

The supplied v1.1 uploaded-copy reference is `2563e5c17b191fd3703652777f99c02f6641c861b7c78af73edd71fef719f57f`, which differs from the directly calculated current path hash above. **NOT VERIFIED — ORIGINAL UPLOADED ARTIFACT UNAVAILABLE:** no separate uploaded-copy artifact was located for direct two-artifact comparison. This mismatch alone establishes neither tampering, unauthorized editing, nor corruption. v1.0’s supplied reference matches its direct current-path hash.

## Owner policy and status distinction

Owner Decision Record `F:\hrms\evidence_preservation_P028_20261114_182132\P028_CLOUDINARY_LIFECYCLE_OWNER_DECISION_RECORD.md` lines 15–24 records **Option A — Partitioned Two-Path Cloudinary Upload Lifecycle**. It is owner-approved policy only: committed attendance media is terminal/protected; only abandoned/uncommitted candidates may enter cleanup; ownership/reference checks are required before deletion; cleanup must not delete committed attendance media.

States, transactions, claims/leases/fencing/heartbeats, reference queries, recovery and retries are **proposed technical design** unless separately evidenced. Implementation and independently verified runtime safety are unverified. The two-hour threshold is only a provisional screening/filter condition: age alone never proves abandonment and never authorizes deletion. Uncommitted state plus ownership/worker/lease or fencing authority and reference/ownership checks are required; ambiguity requires preservation and manual/inconclusive review.

## Four v1.3 refinements

### A-03 — Git evidence

**Current Acceptance line 51, verbatim:**

```markdown
| Git Actions (Commit, Push, Merge, Branch Switch) | **STRICTLY PROHIBITED** | Exactly zero Git commits or working-tree alterations | **PASS** |
```

**Copy-ready replacement:**

```markdown
| Git Actions (Commit, Push, Merge, Branch Switch) | **STRICTLY PROHIBITED** | `F:\hrms` has no root `.git` metadata; root Git history and root working-tree state are **NOT VERIFIED**. `F:\hrms\hrms_mobile` is a separate repository; Final Remediation Audit Report lines 11, 13, 33, and 284 report an unborn `master` branch with pre-existing staged additions, staged modifications/deletions, and untracked files. Those reported mobile-repository entries are not evidence of changes during this task and are not evidence that all repositories were clean. No commit, push, merge, or branch-switch action is asserted. Ordinary filesystem documentation edits, including historical unauthorized edits, are not equivalent to Git commits or Git working-tree evidence. | **LIMITED — NOT INDEPENDENTLY VERIFIED** |
```

Evidence: Remediation Audit lines 11, 13, 31–33, 233, 241, 279, 284. This fixes scope/evidence attribution without asserting a clean working tree.

### R-02 — complete reference-check SQL

**Current Reconciliation lines 98–116, verbatim:**

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

**Copy-ready replacement:**

```markdown
### Inconsistency 2: Cloudinary Upload Intent State Machine & Deletion Safety (Historical Defect; Owner-Selected Policy)
* **Historical evidence:** The former linear state diagram and single-pipeline wording are retained as defect history; they are not the current governing lifecycle instruction.
* **Owner-approved policy:** Option A is the partitioned two-path lifecycle. Committed attendance media is terminal and protected from abandoned-upload cleanup; only abandoned/uncommitted candidates may enter cleanup; cleanup must not delete committed attendance media.
* **Proposed technical design:** Successful path is `pending` $\rightarrow$ upload outside proposed DB transaction $\rightarrow$ parent-user lock, attendance association, `committed`, commit. Cleanup consideration is limited to independently validated uncommitted `pending`/`failed` candidates. The two-hour threshold is only a provisional screening/filter condition: age alone never proves abandonment or authorizes deletion. Proposed `cleanup_claimed`, `worker_id`, and `lease_expires_at` controls require validated worker ownership and lease/fencing authority.
* **Required pre-deletion reference check:**
  ```sql
  SELECT id FROM attendance_attendance 
  WHERE punch_in_photo LIKE CONCAT('%', :publicId, '%') 
     OR punch_out_photo LIKE CONCAT('%', :publicId, '%')
  UNION ALL
  SELECT id FROM accounts_employeedocument 
  WHERE file LIKE CONCAT('%', :publicId, '%');
  ```
* **Ambiguity rule:** Reference and ownership checks are required before deletion. Ambiguous/inconclusive state, eligibility, ownership, lease/fencing, or reference evidence excludes the candidate from automatic deletion and requires preservation/manual review.
* **Verification limit:** This is policy plus proposed design, not proof of implementation, atomic transactions, race prevention, retry/idempotency, or runtime safety.
```

### R-03 — complete five-document evidence classification

**Current Reconciliation lines 159–175 are quoted in v1.2 and remain current; this full replacement supersedes the prior patch-style proposal.**

```markdown
## 4. Current Five-Document Comparison and Evidence Classification

This comparison is not a five-document occurrence inventory, an independent reproducibility audit, implementation verification, runtime-safety verification, or phase acceptance.

1. **`PHASE_0_FINAL_DECISION_REGISTER.md` — v2.7.1.** Current file directly inspected; metadata directly calculated: 489 lines, 40,701 bytes. Section 3.4 contains partitioned-lifecycle design wording. Evidence basis: **Directly inspected current file / metadata directly calculated.** It does not establish implemented behavior or runtime safety.
2. **`PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md` — v2.7.1.** Current file directly inspected; metadata directly calculated: 306 lines, 44,169 bytes. Lines 81 and 165–168, 209–220 describe validation/implementation work. Evidence basis: **Directly inspected current file / metadata directly calculated.** It does not prove those tasks ran or passed.
3. **`PHASE_0_2_8_COMPLETION_REPORT.md` — v1.4.0.** Current file directly inspected; metadata directly calculated: 360 lines, 35,489 bytes. Its lifecycle passages are compared as current terminology. Evidence basis: **Directly inspected current file / metadata directly calculated.** Its claims do not independently prove technical implementation or runtime safety.
4. **`PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md` — v1.3.0.** Current file directly inspected; metadata directly calculated: 220 lines, 17,983 bytes. It retains historical linear-lifecycle wording and current reconciliation claims. Evidence basis: **Directly inspected current file / metadata directly calculated; historical claims retained from earlier report.** Historical claims are not independently validated by this comparison.
5. **`PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md` — v2.8.0.** Current file directly inspected; metadata directly calculated: 287 lines, 44,320 bytes. Its OCC-001–OCC-078 table and acceptance claims are compared. Evidence basis: **Directly inspected current file / metadata directly calculated.** The fifth-document OCC taxonomy is **not independently verified**; the existing table addresses four external documents only.

Related preservation evidence—the Owner Decision Record, Final Remediation Audit Report, and correction plans—is not an additional governing report. It supplies cited policy, historical, and limitation evidence only.
```

## Full 16-entry revalidation matrix

| ID | Location | Current text / outcome | Complete correction status |
|---|---|---|---|
| C-01 | Completion 74 | v1.3.0 self-reference | Change to v1.4.0; supported |
| C-02 | Completion 135–143 | detailed lifecycle | Revise with policy/proposed-design limit |
| C-03 | Completion 345–349 | detailed lifecycle addendum | Revise with policy/proposed-design limit |
| C-04 | Completion 301–306 | acceptance recommendation | Revise to owner review only |
| R-01 | Reconciliation 20 | v1.3 history row | Retain + same-date clarification |
| R-02 | Reconciliation 98–116 | linear history/design | Revise fully above; SQL retained |
| R-03 | Reconciliation 159–175 | 100% five-document claim | Replace fully above |
| R-04 | Reconciliation 205–219 | code/infrastructure scope | **NO CHANGE** |
| A-01 | Acceptance 7 | defect-free/ready | Revise to OPEN / NOT ACCEPTED |
| A-02 | Acceptance 34–36 | fully harmonized claim | Revise to evidence boundary |
| A-03 | Acceptance 51 | zero Git/worktree claim | Revise fully above |
| A-04 | Acceptance 66 | own metadata missing | Add 287 lines / 44,320 B |
| A-05 | Acceptance 204–221 | 78-occurrence scope | Attribute prior parser; no fifth taxonomy |
| A-06 | Acceptance 114–115 | PASS/100% DEF-01 | Documentation-policy alignment only |
| A-07 | Acceptance 262–271 | zero active defects | Preserve limitations / OPEN status |
| A-08 | Acceptance 275–287 | ready verdict | Replace with no-acceptance conclusion |

All entries retain the current-source quotations and complete replacements in v1.2 except A-03, R-02, and R-03, which are fully replaced above. No entry is removed; R-04 remains NO CHANGE.

## OCC scope, chronology, and preservation

The Final Remediation Audit Report—not this task—reports 78 inventory rows, 78 unique IDs, zero duplicates/gaps/extras/source-line contradictions for OCC-001–OCC-078. It also says this is four external documents, not a complete fifth-document taxonomy. No OCC identifier is assigned. The owner decision and v1.3 Reconciliation revision are both dated 2026-11-14; no timestamps establish their sequence, so the policy is described as separately selected, not “later.” Preserve original and mutated audit outputs, historical unauthorized-change disclosures, and linear-lifecycle history.

## Remaining risks and authorization requirements

No code/runtime evidence establishes transaction atomicity, race prevention, retry/idempotency, ownership enforcement, or cleanup safety. These require separately authorized source inspection, implementation, and staging validation. A full five-document inventory or a new independent audit requires separate authorization.

## Final planning-only conclusion

No target report or earlier plan was edited. No technical implementation, independent audit, or Git operation was performed. The owner-approved lifecycle is policy only; implementation and runtime safety remain unverified unless separate evidence proves otherwise. Phase 0.2.8 remains **OPEN / NOT ACCEPTED**. STOP and await explicit project-owner authorization.
