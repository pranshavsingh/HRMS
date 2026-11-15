# P028 Three-Report Correction Plan v1.2

## 1. Document control, purpose, and authorization

**Task:** `P028-THREE-REPORT-CORRECTION-PLAN-REFINEMENT-02`  
**Calculated:** 2026-11-14T21:07:51.2816935+05:30  
**Status:** Phase 0.2.8 is **OPEN / NOT ACCEPTED**.

This is a planning artifact only. It creates no authorization to edit reports, implement code, execute an audit, or accept the phase. A separate explicit project-owner authorization is required before any report correction; a separate owner acceptance decision is required to close Phase 0.2.8.

## 2. Sources and direct metadata

| File | Bytes | Lines | SHA-256 |
|---|---:|---:|---|
| `F:\hrms\evidence_preservation_P028_20261114_182132\P028_THREE_REPORT_CORRECTION_PLAN.md` (v1.0) | 49,776 | 446 | `59F91568438339FC7C63832014628BF36AA74BD61588C529DDF9075E73125242` |
| `F:\hrms\evidence_preservation_P028_20261114_182132\P028_THREE_REPORT_CORRECTION_PLAN_v1.1.md` | 45,806 | 531 | `3E7DD2E58B037BA3B3C796CFE49E0B81E1198A8ADA553D8584EADC76A8C0323F` |
| `F:\hrms\docs\PHASE_0_2_8_COMPLETION_REPORT.md` (v1.4.0) | 35,489 | 360 | `024BE8EB7C1AAD735F03312014A868514EBC5A68B7C93D455F88C779AD42565A` |
| `F:\hrms\docs\PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md` (v1.3.0) | 17,983 | 220 | `75C89810EF1AC4CAAB9A2C3C44A71E6914433DFF3640827FF13573AA80460D9E` |
| `F:\hrms\docs\PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md` (v2.8.0) | 44,320 | 287 | `A67FFA8D135A418AC1DE1291F4927F869DCF09FD4BCF8C2D5C6FD1EB87EF849E` |
| `F:\hrms\evidence_preservation_P028_20261114_182132\P028_CLOUDINARY_LIFECYCLE_OWNER_DECISION_RECORD.md` | 14,191 | 107 | `91A986BDF846975DF13B464091A372AC1F4D9BE965A4E8688771DA16704F9291` |
| `F:\hrms\docs\PHASE_0_2_8_FINAL_REMEDIATION_AUDIT_REPORT.md` | 105,943 | 292 | `763597026C835294CCD692DC10C102560BD37F96249BB50223056BABF013C20E` |

The current v1.0 hash matches its supplied uploaded-copy reference. The current v1.1 hash does **not** match supplied uploaded-copy reference `2563e5c17b191fd3703652777f99c02f6641c861b7c78af73edd71fef719f57f`. This is recorded as a discrepancy only; this task makes no tampering inference and does not alter v1.1.

## 3. Owner policy and status distinctions

The Owner Decision Record, lines 15–24, records **Option A — Partitioned Two-Path Cloudinary Upload Lifecycle**. Policy: committed attendance media is terminal and protected from abandoned-upload cleanup; only abandoned/uncommitted candidates may enter cleanup; reference and ownership checks are required before deletion; cleanup must not delete a committed attendance photo.

**Proposed technical design** includes intent states, transaction sequence, claims/leases/fencing/heartbeats, reference checks and recovery. **Implemented behavior** is not established here. **Independently verified runtime behavior** is not established here. The two-hour age threshold is only a provisional screening/filter condition. Age alone is never sufficient evidence that an upload is abandoned, and age alone never authorizes deletion. A candidate requires independently validated uncommitted-state evidence and appropriate worker/ownership/lease or fencing checks plus reference and ownership checks; ambiguity excludes it from automatic deletion and sends it to manual/inconclusive review.

## 4. Complete 16-entry matrix

