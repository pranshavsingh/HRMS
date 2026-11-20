# HRMS Shift & Roster Management — Disposable Database Test Plan v2.6.1
## 13-Part Isolated Architectural, Concurrency & Recovery Validation Suite for MariaDB 11.8.9

**Repository:** `pranshavsingh/HRMS`  
**Branch:** `feat/shift-roster-management`  
**Target Database Engine:** MariaDB 11.8.9 (Docker Container or Disposable Local Instance)  
**Execution Status:** `[NOT VERIFIED — TEST SUITE SPECIFIED FOR EXECUTION ON ISOLATED MARIADB 11.8 CONTAINER]`  
**Safety Certification:** Zero commands in this test suite have been executed against active development or production databases.  

---

## 1. Disposable Environment Setup Protocol

### 1.1 Docker Container Provisioning
To run this test suite in complete isolation without risking active development or production data, provision a temporary MariaDB 11.8.9 container on port 3307:

```bash
# Step 1: Launch an isolated, ephemeral MariaDB 11.8 container on port 3307
docker run --name hrms-disposable-mariadb \
  -e MARIADB_ROOT_PASSWORD=disposable_root_pass \
  -e MARIADB_DATABASE=hrms_disposable_test \
  -e MARIADB_USER=hrms_tester \
  -e MARIADB_PASSWORD=disposable_test_pass \
  -p 3307:3306 \
  -d mariadb:11.8.9

# Step 2: Wait for MariaDB initialization
docker exec hrms-disposable-mariadb mariadb-admin ping -u root -pdisposable_root_pass --silent --wait=30

# Step 3: Verify exact server version
docker exec -i hrms-disposable-mariadb mariadb -u root -pdisposable_root_pass hrms_disposable_test -e "SELECT VERSION();"
```

---

## 2. 13-Part Validation Suite Execution Scripts

### Part 1: Baseline Environment Setup & Schema 001–005 Constrained Execution
- **Objective:** Apply ONLY baseline migrations `001` through `005` in the disposable environment, explicitly preventing migrations `006–013` from executing prematurely.
- **Constrained Execution Mechanism:**
  The migration runner must be explicitly constrained by staging only baseline files or using the `MAX_MIGRATION_VERSION` environment filter:
  ```bash
  # Option A: Staged directory containing strictly 001 through 005
  mkdir -p node_backend/scripts/migrations_baseline
  cp node_backend/scripts/migrations/00[1-5]_*.sql node_backend/scripts/migrations_baseline/

  # Option B: Target version filter execution
  MAX_MIGRATION_VERSION=005 DB_CLIENT=mysql \
  MYSQL_HOST=127.0.0.1 MYSQL_PORT=3307 \
  MYSQL_USER=hrms_tester MYSQL_PASSWORD=disposable_test_pass \
  MYSQL_DATABASE=hrms_disposable_test \
    node -e "
      import('f:/hrms/node_backend/scripts/run-migrations.js').catch(err => {
        console.error(err);
        process.exit(1);
      });
    "
  ```
- **Verification Query:**
  ```sql
  SELECT version, name, applied_at FROM schema_migrations ORDER BY version ASC;
  ```
- **Expected Result:** Exactly 5 rows returned (`001` through `005`). No migration $\ge 006$ is executed.
- **Evidentiary Status:** `[NOT VERIFIED]`

---

### Part 2: Phase B Core Migrations 006–011 Execution
- **Objective:** Apply workforce core migrations sequentially and verify that all 14 tables and parent composite unique keys are created without syntax or foreign key errors.
- **Execution Script:**
  ```bash
  for f in 006 007 008 009 010 011; do
    echo "Applying migration $f..."
    docker exec -i hrms-disposable-mariadb mariadb -u hrms_tester -pdisposable_test_pass hrms_disposable_test < node_backend/scripts/migrations/${f}_*.sql
  done
  ```
- **Verification Query:**
  ```sql
  SELECT COUNT(*) AS phase_b_tables
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = 'hrms_disposable_test'
    AND TABLE_NAME IN (
      'workforce_tenant', 'workforce_user_tenant', 'workforce_company_policy',
      'workforce_company_policy_version', 'workforce_company_holiday',
      'workforce_shift', 'workforce_shift_version', 'workforce_employee_fixed_assignment',
      'workforce_rotation_definition', 'workforce_rotation_step',
      'workforce_employee_rotation', 'workforce_roster_header',
      'workforce_roster_entry', 'workforce_shift_swap_request'
    );
  ```
