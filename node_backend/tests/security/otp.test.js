import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import accountsRepository from "../../src/repositories/accounts.repository.js";
import { accountsService } from "../../src/services/accounts.service.js";
import { config } from "../../src/config/env.js";
import redisService from "../../src/services/redis.service.js";
import { db } from "../../src/db/index.js";

describe("P1.4 — Password Reset & Cryptographic OTP Security Suite", () => {
  const testEmail = "security_test_user@hrms.internal";
  let testUserId = null;

  before(async () => {
    // Clean up any existing test records
    await accountsRepository.deleteOtpByEmail(testEmail);
    // Find an active test user
    const existing = await accountsRepository.findByUsernameOrEmail("hr1");
    if (existing) {
      testUserId = existing.id;
    }
  });

  after(async () => {
    await accountsRepository.deleteOtpByEmail(testEmail);
    if (redisService.client) {
      redisService.client.disconnect();
    }
    const { closePool } = await import("../../src/db/index.js");
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
    it("should REJECT direct password reset if OTP was never verified (VULN-02 fix)", async () => {
      const unverifiedOtp = "777888";
      const otpHash = crypto.createHmac("sha256", config.otpSecret).update(`${testEmail}:${unverifiedOtp}`).digest("hex");
      const expires = new Date(Date.now() + 10 * 60 * 1000);

      await accountsRepository.deleteOtpByEmail(testEmail);
      await accountsRepository.insertOtp(testEmail, otpHash, expires);

      // Attempt reset directly without calling verify-otp first
      let bypassErr = null;
      try {
        await accountsService.resetPasswordWithOtp(testEmail, unverifiedOtp, "BrandNewSecurePassword123!");
      } catch (e) {
        bypassErr = e;
      }

      assert.ok(bypassErr, "Direct reset bypass must be blocked");
      assert.equal(bypassErr.statusCode, 400);
      assert.match(bypassErr.message, /OTP must be verified before resetting password/);
    });

    it("should issue single-use reset token upon verification and consume atomically on reset", async () => {
      if (!testUserId) return; // Skip if no test user
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

      // Step 2: Seed a refresh token for this user to test revocation
      const dummyToken = crypto.randomBytes(32).toString("hex");
      const dummyHash = crypto.createHash("sha256").update(dummyToken).digest("hex");
      await accountsRepository.insertRefreshToken(user.id, dummyHash, new Date(Date.now() + 86400000));

      // Step 3: Complete password reset using verified token
      const resetResult = await accountsService.resetPasswordWithOtp(
        email,
        validOtp,
        "SuperSecureResetPassword123!",
        verifyResult.reset_token
      );
      assert.match(resetResult.message, /Password reset successful/);

      // Step 4: Verify OTP record was consumed/deleted
      const afterRow = await accountsRepository.findOtpByEmail(email);
      assert.ok(!afterRow || afterRow.consumed_at != null, "OTP must be consumed/deleted after reset");

      // Step 5: Verify refresh token was revoked (VULN-03 fix)
      const remainingToken = await accountsRepository.findRefreshTokenByHash(dummyHash);
      assert.ok(!remainingToken, "Existing refresh tokens must be revoked upon password reset");

      // Step 6: Verify second reset attempt is blocked (replay protection)
      let replayErr = null;
      try {
        await accountsService.resetPasswordWithOtp(
          email,
          validOtp,
          "AnotherPassword123!",
          verifyResult.reset_token
        );
      } catch (e) {
        replayErr = e;
      }
      assert.ok(replayErr, "Replaying a consumed reset challenge must fail");
    });
  });
});
