import test from "node:test";
import assert from "node:assert/strict";
import { financialYearStart, localDateInTimezone, splitLeaveDaysByFinancialYear } from "../../src/services/financial-leave.service.js";

test("financial year starts on 1 April and ends on 31 March", () => {
  assert.equal(financialYearStart("2026-03-31"), "2025-04-01");
  assert.equal(financialYearStart("2026-04-01"), "2026-04-01");
});

test("approved leave crossing 31 March is split between both financial years", () => {
  assert.deepEqual(splitLeaveDaysByFinancialYear("2027-03-30", "2027-04-02"), [
    { financial_year_start: "2026-04-01", financial_year_end: "2027-03-31", days: 2 },
    { financial_year_start: "2027-04-01", financial_year_end: "2028-03-31", days: 2 },
  ]);
});

test("invalid and reversed leave ranges produce no financial-year segments", () => {
  assert.deepEqual(splitLeaveDaysByFinancialYear("not-a-date", "2027-04-02"), []);
  assert.deepEqual(splitLeaveDaysByFinancialYear("2027-04-02", "2027-04-01"), []);
});

test("company local date reflects the configured timezone", () => {
  assert.equal(localDateInTimezone(new Date("2027-03-31T19:00:00.000Z"), "Asia/Kolkata"), "2027-04-01");
});
