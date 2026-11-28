-- Migration 031: Composite keyset pagination indexes for Mobile & API scalability
CREATE INDEX IF NOT EXISTS idx_att_user_date_id
  ON attendance_attendance (user_id, date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_doc_user_uploaded_id
  ON accounts_employeedocument (user_id, uploaded_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_leave_user_created_id
  ON leave_leave (user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_audit_created_id
  ON audit_logs (created_at DESC, id DESC);
