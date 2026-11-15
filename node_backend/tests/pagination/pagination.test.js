import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { parsePagination, formatPaginationResponse } from "../../src/utils/pagination.js";
import { accountsService } from "../../src/services/accounts.service.js";
import { attendanceService } from "../../src/services/attendance.service.js";
import { leaveService } from "../../src/services/leave.service.js";
import { db, closePool } from "../../src/db/index.js";
import redisService from "../../src/services/redis.service.js";

describe("P2.2 — Standardized Server-Side Pagination Test Suite", () => {
  after(async () => {
    if (redisService.client) {
      redisService.client.disconnect();
    }
    await closePool();
  });

  describe("Pagination Parameter Bounds & Parsing", () => {
    it("should apply default values (page=1, limit=50) when parameters are missing or invalid", () => {
      const res = parsePagination({});
      assert.equal(res.page, 1);
      assert.equal(res.limit, 50);
      assert.equal(res.offset, 0);

      const invalidRes = parsePagination({ page: -5, limit: 0 });
      assert.equal(invalidRes.page, 1);
      assert.equal(invalidRes.limit, 50);
      assert.equal(invalidRes.offset, 0);
    });

    it("should clamp limit to maxLimit (100) to prevent unbounded memory allocation", () => {
      const res = parsePagination({ page: 2, limit: 5000 }, 50, 100);
      assert.equal(res.page, 2);
      assert.equal(res.limit, 100);
      assert.equal(res.offset, 100);
    });

    it("should correctly compute offset for arbitrary valid pages", () => {
      const res = parsePagination({ page: 5, limit: 25 });
      assert.equal(res.page, 5);
      assert.equal(res.limit, 25);
      assert.equal(res.offset, 100);
    });
  });

  describe("Standard Envelope Formatting", () => {
    it("should generate compliant envelope metadata with navigation flags", () => {
      const mockItems = [{ id: 1 }, { id: 2 }];
      const envelope = formatPaginationResponse(mockItems, 125, 2, 50);

      assert.deepEqual(envelope.data, mockItems);
      assert.equal(envelope.pagination.page, 2);
      assert.equal(envelope.pagination.limit, 50);
      assert.equal(envelope.pagination.total, 125);
      assert.equal(envelope.pagination.totalPages, 3);
      assert.equal(envelope.pagination.pages, 3);
      assert.equal(envelope.pagination.hasNextPage, true);
      assert.equal(envelope.pagination.hasPreviousPage, true);
    });

    it("should correctly flag first and last page navigation boundaries", () => {
      // First page
      const firstPage = formatPaginationResponse([], 50, 1, 50);
      assert.equal(firstPage.pagination.hasPreviousPage, false);
      assert.equal(firstPage.pagination.hasNextPage, false);

      // Last page
      const lastPage = formatPaginationResponse([], 75, 2, 50);
      assert.equal(lastPage.pagination.hasPreviousPage, true);
      assert.equal(lastPage.pagination.hasNextPage, false);
    });
  });

  describe("Collection Endpoints Pagination Integration", () => {
    it("should return paginated envelope for employee directory", async () => {
      const result = await accountsService.getEmployees({ page: 1, limit: 5 });

      assert.ok(result.pagination, "Response must include pagination metadata");
      assert.ok(Array.isArray(result.data), "Response data must be an array");
      assert.ok(result.pagination.total >= 0, "Pagination total must be >= 0");
      assert.ok(result.data.length <= 5, "Data length must respect limit of 5");
    });

    it("should return paginated envelope for leave requests", async () => {
      const result = await leaveService.myLeaves(1, { page: 1, limit: 5 });

      assert.ok(result.pagination, "Leave response must include pagination metadata");
      assert.ok(Array.isArray(result.data), "Leave response data must be an array");
      assert.ok(result.summary, "Leave response must preserve summary object");
      assert.equal(result.pagination.limit, 5);
    });

    it("should return paginated envelope for attendance history", async () => {
      const result = await attendanceService.getHistory(1, { page: 1, limit: 5 });

      assert.ok(result.pagination, "Attendance history must include pagination metadata");
      assert.ok(Array.isArray(result.data), "Attendance history data must be an array");
      assert.equal(result.pagination.limit, 5);
    });
  });
});