| ID | Target/location | Verbatim current text captured below? | Treatment | Evidence | Owner approval |
|---|---|---|---|---|---|
| C-01 | Completion 74 | Yes | Correct self-version | Completion 5,21,74; Remediation 230–233 | Yes |
| C-02 | Completion 135–143 | Yes | Revise, retain detailed proposed design | Owner Record 15–24,44–72; Decision Register 249–324 | Yes |
| C-03 | Completion 345–349 | Yes | Revise, retain detailed proposed design | Owner Record 15–24; Decision Register 256–324 | Yes |
| C-04 | Completion 301–306 | Yes | Revise readiness wording | Owner Record 11–24; Remediation 243–254 | Yes |
| R-01 | Reconciliation 20 | Yes | Add clarification after; retain history | Owner Record 15–24 | Yes |
| R-02 | Reconciliation 98–116 | Yes | Revise after-text; preserve history | Owner Record 15–24; Decision Register 249–324 | Yes |
| R-03 | Reconciliation 159–175 | Yes | Complete replacement section | Remediation 17,61–65,226,281 | Yes |
| R-04 | Reconciliation 205–219 | Yes | **NO CHANGE** | Remediation 232–233 | No |
| A-01 | Acceptance 7 | Yes | Revise | Owner Record 11–24 | Yes |
| A-02 | Acceptance 34–36 | Yes | Revise | Owner Record 11–24; Remediation 226 | Yes |
| A-03 | Acceptance 51 | Yes | Revise | Acceptance 42,45–46,51; Remediation 232–233 | Yes |
| A-04 | Acceptance 60–66 | Yes | Revise row 5 | direct metadata | Yes |
| A-05 | Acceptance 204–221 | Yes | Revise OCC scope | Remediation 61–65,226,234,281 | Yes |
| A-06 | Acceptance 99–115 | Yes | Revise verdict, retain history | Owner Record 15–24; Remediation 247–254 | Yes |
| A-07 | Acceptance 262–271 | Yes | Revise | Remediation 226,234–254 | Yes |
| A-08 | Acceptance 275–287 | Yes | Revise | Owner Record 11–24; Remediation 288–292 | Yes |

## 5. Detailed corrections — Completion Report

### C-01

**Current, verbatim (line 74):** `3. \`docs/PHASE_0_2_8_COMPLETION_REPORT.md\` — Updated to **Version 1.3.0** (this document).`  
**Replacement:** `3. \`docs/PHASE_0_2_8_COMPLETION_REPORT.md\` — Updated to **Version 1.4.0** (this document).`  
This corrects the current self-reference; history is not changed.

### C-02

**Current, verbatim (lines 135–143):**

```markdown
To ensure safety across crash and recovery scenarios, a comprehensive state machine was specified for future implementation:
* **Intent States (Partitioned Lifecycle — Superseding Linear Diagram):** As reconciled in Section 10.2 Addendum, the older linear sequence is superseded. The lifecycle is partitioned into two mutually exclusive paths:
  - **Successful Attendance Path:** `pending` $\rightarrow$ `uploading` $\rightarrow$ `committed` (terminal for cleanup, permanently excluded from deletion).
  - **Abandoned / Failed Upload Path (Uncommitted Candidates Only):** `pending` or `failed` $> 2\text{h}$ $\rightarrow$ `cleanup_claimed` $\rightarrow$ `cleaned` (or manual review).
* **Worker Lease Ownership:** Reconciliation workers claim intents via `cleanup_claimed` using unique worker UUIDs and lease timeouts.
* **Heartbeat & Fencing:** Long-running recovery workers maintain heartbeat timestamps to prevent zombie workers from acting after lease expiration.
* **Pre-Deletion Reference Check:** The corrected SQL reference check must execute immediately prior to calling `cloudinary.uploader.destroy(publicId)`.
* **Absolute Deletion Safety Rule:** An asset must **NEVER** be deleted when a committed database record references it. If the reconciliation worker cannot conclusively prove an asset is an unreferenced orphan, it must **NOT** delete the file. The record is flagged for manual review. Legitimate attendance evidence must never be sacrificed for automated cleanup.
* **Status:** Marked as a proposed design requiring implementation and testing (**NEEDS TECHNICAL VALIDATION**). Zero Cloudinary operations were performed.
```

**Complete replacement:**

