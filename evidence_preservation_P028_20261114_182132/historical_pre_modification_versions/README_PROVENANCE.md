# Historical Pre-Modification Versions — Provenance & Reconstruction Methodology

This directory preserves the historical pre-modification versions of the four documents affected by the unauthorized edits in Task 10:

1. **PHASE_0_2_8_COMPLETION_REPORT_v1.3.0.md**
   - **Provenance:** Reconstructed by inverting the exact replacement tool calls executed at transcript lines 1238, 1244, and 1246 back to their original targets.
   - **Verification:** Verified to match the exact byte size (34,706 bytes) and SHA-256 hash (51baf8923296447c7d165b1fd00bdbdf34778d14bbbcb5849f3f3157810f4a7c) logged during the physical integrity audit at transcript line 1172.

2. **PHASE_0_2_8_FINAL_RECONCILIATION_REPORT_v1.2.0.md**
   - **Provenance:** Reconstructed by inverting the exact replacement tool calls executed at transcript lines 1256, 1260, 1262, and 1268 back to their original targets.
   - **Verification:** Verified to match the exact byte size (17,673 bytes) and SHA-256 hash (895889d0fc6dd433322b94e6277092208b7671469c4492ad9ba0189298cea5cf) logged at transcript line 1172.

3. **PHASE_0_2_8_FINAL_ACCEPTANCE_VERIFICATION_REPORT_v2.7.0.md**
   - **Provenance:** Generated from scratch/build_v270_report.py (which authored v2.7.0 at step 1161) evaluated against the pre-modification documents.
   - **Verification:** Verified to match the exact byte size (44,450 bytes) and SHA-256 hash (21bfd5ad89eff81a474aeb7fd0fa3f84b1aa9e4fe7cac894615f4ac49c81d146) logged at transcript line 1172.

4. **PHASE_0_2_8_INDEPENDENT_EVIDENCE_AUDIT_v1.0.0_unmutated.md**
   - **Provenance:** Generated from scratch/generate_independent_audit.py (which authored the initial independent evidence audit at step 1203/1205 prior to the post-hoc execution of update_audit.py).
   - **Verification:** Preserves the original disclosure of Defect DEF-01 (linear Cloudinary flow in Completion Report Section 3.2) as an OPEN defect, matching the exact initial byte size (87,554 bytes) logged at transcript line 1206.
