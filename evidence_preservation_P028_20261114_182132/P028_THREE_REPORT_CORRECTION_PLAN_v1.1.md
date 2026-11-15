# P028 Three-Report Correction Plan v1.1

## 1. Task metadata and authorization boundary

- **Task ID:** `P028-THREE-REPORT-CORRECTION-PLAN-REFINEMENT-01`
- **Project / phase:** Enterprise HRMS / Phase 0.2.8
- **Stage:** Read-only correction-plan refinement
- **Status:** **OPEN / NOT ACCEPTED**
- **Authorization:** Inspect evidence and create this one new plan only.

No correction is implemented by this plan. No existing report, v1.0 plan, audit artifact, code, test, configuration, database, Cloudinary asset/setting, infrastructure service, or Git state is modified. The owner selected Option A — Partitioned Two-Path Cloudinary Upload Lifecycle on 2026-11-14; this is policy selection, not proof of implementation or runtime safety.

## 2. Directly inspected source inventory and before-task identity

| Source | Physical path | Version / role | Bytes | Physical lines | SHA-256 before task |
|---|---|---|---:|---:|---|
| Completion Report | `F:\hrms\docs\PHASE_0_2_8_COMPLETION_REPORT.md` | v1.4.0 / target | 35,489 | 360 | `024BE8EB7C1AAD735F03312014A868514EBC5A68B7C93D455F88C779AD42565A` |
| Reconciliation Report | `F:\hrms\docs\PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md` | v1.3.0 / target | 17,983 | 220 | `75C89810EF1AC4CAAB9A2C3C44A71E6914433DFF3640827FF13573AA80460D9E` |
| Acceptance Verification Report | `F:\hrms\docs\PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md` | v2.8.0 / target | 44,320 | 287 | `A67FFA8D135A418AC1DE1291F4927F869DCF09FD4BCF8C2D5C6FD1EB87EF849E` |
| Original plan | `F:\hrms\evidence_preservation_P028_20261114_182132\P028_THREE_REPORT_CORRECTION_PLAN.md` | v1.0 / must remain unchanged | 49,776 | 446 | `59F91568438339FC7C63832014628BF36AA74BD61588C529DDF9075E73125242` |
| Owner Decision Record | `F:\hrms\evidence_preservation_P028_20261114_182132\P028_CLOUDINARY_LIFECYCLE_OWNER_DECISION_RECORD.md` | governing owner decision | 14,191 | 107 | `91A986BDF846975DF13B464091A372AC1F4D9BE965A4E8688771DA16704F9291` |
| Final Remediation Audit | `F:\hrms\docs\PHASE_0_2_8_FINAL_REMEDIATION_AUDIT_REPORT.md` | latest audit evidence | 105,943 | 292 | `763597026C835294CCD692DC10C102560BD37F96249BB50223056BABF013C20E` |

The current Decision Register (`F:\hrms\docs\PHASE_0_FINAL_DECISION_REGISTER.md`, v2.7.1, lines 246–324) and Implementation Checklist (`F:\hrms\docs\PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md`, v2.7.1, lines 81 and 165–168, 209–220) were read where cited below.

## 3. Refinements from v1.0

1. Every retained/revised proposal below includes a verbatim current-source quotation rather than a summary substitute.
2. Lifecycle replacements retain source technical detail—states, transaction sequence, leases, fencing/heartbeat, checks, provisional threshold, manual review, and recovery—but label it **proposed technical design**.
3. Historical version-history entries are not silently rewritten. R-01 now proposes a dated clarification note after the historical entry.
4. A-05 preserves OCC-001–OCC-078 and accurately distinguishes validation of that existing four-external-document table from a complete five-document inventory.
5. Each v1.0 item is explicitly revalidated and assigned a treatment outcome.

## 4. Governing evidence classifications

The Owner Decision Record at lines 15–24 records the owner’s Option A selection and four policy requirements. Lines 24 and 44–72 state that the selection does not establish implementation, transaction guarantees, cleanup-race prevention, retries, or idempotency. Decision Register lines 249–324 provides the detailed **proposed** design; line 322 expressly labels leases/fencing as requiring implementation and staging validation. Historical audit evidence remains separate: Final Remediation Audit lines 247–254 identifies the preserved unmutated and later mutated audit outputs and says the current audit is not independent acceptance evidence.

## 5. Completion Report proposals

### C-01 — REVISE PROPOSED CORRECTION

- **Target/version/location:** `F:\hrms\docs\PHASE_0_2_8_COMPLETION_REPORT.md`, v1.4.0, line 74.
- **Existing text verified verbatim:**

```markdown
3. `docs/PHASE_0_2_8_COMPLETION_REPORT.md` — Updated to **Version 1.3.0** (this document).
```