```markdown
The project owner selected **OPTION A — PARTITIONED TWO-PATH CLOUDINARY UPLOAD LIFECYCLE** on 2026-11-14. This is owner-approved policy, not proof of implemented behavior or independently verified runtime safety.
* **Proposed Technical Design — Intent States:** `pending` $\rightarrow$ `uploading` $\rightarrow$ `committed` is the successful path; a successfully committed attendance-media intent is terminal for abandoned-upload cleanup. The abandoned/failed path is limited to uncommitted `pending` or `failed` candidates and may progress to `cleanup_claimed`, then `cleaned` or manual/inconclusive review.
* **Provisional Age Filter:** The two-hour age threshold is only a provisional screening/filter condition. Age alone is never sufficient evidence that an upload is abandoned, and age alone never authorizes deletion.
* **Proposed Eligibility and Lease Controls:** Before cleanup consideration, independently validate uncommitted state and worker/ownership/lease or fencing authority. Claiming uses `cleanup_claimed`, worker UUID, and lease timeout; heartbeat and fencing are proposed recovery controls for expiry/zombie-worker handling.
* **Proposed Reference and Ownership Controls:** Immediately before any `cloudinary.uploader.destroy(publicId)`, validate ownership/lease and execute the corrected reference check. A committed reference, active reference, inconclusive state, ambiguous eligibility, or unresolved ownership/lease evidence excludes the candidate from automatic deletion and requires preservation/manual review.
* **Policy Safety Rule:** Abandoned-upload cleanup must not delete a committed attendance photo.
* **Verification Status:** Transaction boundaries, state-transition guards, reference coverage, fencing, retries, idempotency, race prevention, implementation, and runtime/concurrency safety remain proposed/unverified and require separate authorization and validation. Zero Cloudinary operations were performed.
```

### C-03

**Current, verbatim (lines 345–349):**

```markdown
### 2. Cloudinary Upload Intent Separate Lifecycles (Correction B)
The upload intent lifecycle is formally partitioned into two mutually exclusive paths to ensure committed attendance photos can never enter an orphan-deletion workflow:
- **Successful Attendance Path:** `uploadToken` + deterministic `publicId` $\rightarrow$ intent inserted as `'pending'` $\rightarrow$ upload outside DB tx $\rightarrow$ DB tx locks parent user, inserts attendance, and marks intent `'committed'` $\rightarrow$ DB tx commits. A committed intent is terminal for cleanup and is **NEVER** selected for deletion.
- **Abandoned / Failed Upload Path (Uncommitted Candidates Only):** Intents in `'pending'` or `'failed'` older than the provisional 2-hour threshold are claimed with a worker lease token (`cleanup_claimed`, `worker_id`, `lease_expires_at`). The worker rechecks database references across verified columns (`attendance_attendance.punch_in_photo`, `attendance_attendance.punch_out_photo`, and `accounts_employeedocument.file`). If referenced, the intent is updated to `'committed'`; if inconclusive, the asset is preserved for manual review; if conclusively unreferenced, `cloudinary.uploader.destroy(publicId)` is called and intent is marked `'cleaned'`.
- **Absolute Deletion Safety Rule:** Committed records and active references are **NEVER** deleted.
```

**Complete replacement:**

```markdown
### 2. Cloudinary Upload Intent Separate Lifecycles (Owner-Approved Policy; Proposed Technical Design)
Option A — Partitioned Two-Path Cloudinary Upload Lifecycle is the owner-approved policy. The following sequence is proposed design, not verified implementation or runtime safety.
- **Successful Attendance Path:** `uploadToken` + deterministic `publicId` $\rightarrow$ intent `'pending'` $\rightarrow$ upload outside the proposed database transaction $\rightarrow$ proposed parent-user lock, attendance insert, intent `'committed'`, and transaction commit. A successfully committed attendance-media intent is terminal for abandoned-upload cleanup.
- **Abandoned / Failed Path:** Only independently validated uncommitted `'pending'` or `'failed'` candidates may be considered. The provisional two-hour age threshold is only a screening/filter condition; age alone is never sufficient abandonment evidence and never authorizes deletion. Proposed claim fields are `cleanup_claimed`, `worker_id`, and `lease_expires_at`; ownership/worker/lease or fencing validity must be established.
- **Proposed Safeguards:** Recheck references immediately before deletion across `attendance_attendance.punch_in_photo`, `attendance_attendance.punch_out_photo`, and `accounts_employeedocument.file`; preserve/reconcile references; preserve and send ambiguous, inconclusive, or ownership/lease-unverified candidates to manual review; only a conclusively unreferenced eligible candidate may be submitted to `cloudinary.uploader.destroy(publicId)` and marked `'cleaned'`.
- **Policy Rule and Limit:** Abandoned-upload cleanup must not delete a committed attendance photo. Transaction atomicity, race prevention, retries, idempotency, implementation, and runtime behavior are not established by this report.
```

