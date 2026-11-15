import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { hashPassword, verifyPassword, verifyDjangoPassword } from "../../src/utils/auth.js";
import { changePasswordSchema } from "../../src/middleware/validation.js";

describe("P1.1 — Authentication & Password Policy Security Suite", () => {
  describe("Password Policy Validation", () => {
    it("should reject passwords shorter than 12 characters", async () => {
      const shortPasswords = ["pass1", "12345678", "Admin@123", "Short123!"];
      for (const pwd of shortPasswords) {
        const result = changePasswordSchema.safeParse({
          body: { current_password: "OldPassword123!", new_password: pwd }
        });
        assert.equal(result.success, false, `Expected password '${pwd}' to be rejected (< 12 chars)`);
      }
    });

    it("should reject excessively large inputs (> 128 characters) to prevent DoS", async () => {
      const longPassword = "A".repeat(129);
      const result = changePasswordSchema.safeParse({
        body: { current_password: "OldPassword123!", new_password: longPassword }
      });
      assert.equal(result.success, false, "Expected >128 char password to be rejected");
    });

    it("should accept compliant passwords with 12 to 128 characters", async () => {
      const validPasswords = [
        "CorrectHorseBatteryStaple123!",
        "SecurePassword2026!#",
        "A".repeat(12),
        "B".repeat(64),
        "C".repeat(128)
      ];
      for (const pwd of validPasswords) {
        const result = changePasswordSchema.safeParse({
          body: { current_password: "OldPassword123!", new_password: pwd }
        });
        assert.equal(result.success, true, `Expected password '${pwd}' to be accepted`);
      }
    });
  });

  describe("Password Hashing & Legacy PBKDF2 Migration Detection", () => {
    it("should hash new passwords using Bcrypt with 12 rounds", async () => {
      const password = "StrongEnterprisePassword123!";
      const hash = await hashPassword(password);
      assert.match(hash, /^\$2[abxy]\$12\$/, "Expected bcrypt hash with cost factor 12");

      const check = await verifyPassword(password, hash);
      assert.equal(check.valid, true);
      assert.equal(check.isLegacy, false);
    });

    it("should generate unique salts for identical passwords", async () => {
      const password = "SamePasswordAcrossUsers123!";
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);
      assert.notEqual(hash1, hash2, "Identical passwords must produce distinct salt/hash outputs");
    });

    it("should correctly verify and identify legacy Django PBKDF2-SHA256 passwords", async () => {
      // Known Django PBKDF2 hash for 'django_test_pass'
      const salt = "random_django_salt";
      const iterations = 320000;
      const derived = crypto.pbkdf2Sync("django_test_pass", salt, iterations, 32, "sha256").toString("base64");
      const djangoHash = `pbkdf2_sha256$${iterations}$${salt}$${derived}`;

      const validCheck = await verifyPassword("django_test_pass", djangoHash);
      assert.equal(validCheck.valid, true, "Legacy password should verify successfully");
      assert.equal(validCheck.isLegacy, true, "Should be flagged as isLegacy: true for auto-migration");

      const invalidCheck = await verifyPassword("wrong_password", djangoHash);
      assert.equal(invalidCheck.valid, false, "Invalid password against legacy hash must fail");
    });

    it("should reject invalid passwords against Bcrypt hashes", async () => {
      const hash = await hashPassword("ValidPassword123!");
      const check = await verifyPassword("IncorrectPassword123!", hash);
      assert.equal(check.valid, false);
    });
  });
});
