# P028 Three-Report Correction Plan

## 1. Task metadata and authorization boundary

- **Task ID:** `P028-THREE-REPORT-CORRECTION-PLAN-01`
- **Project / phase:** Enterprise HRMS / Phase 0.2.8
- **Plan date:** 2026-11-14 (Asia/Calcutta)
- **Authorization:** Read existing evidence and create this single correction plan only.
- **Status:** Phase 0.2.8 remains **OPEN / NOT ACCEPTED**.

This is a proposed wording plan for project-owner review. It does not authorize or perform edits to the three target reports, any governing document, any audit output, code, tests, configuration, databases, Cloudinary, infrastructure, or Git state. It does not execute an audit or establish implementation, transaction atomicity, cleanup-race safety, retry/idempotency behavior, or runtime correctness.

## 2. Inspection scope and source inventory

The following files were read directly from their physical paths. Physical line numbers below are one-based `Get-Content` positions in the current saved files.

| Source | Physical path | Version / identity used | Purpose |
|---|---|---|---|
| Completion Report | `F:\hrms\docs\PHASE_0_2_8_COMPLETION_REPORT.md` | v1.4.0; 360 lines | Target report |
| Final Reconciliation Report | `F:\hrms\docs\PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md` | v1.3.0; 220 lines | Target report |
| Final Acceptance Verification Report | `F:\hrms\docs\PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md` | v2.8.0; 287 lines | Target report |
| Owner Decision Record | `F:\hrms\evidence_preservation_P028_20261114_182132\P028_CLOUDINARY_LIFECYCLE_OWNER_DECISION_RECORD.md` | 2026-11-14 record | Governing owner policy decision and technical-verification boundary |
| Final Remediation Audit Report | `F:\hrms\docs\PHASE_0_2_8_FINAL_REMEDIATION_AUDIT_REPORT.md` | Task ID `P028-FINAL-REMEDIATION-AND-ACCEPTANCE-READINESS-01` | Defects, inventory limitation, and audit-integrity evidence |
| Final Decision Register | `F:\hrms\docs\PHASE_0_FINAL_DECISION_REGISTER.md` | v2.7.1 | Verified current policy/design wording only |
| Final Implementation Checklist | `F:\hrms\docs\PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md` | v2.7.1 | Verified current implementation-validation boundary only |

### 2.1 Target-report pre-inspection identity

| Target report | Exact physical path | Current version | Bytes before plan | Physical lines before plan | SHA-256 before plan |
|---|---|---:|---:|---:|---|
| Completion Report | `F:\hrms\docs\PHASE_0_2_8_COMPLETION_REPORT.md` | v1.4.0 | 35,489 | 360 | `024BE8EB7C1AAD735F03312014A868514EBC5A68B7C93D455F88C779AD42565A` |
| Final Reconciliation Report | `F:\hrms\docs\PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md` | v1.3.0 | 17,983 | 220 | `75C89810EF1AC4CAAB9A2C3C44A71E6914433DFF3640827FF13573AA80460D9E` |
| Final Acceptance Verification Report | `F:\hrms\docs\PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md` | v2.8.0 | 44,320 | 287 | `A67FFA8D135A418AC1DE1291F4927F869DCF09FD4BCF8C2D5C6FD1EB87EF849E` |

## 3. Governing Cloudinary decision and evidence limitations

The owner selected **OPTION A — PARTITIONED TWO-PATH CLOUDINARY UPLOAD LIFECYCLE** on 2026-11-14, as recorded in `P028_CLOUDINARY_LIFECYCLE_OWNER_DECISION_RECORD.md` lines 15–24. The selected policy requires that: (1) committed attendance media is terminal and protected from abandoned-upload cleanup; (2) only abandoned or uncommitted candidates may enter cleanup; (3) deletion candidates receive reference and ownership checks; and (4) abandoned-upload cleanup must not delete a committed attendance photo.

The Owner Decision Record, lines 24 and 44–72, expressly distinguishes policy selection and written design from code implementation and runtime safety. The Decision Register currently states the same design requirements at lines 249–324, including that worker leases/fencing require implementation and staging validation (line 322) and that no Cloudinary operations are authorized in Phase 0.2.8 (line 324). The Implementation Checklist makes Cloudinary recovery validation a staging requirement at line 81 and lists implementation/testing work at lines 165–168 and 209–220.

Therefore, every proposed replacement below must use the following meanings:

- **Owner-selected design direction:** Option A policy selected on 2026-11-14.
- **Documentation-level consistency:** Current written lifecycle wording is aligned with Option A when explicitly qualified.
- **Implemented behavior:** not established by this planning task.
- **Runtime/concurrency safety:** not established; cleanup races, transaction boundaries, retries, ownership enforcement, and idempotency remain subject to separately authorized technical inspection and validation.

## 4. Proposed corrections — Completion Report

### C-01 — Correct the self-version contradiction

- **Target / version / location:** `F:\hrms\docs\PHASE_0_2_8_COMPLETION_REPORT.md`, v1.4.0, line 74.
- **Existing text (verbatim):** `3. \`docs/PHASE_0_2_8_COMPLETION_REPORT.md\` — Updated to **Version 1.3.0** (this document).`
- **Defect:** This conflicts with the report header at line 5 and change-history entry at line 21, both of which identify the current report as v1.4.0. The Final Remediation Audit Report identifies this exact defect at lines 230–233.
- **Exact proposed replacement:** `3. \`docs/PHASE_0_2_8_COMPLETION_REPORT.md\` — Updated to **Version 1.4.0** (this document).`
- **Reason:** Corrects a present-tense self-reference without altering the historical change-history entries.
- **Supporting evidence:** Completion Report lines 5, 21, and 74; Final Remediation Audit Report lines 230–233.
- **Effect:** Documentation accuracy and audit traceability only; no lifecycle or acceptance-status effect.
- **Dependencies / questions:** Owner approval for this exact target file. No technical dependency.

