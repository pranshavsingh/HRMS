# P028 — v1.7 Final Technical and Editorial Validation Package

**Task ID:** `P028-V17-FINAL-TECHNICAL-EDITORIAL-VALIDATION-01`  
**Input:** `F:\hrms\evidence_preservation_P028_20261114_182132\P028_CONSOLIDATED_FINAL_CORRECTION_PACKAGE_v1.6.md`  
**Scope:** strict read-only validation; one new report only.

## 1. Executive verdict

v1.6 is materially safer and more evidence-aware than the current governing reports. It accurately preserves the owner-selected Option A policy, the audit-integrity issue, the hash-provenance gap, the OCC inventory limitation, and the OPEN / NOT ACCEPTED status. Fifteen entries are adequate for presentation to the project owner **with stated qualifications**. A-03 is not independently copy-pasteable for its stated source passage because it quotes an eight-row authorization-table passage but supplies only one replacement row. C-04 also needs a minor editorial adjustment to include the section heading and contextual statement when replacing the stated passage.

The Cloudinary SQL is correctly described as an intended reference check against available schema text, but it cannot establish deletion safety on its own: `LIKE` matching can misidentify values, the visible schema does not prove all possible references, and a concurrent write may appear after the check. No entry is safe as implementation authorization. No global 100% PASS conclusion is warranted.

## 2. Authorization and scope confirmation

Only the following actions were performed: reopened files, calculated metadata, inspected text/schema read-only, and created this report. No governing report, v1.0–v1.6 package, source code, script, test, configuration, database, Cloudinary asset, infrastructure setting, audit-generation script, or Git state was modified. No SQL was executed. A required runtime/live-service check is classified **NOT VERIFIED — SEPARATE AUTHORIZATION REQUIRED**.

## 3. Inspected sources and independently calculated metadata

| File | Actual path | Bytes | Physical lines | SHA-256 | Access / verification status |
|---|---|---:|---:|---|---|
| v1.6 correction package | `F:\hrms\evidence_preservation_P028_20261114_182132\P028_CONSOLIDATED_FINAL_CORRECTION_PACKAGE_v1.6.md` | 49,119 | 515 | `1769893b138a152b3eaff8bb8f7fa787ddc86037e63042da63337dc0d2a6d5b2` | Directly opened and validated |
| Completion Report | `F:\hrms\docs\PHASE_0_2_8_COMPLETION_REPORT.md` | 35,489 | 360 | `024be8eb7c1aad735f03312014a868514ebc5a68b7c93d455f88c779ad42565a` | Directly opened |
| Final Reconciliation Report | `F:\hrms\docs\PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md` | 17,983 | 220 | `75c89810ef1ac4caab9a2c3c44a71e6914433dff3640827ff13573aa80460d9e` | Directly opened |
| Final Acceptance Verification Report | `F:\hrms\docs\PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md` | 44,320 | 287 | `a67ffa8d135a418ac1de1291f4927f869dcf09fd4bcf8c2d5c6fd1eb87ef849e` | Directly opened |
| Owner decision record | `F:\hrms\evidence_preservation_P028_20261114_182132\P028_CLOUDINARY_LIFECYCLE_OWNER_DECISION_RECORD.md` | 14,191 | 107 | `91a986bdf846975df13b464091a372ac1f4d9be965a4e8688771da16704f9291` | Directly opened |
| Final Remediation Audit Report | `F:\hrms\docs\PHASE_0_2_8_FINAL_REMEDIATION_AUDIT_REPORT.md` | 105,943 | 292 | `763597026c835294ccd692dc10c102560bd37f96249bb50223056babf013c20e` | Directly opened; historical audit assertions separately classified |
| Preservation clarification report | `F:\hrms\evidence_preservation_P028_20261114_182132\PRESERVATION_CLARIFICATION_REPORT.md` | 22,894 | 210 | `62f5fd849b67628ac893d2b5d82cc87166c0c219b7db5edaecd1765ceb6cbda1` | Directly opened |
| Evidence-preservation manifest | `F:\hrms\evidence_preservation_P028_20261114_182132\EVIDENCE_PRESERVATION_MANIFEST.md` | 11,359 | 82 | `4fad8d9e8779be8e997375501804e88db6d7854c89f7cad33cbf89506c80a099` | Directly opened |
| Preservation command log | `F:\hrms\evidence_preservation_P028_20261114_182132\PRESERVATION_COMMAND_LOG.md` | 5,664 | 89 | `c40652fe1041a622579259c2a2f3161f655cf5a9c2230fedbfabd42f364687f6` | Directly opened |
| Local schema text | `F:\hrms\node_backend\scripts\schema.mysql.sql` | 4,420 | 113 | `a795fac95e0206651b26f4fa15d3ca161c85d9673373d88b44efe5b9b995b7a4` | Directly opened; not a live-schema verification |

