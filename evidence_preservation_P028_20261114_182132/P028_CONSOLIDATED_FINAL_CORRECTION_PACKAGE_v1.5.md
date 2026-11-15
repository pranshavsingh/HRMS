# P028 Consolidated Final Correction Package v1.5

## 1. Control and authorization

Task `P028-CONSOLIDATED-FINAL-CORRECTION-PACKAGE-01`; Phase 0.2.8 is **OPEN / NOT ACCEPTED**. This is implementation-ready wording for later owner review, not implementation authority. No target report, prior plan, code, database, infrastructure, Git repository, or audit artifact was modified; no SQL query, technical implementation, independent audit, or Git operation was performed.

## 2. Directly calculated current evidence

| File | Path | Version | Bytes / lines | SHA-256 |
|---|---|---|---|---|
| Decision Register | `F:\hrms\docs\PHASE_0_FINAL_DECISION_REGISTER.md` | v2.7.1 | 40,701 / 489 | `26320E36175631FB17693E61C4DDE5C876377248C8DAC0A7918303E689C78E59` |
| Implementation Checklist | `F:\hrms\docs\PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md` | v2.7.1 | 44,169 / 306 | `5F0B5BDFA81F97A7717D68C3C85000CAF836DDFCE8C49C1379AD10E605DADBDB` |
| Completion | `F:\hrms\docs\PHASE_0_2_8_COMPLETION_REPORT.md` | v1.4.0 | 35,489 / 360 | `024BE8EB7C1AAD735F03312014A868514EBC5A68B7C93D455F88C779AD42565A` |
| Reconciliation | `F:\hrms\docs\PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md` | v1.3.0 | 17,983 / 220 | `75C89810EF1AC4CAAB9A2C3C44A71E6914433DFF3640827FF13573AA80460D9E` |
| Acceptance | `F:\hrms\docs\PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md` | v2.8.0 | 44,320 / 287 | `A67FFA8D135A418AC1DE1291F4927F869DCF09FD4BCF8C2D5C6FD1EB87EF849E` |

Owner Decision Record: `F:\hrms\evidence_preservation_P028_20261114_182132\P028_CLOUDINARY_LIFECYCLE_OWNER_DECISION_RECORD.md`, lines 15–24. Final Remediation Audit: `F:\hrms\docs\PHASE_0_2_8_FINAL_REMEDIATION_AUDIT_REPORT.md`, especially lines 17, 33, 61–65, 226, 233–254, 279–284.

## 3. Policy/status distinction

The owner selected **Option A — Partitioned Two-Path Cloudinary Upload Lifecycle**. Policy: committed attendance media is terminal/protected; only abandoned/uncommitted candidates may enter cleanup; ownership/reference checks precede deletion; cleanup must not delete committed attendance media. States, transactions, claims, leases, fencing, heartbeat, checks, recovery, and retries are proposed technical design unless separately proven. The two-hour threshold is a provisional filter only: age alone never proves abandonment or authorizes deletion. Implementation and runtime safety remain unverified.

## 4. Complete correction matrix

| ID | Target / location | Treatment | Owner authorization |
|---|---|---|---|
| C-01 | Completion 74 | Correct self-version | Yes |
| C-02 | Completion 135–143 | Policy/design/verification qualification | Yes |
| C-03 | Completion 345–349 | Qualify detailed addendum design | Yes |
| C-04 | Completion 301–306 | Replace readiness recommendation | Yes |
| R-01 | Reconciliation 20 | Preserve history + dated clarification | Yes |
| R-02 | Reconciliation 98–116 | Preserve history; complete safe lifecycle/SQL | Yes |
| R-03 | Reconciliation 159–175 | Replace 100% comparison claim | Yes |
| R-04 | Reconciliation 205–219 | **NO CHANGE** | No |
| A-01 | Acceptance 7 | Replace defect-free governance claim | Yes |
| A-02 | Acceptance 34–36 | Replace fully-harmonized claim | Yes |
| A-03 | Acceptance 51 | Correct Git/repository-scope claim | Yes |
| A-04 | Acceptance 60–66 | Correct own inventory metadata | Yes |
| A-05 | Acceptance 204–221 | Limit OCC claim | Yes |
| A-06 | Acceptance 99–115 | Replace DEF-01 PASS claim | Yes |
| A-07 | Acceptance 262–271 | Replace zero-defect claim | Yes |
| A-08 | Acceptance 275–287 | Replace acceptance verdict | Yes |

## 5. Completion Report corrections