### C-02 — State the owner decision and retain the implementation boundary in the primary lifecycle description

- **Target / version / location:** Completion Report, v1.4.0, replace lines 135–143 as one paragraph-and-list block.
- **Existing text (verbatim):**

```markdown
To ensure safety across crash and recovery scenarios, a comprehensive state machine was specified for future implementation:
* **Intent States (Partitioned Lifecycle — Superseding Linear Diagram):** As reconciled in Section 10.2 Addendum, the older linear sequence is superseded. The lifecycle is partitioned into two mutually exclusive paths:
  - **Successful Attendance Path:** `pending` → `uploading` → `committed` (terminal for cleanup, permanently excluded from deletion).
  - **Abandoned / Failed Upload Path (Uncommitted Candidates Only):** `pending` or `failed` $> 2\text{h}$ → `cleanup_claimed` → `cleaned` (or manual review).
* **Worker Lease Ownership:** Reconciliation workers claim intents via `cleanup_claimed` using unique worker UUIDs and lease timeouts.
* **Heartbeat & Fencing:** Long-running recovery workers maintain heartbeat timestamps to prevent zombie workers from acting after lease expiration.
* **Pre-Deletion Reference Check:** The corrected SQL reference check must execute immediately prior to calling `cloudinary.uploader.destroy(publicId)`.
* **Absolute Deletion Safety Rule:** An asset must **NEVER** be deleted when a committed database record references it. If the reconciliation worker cannot conclusively prove an asset is an unreferenced orphan, it must **NOT** delete the file. The record is flagged for manual review. Legitimate attendance evidence must never be sacrificed for automated cleanup.
* **Status:** Marked as a proposed design requiring implementation and testing (**NEEDS TECHNICAL VALIDATION**). Zero Cloudinary operations were performed.
```

- **Defect / ambiguity:** Although line 143 qualifies the design, the preceding wording can be read as an established comprehensive state machine and does not record the owner’s 2026-11-14 selection. It should explicitly separate policy selection, documentation wording, and unverified implementation/safety.
- **Exact proposed replacement:**

```markdown
The project owner selected **OPTION A — PARTITIONED TWO-PATH CLOUDINARY UPLOAD LIFECYCLE** on 2026-11-14. This selection establishes the governing design direction and corrects the lifecycle terminology in this report; it does not establish implemented application behavior or runtime safety across crashes, retries, transactions, or concurrent cleanup.

* **Intent States (Owner-Selected Partitioned Lifecycle; historical linear wording superseded as current design):** The lifecycle documentation uses two mutually exclusive paths:
  - **Successful Attendance Path:** `pending` → `uploading` → `committed`. A successfully committed attendance-media intent is terminal for abandoned-upload cleanup and is not a cleanup candidate.
  - **Abandoned / Failed Upload Path (Uncommitted Candidates Only):** Only candidates that remain uncommitted, such as `pending` or `failed` intents older than the provisional age threshold, may be considered for cleanup or manual review.
* **Proposed Cleanup Controls:** The design calls for worker-ownership/lease checks, pre-deletion reference checks immediately before any deletion request, preservation on inconclusive evidence, and manual review where required.
* **Required Safety Rule:** An abandoned-upload cleanup process must not delete a committed attendance photo. A candidate with a committed record reference, an active reference, inconclusive reference evidence, or unresolved ownership evidence must be preserved rather than deleted.
* **Verification Status:** These are owner-selected policy and documentation requirements. This report does not claim that code enforces them, that database transactions are atomic for them, that cleanup races are eliminated, or that retry/idempotency behavior has passed testing. Implementation and runtime/concurrency safety remain **NEEDS TECHNICAL VALIDATION**. Zero Cloudinary operations were performed in Phase 0.2.8.
```

- **Reason:** Retains the intended design while preventing a policy/documentation correction from being mistaken for proof of implementation.
- **Supporting evidence:** Owner Decision Record lines 15–24 and 44–72; Decision Register lines 249–324; Completion Report lines 135–143.
- **Effect:** Lifecycle terminology and acceptance-readiness qualification; preserves historical linear wording as superseded rather than deleting history.
- **Dependencies / questions:** Owner approval. Technical validation is a separate future activity and is not authorized by this plan.

### C-03 — Qualify the repeated addendum lifecycle statement

- **Target / version / location:** Completion Report, v1.4.0, replace lines 345–349.
- **Existing text (verbatim):**

```markdown
### 2. Cloudinary Upload Intent Separate Lifecycles (Correction B)
The upload intent lifecycle is formally partitioned into two mutually exclusive paths to ensure committed attendance photos can never enter an orphan-deletion workflow:
- **Successful Attendance Path:** `uploadToken` + deterministic `publicId` → intent inserted as `'pending'` → upload outside DB tx → DB tx locks parent user, inserts attendance, and marks intent `'committed'` → DB tx commits. A committed intent is terminal for cleanup and is **NEVER** selected for deletion.
- **Abandoned / Failed Upload Path (Uncommitted Candidates Only):** Intents in `'pending'` or `'failed'` older than the provisional 2-hour threshold are claimed with a worker lease token (`cleanup_claimed`, `worker_id`, `lease_expires_at`). The worker rechecks database references across verified columns (`attendance_attendance.punch_in_photo`, `attendance_attendance.punch_out_photo`, and `accounts_employeedocument.file`). If referenced, the intent is updated to `'committed'`; if inconclusive, the asset is preserved for manual review; if conclusively unreferenced, `cloudinary.uploader.destroy(publicId)` is called and intent is marked `'cleaned'`.
- **Absolute Deletion Safety Rule:** Committed records and active references are **NEVER** deleted.
```

