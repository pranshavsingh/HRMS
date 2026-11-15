# EVIDENCE PRESERVATION MANIFEST
**Task ID:** P028-EVIDENCE-PRESERVATION-01  
**Execution Timestamp:** 2026-11-14T18:25:00+05:30  
**Preservation Directory:** `F:\hrms\evidence_preservation_P028_20261114_182132`  
**Governance Status:** Phase 0.2.8 remains **OPEN and NOT ACCEPTED**  
**Authorization Mode:** Strict Read-Only Evidence Preservation  

---

## 1. Preserved Current Documents (As Found on Disk)

These files represent the exact byte-for-byte copies of the governing documents currently residing in `F:\hrms\docs\`:

| Document Role / Name | Original Source Path | Preserved Copy Path | Lines | Bytes | Source SHA-256 | Preserved SHA-256 | Match | Provenance / Stated Version |
|---|---|---|:---:|:---:|---|---|:---:|---|
| **Authoritative Decision Register** | `F:\hrms\docs\PHASE_0_FINAL_DECISION_REGISTER.md` | `current_documents\PHASE_0_FINAL_DECISION_REGISTER.md` | 489 | 40,701 | `26320e36175631fb17693e61c4dde5c876377248c8dac0a7918303e689c78e59` | `26320e36175631fb17693e61c4dde5c876377248c8dac0a7918303e689c78e59` | **PASS** | v2.7.1 (Nov 14, 2026 15:59) |
| **Authoritative Checklist** | `F:\hrms\docs\PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md` | `current_documents\PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md` | 306 | 44,169 | `5f0b5bdfa81f97a7717d68c3c85000caf836ddfce8c49c1379ad10e605dadbdb` | `5f0b5bdfa81f97a7717d68c3c85000caf836ddfce8c49c1379ad10e605dadbdb` | **PASS** | v2.7.1 (Nov 14, 2026 15:59) |
| **Completion Report** | `F:\hrms\docs\PHASE_0_2_8_COMPLETION_REPORT.md` | `current_documents\PHASE_0_2_8_COMPLETION_REPORT.md` | 360 | 35,489 | `024be8eb7c1aad735f03312014a868514ebc5a68b7c93d455f88c779ad42565a` | `024be8eb7c1aad735f03312014a868514ebc5a68b7c93d455f88c779ad42565a` | **PASS** | v1.4.0 (Nov 14, 2026 17:51; contains L74 contradiction to v1.3.0) |
| **Final Reconciliation Report** | `F:\hrms\docs\PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md` | `current_documents\PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md` | 220 | 17,983 | `75c89810ef1ac4caab9a2c3c44a71e6914433dff3640827ff13573aa80460d9e` | `75c89810ef1ac4caab9a2c3c44a71e6914433dff3640827ff13573aa80460d9e` | **PASS** | v1.3.0 (Nov 14, 2026 17:52) |
| **Acceptance Verification Report** | `F:\hrms\docs\PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md` | `current_documents\PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md` | 287 | 44,320 | `a67ffa8d135a418ac1de1291f4927f869dcf09fd4bcf8c2d5c6fd1eb87ef849e` | `a67ffa8d135a418ac1de1291f4927f869dcf09fd4bcf8c2d5c6fd1eb87ef849e` | **PASS** | v2.8.0 (Nov 14, 2026 17:57) |
| **Independent Evidence Audit** | `F:\hrms\docs\PHASE_0_2_8_INDEPENDENT_EVIDENCE_AUDIT.md` | `current_documents\PHASE_0_2_8_INDEPENDENT_EVIDENCE_AUDIT.md` | 479 | 87,930 | `d01cec9b3a73e73d9664c43b61061bcfd379c0e5c4180e2ee52be6599647b4a3` | `d01cec9b3a73e73d9664c43b61061bcfd379c0e5c4180e2ee52be6599647b4a3` | **PASS** | v1.0.0 post-mutation (Nov 14, 2026 17:59) |

*Note on document names:* The user prompt referenced `PHASE_0_2_8_DECISION_REGISTER.md` and `PHASE_0_2_8_IMPLEMENTATION_CHECKLIST.md`. The actual physical files on disk establishing the authoritative baseline are named `PHASE_0_FINAL_DECISION_REGISTER.md` and `PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md`. No file named `PHASE_0_2_8_DECISION_REGISTER.md` exists on disk.

---

## 2. Preserved Historical Pre-Modification Versions

These files preserve the exact pre-modification state of the four documents before unauthorized edits were applied in Task 10. Each copy has been mathematically verified against the recorded cryptographic hashes logged at transcript line 1172 and line 1206:

| Document | Preserved Path | Lines | Bytes | Recorded Target Hash (Transcript Line 1172 / 1206) | Preserved Hash | Match | Provenance & Validation |
|---|---|:---:|:---:|---|---|:---:|---|
| **Completion Report v1.3.0** | `historical_pre_modification_versions\PHASE_0_2_8_COMPLETION_REPORT_v1.3.0.md` | 357 | 34,706 | `51baf8923296447c7d165b1fd00bdbdf34778d14bbbcb5849f3f3157810f4a7c` | `51baf8923296447c7d165b1fd00bdbdf34778d14bbbcb5849f3f3157810f4a7c` | **PASS** | Reconstructed by inverting 3 transcript edits from steps 1240, 1246, 1248; verified against L1172. |
| **Reconciliation Report v1.2.0** | `historical_pre_modification_versions\PHASE_0_2_8_FINAL_RECONCILIATION_REPORT_v1.2.0.md` | 219 | 17,673 | `895889d0fc6dd433322b94e6277092208b7671469c4492ad9ba0189298cea5cf` | `895889d0fc6dd433322b94e6277092208b7671469c4492ad9ba0189298cea5cf` | **PASS** | Reconstructed by inverting 4 transcript edits from steps 1258, 1262, 1264, 1270; verified against L1172. |
| **Acceptance Report v2.7.0** | `historical_pre_modification_versions\PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT_v2.7.0.md` | 285 | 44,450 | `21bfd5ad89eff81a474aeb7fd0fa3f84b1aa9e4fe7cac894615f4ac49c81d146` | `21bfd5ad89eff81a474aeb7fd0fa3f84b1aa9e4fe7cac894615f4ac49c81d146` | **PASS** | Generated via `build_v270_report.py` evaluated against pre-edit baseline; verified against L1172. |
| **Independent Audit v1.0.0 (Unmutated)** | `historical_pre_modification_versions\PHASE_0_2_8_INDEPENDENT_EVIDENCE_AUDIT_v1.0.0_unmutated.md` | 476 | 87,554 | Recorded size 87,554 bytes at L1206 / L1208 | `882569726ff9afc3a663413f9a78b0a12f49082ebe1b232a6c90856ff5558a10` | **PASS** | Generated via `generate_independent_audit.py` prior to `update_audit.py`; preserves DEF-01 disclosure. |
| **Provenance Documentation** | `historical_pre_modification_versions\README_PROVENANCE.md` | 28 | 2,009 | N/A | `0422cf3022ec893d96722922c86218bfbc3186649fdc96fa30fe45b700595ec5` | **PASS** | Comprehensive explanation of provenance, step references, and verification methods. |

---

## 3. Preserved Audit & Mutation Scripts

| Script Name | Original Source Path / Provenance | Preserved Path | Bytes | SHA-256 | Purpose / Significance |
|---|---|---|:---:|---|---|
| **update_audit_step1374.py** | Extracted byte-for-byte from transcript step 1372/1374 (deleted at step 1378) | `audit_scripts\update_audit_step1374.py` | 12,101 | `4e2c2626e84d9435b0d00f68894fb4e0b04a919323c218dd3b93478546b41219` | The script executed in Task 10 to rewrite the Independent Audit, suppress DEF-01, and alter defect counts. |
| **generate_independent_audit_scratch.py** | `C:\Users\Admin\.gemini\antigravity\brain\ffdce738-6f0a-473e-87ac-0bb4fa484100\scratch\generate_independent_audit.py` | `audit_scripts\generate_independent_audit_scratch.py` | 30,985 | `95ca9676e1a473f324c538cb123e4a91a9df9c2c62c938f2963b65e9987dc34c` | Original generator script for the Independent Evidence Audit report at step 1203. |
| **build_v270_report_scratch.py** | `...\scratch\build_v270_report.py` | `audit_scripts\build_v270_report_scratch.py` | 28,477 | `26daee2014b2d354b6ecaa080be86a460910f1352e858db4f7ff199b0c036d0b` | Generator script for Acceptance Verification Report v2.7.0 at step 1159. |
| **doc_integrity_scratch.py** | `...\scratch\doc_integrity.py` | `audit_scripts\doc_integrity_scratch.py` | 1,216 | `141b7ddc2ea0f48866e4a2d7f88ebcc1eb887ef6317bc2d44fc177f8ec2ba28c` | Script that audited physical line counts and recorded initial hashes at step 1171. |
| **check_pm2_formatting_scratch.py** | `...\scratch\check_pm2_formatting.py` | `audit_scripts\check_pm2_formatting_scratch.py` | 1,597 | `73dafc0dfb3b22b104975ba95fe6aa7417e3f890e0bda9fbddb67825dffcae12` | Script that verified raw PM2 memory formatting and proved zero trailing `>` at step 1175. |
| **prepare_inventory_items_scratch.py** | `...\scratch\prepare_inventory_items.py` | `audit_scripts\prepare_inventory_items_scratch.py` | 16,809 | `0fa8e4695ff5fa6b1ae442d9ff643c1626388435d8e0cf3181829e18b4566c7b` | Data builder for occurrence inventory parsing across source documents at step 1155. |

---

## 4. Preserved Forensic Logs & Git State

| Log File | Source Command | Preserved Path | Bytes | SHA-256 | Captured Forensic Finding |
|---|---|---|:---:|---|---|
| **git_mobile_status.txt** | `git -C hrms_mobile status --short` | `forensic_logs_and_git\git_mobile_status.txt` | 1,967 | `14ae5b863079b76eb1c713b1a8d0119e7a83d73507d4726eeb6f1e18bf75eb1f` | Pre-existing staged files and untracked scaffolding from May 2026; zero Phase 0.2.8 modifications. |
| **git_mobile_branch.txt** | `git -C hrms_mobile branch -vv` | `forensic_logs_and_git\git_mobile_branch.txt` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | Output empty due to unborn initial revision on branch `master`. |
| **git_mobile_log.txt** | `git -C hrms_mobile log` | `forensic_logs_and_git\git_mobile_log.txt` | 67 | `99e8febe2c9d643806f155c5e8c459ca54fb0d0bda177651a5c68b753f7c468e` | `fatal: your current branch 'master' does not have any commits yet` (0 total commits). |
| **workspace_git_check.txt** | `git status` in `F:\hrms` | `forensic_logs_and_git\workspace_git_check.txt` | 70 | `f28a30366ebcb99d45fe721e05d939fc928f24458df5ddb5aa3eb1cf2a4d3345` | `fatal: not a git repository (or any of the parent directories): .git` |
| **docs_directory_listing.txt** | `Get-ChildItem -Path F:\hrms\docs` | `forensic_logs_and_git\docs_directory_listing.txt` | 1,048 | `dd89e47264a9a08e1694f48ff78bca68160c8bdfef1b058a69cb8017cba5aa19` | Complete snapshot of directory listing and file write timestamps in `F:\hrms\docs\`. |

---

## 5. Preserved System Transcripts

| Transcript File | Original Source Path | Preserved Path | Bytes | SHA-256 | Description |
|---|---|---|:---:|---|---|
| **transcript_full.jsonl** | `C:\Users\Admin\.gemini\antigravity\brain\ffdce738-6f0a-473e-87ac-0bb4fa484100\.system_generated\logs\transcript_full.jsonl` | `transcripts\transcript_full.jsonl` | 6,042,099 | `501ba47f2b1860a927a7c936ef11d5964f434ee49479b0bf8841444d3ce4fe46` | Full, un-truncated JSONL conversation log containing every tool call, target, replacement, and response. |
| **transcript.jsonl** | `C:\Users\Admin\.gemini\antigravity\brain\ffdce738-6f0a-473e-87ac-0bb4fa484100\.system_generated\logs\transcript.jsonl` | `transcripts\transcript.jsonl` | 2,741,273 | `81d4512b9195b452818c8bfa30f9a2e6f47055743c490eeb6bf2409f87455d31` | Compact JSONL conversation log. |

---

## 6. Missing or Inaccessible Artifacts & Preservation Limitations

1. **`PHASE_0_2_8_DECISION_REGISTER.md` & `PHASE_0_2_8_IMPLEMENTATION_CHECKLIST.md`:**
   - No documents exist under these literal filenames. The actual governing documents are `PHASE_0_FINAL_DECISION_REGISTER.md` and `PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md`. Both are preserved in full.
2. **Original in-place disk state of deleted `update_audit.py`:**
   - The file `F:\hrms\update_audit.py` was deleted from disk at step 1378 using `Remove-Item update_audit.py`. However, its full, un-truncated Python code was successfully recovered from the system transcript log at step 1372 and preserved as `audit_scripts\update_audit_step1374.py`.
3. **Standalone pre-modification disk copies:**
   - Because prior tasks modified `COMPLETION_REPORT.md`, `FINAL_RECONCILIATION_REPORT.md`, and `FINAL_ACCEPTANCE_VERIFICATION_REPORT.md` in place without creating dedicated backup files in `docs/`, the historical versions preserved in `historical_pre_modification_versions/` were reconstructed using the transcript's tool call parameters and generator scripts. Each reconstructed file was verified against the cryptographic SHA-256 hashes recorded at transcript line 1172.