### C-01
**Current (line 74):** `3. \`docs/PHASE_0_2_8_COMPLETION_REPORT.md\` — Updated to **Version 1.3.0** (this document).`  
**Replacement:** `3. \`docs/PHASE_0_2_8_COMPLETION_REPORT.md\` — Updated to **Version 1.4.0** (this document).`  
Evidence: current header/history lines 5 and 21. No historical entry is changed.

### C-02
**Current (135–143):** the current source lists partitioned states, worker UUID/lease, heartbeat/fencing, pre-deletion query, absolute deletion rule, and `NEEDS TECHNICAL VALIDATION`.  
**Complete replacement:**

```markdown
The project owner selected **OPTION A — PARTITIONED TWO-PATH CLOUDINARY UPLOAD LIFECYCLE** on 2026-11-14. This is owner-approved policy, not proof of implementation or runtime safety.
* **Proposed successful path:** `pending` $\rightarrow$ `uploading` $\rightarrow$ `committed`; committed attendance media is terminal for abandoned-upload cleanup.
* **Proposed abandoned/failed path:** only independently validated uncommitted `pending` or `failed` candidates may proceed toward `cleanup_claimed`, then `cleaned` or manual review. The two-hour threshold is a provisional filter only; age alone never proves abandonment or authorizes deletion.
* **Proposed controls:** worker UUID/lease, ownership and lease/fencing validation, heartbeat/recovery protection, immediate reference/ownership checks before deletion, and preservation/manual review for ambiguity.
* **Policy rule:** abandoned-upload cleanup must not delete committed attendance media.
* **Limit:** transaction design, state guards, implementation, races, retries, idempotency, and runtime safety remain unverified.
```

### C-03
**Current (345–349):** the addendum specifies upload token/public ID, pending intent, outside-transaction upload, parent lock, attendance insert, committed intent, worker lease fields and reference columns.  
**Complete replacement:**

```markdown
### 2. Cloudinary Upload Intent Separate Lifecycles (Owner Policy; Proposed Technical Design)
Option A is the owner-approved policy. Proposed successful path: `uploadToken` + deterministic `publicId` → `'pending'` intent → upload outside proposed DB transaction → parent-user lock, attendance insert, `'committed'` intent, commit. Committed attendance media is terminal for abandoned-upload cleanup.

Only independently validated uncommitted `'pending'`/`'failed'` candidates may be considered. The provisional two-hour threshold is a screening filter only; age alone never proves abandonment or authorizes deletion. Proposed claim fields are `cleanup_claimed`, `worker_id`, and `lease_expires_at`; ownership/worker/lease or fencing authority and references in `attendance_attendance.punch_in_photo`, `attendance_attendance.punch_out_photo`, and `accounts_employeedocument.file` must be validated before deletion. Ambiguous/inconclusive cases are preserved for manual review. The policy rule is that cleanup must not delete committed attendance media. Implementation, atomicity, races, retries, idempotency and runtime safety are unverified.
```

### C-04
**Current (301–306):** `The Phase 0.2.8 planning baseline is **fully reconciled, qualified, and mathematically verified**.` followed by `**ACCEPT Phase 0.2.8 Planning Baseline**`.  
**Replacement:**

```markdown
## 9. Project-Owner Review Status

This report records documentation findings and proposed technical design. Owner policy selection does not establish implementation, runtime safety, audit reproducibility, or phase acceptance.

### Required Project-Owner Review
1. Review planning documents and decide whether to authorize separately scoped documentation correction, implementation, validation, or audit work.
```

## 6. Reconciliation Report corrections

### R-01
**Current (line 20):** `| **1.3.0** | Nov 14, 2026 | Antigravity Senior Architect | Final Defect Closure & Harmonization: Synchronized cross-document references with Completion Report v1.4.0 (DEF-01 resolution); confirmed complete cross-document harmonization across all 5 planning documents. |`  
**Replacement passage:** retain the row verbatim, followed by:

```markdown
| **Correction note — 2026-11-14** | Nov 14, 2026 | Project-owner review clarification | The v1.3.0 row is preserved as its historical claim. Option A was separately selected by the project owner on 2026-11-14. Records do not establish sequencing between same-date records. Policy selection does not prove implementation, runtime safety, or complete independent verification. |
```

### R-02
**Current, verbatim (98–116):**

````markdown
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
````

**Replacement:**