- **Expected Result:** Exactly `phase_b_tables = 14`.
- **Evidentiary Status:** `[NOT VERIFIED]`

---

### Part 3: Phase G Attendance Migrations 012–013 Execution
- **Objective:** Apply `012_attendance_schema_expansion.sql` and `013_workforce_attribution_exceptions.sql`.
- **Execution Script:**
  ```bash
  docker exec -i hrms-disposable-mariadb mariadb -u hrms_tester -pdisposable_test_pass hrms_disposable_test < node_backend/scripts/migrations/012_attendance_schema_expansion.sql
  docker exec -i hrms-disposable-mariadb mariadb -u hrms_tester -pdisposable_test_pass hrms_disposable_test < node_backend/scripts/migrations/013_workforce_attribution_exceptions.sql
  ```
- **Verification Query:**
  ```sql
  SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = 'hrms_disposable_test'
    AND TABLE_NAME = 'attendance_attendance'
    AND COLUMN_NAME IN ('tenant_id', 'roster_entry_id', 'shift_version_id', 'work_date');
  ```
- **Expected Result:** Columns exist. `tenant_id` and `work_date` are `NO` (NOT NULL).
- **Evidentiary Status:** `[NOT VERIFIED]`

---

### Part 4: Comprehensive Schema Audit Stored Procedure Execution
- **Objective:** Execute the rerunnable stored procedure `audit_workforce_schema_integrity()` to mathematically verify table counts (14 Phase B, 17 full schema), zero cascades, and FK ordinals.
- **Execution Script:**
  ```sql
  CALL audit_workforce_schema_integrity();
  ```
- **Expected Result:** Stored procedure returns `AUDIT SUCCESS: All 17 tables, zero cascades, and foreign key ordinals verified!` without throwing SQLSTATE 45000.
- **Evidentiary Status:** `[NOT VERIFIED]`

---

### Part 5: Existing Data Backfill & Role Distribution Checks
- **Objective:** Populate 65 mock users matching the exact distribution of production `accounts_user` and run the backfill.
- **Verification Query:**
  ```sql
  SELECT role, is_active, COUNT(*) AS user_count
  FROM workforce_user_tenant
  WHERE tenant_id = 1
  GROUP BY role, is_active
  ORDER BY role ASC;
  ```
- **Expected Result:**
  - `superadmin`: 3
  - `admin`: 4
  - `hr`: 7
  - `manager`: 5
  - `employee`: 46 (41 active, 5 inactive)
  - Total: 65
- **Evidentiary Status:** `[NOT VERIFIED]`

---

### Part 6: Tenant Isolation & Cross-Tenant Constraint Violation Tests
- **Objective:** Assert that cross-tenant operations are rejected by composite foreign keys.
- **Execution Script (Corrected with explicit Tenant 2 shift seeding):**
  ```sql
  -- Step 1: Seed Tenant 2
  INSERT INTO workforce_tenant (id, code, name) VALUES (2, 'TENANT_2', 'Secondary Org');

  -- Step 2: Seed an actual shift belonging strictly to Tenant 2
  INSERT INTO workforce_shift (id, tenant_id, code, name) 
  VALUES (201, 2, 'T2_MORNING', 'Tenant 2 Morning Shift');
  
  INSERT INTO workforce_shift_version (id, tenant_id, shift_id, version_number, start_time, end_time, duration_minutes, effective_from)
  VALUES (201, 2, 201, 1, '08:00:00', '16:00:00', 480, '2026-01-01');

  -- Step 3: Attempt to assign User 10 (belonging to Tenant 1) to Tenant 2's shift (ID 201)
  -- Parent composite key required: (tenant_id, shift_id) -> (1, 201)
  -- But shift 201 belongs to Tenant 2!
  INSERT INTO workforce_employee_fixed_assignment (tenant_id, user_id, shift_id, effective_from)
  VALUES (1, 10, 201, '2026-11-01');
  ```
- **Expected Result:** MariaDB raises `ERROR 1452 (23000): Cannot add or update a child row: a foreign key constraint fails (fk_wefa_shift)`. Cross-tenant reference is strictly rejected by the database engine.
- **Evidentiary Status:** `[NOT VERIFIED]`

---

### Part 7: Referential Integrity & RESTRICT Enforcement Tests
- **Objective:** Verify that hard deletes on parent records are strictly blocked.
- **Execution Script:**
  ```sql
  -- Attempt to delete workforce_tenant 1 which has active users
  DELETE FROM workforce_tenant WHERE id = 1;
  ```
