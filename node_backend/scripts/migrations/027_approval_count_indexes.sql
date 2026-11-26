-- Migration 027: Add composite indexes for efficient pending approval COUNT queries
CREATE INDEX IF NOT EXISTS idx_att_approval_status_att_reviewer
  ON attendance_attendanceapproval (status, attendance_id, approved_by_id);

CREATE INDEX IF NOT EXISTS idx_leave_tenant_status_user
  ON leave_leave (tenant_id, status, user_id);
