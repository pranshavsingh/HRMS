# P028 Master Baseline Report

**Task ID:** `P028-MASTER-CONTROLLED-CLOSURE-01`  
**Stage:** `EXECUTION PHASE A — FINAL BASELINE`  
**Inspection timestamp:** `2026-11-14T23:00:57.4059197+05:30`  
**Mode:** Read-only inspection of source evidence; this report is a new evidence artifact.  
**Phase status:** `OPEN / NOT ACCEPTED`

## 1. Scope and method

This baseline reopened the current governing documents, preservation artifacts, correction packages, owner decision record, independent-audit artifacts, and Git boundaries. SHA-256 and physical lines were independently recalculated from bytes (LF count plus a non-final-LF line if applicable). No source document, historical artifact, code, database, Git state, dependency, Cloudinary asset, or infrastructure was changed by this phase.

Git version used for read-only inspection: `2.47.1.windows.2`. `F:\hrms` is not a Git repository. `F:\hrms\hrms_mobile` was inspected with Git's one-command `safe.directory` override only; no Git configuration was written.

## 2. Governing-document baseline

| Scope item | Current path | Bytes | Physical lines | SHA-256 | Last modified | Baseline result |
|---|---|---:|---:|---|---|---|
| Completion Report | `F:\hrms\docs\PHASE_0_2_8_COMPLETION_REPORT.md` | 35,489 | 360 | `785962b483468cd53cd2f82ddb4577ac68f28c11ca6a2f00dc3b4ddf8e238676` | `2026-11-14T22:46:07.3279480+05:30` | **VERIFIED WITH QUALIFICATION** — current v1.4.0 header; differs from manifest/current-copy hash only by authorized Correction 01. |
| Reconciliation Report | `F:\hrms\docs\PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md` | 17,983 | 220 | `75c89810ef1ac4caab9a2c3c44a71e6914433dff3640827ff13573aa80460d9e` | `2026-11-14T18:01:18.1611794+05:30` | **VERIFIED** — matches manifest current-copy hash. |
| Acceptance Verification Report | `F:\hrms\docs\PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md` | 44,320 | 287 | `a67ffa8d135a418ac1de1291f4927f869dcf09fd4bcf8c2d5c6fd1eb87ef849e` | `2026-11-14T18:01:18.0488425+05:30` | **VERIFIED** — matches manifest current-copy hash. |
| Cloudinary Owner Decision Record | `F:\hrms\evidence_preservation_P028_20261114_182132\P028_CLOUDINARY_LIFECYCLE_OWNER_DECISION_RECORD.md` | 14,191 | 107 | `91a986bdf846975df13b464091a372ac1f4d9be965a4e8688771da16704f9291` | `2026-11-14T19:23:13.8930300+05:30` | **VERIFIED** — owner policy record; not implementation evidence. |
| Five-document OCC inventory | No standalone fifth-document inventory file identified. The current evidence is Acceptance Report Section 4 / OCC-001–OCC-078 plus associated audit/correction records. | — | — | — | — | **NOT VERIFIED — EVIDENCE MISSING** — reported result is limited to four external documents. |

The preservation manifest (`EVIDENCE_PRESERVATION_MANIFEST.md:18–20`) records the pre-Correction-01 Completion Report hash `024be8…2565a`. The non-overwriting evidence copy `PHASE_0_2_8_COMPLETION_REPORT_PRE_P028_AUTHORIZED_CORRECTION_01.md` has that same 35,489-byte, 360-line hash. Post-execution verification established the current file differs from that copy by exactly one byte on physical line 74: `v1.3.0` to `v1.4.0`. This is the authorized Correction 01, not unexplained drift.

Supporting five-document source records, outside the requested governing-document list, remain readable and match manifest hashes: Decision Register v2.7.1 (`40,701` bytes, `489` lines, `26320e…8e59`) and Implementation Checklist v2.7.1 (`44,169` bytes, `306` lines, `5f0b5b…bdb`).

## 3. Independent-audit and provenance baseline

| Artifact | Category | Bytes / lines | Independently recalculated SHA-256 | Finding |
|---|---|---:|---|---|
| `docs\PHASE_0_2_8_INDEPENDENT_EVIDENCE_AUDIT.md` | Current modified audit | 87,930 / 479 | `d01cec9b3a73e73d9664c43b61061bcfd379c0e5c4180e2ee52be6599647b4a3` | **VERIFIED** as a current artifact; not independently trustworthy as an unmodified audit baseline. |
| `historical_pre_modification_versions\PHASE_0_2_8_INDEPENDENT_EVIDENCE_AUDIT_v1.0.0_unmutated.md` | Preserved unmutated audit | 87,554 / 476 | `882569726ff9afc3a663413f9a78b0a12f49082ebe1b232a6c90856ff5558a10` | **VERIFIED WITH QUALIFICATION** — preserved/reconstructed historical evidence, not an original in-place file. |
| `audit_scripts\update_audit_step1374.py` | Transcript-derived preserved script | 12,101 / 119 | `d078772402d2aea891403c19b624500469ea4f4014b20008a08415a9f693d69e` | **CONTRADICTED** against manifest hash `4e2c…1219`; provenance unresolved. |