- **Defect:** Header line 5 and change-history line 21 identify v1.4.0; this self-reference says v1.3.0.
- **Exact proposed replacement:**

```markdown
3. `docs/PHASE_0_2_8_COMPLETION_REPORT.md` — Updated to **Version 1.4.0** (this document).
```

- **Evidence:** Completion Report lines 5, 21, 74; Final Remediation Audit lines 230–233.
- **Effect / approval:** Current-document accuracy only; historical change history unchanged. **Owner approval required: Yes.**

### C-02 — REVISE PROPOSED CORRECTION

- **Target/version/location:** Completion Report v1.4.0, lines 135–143.
- **Existing text verified verbatim:**

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

- **Defect:** The technical detail is useful, but the owner decision date/policy and the proposed-versus-verified boundary are not explicit throughout.
- **Exact proposed replacement:**

```markdown
The project owner selected **OPTION A — PARTITIONED TWO-PATH CLOUDINARY UPLOAD LIFECYCLE** on 2026-11-14. This is the owner-selected policy direction: committed attendance media is terminal and protected from abandoned-upload cleanup; only abandoned or uncommitted candidates may enter cleanup; reference and ownership checks are required before deletion; and abandoned-upload cleanup must not delete a committed attendance photo.

* **Proposed Technical Design — Intent States:** The documented two-path design supersedes the earlier linear diagram as current lifecycle terminology:
  - **Successful Attendance Path:** `pending` $\rightarrow$ `uploading` $\rightarrow$ `committed`. A successfully committed attendance-media intent is terminal for cleanup and excluded from deletion candidates.
  - **Abandoned / Failed Upload Path (Uncommitted Candidates Only):** only uncommitted `pending` or `failed` candidates older than the provisional $2\text{h}$ age filter may proceed to `cleanup_claimed`, then `cleaned` or manual review.
* **Proposed Worker Ownership, Lease, and Recovery Controls:** a worker claims `cleanup_claimed` with a unique worker UUID and lease timeout; long-running recovery work uses heartbeat timestamps and fencing so a worker acting after lease expiration can be rejected.
* **Proposed Pre-Deletion Controls:** immediately before `cloudinary.uploader.destroy(publicId)`, verify current worker/lease ownership and execute the corrected reference query. If a committed record or active reference exists, preserve the asset; if the result is inconclusive, preserve it and flag manual review.
* **Proposed Transaction and Cleanup Design:** the detailed attendance/intent transaction sequence, candidate transition guards, provider deletion handling, and retry/recovery behavior remain design requirements pending implementation and validation.
* **Verification Status:** This report verifies owner-selected policy and documentation terminology only. It does not verify source implementation, transaction atomicity, reference-check coverage, cleanup-race prevention, idempotency, retry behavior, or runtime/concurrency safety. **NEEDS TECHNICAL VALIDATION.** Zero Cloudinary operations were performed.
```

- **Evidence:** Owner Decision Record lines 15–24, 44–72; Decision Register lines 249–324; Completion lines 135–143.
- **Effect / approval:** Retains design detail; corrects lifecycle terminology and technical-verification boundary. **Owner approval required: Yes.**

### C-03 — REVISE PROPOSED CORRECTION

- **Target/version/location:** Completion Report v1.4.0, lines 345–349.
- **Existing text verified verbatim:**

```markdown
### 2. Cloudinary Upload Intent Separate Lifecycles (Correction B)
The upload intent lifecycle is formally partitioned into two mutually exclusive paths to ensure committed attendance photos can never enter an orphan-deletion workflow:
- **Successful Attendance Path:** `uploadToken` + deterministic `publicId` $\rightarrow$ intent inserted as `'pending'` $\rightarrow$ upload outside DB tx $\rightarrow$ DB tx locks parent user, inserts attendance, and marks intent `'committed'` $\rightarrow$ DB tx commits. A committed intent is terminal for cleanup and is **NEVER** selected for deletion.
- **Abandoned / Failed Upload Path (Uncommitted Candidates Only):** Intents in `'pending'` or `'failed'` older than the provisional 2-hour threshold are claimed with a worker lease token (`cleanup_claimed`, `worker_id`, `lease_expires_at`). The worker rechecks database references across verified columns (`attendance_attendance.punch_in_photo`, `attendance_attendance.punch_out_photo`, and `accounts_employeedocument.file`). If referenced, the intent is updated to `'committed'`; if inconclusive, the asset is preserved for manual review; if conclusively unreferenced, `cloudinary.uploader.destroy(publicId)` is called and intent is marked `'cleaned'`.
- **Absolute Deletion Safety Rule:** Committed records and active references are **NEVER** deleted.
```

