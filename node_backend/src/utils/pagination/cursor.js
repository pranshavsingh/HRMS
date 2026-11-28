import crypto from "crypto";
import { config } from "../../config/env.js";
import { AppError } from "../../middleware/errorHandler.js";

const CURSOR_VERSION = 1;

function signPayload(b64Payload) {
  return crypto
    .createHmac("sha256", config.jwtSecret || "hrms-cursor-secret")
    .update(b64Payload)
    .digest("base64url")
    .slice(0, 16);
}

/**
 * Encode a deterministic composite cursor for stable keyset pagination.
 */
export function encodeCursor(scope, values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  const serialized = JSON.stringify({ v: CURSOR_VERSION, s: scope, val: values });
  const b64 = Buffer.from(serialized, "utf8").toString("base64url");
  const sig = signPayload(b64);
  return `${b64}.${sig}`;
}

/**
 * Decode and cryptographically validate an opaque cursor.
 * Rejects malformed, mismatched-scope, or tampered cursors with 400.
 */
export function decodeCursor(cursorToken, expectedScope) {
  if (!cursorToken || typeof cursorToken !== "string") {
    throw new AppError("Invalid pagination cursor", 400);
  }
  const parts = cursorToken.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new AppError("Invalid pagination cursor format", 400);
  }
  const [b64, sig] = parts;
  const expectedSig = signPayload(b64);
  const sigBuf = Buffer.from(sig, "utf8");
  const expectedBuf = Buffer.from(expectedSig, "utf8");
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    throw new AppError("Tampered or invalid pagination cursor", 400);
  }

  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
  } catch {
    throw new AppError("Malformed pagination cursor", 400);
  }

  if (
    !parsed ||
    parsed.v !== CURSOR_VERSION ||
    parsed.s !== expectedScope ||
    !Array.isArray(parsed.val) ||
    parsed.val.length === 0
  ) {
    throw new AppError("Cursor scope mismatch or expired cursor", 400);
  }

  return parsed.val;
}

/**
 * Parse limit and optional cursor from Express req.query.
 * Enforces defaultLimit=20 and maxLimit=100.
 */
export function parseCursorPagination(query = {}, { defaultLimit = 20, maxLimit = 100, scope = "default" } = {}) {
  let limit = parseInt(query.limit, 10);
  if (isNaN(limit) || limit < 1) {
    limit = defaultLimit;
  } else if (limit > maxLimit) {
    limit = maxLimit;
  }

  const useCursor =
    Boolean(query.cursor) ||
    String(query.cursor_mode || "").toLowerCase() === "true" ||
    String(query.pagination || "").toLowerCase() === "cursor";

  const cursorValues = query.cursor ? decodeCursor(query.cursor, scope) : null;

  return {
    useCursor,
    limit,
    fetchLimit: limit + 1,
    cursorValues,
  };
}

/**
 * Build parameterized SQL WHERE clause for 2-column composite keyset pagination:
 *   ORDER BY primaryCol DIR, idCol DIR
 */
export function buildKeysetClause({ primaryCol, idCol = "id", cursorValues, direction = "DESC" }) {
  if (!cursorValues || cursorValues.length === 0) {
    return { sql: "", params: [] };
  }
  const op = String(direction).toUpperCase() === "ASC" ? ">" : "<";
  if (cursorValues.length === 1) {
    return {
      sql: `${idCol} ${op} ?`,
      params: [cursorValues[0]],
    };
  }
  const [primaryVal, idVal] = cursorValues;
  return {
    sql: `(${primaryCol} ${op} ? OR (${primaryCol} = ? AND ${idCol} ${op} ?))`,
    params: [primaryVal, primaryVal, idVal],
  };
}

/**
 * Format standardized cursor pagination response using limit+1 over-fetch.
 */
export function formatCursorResponse(
  rows = [],
  { limit = 20, scope = "default", extractCursorValues, mapItem = null, extra = {} } = {}
) {
  const hasMore = rows.length > limit;
  const slice = hasMore ? rows.slice(0, limit) : rows;
  const data = typeof mapItem === "function" ? slice.map(mapItem) : slice;
  const lastRaw = slice.length > 0 ? slice[slice.length - 1] : null;
  const nextCursor =
    hasMore && lastRaw && typeof extractCursorValues === "function"
      ? encodeCursor(scope, extractCursorValues(lastRaw))
      : null;

  return {
    success: true,
    data,
    pagination: {
      limit,
      nextCursor,
      hasMore,
      hasNextPage: hasMore,
    },
    ...extra,
  };
}
