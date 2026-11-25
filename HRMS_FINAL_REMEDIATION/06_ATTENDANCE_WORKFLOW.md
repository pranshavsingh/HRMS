# 06. Attendance Punch In/Out Workflow (`WF-04`)

- **Workflow ID:** `WF-04`
- **Starting Role:** `employee` (`stg_emp1`)
- **UI Screen:** `/attendance` (Web), `/punch` (Mobile)

## Execution & Concurrency Evidence

1. **Authentication & Authorization:**
   - Unauthenticated `POST /api/attendance/punch-in/` returned **HTTP 401 Unauthorized** (`ATT-PUNCH-UNAUTH` PASS).
2. **Geographical Coordinates & Geofencing:**
   - Coordinates outside valid ranges (e.g. lat > 90) returned **HTTP 400 Bad Request** (`ATT-PUNCH-BADGEO` PASS).
   - Distance calculation validates against assigned work site coordinates within allowed radius (150m).
3. **High-Concurrency Punch-In:**
   - Tested 10 simultaneous punch-in requests for the same employee in `attendance_concurrency.test.js`.
   - **Result:** Exactly 1 punch session was created in MySQL, 9 concurrent requests were safely serialized and rejected without duplicate records.
4. **Punch-Out Lifecycle & Duration:**
   - Active punch session retrieved via `/api/attendance/status/`.
   - Consecutive punch-out calculates working hours and stores valid `Date` object in `punch_out_time`.
   - Tested 10 simultaneous punch-out requests in `attendance_concurrency.test.js`: exactly 1 succeeded.
5. **Exception Handling & Approvals:**
   - Punches outside radius create `attendance_attendanceapproval` record in `pending` status.
   - Manager approval workflow verified live in `attendance_concurrency.test.js` (5/5 PASS after `BUG-PROD-003` site query fix).
6. **Final Status:** **PARTIAL (Concurrency, geofencing, and transactions PASS; live photo upload blocked on Cloudinary & real device camera)**.