- **Defect:** The operational sequence needs a proposed-design label; it must not lose its useful engineering detail.
- **Exact proposed replacement:**

```markdown
### 2. Cloudinary Upload Intent Separate Lifecycles (Owner-Selected Policy; Proposed Technical Design)
On 2026-11-14 the project owner selected Option A — Partitioned Two-Path Cloudinary Upload Lifecycle. The following sequence is proposed technical design, not verified implementation or runtime proof:
- **Successful Attendance Path:** `uploadToken` + deterministic `publicId` $\rightarrow$ intent inserted as `'pending'` $\rightarrow$ upload outside DB transaction $\rightarrow$ proposed DB transaction locks the parent user, inserts attendance, and marks the intent `'committed'` $\rightarrow$ transaction commit. Under the selected policy, a successfully committed attendance-media intent is terminal for abandoned-upload cleanup and is not selected for deletion.
- **Abandoned / Failed Upload Path (Uncommitted Candidates Only):** proposed candidates are `'pending'` or `'failed'` intents older than the provisional 2-hour age filter. Proposed worker lease data are `cleanup_claimed`, `worker_id`, and `lease_expires_at`; the design requires ownership/lease validation, heartbeat/fencing as applicable, and an immediate pre-deletion reference recheck across `attendance_attendance.punch_in_photo`, `attendance_attendance.punch_out_photo`, and `accounts_employeedocument.file`.
- **Proposed outcomes:** a reference preserves/reconciles the asset; inconclusive reference or ownership evidence preserves it for manual review; only a conclusively unreferenced, still-authorized uncommitted candidate may be submitted to `cloudinary.uploader.destroy(publicId)` and then marked `'cleaned'`.
- **Required policy rule and verification boundary:** abandoned-upload cleanup must not delete a committed attendance photo. This report does not verify implementation, atomicity, race prevention, provider-retry behavior, or idempotency; those remain separately authorized technical-validation work.
```

- **Evidence:** Completion lines 345–349; Owner Decision Record lines 17–24, 50–72; Decision Register lines 256–294, 320–324.
- **Effect / approval:** Lifecycle terminology only; preserves transaction, lease, query, and manual-review detail. **Owner approval required: Yes.**

### C-04 — REVISE PROPOSED CORRECTION

- **Target/version/location:** Completion Report v1.4.0, lines 301–306.
- **Existing text verified verbatim:**

```markdown
## 9. Final Acceptance Recommendation

The Phase 0.2.8 planning baseline is **fully reconciled, qualified, and mathematically verified**. All theoretical overstatements regarding distributed locking have been removed, schema references reflect verified empirical code, shift-boundary policy choices are cleanly separated from SQL logic, load testing targets are reconciled, and implementation dependencies are rigorously governed.

### Recommended Next Steps for Project Owner
1. **ACCEPT Phase 0.2.8 Planning Baseline:** Formally adopt `PHASE_0_FINAL_DECISION_REGISTER.md` (v2.7.1) and `PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md` (v2.7.1) as the qualified technical standard.
```

- **Exact proposed replacement:**

```markdown
## 9. Project-Owner Review Status

This report records documentation findings and proposed technical design. The owner selected the partitioned two-path Cloudinary lifecycle on 2026-11-14 as policy direction; the selection does not establish implemented behavior, runtime safety, audit reproducibility, or phase acceptance.

### Required Project-Owner Review
1. Review the Decision Register and Implementation Checklist as planning documents and decide whether to authorize any separately scoped documentation correction, technical implementation, validation, or audit work.
```

- **Evidence:** Completion lines 301–306; Owner Decision Record lines 11–13, 24, 40–43; Remediation Audit lines 243–254.
- **Effect / approval:** Acceptance wording; no historical audit conclusion changed. **Owner approval required: Yes.**

## 6. Reconciliation Report proposals

### R-01 — REVISE PROPOSED CORRECTION (preserve history)

- **Target/version/location:** `F:\hrms\docs\PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md`, v1.3.0, line 20.
- **Existing text verified verbatim:**

```markdown
| **1.3.0** | Nov 14, 2026 | Antigravity Senior Architect | Final Defect Closure & Harmonization: Synchronized cross-document references with Completion Report v1.4.0 (DEF-01 resolution); confirmed complete cross-document harmonization across all 5 planning documents. |
```

- **Treatment:** Retain this historical entry; do not rewrite it to imply the later owner clarification was part of v1.3.0.
- **Exact proposed insertion immediately after line 20:**

```markdown
| **Correction note — 2026-11-14** | Nov 14, 2026 | Project-owner review clarification | The historical v1.3.0 entry records the claim made in that revision. The project owner later selected Option A — Partitioned Two-Path Cloudinary Upload Lifecycle as current policy direction. That policy/documentation clarification does not establish implementation, runtime safety, or a complete independent five-document verification result. |
```

