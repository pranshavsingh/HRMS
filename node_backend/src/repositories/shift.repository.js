import { db } from "../db/index.js";

export const shiftRepository = {
  /**
   * List all shifts for a tenant with their latest version details and pagination/filters.
   */
  async findAll(tenantId, { search, isActive, limit = 50, offset = 0, sortBy = "name", sortOrder = "ASC" } = {}) {
    const conditions = ["s.tenant_id = ?"];
    const params = [tenantId];

    if (search && search.trim()) {
      conditions.push("(s.code LIKE ? OR s.name LIKE ?)");
      const term = `%${search.trim()}%`;
      params.push(term, term);
    }

    if (isActive !== undefined && isActive !== null) {
      conditions.push("s.is_active = ?");
      params.push(isActive ? 1 : 0);
    }

    const allowedSortFields = {
      name: "s.name",
      code: "s.code",
      created_at: "s.created_at",
      updated_at: "s.updated_at",
      is_active: "s.is_active",
    };
    const sortCol = allowedSortFields[sortBy] || "s.name";
    const dir = sortOrder?.toUpperCase() === "DESC" ? "DESC" : "ASC";

    const whereClause = conditions.join(" AND ");

    const sql = `
      SELECT 
        s.id,
        s.tenant_id,
        s.code,
        s.name,
        s.is_active,
        s.created_at,
        s.updated_at,
        v.id AS current_version_id,
        v.version_number,
        v.start_time,
        v.end_time,
        v.is_overnight,
        v.duration_minutes,
        v.late_grace_minutes,
        v.early_departure_grace_minutes,
        v.effective_from,
        v.effective_to,
        v.created_at AS version_created_at
      FROM workforce_shift s
      LEFT JOIN workforce_shift_version v 
        ON v.shift_id = s.id 
        AND v.tenant_id = s.tenant_id
        AND v.id = (
          SELECT v2.id 
          FROM workforce_shift_version v2 
          WHERE v2.shift_id = s.id AND v2.tenant_id = s.tenant_id 
          ORDER BY v2.version_number DESC 
          LIMIT 1
        )
      WHERE ${whereClause}
      ORDER BY ${sortCol} ${dir}
      LIMIT ? OFFSET ?
    `;

    params.push(Number(limit), Number(offset));
    return db.all(sql, params);
  },

  /**
   * Count total shifts matching filter for pagination.
   */
  async countAll(tenantId, { search, isActive } = {}) {
    const conditions = ["s.tenant_id = ?"];
    const params = [tenantId];

    if (search && search.trim()) {
      conditions.push("(s.code LIKE ? OR s.name LIKE ?)");
      const term = `%${search.trim()}%`;
      params.push(term, term);
    }

    if (isActive !== undefined && isActive !== null) {
      conditions.push("s.is_active = ?");
      params.push(isActive ? 1 : 0);
    }

    const whereClause = conditions.join(" AND ");
    const sql = `SELECT COUNT(*) AS total FROM workforce_shift s WHERE ${whereClause}`;
    const result = await db.get(sql, params);
    return Number(result?.total || 0);
  },

  /**
   * Find a shift by primary ID and tenant ID.
   */
  async findById(tenantId, id, tx = null) {
    return db.get(
      "SELECT * FROM workforce_shift WHERE id = ? AND tenant_id = ?",
      [id, tenantId],
      tx
    );
  },

  /**
   * Find a shift by ID including its latest version.
   */
  async findWithLatestVersion(tenantId, id, tx = null) {
    const sql = `
      SELECT 
        s.id,
        s.tenant_id,
        s.code,
        s.name,
        s.is_active,
        s.created_at,
        s.updated_at,
        v.id AS current_version_id,
        v.version_number,
        v.start_time,
        v.end_time,
        v.is_overnight,
        v.duration_minutes,
        v.late_grace_minutes,
        v.early_departure_grace_minutes,
        v.effective_from,
        v.effective_to,
        v.created_at AS version_created_at
      FROM workforce_shift s
      LEFT JOIN workforce_shift_version v 
        ON v.shift_id = s.id 
        AND v.tenant_id = s.tenant_id
        AND v.id = (
          SELECT v2.id 
          FROM workforce_shift_version v2 
          WHERE v2.shift_id = s.id AND v2.tenant_id = s.tenant_id 
          ORDER BY v2.version_number DESC 
          LIMIT 1
        )
      WHERE s.id = ? AND s.tenant_id = ?
    `;
    return db.get(sql, [id, tenantId], tx);
  },

  /**
   * Find shift by unique code within tenant.
   */
  async findByCode(tenantId, code, tx = null) {
    return db.get(
      "SELECT * FROM workforce_shift WHERE tenant_id = ? AND code = ?",
      [tenantId, code],
      tx
    );
  },

  /**
   * Find the latest version of a shift.
   */
  async findLatestVersion(tenantId, shiftId, tx = null, forUpdate = false) {
    const lockClause = forUpdate ? " FOR UPDATE" : "";
    return db.get(
      `SELECT * FROM workforce_shift_version WHERE tenant_id = ? AND shift_id = ? ORDER BY version_number DESC LIMIT 1${lockClause}`,
      [tenantId, shiftId],
      tx
    );
  },

  /**
   * List all versions of a shift in descending order of version number.
   */
  async findAllVersions(tenantId, shiftId, tx = null) {
    return db.all(
      "SELECT * FROM workforce_shift_version WHERE tenant_id = ? AND shift_id = ? ORDER BY version_number DESC",
      [tenantId, shiftId],
      tx
    );
  },

  /**
   * Create a new shift header.
   */
  async createShift({ tenantId, code, name, isActive = true }, tx = null) {
    const result = await db.run(
      "INSERT INTO workforce_shift (tenant_id, code, name, is_active) VALUES (?, ?, ?, ?)",
      [tenantId, code, name, isActive ? 1 : 0],
      tx
    );
    return result.lastID;
  },

  /**
   * Create a new immutable shift version record.
   */
  async createShiftVersion(data, tx = null) {
    const {
      tenantId,
      shiftId,
      versionNumber,
      startTime,
      endTime,
      isOvernight,
      durationMinutes,
      lateGraceMinutes = 15,
      earlyDepartureGraceMinutes = 15,
      effectiveFrom,
      effectiveTo = null,
    } = data;

    const result = await db.run(
      `INSERT INTO workforce_shift_version 
        (tenant_id, shift_id, version_number, start_time, end_time, is_overnight, duration_minutes, late_grace_minutes, early_departure_grace_minutes, effective_from, effective_to)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tenantId,
        shiftId,
        versionNumber,
        startTime,
        endTime,
        isOvernight ? 1 : 0,
        durationMinutes,
        lateGraceMinutes,
        earlyDepartureGraceMinutes,
        effectiveFrom,
        effectiveTo,
      ],
      tx
    );
    return result.lastID;
  },

  /**
   * Close a shift version by setting its effective_to date.
   */
  async closeShiftVersion(versionId, tenantId, effectiveTo, tx = null) {
    return db.run(
      "UPDATE workforce_shift_version SET effective_to = ? WHERE id = ? AND tenant_id = ?",
      [effectiveTo, versionId, tenantId],
      tx
    );
  },

  /**
   * Update shift header details (code, name, is_active).
   */
  async updateShiftHeader(tenantId, id, { code, name, isActive }, tx = null) {
    return db.run(
      `UPDATE workforce_shift 
       SET code = COALESCE(?, code),
           name = COALESCE(?, name),
           is_active = COALESCE(?, is_active),
           updated_at = NOW()
       WHERE id = ? AND tenant_id = ?`,
      [
        code || null,
        name || null,
        isActive !== undefined && isActive !== null ? (isActive ? 1 : 0) : null,
        id,
        tenantId,
      ],
      tx
    );
  },

  /**
   * Set shift active/inactive status.
   */
  async setShiftStatus(tenantId, id, isActive, tx = null) {
    return db.run(
      "UPDATE workforce_shift SET is_active = ?, updated_at = NOW() WHERE id = ? AND tenant_id = ?",
      [isActive ? 1 : 0, id, tenantId],
      tx
    );
  },

  /**
   * Check references to this shift across all dependent tables.
   */
  async countShiftReferences(tenantId, shiftId, tx = null) {
    const [rosterRes, fixedRes, rotationRes] = await Promise.all([
      db.get(
        "SELECT COUNT(*) AS total FROM workforce_roster_entry WHERE tenant_id = ? AND shift_id = ?",
        [tenantId, shiftId],
        tx
      ),
      db.get(
        "SELECT COUNT(*) AS total FROM workforce_employee_fixed_assignment WHERE tenant_id = ? AND shift_id = ?",
        [tenantId, shiftId],
        tx
      ),
      db.get(
        "SELECT COUNT(*) AS total FROM workforce_rotation_step WHERE tenant_id = ? AND shift_id = ?",
        [tenantId, shiftId],
        tx
      ),
    ]);

    const rosterCount = Number(rosterRes?.total || 0);
    const fixedCount = Number(fixedRes?.total || 0);
    const rotationCount = Number(rotationRes?.total || 0);

    return {
      rosterCount,
      fixedCount,
      rotationCount,
      total: rosterCount + fixedCount + rotationCount,
    };
  },

  /**
   * Delete shift versions and shift record (used only if completely unreferenced).
   */
  async deleteShift(tenantId, id, tx = null) {
    await db.run(
      "DELETE FROM workforce_shift_version WHERE tenant_id = ? AND shift_id = ?",
      [tenantId, id],
      tx
    );
    const result = await db.run(
      "DELETE FROM workforce_shift WHERE id = ? AND tenant_id = ?",
      [id, tenantId],
      tx
    );
    return result.changes;
  },
};