````markdown
### Inconsistency 2: Cloudinary Upload Intent State Machine & Deletion Safety (Historical Defect; Owner-Selected Policy)
* **Historical evidence:** The former linear wording is preserved as defect history and is not current instruction.
* **Owner policy / proposed design:** Option A protects committed attendance media. Successful design path is `pending` → upload outside proposed DB transaction → parent lock, attendance association, `committed`, commit. Only independently validated uncommitted candidates can be considered; the two-hour threshold is a provisional filter only and age alone never authorizes deletion. Validate worker ownership and lease/fencing authority.
* **Required pre-deletion check:**
  ```sql
  SELECT id FROM attendance_attendance 
  WHERE punch_in_photo LIKE CONCAT('%', :publicId, '%') 
     OR punch_out_photo LIKE CONCAT('%', :publicId, '%')
  UNION ALL
  SELECT id FROM accounts_employeedocument 
  WHERE file LIKE CONCAT('%', :publicId, '%');
  ```
* **Ambiguity rule:** Require reference/ownership checks; preserve and manually review uncertain state, eligibility, ownership, lease/fencing, or reference evidence.
* **Limit:** no SQL execution, implementation, atomicity, race, retry/idempotency, or runtime-safety proof is claimed.
````

### R-03
**Current (159–175):** header `## 4. Confirmation of Cross-Document Agreement`, followed by `all governing planning documents are 100% harmonized` and five entries.  
**Replacement:**

```markdown
## 4. Current Five-Document Comparison and Evidence Classification

This comparison is not a complete five-document OCC inventory, independent audit reproducibility verification, implementation/runtime-safety verification, or acceptance.

1. `PHASE_0_FINAL_DECISION_REGISTER.md` v2.7.1 — 489 lines, 40,701 bytes, SHA-256 `26320e36175631fb17693e61c4dde5c876377248c8dac0a7918303e689c78e59`; Section 3.4. **Directly inspected current file / metadata directly calculated.** Does not establish implementation/runtime safety.
2. `PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md` v2.7.1 — 306 lines, 44,169 bytes, SHA-256 `5f0b5bdfa81f97a7717d68c3c85000caf836ddfce8c49c1379ad10e605dadbdb`; lines 81, 165–168, 209–220. **Directly inspected current file / metadata directly calculated.** Does not prove tasks ran/passed.
3. `PHASE_0_2_8_COMPLETION_REPORT.md` v1.4.0 — 360 lines, 35,489 bytes, SHA-256 `024be8eb7c1aad735f03312014a868514ebc5a68b7c93d455f88c779ad42565a`. **Directly inspected current file / metadata directly calculated.** No implementation proof.
4. `PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md` v1.3.0 — 220 lines, 17,983 bytes, SHA-256 `75c89810ef1ac4caab9a2c3c44a71e6914433dff3640827ff13573aa80460d9e`. **Directly inspected; historical claim retained from earlier report.** Historical claims are not independently verified.
5. `PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md` v2.8.0 — 287 lines, 44,320 bytes, SHA-256 `a67ffa8d135a418ac1de1291f4927f869dcf09fd4bcf8c2d5c6fd1eb87ef849e`. **Directly inspected / metadata directly calculated; fifth-document taxonomy not independently verified.** Its table covers four external documents only.
```

### R-04 — NO CHANGE
**Current (205–219):** the section expressly limits itself to no application-code, database, dependency, infrastructure, service, or implementation-phase modifications. It does not assert a clean Git state. No correction is supported.

## 7. Acceptance Report corrections

### A-01
**Current (7):** `**Governance Decision:** All 5 documents fully harmonized; Phase 0.2.8 is defect-free and ready for project-owner acceptance sign-off`  
**Replacement:** `**Governance Status:** Option A is owner-selected policy direction. Phase 0.2.8 remains OPEN / NOT ACCEPTED; documentation does not prove implementation, runtime safety, audit reproducibility, or acceptance readiness.`

### A-02
**Current (34–36):** heading `Fully Harmonized & Ready for Owner Acceptance` and `This task has resolved all identified documentation defects and achieved genuine cross-document consistency.`  
**Replacement:**

```markdown
### 1.1 Governance Status: OPEN / NOT ACCEPTED
Phase 0.2.8 is a documentation-correction and evidence-review activity.
> **Phase 0.2.8 remains OPEN / NOT ACCEPTED pending explicit project-owner acceptance.** Policy/current wording does not establish complete inventory, audit reproducibility, implementation, or runtime safety.
```

### A-03
**Current (51):** `| Git Actions (Commit, Push, Merge, Branch Switch) | **STRICTLY PROHIBITED** | Exactly zero Git commits or working-tree alterations | **PASS** |`  
**Replacement:**

```markdown
| Git Actions (Commit, Push, Merge, Branch Switch) | **STRICTLY PROHIBITED** | Root `F:\hrms` has no `.git`; root history/working tree are **NOT VERIFIED**. The separate `F:\hrms\hrms_mobile` state is reported by Final Remediation Audit lines 11, 13, 33, 284 as pre-existing staged additions, staged modifications/deletions, and untracked files on unborn `master`; that historical report is not proof of changes during this task or a clean repository. No commit/push/merge/branch-switch is asserted. Filesystem documentation edits are not Git commits or Git-worktree evidence. | **LIMITED — NOT INDEPENDENTLY VERIFIED** |
```

