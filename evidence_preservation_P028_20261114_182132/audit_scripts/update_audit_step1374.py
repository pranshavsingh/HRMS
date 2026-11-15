import sys

audit_path = 'docs/PHASE_0_2_8_INDEPENDENT_EVIDENCE_AUDIT.md'

with open(audit_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

print('Initial line count:', len(lines))

# 1. Update Section 3 table (lines 51 to 56, 0-indexed)
lines[51] = '| 1 | `docs/PHASE_0_FINAL_DECISION_REGISTER.md` | **v2.7.1** | 489 lines | 40,701 B | `26320e36175631fb17693e61c4dde5c876377248c8dac0a7918303e689c78e59` | **VERIFIED** |\n'
lines[52] = '| 2 | `docs/PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md` | **v2.7.1** | 306 lines | 44,169 B | `5f0b5bdfa81f97a7717d68c3c85000caf836ddfce8c49c1379ad10e605dadbdb` | **VERIFIED** |\n'
lines[53] = '| 3 | `docs/PHASE_0_2_8_COMPLETION_REPORT.md` | **v1.4.0** | 360 lines | 35,489 B | `024be8eb7c1aad735f03312014a868514ebc5a68b7c93d455f88c779ad42565a` | **VERIFIED** |\n'
lines[54] = '| 4 | `docs/PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md` | **v1.3.0** | 220 lines | 17,983 B | `75c89810ef1ac4caab9a2c3c44a71e6914433dff3640827ff13573aa80460d9e` | **VERIFIED** |\n'
lines[55] = '| 5 | `docs/PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md` | **v2.8.0** | 287 lines | 44,320 B | `a67ffa8d135a418ac1de1291f4927f869dcf09fd4bcf8c2d5c6fd1eb87ef849e` | **VERIFIED** |\n'

# 2. Update Section 6 (lines 144 to 166, 0-indexed)
new_sec6 = [
    '## 6. Cloudinary Lifecycle Comparison & Defect Resolution\n',
    '\n',
    'A detailed comparison was conducted between the lifecycle descriptions in the Completion Report and Reconciliation Report.\n',
    '\n',
    '### 6.1 Extracted Lifecycle Definitions\n',
    '1. **Completion Report Section 3.2 (Lines 136–138, v1.4.0):**\n',
    '   > `* **Intent States (Partitioned Lifecycle — Superseding Linear Diagram):** As reconciled in Section 10.2 Addendum, the older linear sequence is superseded. The lifecycle is partitioned into two mutually exclusive paths:`  \n',
    '   > `  - **Successful Attendance Path:** pending $\\rightarrow$ uploading $\\rightarrow$ committed (terminal for cleanup, permanently excluded from deletion).`  \n',
    '   > `  - **Abandoned / Failed Upload Path (Uncommitted Candidates Only):** pending or failed $> 2\\text{h}$ $\\rightarrow$ cleanup_claimed $\\rightarrow$ cleaned (or manual review).`\n',
    '2. **Completion Report Section 10.2 Addendum (Lines 343–346, v1.4.0):**\n',
    '   > `The upload intent lifecycle is formally partitioned into two mutually exclusive paths to ensure committed attendance photos can never enter an orphan-deletion workflow:`  \n',
    '   > `- Successful Attendance Path: ... marked \'committed\' ... A committed intent is terminal for cleanup and is NEVER selected for deletion.`  \n',
    '   > `- Abandoned / Failed Upload Path (Uncommitted Candidates Only): Intents in \'pending\' or \'failed\' older than the provisional 2-hour threshold are claimed with a worker lease token ...`\n',
    '3. **Reconciliation Report Section 4, Inconsistency 2 (Lines 98–104, v1.3.0):**\n',
    '   > `* Inconsistency Found: Linear state diagram pending -> uploading -> committed -> cleanup_claimed -> cleaned unintentionally implied that committed attendance photos could transition into the orphan cleanup workflow.`  \n',
    '   > `* Before: status (\'pending\', \'uploading\', \'committed\', \'cleanup_claimed\', \'cleaned\', \'failed\') presented as a single pipeline where committed records could be evaluated by cleanup workers.`  \n',
    '   > `* After: Partitioned into two mutually exclusive paths: 1. Successful Attendance Path (committed is terminal and NEVER selected for cleanup) vs 2. Abandoned / Failed Upload Path (Uncommitted Candidates Only)...`\n',
    '\n',
    '### 6.2 Source Harmonization & Resolution (DEF-01 Resolution)\n',
    '- **Defect Closure:** In Completion Report v1.4.0, Section 3.2 (Lines 136–138) was formally harmonized with Section 10.2 Addendum and Reconciliation Report Section 4. The linear sequence was explicitly marked as superseded, and the partitioned two-path model is now articulated consistently across all governing documents.\n',
    '- **Absolute Deletion Safety Rule:** Committed records and active references are **NEVER** deleted. Inconclusive checks preserve the asset for manual review.\n',
    '- **Audit Verdict:** **PASS** (Defect DEF-01 resolved; 100% consistent across all documents).\n'
]
lines[144:166] = new_sec6

# Re-find Section 9 and Section 11 by header
sec9_idx = None
sec11_idx = None
for i, l in enumerate(lines):
    if l.startswith('## 9. Governing Metric Taxonomy Consistency Matrix'):
        sec9_idx = i
    elif l.startswith('## 11. Defects Requiring Separate Project-Owner Authorization'):
        sec11_idx = i

print(f'sec9_idx={sec9_idx}, sec11_idx={sec11_idx}')

# Update Section 9 table
new_sec9 = [
    '## 9. Governing Metric Taxonomy Consistency Matrix\n',
    '\n',
    'All 13 performance and scale metrics were verified across the authoritative documents against the approved governance taxonomy:\n',
    '\n',
    '| # | Metric Parameter | Governing Baseline Value | Governance Classification | Decision Register (v2.7.1) | Implementation Checklist (v2.7.1) | Completion Report (v1.4.0) | Reconciliation Report (v1.3.0) | Agreement | Verdict |\n',
    '|:---:|---|---|---|---|---|---|---|:---:|:---:|\n',
    '| 1 | **Core Successful Business Operations** | `P95 < 500 ms` | Provisional Planning Baseline | Line 336: `P95 < 500 ms` | Line 265: `P95 < 500 ms` | Lines 180, 327: `P95 < 500 ms` | Line 77: `P95 < 500 ms` | **AGREED** | **PASS** |\n',
    '| 2 | **Tail Latency ($P99$)** | Distribution to measure and report | Measurement to Collect; no approved threshold | Line 337: Distribution to measure and report | Line 265: Distribution to measure and report | Lines 181, 329: Distribution to measure and report | Line 79: Distribution to measure and report | **AGREED** | **PASS** |\n',
    '| 3 | **HTTP 409 Conflict Response Latency** | Distribution to measure separately | Measurement to Collect; no approved SLA | Line 338: Distribution to measure separately | Line 265: Distribution to measure separately | Lines 182, 330: Distribution to measure separately | Line 80: Distribution to measure separately | **AGREED** | **PASS** |\n',
    '| 4 | **Unexpected HTTP 5xx Error Rate** | `< 0.1%` | Proposed Engineering Target | Line 339: `< 0.1%` | Line 265: `< 0.1%` | Lines 184, 332: `< 0.1%` | Line 82: `< 0.1%` | **AGREED** | **PASS** |\n',
    '| 5 | **In-Flight Concurrency** | 100–250 actively processing requests | Proposed Engineering Target | Line 342: 100–250 requests | Line 265: 100–250 requests | Lines 179, 333: 100–250 requests | Line 83: 100–250 requests | **AGREED** | **PASS** |\n',
    '| 6 | **Throughput Capacity** | 150–300 requests/sec (RPS) sustained | Proposed Engineering Target | Line 343: 150–300 RPS | Line 265: 150–300 RPS | Lines 179, 334: 150–300 RPS | Line 84: 150–300 RPS | **AGREED** | **PASS** |\n',
    '| 7 | **Host CPU Utilization** | `< 75%` average across cores | Proposed Engineering Target | Line 346: `< 75%` | Line 265: `< 75%` | Lines 186, 336: `< 75%` | Line 86: `< 75%` | **AGREED** | **PASS** |\n',
    '| 8 | **PM2 Worker Memory (RSS)** | `< 800 MB RSS per worker` | Proposed Engineering Target | Line 347: `< 800 MB RSS per worker` | Line 265: `< 800 MB RSS per worker` | Lines 187, 337: `< 800 MB RSS per worker` | Line 87: `< 800 MB RSS per worker` | **AGREED** | **PASS** |\n',
    '| 9 | **Node.js Event-Loop Lag** | `P99 < 50 ms` | Proposed Engineering Target | Line 348: `P99 < 50 ms` | Line 265: `P99 < 50 ms` | Lines 188, 338: `P99 < 50 ms` | Line 88: `P99 < 50 ms` | **AGREED** | **PASS** |\n',
    '| 10 | **Aggregate MariaDB Connections** | `≤ 60` across cluster | Proposed Engineering Target; subject to verified quota | Line 349: `≤ 60` (subject to verified quota) | Line 265: `≤ 60` (subject to verified quota) | Lines 189, 339: `≤ 60` (subject to verified quota) | Line 89: `≤ 60` (subject to verified quota) | **AGREED** | **PASS** |\n',
    '| 11 | **Redis Command Latency** | `P99 < 5 ms` | Proposed Engineering Target; measure/report, not approved SLA | Line 350: `P99 < 5 ms` (measure and report) | Line 265: `P99 < 5 ms` (measure and report) | Lines 190, 340: `P99 < 5 ms` (measure and report) | Line 90: `P99 < 5 ms` (measure and report) | **AGREED** | **PASS** |\n',
    '| 12 | **Staging Population Scale** | 5,000 employees / 1,000 authenticated VUs | Future Staging Acceptance Target | Lines 340, 341: 5,000 employees / 1,000 VUs | Line 265: 5,000 employees / 1,000 VUs | Lines 178, 341: 5,000 employees / 1,000 VUs | Line 91: 5,000 employees / 1,000 VUs | **AGREED** | **PASS** |\n',
    '| 13 | **Actual Phase 0 Load-Test Results** | Zero | Actual Measured Results | Line 351: Explicitly ZERO | Line 265: Explicitly ZERO | Lines 192, 342: Explicitly ZERO | Line 92: Explicitly ZERO | **AGREED** | **PASS** |\n'
]
lines[sec9_idx:sec9_idx+19] = new_sec9

# Re-find Section 11
for i, l in enumerate(lines):
    if l.startswith('## 11. Defects Requiring Separate Project-Owner Authorization'):
        sec11_idx = i
        break

new_sec11_12 = [
    '## 11. Status of Source-Document Defects\n',
    '\n',
    'All previously identified documentation defects have been resolved:\n',
    '\n',
    '| Defect ID | Target Document | Physical Line | Defect Description | Resolution Applied | Status |\n',
    '|:---:|---|:---:|---|---|:---:|\n',
    '| **DEF-01** | `docs/PHASE_0_2_8_COMPLETION_REPORT.md` | Lines 136–138 | Uncorrected legacy linear lifecycle (`pending -> uploading -> committed -> cleanup_claimed -> cleaned`). | Replaced Line 135 with partitioned two-path model; explicitly superseded linear sequence; fully harmonized with Section 10.2 Addendum and Reconciliation Report Section 4. | **RESOLVED (PASS)** |\n',
    '\n',
    '**Active Defect Count:** **0** (Zero active defects remain across all documents).\n',
    '\n',
    '---\n',
    '\n',
    '## 12. Final Independent Audit Summary & Governance Decision\n',
    '\n',
    '### 12.1 Objective Audit Finding\n',
    '1. **Repository Identity:** Verified. Workspace root is non-Git; `hrms_mobile` is an unborn Git repo on branch `master` with pre-existing untracked scaffolding from May 2026.\n',
    '2. **Document Integrity:** Verified. All five planning documents exist, have verified physical line counts, and match their SHA-256 cryptographic hashes.\n',
    '3. **PM2 Memory Formatting:** Verified. Zero trailing `>` characters exist on disk across all active entries.\n',
    '4. **Cloudinary Schema:** Verified in repository schema (`attendance_attendance` with `punch_in_photo`/`punch_out_photo` and `accounts_employeedocument` with `file`). Live MariaDB state remains properly qualified as **NOT VERIFIED**.\n',
    '5. **Cloudinary Lifecycle Harmonization:** **PASS**. Defect DEF-01 is completely resolved. Section 3.2 and Section 10.2 of the Completion Report (v1.4.0) articulate the identical partitioned lifecycle, matching Reconciliation Report Section 4.\n',
    '6. **Metric Inventory & Taxonomy:** Verified. 221 metric occurrences cataloged across all five documents, reconciled with an independent search pass with zero active obsolete figures.\n',
    '7. **Cross-Document Harmonization:** Verified 100% consistent across all five documents.\n',
    '\n',
    '### 12.2 Explicit Governance Status\n',
    '\n',
    '> **Phase 0.2.8 final documentation reconciliation is complete. The current planning documents have been reconciled, and Phase 0.2.7 historical records remain preserved. No application code, database, dependencies, Cloudinary assets or infrastructure were modified. No implementation phase has been started. Antigravity is stopped and awaiting explicit project-owner acceptance and separate authorization for the next phase.**\n'
]

lines[sec11_idx:] = new_sec11_12

with open(audit_path, 'w', encoding='utf-8') as f:
    f.writelines(lines)

print('SUCCESS: update_audit.py completed. Final lines:', len(lines))