### C-04

**Current, verbatim (lines 301–306):**

```markdown
## 9. Final Acceptance Recommendation

The Phase 0.2.8 planning baseline is **fully reconciled, qualified, and mathematically verified**. All theoretical overstatements regarding distributed locking have been removed, schema references reflect verified empirical code, shift-boundary policy choices are cleanly separated from SQL logic, load testing targets are reconciled, and implementation dependencies are rigorously governed.

### Recommended Next Steps for Project Owner
1. **ACCEPT Phase 0.2.8 Planning Baseline:** Formally adopt `PHASE_0_FINAL_DECISION_REGISTER.md` (v2.7.1) and `PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md` (v2.7.1) as the qualified technical standard.
```

**Replacement:**

```markdown
## 9. Project-Owner Review Status

This report records documentation findings and proposed technical design. The owner-selected lifecycle policy does not establish implementation, runtime safety, independent audit reproducibility, or phase acceptance.

### Required Project-Owner Review
1. Review planning documents and decide whether to authorize separately scoped documentation correction, implementation, validation, or audit work.
```

## 6. Detailed corrections — Reconciliation Report

### R-01 — historical chronology

**Current, verbatim (line 20):**

```markdown
| **1.3.0** | Nov 14, 2026 | Antigravity Senior Architect | Final Defect Closure & Harmonization: Synchronized cross-document references with Completion Report v1.4.0 (DEF-01 resolution); confirmed complete cross-document harmonization across all 5 planning documents. |
```

**Complete replacement passage (retain the row, then add the dated clarification):**

```markdown
| **1.3.0** | Nov 14, 2026 | Antigravity Senior Architect | Final Defect Closure & Harmonization: Synchronized cross-document references with Completion Report v1.4.0 (DEF-01 resolution); confirmed complete cross-document harmonization across all 5 planning documents. |
| **Correction note — 2026-11-14** | Nov 14, 2026 | Project-owner review clarification | The historical v1.3.0 entry is preserved as the claim recorded in that revision. Option A — Partitioned Two-Path Cloudinary Upload Lifecycle was separately selected by the project owner on 2026-11-14. Available records do not establish sequencing between same-date records. The separate policy selection does not prove implementation, runtime safety, or complete independent five-document verification. |
```

### R-02

**Current, verbatim (lines 98–116):**

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

**Complete replacement:**

```markdown
### Inconsistency 2: Cloudinary Upload Intent State Machine & Deletion Safety (Historical Defect; Separately Selected Policy)
* **Historical evidence:** Linear state diagram `pending -> uploading -> committed -> cleanup_claimed -> cleaned` and the former single-pipeline wording are preserved as historical defect evidence. They are not the current governing lifecycle instruction.
* **Owner-approved policy:** Option A — Partitioned Two-Path Cloudinary Upload Lifecycle was separately selected on 2026-11-14. Committed attendance media is terminal/protected; only abandoned or uncommitted candidates may enter cleanup; reference and ownership checks are required; cleanup must not delete a committed attendance photo.
* **Proposed technical design:** Successful path is `pending` $\rightarrow$ upload outside proposed DB transaction $\rightarrow$ parent-user lock, attendance association, `committed`, commit. Abandoned/failed path considers only independently validated uncommitted `pending`/`failed` candidates; the $2\text{h}$ threshold is a provisional filter only, never abandonment proof or deletion authority. Proposed lease/claim fields are `cleanup_claimed`, `worker_id`, `lease_expires_at`; worker ownership/lease/fencing and references must be validated. Use the quoted attendance/document reference query immediately before deletion.
* **Ambiguity rule:** Uncertain state, candidate eligibility, ownership, lease/fencing, or reference result requires preservation and manual/inconclusive review, not automatic deletion.
* **Verification limit:** This is policy plus proposed design. It does not prove code implementation, atomic transactions, race prevention, retries, idempotency, or runtime safety.
```