- **Defect / ambiguity:** “Formally” and the imperative operational sequence can imply present implementation and verified safety.
- **Exact proposed replacement:**

```markdown
### 2. Cloudinary Upload Intent Separate Lifecycles (Owner-Selected Design Direction)
On 2026-11-14, the project owner selected the partitioned two-path lifecycle as the governing design direction. The following is documentation-level design wording, not a claim of implemented behavior or runtime verification:
- **Successful Attendance Path:** The selected design requires a successfully committed attendance-media intent to be terminal for abandoned-upload cleanup and excluded from deletion candidates.
- **Abandoned / Failed Upload Path (Uncommitted Candidates Only):** The selected design permits only abandoned or uncommitted candidates to be considered for cleanup, subject to ownership and reference checks before deletion; inconclusive cases require preservation and manual review.
- **Required Safety Rule:** Abandoned-upload cleanup must not delete a committed attendance photo.
- **Technical Status:** The code path, transaction boundaries, ownership enforcement, reference-check coverage, cleanup-race behavior, and retry/idempotency behavior have not been established by this report. They require separately authorized implementation and staging/runtime validation.
```

- **Reason:** Avoids a documentation report asserting an unverified operational state machine while preserving the owner-selected design requirements.
- **Supporting evidence:** Owner Decision Record lines 17–24 and 50–72; Completion Report lines 345–349; Decision Register lines 320–324.
- **Effect:** Lifecycle terminology and technical-verification boundary.
- **Dependencies / questions:** Owner approval; no code or runtime activity is authorized.

### C-04 — Narrow the final recommendation to documentation-level reconciliation

- **Target / version / location:** Completion Report, v1.4.0, line 303.
- **Existing text (verbatim):** `The Phase 0.2.8 planning baseline is **fully reconciled, qualified, and mathematically verified**. All theoretical overstatements regarding distributed locking have been removed, schema references reflect verified empirical code, shift-boundary policy choices are cleanly separated from SQL logic, load testing targets are reconciled, and implementation dependencies are rigorously governed.`
- **Defect / ambiguity:** “Fully reconciled” and “mathematically verified” overstate the result in light of unresolved acceptance, audit-integrity/reproducibility findings, and unverified Cloudinary implementation/runtime safety.
- **Exact proposed replacement:** `This report records proposed planning-baseline wording and selected documentation-level policy direction. The project owner selected the partitioned Cloudinary lifecycle on 2026-11-14; that decision resolves the policy selection, not implementation or runtime safety. Phase 0.2.8 remains OPEN / NOT ACCEPTED, and the report does not establish technical completion, audit reproducibility, or acceptance readiness.`
- **Reason:** Makes the recommendation section compatible with the current phase status and evidence boundary.
- **Supporting evidence:** Owner Decision Record lines 11–13, 17–24, and 42–43; Final Remediation Audit Report lines 15–19 and 243–254.
- **Effect:** Acceptance status and lifecycle terminology; does not change historical audit conclusions.
- **Dependencies / questions:** Owner approval.

## 5. Proposed corrections — Final Reconciliation Report

### R-01 — Qualify the v1.3.0 history statement without erasing it

- **Target / version / location:** `F:\hrms\docs\PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md`, v1.3.0, line 20.
- **Existing text (verbatim):** `| **1.3.0** | Nov 14, 2026 | Antigravity Senior Architect | Final Defect Closure & Harmonization: Synchronized cross-document references with Completion Report v1.4.0 (DEF-01 resolution); confirmed complete cross-document harmonization across all 5 planning documents. |`
- **Defect / ambiguity:** The historical summary uses “DEF-01 resolution” and “complete” without specifying that the claimed result concerns wording, not implementation or runtime safety.
- **Exact proposed replacement:** `| **1.3.0** | Nov 14, 2026 | Antigravity Senior Architect | Final documentation harmonization: synchronized cross-document lifecycle wording with Completion Report v1.4.0. The 2026-11-14 owner selection records the partitioned two-path lifecycle as the governing design direction; implementation and runtime safety remain unverified. |`
- **Reason:** Preserves the fact of the report’s documentation update while removing a claim that can be read as technical resolution.
- **Supporting evidence:** Reconciliation Report line 20; Owner Decision Record lines 17–24 and 40–43.
- **Effect:** Historical traceability and lifecycle terminology.
- **Dependencies / questions:** Owner approval. If the owner requires immutable version-history text, instead retain the existing row and add an immediately following correction-note row with this qualification; no silent deletion is appropriate.

### R-02 — Preserve historical linear wording but identify its limited role and verification boundary

- **Target / version / location:** Final Reconciliation Report, v1.3.0, replace lines 98–116.
- **Existing text (verbatim):**

