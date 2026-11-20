import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { convertLocalDateToUtcBoundaries } from "../../src/repositories/audit.repository.js";

describe("HRMS Audit Logs Module Bug Fixes Suite (BUG-AL01 to BUG-AL10)", () => {
  after(() => {
    setTimeout(() => process.exit(0), 500).unref();
  });

  // =========================================================================
  // BUG-AL01: Missing Route-Level RBAC Protection
  // =========================================================================
  describe("BUG-AL01: Missing Route-Level RBAC Protection", () => {
    it("App.jsx restricts /audit-logs route to superadmin only", () => {
      const appCode = fs.readFileSync(path.resolve("hrms_saas/src/App.jsx"), "utf8");
      assert.ok(
        appCode.includes('path="/audit-logs"') &&
        appCode.includes('<ProtectedRoute allowedRoles={["superadmin"]}>'),
        "App.jsx must guard /audit-logs with allowedRoles={['superadmin']}"
      );
    });
  });

  // =========================================================================
  // BUG-AL02: Broken Real-Time SSE Audit Broadcast Pipeline
  // =========================================================================
  describe("BUG-AL02: Broken Real-Time SSE Audit Broadcast Pipeline", () => {
    it("audit.repository.js returns db.run result with insert identifier", () => {
      const repoCode = fs.readFileSync(path.resolve("node_backend/src/repositories/audit.repository.js"), "utf8");
      assert.ok(
        repoCode.includes("return await db.run(") || repoCode.includes("return db.run("),
        "auditRepository.log must return the db.run execution result"
      );
    });

    it("audit.service.js extracts insertedId and broadcasts to targetRoles superadmin", () => {
      const serviceCode = fs.readFileSync(path.resolve("node_backend/src/services/audit.service.js"), "utf8");
      assert.ok(
        serviceCode.includes("result?.lastID || result?.insertId"),
        "auditService.log must handle both lastID and insertId from db driver"
      );
      assert.ok(
        serviceCode.includes('realtimeManager.broadcast("new_audit_log", serializedLog, { targetRoles: ["superadmin"] })'),
        "realtimeManager.broadcast must pass { targetRoles: ['superadmin'] } filter object"
      );
      assert.ok(
        !serviceCode.includes('(client) => client.role === "superadmin"'),
        "realtimeManager.broadcast must not pass a function that gets stripped by JSON serialization"
      );
    });
  });

  // =========================================================================
  // BUG-AL03: Stale React State During Search Submission
  // =========================================================================
  describe("BUG-AL03: Stale React State During Search Submission", () => {
    it("AuditLogs.jsx explicitly passes targetPage 1 on search submission", () => {
      const pageCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/AuditLogs.jsx"), "utf8");
      assert.ok(
        pageCode.includes("const handleSearchSubmit = (e) => {") &&
        pageCode.includes("setPage(1);") &&
        pageCode.includes("fetchLogs(1, true);"),
        "handleSearchSubmit must explicitly call fetchLogs with page 1"
      );
    });

    it("AuditLogs.jsx fetchLogs accepts targetPage parameter avoiding stale closures", () => {
      const pageCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/AuditLogs.jsx"), "utf8");
      assert.ok(
        pageCode.includes("const fetchLogs = async (targetPage = page"),
        "fetchLogs must accept targetPage with fallback to current page"
      );
    });
  });

  // =========================================================================
  // BUG-AL04: Race Condition in Clear Filters
  // =========================================================================
  describe("BUG-AL04: Race Condition in Clear Filters", () => {
    it("AuditLogs.jsx handleResetFilters executes without setTimeout and passes explicit cleared filters", () => {
      const pageCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/AuditLogs.jsx"), "utf8");
      assert.ok(
        !pageCode.includes("setTimeout(") && !pageCode.includes("setTimeout ("),
        "AuditLogs.jsx must not call setTimeout in handleResetFilters"
      );
      assert.ok(
        pageCode.includes("fetchLogs(1, true, {") &&
        pageCode.includes('search: ""') &&
        pageCode.includes('actionType: ""') &&
        pageCode.includes('severity: ""') &&
        pageCode.includes('sort: "desc"'),
        "handleResetFilters must pass explicit reset overrides to fetchLogs"
      );
    });
  });

  // =========================================================================
  // BUG-AL05: Entity ID Collision and Incorrect User Attribution
  // =========================================================================
  describe("BUG-AL05: Entity ID Collision and Incorrect User Attribution", () => {
    it("audit.repository.js conditionally joins accounts_user only for user-related actions", () => {
      const repoCode = fs.readFileSync(path.resolve("node_backend/src/repositories/audit.repository.js"), "utf8");
      assert.ok(
        repoCode.includes("USER_JOIN_CONDITION") || repoCode.includes("LOWER(l.action) LIKE '%user%'"),
        "auditRepository must restrict accounts_user join to user/employee/role/staff actions"
      );
      assert.ok(
        repoCode.includes("CAST(u.id AS CHAR) = CAST(l.target_id AS CHAR)"),
        "Join condition must cast integer to string preventing MySQL type coercion bugs"
      );
    });

    it("audit.repository.js search only matches user names when user join condition matched", () => {
      const repoCode = fs.readFileSync(path.resolve("node_backend/src/repositories/audit.repository.js"), "utf8");
      assert.ok(
        repoCode.includes("u.id IS NOT NULL AND (u.username LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ?)"),
        "Search query must ensure u.id IS NOT NULL before matching employee name to prevent entity collision"
      );
    });
  });

  // =========================================================================
  // BUG-AL06: Incomplete and Unsafe CSV Export
  // =========================================================================
  describe("BUG-AL06: Incomplete and Unsafe CSV Export", () => {
    it("AuditLogs.jsx fetches complete filtered dataset up to 5000 records for export", () => {
      const pageCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/AuditLogs.jsx"), "utf8");
      assert.ok(
        pageCode.includes("Math.min(Math.max(pagination.total || 50, 50), 5000)"),
        "Export must query matching records up to 5000 rather than only current page of 50"
      );
      assert.ok(
        pageCode.includes("Export contains the maximum allowed limit of 5,000 records"),
        "User must be notified when total matching records exceed export limit"
      );
    });

    it("AuditLogs.jsx neutralizes CSV formula injection and prepends UTF-8 BOM", () => {
      const pageCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/AuditLogs.jsx"), "utf8");
      assert.ok(
        pageCode.includes("sanitizeCsvValue") &&
        pageCode.includes("includes(trimmed[0])"),
        "CSV export must sanitize values starting with dangerous formula operators"
      );
      assert.ok(
        pageCode.includes('"\\uFEFF" + csvRows.join'),
        "CSV blob must prepend \\uFEFF UTF-8 Byte Order Mark for Excel Unicode support"
      );
    });
  });

  // =========================================================================
  // BUG-AL07: Unbounded Real-Time Array Growth
  // =========================================================================
  describe("BUG-AL07: Unbounded Real-Time Array Growth", () => {
    it("AuditLogs.jsx caps realtime logs to limit of 50 and recalculates pagination pages", () => {
      const pageCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/AuditLogs.jsx"), "utf8");
      assert.ok(
        pageCode.includes("[newLog, ...prev].slice(0, 50)"),
        "Real-time event handler must slice array to limit of 50"
      );
      assert.ok(
        pageCode.includes("pages: Math.ceil(newTotal / limit)"),
        "Real-time event handler must recalculate pagination.pages"
      );
    });
  });

  // =========================================================================
  // BUG-AL08: Missing Severity Filtering
  // =========================================================================
  describe("BUG-AL08: Missing Severity Filtering", () => {
    it("accounts.service.js validates severity parameter and passes clean severity to repository", () => {
      const serviceCode = fs.readFileSync(path.resolve("node_backend/src/services/accounts.service.js"), "utf8");
      assert.ok(
        serviceCode.includes('["INFO", "WARNING", "CRITICAL", "ALL", ""].includes(sev)'),
        "accounts.service.js must validate severity against allowed enum"
      );
      assert.ok(
        serviceCode.includes("Invalid severity filter"),
        "Invalid severity must trigger 400 AppError"
      );
      assert.ok(
        serviceCode.includes("severity: cleanSeverity"),
        "accounts.service.js must pass cleanSeverity to auditRepository"
      );
    });

    it("audit.repository.js filters by l.severity in SQL query", () => {
      const repoCode = fs.readFileSync(path.resolve("node_backend/src/repositories/audit.repository.js"), "utf8");
      assert.ok(
        repoCode.includes("AND l.severity = ?"),
        "findAuditLogs and getAuditLogsCount must parameterize l.severity"
      );
    });

    it("AuditLogs.jsx renders Severity filter dropdown with INFO, WARNING, and CRITICAL", () => {
      const pageCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/AuditLogs.jsx"), "utf8");
      assert.ok(
        pageCode.includes("value={severity}") &&
        pageCode.includes('<option value="INFO">INFO</option>') &&
        pageCode.includes('<option value="WARNING">WARNING</option>') &&
        pageCode.includes('<option value="CRITICAL">CRITICAL</option>'),
        "AuditLogs.jsx must render Severity filter dropdown"
      );
    });
  });

  // =========================================================================
  // BUG-AL09: Complex JSON Audit Details Formatter
  // =========================================================================
  describe("BUG-AL09: Complex JSON Audit Details Formatter", () => {
    it("AuditLogs.jsx implements renderFormattedValue preventing [object Object] crashes", () => {
      const pageCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/AuditLogs.jsx"), "utf8");
      assert.ok(
        pageCode.includes("renderFormattedValue") &&
        pageCode.includes("formatDetailKey"),
        "AuditLogs.jsx must implement recursive detail formatter"
      );
      assert.ok(
        pageCode.includes("Array.isArray(val)") &&
        pageCode.includes('"old" in val && "new" in val'),
        "renderFormattedValue must handle arrays, diff changes, and nested objects"
      );
    });
  });

  // =========================================================================
  // BUG-AL10: Timezone Date Filtering
  // =========================================================================
  describe("BUG-AL10: Timezone Date Filtering", () => {
    it("convertLocalDateToUtcBoundaries correctly converts Asia/Kolkata day boundaries to UTC", () => {
      // 2026-11-20 00:00:00 IST is 2026-11-19 18:30:00 UTC
      const startUtc = convertLocalDateToUtcBoundaries("2026-11-20", false, "Asia/Kolkata");
      assert.equal(startUtc, "2026-11-19 18:30:00", "Start of 2026-11-20 in Asia/Kolkata must equal 2026-11-19 18:30:00 UTC");

      // 2026-11-20 23:59:59 IST exclusive end (2026-11-21 00:00:00 IST) is 2026-11-20 18:30:00 UTC
      const endUtc = convertLocalDateToUtcBoundaries("2026-11-20", true, "Asia/Kolkata");
      assert.equal(endUtc, "2026-11-20 18:30:00", "Exclusive end of 2026-11-20 in Asia/Kolkata must equal 2026-11-20 18:30:00 UTC");
    });

    it("verifies prompt acceptance criteria timestamps in Asia/Kolkata", () => {
      const startUtc = convertLocalDateToUtcBoundaries("2026-11-20", false, "Asia/Kolkata");
      const endUtc = convertLocalDateToUtcBoundaries("2026-11-20", true, "Asia/Kolkata");

      // Acceptance Criteria:
      // 20 Nov 00:00 IST -> 19 Nov 18:30:00 UTC (Included)
      assert.ok("2026-11-19 18:30:00" >= startUtc && "2026-11-19 18:30:00" < endUtc);

      // 20 Nov 02:00 IST -> 19 Nov 20:30:00 UTC (Included)
      assert.ok("2026-11-19 20:30:00" >= startUtc && "2026-11-19 20:30:00" < endUtc);

      // 20 Nov 05:29 IST -> 19 Nov 23:59:00 UTC (Included)
      assert.ok("2026-11-19 23:59:00" >= startUtc && "2026-11-19 23:59:00" < endUtc);

      // 20 Nov 12:00 IST -> 20 Nov 06:30:00 UTC (Included)
      assert.ok("2026-11-20 06:30:00" >= startUtc && "2026-11-20 06:30:00" < endUtc);

      // 20 Nov 23:59 IST -> 20 Nov 18:29:00 UTC (Included)
      assert.ok("2026-11-20 18:29:00" >= startUtc && "2026-11-20 18:29:00" < endUtc);

      // 21 Nov 00:00 IST -> 20 Nov 18:30:00 UTC (Excluded: not < endUtc)
      assert.ok(!("2026-11-20 18:30:00" < endUtc), "21 Nov 00:00 IST must be excluded by exclusive < boundary");
    });

    it("audit.repository.js queries created_at >= startUtc and created_at < endUtc", () => {
      const repoCode = fs.readFileSync(path.resolve("node_backend/src/repositories/audit.repository.js"), "utf8");
      assert.ok(
        repoCode.includes("l.created_at >= ?") && repoCode.includes("l.created_at < ?"),
        "Repository must query with inclusive start and exclusive end parameters"
      );
    });
  });
});