- **Expected Result:** MariaDB raises `ERROR 1451 (23000): Cannot delete or update a parent row: a foreign key constraint fails (ON DELETE RESTRICT)`. Zero cascades occur.
- **Evidentiary Status:** `[NOT VERIFIED]`

---

### Part 8: Multi-Client Concurrency Test Suite (Executable Node.js Scripts)

#### Test C-01: Roster Publishing Concurrency Simulation (`test_roster_publish_concurrency.mjs`)
- **Objective:** Prove row-lock serialization (`SELECT ... FOR UPDATE` + draft check) results in exactly 1 successful publication and 1 clean HTTP 409 Conflict rejection.
- **Executable Script:**
  ```javascript
  import mysql from 'mysql2/promise';

  const pool = mysql.createPool({
    host: '127.0.0.1', port: 3307, user: 'hrms_tester', password: 'disposable_test_pass', database: 'hrms_disposable_test', connectionLimit: 5
  });

  async function testPublishRace() {
    console.log('[Test C-01] Starting two-publisher concurrency race...');
    
    // Prerequisite: Ensure draft roster header 1 exists
    await pool.query("INSERT INTO workforce_roster_header (id, tenant_id, department_id, start_date, end_date, status) VALUES (1, 1, 10, '2026-12-01', '2026-12-31', 'draft') ON DUPLICATE KEY UPDATE status = 'draft'");

    const publishAttempt = async (publisherId) => {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        console.log(`Publisher ${publisherId}: Attempting exclusive lock on header 1...`);
        const [rows] = await conn.query("SELECT id, status FROM workforce_roster_header WHERE id = 1 AND tenant_id = 1 FOR UPDATE");
        
        console.log(`Publisher ${publisherId}: Acquired lock. Current status = ${rows[0].status}`);
        if (rows[0].status !== 'draft') {
          await conn.rollback();
          console.log(`Publisher ${publisherId}: Draft assertion failed! Rolling back.`);
          return { publisherId, status: 409, message: 'Conflict: Roster already published' };
        }

        // Simulate publish workload
        await new Promise(r => setTimeout(r, 100));

        await conn.query("UPDATE workforce_roster_header SET status = 'published', published_at = NOW(), published_by = ? WHERE id = 1 AND status = 'draft'", [publisherId]);
        await conn.commit();
        console.log(`Publisher ${publisherId}: Committed status='published'. Lock released.`);
        return { publisherId, status: 200, message: 'Published successfully' };
      } finally {
        conn.release();
      }
    };

    // Launch both publishers concurrently
    const [res1, res2] = await Promise.all([publishAttempt(101), publishAttempt(102)]);
    console.log('[Test C-01] Results:', { res1, res2 });

    const successCount = [res1, res2].filter(r => r.status === 200).length;
    const conflictCount = [res1, res2].filter(r => r.status === 409).length;

    if (successCount === 1 && conflictCount === 1) {
      console.log('✅ TEST C-01 PASSED: Exactly 1 publisher succeeded, 1 received 409 Conflict.');
    } else {
      throw new Error(`❌ TEST C-01 FAILED: Unexpected outcomes: ${JSON.stringify({ res1, res2 })}`);
    }
  }

  testPublishRace().catch(console.error).finally(() => pool.end());
  ```
- **Expected Result:** Exactly 1 publisher succeeds with 200; the second publisher reads `status = 'published'`, fails the draft check, rolls back, and returns 409 Conflict.
- **Evidentiary Status:** `[NOT VERIFIED]`

#### Test C-02: Roster Draft Edit vs Publishing Collision (`test_roster_edit_publish_race.mjs`)
- **Objective:** Prove that editing a draft entry while publication is in-flight blocks on the header lock and fails with 409 once publication completes.
- **Executable Scenario:** Connection A begins publication and holds header lock. Connection B calls `PUT /api/rosters/1/entries`, attempts `SELECT id, status FROM workforce_roster_header WHERE id = 1 FOR UPDATE`. Connection B blocks. Connection A commits `status = 'published'`. Connection B unblocks, reads `status = 'published'`, detects header is not draft, aborts with 409 Conflict.
- **Evidentiary Status:** `[NOT VERIFIED]`

#### Test C-03: Punch-In vs Punch-Out Attribution Race (`test_punch_attribution_race.mjs`)
- **Objective:** Prove concurrent punch requests on the same employee are serialized at the database row-lock layer without data corruption.
- **Executable Scenario:** Employee taps punch-out while a delayed punch-in arrives. Row lock on `attendance_attendance` serializes the update and settles hours cleanly.
- **Evidentiary Status:** `[NOT VERIFIED]`