```markdown
### Inconsistency 2: Cloudinary Upload Intent State Machine & Deletion Safety (Correction B)
* **Inconsistency Found:** Linear state diagram `pending -> uploading -> committed -> cleanup_claimed -> cleaned` unintentionally implied that committed attendance photos could transition into the orphan cleanup workflow.
* **Before:**
  - `status` ('pending', 'uploading', 'committed', 'cleanup_claimed', 'cleaned', 'failed') presented as a single pipeline where committed records could be evaluated by cleanup workers.
* **After:**
  - Partitioned into two mutually exclusive paths:
    1. **Successful Attendance Path:** `pending` → upload outside DB tx → DB tx associates with attendance and marks `committed` → commit. Committed intents are terminal and **NEVER** selected for cleanup.
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

- **Defect / ambiguity:** The “Before” passage is necessary defect history, but the “After” and reason wording can be interpreted as a deployed, proven state machine. The latest owner decision settles the policy question; it does not prove enforcement.
- **Exact proposed replacement:**

```markdown
### Inconsistency 2: Cloudinary Upload Intent State Machine & Deletion Safety (Historical Defect and Owner-Selected Design Direction)
* **Historical inconsistency preserved:** Earlier linear wording, `pending -> uploading -> committed -> cleanup_claimed -> cleaned`, could be read to permit committed attendance photos to enter an orphan-cleanup workflow. This historical wording remains recorded here as defect evidence; it is not the current governing lifecycle instruction.
* **Owner-selected current design direction (2026-11-14):** The project owner selected the partitioned two-path Cloudinary lifecycle:
  1. **Successful Attendance Path:** Successfully committed attendance media is terminal and protected from abandoned-upload cleanup.
  2. **Abandoned / Failed Upload Path:** Only abandoned or uncommitted candidates may be considered for cleanup; candidates require reference and ownership checks before deletion, and inconclusive cases are preserved for manual review.
  3. **Required Safety Rule:** Abandoned-upload cleanup must not delete a committed attendance photo.
* **Documentation and verification boundary:** This records the owner-selected policy and documentation-level lifecycle terminology. It does not claim that the application implements the policy, that transaction boundaries or reference checks are sufficient, that cleanup races have been eliminated, or that retry/idempotency behavior has been tested.
* **Reason for correction:** Distinguishes historical defect evidence from the selected design direction without representing unverified controls as runtime facts.
```

- **Reason:** Retains auditable evidence of the former linear wording and removes the possibility that it is read as the active design.
- **Supporting evidence:** Reconciliation Report lines 98–116; Owner Decision Record lines 17–24 and 38–43; Decision Register lines 249–324.
- **Effect:** Historical claims, lifecycle terminology, and technical-verification boundary.
- **Dependencies / questions:** Owner approval; preserve the old linear string as quoted historical evidence in the replacement.

### R-03 — Narrow cross-document agreement to the documented scope

- **Target / version / location:** Final Reconciliation Report, v1.3.0, replace lines 159–175.
- **Existing text (verbatim):** `## 4. Confirmation of Cross-Document Agreement` followed by `Following these updates, all governing planning documents are 100% harmonized:` and five entries, including line 171 stating the Completion Report “resolves DEF-01 in Section 3.2.”
- **Defect / ambiguity:** The section claims 100% harmonization and treats DEF-01 as resolved without distinguishing documentation terminology from implementation/safety; it also relies on a verification report with documented inventory and audit-integrity limitations.
- **Exact proposed replacement:**

```markdown
## 4. Documentation-Level Cross-Document Agreement

The following comparison is limited to current written planning terminology. It records that the owner-selected partitioned two-path Cloudinary lifecycle is the current design direction in the cited documents. It does not establish implementation, runtime safety, or a complete independent five-document verification inventory.

1. **`docs/PHASE_0_FINAL_DECISION_REGISTER.md` (v2.7.1):** States the partitioned lifecycle as a proposed design and identifies required implementation/staging validation.
2. **`docs/PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md` (v2.7.1):** Treats Cloudinary recovery controls as implementation and staging-validation work.
3. **`docs/PHASE_0_2_8_COMPLETION_REPORT.md` (v1.4.0):** Uses partitioned-lifecycle wording; any DEF-01 result is limited to documentation terminology and owner-selected design direction.
4. **`docs/PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md` (v1.3.0):** Preserves the prior linear wording as defect history and records the current selected design direction.
5. **`docs/PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md` (v2.8.0):** Requires qualification because its occurrence inventory covers four external documents rather than a complete five-document inventory, and its acceptance claims do not establish runtime safety.
```

- **Reason:** Correctly limits the scope of the reconciliation report’s evidence.
- **Supporting evidence:** Owner Decision Record lines 28–43; Final Remediation Audit Report lines 226 and 232–241; Reconciliation Report lines 159–175.
- **Effect:** Audit traceability, acceptance status, and lifecycle terminology.
- **Dependencies / questions:** Owner approval. Do not present a future independent audit as completed without separate authorization.

### R-04 — No change to the historical zero-modification statement

- **Target / version / location:** Final Reconciliation Report, v1.3.0, lines 205–219.
- **Existing text (verbatim):** The section states that no application code, database, dependencies, infrastructure, services, or implementation phase was modified/initiated during “this final reconciliation.”
- **Recommendation:** **NO CHANGE.**
- **Reason:** This text is scoped to code, database, dependencies, and infrastructure; it does not make the Acceptance Report’s erroneous claim of zero Git “working-tree alterations.” It is compatible with the report’s documentation-only scope when read with its explicit subject.
- **Supporting evidence:** Reconciliation Report lines 205–219; Final Remediation Audit Report lines 232–233 distinguishes the separate Acceptance Report wording defect.
- **Effect:** None.
- **Dependencies / questions:** None.

## 6. Proposed corrections — Final Acceptance Verification Report

### A-01 — Correct the governance-decision overstatement

