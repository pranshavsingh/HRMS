/**
 * Isolated Test Entity Seeding and Cleanup Fixtures for HRMS E2E Suite
 */
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { db } from "../../../src/db/index.js";

/**
 * Generate a Django PBKDF2-SHA256 password hash for testing auto-migration
 */
export function makeDjangoPbkdf2Hash(rawPassword, salt = "testsalt123") {
  const iterations = 260000;
  const derived = crypto.pbkdf2Sync(rawPassword, salt, iterations, 32, "sha256").toString("base64");
  return `pbkdf2_sha256$${iterations}$${salt}$${derived}`;
}

/**
 * Creates an isolated test user in MySQL.
 */
export async function createTestUser({
  username = null,
  email = null,
  password = "ValidPassword123!",
  role = "employee",
  firstName = "Test",
  lastName = "User",
  isActive = 1,
  isStaff = 0,
  isSuperuser = 0,
  legacyPbkdf2 = false,
  managerId = null,
  createProfile = true
} = {}) {
  const unique = crypto.randomBytes(4).toString("hex");
  const finalUsername = username || `e2e_u_${unique}`;
  const finalEmail = email || `e2e_${unique}@example.com`;

  let passwordHash;
  if (legacyPbkdf2) {
    passwordHash = makeDjangoPbkdf2Hash(password, `salt_${unique}`);
  } else {
    passwordHash = await bcrypt.hash(password, 12);
  }

  const res = await db.run(
    `INSERT INTO accounts_user 
     (username, password, first_name, last_name, email, role, is_active, is_staff, is_superuser, date_joined) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      finalUsername,
      passwordHash,
      firstName,
      lastName,
      finalEmail,
      role,
      isActive ? 1 : 0,
      isStaff ? 1 : 0,
      isSuperuser ? 1 : 0
    ]
  );

  const userId = res.lastID;

  if (createProfile && role !== "superadmin") {
    try {
      await db.run(
        `INSERT INTO accounts_employeeprofile 
         (user_id, manager_id, is_active_employee, allowed_radius, latitude, longitude) 
         VALUES (?, ?, 1, 500, 28.6139, 77.2090)`,
        [userId, managerId || null]
      );
    } catch (err) {
      // Profile table may have existing or auto-created trigger
    }
  }

  try {
    await db.run(
      "INSERT INTO workforce_user_tenant (tenant_id, user_id, role, is_active) VALUES (1, ?, ?, 1) ON DUPLICATE KEY UPDATE is_active = 1",
      [userId, role]
    );
    await db.run(
      "INSERT INTO workforce_employee_site_assignment (tenant_id, user_id, site_id, effective_from) VALUES (1, ?, 1, '2020-01-01') ON DUPLICATE KEY UPDATE site_id = site_id",
      [userId]
    );
    if (["manager", "hr"].includes(role)) {
      await db.run(
        "INSERT INTO workforce_site_access (tenant_id, user_id, site_id) VALUES (1, ?, 1) ON DUPLICATE KEY UPDATE site_id = site_id",
        [userId]
      );
    }
  } catch (err) {
    // Ignore workforce table errors in disposable test DBs if tables are absent
  }

  return {
    id: userId,
    username: finalUsername,
    email: finalEmail,
    rawPassword: password,
    passwordHash,
    role,
    isActive: !!isActive,
    isSuperuser: !!isSuperuser
  };
}

/**
 * Seeds a refresh token row directly into `accounts_refreshtoken`.
 */
export async function seedRefreshToken({
  userId,
  tokenHash,
  familyId = crypto.randomUUID(),
  isRevoked = 0,
  replacedByHash = null,
  lastActivityOffsetMs = 0, // 0 = now, 20000 = 20s ago
  expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  platform = "web",
  deviceId = null,
  deviceName = null,
  ipAddress = "127.0.0.1"
}) {
  const lastActivityDate = new Date(Date.now() - lastActivityOffsetMs);

  const res = await db.run(
    `INSERT INTO accounts_refreshtoken 
     (user_id, family_id, token_hash, expires_at, is_revoked, replaced_by_hash, created_at, device_id, device_name, platform, ip_address, last_activity)
     VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?)`,
    [
      userId,
      familyId,
      tokenHash,
      expiresAt,
      isRevoked ? 1 : 0,
      replacedByHash,
      deviceId,
      deviceName,
      platform,
      ipAddress,
      lastActivityDate
    ]
  );

  return {
    id: res.lastID,
    userId,
    familyId,
    tokenHash,
    isRevoked: !!isRevoked,
    replacedByHash
  };
}

/**
 * Clean up test user and all foreign key references.
 */
export async function deleteTestUser(userId) {
  if (!userId) return;
  try {
    await db.run("DELETE FROM workforce_employee_site_assignment WHERE user_id = ?", [userId]);
    await db.run("DELETE FROM workforce_site_access WHERE user_id = ?", [userId]);
    await db.run("DELETE FROM workforce_user_tenant WHERE user_id = ?", [userId]);
    await db.run("DELETE FROM attendance_attendanceapproval WHERE attendance_id IN (SELECT id FROM attendance_attendance WHERE user_id = ?)", [userId]);
    await db.run("DELETE FROM attendance_attendance WHERE user_id = ?", [userId]);
    await db.run("DELETE FROM leave_leave WHERE user_id = ?", [userId]);
    await db.run("DELETE FROM accounts_employeedocument WHERE user_id = ?", [userId]);
    await db.run("DELETE FROM accounts_refreshtoken WHERE user_id = ?", [userId]);
    await db.run("DELETE FROM accounts_employeeprofile WHERE user_id = ?", [userId]);
    await db.run("DELETE FROM accounts_user WHERE id = ?", [userId]);
  } catch (err) {
    // Ignore cleanup error
  }
}

/**
 * Batch cleanup of multiple users.
 */
export async function cleanupTestUsers(userIds = []) {
  for (const uid of userIds) {
    await deleteTestUser(uid);
  }
}
