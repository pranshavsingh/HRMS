import crypto from "crypto";
import { config } from "../config/env.js";
import { AppError } from "../middleware/errorHandler.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits standard for GCM

/**
 * Derives a 32-byte Buffer key from the configured OUTBOX_ENCRYPTION_KEY or provided key.
 * Accepts:
 * - 64-char hexadecimal string (32 bytes)
 * - 32-byte raw string
 * Fails closed if the key is missing or not 32 bytes.
 */
export function getEncryptionKey(explicitKey = null) {
  let keyStr = explicitKey || config.outboxEncryptionKey || process.env.OUTBOX_ENCRYPTION_KEY;
  if (!keyStr && process.env.NODE_ENV === "test") {
    keyStr = "7e3c3fd7e9992ed3e0827cd4619e8edd4c531353efdf2e751a797378c7741852";
  }
  if (!keyStr) {
    throw new AppError("Outbox payload encryption failed: OUTBOX_ENCRYPTION_KEY is not configured.", 500);
  }

  if (typeof keyStr === "string") {
    // If 64 hex characters (32 bytes encoded in hex)
    if (/^[0-9a-fA-F]{64}$/.test(keyStr)) {
      return Buffer.from(keyStr, "hex");
    }
    // If raw string of at least 32 bytes
    const buf = Buffer.from(keyStr, "utf8");
    if (buf.length >= 32) {
      return buf.subarray(0, 32);
    }
  }

  if (Buffer.isBuffer(keyStr) && keyStr.length === 32) {
    return keyStr;
  }

  throw new AppError("Outbox payload encryption failed: OUTBOX_ENCRYPTION_KEY must be at least 32 bytes (or 64 hex characters).", 500);
}

/**
 * Encrypt a JSON-serializable object using AES-256-GCM.
 * Never logs the plaintext, key, or tag.
 * 
 * @param {object} data - Object to encrypt
 * @param {string|Buffer} [keyOverride=null] - Optional override for testing
 * @returns {object} Formatted payload: { version: 1, iv: "hex", authTag: "hex", ciphertext: "hex" }
 */
export function encryptPayload(data, keyOverride = null) {
  const key = getEncryptionKey(keyOverride);
  const iv = crypto.randomBytes(IV_LENGTH);
  const plaintext = typeof data === "string" ? data : JSON.stringify(data);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let ciphertext = cipher.update(plaintext, "utf8", "hex");
  ciphertext += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return {
    version: 1,
    iv: iv.toString("hex"),
    authTag,
    ciphertext
  };
}

/**
 * Decrypt an AES-256-GCM payload object.
 * 
 * @param {object} encrypted - { version, iv, authTag, ciphertext }
 * @param {string|Buffer} [keyOverride=null] - Optional override for testing
 * @returns {any} Decrypted and parsed JSON data
 */
export function decryptPayload(encrypted, keyOverride = null) {
  if (!encrypted || typeof encrypted !== "object") {
    throw new AppError("Decryption failed: malformed payload object.", 400);
  }

  const { version, iv, authTag, ciphertext } = encrypted;
  if (version !== 1 || !iv || !authTag || !ciphertext) {
    throw new AppError("Decryption failed: unsupported payload version or missing cryptographic components.", 400);
  }

  const key = getEncryptionKey(keyOverride);
  const ivBuf = Buffer.from(iv, "hex");
  const tagBuf = Buffer.from(authTag, "hex");

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuf);
    decipher.setAuthTag(tagBuf);
    let decrypted = decipher.update(ciphertext, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return JSON.parse(decrypted);
  } catch (err) {
    throw new AppError(`Decryption failed: authenticity check failed or data corrupted (${err.message}).`, 400);
  }
}

export default {
  getEncryptionKey,
  encryptPayload,
  decryptPayload
};