- **Target / version / location:** `F:\hrms\docs\PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md`, v2.8.0, line 7.
- **Existing text (verbatim):** `**Governance Decision:** All 5 documents fully harmonized; Phase 0.2.8 is defect-free and ready for project-owner acceptance sign-off`
- **Defect / ambiguity:** The owner alone controls acceptance. “Defect-free” and “ready” overstate evidence where the owner decision establishes policy, while implementation/runtime safety and audit/inventory limitations remain unresolved.
- **Exact proposed replacement:** `**Governance Status:** The owner selected the partitioned two-path Cloudinary lifecycle as the design direction on 2026-11-14. Documentation wording requires further owner-approved correction; Phase 0.2.8 remains OPEN / NOT ACCEPTED. This report does not establish implementation, runtime safety, audit reproducibility, or acceptance readiness.`
- **Reason:** Aligns the header with the current status and evidence boundary.
- **Supporting evidence:** Owner Decision Record lines 11–13, 17–24, and 40–43; Final Remediation Audit Report lines 15–19 and 239–254.
- **Effect:** Acceptance status and lifecycle terminology.
- **Dependencies / questions:** Owner approval.

### A-02 — Qualify the report’s current-state claim while preserving the fact it is documentation-only

- **Target / version / location:** Final Acceptance Verification Report, v2.8.0, replace lines 34–36.
- **Existing text (verbatim):**

```markdown
### 1.1 Governance Status: Fully Harmonized & Ready for Owner Acceptance
In accordance with the project owner's governing instructions, Phase 0.2.8 is conducted as a documentation-correction, defect-closure, and evidence-verification task:
> **Phase 0.2.8 remains OPEN and NOT ACCEPTED pending explicit project-owner sign-off.** This task has resolved all identified documentation defects and achieved genuine cross-document consistency. It does not authorize implementation, source-code changes, database changes, infrastructure changes, or progression to another phase.
```

- **Defect / ambiguity:** OPEN / NOT ACCEPTED is correct, but “resolved all” and “genuine cross-document consistency” are unsupported for a complete five-document inventory and can imply a technical result.
- **Exact proposed replacement:**

```markdown
### 1.1 Governance Status: OPEN / NOT ACCEPTED
Phase 0.2.8 is a documentation-correction and evidence-review activity. The project owner selected the partitioned two-path Cloudinary lifecycle on 2026-11-14 as the governing design direction.

> **Phase 0.2.8 remains OPEN / NOT ACCEPTED pending explicit project-owner acceptance.** The selected lifecycle direction and documentation wording do not demonstrate implemented behavior, runtime/concurrency safety, or a complete independently verified five-document inventory. This report authorizes no implementation, source-code, database, infrastructure, or phase-progression work.
```

- **Reason:** Retains the necessary stopping boundary and accurately describes the status.
- **Supporting evidence:** Owner Decision Record lines 11–13, 17–24, and 42–43; Final Remediation Audit Report lines 226, 234–239, and 290–292.
- **Effect:** Acceptance status and lifecycle terminology.
- **Dependencies / questions:** Owner approval.

### A-03 — Replace the false Git/working-tree statement

- **Target / version / location:** Final Acceptance Verification Report, v2.8.0, line 51.
- **Existing text (verbatim):** `| Git Actions (Commit, Push, Merge, Branch Switch) | **STRICTLY PROHIBITED** | Exactly zero Git commits or working-tree alterations | **PASS** |`
- **Defect:** This conflicts with the report’s own lines 42, 45, and 46, which record documentation modifications. The workspace root also has no Git metadata, so root Git history/working-tree state cannot be independently verified. “Working-tree alteration” conflates Git operations, filesystem edits, and different task timeframes.
- **Exact proposed replacement:** `| Git Actions (Commit, Push, Merge, Branch Switch) | **STRICTLY PROHIBITED** | No Git commit, push, merge, or branch-switch evidence is claimed for this documentation review. `F:\hrms` has no root `.git` metadata, so root Git history and a root working-tree state were not independently verified. This report separately records historical documentation filesystem edits; it does not describe them as Git working-tree evidence. | **LIMITED — NOT INDEPENDENTLY VERIFIED** |`
- **Reason:** Separates Git facts from filesystem edits and accurately records the absence of repository metadata.
- **Supporting evidence:** Acceptance Report lines 42, 45, 46, and 51; Completion Report lines 50–54; Final Remediation Audit Report lines 232–233 and 279–284.
- **Effect:** Audit traceability and acceptance evidence.
- **Dependencies / questions:** Owner approval. Preserve any historical unauthorized-edit classification; do not retrospectively authorize it.

### A-04 — Correct the five-document physical inventory row

- **Target / version / location:** Final Acceptance Verification Report, v2.8.0, line 66.
- **Existing text (verbatim):** `| 5 | \`docs/PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md\` | \`F:\hrms\docs\PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md\` | **v2.8.0** | Current Rebuilt File | — | Authorized Verification Document | Opened & Verified | Updated to v2.8.0 |`
- **Defect:** It omits the report’s actual physical line count and byte size while claiming an “Actual Five-Document Inventory.” Current direct inspection shows 287 lines and 44,320 bytes; those values must be recalculated at the time of any authorized edit.
- **Exact proposed replacement:** `| 5 | \`docs/PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md\` | \`F:\hrms\docs\PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md\` | **v2.8.0** | 287 lines | 44,320 B | Acceptance Verification Document | Opened & Verified | Current file metadata recorded; this row is not proof of a complete self-inventory. |`
- **Reason:** Makes the physical inventory internally complete without claiming a new audit.
- **Supporting evidence:** Acceptance Report lines 56–66; current pre-inspection metadata in section 2.1 of this plan; Final Remediation Audit Report lines 23–29.
- **Effect:** Audit traceability and inventory accuracy.
- **Dependencies / questions:** Recalculate this row after any future authorized edit because lines/bytes will change.

