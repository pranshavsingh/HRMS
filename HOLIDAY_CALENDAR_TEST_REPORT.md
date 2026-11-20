# Company Holiday Calendar — Test Report

**Outcome: CONDITIONAL PASS**

## Executed checks

| Check | Result | Evidence / scope |
|---|---|---|
| Web production build | PASS | Vite transformed 1,845 modules and built successfully. Advisory: minified JS bundle is about 2 MB. |
| Focused web lint | PASS | ESLint on calendar, API client, realtime provider, route, and navbar files. |
| Mobile type check | PASS | `npx tsc --noEmit`. |
| Backend syntax | PASS | `node --check` on holiday repository/service/controller/routes, attendance/realtime services, and app. |
| Migration | PASS | Applied migrations 008 and 017 in disposable MariaDB 11.8.9; inspected final table DDL. |
| Service-level CRUD and audit | PASS | Create/list/update/delete; duplicate date gives conflict; cross-tenant detail is not found; create/update audit rows exist. |
| HTTP authentication/RBAC/tenant | PASS | Read allowed to employee; mutation denied to employee; cross-tenant header denied; HR create/delete allowed; cross-tenant record lookup returns 404. |
| Realtime tenant isolation | PASS | Two authenticated tenant memberships connected; tenant 1 event reached tenant 1 client only. |
| Attendance regression | PASS | Holiday attendance stayed `P`; no-record holiday is `H`, carries metadata and is not counted absent; Sunday remains `WO`; tenant-specific holiday query used. |

## Test environment

Disposable Docker image `mariadb:11.8.9`, container `hrms-holiday-test-20261117`, loopback-only port `13307`, database `hrms_holiday_test`. Test tables and records were synthetic. No configured production database was used.

## Not verified

- Native iOS/Android UI rendering, assistive technology behavior, and device network variations.
- Full end-to-end browser interaction across all roles, tenant changes, and reconnect scenarios.
- Concurrent competing writes, deadlock/retry behavior, load, Redis failover/outage behavior, and live deployment behind the actual Nginx cluster.
- Running migration 017 against a production-like full schema or any live database.
- Broad unrelated attendance, leave, or roster regression suites.

The first attendance assertion initially expected zero ordinary absences for all other dates; the calendar correctly retained its ordinary absent marks. The corrected check validated the holiday-specific code and preserved baseline behavior and passed. This is not a project test failure.
