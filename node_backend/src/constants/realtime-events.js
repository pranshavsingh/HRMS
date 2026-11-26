/**
 * Enterprise Realtime Event Constants & Registry
 * Standardized event names across backend, web, and mobile clients.
 */

export const REALTIME_EVENTS = {
  // Connection lifecycle
  CONNECTED: "realtime:connected",
  DISCONNECTED: "realtime:disconnected",

  // Authentication & Session
  AUTH_LOGOUT: "auth:logout",
  SESSION_REVOKED: "session:revoked",
  PASSWORD_CHANGED: "user:password_changed",

  // Employee Management
  EMPLOYEE_CREATED: "employee:created",
  EMPLOYEE_UPDATED: "employee:updated",
  EMPLOYEE_DELETED: "employee:deleted",
  EMPLOYEE_UPDATE: "employee_update", // legacy alias

  // Attendance Management
  ATTENDANCE_PUNCH_IN: "attendance:punch_in",
  ATTENDANCE_PUNCH_OUT: "attendance:punch_out",
  ATTENDANCE_APPROVAL_DECISION: "attendance:approval_decision",
  ATTENDANCE_REGULARIZATION: "attendance:regularization",
  ATTENDANCE_UPDATE: "attendance_update", // legacy alias

  // Leave Management
  LEAVE_APPLIED: "leave:applied",
  LEAVE_ACTION: "leave:action",
  LEAVE_CONCESSION_GRANTED: "leave:concession_granted",
  LEAVE_CONCESSION_REVERSED: "leave:concession_reversed",
  LEAVE_UPDATE: "leave_update", // legacy alias
  LEAVE_NOTICE: "leave_notice", // legacy alias

  // Shift & Roster Management
  SHIFT_CREATED: "shift:created",
  SHIFT_UPDATED: "shift:updated",
  SHIFT_DELETED: "shift:deleted",
  ASSIGNMENT_UPDATED: "assignment:updated",
  ROTATION_UPDATED: "rotation:updated",
  ROSTER_GENERATED: "roster:generated",
  ROSTER_PUBLISHED: "roster:published",
  SCHEDULE_UPDATE: "schedule_update", // legacy alias

  // Document Management
  DOCUMENT_UPLOADED: "document:uploaded",
  DOCUMENT_DELETED: "document:deleted",
  DOCUMENT_UPDATE: "document_update", // legacy alias

  // Company Holidays
  HOLIDAY_CREATED: "holiday:created",
  HOLIDAY_UPDATED: "holiday:updated",
  HOLIDAY_DELETED: "holiday:deleted",

  // Company & Weekly-off Policies
  POLICY_UPDATED: "policy:updated",
  POLICY_LEAVE_DRAFT: "policy:leave_draft_saved",
  POLICY_LEAVE_PUBLISHED: "policy:leave_published",

  // Work Sites
  SITE_UPDATED: "site:updated",
  SITE_ASSIGNMENT_UPDATED: "site:assignment_updated",

  // Audit Logs
  AUDIT_LOG_CREATED: "audit:created",
  NEW_AUDIT_LOG: "new_audit_log", // legacy alias

  // Notifications
  NOTIFICATION_CREATED: "notification:created",
  NOTIFICATION_NEW: "notification:new",
  NOTIFICATION_READ: "notification:read",
  NOTIFICATION_READ_ALL: "notification:read-all",
  NOTIFICATION_UNREAD_COUNT: "notification:unread-count",
  NOTIFICATION_SYNC: "notification:sync",
  NOTIFICATION_SYNC_REQUIRED: "notification:sync-required",

  // Approval Pending Counts
  APPROVAL_ATTENDANCE_COUNT_UPDATED: "approval:attendance:count-updated",
  APPROVAL_LEAVE_COUNT_UPDATED: "approval:leave:count-updated",
};

export default REALTIME_EVENTS;