### R-03 — complete replacement section

**Current, verbatim (lines 159–175):**

```markdown
## 4. Confirmation of Cross-Document Agreement

Following these updates, all governing planning documents are 100% harmonized:

1. **`docs/PHASE_0_FINAL_DECISION_REGISTER.md` (v2.7.1):**
   - Contains reconciled Section 3.2 (Redis/MariaDB responsibilities), Section 3.3 (Shift overlap & POD-06 options), Section 3.4 (Cloudinary separate paths & schema), Section 3.5 (Performance metrics table), and Section 3.6 (PM2 sizing).
   - Preserves approved rules BR-01..BR-04, POD-01, and POD-04 (Administrator regularization strictly required).
   - Tracks pending decisions POD-02, POD-03, POD-05, and POD-06.
2. **`docs/PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md` (v2.7.1):**
   - Reflects the exact same phase boundaries, schema entities, concurrency protections, upload lifecycle separation, performance classifications, and worker sizing invariants.
   - Embeds the Implementation Dependency Governance Matrix.
3. **`docs/PHASE_0_2_8_COMPLETION_REPORT.md` (v1.4.0):**
   - Preserves sections 1–9 and appends Section 10 Reconciliation Addendum harmonizing all five corrections, with PM2 worker memory `< 800 MB RSS per worker` and event-loop lag `P99 < 50 ms`, and resolves DEF-01 in Section 3.2.
4. **`docs/PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md` (v1.3.0):**
   - Serves as the definitive cross-document reconciliation record.
5. **`docs/PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md` (v2.8.0):**
   - Provides exhaustive metric-by-metric cross-verification across all five documents.
```

**Complete replacement:**

```markdown
## 4. Current Documentation Comparison and Evidence Boundaries

This comparison records current saved-document terminology. It does not establish complete five-document inventory, independent-audit reproducibility, implementation, runtime safety, or phase acceptance.

1. **`docs/PHASE_0_FINAL_DECISION_REGISTER.md` (v2.7.1; 489 lines):** Documents the partitioned Cloudinary lifecycle and proposed state/lease/reference controls at Section 3.4; it labels implementation/staging validation needs.
2. **`docs/PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md` (v2.7.1; 306 lines):** Treats Cloudinary recovery and related controls as implementation/testing work, not completed runtime behavior.
3. **`docs/PHASE_0_2_8_COMPLETION_REPORT.md` (v1.4.0; 360 lines):** Uses partitioned-lifecycle terminology; any DEF-01 result is limited to documentation wording and the separately selected owner policy.
4. **`docs/PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md` (v1.3.0; 220 lines):** Preserves historical linear-lifecycle defect wording and compares current documentation; it is not independent evidence of implementation.
5. **`docs/PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md` (v2.8.0; 287 lines):** Contains an existing OCC-001–OCC-078 table attributed to four external documents; it is not a complete fifth-document inventory.

**Related evidence, not a sixth governing report:** `P028_CLOUDINARY_LIFECYCLE_OWNER_DECISION_RECORD.md` records the separately selected policy; `PHASE_0_2_8_FINAL_REMEDIATION_AUDIT_REPORT.md` records audit-integrity, OCC-scope, and acceptance-readiness limitations; P028 correction plans and preservation artifacts are planning/preservation evidence only. None independently verifies implementation or runtime safety.
```

### R-04 — NO CHANGE

**Current, verbatim (lines 205–213):**

