// ============================================================================
// Service: node_backend/src/services/shift-snapshot.service.js
// Description: Deterministic canonical JSON serialization and SHA-256 hash
//              generation for shift configuration snapshots (Finding C4).
// ============================================================================

import crypto from "crypto";
import { formatDateToYMD } from "./shift-validation.service.js";

/**
 * Deterministically serialize a JavaScript value to canonical JSON.
 * - Object keys are sorted lexicographically.
 * - Arrays preserve deterministic item ordering.
 * - Primitive values (strings, numbers, booleans, null) follow standard JSON encoding.
 */
export function canonicalizeJson(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return "[" + value.map(canonicalizeJson).join(",") + "]";
  }

  const keys = Object.keys(value).sort();
  const pairs = keys.map((key) => {
    return JSON.stringify(key) + ":" + canonicalizeJson(value[key]);
  });
  return "{" + pairs.join(",") + "}";
}

/**
 * Calculate the SHA-256 hash of a snapshot payload.
 * Strictly excludes the `integrity` container from the hash calculation.
 */
export function generateSnapshotPayloadHash(snapshot) {
  if (!snapshot) return null;
  const { integrity, ...payload } = snapshot;
  const canonicalString = canonicalizeJson(payload);
  return crypto.createHash("sha256").update(canonicalString, "utf8").digest("hex");
}

/**
 * Verify that a snapshot has not been tampered with.
 */
export function verifySnapshotIntegrity(snapshot) {
  if (!snapshot || !snapshot.integrity || snapshot.integrity.algorithm !== "SHA-256") {
    return false;
  }
  const expectedHash = generateSnapshotPayloadHash(snapshot);
  if (!expectedHash || !snapshot.integrity.payload_hash) {
    return false;
  }
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedHash, "hex"),
      Buffer.from(snapshot.integrity.payload_hash, "hex")
    );
  } catch (e) {
    return false;
  }
}

/**
 * Build the complete frozen configuration snapshot for a shift version.
 */
export function buildShiftSnapshot({
  tenantId,
  shift,
  version,
  breaks = [],
  companyPolicy,
  companyPolicyVersion,
  weeklyOffPolicy,
  weeklyOffPolicyVersion,
  publishedBy = null,
  publishedAt = new Date().toISOString(),
  tier = "fully_reconstructable"
}) {
  const snapshot = {
    snapshot_version: "1.0",
    tenant_id: Number(tenantId),
    shift_header: {
      id: Number(shift.id),
      code: shift.code,
      name: shift.name,
      timezone: shift.timezone || "UTC",
      is_active: Boolean(shift.is_active)
    },
    shift_version: {
      id: Number(version.id),
      version_number: Number(version.version_number),
      status: "published",
      start_time: String(version.start_time).slice(0, 8),
      end_time: String(version.end_time).slice(0, 8),
      is_overnight: Boolean(version.is_overnight),
      duration_minutes: Number(version.duration_minutes),
      late_grace_minutes: Number(version.late_grace_minutes ?? 15),
      early_departure_grace_minutes: Number(version.early_departure_grace_minutes ?? 15),
      effective_from: formatDateToYMD(version.effective_from),
      effective_to: version.effective_to ? formatDateToYMD(version.effective_to) : null
    },
    breaks: (breaks || [])
      .sort((a, b) => (a.display_order ?? 1) - (b.display_order ?? 1))
      .map((b) => ({
        id: Number(b.id || 0),
        break_name: b.break_name,
        break_type: b.break_type || "unpaid",
        start_offset_minutes: Number(b.start_offset_minutes),
        end_offset_minutes: Number(b.end_offset_minutes),
        duration_minutes: Number(b.duration_minutes),
        is_mandatory: Boolean(b.is_mandatory),
        display_order: Number(b.display_order || 1)
      })),
    company_policy: {
      policy_id: Number(companyPolicy?.id || companyPolicyVersion?.policy_id || version.policy_id),
      policy_name: companyPolicy?.name || "Standard Company Attendance Policy",
      version_id: Number(companyPolicyVersion?.id || version.policy_version_id),
      version_number: Number(companyPolicyVersion?.version_number || 1),
      effective_from: String(companyPolicyVersion?.effective_from || "2026-01-01").slice(0, 10),
      effective_to: companyPolicyVersion?.effective_to ? String(companyPolicyVersion.effective_to).slice(0, 10) : null,
      min_rest_period_minutes: Number(companyPolicyVersion?.min_rest_period_minutes ?? 660),
      grace_period_in_minutes: Number(companyPolicyVersion?.grace_period_in_minutes ?? 15),
      early_departure_grace_minutes: Number(companyPolicyVersion?.early_departure_grace_minutes ?? 15),
      early_departure_requires_approval: false,
      allow_unscheduled_punch: Boolean(companyPolicyVersion?.allow_unscheduled_punch ?? false),
      overtime_enabled: Boolean(companyPolicyVersion?.overtime_enabled ?? false),
      overtime_min_qualifying_minutes: Number(companyPolicyVersion?.overtime_min_qualifying_minutes ?? 60),
      overtime_rounding_minutes: Number(companyPolicyVersion?.overtime_rounding_minutes ?? 15),
      overtime_requires_approval: Boolean(companyPolicyVersion?.overtime_requires_approval ?? true)
    },
    weekly_off_policy: {
      policy_id: Number(weeklyOffPolicy?.id || weeklyOffPolicyVersion?.policy_id || version.weekly_off_policy_id),
      policy_code: weeklyOffPolicy?.code || "SUN_OFF",
      policy_name: weeklyOffPolicy?.name || "Standard Sunday Weekly Off",
      version_id: Number(weeklyOffPolicyVersion?.id || version.weekly_off_policy_version_id),
      version_number: Number(weeklyOffPolicyVersion?.version_number || 1),
      effective_from: String(weeklyOffPolicyVersion?.effective_from || "2026-01-01").slice(0, 10),
      effective_to: weeklyOffPolicyVersion?.effective_to ? String(weeklyOffPolicyVersion.effective_to).slice(0, 10) : null,
      policy_type: weeklyOffPolicyVersion?.policy_type || "fixed",
      days_of_week: Array.isArray(weeklyOffPolicyVersion?.days_of_week)
        ? weeklyOffPolicyVersion.days_of_week
        : typeof weeklyOffPolicyVersion?.days_of_week === "string"
        ? JSON.parse(weeklyOffPolicyVersion.days_of_week)
        : [0],
      rules_config: weeklyOffPolicyVersion?.rules_config || null
    },
    provenance: {
      tier,
      published_by: publishedBy ? Number(publishedBy) : null,
      published_at: publishedAt,
      migrated_at: tier === "legacy_unrecorded" ? new Date().toISOString() : null
    }
  };

  const payloadHash = generateSnapshotPayloadHash(snapshot);
  snapshot.integrity = {
    algorithm: "SHA-256",
    payload_hash: payloadHash
  };

  return snapshot;
}
