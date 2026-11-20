# HRMS STAGE 3: API SPECIFICATION & INTEGRATION GUIDE
## Employee Shift Assignment & Roster Management Endpoints

**Base Path:** `/api/v1/workforce`  
**Authentication:** HTTP Authorization Header (`Bearer <jwt>`)  
**Tenant Isolation:** Implicit via authenticated user's tenant or explicit via `X-Tenant-ID: <id>` (Superadmin only)  
**Content-Type:** `application/json`

---

### 1. Shift Assignment APIs (`/assignments`)

#### 1.1 List Assignments
- **Endpoint:** `GET /api/v1/workforce/assignments`
- **RBAC:** `admin`, `hr`, `manager`, `superadmin`
- **Query Parameters:**
  - `userId` (optional): Filter by specific employee user ID.
  - `team` (optional): Filter by employee team name.
  - `status` (optional): `draft` | `published` | `superseded` | `cancelled`.
  - `page` (optional, default: 1): Page number.
  - `limit` (optional, default: 50): Page size limit (max 100).
- **Response (200 OK):**
```json
{
  "total": 1,
  "page": 1,
  "limit": 50,
  "assignments": [
    {
      "id": 9,
      "tenant_id": 1,
      "user_id": 103,
      "employee_name": "Emp Stage3",
      "email": "emp_stg3@hrms.local",
      "team_name": "Engineering",
      "shift_id": 10,
      "shift_name": "Morning Shift",
      "shift_code": "MORN",
      "shift_version_id": 10,
      "shift_version_number": 1,
      "start_time": "08:00:00",
      "end_time": "16:30:00",
      "total_work_hours": 8.5,
      "effective_from": "2026-12-01",
      "effective_to": "2026-12-31",
      "status": "published",
      "snapshot_hash": "e571db08a011cd4cd25c85b78cec5cf9df20f259ac53f9e3208483d97d1bd2a4"
    }
  ]
}
```

#### 1.2 Create Draft Assignment
- **Endpoint:** `POST /api/v1/workforce/assignments`
- **RBAC:** `admin`, `hr`, `superadmin`
- **Request Body:**
```json
{
  "user_id": 103,
  "shift_id": 10,
  "shift_version_id": 10,
  "effective_from": "2026-12-01",
  "effective_to": "2026-12-31"
}
```
- **Response (201 Created):**
```json
{
  "id": 9,
  "tenant_id": 1,
  "user_id": 103,
  "shift_id": 10,
  "shift_version_id": 10,
  "effective_from": "2026-12-01",
  "effective_to": "2026-12-31",
  "status": "draft"
}
```
- **Error Responses:**
  - `400 Bad Request`: Validation failure (e.g. `effective_from > effective_to`, shift version not published).
  - `404 Not Found`: User not found in tenant or shift version not found.
  - `409 Conflict`: Employee already has an active draft assignment.

#### 1.3 Publish Assignment
- **Endpoint:** `POST /api/v1/workforce/assignments/:id/publish`
- **RBAC:** `admin`, `hr`, `superadmin`
- **Behavior:**
  - Atomically locks parent assignment and employee record.
  - Closes/supersedes any prior published assignment overlapping `effective_from`.
  - Builds canonical RFC 8785 JSON snapshot including shift timings, breaks, policies, and employee details.
  - Generates SHA-256 integrity hash and stores in `snapshot_hash`.
  - Sets `status = 'published'`, `published_by`, `published_at`.
- **Response (200 OK):**
```json
{
  "id": 9,
  "tenant_id": 1,
  "user_id": 103,
  "shift_id": 10,
  "shift_version_id": 10,
  "effective_from": "2026-12-01",
  "effective_to": "2026-12-31",
  "status": "published",
  "snapshot_hash": "e571db08a011cd4cd25c85b78cec5cf9df20f259ac53f9e3208483d97d1bd2a4"
}
```

#### 1.4 Cancel Assignment
- **Endpoint:** `POST /api/v1/workforce/assignments/:id/cancel`
- **RBAC:** `admin`, `hr`, `superadmin`
- **Request Body:**
```json
{
  "reason": "Team reorganization for Q1"
}
```
- **Response (200 OK):**
```json
{
  "id": 9,
  "status": "cancelled",
  "cancellation_reason": "Team reorganization for Q1"
}
```

#### 1.5 Bulk Shift Assignment
- **Endpoint:** `POST /api/v1/workforce/assignments/bulk`
- **RBAC:** `admin`, `hr`, `superadmin`
- **Request Body:**
```json
{
  "userIds": [103, 105, 106],
  "teamName": "Engineering",
  "shiftId": 10,
  "shiftVersionId": 10,
  "effectiveFrom": "2026-12-01",
  "effectiveTo": "2026-12-31",
  "publishImmediately": true
}
```
- **Response (200 OK):**
```json
{
  "total_selected": 3,
  "successfully_assigned": 2,
  "rejected": 1,
  "skipped": 0,
  "assignments": [
    { "id": 10, "user_id": 103, "status": "published" },
    { "id": 11, "user_id": 105, "status": "published" }
  ],
  "conflicts": [
    {
      "user_id": 106,
      "reason": "Cannot publish assignment: Overlaps with existing published assignment ID 4"
    }
  ]
}
```

---

### 2. Shift Rotation Pattern APIs (`/rotations`)

#### 2.1 List Rotations
- **Endpoint:** `GET /api/v1/workforce/rotations`
- **RBAC:** `admin`, `hr`, `manager`, `employee`, `superadmin`
- **Response (200 OK):** List of rotation definitions.

