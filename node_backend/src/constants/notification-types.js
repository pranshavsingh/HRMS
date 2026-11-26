export const NOTIFICATION_CATEGORIES = Object.freeze([
  "LEAVE",
  "ATTENDANCE",
  "ROSTER",
  "DOCUMENT",
  "HOLIDAY",
  "SYSTEM",
  "GENERAL",
]);

export const NOTIFICATION_PRIORITIES = Object.freeze([
  "LOW",
  "NORMAL",
  "HIGH",
  "URGENT",
]);

// Allow only safe internal relative application routes for action_url
const ALLOWED_ACTION_PREFIXES = [
  "/dashboard",
  "/attendance",
  "/history",
  "/monthly-register",
  "/leave",
  "/leave-approvals",
  "/attendance-approvals",
  "/team-attendance",
  "/team-analytics",
  "/roster",
  "/shifts",
  "/documents",
  "/employee-documents",
  "/employees",
  "/holidays",
  "/notifications",
  "/profile",
];

/**
 * Validate and sanitize an actionUrl so arbitrary external URLs or javascript: URIs cannot be stored.
 * @param {string|null|undefined} actionUrl
 * @returns {string|null}
 */
export function sanitizeActionUrl(actionUrl) {
  if (!actionUrl || typeof actionUrl !== "string") return null;
  const trimmed = actionUrl.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  const pathOnly = trimmed.split("?")[0].split("#")[0];
  const isAllowed = ALLOWED_ACTION_PREFIXES.some(
    (prefix) => pathOnly === prefix || pathOnly.startsWith(`${prefix}/`)
  );
  return isAllowed ? trimmed.slice(0, 500) : null;
}

export function normalizeCategory(category) {
  const upper = String(category || "GENERAL").trim().toUpperCase();
  return NOTIFICATION_CATEGORIES.includes(upper) ? upper : "GENERAL";
}

export function normalizePriority(priority) {
  const upper = String(priority || "NORMAL").trim().toUpperCase();
  return NOTIFICATION_PRIORITIES.includes(upper) ? upper : "NORMAL";
}
