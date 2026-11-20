import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { accountsService } from "../../src/services/accounts.service.js";
import { accountsRepository } from "../../src/repositories/accounts.repository.js";
import { storageService } from "../../src/services/storage.service.js";
import { cloudinaryService } from "../../src/services/cloudinary.service.js";
import { realtimeManager } from "../../src/utils/realtime.js";
import { db } from "../../src/db/index.js";

describe("Document Management Bug Fixes Suite (BUG-01 to BUG-07)", () => {
  const superadminActor = { id: 1, role: "superadmin" };
  const adminActor = { id: 2, role: "admin" };
  const hrActor = { id: 3, role: "hr" };
  const managerActor = { id: 9998, role: "manager" };
  const employeeActor = { id: 9999, role: "employee" };
  const tenantId = 1;

  after(() => {
    // Gracefully drain async handles and exit
    setTimeout(() => process.exit(0), 500).unref();
  });

  // =========================================================================
  // BUG-01: Hardcoded 100-Employee Limit
  // =========================================================================
  describe("BUG-01: Employee Listing Server Pagination & Beyond 100 Records", () => {
    it("getEmployees should support dynamic page and limit parameters with accurate pagination metadata", async () => {
      const page1Res = await accountsService.getEmployees({ page: 1, limit: 3 }, tenantId, superadminActor);
      assert.ok(page1Res.pagination, "Response must include pagination envelope");
      assert.equal(page1Res.pagination.page, 1);
      assert.equal(page1Res.pagination.limit, 3);
      assert.ok(page1Res.pagination.total >= 0, "Total must be accurate");
      assert.ok(Array.isArray(page1Res.data), "data must be an array");
      assert.ok(page1Res.data.length <= 3, "Page slice size must respect limit");

      const page2Res = await accountsService.getEmployees({ page: 2, limit: 3 }, tenantId, superadminActor);
      assert.equal(page2Res.pagination.page, 2);
      assert.equal(page2Res.pagination.limit, 3);
    });

    it("Frontend EmployeeDocuments.jsx must not contain hardcoded limit: 100 in API requests", () => {
      const frontendCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/EmployeeDocuments.jsx"), "utf8");
      assert.ok(!frontendCode.includes("limit: 100,"), "EmployeeDocuments.jsx must not have hardcoded limit: 100");
      assert.ok(frontendCode.includes("limit: rowsPerPage"), "EmployeeDocuments.jsx must use dynamic rowsPerPage");
      assert.ok(frontendCode.includes("page: currentPage"), "EmployeeDocuments.jsx must send page: currentPage to backend");
    });
  });

  // =========================================================================
  // BUG-02: Cross-Origin Download Attribute Defect
  // =========================================================================
  describe("BUG-02: Cloudinary Document Download & Attachment URL", () => {
    it("storageService and cloudinaryService should generate signed attachment URLs when attachment=true is requested", () => {
      const sampleCloudinaryPath = "cloudinary://employee-documents/578/test-uuid";
      const viewUrl = storageService.getUrl(sampleCloudinaryPath);
      const downloadUrl = storageService.getUrl(sampleCloudinaryPath, { attachment: true });

      assert.ok(viewUrl, "View URL should be generated");
      assert.ok(downloadUrl, "Download URL should be generated");
      assert.ok(downloadUrl.includes("attachment=true"), "Download URL must include attachment=true");
      assert.ok(!viewUrl.includes("attachment=true"), "View URL should not force attachment");
    });

    it("getMyDocuments and getEmployeeDocuments must return both file (view) and download_url (attachment)", async () => {
      // Find an employee with documents in database
      const doc = await db.get("SELECT * FROM accounts_employeedocument LIMIT 1");
      if (doc) {
        const empDocs = await accountsService.getEmployeeDocuments(doc.user_id, superadminActor, {}, tenantId);
        assert.ok(Array.isArray(empDocs), "Should return array of documents");
        const found = empDocs.find((d) => d.id === doc.id);
        assert.ok(found, "Document should be in returned list");
        assert.ok(found.file, "file view URL must be present");
        assert.ok(found.download_url, "download_url attachment URL must be present");
        assert.ok(found.download_url.includes("attachment=true"), "download_url must trigger attachment download");
      }
    });

    it("Unauthorized actors must be rejected with 403 when requesting document details or downloads", async () => {
      const doc = await db.get("SELECT * FROM accounts_employeedocument LIMIT 1");
      if (doc) {
        await assert.rejects(
          async () => {
            await accountsService.getDocumentDetail(doc.id, employeeActor, "127.0.0.1", tenantId, { attachment: true });
          },
          (err) => err.statusCode === 403
        );
      }
    });

    it("Frontend Documents.jsx and EmployeeDocuments.jsx must use programmatic download instead of raw cross-origin <a download>", () => {
      const empDocsCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/EmployeeDocuments.jsx"), "utf8");
      const docsCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/Documents.jsx"), "utf8");

      assert.ok(empDocsCode.includes("handleDownload"), "EmployeeDocuments.jsx must implement handleDownload helper");
      assert.ok(!empDocsCode.includes('download={`${selectedEmployeeObj?.name'), "Raw cross-origin <a download> should be replaced");
      assert.ok(docsCode.includes("handleDownload"), "Documents.jsx must implement handleDownload helper");
      assert.ok(!docsCode.includes('<a\n                        href={fileUrl}\n                        download'), "Raw <a download> in Documents.jsx should be replaced");
    });
  });

  // =========================================================================
  // BUG-03: Missing Route Guard in App.jsx
  // =========================================================================
  describe("BUG-03: Route Role Guard on /employee-documents", () => {
    it("App.jsx must protect /employee-documents with allowedRoles={['admin', 'hr', 'superadmin']}", () => {
      const appCode = fs.readFileSync(path.resolve("hrms_saas/src/App.jsx"), "utf8");
      assert.ok(
        appCode.includes('allowedRoles={["admin", "hr", "superadmin"]}') &&
        appCode.includes("/employee-documents"),
        "/employee-documents route must specify allowedRoles"
      );
    });

    it("ProtectedRoute logic should verify role authorization and redirect unauthorized users to /dashboard", () => {
      const protectedRouteCode = fs.readFileSync(path.resolve("hrms_saas/src/routes/ProtectedRoute.jsx"), "utf8");
      assert.ok(
        protectedRouteCode.includes('!allowedRoles.includes(role)'),
        "ProtectedRoute must check allowedRoles against user role"
      );
      assert.ok(
        protectedRouteCode.includes('<Navigate to="/dashboard" replace />'),
        "ProtectedRoute must redirect unauthorized roles to /dashboard"
      );
    });
  });

  // =========================================================================
  // BUG-04: Total Document Metric
  // =========================================================================
  describe("BUG-04: Authoritative Backend Total Documents Count", () => {
    it("accountsRepository.countTotalDocuments should count scoped documents in database accurately", async () => {
      const count = await accountsRepository.countTotalDocuments({ tenantId });
      const rawCount = await db.get("SELECT COUNT(*) as c FROM accounts_employeedocument");
      assert.ok(typeof count === "number", "Count must be a number");
      assert.equal(count, Number(rawCount.c), "Total documents must match database row count");
    });

    it("getEmployees response must include authoritative total_documents matching database", async () => {
      const res = await accountsService.getEmployees({ page: 1, limit: 2 }, tenantId, superadminActor);
      const expectedCount = await accountsRepository.countTotalDocuments({ tenantId });
      assert.equal(res.total_documents, expectedCount, "res.total_documents must match authoritative database count");

      // Verify pagination does not affect total_documents
      const resPage2 = await accountsService.getEmployees({ page: 2, limit: 2 }, tenantId, superadminActor);
      assert.equal(resPage2.total_documents, expectedCount, "Changing page must not affect total_documents");
    });

    it("Frontend EmployeeDocuments.jsx must not calculate fallback document count by summing local page items", () => {
      const frontendCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/EmployeeDocuments.jsx"), "utf8");
      assert.ok(
        !frontendCode.includes("list.reduce((acc, curr) => acc + (Number(curr.document_count) || 0)"),
        "Local reduce fallback must be removed from EmployeeDocuments.jsx"
      );
    });
  });

  // =========================================================================
  // BUG-05: HR Permission Inconsistency in getDocumentDetail
  // =========================================================================
  describe("BUG-05: HR Document Detail Access Consistency", () => {
    it("getDocumentDetail must allow authorized HR actors to view document detail URLs", async () => {
      const doc = await db.get("SELECT * FROM accounts_employeedocument LIMIT 1");
      if (doc) {
        // HR user should be able to get document detail
        const fileUrl = await accountsService.getDocumentDetail(doc.id, hrActor, "127.0.0.1", tenantId);
        assert.ok(fileUrl, "HR actor should successfully retrieve document URL");
        assert.ok(typeof fileUrl === "string", "URL must be a string");
      }
    });

    it("getDocumentDetail must still enforce restrictions for regular employees and unrelated managers", async () => {
      const doc = await db.get("SELECT * FROM accounts_employeedocument LIMIT 1");
      if (doc) {
        // Employee actor (not owner)
        await assert.rejects(
          async () => {
            await accountsService.getDocumentDetail(doc.id, { id: 99999, role: "employee" }, "127.0.0.1", tenantId);
          },
          (err) => err.statusCode === 403
        );

        // Manager actor (not manager of employee)
        await assert.rejects(
          async () => {
            await accountsService.getDocumentDetail(doc.id, { id: 88888, role: "manager" }, "127.0.0.1", tenantId);
          },
          (err) => err.statusCode === 403
        );
      }
    });
  });

  // =========================================================================
  // BUG-06: Arbitrary Hardcoded Scroll Position
  // =========================================================================
  describe("BUG-06: Element-Based Smooth Scroll Instead of Hardcoded Pixels", () => {
    it("EmployeeDocuments.jsx must not contain arbitrary window.scrollTo({ top: 300 })", () => {
      const frontendCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/EmployeeDocuments.jsx"), "utf8");
      assert.ok(!frontendCode.includes("top: 300"), "Arbitrary top: 300 must be removed");
      assert.ok(!frontendCode.includes("window.scrollTo"), "window.scrollTo should not be used for detail navigation");
    });

    it("EmployeeDocuments.jsx must use ref and scrollIntoView on detail section", () => {
      const frontendCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/EmployeeDocuments.jsx"), "utf8");
      assert.ok(frontendCode.includes("detailSectionRef"), "detailSectionRef must be defined");
      assert.ok(frontendCode.includes("scrollIntoView"), "scrollIntoView must be used to scroll to container");
    });
  });

  // =========================================================================
  // BUG-07: Real-Time Document Synchronization
  // =========================================================================
  describe("BUG-07: Real-Time Synchronization for Document Mutations", () => {
    it("Backend deleteDocument, uploadDocument, registerDirectDocument must broadcast document_update events", () => {
      const backendCode = fs.readFileSync(path.resolve("node_backend/src/services/accounts.service.js"), "utf8");
      assert.ok(
        backendCode.includes('realtimeManager.broadcast("document_update"'),
        "accounts.service.js must broadcast document_update events"
      );
    });

    it("Frontend RealtimeContext and EmployeeDocuments.jsx must register listeners for document_update", () => {
      const rtContextCode = fs.readFileSync(path.resolve("hrms_saas/src/context/RealtimeContext.jsx"), "utf8");
      const empDocsCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/EmployeeDocuments.jsx"), "utf8");
      const docsCode = fs.readFileSync(path.resolve("hrms_saas/src/pages/Documents.jsx"), "utf8");

      assert.ok(rtContextCode.includes('"document_update"'), "RealtimeContext must subscribe to document_update SSE event");
      assert.ok(empDocsCode.includes('useRealtime("document_update"'), "EmployeeDocuments.jsx must listen to document_update");
      assert.ok(docsCode.includes('useRealtime("document_update"'), "Documents.jsx must listen to document_update");
    });
  });
});
