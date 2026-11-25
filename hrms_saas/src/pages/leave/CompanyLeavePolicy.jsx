import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Plus, RefreshCw, Save, ShieldCheck } from "lucide-react";
import API from "../../api/axios";
import { usePopup } from "../../context/PopupContext";

const defaultType = () => ({
  leave_code: "new_leave", leave_name: "New Leave", annual_entitlement: 0, is_paid: true,
  carry_forward_enabled: false, max_carry_forward_days: 0, carry_forward_expiry_days: null,
  expired_balance_forfeited: true, carry_forward_requires_approval: false,
  minimum_application_days: 1, maximum_consecutive_days: null, half_day_allowed: false,
  requires_approval: true, requires_document: false, accrual_frequency: "none",
  probation_restriction_months: 0, active_status: true, eligibility_rules: {},
});

const inputClass = "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800";
const numberValue = (value) => value === "" || value == null ? null : Number(value);
const parseRules = (value) => {
  if (!value || typeof value === "object") return value || {};
  try { return JSON.parse(value); } catch { return {}; }
};

export default function CompanyLeavePolicy() {
  const { showPopup } = usePopup();
  const showPopupRef = useRef(showPopup);
  showPopupRef.current = showPopup;
  const [policy, setPolicy] = useState(null);
  const [balances, setBalances] = useState({ records: [], total: 0, page: 1, limit: 25 });
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [balancePage, setBalancePage] = useState(1);
  const [balanceRefresh, setBalanceRefresh] = useState(0);
  const [draft, setDraft] = useState(null);
  const [reason, setReason] = useState("");
  const [eligibility, setEligibility] = useState({ employee_id: "", leave_code: "casual", eligible: true, entitlement_override: "", effective_from: new Date().toISOString().slice(0, 10), effective_to: "", reason: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [policyResult, runsResult] = await Promise.all([
        API.get("/leave/policy/"),
        API.get("/leave/policy/reset-runs/"),
      ]);
      const next = policyResult.data;
      setPolicy(next);
      setRuns(runsResult.data?.records || []);
      const draftVersion = next.versions?.find((version) => version.status === "draft");
      const source = draftVersion || next.current;
      if (source?.legacy_shared_pool_enabled) setEligibility((value) => ({ ...value, leave_code: "__legacy_shared__" }));
      setDraft(source ? {
        effective_from_fy_start: draftVersion?.effective_from_fy_start?.slice(0, 10) || next.next_reset_date || source.effective_from_fy_start?.slice(0, 10),
        financial_year_start_month: Number(source.financial_year_start_month),
        financial_year_start_day: Number(source.financial_year_start_day),
        timezone: source.timezone || "Asia/Kolkata", automatic_reset: Boolean(source.automatic_reset),
        legacy_shared_pool_enabled: Boolean(source.legacy_shared_pool_enabled),
        proration_method: source.proration_method || "none",
        leave_types: (source.leave_types || next.leave_types || []).map((type) => ({ ...defaultType(), ...type, eligibility_rules: parseRules(type.eligibility_rules), annual_entitlement: Number(type.annual_entitlement), max_carry_forward_days: Number(type.max_carry_forward_days), minimum_application_days: Number(type.minimum_application_days), probation_restriction_months: Number(type.probation_restriction_months) })),
      } : {
        financial_year_start_month: 4, financial_year_start_day: 1, timezone: "Asia/Kolkata", automatic_reset: true,
        legacy_shared_pool_enabled: true, proration_method: "none", leave_types: [
          { ...defaultType(), leave_code: "casual", leave_name: "Casual Leave" },
          { ...defaultType(), leave_code: "sick", leave_name: "Sick Leave" },
          { ...defaultType(), leave_code: "paid", leave_name: "Paid Leave" },
        ],
      });
      setReason(draftVersion?.reason || "");
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

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const controller = new AbortController();
    API.get("/leave/policy/balances/", {
      params: { page: balancePage, limit: 25, search: debouncedSearch },
      signal: controller.signal
    })
      .then((res) => setBalances(res.data || { records: [], total: 0, page: 1, limit: 25 }))
      .catch((error) => {
        if (error.name === "CanceledError" || error.code === "ERR_CANCELED") return;
        showPopupRef.current(error.response?.data?.error || "Unable to load employee balances", "error");
      });

    return () => controller.abort();
  }, [balancePage, balanceRefresh, debouncedSearch]);

  const change = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const updateType = (index, key, value) => setDraft((current) => ({ ...current, leave_types: current.leave_types.map((type, position) => position === index ? { ...type, [key]: value } : type) }));
  const activeTypeCount = useMemo(() => draft?.leave_types?.filter((type) => type.active_status).length || 0, [draft]);
  const annualEntitlement = useMemo(() => draft?.leave_types?.filter((type) => type.active_status).reduce((sum, type) => sum + Number(type.annual_entitlement || 0), 0) || 0, [draft]);
  const carryForwardTypes = useMemo(() => draft?.leave_types?.filter((type) => type.active_status && type.carry_forward_enabled).length || 0, [draft]);

  const saveDraft = async () => {
    if (!reason.trim()) return showPopup("Enter a reason for this policy change", "warning");
    setSaving(true);
    try {
      const payload = { ...draft, reason: reason.trim(), leave_types: draft.leave_types.map((type) => ({ ...type, annual_entitlement: Number(type.annual_entitlement), max_carry_forward_days: Number(type.max_carry_forward_days), minimum_application_days: Number(type.minimum_application_days), maximum_consecutive_days: numberValue(type.maximum_consecutive_days), carry_forward_expiry_days: numberValue(type.carry_forward_expiry_days), probation_restriction_months: Number(type.probation_restriction_months) })) };
      const result = await API.post("/leave/policy/drafts/", payload);
      showPopup(`Draft policy v${result.data.version_number} saved`, "success");
      await load();
    } catch (error) {
      showPopup(error.response?.data?.error || "Unable to save policy draft", "error");
    } finally { setSaving(false); }
  };

  const previewAndPublish = async (versionId) => {
    setBusy(true);
    try {
      const { data } = await API.post(`/leave/policy/${versionId}/preview/`);
      const typeSummary = (data.per_type_impact || []).map((type) => `${type.leave_name}: ${type.eligible_employee_count} eligible, ${type.estimated_entitlement_total} days`).join("\n");
      const confirmed = window.confirm(`Publish this policy effective ${data.effective_from_fy_start}?\n\nActive employees: ${data.eligible_employee_count}\nEstimated total entitlement: ${data.proposed_total_annual_entitlement} days\nDifference from shared legacy allocation: ${data.estimated_change_from_legacy} days\n\n${typeSummary}\n\n${data.impact_note}\n\nBalances already initialized for that year cannot be replaced.`);
      if (!confirmed) return;
      await API.post(`/leave/policy/${versionId}/publish/`);
      showPopup("Company leave policy published", "success");
      await load();
    } catch (error) { showPopup(error.response?.data?.error || "Unable to publish policy", "error"); }
    finally { setBusy(false); }
  };

  const reconcile = async () => {
    if (!window.confirm("Run or retry financial-year balance initialization for this tenant?")) return;
    setBusy(true);
    try {
      const result = await API.post("/leave/policy/reset-runs/reconcile/");
      showPopup(`Processed ${result.data.employees} employees; ${result.data.failures} failures`, result.data.failures ? "warning" : "success");
      await load();
      setBalanceRefresh((value) => value + 1);
    } catch (error) { showPopup(error.response?.data?.error || "Unable to reconcile balances", "error"); }
    finally { setBusy(false); }
  };

  const saveEligibility = async (event) => {
    event.preventDefault();
    try {
      await API.post("/leave/policy/employee-eligibility/", { ...eligibility, employee_id: Number(eligibility.employee_id), entitlement_override: numberValue(eligibility.entitlement_override), effective_to: eligibility.effective_to || null });
      showPopup("Employee leave eligibility saved", "success");
      setEligibility((value) => ({ ...value, employee_id: "", entitlement_override: "", reason: "" }));
      await load();
      setBalanceRefresh((value) => value + 1);
    } catch (error) { showPopup(error.response?.data?.error || "Unable to save employee eligibility", "error"); }
  };

  if (loading || !draft) return <section className="rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">Loading company leave policy…</section>;

  const currentYear = policy.current?.effective_from_fy_start?.slice(0, 10) || "Not configured";
  const draftVersion = policy.versions?.find((version) => version.status === "draft");

  return <div className="space-y-6">
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
      <SummaryCard label="Current policy" value={policy.current ? `v${policy.current.version_number}` : "Not published"} detail={currentYear} />
      <SummaryCard label="Leave types" value={activeTypeCount} detail="Active in this draft" />
      <SummaryCard label="Annual entitlement" value={`${annualEntitlement} days`} detail="Combined active type allocation" />
      <SummaryCard label="Carry forward" value={carryForwardTypes ? `${carryForwardTypes} types` : "Disabled"} detail="Configured per leave type" />
      <SummaryCard label="Next annual reset" value={policy.next_reset_date || "Not scheduled"} detail={draft.automatic_reset ? "Automatic reset enabled" : "Manual reset required"} />
      <SummaryCard label="Policy status" value={draftVersion ? `Draft v${draftVersion.version_number}` : policy.current ? "Published" : "Not published"} detail={policy.latest_reset?.status ? `Latest reset: ${policy.latest_reset.status}` : "No reset run yet"} />
    </section>

    {draft.legacy_shared_pool_enabled && <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900"><strong>Shared legacy balance is active.</strong> Current employee allocations remain one shared balance and are not reassigned to individual leave types. Disable this only after reviewing and publishing a future-year typed policy.</div>}

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold text-slate-900">Company policy settings</h2><p className="text-sm text-slate-500">Draft changes take effect only after an authorized manager publishes them.</p></div><button type="button" onClick={() => { load(); setBalanceRefresh((value) => value + 1); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm"><RefreshCw size={15}/>Refresh</button></div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Financial year starts month"><input className={inputClass} type="number" min="1" max="12" value={draft.financial_year_start_month} onChange={(e) => change("financial_year_start_month", Number(e.target.value))}/></Field>
        <Field label="Start day"><input className={inputClass} type="number" min="1" max="28" value={draft.financial_year_start_day} onChange={(e) => change("financial_year_start_day", Number(e.target.value))}/></Field>
        <Field label="Company timezone"><input className={inputClass} value={draft.timezone} onChange={(e) => change("timezone", e.target.value)} placeholder="Asia/Kolkata"/></Field>
        <Field label="Policy effective from"><input className={inputClass} type="date" value={draft.effective_from_fy_start || ""} onChange={(e) => change("effective_from_fy_start", e.target.value)}/></Field>
        <Field label="Proration"><select className={inputClass} value={draft.proration_method} onChange={(e) => change("proration_method", e.target.value)}><option value="none">No proration</option><option value="monthly">Monthly proration</option></select></Field>
        <Toggle label="Automatic annual reset" checked={draft.automatic_reset} onChange={(value) => change("automatic_reset", value)}/>
        <Toggle label="Keep shared legacy pool" checked={draft.legacy_shared_pool_enabled} onChange={(value) => change("legacy_shared_pool_enabled", value)}/>
      </div>
      <div className="mt-6 flex items-center justify-between"><h3 className="font-semibold text-slate-900">Leave types and rules</h3><button type="button" onClick={() => change("leave_types", [...draft.leave_types, defaultType()])} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm"><Plus size={15}/>Add leave type</button></div>
      <div className="mt-3 space-y-4">{draft.leave_types.map((type, index) => <div key={`${type.leave_code}-${index}`} className="rounded-xl border border-slate-200 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Leave code"><input className={inputClass} maxLength={20} value={type.leave_code} onChange={(e) => updateType(index, "leave_code", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}/></Field>
          <Field label="Name"><input className={inputClass} value={type.leave_name} onChange={(e) => updateType(index, "leave_name", e.target.value)}/></Field>
          <Field label="Annual days"><input className={inputClass} type="number" min="0" max="365" step="0.5" value={type.annual_entitlement} onChange={(e) => updateType(index, "annual_entitlement", Number(e.target.value))}/></Field>
          <Field label="Minimum application days"><input className={inputClass} type="number" min="0.5" max="365" step="0.5" value={type.minimum_application_days} onChange={(e) => updateType(index, "minimum_application_days", Number(e.target.value))}/></Field>
          <Field label="Accrual"><select className={inputClass} value={type.accrual_frequency} onChange={(e) => updateType(index, "accrual_frequency", e.target.value)}>{["none", "monthly", "quarterly", "yearly"].map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>
          <Field label="Carry-forward cap"><input className={inputClass} type="number" min="0" step="0.5" value={type.max_carry_forward_days} onChange={(e) => updateType(index, "max_carry_forward_days", Number(e.target.value))}/></Field>
          <Field label="Carry-forward expires after days"><input className={inputClass} type="number" min="1" value={type.carry_forward_expiry_days ?? ""} onChange={(e) => updateType(index, "carry_forward_expiry_days", numberValue(e.target.value))}/></Field>
          <Field label="Probation restriction (months)"><input className={inputClass} type="number" min="0" max="60" value={type.probation_restriction_months} onChange={(e) => updateType(index, "probation_restriction_months", Number(e.target.value))}/></Field>
          <Field label="Max consecutive days"><input className={inputClass} type="number" min="0.5" value={type.maximum_consecutive_days ?? ""} onChange={(e) => updateType(index, "maximum_consecutive_days", numberValue(e.target.value))}/></Field>
          <Field label="Allowed teams (comma-separated)"><input className={inputClass} value={(type.eligibility_rules?.allowed_teams || []).join(", ")} onChange={(e) => updateType(index, "eligibility_rules", { ...type.eligibility_rules, allowed_teams: e.target.value.split(",").map((item) => item.trim()).filter(Boolean) })}/></Field>
          <Field label="Allowed designations (comma-separated)"><input className={inputClass} value={(type.eligibility_rules?.allowed_designations || []).join(", ")} onChange={(e) => updateType(index, "eligibility_rules", { ...type.eligibility_rules, allowed_designations: e.target.value.split(",").map((item) => item.trim()).filter(Boolean) })}/></Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">{[["active_status","Active"],["is_paid","Paid"],["carry_forward_enabled","Carry forward"],["carry_forward_requires_approval","Carry-forward approval"],["half_day_allowed","Half day"],["requires_approval","Approval required"],["requires_document","Document required"],["expired_balance_forfeited","Forfeit expired carry-forward"]].map(([key,label]) => <label key={key} className="flex items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={Boolean(type[key])} onChange={(e) => updateType(index,key,e.target.checked)}/>{label}</label>)}</div>
      </div>)}</div>
      <Field label="Reason for change"><textarea className={inputClass} rows="2" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Required; recorded in the policy audit trail"/></Field>
      <div className="mt-4 flex flex-wrap gap-3"><button type="button" disabled={saving} onClick={saveDraft} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"><Save size={16}/>{saving ? "Saving…" : "Save as draft"}</button>{draftVersion && <button type="button" disabled={busy} onClick={() => previewAndPublish(draftVersion.id)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"><ShieldCheck size={16}/>Preview and publish</button>}</div>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="mb-3 text-lg font-semibold">Policy version history</h2><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>{["Version","Status","Effective financial year","Changed","Reason"].map((name) => <th key={name} className="px-3 py-3">{name}</th>)}</tr></thead><tbody>{(policy.versions || []).map((version) => <tr key={version.id} className="border-t border-slate-100"><td className="px-3 py-3 font-semibold">v{version.version_number}</td><td className="px-3 py-3 capitalize">{version.status}</td><td className="px-3 py-3">{version.effective_from_fy_start?.slice(0, 10)}</td><td className="px-3 py-3">{version.published_at ? new Date(version.published_at).toLocaleString() : new Date(version.created_at).toLocaleString()}</td><td className="max-w-sm px-3 py-3">{version.reason || "—"}</td></tr>)}</tbody></table>{!policy.versions?.length && <p className="py-4 text-sm text-slate-500">No policy versions recorded.</p>}</div></section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Employee balances</h2><p className="text-sm text-slate-500">{balances.total} employees · searchable, tenant-scoped summary</p></div><input className="w-full max-w-xs rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Search employee, team, designation" value={search} onChange={(e) => { setSearch(e.target.value); setBalancePage(1); }}/></div><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr>{["Employee","Team","Available","Used","Pending","Concession"].map((name) => <th key={name} className="px-3 py-3">{name}</th>)}</tr></thead><tbody>{balances.records.map((row) => <tr key={row.id} className="border-t border-slate-100"><td className="px-3 py-3 font-medium">{row.first_name} {row.last_name}<div className="text-xs text-slate-500">{row.username}</div></td><td className="px-3 py-3">{row.team_name || "—"}</td><td className="px-3 py-3">{row.available_balance}</td><td className="px-3 py-3">{row.leaves_used}</td><td className="px-3 py-3">{row.pending_days}</td><td className="px-3 py-3">{row.management_concession}</td></tr>)}</tbody></table></div><div className="mt-3 flex items-center justify-between text-sm text-slate-600"><span>Showing {balances.total ? (balancePage - 1) * balances.limit + 1 : 0}–{Math.min(balancePage * balances.limit, balances.total)} of {balances.total}</span><div className="flex gap-2"><button type="button" disabled={balancePage <= 1} onClick={() => setBalancePage((page) => page - 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Previous</button><button type="button" disabled={balancePage * balances.limit >= balances.total} onClick={() => setBalancePage((page) => page + 1)} className="rounded-lg border px-3 py-1.5 disabled:opacity-40">Next</button></div></div></section>

    <section className="grid gap-6 xl:grid-cols-2"><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">Annual balance reset</h2><p className="text-sm text-slate-500">Initializes employee balances in retryable batches.</p></div><button type="button" disabled={busy} onClick={reconcile} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Run / retry now</button></div><div className="mt-4 space-y-2">{runs.slice(0,5).map((run) => <div key={run.id} className="flex justify-between rounded-lg bg-slate-50 p-3 text-sm"><span>{run.financial_year_start?.slice(0,10)} · {run.status}</span><span>{run.success_count}/{run.employee_count} ok · {run.failure_count} failed</span></div>)}{!runs.length && <p className="text-sm text-slate-500">No reset runs recorded.</p>}</div></div>
      <form onSubmit={saveEligibility} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold">Employee eligibility exception</h2><p className="mb-4 text-sm text-slate-500">Create an auditable employee-specific eligibility or entitlement override.</p><div className="grid gap-3 sm:grid-cols-2"><Field label="Employee ID"><input required className={inputClass} type="number" min="1" value={eligibility.employee_id} onChange={(e) => setEligibility({...eligibility, employee_id:e.target.value})}/></Field><Field label="Leave code"><select className={inputClass} value={eligibility.leave_code} onChange={(e) => setEligibility({...eligibility, leave_code:e.target.value})}>{draft.legacy_shared_pool_enabled && <option value="__legacy_shared__">Shared legacy balance</option>}{(policy.leave_types || []).map((type) => <option key={type.leave_code} value={type.leave_code}>{type.leave_name}</option>)}</select></Field><Field label="Entitlement override"><input className={inputClass} type="number" min="0" step="0.5" value={eligibility.entitlement_override} onChange={(e) => setEligibility({...eligibility, entitlement_override:e.target.value})}/></Field><Field label="Effective from"><input required className={inputClass} type="date" value={eligibility.effective_from} onChange={(e) => setEligibility({...eligibility, effective_from:e.target.value})}/></Field><Field label="Effective to (optional)"><input className={inputClass} type="date" value={eligibility.effective_to} onChange={(e) => setEligibility({...eligibility, effective_to:e.target.value})}/></Field><label className="flex items-center gap-2 pt-5 text-sm"><input type="checkbox" checked={eligibility.eligible} onChange={(e) => setEligibility({...eligibility, eligible:e.target.checked})}/>Eligible</label></div><Field label="Reason"><textarea required className={inputClass} rows="2" value={eligibility.reason} onChange={(e) => setEligibility({...eligibility, reason:e.target.value})}/></Field><button className="mt-3 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">Save exception</button></form></section>
  </div>;
}

function SummaryCard({ label, value, detail }) { return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-xl font-semibold text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>; }
function Field({ label, children }) { return <label className="block text-xs font-medium text-slate-600">{label}{children}</label>; }
function Toggle({ label, checked, onChange }) { return <label className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-700"><input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)}/>{label}</label>; }
