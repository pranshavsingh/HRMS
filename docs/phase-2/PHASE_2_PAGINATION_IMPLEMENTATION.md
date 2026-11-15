# HRMS Phase 2: Server-Side Pagination Architecture & Specification
**Milestone:** M2.3 — Consistent Server-Side Pagination & Bounded Collections  
**Repository:** `pranshavsingh/HRMS`  
**Branch:** `feat/phase-2-database-performance`  
**Date:** November 2026  
**Status:** Completed & Verified  

---

## 1. Context & Motivation

In unpaginated APIs, endpoints return entire database tables in a single payload. In an enterprise system with 5,000–8,000 employees and hundreds of thousands of attendance and audit records:
1. **Memory Exhaustion (OOM):** Node.js heap quickly spikes when serializing 50,000+ row JSON responses.
2. **Database Contention:** Unbounded `SELECT *` queries force full table scans, keeping database locks/snapshots open and starving concurrent writers.
3. **Network Latency:** Large multi-megabyte JSON payloads lead to head-of-line blocking on client connections, especially for mobile devices on cellular networks.

---

## 2. Standardized Pagination Specification

All collection endpoints adhere to a uniform query parameter contract and response envelope implemented via `node_backend/src/utils/pagination.js`:

### 2.1 Request Parameters
| Parameter | Type | Default | Bounds | Description |
| :--- | :--- | :--- | :--- | :--- |
| `page` | Integer | `1` | $\ge 1$ | 1-based index of the requested page. |
| `limit` | Integer | `50` | $1 \le \text{limit} \le 100$ | Number of records per page (strictly clamped at 100). |

`parsePagination(query, defaultLimit = 50, maxLimit = 100)` handles invalid inputs gracefully:
- Missing, NaN, or negative `page` defaults to `1`.
- Missing, NaN, or non-positive `limit` defaults to `50`.
- Limits exceeding `maxLimit` are clamped to `100`.
- Offsets are calculated deterministically: $\text{offset} = (\text{page} - 1) \times \text{limit}$.

### 2.2 Standard Response Envelope
```json
{
  "data": [ ... ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 342,
    "totalPages": 7,
    "pages": 7,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

---

## 3. Endpoints Upgraded to Server-Side Pagination

The following 9 core collection endpoints have been standardized with server-side pagination:

1. `GET /api/accounts/employees`
   - Paged active employees with joined manager and geofence data.
   - Batch document count resolution.
   - Default: 50, Max: 100.
2. `GET /api/accounts/managers`
   - Paged active managers list for assignment dropdowns and directory views.
3. `GET /api/accounts/my-documents`
   - Employee self-service documents list.
4. `GET /api/accounts/documents/:id`
   - HR/Admin employee document management list.
5. `GET /api/accounts/audit-logs`
   - Compliance and security audit trail query with severity filtering.
6. `GET /api/leave/my-leaves`
   - Employee leave request history with leave summary balance preservation.
7. `GET /api/leave/approvals`
   - Manager/HR/Admin leave request approval queue with summary counts.
8. `GET /api/attendance/history`
   - Historical punch session records with date filtering and summary metrics.
9. `GET /api/attendance/approvals`
   - Regularization and exception approval queue with pagination envelope.

---

## 4. Frontend & Mobile Backward Compatibility

To maintain seamless backward compatibility with existing web (`hrms_saas`) and mobile (`hrms_mobile`) client consumers, the client components were updated to consume both legacy array responses and the modern envelope:

```javascript
// Example in hrms_saas/src/pages/Employees.jsx
const employeeList = Array.isArray(res.data) ? res.data : (res.data?.data || []);
```

Similarly, in mobile screens (`hrms_mobile/src/app/documents.tsx`, `my-documents.tsx`):
```typescript
const docs = Array.isArray(response.data) ? response.data : (response.data?.data || []);
```

---

## 5. Automated Verification

Integration test coverage in `node_backend/tests/pagination/pagination.test.js`:
- Parameter parsing and bounds clamping ($< 1$, $> 100$).
- Standard envelope formatting and navigation flag generation (`hasNextPage`, `hasPreviousPage`).
- Database integration on `accountsService.getEmployees`, `leaveService.myLeaves`, and `attendanceService.getHistory`.
- **Result:** 8/8 tests passing.
