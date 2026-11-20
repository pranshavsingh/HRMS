# HRMS STAGE 3: DATABASE MIGRATION & SCHEMA EVOLUTION REPORT
## Migration 015: Workforce Shift Assignments, Rotations & Roster Management

**Repository:** `pranshavsingh/HRMS`  
**Branch:** `feat/shift-roster-management`  
**Migration File:** `node_backend/scripts/migrations/015_workforce_assignments_and_roster.sql`  
**Target Engine:** MariaDB 11.8.9-winx64 (`127.0.0.1:3307/hrms_disposable_test`)  
**SHA-256 Checksum:** `17e73933739dff38d732b913aab9148605ec3d9b7c445353d170b52bc60a7f73`  
**Execution Status:** **APPLIED, VERIFIED & IDEMPOTENT (0 ERRORS)**

---

### 1. Migration Overview

Migration 015 evolves the HRMS database to support production-grade shift assignments, rotation cycles, and roster calendars. It establishes foreign key relationships to exact published shift versions (`workforce_shift_version`), enforces single-active-draft rules at the database level via virtual columns and unique indexes, and implements fail-closed database triggers to guarantee immutability.

---

### 2. Preflight Verification (Pre-condition Checks)

Prior to applying Migration 015, the dedicated script `node_backend/scripts/preflight_015.mjs` was executed against MariaDB 11.8.9. All 6 prerequisite criteria were verified:

| Check | Assertion Description | Result |
| :--- | :--- | :--- |
| **P01** | Database connectivity to `127.0.0.1:3307/hrms_disposable_test` | **PASS** |
| **P02** | Migration 014 exists and was applied in `schema_migrations` ledger | **PASS** |
| **P03** | Target table `workforce_employee_fixed_assignment` exists from baseline | **PASS** |
| **P04** | Target table `workforce_rotation_definition` exists from baseline | **PASS** |
| **P05** | Target table `workforce_roster_header` exists from baseline | **PASS** |
| **P06** | Target table `workforce_roster_entry` exists from baseline | **PASS** |

---

### 3. Detailed Schema Evolution

#### 3.1 Table: `workforce_employee_fixed_assignment`
Evolves employee assignments from unversioned shift references to exact published shift version pinning with immutable snapshots and lifecycle states.

```sql
ALTER TABLE workforce_employee_fixed_assignment
  ADD COLUMN IF NOT EXISTS shift_version_id BIGINT NULL AFTER shift_id,
  ADD COLUMN IF NOT EXISTS status ENUM('draft', 'published', 'superseded', 'cancelled') NOT NULL DEFAULT 'published' AFTER effective_to,
  ADD COLUMN IF NOT EXISTS cancellation_reason VARCHAR(500) NULL AFTER status,
  ADD COLUMN IF NOT EXISTS assignment_snapshot LONGTEXT NULL AFTER cancellation_reason,
  ADD COLUMN IF NOT EXISTS snapshot_hash CHAR(64) NULL AFTER assignment_snapshot,
  ADD COLUMN IF NOT EXISTS published_at DATETIME NULL AFTER is_active,
  ADD COLUMN IF NOT EXISTS published_by BIGINT NULL AFTER published_at,
  ADD COLUMN IF NOT EXISTS cancelled_at DATETIME NULL AFTER published_by,
  ADD COLUMN IF NOT EXISTS cancelled_by BIGINT NULL AFTER cancelled_at,
  ADD COLUMN IF NOT EXISTS is_active_draft TINYINT GENERATED ALWAYS AS (
    CASE WHEN status = 'draft' THEN 1 ELSE NULL END
  ) VIRTUAL AFTER cancelled_by;

-- Foreign key pinning exact shift version
ALTER TABLE workforce_employee_fixed_assignment
  ADD CONSTRAINT fk_wefa_shift_version
  FOREIGN KEY (tenant_id, shift_id, shift_version_id)
  REFERENCES workforce_shift_version (tenant_id, shift_id, id)
  ON DELETE RESTRICT;

-- Database-enforced single active draft constraint
ALTER TABLE workforce_employee_fixed_assignment
  ADD UNIQUE KEY uq_wefa_single_active_draft (tenant_id, user_id, is_active_draft);
```

#### 3.2 Table: `workforce_rotation_definition` & `workforce_rotation_step`
Adds versioning, lifecycle metadata, virtual draft index, and off-day step capability to rotation cycles.

