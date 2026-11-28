-- Migration 028: Indexes for Manager Team Attendance queries
CREATE INDEX IF NOT EXISTS idx_emp_profile_manager_team_active
  ON accounts_employeeprofile (manager_id, team_name, is_active_employee);

CREATE INDEX IF NOT EXISTS idx_att_tenant_date_user
  ON attendance_attendance (tenant_id, date, user_id);
