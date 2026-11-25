export const COMPANY_TIMEZONE = "Asia/Kolkata";

/**
 * Returns today's date or an offset date as YYYY-MM-DD in company timezone (Asia/Kolkata).
 * Eliminates UTC date boundary shift defects for users in India.
 *
 * @param {Date|string|number} [date=new Date()] Base date
 * @param {number} [offsetDays=0] Positive number to subtract days (e.g. 29 for 29 days ago)
 * @returns {string} YYYY-MM-DD format
 */
export function getCompanyLocalDate(date = new Date(), offsetDays = 0) {
  let target = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(target.getTime())) target = new Date();
  if (offsetDays !== 0) {
    target = new Date(target.getTime() - offsetDays * 24 * 60 * 60 * 1000);
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: COMPANY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(target);

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;

  return `${year}-${month}-${day}`;
}

/**
 * Formats a date value (ISO timestamp or YYYY-MM-DD date string) as DD MMM YYYY in company timezone.
 *
 * @param {Date|string|number} value
 * @param {Intl.DateTimeFormatOptions} [options]
 * @returns {string} e.g. "23 Nov 2026"
 */
export function formatCompanyDate(value, options = {}) {
  if (!value) return "--";

  // If date-only string YYYY-MM-DD, parse year/month/day at noon to avoid timezone boundary shifts
  if (typeof value === "string") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [, y, m, d] = match;
      const date = new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0);
      return new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: COMPANY_TIMEZONE,
        ...options,
      }).format(date);
    }
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: COMPANY_TIMEZONE,
    ...options,
  }).format(date);
}

/**
 * Formats a timestamp as DD MMM YYYY, hh:mm a in company timezone.
 *
 * @param {Date|string|number} value
 * @returns {string} e.g. "23 Nov 2026, 03:30 pm"
 */
export function formatCompanyDateTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: COMPANY_TIMEZONE,
  }).format(date);
}

/**
 * Formats a time value as hh:mm a in company timezone.
 *
 * @param {Date|string|number} value
 * @returns {string} e.g. "09:30 AM"
 */
export function formatCompanyTime(value) {
  if (!value || value === "--" || value === "Pending") return value || "--";

  if (typeof value === "string" && /^\d{1,2}:\d{2}(:\d{2})?$/.test(value.trim())) {
    const [h, m] = value.trim().split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: COMPANY_TIMEZONE,
  }).format(date);
}
