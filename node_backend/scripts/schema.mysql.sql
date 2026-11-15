CREATE TABLE IF NOT EXISTS accounts_user (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  password VARCHAR(128) NOT NULL,
  last_login DATETIME NULL,
  is_superuser BOOLEAN NOT NULL DEFAULT 0,
  username VARCHAR(150) NOT NULL UNIQUE,
  first_name VARCHAR(150) NOT NULL,
  last_name VARCHAR(150) NOT NULL,
  email VARCHAR(254) NOT NULL,
  is_staff BOOLEAN NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT 1,
  date_joined DATETIME NOT NULL,
  role VARCHAR(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS accounts_employeeprofile (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  latitude DOUBLE NULL,
  longitude DOUBLE NULL,
  allowed_radius INT NOT NULL DEFAULT 100,
  manager_id BIGINT NULL,
  user_id BIGINT NOT NULL UNIQUE,
  is_active_employee BOOLEAN NOT NULL DEFAULT 1,
  team_name VARCHAR(120) NULL,
  joining_date DATE NULL,
  leave_allotted INT NOT NULL DEFAULT 0,
  designation VARCHAR(255) NULL,
  CONSTRAINT fk_profile_user FOREIGN KEY (user_id) REFERENCES accounts_user(id) ON DELETE CASCADE,
  CONSTRAINT fk_profile_manager FOREIGN KEY (manager_id) REFERENCES accounts_user(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS accounts_employeedocument (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(100) NOT NULL,
  file VARCHAR(255) NOT NULL,
  uploaded_at DATETIME NOT NULL,
  user_id BIGINT NOT NULL,
  CONSTRAINT fk_doc_user FOREIGN KEY (user_id) REFERENCES accounts_user(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS attendance_attendance (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  date DATE NOT NULL,
  punch_in_time DATETIME NULL,
  punch_out_time DATETIME NULL,
  punch_in_photo VARCHAR(255) NULL,
  punch_out_photo VARCHAR(255) NULL,
  punch_in_lat DOUBLE NULL,
  punch_in_lng DOUBLE NULL,
  punch_out_lat DOUBLE NULL,
  punch_out_lng DOUBLE NULL,
  status VARCHAR(20) NOT NULL,
  is_outside_location BOOLEAN NOT NULL DEFAULT 0,
  user_id BIGINT NOT NULL,
  punch_in_outside BOOLEAN NOT NULL DEFAULT 0,
  punch_out_outside BOOLEAN NOT NULL DEFAULT 0,
  punch_in_status VARCHAR(20) NOT NULL,
  punch_out_status VARCHAR(20) NOT NULL,
  CONSTRAINT fk_att_user FOREIGN KEY (user_id) REFERENCES accounts_user(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS attendance_attendanceapproval (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  role VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL,
  comment TEXT NULL,
  created_at DATETIME NOT NULL,
  approved_by_id BIGINT NOT NULL,
  attendance_id BIGINT NOT NULL,
  type VARCHAR(10) NOT NULL,
  action_at DATETIME NULL,
  CONSTRAINT fk_approval_user FOREIGN KEY (approved_by_id) REFERENCES accounts_user(id) ON DELETE CASCADE,
  CONSTRAINT fk_approval_att FOREIGN KEY (attendance_id) REFERENCES attendance_attendance(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS leave_leave (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  leave_type VARCHAR(20) NOT NULL,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL,
  created_at DATETIME NOT NULL,
  user_id BIGINT NOT NULL,
  action_at DATETIME NULL,
  action_by_id BIGINT NULL,
  CONSTRAINT fk_leave_user FOREIGN KEY (user_id) REFERENCES accounts_user(id) ON DELETE CASCADE,
  CONSTRAINT fk_leave_action_by FOREIGN KEY (action_by_id) REFERENCES accounts_user(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS accounts_employeelocation (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  latitude DOUBLE NOT NULL,
  longitude DOUBLE NOT NULL,
  allowed_radius INT NOT NULL DEFAULT 100,
  is_primary BOOLEAN NOT NULL DEFAULT 0,
  CONSTRAINT fk_loc_user FOREIGN KEY (user_id) REFERENCES accounts_user(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS accounts_refreshtoken (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  family_id VARCHAR(64) NULL,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  is_revoked BOOLEAN NOT NULL DEFAULT 0,
  replaced_by_hash VARCHAR(255) NULL,
  created_at DATETIME NOT NULL,
  device_id VARCHAR(255) NULL,
  device_name VARCHAR(255) NULL,
  platform VARCHAR(50) NULL,
  ip_address VARCHAR(45) NULL,
  last_activity DATETIME NOT NULL,
  CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES accounts_user(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS password_reset_otp (
  email VARCHAR(254) PRIMARY KEY,
  otp_hash VARCHAR(128) NOT NULL,
  reset_token_hash VARCHAR(128) NULL,
  expires_at DATETIME NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  verified_at DATETIME NULL,
  consumed_at DATETIME NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Enterprise Scale Performance Indexes
CREATE INDEX IF NOT EXISTS idx_user_role_active ON accounts_user(role, is_active, deleted_at);
CREATE INDEX IF NOT EXISTS idx_profile_manager ON accounts_employeeprofile(manager_id, is_active_employee);
CREATE INDEX IF NOT EXISTS idx_loc_user_primary ON accounts_employeelocation(user_id, is_primary);
CREATE INDEX IF NOT EXISTS idx_refresh_user_expiry ON accounts_refreshtoken(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_family ON accounts_refreshtoken(family_id);
CREATE INDEX IF NOT EXISTS idx_refresh_token_revoked ON accounts_refreshtoken(token_hash, is_revoked);
CREATE INDEX IF NOT EXISTS idx_otp_email_verified ON password_reset_otp(email, verified);
CREATE INDEX IF NOT EXISTS idx_att_user_date ON attendance_attendance(user_id, date);
CREATE INDEX IF NOT EXISTS idx_att_date_status ON attendance_attendance(date, status);
CREATE INDEX IF NOT EXISTS idx_att_user_open ON attendance_attendance(user_id, punch_out_time, punch_in_status);
CREATE INDEX IF NOT EXISTS idx_appr_att_status ON attendance_attendanceapproval(attendance_id, status);
CREATE INDEX IF NOT EXISTS idx_appr_by_status ON attendance_attendanceapproval(approved_by_id, status);
CREATE INDEX IF NOT EXISTS idx_leave_user_dates ON leave_leave(user_id, status, from_date, to_date);
