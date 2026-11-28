import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Info,
  Plus,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import API from "../../api/axios";
import { usePopup } from "../../context/PopupContext";

const defaultType = (suffix = "") => ({
  leave_code: suffix ? `new_leave_${suffix}` : "new_leave",
  leave_name: suffix ? `New Leave ${suffix}` : "New Leave",
  annual_entitlement: 0,
  is_paid: true,
  carry_forward_enabled: false,
  max_carry_forward_days: 0,
  carry_forward_expiry_days: null,
  expired_balance_forfeited: true,
  carry_forward_requires_approval: false,
  minimum_application_days: 1,
  maximum_consecutive_days: null,
  half_day_allowed: false,
  requires_approval: true,
  requires_document: false,
  accrual_frequency: "none",
  probation_restriction_months: 0,
  active_status: true,
  eligibility_rules: {},
});

const inputClass =
  "mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20";

const numberValue = (value) => (value === "" || value == null ? null : Number(value));

const parseRules = (value) => {
  if (!value || typeof value === "object") return value || {};
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

const isValidTimezone = (tz) => {
  if (!tz || !String(tz).trim()) return false;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: String(tz).trim() });
    return true;
  } catch {
    return false;
  }
};

const formatDateShort = (value) => {
  if (!value) return "—";
  return String(value).slice(0, 10);
};

const formatDateTime = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
};

const STATUS_BADGE = {
  published: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  draft: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  completed: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  completed_with_errors: "bg-amber-50 text-amber-700 ring-1 ring-amber-200",
  failed: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
  running: "bg-blue-50 text-blue-700 ring-1 ring-blue-200",
};

