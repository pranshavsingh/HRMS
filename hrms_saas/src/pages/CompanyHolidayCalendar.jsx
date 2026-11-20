import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle, ArrowLeft, ArrowRight, CalendarDays, Check,
  Pencil, Plus, RefreshCw, Search, Trash2, X,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import { useAuth } from "../context/AuthContext";
import { useRealtime } from "../context/RealtimeContext";
import { companyHolidaysApi } from "../api/company-holidays.api";
import "./CompanyHolidayCalendar.css";

const pad = (value) => String(value).padStart(2, "0");
const dateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const parseDate = (value) => {
  const [year, month, day] = String(value).slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
};
const monthLabel = (date) => date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
const readableDate = (value, options = { weekday: "short", month: "short", day: "numeric", year: "numeric" }) =>
  parseDate(value).toLocaleDateString(undefined, options);
const addMonths = (date, amount) => new Date(date.getFullYear(), date.getMonth() + amount, 1);
const monthRange = (date) => ({
  from: dateKey(new Date(date.getFullYear(), date.getMonth(), 1)),
  to: dateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0)),
});

function buildCalendarDays(month) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    return { date, key: dateKey(date), inMonth: date.getMonth() === month.getMonth() };
  });
}

export default function CompanyHolidayCalendar() {
  const { role } = useAuth();
  const canManage = ["hr", "admin", "superadmin"].includes(role);
  const isSuperadmin = role === "superadmin";
  const [month, setMonth] = useState(() => {
    const saved = localStorage.getItem("holidayCalendarMonth");
    if (saved && /^\d{4}-\d{2}$/.test(saved)) {
      const [year, number] = saved.split("-").map(Number);
      return new Date(year, number - 1, 1);
    }
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState(() => dateKey(new Date()));
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [periodFilter, setPeriodFilter] = useState("month");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [tenantChoices, setTenantChoices] = useState([]);
  const [tenantId, setTenantId] = useState(() => localStorage.getItem("holidayCalendarTenant") || "");
  const [form, setForm] = useState({ name: "", holiday_date: dateKey(new Date()), description: "", is_optional: false });
  const range = useMemo(() => {
    if (periodFilter === "upcoming") {
      const today = new Date();
      return { from: dateKey(today), to: dateKey(new Date(today.getFullYear() + 1, today.getMonth(), today.getDate())) };
    }
    if (periodFilter === "past") {
      const today = new Date();
      return { from: dateKey(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate())), to: dateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)) };
    }
    return monthRange(month);
  }, [month, periodFilter]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const params = { ...range, limit: 500 };
    if (tenantId) params.tenant_id = tenantId;
    try {
      const response = await companyHolidaysApi.list(params);
      setHolidays(response.holidays || []);
    } catch (error) {
      setLoadError(error?.response?.data?.error || "Company holidays could not be loaded. Please try again.");
      setHolidays([]);
    } finally {
      setLoading(false);
    }
  }, [range, tenantId]);

  const realtimeRefresh = useCallback(() => refresh(), [refresh]);
  useRealtime("holiday:created", realtimeRefresh);
  useRealtime("holiday:updated", realtimeRefresh);
  useRealtime("holiday:deleted", realtimeRefresh);
  useRealtime("realtime:connected", realtimeRefresh);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    localStorage.setItem("holidayCalendarMonth", `${month.getFullYear()}-${pad(month.getMonth() + 1)}`);
  }, [month]);
  useEffect(() => {
    if (!isSuperadmin) return;
    companyHolidaysApi.tenants().then((response) => setTenantChoices(response.tenants || [])).catch(() => setTenantChoices([]));
  }, [isSuperadmin]);
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const calendarDays = useMemo(() => buildCalendarDays(month), [month]);
  const holidayByDate = useMemo(() => {
    const map = new Map();
    holidays.forEach((holiday) => {
      const key = String(holiday.holiday_date).slice(0, 10);
      const entries = map.get(key) || [];
      entries.push(holiday);
      map.set(key, entries);
    });
    return map;
  }, [holidays]);
  const visibleHolidays = useMemo(() => holidays
    .filter((holiday) => `${holiday.name} ${holiday.description || ""}`.toLowerCase().includes(search.trim().toLowerCase()))
    .slice().sort((left, right) => String(left.holiday_date).localeCompare(String(right.holiday_date))), [holidays, search]);
  const selectedHolidays = holidayByDate.get(selectedDate) || [];

  const changeMonth = (next) => setMonth(new Date(next.getFullYear(), next.getMonth(), 1));
  const setTenant = (value) => {
    setTenantId(value);
    if (value) localStorage.setItem("holidayCalendarTenant", value);
    else localStorage.removeItem("holidayCalendarTenant");
    window.dispatchEvent(new CustomEvent("realtime-tenant-change", { detail: { tenantId: value || null } }));
  };
  const openCreate = (date = selectedDate) => {
    setEditingHoliday(null);
    setForm({ name: "", holiday_date: date, description: "", is_optional: false });
    setFormError("");
    setModalOpen(true);
  };
  const openEdit = (holiday) => {
    setEditingHoliday(holiday);
    setForm({ name: holiday.name || "", holiday_date: String(holiday.holiday_date).slice(0, 10), description: holiday.description || "", is_optional: Boolean(holiday.is_optional) });
    setFormError("");
    setModalOpen(true);
  };
  const saveHoliday = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    const params = tenantId ? { tenant_id: tenantId } : {};
    try {
      const payload = { ...form, name: form.name.trim(), description: form.description.trim() };
      if (editingHoliday) await companyHolidaysApi.update(editingHoliday.id, payload, params);
      else await companyHolidaysApi.create(payload, params);
      setModalOpen(false);
      setSelectedDate(payload.holiday_date);
      const savedDate = parseDate(payload.holiday_date);
      changeMonth(savedDate);
      await refresh();
    } catch (error) {
      setFormError(error?.response?.data?.error || "The holiday could not be saved.");
    } finally {
      setSaving(false);
    }
  };
  const deleteHoliday = async (holiday) => {
    if (!window.confirm(`Delete “${holiday.name}” on ${readableDate(holiday.holiday_date)}?`)) return;
    const params = tenantId ? { tenant_id: tenantId } : {};
    try {
      await companyHolidaysApi.remove(holiday.id, params);
      await refresh();
    } catch (error) {
      setLoadError(error?.response?.data?.error || "The holiday could not be deleted.");
    }
  };
  const selectHoliday = (holiday) => {
    setSelectedDate(String(holiday.holiday_date).slice(0, 10));
    changeMonth(parseDate(holiday.holiday_date));
    if (periodFilter !== "month") setPeriodFilter("month");
  };

  return (
    <Layout>
      <main className="holiday-page" aria-labelledby="holiday-title">
        <header className="holiday-heading">
          <div className="holiday-heading__title">
            <div className="holiday-heading__icon"><CalendarDays size={24} aria-hidden="true" /></div>
            <div><h1 id="holiday-title">Company Holiday Calendar</h1><p>View company holidays, important dates and upcoming observances.</p></div>
          </div>
          <div className="holiday-heading__actions">
            <button className="holiday-button holiday-button--secondary" type="button" onClick={refresh} disabled={loading}><RefreshCw size={16} className={loading ? "holiday-spin" : ""} />Refresh</button>
            {canManage && <button className="holiday-button holiday-button--primary" type="button" onClick={() => openCreate()}><Plus size={17} />Add Holiday</button>}
          </div>
        </header>

        {isSuperadmin && <div className="holiday-tenant"><label htmlFor="holiday-tenant">Tenant</label><select id="holiday-tenant" value={tenantId} onChange={(event) => setTenant(event.target.value)}><option value="">Default tenant</option>{tenantChoices.map((tenant) => <option value={tenant.id} key={tenant.id}>{tenant.name} ({tenant.code})</option>)}</select></div>}

        {loadError && <div className="holiday-alert" role="alert"><AlertCircle size={18} /><span>{loadError}</span><button type="button" onClick={() => setLoadError("")} aria-label="Dismiss error"><X size={16} /></button></div>}

        <div className="holiday-layout">
          <section className="holiday-calendar-card" aria-label="Monthly holiday calendar">
            <div className="holiday-calendar-toolbar">
              <div><h2>{monthLabel(month)}</h2><p>Select a date to see its holiday details.</p></div>
              <div className="holiday-calendar-controls">
                <button type="button" className="holiday-button holiday-button--secondary" onClick={() => { const today = new Date(); changeMonth(today); setSelectedDate(dateKey(today)); }}>Today</button>
                <input aria-label="Choose month and year" type="month" value={`${month.getFullYear()}-${pad(month.getMonth() + 1)}`} onChange={(event) => { if (event.target.value) { const [year, number] = event.target.value.split("-").map(Number); changeMonth(new Date(year, number - 1, 1)); } }} />
                <button type="button" className="holiday-icon-button" aria-label="Previous month" onClick={() => changeMonth(addMonths(month, -1))}><ArrowLeft size={18} /></button>
                <button type="button" className="holiday-icon-button" aria-label="Next month" onClick={() => changeMonth(addMonths(month, 1))}><ArrowRight size={18} /></button>
              </div>
            </div>
            <div className="holiday-weekdays" aria-hidden="true">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day}>{day}</span>)}</div>
            {loading && holidays.length === 0 ? <div className="holiday-empty" role="status">Loading holidays…</div> : (
              <div className="holiday-calendar-grid">
                {calendarDays.map(({ date, key, inMonth }) => {
                  const dayHolidays = holidayByDate.get(key) || [];
                  const today = key === dateKey(new Date());
                  return <button key={key} type="button" className={`holiday-day ${!inMonth ? "is-outside" : ""} ${today ? "is-today" : ""} ${selectedDate === key ? "is-selected" : ""} ${dayHolidays.length ? "has-holiday" : ""}`} onClick={() => { setSelectedDate(key); if (!inMonth) changeMonth(date); }} aria-pressed={selectedDate === key} aria-label={`${readableDate(key)}, ${dayHolidays.length ? `${dayHolidays.length} holiday${dayHolidays.length > 1 ? "s" : ""}` : "no holiday"}`}>
                    <span className="holiday-day__number">{date.getDate()}</span>
                    {dayHolidays.map((holiday) => <span className={`holiday-day__label ${holiday.is_optional ? "is-optional" : ""}`} key={holiday.id}>{holiday.name}</span>)}
                    {dayHolidays.length > 1 && <span className="holiday-day__count">+{dayHolidays.length - 1} more</span>}
                  </button>;
                })}
              </div>
            )}
            <div className="holiday-legend"><span><i className="holiday-legend__dot" />Company holiday</span><span><i className="holiday-legend__dot is-optional" />Optional</span><span><i className="holiday-legend__dot is-today" />Today</span></div>
          </section>

          <aside className="holiday-summary" aria-labelledby="holiday-summary-title">
            <div className="holiday-summary__header"><div><h2 id="holiday-summary-title">Holiday Summary</h2><p>{periodFilter === "month" ? monthLabel(month) : periodFilter === "upcoming" ? "Upcoming year" : "Previous year"}</p></div><span className="holiday-count">{visibleHolidays.length}</span></div>
            <div className="holiday-summary__filters">
              <label><span>Period</span><select value={periodFilter} onChange={(event) => setPeriodFilter(event.target.value)}><option value="month">Selected month</option><option value="upcoming">Upcoming</option><option value="past">Past year</option></select></label>
              <label className="holiday-search"><Search size={16} /><span className="sr-only">Search holidays</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search holidays" /></label>
            </div>
            {selectedHolidays.length > 0 && <div className="holiday-selected-detail"><span className="holiday-selected-detail__date">{readableDate(selectedDate)}</span>{selectedHolidays.map((holiday) => <div key={holiday.id}><strong>{holiday.name}</strong><p>{holiday.description || "No reason provided."}</p><span className="holiday-daytype">{holiday.is_optional ? "Optional holiday" : "Company holiday"}</span></div>)}</div>}
            <div className="holiday-list" aria-live="polite">
              {loading && holidays.length === 0 ? <div className="holiday-list-empty">Loading…</div> : visibleHolidays.length === 0 ? <div className="holiday-list-empty">No holidays scheduled for this period.</div> : visibleHolidays.map((holiday) => <article key={holiday.id} className={`holiday-list-item ${String(holiday.holiday_date).slice(0, 10) === selectedDate ? "is-selected" : ""}`}>
                <button type="button" className="holiday-list-item__select" onClick={() => selectHoliday(holiday)}>
                  <span className="holiday-list-item__date"><strong>{parseDate(holiday.holiday_date).getDate()}</strong><small>{parseDate(holiday.holiday_date).toLocaleDateString(undefined, { month: "short" })}</small></span>
                  <span className="holiday-list-item__content"><strong>{holiday.name}</strong><small>{readableDate(holiday.holiday_date)} · {holiday.is_optional ? "Optional" : "Company holiday"}</small><span>{holiday.description || "No reason provided."}</span></span>
                </button>
                {canManage && <div className="holiday-list-item__actions"><button type="button" aria-label={`Edit ${holiday.name}`} onClick={() => openEdit(holiday)}><Pencil size={15} /></button><button type="button" aria-label={`Delete ${holiday.name}`} onClick={() => deleteHoliday(holiday)}><Trash2 size={15} /></button></div>}
              </article>)}
            </div>
          </aside>
        </div>
      </main>

      {modalOpen && <div className="holiday-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}>
        <section className="holiday-modal" role="dialog" aria-modal="true" aria-labelledby="holiday-modal-title">
          <header><div><h2 id="holiday-modal-title">{editingHoliday ? "Edit Holiday" : "Add Holiday"}</h2><p>Set the date and reason for this company observance.</p></div><button type="button" aria-label="Close dialog" onClick={() => setModalOpen(false)}><X size={19} /></button></header>
          <form onSubmit={saveHoliday}>
            <label>Holiday name<input required maxLength={255} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} autoFocus /></label>
            <label>Holiday date<input required type="date" value={form.holiday_date} onChange={(event) => setForm({ ...form, holiday_date: event.target.value })} /></label>
            <label>Reason / description<textarea required rows={4} maxLength={1000} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
            <label className="holiday-optional"><input type="checkbox" checked={form.is_optional} onChange={(event) => setForm({ ...form, is_optional: event.target.checked })} /> Optional holiday</label>
            {formError && <div className="holiday-alert" role="alert"><AlertCircle size={17} />{formError}</div>}
            <footer><button className="holiday-button holiday-button--secondary" type="button" onClick={() => setModalOpen(false)}>Cancel</button><button className="holiday-button holiday-button--primary" type="submit" disabled={saving}>{saving ? "Saving…" : <><Check size={16} />Save Holiday</>}</button></footer>
          </form>
        </section>
      </div>}
    </Layout>
  );
}