The original and mutated independent-audit artifacts were not separately located as standalone accessible files in the inspected set. Their stated metadata and provenance are preserved in the directly opened Final Remediation Audit Report and preserved evidence. Their historical identity is therefore reported evidence, not newly recalculated artifact metadata.

## 4. Sixteen-entry validation matrix

| ID | Source / line accuracy | Defect accuracy | Replacement completeness | Evidence / technical classification | Governance / scope | Verdict |
|---|---|---|---|---|---|---|
| C-01 | Exact line 74 verified; header/history support contradiction | Present | Full row replacement | Correctly limited to document version | Preserves authority | PASS |
| C-02 | Lines 135–143 exactly match | Present: age wording needs stronger limit | Independently replaceable subsection | Policy/design vs runtime distinction correct | No implementation implied | PASS WITH QUALIFICATION |
| C-03 | Lines 345–349 exactly match | Present: operational tone/evidence classes need qualification | Complete replacement subsection | Schema-column claim is supported by local schema text; runtime claims limited | Safe | PASS WITH QUALIFICATION |
| C-04 | Lines 177–193 exactly match | Editorial completeness issue present | Taxonomy table is complete, but omits heading/context from stated passage | Taxonomy values/classifications exact | Safe | PASS WITH QUALIFICATION |
| R-01 | Line 20 exact | Present | Historical row plus clarification is complete | Same-date chronology correctly limited | Safe | PASS |
| R-02 | Lines 98–116 exact, including SQL | Present | Complete section replacement | SQL correctly limited as proposed check | Safe | PASS WITH QUALIFICATION |
| R-03 | Lines 159–175 exact | Present | Complete section replacement | Correctly separates four-document IDs from five-document completeness | Safe | PASS |
| R-04 | Lines 205–219 exact | No defect requiring correction | No replacement appropriate | Current passage is sufficiently scoped | Safe | NO CHANGE — JUSTIFIED |
| A-01 | Line 7 exact | Present | Full single-line replacement | Correctly limits closure claim | Safe | PASS |
| A-02 | Lines 34–36 exact | Present | Complete subsection replacement | Report modifications/Git distinction correctly added | Safe | PASS WITH QUALIFICATION |
| A-03 | Lines 45–52 exact | Present | Only one row replaces an eight-row stated passage | Git distinction is correct but historical mobile-repo claim remains attributed | Safe | FAIL |
| A-04 | Lines 60–66 exact | Present | Full table replacement | Direct metadata and limits correctly classified | Safe | PASS |
| A-05 | Lines 204–221 exact | Present | Full subsection replacement | Correct parser attribution / fifth-document limit | Safe | PASS |
| A-06 | Lines 99–115 exact | Present | Complete subsection replacement | Removes abbreviated-excerpt / runtime-PASS overclaim | Safe | PASS WITH QUALIFICATION |
| A-07 | Lines 262–271 exact | Present | Complete section replacement | Unresolved findings preserved | Safe | PASS |
| A-08 | Lines 275–287 exact | Present | Complete section replacement | Correct distinction: correction readiness is not acceptance | Safe | PASS |

## 5. Detailed findings for failed or qualified entries

### C-02 — PASS WITH QUALIFICATION

**Issue:** v1.6 correctly says the two-hour value is only a provisional screening filter, that candidates must be independently validated, and that committed media is terminal. Its phrase “validate ownership and check references” is a proposed control, not existing evidence.

**Evidence:** Completion Report line 143 says the design needs technical validation; owner record says the decision does not establish implementation, runtime safety, retries, crashes, or concurrency. The owner policy itself supports the protection and candidate-selection wording.

**Recommended v1.6 adjustment:** In the “Evidence basis” sentence, replace “owner decision record” with “owner decision record (policy direction only)” and append: “Ownership, lease, heartbeat, and fencing controls are proposed until separately implemented and validated.” No source inspection is needed; technical implementation requires separate authorization.

### C-03 — PASS WITH QUALIFICATION

**Issue:** “Directly verified source-column evidence” is valid for the local `schema.mysql.sql` definitions, but it must not be read as live MariaDB verification or proof that the three columns exhaust all historical/external references.

**Evidence:** local schema lines 32–35 define `accounts_employeedocument.file`; lines 41–47 define `attendance_attendance.punch_in_photo` and `punch_out_photo`. No live database was accessed.

