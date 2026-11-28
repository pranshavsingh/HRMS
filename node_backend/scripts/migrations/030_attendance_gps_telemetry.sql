-- Migration 030: GPS Accuracy & Location Telemetry on attendance_attendance
ALTER TABLE attendance_attendance
  ADD COLUMN IF NOT EXISTS punch_in_accuracy DECIMAL(7, 2) NULL AFTER punch_in_lng,
  ADD COLUMN IF NOT EXISTS punch_out_accuracy DECIMAL(7, 2) NULL AFTER punch_out_lng,
  ADD COLUMN IF NOT EXISTS punch_in_location_ts DATETIME NULL AFTER punch_in_accuracy,
  ADD COLUMN IF NOT EXISTS punch_out_location_ts DATETIME NULL AFTER punch_out_accuracy,
  ADD COLUMN IF NOT EXISTS punch_in_location_provider VARCHAR(32) NULL AFTER punch_in_location_ts,
  ADD COLUMN IF NOT EXISTS punch_out_location_provider VARCHAR(32) NULL AFTER punch_out_location_ts;
