import { db } from "../db/index.js";
import { AppError } from "../middleware/errorHandler.js";
import auditService from "./audit.service.js";
import companyHolidayRepository from "../repositories/company-holiday.repository.js";
import { realtimeService } from "./realtime.service.js";
import notificationService from "./notification.service.js";

const validDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

function normalizeHolidayInput(data, { partial = false } = {}) {
  const result = {};
  if (!partial || data.name !== undefined) {
    const name = typeof data.name === "string" ? data.name.trim() : "";
    if (!name) throw new AppError("Holiday name is required.", 400);
    if (name.length > 255) throw new AppError("Holiday name must be 255 characters or fewer.", 400);
    result.name = name;
  }
  if (!partial || data.holiday_date !== undefined) {
    if (!validDate(data.holiday_date)) throw new AppError("Holiday date must be a valid YYYY-MM-DD date.", 400);
    result.holiday_date = data.holiday_date;
  }
  if (!partial || data.description !== undefined) {
    const description = typeof data.description === "string" ? data.description.trim() : "";
    if (!description) throw new AppError("Holiday reason is required.", 400);
    if (description.length > 1000) throw new AppError("Holiday reason must be 1000 characters or fewer.", 400);
    result.description = description;
  }
  if (data.is_optional !== undefined) {
    if (![true, false, 0, 1, "0", "1"].includes(data.is_optional)) {
      throw new AppError("is_optional must be a boolean.", 400);
    }
    result.is_optional = data.is_optional === true || data.is_optional === 1 || data.is_optional === "1" ? 1 : 0;
  } else if (!partial) {
    result.is_optional = 0;
  }
  return result;
}

function validateRange(from, to) {
  if (!validDate(from) || !validDate(to)) {
    throw new AppError("Both from and to must be valid YYYY-MM-DD dates.", 400);
  }
  if (from > to) throw new AppError("The end date must be on or after the start date.", 400);
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000;
  if (days > 1095) throw new AppError("The requested date range cannot exceed three years.", 400);
}

function normalizeLimit(value, fallback, max) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(1, parsed)) : fallback;
}

function mapDuplicateError(error) {
  if (error?.code === "ER_DUP_ENTRY" || error?.errno === 1062) {
    throw new AppError("A holiday already exists for this date in the selected tenant.", 409);
  }
  throw error;
}

export const companyHolidayService = {
  async list(tenantId, query = {}) {
    validateRange(query.from, query.to);
    return companyHolidayRepository.list(tenantId, {
      from: query.from,
      to: query.to,
      search: typeof query.search === "string" ? query.search : "",
      limit: normalizeLimit(query.limit, 500, 500),
    });
  },

  async upcoming(tenantId, query = {}) {
    const from = query.from || new Date().toISOString().slice(0, 10);
    if (!validDate(from)) throw new AppError("from must be a valid YYYY-MM-DD date.", 400);
    return companyHolidayRepository.upcoming(tenantId, {
      from,
      limit: normalizeLimit(query.limit, 50, 200),
    });
  },

  async get(tenantId, holidayId) {
    const holiday = await companyHolidayRepository.get(tenantId, holidayId);
    if (!holiday) throw new AppError("Holiday not found.", 404);
    return holiday;
  },

  async create(tenantId, data, actor, ipAddress = null) {
    const values = normalizeHolidayInput(data);
    let holiday;
    try {
      holiday = await db.transaction(async (tx) => {
        const [result] = await tx.execute(
          `INSERT INTO workforce_company_holiday
             (tenant_id, holiday_date, name, description, is_optional, created_by, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [tenantId, values.holiday_date, values.name, values.description, values.is_optional, actor.id, actor.id]
        );
        const created = await companyHolidayRepository.get(tenantId, result.insertId, tx);
        await auditService.log(actor, "COMPANY_HOLIDAY_CREATED", result.insertId, { after: created }, ipAddress, "INFO", tx);
        return created;
      });
    } catch (error) {
      mapDuplicateError(error);
    }
    realtimeService.emitToTenant(tenantId, "holiday:created", { holidayId: holiday.id });
    void notificationService.safeNotify(() =>
      notificationService.notifyTenantUsers({
        tenantId,
        actorId: actor.id,
        type: "holiday:created",
        category: "HOLIDAY",
        title: "New Company Holiday",
        message: `${holiday.name} on ${holiday.holiday_date} has been added to the holiday calendar.`,
        actionUrl: "/holidays",
        dedupePrefix: `holiday:created:${holiday.id}`,
      })
    );
    return holiday;
  },

  async update(tenantId, holidayId, data, actor, ipAddress = null) {
    const values = normalizeHolidayInput(data, { partial: true });
    if (!Object.keys(values).length) throw new AppError("At least one holiday field must be provided.", 400);
    let holiday;
    try {
      holiday = await db.transaction(async (tx) => {
        const before = await companyHolidayRepository.get(tenantId, holidayId, tx);
        if (!before) throw new AppError("Holiday not found.", 404);
        const fields = Object.keys(values);
        const assignments = fields.map((field) => `${field} = ?`).join(", ");
        await tx.execute(
          `UPDATE workforce_company_holiday SET ${assignments}, updated_by = ?
           WHERE id = ? AND tenant_id = ?`,
          [...fields.map((field) => values[field]), actor.id, holidayId, tenantId]
        );
        const after = await companyHolidayRepository.get(tenantId, holidayId, tx);
        await auditService.log(actor, "COMPANY_HOLIDAY_UPDATED", holidayId, { before, after }, ipAddress, "INFO", tx);
        return after;
      });
    } catch (error) {
      mapDuplicateError(error);
    }
    realtimeService.emitToTenant(tenantId, "holiday:updated", { holidayId: holiday.id });
    void notificationService.safeNotify(() =>
      notificationService.notifyTenantUsers({
        tenantId,
        actorId: actor.id,
        type: "holiday:updated",
        category: "HOLIDAY",
        title: "Holiday Calendar Updated",
        message: `${holiday.name} (${holiday.holiday_date}) has been updated in the holiday calendar.`,
        actionUrl: "/holidays",
        dedupePrefix: `holiday:updated:${holiday.id}:${Date.now()}`,
      })
    );
    return holiday;
  },

  async delete(tenantId, holidayId, actor, ipAddress = null) {
    const deleted = await db.transaction(async (tx) => {
      const before = await companyHolidayRepository.get(tenantId, holidayId, tx);
      if (!before) throw new AppError("Holiday not found.", 404);
      await auditService.log(actor, "COMPANY_HOLIDAY_DELETED", holidayId, { before }, ipAddress, "WARNING", tx);
      await tx.execute("DELETE FROM workforce_company_holiday WHERE id = ? AND tenant_id = ?", [holidayId, tenantId]);
      return before;
    });
    realtimeService.emitToTenant(tenantId, "holiday:deleted", { holidayId: Number(holidayId) });
    void notificationService.safeNotify(() =>
      notificationService.notifyTenantUsers({
        tenantId,
        actorId: actor.id,
        type: "holiday:deleted",
        category: "HOLIDAY",
        title: "Company Holiday Removed",
        message: `${deleted.name} (${deleted.holiday_date}) has been removed from the holiday calendar.`,
        actionUrl: "/holidays",
        dedupePrefix: `holiday:deleted:${holidayId}`,
      })
    );
    return { id: Number(holidayId), holiday_date: deleted.holiday_date, message: "Holiday deleted." };
  },

  async listTenants() {
    return db.all("SELECT id, code, name FROM workforce_tenant WHERE is_active = 1 ORDER BY name ASC, id ASC");
  },
};

export default companyHolidayService;
