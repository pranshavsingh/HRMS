# HRMS STAGE 2: API DOCUMENTATION
## SHIFT & POLICY MANAGEMENT ENDPOINTS

**Base Path:** `/api/v1/workforce` (and `/api/v1/shifts` aliases)  
**Security:** JWT Bearer Authentication (`Authorization: Bearer <token>`)  
**Tenant Resolution:** Tenant-scoped via user membership or `X-Tenant-ID` header (Superadmins only)  

---

## 1. Shift Template Endpoints

### `GET /api/v1/shifts`
List shifts for the active tenant.
- **Authorization:** `admin`, `hr`, `superadmin`, `manager`
- **Query Parameters:**
  - `page` (integer, default: 1)
  - `limit` (integer, default: 20)
  - `search` (string, optional: matches name or code)
  - `is_active` (boolean, optional)
- **Response (200 OK):**
  ```json
  {
    "shifts": [
      {
        "id": 10,
        "tenant_id": 1,
        "code": "DAY_SHIFT",
        "name": "Standard Day Shift",
        "timezone": "UTC",
        "is_active": 1,
        "current_version_number": 1,
        "start_time": "09:00:00",
        "end_time": "17:00:00",
        "duration_minutes": 480
      }
    ],
    "pagination": { "total": 1, "page": 1, "limit": 20, "totalPages": 1 }
  }
  ```

### `POST /api/v1/shifts`
Create a new shift template and automatically generate its initial version.
- **Authorization:** `admin`, `hr`, `superadmin`
- **Request Body:**
  ```json
  {
    "code": "DAY_08",
    "name": "8-Hour Day Shift",
    "description": "Standard production day shift",
    "timezone": "Asia/Kolkata",
    "start_time": "08:30:00",
    "end_time": "17:00:00",
    "late_grace_minutes": 15,
    "early_departure_grace_minutes": 15,
    "effective_from": "2026-11-16",
    "breaks": [
      {
        "break_name": "Lunch",
        "break_type": "unpaid",
        "start_offset_minutes": 240,
        "end_offset_minutes": 300,
        "is_mandatory": true,
        "display_order": 1
      }
    ]
  }
  ```
- **Response (201 Created):** Returns created shift and version metadata.

### `PATCH /api/v1/shifts/:id`
Update shift template header metadata (or change timings to generate next version).
- **Authorization:** `admin`, `hr`, `superadmin`

### `PATCH /api/v1/shifts/:id/status`
Toggle shift active status (`is_active: true/false`).
- **Authorization:** `admin`, `hr`, `superadmin`

### `DELETE /api/v1/shifts/:id`
Delete a shift template (only allowed if unreferenced by rosters or employee assignments).
- **Authorization:** `admin`, `hr`, `superadmin`
- **Response (409 Conflict):** Returned if referenced by roster entries.

---

## 2. Shift Version Endpoints

### `GET /api/v1/shifts/:id/versions`
Get complete immutable version history for a shift.
- **Authorization:** `admin`, `hr`, `superadmin`, `manager`

### `POST /api/v1/shifts/:id/versions`
Create a new draft version for a shift.
- **Authorization:** `admin`, `hr`, `superadmin`
- **Request Body:**
  ```json
  {
    "clone_from_version_id": 1,
    "start_time": "09:00:00",
    "end_time": "18:00:00",
    "effective_from": "2026-12-01"
  }
  ```

### `PATCH /api/v1/shifts/:id/versions/:versionId`
Update an active draft version. Only permitted while in `draft` status.
- **Authorization:** `admin`, `hr`, `superadmin`

### `POST /api/v1/shifts/:id/versions/:versionId/publish`
Publish a draft version.
- **Authorization:** `admin`, `hr`, `superadmin`
- **Behavior:**
  1. Acquires monotonic lock on company policy, weekly-off policy, and shift header.
  2. Re-verifies draft under lock.
  3. Verifies covering company policy and weekly-off policy versions.
  4. Freezes complete configuration snapshot with SHA-256 payload hash.
  5. Atomically closes superseded version at `effective_from - 1 day`.
  6. Sets `status = 'published'`.

### `POST /api/v1/shifts/:id/versions/:versionId/archive`
Archive an expired shift version. Only allowed if `effective_to <= CURRENT_DATE()`.
- **Authorization:** `admin`, `hr`, `superadmin`

---

## 3. Shift Break Endpoints

### `GET /api/v1/shifts/:id/versions/:versionId/breaks`
List breaks for a shift version (sorted by display order).

### `POST /api/v1/shifts/:id/versions/:versionId/breaks`
Add a break to a draft shift version.
- **Authorization:** `admin`, `hr`, `superadmin`
- **Request Body:**
  ```json
  {
    "break_name": "Morning Tea",
    "break_type": "paid",
    "start_offset_minutes": 120,
    "end_offset_minutes": 135,
    "is_mandatory": true,
    "display_order": 1
  }
  ```

### `PATCH /api/v1/shifts/:id/versions/:versionId/breaks/:breakId`
Update a break on a draft shift version.

### `DELETE /api/v1/shifts/:id/versions/:versionId/breaks/:breakId`
Delete a break from a draft shift version.

---

## 4. Company Attendance Policy Endpoints

### `GET /api/v1/workforce/policies`
List company policies and currently active versions for the tenant.

### `POST /api/v1/workforce/policies`
Create a new company policy header and initial draft version.

### `POST /api/v1/workforce/policies/:id/versions/:versionId/publish`
Publish a company policy version.

---

## 5. Weekly-Off Policy Endpoints

### `GET /api/v1/workforce/weekly-off-policies`
List weekly-off policies and currently active versions.

### `POST /api/v1/workforce/weekly-off-policies`
Create a new weekly-off policy (fixed, rotating, or custom alternate weekends).

### `POST /api/v1/workforce/weekly-off-policies/:id/versions/:versionId/publish`
Publish a weekly-off policy version.
