import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { storageService } from "../../src/services/storage.service.js";
import { punchSchema, createEmployeeSchema } from "../../src/middleware/validation.js";
import { redactSensitiveData } from "../../src/utils/logger.js";
import { config, validateProductionEnv } from "../../src/config/env.js";
import { createApp } from "../../src/app.js";
import auditService from "../../src/services/audit.service.js";
import auditRepository from "../../src/repositories/audit.repository.js";
import redisService from "../../src/services/redis.service.js";
import { closePool } from "../../src/db/index.js";

describe("P1.5, P1.6, P1.7 — API Validation, Path Traversal & Log Redaction Suite", () => {
  after(async () => {
    if (redisService.client) {
      redisService.client.disconnect();
    }
    await closePool();
  });
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

  describe("Production Environment Hardening & Validation", () => {
    it("should reject production boot with missing, short, or placeholder JWT and OTP secrets", () => {
      const invalidEnvs = [
        { JWT_SECRET: "short", OTP_SECRET: "valid_otp_secret_key_with_at_least_32_characters" },
        { JWT_SECRET: "change-me-default-jwt-secret-placeholder-32-chars", OTP_SECRET: "valid_otp_secret_key_with_at_least_32_characters" },
        { JWT_SECRET: "valid_jwt_secret_key_with_at_least_32_characters", OTP_SECRET: "change-me-default-otp-secret-32-chars" },
        { JWT_SECRET: "identical_secret_used_for_both_jwt_and_otp_keys_32", OTP_SECRET: "identical_secret_used_for_both_jwt_and_otp_keys_32" },
      ];

      for (const env of invalidEnvs) {
        const check = validateProductionEnv({
          ...env,
          MYSQL_HOST: "localhost",
          MYSQL_USER: "root",
          MYSQL_PASSWORD: "pwd",
          MYSQL_DATABASE: "hrms",
          CORS_ORIGIN: "https://hrms.company.com"
        });
        assert.equal(check.valid, false, `Expected env ${JSON.stringify(env)} to fail production validation`);
      }
    });

    it("should reject wildcard CORS (*) in production configuration", () => {
      const check = validateProductionEnv({
        JWT_SECRET: "super_secure_prod_jwt_secret_with_32_characters_min",
        OTP_SECRET: "super_secure_prod_otp_secret_with_32_characters_min",
        MYSQL_HOST: "localhost",
        MYSQL_USER: "root",
        MYSQL_PASSWORD: "pwd",
        MYSQL_DATABASE: "hrms",
        CORS_ORIGIN: "*"
      });
      assert.equal(check.valid, false);
      assert.ok(check.errors.some((e) => e.includes("Wildcards (*) are strictly forbidden")));
    });

    it("should accept valid production configuration with strong secrets and explicit allowlist", () => {
      const check = validateProductionEnv({
        JWT_SECRET: "super_secure_prod_jwt_secret_with_32_characters_min",
        OTP_SECRET: "super_secure_prod_otp_secret_with_32_characters_min",
        MYSQL_HOST: "localhost",
        MYSQL_USER: "root",
        MYSQL_PASSWORD: "pwd",
        MYSQL_DATABASE: "hrms",
        CORS_ORIGIN: "https://hrms.company.com,https://admin.hrms.company.com"
      });
      assert.equal(check.valid, true);
      assert.equal(check.errors.length, 0);
    });
  });

  describe("CORS Policy & Origin Validation", () => {
    it("should reject requests from unauthorized origins with HTTP 403 in production mode", async () => {
      const prevEnv = process.env.NODE_ENV;
      const prevCors = config.corsOrigin;
      process.env.NODE_ENV = "production";
      config.corsOrigin = "https://app.hrms.internal";

      const app = createApp();

      // Simulate request with disallowed Origin header
      const res = await new Promise((resolve) => {
        const server = app.listen(0, async () => {
          const port = server.address().port;
          try {
            const resp = await fetch(`http://127.0.0.1:${port}/health/live`, {
              headers: { Origin: "https://evil-attacker.com" }
            });
            server.close(() => resolve(resp));
          } catch (err) {
            server.close(() => resolve({ status: 500, error: err }));
          }
        });
      });

      // Restore env
      process.env.NODE_ENV = prevEnv;
      config.corsOrigin = prevCors;

      assert.equal(res.status, 403, "Requests from unauthorized origins must receive HTTP 403 Forbidden");
    });
  });

  describe("Static Media Route Protection", () => {
    it("should block direct static access to /media/documents with HTTP 403", async () => {
      const app = createApp();
      const res = await new Promise((resolve) => {
        const server = app.listen(0, async () => {
          const port = server.address().port;
          try {
            const resp = await fetch(`http://127.0.0.1:${port}/media/documents/confidential_aadhaar.pdf`);
            const body = await resp.json();
            server.close(() => resolve({ status: resp.status, body }));
          } catch (err) {
            server.close(() => resolve({ status: 500, error: err }));
          }
        });
      });

      assert.equal(res.status, 403, "Direct access to /media/documents must return HTTP 403");
      assert.match(res.body.error, /Direct access to private employee documents is forbidden/);
    });
  });

  describe("Deep Readiness Check & Dependency Failure", () => {
    it("should return HTTP 503 and degraded status when Redis is offline in production", async () => {
      const prevEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      const app = createApp();
      const res = await new Promise((resolve) => {
        const server = app.listen(0, async () => {
          const port = server.address().port;
          try {
            const resp = await fetch(`http://127.0.0.1:${port}/health/ready`);
            const body = await resp.json();
            server.close(() => resolve({ status: resp.status, body }));
          } catch (err) {
            server.close(() => resolve({ status: 500, error: err }));
          }
        });
      });

      process.env.NODE_ENV = prevEnv;

      // In test/local environment where redis is offline or in fallback, production mode must return 503
      if (res.body?.dependencies?.redis?.status === "offline") {
        assert.equal(res.status, 503, "Readiness must return HTTP 503 when Redis is offline in production");
        assert.equal(res.body.status, "degraded");
      }
    });
  });

  describe("Durable Audit Logging", () => {
    it("should re-throw and fail closed when audit logging fails inside a transaction or on CRITICAL actions", async () => {
      const originalLog = auditRepository.log;
      // Simulate database failure during audit write
      auditRepository.log = async () => {
        throw new Error("Simulated audit disk write failure");
      };

      try {
        let errorThrown = null;
        try {
          await auditService.log(
            { id: 1, username: "admin" },
            "SECURITY_ALERT_UNAUTHORIZED_ACCESS",
            "99",
            { ip: "1.2.3.4" },
            "1.2.3.4",
            "CRITICAL"
          );
        } catch (err) {
          errorThrown = err;
        }

        assert.ok(errorThrown, "Critical audit write failure must throw AppError");
        assert.equal(errorThrown.statusCode, 500);
        assert.match(errorThrown.message, /Durable audit logging failed/);
      } finally {
        auditRepository.log = originalLog;
      }
    });
  });
});