- **Evidence:** Reconciliation line 20; Owner Decision Record lines 15–24, 38–43.
- **Effect / approval:** Preserves historical traceability. **Owner approval required: Yes.**

### R-02 — REVISE PROPOSED CORRECTION

- **Target/version/location:** Reconciliation v1.3.0, lines 98–116.
- **Existing text verified verbatim:**

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

- **Exact proposed replacement:** Retain the `Inconsistency Found` and `Before` text verbatim as historical defect evidence. Replace `After` through `Reason for Correction` with:

```markdown
* **Owner-selected policy and proposed technical design (2026-11-14):** The owner selected the partitioned two-path lifecycle. The documented successful path is `pending` $\rightarrow$ upload outside proposed DB transaction $\rightarrow$ parent-user lock, attendance association, intent `committed`, and commit; committed attendance media is terminal for abandoned-upload cleanup. The documented abandoned/failed path permits only uncommitted `pending` or `failed` candidates older than the provisional $2\text{h}$ filter to be lease-claimed with `cleanup_claimed`, `worker_id`, and `lease_expires_at`.
* **Proposed deletion controls:** validate worker ownership and lease; use heartbeat/fencing for recovery where applicable; immediately recheck references in `attendance_attendance.punch_in_photo`, `attendance_attendance.punch_out_photo`, and `accounts_employeedocument.file`; preserve references and inconclusive cases for reconciliation/manual review; delete only a conclusively unreferenced eligible candidate.
* **Policy rule and verification limit:** abandoned-upload cleanup must not delete a committed attendance photo. This is a selected policy and proposed design, not evidence that code enforces the sequence, that transactions are atomic, or that races, retries, and idempotency are safe.
* **Reason for correction:** Preserves historical linear-lifecycle evidence while distinguishing current policy/documentation wording from unverified technical behavior.
```

- **Evidence:** Reconciliation lines 98–116; Owner Decision Record lines 17–24, 50–72; Decision Register lines 249–324.
- **Effect / approval:** Historical lifecycle evidence preserved; technical detail retained. **Owner approval required: Yes.**

### R-03 — REVISE PROPOSED CORRECTION

- **Target/version/location:** Reconciliation v1.3.0, lines 159–175.
- **Existing text verified verbatim:**

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

- **Exact proposed replacement:** Same five-document list, preceded by: `This comparison records terminology in the current saved documents. It does not establish 100% harmonization, a complete five-document occurrence inventory, independent audit reproducibility, implemented behavior, or runtime safety.` In item 3 replace `and resolves DEF-01 in Section 3.2` with `and uses the partitioned lifecycle as current documentation terminology; that is a policy/documentation result only.` In item 5 replace its sub-bullet with: `- Contains an existing 78-entry occurrence table validated for four external documents only; it is not a complete five-document inventory.`
- **Evidence:** Reconciliation lines 159–175; Remediation Audit lines 17, 61–65, 226, 234, 281.
- **Effect / approval:** Audit traceability and acceptance wording. **Owner approval required: Yes.**

### R-04 — NO CHANGE REQUIRED

- **Target/version/location:** Reconciliation v1.3.0, lines 205–219.
- **Existing text verified verbatim:**

```markdown
## 7. Confirmation of Zero Code and Infrastructure Modifications

I explicitly confirm that across this final reconciliation:
- **NO** application code in `node_backend/`, `hrms_saas/`, or `hrms_mobile/` was modified.
- **NO** database migrations, DDL, or DML were executed against MariaDB.
- **NO** npm packages or dependencies were installed, updated, or removed.
- **NO** Redis, Cloudinary, or VPS infrastructure services were modified or accessed.
- **NO** PM2, Nginx, or system processes were restarted or reconfigured.
- **NO** implementation phase (Phase 0.3, Phase 1, etc.) was initiated.
```

- **Reason/evidence/effect:** Its scope is code/infrastructure and does not assert zero documentation edits or a clean Git working tree. Final Remediation Audit lines 232–233 identifies the separate Acceptance Report defect. **Owner approval required: No.**

## 7. Acceptance Verification Report proposals

### A-01 — RETAIN PROPOSED CORRECTION

- **Target/version/location:** `F:\hrms\docs\PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md`, v2.8.0, line 7.
- **Existing text verified verbatim:**

```markdown
**Governance Decision:** All 5 documents fully harmonized; Phase 0.2.8 is defect-free and ready for project-owner acceptance sign-off
```

- **Exact proposed replacement:**

