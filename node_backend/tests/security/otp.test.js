import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import accountsRepository from "../../src/repositories/accounts.repository.js";
import { accountsService } from "../../src/services/accounts.service.js";
import { config } from "../../src/config/env.js";
import redisService from "../../src/services/redis.service.js";
import { db, closePool } from "../../src/db/index.js";

describe("P1.4 — Password Reset & Cryptographic OTP Security Suite", () => {
  const testEmail = "security_test_user@hrms.internal";
  let testUserId = null;

  before(async () => {
    // Clean up any existing test records
    await accountsRepository.deleteOtpByEmail(testEmail);

    // Find an active test user or ensure one exists
    let existing = await accountsRepository.findByUsernameOrEmail("hr1") ||
                   await accountsRepository.findByUsernameOrEmail("admin") ||
                   await accountsRepository.findByUsernameOrEmail("hrms");

    if (!existing) {
      // Find any active user
      const users = await db.all("SELECT id, email FROM accounts_user WHERE is_active = 1 LIMIT 1");
      if (users && users.length > 0) {
        existing = users[0];
      }
    }

    assert.ok(existing, "A test user must exist in the database for OTP tests");
    testUserId = existing.id;
  });

  after(async () => {
    await accountsRepository.deleteOtpByEmail(testEmail);
    if (redisService.client) {
      redisService.client.disconnect();
    }
    await closePool();
  });

  describe("Cryptographic OTP Generation & Properties", () => {
    it("should generate cryptographically secure 6-digit OTPs within [100000, 999999]", () => {
      for (let i = 0; i < 100; i++) {
        const otpNum = crypto.randomInt(100000, 1000000);
        assert.ok(otpNum >= 100000 && otpNum <= 999999, `OTP ${otpNum} must be 6 digits within bounds`);
      }
    });

    it("should store only keyed HMAC-SHA256 hashes of OTPs and enforce expiry", async () => {
      const rawOtp = "482910";
      const otpHash = crypto.createHmac("sha256", config.otpSecret).update(`${testEmail}:${rawOtp}`).digest("hex");
      const expires = new Date(Date.now() + 10 * 60 * 1000);

      await accountsRepository.insertOtp(testEmail, otpHash, expires);

      const row = await accountsRepository.findOtpByEmail(testEmail);
      assert.ok(row);
      assert.equal(row.otp_hash, otpHash, "Stored hash must match HMAC-SHA256");
      assert.notEqual(row.otp_hash, rawOtp, "Raw OTP must never be stored directly");
      assert.equal(row.verified, 0, "Initial OTP state must be unverified (0)");
      assert.equal(row.attempts, 0, "Initial attempts must be 0");
    });
  });

  describe("Attempt Limiting & Lockout Protection", () => {
    it("should lock out verification after 5 failed attempts", async () => {
      const rawOtp = "555111";
      const otpHash = crypto.createHmac("sha256", config.otpSecret).update(`${testEmail}:${rawOtp}`).digest("hex");
      const expires = new Date(Date.now() + 10 * 60 * 1000);

      await accountsRepository.deleteOtpByEmail(testEmail);
      await accountsRepository.insertOtp(testEmail, otpHash, expires);

      // Attempt 1 through 5 with incorrect OTP
      for (let attempt = 1; attempt <= 5; attempt++) {
        let err = null;
        try {
          await accountsService.verifyPasswordResetOtp(testEmail, "000000");
        } catch (e) {
          err = e;
        }
        assert.ok(err);
      }

      // Check DB attempts count
      const row = await accountsRepository.findOtpByEmail(testEmail);
      assert.ok(row.attempts >= 5, "Attempts count must be >= 5 in database");

      // 6th attempt must be rejected with attempt lockout error even if correct OTP is provided
      let lockoutErr = null;
      try {
        await accountsService.verifyPasswordResetOtp(testEmail, rawOtp);
      } catch (e) {
        lockoutErr = e;
      }
      assert.ok(lockoutErr);
      assert.equal(lockoutErr.statusCode, 400);
      assert.match(lockoutErr.message, /Too many invalid attempts/);
    });
  });

  describe("Challenge Verification Gate & Single-Use Consumption", () => {
    it("should REJECT direct password reset attempts without cryptographic reset token", async () => {
      let bypassErr = null;
      try {
        await accountsService.resetPasswordWithOtp(testEmail, null, "BrandNewSecurePassword123!");
      } catch (e) {
        bypassErr = e;
      }

      assert.ok(bypassErr, "Direct reset bypass must be blocked");
      assert.equal(bypassErr.statusCode, 400);
      assert.match(bypassErr.message, /Cryptographic reset token is required/);
    });

    it("should issue single-use reset token upon verification and consume atomically on reset", async () => {
      const user = await accountsRepository.findById(testUserId);
      const email = user.email;

      const validOtp = "654321";
      const otpHash = crypto.createHmac("sha256", config.otpSecret).update(`${email}:${validOtp}`).digest("hex");
      const expires = new Date(Date.now() + 10 * 60 * 1000);

      await accountsRepository.deleteOtpByEmail(email);
      await accountsRepository.insertOtp(email, otpHash, expires);

      // Step 1: Verify OTP
      const verifyResult = await accountsService.verifyPasswordResetOtp(email, validOtp);
      assert.ok(verifyResult.reset_token, "Must issue cryptographic reset_token");
      assert.ok(verifyResult.reset_token.length >= 32, "Reset token must be at least 32 characters");

      // Step 2: Seed a refresh token for this user to test revocation
      const dummyToken = crypto.randomBytes(32).toString("hex");
      const dummyHash = crypto.createHash("sha256").update(dummyToken).digest("hex");
      await accountsRepository.insertRefreshToken(user.id, dummyHash, new Date(Date.now() + 86400000));

      // Step 3: Complete password reset using verified token
      const resetResult = await accountsService.resetPasswordWithOtp(
        email,
        verifyResult.reset_token,
        "SuperSecureResetPassword123!"
      );
      assert.match(resetResult.message, /Password reset successful/);

      // Step 4: Verify OTP record has consumed_at populated
      const afterRow = await accountsRepository.findOtpByEmail(email);
      assert.ok(afterRow && afterRow.consumed_at != null, "OTP record must have consumed_at set");

      // Step 5: Verify refresh token was revoked upon password reset
      const remainingToken = await accountsRepository.findRefreshTokenByHash(dummyHash);
      assert.ok(!remainingToken, "Existing refresh tokens must be revoked upon password reset");

      // Step 6: Verify reset-token replay is strictly blocked (replay protection)
      let replayErr = null;
      try {
        await accountsService.resetPasswordWithOtp(
          email,
          verifyResult.reset_token,
          "AnotherPassword123!"
        );
      } catch (e) {
        replayErr = e;
      }
      assert.ok(replayErr, "Replaying a consumed reset challenge must fail");
      assert.equal(replayErr.statusCode, 400);
      assert.match(replayErr.message, /already consumed/);
    });

    it("should prevent race condition during simultaneous password resets with the same token", async () => {
      const user = await accountsRepository.findById(testUserId);
      const email = user.email;

      const validOtp = "123987";
      const otpHash = crypto.createHmac("sha256", config.otpSecret).update(`${email}:${validOtp}`).digest("hex");
      const expires = new Date(Date.now() + 10 * 60 * 1000);

      await accountsRepository.deleteOtpByEmail(email);
      await accountsRepository.insertOtp(email, otpHash, expires);

      const verifyResult = await accountsService.verifyPasswordResetOtp(email, validOtp);
      const token = verifyResult.reset_token;

      // Launch 2 simultaneous reset requests with the same reset token
      const [res1, res2] = await Promise.allSettled([
        accountsService.resetPasswordWithOtp(email, token, "RacePasswordOne123!"),
        accountsService.resetPasswordWithOtp(email, token, "RacePasswordTwo123!")
      ]);

      const successes = [res1, res2].filter((r) => r.status === "fulfilled");
      const failures = [res1, res2].filter((r) => r.status === "rejected");

      assert.equal(successes.length, 1, "Exactly one concurrent reset request must succeed");
      assert.equal(failures.length, 1, "Exactly one concurrent reset request must be rejected");
      assert.equal(failures[0].reason.statusCode, 400);
      assert.match(failures[0].reason.message, /already consumed/);
    });

    it("should prevent race condition during simultaneous OTP verification attempts", async () => {
      const user = await accountsRepository.findById(testUserId);
      const email = user.email;

      const validOtp = "998877";
      const otpHash = crypto.createHmac("sha256", config.otpSecret).update(`${email}:${validOtp}`).digest("hex");
      const expires = new Date(Date.now() + 10 * 60 * 1000);

      await accountsRepository.deleteOtpByEmail(email);
      await accountsRepository.insertOtp(email, otpHash, expires);

      // Launch 2 simultaneous verify requests with the same OTP
      const [res1, res2] = await Promise.allSettled([
        accountsService.verifyPasswordResetOtp(email, validOtp),
        accountsService.verifyPasswordResetOtp(email, validOtp)
      ]);

      const successes = [res1, res2].filter((r) => r.status === "fulfilled");
      const failures = [res1, res2].filter((r) => r.status === "rejected");

      assert.equal(successes.length, 1, "Exactly one concurrent verification attempt must succeed");
      assert.equal(failures.length, 1, "Concurrent duplicate verification must be rejected");
      assert.equal(failures[0].reason.statusCode, 400);
    });
  });
});