**Recommended v1.6 adjustment:** Change “Directly verified source-column evidence” to “Directly verified local schema-text evidence (not live schema or complete-reference proof).” Separate authorization is required for live-schema, transaction, and runtime checks.

### C-04 — PASS WITH QUALIFICATION

**Issue:** The mandated taxonomy table exactly matches the agreed values and classifications, but the proposed replacement is a table plus historical-corrections note, while the quoted source begins with `#### 2. Reconciled Metrics & Distinctions` and explains the 409 business-conflict classification and lack of formal SLAs.

**Recommended v1.6 adjustment:** Prepend `#### 2. Reconciled Metrics & Distinctions` and append: “Expected duplicate-punch HTTP 409 conflicts are tracked separately from system errors. No formal production SLAs are currently approved; owner review and empirical staging results remain required.” No new inspection or technical authorization is required.

### R-02 — PASS WITH QUALIFICATION

**Issue:** The intended SQL uses available table/column names but is only a proposed reference check, not a complete deletion-safety mechanism.

**Evidence:** See Section 6. `LIKE CONCAT('%', :publicId, '%')` may match an unrelated value containing the same substring (false positive) and may miss a reference stored in a different representation, table, column, encoding, truncation, or provider identifier form (false negative). Even an accurate result can become stale if a reference is committed after the query and before deletion. The visible schema does not prove full reference coverage or transaction isolation.

**Recommended v1.6 adjustment:** After “intended query,” append: “This query is a proposed reference check only; its result alone does not prove safe deletion. Complete reference coverage, serialization with concurrent writes, and provider/deletion error handling require separately authorized design and runtime validation.” No query execution is authorized.

### A-02 — PASS WITH QUALIFICATION

**Issue:** The phrase “a report modification is not, by itself, evidence of a Git working-tree alteration” is logically sound but could be misread as a claim that no working-tree alteration occurred.

**Recommended v1.6 adjustment:** Append: “It also does not disprove a working-tree alteration; repository-specific evidence is required.” No Git action is needed; retain earlier audit attribution as historical evidence.

### A-03 — FAIL

**Issue:** v1.6 quotes the complete source passage at lines 45–52 (eight authorization-table rows) but provides only one “Complete replacement row.” That row cannot independently replace the stated entire passage; a future editor would have to infer which other seven rows to retain.

**Evidence:** v1.6 A-03 itself labels lines 45–52 as its exact current source passage, then supplies only the Git Actions row.

**Why insufficient:** This violates v1.6’s own complete-replacement standard and the future copy/paste requirement.

**Exact recommended amendment to v1.6:** Replace the A-03 “Complete replacement row” with the following complete replacement passage:

> | Modification of `PHASE_0_2_8_COMPLETION_REPORT.md` | **AUTHORIZED** | Updated to v1.4.0: documentation modification reported; this row is not Git-history or working-tree evidence. | **DOCUMENTATION RECORD ONLY** |
> | Modification of `PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md` | **AUTHORIZED** | Updated to v1.3.0: documentation modification reported; this row is not Git-history or working-tree evidence. | **DOCUMENTATION RECORD ONLY** |
> | Application Source Code (`node_backend/`, `hrms_saas/`, `hrms_mobile/`) | **STRICTLY PROHIBITED** | Historical report claims zero application-source modification; current task does not independently verify historical activity. | **HISTORICAL CLAIM — NOT INDEPENDENTLY VERIFIED** |
> | MariaDB Host (`srv999.hstgr.io`) / DDL / Migrations | **STRICTLY PROHIBITED** | Historical report claims zero queries, migrations, or DDL; current task does not independently verify historical activity. | **HISTORICAL CLAIM — NOT INDEPENDENTLY VERIFIED** |
> | Dependencies (`package.json`, `npm`, `yarn`) | **STRICTLY PROHIBITED** | Historical report claims zero dependency changes; current task does not independently verify historical activity. | **HISTORICAL CLAIM — NOT INDEPENDENTLY VERIFIED** |
> | Infrastructure (PM2, Nginx, Redis, Cloudinary, VPS) | **STRICTLY PROHIBITED** | Historical report claims zero infrastructure changes or restarts; current task does not independently verify historical activity. | **HISTORICAL CLAIM — NOT INDEPENDENTLY VERIFIED** |
> | Git Actions (Commit, Push, Merge, Branch Switch) | **STRICTLY PROHIBITED** | `F:\hrms` was reported as having no `.git`; root history and working-tree state are **NOT VERIFIED**. The separate `F:\hrms\hrms_mobile` repository was reported by the Final Remediation Audit as having pre-existing staged additions, staged modifications/deletions, and untracked files on unborn `master`. That historical report does not prove a change during this task or a clean repository. No commit, push, merge, or branch switch is asserted. Separately documented report modifications are not Git-commit or Git-working-tree evidence. | **LIMITED — NOT INDEPENDENTLY VERIFIED** |
> | Progression to Phase 0.3, Phase 1, or Subsequent Phases | **STRICTLY PROHIBITED** | Historical report claims no next-phase development; current task does not independently verify historical activity. | **HISTORICAL CLAIM — NOT INDEPENDENTLY VERIFIED** |