export default function CompanyLeavePolicy() {
  const { showPopup } = usePopup();
  const showPopupRef = useRef(showPopup);
  showPopupRef.current = showPopup;

  const [policy, setPolicy] = useState(null);
  const [balances, setBalances] = useState({ records: [], total: 0, page: 1, limit: 25 });
  const [runs, setRuns] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [balancePage, setBalancePage] = useState(1);
  const [balanceRefresh, setBalanceRefresh] = useState(0);
  const [draft, setDraft] = useState(null);
  const [reason, setReason] = useState("");
  const [expandedTypes, setExpandedTypes] = useState({});
  const [expandedReasons, setExpandedReasons] = useState({});
  const [formErrors, setFormErrors] = useState({});

  // Searchable employee selector state for Eligibility Exception
  const [empDropdownOpen, setEmpDropdownOpen] = useState(false);
  const [empQuery, setEmpQuery] = useState("");
  const empDropdownRef = useRef(null);
  const [eligibility, setEligibility] = useState({
    employee_id: "",
    leave_code: "casual",
    eligible: true,
    entitlement_override: "",
    effective_from: new Date().toISOString().slice(0, 10),
    effective_to: "",
    reason: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [policyResult, runsResult, empResult] = await Promise.all([
        API.get("/leave/policy/"),
        API.get("/leave/policy/reset-runs/"),
        API.get("/auth/employees/", { params: { limit: 100 } }).catch(() => ({ data: { data: [] } })),
      ]);
      const next = policyResult.data;
      setPolicy(next);
      setRuns(runsResult.data?.records || []);
      const empList = empResult.data?.data || empResult.data?.records || [];
      setEmployees(Array.isArray(empList) ? empList : []);

      const draftVersion = next.versions?.find((version) => version.status === "draft");
      const publishedSource = next.current || next.latest_published;
      const source = draftVersion || publishedSource;

      if (source?.legacy_shared_pool_enabled) {
        setEligibility((value) => ({ ...value, leave_code: "__legacy_shared__" }));
      } else if (source?.leave_types?.length) {
        setEligibility((value) => ({
          ...value,
          leave_code: source.leave_types[0]?.leave_code || value.leave_code,
        }));
      }

      setDraft(
        source
          ? {
              effective_from_fy_start:
                draftVersion?.effective_from_fy_start?.slice(0, 10) ||
                next.next_reset_date ||
                source.effective_from_fy_start?.slice(0, 10) ||
                "",
              financial_year_start_month: Number(source.financial_year_start_month),
              financial_year_start_day: Number(source.financial_year_start_day),
              timezone: source.timezone || "Asia/Kolkata",
              automatic_reset: Boolean(source.automatic_reset),
              legacy_shared_pool_enabled: Boolean(source.legacy_shared_pool_enabled),
              proration_method: source.proration_method || "none",
              leave_types: (source.leave_types || next.leave_types || []).map((type) => ({
                ...defaultType(),
                ...type,
                eligibility_rules: parseRules(type.eligibility_rules),
                annual_entitlement: Number(type.annual_entitlement || 0),
                max_carry_forward_days: Number(type.max_carry_forward_days || 0),
                minimum_application_days: Number(type.minimum_application_days || 1),
                probation_restriction_months: Number(type.probation_restriction_months || 0),
              })),
            }
          : {
              effective_from_fy_start: next.next_reset_date || "",
              financial_year_start_month: 4,
              financial_year_start_day: 1,
              timezone: "Asia/Kolkata",
              automatic_reset: true,
              legacy_shared_pool_enabled: true,
              proration_method: "none",
              leave_types: [
                { ...defaultType(), leave_code: "casual", leave_name: "Casual Leave" },
                { ...defaultType(), leave_code: "sick", leave_name: "Sick Leave" },
                { ...defaultType(), leave_code: "paid", leave_name: "Paid Leave" },
              ],
            }
      );
      setReason(draftVersion?.reason || "");
      setFormErrors({});
    } catch (error) {
      showPopupRef.current(error.response?.data?.error || "Unable to load company leave policy", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  const [debouncedSearch, setDebouncedSearch] = useState(search);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const controller = new AbortController();
    API.get("/leave/policy/balances/", {
      params: { page: balancePage, limit: 25, search: debouncedSearch },
      signal: controller.signal,
    })
      .then((res) => setBalances(res.data || { records: [], total: 0, page: 1, limit: 25 }))
      .catch((error) => {
        if (error.name === "CanceledError" || error.code === "ERR_CANCELED") return;
        showPopupRef.current(error.response?.data?.error || "Unable to load employee balances", "error");
      });

    return () => controller.abort();
  }, [balancePage, balanceRefresh, debouncedSearch]);

  useEffect(() => {
    const onDocMouseDown = (event) => {
      if (empDropdownRef.current && !empDropdownRef.current.contains(event.target)) {
        setEmpDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  const change = (key, value) => {
    setFormErrors((prev) => ({ ...prev, [key]: undefined }));
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const updateType = (index, key, value) => {
    setFormErrors((prev) => ({ ...prev, [`type_${index}`]: undefined }));
    setDraft((current) => ({
      ...current,
      leave_types: current.leave_types.map((type, position) =>
        position === index ? { ...type, [key]: value } : type
      ),
    }));
  };

  const addLeaveType = () => {
    const nextIdx = (draft?.leave_types?.length || 0) + 1;
    const newItem = defaultType(String(nextIdx));
    change("leave_types", [...(draft?.leave_types || []), newItem]);
    setExpandedTypes((prev) => ({ ...prev, [nextIdx - 1]: true }));
  };

  const removeLeaveType = (index) => {
    if ((draft?.leave_types?.length || 0) <= 1) {
      showPopup("At least one leave type must remain configured", "warning");
      return;
    }
    change(
      "leave_types",
      draft.leave_types.filter((_, position) => position !== index)
    );
  };

  // Deduplicated active leave type calculations
  const { activeTypeCount, annualEntitlement, carryForwardTypes } = useMemo(() => {
    const list = draft?.leave_types || [];
    const seen = new Set();
    let active = 0;
    let totalDays = 0;
    let cfCount = 0;
    for (const type of list) {
      const code = String(type.leave_code || "").trim().toLowerCase();
      if (!type.active_status || !code || seen.has(code)) continue;
      seen.add(code);
      active += 1;
      const days = Number(type.annual_entitlement);
      if (Number.isFinite(days) && days >= 0 && days <= 365) {
        totalDays += days;
      }
      if (type.carry_forward_enabled) cfCount += 1;
    }
    return {
      activeTypeCount: active,
      annualEntitlement: Math.round(totalDays * 100) / 100,
      carryForwardTypes: cfCount,
    };
  }, [draft]);

  const validateDraft = () => {
    const errors = {};
    const month = Number(draft.financial_year_start_month);
    const day = Number(draft.financial_year_start_day);
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      errors.financial_year_start_month = "Month must be between 1 and 12.";
    }
    if (!Number.isInteger(day) || day < 1 || day > 28) {
      errors.financial_year_start_day = "Day must be between 1 and 28.";
    }
    if (!isValidTimezone(draft.timezone)) {
      errors.timezone = "Enter a valid IANA timezone (e.g. Asia/Kolkata).";
    }
    if (!draft.effective_from_fy_start || !/^\d{4}-\d{2}-\d{2}$/.test(draft.effective_from_fy_start)) {
      errors.effective_from_fy_start = "Policy effective date (YYYY-MM-DD) is required.";
    }
    if (!reason.trim()) {
      errors.reason = "Reason for change is required for the audit trail.";
    }

    const seenCodes = new Set();
    draft.leave_types.forEach((type, index) => {
      const code = String(type.leave_code || "").trim().toLowerCase();
      const ent = Number(type.annual_entitlement);
      const minApp = Number(type.minimum_application_days);
      const maxCons = type.maximum_consecutive_days != null ? Number(type.maximum_consecutive_days) : null;
      if (!code || !String(type.leave_name || "").trim()) {
        errors[`type_${index}`] = "Leave code and name are required.";
      } else if (seenCodes.has(code)) {
        errors[`type_${index}`] = `Duplicate leave code "${code}".`;
      } else if (!Number.isFinite(ent) || ent < 0 || ent > 365) {
        errors[`type_${index}`] = "Annual days must be between 0 and 365.";
      } else if (!Number.isFinite(minApp) || minApp <= 0 || minApp > 365) {
        errors[`type_${index}`] = "Minimum application days must be between 0.5 and 365.";
      } else if (maxCons !== null && (maxCons < minApp || maxCons > 365)) {
        errors[`type_${index}`] = "Max consecutive days must be >= minimum application days and <= 365.";
      }
      seenCodes.add(code);
    });

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const saveDraft = async () => {
    if (!validateDraft()) {
      showPopup("Please fix the highlighted validation errors before saving", "warning");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...draft,
        reason: reason.trim(),
        leave_types: draft.leave_types.map((type) => ({
          ...type,
          annual_entitlement: Number(type.annual_entitlement),
          max_carry_forward_days: Number(type.max_carry_forward_days),
          minimum_application_days: Number(type.minimum_application_days),
          maximum_consecutive_days: numberValue(type.maximum_consecutive_days),
          carry_forward_expiry_days: numberValue(type.carry_forward_expiry_days),
          probation_restriction_months: Number(type.probation_restriction_months),
        })),
      };
      const result = await API.post("/leave/policy/drafts/", payload);
      showPopup(`Draft policy v${result.data.version_number} saved`, "success");
      await load();
    } catch (error) {
      showPopup(error.response?.data?.error || "Unable to save policy draft", "error");
    } finally {
      setSaving(false);
    }
  };

  const previewAndPublish = async (versionId) => {
    setBusy(true);
    try {
      const { data } = await API.post(`/leave/policy/${versionId}/preview/`);
      const typeSummary = (data.per_type_impact || [])
        .map((type) => `${type.leave_name}: ${type.eligible_employee_count} eligible, ${type.estimated_entitlement_total} days`)
        .join("\n");
      const confirmed = window.confirm(
        `Publish this policy effective ${data.effective_from_fy_start}?\n\nActive employees: ${data.eligible_employee_count}\nEstimated total entitlement: ${data.proposed_total_annual_entitlement} days\nDifference from shared legacy allocation: ${data.estimated_change_from_legacy} days\n\n${typeSummary}\n\n${data.impact_note}\n\nBalances already initialized for that year cannot be replaced.`
      );
      if (!confirmed) return;
      await API.post(`/leave/policy/${versionId}/publish/`);
      showPopup("Company leave policy published", "success");
      await load();
    } catch (error) {
      showPopup(error.response?.data?.error || "Unable to publish policy", "error");
    } finally {
      setBusy(false);
    }
  };

  const reconcile = async () => {
    if (!window.confirm("Run or retry financial-year balance initialization for this tenant?")) return;
    setBusy(true);
    try {
      const result = await API.post("/leave/policy/reset-runs/reconcile/");
      showPopup(
        `Processed ${result.data.employees} employees; ${result.data.failures} failures`,
        result.data.failures ? "warning" : "success"
      );
      await load();
      setBalanceRefresh((value) => value + 1);
    } catch (error) {
      showPopup(error.response?.data?.error || "Unable to reconcile balances", "error");
    } finally {
      setBusy(false);
    }
  };

  const selectedEligibilityEmployee = useMemo(
    () => employees.find((emp) => String(emp.id) === String(eligibility.employee_id)) || null,
    [employees, eligibility.employee_id]
  );

  const filteredEmployees = useMemo(() => {
    const q = empQuery.trim().toLowerCase();
    if (!q) return employees.slice(0, 40);
    return employees
      .filter((emp) => {
        const fullName = `${emp.first_name || ""} ${emp.last_name || ""}`.toLowerCase();
        return (
          String(emp.id).includes(q) ||
          fullName.includes(q) ||
          (emp.username || "").toLowerCase().includes(q) ||
          (emp.team_name || "").toLowerCase().includes(q)
        );
      })
      .slice(0, 40);
  }, [employees, empQuery]);

  const saveEligibility = async (event) => {
    event.preventDefault();
    const empId = Number(eligibility.employee_id);
    if (!Number.isInteger(empId) || empId <= 0) {
      showPopup("Please select a valid employee", "warning");
      return;
    }
    if (eligibility.effective_to && eligibility.effective_to < eligibility.effective_from) {
      showPopup("Effective to date cannot be earlier than effective from date", "warning");
      return;
    }
    if (
      eligibility.entitlement_override !== "" &&
      (Number(eligibility.entitlement_override) < 0 || Number(eligibility.entitlement_override) > 365)
    ) {
      showPopup("Entitlement override must be between 0 and 365 days", "warning");
      return;
    }
    try {
      await API.post("/leave/policy/employee-eligibility/", {
        ...eligibility,
        employee_id: empId,
        entitlement_override: numberValue(eligibility.entitlement_override),
        effective_to: eligibility.effective_to || null,
      });
      showPopup("Employee leave eligibility saved", "success");
      setEligibility((value) => ({ ...value, employee_id: "", entitlement_override: "", reason: "" }));
      setEmpQuery("");
      await load();
      setBalanceRefresh((value) => value + 1);
    } catch (error) {
      showPopup(error.response?.data?.error || "Unable to save employee eligibility", "error");
    }
  };

  if (loading || !draft) {
    return (
      <div className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, idx) => (
            <div key={idx} className="h-28 animate-pulse rounded-2xl border border-slate-200 bg-white p-4" />
          ))}
        </section>
        <section className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white p-6" />
      </div>
    );
  }

  const publishedPolicy = policy.current || policy.latest_published;
  const currentYear = publishedPolicy?.effective_from_fy_start
    ? formatDateShort(publishedPolicy.effective_from_fy_start)
    : "Not configured";
  const draftVersion = policy.versions?.find((version) => version.status === "draft");
  const isLegacyPublished = Boolean(publishedPolicy?.legacy_shared_pool_enabled);

  return (
    <div className="space-y-6">
      {/* KPI SUMMARY CARDS */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <SummaryCard
          label="Current policy"
          value={publishedPolicy ? `v${publishedPolicy.version_number}` : "Not published"}
          badge={
            publishedPolicy ? (
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  isLegacyPublished
                    ? "bg-blue-50 text-blue-700 ring-1 ring-blue-200"
                    : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                }`}
              >
                {isLegacyPublished ? "Legacy Shared Pool" : "Typed Policy"}
              </span>
            ) : null
          }
          detail={publishedPolicy ? `Effective ${currentYear}` : "No published version"}
        />
        <SummaryCard label="Leave types" value={activeTypeCount} detail="Active unique types in draft" />
        <SummaryCard
          label="Annual entitlement"
          value={`${annualEntitlement} days`}
          detail={
            annualEntitlement === 0
              ? draft.legacy_shared_pool_enabled
                ? "Legacy shared pool active (0 typed)"
                : "Entitlements not configured"
              : "Combined active type allocation"
          }
          tooltip="Sum of annual_entitlement across active, non-duplicate leave types in this draft."
        />
        <SummaryCard
          label="Carry forward"
          value={carryForwardTypes ? `${carryForwardTypes} types` : "Disabled"}
          detail="Configured per leave type"
        />
        <SummaryCard
          label="Next annual reset"
          value={formatDateShort(policy.next_reset_date)}
          detail={draft.automatic_reset ? "Automatic reset enabled" : "Manual reset required"}
        />
        <SummaryCard
          label="Policy status"
          value={
            draftVersion
              ? `Draft v${draftVersion.version_number}`
              : publishedPolicy
              ? "Published"
              : "Not published"
          }
          badge={
            policy.latest_reset?.status ? (
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
                  STATUS_BADGE[policy.latest_reset.status] || "bg-slate-100 text-slate-700"
                }`}
              >
                Reset: {policy.latest_reset.status.replace(/_/g, " ")}
              </span>
            ) : null
          }
          detail={
            draftVersion && publishedPolicy
              ? `Live: v${publishedPolicy.version_number} · Draft pending`
              : policy.latest_reset?.financial_year_start
              ? `FY ${formatDateShort(policy.latest_reset.financial_year_start)}`
              : "No reset run yet"
          }
        />
      </section>

      {draft.legacy_shared_pool_enabled && (
        <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <Info size={18} className="mt-0.5 shrink-0 text-blue-600" />
          <div>
            <strong>Shared legacy balance is active.</strong> Current employee allocations remain one shared balance
            and are not reassigned to individual leave types. Disable this only after configuring typed leave
            entitlements and publishing for a future financial year.
          </div>
        </div>
      )}

      {/* COMPANY POLICY SETTINGS & EXPANDABLE LEAVE TYPE BUILDER */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Company policy settings</h2>
            <p className="text-sm text-slate-500">
              Draft changes take effect only after an authorized manager previews and publishes them.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              load();
              setBalanceRefresh((value) => value + 1);
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw size={15} />
            Refresh
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Financial year starts month" error={formErrors.financial_year_start_month}>
            <input
              className={inputClass}
              type="number"
              min="1"
              max="12"
              value={draft.financial_year_start_month}
              onChange={(e) => change("financial_year_start_month", Number(e.target.value))}
            />
          </Field>
          <Field label="Start day (1–28)" error={formErrors.financial_year_start_day}>
            <input
              className={inputClass}
              type="number"
              min="1"
              max="28"
              value={draft.financial_year_start_day}
              onChange={(e) => change("financial_year_start_day", Number(e.target.value))}
            />
          </Field>
          <Field label="Company timezone" error={formErrors.timezone}>
            <input
              className={inputClass}
              value={draft.timezone}
              onChange={(e) => change("timezone", e.target.value)}
              placeholder="Asia/Kolkata"
            />
          </Field>
          <Field label="Policy effective from" error={formErrors.effective_from_fy_start}>
            <input
              className={inputClass}
              type="date"
              value={draft.effective_from_fy_start || ""}
              onChange={(e) => change("effective_from_fy_start", e.target.value)}
            />
          </Field>
          <Field label="Proration">
            <select
              className={inputClass}
              value={draft.proration_method}
              onChange={(e) => change("proration_method", e.target.value)}
            >
              <option value="none">No proration</option>
              <option value="monthly">Monthly proration</option>
            </select>
          </Field>
          <Toggle
            label="Automatic annual reset"
            checked={draft.automatic_reset}
            onChange={(value) => change("automatic_reset", value)}
          />
          <Toggle
            label="Keep shared legacy pool"
            checked={draft.legacy_shared_pool_enabled}
            onChange={(value) => change("legacy_shared_pool_enabled", value)}
          />
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold text-slate-900">Leave types and rules</h3>
            <p className="text-xs text-slate-500">Click any leave type card to expand and edit its full configuration.</p>
          </div>
          <button
            type="button"
            onClick={addLeaveType}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Plus size={15} />
            Add leave type
          </button>
        </div>

        <div className="mt-3 space-y-3">
          {draft.leave_types.map((type, index) => {
            const isExpanded = Boolean(expandedTypes[index]);
            const typeError = formErrors[`type_${index}`];
            return (
              <div
                key={`${type.leave_code}-${index}`}
                className={`rounded-xl border ${
                  typeError ? "border-rose-300 bg-rose-50/30" : "border-slate-200 bg-white"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() => setExpandedTypes((prev) => ({ ...prev, [index]: !prev[index] }))}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left focus:outline-none"
                  >
                    {isExpanded ? (
                      <ChevronDown size={18} className="shrink-0 text-slate-500" />
                    ) : (
                      <ChevronRight size={18} className="shrink-0 text-slate-500" />
                    )}
                    <span className="truncate font-semibold text-slate-900">
                      {type.leave_name || "Unnamed Leave"}
                    </span>
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">
                      {type.leave_code || "no_code"}
                    </span>
                    <span className="text-xs font-medium text-slate-600">
                      {Number(type.annual_entitlement || 0)} days/yr
                    </span>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        type.active_status
                          ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                          : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
                      }`}
                    >
                      {type.active_status ? "Active" : "Inactive"}
                    </span>
                  </button>

                  {draft.leave_types.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeLeaveType(index)}
                      aria-label={`Remove ${type.leave_name || "leave type"}`}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>

                {typeError && <p className="px-4 pb-2 text-xs font-medium text-rose-600">{typeError}</p>}

                {isExpanded && (
                  <div className="space-y-5 border-t border-slate-100 p-4">
                    <div>
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Group A – Basic Information
                      </h4>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Field label="Leave code">
                          <input
                            className={inputClass}
                            maxLength={20}
                            value={type.leave_code}
                            onChange={(e) =>
                              updateType(index, "leave_code", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))
                            }
                          />
                        </Field>
                        <Field label="Name">
                          <input
                            className={inputClass}
                            value={type.leave_name}
                            onChange={(e) => updateType(index, "leave_name", e.target.value)}
                          />
                        </Field>
                        <Field label="Annual days">
                          <input
                            className={inputClass}
                            type="number"
                            min="0"
                            max="365"
                            step="0.5"
                            value={type.annual_entitlement}
                            onChange={(e) => updateType(index, "annual_entitlement", Number(e.target.value))}
                          />
                        </Field>
                        <Field label="Minimum application days">
                          <input
                            className={inputClass}
                            type="number"
                            min="0.5"
                            max="365"
                            step="0.5"
                            value={type.minimum_application_days}
                            onChange={(e) => updateType(index, "minimum_application_days", Number(e.target.value))}
                          />
                        </Field>
                      </div>
                    </div>

                    <div>
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Group B – Accrual & Carry Forward
                      </h4>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Field label="Accrual frequency">
                          <select
                            className={inputClass}
                            value={type.accrual_frequency}
                            onChange={(e) => updateType(index, "accrual_frequency", e.target.value)}
                          >
                            {["none", "monthly", "quarterly", "yearly"].map((item) => (
                              <option key={item} value={item}>
                                {item}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Carry-forward cap (days)">
                          <input
                            className={inputClass}
                            type="number"
                            min="0"
                            step="0.5"
                            value={type.max_carry_forward_days}
                            onChange={(e) => updateType(index, "max_carry_forward_days", Number(e.target.value))}
                          />
                        </Field>
                        <Field label="Carry-forward expires after (days)">
                          <input
                            className={inputClass}
                            type="number"
                            min="1"
                            value={type.carry_forward_expiry_days ?? ""}
                            onChange={(e) => updateType(index, "carry_forward_expiry_days", numberValue(e.target.value))}
                          />
                        </Field>
                        <div className="flex items-end pb-1">
                          <label
                            className="flex items-center gap-2 text-sm text-slate-700"
                            title="Automatically forfeit unused carry-forward balance after the expiry window."
                          >
                            <input
                              type="checkbox"
                              checked={Boolean(type.expired_balance_forfeited)}
                              onChange={(e) => updateType(index, "expired_balance_forfeited", e.target.checked)}
                            />
                            Forfeit expired carry-forward
                          </label>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Group C – Eligibility & Restrictions
                      </h4>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Field label="Probation restriction (months)">
                          <input
                            className={inputClass}
                            type="number"
                            min="0"
                            max="60"
                            value={type.probation_restriction_months}
                            onChange={(e) => updateType(index, "probation_restriction_months", Number(e.target.value))}
                          />
                        </Field>
                        <Field label="Max consecutive days">
                          <input
                            className={inputClass}
                            type="number"
                            min="0.5"
                            value={type.maximum_consecutive_days ?? ""}
                            onChange={(e) => updateType(index, "maximum_consecutive_days", numberValue(e.target.value))}
                          />
                        </Field>
                        <Field label="Allowed teams (comma-separated)">
                          <input
                            className={inputClass}
                            value={(type.eligibility_rules?.allowed_teams || []).join(", ")}
                            onChange={(e) =>
                              updateType(index, "eligibility_rules", {
                                ...type.eligibility_rules,
                                allowed_teams: e.target.value
                                  .split(",")
                                  .map((item) => item.trim())
                                  .filter(Boolean),
                              })
                            }
                          />
                        </Field>
                        <Field label="Allowed designations (comma-separated)">
                          <input
                            className={inputClass}
                            value={(type.eligibility_rules?.allowed_designations || []).join(", ")}
                            onChange={(e) =>
                              updateType(index, "eligibility_rules", {
                                ...type.eligibility_rules,
                                allowed_designations: e.target.value
                                  .split(",")
                                  .map((item) => item.trim())
                                  .filter(Boolean),
                              })
                            }
                          />
                        </Field>
                      </div>
                    </div>

                    <div>
                      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Group D – Policy Flags
                      </h4>
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                          ["active_status", "Active", "Enable or disable this leave type in the policy."],
                          ["is_paid", "Paid", "Marks leave days as paid rather than loss-of-pay."],
                          ["carry_forward_enabled", "Carry forward", "Allow unused balance to roll into the next financial year."],
                          ["carry_forward_requires_approval", "Carry-forward approval", "Require manager approval before carry-forward is credited."],
                          ["half_day_allowed", "Half day", "Allow 0.5-day leave applications."],
                          ["requires_approval", "Approval required", "Require manager/HR approval before deducting balance."],
                          ["requires_document", "Document required", "Require supporting attachment (e.g., medical certificate)."],
                        ].map(([key, label, tip]) => (
                          <label
                            key={key}
                            title={tip}
                            className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2 text-sm text-slate-700"
                          >
                            <input
                              type="checkbox"
                              checked={Boolean(type[key])}
                              onChange={(e) => updateType(index, key, e.target.checked)}
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4">
          <Field label="Reason for change" error={formErrors.reason}>
            <textarea
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              rows="2"
              value={reason}
              onChange={(e) => {
                setFormErrors((prev) => ({ ...prev, reason: undefined }));
                setReason(e.target.value);
              }}
              placeholder="Required; recorded in the policy audit trail"
            />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={saveDraft}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            <Save size={16} />
            {saving ? "Saving…" : "Save as draft"}
          </button>
          {draftVersion && (
            <button
              type="button"
              disabled={busy}
              onClick={() => previewAndPublish(draftVersion.id)}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              <ShieldCheck size={16} />
              Preview and publish
            </button>
          )}
        </div>
      </section>

      {/* POLICY VERSION HISTORY */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Policy version history</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                {["Version", "Status", "Effective financial year", "Changed", "Reason"].map((name) => (
                  <th key={name} className="px-3 py-3">
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(policy.versions || []).map((version) => {
                const fullReason = version.reason || "—";
                const isLong = fullReason.length > 100;
                const isOpen = Boolean(expandedReasons[version.id]);
                return (
                  <tr key={version.id} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-3 font-semibold text-slate-900">v{version.version_number}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                          STATUS_BADGE[version.status] || "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {version.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-slate-700">
                      {formatDateShort(version.effective_from_fy_start)}
                    </td>
                    <td className="px-3 py-3 text-slate-600">
                      {formatDateTime(version.published_at || version.created_at)}
                    </td>
                    <td className="max-w-md break-words px-3 py-3 text-slate-700">
                      {isLong && !isOpen ? `${fullReason.slice(0, 100)}…` : fullReason}
                      {isLong && (
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedReasons((prev) => ({ ...prev, [version.id]: !prev[version.id] }))
                          }
                          className="ml-2 text-xs font-medium text-blue-600 hover:underline"
                        >
                          {isOpen ? "Show less" : "Show more"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!policy.versions?.length && (
            <p className="py-4 text-sm text-slate-500">No policy versions recorded.</p>
          )}
        </div>
      </section>

      {/* EMPLOYEE BALANCES TABLE */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Employee balances</h2>
            <p className="text-sm text-slate-500">{balances.total} employees · searchable, tenant-scoped summary</p>
          </div>
          <input
            className="h-10 w-full max-w-xs rounded-xl border border-slate-200 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            placeholder="Search employee, team, designation"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setBalancePage(1);
            }}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-3">Employee</th>
                <th className="px-3 py-3">Team</th>
                <th className="px-3 py-3 text-right">Available</th>
                <th className="px-3 py-3 text-right">Used</th>
                <th className="px-3 py-3 text-right">Pending</th>
                <th className="px-3 py-3 text-right">Concession</th>
              </tr>
            </thead>
            <tbody>
              {balances.records.map((row) => {
                const fullName = `${row.first_name || ""} ${row.last_name || ""}`.trim();
                return (
                  <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                    <td className="px-3 py-3 font-medium text-slate-900">
                      <div>{fullName || row.username}</div>
                      <div className="text-xs font-normal text-slate-500">{row.username}</div>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{row.team_name || "Unassigned"}</td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-900">
                      {row.available_balance}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-700">{row.leaves_used}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-700">{row.pending_days}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                      {row.management_concession}
                    </td>
                  </tr>
                );
              })}
              {!balances.records.length && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-sm text-slate-500">
                    No matching employee balances found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
          <span>
            Showing {balances.total ? (balancePage - 1) * balances.limit + 1 : 0}–
            {Math.min(balancePage * balances.limit, balances.total)} of {balances.total}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={balancePage <= 1}
              onClick={() => setBalancePage((page) => page - 1)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={balancePage * balances.limit >= balances.total}
              onClick={() => setBalancePage((page) => page + 1)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </section>

      {/* ANNUAL BALANCE RESET & EMPLOYEE ELIGIBILITY EXCEPTION */}
      <section className="grid gap-6 xl:grid-cols-2">
        <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Annual balance reset</h2>
              <p className="text-sm text-slate-500">
                Initializes employee balances in retryable, idempotent batches.
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={reconcile}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              Run / retry now
            </button>
          </div>
          <div className="mt-4 space-y-2">
            {runs.slice(0, 5).map((run) => (
              <div
                key={run.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-2.5 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-slate-800">
                    {formatDateShort(run.financial_year_start)}
                  </span>
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${
                      STATUS_BADGE[run.status] || "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {String(run.status || "").replace(/_/g, " ")}
                  </span>
                </div>
                <span className="text-xs font-medium text-slate-600 tabular-nums">
                  {run.success_count}/{run.employee_count} ok · {run.failure_count} failed
                </span>
              </div>
            ))}
            {!runs.length && <p className="py-3 text-sm text-slate-500">No reset runs recorded.</p>}
          </div>
        </div>

        <form onSubmit={saveEligibility} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Employee eligibility exception</h2>
          <p className="mb-4 text-sm text-slate-500">
            Create an auditable employee-specific eligibility or entitlement override.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="relative" ref={empDropdownRef}>
              <label className="block text-xs font-medium text-slate-600">
                Employee
                <button
                  type="button"
                  onClick={() => setEmpDropdownOpen((open) => !open)}
                  className="mt-1 flex h-10 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-left text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <span className="truncate">
                    {selectedEligibilityEmployee
                      ? `${`${selectedEligibilityEmployee.first_name || ""} ${selectedEligibilityEmployee.last_name || ""}`.trim() || selectedEligibilityEmployee.username} (#${selectedEligibilityEmployee.id})`
                      : eligibility.employee_id
                      ? `Employee #${eligibility.employee_id}`
                      : "Select employee…"}
                  </span>
                  <span className="flex items-center gap-1">
                    {eligibility.employee_id && (
                      <X
                        size={14}
                        className="text-slate-400 hover:text-slate-600"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEligibility((val) => ({ ...val, employee_id: "" }));
                        }}
                      />
                    )}
                    <ChevronDown size={15} className="text-slate-400" />
                  </span>
                </button>
              </label>

              {empDropdownOpen && (
                <div className="absolute z-30 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg">
                  <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
                    <Search size={14} className="text-slate-400" />
                    <input
                      type="text"
                      value={empQuery}
                      onChange={(e) => setEmpQuery(e.target.value)}
                      placeholder="Search name, username, team, ID…"
                      className="w-full text-xs text-slate-800 focus:outline-none"
                      autoFocus
                    />
                  </div>
                  <div className="max-h-52 overflow-y-auto py-1">
                    {filteredEmployees.map((emp) => {
                      const name = `${emp.first_name || ""} ${emp.last_name || ""}`.trim() || emp.username;
                      return (
                        <button
                          key={emp.id}
                          type="button"
                          onClick={() => {
                            setEligibility((val) => ({ ...val, employee_id: String(emp.id) }));
                            setEmpDropdownOpen(false);
                          }}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-xs hover:bg-slate-50"
                        >
                          <div className="min-w-0">
                            <div className="truncate font-medium text-slate-900">{name}</div>
                            <div className="truncate text-[11px] text-slate-500">
                              {emp.username} · {emp.team_name || "Unassigned"}
                            </div>
                          </div>
                          <span className="ml-2 shrink-0 font-mono text-[11px] text-slate-400">#{emp.id}</span>
                        </button>
                      );
                    })}
                    {!filteredEmployees.length && (
                      <p className="px-3 py-3 text-center text-xs text-slate-500">No employees found.</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <Field label="Leave code">
              <select
                className={inputClass}
                value={eligibility.leave_code}
                onChange={(e) => setEligibility({ ...eligibility, leave_code: e.target.value })}
              >
                {draft.legacy_shared_pool_enabled && (
                  <option value="__legacy_shared__">Shared legacy balance</option>
                )}
                {(policy.leave_types || draft.leave_types || []).map((type) => (
                  <option key={type.leave_code} value={type.leave_code}>
                    {type.leave_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Entitlement override">
              <input
                className={inputClass}
                type="number"
                min="0"
                max="365"
                step="0.5"
                value={eligibility.entitlement_override}
                onChange={(e) => setEligibility({ ...eligibility, entitlement_override: e.target.value })}
              />
            </Field>
            <Field label="Effective from">
              <input
                required
                className={inputClass}
                type="date"
                value={eligibility.effective_from}
                onChange={(e) => setEligibility({ ...eligibility, effective_from: e.target.value })}
              />
            </Field>
            <Field label="Effective to (optional)">
              <input
                className={inputClass}
                type="date"
                value={eligibility.effective_to}
                onChange={(e) => setEligibility({ ...eligibility, effective_to: e.target.value })}
              />
            </Field>
            <label className="flex items-center gap-2 pt-5 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={eligibility.eligible}
                onChange={(e) => setEligibility({ ...eligibility, eligible: e.target.checked })}
              />
              Eligible
            </label>
          </div>
          <div className="mt-3">
            <Field label="Reason">
              <textarea
                required
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                rows="2"
                value={eligibility.reason}
                onChange={(e) => setEligibility({ ...eligibility, reason: e.target.value })}
              />
            </Field>
          </div>
          <button className="mt-3 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
            Save exception
          </button>
        </form>
      </section>
    </div>
  );
}

function SummaryCard({ label, value, detail, badge = null, tooltip = "" }) {
  return (
    <div
      title={tooltip || undefined}
      className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-xl font-semibold text-slate-900">{value}</p>
          {badge}
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

function Field({ label, error, children }) {
  return (
    <label className="block text-xs font-medium text-slate-600">
      {label}
      {children}
      {error && <span className="mt-1 block text-xs font-normal text-rose-600">{error}</span>}
    </label>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex h-10 items-center gap-3 self-end rounded-xl border border-slate-200 px-3 text-sm text-slate-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
