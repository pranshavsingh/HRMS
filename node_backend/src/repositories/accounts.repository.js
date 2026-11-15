import { db } from "../db/index.js";
import { config } from "../config/env.js";

let otpTableReady = false;
let accountsSchemaChecked = false;
let refreshTokenTableReady = false;

async function ensureRefreshTokenTable() {
  if (refreshTokenTableReady) return;
  if (config.dbClient === "mysql") {
    await db.run(`
      CREATE TABLE IF NOT EXISTS accounts_refreshtoken (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT NOT NULL,
        token_hash VARCHAR(255) NOT NULL UNIQUE,
        expires_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL,
        device_id VARCHAR(255) NULL,
        device_name VARCHAR(255) NULL,
        platform VARCHAR(50) NULL,
        ip_address VARCHAR(45) NULL,
        last_activity DATETIME NOT NULL,
        CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES accounts_user(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  } else {
    await db.run(`
      CREATE TABLE IF NOT EXISTS accounts_refreshtoken (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL,
        device_id TEXT NULL,
        device_name TEXT NULL,
        platform TEXT NULL,
        ip_address TEXT NULL,
        last_activity DATETIME NOT NULL,
        FOREIGN KEY (user_id) REFERENCES accounts_user(id) ON DELETE CASCADE
      );
    `);
  }
  refreshTokenTableReady = true;
}

async function ensureOtpTable() {
  if (otpTableReady) return;
  await db.run(
    "CREATE TABLE IF NOT EXISTS password_reset_otp (email VARCHAR(254) PRIMARY KEY, otp_hash VARCHAR(128) NOT NULL, expires_at DATETIME NOT NULL, verified INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL)"
  );
  otpTableReady = true;
}

async function ensureAccountsSchema() {
  if (accountsSchemaChecked) return;
  try {
    const columns = await db.all("SHOW COLUMNS FROM accounts_user LIKE 'deleted_at'");
    if (columns.length === 0) {
      await db.run("ALTER TABLE accounts_user ADD COLUMN deleted_at DATETIME NULL");
    }
  } catch (err) {
    // Suppress error if table does not exist or column is already present
  }
  try {
    const columns = await db.all("SHOW COLUMNS FROM accounts_employeeprofile LIKE 'designation'");
    if (columns.length === 0) {
      await db.run("ALTER TABLE accounts_employeeprofile ADD COLUMN designation VARCHAR(255) NULL");
    }
  } catch (err) {
    // Suppress error
  }
  try {
    await db.run(`
      CREATE TABLE IF NOT EXISTS accounts_employeelocation (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        user_id BIGINT NOT NULL,
        latitude DOUBLE NOT NULL,
        longitude DOUBLE NOT NULL,
        allowed_radius INT NOT NULL DEFAULT 100,
        is_primary BOOLEAN NOT NULL DEFAULT 0,
        CONSTRAINT fk_loc_user FOREIGN KEY (user_id) REFERENCES accounts_user(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  } catch (err) {
    // Suppress error
  }
  accountsSchemaChecked = true;
}

export const accountsRepository = {
  async findById(id, tx = null) {
    await ensureAccountsSchema();
    return db.get("SELECT * FROM accounts_user WHERE id=? AND deleted_at IS NULL", [id], tx);
  },

  async findByUsernameOrEmail(usernameOrEmail, tx = null) {
    await ensureAccountsSchema();
    return db.get(
      "SELECT * FROM accounts_user WHERE (lower(username)=lower(?) OR lower(email)=lower(?)) AND deleted_at IS NULL LIMIT 1",
      [usernameOrEmail.trim(), usernameOrEmail.trim()],
      tx
    );
  },

  async findByEmail(email, tx = null) {
    await ensureAccountsSchema();
    return db.get(
      "SELECT * FROM accounts_user WHERE lower(email)=lower(?) AND deleted_at IS NULL LIMIT 1",
      [email.trim()],
      tx
    );
  },

  async findProfileByUserId(userId, tx = null) {
    return db.get("SELECT * FROM accounts_employeeprofile WHERE user_id=?", [userId], tx);
  },

  async findDocumentCountByUserId(userId, tx = null) {
    const row = await db.get("SELECT COUNT(*) as c FROM accounts_employeedocument WHERE user_id=?", [userId], tx);
    return row?.c || 0;
  },

  async insertUser(password, username, firstName, lastName, email, role, tx = null) {
    await ensureAccountsSchema();
    const isSuperuser = role === "superadmin" ? 1 : 0;
    const result = await db.run(
      "INSERT INTO accounts_user (password, last_login, is_superuser, username, first_name, last_name, email, is_staff, is_active, date_joined, role) VALUES (?, NULL, ?, ?, ?, ?, ?, 0, 1, NOW(), ?)",
      [password, isSuperuser, username, firstName, lastName, email, role],
      tx
    );
    return result.lastID;
  },

  async insertProfile(latitude, longitude, allowedRadius, managerId, userId, teamName, joiningDate, leaveAllotted, designation = null, tx = null) {
    await db.run(
      "INSERT INTO accounts_employeeprofile (latitude, longitude, allowed_radius, manager_id, user_id, is_active_employee, team_name, joining_date, leave_allotted, designation) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)",
      [
        latitude !== undefined ? latitude : null,
        longitude !== undefined ? longitude : null,
        allowedRadius || 100,
        managerId,
        userId,
        teamName || null,
        joiningDate || null,
        leaveAllotted || 0,
        designation || null
      ],
      tx
    );
  },

  async insertDocument(title, filePath, userId, tx = null) {
    await db.run(
      "INSERT INTO accounts_employeedocument (title, file, uploaded_at, user_id) VALUES (?, ?, NOW(), ?)",
      [title, filePath, userId],
      tx
    );
  },

  async findActiveManagers(tx = null) {
    await ensureAccountsSchema();
    return db.all(
      "SELECT u.*, p.team_name FROM accounts_user u JOIN accounts_employeeprofile p ON p.user_id=u.id WHERE u.role='manager' AND u.is_active=1 AND u.deleted_at IS NULL ORDER BY u.first_name, u.username",
      [],
      tx
    );
  },

  async findAllEmployees(tx = null) {
    await ensureAccountsSchema();
    return db.all(
      "SELECT * FROM accounts_user WHERE role IN ('employee','manager','hr','admin','superadmin') AND deleted_at IS NULL ORDER BY id DESC",
      [],
      tx
    );
  },

  async updateUser(userId, data, tx = null) {
    await ensureAccountsSchema();
    const { username, first_name, last_name, email, role, is_active } = data;
    if (role !== undefined) {
      const isSuperuser = role === "superadmin" ? 1 : 0;
      await db.run(
        "UPDATE accounts_user SET username=COALESCE(?,username), first_name=COALESCE(?,first_name), last_name=COALESCE(?,last_name), email=COALESCE(?,email), role=COALESCE(?,role), is_superuser=?, is_active=COALESCE(?,is_active) WHERE id=?",
        [username ?? null, first_name ?? null, last_name ?? null, email ?? null, role, isSuperuser, is_active ?? null, userId],
        tx
      );
    } else {
      await db.run(
        "UPDATE accounts_user SET username=COALESCE(?,username), first_name=COALESCE(?,first_name), last_name=COALESCE(?,last_name), email=COALESCE(?,email), is_active=COALESCE(?,is_active) WHERE id=?",
        [username ?? null, first_name ?? null, last_name ?? null, email ?? null, is_active ?? null, userId],
        tx
      );
    }
  },

  async updateProfile(userId, data, tx = null) {
    const { manager, team_name, joining_date, leave_allotted, latitude, longitude, allowed_radius, is_active_employee, designation } = data;
    await db.run(
      "UPDATE accounts_employeeprofile SET manager_id=COALESCE(?,manager_id), team_name=COALESCE(?,team_name), joining_date=COALESCE(?,joining_date), leave_allotted=COALESCE(?,leave_allotted), latitude=COALESCE(?,latitude), longitude=COALESCE(?,longitude), allowed_radius=COALESCE(?,allowed_radius), is_active_employee=COALESCE(?,is_active_employee), designation=COALESCE(?,designation) WHERE user_id=?",
      [
        manager !== undefined ? manager : null,
        team_name !== undefined ? team_name : null,
        joining_date !== undefined ? joining_date : null,
        leave_allotted !== undefined ? leave_allotted : null,
        latitude !== undefined ? latitude : null,
        longitude !== undefined ? longitude : null,
        allowed_radius !== undefined ? allowed_radius : null,
        is_active_employee !== undefined ? is_active_employee : null,
        designation !== undefined ? designation : null,
        userId
      ],
      tx
    );
  },

  async softDeleteUser(userId, tx = null) {
    await ensureAccountsSchema();
    await db.run("UPDATE accounts_user SET is_active=0, deleted_at=NOW() WHERE id=?", [userId], tx);
  },

  async softDeleteProfile(userId, tx = null) {
    await db.run("UPDATE accounts_employeeprofile SET is_active_employee=0 WHERE user_id=?", [userId], tx);
  },

  async deleteOtpByEmail(email, tx = null) {
    await ensureOtpTable();
    await db.run("DELETE FROM password_reset_otp WHERE lower(email)=lower(?)", [email], tx);
  },

  async insertOtp(email, otpHash, expiresAt, tx = null) {
    await ensureOtpTable();
    await db.run(
      "INSERT INTO password_reset_otp (email, otp_hash, expires_at, verified, attempts, created_at, updated_at) VALUES (?, ?, ?, 0, 0, NOW(), NOW())",
      [email.toLowerCase(), otpHash, expiresAt],
      tx
    );
  },

  async findOtpByEmail(email, tx = null) {
    await ensureOtpTable();
    return db.get("SELECT * FROM password_reset_otp WHERE lower(email)=lower(?) LIMIT 1", [email], tx);
  },

  async incrementOtpAttempts(email, tx = null) {
    await ensureOtpTable();
    await db.run(
      "UPDATE password_reset_otp SET attempts = attempts + 1, updated_at = NOW() WHERE lower(email)=lower(?)",
      [email],
      tx
    );
  },

  async verifyOtp(email, tx = null) {
    await ensureOtpTable();
    await db.run(
      "UPDATE password_reset_otp SET verified = 1, updated_at = NOW() WHERE lower(email)=lower(?)",
      [email],
      tx
    );
  },

  async findDocumentsByUserId(userId, tx = null) {
    return db.all("SELECT * FROM accounts_employeedocument WHERE user_id=? ORDER BY uploaded_at DESC", [userId], tx);
  },

  async findDocumentById(id, tx = null) {
    return db.get("SELECT * FROM accounts_employeedocument WHERE id=?", [id], tx);
  },

  async findLocationsByUserId(userId, tx = null) {
    return db.all("SELECT * FROM accounts_employeelocation WHERE user_id=? ORDER BY is_primary DESC, id ASC", [userId], tx);
  },

  async insertLocation(userId, latitude, longitude, allowedRadius, isPrimary, tx = null) {
    await db.run(
      "INSERT INTO accounts_employeelocation (user_id, latitude, longitude, allowed_radius, is_primary) VALUES (?, ?, ?, ?, ?)",
      [userId, latitude, longitude, allowedRadius || 100, isPrimary ? 1 : 0],
      tx
    );
  },

  async deleteLocationsByUserId(userId, tx = null) {
    await db.run("DELETE FROM accounts_employeelocation WHERE user_id=?", [userId], tx);
  },

  async insertRefreshToken(userId, tokenHash, expiresAt, deviceInfo = {}, tx = null) {
    await ensureRefreshTokenTable();
    const { deviceId = null, deviceName = null, platform = null, ipAddress = null } = deviceInfo;
    const now = new Date();
    await db.run(
      "INSERT INTO accounts_refreshtoken (user_id, token_hash, expires_at, created_at, device_id, device_name, platform, ip_address, last_activity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [userId, tokenHash, expiresAt, now, deviceId, deviceName, platform, ipAddress, now],
      tx
    );
  },

  async findRefreshTokenByHash(tokenHash, tx = null) {
    await ensureRefreshTokenTable();
    return db.get("SELECT * FROM accounts_refreshtoken WHERE token_hash = ?", [tokenHash], tx);
  },

  async deleteRefreshTokenByHash(tokenHash, tx = null) {
    await ensureRefreshTokenTable();
    await db.run("DELETE FROM accounts_refreshtoken WHERE token_hash = ?", [tokenHash], tx);
  },

  async deleteRefreshTokensByUserId(userId, tx = null) {
    await ensureRefreshTokenTable();
    await db.run("DELETE FROM accounts_refreshtoken WHERE user_id = ?", [userId], tx);
  },

  async updateRefreshTokenActivity(tokenHash, tx = null) {
    await ensureRefreshTokenTable();
    const now = new Date();
    await db.run(
      "UPDATE accounts_refreshtoken SET last_activity = ? WHERE token_hash = ?",
      [now, tokenHash],
      tx
    );
  }
};

export default accountsRepository;
