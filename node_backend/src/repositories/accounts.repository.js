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
        family_id VARCHAR(64) NULL,
        token_hash VARCHAR(255) NOT NULL UNIQUE,
        expires_at DATETIME NOT NULL,
        is_revoked BOOLEAN NOT NULL DEFAULT 0,
        replaced_by_hash VARCHAR(255) NULL,
        created_at DATETIME NOT NULL,
        device_id VARCHAR(255) NULL,
        device_name VARCHAR(255) NULL,
        platform VARCHAR(50) NULL,
        ip_address VARCHAR(45) NULL,
        last_activity DATETIME NOT NULL,
        CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES accounts_user(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    try {
      const cols = await db.all("SHOW COLUMNS FROM accounts_refreshtoken LIKE 'family_id'");
      if (cols.length === 0) {
        await db.run("ALTER TABLE accounts_refreshtoken ADD COLUMN family_id VARCHAR(64) NULL AFTER user_id");
      }
      const colsRev = await db.all("SHOW COLUMNS FROM accounts_refreshtoken LIKE 'is_revoked'");
      if (colsRev.length === 0) {
        await db.run("ALTER TABLE accounts_refreshtoken ADD COLUMN is_revoked BOOLEAN NOT NULL DEFAULT 0 AFTER expires_at");
      }
      const colsRep = await db.all("SHOW COLUMNS FROM accounts_refreshtoken LIKE 'replaced_by_hash'");
      if (colsRep.length === 0) {
        await db.run("ALTER TABLE accounts_refreshtoken ADD COLUMN replaced_by_hash VARCHAR(255) NULL AFTER is_revoked");
      }
    } catch (err) {
      // Ignored if table does not support SHOW COLUMNS or already altered
    }
  } else {
    await db.run(`
      CREATE TABLE IF NOT EXISTS accounts_refreshtoken (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        family_id TEXT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at DATETIME NOT NULL,
        is_revoked INTEGER NOT NULL DEFAULT 0,
        replaced_by_hash TEXT NULL,
        created_at DATETIME NOT NULL,
        device_id TEXT NULL,
        device_name TEXT NULL,
        platform TEXT NULL,
        ip_address TEXT NULL,
        last_activity DATETIME NOT NULL,
        FOREIGN KEY (user_id) REFERENCES accounts_user(id) ON DELETE CASCADE
      );
    `);
    try {
      const pragma = await db.all("PRAGMA table_info(accounts_refreshtoken)");
      const colNames = pragma.map(c => c.name);
      if (!colNames.includes("family_id")) {
        await db.run("ALTER TABLE accounts_refreshtoken ADD COLUMN family_id TEXT NULL");
      }
      if (!colNames.includes("is_revoked")) {
        await db.run("ALTER TABLE accounts_refreshtoken ADD COLUMN is_revoked INTEGER NOT NULL DEFAULT 0");
      }
      if (!colNames.includes("replaced_by_hash")) {
        await db.run("ALTER TABLE accounts_refreshtoken ADD COLUMN replaced_by_hash TEXT NULL");
      }
    } catch (err) {
      // Ignored
    }
  }
  refreshTokenTableReady = true;
}