#### Test C-04: Fixed Assignment vs Rotation Enrollment Collision (`test_assignment_rotation_conflict.mjs`)
- **Objective:** Prove that concurrent fixed assignment and rotation enrollment on the same user are serialized by locking `workforce_user_tenant (user_id = :u FOR UPDATE)`, guaranteeing mutual exclusivity.
- **Evidentiary Status:** `[NOT VERIFIED]`

#### Test C-05: Exception Resolution Collision (`test_exception_resolution_race.mjs`)
- **Objective:** Prove that when two managers attempt to resolve the same attribution exception simultaneously, exactly one succeeds and the second receives 409 Conflict.
- **Evidentiary Status:** `[NOT VERIFIED]`

#### Test C-06: Monotonic ID Sorting Deadlock Avoidance Test (`test_deadlock_avoidance_ordering.mjs`)
- **Objective:** Demonstrate that sorting multi-row locks by ascending ID (`user_id ASC`) prevents `ER_LOCK_DEADLOCK` (Error 1213) under high concurrency with inverted requests.
- **Executable Script:**
  ```javascript
  import mysql from 'mysql2/promise';

  const pool = mysql.createPool({ host: '127.0.0.1', port: 3307, user: 'hrms_tester', password: 'disposable_test_pass', database: 'hrms_disposable_test', connectionLimit: 10 });

  async function testDeadlockAvoidance() {
    console.log('[Test C-06] Running multi-client lock order test...');

    const swapOperation = async (clientName, u1, u2) => {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        // Canonical monotonic ordering: sort user IDs ascending
        const [firstUser, secondUser] = [u1, u2].sort((a, b) => a - b);
        
        console.log(`${clientName}: Locking User ${firstUser} then User ${secondUser}...`);
        await conn.query("SELECT * FROM workforce_user_tenant WHERE tenant_id = 1 AND user_id = ? FOR UPDATE", [firstUser]);
        await new Promise(r => setTimeout(r, 50));
        await conn.query("SELECT * FROM workforce_user_tenant WHERE tenant_id = 1 AND user_id = ? FOR UPDATE", [secondUser]);
        
        await conn.commit();
        return { clientName, success: true };
      } catch (err) {
        await conn.rollback();
        return { clientName, success: false, error: err.code };
      } finally {
        conn.release();
      }
    };

    // Client 1 requests swap between User 10 and User 20
    // Client 2 requests swap between User 20 and User 10
    const [r1, r2] = await Promise.all([
      swapOperation('Client-A', 10, 20),
      swapOperation('Client-B', 20, 10)
    ]);

    console.log('[Test C-06] Results:', { r1, r2 });
    if (r1.success && r2.success) {
      console.log('✅ TEST C-06 PASSED: Monotonic ascending ID sorting eliminated deadlock.');
    } else {
      throw new Error(`❌ TEST C-06 FAILED: Deadlock encountered: ${JSON.stringify({ r1, r2 })}`);
    }
  }

  testDeadlockAvoidance().catch(console.error).finally(() => pool.end());
  ```
- **Expected Result:** Zero deadlocks. Both clients serialize cleanly.
- **Evidentiary Status:** `[NOT VERIFIED]`

---

### Part 9: Standard Shift Attendance Attribution Tests
- **Objective:** Test standard day shift (09:00–17:00).
- **Execution Scenario:**
  - Punch-In: 09:12 (within 15m grace) $\to$ `late_minutes = 0`, `punctuality_status = 'grace_period'`.
  - Punch-In: 09:25 (after grace) $\to$ `late_minutes = 25`, `punctuality_status = 'late'`.
- **Expected Result:** Attributed correctly to published roster entry with precise punctuality flags.
- **Evidentiary Status:** `[NOT VERIFIED]`

---

### Part 10: Overnight Shift Attendance Attribution Tests
- **Objective:** Test overnight shift (22:00–06:00, `is_overnight = 1`).
- **Execution Scenario:**
  - Punch-In at 2026-11-16 21:55 $\to$ Attributed to `work_date = '2026-11-16'`.
  - Punch-Out at 2026-11-17 06:08 $\to$ Matched to open session for `work_date = '2026-11-16'`.
- **Expected Result:** `work_date` remains strictly `'2026-11-16'` (POD-01 invariant). Midnight crossover does NOT split the session or change `work_date`.
- **Evidentiary Status:** `[NOT VERIFIED]`

