# STAGE 2: SHIFT CONFIGURATION ENGINE & POLICY FRAMEWORK
## COMPREHENSIVE DATABASE SCHEMA DESIGN & SPECIFICATION (v3.0)

**Document:** `STAGE_2_SCHEMA_DESIGN.md`  
**Supported Engine Target:** MariaDB 11.8.9 Disposable Test Database (`127.0.0.1:3307`, `hrms_disposable_test`)  
**Production Hostinger Server (`srv999.hstgr.io`):** STRICTLY ZERO ACCESS (Air-Gapped & Isolated)  
**Migration ID:** `014_workforce_shift_policy_and_breaks.sql`  
**Dependencies:** `006_workforce_tenant_and_users.sql`, `007_workforce_company_policy.sql`, `009_workforce_shift_and_versions.sql`, `010_workforce_roster_and_assignment.sql`, `012_workforce_attendance_link.sql`  
**Branch:** `feat/shift-roster-management`  
**Base Commit SHA:** `c9d391a509fd6efec973d8deb3af3b920badff5b`  
**Status:** PHASE A.3 COMPLETE ARCHITECTURAL SPECIFICATION

---

## 1. Schema Extensions Overview & Invariant Principles

Stage 2 establishes a production-grade, enterprise Shift Configuration Engine and Policy Framework. It provides formal lifecycle state management (`draft`, `published`, `archived`), granular multi-break configuration with canonical minute offsets, and an integrated policy framework covering Grace Periods, Early Departures, Overtime Eligibility, Minimum Rest, and Weekly-Off configurations.

### Core Architectural Invariants

1. **Engine-Level Overlap Prevention (A11)**:
   - Database triggers (`trg_wsv_check_published_interval`, `trg_wcpv_check_published_interval`, `trg_wwopv_check_published_interval`) mathematically reject overlapping published intervals for shifts, company policies, and weekly-off policies.
   - For any two published versions $A$ and $B$ ($A \ne B$), the intervals $[A.from, A.to]$ and $[B.from, B.to]$ must satisfy:
     `NOT ((A.effective_to IS NULL OR A.effective_to >= B.effective_from) AND (B.effective_to IS NULL OR B.effective_to >= A.effective_from))`.

2. **Race-Proof Break Mutation Serialization (A12)**:
   - Every break insertion, update, and deletion acquires an exclusive `FOR UPDATE` lock on the parent `workforce_shift_version` row before validating sibling intervals or calculating duration sums, preventing phantom-style concurrency races.
   - Publication also locks the parent version row `FOR UPDATE`, completely serializing break mutations and publication transactions.

3. **Published Effective Date Lifecycle Protection (A13 & A17)**:
   - Published `effective_to` can change from `NULL` to a closing date exactly once.
   - Once closed (`OLD.effective_to IS NOT NULL`), `effective_to` is permanently frozen (cannot be reopened or extended).
   - Archival requires `effective_to <= CURRENT_DATE`, records `archived_at` and `archived_by`, and renders the row permanently read-only.

4. **Deterministic Fail-Closed Policy Backfill (A14 & A18)**:
   - Legacy shift backfill requires exactly one covering company policy version and exactly one covering weekly-off policy version.
   - Preflight checks halt migration if any ambiguity or zero-match exists. Unknown historical publishers are preserved as `published_by = NULL`.

5. **Complete Immutable Configuration Snapshot (A15)**:
   - Shift version `config_snapshot` freezes the complete hierarchical state (timings, breaks, company policy parameters, overtime rules, weekly-off schedule, and SHA-256 payload hash).

6. **Race-Proof Lock Protocol with Re-Verification (A16)**:
   - Monotonic lock acquisition re-verifies draft policy references under lock, aborting and retrying safely if references changed concurrently.

---

## 2. Table Specifications & DDL

### 2.1 Table Alteration: `workforce_shift`

```sql
-- Step 1: Add metadata and auditing columns to workforce_shift
ALTER TABLE workforce_shift
  ADD COLUMN description VARCHAR(1000) NULL AFTER name,
  ADD COLUMN timezone VARCHAR(50) NOT NULL DEFAULT 'UTC' AFTER description,
  ADD COLUMN created_by BIGINT NULL AFTER is_active,
  ADD COLUMN updated_by BIGINT NULL AFTER created_by,
  ADD CONSTRAINT fk_ws_created_by FOREIGN KEY (created_by) REFERENCES accounts_user(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_ws_updated_by FOREIGN KEY (updated_by) REFERENCES accounts_user(id) ON DELETE RESTRICT;
```

### 2.2 Table Alteration: `workforce_company_policy_version`

```sql
-- Step 2: Ensure composite unique key on workforce_company_policy_version for exact FK binding
ALTER TABLE workforce_company_policy_version
  ADD UNIQUE KEY uq_wcpv_tenant_policy_id (tenant_id, policy_id, id);

-- Step 3: Add lifecycle (DEFAULT 'draft'), overtime parameters, and single-draft virtual column
ALTER TABLE workforce_company_policy_version
  ADD COLUMN status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft' AFTER version_number,
  ADD COLUMN early_departure_requires_approval BOOLEAN NOT NULL DEFAULT 1 AFTER early_departure_grace_minutes,
  ADD COLUMN overtime_enabled BOOLEAN NOT NULL DEFAULT 0 AFTER early_departure_requires_approval,
  ADD COLUMN overtime_min_qualifying_minutes INT NOT NULL DEFAULT 60 AFTER overtime_enabled,
  ADD COLUMN overtime_rounding_minutes INT NOT NULL DEFAULT 15 AFTER overtime_min_qualifying_minutes,
  ADD COLUMN overtime_requires_approval BOOLEAN NOT NULL DEFAULT 1 AFTER overtime_rounding_minutes,
  ADD COLUMN published_at DATETIME NULL AFTER allow_unscheduled_punch,
  ADD COLUMN published_by BIGINT NULL AFTER published_at,
  ADD COLUMN archived_at DATETIME NULL AFTER published_by,
  ADD COLUMN archived_by BIGINT NULL AFTER archived_at,
  ADD COLUMN is_draft_active TINYINT GENERATED ALWAYS AS (
    CASE WHEN status = 'draft' THEN 1 ELSE NULL END
  ) VIRTUAL AFTER archived_by,
  ADD CONSTRAINT fk_wcpv_publisher FOREIGN KEY (published_by) REFERENCES accounts_user(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_wcpv_archiver FOREIGN KEY (archived_by) REFERENCES accounts_user(id) ON DELETE RESTRICT,
  ADD UNIQUE KEY uq_wcpv_single_active_draft (tenant_id, policy_id, is_draft_active),
  ADD CONSTRAINT chk_wcpv_effective_dates CHECK (effective_to IS NULL OR effective_to >= effective_from);
```

