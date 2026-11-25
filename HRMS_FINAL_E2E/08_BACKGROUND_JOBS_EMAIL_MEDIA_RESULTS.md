# 08. Background Jobs, Email & Media Results

## BullMQ & Transactional Outbox (`npm run test:phase3`)
- **Observability (`phase3/observability.test.js`):** **7/7 PASS** (Prometheus `/metrics`, HTTP histograms, pool/outbox gauges, secret redaction).
- **Queue (`phase3/queue.test.js`):** **2/2 non-Redis PASS; 3/3 Redis-dependent tests SKIPPED** (`Local Redis offline — ECONNREFUSED 127.0.0.1:6379`).
- **Outbox / Failure Injection / DLQ / OTP Outbox / Reconciliation (`outbox.test.js`, `failure_injection.test.js`, `dead_letter_replay.test.js`, `otp_outbox.test.js`, `reconciliation.test.js`):** **BLOCKED / FAIL (`ECONNREFUSED 127.0.0.1:3306`)** — require isolated staging MySQL.

## Email (SMTP)
- **Status:** **BLOCKED** — `node_backend/.env` has placeholder SMTP credentials (`your-email@yourdomain.com`); no sandbox SMTP server is configured, and live OTP email delivery is blocked.

## Media (Local Storage & Cloudinary)
- **Unit/Security Verified:** `api_security.test.js` verified path traversal prevention on file deletion and `403` block on direct `/media/documents` static access. `remediation_regression.test.js` verified `uploadDocumentSchema` missing-file rejection and `getCloudinarySignature` folder ownership enforcement.
- **Live Upload/Preview/Download/Delete:** **BLOCKED** — requires authenticated staging session + staging MySQL.
