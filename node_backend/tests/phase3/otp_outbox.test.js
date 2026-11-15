import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { db, closePool } from "../../src/db/index.js";
import { accountsService } from "../../src/services/accounts.service.js";
import accountsRepository from "../../src/repositories/accounts.repository.js";
import outboxRepository from "../../src/repositories/outbox.repository.js";
import { encryptPayload, decryptPayload } from "../../src/utils/crypto.js";
import { sendOtpEmailHandler } from "../../src/jobs/handlers/send-otp-email.handler.js";

describe("P3.3 — Transactional OTP Outbox & AES-256-GCM Encryption Test Suite", () => {
  let testUserId;
  let testEmail;
  const createdOutboxIds = [];

  before(async () => {
    const unique = crypto.randomBytes(4).toString("hex");
    testEmail = `otp_test_${unique}@example.com`;

    const res = await db.run(
      `INSERT INTO accounts_user (username, password, first_name, last_name, email, role, is_active, is_staff, is_superuser, date_joined)
       VALUES (?, 'hash123', 'Otp', 'Tester', ?, 'employee', 1, 0, 0, NOW())`,
      [`otp_user_${unique}`, testEmail]
    );
    testUserId = res.lastID;
  });

  after(async () => {
    if (testEmail) {
      await db.run("DELETE FROM password_reset_otp WHERE lower(email) = lower(?)", [testEmail]);
      await db.run("DELETE FROM accounts_user WHERE id = ?", [testUserId]);
    }
    if (createdOutboxIds.length > 0) {
      const placeholders = createdOutboxIds.map(() => "?").join(",");
      await db.run(`DELETE FROM outbox_events WHERE id IN (${placeholders})`, createdOutboxIds);
    }
    await closePool();
  });

  it("should return identical generic message for both valid and non-existent emails", async () => {
    const resValid = await accountsService.requestPasswordResetOtp(testEmail);
    assert.equal(resValid.message, "If this email exists, OTP has been sent.");

    const resInvalid = await accountsService.requestPasswordResetOtp("non_existent_random_user@domain.com");
    assert.equal(resInvalid.message, "If this email exists, OTP has been sent.");
  });

  it("should transactionally create both OTP database record and encrypted outbox event", async () => {
    await accountsService.requestPasswordResetOtp(testEmail);

    // 1. Check password_reset_otp table
    const otpRow = await accountsRepository.findOtpByEmail(testEmail);
    assert.ok(otpRow, "OTP record must exist in database");
    assert.ok(otpRow.otp_hash, "OTP hash must be present");
    assert.equal(otpRow.otp_hash.length, 64, "OTP hash must be 64-char SHA256 string");

    // 2. Check outbox_events table
    const outboxRows = await db.all(
      "SELECT * FROM outbox_events WHERE aggregate_id = ? AND event_type = 'AUTH_PASSWORD_RESET_OTP_REQUESTED' ORDER BY id DESC LIMIT 1",
      [String(testUserId)]
    );
    assert.equal(outboxRows.length, 1, "Exactly one outbox event must be created");
    const outboxEvent = outboxRows[0];
    createdOutboxIds.push(outboxEvent.id);

    assert.equal(outboxEvent.status, "PENDING");
    assert.equal(outboxEvent.aggregate_type, "User");

    // 3. Verify AES-256-GCM payload structure (Zero Plaintext OTP)
    const payload = typeof outboxEvent.payload === "string" ? JSON.parse(outboxEvent.payload) : outboxEvent.payload;
    assert.equal(payload.version, 1);
    assert.ok(payload.iv, "IV must be present");
    assert.ok(payload.authTag, "Auth tag must be present");
    assert.ok(payload.ciphertext, "Ciphertext must be present");

    // Ensure plaintext OTP does not appear in raw payload string
    assert.ok(!JSON.stringify(payload).includes('"otp":"'), "Plaintext OTP must NOT appear in outbox payload");

    // 4. Decrypt and verify contents
    const decrypted = decryptPayload(payload);
    assert.equal(decrypted.email, testEmail.toLowerCase());
    assert.ok(decrypted.otp, "Decrypted payload must contain OTP");
    assert.equal(decrypted.otp.length, 6, "OTP must be 6 digits");
    assert.equal(decrypted.otpHash, otpRow.otp_hash);
  });

  it("should rollback both OTP record and outbox event if transaction fails", async () => {
    const rollbackEmail = `rollback_${Date.now()}@example.com`;
    const encrypted = encryptPayload({ email: rollbackEmail, otp: "999999" });

    await assert.rejects(
      async () => {
        await db.transaction(async (tx) => {
          await accountsRepository.insertOtp(rollbackEmail, "dummy_hash", new Date(Date.now() + 600000), tx);
          await outboxRepository.createEvent({
            eventType: "AUTH_PASSWORD_RESET_OTP_REQUESTED",
            aggregateType: "User",
            aggregateId: "99999",
            payload: encrypted,
            idempotencyKey: `rollback_key_${Date.now()}`
          }, tx);

          // Force failure inside transaction
          throw new Error("Simulated transactional crash");
        });
      },
      /Simulated transactional crash/
    );

    // Verify neither record was committed
    const otpRecord = await accountsRepository.findOtpByEmail(rollbackEmail);
    assert.equal(otpRecord, undefined, "OTP record must NOT be committed on rollback");

    const outboxEvent = await db.get("SELECT * FROM outbox_events WHERE aggregate_id = '99999'");
    assert.equal(outboxEvent, undefined, "Outbox event must NOT be committed on rollback");
  });

  it("should reject tampered ciphertext during decryption", () => {
    const original = { email: "alice@example.com", otp: "555555" };
    const encrypted = encryptPayload(original);

    // Tamper with the last character of ciphertext
    const lastChar = encrypted.ciphertext.slice(-1);
    const tamperedChar = lastChar === "a" ? "b" : "a";
    const tamperedCiphertext = encrypted.ciphertext.slice(0, -1) + tamperedChar;

    const tamperedPayload = {
      ...encrypted,
      ciphertext: tamperedCiphertext
    };

    assert.throws(
      () => decryptPayload(tamperedPayload),
      /authenticity check failed|unsupported payload/i,
      "Decryption must throw when ciphertext is tampered"
    );
  });

  it("should skip email dispatch if OTP has already been consumed or superseded", async () => {
    const unique = crypto.randomBytes(3).toString("hex");
    const email = `stale_${unique}@example.com`;
    const oldHash = "hash_old";
    const newHash = "hash_new";

    // 1. Create a superseded OTP in DB
    await accountsRepository.deleteOtpByEmail(email);
    await accountsRepository.insertOtp(email, newHash, new Date(Date.now() + 600000));

    // Simulated job with old superseded hash
    const fakeJobSuperseded = {
      id: `job_superseded_${unique}`,
      data: {
        outboxEventId: 999,
        eventType: "AUTH_PASSWORD_RESET_OTP_REQUESTED",
        payload: encryptPayload({ email, otp: "111111", otpHash: oldHash })
      },
      attemptsMade: 0,
      opts: { attempts: 5 }
    };

    const resSuperseded = await sendOtpEmailHandler(fakeJobSuperseded);
    assert.equal(resSuperseded.skipped, true);
    assert.equal(resSuperseded.reason, "SUPERSEDED", "Handler must skip sending superseded OTP");

    // 2. Mark OTP as consumed
    await db.run("UPDATE password_reset_otp SET consumed_at = NOW() WHERE email = ?", [email]);

    const fakeJobConsumed = {
      id: `job_consumed_${unique}`,
      data: {
        outboxEventId: 1000,
        eventType: "AUTH_PASSWORD_RESET_OTP_REQUESTED",
        payload: encryptPayload({ email, otp: "222222", otpHash: newHash })
      },
      attemptsMade: 0,
      opts: { attempts: 5 }
    };

    const resConsumed = await sendOtpEmailHandler(fakeJobConsumed);
    assert.equal(resConsumed.skipped, true);
    assert.equal(resConsumed.reason, "ALREADY_CONSUMED", "Handler must skip sending consumed OTP");

    // Cleanup
    await db.run("DELETE FROM password_reset_otp WHERE email = ?", [email]);
    await db.run("DELETE FROM consumer_processed_jobs WHERE job_id LIKE ?", [`%_${unique}`]);
  });
});
