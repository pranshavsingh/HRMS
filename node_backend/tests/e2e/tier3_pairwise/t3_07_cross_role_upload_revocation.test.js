/**
 * Tier 3 — Pairwise Combination Suite 7: Cross-Role Upload & Immediate Revocation
 * Cross-feature: Document Registration/Upload + Role Escalation/Demotion + Session Invalidation
 * Verifies role enforcement across document endpoints, ownership checks, and immediate revocation.
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { startTestServer, teardownAll } from "../harness/test-server.js";
import { HttpClient } from "../harness/http-client.js";
import { createTestUser, deleteTestUser } from "../harness/fixtures.js";
import { config } from "../../../src/config/env.js";
import { db } from "../../../src/db/index.js";
import redisService from "../../../src/services/redis.service.js";

describe("T3.07 — Cross-Role Upload & Immediate Revocation", () => {
  let serverInfo;
  let client;
  let employeeUser;
  let managerUser;
  let adminUser;

  before(async () => {
    serverInfo = await startTestServer();
    client = new HttpClient(serverInfo.baseUrl);

    adminUser = await createTestUser({
      username: `t3_admin_${Date.now()}`,
      role: "admin"
    });

    managerUser = await createTestUser({
      username: `t3_mgr_${Date.now()}`,
      role: "manager"
    });

    employeeUser = await createTestUser({
      username: `t3_emp_${Date.now()}`,
      role: "employee",
      managerId: managerUser.id
    });
  });

  after(async () => {
    if (serverInfo) await serverInfo.close();
    await deleteTestUser(employeeUser?.id);
    await deleteTestUser(managerUser?.id);
    await deleteTestUser(adminUser?.id);
    await teardownAll();
  });

  const validJpegBuffer = Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
    0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
    0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
    0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
    0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
    0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
    0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x1f, 0x00, 0x00, 0x01, 0x05, 0x01, 0x01,
    0x01, 0x01, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04,
    0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f,
    0x00, 0x7f, 0x00, 0xff, 0xd9
  ]);

  it("T3-UPL-01: Employee can register own direct document successfully", async () => {
    const empToken = jwt.sign(
      { userId: employeeUser.id, role: "employee", type: "access" },
      config.jwtSecret,
      { expiresIn: "15m", algorithm: "HS256" }
    );

    const docTitle = `Self_Document_${Date.now()}`;
    const formData = new FormData();
    formData.append("user", String(employeeUser.id));
    formData.append("title", docTitle);
    formData.append("file", new Blob([validJpegBuffer], { type: "image/jpeg" }), "document.jpg");

    const res = await client.post(
      "/api/auth/documents/upload/",
      formData,
      { headers: { Authorization: `Bearer ${empToken}` } }
    );

    assert.equal(res.status, 200, `Expected HTTP 200 OK, got ${res.status}`);
    const body = res.body?.data || res.body;
    assert.match(body.message, /Document uploaded/i);
  });

  it("T3-UPL-02: Employee cannot register document on behalf of another user (forbidden IDOR)", async () => {
    const empToken = jwt.sign(
      { userId: employeeUser.id, role: "employee", type: "access" },
      config.jwtSecret,
      { expiresIn: "15m", algorithm: "HS256" }
    );

    const formData = new FormData();
    formData.append("user", String(managerUser.id));
    formData.append("title", "Spoofed_Doc");
    formData.append("file", new Blob([validJpegBuffer], { type: "image/jpeg" }), "spoof.jpg");

    const res = await client.post(
      "/api/auth/documents/upload/",
      formData,
      { headers: { Authorization: `Bearer ${empToken}` } }
    );

    assert.equal(res.status, 403, "Regular employee must be forbidden from uploading documents for others");
  });

  it("T3-UPL-03: Admin can register document on behalf of employee", async () => {
    const adminToken = jwt.sign(
      { userId: adminUser.id, role: "admin", type: "access" },
      config.jwtSecret,
      { expiresIn: "15m", algorithm: "HS256" }
    );

    const formData = new FormData();
    formData.append("user", String(employeeUser.id));
    formData.append("title", `Admin_Uploaded_${Date.now()}`);
    formData.append("file", new Blob([validJpegBuffer], { type: "image/jpeg" }), "admin_doc.jpg");

    const res = await client.post(
      "/api/auth/documents/upload/",
      formData,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );

    assert.equal(res.status, 200, "Admin must be permitted to upload documents on behalf of employees");
  });

  it("T3-UPL-04: Role demotion from manager to employee revokes access to employeeDocuments endpoint", async () => {
    // Initially manager accesses direct reportee documents
    const mgrToken = jwt.sign(
      { userId: managerUser.id, role: "manager", type: "access" },
      config.jwtSecret,
      { expiresIn: "15m", algorithm: "HS256" }
    );

    const initialRes = await client.get(`/api/auth/documents/${employeeUser.id}/`, {
      headers: { Authorization: `Bearer ${mgrToken}` }
    });
    assert.equal(initialRes.status, 200, "Manager can initially access reportee documents");

    // Demote manager to employee in database and clear Redis cache
    await db.run("UPDATE accounts_user SET role = 'employee' WHERE id = ?", [managerUser.id]);
    await redisService.del(`user:session:${managerUser.id}`);

    // Generate new token reflecting new demoted role
    const demotedToken = jwt.sign(
      { userId: managerUser.id, role: "employee", type: "access" },
      config.jwtSecret,
      { expiresIn: "15m", algorithm: "HS256" }
    );

    const demotedRes = await client.get(`/api/auth/documents/${employeeUser.id}/`, {
      headers: { Authorization: `Bearer ${demotedToken}` }
    });
    assert.equal(demotedRes.status, 403, "Demoted user must now receive HTTP 403 Forbidden");

    // Restore role
    await db.run("UPDATE accounts_user SET role = 'manager' WHERE id = ?", [managerUser.id]);
    await redisService.del(`user:session:${managerUser.id}`);
  });

  it("T3-UPL-05: Account deactivation immediately blocks all document endpoints", async () => {
    const empToken = jwt.sign(
      { userId: employeeUser.id, role: "employee", type: "access" },
      config.jwtSecret,
      { expiresIn: "15m", algorithm: "HS256" }
    );

    // Deactivate employee account
    await db.run("UPDATE accounts_user SET is_active = 0 WHERE id = ?", [employeeUser.id]);
    await redisService.del(`user:session:${employeeUser.id}`);
    await redisService.set(`user:revoked:${employeeUser.id}`, "true", 300);

    const res = await client.get("/api/auth/documents/my/", {
      headers: { Authorization: `Bearer ${empToken}` }
    });

    assert.equal(res.status, 401, "Deactivated account must be rejected with HTTP 401");

    // Restore active status
    await db.run("UPDATE accounts_user SET is_active = 1 WHERE id = ?", [employeeUser.id]);
    await redisService.del(`user:session:${employeeUser.id}`);
    await redisService.del(`user:revoked:${employeeUser.id}`);
  });
});
