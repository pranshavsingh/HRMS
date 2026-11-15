# PRESERVATION COMMAND LOG
**Task ID:** P028-EVIDENCE-PRESERVATION-01  
**Execution Timestamp:** 2026-11-14T18:25:00+05:30  
**Preservation Directory:** `F:\hrms\evidence_preservation_P028_20261114_182132`  
**Governance Status:** Phase 0.2.8 remains **OPEN and NOT ACCEPTED**  

---

## 1. Directory Structure Initialization
```powershell
# Command:
New-Item -ItemType Directory -Path "F:\hrms\evidence_preservation_P028_20261114_182132"
New-Item -ItemType Directory -Path "F:\hrms\evidence_preservation_P028_20261114_182132\current_documents"
New-Item -ItemType Directory -Path "F:\hrms\evidence_preservation_P028_20261114_182132\historical_pre_modification_versions"
New-Item -ItemType Directory -Path "F:\hrms\evidence_preservation_P028_20261114_182132\audit_scripts"
New-Item -ItemType Directory -Path "F:\hrms\evidence_preservation_P028_20261114_182132\forensic_logs_and_git"
New-Item -ItemType Directory -Path "F:\hrms\evidence_preservation_P028_20261114_182132\transcripts"
```
**Output:**
Directories created successfully outside source documentation directories (`F:\hrms\docs`).

---

## 2. Current Document Preservation & Byte-for-Byte Verification
```powershell
Copy-Item "F:\hrms\docs\PHASE_0_FINAL_DECISION_REGISTER.md" -Destination "F:\hrms\evidence_preservation_P028_20261114_182132\current_documents\"
Copy-Item "F:\hrms\docs\PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md" -Destination "F:\hrms\evidence_preservation_P028_20261114_182132\current_documents\"
Copy-Item "F:\hrms\docs\PHASE_0_2_8_COMPLETION_REPORT.md" -Destination "F:\hrms\evidence_preservation_P028_20261114_182132\current_documents\"
Copy-Item "F:\hrms\docs\PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md" -Destination "F:\hrms\evidence_preservation_P028_20261114_182132\current_documents\"
Copy-Item "F:\hrms\docs\PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md" -Destination "F:\hrms\evidence_preservation_P028_20261114_182132\current_documents\"
Copy-Item "F:\hrms\docs\PHASE_0_2_8_INDEPENDENT_EVIDENCE_AUDIT.md" -Destination "F:\hrms\evidence_preservation_P028_20261114_182132\current_documents\"
```
**Verification Command:**
```python
# python check_hashes.py
Source: PHASE_0_FINAL_DECISION_REGISTER.md           | 40701 B | SHA: 26320e36175631fb17693e61c4dde5c876377248c8dac0a7918303e689c78e59 | Match: True
Source: PHASE_0_FINAL_IMPLEMENTATION_CHECKLIST.md    | 44169 B | SHA: 5f0b5bdfa81f97a7717d68c3c85000caf836ddfce8c49c1379ad10e605dadbdb | Match: True
Source: PHASE_0_2_8_COMPLETION_REPORT.md             | 35489 B | SHA: 024be8eb7c1aad735f03312014a868514ebc5a68b7c93d455f88c779ad42565a | Match: True
Source: PHASE_0_2_8_FINAL_RECONCILIATION_REPORT.md   | 17983 B | SHA: 75c89810ef1ac4caab9a2c3c44a71e6914433dff3640827ff13573aa80460d9e | Match: True
Source: PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT.md | 44320 B | SHA: a67ffa8d135a418ac1de1291f4927f869dcf09fd4bcf8c2d5c6fd1eb87ef849e | Match: True
Source: PHASE_0_2_8_INDEPENDENT_EVIDENCE_AUDIT.md    | 87930 B | SHA: d01cec9b3a73e73d9664c43b61061bcfd379c0e5c4180e2ee52be6599647b4a3 | Match: True
```

---

## 3. Historical Pre-Modification Versions Reconstruction & Verification
Commands executed in Python memory using transcript edit inversions and script generators:
```python
# Reconstruct CR v1.3.0 from transcript lines 1238, 1244, 1246
# Result: 34,706 bytes | SHA: 51baf8923296447c7d165b1fd00bdbdf34778d14bbbcb5849f3f3157810f4a7c
# Verified: 100% exact match against transcript line 1172

# Reconstruct RR v1.2.0 from transcript lines 1256, 1260, 1262, 1268
# Result: 17,673 bytes | SHA: 895889d0fc6dd433322b94e6277092208b7671469c4492ad9ba0189298cea5cf
# Verified: 100% exact match against transcript line 1172

# Reconstruct VR v2.7.0 from scratch/build_v270_report.py
# Result: 44,450 bytes | SHA: 21bfd5ad89eff81a474aeb7fd0fa3f84b1aa9e4fe7cac894615f4ac49c81d146
# Verified: 100% exact match against transcript line 1172

# Reconstruct unmutated Audit Report v1.0.0 from scratch/generate_independent_audit.py
# Result: 87,554 bytes | SHA: 882569726ff9afc3a663413f9a78b0a12f49082ebe1b232a6c90856ff5558a10
# Verified: 100% exact match against recorded length at transcript line 1206/1208
```

---

## 4. Script Extraction & Forensic Log Capture Commands
```powershell
# Git forensic commands:
git -C hrms_mobile status --short > forensic_logs_and_git\git_mobile_status.txt
git -C hrms_mobile branch -vv > forensic_logs_and_git\git_mobile_branch.txt
git -C hrms_mobile log > forensic_logs_and_git\git_mobile_log.txt
git status > forensic_logs_and_git\workspace_git_check.txt
powershell -Command "Get-ChildItem -Path F:\hrms\docs | Select-Object Name, Length, LastWriteTime" > forensic_logs_and_git\docs_directory_listing.txt

# Transcript copy commands:
Copy-Item "C:\Users\Admin\.gemini\antigravity\brain\ffdce738-6f0a-473e-87ac-0bb4fa484100\.system_generated\logs\transcript_full.jsonl" -Destination "transcripts\"
Copy-Item "C:\Users\Admin\.gemini\antigravity\brain\ffdce738-6f0a-473e-87ac-0bb4fa484100\.system_generated\logs\transcript.jsonl" -Destination "transcripts\"
```

---

## 5. Explicit Confirmation of Source File Integrity
- No source document in `F:\hrms\docs\` was modified, edited, renamed, moved, or deleted.
- No application source code in `F:\hrms\node_backend\`, `F:\hrms\hrms_saas\`, or `F:\hrms\hrms_mobile\` was modified.
- No database queries, migrations, or DDL operations were performed.
- No infrastructure, services, or Git commands modifying state were executed.
- All operations were strictly isolated to creating and populating `F:\hrms\evidence_preservation_P028_20261114_182132\`.
