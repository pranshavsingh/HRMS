# 04. Cloudinary Integration Report

- **Service File:** [storage.service.js](file:///f:/hrms/node_backend/src/services/storage.service.js), [cloudinary.service.js](file:///f:/hrms/node_backend/src/services/cloudinary.service.js)
- **Staging Mode:** Credentials Intentionally Omitted / Fail-Closed Verification

## Integration Architecture & Verification

1. **Fail-Closed Security Design:**
   - In staging without configured credentials, `storageService.store()` explicitly fails closed and raises `AppError("Cloudinary storage service is not configured.", 500)`.
   - It never creates orphan database records or corrupted paths.
2. **Path Traversal Protection:**
   - In `storageService.delete()`, all file deletion paths are sanitized using `path.resolve` against `config.mediaRoot`. Any attempt to escape the media boundary via `../` is blocked and logged.
3. **Upload Signature Cryptographic Integrity:**
   - Client-side direct uploads use `cloudinaryService.generateUploadSignature(params)`.
   - Signatures are generated using SHA-1 HMAC with `config.cloudinaryApiSecret` and an enforced `timestamp`.
   - Cross-user folder spoofing is strictly rejected: a user cannot request a signature for another employee's storage folder (`accounts.routes.js:84`, tested in `remediation_regression.test.js`).
4. **Private Document Protection:**
   - Private employee documents (Aadhaar, PAN, certificates) are uploaded with `type: "private"` under `employee-documents/:userId/`.
   - Direct static access to `/media/documents/` is blocked with HTTP 403 by middleware (`api_security.test.js`).
   - Access requires server-generated signed URLs via `cloudinary.utils.private_download_url` with a 3600-second expiration.
5. **Missing Prerequisite for Live Staging:**
   - Valid staging `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` must be provisioned to transition from `PARTIAL (Fail-Closed Verified)` to `FULLY PASS`.
