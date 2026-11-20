import test from "node:test";
import assert from "node:assert/strict";
import { calculateLeaveBalance } from "../../src/services/leave.service.js";

const asOf = "2026-11-18";

test("pending requests are visible but do not reduce available balance", () => {
  const result = calculateLeaveBalance({
    baseEntitlement: 10,
    asOf,
    leaves: [{ status: "pending", from_date: "2026-11-20", to_date: "2026-11-22" }],
  });
  assert.equal(result.available_balance, 10);
  assert.equal(result.pending_days, 3);
  assert.equal(result.pending_requests, 1);
});

test("approved leave and valid concessions calculate the projected available amount", () => {
  const result = calculateLeaveBalance({
    baseEntitlement: 20,
    leaveType: "casual",
    asOf,
    concessions: [
      { leave_type: "casual", adjustment_days: 3, effective_date: "2026-01-01", expiry_date: null },
      { leave_type: "paid", adjustment_days: 8, effective_date: "2026-01-01", expiry_date: null },
      { leave_type: "casual", adjustment_days: 4, effective_date: "2026-12-01", expiry_date: null },
      { leave_type: "casual", adjustment_days: 5, effective_date: "2026-01-01", expiry_date: "2026-11-17" },
    ],
    leaves: [
      { status: "approved", from_date: "2026-11-10", to_date: "2026-11-12" },
      { status: "rejected", from_date: "2026-11-13", to_date: "2026-11-14" },
    ],
  });
  assert.equal(result.base_entitlement, 20);
  assert.equal(result.management_concession, 3);
  assert.equal(result.leaves_used, 3);
  assert.equal(result.available_balance, 20);
});

test("zero and insufficient balance can produce negative projections without clamping", () => {
  const zero = calculateLeaveBalance({ baseEntitlement: 0, asOf });
  const insufficient = calculateLeaveBalance({ baseEntitlement: 2, asOf });
  assert.equal(zero.available_balance - 3, -3);
  assert.equal(insufficient.available_balance - 5, -3);
});

test("approved dates are counted only through the balance date", () => {
  const result = calculateLeaveBalance({
    baseEntitlement: 10,
    asOf: "2026-11-11",
    leaves: [{ status: "approved", from_date: "2026-11-10", to_date: "2026-11-12" }],
  });
  assert.equal(result.leaves_used, 2);
  assert.equal(result.available_balance, 8);
});