### A-04
**Current (66):** `| 5 | ... | **v2.8.0** | Current Rebuilt File | — | Authorized Verification Document | Opened & Verified | Updated to v2.8.0 |`  
**Replacement:** `| 5 | \`docs/PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md\` | \`F:\hrms\docs\PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md\` | **v2.8.0** | 287 lines | 44,320 B | Acceptance Verification Document | Opened & Verified | Current metadata recorded; not proof of self-inventory. |`

### A-05
**Current (204–221):** claims 78 entries are an exhaustiveness invariant and `100% Accounted For & Classified`.  
**Replacement:**

```markdown
### 4.1 Existing OCC-001–OCC-078 Table: Reported Scope and Limitation
The earlier Final Remediation Audit Report reports 78 rows, 78 unique identifiers, zero duplicates, gaps, extras, and source-line contradictions for existing OCC-001–OCC-078. This package does not reperform that audit. Those reported results concern identifier integrity/four-external-document entries, not complete five-document coverage. The Acceptance Report itself has no independently established OCC taxonomy. The duplicated display block in the earlier audit is not evidence that this table has duplicate identifiers. No OCC-079 is assigned.
```

### A-06
**Current (114–115):** `Both governing documents now consistently enforce...` and `**PASS** (Defect DEF-01 resolved; 100% consistent across all documents).`  
**Replacement:** `**DOCUMENTATION-LEVEL POLICY ALIGNMENT RECORDED; IMPLEMENTATION AND RUNTIME SAFETY NOT VERIFIED.** Historical linear excerpts remain defect evidence; no atomicity, race, retry/idempotency or complete-inventory proof is claimed.`

### A-07
**Current (262–271):** `All previously identified documentation defects have been resolved` and `**Active Defect Count:** **0**`.  
**Replacement:**

```markdown
## 7. Status of Previously Disclosed Defects and Evidence Limitations
| Finding | Current evidence-based status |
|---|---|
| DEF-01 | Policy/documentation alignment only; implementation and runtime safety are **NOT VERIFIED**. |
| DEF-02 | Current formatting may be corrected; no defect-free five-document/runtime result follows. |
| OCC | Existing four-document identifiers only; fifth-document completeness unresolved. |
| Audit integrity | Historical original/mutated outputs remain preserved; not resolved here. |

No zero-active-defect count is claimed. Phase 0.2.8 remains **OPEN / NOT ACCEPTED**.
```

### A-08
**Current (275–287):** `100% HARMONIZED — READY FOR OWNER ACCEPTANCE` and `100% COMPLETE AND DEFECT-FREE`.  
**Replacement:**

```markdown
## 8. Current Evidence-Based Status
Option A is owner policy. Documentation correction does not establish implementation, atomicity, race prevention, retry/idempotency, runtime safety, audit reproducibility, or complete five-document inventory.
> **Phase 0.2.8 remains OPEN / NOT ACCEPTED. No correction, code, database, infrastructure, Git action, implementation, or independent audit is authorized by this report. STOP and await explicit project-owner authorization.**
```

## 8. Metric taxonomy, chronology, and remaining risks

Preserve current metric taxonomy: P95 < 500 ms is a Provisional Planning Baseline; P99/HTTP 409 are distributions to measure; 5xx <0.1%, 100–250 in-flight, 150–300 RPS, CPU <75%, PM2 <800 MB RSS, loop P99 <50 ms, DB ≤60 subject to quota, Redis P99 <5 ms are Proposed Engineering Targets; 5,000/1,000 VUs is Future Staging Acceptance Target; Phase 0 results are zero. Do not conflate Redis latency and event-loop lag.

The v1.1 uploaded-copy reference `2563e5c17b191fd3703652777f99c02f6641c861b7c78af73edd71fef719f57f` differs from current-path `3E7DD2E58B037BA3B3C796CFE49E0B81E1198A8ADA553D8584EADC76A8C0323F`; original uploaded artifact unavailable, so no inference follows. Preserve historical linear and original/mutated audit evidence and unauthorized-change disclosures.

## 9. Final conclusion

v1.5 is planning-only. No target report, earlier plan, application code, database, infrastructure, or Git repository was modified; no SQL query, implementation, independent audit, or acceptance occurred. Owner policy is not runtime proof. Separate explicit authorization is required before applying any correction; separate acceptance is required before closing the phase.
