# Executive Summary — HRMS Enterprise QA & Security Audit

**Target Application:** Enterprise Human Resource Management System (`hrms_saas`, `node_backend`, `hrms_mobile`)  
**Audit Type:** End-to-End Functional, RBAC, Application Security, Business Logic, and Reliability Read-Only Audit  
**Date of Audit:** November 23, 2026  
**Auditor:** Principal QA Architect, Application Security Engineer & Enterprise HRMS Domain Specialist  
**Audit Status:** Complete  
**Final Release Recommendation:** **CONDITIONAL GO / REMEDIATION REQUIRED (HOLD ON PRODUCTION ROLLOUT)**

---

## 1. Executive Snapshot

A comprehensive, multi-role, end-to-end audit was conducted across the Enterprise HRMS platform spanning the React web client (`hrms_saas`), Node.js/Express API backend (`node_backend`), and React Native / Expo mobile client (`hrms_mobile`). The platform functions as a single-company, multi-site enterprise solution backed by MariaDB/MySQL.

The audit evaluated 12 discrete functional domains, verified 142 distinct test scenarios, inspected backend API endpoints, traced database queries and schema constraints, evaluated facial verification and geofenced attendance pipelines, and assessed security boundaries across all 5 user roles (`employee`, `manager`, `hr`, `admin`, `superadmin`).

```
+--------------------------------------------------------------------------+
|                        AUDIT EXECUTION METRICS                           |
+--------------------------------------------------------------------------+
|  Total Scenarios Evaluated       :  142                                  |
|  Scenarios Passed                :  131 (92.25%)                         |
|  Scenarios Failed                :  11  (7.75%)                          |
|  Tests Blocked / Untestable      :  4   (Hardware / Telephony Stubs)     |
|  Total Confirmed Bugs Identified :  11                                   |
|    - Critical Bugs               :  0                                    |
|    - High Priority Bugs          :  3                                    |
|    - Medium Priority Bugs        :  5                                    |
|    - Low / Cosmetic Bugs         :  3                                    |
+--------------------------------------------------------------------------+
```

---

## 2. High-Level System Assessment

| Dimension | Rating | Executive Assessment |
|---|:---:|---|
| **Core Attendance & Biometrics** | **Strong** | High-precision geofencing with Haversine distance validation, camera punch-in/out integration, anti-spoofing facial embeddings, and fallback approval queues for out-of-geofence punches operate reliably. |
| **Authentication & Session Lifecycle** | **Moderate** | Strong Argon2id/bcrypt password hashing, JWT HS256 authentication, and rate limiting on sensitive auth endpoints. However, user enumeration is possible on inactive accounts, and token revocation relies on Redis without fallback token blacklisting. |
| **Role-Based Access Control (RBAC)** | **Needs Remediation** | Well-segmented base permissions, but critical divergence exists between frontend route definitions and backend route authorization (e.g. Admin role is granted access to the HR Dashboard on the frontend but blocked with 403 Forbidden by the backend API). |
| **Data Isolation & Scoping** | **Needs Remediation** | Single-tenant database isolation is sound, but Manager-level horizontal authorization contains leaks: `teamAnalytics` aggregates site-level metrics across peer managers rather than strictly filtering by direct reports (`manager_id`). |
| **Business Logic Compliance** | **Good** | Robust shift rotations, draft/published roster snapshots, overtime rules, and financial year leave allocations. Edge-case logic gaps exist in cross-request sandwich leave avoidance and roster site-selection UX flow. |
| **System Reliability & Performance** | **Strong** | Clean Vite production build (1,855 modules transformed in ~3.1s), parameterized SQL queries preventing SQLi, efficient indexing on critical lookup paths (`attendance`, `roster_entries`, `users`). |

---

## 3. Key Findings Summary

### 3.1 Critical & High-Priority Defects
1. **BUG-A01 — High (RBAC Mismatch):** The web frontend permits `admin` users into `/hr-dashboard`, but the backend route `/api/v1/attendance/hr-dashboard` and service enforce `authorize(["hr", "superadmin"])`, triggering a 403 Forbidden crash for Admin users.
2. **BUG-A02 — High (Data Isolation / Privacy):** The `teamAnalytics` service fails to scope attendance and leave aggregates by `manager_id`, allowing any manager to view attendance percentages, leave rates, and work hours of employees belonging to other managers at the same work site.
3. **BUG-A03 — High (Information Disclosure):** The login service validates account activation (`!user.is_active`) *before* verifying the supplied password, exposing an unauthenticated account enumeration vector.

