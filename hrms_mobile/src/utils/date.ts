/**
 * Enterprise date formatting utilities for HRMS Mobile Application.
 * Standardizes all date presentation to enterprise Indian English standard (DD MMM YYYY).
 * Eliminates timezone boundary drift defects when parsing UTC / ISO date strings.
 */

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

/**
 * Formats a date value (ISO timestamp, Date object, or YYYY-MM-DD string) to "DD MMM YYYY" (e.g. "24 Nov 2026").
 */
export function formatCompanyDate(value: Date | string | number | null | undefined): string {
  if (!value) return "--";

  // If string, handle date-only YYYY-MM-DD or full ISO
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return "--";

    // Match YYYY-MM-DD
    const ymdMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (ymdMatch) {
      const year = parseInt(ymdMatch[1], 10);
      const monthIdx = parseInt(ymdMatch[2], 10) - 1;
      const day = parseInt(ymdMatch[3], 10);

      if (monthIdx >= 0 && monthIdx < 12 && day >= 1 && day <= 31) {
        const dayStr = String(day).padStart(2, "0");
        const monthStr = MONTHS_SHORT[monthIdx];
        return `${dayStr} ${monthStr} ${year}`;
      }
    }
  }

  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);

  const day = String(d.getDate()).padStart(2, "0");
  const month = MONTHS_SHORT[d.getMonth()];
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

/**
 * Formats a timestamp into "DD MMM YYYY, hh:mm A" (e.g. "24 Nov 2026, 07:01 PM").
 */
export function formatCompanyDateTime(value: Date | string | number | null | undefined): string {
  if (!value) return "--";
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);

  const datePart = formatCompanyDate(d);
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, "0");
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 becomes 12
  const hourStr = String(hours).padStart(2, "0");

  return `${datePart}, ${hourStr}:${minutes} ${ampm}`;
}

/**
 * Formats a time string (e.g. "18:30:00" or "09:15") to 12-hour format "hh:mm A" (e.g. "06:30 PM").
 */
export function formatCompanyTime(timeStr: string | null | undefined): string {
  if (!timeStr || timeStr === "--") return "--";
  const match = String(timeStr).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return String(timeStr);

  let hours = parseInt(match[1], 10);
  const minutes = match[2];
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  hours = hours ? hours : 12;
  const hourStr = String(hours).padStart(2, "0");

  return `${hourStr}:${minutes} ${ampm}`;
}

/**
 * Formats a date range into "DD MMM YYYY to DD MMM YYYY", or single date if identical.
 */
export function formatCompanyDateRange(from: any, to: any): string {
  if (!from && !to) return "--";
  const formattedFrom = formatCompanyDate(from);
  const formattedTo = formatCompanyDate(to);

  if (formattedFrom === formattedTo) {
    return formattedFrom;
  }
  return `${formattedFrom} to ${formattedTo}`;
}

/**
 * Returns today's date formatted as YYYY-MM-DD for form inputs and API query parameters.
 */
export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
