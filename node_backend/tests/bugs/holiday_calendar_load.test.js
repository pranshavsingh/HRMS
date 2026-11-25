import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

describe("BUG FIX VERIFICATION: Holiday Calendar Loading Failure Resolution", () => {
  const holidaysScreenPath = fs.existsSync(path.resolve("hrms_mobile/src/app/holidays.tsx"))
    ? path.resolve("hrms_mobile/src/app/holidays.tsx")
    : path.resolve("../hrms_mobile/src/app/holidays.tsx");
  const repoPath = path.resolve("node_backend/src/repositories/company-holiday.repository.js");
  const servicePath = path.resolve("node_backend/src/services/company-holiday.service.js");

  it("1. holidays.tsx uses formatCompanyDate and safe date formatting", () => {
    const content = fs.readFileSync(holidaysScreenPath, "utf8");
    assert.ok(
      content.includes("formatCompanyDate"),
      "holidays.tsx must import and use formatCompanyDate"
    );
    assert.ok(
      content.includes("formattedDate"),
      "holidays.tsx must render formattedDate styling"
    );
  });

  it("2. holidays.tsx safely handles diverse response envelopes", () => {
    const content = fs.readFileSync(holidaysScreenPath, "utf8");
    assert.ok(
      content.includes("Array.isArray(response.data?.holidays)") ||
      content.includes("response.data?.holidays"),
      "holidays.tsx must safely extract holidays array from response"
    );
  });

  it("3. holidays.tsx displays backend error messages when available", () => {
    const content = fs.readFileSync(holidaysScreenPath, "utf8");
    assert.ok(
      content.includes("err?.response?.data?.error"),
      "holidays.tsx should surface specific backend error when present"
    );
  });

  it("4. companyHolidayRepository and companyHolidayService execute list query without column errors", async () => {
    const { companyHolidayService } = await import("../../src/services/company-holiday.service.js");
    const results = await companyHolidayService.list(1, { from: "2026-11-01", to: "2026-11-30" });
    assert.ok(Array.isArray(results), "companyHolidayService.list must return an array of holidays");
    if (results.length > 0) {
      assert.ok("name" in results[0], "Holiday record must contain 'name'");
      assert.ok("holiday_date" in results[0], "Holiday record must contain 'holiday_date'");
      assert.ok("description" in results[0], "Holiday record must contain 'description'");
    }
  });
});