The manifest at lines 36 and 45 identifies the historical unmutated audit and the recovered update script. The available correction evidence records the distinct transcript-LF payload as 11,982 bytes / `785d39…243d6`, but no verified record establishes the earlier claimed step 1562/1563 explanation. Therefore the hash-provenance chain remains **NOT VERIFIED — EVIDENCE MISSING**.

## 4. Current evidence findings and blockers

| ID | Status | Evidence | Required closure action |
|---|---|---|---|
| B01 | **CONTRADICTED** | Completion Report’s authorized line-74 version mismatch is corrected; its final acceptance language remains overbroad relative to its own proposed-design and validation limitations. | Prepare Section 9 replacement under Phase B; owner approval required before edit. |
| B02 | **NOT VERIFIED** | Reconciliation Report describes Cloudinary states and SQL (`lines 98–116`) but supplies no execution output, reference-check output, or safety test. | Qualify documentation; implementation and tests require separate authorization. |
| B03 | **CONTRADICTED** | Acceptance Report says “zero Git … working-tree alterations” (`line 51`) despite separate root/mobile boundaries and existing mobile staged/untracked state; its own five-document inventory row lacks acceptance-file metadata (`line 66`). | Proposed corrections only; no edit until individually authorized. |
| B04 | **NOT VERIFIED — EVIDENCE MISSING** | Original and modified audits are distinct preserved artifacts; update script is documented as rewriting the audit. | New independently traceable audit with a new identity; preserve both historical artifacts. |
| B05 | **NOT VERIFIED — EVIDENCE MISSING** | Manifest/script/transcript hash values do not form a reproduced provenance chain. | Phase E read-only provenance investigation and a reproducible evidence record. |
| B06 | **NOT VERIFIED — EVIDENCE MISSING** | Acceptance Report `lines 204–221` expressly states the 78-occurrence invariant applies to four external documents. | Independently inventory the full five-document scope; do not assign new IDs without owner policy. |
| B07 | **VERIFIED WITH QUALIFICATION** | Owner record `lines 15–22, 53–58, 69` selects partitioned two-path policy, terminal committed media, and two-hour screening only. | Retain policy; do not portray it as implementation or runtime proof. |
| B08 | **VERIFIED WITH QUALIFICATION** | Completion Report `lines 175–193` and `325–343` retain taxonomy and zero Phase 0 measured results. | Preserve classifications; obtain separately authorized Phase 10 evidence before acceptance claims. |

## 5. Git repository boundaries

- `F:\hrms`: **VERIFIED** non-repository (`git status` exits 128: not a Git repository).
- `F:\hrms\hrms_mobile`: **VERIFIED WITH QUALIFICATION** as a separate repository. It is on unborn `master`; `git log` exits 128 with “does not have any commits yet.” Current status shows staged additions/modifications/deletions and untracked files. This does not establish when those changes occurred, nor does it make the workspace root a Git working tree.
- No Git mutations were performed.

## 6. Correction register — proposals only

| Correction ID | File / location | Status | Required correction objective | Authorization |
|---|---|---|---|---|
| C01 | Completion Report line 74 | **VERIFIED COMPLETE** | Change stale `v1.3.0` reference to `v1.4.0`. | Previously approved and verified; do not repeat. |
| C02 | Completion Report Section 9 | **PENDING** | Replace only Section 9 with truthful closure status addressing audit integrity, reproducibility, OCC scope, Git boundaries, Cloudinary policy limits, performance limits, pending owner decisions, and owner-only acceptance. | Owner must approve exact standalone replacement. |
| C03 | Acceptance Report Sections 1, 2, 4, 7, 8 | **PENDING** | Correct Git, five-document inventory, DEF-01/technical-verification, and readiness assertions without erasing historical facts. | Owner approval required per passage. |
| C04 | Reconciliation Report Sections 4 and final statement | **PENDING** | Qualify “100% harmonized” and completion language so it does not imply complete evidence, implementation, or runtime verification. | Owner approval required per passage. |
| C05 | New audit artifact only | **PENDING** | Create a fresh independently traceable audit; do not alter historical audit files. | Separate authorization required. |
| C06 | New provenance/inventory artifacts only | **PENDING** | Establish hash-provenance findings and complete five-document inventory with reproducible data. | Separate authorization required. |

## 7. Required stop point

Phase A is complete. No source-document correction beyond previously verified C01 is authorized by this report. The next permissible action is to present the exact current Completion Report Section 9, assess it against the prepared draft, and propose a standalone C02 replacement. **Do not edit Section 9 unless the project owner explicitly approves that exact text.**

`PHASE 0.2.8 — OPEN / NOT ACCEPTED`