### 2.3 New Tables: Weekly-Off Policy Framework

```sql
-- Step 4: Weekly-Off Policy Header
CREATE TABLE IF NOT EXISTS workforce_weekly_off_policy (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description VARCHAR(1000) NULL,
  is_active BOOLEAN NOT NULL DEFAULT 1,
  created_by BIGINT NULL,
  updated_by BIGINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wwop_tenant_id (tenant_id, id),
  UNIQUE KEY uq_wwop_tenant_code (tenant_id, code),
  CONSTRAINT fk_wwop_tenant FOREIGN KEY (tenant_id) REFERENCES workforce_tenant(id) ON DELETE RESTRICT,
  CONSTRAINT fk_wwop_created_by FOREIGN KEY (created_by) REFERENCES accounts_user(id) ON DELETE RESTRICT,
  CONSTRAINT fk_wwop_updated_by FOREIGN KEY (updated_by) REFERENCES accounts_user(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Step 5: Weekly-Off Policy Version (DEFAULT 'draft')
CREATE TABLE IF NOT EXISTS workforce_weekly_off_policy_version (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  policy_id BIGINT NOT NULL,
  version_number INT NOT NULL,
  status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
  policy_type ENUM('fixed', 'rotating', 'custom') NOT NULL DEFAULT 'fixed',
  days_of_week JSON NOT NULL, -- e.g. [0] for Sunday, [0, 6] for Sat & Sun
  rules_config JSON NULL,     -- e.g. {"alternate_saturdays": [2, 4]}
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  published_at DATETIME NULL,
  published_by BIGINT NULL,
  archived_at DATETIME NULL,
  archived_by BIGINT NULL,
  is_draft_active TINYINT GENERATED ALWAYS AS (
    CASE WHEN status = 'draft' THEN 1 ELSE NULL END
  ) VIRTUAL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_wwopv_tenant_id (tenant_id, id),
  UNIQUE KEY uq_wwopv_tenant_policy_id (tenant_id, policy_id, id),
  UNIQUE KEY uq_wwopv_tenant_policy_version (tenant_id, policy_id, version_number),
  UNIQUE KEY uq_wwopv_single_active_draft (tenant_id, policy_id, is_draft_active),
  CONSTRAINT fk_wwopv_policy FOREIGN KEY (tenant_id, policy_id) REFERENCES workforce_weekly_off_policy(tenant_id, id) ON DELETE RESTRICT,
  CONSTRAINT fk_wwopv_publisher FOREIGN KEY (published_by) REFERENCES accounts_user(id) ON DELETE RESTRICT,
  CONSTRAINT fk_wwopv_archiver FOREIGN KEY (archived_by) REFERENCES accounts_user(id) ON DELETE RESTRICT,
  CONSTRAINT chk_wwopv_effective_dates CHECK (effective_to IS NULL OR effective_to >= effective_from)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 2.4 Table Alteration: `workforce_shift_version`

```sql
-- Step 6: Add lifecycle status (DEFAULT 'draft'), exact policy version FKs, snapshot, and single-draft virtual column
ALTER TABLE workforce_shift_version
  ADD COLUMN status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft' AFTER version_number,
  ADD COLUMN policy_id BIGINT NULL AFTER early_departure_grace_minutes,
  ADD COLUMN policy_version_id BIGINT NULL AFTER policy_id,
  ADD COLUMN weekly_off_policy_id BIGINT NULL AFTER policy_version_id,
  ADD COLUMN weekly_off_policy_version_id BIGINT NULL AFTER weekly_off_policy_id,
  ADD COLUMN config_snapshot JSON NULL AFTER weekly_off_policy_version_id,
  ADD COLUMN published_at DATETIME NULL AFTER effective_to,
  ADD COLUMN published_by BIGINT NULL AFTER published_at,
  ADD COLUMN archived_at DATETIME NULL AFTER published_by,
  ADD COLUMN archived_by BIGINT NULL AFTER archived_at,
  ADD COLUMN is_draft_active TINYINT GENERATED ALWAYS AS (
    CASE WHEN status = 'draft' THEN 1 ELSE NULL END
  ) VIRTUAL AFTER archived_by,
  ADD CONSTRAINT fk_wsv_policy_header
    FOREIGN KEY (tenant_id, policy_id)
    REFERENCES workforce_company_policy(tenant_id, id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT fk_wsv_exact_company_policy_version
    FOREIGN KEY (tenant_id, policy_id, policy_version_id)
    REFERENCES workforce_company_policy_version(tenant_id, policy_id, id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT fk_wsv_weekly_off_header
    FOREIGN KEY (tenant_id, weekly_off_policy_id)
    REFERENCES workforce_weekly_off_policy(tenant_id, id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT fk_wsv_exact_weekly_off_policy_version
    FOREIGN KEY (tenant_id, weekly_off_policy_id, weekly_off_policy_version_id)
    REFERENCES workforce_weekly_off_policy_version(tenant_id, policy_id, id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT fk_wsv_published_by
    FOREIGN KEY (published_by)
    REFERENCES accounts_user(id)
    ON DELETE RESTRICT,
  ADD CONSTRAINT fk_wsv_archived_by
    FOREIGN KEY (archived_by)
    REFERENCES accounts_user(id)
    ON DELETE RESTRICT,
  ADD UNIQUE KEY uq_wsv_single_active_draft (tenant_id, shift_id, is_draft_active),
  ADD CONSTRAINT chk_wsv_effective_dates CHECK (effective_to IS NULL OR effective_to >= effective_from);
```

### 2.5 New Table: `workforce_shift_break` (Minute-Offset Model)

```sql
-- Step 7: Granular shift breaks represented as minute offsets from shift start
CREATE TABLE IF NOT EXISTS workforce_shift_break (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  shift_id BIGINT NOT NULL,
  shift_version_id BIGINT NOT NULL,
  name VARCHAR(100) NOT NULL,
  start_offset_minutes INT NOT NULL,
  end_offset_minutes INT NOT NULL,
  duration_minutes INT NOT NULL,
  break_type ENUM('paid', 'unpaid') NOT NULL DEFAULT 'unpaid',
  is_mandatory BOOLEAN NOT NULL DEFAULT 1,
  display_order INT NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_wsb_tenant_version (tenant_id, shift_version_id),
  UNIQUE KEY uq_wsb_tenant_version_order (tenant_id, shift_version_id, display_order),
  CONSTRAINT fk_wsb_shift_version
    FOREIGN KEY (tenant_id, shift_id, shift_version_id)
    REFERENCES workforce_shift_version(tenant_id, shift_id, id)
    ON DELETE RESTRICT,
  CONSTRAINT chk_wsb_offset_order CHECK (start_offset_minutes >= 0 AND end_offset_minutes > start_offset_minutes),
  CONSTRAINT chk_wsb_duration_match CHECK (duration_minutes = (end_offset_minutes - start_offset_minutes))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 3. Database Engine Triggers (Immutability, Overlap & Invariant Enforcement)

### 3.1 Overlap Prevention Triggers (A11)

```sql
DELIMITER $$
-- Trigger 1: workforce_shift_version published interval overlap check
CREATE TRIGGER trg_wsv_check_published_interval
BEFORE UPDATE ON workforce_shift_version
FOR EACH ROW
BEGIN
  DECLARE v_overlap_count INT DEFAULT 0;

  -- Only execute check if the row is being published or its published interval is modified
  IF NEW.status = 'published' THEN
    SELECT COUNT(*) INTO v_overlap_count
    FROM workforce_shift_version
    WHERE tenant_id = NEW.tenant_id
      AND shift_id = NEW.shift_id
      AND status = 'published'
      AND id <> OLD.id
      AND (NEW.effective_to IS NULL OR NEW.effective_to >= effective_from)
      AND (effective_to IS NULL OR effective_to >= NEW.effective_from);

    IF v_overlap_count > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'DATA INTEGRITY VIOLATION: Effective date interval overlaps with an existing published version.';
    END IF;
  END IF;
END$$

-- Trigger 2: workforce_company_policy_version published interval overlap check
CREATE TRIGGER trg_wcpv_check_published_interval
BEFORE UPDATE ON workforce_company_policy_version
FOR EACH ROW
BEGIN
  DECLARE v_overlap_count INT DEFAULT 0;

  IF NEW.status = 'published' THEN
    SELECT COUNT(*) INTO v_overlap_count
    FROM workforce_company_policy_version
    WHERE tenant_id = NEW.tenant_id
      AND policy_id = NEW.policy_id
      AND status = 'published'
      AND id <> OLD.id
      AND (NEW.effective_to IS NULL OR NEW.effective_to >= effective_from)
      AND (effective_to IS NULL OR effective_to >= NEW.effective_from);

    IF v_overlap_count > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'DATA INTEGRITY VIOLATION: Effective date interval overlaps with an existing published company policy version.';
    END IF;
  END IF;
END$$

-- Trigger 3: workforce_weekly_off_policy_version published interval overlap check
CREATE TRIGGER trg_wwopv_check_published_interval
BEFORE UPDATE ON workforce_weekly_off_policy_version
FOR EACH ROW
BEGIN
  DECLARE v_overlap_count INT DEFAULT 0;

  IF NEW.status = 'published' THEN
    SELECT COUNT(*) INTO v_overlap_count
    FROM workforce_weekly_off_policy_version
    WHERE tenant_id = NEW.tenant_id
      AND policy_id = NEW.policy_id
      AND status = 'published'
      AND id <> OLD.id
      AND (NEW.effective_to IS NULL OR NEW.effective_to >= effective_from)
      AND (effective_to IS NULL OR effective_to >= NEW.effective_from);

    IF v_overlap_count > 0 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'DATA INTEGRITY VIOLATION: Effective date interval overlaps with an existing published weekly-off policy version.';
    END IF;
  END IF;
END$$
DELIMITER ;
```

### 3.2 Shift Version Immutability & Closure Trigger (A2, A13, A17)

```sql
DELIMITER $$
CREATE TRIGGER trg_wsv_prevent_published_update
BEFORE UPDATE ON workforce_shift_version
FOR EACH ROW
BEGIN
  -- 1. Prevent modification to permanently archived versions
  IF OLD.status = 'archived' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'LIFECYCLE VIOLATION: Archived shift versions are permanently frozen and cannot be modified.';
  END IF;

  -- 2. Rules when OLD row is in published status
  IF OLD.status = 'published' THEN
    -- Check every immutable schedule and policy parameter using NULL-safe equality (<=>)
    IF NOT (NEW.start_time <=> OLD.start_time) OR
       NOT (NEW.end_time <=> OLD.end_time) OR
       NOT (NEW.is_overnight <=> OLD.is_overnight) OR
       NOT (NEW.duration_minutes <=> OLD.duration_minutes) OR
       NOT (NEW.late_grace_minutes <=> OLD.late_grace_minutes) OR
       NOT (NEW.early_departure_grace_minutes <=> OLD.early_departure_grace_minutes) OR
       NOT (NEW.effective_from <=> OLD.effective_from) OR
       NOT (NEW.version_number <=> OLD.version_number) OR
       NOT (NEW.shift_id <=> OLD.shift_id) OR
       NOT (NEW.tenant_id <=> OLD.tenant_id) OR
       NOT (NEW.policy_id <=> OLD.policy_id) OR
       NOT (NEW.policy_version_id <=> OLD.policy_version_id) OR
       NOT (NEW.weekly_off_policy_id <=> OLD.weekly_off_policy_id) OR
       NOT (NEW.weekly_off_policy_version_id <=> OLD.weekly_off_policy_version_id) OR
       NOT (NEW.config_snapshot <=> OLD.config_snapshot) OR
       NOT (NEW.published_at <=> OLD.published_at) OR
       NOT (NEW.published_by <=> OLD.published_by) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'DATA INTEGRITY VIOLATION: Published shift versions are immutable. Mutating schedule, grace, policy, or snapshot parameters is prohibited.';
    END IF;

    -- Block invalid status transitions back to draft
    IF NEW.status = 'draft' THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'LIFECYCLE VIOLATION: Published shift versions cannot be reverted to draft.';
    END IF;

    -- Transition into 'archived': Validate required archive metadata and closed date
    IF NEW.status = 'archived' THEN
      IF NEW.archived_at IS NULL OR NEW.archived_by IS NULL THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'LIFECYCLE VIOLATION: Archiving a shift version requires archived_at and archived_by to be set.';
      END IF;
      IF NEW.effective_to IS NULL OR NEW.effective_to > CURRENT_DATE() THEN
        SIGNAL SQLSTATE '45000'
          SET MESSAGE_TEXT = 'LIFECYCLE VIOLATION: Active or future-dated published shift versions cannot be archived.';
      END IF;
    END IF;

    -- Strict effective_to closure protection (A13):
    -- effective_to can transition from NULL to a closing date exactly once.
    -- Once closed (OLD.effective_to IS NOT NULL), it CANNOT be modified or returned to NULL.
    IF OLD.effective_to IS NOT NULL AND NOT (NEW.effective_to <=> OLD.effective_to) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'DATA INTEGRITY VIOLATION: Closed published shift version cannot have its effective_to date modified or reopened.';
    END IF;
  END IF;
END$$
DELIMITER ;
```

### 3.3 Company Policy & Weekly-Off Policy Immutability Triggers (A2 & A13)

```sql
DELIMITER $$
CREATE TRIGGER trg_wcpv_prevent_published_update
BEFORE UPDATE ON workforce_company_policy_version
FOR EACH ROW
BEGIN
  IF OLD.status = 'archived' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'LIFECYCLE VIOLATION: Archived company policy versions cannot be modified.';
  END IF;

  IF OLD.status = 'published' THEN
    IF NOT (NEW.min_rest_period_minutes <=> OLD.min_rest_period_minutes) OR
       NOT (NEW.grace_period_in_minutes <=> OLD.grace_period_in_minutes) OR
       NOT (NEW.early_departure_grace_minutes <=> OLD.early_departure_grace_minutes) OR
       NOT (NEW.allow_unscheduled_punch <=> OLD.allow_unscheduled_punch) OR
       NOT (NEW.overtime_enabled <=> OLD.overtime_enabled) OR
       NOT (NEW.overtime_min_qualifying_minutes <=> OLD.overtime_min_qualifying_minutes) OR
       NOT (NEW.overtime_rounding_minutes <=> OLD.overtime_rounding_minutes) OR
       NOT (NEW.overtime_requires_approval <=> OLD.overtime_requires_approval) OR
       NOT (NEW.effective_from <=> OLD.effective_from) OR
       NOT (NEW.version_number <=> OLD.version_number) OR
       NOT (NEW.policy_id <=> OLD.policy_id) OR
       NOT (NEW.tenant_id <=> OLD.tenant_id) OR
       NOT (NEW.published_at <=> OLD.published_at) OR
       NOT (NEW.published_by <=> OLD.published_by) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'DATA INTEGRITY VIOLATION: Published company policy versions are immutable.';
    END IF;

    IF NEW.status = 'draft' THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'LIFECYCLE VIOLATION: Published policy versions cannot be reverted to draft.';
    END IF;

    IF OLD.effective_to IS NOT NULL AND NOT (NEW.effective_to <=> OLD.effective_to) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'DATA INTEGRITY VIOLATION: Closed policy version cannot have its effective_to modified or reopened.';
    END IF;
  END IF;
END$$

CREATE TRIGGER trg_wwopv_prevent_published_update
BEFORE UPDATE ON workforce_weekly_off_policy_version
FOR EACH ROW
BEGIN
  IF OLD.status = 'archived' THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'LIFECYCLE VIOLATION: Archived weekly-off policy versions cannot be modified.';
  END IF;

  IF OLD.status = 'published' THEN
    IF NOT (NEW.policy_type <=> OLD.policy_type) OR
       NOT (NEW.days_of_week <=> OLD.days_of_week) OR
       NOT (NEW.rules_config <=> OLD.rules_config) OR
       NOT (NEW.effective_from <=> OLD.effective_from) OR
       NOT (NEW.version_number <=> OLD.version_number) OR
       NOT (NEW.policy_id <=> OLD.policy_id) OR
       NOT (NEW.tenant_id <=> OLD.tenant_id) OR
       NOT (NEW.published_at <=> OLD.published_at) OR
       NOT (NEW.published_by <=> OLD.published_by) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'DATA INTEGRITY VIOLATION: Published weekly-off policy versions are immutable.';
    END IF;

    IF NEW.status = 'draft' THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'LIFECYCLE VIOLATION: Published weekly-off policy versions cannot be reverted to draft.';
    END IF;

    IF OLD.effective_to IS NOT NULL AND NOT (NEW.effective_to <=> OLD.effective_to) THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'DATA INTEGRITY VIOLATION: Closed weekly-off policy version cannot have its effective_to modified or reopened.';
    END IF;
  END IF;
END$$
DELIMITER ;
```

### 3.4 Break Mutation & Invariant Triggers (A1, A9, A12)

```sql
DELIMITER $$
-- Trigger 1: Before Insert on Break
CREATE TRIGGER trg_wsb_before_insert
BEFORE INSERT ON workforce_shift_break
FOR EACH ROW
BEGIN
  DECLARE v_status ENUM('draft', 'published', 'archived');
  DECLARE v_duration INT;
  DECLARE v_overlap_count INT;
  DECLARE v_total_breaks INT;

  -- 1. Fetch parent shift version status and duration
  SELECT status, duration_minutes INTO v_status, v_duration
  FROM workforce_shift_version
  WHERE id = NEW.shift_version_id AND tenant_id = NEW.tenant_id AND shift_id = NEW.shift_id;

  IF v_status IS NULL THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'FOREIGN KEY INTEGRITY ERROR: Parent shift version not found.';
  END IF;

  -- 2. Reject mutation if version is published or archived (A1)
  IF v_status IN ('published', 'archived') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'DATA INTEGRITY VIOLATION: Cannot add breaks to a published or archived shift version.';
  END IF;

  -- 3. Enforce break end offset does not exceed shift duration (A9)
  IF NEW.end_offset_minutes > v_duration THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'VALIDATION ERROR: Break end offset exceeds shift duration.';
  END IF;

  -- 4. Enforce non-overlapping breaks with existing siblings (A9)
  SELECT COUNT(*) INTO v_overlap_count
  FROM workforce_shift_break
  WHERE shift_version_id = NEW.shift_version_id
    AND tenant_id = NEW.tenant_id
    AND (
      (NEW.start_offset_minutes < end_offset_minutes AND NEW.end_offset_minutes > start_offset_minutes)
    );

  IF v_overlap_count > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'VALIDATION ERROR: Break interval overlaps with an existing break.';
  END IF;

  -- 5. Enforce total break duration strictly less than shift duration (A9)
  SELECT COALESCE(SUM(duration_minutes), 0) INTO v_total_breaks
  FROM workforce_shift_break
  WHERE shift_version_id = NEW.shift_version_id AND tenant_id = NEW.tenant_id;

  IF (v_total_breaks + NEW.duration_minutes) >= v_duration THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'VALIDATION ERROR: Total break duration must be less than shift duration.';
  END IF;
END$$

-- Trigger 2: Before Update on Break
CREATE TRIGGER trg_wsb_before_update
BEFORE UPDATE ON workforce_shift_break
FOR EACH ROW
BEGIN
  DECLARE v_status ENUM('draft', 'published', 'archived');
  DECLARE v_duration INT;
  DECLARE v_overlap_count INT;
  DECLARE v_total_breaks INT;

  -- Block mutation of parent keys
  IF NOT (NEW.shift_version_id <=> OLD.shift_version_id) OR
     NOT (NEW.shift_id <=> OLD.shift_id) OR
     NOT (NEW.tenant_id <=> OLD.tenant_id) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'DATA INTEGRITY VIOLATION: Mutating break parent keys is prohibited.';
  END IF;

  SELECT status, duration_minutes INTO v_status, v_duration
  FROM workforce_shift_version
  WHERE id = OLD.shift_version_id AND tenant_id = OLD.tenant_id AND shift_id = OLD.shift_id;

  IF v_status IN ('published', 'archived') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'DATA INTEGRITY VIOLATION: Cannot modify breaks of a published or archived shift version.';
  END IF;

  IF NEW.end_offset_minutes > v_duration THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'VALIDATION ERROR: Break end offset exceeds shift duration.';
  END IF;

  SELECT COUNT(*) INTO v_overlap_count
  FROM workforce_shift_break
  WHERE shift_version_id = NEW.shift_version_id
    AND tenant_id = NEW.tenant_id
    AND id <> OLD.id
    AND (
      (NEW.start_offset_minutes < end_offset_minutes AND NEW.end_offset_minutes > start_offset_minutes)
    );

  IF v_overlap_count > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'VALIDATION ERROR: Break interval overlaps with an existing break.';
  END IF;

  SELECT COALESCE(SUM(duration_minutes), 0) INTO v_total_breaks
  FROM workforce_shift_break
  WHERE shift_version_id = NEW.shift_version_id AND tenant_id = NEW.tenant_id AND id <> OLD.id;

  IF (v_total_breaks + NEW.duration_minutes) >= v_duration THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'VALIDATION ERROR: Total break duration must be less than shift duration.';
  END IF;
END$$

-- Trigger 3: Before Delete on Break
CREATE TRIGGER trg_wsb_before_delete
BEFORE DELETE ON workforce_shift_break
FOR EACH ROW
BEGIN
  DECLARE v_status ENUM('draft', 'published', 'archived');

  SELECT status INTO v_status
  FROM workforce_shift_version
  WHERE id = OLD.shift_version_id AND tenant_id = OLD.tenant_id AND shift_id = OLD.shift_id;

  IF v_status IN ('published', 'archived') THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'DATA INTEGRITY VIOLATION: Cannot delete breaks from a published or archived shift version.';
  END IF;
END$$
DELIMITER ;
```

---

## 4. Break Mutation Concurrency Serialization (A12)

To prevent phantom-style validation races (e.g. two concurrent transactions inserting overlapping breaks or exceeding total break duration), the application service **must acquire an exclusive row lock on the parent shift version** before validating or modifying breaks:

```javascript
// shift-break.service.js: addBreakToDraft
await db.transaction(async (tx) => {
  // Step 1: Exclusively lock parent shift version (A12 Serialization Anchor)
  const parentVersion = await db.get(
    "SELECT id, tenant_id, shift_id, status, duration_minutes FROM workforce_shift_version WHERE id = ? AND tenant_id = ? FOR UPDATE",
    [shiftVersionId, tenantId],
    tx
  );
  if (!parentVersion) throw new AppError("Shift version not found", 404);
  if (parentVersion.status !== "draft") {
    throw new AppError("Cannot add breaks to a non-draft shift version", 409);
  }

  // Step 2: Query sibling breaks under parent lock
  const siblings = await db.all(
    "SELECT * FROM workforce_shift_break WHERE shift_version_id = ? AND tenant_id = ? ORDER BY display_order ASC",
    [shiftVersionId, tenantId],
    tx
  );

  // Step 3: Validate bounds, non-overlap, and duration limits
  validateBreakOffsets(newBreak, siblings, parentVersion.duration_minutes);

  // Step 4: Insert break (Trigger performs secondary engine check)
  await db.run(
    `INSERT INTO workforce_shift_break (tenant_id, shift_id, shift_version_id, name, start_offset_minutes, end_offset_minutes, duration_minutes, break_type, is_mandatory, display_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [tenantId, parentVersion.shift_id, shiftVersionId, newBreak.name, newBreak.start_offset_minutes, newBreak.end_offset_minutes, newBreak.duration_minutes, newBreak.break_type, newBreak.is_mandatory, siblings.length + 1],
    tx
  );
});
```

---

## 5. Deterministic Fail-Closed Policy Backfill Specification (A14)

```sql
-- Step 8.1: Backfill workforce_company_policy_version to published
UPDATE workforce_company_policy_version
SET status = 'published',
    published_at = COALESCE(published_at, created_at),
    published_by = NULL,
    early_departure_requires_approval = COALESCE(early_departure_requires_approval, 1),
    overtime_enabled = COALESCE(overtime_enabled, 0),
    overtime_min_qualifying_minutes = COALESCE(overtime_min_qualifying_minutes, 60),
    overtime_rounding_minutes = COALESCE(overtime_rounding_minutes, 15),
    overtime_requires_approval = COALESCE(overtime_requires_approval, 1)
WHERE status = 'draft';

-- Step 8.2: Seed Default Weekly-Off Policy for all existing tenants dynamically
INSERT INTO workforce_weekly_off_policy (tenant_id, code, name, description, is_active, created_at, updated_at)
SELECT 
  t.id AS tenant_id,
  'SUN_OFF' AS code,
  'Standard Sunday Weekly Off' AS name,
  'Default fixed Sunday weekly-off schedule' AS description,
  1 AS is_active,
  NOW() AS created_at,
  NOW() AS updated_at
FROM workforce_tenant t
WHERE NOT EXISTS (
  SELECT 1 FROM workforce_weekly_off_policy w WHERE w.tenant_id = t.id AND w.code = 'SUN_OFF'
);

-- Seed Version for Default Weekly-Off Policy
INSERT INTO workforce_weekly_off_policy_version (
  tenant_id, policy_id, version_number, status, policy_type,
  days_of_week, rules_config, effective_from, effective_to,
  published_at, published_by, created_at
)
SELECT 
  w.tenant_id,
  w.id AS policy_id,
  1 AS version_number,
  'published' AS status,
  'fixed' AS policy_type,
  JSON_ARRAY(0) AS days_of_week,
  NULL AS rules_config,
  '2026-01-01' AS effective_from,
  NULL AS effective_to,
  NOW() AS published_at,
  NULL AS published_by,
  NOW() AS created_at
FROM workforce_weekly_off_policy w
WHERE w.code = 'SUN_OFF'
  AND NOT EXISTS (
    SELECT 1 FROM workforce_weekly_off_policy_version wv WHERE wv.tenant_id = w.tenant_id AND wv.policy_id = w.id AND wv.version_number = 1
  );

-- Step 8.3: Deterministic Backfill of workforce_shift_version using scalar subqueries
-- FAILS CLOSED: If more than 1 matching row exists, scalar subquery raises error 1242.
UPDATE workforce_shift_version wsv
SET 
  wsv.status = 'published',
  wsv.published_at = COALESCE(wsv.published_at, wsv.created_at),
  wsv.published_by = NULL,
  wsv.policy_id = (
    SELECT wcpv.policy_id
    FROM workforce_company_policy_version wcpv
    WHERE wcpv.tenant_id = wsv.tenant_id 
      AND wcpv.status = 'published' 
      AND wcpv.effective_from <= wsv.effective_from 
      AND (wcpv.effective_to IS NULL OR wcpv.effective_to >= wsv.effective_from)
  ),
  wsv.policy_version_id = (
    SELECT wcpv.id
    FROM workforce_company_policy_version wcpv
    WHERE wcpv.tenant_id = wsv.tenant_id 
      AND wcpv.status = 'published' 
      AND wcpv.effective_from <= wsv.effective_from 
      AND (wcpv.effective_to IS NULL OR wcpv.effective_to >= wsv.effective_from)
  ),
  wsv.weekly_off_policy_id = (
    SELECT wwop.id 
    FROM workforce_weekly_off_policy wwop
    WHERE wwop.tenant_id = wsv.tenant_id AND wwop.code = 'SUN_OFF'
  ),
  wsv.weekly_off_policy_version_id = (
    SELECT wwopv.id
    FROM workforce_weekly_off_policy_version wwopv
    JOIN workforce_weekly_off_policy wwop ON wwop.id = wwopv.policy_id AND wwop.tenant_id = wwopv.tenant_id
    WHERE wwopv.tenant_id = wsv.tenant_id 
      AND wwop.code = 'SUN_OFF'
      AND wwopv.status = 'published'
      AND wwopv.effective_from <= wsv.effective_from
      AND (wwopv.effective_to IS NULL OR wwopv.effective_to >= wsv.effective_from)
  ),
  wsv.config_snapshot = JSON_OBJECT(
    'snapshot_version', '1.0',
    'shift_code', (SELECT ws.code FROM workforce_shift ws WHERE ws.id = wsv.shift_id AND ws.tenant_id = wsv.tenant_id),
    'duration_minutes', wsv.duration_minutes,
    'start_time', TIME_FORMAT(wsv.start_time, '%H:%i:%s'),
    'end_time', TIME_FORMAT(wsv.end_time, '%H:%i:%s'),
    'is_overnight', wsv.is_overnight,
    'late_grace_minutes', wsv.late_grace_minutes,
    'early_departure_grace_minutes', wsv.early_departure_grace_minutes,
    'breaks', JSON_ARRAY(),
    'provenance', JSON_OBJECT(
      'legacy_backfill', TRUE,
      'migrated_at', NOW(),
      'original_publisher', 'UNKNOWN_LEGACY_IMPORT'
    )
  )
WHERE wsv.status = 'draft';

-- Step 8.4: Post-Backfill Integrity Assertion
-- Halts if any shift version failed to resolve policy versions
SELECT 1 FROM workforce_shift_version
WHERE status = 'published' AND (policy_version_id IS NULL OR weekly_off_policy_version_id IS NULL)
LIMIT 1;
-- If above query returns rows, MIGRATION RUNNER MUST ABORT AND ROLL BACK!
```

---

## 6. Complete Configuration Snapshot Contract (A15)

```json
{
  "$schema": "https://hrms.enterprise/schemas/shift-version-snapshot-v1.json",
  "snapshot_version": "1.0",
  "frozen_at": "2026-11-16T11:45:00.000Z",
  "frozen_by_user_id": 42,
  "tenant_id": 1,
  "shift": {
    "id": 1,
    "code": "GEN_SHIFT",
    "name": "General Shift",
    "timezone": "Asia/Kolkata",
    "version_id": 1,
    "version_number": 1,
    "effective_from": "2026-01-01",
    "effective_to": null,
    "timings": {
      "start_time": "09:00:00",
      "end_time": "18:00:00",
      "is_overnight": false,
      "duration_minutes": 540,
      "late_grace_minutes": 15,
      "early_departure_grace_minutes": 15
    },
    "breaks": [
      {
        "id": 101,
        "name": "Lunch Break",
        "start_offset_minutes": 240,
        "end_offset_minutes": 300,
        "duration_minutes": 60,
        "break_type": "unpaid",
        "is_mandatory": true,
        "display_order": 1
      }
    ]
  },
  "company_policy": {
    "policy_id": 1,
    "policy_version_id": 1,
    "version_number": 1,
    "effective_from": "2026-01-01",
    "effective_to": null,
    "grace_period_in_minutes": 15,
    "early_departure_grace_minutes": 15,
    "early_departure_requires_approval": true,
    "min_rest_period_minutes": 480,
    "allow_unscheduled_punch": false,
    "overtime": {
      "enabled": true,
      "min_qualifying_minutes": 60,
      "rounding_minutes": 15,
      "requires_approval": true
    }
  },
  "weekly_off_policy": {
    "policy_id": 1,
    "policy_version_id": 1,
    "version_number": 1,
    "policy_type": "fixed",
    "days_of_week": [0],
    "rules_config": null,
    "effective_from": "2026-01-01",
    "effective_to": null
  },
  "integrity": {
    "algorithm": "SHA-256",
    "payload_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
  },
  "provenance": {
    "legacy_backfill": false
  }
}
```

---

## 7. Race-Proof Lock Protocol with Re-Verification (A16)

```javascript
let retries = 0;
while (retries < 3) {
  try {
    await db.transaction(async (tx) => {
      // 1. Initial snapshot read of draft
      const preDraft = await db.get(
        "SELECT id, shift_id, policy_id, weekly_off_policy_id, effective_from FROM workforce_shift_version WHERE id = ? AND tenant_id = ?",
        [draftVersionId, tenantId],
        tx
      );
      if (!preDraft) throw new AppError("Draft version not found", 404);

      // 2. Lock in authoritative order:
      // a. Tenant Header
      await db.get("SELECT id FROM workforce_tenant WHERE id = ? FOR UPDATE", [tenantId], tx);

      // b. Policy Headers
      if (preDraft.policy_id) {
        await db.get("SELECT id FROM workforce_company_policy WHERE id = ? AND tenant_id = ? FOR UPDATE", [preDraft.policy_id, tenantId], tx);
      }
      if (preDraft.weekly_off_policy_id) {
        await db.get("SELECT id FROM workforce_weekly_off_policy WHERE id = ? AND tenant_id = ? FOR UPDATE", [preDraft.weekly_off_policy_id, tenantId], tx);
      }

      // c. Shift Header
      const shift = await db.get("SELECT id, tenant_id, code FROM workforce_shift WHERE id = ? AND tenant_id = ? FOR UPDATE", [shiftId, tenantId], tx);

      // d. Draft Version under lock
      const lockedDraft = await db.get(
        "SELECT * FROM workforce_shift_version WHERE id = ? AND shift_id = ? AND tenant_id = ? FOR UPDATE",
        [draftVersionId, shiftId, tenantId],
        tx
      );

      // 3. RE-VERIFY DRAFT REFERENCES UNDER LOCK (A16):
      if (lockedDraft.policy_id !== preDraft.policy_id || lockedDraft.weekly_off_policy_id !== preDraft.weekly_off_policy_id) {
        throw new RetryableLockRaceError("Draft policy references changed concurrently. Retrying publication lock sequence.");
      }

      // 4. Resolve exact policy versions
      const companyPolicyVersion = await db.get(
        `SELECT * FROM workforce_company_policy_version 
         WHERE policy_id = ? AND tenant_id = ? AND status = 'published'
           AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)
         FOR UPDATE`,
        [lockedDraft.policy_id, tenantId, lockedDraft.effective_from, lockedDraft.effective_from],
        tx
      );
      if (!companyPolicyVersion) throw new AppError(`No published company policy covers ${lockedDraft.effective_from}`, 422);

      const weeklyOffPolicyVersion = await db.get(
        `SELECT * FROM workforce_weekly_off_policy_version
         WHERE policy_id = ? AND tenant_id = ? AND status = 'published'
           AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)
         FOR UPDATE`,
        [lockedDraft.weekly_off_policy_id, tenantId, lockedDraft.effective_from, lockedDraft.effective_from],
        tx
      );
      if (!weeklyOffPolicyVersion) throw new AppError(`No published weekly-off policy covers ${lockedDraft.effective_from}`, 422);

      // 5. Lock and validate breaks
      const breaks = await db.all(
        "SELECT * FROM workforce_shift_break WHERE shift_version_id = ? AND tenant_id = ? ORDER BY display_order ASC FOR UPDATE",
        [lockedDraft.id, tenantId],
        tx
      );

      // 6. Close prior published version if exists
      const activeVersion = await db.get(
        "SELECT * FROM workforce_shift_version WHERE shift_id = ? AND tenant_id = ? AND status = 'published' AND effective_to IS NULL FOR UPDATE",
        [shiftId, tenantId],
        tx
      );
      if (activeVersion) {
        if (new Date(lockedDraft.effective_from) <= new Date(activeVersion.effective_from)) {
          throw new AppError("New version effective_from must be after active version", 422);
        }
        const priorEffectiveTo = computePriorDay(lockedDraft.effective_from);
        await db.run(
          "UPDATE workforce_shift_version SET effective_to = ? WHERE id = ? AND tenant_id = ?",
          [priorEffectiveTo, activeVersion.id, tenantId],
          tx
        );
      }

      // 7. Transition Draft to Published
      const frozenSnapshot = assembleSnapshot(shift, lockedDraft, breaks, companyPolicyVersion, weeklyOffPolicyVersion);
      await db.run(
        `UPDATE workforce_shift_version 
         SET status = 'published',
             policy_version_id = ?,
             weekly_off_policy_version_id = ?,
             config_snapshot = ?,
             published_at = NOW(),
             published_by = ?,
             effective_to = NULL
         WHERE id = ? AND tenant_id = ?`,
        [companyPolicyVersion.id, weeklyOffPolicyVersion.id, JSON.stringify(frozenSnapshot), actorUserId, lockedDraft.id, tenantId],
        tx
      );
    });
    break;
  } catch (err) {
    if (err instanceof RetryableLockRaceError && retries < 2) {
      retries++;
      continue;
    }
    throw err;
  }
}
```

---

## 8. Fail-Closed Migration Preconditions (PF-01 – PF-07) (A18)

Before Migration 014 is permitted to alter schemas or data, the runner executes these seven non-negotiable assertions:

| Code | Assertion Name | Verification Query | Failure Threshold | Action on Failure |
| :--- | :--- | :--- | :--- | :--- |
| **PF-01** | **Target Engine Check** | `SELECT VERSION() LIKE '11.8.9%' AS valid` | `valid = 0` | Abort immediately (Unsupported engine) |
| **PF-02** | **Migration Ledger Check** | `SELECT COUNT(*) = 13 FROM schema_migrations WHERE version IN ('001'..'013')` | `COUNT < 13` | Abort (Missing prerequisite migrations) |
| **PF-03** | **Roster FK Integrity** | `SELECT COUNT(*) FROM workforce_roster_entry re LEFT JOIN workforce_shift_version sv ON sv.id = re.shift_version_id WHERE re.shift_version_id IS NOT NULL AND sv.id IS NULL` | `COUNT > 0` | Abort (Orphaned roster entries detected) |
| **PF-04** | **1:1 Policy Coverage** | `SELECT wsv.id FROM workforce_shift_version wsv WHERE (SELECT COUNT(*) FROM workforce_company_policy_version wcpv WHERE wcpv.tenant_id = wsv.tenant_id AND wcpv.effective_from <= wsv.effective_from AND (wcpv.effective_to IS NULL OR wcpv.effective_to >= wsv.effective_from)) <> 1` | `COUNT > 0` | Abort (Ambiguous or missing company policy coverage) |
| **PF-05** | **Zero Existing Overlaps** | `SELECT COUNT(*) FROM workforce_shift_version v1 JOIN workforce_shift_version v2 ON v1.shift_id = v2.shift_id AND v1.tenant_id = v2.tenant_id AND v1.id < v2.id WHERE (v1.effective_to IS NULL OR v1.effective_to >= v2.effective_from) AND (v2.effective_to IS NULL OR v2.effective_to >= v1.effective_from)` | `COUNT > 0` | Abort (Pre-existing interval overlaps detected) |
| **PF-06** | **Active Tenant Check** | `SELECT COUNT(*) FROM workforce_shift ws LEFT JOIN workforce_tenant wt ON wt.id = ws.tenant_id WHERE wt.id IS NULL OR wt.is_active = 0` | `COUNT > 0` | Abort (Shifts reference inactive or missing tenants) |
| **PF-07** | **Offline Backup Gate** | Verified offline database dump file existence & readable status | File not verified | Abort (Refuse migration without backup) |

---

### Phase A Sign-Off Declaration
Per strict project constraints, **no migrations have been executed and no code has been altered** pending formal sign-off of this revised schema design.