#### 2.2 Create Rotation Pattern
- **Endpoint:** `POST /api/v1/workforce/rotations`
- **RBAC:** `admin`, `hr`, `superadmin`
- **Request Body:**
```json
{
  "code": "ROT_223_PITMAN",
  "name": "2-2-3 Pitman Rotation",
  "description": "14-day cycle with alternating 2 and 3 day work patterns",
  "cycle_length_days": 14,
  "steps": [
    { "step_order": 1, "shift_id": 10, "duration_days": 2, "is_off_day": false },
    { "step_order": 2, "shift_id": null, "duration_days": 2, "is_off_day": true },
    { "step_order": 3, "shift_id": 10, "duration_days": 3, "is_off_day": false },
    { "step_order": 4, "shift_id": null, "duration_days": 2, "is_off_day": true },
    { "step_order": 5, "shift_id": 10, "duration_days": 2, "is_off_day": false },
    { "step_order": 6, "shift_id": null, "duration_days": 3, "is_off_day": true }
  ]
}
```
- **Response (201 Created):** Full rotation object with all configured steps.

#### 2.3 Publish Rotation Pattern
- **Endpoint:** `POST /api/v1/workforce/rotations/:id/publish`
- **RBAC:** `admin`, `hr`, `superadmin`
- **Validation:** Enforces minimum 11-hour rest between consecutive non-off-day shifts (including cycle wrap-around). Returns HTTP 400 if rest period is violated.

#### 2.4 Enroll Employee into Rotation
- **Endpoint:** `POST /api/v1/workforce/rotations/:id/enroll`
- **RBAC:** `admin`, `hr`, `superadmin`
- **Request Body:**
```json
{
  "user_id": 103,
  "start_date": "2026-12-01",
  "effective_to": null,
  "offset_days": 0,
  "initial_step_order": 1
}
```
- **Response (201 Created):** Enrollment ID and status.

#### 2.5 Preview Rotation Schedule
- **Endpoint:** `GET /api/v1/workforce/rotations/:id/preview?startDate=2026-12-01&endDate=2026-12-14`
- **RBAC:** `admin`, `hr`, `manager`, `employee`, `superadmin`
- **Response (200 OK):** Day-by-day simulated schedule showing assigned shift or off-day for each date in range.

---

### 3. Roster Management & Calendar APIs (`/rosters`)

#### 3.1 Roster Calendar Matrix
- **Endpoint:** `GET /api/v1/workforce/rosters/calendar`
- **RBAC:** `admin`, `hr`, `manager`, `employee`, `superadmin`
- **Query Parameters:**
  - `startDate` (required): `YYYY-MM-DD`
  - `endDate` (required): `YYYY-MM-DD`
  - `team` (optional): Filter by team name
  - `userId` (optional): Filter by employee user ID
  - `status` (optional): `draft` | `published`
- **Response (200 OK):**
```json
{
  "start_date": "2026-12-01",
  "end_date": "2026-12-07",
  "dates": ["2026-12-01", "2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05", "2026-12-06", "2026-12-07"],
  "employees": [
    {
      "user_id": 103,
      "name": "Emp Stage3",
      "email": "emp_stg3@hrms.local",
      "team": "Engineering",
      "designation": "Software Engineer",
      "schedule": {
        "2026-12-01": {
          "entry_id": 201,
          "shift_name": "Morning Shift",
          "shift_code": "MORN",
          "start_time": "08:00:00",
          "end_time": "16:30:00",
          "total_work_hours": 8.5,
          "is_overnight": false,
          "entry_status": "scheduled",
          "source_type": "fixed"
        }
      }
    }
  ]
}
```

#### 3.2 Generate Draft Roster
- **Endpoint:** `POST /api/v1/workforce/rosters/generate`
- **RBAC:** `admin`, `hr`, `superadmin`
- **Request Body:**
```json
{
  "name": "Engineering Team Roster - Dec W1",
  "team_name": "Engineering",
  "start_date": "2026-12-01",
  "end_date": "2026-12-07",
  "scope_type": "team",
  "conflict_policy": "prefer_fixed"
}
```
- **Response (201 Created):** Roster header and count of generated entries.

#### 3.3 Publish Roster
- **Endpoint:** `POST /api/v1/workforce/rosters/:id/publish`
- **RBAC:** `admin`, `hr`, `superadmin`
- **Behavior:**
  - Atomically locks roster header.
  - Builds canonical snapshots with SHA-256 hash for every entry.
  - Sets header status to `'published'`.
  - Database triggers block subsequent direct modifications or deletions.

#### 3.4 Employee Self-Service My Roster
- **Endpoint:** `GET /api/v1/workforce/rosters/my-roster`
- **RBAC:** Any authenticated user (`employee`, `manager`, `hr`, `admin`, `superadmin`)
- **Query Parameters:**
  - `startDate` (optional, default: today)
  - `endDate` (optional, default: 14 days ahead)
- **Response (200 OK):**
```json
{
  "today": "2026-12-01",
  "current_shift": {
    "work_date": "2026-12-01",
    "shift_name": "Morning Shift",
    "shift_code": "MORN",
    "start_time": "08:00:00",
    "end_time": "16:30:00",
    "total_work_hours": 8.5,
    "is_overnight": false,
    "source": "fixed_assignment"
  },
  "schedule": [
    {
      "entry_id": 201,
      "work_date": "2026-12-01",
      "shift_name": "Morning Shift",
      "shift_code": "MORN",
      "start_time": "08:00:00",
      "end_time": "16:30:00",
      "total_work_hours": 8.5,
      "is_overnight": false,
      "status": "scheduled"
    }
  ]
}
```
