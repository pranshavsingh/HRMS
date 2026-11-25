# 02. Test Data and Role Matrix

*(No passwords, hashes, or access tokens are recorded in this report.)*

## Staging Tenants
1. **Tenant 1 (`id=1`, `code=DEFAULT`)**: `Primary Organization` — primary staging tenant with Sites `HQ-MUM` (`Mumbai HQ`) and `BLR-HUB` (`Bangalore Tech Hub`), shift `DAY-STD` (`09:30`–`18:30 IST`), holidays (`2026-12-25`, `2026-01-26`, `2027-08-15`), and historical attendance/leave records.
2. **Tenant 2 (`id=2`, `code=STAGING_B`)**: `Tenant Beta Corp` — isolated second tenant with Site `BETA-DEL` (`Beta Delhi Office`), holiday `2026-12-31` (`Beta Year End`), and independent employees/managers/admins for cross-tenant security testing.

## Role-Based Staging Accounts (`workforce_user_tenant.role`)

| Username | Role | Tenant | Reporting Manager | Primary Site | Seeded Purpose |
|---|---|---|---|---|---|
| `admin` | `superadmin` | 1 (`DEFAULT`) | — | `HQ-MUM` | Root superadmin (`init-mysql.js`) |
| `stg_superadmin` | `superadmin` | 1 (`DEFAULT`) | — | `HQ-MUM` | Web CDP & Audit Logs E2E |
| `stg_admin1` | `admin` | 1 (`DEFAULT`) | — | `HQ-MUM` | Admin dashboard, sites, employee archive |
| `stg_hr1` | `hr` | 1 (`DEFAULT`) | — | `HQ-MUM` | HR policies, shifts, concessions, onboarding |
| `stg_mgr1` | `manager` | 1 (`DEFAULT`) | — | `HQ-MUM` | Team approvals (attendance & leave) |
| `stg_emp1` | `employee` | 1 (`DEFAULT`) | `stg_mgr1` | `HQ-MUM` | Punch in/out, leave apply, documents |
| `stg_emp2` | `employee` | 1 (`DEFAULT`) | `stg_mgr1` | `HQ-MUM` | OTP password reset & SMTP verification |
| `stg_t2_admin` | `admin` | 2 (`STAGING_B`) | — | `BETA-DEL` | Cross-tenant isolation verification |
| `stg_t2_hr` | `hr` | 2 (`STAGING_B`) | — | `BETA-DEL` | Cross-tenant isolation verification |
| `stg_t2_mgr` | `manager` | 2 (`STAGING_B`) | — | `BETA-DEL` | Cross-tenant isolation verification |
| `stg_t2_emp1` | `employee` | 2 (`STAGING_B`) | `stg_t2_mgr` | `BETA-DEL` | Cross-tenant Socket.IO & API isolation |
