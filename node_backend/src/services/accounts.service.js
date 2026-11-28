import jwt from "jsonwebtoken";
import crypto from "crypto";
import accountsRepository from "../repositories/accounts.repository.js";
import auditRepository from "../repositories/audit.repository.js";
import { realtimeManager } from "../utils/realtime.js";
import { realtimeService } from "./realtime.service.js";
import auditService from "./audit.service.js";
import storageService from "./storage.service.js";
import outboxRepository from "../repositories/outbox.repository.js";
import { encryptPayload } from "../utils/crypto.js";
import cloudinaryService from "./cloudinary.service.js";
import redisService from "./redis.service.js";
import { config } from "../config/env.js";
import { AppError } from "../middleware/errorHandler.js";
import { fullName, makeNodePassword, verifyDjangoPassword, hashPassword, verifyPassword } from "../utils/auth.js";
import { sendOtpEmail } from "../utils/mailer.js";
import { db } from "../db/index.js";
import logger from "../utils/logger.js";
import {
  parsePagination,
  formatPaginationResponse,
  parseCursorPagination,
  buildKeysetClause,
  formatCursorResponse,
} from "../utils/pagination/index.js";
import { siteService } from "./site.service.js";
import notificationService from "./notification.service.js";

function makeOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

function safeCompare(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function hashOtp(email, otp) {
  return crypto.createHmac("sha256", config.otpSecret).update(`${email}:${otp}`).digest("hex");
}

function expiryDate(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

function dbTimeToIso(dbVal) {
  if (!dbVal) return null;
  if (dbVal instanceof Date) {
    return dbVal.toISOString();
  }
  if (typeof dbVal === "string") {
    if (dbVal.includes("T") || dbVal.includes("Z")) {
      return new Date(dbVal).toISOString();
    }
    return `${dbVal.replace(" ", "T")}Z`;
  }
  return new Date(dbVal).toISOString();
}

function toHours(punchIn, punchOut, status) {
  if (status !== "approved" || !punchIn || !punchOut) return 0;
  const inDate = new Date(dbTimeToIso(punchIn));
  const outDate = new Date(dbTimeToIso(punchOut));
  const diff = (outDate - inDate) / (1000 * 60 * 60);
  return Number(Math.max(0, diff).toFixed(2));
}

export const accountsService = {
  async login(username, password, deviceInfo = {}) {
    const user = await accountsRepository.findByUsernameOrEmail(username);
    if (!user) {
      throw new AppError("Invalid credentials", 400);
    }

    const verification = await verifyPassword(password, user.password);
    if (!verification.valid) {
      throw new AppError("Invalid credentials", 400);
    }

    // BUG-A03: Prevent account enumeration. Only verify active status after valid credentials,
    // and return generic message to avoid disclosing inactive account existence.
    if (!user.is_active) {
      throw new AppError("Invalid credentials", 400);
    }

    // Auto-migrate legacy PBKDF2 hash to enterprise Bcrypt
    if (verification.isLegacy) {
      try {
        const newHash = await hashPassword(password);
        await db.run("UPDATE accounts_user SET password = ? WHERE id = ?", [newHash, user.id]);
        logger.info("[Auth] Auto-migrated user ID %d (%s) password to Bcrypt", user.id, user.username);
      } catch (migrateErr) {
        logger.warn("[Auth] Password auto-migration failed for user %d: %s", user.id, migrateErr.message);
      }
    }

    const resolvedRole = (user.is_superuser === 1 || user.is_superuser === true) ? "superadmin" : user.role;

    const accessJti = crypto.randomUUID();
    const refreshJti = crypto.randomUUID();
    const familyId = crypto.randomUUID();

    const access = jwt.sign(
      { userId: user.id, role: resolvedRole, type: "access" },
      config.jwtSecret,
      { expiresIn: "15m", algorithm: "HS256", jwtid: accessJti, issuer: "hrms-api", audience: "hrms-client" }
    );
    const refresh = jwt.sign(
      { userId: user.id, role: resolvedRole, type: "refresh", familyId },
      config.jwtSecret,
      { expiresIn: "30d", algorithm: "HS256", jwtid: refreshJti, issuer: "hrms-api", audience: "hrms-client" }
    );

    // Hash refresh token for secure database storage
    const refreshHash = crypto.createHash("sha256").update(refresh).digest("hex");
    const refreshExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await accountsRepository.insertRefreshToken(user.id, refreshHash, refreshExpires, deviceInfo, familyId);
    
    const profile = await accountsRepository.findProfileByUserId(user.id);
    let photoPath = profile?.profile_picture;
    if (!photoPath) {
      const photoDoc = await db.get(
        "SELECT file FROM accounts_employeedocument WHERE user_id=? AND (LOWER(title)='photo copy' OR LOWER(title)='photocopy') LIMIT 1",
        [user.id]
      );
      photoPath = photoDoc?.file || null;
    }

    return {
      access,
      refresh,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: resolvedRole,
        first_name: user.first_name,
        last_name: user.last_name,
        profile_picture: photoPath ? storageService.getUrl(photoPath) : null
      }
    };
  },

  async refreshSession(refreshToken, deviceInfo = {}) {
    if (!refreshToken) {
      throw new AppError("Refresh token is required", 400);
    }

    let payload;
    try {
      payload = jwt.verify(refreshToken, config.jwtSecret, {
        algorithms: ["HS256"]
      });
      if (payload.type !== "refresh") {
        throw new Error();
      }
    } catch (err) {
      throw new AppError("Invalid refresh token", 401);
    }

    const refreshHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
    const tokenRecord = await accountsRepository.findRefreshTokenByHash(refreshHash);

    if (!tokenRecord) {
      // Replay Detection / Unknown token presented:
      // If signed validly but not found in DB, token family may be compromised.
      if (payload.familyId) {
        await accountsRepository.revokeRefreshTokenFamily(payload.familyId);
      }
      await accountsRepository.deleteRefreshTokensByUserId(payload.userId);
      await redisService.del(`user:session:${payload.userId}`);
      throw new AppError("Session expired or token reused. Please login again.", 401);
    }

    // Token reuse detection: if token is already revoked, potential theft replay!
    const graceWindowMs = (config.refreshGraceWindowSeconds || 30) * 1000;

    if (tokenRecord.is_revoked === 1 || tokenRecord.is_revoked === true) {
      // Check concurrency grace window:
      const lastActivity = new Date(tokenRecord.last_activity).getTime();
      const nowTime = Date.now();
      if (nowTime - lastActivity < graceWindowMs && tokenRecord.replaced_by_hash) {
        // Concurrency grace window: token was rotated just moments ago (likely concurrent request).
        // Return valid new access token and refresh: null (do not return the dead/revoked refresh token)
        const user = await accountsRepository.findById(payload.userId);
        if (user && user.is_active) {
          const resolvedRole = (user.is_superuser === 1 || user.is_superuser === true) ? "superadmin" : user.role;
          const accessJti = crypto.randomUUID();
          const access = jwt.sign(
            { userId: user.id, role: resolvedRole, type: "access" },
            config.jwtSecret,
            { expiresIn: "15m", algorithm: "HS256", jwtid: accessJti, issuer: "hrms-api", audience: "hrms-client" }
          );
          return {
            access,
            refresh: null,
            concurrent_refresh: true,
            user: {
              id: user.id,
              username: user.username,
              email: user.email,
              role: resolvedRole,
              first_name: user.first_name,
              last_name: user.last_name
            }
          };
        }
      }

      // Replay attack confirmed: Revoke the whole family and disconnect all devices
      logger.warn("[Security] Refresh token reuse detected for user ID %d, family: %s", payload.userId, payload.familyId);
      if (payload.familyId) {
        await accountsRepository.revokeRefreshTokenFamily(payload.familyId);
      }
      await accountsRepository.deleteRefreshTokensByUserId(payload.userId);
      await redisService.del(`user:session:${payload.userId}`);
      await redisService.set(`user:revoked:${payload.userId}`, Date.now(), 86400);
      throw new AppError("Token reuse detected. All sessions in this family revoked.", 401);
    }

    if (new Date(tokenRecord.expires_at) < new Date()) {
      await accountsRepository.deleteRefreshTokenByHash(refreshHash);
      throw new AppError("Refresh token expired. Please login again.", 401);
    }

    const user = await accountsRepository.findById(payload.userId);
    if (!user || !user.is_active) {
      await accountsRepository.deleteRefreshTokenByHash(refreshHash);
      throw new AppError("User account is inactive or not found", 401);
    }

    const resolvedRole = (user.is_superuser === 1 || user.is_superuser === true) ? "superadmin" : user.role;
    const familyId = payload.familyId || tokenRecord.family_id || crypto.randomUUID();

    const accessJti = crypto.randomUUID();
    const newRefreshJti = crypto.randomUUID();

    const access = jwt.sign(
      { userId: user.id, role: resolvedRole, type: "access" },
      config.jwtSecret,
      { expiresIn: "15m", algorithm: "HS256", jwtid: accessJti, issuer: "hrms-api", audience: "hrms-client" }
    );
    const newRefresh = jwt.sign(
      { userId: user.id, role: resolvedRole, type: "refresh", familyId },
      config.jwtSecret,
      { expiresIn: "30d", algorithm: "HS256", jwtid: newRefreshJti, issuer: "hrms-api", audience: "hrms-client" }
    );

    const newRefreshHash = crypto.createHash("sha256").update(newRefresh).digest("hex");
    const newRefreshExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // Rotate refresh token atomically using CAS: mark old as revoked only if currently unrevoked
    let rotationWon = false;
    try {
      await db.transaction(async (tx) => {
        const revResult = await accountsRepository.markRefreshTokenRevoked(refreshHash, newRefreshHash, tx);
        const changes = (typeof revResult === "object" && revResult !== null) ? revResult.changes : revResult;
        if (changes === 0) {
          throw new Error("CONCURRENT_ROTATION_LOST");
        }
        await accountsRepository.insertRefreshToken(user.id, newRefreshHash, newRefreshExpires, {
          deviceId: deviceInfo.deviceId || tokenRecord.device_id,
          deviceName: deviceInfo.deviceName || tokenRecord.device_name,
          platform: deviceInfo.platform || tokenRecord.platform,
          ipAddress: deviceInfo.ipAddress || tokenRecord.ip_address,
        }, familyId, tx);
        rotationWon = true;
      });
    } catch (err) {
      if (err.message === "CONCURRENT_ROTATION_LOST") {
        rotationWon = false;
      } else {
        throw err;
      }
    }

    if (!rotationWon) {
      // Transaction aborted/rolled back. Re-fetch committed record from MySQL to evaluate grace window.
      const reloadedRecord = await accountsRepository.findRefreshTokenByHash(refreshHash);
      if (reloadedRecord) {
        const lastActivity = new Date(reloadedRecord.last_activity).getTime();
        const nowTime = Date.now();
        if (nowTime - lastActivity < graceWindowMs && reloadedRecord.replaced_by_hash) {
          return {
            access,
            refresh: null,
            concurrent_refresh: true,
            user: {
              id: user.id,
              username: user.username,
              email: user.email,
              role: resolvedRole,
              first_name: user.first_name,
              last_name: user.last_name
            }
          };
        }
      }

      // Collided outside grace window or unrotated
      if (payload.familyId) {
        await accountsRepository.revokeRefreshTokenFamily(payload.familyId);
      }
      await accountsRepository.deleteRefreshTokensByUserId(payload.userId);
      await redisService.del(`user:session:${payload.userId}`);
      await redisService.set(`user:revoked:${payload.userId}`, Date.now(), 86400);
      throw new AppError("Token reuse detected. All sessions in this family revoked.", 401);
    }

    return {
      access,
      refresh: newRefresh,
      concurrent_refresh: false,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: resolvedRole,
        first_name: user.first_name,
        last_name: user.last_name
      }
    };
  },

  async logoutSession(refreshToken, accessTokenPayload = null, reqUser = null) {
    let tokenRecord = null;
    let refreshHash = null;

    if (refreshToken) {
      try {
        refreshHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
        tokenRecord = await accountsRepository.findRefreshTokenByHash(refreshHash);
      } catch (err) {
        // Suppress
      }
    }

    // 1. Resolve target user and purge session cache
    const targetUserId = reqUser?.id || accessTokenPayload?.userId || tokenRecord?.user_id;
    if (targetUserId) {
      try {
        await redisService.del(`user:session:${targetUserId}`);
      } catch (err) {
        logger.warn("[Logout] Session cache purge error: %s", err.message);
      }
    }

    // 2. Blacklist access token JTI with safe positive TTL in Redis and persistent DB fallback (BUG-A07)
    if (accessTokenPayload?.jti && accessTokenPayload?.exp) {
      try {
        const remainingSeconds = accessTokenPayload.exp - Math.floor(Date.now() / 1000);
        if (remainingSeconds > 0) {
          const ttl = Math.min(900, Math.max(1, remainingSeconds));
          await redisService.set(`token:blacklist:${accessTokenPayload.jti}`, "1", ttl);
        }
      } catch (err) {
        logger.warn("[Logout] JTI blacklist error: %s", err.message);
      }

      // Persistent database fallback: ensures token is revoked even if Redis is down or restarts
      try {
        const expDate = new Date(accessTokenPayload.exp * 1000);
        await db.run(
          "INSERT IGNORE INTO accounts_revoked_token (jti, user_id, expires_at) VALUES (?, ?, ?)",
          [accessTokenPayload.jti, targetUserId || null, expDate]
        );
      } catch (dbErr) {
        logger.warn("[Logout] DB token blacklist error: %s", dbErr.message);
      }
    }

    // 3. MySQL family revocation and row deletion
    if (tokenRecord) {
      try {
        if (tokenRecord.family_id) {
          await accountsRepository.revokeRefreshTokenFamily(tokenRecord.family_id);
        }
        if (refreshHash) {
          await accountsRepository.deleteRefreshTokenByHash(refreshHash);
        }
      } catch (err) {
        logger.warn("[Logout] DB token deletion error: %s", err.message);
      }
    }

    return { message: "Logged out successfully" };
  },

  async changePassword(userId, currentPassword, newPassword) {
    const user = await accountsRepository.findById(userId);
    if (!user) {
      throw new AppError("User not found", 404);
    }

    const verification = await verifyPassword(currentPassword, user.password);
    if (!verification.valid) {
      throw new AppError("Current password is incorrect", 400);
    }

    if (!newPassword || newPassword.length < 12) {
      throw new AppError("New password must be at least 12 characters", 400);
    }
    if (newPassword.length > 128) {
      throw new AppError("New password must not exceed 128 characters", 400);
    }

    const newHash = await hashPassword(newPassword);

    await db.transaction(async (tx) => {
      await db.run("UPDATE accounts_user SET password = ? WHERE id = ?", [newHash, userId], tx);
      await accountsRepository.deleteRefreshTokensByUserId(userId, tx);
    });

    // Invalidate Redis session cache and record user revocation timestamp
    await redisService.del(`user:session:${userId}`);
    await redisService.set(`user:revoked:${userId}`, Date.now(), 86400);

    return { message: "Password changed successfully. Please login again with your new password." };
  },

  async requestPasswordResetOtp(email) {
    const user = await accountsRepository.findByEmail(email);
    if (!user || !user.is_active) {
      return { message: "If this email exists, OTP has been sent." };
    }

    const otp = makeOtp();
    const otpHash = hashOtp(user.email.toLowerCase(), otp);
    const expires = expiryDate(config.otpExpiryMinutes);
    const idempotencyKey = `otp_request:${user.email.toLowerCase()}:${otpHash}`;

    // Encrypt OTP payload with authenticated AES-256-GCM
    const encryptedPayload = encryptPayload({
      email: user.email.toLowerCase(),
      otp,
      otpHash,
      expiresAt: expires.toISOString(),
      userId: user.id
    });

    // Transactionally persist OTP hash and outbox event atomically
    await db.transaction(async (tx) => {
      await accountsRepository.deleteOtpByEmail(user.email, tx);
      await accountsRepository.insertOtp(user.email, otpHash, expires, tx);
      await outboxRepository.createEvent({
        eventType: "AUTH_PASSWORD_RESET_OTP_REQUESTED",
        aggregateType: "User",
        aggregateId: user.id,
        payload: encryptedPayload,
        idempotencyKey
      }, tx);
    });

    return { message: "If this email exists, OTP has been sent." };
  },

  async verifyPasswordResetOtp(email, otp) {
    const row = await accountsRepository.findOtpByEmail(email);
    if (!row) {
      throw new AppError("Invalid or expired OTP", 400);
    }

    const now = new Date();
    if (new Date(row.expires_at) < now) {
      await accountsRepository.deleteOtpByEmail(email);
      throw new AppError("OTP expired. Request a new one.", 400);
    }

    if (Number(row.attempts || 0) >= 5) {
      throw new AppError("Too many invalid attempts. Request new OTP.", 400);
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");
    const expectedOtpHash = hashOtp(email, otp);

    const verified = await accountsRepository.atomicVerifyOtp(email, expectedOtpHash, resetTokenHash);
    if (!verified) {
      await accountsRepository.incrementOtpAttempts(email);
      throw new AppError("Invalid OTP, expired, or already verified", 400);
    }

    return { message: "OTP verified", reset_token: resetToken };
  },

  async resetPasswordWithOtp(email, resetToken, newPassword) {
    if (!resetToken || typeof resetToken !== "string" || resetToken.length < 32) {
      throw new AppError("Cryptographic reset token is required to reset password", 400);
    }

    if (!newPassword || newPassword.length < 12) {
      throw new AppError("Password must be at least 12 characters", 400);
    }
    if (newPassword.length > 128) {
      throw new AppError("Password must not exceed 128 characters", 400);
    }

    const user = await accountsRepository.findByEmail(email);
    if (!user) {
      throw new AppError("User not found", 400);
    }

    const resetTokenHash = crypto.createHash("sha256").update(resetToken).digest("hex");
    const passwordHash = await hashPassword(newPassword);

    await db.transaction(async (tx) => {
      const consumed = await accountsRepository.atomicConsumeResetToken(email, resetTokenHash, tx);
      if (!consumed) {
        throw new AppError("Invalid, expired, unverified, or already consumed reset token", 400);
      }
      await db.run("UPDATE accounts_user SET password = ? WHERE id = ?", [passwordHash, user.id], tx);
      await accountsRepository.deleteRefreshTokensByUserId(user.id, tx);
    });

    await redisService.del(`user:session:${user.id}`);
    await redisService.set(`user:revoked:${user.id}`, Date.now(), 86400);

    return { message: "Password reset successful" };
  },

  async createEmployee(data, files, actor, tenantId = 1) {
    const username = data.username ? String(data.username).trim() : "";
    const first_name = data.first_name ? String(data.first_name).trim() : "";
    const last_name = data.last_name ? String(data.last_name).trim() : "";
    const email = data.email ? String(data.email).trim() : "";
    const role = data.role;
    const password = data.password;
    const manager = data.manager;
    const team_name = data.team_name ? String(data.team_name).trim() : null;
    const joining_date = data.joining_date;
    const leave_allotted = data.leave_allotted || 0;
    const latitude = data.latitude;
    const longitude = data.longitude;
    const allowed_radius = data.allowed_radius || 100;

    if (actor.role === "hr") {
      if (!["employee", "manager"].includes(role)) {
        throw new AppError("HR can only create employee and manager accounts", 403);
      }
    } else if (actor.role === "admin") {
      if (!["employee", "manager", "hr"].includes(role)) {
        throw new AppError("Admin can only create employee, manager, and hr accounts", 403);
      }
    } else if (actor.role === "superadmin") {
      // Superadmin can create any role
    } else {
      throw new AppError("You do not have permission to create accounts", 403);
    }

    const targetSiteId = data.site_id ? Number(data.site_id) : 1;
    if (data.site_id) {
      const siteScope = await siteService.getSiteScope(tenantId, actor, data.site_id);
      if (!siteScope.siteIds?.includes(Number(data.site_id)) && !siteService.isGlobalRole(actor.role)) {
        throw new AppError("You do not have access to the selected site", 403);
      }
    }

    const hasFiles = files && typeof files === "object" && Object.keys(files).length > 0;
    const photoList = files?.photo_copy || files?.photo_file;
    const photoFile = photoList && photoList.length > 0 ? photoList[0] : null;
    if (hasFiles && !photoFile) {
      throw new AppError("Photo Copy document is required", 400);
    }

    const managerId = role === "employee" && manager ? Number(manager) : null;
    if (managerId) {
      const mgr = await db.get(
        "SELECT u.id FROM accounts_user u JOIN workforce_user_tenant wut ON wut.user_id = u.id AND wut.tenant_id = ? WHERE u.id = ? AND u.role = 'manager' AND u.is_active = 1 AND u.deleted_at IS NULL",
        [tenantId, managerId]
      );
      if (!mgr) {
        throw new AppError("Invalid reporting manager selected. The manager must be an active manager in this organization.", 400);
      }
    }
    const teamName = role === "manager" && team_name ? team_name : null;
    const designation = data.designation || null;
    
    let locations = [];
    if (data.locations) {
      try {
        locations = typeof data.locations === "string" ? JSON.parse(data.locations) : data.locations;
      } catch (err) {
        // ignore parsing error
      }
    }

    const uploadedPaths = [];
    try {
      const passwordHash = await hashPassword(password);
      const employee = await db.transaction(async (tx) => {
        const userId = await accountsRepository.insertUser(passwordHash, username, first_name, last_name, email, role, tx);
        await db.run(
          "INSERT INTO workforce_user_tenant (tenant_id, user_id, role, is_active) VALUES (?, ?, ?, 1)",
          [tenantId, userId, role], tx
        );
        
        await accountsRepository.insertProfile(
          latitude,
          longitude,
          allowed_radius,
          managerId,
          userId,
          teamName,
          joining_date,
          leave_allotted,
          designation,
          tx
        );

        if (["employee", "manager", "hr"].includes(role)) {
          await siteService.assignEmployee(tenantId, userId, targetSiteId, undefined, actor, tx);
        }

        if (locations && locations.length > 0) {
          for (const loc of locations) {
            await accountsRepository.insertLocation(
              userId,
              loc.latitude,
              loc.longitude,
              loc.allowed_radius,
              loc.is_primary,
              tx
            );
          }
        }

        const docs = [
          ["photo_copy", "Photo Copy"],
          ["photo_file", "Photo Copy"],
          ["aadhar_file", "Aadhar Card"],
          ["pan_file", "PAN Card"],
          ["bank_file", "Bank Details"],
          ["cv_file", "CV"],
          ["voter_file", "Voter ID"],
          ["dl_file", "Driving License"]
        ];
        
        const uploaded = [];
        for (const [field, title] of docs) {
          const fList = files ? files[field] : null;
          const f = fList ? fList[0] : null;
          if (!f) continue;
          if (title === "Photo Copy" && uploaded.includes("Photo Copy")) continue;

          const relativePath = await storageService.store(f, "documents", userId);
          uploadedPaths.push(relativePath);
          await accountsRepository.insertDocument(title, relativePath, userId, tx);
          uploaded.push(title);

          if (title === "Photo Copy") {
            await db.run("UPDATE accounts_employeeprofile SET profile_picture = ? WHERE user_id = ?", [relativePath, userId], tx);
          }
        }

        await auditService.log(
          actor,
          "create_employee",
          userId.toString(),
          { username, role, uploaded_documents: uploaded },
          null,
          tx
        );

        const created = await accountsRepository.findById(userId, tx);
        return { created, uploaded };
      });

      realtimeManager.broadcast(
        "employee_update",
        { actorId: actor.id, userId: Number(employee.created?.id), action: "created" },
        { tenantId, targetRoles: ["hr", "admin", "superadmin", "manager"], targetUserIds: [Number(employee.created?.id)] }
      );
      return {
        message: `${role[0].toUpperCase()}${role.slice(1)} created successfully`,
        employee: await this.serializeStaffMember(employee.created, null, tenantId),
        uploaded_documents: employee.uploaded
      };
    } catch (err) {
      // rollback uploaded Cloudinary files to prevent orphan files
      for (const path of uploadedPaths) {
        try {
          await storageService.delete(path);
        } catch (cleanupErr) {
          logger.error("Failed to clean up uploaded asset %s during rollback: %s", path, cleanupErr.message);
        }
      }
      throw err;
    }
  },

  serializeStaffMembersBatch(rows, docCountMap, locMap) {
    return rows.map((r) => {
      const uid = Number(r.id);
      const docCount = docCountMap.get(uid) || 0;
      const locations = locMap.get(uid) || [];
      const managerName = r.manager_username
        ? `${r.manager_first_name || ""} ${r.manager_last_name || ""}`.trim() || r.manager_username
        : null;
      const userFullName = `${r.first_name || ""} ${r.last_name || ""}`.trim() || r.username;

      const photoPath = r.profile_picture || r.photo_copy_file;

      return {
        id: r.id,
        site_id: r.site_id == null ? null : Number(r.site_id),
        username: r.username,
        first_name: r.first_name,
        last_name: r.last_name,
        name: userFullName,
        email: r.email,
        role: r.role,
        profile_picture: photoPath ? storageService.getUrl(photoPath) : null,
        manager: r.manager_username || null,
        manager_id: r.manager_id || null,
        manager_name: managerName,
        team_name: r.team_name || null,
        joining_date: r.joining_date || null,
        leave_allotted: r.leave_allotted || 0,
        document_count: docCount,
        is_active_employee: Boolean(r.is_active && (r.is_active_employee === null || r.is_active_employee === 1 || r.is_active_employee === true)),
        latitude: r.latitude ?? null,
        longitude: r.longitude ?? null,
        allowed_radius: r.allowed_radius ?? 100,
        designation: r.designation ?? null,
        locations: locations.map((l) => ({
          id: l.id,
          user_id: l.user_id,
          latitude: l.latitude,
          longitude: l.longitude,
          allowed_radius: l.allowed_radius,
          is_primary: Boolean(l.is_primary),
        })),
      };
    });
  },

  async getManagers(query = {}, tenantId = null, actor = null) {
    const managerQuery = { ...query };
    delete managerQuery.site_id; // Work Site is strictly an informational tag/filter and must not restrict manager eligibility
    if (tenantId && actor) {
      const staff = await this.getEmployees({ ...managerQuery, role: "manager", limit: managerQuery.limit || 1000 }, tenantId, actor);
      const managers = staff.data.map((m) => ({ id: m.id, username: m.username, email: m.email, name: fullName(m), team_name: m.team_name, site_id: m.site_id }));
      return formatPaginationResponse(managers, staff.pagination.total, staff.pagination.page, staff.pagination.limit, { records: managers });
    }
    const { page, limit, offset } = parsePagination(managerQuery, 50, 1000);
    const [total, rows] = await Promise.all([
      accountsRepository.countActiveManagers(),
      accountsRepository.findActiveManagersPaged({ limit, offset })
    ]);

    const managers = rows.map((m) => ({
      id: m.id,
      username: m.username,
      email: m.email,
      name: fullName(m),
      team_name: m.team_name
    }));

    return formatPaginationResponse(managers, total, page, limit, { records: managers });
  },

  async getEmployees(query = {}, tenantId = 1, actor = null) {
    const cursorPag = parseCursorPagination(query, {
      defaultLimit: 20,
      maxLimit: 100,
      scope: `employees:${tenantId}`,
    });
    const requested = query.site_id || null;
    const scope = actor ? await siteService.getSiteScope(tenantId, actor, requested) : { siteIds: null, unassigned: false };
    const managerId = (actor && actor.role === "manager") ? actor.id : null;
    const workDate = new Date().toISOString().slice(0, 10);

    if (cursorPag.useCursor) {
      const cursorId = cursorPag.cursorValues ? Number(cursorPag.cursorValues[0]) : null;
      const rows = await accountsRepository.findEmployeesPaged({
        tenantId,
        limit: cursorPag.fetchLimit,
        offset: 0,
        cursorId: cursorId ?? 9007199254740991,
        role: query.role,
        team: query.team,
        search: query.search || query.search_term || "",
        status: query.status,
        siteScope: scope,
        managerId,
        workDate,
      });

      const hasMore = rows.length > cursorPag.limit;
      const slice = hasMore ? rows.slice(0, cursorPag.limit) : rows;
      const pagedUserIds = slice.map((r) => r.id);
      const [docCountMap, locMap] = await Promise.all([
        accountsRepository.findDocumentCountsByUserIds(pagedUserIds),
        accountsRepository.findLocationsByUserIds(pagedUserIds),
      ]);
      const data = this.serializeStaffMembersBatch(slice, docCountMap, locMap);
      const resp = formatCursorResponse(rows, {
        limit: cursorPag.limit,
        scope: `employees:${tenantId}`,
        extractCursorValues: (r) => [Number(r.id)],
      });
      return { ...resp, data, records: data };
    }

    const { page, limit, offset } = parsePagination(query, 50, 10000);

    const [rows, total, metrics, availableTeamsRows, totalDocuments] = await Promise.all([
      accountsRepository.findEmployeesPaged({
        tenantId,
        limit,
        offset,
        role: query.role,
        team: query.team,
        search: query.search || query.search_term || "",
        status: query.status,
        siteScope: scope,
        managerId,
        workDate
      }),
      accountsRepository.countEmployees({
        tenantId,
        role: query.role,
        team: query.team,
        search: query.search || query.search_term || "",
        status: query.status,
        siteScope: scope,
        managerId,
        workDate
      }),
      accountsRepository.getEmployeeMetrics({
        tenantId,
        siteScope: scope,
        managerId,
        workDate
      }),
      accountsRepository.findAvailableTeams({
        tenantId,
        siteScope: scope,
        managerId,
        workDate
      }),
      accountsRepository.countTotalDocuments({
        tenantId,
        siteScope: scope,
        managerId,
        workDate
      })
    ]);

    const pagedUserIds = rows.map((r) => r.id);
    const [docCountMap, locMap] = await Promise.all([
      accountsRepository.findDocumentCountsByUserIds(pagedUserIds),
      accountsRepository.findLocationsByUserIds(pagedUserIds)
    ]);

    const data = this.serializeStaffMembersBatch(rows, docCountMap, locMap);
    const available_teams = availableTeamsRows.map((r) => r.team_name).filter(Boolean);

    return formatPaginationResponse(data, total, page, limit, {
      records: data,
      total_count: total,
      total_documents: totalDocuments,
      active_count: metrics.active,
      inactive_count: metrics.inactive,
      metrics,
      available_teams
    });
  },

  async getAdminSummary(tenantId = 1) {
    const [
      userRoleCounts,
      pendingAttendance,
      pendingLeave,
      presentToday,
    ] = await Promise.all([
      db.get(`
        SELECT 
          COUNT(CASE WHEN u.role IN ('employee','manager','hr') AND u.is_active=1 THEN 1 END) AS staff,
          COUNT(CASE WHEN u.role = 'manager' THEN 1 END) AS managers,
          COUNT(CASE WHEN u.role = 'employee' THEN 1 END) AS employees,
          COUNT(CASE WHEN u.role = 'hr' THEN 1 END) AS hr
        FROM accounts_user u
        JOIN workforce_user_tenant w ON w.user_id = u.id AND w.tenant_id = ? AND w.is_active = 1
        WHERE u.deleted_at IS NULL
      `, [tenantId]),
      db.get(
        `SELECT COUNT(*) c
         FROM attendance_attendanceapproval aa
         JOIN attendance_attendance a ON a.id = aa.attendance_id
         WHERE aa.status = 'pending' AND a.tenant_id = ?`,
        [tenantId]
      ),
      db.get("SELECT COUNT(*) c FROM leave_leave WHERE status='pending' AND tenant_id = ?", [tenantId]),
      db.get(
        config.dbClient === "mysql"
          ? `SELECT COUNT(DISTINCT a.user_id) c 
             FROM attendance_attendance a 
             JOIN accounts_user u ON u.id = a.user_id
             JOIN workforce_user_tenant w ON w.user_id = u.id AND w.tenant_id = ? AND w.is_active = 1
             WHERE a.tenant_id = ?
               AND a.date = CURDATE() 
               AND a.status <> 'rejected'
               AND u.role IN ('employee', 'manager', 'hr')`
          : `SELECT COUNT(DISTINCT a.user_id) c 
             FROM attendance_attendance a 
             JOIN accounts_user u ON u.id = a.user_id
             JOIN workforce_user_tenant w ON w.user_id = u.id AND w.tenant_id = ? AND w.is_active = 1
             WHERE a.tenant_id = ?
               AND a.date = date('now', 'localtime')
               AND a.status <> 'rejected'
               AND u.role IN ('employee', 'manager', 'hr')`,
        [tenantId, tenantId]
      ),
    ]);

    const staffCount = Number(userRoleCounts?.staff || 0);
    const todayPresentCount = Number(presentToday?.c || 0);
    const absentTodayCount = Math.max(0, staffCount - todayPresentCount);

    const todayPresentRecords = await db.all(
      config.dbClient === "mysql"
        ? `SELECT a.*, u.username, u.role, u.first_name, u.last_name 
           FROM attendance_attendance a 
           JOIN accounts_user u ON u.id = a.user_id 
           JOIN workforce_user_tenant w ON w.user_id = u.id AND w.tenant_id = ? AND w.is_active = 1
           WHERE u.deleted_at IS NULL 
             AND a.tenant_id = ?
             AND a.status <> 'rejected'
             AND a.date = CURDATE()
             AND u.role IN ('employee', 'manager', 'hr')
           ORDER BY a.punch_in_time DESC`
        : `SELECT a.*, u.username, u.role, u.first_name, u.last_name 
           FROM attendance_attendance a 
           JOIN accounts_user u ON u.id = a.user_id 
           JOIN workforce_user_tenant w ON w.user_id = u.id AND w.tenant_id = ? AND w.is_active = 1
           WHERE u.deleted_at IS NULL 
             AND a.tenant_id = ?
             AND a.status <> 'rejected'
             AND a.date = date('now', 'localtime')
             AND u.role IN ('employee', 'manager', 'hr')
           ORDER BY a.punch_in_time DESC`,
      [tenantId, tenantId]
    );

    return {
      staff: staffCount,
      managers: Number(userRoleCounts?.managers || 0),
      employees: Number(userRoleCounts?.employees || 0),
      hr: Number(userRoleCounts?.hr || 0),
      pending_attendance_approvals: Number(pendingAttendance?.c || 0),
      pending_leave_requests: Number(pendingLeave?.c || 0),
      present_today: todayPresentCount,
      absent_today: absentTodayCount,
      today_present_employees: todayPresentRecords.map(r => {
        const name = `${r.first_name || ""} ${r.last_name || ""}`.trim() || r.username;
        return {
          employee_name: name,
          username: r.username,
          role: r.role,
          date: r.date,
          status: r.status,
          work_hours: toHours(r.punch_in_time, r.punch_out_time, r.status),
        };
      })
    };
  },

  async updateEmployee(employeeId, data, actor, tenantId = 1) {
    if (
      String(actor.id) === String(employeeId) &&
      (data.is_active_employee === false || data.is_active_employee === 0 || data.is_active === false || data.is_active === 0)
    ) {
      throw new AppError("You cannot deactivate your own account", 400);
    }

    if (data.password !== undefined && data.password !== null && data.password !== "") {
      if (!["admin", "superadmin"].includes(actor.role)) {
        throw new AppError("Only admin and superadmin are authorized to modify employee passwords", 403);
      }
      if (typeof data.password !== "string" || data.password.length < 12 || data.password.length > 128) {
        throw new AppError("Password must be between 12 and 128 characters", 400);
      }
    }

    const user = await accountsRepository.findById(employeeId);
    
    const allowedEditableRoles = ["employee", "manager"];
    if (actor.role === "admin") {
      allowedEditableRoles.push("hr");
    } else if (actor.role === "superadmin") {
      allowedEditableRoles.push("hr", "admin", "superadmin");
    }

    if (!user || !allowedEditableRoles.includes(user.role)) {
      throw new AppError("Employee not found or you do not have permission to edit this account type", 404);
    }

    if (String(actor.id) === String(employeeId) && data.role !== undefined && data.role !== user.role) {
      throw new AppError("You cannot change or demote your own role", 400);
    }

    if (data.username !== undefined && data.username !== null) data.username = String(data.username).trim();
    if (data.first_name !== undefined && data.first_name !== null) data.first_name = String(data.first_name).trim();
    if (data.last_name !== undefined && data.last_name !== null) data.last_name = String(data.last_name).trim();
    if (data.email !== undefined && data.email !== null) data.email = String(data.email).trim();
    if (data.team_name !== undefined && data.team_name !== null) data.team_name = String(data.team_name).trim();
    if (data.designation !== undefined && data.designation !== null) data.designation = String(data.designation).trim();

    const tenantMembership = await db.get("SELECT 1 AS present FROM workforce_user_tenant WHERE tenant_id=? AND user_id=?", [tenantId, employeeId]);
    if (!tenantMembership) throw new AppError("Employee is not part of this organization", 404);
    await siteService.ensureEmployeeVisible(tenantId, actor, employeeId);

    if (data.is_active_employee !== undefined) {
      data.is_active = Boolean(data.is_active_employee);
    }

    if (data.site_id !== undefined && data.site_id !== null) {
      const scope = await siteService.getSiteScope(tenantId, actor, data.site_id);
      if (!siteService.isGlobalRole(actor.role) && !scope.siteIds?.includes(Number(data.site_id))) throw new AppError("You do not have access to the selected site", 403);
    }

    if (data.role && !allowedEditableRoles.includes(data.role)) {
      throw new AppError("You do not have permission to assign this role", 403);
    }

    if (data.manager !== undefined) {
      const managerId = data.manager !== null && data.manager !== "" ? Number(data.manager) : null;
      if (managerId) {
        if (Number(managerId) === Number(employeeId)) {
          throw new AppError("An employee cannot be their own reporting manager", 400);
        }
        const mgr = await db.get(
          "SELECT u.id FROM accounts_user u JOIN workforce_user_tenant wut ON wut.user_id = u.id AND wut.tenant_id = ? WHERE u.id = ? AND u.role = 'manager' AND u.is_active = 1 AND u.deleted_at IS NULL",
          [tenantId, managerId]
        );
        if (!mgr) {
          throw new AppError("Invalid reporting manager selected. The manager must be an active manager in this organization.", 400);
        }
      }
    }

    const oldSerialized = await this.serializeStaffMember(user, null, tenantId);

    const updated = await db.transaction(async (tx) => {
      if (data.role !== undefined) {
        await db.run("UPDATE workforce_user_tenant SET role=? WHERE tenant_id=? AND user_id=?", [data.role, tenantId, employeeId], tx);
      }
      if (data.is_active_employee !== undefined) {
        await db.run("UPDATE workforce_user_tenant SET is_active=? WHERE tenant_id=? AND user_id=?", [data.is_active_employee ? 1 : 0, tenantId, employeeId], tx);
      }
      let assignedSiteId = await siteService.getEmployeeSiteId(tenantId, employeeId, new Date().toISOString().slice(0, 10), tx);
      if (data.site_id !== undefined && data.site_id !== null) {
        if (Number(assignedSiteId) !== Number(data.site_id)) {
          await siteService.assignEmployee(tenantId, employeeId, Number(data.site_id), undefined, actor, tx);
        }
        assignedSiteId = Number(data.site_id);
      }
      if (data.role !== undefined && !["hr", "manager"].includes(data.role)) {
        // Manager demotion: role changed to non-manager -> remove obsolete manager site access
        await db.run("DELETE FROM workforce_site_access WHERE tenant_id=? AND user_id=?", [tenantId, employeeId], tx);
      }
      await accountsRepository.updateUser(employeeId, data, tx);
      await accountsRepository.updateProfile(employeeId, data, tx);

      if (data.password && ["admin", "superadmin"].includes(actor.role)) {
        const passwordHash = await hashPassword(data.password);
        await db.run("UPDATE accounts_user SET password = ? WHERE id = ?", [passwordHash, employeeId], tx);
      }
      
      if (data.locations !== undefined) {
        let locations = data.locations;
        if (typeof locations === "string") {
          try {
            locations = JSON.parse(locations);
          } catch (e) {
            locations = [];
          }
        }
        await accountsRepository.deleteLocationsByUserId(employeeId, tx);
        if (Array.isArray(locations)) {
          for (const loc of locations) {
            await accountsRepository.insertLocation(
              employeeId,
              loc.latitude,
              loc.longitude,
              loc.allowed_radius,
              loc.is_primary,
              tx
            );
          }
        }
      }

      const updatedUser = await accountsRepository.findById(employeeId, tx);
      const newSerialized = await this.serializeStaffMember(updatedUser, tx, tenantId);

      const diff = {};
      const fieldsToCompare = [
        "username",
        "first_name",
        "last_name",
        "email",
        "role",
        "manager",
        "team_name",
        "joining_date",
        "leave_allotted",
        "is_active_employee",
        "latitude",
        "longitude",
        "allowed_radius",
        "designation",
        "is_active"
      ];

      for (const field of fieldsToCompare) {
        const oldVal = oldSerialized[field];
        const newVal = newSerialized[field];
        if (oldVal !== newVal) {
          const normalizedOld = (oldVal === undefined || oldVal === null) ? "" : oldVal;
          const normalizedNew = (newVal === undefined || newVal === null) ? "" : newVal;
          if (String(normalizedOld) !== String(normalizedNew)) {
            diff[field] = { old: oldVal, new: newVal };
          }
        }
      }

      if (data.password && ["admin", "superadmin"].includes(actor.role)) {
        diff["password"] = { old: "******", new: "******" };
      }

      const oldLocs = oldSerialized.locations || [];
      const newLocs = newSerialized.locations || [];
      const oldLocsStr = JSON.stringify(oldLocs.map(l => ({ lat: l.latitude, lng: l.longitude, rad: l.allowed_radius, pri: l.is_primary })));
      const newLocsStr = JSON.stringify(newLocs.map(l => ({ lat: l.latitude, lng: l.longitude, rad: l.allowed_radius, pri: l.is_primary })));
      if (oldLocsStr !== newLocsStr) {
        diff["locations"] = { old: oldLocs, new: newLocs };
      }
      
      await auditService.log(
        actor,
        "update_employee",
        employeeId.toString(),
        diff,
        null,
        tx
      );

      return { updatedUser, oldManagerId: oldSerialized?.manager_id || null, newManagerId: newSerialized?.manager_id || null, assignmentChanged: Boolean(diff.manager || diff.team_name || diff.is_active || diff.is_active_employee || data.site_id !== undefined) };
    });

    await redisService.del(`user:session:${employeeId}`);
    realtimeManager.broadcast(
      "employee_update",
      { actorId: actor.id, userId: Number(employeeId) },
      { tenantId, targetRoles: ["hr", "admin", "superadmin", "manager"], targetUserIds: [Number(employeeId)] }
    );
    if (updated?.assignmentChanged) {
      const affectedManagers = [updated.oldManagerId, updated.newManagerId].filter(Boolean);
      realtimeService.emitApprovalCountUpdated("attendance", {
        tenantId,
        targetUserIds: affectedManagers,
        actorId: actor.id,
      });
      realtimeService.emitApprovalCountUpdated("leave", {
        tenantId,
        targetUserIds: affectedManagers,
        actorId: actor.id,
      });
    }
    if (data.is_active === false || data.is_active === 0) {
      realtimeService.disconnectUser(Number(employeeId), "Account deactivated");
    }
    return {
      message: "Employee details updated successfully",
      employee: await this.serializeStaffMember(updated.updatedUser, null, tenantId)
    };
  },

  async deleteEmployee(userId, actorUser, tenantId = 1) {
    if (!["admin", "superadmin"].includes(actorUser.role)) {
      throw new AppError("Only admin and superadmin can delete employee records", 403);
    }
    if (Number(userId) === Number(actorUser.id)) {
      throw new AppError("You cannot delete your own account", 400);
    }
    const user = await accountsRepository.findById(userId);
    if (!user) {
      throw new AppError("Employee not found", 404);
    }
    const membership = await db.get(
      "SELECT 1 AS present FROM workforce_user_tenant WHERE tenant_id = ? AND user_id = ? AND is_active = 1",
      [tenantId, userId]
    );
    if (!membership) {
      throw new AppError("Employee not found in this organization", 404);
    }
    await accountsRepository.deleteUser(userId);
    await redisService.del(`user:session:${userId}`);
    await redisService.set(`user:revoked:${userId}`, Date.now(), 86400);
    realtimeManager.broadcast(
      "employee_update",
      { actorId: actorUser.id, userId: Number(userId), action: "deleted" },
      { tenantId, targetRoles: ["hr", "admin", "superadmin", "manager"], targetUserIds: [Number(userId)] }
    );
    realtimeService.disconnectUser(Number(userId), "Account deleted");
    return { success: true };
  },

  async deleteDocument(documentId, actor, tenantId = 1) {
    if (actor.role !== "superadmin") {
      throw new AppError("Only super admin can delete uploaded documents", 403);
    }

    const document = await accountsRepository.findDocumentById(documentId);
    if (!document) {
      throw new AppError("Document not found", 404);
    }
    const membership = await db.get("SELECT 1 AS present FROM workforce_user_tenant WHERE tenant_id=? AND user_id=?", [tenantId, document.user_id]);
    if (!membership) throw new AppError("Document not found in this organization", 404);

    // Delete actual file from storage/Cloudinary
    await storageService.delete(document.file);

    // Delete record from database
    await db.run("DELETE FROM accounts_employeedocument WHERE id = ?", [documentId]);
    if (document.title.toLowerCase() === "photo copy" || document.title.toLowerCase() === "photocopy") {
      await db.run("UPDATE accounts_employeeprofile SET profile_picture = NULL WHERE user_id = ?", [document.user_id]);
    }

    // Log audit activity
    await auditService.log(
      actor,
      "delete_employee_document",
      document.user_id.toString(),
      { title: document.title, file: document.file }
    );

    realtimeManager.broadcast(
      "employee_update",
      { actorId: actor.id, userId: document.user_id },
      { tenantId, targetRoles: ["hr", "admin", "superadmin", "manager"], targetUserIds: [Number(document.user_id)] }
    );
    realtimeManager.broadcast("document_update", {
      actorId: actor.id,
      userId: document.user_id,
      documentId: document.id,
      title: document.title,
      action: "delete"
    }, { tenantId, targetRoles: ["hr", "admin", "superadmin", "manager"], targetUserIds: [Number(document.user_id)] });

    return { message: "Document deleted successfully" };
  },

  async uploadDocument(data, file, actor, tenantId = 1) {
    const { user, title } = data;

    if (String(actor.id) !== String(user) && !["admin", "hr", "superadmin"].includes(actor.role)) {
      throw new AppError("You do not have permission to manage documents for this employee", 403);
    }
    if (String(actor.id) !== String(user)) await siteService.ensureEmployeeVisible(tenantId, actor, user);

    const existingDocs = await accountsRepository.findDocumentsByUserId(user);
    const duplicate = existingDocs.find((d) => d.title === title);
    if (duplicate) {
      if (!["admin", "superadmin"].includes(actor.role)) {
        throw new AppError("Only admin and super admin can edit or overwrite uploaded documents", 403);
      }
    }

    const relativePath = await storageService.store(file, "documents", user);
    
    try {
      await db.transaction(async (tx) => {
        if (duplicate) {
          await db.run("UPDATE accounts_employeedocument SET file=?, uploaded_at=NOW() WHERE id=?", [relativePath, duplicate.id], tx);
        } else {
          await accountsRepository.insertDocument(title, relativePath, user, tx);
        }
        if (title.toLowerCase() === "photo copy" || title.toLowerCase() === "photocopy") {
          await db.run("UPDATE accounts_employeeprofile SET profile_picture = ? WHERE user_id = ?", [relativePath, user], tx);
        }
        await auditService.log(
          actor,
          duplicate ? "replace_employee_document" : "upload_employee_document",
          user.toString(),
          { title, path: relativePath, replacedFile: duplicate ? duplicate.file : null },
          null,
          tx
        );
      });
    } catch (err) {
      try {
        await storageService.delete(relativePath);
      } catch (cleanupErr) {
        logger.error("Failed to clean up uploaded asset %s during rollback: %s", relativePath, cleanupErr.message);
      }
      throw err;
    }

    if (duplicate && duplicate.file) {
      try {
        await storageService.delete(duplicate.file);
      } catch (cloudErr) {
        logger.warn("[Cloudinary] Failed to delete replaced document file %s: %s", duplicate.file, cloudErr.message);
      }
    }

    realtimeManager.broadcast(
      "employee_update",
      { actorId: actor.id, userId: user },
      { tenantId, targetRoles: ["hr", "admin", "superadmin", "manager"], targetUserIds: [Number(user)] }
    );
    realtimeManager.broadcast("document_update", {
      actorId: actor.id,
      userId: user,
      title,
      action: duplicate ? "replace" : "upload"
    }, { tenantId, targetRoles: ["hr", "admin", "superadmin", "manager"], targetUserIds: [Number(user)] });
    void notificationService.safeNotify(async () => {
      if (String(actor.id) !== String(user)) {
        await notificationService.createNotification({
          tenantId,
          recipientId: Number(user),
          actorId: actor.id,
          type: "document:uploaded",
          category: "DOCUMENT",
          title: "Document Added",
          message: `Your compliance document "${title}" has been ${duplicate ? "updated" : "uploaded"} by HR/Admin.`,
          actionUrl: "/documents",
          priority: "NORMAL",
        });
      }
    });

    return { message: "Document uploaded" };
  },

  async registerDirectDocument(data, actor, tenantId = 1) {
    const { user, title, public_id } = data;

    if (String(actor.id) !== String(user) && !["admin", "hr", "superadmin"].includes(actor.role)) {
      throw new AppError("You do not have permission to manage documents for this employee", 403);
    }
    if (String(actor.id) !== String(user)) await siteService.ensureEmployeeVisible(tenantId, actor, user);

    const existingDocs = await accountsRepository.findDocumentsByUserId(user);
    const duplicate = existingDocs.find((d) => d.title === title);
    if (duplicate) {
      if (!["admin", "superadmin"].includes(actor.role)) {
        throw new AppError("Only admin and super admin can edit or overwrite uploaded documents", 403);
      }
    }

    // Verify metadata on Cloudinary
    const folderPrefix = `employee-documents/${user}`;
    await cloudinaryService.verifyMetadata(public_id, folderPrefix, true);

    const dbPath = `cloudinary://${public_id}`;

    await db.transaction(async (tx) => {
      if (duplicate) {
        await db.run("UPDATE accounts_employeedocument SET file = ?, uploaded_at = NOW() WHERE id = ?", [dbPath, duplicate.id], tx);
      } else {
        await accountsRepository.insertDocument(title, dbPath, user, tx);
      }
      if (title.toLowerCase() === "photo copy" || title.toLowerCase() === "photocopy") {
        await db.run("UPDATE accounts_employeeprofile SET profile_picture = ? WHERE user_id = ?", [dbPath, user], tx);
      }
      await auditService.log(
        actor,
        duplicate ? "replace_employee_document" : "register_employee_document",
        user.toString(),
        { title, path: dbPath, replacedFile: duplicate ? duplicate.file : null },
        null,
        tx
      );
    });

    if (duplicate && duplicate.file) {
      try {
        await storageService.delete(duplicate.file);
      } catch (cloudErr) {
        logger.warn("[Cloudinary] Failed to delete replaced document file %s: %s", duplicate.file, cloudErr.message);
      }
    }

    realtimeManager.broadcast(
      "employee_update",
      { actorId: actor.id, userId: user },
      { tenantId, targetRoles: ["hr", "admin", "superadmin", "manager"], targetUserIds: [Number(user)] }
    );
    realtimeManager.broadcast("document_update", {
      actorId: actor.id,
      userId: user,
      title,
      action: duplicate ? "replace" : "upload"
    }, { tenantId, targetRoles: ["hr", "admin", "superadmin", "manager"], targetUserIds: [Number(user)] });
    void notificationService.safeNotify(async () => {
      if (String(actor.id) !== String(user)) {
        await notificationService.createNotification({
          tenantId,
          recipientId: Number(user),
          actorId: actor.id,
          type: "document:uploaded",
          category: "DOCUMENT",
          title: "Document Registered",
          message: `Your compliance document "${title}" has been ${duplicate ? "updated" : "registered"} by HR/Admin.`,
          actionUrl: "/documents",
          priority: "NORMAL",
        });
      }
    });

    return { message: "Document registered successfully" };
  },

  async getDocumentDetail(id, actor, ipAddress, tenantId = 1, options = {}) {
    const document = await accountsRepository.findDocumentById(id);
    if (!document) {
      throw new AppError("Document not found", 404);
    }

    // Role-based Access & IDOR Verification
    const isOwner = Number(actor.id) === Number(document.user_id);
    await siteService.ensureEmployeeVisible(tenantId, actor, document.user_id, { requireDirectReport: actor.role === "manager" });
    const isGlobalViewer = ["admin", "superadmin"].includes(actor.role);
    const isHr = actor.role === "hr";

    if (!isOwner && !isGlobalViewer && !isHr) {
      if (actor.role === "manager") {
        const empProfile = await accountsRepository.findProfileByUserId(document.user_id);
        if (!empProfile || Number(empProfile.manager_id) !== Number(actor.id)) {
          throw new AppError("You do not have permission to view documents for this employee", 403);
        }
      } else {
        throw new AppError("You do not have permission to view this document", 403);
      }
    }

    const fileUrl = storageService.getUrl(document.file, options);
    if (!fileUrl) {
      throw new AppError("Failed to retrieve document path / file is missing", 404);
    }

    const auditAction = (options.attachment || options.download) ? "download_employee_document" : "view_employee_document";
    await auditService.log(
      actor,
      auditAction,
      document.user_id.toString(),
      { document_id: document.id, title: document.title, file: document.file },
      ipAddress
    );

    return fileUrl;
  },

  async getMyDocuments(userId, query = {}) {
    const mapDoc = (d) => ({
      id: d.id,
      title: d.title,
      file: storageService.getUrl(d.file),
      download_url: storageService.getUrl(d.file, { attachment: true }),
      uploaded_at: d.uploaded_at,
    });

    const cursorPag = parseCursorPagination(query || {}, {
      defaultLimit: 20,
      maxLimit: 100,
      scope: `my_docs:${userId}`,
    });
    if (cursorPag.useCursor) {
      const keyset = buildKeysetClause({
        primaryCol: "uploaded_at",
        idCol: "id",
        cursorValues: cursorPag.cursorValues,
        direction: "DESC",
      });
      const whereParts = ["user_id = ?"];
      const sqlParams = [userId];
      if (keyset.sql) {
        whereParts.push(keyset.sql);
        sqlParams.push(...keyset.params);
      }
      const rows = await db.all(
        `SELECT id, title, file, uploaded_at FROM accounts_employeedocument
         WHERE ${whereParts.join(" AND ")}
         ORDER BY uploaded_at DESC, id DESC
         LIMIT ?`,
        [...sqlParams, cursorPag.fetchLimit]
      );
      const resp = formatCursorResponse(rows, {
        limit: cursorPag.limit,
        scope: `my_docs:${userId}`,
        extractCursorValues: (d) => [d.uploaded_at instanceof Date ? d.uploaded_at.toISOString().slice(0, 19).replace("T", " ") : String(d.uploaded_at), Number(d.id)],
        mapItem: mapDoc,
      });
      return { ...resp, records: resp.data };
    }

    const docs = await accountsRepository.findDocumentsByUserId(userId);
    const items = docs.map(mapDoc);

    if (query && (query.page || query.limit)) {
      const { page, limit } = parsePagination(query, 50, 100);
      const start = (page - 1) * limit;
      const sliced = items.slice(start, start + limit);
      return formatPaginationResponse(sliced, items.length, page, limit, { records: sliced });
    }

    return items;
  },

  async getEmployeeDocuments(employeeId, actor, query = {}, tenantId = 1) {
    if (actor) {
      const isOwner = Number(actor.id) === Number(employeeId);
      const isGlobalViewer = ["admin", "superadmin"].includes(actor.role);
      const isHr = actor.role === "hr";

      if (!isOwner && !isGlobalViewer && !isHr) {
        if (actor.role === "manager") {
          const empProfile = await accountsRepository.findProfileByUserId(employeeId);
          if (!empProfile || Number(empProfile.manager_id) !== Number(actor.id)) {
            throw new AppError("You do not have permission to view documents for this employee", 403);
          }
        } else {
          throw new AppError("You do not have permission to view documents for this employee", 403);
        }
      }
      await siteService.ensureEmployeeVisible(tenantId, actor, employeeId, { requireDirectReport: actor.role === "manager" });
    }

    const mapDoc = (d) => ({
      id: d.id,
      title: d.title,
      file: storageService.getUrl(d.file),
      download_url: storageService.getUrl(d.file, { attachment: true }),
      uploaded_at: d.uploaded_at,
    });

    const cursorPag = parseCursorPagination(query || {}, {
      defaultLimit: 20,
      maxLimit: 100,
      scope: `emp_docs:${employeeId}`,
    });
    if (cursorPag.useCursor) {
      const keyset = buildKeysetClause({
        primaryCol: "uploaded_at",
        idCol: "id",
        cursorValues: cursorPag.cursorValues,
        direction: "DESC",
      });
      const whereParts = ["user_id = ?"];
      const sqlParams = [employeeId];
      if (keyset.sql) {
        whereParts.push(keyset.sql);
        sqlParams.push(...keyset.params);
      }
      const rows = await db.all(
        `SELECT id, title, file, uploaded_at FROM accounts_employeedocument
         WHERE ${whereParts.join(" AND ")}
         ORDER BY uploaded_at DESC, id DESC
         LIMIT ?`,
        [...sqlParams, cursorPag.fetchLimit]
      );
      const resp = formatCursorResponse(rows, {
        limit: cursorPag.limit,
        scope: `emp_docs:${employeeId}`,
        extractCursorValues: (d) => [d.uploaded_at instanceof Date ? d.uploaded_at.toISOString().slice(0, 19).replace("T", " ") : String(d.uploaded_at), Number(d.id)],
        mapItem: mapDoc,
      });
      return { ...resp, records: resp.data };
    }

    const docs = await accountsRepository.findDocumentsByUserId(employeeId);
    const items = docs.map(mapDoc);

    if (query && (query.page || query.limit)) {
      const { page, limit } = parsePagination(query, 50, 100);
      const start = (page - 1) * limit;
      const sliced = items.slice(start, start + limit);
      return formatPaginationResponse(sliced, items.length, page, limit, { records: sliced });
    }

    return items;
  },

  async getAuditLogs(actor, query) {
    if (actor.role !== "superadmin") {
      throw new AppError("Only super admin can access audit logs", 403);
    }

    if (query.severity) {
      const sev = String(query.severity).trim().toUpperCase();
      if (!["INFO", "WARNING", "CRITICAL", "ALL", ""].includes(sev)) {
        throw new AppError("Invalid severity filter. Allowed values: INFO, WARNING, CRITICAL.", 400);
      }
    }
    const cleanSeverity = query.severity && query.severity.trim().toUpperCase() !== "ALL"
      ? query.severity.trim().toUpperCase()
      : "";

    const cursorPag = parseCursorPagination(query, {
      defaultLimit: 20,
      maxLimit: 100,
      scope: "audit_logs",
    });

    if (cursorPag.useCursor) {
      const sortDir = String(query.sort || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
      const whereParts = ["1=1"];
      const sqlParams = [];
      if (query.search) {
        const like = `%${String(query.search).trim()}%`;
        whereParts.push("(al.username LIKE ? OR al.action LIKE ? OR al.details LIKE ?)");
        sqlParams.push(like, like, like);
      }
      if (query.action) {
        whereParts.push("al.action = ?");
        sqlParams.push(query.action);
      }
      if (cleanSeverity) {
        whereParts.push("al.severity = ?");
        sqlParams.push(cleanSeverity);
      }
      if (query.start_date) {
        whereParts.push("al.created_at >= ?");
        sqlParams.push(`${query.start_date} 00:00:00`);
      }
      if (query.end_date) {
        whereParts.push("al.created_at <= ?");
        sqlParams.push(`${query.end_date} 23:59:59`);
      }
      const keyset = buildKeysetClause({
        primaryCol: "al.created_at",
        idCol: "al.id",
        cursorValues: cursorPag.cursorValues,
        direction: sortDir,
      });
      if (keyset.sql) {
        whereParts.push(keyset.sql);
        sqlParams.push(...keyset.params);
      }

      const [rows, uniqueActions] = await Promise.all([
        db.all(
          `SELECT al.id, al.user_id, al.username, al.action, al.target_id, al.details, al.ip_address, al.severity, al.created_at,
                  tu.username AS target_username, tu.first_name AS target_first_name, tu.last_name AS target_last_name
           FROM audit_logs al
           LEFT JOIN accounts_user tu ON tu.id = al.target_id
           WHERE ${whereParts.join(" AND ")}
           ORDER BY al.created_at ${sortDir}, al.id ${sortDir}
           LIMIT ?`,
          [...sqlParams, cursorPag.fetchLimit]
        ),
        query.cursor ? Promise.resolve(undefined) : db.all("SELECT DISTINCT action FROM audit_logs WHERE action IS NOT NULL AND action != '' ORDER BY action ASC"),
      ]);

      const mapLog = (log) => {
        let parsedDetails = null;
        if (log.details) {
          try { parsedDetails = JSON.parse(log.details); } catch { parsedDetails = log.details; }
        }
        let targetDisplay = null;
        if (log.target_username) {
          const name = `${log.target_first_name || ""} ${log.target_last_name || ""}`.trim();
          targetDisplay = name ? `${name} (${log.target_username})` : log.target_username;
        }
        return {
          id: log.id, user_id: log.user_id, username: log.username, action: log.action,
          target_id: log.target_id, target_display: targetDisplay, details: parsedDetails,
          ip_address: log.ip_address, severity: log.severity || "INFO", created_at: log.created_at,
        };
      };

      const resp = formatCursorResponse(rows, {
        limit: cursorPag.limit,
        scope: "audit_logs",
        extractCursorValues: (l) => [l.created_at instanceof Date ? l.created_at.toISOString().slice(0, 19).replace("T", " ") : String(l.created_at), Number(l.id)],
        mapItem: mapLog,
        extra: uniqueActions ? { availableActions: uniqueActions.map((a) => a.action) } : {},
      });
      return { ...resp, logs: resp.data };
    }

    const limit = query.limit ? Math.min(Math.max(Number(query.limit), 1), 5000) : 50;
    const page = query.page ? Math.max(Number(query.page), 1) : 1;
    const offset = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      auditRepository.findAuditLogs({
        limit,
        offset,
        search: query.search || "",
        sort: query.sort || "desc",
        startDate: query.start_date || "",
        endDate: query.end_date || "",
        actionType: query.action || "",
        severity: cleanSeverity
      }),
      auditRepository.getAuditLogsCount({
        search: query.search || "",
        startDate: query.start_date || "",
        endDate: query.end_date || "",
        actionType: query.action || "",
        severity: cleanSeverity
      })
    ]);

    const serializedLogs = logs.map(log => {
      let parsedDetails = null;
      if (log.details) {
        try {
          parsedDetails = JSON.parse(log.details);
        } catch (e) {
          parsedDetails = log.details;
        }
      }

      let targetDisplay = null;
      if (log.target_username) {
        const name = `${log.target_first_name || ""} ${log.target_last_name || ""}`.trim();
        targetDisplay = name ? `${name} (${log.target_username})` : log.target_username;
      }

      return {
        id: log.id,
        user_id: log.user_id,
        username: log.username,
        action: log.action,
        target_id: log.target_id,
        target_display: targetDisplay,
        details: parsedDetails,
        ip_address: log.ip_address,
        severity: log.severity || "INFO",
        created_at: log.created_at
      };
    });

    const uniqueActions = await db.all("SELECT DISTINCT action FROM audit_logs WHERE action IS NOT NULL AND action != '' ORDER BY action ASC");

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      data: serializedLogs,
      logs: serializedLogs,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        pages: totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
      availableActions: uniqueActions.map(r => r.action)
    };
  },

  async serializeStaffMember(user, tx = null, tenantId = 1) {
    const p = await accountsRepository.findProfileByUserId(user.id, tx);
    const manager = p?.manager_id ? await accountsRepository.findById(p.manager_id, tx) : null;
    const docCount = await accountsRepository.findDocumentCountByUserId(user.id, tx);
    const locations = await accountsRepository.findLocationsByUserId(user.id, tx);
    
    let photoPath = p?.profile_picture;
    if (!photoPath) {
      const photoDoc = await db.get(
        "SELECT file FROM accounts_employeedocument WHERE user_id=? AND (LOWER(title)='photo copy' OR LOWER(title)='photocopy') LIMIT 1",
        [user.id],
        tx
      );
      photoPath = photoDoc?.file || null;
    }

    return {
      id: user.id,
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,
      name: fullName(user),
      email: user.email,
      role: user.role,
      profile_picture: photoPath ? storageService.getUrl(photoPath) : null,
      manager: manager?.username || null,
      manager_id: manager?.id || null,
      manager_name: manager ? fullName(manager) : null,
      team_name: p?.team_name || null,
      joining_date: p?.joining_date || null,
      leave_allotted: p?.leave_allotted || 0,
      document_count: docCount,
      is_active_employee: Boolean(user.is_active && p?.is_active_employee),
      latitude: p?.latitude ?? null,
      longitude: p?.longitude ?? null,
      allowed_radius: p?.allowed_radius ?? 100,
      designation: p?.designation ?? null,
      locations: locations.map(l => ({
        id: l.id,
        latitude: l.latitude,
        longitude: l.longitude,
        allowed_radius: l.allowed_radius,
        is_primary: Boolean(l.is_primary)
      })),
      is_active: Boolean(user.is_active),
      site_id: await siteService.getEmployeeSiteId(tenantId, user.id)
    };
  }
};

export default accountsService;