async function ensureOtpTable() {
  if (otpTableReady) return;
  if (config.dbClient === "mysql") {
    await db.run(`
      CREATE TABLE IF NOT EXISTS password_reset_otp (
        email VARCHAR(254) PRIMARY KEY,
        otp_hash VARCHAR(128) NOT NULL,
        reset_token_hash VARCHAR(128) NULL,
        expires_at DATETIME NOT NULL,
        verified INTEGER NOT NULL DEFAULT 0,
        verified_at DATETIME NULL,
        consumed_at DATETIME NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
    try {
      const cols = await db.all("SHOW COLUMNS FROM password_reset_otp LIKE 'reset_token_hash'");
      if (cols.length === 0) {
        await db.run("ALTER TABLE password_reset_otp ADD COLUMN reset_token_hash VARCHAR(128) NULL AFTER otp_hash");
      }
      const colsVer = await db.all("SHOW COLUMNS FROM password_reset_otp LIKE 'verified_at'");
      if (colsVer.length === 0) {
        await db.run("ALTER TABLE password_reset_otp ADD COLUMN verified_at DATETIME NULL AFTER verified");
      }
      const colsCon = await db.all("SHOW COLUMNS FROM password_reset_otp LIKE 'consumed_at'");
      if (colsCon.length === 0) {
        await db.run("ALTER TABLE password_reset_otp ADD COLUMN consumed_at DATETIME NULL AFTER verified_at");
      }
    } catch (err) {
      // Ignored
    }
  } else {
    await db.run(`
      CREATE TABLE IF NOT EXISTS password_reset_otp (
        email TEXT PRIMARY KEY,
        otp_hash TEXT NOT NULL,
        reset_token_hash TEXT NULL,
        expires_at DATETIME NOT NULL,
        verified INTEGER NOT NULL DEFAULT 0,
        verified_at DATETIME NULL,
        consumed_at DATETIME NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL
      );
    `);
    try {
      const pragma = await db.all("PRAGMA table_info(password_reset_otp)");
      const colNames = pragma.map(c => c.name);
      if (!colNames.includes("reset_token_hash")) {
        await db.run("ALTER TABLE password_reset_otp ADD COLUMN reset_token_hash TEXT NULL");
      }
      if (!colNames.includes("verified_at")) {
        await db.run("ALTER TABLE password_reset_otp ADD COLUMN verified_at DATETIME NULL");
      }
      if (!colNames.includes("consumed_at")) {
        await db.run("ALTER TABLE password_reset_otp ADD COLUMN consumed_at DATETIME NULL");
      }
    } catch (err) {
      // Ignored
    }
  }
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
    const columns = await db.all("SHOW COLUMNS FROM accounts_employeeprofile LIKE 'profile_picture'");
    if (columns.length === 0) {
      await db.run("ALTER TABLE accounts_employeeprofile ADD COLUMN profile_picture VARCHAR(500) NULL");
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

  async findActiveManagersPaged({ limit = 50, offset = 0 } = {}, tx = null) {
    await ensureAccountsSchema();
    return db.all(
      "SELECT u.*, p.team_name FROM accounts_user u JOIN accounts_employeeprofile p ON p.user_id=u.id WHERE u.role='manager' AND u.is_active=1 AND u.deleted_at IS NULL ORDER BY u.first_name, u.username LIMIT ? OFFSET ?",
      [limit, offset],
      tx
    );
  },

  async countActiveManagers(tx = null) {
    await ensureAccountsSchema();
    const row = await db.get(
      "SELECT COUNT(*) as c FROM accounts_user u JOIN accounts_employeeprofile p ON p.user_id=u.id WHERE u.role='manager' AND u.is_active=1 AND u.deleted_at IS NULL",
      [],
      tx
    );
    return Number(row?.c || 0);
  },

  async findAllEmployees(tx = null) {
    await ensureAccountsSchema();
    return db.all(
      "SELECT * FROM accounts_user WHERE role IN ('employee','manager','hr','admin','superadmin') AND deleted_at IS NULL ORDER BY id DESC",
      [],
      tx
    );
  },

  _buildEmployeeWhere({
    tenantId = 1,
    role = null,
    team = null,
    search = "",
    status = null,
    siteScope = { siteIds: null, unassigned: false },
    managerId = null,
    workDate = new Date().toISOString().slice(0, 10)
  }) {
    const whereConditions = [
      "u.deleted_at IS NULL",
      "u.role IN ('employee','manager','hr','admin','superadmin')",
      "wut.tenant_id = ?"
    ];
    const params = [tenantId];

    if (managerId) {
      whereConditions.push("(ep.manager_id = ? OR (ep.team_name IS NOT NULL AND ep.team_name != '' AND ep.team_name = (SELECT mgr_ep.team_name FROM accounts_employeeprofile mgr_ep WHERE mgr_ep.user_id = ?)))");
      params.push(managerId, managerId);
    }

    if (role && role !== "all") {
      whereConditions.push("u.role = ?");
      params.push(role);
    }

    if (team && team !== "all") {
      whereConditions.push("COALESCE(ep.team_name, m_ep.team_name) = ?");
      params.push(team);
    }

    if (status === "active") {
      whereConditions.push("u.is_active = 1 AND (ep.is_active_employee IS NULL OR ep.is_active_employee = 1) AND wut.is_active = 1");
    } else if (status === "inactive") {
      whereConditions.push("(u.is_active = 0 OR ep.is_active_employee = 0 OR wut.is_active = 0)");
    }

    if (siteScope) {
      if (siteScope.unassigned) {
        whereConditions.push(`NOT EXISTS (
          SELECT 1 FROM workforce_employee_site_assignment esa
          WHERE esa.tenant_id = ? AND esa.user_id = u.id AND esa.effective_from <= ?
            AND (esa.effective_to IS NULL OR esa.effective_to >= ?)
        )`);
        params.push(tenantId, workDate, workDate);
      } else if (Array.isArray(siteScope.siteIds)) {
        if (siteScope.siteIds.length === 0) {
          whereConditions.push("1 = 0");
        } else {
          const sitePlaceholders = siteScope.siteIds.map(() => "?").join(",");
          whereConditions.push(`EXISTS (
            SELECT 1 FROM workforce_employee_site_assignment esa
            WHERE esa.tenant_id = ? AND esa.user_id = u.id AND esa.site_id IN (${sitePlaceholders})
              AND esa.effective_from <= ?
              AND (esa.effective_to IS NULL OR esa.effective_to >= ?)
          )`);
          params.push(tenantId, ...siteScope.siteIds, workDate, workDate);
        }
      }
    }

    if (search && search.trim()) {
      const trimmedSearch = search.trim().toLowerCase();
      const term = `%${trimmedSearch}%`;
      const words = trimmedSearch.split(/\s+/).filter(Boolean);

      if (words.length > 1) {
        const w1 = `%${words[0]}%`;
        const w2 = `%${words[words.length - 1]}%`;
        whereConditions.push(`(
          LOWER(u.username) LIKE ? OR
          LOWER(u.first_name) LIKE ? OR
          LOWER(u.last_name) LIKE ? OR
          LOWER(u.email) LIKE ? OR
          LOWER(COALESCE(ep.team_name, m_ep.team_name)) LIKE ? OR
          (LOWER(u.first_name) LIKE ? AND LOWER(u.last_name) LIKE ?) OR
          LOWER(m.username) LIKE ? OR
          LOWER(m.first_name) LIKE ? OR
          LOWER(m.last_name) LIKE ? OR
          (LOWER(m.first_name) LIKE ? AND LOWER(m.last_name) LIKE ?)
        )`);
        params.push(term, term, term, term, term, w1, w2, term, term, term, w1, w2);
      } else {
        whereConditions.push(`(
          LOWER(u.username) LIKE ? OR
          LOWER(u.first_name) LIKE ? OR
          LOWER(u.last_name) LIKE ? OR
          LOWER(u.email) LIKE ? OR
          LOWER(COALESCE(ep.team_name, m_ep.team_name)) LIKE ? OR
          LOWER(m.username) LIKE ? OR
          LOWER(m.first_name) LIKE ? OR
          LOWER(m.last_name) LIKE ?
        )`);
        params.push(term, term, term, term, term, term, term, term);
      }
    }

    return {
      whereClause: whereConditions.join(" AND "),
      params
    };
  },

  async findEmployeesPaged({
    tenantId = 1,
    limit = 50,
    offset = 0,
    role = null,
    team = null,
    search = "",
    status = null,
    siteScope = { siteIds: null, unassigned: false },
    managerId = null,
    workDate = new Date().toISOString().slice(0, 10)
  } = {}, tx = null) {
    await ensureAccountsSchema();
    const { whereClause, params } = this._buildEmployeeWhere({
      tenantId,
      role,
      team,
      search,
      status,
      siteScope,
      managerId,
      workDate
    });

    const selectParams = [tenantId, workDate, workDate, ...params, limit, offset];

    const sql = `
      SELECT 
        u.id, u.username, u.first_name, u.last_name, u.email, u.role, u.is_active, u.is_staff, u.is_superuser, u.date_joined,
        wut.is_active as tenant_is_active,
        ep.manager_id, COALESCE(ep.team_name, m_ep.team_name) as team_name, ep.joining_date, ep.leave_allotted, ep.is_active_employee,
        ep.latitude, ep.longitude, ep.allowed_radius, ep.designation, ep.profile_picture,
        d.file as photo_copy_file,
        m.username as manager_username, m.first_name as manager_first_name, m.last_name as manager_last_name,
        (
          SELECT esa.site_id FROM workforce_employee_site_assignment esa
          WHERE esa.tenant_id = ? AND esa.user_id = u.id AND esa.effective_from <= ?
            AND (esa.effective_to IS NULL OR esa.effective_to >= ?)
          ORDER BY esa.effective_from DESC, esa.id DESC LIMIT 1
        ) as site_id
      FROM accounts_user u
      JOIN workforce_user_tenant wut ON wut.user_id = u.id
      LEFT JOIN accounts_employeeprofile ep ON ep.user_id = u.id
      LEFT JOIN accounts_employeeprofile m_ep ON m_ep.user_id = ep.manager_id
      LEFT JOIN (
        SELECT user_id, MAX(file) as file 
        FROM accounts_employeedocument 
        WHERE LOWER(title) = 'photo copy' OR LOWER(title) = 'photocopy'
        GROUP BY user_id
      ) d ON d.user_id = u.id
      LEFT JOIN accounts_user m ON m.id = ep.manager_id
      WHERE ${whereClause}
      ORDER BY u.id DESC
      LIMIT ? OFFSET ?
    `;

    return db.all(sql, selectParams, tx);
  },

  async countEmployees({
    tenantId = 1,
    role = null,
    team = null,
    search = "",
    status = null,
    siteScope = { siteIds: null, unassigned: false },
    managerId = null,
    workDate = new Date().toISOString().slice(0, 10)
  } = {}, tx = null) {
    await ensureAccountsSchema();
    const { whereClause, params } = this._buildEmployeeWhere({
      tenantId,
      role,
      team,
      search,
      status,
      siteScope,
      managerId,
      workDate
    });

    const sql = `
      SELECT COUNT(DISTINCT u.id) as c 
      FROM accounts_user u 
      JOIN workforce_user_tenant wut ON wut.user_id = u.id
      LEFT JOIN accounts_employeeprofile ep ON ep.user_id = u.id 
      LEFT JOIN accounts_employeeprofile m_ep ON m_ep.user_id = ep.manager_id
      LEFT JOIN accounts_user m ON m.id = ep.manager_id
      WHERE ${whereClause}
    `;

    const row = await db.get(sql, params, tx);
    return Number(row?.c || 0);
  },

  async getEmployeeMetrics({
    tenantId = 1,
    siteScope = { siteIds: null, unassigned: false },
    managerId = null,
    workDate = new Date().toISOString().slice(0, 10)
  } = {}, tx = null) {
    await ensureAccountsSchema();
    const { whereClause, params } = this._buildEmployeeWhere({
      tenantId,
      siteScope,
      managerId,
      workDate
    });

    const sql = `
      SELECT 
        COUNT(DISTINCT u.id) as total,
        COUNT(DISTINCT CASE WHEN u.is_active = 1 AND (ep.is_active_employee IS NULL OR ep.is_active_employee = 1) AND wut.is_active = 1 THEN u.id END) as active,
        COUNT(DISTINCT CASE WHEN u.is_active = 0 OR ep.is_active_employee = 0 OR wut.is_active = 0 THEN u.id END) as inactive,
        COUNT(DISTINCT CASE WHEN u.role = 'manager' THEN u.id END) as managers,
        COUNT(DISTINCT CASE WHEN u.role = 'employee' THEN u.id END) as employees,
        COUNT(DISTINCT CASE WHEN u.role = 'hr' THEN u.id END) as hr,
        COUNT(DISTINCT CASE WHEN u.role IN ('admin', 'superadmin') THEN u.id END) as admin
      FROM accounts_user u
      JOIN workforce_user_tenant wut ON wut.user_id = u.id
      LEFT JOIN accounts_employeeprofile ep ON ep.user_id = u.id
      LEFT JOIN accounts_employeeprofile m_ep ON m_ep.user_id = ep.manager_id
      LEFT JOIN accounts_user m ON m.id = ep.manager_id
      WHERE ${whereClause}
    `;

    const row = await db.get(sql, params, tx);
    return {
      total: Number(row?.total || 0),
      active: Number(row?.active || 0),
      inactive: Number(row?.inactive || 0),
      managers: Number(row?.managers || 0),
      employees: Number(row?.employees || 0),
      hr: Number(row?.hr || 0),
      admin: Number(row?.admin || 0),
    };
  },

  async findAvailableTeams({
    tenantId = 1,
    siteScope = { siteIds: null, unassigned: false },
    managerId = null,
    workDate = new Date().toISOString().slice(0, 10)
  } = {}, tx = null) {
    await ensureAccountsSchema();
    const { whereClause, params } = this._buildEmployeeWhere({
      tenantId,
      siteScope,
      managerId,
      workDate
    });

    const sql = `
      SELECT DISTINCT COALESCE(ep.team_name, m_ep.team_name) as team_name
      FROM accounts_user u
      JOIN workforce_user_tenant wut ON wut.user_id = u.id
      LEFT JOIN accounts_employeeprofile ep ON ep.user_id = u.id
      LEFT JOIN accounts_employeeprofile m_ep ON m_ep.user_id = ep.manager_id
      WHERE ${whereClause}
        AND COALESCE(ep.team_name, m_ep.team_name) IS NOT NULL
        AND COALESCE(ep.team_name, m_ep.team_name) != ''
      ORDER BY team_name ASC
    `;

    return db.all(sql, params, tx);
  },

  async countTotalDocuments(optionsOrTx = null, maybeTx = null) {
    await ensureAccountsSchema();
    let tx = maybeTx;
    let options = {};
    if (optionsOrTx && typeof optionsOrTx === "object" && ("tenantId" in optionsOrTx || "siteScope" in optionsOrTx || "managerId" in optionsOrTx)) {
      options = optionsOrTx;
    } else if (optionsOrTx) {
      tx = optionsOrTx;
    }

    const {
      tenantId = 1,
      siteScope = { siteIds: null, unassigned: false },
      managerId = null,
      workDate = new Date().toISOString().slice(0, 10),
    } = options;

    const { whereClause, params } = this._buildEmployeeWhere({
      tenantId,
      siteScope,
      managerId,
      workDate,
    });

    const sql = `
      SELECT COUNT(d.id) as c
      FROM accounts_employeedocument d
      JOIN accounts_user u ON u.id = d.user_id
      JOIN workforce_user_tenant wut ON wut.user_id = u.id
      LEFT JOIN accounts_employeeprofile ep ON ep.user_id = u.id
      LEFT JOIN accounts_employeeprofile m_ep ON m_ep.user_id = ep.manager_id
      LEFT JOIN accounts_user m ON m.id = ep.manager_id
      WHERE ${whereClause}
    `;

    const row = await db.get(sql, params, tx);
    return Number(row?.c || 0);
  },

  async findDocumentCountsByUserIds(userIds = [], tx = null) {
    if (!userIds || userIds.length === 0) return new Map();
    const placeholders = userIds.map(() => "?").join(",");
    const rows = await db.all(
      `SELECT user_id, COUNT(*) as count FROM accounts_employeedocument WHERE user_id IN (${placeholders}) GROUP BY user_id`,
      userIds,
      tx
    );
    const countMap = new Map();
    for (const r of rows) {
      countMap.set(Number(r.user_id), Number(r.count || 0));
    }
    return countMap;
  },

  async findLocationsByUserIds(userIds = [], tx = null) {
    if (!userIds || userIds.length === 0) return new Map();
    const placeholders = userIds.map(() => "?").join(",");
    const rows = await db.all(
      `SELECT id, user_id, latitude, longitude, allowed_radius, is_primary FROM accounts_employeelocation WHERE user_id IN (${placeholders})`,
      userIds,
      tx
    );
    const locMap = new Map();
    for (const r of rows) {
      const uid = Number(r.user_id);
      let list = locMap.get(uid);
      if (!list) {
        list = [];
        locMap.set(uid, list);
      }
      list.push({
        id: r.id,
        user_id: r.user_id,
        latitude: r.latitude,
        longitude: r.longitude,
        allowed_radius: r.allowed_radius,
        is_primary: Boolean(r.is_primary)
      });
    }
    return locMap;
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
    const existing = await db.get("SELECT id FROM accounts_employeeprofile WHERE user_id = ? LIMIT 1", [userId], tx);
    if (!existing) {
      await db.run(
        "INSERT INTO accounts_employeeprofile (user_id, manager_id, team_name, joining_date, leave_allotted, latitude, longitude, allowed_radius, is_active_employee, designation, profile_picture) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [
          userId,
          data.manager ? Number(data.manager) : null,
          data.team_name && String(data.team_name).trim() ? String(data.team_name).trim() : null,
          data.joining_date && String(data.joining_date).trim() ? String(data.joining_date).trim() : null,
          data.leave_allotted !== undefined && data.leave_allotted !== "" && data.leave_allotted !== null ? Number(data.leave_allotted) : 0,
          data.latitude !== undefined && data.latitude !== "" && data.latitude !== null ? Number(data.latitude) : null,
          data.longitude !== undefined && data.longitude !== "" && data.longitude !== null ? Number(data.longitude) : null,
          data.allowed_radius !== undefined && data.allowed_radius !== "" && data.allowed_radius !== null ? Number(data.allowed_radius) : 100,
          data.is_active_employee !== undefined && data.is_active_employee !== null ? (data.is_active_employee ? 1 : 0) : 1,
          data.designation && String(data.designation).trim() ? String(data.designation).trim() : null,
          data.profile_picture || null
        ],
        tx
      );
      return;
    }

    const setClauses = [];
    const params = [];

    if ("manager" in data) {
      setClauses.push("manager_id = ?");
      params.push(data.manager !== null && data.manager !== "" && data.manager !== undefined ? Number(data.manager) : null);
    }
    if ("team_name" in data) {
      setClauses.push("team_name = ?");
      params.push(data.team_name !== null && data.team_name !== undefined && String(data.team_name).trim() !== "" ? String(data.team_name).trim() : null);
    }
    if ("designation" in data) {
      setClauses.push("designation = ?");
      params.push(data.designation !== null && data.designation !== undefined && String(data.designation).trim() !== "" ? String(data.designation).trim() : null);
    }
    if ("joining_date" in data) {
      setClauses.push("joining_date = ?");
      params.push(data.joining_date !== null && data.joining_date !== undefined && String(data.joining_date).trim() !== "" ? String(data.joining_date).trim() : null);
    }
    if ("leave_allotted" in data) {
      setClauses.push("leave_allotted = ?");
      params.push(data.leave_allotted !== null && data.leave_allotted !== "" && data.leave_allotted !== undefined ? Number(data.leave_allotted) : 0);
    }
    if ("latitude" in data) {
      setClauses.push("latitude = ?");
      params.push(data.latitude !== null && data.latitude !== "" && data.latitude !== undefined ? Number(data.latitude) : null);
    }
    if ("longitude" in data) {
      setClauses.push("longitude = ?");
      params.push(data.longitude !== null && data.longitude !== "" && data.longitude !== undefined ? Number(data.longitude) : null);
    }
    if ("allowed_radius" in data) {
      setClauses.push("allowed_radius = ?");
      params.push(data.allowed_radius !== null && data.allowed_radius !== "" && data.allowed_radius !== undefined ? Number(data.allowed_radius) : 100);
    }
    if ("is_active_employee" in data) {
      setClauses.push("is_active_employee = ?");
      params.push(data.is_active_employee ? 1 : 0);
    }
    if ("profile_picture" in data) {
      setClauses.push("profile_picture = ?");
      params.push(data.profile_picture !== null && data.profile_picture !== undefined && String(data.profile_picture).trim() !== "" ? String(data.profile_picture).trim() : null);
    }

    if (setClauses.length > 0) {
      params.push(userId);
      await db.run(
        `UPDATE accounts_employeeprofile SET ${setClauses.join(", ")} WHERE user_id = ?`,
        params,
        tx
      );
    }
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
    const res = await db.run(
      "UPDATE password_reset_otp SET attempts = attempts + 1, updated_at = NOW() WHERE lower(email)=lower(?)",
      [email],
      tx
    );
    return res?.changes || 0;
  },

  async verifyOtp(email, resetTokenHash = null, tx = null) {
    await ensureOtpTable();
    const res = await db.run(
      "UPDATE password_reset_otp SET verified = 1, reset_token_hash = ?, verified_at = NOW(), updated_at = NOW() WHERE lower(email)=lower(?)",
      [resetTokenHash, email],
      tx
    );
    return res?.changes || 0;
  },

  async atomicVerifyOtp(email, expectedOtpHash, resetTokenHash, tx = null) {
    await ensureOtpTable();
    const result = await db.run(
      `UPDATE password_reset_otp 
       SET verified = 1, reset_token_hash = ?, verified_at = NOW(), updated_at = NOW() 
       WHERE lower(email) = lower(?) 
         AND otp_hash = ? 
         AND verified = 0 
         AND attempts < 5 
         AND expires_at > NOW()`,
      [resetTokenHash, email, expectedOtpHash],
      tx
    );
    return (result?.changes || 0) > 0;
  },

  async atomicConsumeResetToken(email, resetTokenHash, tx = null) {
    await ensureOtpTable();
    const result = await db.run(
      `UPDATE password_reset_otp 
       SET consumed_at = NOW(), updated_at = NOW() 
       WHERE lower(email) = lower(?) 
         AND reset_token_hash = ? 
         AND verified = 1 
         AND consumed_at IS NULL 
         AND expires_at > NOW()`,
      [email, resetTokenHash],
      tx
    );
    return (result?.changes || 0) > 0;
  },

  async consumeOtp(email, tx = null) {
    await ensureOtpTable();
    await db.run(
      "UPDATE password_reset_otp SET consumed_at = NOW(), updated_at = NOW() WHERE lower(email)=lower(?)",
      [email],
      tx
    );
  },

  async findDocumentsByUserId(userId, tx = null) {
    return db.all("SELECT * FROM accounts_employeedocument WHERE user_id=? ORDER BY uploaded_at DESC", [userId], tx);
  },

  async findDocumentsPagedByUserId(userId, { limit = 50, offset = 0 } = {}, tx = null) {
    return db.all("SELECT * FROM accounts_employeedocument WHERE user_id=? ORDER BY uploaded_at DESC LIMIT ? OFFSET ?", [userId, limit, offset], tx);
  },

  async countDocumentsByUserId(userId, tx = null) {
    const row = await db.get("SELECT COUNT(*) as c FROM accounts_employeedocument WHERE user_id=?", [userId], tx);
    return Number(row?.c || 0);
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

  async insertRefreshToken(userId, tokenHash, expiresAt, deviceInfo = {}, familyId = null, tx = null) {
    await ensureRefreshTokenTable();
    const { deviceId = null, deviceName = null, platform = null, ipAddress = null } = deviceInfo;
    const now = new Date();
    await db.run(
      "INSERT INTO accounts_refreshtoken (user_id, family_id, token_hash, expires_at, is_revoked, replaced_by_hash, created_at, device_id, device_name, platform, ip_address, last_activity) VALUES (?, ?, ?, ?, 0, NULL, ?, ?, ?, ?, ?, ?)",
      [userId, familyId, tokenHash, expiresAt, now, deviceId, deviceName, platform, ipAddress, now],
      tx
    );
  },

  async markRefreshTokenRevoked(tokenHash, replacedByHash = null, tx = null) {
    await ensureRefreshTokenTable();
    const result = await db.run(
      "UPDATE accounts_refreshtoken SET is_revoked = 1, replaced_by_hash = ?, last_activity = NOW() WHERE token_hash = ? AND is_revoked = 0",
      [replacedByHash, tokenHash],
      tx
    );
    return { changes: result.changes };
  },

  async revokeRefreshTokenFamily(familyId, tx = null) {
    if (!familyId) return;
    await ensureRefreshTokenTable();
    await db.run(
      "UPDATE accounts_refreshtoken SET is_revoked = 1 WHERE family_id = ?",
      [familyId],
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

  async deleteUser(userId, tx = null) {
    await db.run("UPDATE accounts_user SET deleted_at = NOW(), is_active = 0 WHERE id = ?", [userId], tx);
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
