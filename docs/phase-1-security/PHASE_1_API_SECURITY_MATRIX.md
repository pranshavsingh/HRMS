# Phase 1: API Security & Role Authorization Matrix

| Endpoint | Method | Permitted Roles | Scope Enforcement / IDOR Protection | Rate Limit Tier |
| :--- | :---: | :--- | :--- | :--- |
| `/api/v1/auth/login/` | POST | Public | Generic credentials error; no user enumeration | Strict IP (30 / 15m) |
| `/api/v1/auth/refresh/` | POST | Public | Rotates token; family revocation on reuse; 15s grace window | High-throughput |
| `/api/v1/auth/logout/` | POST | Public / Auth | Revokes refresh token & blacklists active session in Redis | Standard API |
| `/api/v1/auth/forgot-password/request-otp/` | POST | Public | Generic response; keyed hash stored with expiry | Strict IP/Email |
| `/api/v1/auth/forgot-password/verify-otp/` | POST | Public | 5-attempt atomic limit; returns single-use `reset_token` | Strict IP/Email |
| `/api/v1/auth/forgot-password/reset/` | POST | Public | Strictly requires verified challenge; single-use atomic consumption | Strict IP/Email |
| `/api/v1/auth/change-password/` | POST | Authenticated | Verifies current password; revokes other sessions | Standard API |
| `/api/v1/auth/create-employee/` | POST | Admin, HR, Superadmin | Hierarchical role assignment (HR cannot create Admin/Superadmin) | Standard API |
| `/api/v1/auth/employees/` | GET | Admin, HR, Superadmin | Paginated staff roster; inactive accounts filtered by default | Standard API |
| `/api/v1/auth/employees/:user_id/` | PUT | Admin, HR, Superadmin | Target role check: HR cannot edit Admin/Superadmin | Standard API |
| `/api/v1/auth/employees/:user_id/` | DELETE | Admin, HR, Superadmin | Target role check: Cannot archive accounts above caller level | Standard API |
| `/api/v1/auth/documents/my/` | GET | Authenticated | Strictly constrained to `actor.id` | Standard API |
| `/api/v1/auth/documents/:user_id/` | GET | Admin, HR, Manager, Superadmin | **IDOR Enforced**: Managers can ONLY view direct reports (`manager_id == actor.id`) | Standard API |
| `/api/v1/documents/:id` | GET | Authenticated | **IDOR Enforced**: Only owner or direct manager or Admin/HR/Superadmin | Standard API |
| `/api/v1/attendance/punch-in/` | POST | Authenticated | Constrained to `actor.id`; geofenced validation | Standard API |
| `/api/v1/attendance/punch-out/` | POST | Authenticated | Constrained to `actor.id`; geofenced validation | Standard API |
| `/api/v1/attendance/status/` | GET | Authenticated | Constrained to `actor.id` | Standard API |
| `/api/v1/attendance/approvals/` | GET | Manager, HR, Admin, Superadmin | Scoped to reviewer assignments | Standard API |
| `/api/v1/attendance/approvals/:id/` | POST | Manager, HR, Admin, Superadmin | Prevents self-approval; verified reviewer assignment | Standard API |
| `/api/v1/attendance/team-attendance/` | GET | Manager, HR, Admin, Superadmin | **IDOR Enforced**: Managers can ONLY view managed employees | Standard API |
| `/api/v1/leave/apply/` | POST | Authenticated | Constrained to `actor.id` | Standard API |
| `/api/v1/leave/my/` | GET | Authenticated | Constrained to `actor.id` | Standard API |
| `/api/v1/leave/approvals/` | GET | Manager, HR, Admin, Superadmin | Scoped to reviewer hierarchy | Standard API |
| `/api/v1/leave/approvals/:id/` | POST | Manager, HR, Admin, Superadmin | Strict hierarchy check (`canReview`); prevents self-approval | Standard API |
| `/health/ready` | GET | Public | Dependency latency & liveness probe (no secrets leaked) | Unrestricted |
