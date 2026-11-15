import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { config } from "../../src/config/env.js";
import { authenticate } from "../../src/middleware/auth.js";
import accountsRepository from "../../src/repositories/accounts.repository.js";
import { accountsService } from "../../src/services/accounts.service.js";
import redisService from "../../src/services/redis.service.js";
import { db, closePool } from "../../src/db/index.js";

describe("P1.2 — JWT & Refresh Token Security Suite", () => {
  after(async () => {
    if (redisService.client) {
      redisService.client.disconnect();
    }
    await closePool();
  });
  describe("Authentication Middleware Controls", () => {
    it("should strictly reject authentication via URL query parameters (?token=)", async () => {
      const validToken = jwt.sign(
        { userId: 1, role: "employee", type: "access" },
        config.jwtSecret,
        { expiresIn: "15m", algorithm: "HS256" }
      );

      const req = {
        headers: {},
        query: { token: validToken }
      };
      let errorThrown = null;
      const next = (err) => { errorThrown = err; };

      await authenticate(req, {}, next);

      assert.ok(errorThrown, "Expected authenticate to call next with an error");
      assert.equal(errorThrown.statusCode, 401);
      assert.equal(errorThrown.message, "Authentication required");
    });

    it("should reject tokens with insecure 'none' algorithm", async () => {
      // Create token with alg: 'none'
      const unsignedHeader = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
      const unsignedPayload = Buffer.from(JSON.stringify({ userId: 1, role: "employee", type: "access" })).toString("base64url");
      const noneToken = `${unsignedHeader}.${unsignedPayload}.`;

      const req = {
        headers: { authorization: `Bearer ${noneToken}` },
        query: {}
      };
      let errorThrown = null;
      const next = (err) => { errorThrown = err; };

      await authenticate(req, {}, next);

      assert.ok(errorThrown);
      assert.equal(errorThrown.statusCode, 401);
      assert.equal(errorThrown.message, "Invalid token");
    });

    it("should reject refresh tokens used in Authorization header for API endpoints", async () => {
      const refreshToken = jwt.sign(
        { userId: 1, role: "employee", type: "refresh" },
        config.jwtSecret,
        { expiresIn: "30d", algorithm: "HS256" }
      );

      const req = {
        headers: { authorization: `Bearer ${refreshToken}` },
        query: {}
      };
      let errorThrown = null;
      const next = (err) => { errorThrown = err; };

      await authenticate(req, {}, next);

      assert.ok(errorThrown);
      assert.equal(errorThrown.statusCode, 401);
      assert.equal(errorThrown.message, "Invalid token type");
    });
  });

  describe("Refresh Token Rotation (RTR) & Session Family Reuse Protection", () => {
    it("should rotate refresh tokens securely on refresh", async () => {
      const userId = 1; // existing active user
      const familyId = crypto.randomUUID();
      const initialRefresh = jwt.sign(
        { userId, role: "admin", type: "refresh", familyId },
        config.jwtSecret,
        { expiresIn: "30d", algorithm: "HS256", jwtid: crypto.randomUUID() }
      );
      const initialHash = crypto.createHash("sha256").update(initialRefresh).digest("hex");
      const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // Seed refresh token in repository
      await accountsRepository.insertRefreshToken(userId, initialHash, expires, { platform: "test" }, familyId);

      // Verify token exists and is not revoked
      const stored = await accountsRepository.findRefreshTokenByHash(initialHash);
      assert.ok(stored);
      assert.equal(stored.is_revoked, 0);

      try {
        const result = await accountsService.refreshSession(initialRefresh, { platform: "test" });
        assert.ok(result.access, "Should return new access token");
        assert.ok(result.refresh, "Should return new refresh token");
        assert.notEqual(result.refresh, initialRefresh, "Rotated refresh token must differ from old one");

        // Old token must be marked as revoked
        const oldTokenRecord = await accountsRepository.findRefreshTokenByHash(initialHash);
        assert.equal(oldTokenRecord.is_revoked, 1, "Old refresh token must be revoked");

        // New token must exist and belong to the same family
        const newHash = crypto.createHash("sha256").update(result.refresh).digest("hex");
        const newTokenRecord = await accountsRepository.findRefreshTokenByHash(newHash);
        assert.ok(newTokenRecord);
        assert.equal(newTokenRecord.family_id, familyId, "New token must preserve session family ID");
        assert.equal(newTokenRecord.is_revoked, 0, "New token must be active");
      } finally {
        await accountsRepository.deleteRefreshTokenByHash(initialHash);
      }
    });

    it("should safely handle concurrent refresh requests during grace window and NOT return revoked refresh token", async () => {
      const userId = 1;
      const familyId = crypto.randomUUID();
      const initialRefresh = jwt.sign(
        { userId, role: "admin", type: "refresh", familyId },
        config.jwtSecret,
        { expiresIn: "30d", algorithm: "HS256", jwtid: crypto.randomUUID() }
      );
      const initialHash = crypto.createHash("sha256").update(initialRefresh).digest("hex");
      const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // Seed refresh token in repository
      await accountsRepository.insertRefreshToken(userId, initialHash, expires, { platform: "test" }, familyId);

      // Request 1: Rotates the token
      const res1 = await accountsService.refreshSession(initialRefresh, { platform: "test" });
      assert.ok(res1.access);
      assert.ok(res1.refresh);

      // Request 2: Concurrent request with the same old token (within grace window)
      const res2 = await accountsService.refreshSession(initialRefresh, { platform: "test" });
      assert.ok(res2.access, "Should return a valid access token during grace window");
      assert.equal(res2.refresh, null, "Must NOT return the revoked refresh token during grace window");
      assert.equal(res2.concurrent_refresh, true, "Must flag concurrent_refresh: true");

      // Cleanup
      await accountsRepository.deleteRefreshTokenByHash(initialHash);
      if (res1.refresh) {
        const h = crypto.createHash("sha256").update(res1.refresh).digest("hex");
        await accountsRepository.deleteRefreshTokenByHash(h);
      }
    });

    it("should detect reuse of a revoked token and revoke the entire family", async () => {
      const userId = 1; // existing active user
      const familyId = crypto.randomUUID();
      const compromisedToken = jwt.sign(
        { userId, role: "admin", type: "refresh", familyId },
        config.jwtSecret,
        { expiresIn: "30d", algorithm: "HS256", jwtid: crypto.randomUUID() }
      );
      const compromisedHash = crypto.createHash("sha256").update(compromisedToken).digest("hex");
      const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // Insert compromised token as already REVOKED (> 20s ago to be outside grace window)
      await accountsRepository.insertRefreshToken(userId, compromisedHash, expires, { platform: "test" }, familyId);
      await accountsRepository.markRefreshTokenRevoked(compromisedHash, "replaced_by_newer_hash");

      // Also insert a legitimate active sibling token in the same family
      const siblingToken = jwt.sign(
        { userId, role: "admin", type: "refresh", familyId },
        config.jwtSecret,
        { expiresIn: "30d", algorithm: "HS256", jwtid: crypto.randomUUID() }
      );
      const siblingHash = crypto.createHash("sha256").update(siblingToken).digest("hex");
      await accountsRepository.insertRefreshToken(userId, siblingHash, expires, { platform: "test" }, familyId);

      // Force last_activity to 30 seconds ago to exceed grace period
      const thirtySecsAgo = new Date(Date.now() - 30000);
      const { db } = await import("../../src/db/index.js");
      await db.run("UPDATE accounts_refreshtoken SET last_activity = ? WHERE token_hash = ?", [thirtySecsAgo, compromisedHash]);

      let errorThrown = null;
      try {
        await accountsService.refreshSession(compromisedToken);
      } catch (err) {
        errorThrown = err;
      }

      assert.ok(errorThrown, "Expected reuse detection to throw error");
      assert.equal(errorThrown.statusCode, 401);
      assert.match(errorThrown.message, /Token reuse detected|Session expired/);

      // Verify that sibling token in the same family is now revoked
      const siblingRecord = await accountsRepository.findRefreshTokenByHash(siblingHash);
      const isInvalidated = !siblingRecord || siblingRecord.is_revoked === 1;
      assert.ok(isInvalidated, "Sibling token in the same family must be invalidated upon replay detection");

      await accountsRepository.deleteRefreshTokenByHash(compromisedHash);
      await accountsRepository.deleteRefreshTokenByHash(siblingHash);
    });
  });
});