---

### Part 11: Attribution Exception Lifecycle & Uniqueness Tests
- **Objective:** Test ambiguous punch matching, virtual column uniqueness, and composite history integrity.
- **Execution Script (Corrected with valid prerequisite attendance row):**
  ```sql
  -- Step 1: Ensure User 10 exists in workforce_user_tenant
  INSERT INTO accounts_user (id, username, email, role, is_active, is_superuser, created_at, updated_at)
  VALUES (10, 'user_10', 'user10@example.com', 'employee', 1, 0, NOW(), NOW())
  ON DUPLICATE KEY UPDATE updated_at = NOW();

  INSERT INTO workforce_user_tenant (tenant_id, user_id, role, is_active)
  VALUES (1, 10, 'employee', 1)
  ON DUPLICATE KEY UPDATE is_active = 1;

  -- Step 2: Seed a valid prerequisite attendance row matching (tenant_id=1, user_id=10, id=500)
  INSERT INTO attendance_attendance (id, tenant_id, user_id, date, work_date, punch_in, total_hours)
  VALUES (500, 1, 10, '2026-11-16', '2026-11-16', '2026-11-16 09:00:00', 0.0)
  ON DUPLICATE KEY UPDATE work_date = '2026-11-16';

  -- Step 3: Insert first pending exception (Succeeds)
  INSERT INTO workforce_punch_attribution_exception (tenant_id, user_id, attendance_id, punch_type, exception_type, status)
  VALUES (1, 10, 500, 'in', 'ambiguous_shift_match', 'pending');

  -- Step 4: Attempt duplicate pending exception for same attendance_id and punch_type (Must Fail with ER_DUP_ENTRY)
  INSERT INTO workforce_punch_attribution_exception (tenant_id, user_id, attendance_id, punch_type, exception_type, status)
  VALUES (1, 10, 500, 'in', 'ambiguous_shift_match', 'pending');
  -- Expected: ERROR 1062 (23000): Duplicate entry '1-500-in' for key 'uq_single_pending_exception'

  -- Step 5: Resolve first exception
  UPDATE workforce_punch_attribution_exception
  SET status = 'resolved', resolved_at = NOW(), resolved_by = 1
  WHERE attendance_id = 500 AND punch_type = 'in';

  -- Step 6: Insert second exception now that first is resolved (Succeeds because pending_attendance_id is now NULL)
  INSERT INTO workforce_punch_attribution_exception (tenant_id, user_id, attendance_id, punch_type, exception_type, status)
  VALUES (1, 10, 500, 'in', 'ambiguous_shift_match', 'pending');

  -- Step 7: Verify Composite History Constraint fk_wpah_attendance_composite
  -- Attempt to insert history row referencing mismatched tenant (Tenant 2 instead of Tenant 1)
  INSERT INTO workforce_punch_attribution_history (tenant_id, attendance_id, user_id, action, reason)
  VALUES (2, 500, 10, 'initial_attribution', 'Mismatched tenant test');
  -- Expected: ERROR 1452 (23000): foreign key constraint fails (fk_wpah_attendance_composite)
  ```
- **Expected Result:** Step 3 succeeds. Step 4 fails with duplicate entry error 1062. Step 5 resolves exception. Step 6 succeeds. Step 7 fails with foreign key error 1452 on composite relationship.
- **Evidentiary Status:** `[NOT VERIFIED]`

---

