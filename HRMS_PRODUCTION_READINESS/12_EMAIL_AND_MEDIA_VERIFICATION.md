# 12. Email (SMTP) and Media Verification

## SMTP Verification — **PASS**
- **Staging SMTP Server:** Local capture server (`127.0.0.1:1025`, `SMTP_SECURE=false`) logging to `captured_emails.jsonl` (zero emails sent to real employees).
- **Live End-to-End Flow (`WF-02`):** `POST /api/auth/forgot-password/request-otp/` for `emp2@staging.hrms.local` -> transactional outbox -> BullMQ worker -> `nodemailer` -> SMTP `250 Ok` -> 6-digit OTP verified via `/forgot-password/verify-otp/` -> password reset -> login `200 OK`.

## Media Verification — **PARTIAL (External Cloudinary Omitted in Staging)**
- **Static Media Protection:** `GET /media/documents/staging_id.pdf` returned **403 Forbidden** (direct unauthenticated static access blocked).
- **Path Traversal & Mime Validation:** `api_security.test.js` verified path traversal prevention; `POST /api/attendance/punch-in/` rejected non-JPEG/WEBP PNG mime type with `400`.
- **Cloudinary Upload (`StorageService.store()`):** Staging `.env.staging` intentionally omits production Cloudinary credentials (`CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`) to avoid polluting production media buckets. `StorageService.store()` fails closed with `500 Cloudinary storage service is not configured.` Live Cloudinary upload/delete remains **BLOCKED** pending isolated staging Cloudinary credentials.