**Further inspection / authorization:** No further source inspection is needed for editorial completeness. Any current repository-state verification would require a separately scoped, read-only decision; no Git mutation is authorized.

### A-06 — PASS WITH QUALIFICATION

**Issue:** v1.6 correctly removes abbreviated excerpts and overbroad PASS language. Its replacement is a summary rather than reproducing all cited underlying source passages, which is appropriate for an Acceptance Report finding but should not be represented as fresh independent implementation verification.

**Recommended v1.6 adjustment:** Add: “This finding is based on directly compared document text and the owner decision record; it is not a code, database, or runtime test.” Separate authorization is needed for those tests.

## 6. Cloudinary lifecycle and SQL technical assessment

**Policy validation:** The owner record explicitly selects **Option A — Partitioned Two-Path Cloudinary Upload Lifecycle**: committed attendance media is terminal/protected; only abandoned or uncommitted candidates may enter cleanup; ownership and reference checks precede deletion; cleanup must not delete a committed attendance photo. v1.6 C-02, C-03, R-02, A-06, A-07, and A-08 consistently preserve that as policy/proposed design rather than implemented behavior.

| Required assessment | Validation finding |
|---|---|
| Committed media terminal/protected | PASS — explicit in relevant v1.6 entries |
| Only independently validated uncommitted candidates | PASS — explicit |
| Two-hour threshold provisional only | PASS — explicit |
| Age not proof/authorization | PASS — explicit |
| Ownership validation | PASS WITH QUALIFICATION — required as proposed control, not proved implemented |
| Lease, expiration, heartbeat, fencing | PASS WITH QUALIFICATION — accurately proposed; no enforcement evidence |
| Immediate pre-deletion reference check | PASS WITH QUALIFICATION — stated as requirement/proposed step, not runtime verified |
| Preserve ambiguous cases | PASS — explicit manual review requirement |
| Protect committed records/active references | PASS — explicit policy/design rule |
| No unsupported atomicity/race/retry/runtime claim | PASS — v1.6 consistently disclaims these |

**SQL schema assessment:** The R-02 query names `attendance_attendance.punch_in_photo`, `attendance_attendance.punch_out_photo`, and `accounts_employeedocument.file`. Those names match the locally inspected schema text. This verifies local schema text only, not the live MariaDB schema.

**SQL safety assessment:** The query searches intended visible columns. It is not sufficient to prove an asset unreferenced or deletion safe because: (1) substring `LIKE` has false-positive/false-negative risk; (2) actual stored formats or other locations may differ; (3) an active or newly committed reference may race the check; (4) transaction isolation/locking and provider deletion outcome are not established; and (5) ownership/lease evidence is outside the query. The correction package should describe it only as a **proposed reference check**, not a complete deletion-safety mechanism. **NOT VERIFIED — SEPARATE AUTHORIZATION REQUIRED** for live schema, concurrency, and runtime validation.

## 7. Audit-integrity assessment

v1.6 accurately classifies audit integrity as unresolved. It preserves reported original-audit metadata: 87,554 bytes, 476 lines, SHA-256 `882569726ff9afc3a663413f9a78b0a12f49082ebe1b232a6c90856ff5558a10`; and reported mutated-audit metadata: 87,930 bytes, 479 lines, SHA-256 `d01cec9b3a73e73d9664c43b61061bcfd379c0e5c4180e2ee52be6599647b4a3`.

The directly opened Final Remediation Audit Report attributes `python update_audit.py` success to transcript step 1376 and script deletion to step 1378. Those are preserved transcript-reported events, not commands rerun here. v1.6 does not claim the original audit was restored. This is **PASS** for evidence classification; independent reconstruction/reproducibility remains **NOT VERIFIED — SEPARATE AUTHORIZATION REQUIRED**.

## 8. Hash-discrepancy assessment

