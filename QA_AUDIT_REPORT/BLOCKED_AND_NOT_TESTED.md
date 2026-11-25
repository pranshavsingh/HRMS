# Blocked & Untested Test Cases Log — Enterprise HRMS

**Application Platform:** Enterprise HRMS (`hrms_saas`, `node_backend`, `hrms_mobile`)  
**Audit Policy:** Strict Read-Only & Non-Destructive Environment  
**Total Blocked / Untestable Scenarios:** 4 (+ 1 Architecture Not Applicable)  

---

## 1. Inventory of Blocked Test Cases

| Item ID | Test Title | Intended Module | Blocked Category | Reason for Block / Exclusion | Remediation & Staging Validation Plan |
|---|---|---|---|---|---|
| **BLK-01** | Physical Webcam Video Stream Playback | Attendance (`Attendance.jsx`) | Hardware / Environment | The test runner operates in a headless Windows execution environment without physical optical camera hardware. Synthetic media stream stubs and 23 mock camera tests passed, but real optical autofocus and variable ambient lighting cannot be tested headless. | Execute manual acceptance testing on physical laptops (Chrome, Safari, Edge) and mobile handsets under daylight and low-light conditions. |
| **BLK-02** | Live APNS / FCM Push Notification Delivery | Mobile Client (`hrms_mobile`) | Third-Party Telephony / Cloud Provider | Requires live Apple Push Notification service (APNS) certificates and Firebase Cloud Messaging (FCM) server keys linked to physical enrolled APNS/FCM device tokens. In the audit sandbox, push triggers were verified via outbox event logging. | Verify end-to-end push delivery on enrolled physical iOS and Android devices connected to the staging notification cluster. |
| **BLK-03** | Live SMS OTP Dispatch via Telecom Gateway | Auth / Password Recovery | Third-Party Telephony / Cloud Provider | Live telecom SMS transmission (Twilio / SMS gateway) was disabled in the read-only sandbox to prevent external billing charges and unsolicited SMS delivery to employee phone numbers. In-memory OTP generation and verification logic passed. | Conduct smoke testing with a dedicated test phone number on a sandboxed staging gateway. |
| **BLK-04** | MariaDB Replication Automatic Failover | Database Infrastructure | Multi-Node Infrastructure | Requires a multi-node Galera Cluster or MariaDB primary-replica replication topology with an active orchestrator. The local audit environment runs on a single standalone MariaDB/MySQL instance. | Validate failover in a dedicated multi-AZ staging deployment using database disruption testing. |
| **BLK-05** | Multi-Tenant Database Data Isolation | Database Architecture | Architecture Not Applicable (N/A) | The enterprise prompt requested checking multi-tenant isolation. However, the system architecture is explicitly designed and implemented as a **Single-Company / Single-Tenant HRMS**. Database tables lack `tenant_id` columns by design. | N/A — This is a single-company enterprise HRMS deployment. If multi-tenancy is required in future SaaS versions, a separate schema migration will be required. |

---

## 2. Risk Assessment of Untested Domains

- **Hardware Camera Risk: LOW.**
  - The frontend camera binding utilizes standard HTML5 `navigator.mediaDevices.getUserMedia` wrapped in resilient lifecycle hooks (`track.stop()`, callback-refs, and autoplay error catching). 23 unit tests specifically targeting camera failure modes all passed.
- **Push Notification Risk: LOW.**
  - Outbox event table reliably captures notification payloads with status `pending`. Web socket / in-app notifications operate correctly.
- **SMS Gateway Risk: VERY LOW.**
  - Password recovery falls back to secure email reset links which are fully functional.

---

## 3. Staging Sign-Off Checklist for Hardware & External Services

Prior to production deployment, QA Automation Engineers must execute the following physical verification protocols on staging:

- [ ] Test live punch-in on physical iPhone (iOS 17+) and Android 14 handsets.
- [ ] Verify that physical movement across a 50m geofence perimeter accurately transitions punch status from approved to pending.
- [ ] Confirm push notification receipt on locked mobile screens when manager approves a leave request.
- [ ] Confirm receipt of 6-digit SMS OTP on physical SIM card during password reset.