### Part 12: Migration Interruption, DDL Implicit Commit & Idempotent Recovery Test
- **Objective:** Simulate a partial DDL execution caused by an unexpected process interruption or syntax error, inspect database state, and verify idempotent recovery without manual rollback.
- **Architectural Background:** MariaDB DDL statements (`CREATE TABLE`, `ALTER TABLE`) cause implicit commits. If a migration is interrupted mid-execution, previously executed tables remain committed while `schema_migrations` contains NO record of the migration version.
- **Execution Script:**
  ```bash
  # Step 1: Simulate interrupted Migration 010 (creates 2 tables, then fails on intentional syntax error)
  docker exec -i hrms-disposable-mariadb mariadb -u hrms_tester -pdisposable_test_pass hrms_disposable_test -e "
    -- Statement 1 (Committed via DDL implicit commit)
    CREATE TABLE IF NOT EXISTS workforce_employee_fixed_assignment (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT NOT NULL,
      user_id BIGINT NOT NULL,
      shift_id BIGINT NOT NULL,
      effective_from DATE NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT 1
    );

    -- Statement 2 (Committed via DDL implicit commit)
    CREATE TABLE IF NOT EXISTS workforce_rotation_definition (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      tenant_id BIGINT NOT NULL,
      code VARCHAR(50) NOT NULL,
      name VARCHAR(255) NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT 1
    );

    -- Statement 3 (Intentional failure - process crash / syntax error)
    INTENTIONAL_SYNTAX_ERROR_CRASH;
  " || echo "Simulated migration failure occurred as expected."

  # Step 2: Verify Partial Execution State in MariaDB
  docker exec -i hrms-disposable-mariadb mariadb -u hrms_tester -pdisposable_test_pass hrms_disposable_test -e "
    SELECT TABLE_NAME FROM information_schema.TABLES 
    WHERE TABLE_SCHEMA = 'hrms_disposable_test' 
      AND TABLE_NAME IN ('workforce_employee_fixed_assignment', 'workforce_rotation_definition', 'workforce_rotation_step');
    
    SELECT version FROM schema_migrations WHERE version = '010';
  "
  # Expected: The first two tables exist (due to implicit commit), but schema_migrations has NO entry for 010!

  # Step 3: Execute Idempotent Recovery Rerun (Complete, valid Migration 010 script)
  docker exec -i hrms-disposable-mariadb mariadb -u hrms_tester -pdisposable_test_pass hrms_disposable_test < node_backend/scripts/migrations/010_workforce_assignments_and_rotations.sql

  # Step 4: Verify Full Recovery & Schema Migration Recording
  docker exec -i hrms-disposable-mariadb mariadb -u hrms_tester -pdisposable_test_pass hrms_disposable_test -e "
    SELECT COUNT(*) AS total_tables FROM information_schema.TABLES 
    WHERE TABLE_SCHEMA = 'hrms_disposable_test' 
      AND TABLE_NAME IN ('workforce_employee_fixed_assignment', 'workforce_rotation_definition', 'workforce_rotation_step', 'workforce_employee_rotation');
  "
  ```
- **Expected Result:** Partial execution commits the first two tables. Recovery rerun safely skips existing tables (via `IF NOT EXISTS`), creates the remaining tables, and records migration success cleanly.
- **Evidentiary Status:** `[NOT VERIFIED]`

---

### Part 13: Application Rollback & Post-Traffic Forward-Fix Tests
- **Objective:** Verify that toggling `ENABLE_WORKFORCE_MODULE=false` disables the feature without dropping columns or mutating historical data.
- **Expected Result:** Legacy attendance routes function seamlessly using existing columns. New columns remain inert.
- **Evidentiary Status:** `[NOT VERIFIED]`

---

## 3. Disposable Test Plan Execution Summary

| Test Part | Description | Target Component | Status |
|---|---|---|---|
| Part 1 | Baseline 001–005 Setup | `schema_migrations` (Constrained Runner) | `[NOT VERIFIED]` |
| Part 2 | Phase B Core Migrations 006–011 | 14 Workforce Core Tables | `[NOT VERIFIED]` |
| Part 3 | Phase G Migrations 012–013 | `attendance_attendance` expansion | `[NOT VERIFIED]` |
| Part 4 | Schema Integrity Stored Procedure | `audit_workforce_schema_integrity` | `[NOT VERIFIED]` |
| Part 5 | Existing User Backfill (65 Users) | `workforce_user_tenant` role mapping | `[NOT VERIFIED]` |
| Part 6 | Tenant Isolation & Cross-Tenant FKs | Seeded Shift 201 FK Rejection | `[NOT VERIFIED]` |
| Part 7 | Zero Cascades & RESTRICT Enforcement | `ON DELETE RESTRICT` | `[NOT VERIFIED]` |
| Part 8 | Multi-Client Concurrency Test Suite | Executable Node.js Scripts (C-01 to C-06) | `[NOT VERIFIED]` |
| Part 9 | Standard Shift Attendance Attribution | Grace period & late calculations | `[NOT VERIFIED]` |
| Part 10 | Overnight Shift Attribution (POD-01) | Midnight crossover & `work_date` | `[NOT VERIFIED]` |
| Part 11 | Attribution Exception Lifecycle | Virtual column uniqueness & Composite History FK | `[NOT VERIFIED]` |
| Part 12 | Interruption & DDL Implicit Commit Recovery | Partial execution & idempotent rerun | `[NOT VERIFIED]` |
| Part 13 | Decoupled Application Rollback | Feature flag toggle | `[NOT VERIFIED]` |