### A-05 — Replace the claimed exhaustive four-document occurrence conclusion with its actual limitation

- **Target / version / location:** Final Acceptance Verification Report, v2.8.0, replace lines 204–221.
- **Existing text (verbatim):** The section says the inventory is exhaustive “across the four external documents,” presents 78 found/classified occurrences as “VERIFIED,” lists only the four external documents, and concludes “**100% Accounted For & Classified**.”
- **Defect:** The report elsewhere calls itself a five-document verification report, but the occurrence accounting omits the Acceptance Verification Report itself. The 78 entries may describe the four external documents only; they cannot establish a five-document exhaustive inventory.
- **Exact proposed replacement:**

```markdown
### 4.1 Occurrence Accounting Scope and Limitation

The current occurrence table contains 78 cataloged metric occurrences from four external documents only. It does not inventory this Acceptance Verification Report as a fifth source document. Accordingly, the table supports only this limited statement: 78 external-document entries were recorded in the existing table. It does **not** establish an exhaustive five-document occurrence inventory, a complete unique occurrence count across all five documents, or 100% harmonization of the five-document set.

### 4.2 Distribution of Existing External-Document Entries

| Document Name | Actual Version | Physical Line Count | Existing Cataloged Metric Occurrences | Scope qualification |
|---|:---:|:---:|:---:|---|
| `PHASE_0_FINAL_DECISION_REGISTER.md` | v2.7.1 | 489 lines | 16 | Existing external-document entries only |
| `PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md` | v2.7.1 | 306 lines | 7 | Existing external-document entries only |
| `PHASE_0_2_8_COMPLETION_REPORT.md` | v1.4.0 | 360 lines | 32 | Existing external-document entries only |
| `PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md` | v1.3.0 | 220 lines | 23 | Existing external-document entries only |
| **Total in existing external-document table** | — | — | **78** | **Not a complete five-document inventory** |

No additional occurrence ID or total is assigned by this correction. A complete five-document, search-first taxonomy inventory requires separate authorization and independently reviewable evidence.
```

- **Reason:** Explicitly retains what the present table actually contains and avoids inventing a fifth-document count.
- **Supporting evidence:** Acceptance Report lines 119–221; Final Remediation Audit Report lines 226 and 234, plus lines 279–282.
- **Effect:** Audit traceability and acceptance evidence.
- **Dependencies / questions:** A full five-document inventory is unresolved and requires separate owner authorization; do not infer OCC-079 or another count.

### A-06 — Recast the DEF-01 finding as documentation-level only while retaining historical linear evidence

- **Target / version / location:** Final Acceptance Verification Report, v2.8.0, replace lines 99–115.
- **Existing text (verbatim):** The section labels “Cloudinary Upload Intent Lifecycle Harmonization (DEF-01 Resolution),” quotes the historical linear lifecycle at lines 111–112, says both documents “now consistently enforce” the partitioned design at line 114, and gives the verdict `**PASS** (Defect DEF-01 resolved; 100% consistent across all documents).`
- **Defect / ambiguity:** The historical linear wording must remain as defect evidence, but PASS/“resolved”/“100%” conflates the selected design and documentation wording with code/runtime proof.
- **Exact proposed replacement:**

```markdown
### 3.4 Defect D: Cloudinary Upload Intent Lifecycle — Historical Defect Evidence and Selected Design Direction
- **Historical evidence retained:** Earlier linear wording, `pending -> uploading -> committed -> cleanup_claimed -> cleaned`, is preserved as the documented defect history because it could be read to permit committed attendance media to enter cleanup. It is not the current governing lifecycle instruction.
- **Owner-selected design direction:** On 2026-11-14, the project owner selected **OPTION A — PARTITIONED TWO-PATH CLOUDINARY UPLOAD LIFECYCLE**. The selected policy requires committed attendance media to be terminal and protected from abandoned-upload cleanup; permits cleanup consideration only for abandoned or uncommitted candidates; requires reference and ownership checks before deletion; and prohibits deletion of a committed attendance photo by abandoned-upload cleanup.
- **Documentation-level finding:** The current Completion and Reconciliation Reports contain wording consistent with that selected design direction.
- **Verification limitation:** This review does not establish that the application implements the design, that database transactions guarantee atomic commitment, that cleanup races are eliminated, or that retry/idempotency behavior has passed testing.
- **Verdict:** **DOCUMENTATION-LEVEL POLICY ALIGNMENT RECORDED; TECHNICAL IMPLEMENTATION AND RUNTIME SAFETY NOT VERIFIED.**
```

- **Reason:** Meets the owner decision without erasing historical audit evidence or asserting technical proof.
- **Supporting evidence:** Owner Decision Record lines 17–24, 38–43, and 50–72; Acceptance Report lines 99–115; Final Remediation Audit Report lines 247–254 and 260–266.
- **Effect:** Historical claims, lifecycle terminology, and acceptance status.
- **Dependencies / questions:** Owner approval. The historical linear excerpts must not be silently removed from preserved audit artifacts.

### A-07 — Replace the defect-status table’s overstatement

