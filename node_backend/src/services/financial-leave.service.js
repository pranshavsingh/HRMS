import { db } from "../db/index.js";
import { AppError } from "../middleware/errorHandler.js";
import { auditService } from "./audit.service.js";
import { realtimeManager } from "../utils/realtime.js";
import { siteService } from "./site.service.js";

export const LEGACY_LEAVE_CODE = "__legacy_shared__";
const MANAGEMENT_ROLES = ["hr", "admin", "superadmin"];
let schemaReadyCache = { checkedAt: 0, ready: false };
const FINANCIAL_SCHEMA_TABLES = ["workforce_leave_policy_version", "workforce_leave_type_policy", "workforce_employee_leave_eligibility", "workforce_employee_leave_entitlement", "workforce_leave_ledger_transaction", "workforce_leave_reset_run", "workforce_leave_reset_employee_result"];

const ymd = (date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
const dateString = (value) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || "").slice(0, 10);
const plusYear = (date) => { const out = new Date(`${date}T00:00:00Z`); out.setUTCFullYear(out.getUTCFullYear() + 1); return ymd(out); };
const yearEndDate = (start) => { const end = new Date(`${plusYear(start)}T00:00:00Z`); end.setUTCDate(end.getUTCDate() - 1); return ymd(end); };

export function localDateInTimezone(value = new Date(), timezone = "Asia/Kolkata") {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function financialYearStart(date, month = 4, day = 1) {
  const text = String(date).slice(0, 10);
  const [year, currentMonth, currentDay] = text.split("-").map(Number);
  const startYear = currentMonth < month || (currentMonth === month && currentDay < day) ? year - 1 : year;
  return `${startYear}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function splitLeaveDaysByFinancialYear(fromDate, toDate, month = 4, day = 1) {
  const start = new Date(`${String(fromDate).slice(0, 10)}T00:00:00Z`);
  const end = new Date(`${String(toDate).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) return [];
  const portions = new Map();
  for (const current = new Date(start); current <= end; current.setUTCDate(current.getUTCDate() + 1)) {
    const fy = financialYearStart(ymd(current), month, day);
    portions.set(fy, (portions.get(fy) || 0) + 1);
  }
  return [...portions].map(([financial_year_start, days]) => ({ financial_year_start, financial_year_end: yearEndDate(financial_year_start), days }));
}

function requireManager(actor) {
  if (!MANAGEMENT_ROLES.includes(actor?.role)) throw new AppError("Not allowed to manage company leave policies", 403);
}

async function financialSchemaReady() {
  if (Date.now() - schemaReadyCache.checkedAt < 30_000) return schemaReadyCache.ready;
  const count = await db.get(`SELECT COUNT(*) AS count FROM information_schema.tables
    WHERE table_schema=DATABASE() AND table_name IN (${FINANCIAL_SCHEMA_TABLES.map(() => "?").join(",")})`, FINANCIAL_SCHEMA_TABLES);
  schemaReadyCache = { checkedAt: Date.now(), ready: Number(count?.count) === FINANCIAL_SCHEMA_TABLES.length };
  return schemaReadyCache.ready;
}

async function legacyBalance(userId, tenantId, leaveType, asOf, tx) {
  const profile = await db.get("SELECT leave_allotted FROM accounts_employeeprofile WHERE user_id=?", [userId], tx);
  const typeFilter = leaveType ? " AND leave_type=?" : "";
  const approved = await db.get(`SELECT COALESCE(SUM(GREATEST(0,DATEDIFF(LEAST(to_date,?),from_date)+1)),0) AS days
    FROM leave_leave WHERE tenant_id=? AND user_id=? AND status='approved' AND from_date<=?${typeFilter}`,
  [asOf, tenantId, userId, asOf, ...(leaveType ? [leaveType] : [])], tx);
  const pending = await db.get(`SELECT COUNT(*) AS requests,COALESCE(SUM(GREATEST(0,DATEDIFF(to_date,from_date)+1)),0) AS days
    FROM leave_leave WHERE tenant_id=? AND user_id=? AND status='pending'${typeFilter}`,
  [tenantId, userId, ...(leaveType ? [leaveType] : [])], tx);
  const concessions = await db.get(`SELECT COALESCE(SUM(adjustment_days),0) AS days FROM leave_concession_ledger
    WHERE tenant_id=? AND user_id=? AND effective_date<=? AND (expiry_date IS NULL OR expiry_date>=?) AND (? IS NULL OR leave_type=?)`,
  [tenantId, userId, asOf, asOf, leaveType, leaveType], tx);
  const used = Number(approved?.days || 0);
  const concession = Number(concessions?.days || 0);
  const allotted = Number(profile?.leave_allotted || 0);
  return { base_entitlement: allotted, carry_forward: 0, opening_balance: allotted, management_concession: concession, leaves_used: used, pending_days: Number(pending?.days || 0), pending_requests: Number(pending?.requests || 0), available_balance: allotted + concession - used };
}

async function getPolicyForYear(tenantId, yearStart, tx = null) {
  return db.get(`SELECT * FROM workforce_leave_policy_version
    WHERE tenant_id=? AND status='published' AND effective_from_fy_start<=?
    ORDER BY effective_from_fy_start DESC, version_number DESC LIMIT 1`, [tenantId, yearStart], tx);
}

async function getTypes(policyId, tenantId, tx = null) {
  return db.all("SELECT * FROM workforce_leave_type_policy WHERE tenant_id=? AND policy_version_id=? ORDER BY leave_code", [tenantId, policyId], tx);
}

async function ensureYearEntitlement(tx, tenantId, userId, start, end, policy, type, profile, priorYear = null) {
  const code = policy.legacy_shared_pool_enabled ? LEGACY_LEAVE_CODE : type.leave_code;
  const existing = await tx.get("SELECT * FROM workforce_employee_leave_entitlement WHERE tenant_id=? AND user_id=? AND leave_code=? AND financial_year_start=? FOR UPDATE", [tenantId, userId, code, start]);
  if (existing) return { created: false, row: existing };
  let annual = policy.legacy_shared_pool_enabled ? Number(profile.leave_allotted || 0) : Number(type.annual_entitlement || 0);
  const joiningDate = dateString(profile.joining_date);
  const override = await tx.get(`SELECT eligible, entitlement_override FROM workforce_employee_leave_eligibility
    WHERE tenant_id=? AND user_id=? AND leave_code=? AND effective_from<=? AND (effective_to IS NULL OR effective_to>=?)
    ORDER BY effective_from DESC, id DESC LIMIT 1`, [tenantId, userId, code, start, start]);
  if (override?.eligible === 0) annual = 0;
  if (override?.entitlement_override != null) annual = Number(override.entitlement_override);
  if (!policy.legacy_shared_pool_enabled) {
    let rules = type.eligibility_rules || {};
    if (typeof rules === "string") {
      try { rules = JSON.parse(rules || "{}"); } catch { rules = {}; }
    }
    const allowedTeams = rules.allowed_teams || rules.teams;
    const allowedDesignations = rules.allowed_designations || rules.designations;
    if (Array.isArray(allowedTeams) && allowedTeams.length && !allowedTeams.includes(profile.team_name)) annual = 0;
    if (Array.isArray(allowedDesignations) && allowedDesignations.length && !allowedDesignations.includes(profile.designation)) annual = 0;
  }
  let prorated = 0;
  if (policy.proration_method === "monthly" && joiningDate && joiningDate > start) {
    const joined = new Date(`${joiningDate}T00:00:00Z`);
    const yearEndDateObj = new Date(`${end}T00:00:00Z`);
    const months = Math.max(0, Math.min(12, (yearEndDateObj.getUTCFullYear() - joined.getUTCFullYear()) * 12 + yearEndDateObj.getUTCMonth() - joined.getUTCMonth() + 1));
    prorated = Math.round((annual * months / 12) * 100) / 100;
  }
  if (!policy.legacy_shared_pool_enabled && Number(type.probation_restriction_months) > 0 && joiningDate) {
    const eligibleFrom = new Date(`${joiningDate}T00:00:00Z`);
    eligibleFrom.setUTCMonth(eligibleFrom.getUTCMonth() + Number(type.probation_restriction_months));
    if (ymd(eligibleFrom) > end) annual = prorated = 0;
  }
  let carry = 0;
  if (!policy.legacy_shared_pool_enabled && type.carry_forward_enabled && !type.carry_forward_requires_approval && priorYear) {
    const prior = await tx.get(`SELECT opening_balance FROM workforce_employee_leave_entitlement
      WHERE tenant_id=? AND user_id=? AND leave_code=? AND financial_year_start=?`, [tenantId, userId, code, priorYear]);
    if (prior) {
      const priorTransactions = await tx.get(`SELECT COALESCE(SUM(amount),0) AS amount FROM workforce_leave_ledger_transaction
        WHERE tenant_id=? AND user_id=? AND leave_code=? AND financial_year_start=? AND transaction_type<>'carry_forward'`, [tenantId, userId, code, priorYear]);
      carry = Math.max(0, Math.min(Number(type.max_carry_forward_days || 0), Number(prior.opening_balance) + Number(priorTransactions?.amount || 0)));
    }
  }
  const accruesOverTime = !policy.legacy_shared_pool_enabled && type.accrual_frequency && type.accrual_frequency !== "none";
  const earnedOpening = accruesOverTime ? 0 : (policy.proration_method === "monthly" && joiningDate && joiningDate > start ? prorated : annual);
  const opening = earnedOpening + carry;
  const inserted = await tx.run(`INSERT INTO workforce_employee_leave_entitlement
    (tenant_id,user_id,leave_code,financial_year_start,financial_year_end,policy_version_id,annual_entitlement,proration_amount,carry_forward_days,opening_balance)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, [tenantId, userId, code, start, end, policy.id, annual, prorated, carry, opening]);
  const rowId = inserted.lastID;
  if (carry > 0) await tx.run(`INSERT IGNORE INTO workforce_leave_ledger_transaction
    (tenant_id,user_id,leave_code,financial_year_start,transaction_type,amount,effective_date,source_type,source_id,idempotency_key,reason,balance_before,balance_after)
    VALUES (?,?,?,?,'carry_forward',?,?,'financial_year',?,?,?,?,?)`, [tenantId, userId, code, start, carry, start, rowId, `carry-${userId}-${code}-${start}`, "Eligible carry-forward from the prior financial year", opening - carry, opening]);
  return { created: true, row: { id: rowId, opening_balance: opening } };
}

async function runTenantReset(tenantId, start, actor = null) {
  const policy = await getPolicyForYear(tenantId, start);
  if (!policy) throw new AppError(`No published leave policy applies from ${start}`, 409);
  const end = yearEndDate(start);
  const types = policy.legacy_shared_pool_enabled ? [{ leave_code: LEGACY_LEAVE_CODE, annual_entitlement: 0, active_status: 1, accrual_frequency: "none" }] : (await getTypes(policy.id, tenantId)).filter((type) => type.active_status);
  const runResult = await db.transaction(async (tx) => {
    let run = await tx.get("SELECT * FROM workforce_leave_reset_run WHERE tenant_id=? AND financial_year_start=? FOR UPDATE", [tenantId, start]);
    if (run?.status === "completed") return { runId: Number(run.id), alreadyComplete: true };
    if (run) {
      await tx.run("UPDATE workforce_leave_reset_run SET status='running', attempt_count=attempt_count+1, started_at=NOW(), finished_at=NULL, error_summary=NULL WHERE id=?", [run.id]);
    } else {
      const inserted = await tx.run(`INSERT INTO workforce_leave_reset_run (tenant_id,financial_year_start,financial_year_end,policy_version_id,status,triggered_by)
        VALUES (?,?,?,?,'running',?)`, [tenantId, start, end, policy.id, actor?.id || null]);
      run = { id: inserted.lastID };
    }
    return { runId: Number(run.id), alreadyComplete: false };
  });
  if (runResult.alreadyComplete) return { ...runResult, employees: 0, failures: 0 };

  let cursor = 0;
  let employeeCount = 0;
  let successCount = 0;
  let failureCount = 0;
  while (true) {
    const batch = await db.all(`SELECT u.id AS user_id, ep.leave_allotted, ep.joining_date, ep.team_name, ep.designation
      FROM workforce_user_tenant wut JOIN accounts_user u ON u.id=wut.user_id
      JOIN accounts_employeeprofile ep ON ep.user_id=u.id
      WHERE wut.tenant_id=? AND wut.is_active=1 AND u.is_active=1 AND ep.is_active_employee=1 AND u.role='employee' AND u.id>?
      ORDER BY u.id LIMIT 100`, [tenantId, cursor]);
    if (!batch.length) break;
    cursor = Number(batch[batch.length - 1].user_id);
    employeeCount += batch.length;
    for (const employee of batch) {
      try {
        await db.transaction(async (tx) => {
          const member = await tx.get("SELECT u.id FROM accounts_user u WHERE u.id=? AND u.is_active=1 FOR UPDATE", [employee.user_id]);
          if (!member) throw new Error("Employee is no longer active");
          const prev = new Date(`${start}T00:00:00Z`); prev.setUTCFullYear(prev.getUTCFullYear() - 1);
          for (const type of types) await ensureYearEntitlement(tx, tenantId, employee.user_id, start, end, policy, type, employee, ymd(prev));
          await tx.run(`INSERT INTO workforce_leave_reset_employee_result (run_id,tenant_id,user_id,status)
            VALUES (?,?,?,'completed') ON DUPLICATE KEY UPDATE status='completed',error_message=NULL,processed_at=NOW()`, [runResult.runId, tenantId, employee.user_id]);
        });
        successCount++;
      } catch (error) {
        failureCount++;
        await db.run(`INSERT INTO workforce_leave_reset_employee_result (run_id,tenant_id,user_id,status,error_message)
          VALUES (?,?,?,'failed',?) ON DUPLICATE KEY UPDATE status='failed',error_message=VALUES(error_message),processed_at=NOW()`, [runResult.runId, tenantId, employee.user_id, error.message.slice(0, 2000)]);
      }
    }
  }
  await db.run(`UPDATE workforce_leave_reset_run SET status=?,employee_count=?,success_count=?,failure_count=?,finished_at=NOW(),error_summary=? WHERE id=?`, [failureCount ? (successCount ? "completed_with_errors" : "failed") : "completed", employeeCount, successCount, failureCount, failureCount ? `${failureCount} employee(s) failed; retry this financial year to process them again.` : null, runResult.runId]);
  if (failureCount) realtimeManager.broadcast("leave_reset_failed", { tenant_id: tenantId, financial_year_start: start, failures: failureCount }, { targetRoles: MANAGEMENT_ROLES });
  if (actor) await auditService.log(actor, "leave_financial_year_reset", String(runResult.runId), { tenant_id: tenantId, financial_year_start: start, employee_count: employeeCount, success_count: successCount, failure_count: failureCount });
  return { run_id: runResult.runId, employees: employeeCount, succeeded: successCount, failures: failureCount };
}

async function processAccrualsAndExpiries() {
  let cursor = 0;
  while (true) {
    const rows = await db.all(`SELECT e.*,ep.joining_date,v.timezone,v.legacy_shared_pool_enabled,v.proration_method,
        t.accrual_frequency,t.carry_forward_expiry_days,t.expired_balance_forfeited
      FROM workforce_employee_leave_entitlement e
      JOIN accounts_employeeprofile ep ON ep.user_id=e.user_id
      JOIN workforce_leave_policy_version v ON v.id=e.policy_version_id AND v.tenant_id=e.tenant_id
      LEFT JOIN workforce_leave_type_policy t ON t.policy_version_id=e.policy_version_id AND t.tenant_id=e.tenant_id AND t.leave_code=e.leave_code
      WHERE e.id>? AND v.status='published' AND v.legacy_shared_pool_enabled=0 AND (t.accrual_frequency<>'none' OR t.carry_forward_expiry_days IS NOT NULL)
      ORDER BY e.id LIMIT 250`, [cursor]);
    if (!rows.length) break;
    cursor = Number(rows[rows.length - 1].id);
    for (const entitlement of rows) {
    const today = localDateInTimezone(new Date(), entitlement.timezone || "Asia/Kolkata");
    if (today < entitlement.financial_year_start || today > entitlement.financial_year_end) continue;
    await db.transaction(async (tx) => {
      await tx.get("SELECT id FROM workforce_employee_leave_entitlement WHERE id=? FOR UPDATE", [entitlement.id]);
      const frequency = entitlement.accrual_frequency || "none";
      let cadence = 0;
      if (frequency === "monthly") cadence = 1;
      if (frequency === "quarterly") cadence = 3;
      if (frequency === "yearly") cadence = 12;
      if (cadence) {
        const start = new Date(`${entitlement.financial_year_start}T00:00:00Z`);
        const now = new Date(`${today}T00:00:00Z`);
        const elapsedMonths = (now.getUTCFullYear() - start.getUTCFullYear()) * 12 + now.getUTCMonth() - start.getUTCMonth();
        const periods = Math.floor(elapsedMonths / cadence) + 1;
        const perPeriod = Math.round((Number(entitlement.annual_entitlement) * cadence / 12) * 100) / 100;
        for (let index = 0; index < periods; index++) {
          const effective = new Date(start);
          effective.setUTCMonth(effective.getUTCMonth() + index * cadence);
          const effectiveDate = ymd(effective);
          if (effectiveDate > today || effectiveDate > entitlement.financial_year_end) continue;
          const key = `accrual-${entitlement.user_id}-${entitlement.leave_code}-${entitlement.financial_year_start}-${effectiveDate}`;
          const exists = await tx.get("SELECT id FROM workforce_leave_ledger_transaction WHERE tenant_id=? AND user_id=? AND idempotency_key=?", [entitlement.tenant_id, entitlement.user_id, key]);
          if (exists) continue;
          if (entitlement.joining_date && effectiveDate < dateString(entitlement.joining_date)) continue;
          const balance = await tx.get(`SELECT opening_balance + COALESCE((SELECT SUM(amount) FROM workforce_leave_ledger_transaction x
            WHERE x.tenant_id=e.tenant_id AND x.user_id=e.user_id AND x.leave_code=e.leave_code AND x.financial_year_start=e.financial_year_start AND x.transaction_type IN ('accrual','adjustment','reversal') AND x.effective_date<=?),0)
            - COALESCE((SELECT SUM(-amount) FROM workforce_leave_ledger_transaction x WHERE x.tenant_id=e.tenant_id AND x.user_id=e.user_id AND x.leave_code=e.leave_code AND x.financial_year_start=e.financial_year_start AND x.transaction_type='consumption' AND x.effective_date<=?),0) AS value
            FROM workforce_employee_leave_entitlement e WHERE e.id=?`, [effectiveDate, effectiveDate, entitlement.id]);
          await tx.run(`INSERT INTO workforce_leave_ledger_transaction
            (tenant_id,user_id,leave_code,financial_year_start,transaction_type,amount,effective_date,source_type,source_id,idempotency_key,reason,balance_before,balance_after)
            VALUES (?,?,?,?,'accrual',?,?,'financial_year',?,?,?, ?,?)`, [entitlement.tenant_id, entitlement.user_id, entitlement.leave_code, entitlement.financial_year_start, perPeriod, effectiveDate, entitlement.id, key, `${frequency} leave accrual`, Number(balance?.value || 0), Number(balance?.value || 0) + perPeriod]);
        }
      }
      if (Number(entitlement.carry_forward_days) > 0 && entitlement.expired_balance_forfeited && Number(entitlement.carry_forward_expiry_days) > 0) {
        const expiry = new Date(`${entitlement.financial_year_start}T00:00:00Z`);
        expiry.setUTCDate(expiry.getUTCDate() + Number(entitlement.carry_forward_expiry_days));
        const expiryDate = ymd(expiry);
        if (today >= expiryDate) {
          const key = `forfeit-${entitlement.id}`;
          const exists = await tx.get("SELECT id FROM workforce_leave_ledger_transaction WHERE tenant_id=? AND user_id=? AND idempotency_key=?", [entitlement.tenant_id, entitlement.user_id, key]);
          if (!exists) {
            const used = await tx.get(`SELECT COALESCE(SUM(-amount),0) AS days FROM workforce_leave_ledger_transaction
              WHERE tenant_id=? AND user_id=? AND leave_code=? AND financial_year_start=? AND transaction_type='consumption' AND effective_date<=?`, [entitlement.tenant_id, entitlement.user_id, entitlement.leave_code, entitlement.financial_year_start, expiryDate]);
            const forfeited = Math.max(0, Number(entitlement.carry_forward_days) - Number(used?.days || 0));
            if (forfeited > 0) await tx.run(`INSERT INTO workforce_leave_ledger_transaction
              (tenant_id,user_id,leave_code,financial_year_start,transaction_type,amount,effective_date,source_type,source_id,idempotency_key,reason)
              VALUES (?,?,?,?,'forfeiture',? ,?,'financial_year',?,?,?)`, [entitlement.tenant_id, entitlement.user_id, entitlement.leave_code, entitlement.financial_year_start, -forfeited, expiryDate, entitlement.id, key, "Unused carry-forward expired under company policy"]);
          }
        }
      }
    });
    }
  }
}

export const financialLeaveService = {
  async leaveTypePolicy(tenantId, yearStart, leaveCode, tx = null) {
    if (!(await financialSchemaReady())) return { policy: null, type: null };
    const policy = await getPolicyForYear(tenantId, yearStart, tx);
    if (!policy || policy.legacy_shared_pool_enabled) return { policy, type: null };
    const type = await db.get("SELECT * FROM workforce_leave_type_policy WHERE tenant_id=? AND policy_version_id=? AND leave_code=?", [tenantId, policy.id, leaveCode], tx);
    return { policy, type };
  },

  async availableTypes(tenantId, date = new Date()) {
    if (!(await financialSchemaReady())) return [];
    const policyInfo = await db.get("SELECT * FROM workforce_leave_policy_version WHERE tenant_id=? AND status='published' ORDER BY effective_from_fy_start DESC LIMIT 1", [tenantId]);
    if (!policyInfo) return [];
    const localDate = typeof date === "string" ? date.slice(0, 10) : localDateInTimezone(date, policyInfo.timezone || "Asia/Kolkata");
    const fyStart = financialYearStart(localDate, Number(policyInfo.financial_year_start_month || 4), Number(policyInfo.financial_year_start_day || 1));
    const policy = await getPolicyForYear(tenantId, fyStart);
    if (!policy) return [];
    return (await getTypes(policy.id, tenantId)).filter((type) => type.active_status).map(({ leave_code, leave_name, requires_document, half_day_allowed }) => ({ leave_code, leave_name, requires_document: Boolean(requires_document), half_day_allowed: Boolean(half_day_allowed) }));
  },

  async splitFinancialYearDays(tenantId, fromDate, toDate, tx = null) {
    if (!(await financialSchemaReady())) return splitLeaveDaysByFinancialYear(fromDate, toDate);
    const start = new Date(`${String(fromDate).slice(0, 10)}T00:00:00Z`);
    const end = new Date(`${String(toDate).slice(0, 10)}T00:00:00Z`);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start) return [];
    const policies = await db.all("SELECT effective_from_fy_start,financial_year_start_month,financial_year_start_day FROM workforce_leave_policy_version WHERE tenant_id=? AND status='published' ORDER BY effective_from_fy_start", [tenantId], tx);
    const portions = new Map();
    for (const current = new Date(start); current <= end; current.setUTCDate(current.getUTCDate() + 1)) {
      const date = ymd(current);
      const applicable = [...policies].reverse().find((policy) => String(policy.effective_from_fy_start).slice(0, 10) <= date);
      const month = Number(applicable?.financial_year_start_month || 4);
      const day = Number(applicable?.financial_year_start_day || 1);
      const yearStart = financialYearStart(date, month, day);
      const existing = portions.get(yearStart) || { financial_year_start: yearStart, financial_year_end: yearEndDate(yearStart), days: 0 };
      existing.days += 1;
      portions.set(yearStart, existing);
    }
    return [...portions.values()];
  },

  async recordApprovedLeave(tx, tenantId, userId, leaveId, leaveType, fromDate, toDate, actor) {
    if (!(await financialSchemaReady())) return [];
    const portions = await this.splitFinancialYearDays(tenantId, fromDate, toDate, tx);
    const results = [];
    for (const portion of portions) {
      const policy = await getPolicyForYear(tenantId, portion.financial_year_start, tx);
      const code = policy?.legacy_shared_pool_enabled ? LEGACY_LEAVE_CODE : leaveType;
      const requestedStart = String(fromDate).slice(0, 10);
      const effectiveDate = requestedStart > portion.financial_year_start ? requestedStart : portion.financial_year_start;
      const before = await this.getBalance(userId, tenantId, leaveType, effectiveDate, tx);
      const after = before.available_balance - portion.days;
      const key = `leave-${leaveId}-${code}-${portion.financial_year_start}`;
      await tx.run(`INSERT IGNORE INTO workforce_leave_ledger_transaction
        (tenant_id,user_id,leave_code,financial_year_start,transaction_type,amount,effective_date,source_type,source_id,idempotency_key,reason,balance_before,balance_after,action_by)
        VALUES (?,?,?,?,'consumption',?,?,'leave_application',?,?,?,?,?,?)`,
      [tenantId, userId, code || leaveType, portion.financial_year_start, -portion.days, effectiveDate, leaveId, key, `Approved ${leaveType} leave`, before.available_balance, after, actor.id]);
      const current = await this.getBalance(userId, tenantId, leaveType, effectiveDate, tx);
      results.push({ ...portion, leave_code: code, balance_before: before.available_balance, balance_after: current.available_balance });
    }
    return results;
  },

  async getBalance(userId, tenantId, leaveType = null, date = new Date(), tx = null) {
    const asOfDate = typeof date === "string" ? date.slice(0, 10) : localDateInTimezone(date, "Asia/Kolkata");
    if (!(await financialSchemaReady())) return legacyBalance(userId, tenantId, leaveType, asOfDate, tx);
    const localToday = typeof date === "string" ? date.slice(0, 10) : ymd(date);
    const latestPolicy = await db.get("SELECT timezone FROM workforce_leave_policy_version WHERE tenant_id=? AND status='published' ORDER BY effective_from_fy_start DESC LIMIT 1", [tenantId], tx);
    const timezone = latestPolicy?.timezone || "Asia/Kolkata";
    const dateInCompanyTz = typeof date === "string" ? localToday : localDateInTimezone(date, timezone);
    const basePolicy = await db.get("SELECT * FROM workforce_leave_policy_version WHERE tenant_id=? AND status='published' AND effective_from_fy_start<=? ORDER BY effective_from_fy_start DESC LIMIT 1", [tenantId, dateInCompanyTz], tx);
    const month = Number(basePolicy?.financial_year_start_month || 4);
    const day = Number(basePolicy?.financial_year_start_day || 1);
    const yearStart = financialYearStart(dateInCompanyTz, month, day);
    const yearEnd = yearEndDate(yearStart);
    const policy = await getPolicyForYear(tenantId, yearStart);
    if (policy && !policy.legacy_shared_pool_enabled && !leaveType) {
      const types = (await getTypes(policy.id, tenantId, tx)).filter((type) => type.active_status);
      const summaries = await Promise.all(types.map((type) => this.getBalance(userId, tenantId, type.leave_code, date, tx)));
      return {
        financial_year_start: yearStart, financial_year_end: yearEnd, policy_version_id: Number(policy.id),
        base_entitlement: summaries.reduce((sum, value) => sum + value.base_entitlement, 0),
        carry_forward: summaries.reduce((sum, value) => sum + value.carry_forward, 0),
        opening_balance: summaries.reduce((sum, value) => sum + value.opening_balance, 0),
        management_concession: summaries.reduce((sum, value) => sum + value.management_concession, 0),
        leaves_used: summaries.reduce((sum, value) => sum + value.leaves_used, 0),
        pending_days: summaries.reduce((sum, value) => sum + value.pending_days, 0),
        pending_requests: summaries.reduce((sum, value) => sum + value.pending_requests, 0),
        available_balance: summaries.reduce((sum, value) => sum + value.available_balance, 0),
      };
    }
    const code = policy?.legacy_shared_pool_enabled ? LEGACY_LEAVE_CODE : leaveType;
    let entitlement = code ? await db.get(`SELECT * FROM workforce_employee_leave_entitlement WHERE tenant_id=? AND user_id=? AND leave_code=? AND financial_year_start=?`, [tenantId, userId, code, yearStart], tx) : null;
    const profile = await db.get("SELECT leave_allotted,joining_date,is_active_employee FROM accounts_employeeprofile WHERE user_id=?", [userId], tx);
    if (!entitlement && policy && profile) {
      const types = await getTypes(policy.id, tenantId, tx);
      const type = policy.legacy_shared_pool_enabled ? { leave_code: LEGACY_LEAVE_CODE, annual_entitlement: 0 } : types.find((item) => item.leave_code === leaveType);
      if (type) {
        const previousYear = new Date(`${yearStart}T00:00:00Z`); previousYear.setUTCFullYear(previousYear.getUTCFullYear() - 1);
        if (tx) await ensureYearEntitlement(tx, tenantId, userId, yearStart, yearEnd, policy, type, profile, ymd(previousYear));
        else await db.transaction(async (connection) => {
          await connection.get("SELECT user_id FROM accounts_employeeprofile WHERE user_id=? FOR UPDATE", [userId]);
          await ensureYearEntitlement(connection, tenantId, userId, yearStart, yearEnd, policy, type, profile, ymd(previousYear));
        });
        entitlement = await db.get(`SELECT * FROM workforce_employee_leave_entitlement WHERE tenant_id=? AND user_id=? AND leave_code=? AND financial_year_start=?`, [tenantId, userId, type.leave_code, yearStart], tx);
      }
    }
    const ledgerTotals = await db.get(`SELECT
        COALESCE(SUM(CASE WHEN transaction_type='consumption' THEN -amount ELSE 0 END),0) AS used,
        COALESCE(SUM(CASE WHEN transaction_type IN ('accrual','adjustment','reversal') THEN amount ELSE 0 END),0) AS delta
      FROM workforce_leave_ledger_transaction WHERE tenant_id=? AND user_id=? AND leave_code=? AND financial_year_start=? AND effective_date<=?`, [tenantId, userId, code || LEGACY_LEAVE_CODE, yearStart, dateInCompanyTz], tx);
    const includeAllTypes = !leaveType || code === LEGACY_LEAVE_CODE;
    const approvedTypeFilter = includeAllTypes ? "" : " AND leave_type=?";
    const approvedParams = [yearEnd, yearStart, tenantId, userId, ...(includeAllTypes ? [] : [leaveType])];
    const liveApproved = entitlement ? Number(ledgerTotals?.used || 0) : Number((await db.get(`SELECT COALESCE(SUM(GREATEST(0,DATEDIFF(LEAST(to_date,?),GREATEST(from_date,?))+1)),0) AS days
      FROM leave_leave WHERE tenant_id=? AND user_id=? AND status='approved'${approvedTypeFilter}`, approvedParams, tx))?.days || 0);
    const concessionTypeFilter = leaveType ? " AND leave_type=?" : "";
    const concessionParams = [tenantId, userId, dateInCompanyTz, dateInCompanyTz, ...(leaveType ? [leaveType] : [])];
    const concessions = await db.get(`SELECT COALESCE(SUM(adjustment_days),0) AS days FROM leave_concession_ledger
      WHERE tenant_id=? AND user_id=? AND effective_date<=? AND (expiry_date IS NULL OR expiry_date>=?)${concessionTypeFilter}`, concessionParams, tx);
    const pendingTypeFilter = leaveType ? " AND leave_type=?" : "";
    const pendingParams = [yearEnd, yearStart, tenantId, userId, yearEnd, yearStart, ...(leaveType ? [leaveType] : [])];
    const pending = await db.get(`SELECT COUNT(*) AS requests, COALESCE(SUM(DATEDIFF(LEAST(to_date,?),GREATEST(from_date,?))+1),0) AS days
      FROM leave_leave WHERE tenant_id=? AND user_id=? AND status='pending' AND from_date<=? AND to_date>=?${pendingTypeFilter}`, pendingParams, tx);
    let base = Number(entitlement?.opening_balance ?? profile?.leave_allotted ?? 0);
    if (entitlement && Number(entitlement.carry_forward_days) > 0 && policy && !policy.legacy_shared_pool_enabled) {
      const type = (await getTypes(policy.id, tenantId, tx)).find((item) => item.leave_code === leaveType);
      if (type?.expired_balance_forfeited && type.carry_forward_expiry_days) {
        const carryExpiry = new Date(`${yearStart}T00:00:00Z`);
        carryExpiry.setUTCDate(carryExpiry.getUTCDate() + Number(type.carry_forward_expiry_days));
        if (dateInCompanyTz > ymd(carryExpiry)) base -= Number(entitlement.carry_forward_days);
      }
    }
    base += Number(ledgerTotals?.delta || 0);
    const used = liveApproved;
    const concession = Number(concessions?.days || 0);
    return {
      financial_year_start: yearStart,
      financial_year_end: yearEnd,
      policy_version_id: policy?.id ? Number(policy.id) : null,
      leave_code: code || leaveType,
      base_entitlement: Number(entitlement?.annual_entitlement ?? profile?.leave_allotted ?? 0),
      carry_forward: Number(entitlement?.carry_forward_days || 0),
      opening_balance: base,
      management_concession: concession,
      leaves_used: used,
      pending_days: Number(pending?.days || 0),
      pending_requests: Number(pending?.requests || 0),
      available_balance: base - used + concession,
    };
  },

  async getCompanyPolicy(tenantId, actor) {
    requireManager(actor);
    const versions = await db.all("SELECT * FROM workforce_leave_policy_version WHERE tenant_id=? ORDER BY version_number DESC", [tenantId]);
    const latestPublished = versions.find((item) => item.status === "published") || null;
    const localToday = localDateInTimezone(new Date(), latestPublished?.timezone || "Asia/Kolkata");
    const current = versions.filter((item) => item.status === "published" && String(item.effective_from_fy_start).slice(0, 10) <= localToday)
      .sort((a, b) => String(b.effective_from_fy_start).localeCompare(String(a.effective_from_fy_start)))[0] || null;
    const types = current ? await getTypes(current.id, tenantId) : [];
    const history = await Promise.all(versions.map(async (version) => ({ ...version, leave_types: await getTypes(version.id, tenantId) })));
    const latestRun = await db.get("SELECT * FROM workforce_leave_reset_run WHERE tenant_id=? ORDER BY financial_year_start DESC LIMIT 1", [tenantId]);
    return { current, versions: history, leave_types: types, next_reset_date: this.nextResetDate(current), latest_reset: latestRun };
  },

  nextResetDate(policy) {
    const timezone = policy?.timezone || "Asia/Kolkata";
    const today = localDateInTimezone(new Date(), timezone);
    const start = financialYearStart(today, Number(policy?.financial_year_start_month || 4), Number(policy?.financial_year_start_day || 1));
    return plusYear(start);
  },

  async saveDraft(tenantId, input, actor) {
    requireManager(actor);
    if (!input.reason?.trim()) throw new AppError("Policy change reason is required", 400);
    try {
      if (!input.timezone) throw new Error("Timezone is required");
      new Intl.DateTimeFormat(undefined, { timeZone: input.timezone });
    } catch {
      throw new AppError("A valid company timezone is required", 400);
    }
    const types = Array.isArray(input.leave_types) ? input.leave_types : [];
    if (!input.legacy_shared_pool_enabled && !types.some((type) => type.active_status && Number(type.annual_entitlement) > 0)) throw new AppError("Configure at least one active leave type with an annual entitlement before turning off the shared legacy balance", 400);
    return db.transaction(async (tx) => {
      await tx.get("SELECT id FROM workforce_tenant WHERE id=? FOR UPDATE", [tenantId]);
      const last = await tx.get("SELECT COALESCE(MAX(version_number),0) AS v FROM workforce_leave_policy_version WHERE tenant_id=?", [tenantId]);
      const version = Number(last.v || 0) + 1;
      const currentYear = financialYearStart(localDateInTimezone(new Date(), input.timezone), Number(input.financial_year_start_month || 4), Number(input.financial_year_start_day || 1));
      const currentEntitlement = await tx.get("SELECT id FROM workforce_employee_leave_entitlement WHERE tenant_id=? AND financial_year_start=? LIMIT 1", [tenantId, currentYear]);
      const effective = input.effective_from_fy_start || (currentEntitlement ? plusYear(currentYear) : currentYear);
      if (effective < currentYear) throw new AppError("Policy changes cannot be made effective in a closed financial year", 400);
      if (effective !== financialYearStart(effective, Number(input.financial_year_start_month || 4), Number(input.financial_year_start_day || 1))) throw new AppError("Policy effective date must be the first day of its financial year", 400);
      const header = await tx.run(`INSERT INTO workforce_leave_policy_version
        (tenant_id,version_number,status,effective_from_fy_start,financial_year_start_month,financial_year_start_day,timezone,automatic_reset,legacy_shared_pool_enabled,proration_method,reason,changed_by)
        VALUES (?,?,'draft',?,?,?,?,?,?,?,?,?)`, [tenantId, version, effective, input.financial_year_start_month || 4, input.financial_year_start_day || 1, input.timezone, input.automatic_reset ? 1 : 0, input.legacy_shared_pool_enabled ? 1 : 0, input.proration_method || "none", input.reason.trim(), actor.id]);
      for (const type of types) {
        if (!type.leave_code?.trim() || !type.leave_name?.trim() || Number(type.annual_entitlement) < 0) throw new AppError("Every leave type needs a name, code, and non-negative annual entitlement", 400);
        await tx.run(`INSERT INTO workforce_leave_type_policy
          (tenant_id,policy_version_id,leave_code,leave_name,annual_entitlement,is_paid,carry_forward_enabled,max_carry_forward_days,carry_forward_expiry_days,expired_balance_forfeited,carry_forward_requires_approval,minimum_application_days,maximum_consecutive_days,half_day_allowed,requires_approval,requires_document,accrual_frequency,probation_restriction_months,active_status,eligibility_rules)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [tenantId, header.lastID, type.leave_code.trim().toLowerCase(), type.leave_name.trim(), Number(type.annual_entitlement), type.is_paid ? 1 : 0, type.carry_forward_enabled ? 1 : 0, Number(type.max_carry_forward_days || 0), type.carry_forward_expiry_days || null, type.expired_balance_forfeited === false ? 0 : 1, type.carry_forward_requires_approval ? 1 : 0, Number(type.minimum_application_days || 1), type.maximum_consecutive_days || null, type.half_day_allowed ? 1 : 0, type.requires_approval === false ? 0 : 1, type.requires_document ? 1 : 0, type.accrual_frequency || "none", Number(type.probation_restriction_months || 0), type.active_status === false ? 0 : 1, JSON.stringify(type.eligibility_rules || {})]);
      }
      await auditService.log(actor, "leave_policy_draft_created", String(header.lastID), { version, effective, reason: input.reason.trim() }, null, tx);
      return { id: header.lastID, version_number: version, status: "draft" };
    });
  },

  async previewPolicy(tenantId, versionId, actor) {
    requireManager(actor);
    const draft = await db.get("SELECT * FROM workforce_leave_policy_version WHERE tenant_id=? AND id=? AND status='draft'", [tenantId, versionId]);
    if (!draft) throw new AppError("Draft policy not found", 404);
    const types = await getTypes(draft.id, tenantId);
    const current = await db.get("SELECT * FROM workforce_leave_policy_version WHERE tenant_id=? AND status='published' ORDER BY version_number DESC LIMIT 1", [tenantId]);
    const currentTypes = current ? await getTypes(current.id, tenantId) : [];
    const effective = dateString(draft.effective_from_fy_start);
    const endDate = yearEndDate(effective);
    let cursor = 0;
    let employeeCount = 0;
    let currentLegacyTotal = 0;
    const typeImpact = new Map(types.filter((type) => type.active_status).map((type) => [type.leave_code, { leave_code: type.leave_code, leave_name: type.leave_name, eligible_employee_count: 0, estimated_entitlement_total: 0 }]));
    while (true) {
      const employees = await db.all(`SELECT u.id,p.leave_allotted,p.joining_date,p.team_name,p.designation
        FROM workforce_user_tenant w JOIN accounts_user u ON u.id=w.user_id JOIN accounts_employeeprofile p ON p.user_id=u.id
        WHERE w.tenant_id=? AND w.is_active=1 AND u.is_active=1 AND p.is_active_employee=1 AND u.role='employee' AND u.id>?
        ORDER BY u.id LIMIT 500`, [tenantId, cursor]);
      if (!employees.length) break;
      cursor = Number(employees[employees.length - 1].id);
      employeeCount += employees.length;
      for (const employee of employees) {
        currentLegacyTotal += Number(employee.leave_allotted || 0);
        for (const type of types) {
          if (!type.active_status) continue;
          let rules = type.eligibility_rules || {};
          if (typeof rules === "string") { try { rules = JSON.parse(rules || "{}"); } catch { rules = {}; } }
          const allowedTeams = rules.allowed_teams || rules.teams;
          const allowedDesignations = rules.allowed_designations || rules.designations;
          if (Array.isArray(allowedTeams) && allowedTeams.length && !allowedTeams.includes(employee.team_name)) continue;
          if (Array.isArray(allowedDesignations) && allowedDesignations.length && !allowedDesignations.includes(employee.designation)) continue;
          let annual = Number(type.annual_entitlement || 0);
          const joining = dateString(employee.joining_date);
          if (draft.proration_method === "monthly" && joining && joining > effective) {
            const joined = new Date(`${joining}T00:00:00Z`);
            const yearEnd = new Date(`${endDate}T00:00:00Z`);
            const months = Math.max(0, Math.min(12, (yearEnd.getUTCFullYear() - joined.getUTCFullYear()) * 12 + yearEnd.getUTCMonth() - joined.getUTCMonth() + 1));
            annual = Math.round((annual * months / 12) * 100) / 100;
          }
          if (Number(type.probation_restriction_months) > 0 && joining) {
            const eligible = new Date(`${joining}T00:00:00Z`);
            eligible.setUTCMonth(eligible.getUTCMonth() + Number(type.probation_restriction_months));
            if (ymd(eligible) > endDate) annual = 0;
          }
          const item = typeImpact.get(type.leave_code);
          item.eligible_employee_count += 1;
          item.estimated_entitlement_total += annual;
        }
      }
    }
    const proposedTotal = draft.legacy_shared_pool_enabled
      ? currentLegacyTotal
      : [...typeImpact.values()].reduce((sum, item) => sum + item.estimated_entitlement_total, 0);
    return {
      effective_from_fy_start: effective,
      eligible_employee_count: employeeCount,
      current_legacy_allocation_total: currentLegacyTotal,
      proposed_total_annual_entitlement: Math.round(proposedTotal * 100) / 100,
      estimated_change_from_legacy: Math.round((proposedTotal - currentLegacyTotal) * 100) / 100,
      per_type_impact: [...typeImpact.values()].map((item) => ({ ...item, estimated_entitlement_total: Math.round(item.estimated_entitlement_total * 100) / 100 })),
      current_types: currentTypes,
      proposed_types: types,
      legacy_shared_pool_enabled: Boolean(draft.legacy_shared_pool_enabled),
      impact_note: "Estimate includes configured annual entitlement, team/designation rules, probation restrictions and joining-date proration. It excludes carry-forward, employee exceptions, pending requests, concessions and actual used balances.",
    };
  },

  async publishPolicy(tenantId, versionId, actor) {
    requireManager(actor);
    return db.transaction(async (tx) => {
      const version = await tx.get("SELECT * FROM workforce_leave_policy_version WHERE tenant_id=? AND id=? FOR UPDATE", [tenantId, versionId]);
      if (!version || version.status !== "draft") throw new AppError("Only a draft policy can be published", 409);
      const existing = await tx.get("SELECT id FROM workforce_leave_policy_version WHERE tenant_id=? AND status='published' AND effective_from_fy_start=? FOR UPDATE", [tenantId, version.effective_from_fy_start]);
      if (existing) throw new AppError("A published policy already exists for that financial year", 409);
      const alreadyInitialized = await tx.get("SELECT id FROM workforce_employee_leave_entitlement WHERE tenant_id=? AND financial_year_start=? LIMIT 1", [tenantId, version.effective_from_fy_start]);
      if (alreadyInitialized) throw new AppError("That financial year already has initialized balances. Publish a policy for a future financial year instead.", 409);
      await tx.run("UPDATE workforce_leave_policy_version SET status='published',published_at=NOW() WHERE id=?", [versionId]);
      await auditService.log(actor, "leave_policy_published", String(versionId), { tenant_id: tenantId, effective_from_fy_start: version.effective_from_fy_start, reason: version.reason }, null, tx);
      return { id: Number(versionId), status: "published", effective_from_fy_start: version.effective_from_fy_start };
    });
  },

  async runReset(tenantId, yearStart, actor) {
    requireManager(actor);
    const current = await this.getCompanyPolicy(tenantId, actor);
    const latest = current.current;
    const fyStart = yearStart || financialYearStart(localDateInTimezone(new Date(), latest?.timezone || "Asia/Kolkata"), Number(latest?.financial_year_start_month || 4), Number(latest?.financial_year_start_day || 1));
    return runTenantReset(tenantId, fyStart, actor);
  },

  async processDueResets() {
    if (!(await financialSchemaReady())) return;
    const tenants = await db.all("SELECT DISTINCT tenant_id FROM workforce_leave_policy_version WHERE status='published'");
    for (const item of tenants) {
      const latest = await db.get("SELECT timezone FROM workforce_leave_policy_version WHERE tenant_id=? AND status='published' ORDER BY effective_from_fy_start DESC LIMIT 1", [item.tenant_id]);
      let today = localDateInTimezone(new Date(), latest?.timezone || "Asia/Kolkata");
      let applicable = await db.get("SELECT * FROM workforce_leave_policy_version WHERE tenant_id=? AND status='published' AND effective_from_fy_start<=? ORDER BY effective_from_fy_start DESC LIMIT 1", [item.tenant_id, today]);
      if (applicable?.timezone && applicable.timezone !== latest?.timezone) {
        today = localDateInTimezone(new Date(), applicable.timezone);
        applicable = await db.get("SELECT * FROM workforce_leave_policy_version WHERE tenant_id=? AND status='published' AND effective_from_fy_start<=? ORDER BY effective_from_fy_start DESC LIMIT 1", [item.tenant_id, today]);
      }
      if (!applicable?.automatic_reset) continue;
      const currentStart = financialYearStart(today, Number(applicable.financial_year_start_month), Number(applicable.financial_year_start_day));
      if (today < String(applicable.effective_from_fy_start).slice(0, 10)) continue;
      const alreadyComplete = await db.get("SELECT id FROM workforce_leave_reset_run WHERE tenant_id=? AND financial_year_start=? AND status='completed'", [item.tenant_id, currentStart]);
      if (!alreadyComplete) await runTenantReset(Number(item.tenant_id), currentStart).catch((err) => realtimeManager.broadcast("leave_reset_failed", { tenant_id: Number(item.tenant_id), financial_year_start: currentStart, message: err.message }, { targetRoles: MANAGEMENT_ROLES }));
    }
    await processAccrualsAndExpiries();
  },

  async listResetRuns(tenantId, actor) {
    requireManager(actor);
    return db.all(`SELECT r.*, v.version_number FROM workforce_leave_reset_run r JOIN workforce_leave_policy_version v ON v.id=r.policy_version_id
      WHERE r.tenant_id=? ORDER BY r.financial_year_start DESC`, [tenantId]);
  },

  async setEmployeeEligibility(tenantId, input, actor) {
    requireManager(actor);
    const employeeId = Number(input.employee_id);
    if (!Number.isSafeInteger(employeeId) || employeeId <= 0 || !input.reason?.trim()) throw new AppError("A valid employee and reason are required", 400);
    const policy = await db.get("SELECT * FROM workforce_leave_policy_version WHERE tenant_id=? AND status='published' AND effective_from_fy_start<=? ORDER BY effective_from_fy_start DESC LIMIT 1", [tenantId, input.effective_from]);
    const eligibilityFy = financialYearStart(input.effective_from, Number(policy?.financial_year_start_month || 4), Number(policy?.financial_year_start_day || 1));
    if (eligibilityFy !== input.effective_from) throw new AppError("Employee eligibility exceptions must begin on the first day of a financial year", 400);
    await siteService.ensureEmployeeVisible(tenantId, actor, employeeId);
    const result = await db.run(`INSERT INTO workforce_employee_leave_eligibility
      (tenant_id,user_id,leave_code,eligible,entitlement_override,effective_from,effective_to,reason,changed_by)
      VALUES (?,?,?,?,?,?,?,?,?)`, [tenantId, employeeId, input.leave_code, input.eligible === false ? 0 : 1, input.entitlement_override ?? null, input.effective_from, input.effective_to || null, input.reason.trim(), actor.id]);
    await auditService.log(actor, "leave_employee_eligibility_changed", String(result.lastID), { employee_id: employeeId, leave_code: input.leave_code, eligible: input.eligible !== false, entitlement_override: input.entitlement_override ?? null, reason: input.reason.trim() });
    return { id: result.lastID };
  },

  async employeeBalances(tenantId, actor, query = {}) {
    requireManager(actor);
    const { page = 1, limit = 25 } = query;
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 25));
    const search = String(query.search || "").trim();
    const params = [tenantId];
    let where = "w.tenant_id=? AND w.is_active=1 AND u.is_active=1 AND p.is_active_employee=1 AND u.role='employee'";
    if (search) {
      where += " AND (u.username LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR p.designation LIKE ? OR p.team_name LIKE ?)";
      params.push(...Array(5).fill(`%${search}%`));
    }
    if (actor.role === "hr") {
      const siteScope = await siteService.getSiteScope(tenantId, actor, query.site_id || null);
      const employees = await db.all(`SELECT u.id,u.username,u.first_name,u.last_name,p.team_name,p.designation,p.leave_allotted
        FROM workforce_user_tenant w JOIN accounts_user u ON u.id=w.user_id JOIN accounts_employeeprofile p ON p.user_id=u.id
        WHERE ${where} ORDER BY u.id`, params);
      const visible = [];
      for (const employee of employees) {
        const site = await siteService.getEmployeeSiteId(tenantId, employee.id, new Date().toISOString().slice(0, 10));
        if (siteScope.unassigned ? site === null : siteScope.siteIds?.includes(site)) visible.push(employee);
      }
      const records = await Promise.all(visible.slice((safePage - 1) * safeLimit, safePage * safeLimit).map(async (employee) => ({ ...employee, ...(await this.getBalance(employee.id, tenantId)) })));
      return { records, total: visible.length, page: safePage, limit: safeLimit };
    }
    const [totalRow, employees] = await Promise.all([
      db.get(`SELECT COUNT(*) AS total FROM workforce_user_tenant w JOIN accounts_user u ON u.id=w.user_id JOIN accounts_employeeprofile p ON p.user_id=u.id WHERE ${where}`, params),
      db.all(`SELECT u.id,u.username,u.first_name,u.last_name,p.team_name,p.designation,p.leave_allotted
        FROM workforce_user_tenant w JOIN accounts_user u ON u.id=w.user_id JOIN accounts_employeeprofile p ON p.user_id=u.id
        WHERE ${where} ORDER BY u.id LIMIT ? OFFSET ?`, [...params, safeLimit, (safePage - 1) * safeLimit]),
    ]);
    const records = await Promise.all(employees.map(async (employee) => ({ ...employee, ...(await this.getBalance(employee.id, tenantId)) })));
    return { records, total: Number(totalRow?.total || 0), page: safePage, limit: safeLimit };
  },
};

export default financialLeaveService;