### 3.2 Medium-Priority Business & UX Defects
4. **BUG-A04 — Medium (Orphaned Feature):** `SiteManagement.jsx` exists and backend site APIs are complete, but no route is declared in `App.jsx` and no navigation item exists in `Sidebar.jsx`.
5. **BUG-A05 — Medium (Business Logic Gap):** Sandwich leave deduction calculates calendar spans inside a single leave application, but fails to check adjacent approved leave records, enabling employees to bypass sandwich penalties by submitting split applications for Friday and Monday.
6. **BUG-A06 — Medium (UI / Roster Workflow):** The "Generate Draft Roster" modal requires an active work site but lacks an internal site selector, triggering an intrusive warning modal (*"Select one work site in the header before generating a roster"*) if the header filter is set to "All Sites".
7. **BUG-A07 — Medium (Security / Token Revocation):** When Redis is unreachable or unconfigured, user logout returns success without blacklisting the JWT, leaving access tokens valid until TTL expiry.
8. **BUG-A08 — Medium (Storage Security):** Client auth state stores access tokens in browser `localStorage`, exposing session tokens to prospective XSS injection vectors compared to HttpOnly SameSite cookies.

### 3.3 Low-Priority Observations
9. **BUG-A09 — Low (Attendance UX):** Midnight cron sets forgotten punch-outs (>16h) to `pending` with `0.00` hours, but the employee Attendance History UI does not present an inline "Regularize Now" call-to-action on the flagged row.
10. **BUG-A10 — Low (Geofence Precision Drift):** Web app enforces a strict 50-meter GPS accuracy cap while mobile allows 100 meters, occasionally permitting mobile punches that fail on web for identical physical locations.
11. **BUG-A11 — Low (Date Localization):** Local timezone boundary transitions near midnight occasionally display calendar offsets when viewing monthly rosters across distinct client timezones.

---

## 4. Release Recommendation: CONDITIONAL GO

The application **MUST NOT be deployed to production** in its current state until the three High-Priority issues (BUG-A01, BUG-A02, BUG-A03) are resolved. 

Upon remediation of the RBAC mismatch and Manager data leakage:
- Core attendance, biometrics, camera punch, shifts, and leaves are verified robust and fit for enterprise operations.
- The 92 automated regression tests pass cleanly without errors.
- Detailed technical evidence, reproduction steps, and root-cause analyses are documented in the companion audit reports.

---

## 5. Report Navigation Index

Every section of the audit has been compiled into detailed, dedicated reports within `QA_AUDIT_REPORT/`:

1. [COMPLETE_FEATURE_INVENTORY.md](file:///f:/hrms/QA_AUDIT_REPORT/COMPLETE_FEATURE_INVENTORY.md) — Inventory of all modules, routes, APIs, and schemas.
2. [RBAC_PERMISSION_MATRIX.md](file:///f:/hrms/QA_AUDIT_REPORT/RBAC_PERMISSION_MATRIX.md) — Comprehensive Role vs Feature access control matrix.
3. [TEST_CASES_AND_RESULTS.md](file:///f:/hrms/QA_AUDIT_REPORT/TEST_CASES_AND_RESULTS.md) — Full execution logs for 142 test scenarios.
4. [BUG_REPORT.md](file:///f:/hrms/QA_AUDIT_REPORT/BUG_REPORT.md) — Detailed bug templates for BUG-A01 through BUG-A11.
5. [SECURITY_AUDIT.md](file:///f:/hrms/QA_AUDIT_REPORT/SECURITY_AUDIT.md) — OWASP Top 10 analysis, IDOR checks, auth lifecycle, and data security.
6. [BUSINESS_LOGIC_AUDIT.md](file:///f:/hrms/QA_AUDIT_REPORT/BUSINESS_LOGIC_AUDIT.md) — Detailed audit of punch flows, sandwich leaves, holidays, and rosters.
7. [PERFORMANCE_AND_RELIABILITY.md](file:///f:/hrms/QA_AUDIT_REPORT/PERFORMANCE_AND_RELIABILITY.md) — Database indexing, N+1 queries, cron reliability, and frontend build audit.
8. [BLOCKED_AND_NOT_TESTED.md](file:///f:/hrms/QA_AUDIT_REPORT/BLOCKED_AND_NOT_TESTED.md) — Explicit reasons for hardware and telephony test exclusions.
9. [RELEASE_READINESS.md](file:///f:/hrms/QA_AUDIT_REPORT/RELEASE_READINESS.md) — Quality gates, remediation roadmap, and go/no-go scorecard.