- **Target / version / location:** Final Acceptance Verification Report, v2.8.0, replace lines 262–271.
- **Existing text (verbatim):** The section says `All previously identified documentation defects have been resolved`, records DEF-01 as `**RESOLVED (PASS)**`, and states `**Active Defect Count:** **0** (Zero active defects remain across all documents).`
- **Defect / ambiguity:** DEF-01’s wording conflict is superseded by the owner policy decision, but technical implementation, runtime safety, inventory completeness, and audit integrity/reproducibility findings remain unresolved. A zero-defect claim is unsupported.
- **Exact proposed replacement:**

```markdown
## 7. Status of Previously Disclosed Defects and Evidence Limitations

| Defect / finding | Target / evidence | Current evidence-based status |
|---|---|---|
| **DEF-01** | Historical linear lifecycle wording in the Completion/Reconciliation record | **OWNER-SELECTED DESIGN DIRECTION RECORDED.** The partitioned two-path lifecycle is the current policy and documentation direction. Implementation, ownership enforcement, cleanup-race safety, transaction behavior, and retry/idempotency remain **NOT VERIFIED**. |
| **DEF-02** | Formatting of the Formal Production SLAs entry | Formatting may be described as corrected only to the extent shown by the current saved file; this does not establish a defect-free five-document or runtime result. |
| **Occurrence inventory** | Existing 78-entry table | **INCOMPLETE FOR FIVE-DOCUMENT CLAIMS.** The existing table covers four external documents; the fifth-document taxonomy/count remains unresolved. |
| **Audit integrity / reproducibility** | Preserved unmutated and later mutated audit outputs | **UNRESOLVED.** Historical evidence must remain preserved; the current rewritten audit is not independent acceptance evidence. |

No zero-active-defect count is claimed. Phase 0.2.8 remains **OPEN / NOT ACCEPTED** pending owner review and any separately authorized corrective work.
```

- **Reason:** Distinguishes correction of terminology/policy selection from unresolved technical and assurance findings.
- **Supporting evidence:** Owner Decision Record lines 24 and 40–43; Final Remediation Audit Report lines 226, 234–254, 279–286, and 290–292.
- **Effect:** Historical claims, audit traceability, and acceptance status.
- **Dependencies / questions:** Owner approval. No independent audit may be declared completed by this correction.

### A-08 — Replace the final acceptance verdict

- **Target / version / location:** Final Acceptance Verification Report, v2.8.0, replace lines 275–287.
- **Existing text (verbatim):** The section title says `Truthful Audit Verdict: 100% HARMONIZED — READY FOR OWNER ACCEPTANCE`; line 282 says `Defect DEF-01 is completely resolved`; line 283 says the phase is `100% COMPLETE AND DEFECT-FREE` and ready for acceptance.
- **Defect / ambiguity:** These statements conflict with OPEN / NOT ACCEPTED, the incomplete fifth-document occurrence inventory, audit-integrity limitations, and the fact that Option A is a selected design direction rather than technical proof.
- **Exact proposed replacement:**

```markdown
## 8. Current Evidence-Based Status

### 8.1 Documentation and Acceptance Boundary
Based on the current saved documentation, the project owner selected the partitioned two-path Cloudinary lifecycle on 2026-11-14. That decision establishes the governing design direction and supports correction of current lifecycle terminology. It does not establish implementation, verified database transaction behavior, cleanup-race elimination, retry/idempotency safety, or runtime safety.

The existing 78-entry occurrence table is limited to four external documents and does not demonstrate a complete five-document inventory. Historical audit-integrity and reproducibility findings remain preserved and unresolved. Accordingly, this report does not declare PASS, 100% harmonization, complete resolution, defect-free status, acceptance readiness, or phase acceptance.

### 8.2 Mandatory Stopping Statement

> **Phase 0.2.8 remains OPEN / NOT ACCEPTED. No application code, database, dependencies, Cloudinary assets, infrastructure, or Git state is changed by this documentation correction. No technical implementation or independent audit is authorized by this report. The partitioned Cloudinary lifecycle is recorded as the project owner’s selected design direction, not as proof of implementation or runtime safety. STOP and await explicit project-owner authorization.**
```

- **Reason:** Provides a status conclusion that is supportable by the present evidence and owner authority.
- **Supporting evidence:** Owner Decision Record lines 11–13, 17–24, and 76–83; Final Remediation Audit Report lines 243–254 and 288–292.
- **Effect:** Acceptance status, audit traceability, and lifecycle terminology.
- **Dependencies / questions:** Owner approval. Any fresh independent audit requires separately scoped authorization.

## 7. File-by-file change matrix

