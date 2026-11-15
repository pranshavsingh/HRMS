-- ============================================================================
-- HRMS Phase 2 Database Performance Indexes Migration
-- Target: MySQL 8.0+, MariaDB 10+, SQLite 3
-- Migration: 002_phase2_performance_indexes.sql
-- Description:
--   Adds critical composite and covering indexes to eliminate full-table scans
--   and support high concurrency (5,000-8,000 users, 1,000-2,000 concurrent)
-- ============================================================================

-- 1. Accounts & User Indexes
CREATE INDEX IF NOT EXISTS idx_user_role_active ON accounts_user(role, is_active);
CREATE INDEX IF NOT EXISTS idx_profile_manager ON accounts_employeeprofile(manager_id, is_active_employee);
CREATE INDEX IF NOT EXISTS idx_loc_user_primary ON accounts_employeelocation(user_id, is_primary);
CREATE INDEX IF NOT EXISTS idx_refresh_user_expiry ON accounts_refreshtoken(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_doc_user ON accounts_employeedocument(user_id);

-- 2. Attendance Query & Verification Optimization
CREATE INDEX IF NOT EXISTS idx_att_user_date ON attendance_attendance(user_id, date);
CREATE INDEX IF NOT EXISTS idx_att_date_status ON attendance_attendance(date, status);
CREATE INDEX IF NOT EXISTS idx_att_user_open ON attendance_attendance(user_id, punch_out_time, punch_in_status);

-- 3. Approval Routing & Decision Optimization
CREATE INDEX IF NOT EXISTS idx_appr_att_status ON attendance_attendanceapproval(attendance_id, status);
CREATE INDEX IF NOT EXISTS idx_appr_by_status ON attendance_attendanceapproval(approved_by_id, status);

-- 4. Leave Management & Calendar Concurrency Indexes
CREATE INDEX IF NOT EXISTS idx_leave_user_dates ON leave_leave(user_id, status, from_date, to_date);
CREATE INDEX IF NOT EXISTS idx_leave_status ON leave_leave(status);

-- 5. Audit Trail & Compliance Queries
CREATE INDEX IF NOT EXISTS idx_audit_created_severity ON audit_logs(created_at, severity);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