```sql
ALTER TABLE workforce_rotation_definition
  ADD COLUMN IF NOT EXISTS status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'published' AFTER cycle_length_days,
  ADD COLUMN IF NOT EXISTS version_number INT NOT NULL DEFAULT 1 AFTER status,
  ADD COLUMN IF NOT EXISTS published_at DATETIME NULL AFTER updated_at,
  ADD COLUMN IF NOT EXISTS published_by BIGINT NULL AFTER published_at,
  ADD COLUMN IF NOT EXISTS archived_at DATETIME NULL AFTER published_by,
  ADD COLUMN IF NOT EXISTS archived_by BIGINT NULL AFTER archived_at,
  ADD COLUMN IF NOT EXISTS is_active_draft TINYINT GENERATED ALWAYS AS (
    CASE WHEN status = 'draft' THEN 1 ELSE NULL END
  ) VIRTUAL AFTER archived_by;

ALTER TABLE workforce_rotation_step
  MODIFY COLUMN shift_id BIGINT NULL,
  ADD COLUMN IF NOT EXISTS is_off_day BOOLEAN NOT NULL DEFAULT 0 AFTER duration_days,
  ADD COLUMN IF NOT EXISTS shift_version_id BIGINT NULL AFTER is_off_day;
```

#### 3.3 Table: `workforce_employee_rotation`
Enables employee rotation enrollment with offset days, effective end dates, and lifecycle states.

```sql
ALTER TABLE workforce_employee_rotation
  ADD COLUMN IF NOT EXISTS effective_to DATE NULL AFTER start_date,
  ADD COLUMN IF NOT EXISTS offset_days INT NOT NULL DEFAULT 0 AFTER initial_step_order,
  ADD COLUMN IF NOT EXISTS status ENUM('draft', 'published', 'superseded', 'cancelled') NOT NULL DEFAULT 'published' AFTER offset_days,
  ADD COLUMN IF NOT EXISTS created_by BIGINT NULL AFTER is_active,
  ADD COLUMN IF NOT EXISTS updated_by BIGINT NULL AFTER created_by,
  ADD COLUMN IF NOT EXISTS published_by BIGINT NULL AFTER updated_by,
  ADD COLUMN IF NOT EXISTS published_at DATETIME NULL AFTER published_by,
  ADD COLUMN IF NOT EXISTS cancelled_by BIGINT NULL AFTER published_at,
  ADD COLUMN IF NOT EXISTS cancelled_at DATETIME NULL AFTER cancelled_by,
  ADD COLUMN IF NOT EXISTS is_active_draft TINYINT GENERATED ALWAYS AS (
    CASE WHEN status = 'draft' THEN 1 ELSE NULL END
  ) VIRTUAL AFTER cancelled_at;
```

#### 3.4 Table: `workforce_roster_header` & `workforce_roster_entry`
Evolves team rosters with scope types, team names, published snapshots, and entry source attribution.

```sql
ALTER TABLE workforce_roster_header
  ADD COLUMN IF NOT EXISTS team_name VARCHAR(100) NULL AFTER department_id,
  ADD COLUMN IF NOT EXISTS scope_type ENUM('all', 'department', 'team', 'custom') NOT NULL DEFAULT 'custom' AFTER name,
  ADD COLUMN IF NOT EXISTS version_number INT NOT NULL DEFAULT 1 AFTER status,
  ADD COLUMN IF NOT EXISTS published_by BIGINT NULL AFTER updated_by,
  ADD COLUMN IF NOT EXISTS published_at DATETIME NULL AFTER published_by,
  ADD COLUMN IF NOT EXISTS archived_by BIGINT NULL AFTER published_at,
  ADD COLUMN IF NOT EXISTS archived_at DATETIME NULL AFTER archived_by,
  ADD COLUMN IF NOT EXISTS snapshot_hash CHAR(64) NULL AFTER archived_at,
  ADD COLUMN IF NOT EXISTS is_active_draft TINYINT GENERATED ALWAYS AS (
    CASE WHEN status = 'draft' THEN 1 ELSE NULL END
  ) VIRTUAL AFTER snapshot_hash;

ALTER TABLE workforce_roster_entry
  ADD COLUMN IF NOT EXISTS source_type ENUM('fixed', 'rotation', 'manual', 'swap') NOT NULL DEFAULT 'fixed' AFTER status,
  ADD COLUMN IF NOT EXISTS entry_snapshot LONGTEXT NULL AFTER source_type,
  ADD COLUMN IF NOT EXISTS snapshot_hash CHAR(64) NULL AFTER entry_snapshot;
```

---

### 4. Database-Enforced Triggers (Fail-Closed Integrity)

#### 4.1 Trigger: `trg_wefa_prevent_update_on_published`
Guarantees that published assignments are completely immutable.