```markdown
**Governance Status:** The owner selected Option A — Partitioned Two-Path Cloudinary Upload Lifecycle on 2026-11-14 as policy direction. Phase 0.2.8 remains OPEN / NOT ACCEPTED; documentation wording does not establish implementation, runtime safety, independent audit reproducibility, or acceptance readiness.
```

- **Evidence/effect/approval:** Owner Decision Record lines 11–24, 40–43; Remediation lines 239, 254. Acceptance-status clarification. **Owner approval required: Yes.**

### A-02 — RETAIN PROPOSED CORRECTION

- **Target/version/location:** Acceptance v2.8.0, lines 34–36.
- **Existing text verified verbatim:**

```markdown
### 1.1 Governance Status: Fully Harmonized & Ready for Owner Acceptance
In accordance with the project owner's governing instructions, Phase 0.2.8 is conducted as a documentation-correction, defect-closure, and evidence-verification task:
> **Phase 0.2.8 remains OPEN and NOT ACCEPTED pending explicit project-owner sign-off.** This task has resolved all identified documentation defects and achieved genuine cross-document consistency. It does not authorize implementation, source-code changes, database changes, infrastructure changes, or progression to another phase.
```

- **Exact proposed replacement:**

```markdown
### 1.1 Governance Status: OPEN / NOT ACCEPTED
Phase 0.2.8 is a documentation-correction and evidence-review activity. The owner-selected partitioned lifecycle is current policy direction, not technical proof.
> **Phase 0.2.8 remains OPEN / NOT ACCEPTED pending explicit project-owner acceptance.** Existing documentation alignment does not establish a complete five-document inventory, independent audit reproducibility, implementation, or runtime/concurrency safety. No implementation, source-code, database, infrastructure, or phase-progression work is authorized.
```

- **Evidence/effect/approval:** Owner Decision lines 11–24; Remediation 226, 239, 254. **Owner approval required: Yes.**

### A-03 — RETAIN PROPOSED CORRECTION

- **Target/version/location:** Acceptance v2.8.0, line 51.
- **Existing text verified verbatim:**

```markdown
| Git Actions (Commit, Push, Merge, Branch Switch) | **STRICTLY PROHIBITED** | Exactly zero Git commits or working-tree alterations | **PASS** |
```

- **Exact proposed replacement:**

```markdown
| Git Actions (Commit, Push, Merge, Branch Switch) | **STRICTLY PROHIBITED** | No Git commit, push, merge, or branch-switch evidence is claimed for this documentation review. `F:\hrms` has no root `.git` metadata; root Git history and working-tree state were not independently verified. Historical documentation filesystem edits are not represented as Git working-tree evidence. | **LIMITED — NOT INDEPENDENTLY VERIFIED** |
```

- **Evidence/effect/approval:** Acceptance lines 42, 45–46, 51; Remediation 232–233, 279–284. Audit traceability. **Owner approval required: Yes.**

### A-04 — RETAIN PROPOSED CORRECTION

- **Target/version/location:** Acceptance v2.8.0, lines 60–66.
- **Existing text verified verbatim:**

```markdown
| # | Document Path | Exact Disk Path | Actual Version | Physical Line Count | File Size (Bytes) | Role in Audit | Access Status | Verification Finding |
|:---:|---|---|:---:|:---:|:---:|---|:---:|:---:|
| 1 | `docs/PHASE_0_FINAL_DECISION_REGISTER.md` | `F:\hrms\docs\PHASE_0_FINAL_DECISION_REGISTER.md` | **v2.7.1** | 489 lines | 40,701 B | Read-Only Reference | Opened & Verified | Verified Intact |
| 2 | `docs/PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md` | `F:\hrms\docs\PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md` | **v2.7.1** | 306 lines | 44,169 B | Read-Only Reference | Opened & Verified | Verified Intact |
| 3 | `docs/PHASE_0_2_8_COMPLETION_REPORT.md` | `F:\hrms\docs\PHASE_0_2_8_COMPLETION_REPORT.md` | **v1.4.0** | 360 lines | 35,489 B | Governing Completion Report | Opened & Verified | DEF-01 Resolved (Sec 3.2) |
| 4 | `docs/PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md` | `F:\hrms\docs\PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md` | **v1.3.0** | 220 lines | 17,983 B | Governing Reconciliation Report | Opened & Verified | Verified Harmonized |
| 5 | `docs/PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md` | `F:\hrms\docs\PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md` | **v2.8.0** | Current Rebuilt File | — | Authorized Verification Document | Opened & Verified | Updated to v2.8.0 |
```

- **Exact proposed replacement for row 5 only:**

```markdown
| 5 | `docs/PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md` | `F:\hrms\docs\PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md` | **v2.8.0** | 287 lines | 44,320 B | Acceptance Verification Document | Opened & Verified | Current file metadata recorded; this row is not proof of a complete self-inventory. |
```

