# 16. Performance Retest Report

- **Suite:** [tests/performance/load_simulation.test.js](file:///f:/hrms/node_backend/tests/performance/load_simulation.test.js) & [tests/pagination/pagination.test.js](file:///f:/hrms/node_backend/tests/pagination/pagination.test.js)
- **Database:** Isolated MySQL 8.0.46 Staging DB

## Concurrency and Latency Benchmarks

1. **Employee Directory Read Load (Concurrency: 100 simultaneous requests):**
   - Total Time: 358.9ms
   - Average Latency: 344.75ms
   - p50: 344.17ms
   - p95: 364.90ms
   - p99: 368.02ms
   - Error Rate: **0.00%**
2. **Attendance History Read Load (Concurrency: 100 simultaneous requests):**
   - Total Time: 13.6ms
   - Average Latency: 12.96ms
   - p50: 13.12ms
   - p95: 13.63ms
   - Error Rate: **0.00%**
3. **Leave Requests Read Load (Concurrency: 50 simultaneous requests):**
   - Average Latency: 39.74ms
   - p95: 40.07ms
   - Connection Leaks: **0**
4. **Standard Server-Side Pagination (8/8 PASS):**
   - Parameters clamped to max limit 100 to prevent unbounded memory allocation.
   - Standard envelope metadata includes navigation flags (`first`, `last`, `hasMore`).