```markdown
I explicitly confirm that across this final reconciliation:
- **NO** application code in `node_backend/`, `hrms_saas/`, or `hrms_mobile/` was modified.
- **NO** database migrations, DDL, or DML were executed against MariaDB.
- **NO** npm packages or dependencies were installed, updated, or removed.
- **NO** Redis, Cloudinary, or VPS infrastructure services were modified or accessed.
- **NO** PM2, Nginx, or system processes were restarted or reconfigured.
- **NO** implementation phase (Phase 0.3, Phase 1, etc.) was initiated.
```

This is scoped to code/infrastructure and does not make the Acceptance Report’s Git/working-tree claim.

## 7. Detailed corrections — Acceptance Verification Report

### A-01

**Current (line 7):** `**Governance Decision:** All 5 documents fully harmonized; Phase 0.2.8 is defect-free and ready for project-owner acceptance sign-off`  
**Replacement:** `**Governance Status:** Option A is owner-selected policy direction. Phase 0.2.8 remains OPEN / NOT ACCEPTED; documentation does not prove implementation, runtime safety, audit reproducibility, or acceptance readiness.`

### A-02

**Current, verbatim (lines 34–36):**

```markdown
### 1.1 Governance Status: Fully Harmonized & Ready for Owner Acceptance
In accordance with the project owner's governing instructions, Phase 0.2.8 is conducted as a documentation-correction, defect-closure, and evidence-verification task:
> **Phase 0.2.8 remains OPEN and NOT ACCEPTED pending explicit project-owner sign-off.** This task has resolved all identified documentation defects and achieved genuine cross-document consistency. It does not authorize implementation, source-code changes, database changes, infrastructure changes, or progression to another phase.
```

**Replacement:**

```markdown
### 1.1 Governance Status: OPEN / NOT ACCEPTED
Phase 0.2.8 is a documentation-correction and evidence-review activity.
> **Phase 0.2.8 remains OPEN / NOT ACCEPTED pending explicit project-owner acceptance.** Owner-selected policy and current wording do not establish a complete five-document inventory, independent audit reproducibility, implementation, or runtime/concurrency safety. No implementation or phase-progression work is authorized.
```

### A-03

**Current (line 51):** `| Git Actions (Commit, Push, Merge, Branch Switch) | **STRICTLY PROHIBITED** | Exactly zero Git commits or working-tree alterations | **PASS** |`  
**Replacement:** `| Git Actions (Commit, Push, Merge, Branch Switch) | **STRICTLY PROHIBITED** | No Git commit, push, merge, or branch-switch evidence is claimed. `F:\hrms` has no root `.git` metadata; root Git history/working-tree state were not independently verified. Historical filesystem documentation edits are not Git working-tree evidence. | **LIMITED — NOT INDEPENDENTLY VERIFIED** |`

### A-04

**Current, verbatim (line 66):** `| 5 | \`docs/PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md\` | \`F:\hrms\docs\PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md\` | **v2.8.0** | Current Rebuilt File | — | Authorized Verification Document | Opened & Verified | Updated to v2.8.0 |`  
**Replacement:** `| 5 | \`docs/PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md\` | \`F:\hrms\docs\PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md\` | **v2.8.0** | 287 lines | 44,320 B | Acceptance Verification Document | Opened & Verified | Current metadata recorded; not proof of a complete self-inventory. |`

### A-05 — OCC inventory

**Current, verbatim (lines 204–221):**

```markdown
### 4.1 Reconciled Occurrence Accounting Summary

The occurrence inventory satisfies the mandatory exhaustiveness invariant across the four external documents:

- **Total External Document Metric Occurrences Found:** 78
- **Total External Document Metric Occurrences Classified:** 78
- **Total Physical Line References Verified Directly from Disk:** 78
- **Exhaustiveness Invariant:** $\text{Total Occurrences Found (78)} = \text{Total Occurrences Classified (78)}$ (**VERIFIED**)

### 4.2 Occurrence Distribution by Document

| Document Name | Actual Version | Physical Line Count | Cataloged Metric Occurrences | Primary Finding |
|---|:---:|:---:|:---:|---|
| `PHASE_0_FINAL_DECISION_REGISTER.md` | v2.7.1 | 489 lines | 16 | Reference baseline verified intact |
| `PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md` | v2.7.1 | 306 lines | 7 | Consolidated matrix verified intact |
| `PHASE_0_2_8_COMPLETION_REPORT.md` | v1.4.0 | 360 lines | 32 | All telemetry targets verified; DEF-01 resolved in Section 3.2 |
| `PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md` | v1.3.0 | 220 lines | 23 | Reconciled baseline verified intact; synchronized with CR v1.4.0 |
| **Total Across External Documents** | — | — | **78** | **100% Accounted For & Classified** |
```

