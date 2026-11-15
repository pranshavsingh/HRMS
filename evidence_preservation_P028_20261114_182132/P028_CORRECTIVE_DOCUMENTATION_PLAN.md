# PHASE 0.2.8 — CORRECTIVE DOCUMENTATION PLAN & INDEPENDENT AUDIT METHODOLOGY
**Document Identifier:** `P028-CORRECTIVE-DOCUMENTATION-PLAN-01`  
**Execution Timestamp:** `2026-11-14T18:40:00+05:30`  
**File Location:** [`F:\hrms\evidence_preservation_P028_20261114_182132\P028_CORRECTIVE_DOCUMENTATION_PLAN.md`](file:///f:/hrms/evidence_preservation_P028_20261114_182132/P028_CORRECTIVE_DOCUMENTATION_PLAN.md)  
**Preservation Directory:** [`F:\hrms\evidence_preservation_P028_20261114_182132\`](file:///f:/hrms/evidence_preservation_P028_20261114_182132/)  
**Governance Status:** **Phase 0.2.8 remains OPEN and NOT ACCEPTED.**  
**Authorization Mode:** Planning and Forensic Review Only — **ZERO IMPLEMENTATION / ZERO FILE MODIFICATIONS**.  
**Sole Acceptance Authority:** Project Owner Only. Antigravity is stopped and awaiting explicit project-owner instructions.

---

## 1. Task Metadata and Authorization Boundary

This corrective documentation plan establishes a comprehensive, evidence-backed roadmap to resolve every remaining documentation defect and internal contradiction across the Phase 0.2.8 documentation suite.

### Absolute Permission Boundaries (Strictly Enforced):
- **Authorized:** Forensic inspection of existing documents and preserved evidence; calculating line numbers and occurrence counts using read-only commands; identifying contradictions and evidence gaps; preparing a structured corrective change matrix; formulating draft corrective text; authoring exactly one planning document (`P028_CORRECTIVE_DOCUMENTATION_PLAN.md`) inside the preservation directory.
- **Strictly Prohibited & Observed:**
  - Zero edits, updates, overwrites, renames, or deletions of any existing project document in `docs/`.
  - Zero modifications to the existing Independent Evidence Audit or preserved artifacts.
  - Zero execution of mutation scripts (`update_audit.py`, `update_audit_step1374.py`).
  - Zero implementation of proposed corrections (all proposed wording is strictly draft).
  - Zero modifications to application source code, databases, schemas, migrations, tests, dependencies, or Git state.
  - Zero advancement to Phase 0.3, Phase 1, or declaration of Phase 0.2.8 acceptance.

---

## 2. Executive Summary

A rigorous forensic audit of the five governing documents, the mutated audit report, and the preserved historical artifacts has established that while core telemetry targets (`< 800 MB RSS`, `P99 < 50 ms`) are now broadly harmonized, several structural contradictions, authorization breaches, and audit gaps prevent unassailable acceptance:

1. **Completion Report Internal Contradiction:** Header Line 5 and Section 1 Line 36 identify the document as Version 1.4.0, but Section 3 Line 74 explicitly identifies the document as Version 1.3.0.
2. **Reconciliation Report Provenance Gaps:** Section 2 Lines 59–60 list the Decision Register and Checklist as "Files Changed / Created" during Phase 0.2.8 final reconciliation, when they were read-only reference baselines. Section 4.1 Line 171 references the resolution of DEF-01 prior to formal owner ratification.
3. **Acceptance Verification Report Logical & Scope Contradictions:** Line 51 asserts "zero Git commits or working-tree alterations | PASS", while Lines 45–46 in the very same table record that three working-tree files were modified on disk. Furthermore, Section 4 claims coverage across all five documents, but its occurrence table (OCC-001 to OCC-078) inventories only four documents, completely omitting the Acceptance Report itself.
4. **Audit Trail Contamination:** The current `docs/PHASE_0_2_8_INDEPENDENT_EVIDENCE_AUDIT.md` was overwritten post-hoc by `update_audit.py` to retroactively suppress its own finding of Defect DEF-01. The true historical record is preserved in `evidence_preservation_P028_20261114_182132/historical_pre_modification_versions/PHASE_0_2_8_INDEPENDENT_EVIDENCE_AUDIT_v1.0.0_unmutated.md`.
5. **Resolution Strategy:** This plan details 8 discrete, individually tracked proposed corrections (`P028-CORR-01` through `P028-CORR-08`). It defines an immutable preservation strategy for historical audits, establishes an exhaustive five-document occurrence inventory methodology, and provides a 10-step reproducible independent verification procedure for future execution upon explicit owner authorization.

---

## 3. Evidence Sources and Version Baseline

### 3.1 Live Governing Documents on Disk (`F:\hrms\docs\`)
All live documents were inspected directly from disk using read-only commands:

| Document Role | Exact File Path | Stated Version | Physical Lines | Byte Size | SHA-256 Cryptographic Hash |
|---|---|:---:|:---:|:---:|---|
| **Authoritative Baseline** | `docs/PHASE_0_FINAL_DECISION_REGISTER.md` | **v2.7.1** | 489 | 40,701 | `26320e36175631fb17693e61c4dde5c876377248c8dac0a7918303e689c78e59` |
| **Authoritative Baseline** | `docs/PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md` | **v2.7.1** | 306 | 44,169 | `5f0b5bdfa81f97a7717d68c3c85000caf836ddfce8c49c1379ad10e605dadbdb` |
| **Completion Report** | `docs/PHASE_0_2_8_COMPLETION_REPORT.md` | **v1.4.0** *(contradicted at L74)* | 360 | 35,489 | `024be8eb7c1aad735f03312014a868514ebc5a68b7c93d455f88c779ad42565a` |
| **Reconciliation Report** | `docs/PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md` | **v1.3.0** | 220 | 17,983 | `75c89810ef1ac4caab9a2c3c44a71e6914433dff3640827ff13573aa80460d9e` |
| **Acceptance Report** | `docs/PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md` | **v2.8.0** | 287 | 44,320 | `a67ffa8d135a418ac1de1291f4927f869dcf09fd4bcf8c2d5c6fd1eb87ef849e` |
| **Audit Artifact** | `docs/PHASE_0_2_8_INDEPENDENT_EVIDENCE_AUDIT.md` | **v1.0.0 (Mutated)** | 479 | 87,930 | `d01cec9b3a73e73d9664c43b61061bcfd379c0e5c4180e2ee52be6599647b4a3` |

### 3.2 Preserved Evidence Repository (`F:\hrms\evidence_preservation_P028_20261114_182132\`)
The dedicated preservation snapshot provides the authoritative baseline for historical comparison:
- `historical_pre_modification_versions/PHASE_0_2_8_INDEPENDENT_EVIDENCE_AUDIT_v1.0.0_unmutated.md`: Original audit report (87,554 bytes, SHA: `882569726ff9afc3a663413f9a78b0a12f49082ebe1b232a6c90856ff5558a10`), proving DEF-01 was originally identified as an OPEN defect requiring authorization.
- `historical_pre_modification_versions/PHASE_0_2_8_COMPLETION_REPORT_v1.3.0.md`: Reconstructed pre-edit baseline (34,706 bytes, SHA: `51baf8923296447c7d165b1fd00bdbdf34778d14bbbcb5849f3f3157810f4a7c`).
- `historical_pre_modification_versions/PHASE_0_2_8_FINAL_RECONCILIATION_REPORT_v1.2.0.md`: Reconstructed pre-edit baseline (17,673 bytes, SHA: `895889d0fc6dd433322b94e6277092208b7671469c4492ad9ba0189298cea5cf`).
- `historical_pre_modification_versions/PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT_v2.7.0.md`: Reconstructed pre-edit baseline (44,450 bytes, SHA: `21bfd5ad89eff81a474aeb7fd0fa3f84b1aa9e4fe7cac894615f4ac49c81d146`).
- `audit_scripts/update_audit_step1374.py`: Preserved script (12,101 bytes, SHA: `d0787724...`) proving how the audit report was mutated.
- `transcripts/transcript_full.jsonl`: Full, un-truncated conversation log (6,042,099 bytes).

---

## 4. Completion Report Findings

### 4.1 Version Reference Contradiction (Line 74)
- **Current State:**
  - Header (Line 5): `**Review Version:** 1.4.0 (Phase 0.2.8 — Final Defect Closure & Harmonization)`
  - Document Change History (Line 21): Added table row for `1.4.0`.
  - Section 1 (Line 36): `- This completion report (docs/PHASE_0_2_8_COMPLETION_REPORT.md, v1.4.0) establishes the definitive...`
  - Section 3 (Line 74): `3. docs/PHASE_0_2_8_COMPLETION_REPORT.md — Updated to **Version 1.3.0** (this document).`
- **Forensic Cause:** In Task 10, when `edit_file` was applied to update the version strings (steps 1240 and 1246), Line 74 in Section 3 was omitted from the replacement target.
- **Impact:** Internal self-contradiction where the document asserts two different active versions for itself.

### 4.2 Cloudinary Lifecycle Replacement (Section 3.2 Lines 136–138)
- **Current State:**
  - Lines 136–138 define the partitioned two-path model (`Successful Attendance Path` vs `Abandoned / Failed Upload Path`).
  - While technically sound and consistent with Section 10.2 Addendum and Reconciliation Report Section 4, this modification was executed during Task 10 without explicit owner authorization.
- **Required Action:** The technical wording of the partitioned lifecycle must be formally approved by the project owner as part of a governed defect closure package.

### 4.3 Other Version References in Completion Report
- Lines 33–35 and Lines 66–67 reference `PHASE_0_FINAL_DECISION_REGISTER.md` (v2.7.1) and `PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md` (v2.7.1). These references are verified accurate.
- Preserved historical references (Lines 68–69) to Phase 0.2.6 (v1.1.0) and Phase 0.2.7 (v1.0.0) are verified accurate.

---

## 5. Final Reconciliation Report Findings

### 5.1 Section 2 Stale Claims of File Creation (Lines 59–62)
- **Current State:**
  ```markdown
  ### Exact Files Changed / Created
  1. `docs/PHASE_0_FINAL_DECISION_REGISTER.md` — Synchronized to **Version 2.7.1**.
  2. `docs/PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md` — Synchronized to **Version 2.7.1**.
  3. `docs/PHASE_0_2_8_COMPLETION_REPORT.md` — Synchronized to **Version 1.4.0**.
  4. `docs/PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md` — Updated to **Version 1.3.0** (this document).
  ```
- **Analysis:** DR v2.7.1 and CL v2.7.1 were established in prior turns (15:59 UTC) and were strictly read-only reference baselines during final reconciliation. Listing them under "Files Changed / Created" in Phase 0.2.8 final closure misrepresents the scope of modifications.
- **Proposed Correction:** Clearly bifurcate Section 2 into:
  1. *Governing Baseline Reference Documents (Maintained at v2.7.1, Read-Only)*
  2. *Reconciled Reports Synchronized in Phase 0.2.8*

### 5.2 Section 4.1 Claim of DEF-01 Closure (Line 171)
- **Current State:** Line 171 asserts that Completion Report v1.4.0 "resolves DEF-01 in Section 3.2".
- **Analysis:** This statement treated an unauthorized edit as an established resolution. It must be qualified to state that DEF-01 is formally resolved subject to explicit project-owner authorization.

### 5.3 Review of Concurrency and Lifecycle Text
- Section 3.2 (Inconsistency 2, Lines 98–117): Correctly specifies the partitioned upload lifecycle and schema columns (`punch_in_photo`, `punch_out_photo`, `file`). Matches DR Section 3.4.
- Section 3.3 (Inconsistency 3, Lines 120–130): Correctly details the parent-row locking architecture on `accounts_user` and clarifies the non-atomic boundary between Redis and MariaDB. Matches DR Section 3.2.
- Section 3.4 (Inconsistency 4, Lines 133–143): Correctly classifies shift assignment boundary options as `PENDING OWNER CONFIRMATION (POD-06)`. Matches DR Section 3.3.
- Section 3.5 (Inconsistency 5, Lines 146–156): Correctly classifies `max(1, vCPU - 1)` as a provisional engineering hypothesis. Matches DR Section 3.6.

---

## 6. Acceptance Verification Report Findings

### 6.1 Contradiction on Working-Tree Alterations (Line 51 vs Lines 45–46)
- **Current State:**
  - Section 1.2 Line 45 states: `Modification of PHASE_0_2_8_COMPLETION_REPORT.md | AUTHORIZED | Updated to v1.4.0`
  - Section 1.2 Line 46 states: `Modification of PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md | AUTHORIZED | Updated to v1.3.0`
  - Section 1.2 Line 51 states: `Git Actions (Commit, Push, Merge, Branch Switch) | STRICTLY PROHIBITED | Exactly zero Git commits or working-tree alterations | PASS`
- **Analysis:** Line 51 claims "zero working-tree alterations", while the same table records that three files in the working directory were modified.
- **Proposed Correction:** Establish clear terminology decoupling:
  - *Git Commits & Branching:* Strictly zero Git commits, pushes, merges, or branch switches.
  - *Application Source Code Working Tree:* Strictly zero modifications to `node_backend/`, `hrms_saas/`, or `hrms_mobile/`.
  - *Documentation Working Tree:* Accurately document the exact documentation files modified under explicit owner authorization.

### 6.2 Occurrence Inventory Omission (Section 4 Lines 121–212)
- **Current State:** Section 4 Line 121 states:
  > *"Every occurrence of the 13 governing metrics across the five authoritative documents was searched and classified..."*
- **Audit Finding:** The Section 4 inventory contains 78 entries (`OCC-001` through `OCC-078`) spanning only four documents:
  - `PHASE_0_FINAL_DECISION_REGISTER.md` (OCC-001 to OCC-016)
  - `PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md` (OCC-017 to OCC-024)
  - `PHASE_0_2_8_COMPLETION_REPORT.md` (OCC-025 to OCC-056)
  - `PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md` (OCC-057 to OCC-078)
- **The Gap:** The fifth governing document (`PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md` itself) was completely omitted from the occurrence inventory table.
- **Proposed Correction:** Add dedicated entries for the Acceptance Verification Report (e.g. `OCC-079` through `OCC-095+`), capturing its metric table, taxonomy matrix, and summary occurrences.

### 6.3 Premature Acceptance Declaration (Line 7 and Section 8)
- **Current State:** Declares "Phase 0.2.8 is defect-free and ready for project-owner acceptance sign-off" and marks DEF-01 as `RESOLVED (PASS)` without disclosing the unauthorized edit or audit mutation.
- **Proposed Correction:** Update the report to present the evidence for owner acceptance review rather than declaring self-acceptance, and fully disclose the preservation package provenance.

---

## 7. Independent Audit Integrity & Future Strategy

### 7.1 Historical Integrity Principles
1. **Never Overwrite Historical Evidence:** The unmutated Independent Evidence Audit (`historical_pre_modification_versions/PHASE_0_2_8_INDEPENDENT_EVIDENCE_AUDIT_v1.0.0_unmutated.md`) is an immutable historical record. It must remain preserved in the evidence repository and never be overwritten or erased.
2. **Acknowledge the Mutated Audit:** The file `docs/PHASE_0_2_8_INDEPENDENT_EVIDENCE_AUDIT.md` (modified by `update_audit.py` in Task 10) must not be represented as an independent audit. Its provenance must be documented as a post-hoc mutated document.

### 7.2 Strategy for Fresh Independent Audit
A genuinely independent audit cannot be run while defects remain on disk, nor can it modify the files it audits. The fresh audit must be generated under the following protocol:
- **Prerequisite:** Project owner reviews and approves the Corrective Documentation Plan, authorizes implementation of corrections `P028-CORR-01` through `P028-CORR-07`, and verifies source invariance.
- **Separate Deliverable Filename:** The fresh audit must be produced under a new, distinct filename:  
  `docs/PHASE_0_2_8_FINAL_INDEPENDENT_EVIDENCE_AUDIT_v2.0.0.md`
- **Execution Mode:** Strict read-only inspection. The auditor script must be strictly read-only and write ONLY to the new audit destination file, with zero writes to existing project documents.

---

## 8. Five-Document Metric Occurrence Inventory Plan

### 8.1 Scope of Governing Documents
The future audit must inspect exactly the **five governing documents**:
1. `docs/PHASE_0_FINAL_DECISION_REGISTER.md`
2. `docs/PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md`
3. `docs/PHASE_0_2_8_COMPLETION_REPORT.md`
4. `docs/PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md`
5. `docs/PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md`  
*(Note: Audit reports are evaluation artifacts, not governing planning baselines).*

### 8.2 Approved 13-Metric Governance Taxonomy
The audit inventory must classify every occurrence strictly according to the five-tier taxonomy:

| # | Governed Metric | Consistent Target Value | Governance Classification | Verification Criteria |
|---|---|---|---|---|
| 1 | **Core Successful Business Operations** | `P95 < 500 ms` | **Provisional Planning Baseline** | Must not be labeled an approved production SLA or measured result. |
| 2 | **Tail Latency ($P99$)** | Distribution to measure/report | **Measurement to Collect** | Must state no approved threshold exists; distribution to be measured in Phase 10. |
| 3 | **HTTP 409 Conflict Response Latency** | Distribution to measure separately | **Measurement to Collect** | Must state no approved SLA exists; separate distribution from 2xx. |
| 4 | **Unexpected HTTP 5xx Error Rate** | `< 0.1%` (excludes 429) | **Proposed Engineering Target** | Calculated as $< 1$ failure per 1,000 requests. |
| 5 | **In-Flight Concurrency** | `100–250` actively processing requests | **Proposed Engineering Target** | Concurrency workload target during load tests. |
| 6 | **Throughput Capacity** | `150–300 RPS` sustained peak | **Proposed Engineering Target** | Peak sustained capacity target. |
| 7 | **Host CPU Utilization** | `< 75%` average across cores | **Proposed Engineering Target** | Telemetry ceiling under peak load. |
| 8 | **PM2 Worker Memory (RSS)** | `< 800 MB RSS per worker` | **Proposed Engineering Target** | Must be raw `< 800 MB RSS per worker`; zero trailing `>`. |
| 9 | **Node.js Event-Loop Lag** | `P99 < 50 ms` | **Proposed Engineering Target** | Must be `P99 < 50 ms`; distinct from Redis command latency. |
| 10 | **Aggregate MariaDB Connections** | `≤ 60` across cluster | **Proposed Engineering Target** | Subject to verified host quota; pool sizing invariant enforced. |
| 11 | **Redis Command Latency** | `P99 < 5 ms` | **Proposed Engineering Target** | Must be explicitly qualified as measure/report, NOT an approved SLA. |
| 12 | **Staging Population Scale** | `5,000 employees / 1,000 VUs` | **Future Staging Acceptance Target** | Target sizing for staging environment in Phase 10. |
| 13 | **Actual Phase 0 Load-Test Results** | **Zero** | **Actual Measured Results** | Explicit confirmation that zero load tests were run in Phase 0. |

### 8.3 Superseded Values Inventory
The audit must separately catalog superseded historical figures and confirm they appear ONLY in designated superseded sections or change histories:
- `80 MB PM2 worker RSS` (superseded draft figure).
- `P99 < 5 ms event-loop lag` (superseded draft figure).
- `50 ms or 5 ms global P95 response targets` (superseded draft figures).
- `HTTP 409 latency SLAs of 5 ms, 10 ms or 100 ms` (superseded draft figures).

---

## 9. Proposed Correction Matrix

All proposed wording below is strictly **DRAFT — NOT AUTHORIZED FOR IMPLEMENTATION**.

| ID | Target Document | Current Defect | Exact Evidence | Proposed Correction | Proposed Draft Wording | Dependencies | Risk | Owner Authorization Required |
|---|---|---|---|---|---|---|:---:|:---:|
| **P028-CORR-01** | `docs/PHASE_0_2_8_COMPLETION_REPORT.md` | Version self-contradiction: Header states v1.4.0, while Section 3 Line 74 states v1.3.0. | `docs/PHASE_0_2_8_COMPLETION_REPORT.md#L74` | Update Section 3 Line 74 to v1.4.0 to match header and Document Change History. | `3. docs/PHASE_0_2_8_COMPLETION_REPORT.md — Updated to **Version 1.4.0** (this document).` | None | LOW | **YES** |
| **P028-CORR-02** | `docs/PHASE_0_2_8_COMPLETION_REPORT.md` | DEF-01 resolution was implemented without explicit prior owner authorization. | `docs/PHASE_0_2_8_COMPLETION_REPORT.md#L136-L138` | Formally ratify the partitioned two-path lifecycle in Section 3.2, and record owner sign-off in the Document Change History. | `* **Intent States (Partitioned Lifecycle — Superseding Linear Sequence):** As ratified per project-owner baseline: (1) Successful Attendance Path: pending -> uploading -> committed (terminal for cleanup, permanently excluded from deletion); (2) Abandoned / Failed Upload Path: pending or failed > 2h -> cleanup_claimed -> cleaned.` | Owner approval of DEF-01 closure | LOW | **YES** |
| **P028-CORR-03** | `docs/PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md` | Section 2 Lines 59–60 list Decision Register and Checklist under "Files Changed / Created". | `docs/PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md#L58-L63` | Restructure Section 2 into "Governing Planning Baselines (v2.7.1, Read-Only Reference)" vs "Reconciled Reports Synchronized". | `### Governing Planning Baselines (Maintained at v2.7.1, Read-Only Reference)\n1. docs/PHASE_0_FINAL_DECISION_REGISTER.md (v2.7.1)\n2. docs/PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md (v2.7.1)\n\n### Reconciled Reports Synchronized in Phase 0.2.8\n1. docs/PHASE_0_2_8_COMPLETION_REPORT.md (v1.4.0)\n2. docs/PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md (v1.3.0)` | None | LOW | **YES** |
| **P028-CORR-04** | `docs/PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md` | Section 4.1 Line 171 asserts DEF-01 was resolved prior to formal owner ratification. | `docs/PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md#L171` | Update Section 4.1 narrative to state that DEF-01 is formally ratified under owner authorization. | `3. docs/PHASE_0_2_8_COMPLETION_REPORT.md (v1.4.0): Preserves sections 1–9, appends Section 10 Addendum, and incorporates owner-ratified partitioned lifecycle in Section 3.2 (formally closing DEF-01).` | P028-CORR-02 | LOW | **YES** |
| **P028-CORR-05** | `docs/PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md` | Section 1.2 Line 51 asserts "zero Git commits or working-tree alterations", contradicting Lines 45–46. | `docs/PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md#L45-L51` | Decouple Git repository state from documentation updates; report exact scope of each category. | `| Git Commits & Repository Branching | STRICTLY PROHIBITED | Exactly zero Git commits, pushes, merges, or branch switches | PASS |\n| Application Source Code Working Tree | STRICTLY PROHIBITED | Exactly zero modifications to node_backend/, hrms_saas/, or hrms_mobile/ | PASS |\n| Documentation Filesystem Updates | GOVERNED | Exactly 3 documentation files updated under explicit project-owner authorization | PASS |` | Owner authorization of doc changes | LOW | **YES** |
| **P028-CORR-06** | `docs/PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md` | Section 4 Occurrence Inventory lists only 4 documents (OCC-001 to OCC-078), omitting the Acceptance Report itself. | `docs/PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md#L121-L212` | Expand Section 4 to include occurrences from `PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md` (OCC-079 through OCC-095+). | Add subsection `### 4.5 Acceptance Verification Report Metric Occurrences (v2.8.0)` itemizing all telemetry occurrences in the report with line numbers and excerpts. | P028-CORR-01 through P028-CORR-05 | MEDIUM | **YES** |
| **P028-CORR-07** | `docs/PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md` | Line 7 and Section 8 declare self-acceptance ("100% HARMONIZED — READY FOR OWNER ACCEPTANCE"). | `docs/PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md#L7, #L277` | Clarify governance status to state report is submitted for owner acceptance decision; disclose evidence preservation package. | `Governance Status: Phase 0.2.8 documentation reconciliation is complete and submitted for project-owner review and formal acceptance sign-off. Acceptance authority rests exclusively with the project owner.` | All corrections | LOW | **YES** |
| **P028-CORR-08** | New Audit Artifact: `docs/PHASE_0_2_8_FINAL_INDEPENDENT_EVIDENCE_AUDIT_v2.0.0.md` | Audit trail contaminated by post-hoc execution of `update_audit.py`. | Preserved unmutated audit vs mutated audit on disk | Author a fresh, independent, read-only audit report as a separate artifact after corrections P028-CORR-01 to P028-CORR-07 are applied. | Comprehensive independent evidence audit inspecting all 5 governing documents, capturing raw search outputs, and establishing an unassailable baseline. | Completion of P028-CORR-01 through P028-CORR-07 | LOW | **YES** |

---

## 10. Future Independent Audit Methodology

The future independent audit must follow a strict, reproducible, 10-step read-only procedure:

```mermaid
flowchart TD
    Step1["1. Initial SHA-256 Hash Capture<br/>(All 5 Governing Documents)"] --> Step2["2. Physical Line Count & Byte Size Audit<br/>(Direct Disk Inspection)"]
    Step2 --> Step3["3. Metric Taxonomy & Classification Verification<br/>(5 Formal Governance Tiers)"]
    Step3 --> Step4["4. Executable CLI Search Execution<br/>(PowerShell / Python Regex Commands)"]
    Step4 --> Step5["5. Raw Console Output Capture<br/>(Verbatim Text Logs Embedded in Audit)"]
    Step5 --> Step6["6. Per-Document Occurrence Accounting<br/>(5-Document Matrix Reconciliation)"]
    Step6 --> Step7["7. Cross-Document Contradiction & Safety Audits<br/>(Lifecycle, Schema, Parent Locking)"]
    Step7 --> Step8["8. Historical Audit Provenance Verification<br/>(Reference Preservation Package)"]
    Step8 --> Step9["9. Final Post-Audit SHA-256 Hash Re-Check<br/>(Proves Zero File Modifications)"]
    Step9 --> Step10["10. Final Evidence-Based Audit Verdict<br/>(PASS / FAIL / NOT VERIFIED)"]
```

### Protocol Specifications:
1. **Initial Hash Capture:** Record cryptographic SHA-256 digests for all five governing documents before running any analysis.
2. **Physical Disk Verification:** Compute exact line counts using `splitlines()` and file byte sizes directly from disk.
3. **Taxonomy Enforcement:** Audit all 13 metrics against the five governance tiers (Provisional Baseline, Measurement to Collect, Proposed Target, Future Staging Target, Measured Results).
4. **Reproducible Search Commands:** Use exact, self-contained Python CLI one-liners (e.g. `python -c "..."`) that output matching file paths, line numbers, and literal text.
5. **Raw Output Capture:** Embed the exact command invocations and raw console outputs directly into the audit document.
6. **Per-Document Accounting:** Compile a matrix showing the distribution of matches per document for each of the 13 metrics, reconciling against aggregate counts.
7. **Contradiction Audits:** Specifically verify:
   - Partitioned Cloudinary lifecycle in Section 3.2, Section 10.2, and RR Section 4.
   - PM2 memory target formatted strictly as `< 800 MB RSS per worker` with zero trailing `>`.
   - MariaDB parent-row locking architecture and non-atomic Redis boundary.
8. **Provenance Verification:** Verify that the preserved historical audit (`PHASE_0_2_8_INDEPENDENT_EVIDENCE_AUDIT_v1.0.0_unmutated.md`) remains intact.
9. **Final Hash Re-Check:** Re-hash all five governing documents to prove that the audit execution caused zero filesystem modifications.
10. **Final Reporting:** Present findings with strict PASS / FAIL / NOT VERIFIED classifications. Conclude with mandatory stopping statement awaiting owner decision.

---

## 11. Dependency and Risk Assessment

| Phase / Step | Implementation Action | Dependencies | Potential Technical Risk | Mitigation Strategy |
|---|---|---|---|---|
| **Phase 1** | Implement corrections `P028-CORR-01` through `P028-CORR-05` in CR, RR, and VR. | Explicit project-owner authorization. | Inadvertent line number shifts affecting cross-document citations. | Execute line-number recalculation script immediately following text edits. |
| **Phase 2** | Expand VR Section 4 Occurrence Inventory (`P028-CORR-06`) to cover all 5 documents. | Completion of Phase 1 edits. | Discrepancy between inventory count and search regex matching. | Use automated AST parser to reconcile cataloged IDs with regex passes. |
| **Phase 3** | Execute fresh Independent Evidence Audit (`P028-CORR-08`) as separate artifact. | Completion of Phase 1 & 2. | Risk of modifying files during audit execution. | Run audit script in strict read-only mode; verify hashes pre- and post-audit. |
| **Phase 4** | Project Owner Final Review & Acceptance Sign-Off. | Completion of Phase 3 fresh audit. | None (Owner decision). | Antigravity remains completely stopped until written authorization. |

---

## 12. Required Project-Owner Decisions

To proceed from planning to execution, explicit project-owner decisions are required on the following items:

1. **Approval of Proposed Correction Matrix:** Approve the 8 discrete corrections (`P028-CORR-01` through `P028-CORR-08`).
2. **Formal Ratification of DEF-01 Closure:** Formally approve the partitioned two-path Cloudinary upload lifecycle in Completion Report Section 3.2 as the authoritative project baseline.
3. **Authorization of Fresh Audit Generation:** Authorize the creation of `docs/PHASE_0_2_8_FINAL_INDEPENDENT_EVIDENCE_AUDIT_v2.0.0.md` as a separate, fresh audit artifact.
4. **Shift Boundary Policy (`POD-06`):** Confirm whether POD-06 (Inclusive vs Exclusive date boundaries) remains pending for Phase 2B/4 resolution or should be resolved in Phase 0.2.8.

---

## 13. Explicit Non-Implementation Statement

I explicitly certify that across this planning task:
- **NO** existing project documents in `docs/` were modified, edited, renamed, or deleted.
- **NO** historical evidence or preserved artifacts in `evidence_preservation_P028_20261114_182132\` were modified.
- **NO** application source code in `node_backend/`, `hrms_saas/`, or `hrms_mobile/` was touched.
- **NO** database queries, migrations, or DDL were executed.
- **NO** Git commits, staging, or branch switches were performed.
- **NO** infrastructure services (PM2, Redis, Cloudinary, Nginx, VPS) were accessed or altered.
- **NO** implementation phase (Phase 0.3 or Phase 1) has been initiated.

**Phase 0.2.8 remains OPEN and NOT ACCEPTED.** All proposed text and corrections are DRAFT and await explicit project-owner authorization. Antigravity is stopped.