- **Evidence/effect/approval:** Current direct metadata in §2. Inventory accuracy only; recalculate after authorized edits. **Owner approval required: Yes.**

### A-05 — REVISE PROPOSED CORRECTION

- **Target/version/location:** Acceptance v2.8.0, lines 204–221.
- **Existing text verified verbatim:**

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

- **OCC evidence and limitation:** Remediation Audit lines 61–65 directly records a parser result of 78 rows, 78 unique IDs, no gaps/duplicates in 001–078, and no out-of-range IDs; line 226 repeats the 78/unique/no-duplicate result but contains duplicated prose. The remediation file also repeats an OCC display block (lines 147–224 after its initial block), so that file is not a new independent occurrence inventory. Its lines 17, 226, 234, and 281 establish that OCC-001–OCC-078 are existing four-external-document identifiers and do not prove a complete fifth-document search.
- **Exact proposed replacement:**

```markdown
### 4.1 Existing OCC-001–OCC-078 Table: Validated Scope and Limitation

The existing table contains OCC-001 through OCC-078 for four external documents. Read-only remediation evidence validated the existing identifier range as 78 parsed rows with 78 unique IDs, no gaps, no duplicate IDs, and no out-of-range IDs. This validates the existing table’s identifier/range integrity and cited external-source rows only; it does not establish completeness of a five-document metric inventory.

This Acceptance Verification Report is not independently cataloged by OCC-001–OCC-078. No new OCC identifier, fifth-document count, or five-document exhaustiveness claim is assigned here. A separately authorized search-first inventory is required before making any complete five-document claim.

### 4.2 Distribution of Existing External-Document OCC Entries

| Document Name | Actual Version | Physical Line Count | Existing Cataloged Metric Occurrences | Scope qualification |
|---|:---:|:---:|:---:|---|
| `PHASE_0_FINAL_DECISION_REGISTER.md` | v2.7.1 | 489 lines | 16 | Existing external-document table |
| `PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md` | v2.7.1 | 306 lines | 7 | Existing external-document table |
| `PHASE_0_2_8_COMPLETION_REPORT.md` | v1.4.0 | 360 lines | 32 | Existing external-document table; technical claims separately qualified |
| `PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md` | v1.3.0 | 220 lines | 23 | Existing external-document table |
| **Existing external-document total** | — | — | **78** | **Not a complete five-document inventory** |
```

- **Effect / approval:** Preserves IDs and evidenced 78-row check; removes unsupported completeness claim. **Owner approval required: Yes.**

### A-06 — REVISE PROPOSED CORRECTION

- **Target/version/location:** Acceptance v2.8.0, lines 99–115.
- **Existing text verified verbatim:**

```markdown
### 3.4 Defect D: Cloudinary Upload Intent Lifecycle Harmonization (DEF-01 Resolution)
- **Investigation:** Compared the upload intent lifecycle descriptions across `docs/PHASE_0_2_8_COMPLETION_REPORT.md` and `docs/PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md`.
- **Supporting Source Excerpts:**
  - `PHASE_0_2_8_COMPLETION_REPORT.md` Lines 136–138 (Section 3.2):
    > `* **Intent States (Partitioned Lifecycle — Superseding Linear Diagram):** As reconciled in Section 10.2 Addendum, the older linear sequence is superseded. The lifecycle is partitioned into two mutually exclusive paths:`  
    > `  - **Successful Attendance Path:** pending $\rightarrow$ uploading $\rightarrow$ committed (terminal for cleanup, permanently excluded from deletion).`  
    > `  - **Abandoned / Failed Upload Path (Uncommitted Candidates Only):** pending or failed $> 2\text{h}$ $\rightarrow$ cleanup_claimed $\rightarrow$ cleaned (or manual review).`
  - `PHASE_0_2_8_COMPLETION_REPORT.md` Lines 343–346 (Section 10.2 Addendum):
    > `The upload intent lifecycle is formally partitioned into two mutually exclusive paths to ensure committed attendance photos can never enter an orphan-deletion workflow:`  
    > `- Successful Attendance Path: ... marked 'committed' ... A committed intent is terminal for cleanup and is NEVER selected for deletion.`  
    > `- Abandoned / Failed Upload Path (Uncommitted Candidates Only): Intents in 'pending' or 'failed' older than the provisional 2-hour threshold are claimed with a worker lease token ...`
  - `PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md` Lines 98–104 (Section 4, Inconsistency 2):
    > `* Inconsistency Found: Linear state diagram pending -> uploading -> committed -> cleanup_claimed -> cleaned unintentionally implied that committed attendance photos could transition into the orphan cleanup workflow.`  
    > `* Before: status ('pending', 'uploading', 'committed', 'cleanup_claimed', 'cleaned', 'failed') presented as a single pipeline where committed records could be evaluated by cleanup workers.`  
    > `* After: Partitioned into two mutually exclusive paths: 1. Successful Attendance Path (committed is terminal and NEVER selected for cleanup) vs 2. Abandoned / Failed Upload Path (Uncommitted Candidates Only)...`
- **Analysis & Finding:** In `docs/PHASE_0_2_8_COMPLETION_REPORT.md` v1.4.0, Section 3.2 (Lines 136–138) has been updated to explicitly supersede the linear diagram and articulate the exact same partitioned two-path model defined in Section 10.2 Addendum and Reconciliation Report Section 4. Both governing documents now consistently enforce that committed attendance photos are terminal and permanently excluded from cleanup.
- **Verdict:** **PASS** (Defect DEF-01 resolved; 100% consistent across all documents).
```