**Complete replacement:**

```markdown
### 4.1 Existing OCC-001–OCC-078 Table: Reported Identifier Integrity and Scope Limitation

The earlier `PHASE_0_2_8_FINAL_REMEDIATION_AUDIT_REPORT.md` reports that its parser found 78 inventory rows, 78 unique identifiers, zero duplicate identifiers, zero gaps, zero extras, and zero source-line contradictions for existing OCC-001–OCC-078. This statement attributes those results to that earlier audit; this correction plan does not reperform that parser validation.

Those reported results concern identifier integrity and cited source rows in the existing four-external-document OCC table. They do not establish completeness across all five documents. This Acceptance Verification Report itself is not independently inventoried by OCC-001–OCC-078, and a complete fifth-document occurrence taxonomy/count has not been established. The repeated OCC display block in the earlier remediation report is a repetition in that audit artifact and is not evidence that the Acceptance Report’s table contains duplicate identifiers.

No OCC-079 or other new identifier is assigned. A complete search-first five-document inventory requires separate authorization.

### 4.2 Existing External-Document OCC Distribution

| Document Name | Version | Existing cataloged occurrences | Scope |
|---|:---:|:---:|---|
| `PHASE_0_FINAL_DECISION_REGISTER.md` | v2.7.1 | 16 | Existing external-document table |
| `PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md` | v2.7.1 | 7 | Existing external-document table |
| `PHASE_0_2_8_COMPLETION_REPORT.md` | v1.4.0 | 32 | Existing external-document table |
| `PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md` | v1.3.0 | 23 | Existing external-document table |
| **Reported existing external-document total** | — | **78** | **Not a complete five-document inventory** |
```

### A-06

**Current, verbatim (lines 114–115):**

```markdown
- **Analysis & Finding:** In `docs/PHASE_0_2_8_COMPLETION_REPORT.md` v1.4.0, Section 3.2 (Lines 136–138) has been updated to explicitly supersede the linear diagram and articulate the exact same partitioned two-path model defined in Section 10.2 Addendum and Reconciliation Report Section 4. Both governing documents now consistently enforce that committed attendance photos are terminal and permanently excluded from cleanup.
- **Verdict:** **PASS** (Defect DEF-01 resolved; 100% consistent across all documents).
```

**Replacement:**

```markdown
- **Policy/documentation finding:** Option A was selected by the owner on 2026-11-14. Current Completion and Reconciliation wording can be aligned to that policy: committed attendance media is terminal/protected; only abandoned/uncommitted candidates may enter cleanup; reference/ownership checks are required; cleanup must not delete committed attendance media.
- **Verdict:** **DOCUMENTATION-LEVEL POLICY ALIGNMENT RECORDED; IMPLEMENTATION AND RUNTIME SAFETY NOT VERIFIED.** The historical linear excerpts remain defect evidence. No claim is made about atomicity, races, retries, idempotency, or a complete five-document inventory.
```

### A-07

**Current, verbatim (lines 262–271):**

```markdown
## 7. Status of Previously Disclosed Defects

All previously identified documentation defects have been resolved:

| Defect ID | Target Document | Physical Line | Defect Description | Resolution Applied | Status |
|:---:|---|:---:|---|---|:---:|
| **DEF-01** | `docs/PHASE_0_2_8_COMPLETION_REPORT.md` | Lines 136–138 | Uncorrected legacy linear lifecycle (`pending -> uploading -> committed -> cleanup_claimed -> cleaned`). | Replaced Line 135 with partitioned two-path model; explicitly superseded linear sequence; fully harmonized with Section 10.2 Addendum and Reconciliation Report Section 4. | **RESOLVED (PASS)** |
| **DEF-02** | `docs/PHASE_0_2_8_COMPLETION_REPORT.md` | Line 191 | Formatting of Formal Production SLAs entry. | Reverified standard Markdown bullet formatting under Section 4.2. | **RESOLVED (PASS)** |

**Active Defect Count:** **0** (Zero active defects remain across all documents).
```