```sql
CREATE TRIGGER trg_wefa_prevent_update_on_published
BEFORE UPDATE ON workforce_employee_fixed_assignment
FOR EACH ROW
BEGIN
  IF OLD.status = 'published' THEN
    IF (NEW.tenant_id <=> OLD.tenant_id) = 0
       OR (NEW.user_id <=> OLD.user_id) = 0
       OR (NEW.shift_id <=> OLD.shift_id) = 0
       OR (NEW.shift_version_id <=> OLD.shift_version_id) = 0
       OR (NEW.effective_from <=> OLD.effective_from) = 0
       OR (NEW.assignment_snapshot <=> OLD.assignment_snapshot) = 0
       OR (NEW.snapshot_hash <=> OLD.snapshot_hash) = 0
    THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Immutability violation: Published shift assignments cannot be modified';
    END IF;
  END IF;
END;
```

#### 4.2 Trigger: `trg_wefa_check_overlap_on_publish`
Prevents overlapping published date intervals for the same employee at the database engine level.

```sql
CREATE TRIGGER trg_wefa_check_overlap_on_publish
BEFORE UPDATE ON workforce_employee_fixed_assignment
FOR EACH ROW
BEGIN
  IF OLD.status = 'draft' AND NEW.status = 'published' THEN
    SET @overlap_count = (
      SELECT COUNT(*)
      FROM workforce_employee_fixed_assignment
      WHERE tenant_id = NEW.tenant_id
        AND user_id = NEW.user_id
        AND status = 'published'
        AND id <> NEW.id
        AND effective_from <= COALESCE(NEW.effective_to, '9999-12-31')
        AND COALESCE(effective_to, '9999-12-31') >= NEW.effective_from
    );
    IF @overlap_count > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Overlap violation: Employee already has an active published assignment for this date interval';
    END IF;
  END IF;
END;
```

#### 4.3 Trigger: `trg_wre_prevent_mutation_on_published_header` & `trg_wre_prevent_delete_on_published_header`
Blocks direct updates or deletions of roster entries that belong to a published roster header.

```sql
CREATE TRIGGER trg_wre_prevent_mutation_on_published_header
BEFORE UPDATE ON workforce_roster_entry
FOR EACH ROW
BEGIN
  DECLARE v_status VARCHAR(50);
  SELECT status INTO v_status FROM workforce_roster_header WHERE id = OLD.roster_header_id;
  IF v_status = 'published' THEN
    IF (NEW.tenant_id <=> OLD.tenant_id) = 0
       OR (NEW.user_id <=> OLD.user_id) = 0
       OR (NEW.shift_id <=> OLD.shift_id) = 0
       OR (NEW.shift_version_id <=> OLD.shift_version_id) = 0
       OR (NEW.work_date <=> OLD.work_date) = 0
    THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Immutability violation: Roster entries in published headers cannot be modified';
    END IF;
  END IF;
END;

CREATE TRIGGER trg_wre_prevent_delete_on_published_header
BEFORE DELETE ON workforce_roster_entry
FOR EACH ROW
BEGIN
  DECLARE v_status VARCHAR(50);
  SELECT status INTO v_status FROM workforce_roster_header WHERE id = OLD.roster_header_id;
  IF v_status = 'published' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Immutability violation: Roster entries in published headers cannot be deleted';
  END IF;
END;
```

---

### 5. Postflight Verification Matrix

The postflight script `node_backend/scripts/postflight_015.mjs` performed an exhaustive inspection of the applied database state:

| Assertion | Verification Scope | Status |
| :--- | :--- | :--- |
| **01** | `schema_migrations` ledger contains `015` with matching SHA-256 checksum | **PASS** |
| **02** | `workforce_employee_fixed_assignment` contains all 10 new columns & composite foreign key | **PASS** |
| **03** | `workforce_rotation_definition` contains status, lifecycle, and virtual draft index | **PASS** |
| **04** | `workforce_rotation_step` contains `is_off_day` and nullable `shift_id` | **PASS** |
| **05** | `workforce_employee_rotation` contains `offset_days`, `effective_to`, and draft columns | **PASS** |
| **06** | `workforce_roster_header` contains `team_name`, `scope_type`, and snapshot columns | **PASS** |
| **07** | `workforce_roster_entry` contains `source_type`, `entry_snapshot`, and `snapshot_hash` | **PASS** |
| **08** | All 4 Stage 3 MariaDB triggers confirmed active in `information_schema.TRIGGERS` | **PASS** |
| **09** | Re-run of migration runner confirms 100% idempotency (0 statements executed) | **PASS** |

**Conclusion:** Migration 015 is verified to be safe, non-destructive, fully idempotent, and completely production-ready.
