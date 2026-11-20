import { db } from "../db/index.js";

const HOLIDAY_COLUMNS = `id, tenant_id, holiday_date, name, description, is_optional,
  created_at, updated_at, created_by, updated_by`;

export const companyHolidayRepository = {
  list(tenantId, { from, to, search = "", limit = 500 } = {}) {
    const conditions = ["tenant_id = ?", "holiday_date BETWEEN ? AND ?"];
    const params = [tenantId, from, to];
    if (search.trim()) {
      conditions.push("(name LIKE ? OR description LIKE ?)");
      const term = `%${search.trim()}%`;
      params.push(term, term);
    }
    params.push(limit);
    return db.all(
      `SELECT ${HOLIDAY_COLUMNS} FROM workforce_company_holiday
       WHERE ${conditions.join(" AND ")} ORDER BY holiday_date ASC, id ASC LIMIT ?`,
      params
    );
  },

  upcoming(tenantId, { from, limit = 50 } = {}) {
    return db.all(
      `SELECT ${HOLIDAY_COLUMNS} FROM workforce_company_holiday
       WHERE tenant_id = ? AND holiday_date >= ?
       ORDER BY holiday_date ASC, id ASC LIMIT ?`,
      [tenantId, from, limit]
    );
  },

  get(tenantId, holidayId, tx = null) {
    return db.get(
      `SELECT ${HOLIDAY_COLUMNS} FROM workforce_company_holiday WHERE id = ? AND tenant_id = ?`,
      [holidayId, tenantId],
      tx
    );
  },
};

export default companyHolidayRepository;
