import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test("HISTORY PAGE BUG FIXES VERIFICATION", async (t) => {
  const historyPagePath = path.resolve(__dirname, "../../../hrms_saas/src/pages/AttendanceHistory.jsx");
  const attendanceServicePath = path.resolve(__dirname, "../../src/services/attendance.service.js");

  const historyCode = fs.readFileSync(historyPagePath, "utf8");
  const serviceCode = fs.readFileSync(attendanceServicePath, "utf8");

  await t.test("BUG 1: Eliminates undeclared 'filters.' variable causing ReferenceError crash", () => {
    assert.strictEqual(
      historyCode.includes("filters.startDate"),
      false,
      "AttendanceHistory.jsx must not reference undeclared filters.startDate"
    );
    assert.strictEqual(
      historyCode.includes("filters.endDate"),
      false,
      "AttendanceHistory.jsx must not reference undeclared filters.endDate"
    );
    assert.strictEqual(
      historyCode.includes("appliedFilters.startDate") && historyCode.includes("appliedFilters.endDate"),
      true,
      "AttendanceHistory.jsx must reference appliedFilters.startDate and appliedFilters.endDate"
    );
  });

  await t.test("BUG 2: getReviewLabel handles pending/rejected statuses with fallbacks", () => {
    assert.strictEqual(
      historyCode.includes("item.punch_in === \"Pending\""),
      true,
      "getReviewLabel must have fallback for pending punch status string"
    );
    assert.strictEqual(
      historyCode.includes("item.status === \"pending\""),
      true,
      "getReviewLabel must have fallback for pending record status"
    );
  });

  await t.test("BUG 3: Backend getHistory provides punch_in_status, punch_out_status, and Asia/Kolkata timezone", () => {
    assert.strictEqual(
      serviceCode.includes("punch_in_status: att.punch_in_status"),
      true,
      "getHistory payload must include punch_in_status"
    );
    assert.strictEqual(
      serviceCode.includes("punch_out_status: att.punch_out_status"),
      true,
      "getHistory payload must include punch_out_status"
    );
    assert.strictEqual(
      serviceCode.includes("timeZone: \"Asia/Kolkata\""),
      true,
      "getHistory payload must format times with Asia/Kolkata timezone"
    );
  });

  await t.test("BUG 4: handleApplyFilters and handleResetFilters reset pagination to page 1", () => {
    assert.strictEqual(
      historyCode.includes("pagination.setPage(1)"),
      true,
      "AttendanceHistory.jsx must reset pagination to page 1 on filter change"
    );
  });
});