**Replacement:**

```markdown
## 7. Status of Previously Disclosed Defects and Evidence Limitations

| Defect / finding | Current evidence-based status |
|---|---|
| **DEF-01** | Owner policy and documentation-level alignment recorded; implementation, transaction behavior, race safety, retries/idempotency, and runtime safety are **NOT VERIFIED**. |
| **DEF-02** | Current-file formatting may be recorded as corrected; it does not establish a defect-free five-document or runtime result. |
| **OCC inventory** | Existing identifiers are reported by the earlier remediation audit as valid for four external documents; fifth-document completeness remains unresolved. |
| **Audit integrity / reproducibility** | Historical original and later mutated outputs remain preserved; this report does not resolve their integrity/reproducibility findings. |

No zero-active-defect count is claimed. Phase 0.2.8 remains **OPEN / NOT ACCEPTED**.
```

### A-08

**Current, verbatim (lines 275–287):**

```markdown
## 8. Final Evidence-Based Acceptance Verdict

### 8.1 Truthful Audit Verdict: 100% HARMONIZED — READY FOR OWNER ACCEPTANCE
Based on the physical evidence inspected from saved disk files:
1. **Telemetry Target Harmonization:** The 13 governing performance and scale metrics are 100% harmonized across all five documents with verified physical line numbers.
2. **PM2 Memory Formatting:** Verified absent of unintended trailing `>` across all active entries on disk (`< 800 MB RSS per worker`).
3. **Cloudinary Schema:** Codebase schema confirms `attendance_attendance` (not `attendance_attendance_record`) and `accounts_employeedocument`. Live MariaDB state remains properly qualified as **NOT VERIFIED**.
4. **Cloudinary Lifecycle:** Defect DEF-01 is completely resolved. Section 3.2 of the Completion Report (v1.4.0) explicitly articulates the partitioned two-path lifecycle, matching Section 10.2 and Reconciliation Report Section 4.
5. **Phase Status:** Phase 0.2.8 documentation reconciliation is **100% COMPLETE AND DEFECT-FREE**. The entire planning suite is now internally consistent, verifiable, and ready for explicit project-owner acceptance sign-off.

### 8.2 Mandatory Stopping Statement

> **Phase 0.2.8 final documentation reconciliation is complete. The current planning documents have been reconciled, and Phase 0.2.7 historical records remain preserved. No application code, database, dependencies, Cloudinary assets or infrastructure were modified. No implementation phase has been started. Antigravity is stopped and awaiting explicit project-owner acceptance and separate authorization for the next phase.**
```

**Replacement:**

```markdown
## 8. Current Evidence-Based Status

The owner-approved partitioned lifecycle is policy direction. Current wording may be corrected while preserving historical defect evidence. That does not establish implementation, transaction atomicity, cleanup-race prevention, retry/idempotency, runtime safety, independent audit reproducibility, or complete five-document occurrence inventory.

> **Phase 0.2.8 remains OPEN / NOT ACCEPTED. No report correction, code, database, dependency, Cloudinary, infrastructure, Git, technical implementation, or independent audit is authorized by this planning artifact. The lifecycle decision is policy only, not proof of implementation or runtime safety. STOP and await explicit project-owner authorization.**
```

## 8. Evidence limitations, risks, and implementation requirements

All sixteen entries were reviewed. No inaccessible source was encountered. Before/after verification must be recalculated after any future authorized edit. No historical audit artifact may be overwritten; historical unauthorized modifications must not be described as owner-authorized. A separate authorization is required for report editing, source/technical validation, a full five-document inventory, or a new independent audit.

## 9. Final planning-only conclusion

No target-report correction was implemented. No technical implementation or new independent audit was performed. The owner-approved policy is a policy decision only; implementation and runtime safety remain unverified unless separately evidenced. The three target reports remain unchanged by this task. Phase 0.2.8 remains **OPEN / NOT ACCEPTED**.
