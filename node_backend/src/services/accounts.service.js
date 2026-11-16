import jwt from "jsonwebtoken";
import crypto from "crypto";
import accountsRepository from "../repositories/accounts.repository.js";
import auditRepository from "../repositories/audit.repository.js";
import { realtimeManager } from "../utils/realtime.js";
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
import { parsePagination, formatPaginationResponse } from "../utils/pagination.js";

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
    if (!user.is_active) {
      throw new AppError("Account is inactive. Reactivate it from HR employee management and try again.", 400);
    }

    const verification = await verifyPassword(password, user.password);
    if (!verification.valid) {
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
    
    return {
      access,
      refresh,
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

    // 1. Blacklist access token JTI with safe positive TTL
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
    }

    // 2. Resolve target user and purge session cache and revocation marker
    const targetUserId = reqUser?.id || accessTokenPayload?.userId || tokenRecord?.user_id;
    if (targetUserId) {
      try {
        await redisService.del(`user:session:${targetUserId}`);
        await redisService.set(`user:revoked:${targetUserId}`, Date.now(), 86400);
      } catch (err) {
        logger.warn("[Logout] Session cache purge error: %s", err.message);
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

  async createEmployee(data, files, actor) {
    const {
      username,
      first_name,
      last_name = "",
      email = "",
      role,
      password,
      manager,
      team_name,
      joining_date,
      leave_allotted = 0,
      latitude,
      longitude,
      allowed_radius = 100
    } = data;

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

    const managerId = role === "employee" && manager ? Number(manager) : null;
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

          const relativePath = await storageService.store(f, "documents", userId);
          uploadedPaths.push(relativePath);
          await accountsRepository.insertDocument(title, relativePath, userId, tx);
          uploaded.push(title);
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

      realtimeManager.broadcast("employee_update", { actorId: actor.id });
      return {
        message: `${role[0].toUpperCase()}${role.slice(1)} created successfully`,
        employee: await this.serializeStaffMember(employee.created),
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

      return {
        id: r.id,
        username: r.username,
        first_name: r.first_name,
        last_name: r.last_name,
        name: userFullName,
        email: r.email,
        role: r.role,
        manager: r.manager_username || null,
        manager_id: r.manager_id || null,
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

  async getManagers(query = {}) {
    const { page, limit, offset } = parsePagination(query, 50, 100);
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

  async getEmployees(query = {}) {
    const { page, limit, offset } = parsePagination(query, 50, 100);
    const [total, rows] = await Promise.all([
      accountsRepository.countEmployees(query),
      accountsRepository.findEmployeesPaged({ ...query, limit, offset })
    ]);

    const userIds = rows.map((r) => r.id);
    const [docCountMap, locMap] = await Promise.all([
      accountsRepository.findDocumentCountsByUserIds(userIds),
      accountsRepository.findLocationsByUserIds(userIds)
    ]);

    const data = this.serializeStaffMembersBatch(rows, docCountMap, locMap);
    return formatPaginationResponse(data, total, page, limit, { records: data });
  },

  async getAdminSummary() {
    const [
      userRoleCounts,
      pendingAttendance,
      pendingLeave,
      presentToday,
    ] = await Promise.all([
      db.get(`
        SELECT 
          COUNT(CASE WHEN role IN ('employee','manager','hr') AND is_active=1 THEN 1 END) AS staff,
          COUNT(CASE WHEN role = 'manager' THEN 1 END) AS managers,
          COUNT(CASE WHEN role = 'employee' THEN 1 END) AS employees,
          COUNT(CASE WHEN role = 'hr' THEN 1 END) AS hr
        FROM accounts_user 
        WHERE deleted_at IS NULL
      `),
      db.get("SELECT COUNT(*) c FROM attendance_attendanceapproval WHERE status='pending'"),
      db.get("SELECT COUNT(*) c FROM leave_leave WHERE status='pending'"),
      db.get(
        config.dbClient === "mysql"
          ? `SELECT COUNT(DISTINCT a.user_id) c 
             FROM attendance_attendance a 
             JOIN accounts_user u ON u.id = a.user_id
             WHERE a.date = CURDATE() 
               AND a.status <> 'rejected'
               AND u.role IN ('employee', 'manager', 'hr')`
          : `SELECT COUNT(DISTINCT a.user_id) c 
             FROM attendance_attendance a 
             JOIN accounts_user u ON u.id = a.user_id
             WHERE a.date = date('now', 'localtime')
               AND a.status <> 'rejected'
               AND u.role IN ('employee', 'manager', 'hr')`
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
           WHERE u.deleted_at IS NULL 
             AND a.status <> 'rejected'
             AND a.date = CURDATE()
             AND u.role IN ('employee', 'manager', 'hr')
           ORDER BY a.punch_in_time DESC`
        : `SELECT a.*, u.username, u.role, u.first_name, u.last_name 
           FROM attendance_attendance a 
           JOIN accounts_user u ON u.id = a.user_id 
           WHERE u.deleted_at IS NULL 
             AND a.status <> 'rejected'
             AND a.date = date('now', 'localtime')
             AND u.role IN ('employee', 'manager', 'hr')
           ORDER BY a.punch_in_time DESC`
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

  async updateEmployee(employeeId, data, actor) {
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

    if (data.role && !allowedEditableRoles.includes(data.role)) {
      throw new AppError("You do not have permission to assign this role", 403);
    }

    const oldSerialized = await this.serializeStaffMember(user);

    const updated = await db.transaction(async (tx) => {
      await accountsRepository.updateUser(employeeId, data, tx);
      await accountsRepository.updateProfile(employeeId, data, tx);

      if (data.password) {
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
      const newSerialized = await this.serializeStaffMember(updatedUser, tx);

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

      if (data.password) {
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

      return updatedUser;
    });

    await redisService.del(`user:session:${employeeId}`);
    realtimeManager.broadcast("employee_update", { actorId: actor.id });
    return {
      message: "Employee details updated successfully",
      employee: await this.serializeStaffMember(updated)
    };
  },

  async deleteEmployee(employeeId, actor) {
    const user = await accountsRepository.findById(employeeId);
    
    const allowedDeleteRoles = ["employee", "manager"];
    if (actor.role === "admin") {
      allowedDeleteRoles.push("hr");
    } else if (actor.role === "superadmin") {
      allowedDeleteRoles.push("hr", "admin", "superadmin");
    }

    if (!user || !allowedDeleteRoles.includes(user.role)) {
      throw new AppError("Employee not found or you do not have permission to archive this account type", 404);
    }
    if (user.id === actor.id) {
      throw new AppError("You cannot archive your own account from this page", 400);
    }

    await db.transaction(async (tx) => {
      await accountsRepository.softDeleteUser(employeeId, tx);
      await accountsRepository.softDeleteProfile(employeeId, tx);
      
      await auditService.log(
        actor,
        "archive_employee",
        employeeId.toString(),
        { username: user.username, email: user.email },
        null,
        tx
      );
    });

    await redisService.del(`user:session:${employeeId}`);
    realtimeManager.broadcast("employee_update", { actorId: actor.id });
    return { message: "Employee archived successfully. Documents are kept safe." };
  },

  async deleteDocument(documentId, actor) {
    if (actor.role !== "superadmin") {
      throw new AppError("Only super admin can delete uploaded documents", 403);
    }

    const document = await accountsRepository.findDocumentById(documentId);
    if (!document) {
      throw new AppError("Document not found", 404);
    }

    // Delete actual file from storage/Cloudinary
    await storageService.delete(document.file);

    // Delete record from database
    await db.run("DELETE FROM accounts_employeedocument WHERE id = ?", [documentId]);

    // Log audit activity
    await auditService.log(
      actor,
      "delete_employee_document",
      document.user_id.toString(),
      { title: document.title, file: document.file }
    );

    return { message: "Document deleted successfully" };
  },

  async uploadDocument(data, file, actor) {
    const { user, title } = data;

    if (String(actor.id) !== String(user) && !["admin", "hr", "superadmin"].includes(actor.role)) {
      throw new AppError("You do not have permission to manage documents for this employee", 403);
    }

    const existingDocs = await accountsRepository.findDocumentsByUserId(user);
    const duplicate = existingDocs.find((d) => d.title === title);
    if (duplicate) {
      if (actor.role !== "superadmin") {
        throw new AppError("Only super admin can edit or overwrite uploaded documents", 403);
      }
      await storageService.delete(duplicate.file);
      await db.run("DELETE FROM accounts_employeedocument WHERE id = ?", [duplicate.id]);
    }

    const relativePath = await storageService.store(file, "documents", user);
    
    try {
      await db.transaction(async (tx) => {
        await accountsRepository.insertDocument(title, relativePath, user, tx);
        await auditService.log(
          actor,
          "upload_employee_document",
          user.toString(),
          { title, path: relativePath },
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

    return { message: "Document uploaded" };
  },

  async registerDirectDocument(data, actor) {
    const { user, title, public_id } = data;

    if (String(actor.id) !== String(user) && !["admin", "hr", "superadmin"].includes(actor.role)) {
      throw new AppError("You do not have permission to manage documents for this employee", 403);
    }

    const existingDocs = await accountsRepository.findDocumentsByUserId(user);
    const duplicate = existingDocs.find((d) => d.title === title);
    if (duplicate) {
      if (actor.role !== "superadmin") {
        throw new AppError("Only super admin can edit or overwrite uploaded documents", 403);
      }
      await storageService.delete(duplicate.file);
      await db.run("DELETE FROM accounts_employeedocument WHERE id = ?", [duplicate.id]);
    }

    // Verify metadata on Cloudinary
    const folderPrefix = `employee-documents/${user}`;
    await cloudinaryService.verifyMetadata(public_id, folderPrefix, true);

    const dbPath = `cloudinary://${public_id}`;

    await db.transaction(async (tx) => {
      await accountsRepository.insertDocument(title, dbPath, user, tx);
      await auditService.log(
        actor,
        "register_employee_document",
        user.toString(),
        { title, path: dbPath },
        null,
        tx
      );
    });

    return { message: "Document registered successfully" };
  },

  async getDocumentDetail(id, actor, ipAddress) {
    const document = await accountsRepository.findDocumentById(id);
    if (!document) {
      throw new AppError("Document not found", 404);
    }

    // Role-based Access & IDOR Verification
    const isOwner = Number(actor.id) === Number(document.user_id);
    const isGlobalViewer = ["admin", "hr", "superadmin"].includes(actor.role);

    if (!isOwner && !isGlobalViewer) {
      if (actor.role === "manager") {
        const empProfile = await accountsRepository.findProfileByUserId(document.user_id);
        if (!empProfile || Number(empProfile.manager_id) !== Number(actor.id)) {
          throw new AppError("You do not have permission to view documents for this employee", 403);
        }
      } else {
        throw new AppError("You do not have permission to view this document", 403);
      }
    }

    const fileUrl = storageService.getUrl(document.file);
    if (!fileUrl) {
      throw new AppError("Failed to retrieve document path / file is missing", 404);
    }

    await auditService.log(
      actor,
      "view_employee_document",
      document.user_id.toString(),
      { document_id: document.id, title: document.title, file: document.file },
      ipAddress
    );

    return fileUrl;
  },

  async getMyDocuments(userId, query = {}) {
    const docs = await accountsRepository.findDocumentsByUserId(userId);
    const items = docs.map((d) => ({
      id: d.id,
      title: d.title,
      file: storageService.getUrl(d.file),
      uploaded_at: d.uploaded_at
    }));

    if (query && (query.page || query.limit)) {
      const { page, limit } = parsePagination(query, 50, 100);
      const start = (page - 1) * limit;
      const sliced = items.slice(start, start + limit);
      return formatPaginationResponse(sliced, items.length, page, limit, { records: sliced });
    }

    return items;
  },

  async getEmployeeDocuments(employeeId, actor, query = {}) {
    if (actor) {
      const isOwner = Number(actor.id) === Number(employeeId);
      const isGlobalViewer = ["admin", "hr", "superadmin"].includes(actor.role);

      if (!isOwner && !isGlobalViewer) {
        if (actor.role === "manager") {
          const empProfile = await accountsRepository.findProfileByUserId(employeeId);
          if (!empProfile || Number(empProfile.manager_id) !== Number(actor.id)) {
            throw new AppError("You do not have permission to view documents for this employee", 403);
          }
        } else {
          throw new AppError("You do not have permission to view documents for this employee", 403);
        }
      }
    }

    const docs = await accountsRepository.findDocumentsByUserId(employeeId);
    const items = docs.map((d) => ({
      id: d.id,
      title: d.title,
      file: storageService.getUrl(d.file),
      uploaded_at: d.uploaded_at
    }));

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

    const limit = query.limit ? Number(query.limit) : 50;
    const page = query.page ? Number(query.page) : 1;
    const offset = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      auditRepository.findAuditLogs({
        limit,
        offset,
        search: query.search || "",
        sort: query.sort || "desc",
        startDate: query.start_date || "",
        endDate: query.end_date || "",
        actionType: query.action || ""
      }),
      auditRepository.getAuditLogsCount({
        search: query.search || "",
        startDate: query.start_date || "",
        endDate: query.end_date || "",
        actionType: query.action || ""
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

    const uniqueActions = await db.all("SELECT DISTINCT action FROM audit_logs ORDER BY action ASC");

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

  async serializeStaffMember(user, tx = null) {
    const p = await accountsRepository.findProfileByUserId(user.id, tx);
    const manager = p?.manager_id ? await accountsRepository.findById(p.manager_id, tx) : null;
    const docCount = await accountsRepository.findDocumentCountByUserId(user.id, tx);
    const locations = await accountsRepository.findLocationsByUserId(user.id, tx);
    
    return {
      id: user.id,
      username: user.username,
      first_name: user.first_name,
      last_name: user.last_name,
      name: fullName(user),
      email: user.email,
      role: user.role,
      manager: manager?.username || null,
      manager_id: manager?.id || null,
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
      is_active: Boolean(user.is_active)
    };
  }
};

export default accountsService;
