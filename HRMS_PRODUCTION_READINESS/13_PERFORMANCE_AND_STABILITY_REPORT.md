# 13. Performance and Stability Report

**Test Environment:** Local Staging (`127.0.0.1:8000` Node.js `v24.3.0` single API process + `127.0.0.1:3306` MySQL `8.0.46` + `127.0.0.1:6379` Redis `8.10.3`).

## 1. Live Staging HTTP Concurrency Benchmark (`e2e_security_realtime_perf.mjs`)
25 concurrent authenticated HTTP requests per endpoint:

| Endpoint | Concurrency | Total Time | Avg Latency | p95 Latency | Error Rate |
|---|---|---|---|---|---|
| `GET /api/attendance/dashboard/` | 25 | `177.2 ms` | `166.6 ms` | `173.0 ms` | `0%` (`0/25`) |
| `GET /api/auth/employees/?page=1&limit=50` | 25 | `108.9 ms` | `100.7 ms` | `106.0 ms` | `0%` (`0/25`) |
| `GET /api/attendance/history/?page=1&limit=50` | 25 | `67.9 ms` | `66.6 ms` | `67.4 ms` | `0%` (`0/25`) |
| `GET /api/leave/my/?page=1&limit=50` | 25 | `95.3 ms` | `92.5 ms` | `94.6 ms` | `0%` (`0/25`) |

## 2. Backend Service Load Simulation (`tests/performance/load_simulation.test.js`)
4/4 **PASS** against MySQL `hrms_staging`:
- Employee Directory (100 concurrent reads): `p50: 330.47ms`, `p95: 356.54ms`, `p99: 357.20ms`, `0` errors.
- Attendance History (100 concurrent reads): `p50: 11.80ms`, `p95: 12.81ms`, `0` errors.
- Leave History (50 concurrent reads): `p50: 45.42ms`, `p95: 45.77ms`, `0` connection leaks.
- 5 parallel employee punch-ins: `30.46ms`, `0` errors.

## Overall Status: **PASS**
