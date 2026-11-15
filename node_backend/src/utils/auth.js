import crypto from "crypto";
import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;

export function fullName(user) {
  const name = `${user.first_name || ""} ${user.last_name || ""}`.trim();
  return name || user.username;
}

/**
 * Verify a legacy Django PBKDF2-SHA256 password hash
 */
export function verifyDjangoPassword(rawPassword, encoded) {
  if (!encoded || !encoded.includes("$")) return false;
  const [algo, iterText, salt, hash] = encoded.split("$");
  if (algo !== "pbkdf2_sha256") return false;
  const iterations = Number(iterText);
  const derived = crypto.pbkdf2Sync(rawPassword, salt, iterations, 32, "sha256").toString("base64");
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(derived));
  } catch {
    return false;
  }
}

/**
 * Enterprise Bcrypt password hashing
 */
export async function hashPassword(rawPassword) {
  return bcrypt.hash(rawPassword, BCRYPT_ROUNDS);
}

/**
 * Universal password verification with legacy auto-migration detection
 * Returns { valid: boolean, isLegacy: boolean }
 */
export async function verifyPassword(rawPassword, storedHash) {
  if (!storedHash) return { valid: false, isLegacy: false };

  // 1. Bcrypt hash check ($2a$, $2b$, $2y$)
  if (storedHash.startsWith("$2a$") || storedHash.startsWith("$2b$") || storedHash.startsWith("$2y$")) {
    const valid = await bcrypt.compare(rawPassword, storedHash);
    return { valid, isLegacy: false };
  }

  // 2. Legacy PBKDF2 hash check
  if (storedHash.startsWith("pbkdf2_sha256$")) {
    const valid = verifyDjangoPassword(rawPassword, storedHash);
    return { valid, isLegacy: true };
  }

  return { valid: false, isLegacy: false };
}

/**
 * Synchronous backward-compatible fallback (hashes with bcrypt sync)
 */
export function makeNodePassword(rawPassword) {
  return bcrypt.hashSync(rawPassword, BCRYPT_ROUNDS);
}