- **Exact proposed replacement:** retain the historical quotations, label them **Historical source excerpts**, and replace the final two bullets with:

```markdown
- **Owner-selected policy and documentation finding:** On 2026-11-14 the project owner selected Option A — Partitioned Two-Path Cloudinary Upload Lifecycle. The current Completion and Reconciliation wording is aligned with that policy direction: committed attendance media is terminal for abandoned-upload cleanup; only abandoned/uncommitted candidates may enter cleanup; reference and ownership checks are required before deletion; and abandoned-upload cleanup must not delete a committed attendance photo.
- **Verification limitation and verdict:** **DOCUMENTATION-LEVEL POLICY ALIGNMENT RECORDED; TECHNICAL IMPLEMENTATION AND RUNTIME SAFETY NOT VERIFIED.** This report does not prove code enforcement, transaction atomicity, race prevention, retry/idempotency behavior, or a complete five-document inventory.
```

- **Evidence/effect/approval:** Owner Decision 15–24, 38–43, 50–72; Remediation 247–254. Historical evidence retained. **Owner approval required: Yes.**

### A-07 — RETAIN PROPOSED CORRECTION

- **Target/version/location:** Acceptance v2.8.0, lines 262–271.
- **Existing text verified verbatim:**

```markdown
## 7. Status of Previously Disclosed Defects

All previously identified documentation defects have been resolved:

| Defect ID | Target Document | Physical Line | Defect Description | Resolution Applied | Status |
|:---:|---|:---:|---|---|:---:|
| **DEF-01** | `docs/PHASE_0_2_8_COMPLETION_REPORT.md` | Lines 136–138 | Uncorrected legacy linear lifecycle (`pending -> uploading -> committed -> cleanup_claimed -> cleaned`). | Replaced Line 135 with partitioned two-path model; explicitly superseded linear sequence; fully harmonized with Section 10.2 Addendum and Reconciliation Report Section 4. | **RESOLVED (PASS)** |
| **DEF-02** | `docs/PHASE_0_2_8_COMPLETION_REPORT.md` | Line 191 | Formatting of Formal Production SLAs entry. | Reverified standard Markdown bullet formatting under Section 4.2. | **RESOLVED (PASS)** |

**Active Defect Count:** **0** (Zero active defects remain across all documents).
```

- **Exact proposed replacement:**

```markdown
## 7. Status of Previously Disclosed Defects and Evidence Limitations

| Defect / finding | Current evidence-based status |
|---|---|
| **DEF-01** | Owner-selected lifecycle policy and documentation-level alignment recorded. Implementation, transaction behavior, race safety, retry/idempotency, and runtime safety are **NOT VERIFIED**. |
| **DEF-02** | Current-file formatting may be recorded as corrected; it does not establish a defect-free five-document or runtime result. |
| **OCC inventory** | Existing OCC-001–OCC-078 table validated for four external documents only; complete five-document taxonomy/count remains unresolved. |
| **Audit integrity / reproducibility** | Historical independent and later mutated audit outputs remain preserved; this report does not resolve their integrity or reproducibility findings. |

No zero-active-defect count is claimed. Phase 0.2.8 remains **OPEN / NOT ACCEPTED**.
```

- **Evidence/effect/approval:** Owner Decision 24, 40–43; Remediation 226, 234–254, 281. **Owner approval required: Yes.**

### A-08 — RETAIN PROPOSED CORRECTION

- **Target/version/location:** Acceptance v2.8.0, lines 275–287.
- **Existing text verified verbatim:**

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

- **Exact proposed replacement:**

