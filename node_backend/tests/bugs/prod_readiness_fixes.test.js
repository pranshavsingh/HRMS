import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(__dirname, "../../src");

describe("Production Readiness Bug Regression Tests (BUG-PROD-001..003)", () => {
  it("BUG-PROD-001: auditService.log references user?.tenant_id, not undefined actor", () => {
    const src = fs.readFileSync(path.join(SRC, "services/audit.service.js"), "utf8");
    assert.ok(!src.includes("actor?.tenant_id"), "audit.service.js must not reference undefined actor");
    assert.ok(src.includes("user?.tenant_id"), "audit.service.js must reference user?.tenant_id");
  });

  it("BUG-PROD-002: db/index.js sets MySQL session time_zone = '+00:00' on pool connection", () => {
    const src = fs.readFileSync(path.join(SRC, "db/index.js"), "utf8");
    assert.ok(src.includes("SET time_zone = '+00:00'"), "db/index.js must align MySQL session time_zone with timezone: 'Z'");
  });

  it("BUG-PROD-003: siteService does not query non-existent can_view column on workforce_site_access", () => {
    const src = fs.readFileSync(path.join(SRC, "services/site.service.js"), "utf8");
    assert.ok(!src.includes("can_view"), "site.service.js must not reference non-existent can_view column");
  });
});
