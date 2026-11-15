import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { storageService } from "../../src/services/storage.service.js";
import { punchSchema, createEmployeeSchema } from "../../src/middleware/validation.js";
import { redactSensitiveData } from "../../src/utils/logger.js";
import { config } from "../../src/config/env.js";

describe("P1.5, P1.6, P1.7 — API Validation, Path Traversal & Log Redaction Suite", () => {
  describe("Path Traversal Security in File Storage", () => {
    it("should prevent directory traversal attacks when deleting files", async () => {
      // Create a dummy file outside mediaRoot (in project root)
      const sensitiveFile = path.resolve(process.cwd(), "test_traversal_canary.txt");
      fs.writeFileSync(sensitiveFile, "CANARY_SENSITIVE_DATA");

      try {
        // Attempt traversal deletion using relative dots
        const maliciousPath = "../../test_traversal_canary.txt";
        await storageService.delete(maliciousPath);

        // Verify that the canary file is NOT deleted
        assert.ok(fs.existsSync(sensitiveFile), "File outside mediaRoot must NOT be deleted via path traversal");
      } finally {
        if (fs.existsSync(sensitiveFile)) {
          fs.unlinkSync(sensitiveFile);
        }
      }
    });
  });

  describe("API Validation & Parameter Bounds", () => {
    it("should reject punch coordinates with invalid latitude or longitude bounds", async () => {
      const invalidCoords = [
        { latitude: 95.0, longitude: 77.0 },  // Lat > 90
        { latitude: -91.0, longitude: 77.0 }, // Lat < -90
        { latitude: 28.0, longitude: 185.0 }, // Lng > 180
        { latitude: 28.0, longitude: -185.0 } // Lng < -180
      ];

      for (const coord of invalidCoords) {
        const result = await punchSchema.safeParseAsync({
          body: coord,
          file: { buffer: Buffer.from("fake_image") }
        });
        assert.equal(result.success, false, `Expected coord ${JSON.stringify(coord)} to fail validation`);
      }
    });

    it("should accept punch coordinates within valid geographical bounds", async () => {
      const validCoord = {
        latitude: "28.6139", // String coerceable
        longitude: "77.2090",
        photo_public_id: "attendance/photo_123"
      };

      const result = await punchSchema.safeParseAsync({
        body: validCoord
      });
      assert.equal(result.success, true, "Valid geographical coordinates must pass schema validation");
    });
  });

  describe("Sensitive Data Deep Log Redaction", () => {
    it("should redact sensitive fields: passwords, tokens, OTPs, and PAN/Aadhaar", () => {
      const logPayload = {
        user: "admin",
        password: "SecretPassword123!",
        new_password: "NewSecretPassword123!",
        otp: "123456",
        token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummyPayload.dummySig",
        details: {
          pan: "ABCDE1234F",
          account_number: "987654321012",
          nested: {
            refresh_token: "sensitive_refresh_hash"
          }
        },
        message: "User logged in with Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz.abc and PAN ABCDE1234F"
      };

      const redacted = redactSensitiveData(null, logPayload);

      assert.equal(redacted.password, "[REDACTED]");
      assert.equal(redacted.new_password, "[REDACTED]");
      assert.equal(redacted.otp, "[REDACTED]");
      assert.equal(redacted.token, "[REDACTED]");
      assert.equal(redacted.details.pan, "[REDACTED]");
      assert.equal(redacted.details.account_number, "[REDACTED]");
      assert.equal(redacted.details.nested.refresh_token, "[REDACTED]");

      // Check regex string pattern redaction in free-text messages
      assert.ok(!redacted.message.includes("ABCDE1234F"), "PAN in log message must be masked");
      assert.match(redacted.message, /\[REDACTED_PAN\]/);
      assert.match(redacted.message, /\[REDACTED_TOKEN\]|\[REDACTED_JWT\]/);
    });
  });
});