```markdown
## 8. Current Evidence-Based Status

The owner-selected partitioned two-path Cloudinary lifecycle is the governing policy direction. Current wording can be corrected to reflect that policy and preserve historical defect evidence. This does not establish implementation, verified transaction behavior, cleanup-race prevention, retry/idempotency, runtime safety, independent audit reproducibility, or a complete five-document occurrence inventory.

> **Phase 0.2.8 remains OPEN / NOT ACCEPTED. No application code, database, dependencies, Cloudinary assets, infrastructure, or Git state is changed by this documentation correction. No technical implementation or independent audit is authorized. The partitioned lifecycle is recorded as selected policy direction, not proof of implementation or runtime safety. STOP and await explicit project-owner authorization.**
```

- **Evidence/effect/approval:** Owner Decision 11–24, 76–83; Remediation 243–254, 288–292. Acceptance status. **Owner approval required: Yes.**

## 8. File-by-file correction matrix

| ID | Target report | Current physical location | Existing text verified verbatim? | Proposed treatment | Evidence | Owner approval required |
|---|---|---|---|---|---|---|
| C-01 | Completion | 74 | Yes | Revise self-version | Completion 5, 21, 74; Remediation 230–233 | Yes |
| C-02 | Completion | 135–143 | Yes | Revise; retain detailed proposed design | Owner Decision 15–24, 44–72; Decision Register 249–324 | Yes |
| C-03 | Completion | 345–349 | Yes | Revise; retain detailed proposed design | Owner Decision 17–24; Decision Register 256–324 | Yes |
| C-04 | Completion | 301–306 | Yes | Revise acceptance wording | Owner Decision 11–24; Remediation 243–254 | Yes |
| R-01 | Reconciliation | 20 | Yes | Add dated clarification; retain history | Owner Decision 15–24 | Yes |
| R-02 | Reconciliation | 98–116 | Yes | Revise after-text; preserve before-text | Owner Decision 17–24; Decision Register 249–324 | Yes |
| R-03 | Reconciliation | 159–175 | Yes | Revise scope/100% claim | Remediation 17, 61–65, 226 | Yes |
| R-04 | Reconciliation | 205–219 | Yes | No change required | Remediation 232–233 | No |
| A-01 | Acceptance | 7 | Yes | Retain correction | Owner Decision 11–24 | Yes |
| A-02 | Acceptance | 34–36 | Yes | Retain correction | Owner Decision 11–24; Remediation 226 | Yes |
| A-03 | Acceptance | 51 | Yes | Retain correction | Acceptance 42,45–46,51; Remediation 232–233 | Yes |
| A-04 | Acceptance | 60–66 | Yes | Retain correction; recalc post-edit | Direct metadata §2 | Yes |
| A-05 | Acceptance | 204–221 | Yes | Revise OCC correction | Remediation 61–65, 226, 234, 281 | Yes |
| A-06 | Acceptance | 99–115 | Yes | Revise; preserve historical excerpts | Owner Decision 15–24; Remediation 247–254 | Yes |
| A-07 | Acceptance | 262–271 | Yes | Retain correction | Remediation 226, 234–254 | Yes |
| A-08 | Acceptance | 275–287 | Yes | Retain correction | Owner Decision 11–24; Remediation 288–292 | Yes |

## 9. Historical evidence preservation requirements

Preserve the original independent audit, later mutated audit, transcript, recovered script, manifest, and historical document copies. Do not recast historical unauthorized edits as owner-authorized. Preserve linear lifecycle text as historical defect evidence where quoted; never present it as current design. Do not claim this plan resolves audit-integrity or reproducibility findings.

## 10. Unresolved questions and limitations

1. Implementation and runtime safety are not inspected or tested.
2. The complete fifth-document OCC taxonomy/count is not available; no identifier is assigned.
3. `F:\hrms` has no root Git metadata; root history and working-tree condition are not independently verified.
4. Any approved edit changes file metadata; post-edit versions, line counts, bytes, and hashes must be freshly measured.

## 11. Final project-owner review checklist

- [ ] Approve/reject every matrix item individually.
- [ ] Confirm historical version entries are retained and clarification notes are dated.
- [ ] Confirm technical lifecycle detail remains labeled proposed design.
- [ ] Confirm no technical verification, audit completion, or acceptance claim is introduced.
- [ ] If a full five-document inventory is needed, authorize it separately with a search/counting methodology.

No implementation or acceptance is authorized by this plan.

**This task created a refined read-only correction plan for project-owner review. The original v1.0 plan and all three target reports remain unchanged. No governing document was edited, no technical implementation was performed, no independent audit was executed, and no new occurrence identifiers were assigned. The project owner's partitioned Cloudinary lifecycle decision remains the selected design direction, not proof of implementation or runtime safety. No correction implementation or phase acceptance is authorized by this task. Phase 0.2.8 remains OPEN / NOT ACCEPTED. STOP and await explicit project-owner authorization.**
