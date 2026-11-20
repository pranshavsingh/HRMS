import { db } from "../db/index.js";
import { AppError } from "../middleware/errorHandler.js";

const GLOBAL_ROLES = new Set(["admin", "superadmin", "hr"]);

function ymd(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateOnly(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function previousDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

export const siteService = {
  isGlobalRole(role) {
    return GLOBAL_ROLES.has(role);
  },

  async listSites(tenantId, actor, { includeInactive = false } = {}) {
    const conditions = ["s.tenant_id = ?"];
    const params = [tenantId];
    if (!includeInactive) conditions.push("s.is_active = 1");
    if (!GLOBAL_ROLES.has(actor.role)) {
      if (["manager"].includes(actor.role)) {
        conditions.push("EXISTS (SELECT 1 FROM workforce_site_access sa WHERE sa.tenant_id=s.tenant_id AND sa.site_id=s.id AND sa.user_id=?)");
        params.push(actor.id);
      } else {
        conditions.push("1=0");
      }
    }
    return db.all(
      `SELECT s.id, s.tenant_id, s.code, s.name, s.address, s.is_active,
              (SELECT COUNT(*) FROM workforce_employee_site_assignment esa
               WHERE esa.tenant_id=s.tenant_id AND esa.site_id=s.id
                 AND esa.effective_from <= CURRENT_DATE()
                 AND (esa.effective_to IS NULL OR esa.effective_to >= CURRENT_DATE())) AS assigned_employee_count
       FROM workforce_site s WHERE ${conditions.join(" AND ")} ORDER BY s.name, s.id`,
      params
    );
  },

  async createSite(tenantId, data, actor) {
    const code = String(data.code || "").trim().toUpperCase();
    const name = String(data.name || "").trim();
    if (!code || !name) throw new AppError("Site code and name are required", 400);
    if (code.length > 50 || name.length > 150) throw new AppError("Site code or name is too long", 400);
    try {
      const result = await db.run(
        `INSERT INTO workforce_site (tenant_id, code, name, address, created_by, updated_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [tenantId, code, name, data.address?.trim() || null, actor.id, actor.id]
      );
      return db.get("SELECT id, tenant_id, code, name, address, is_active FROM workforce_site WHERE id = ? AND tenant_id = ?", [result.lastID || result.insertId, tenantId]);
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") throw new AppError("A site with this code already exists", 409);
      throw error;
    }
  },

  async updateSite(tenantId, siteId, data, actor) {
    const current = await db.get("SELECT * FROM workforce_site WHERE id = ? AND tenant_id = ?", [siteId, tenantId]);
    if (!current) throw new AppError("Site not found", 404);
    const code = data.code === undefined ? current.code : String(data.code).trim().toUpperCase();
    const name = data.name === undefined ? current.name : String(data.name).trim();
    if (!code || !name || code.length > 50 || name.length > 150) throw new AppError("Valid site code and name are required", 400);
    if (data.is_active === false || data.is_active === 0) {
      const activeAssignments = await db.get(
        `SELECT COUNT(*) AS total FROM workforce_employee_site_assignment
         WHERE tenant_id=? AND site_id=?
           AND (effective_to IS NULL OR effective_to>=CURRENT_DATE())`,
        [tenantId, siteId]
      );
      if (Number(activeAssignments?.total || 0) > 0) throw new AppError("Transfer currently assigned employees before deactivating this site", 409);
    }
    try {
      await db.run(
        `UPDATE workforce_site SET code = ?, name = ?, address = ?, is_active = ?, updated_by = ?
         WHERE id = ? AND tenant_id = ?`,
        [code, name, data.address === undefined ? current.address : (data.address?.trim() || null), data.is_active === undefined ? current.is_active : (data.is_active ? 1 : 0), actor.id, siteId, tenantId]
      );
    } catch (error) {
      if (error.code === "ER_DUP_ENTRY") throw new AppError("A site with this code already exists", 409);
      throw error;
    }
    return db.get("SELECT id, tenant_id, code, name, address, is_active FROM workforce_site WHERE id = ? AND tenant_id = ?", [siteId, tenantId]);
  },

  async deleteSite(tenantId, siteId, actor) {
    if (actor?.role !== "superadmin") {
      throw new AppError("Only superadmin can delete a work site", 403);
    }
    const current = await db.get("SELECT * FROM workforce_site WHERE id = ? AND tenant_id = ?", [siteId, tenantId]);
    if (!current) throw new AppError("Site not found", 404);

    const [attCount, leaveCount, rosterCount, rosterEntryCount] = await Promise.all([
      db.get("SELECT COUNT(*) AS total FROM attendance_attendance WHERE tenant_id = ? AND site_id = ?", [tenantId, siteId]),
      db.get("SELECT COUNT(*) AS total FROM leave_leave WHERE site_id = ?", [siteId]),
      db.get("SELECT COUNT(*) AS total FROM workforce_roster_header WHERE tenant_id = ? AND site_id = ?", [tenantId, siteId]),
      db.get("SELECT COUNT(*) AS total FROM workforce_roster_entry WHERE tenant_id = ? AND site_id = ?", [tenantId, siteId]),
    ]);

    const linkedRecords = Number(attCount?.total || 0) + Number(leaveCount?.total || 0) + Number(rosterCount?.total || 0) + Number(rosterEntryCount?.total || 0);
    if (linkedRecords > 0) {
      throw new AppError("Cannot permanently delete this site because historical attendance, leave, or roster records are linked to it. You can deactivate the site instead.", 409);
    }

    await db.transaction(async (tx) => {
      await tx.run("DELETE FROM workforce_employee_site_assignment WHERE tenant_id = ? AND site_id = ?", [tenantId, siteId]);
      await tx.run("DELETE FROM workforce_site_access WHERE tenant_id = ? AND site_id = ?", [tenantId, siteId]);
      await tx.run("DELETE FROM workforce_site WHERE id = ? AND tenant_id = ?", [siteId, tenantId]);
    });

    return { message: "Work site deleted successfully", id: Number(siteId) };
  },

  async getEmployeeSiteId(tenantId, userId, workDate = ymd(), executor = db) {
    const assignment = await executor.get(
      `SELECT site_id FROM workforce_employee_site_assignment
       WHERE tenant_id = ? AND user_id = ? AND effective_from <= ?
         AND (effective_to IS NULL OR effective_to >= ?)
       ORDER BY effective_from DESC, id DESC LIMIT 1`,
      [tenantId, userId, workDate, workDate]
    );
    return assignment ? Number(assignment.site_id) : null;
  },

  async assignEmployee(tenantId, userId, siteId, effectiveFrom = ymd(), actor, executor = db) {
    if (executor === db) {
      return db.transaction((tx) => this.assignEmployee(tenantId, userId, siteId, effectiveFrom, actor, tx));
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(effectiveFrom))) throw new AppError("effective_from must be a YYYY-MM-DD date", 400);
    const membership = await executor.get(
      "SELECT user_id, role FROM workforce_user_tenant WHERE tenant_id = ? AND user_id = ? AND is_active = 1 FOR UPDATE",
      [tenantId, userId]
    );
    if (!membership) throw new AppError("Employee is not active in this organization", 404);
    const site = await executor.get("SELECT id FROM workforce_site WHERE tenant_id = ? AND id = ? AND is_active = 1", [tenantId, siteId]);
    if (!site) throw new AppError("Active site not found", 404);

    const assignments = await executor.all(
      `SELECT id, site_id, effective_from, effective_to FROM workforce_employee_site_assignment
       WHERE tenant_id = ? AND user_id = ?
         AND (effective_to IS NULL OR effective_to >= ?)
       ORDER BY effective_from, id FOR UPDATE`,
      [tenantId, userId, effectiveFrom]
    );
    const exact = assignments.find((row) => dateOnly(row.effective_from) === effectiveFrom);
    if (exact) {
      if (Number(exact.site_id) === Number(siteId) && !exact.effective_to) {
        return Number(exact.id);
      }
      await executor.run(
        "UPDATE workforce_employee_site_assignment SET site_id = ?, effective_to = NULL WHERE id = ? AND tenant_id = ?",
        [siteId, exact.id, tenantId]
      );
      return Number(exact.id);
    }
    const futureConflict = assignments.find((row) => dateOnly(row.effective_from) > effectiveFrom);
    if (futureConflict) throw new AppError("A site assignment already starts after this date. Choose a date after the existing assignment or correct the assignment history first.", 409);

    for (const row of assignments) {
      if (dateOnly(row.effective_from) < effectiveFrom
        && (!row.effective_to || dateOnly(row.effective_to) >= effectiveFrom)) {
        await executor.run("UPDATE workforce_employee_site_assignment SET effective_to = ? WHERE id = ? AND tenant_id = ?", [previousDate(effectiveFrom), row.id, tenantId]);
      }
    }

    const result = await executor.run(
      `INSERT INTO workforce_employee_site_assignment
       (tenant_id, user_id, site_id, effective_from, effective_to, created_by)
       VALUES (?, ?, ?, ?, NULL, ?)`,
      [tenantId, userId, siteId, effectiveFrom, actor?.id || null]
    );
    return Number(result.lastID || result.insertId);
  },

  async listSiteAssignments(tenantId, siteId) {
    const rows = await db.all(
      `SELECT esa.id, esa.user_id, esa.site_id, esa.effective_from, esa.effective_to,
              u.username, u.first_name, u.last_name, u.role
       FROM workforce_employee_site_assignment esa
       JOIN workforce_user_tenant wut ON wut.tenant_id=esa.tenant_id AND wut.user_id=esa.user_id
       JOIN accounts_user u ON u.id=esa.user_id
       WHERE esa.tenant_id=? AND esa.site_id=?
       ORDER BY esa.effective_from DESC, esa.id DESC`,
      [tenantId, siteId]
    );
    return rows.map((row) => ({ ...row, effective_from: dateOnly(row.effective_from), effective_to: row.effective_to ? dateOnly(row.effective_to) : null }));
  },

  async grantSiteAccess(tenantId, userId, siteId, actor) {
    const membership = await db.get(
      "SELECT role FROM workforce_user_tenant WHERE tenant_id = ? AND user_id = ? AND is_active = 1",
      [tenantId, userId]
    );
    if (!membership || !["hr", "manager"].includes(membership.role)) throw new AppError("Site access can only be granted to an active HR user or manager", 400);
    const site = await db.get("SELECT id FROM workforce_site WHERE tenant_id = ? AND id = ? AND is_active = 1", [tenantId, siteId]);
    if (!site) throw new AppError("Active site not found", 404);
    await db.run(
      "INSERT INTO workforce_site_access (tenant_id, user_id, site_id, created_by) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = id",
      [tenantId, userId, siteId, actor.id]
    );
    return { user_id: Number(userId), site_id: Number(siteId), access: "granted" };
  },

  async listSiteAccess(tenantId, siteId) {
    return db.all(
      `SELECT sa.user_id, u.username, u.first_name, u.last_name, u.role
       FROM workforce_site_access sa JOIN accounts_user u ON u.id = sa.user_id
       WHERE sa.tenant_id = ? AND sa.site_id = ? ORDER BY u.first_name, u.username`,
      [tenantId, siteId]
    );
  },

  async revokeSiteAccess(tenantId, userId, siteId) {
    await db.run("DELETE FROM workforce_site_access WHERE tenant_id = ? AND user_id = ? AND site_id = ?", [tenantId, userId, siteId]);
    return { user_id: Number(userId), site_id: Number(siteId), access: "revoked" };
  },

  async getSiteScope(tenantId, actor, requestedSiteId = null) {
    if (GLOBAL_ROLES.has(actor.role)) {
      if (!requestedSiteId || requestedSiteId === "all") return { siteIds: null, unassigned: false };
      if (requestedSiteId === "unassigned") return { siteIds: [], unassigned: true };
      const siteId = Number(requestedSiteId);
      if (!Number.isInteger(siteId) || siteId < 1) throw new AppError("Invalid site", 400);
      const site = await db.get("SELECT id FROM workforce_site WHERE tenant_id = ? AND id = ?", [tenantId, siteId]);
      if (!site) throw new AppError("Site not found", 404);
      return { siteIds: [siteId], unassigned: false };
    }

    if (!(["hr", "manager"].includes(actor.role))) throw new AppError("No site access", 403);
    const rows = await db.all(
      `SELECT s.id FROM workforce_site_access sa JOIN workforce_site s
         ON s.id = sa.site_id AND s.tenant_id = sa.tenant_id
       WHERE sa.tenant_id = ? AND sa.user_id = ? AND s.is_active = 1 ORDER BY s.id`,
      [tenantId, actor.id]
    );
    const allowed = rows.map((row) => Number(row.id));
    if (!requestedSiteId || requestedSiteId === "all") return { siteIds: allowed, unassigned: false };
    if (requestedSiteId === "unassigned") throw new AppError("You do not have access to unassigned employee records", 403);
    const siteId = Number(requestedSiteId);
    if (!Number.isInteger(siteId) || !allowed.includes(siteId)) throw new AppError("You do not have access to this site", 403);
    return { siteIds: [siteId], unassigned: false };
  },

  async ensureEmployeeVisible(tenantId, actor, employeeId, { requireDirectReport = false, workDate = ymd() } = {}) {
    const member = await db.get("SELECT 1 AS present FROM workforce_user_tenant WHERE tenant_id=? AND user_id=?", [tenantId, employeeId]);
    if (!member) throw new AppError("Employee not found in this organization", 404);
    if (Number(actor.id) === Number(employeeId)) return true;
    if (GLOBAL_ROLES.has(actor.role)) return true;
    if (!["hr", "manager"].includes(actor.role)) throw new AppError("You do not have permission to view this employee", 403);
    const resolvedWorkDate = workDate instanceof Date
      ? ymd(workDate)
      : (/^\d{4}-\d{2}-\d{2}/.test(String(workDate)) ? String(workDate).slice(0, 10) : ymd());
    const siteId = await this.getEmployeeSiteId(tenantId, employeeId, resolvedWorkDate);
    if (!siteId) {
      if (actor.role === "hr") return true;
      throw new AppError("Employee has no site assignment for this date", 403);
    }
    const accessible = await db.get(
      `SELECT 1 AS allowed FROM workforce_site_access sa
       JOIN workforce_site s ON s.id=sa.site_id AND s.tenant_id=sa.tenant_id AND s.is_active=1
       WHERE sa.tenant_id = ? AND sa.user_id = ? AND sa.site_id = ?`,
      [tenantId, actor.id, siteId]
    );
    if (!accessible) throw new AppError("You do not have access to this employee's site", 403);
    if (requireDirectReport || actor.role === "manager") {
      const report = await db.get("SELECT 1 AS allowed FROM accounts_employeeprofile WHERE user_id = ? AND manager_id = ?", [employeeId, actor.id]);
      if (!report) throw new AppError("You do not have permission to view this employee", 403);
    }
    return true;
  },
};

export default siteService;
