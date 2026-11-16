/**
 * Tier 2 — Boundary Suite 8: Cross-Tenant Isolation & IDOR Guards
 * Verifies object-level authorization (IDOR protection), manager reportee boundary,
 * direct static media protection (/media/documents/ -> 403), and user data isolation.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { startTestServer, teardownAll } from "../harness/test-server.js";
import { HttpClient } from "../harness/http-client.js";
import { createTestUser, deleteTestUser } from "../harness/fixtures.js";
import { config } from "../../../src/config/env.js";
import { db } from "../../../src/db/index.js";

describe("T2.08 — Cross-Tenant Isolation & IDOR Guards", () => {
  let serverInfo;
  let manager1;
  let manager2;
  let employee1; // reports to manager1
  let employee2; // reports to manager2
  let client;

  before(async () => {
    serverInfo = await startTestServer();
    client = new HttpClient({ baseUrl: serverInfo.baseUrl });

    manager1 = await createTestUser({
      username: `t2_m1_${Date.now()}`,
      role: "manager"
    });

    manager2 = await createTestUser({
      username: `t2_m2_${Date.now()}`,
      role: "manager"
    });

    employee1 = await createTestUser({
      username: `t2_e1_${Date.now()}`,
      role: "employee",
      managerId: manager1.id
    });

    employee2 = await createTestUser({
      username: `t2_e2_${Date.now()}`,
      role: "employee",
      managerId: manager2.id
    });

    // Seed document for employee1
    await db.run(
      `INSERT INTO accounts_employeedocument (title, file, uploaded_at, user_id)
       VALUES ('Employee 1 Aadhaar', 'documents/e1_aadhaar.pdf', NOW(), ?)`,
      [employee1.id]
    );

    // Seed document for employee2
    await db.run(
      `INSERT INTO accounts_employeedocument (title, file, uploaded_at, user_id)
       VALUES ('Employee 2 PAN', 'documents/e2_pan.pdf', NOW(), ?)`,
      [employee2.id]
    );
  });

  after(async () => {
    if (serverInfo) await serverInfo.close();
    await deleteTestUser(manager1?.id);
    await deleteTestUser(manager2?.id);
    await deleteTestUser(employee1?.id);
    await deleteTestUser(employee2?.id);
    await teardownAll();
  });

  it("T2-ISO-01: Employee /documents/my/ returns strictly their own documents", async () => {
    const e1Token = jwt.sign(
      { userId: employee1.id, role: "employee", type: "access" },
      config.jwtSecret,
      { expiresIn: "15m", algorithm: "HS256" }
    );

    const res = await client.get("/api/auth/documents/my/", {
      headers: { Authorization: `Bearer ${e1Token}` }
    });

    assert.equal(res.status, 200);
    const docs = res.body?.data || res.body?.documents || res.body || [];
    assert.ok(Array.isArray(docs));
    assert.ok(docs.length > 0, "Must return at least 1 document for employee1");

    // Must strictly contain documents for employee1
    for (const doc of docs) {
      assert.equal(doc.title, "Employee 1 Aadhaar", "Document must belong to calling employee");
      assert.notEqual(doc.title, "Employee 2 PAN", "Employee 2 document must not leak to Employee 1");
    }
  });

  it("T2-ISO-02: Manager can access direct reportee documents, but is FORBIDDEN from non-reportee documents", async () => {
    const m1Token = jwt.sign(
      { userId: manager1.id, role: "manager", type: "access" },
      config.jwtSecret,
      { expiresIn: "15m", algorithm: "HS256" }
    );

    // 1. Manager 1 accesses employee 1 (reportee) -> MUST SUCCEED (200)
    const resAllowed = await client.get(`/api/auth/documents/${employee1.id}/`, {
      headers: { Authorization: `Bearer ${m1Token}` }
    });
    assert.equal(resAllowed.status, 200, "Manager 1 must be permitted to view direct reportee documents");

    // 2. Manager 1 accesses employee 2 (non-reportee, reports to Manager 2) -> MUST BE FORBIDDEN (403)
    const resForbidden = await client.get(`/api/auth/documents/${employee2.id}/`, {
      headers: { Authorization: `Bearer ${m1Token}` }
    });
    assert.equal(resForbidden.status, 403, "Manager 1 must be blocked from viewing non-reportee documents");
    const errorMsg = resForbidden.body?.error || resForbidden.body?.message || "";
    assert.match(errorMsg, /permission to view documents/i);
  });

  it("T2-ISO-03: Direct static media access to employee private documents returns HTTP 403", async () => {
    const res = await fetch(`${serverInfo.baseUrl}/media/documents/confidential_id_card.pdf`);
    assert.equal(res.status, 403, "Direct access to /media/documents must return HTTP 403 Forbidden");
    const body = await res.json();
    assert.match(body.error || "", /Direct access to private employee documents is forbidden/i);
  });

  it("T2-ISO-04: User ID parameter tampering in query string is ignored (uses JWT identity)", async () => {
    const e1Token = jwt.sign(
      { userId: employee1.id, role: "employee", type: "access" },
      config.jwtSecret,
      { expiresIn: "15m", algorithm: "HS256" }
    );

    // Attempt parameter injection specifying user_id = employee2.id
    const res = await client.get(`/api/auth/documents/my/?user_id=${employee2.id}`, {
      headers: { Authorization: `Bearer ${e1Token}` }
    });

    assert.equal(res.status, 200);
    const docs = res.body?.data || res.body?.documents || res.body || [];
    for (const doc of docs) {
      assert.equal(doc.title, "Employee 1 Aadhaar", "Server must use authenticated JWT user_id, ignoring query override");
      assert.notEqual(doc.title, "Employee 2 PAN");
    }
  });

  it("T2-ISO-05: Regular employee cannot access other employee's document endpoint", async () => {
    const e1Token = jwt.sign(
      { userId: employee1.id, role: "employee", type: "access" },
      config.jwtSecret,
      { expiresIn: "15m", algorithm: "HS256" }
    );

    const res = await client.get(`/api/auth/documents/${employee2.id}/`, {
      headers: { Authorization: `Bearer ${e1Token}` }
    });

    assert.equal(res.status, 403, "Employee must receive HTTP 403 when requesting /documents/:user_id/");
  });
});