v1.6 accurately preserves the separate values: script-reported 12,101 bytes / `d078772402d2aea891403c19b624500469ea4f4014b20008a08415a9f693d69e`; manifest `4e2c2626e84d9435b0d00f68894fb4e0b04a919323c218dd3b93478546b41219`; transcript LF payload 11,982 bytes / `785d39d40ec85a80a19fc6b6de336e879809743be8d3f45768b344e3983243d6`.

The directly opened audit report states no preserved transcript step_index 1562 or 1563 establishes the claimed hash run. v1.6’s classification of the manifest-hash origin as **NOT VERIFIED — EVIDENCE MISSING** is correct. **PASS.**

## 9. OCC inventory assessment

The directly opened Final Remediation Audit Report says the existing Acceptance Report table has 78 rows, 78 unique IDs, no gaps, duplicates, extras, or source-line contradictions for OCC-001–OCC-078, and explicitly limits that result to four external documents. It also visibly repeats the OCC block within the audit report; that repeated display is not duplicate identifiers in the Acceptance Report source inventory. The full fifth-document taxonomy inventory remains unverified. v1.6 makes each distinction and assigns no OCC-079. **PASS.**

## 10. Git/workspace evidence assessment

v1.6 correctly distinguishes the reported non-Git workspace root `F:\hrms` from the separately reported `F:\hrms\hrms_mobile` repository with pre-existing staged, modified, and untracked files. It does not call the entire workspace clean. This validation did not run Git commands because current Git inspection is unnecessary to validate the documentation package; the repository assertions remain historical attribution except for current filesystem paths. **PASS WITH QUALIFICATION.**

## 11. Performance taxonomy verification

v1.6 C-04 reproduces all 13 required values and classifications exactly: P95 < 500 ms as provisional baseline; P99 and HTTP 409 as measurements to collect; 5xx < 0.1%, 100–250 in-flight, 150–300 RPS, CPU < 75%, PM2 < 800 MB RSS, event-loop P99 < 50 ms, DB ≤ 60 subject to quota, and Redis P99 < 5 ms as proposed targets; staging 5,000/1,000 authenticated VUs; and actual Phase 0 results zero. It explicitly distinguishes Redis command latency from superseded event-loop lag. **PASS.**

## 12. Recommended v1.6 amendments

1. **A-03 (required before presenting v1.6 as fully copy-pasteable):** replace the sole-row replacement with the complete eight-row passage in Section 5.
2. **C-04 (editorial):** include the section heading and 409/formal-SLA contextual sentence identified in Section 5.
3. **C-02, C-03, R-02, A-02, A-06 (clarifying):** add the exact qualifiers stated in Section 5 to avoid any implication that proposed controls are live or sufficient on their own.

Until amendment 1 is made, do not characterize all sixteen v1.6 replacements as independently copy-pasteable. None of these recommendations authorizes an edit. A separately authorized correction task is required.

## 13. Outstanding evidence and technical-verification requirements

- Live schema, complete asset-reference inventory, locking/isolation, and Cloudinary deletion behavior: **NOT VERIFIED — SEPARATE AUTHORIZATION REQUIRED**.
- Lease ownership, expiration, heartbeat, fencing, race safety, retries, and idempotency: **NOT VERIFIED — SEPARATE AUTHORIZATION REQUIRED**.
- Manifest hash origin / missing step 1562–1563 evidence: **NOT VERIFIED — EVIDENCE MISSING**.
- Complete fifth-document OCC taxonomy: **NOT VERIFIED — EVIDENCE MISSING**.
- Original-audit restoration or independent reproducibility: not claimed; a new independently scoped audit requires separate authorization.

## 14. Final quality-control checklist

- [x] Reopened v1.6 and all three governing reports.
- [x] Recalculated metadata from current accessible files.
- [x] Validated exactly 16 entries.
- [x] Read owner policy, remediation audit, preservation clarification, manifest, command log, and local schema text.
- [x] Preserved audit and hash limitations.
- [x] Evaluated SQL without executing it.
- [x] Preserved OPEN / NOT ACCEPTED and owner-only acceptance.
- [x] Created one validation report only.
- [ ] All v1.6 entries are fully copy-pasteable without amendment: A-03 fails this check; C-04 has a minor contextual omission.

## 15. Final governance status

`PHASE 0.2.8 — OPEN / NOT ACCEPTED`

`v1.7 — READ-ONLY VALIDATION REPORT / NOT IMPLEMENTATION AUTHORIZATION`

`NO GOVERNING REPORTS MODIFIED`

`NO IMPLEMENTATION AUTHORIZED`

Only the project owner can separately authorize future corrections and accept Phase 0.2.8.