| Target report | Finding | Proposed change | Exact location | Evidence | Owner approval required |
|---|---|---|---|---|---|
| Completion Report | C-01 version contradiction | Correct v1.3.0 self-reference to v1.4.0 | Line 74 | Completion lines 5, 21, 74; Remediation lines 230–233 | Yes |
| Completion Report | C-02 lifecycle policy/implementation conflation | Replace primary lifecycle block with owner decision and explicit verification boundary | Lines 135–143 | Owner Decision 15–24, 44–72; Decision Register 249–324 | Yes |
| Completion Report | C-03 repeated operational overstatement | Replace addendum lifecycle block with design-direction wording | Lines 345–349 | Owner Decision 17–24, 50–72; Decision Register 320–324 | Yes |
| Completion Report | C-04 overbroad readiness language | Replace final recommendation claim with OPEN / NOT ACCEPTED evidence boundary | Line 303 | Owner Decision 11–13, 42–43; Remediation 15–19, 243–254 | Yes |
| Reconciliation Report | R-01 unqualified history claim | Qualify v1.3.0 history entry as documentation harmonization | Line 20 | Reconciliation 20; Owner Decision 17–24, 40–43 | Yes |
| Reconciliation Report | R-02 lifecycle history/design conflation | Preserve linear wording as historical evidence; state selected design and non-verification | Lines 98–116 | Reconciliation 98–116; Owner Decision 17–24, 38–43 | Yes |
| Reconciliation Report | R-03 100% agreement claim | Replace with documentation-level agreement and inventory limitation | Lines 159–175 | Owner Decision 28–43; Remediation 226, 232–241 | Yes |
| Reconciliation Report | R-04 scoped zero-modification statement | **NO CHANGE** | Lines 205–219 | Reconciliation 205–219; Remediation 232–233 | No |
| Acceptance Report | A-01 self-acceptance header | Replace defect-free/ready statement with current governance status | Line 7 | Owner Decision 11–13, 17–24; Remediation 15–19 | Yes |
| Acceptance Report | A-02 resolved-all wording | Replace section 1.1 with OPEN / NOT ACCEPTED qualification | Lines 34–36 | Owner Decision 11–13, 42–43; Remediation 226, 234–239 | Yes |
| Acceptance Report | A-03 Git/working-tree contradiction | Replace line with Git/filesystem distinction and root-repository limitation | Line 51 | Acceptance 42, 45–46, 51; Remediation 232–233, 279–284 | Yes |
| Acceptance Report | A-04 missing own physical metadata | Replace fifth inventory row with observed metadata and limitation | Line 66 | Acceptance 56–66; plan §2.1; Remediation 23–29 | Yes |
| Acceptance Report | A-05 fifth-document occurrence omission | Replace 78-entry conclusion with four-external-document limitation | Lines 204–221 | Acceptance 119–221; Remediation 226, 234, 279–282 | Yes |
| Acceptance Report | A-06 DEF-01 PASS/100% claim | Replace lifecycle finding with documentation-level verdict | Lines 99–115 | Owner Decision 17–24, 38–43; Remediation 247–254, 260–266 | Yes |
| Acceptance Report | A-07 zero active defect claim | Replace status section with outstanding-evidence table | Lines 262–271 | Owner Decision 24, 40–43; Remediation 226, 234–254 | Yes |
| Acceptance Report | A-08 ready-for-acceptance verdict | Replace final verdict with OPEN / NOT ACCEPTED stopping statement | Lines 275–287 | Owner Decision 11–13, 76–83; Remediation 243–254, 288–292 | Yes |

## 8. Historical evidence preservation requirements

1. Preserve the original independent audit result, later mutated audit output, recovered script, manifest, transcript, and historical document copies without overwriting, deleting, normalizing, or retrospectively authorizing them.
2. Do not describe historical unauthorized documentation edits as owner-authorized. The Final Remediation Audit Report lines 247–254 records that the later audit output was rewritten and is not independent acceptance evidence.
3. Preserve the earlier linear lifecycle wording wherever it is historical defect evidence. Label it as historical “before” wording; do not present it as the current governing design.
4. Preserve the owner decision as a policy-selection record. Do not recast it as evidence that code, transactions, cleanup, retries, or concurrency controls were verified.
5. Any future independent audit must use separately authorized inputs and output, before/after hashes, reproducible command records, raw results, timestamps, tool versions, and independent review. This plan does not resolve audit-integrity or reproducibility findings.

## 9. Unresolved questions and limitations

1. No implementation inspection or runtime testing was authorized here; the code’s enforcement of Option A is not established.
2. Atomicity of attendance/intent commitment, cleanup ownership enforcement, reference-check completeness and timing, race prevention, retries, and idempotency are not established.
3. The exact complete occurrence taxonomy/count for the Acceptance Verification Report itself, and therefore all five documents, is not established. No count or new OCC identifier is inferred.
4. `F:\hrms` has no root Git metadata. Git history and root working-tree state cannot independently corroborate documentation history.
5. The Acceptance Report's current direct physical metadata is 287 lines and 44,320 bytes. Any authorized edit must recalculate its own physical metadata after changes; this plan does not infer post-edit values.
6. The document versions after an approved correction are owner decisions. This plan does not prescribe version increments or modify version history without authorization.

## 10. Final owner-review checklist

- [ ] Approve or reject each matrix item individually; do not bundle unrelated changes.
- [ ] Confirm whether history-table qualification should replace the historical row or be added as a correction-note row.
- [ ] Approve the exact text that records Option A as an owner-selected design direction only.
- [ ] Confirm that historical linear lifecycle passages remain preserved as defect history.
- [ ] Confirm no text will claim code enforcement, atomic transactions, eliminated cleanup races, or tested retries/idempotency without a separate technical validation.
- [ ] Confirm the Acceptance Report will remain OPEN / NOT ACCEPTED and will not claim PASS, 100%, defect-free, or acceptance readiness beyond evidence.
- [ ] If a complete five-document occurrence inventory is desired, issue a separate authorization defining scope, counting taxonomy, evidence capture, and review process.
- [ ] If implementation or a new independent audit is desired, issue separate written authorizations; neither is authorized by this plan.

## 11. Completion boundary

No existing report was changed while preparing this plan. This file is the only new file created for Task `P028-THREE-REPORT-CORRECTION-PLAN-01`.

**This task produced a read-only correction plan for project-owner review. No existing governing document was edited, no technical implementation was performed, and no independent audit was executed. The project owner's partitioned Cloudinary lifecycle decision is recorded as the selected design direction, not as proof of implementation or runtime safety. No correction implementation or phase acceptance is authorized by this task. Phase 0.2.8 remains OPEN / NOT ACCEPTED. STOP and await explicit project-owner authorization.**
