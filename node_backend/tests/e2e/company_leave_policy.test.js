import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../src/db/index.js";
import { startTestServer, teardownAll } from "./harness/test-server.js";
import { HttpClient } from "./harness/http-client.js";
import { createTestUser, deleteTestUser } from "./harness/fixtures.js";

describe("Company Leave Policy — Data Consistency, Calculations, Eligibility & RBAC E2E", () => {
  let serverInfo;
  let empUser;
  let mgrUser;
  let hrUser;
  let adminUser;
  let superUser;
  let empClient;
  let mgrClient;
  let hrClient;
  let adminClient;
  let superClient;
  const createdDraftIds = [];
  const createdEligibilityIds = [];

  before(async () => {
    serverInfo = await startTestServer();
    const ts = Date.now();
    empUser = await createTestUser({ username: `clp_emp_${ts}`, password: "ValidPassword123!", role: "employee" });
    mgrUser = await createTestUser({ username: `clp_mgr_${ts}`, password: "ValidPassword123!", role: "manager" });
    hrUser = await createTestUser({ username: `clp_hr_${ts}`, password: "ValidPassword123!", role: "hr" });
    adminUser = await createTestUser({ username: `clp_adm_${ts}`, password: "ValidPassword123!", role: "admin" });
    superUser = await createTestUser({ username: `clp_sup_${ts}`, password: "ValidPassword123!", role: "superadmin" });

    const login = async (username) => {
      const c = new HttpClient({ baseUrl: serverInfo.baseUrl });
      const res = await c.post("/api/auth/login/", { username, password: "ValidPassword123!", platform: "web" });
      assert.equal(res.status, 200);
      const token = res.body?.data?.access || res.body?.access;
      c.setHeader("Authorization", `Bearer ${token}`);
      return c;
    };

    [empClient, mgrClient, hrClient, adminClient, superClient] = await Promise.all([
      login(empUser.username),
      login(mgrUser.username),
      login(hrUser.username),
      login(adminUser.username),
      login(superUser.username),
    ]);
  });

  after(async () => {
    for (const id of createdEligibilityIds) {
      await db.run("DELETE FROM workforce_employee_leave_eligibility WHERE id = ?", [id]);
    }
    for (const id of createdDraftIds) {
      await db.run("DELETE FROM workforce_leave_type_policy WHERE policy_version_id = ?", [id]);
      await db.run("DELETE FROM workforce_leave_policy_version WHERE id = ?", [id]);
    }
    for (const uid of [empUser?.id, mgrUser?.id, hrUser?.id, adminUser?.id, superUser?.id].filter(Boolean)) {
      await deleteTestUser(uid);
    }
    await teardownAll();
  });

  it("1. Enforces RBAC: HR, Admin & Superadmin allowed; Employee & Manager get 403", async () => {
    for (const client of [empClient, mgrClient]) {
      const getRes = await client.get("/api/leave/policy/");
      assert.equal(getRes.status, 403);
      const postRes = await client.post("/api/leave/policy/reset-runs/reconcile/", {});
      assert.equal(postRes.status, 403);
    }

    for (const client of [hrClient, adminClient, superClient]) {
      const getRes = await client.get("/api/leave/policy/");
      assert.equal(getRes.status, 200);
    }
  });

  it("2. Returns non-null current published policy when effective_from_fy_start <= today", async () => {
    const res = await adminClient.get("/api/leave/policy/");
    assert.equal(res.status, 200);
    const publishedInHistory = (res.body?.versions || []).find((v) => v.status === "published");
    if (publishedInHistory) {
      assert.ok(res.body.current || res.body.latest_published, "Published policy must be reflected in current/latest_published");
      if (String(publishedInHistory.effective_from_fy_start).slice(0, 10) <= new Date().toISOString().slice(0, 10)) {
        assert.ok(res.body.current, "current must not be null when published policy is already effective");
        assert.equal(res.body.current.status, "published");
      }
    }
  });

  it("3. Rejects duplicate leave_code and saves/previews valid draft policy", async () => {
    const dupRes = await adminClient.post("/api/leave/policy/drafts/", {
      reason: "Test duplicate check",
      timezone: "Asia/Kolkata",
      effective_from_fy_start: "2099-04-01",
      financial_year_start_month: 4,
      financial_year_start_day: 1,
      automatic_reset: true,
      legacy_shared_pool_enabled: false,
      proration_method: "none",
      leave_types: [
        {
          leave_code: "casual", leave_name: "Casual Leave", annual_entitlement: 12, is_paid: true,
          carry_forward_enabled: false, max_carry_forward_days: 0, expired_balance_forfeited: true,
          carry_forward_requires_approval: false, minimum_application_days: 1, half_day_allowed: false,
          requires_approval: true, requires_document: false, accrual_frequency: "none",
          probation_restriction_months: 0, active_status: true,
        },
        {
          leave_code: "casual", leave_name: "Casual Dup", annual_entitlement: 5, is_paid: true,
          carry_forward_enabled: false, max_carry_forward_days: 0, expired_balance_forfeited: true,
          carry_forward_requires_approval: false, minimum_application_days: 1, half_day_allowed: false,
          requires_approval: true, requires_document: false, accrual_frequency: "none",
          probation_restriction_months: 0, active_status: true,
        },
      ],
    });
    assert.equal(dupRes.status, 400);

    const okRes = await adminClient.post("/api/leave/policy/drafts/", {
      reason: "E2E valid typed draft",
      timezone: "Asia/Kolkata",
      effective_from_fy_start: "2099-04-01",
      financial_year_start_month: 4,
      financial_year_start_day: 1,
      automatic_reset: true,
      legacy_shared_pool_enabled: false,
      proration_method: "monthly",
      leave_types: [
        {
          leave_code: "casual", leave_name: "Casual Leave", annual_entitlement: 12.5, is_paid: true,
          carry_forward_enabled: true, max_carry_forward_days: 5, expired_balance_forfeited: true,
          carry_forward_requires_approval: false, minimum_application_days: 0.5, half_day_allowed: true,
          requires_approval: true, requires_document: false, accrual_frequency: "none",
          probation_restriction_months: 0, active_status: true,
        },
      ],
    });
    assert.equal(okRes.status, 201);
    createdDraftIds.push(okRes.body.id);

    const previewRes = await adminClient.post(`/api/leave/policy/${okRes.body.id}/preview/`, {});
    assert.equal(previewRes.status, 200);
    assert.equal(previewRes.body.effective_from_fy_start, "2099-04-01");
    assert.ok(Array.isArray(previewRes.body.per_type_impact));
  });

  it("4. Searches employee balances and validates eligibility exception dates", async () => {
    const balRes = await adminClient.get(`/api/leave/policy/balances/?page=1&limit=25&search=${empUser.username}`);
    assert.equal(balRes.status, 200);
    assert.equal(balRes.body.records.length, 1);
    assert.equal(balRes.body.records[0].username, empUser.username);

    const badDateRes = await adminClient.post("/api/leave/policy/employee-eligibility/", {
      employee_id: empUser.id,
      leave_code: "__legacy_shared__",
      eligible: true,
      entitlement_override: 15,
      effective_from: "2026-04-01",
      effective_to: "2026-03-01",
      reason: "Invalid date range test",
    });
    assert.equal(badDateRes.status, 400);

    const okEligRes = await adminClient.post("/api/leave/policy/employee-eligibility/", {
      employee_id: empUser.id,
      leave_code: "__legacy_shared__",
      eligible: true,
      entitlement_override: 18,
      effective_from: "2026-04-01",
      effective_to: "2027-03-31",
      reason: "E2E valid override",
    });
    assert.equal(okEligRes.status, 201);
    createdEligibilityIds.push(okEligRes.body.id);
  });
});
