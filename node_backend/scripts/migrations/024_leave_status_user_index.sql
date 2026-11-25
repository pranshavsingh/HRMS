-- Migration 024: Add composite index on leave_leave (status, user_id) for optimized approvals querying
CREATE INDEX IF NOT EXISTS idx_leave_status_user ON leave_leave (status, user_id);
