import { createElement, useEffect, useState, useMemo } from "react";
import {
  Clock,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Edit2,
  History,
  Power,
  Trash2,
  Moon,
  Sun,
  AlertCircle,
  CheckCircle2,
  Calendar,
  X,
  ChevronLeft,
  ChevronRight,
  Shield,
  Layers,
  CalendarDays,
  FileClock,
  MapPin,
  Coffee,
} from "lucide-react";
import "./Shifts.css";
import Layout from "../components/layout/Layout";
import Loader from "../components/common/Loader";
import { shiftsApi } from "../api/shifts.api";
import { usePopup } from "../context/PopupContext";
import { useAuth } from "../context/AuthContext";
import SiteManagement from "./SiteManagement";
import { useSite } from "../context/SiteContext";

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// BUG-SH08: Friendly format for weekly off day indices
function formatWeeklyOffDays(days) {
  if (!days) return "Days not specified";
  let parsed = days;
  if (typeof days === "string") {
    try {
      parsed = JSON.parse(days);
    } catch {
      parsed = days.replace(/[\[\]"]/g, "").split(",").map(s => Number(s.trim())).filter(n => !isNaN(n));
    }
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return "Days not specified";
  return parsed.map(d => DAY_NAMES[d] || `Day ${d}`).join(", ");
}

function calculateClientTiming(start, end) {
  if (!start || !end) return null;
  const [sH, sM] = start.split(":").map(Number);
  const [eH, eM] = end.split(":").map(Number);
  if (isNaN(sH) || isNaN(sM) || isNaN(eH) || isNaN(eM)) return null;

  const startMin = sH * 60 + sM;
  const endMin = eH * 60 + eM;
  if (startMin === endMin) {
    return { error: "Start and end times cannot be identical" };
  }

  let duration;
  let isOvernight;
  if (endMin > startMin) {
    duration = endMin - startMin;
    isOvernight = false;
  } else {
    duration = (1440 - startMin) + endMin;
    isOvernight = true;
  }

  const hours = Math.floor(duration / 60);
  const mins = duration % 60;
  return {
    durationMinutes: duration,
    formatted: `${hours}h ${mins > 0 ? `${mins}m` : ""}`.trim(),
    isOvernight,
  };
}

export default function Shifts() {
  const popup = usePopup();
  const { role } = useAuth();
  const { refreshSites } = useSite();

  // BUG-SH11: Reactive role check from useAuth()
  const canManageSites = ["admin", "superadmin"].includes(role);

  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("shifts");

  // Policy state
  const [policyRows, setPolicyRows] = useState([]);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policyError, setPolicyError] = useState("");
  const [policyModalOpen, setPolicyModalOpen] = useState(false);
  const [policySubmitting, setPolicySubmitting] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState(null);

  const initialCompanyPolicy = {
    name: "Company Attendance Policy",
    effective_from: new Date().toISOString().slice(0, 10),
    min_rest_period_minutes: 660,
    grace_period_in_minutes: 15,
    early_departure_grace_minutes: 15,
    early_departure_requires_approval: true,
    allow_unscheduled_punch: false,
    overtime_enabled: false,
    overtime_min_qualifying_minutes: 60,
    overtime_rounding_minutes: 15,
    overtime_requires_approval: true,
  };
  const [companyPolicyForm, setCompanyPolicyForm] = useState(initialCompanyPolicy);

  const initialWeeklyOff = {
    code: "WEEKLY_OFF",
    name: "Company Weekly Off",
    description: "",
    effective_from: new Date().toISOString().slice(0, 10),
    days_of_week: [0],
  };
  const [weeklyOffForm, setWeeklyOffForm] = useState(initialWeeklyOff);

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const [selectedShift, setSelectedShift] = useState(null);
  const [selectedShiftBreaks, setSelectedShiftBreaks] = useState([]);
  const [shiftVersions, setShiftVersions] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const initialForm = {
    code: "",
    name: "",
    start_time: "09:00",
    end_time: "17:00",
    late_grace_minutes: 15,
    early_departure_grace_minutes: 15,
    effective_from: new Date().toISOString().slice(0, 10),
    is_active: true,
    breaks: [],
  };
  const [formData, setFormData] = useState(initialForm);
  const [formError, setFormError] = useState("");

  // Dedicated Version History Tab state (BUG-SH14)
  const [versionTabShiftId, setVersionTabShiftId] = useState(null);
  const [versionTabVersions, setVersionTabVersions] = useState([]);
  const [versionTabLoading, setVersionTabLoading] = useState(false);
  const [versionSearchTerm, setVersionSearchTerm] = useState("");

  const fetchVersionTabHistory = async (shiftId) => {
    if (!shiftId) return;
    setVersionTabLoading(true);
    try {
      const res = await shiftsApi.getVersions(shiftId);
      setVersionTabVersions(res.versions || []);
    } catch {
      setVersionTabVersions([]);
    } finally {
      setVersionTabLoading(false);
    }
  };

  // BUG-SH04 & BUG-SH05: Safe server-side loading supporting explicit overrides
  const loadShifts = async (page = 1, overrides = {}) => {
    try {
      setLoading(true);
      setLoadError("");
      const search = overrides.search !== undefined ? overrides.search : searchTerm;
      const status = overrides.status !== undefined ? overrides.status : statusFilter;
      const type = overrides.type !== undefined ? overrides.type : typeFilter;

      const params = {
        page,
        limit: 10,
      };
      if (search && search.trim()) params.search = search.trim();
      if (status !== "all") params.is_active = status === "active";
      if (type !== "all") params.type = type;

      const data = await shiftsApi.list(params);
      const items = data.items || data.shifts || [];
      setShifts(items);
      setPagination(data.pagination || { page, limit: 10, total: items.length, totalPages: 1 });

      // Default selection for Version History Tab if needed
      if (!versionTabShiftId && items.length > 0) {
        setVersionTabShiftId(items[0].id);
      }
    } catch (err) {
      setLoadError(err?.response?.data?.error || "We couldn’t load shifts. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShifts(1);
  }, []);

  const loadPolicies = async (tab = activeTab) => {
    if (tab !== "policies" && tab !== "weekly-off") return;
    setPolicyLoading(true);
    setPolicyError("");
    try {
      const response = tab === "policies"
        ? await shiftsApi.listCompanyPolicies()
        : await shiftsApi.listWeeklyOffPolicies();
      setPolicyRows(response.policies || []);
    } catch (err) {
      setPolicyRows([]);
      setPolicyError(err?.response?.data?.error || "We couldn’t load this policy list. Please try again.");
    } finally {
      setPolicyLoading(false);
    }
  };

  useEffect(() => {
    loadPolicies(activeTab);
  }, [activeTab]);

  // Load versions when Version History Tab is active (BUG-SH14)
  useEffect(() => {
    if (activeTab === "versions" && versionTabShiftId) {
      fetchVersionTabHistory(versionTabShiftId);
    }
  }, [activeTab, versionTabShiftId]);

  // BUG-SH07: Policy Creation & Versioning for existing or new policies
  const handleOpenCreatePolicy = (existing = null) => {
    setEditingPolicy(existing);
    if (activeTab === "policies") {
      if (existing) {
        setCompanyPolicyForm({
          name: existing.name || "Company Attendance Policy",
          effective_from: new Date().toISOString().slice(0, 10),
          min_rest_period_minutes: existing.min_rest_period_minutes ?? 660,
          grace_period_in_minutes: existing.grace_period_in_minutes ?? 15,
          early_departure_grace_minutes: existing.early_departure_grace_minutes ?? 15,
          early_departure_requires_approval: Boolean(existing.early_departure_requires_approval),
          allow_unscheduled_punch: Boolean(existing.allow_unscheduled_punch),
          overtime_enabled: Boolean(existing.overtime_enabled),
          overtime_min_qualifying_minutes: existing.overtime_min_qualifying_minutes ?? 60,
          overtime_rounding_minutes: existing.overtime_rounding_minutes ?? 15,
          overtime_requires_approval: Boolean(existing.overtime_requires_approval),
        });
      } else {
        setCompanyPolicyForm(initialCompanyPolicy);
      }
    } else {
      if (existing) {
        let days = [0];
        try {
          days = typeof existing.days_of_week === "string" ? JSON.parse(existing.days_of_week) : (existing.days_of_week || [0]);
        } catch {
          days = [0];
        }
        setWeeklyOffForm({
          code: existing.code || "WEEKLY_OFF",
          name: existing.name || "Company Weekly Off",
          description: existing.description || "",
          effective_from: new Date().toISOString().slice(0, 10),
          days_of_week: Array.isArray(days) ? days : [0],
        });
      } else {
        setWeeklyOffForm(initialWeeklyOff);
      }
    }
    setPolicyModalOpen(true);
  };

  const handleCreatePolicy = async (e) => {
    e.preventDefault();
    setPolicySubmitting(true);
    try {
      if (activeTab === "policies") {
        const payload = {
          ...companyPolicyForm,
          min_rest_period_minutes: Number(companyPolicyForm.min_rest_period_minutes),
          grace_period_in_minutes: Number(companyPolicyForm.grace_period_in_minutes),
          early_departure_grace_minutes: Number(companyPolicyForm.early_departure_grace_minutes),
          overtime_min_qualifying_minutes: Number(companyPolicyForm.overtime_min_qualifying_minutes),
          overtime_rounding_minutes: Number(companyPolicyForm.overtime_rounding_minutes),
          is_active: true,
        };

        if (editingPolicy) {
          const draft = await shiftsApi.createDraftCompanyPolicyVersion(editingPolicy.id, payload);
          await shiftsApi.publishCompanyPolicy(editingPolicy.id, draft.id);
          popup?.showPopup(`New version published for attendance policy '${editingPolicy.name}'.`, "success");
        } else {
          const policy = await shiftsApi.createCompanyPolicy(payload);
          await shiftsApi.publishCompanyPolicy(policy.id, policy.initial_version_id);
          popup?.showPopup("Attendance policy configured and activated.", "success");
        }
      } else {
        if (weeklyOffForm.days_of_week.length === 0) {
          popup?.showPopup("Select at least one weekly-off day.", "error");
          setPolicySubmitting(false);
          return;
        }
        const payload = {
          ...weeklyOffForm,
          policy_type: "fixed",
          is_active: true,
        };

        if (editingPolicy) {
          const draft = await shiftsApi.createDraftWeeklyOffPolicyVersion(editingPolicy.id, payload);
          await shiftsApi.publishWeeklyOffPolicy(editingPolicy.id, draft.id);
          popup?.showPopup(`New version published for weekly-off policy '${editingPolicy.name}'.`, "success");
        } else {
          const policy = await shiftsApi.createWeeklyOffPolicy(payload);
          await shiftsApi.publishWeeklyOffPolicy(policy.id, policy.initial_version_id);
          popup?.showPopup("Weekly-off policy configured and activated.", "success");
        }
      }
      setPolicyModalOpen(false);
      setEditingPolicy(null);
      await loadPolicies(activeTab);
    } catch (err) {
      popup?.showPopup(err?.response?.data?.error || "Could not configure this policy.", "error");
      await loadPolicies(activeTab);
    } finally {
      setPolicySubmitting(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPagination((prev) => ({ ...prev, page: 1 }));
    loadShifts(1);
  };

  // BUG-SH05: Clear Filters immediately resets search and sends empty parameters
  const handleClearFilters = () => {
    setTypeFilter("all");
    setStatusFilter("all");
    setSearchTerm("");
    setPagination((prev) => ({ ...prev, page: 1 }));
    loadShifts(1, { search: "", status: "all", type: "all" });
  };

  const handleOpenCreate = () => {
    setFormData(initialForm);
    setFormError("");
    setCreateModalOpen(true);
  };

  // BUG-SH01 & BUG-SH13: Populate grace periods (preserving 0) and fetch existing breaks
  const handleOpenEdit = async (shift) => {
    setSelectedShift(shift);
    let shiftBreaks = [];
    if (shift.current_version_id) {
      try {
        const breakRes = await shiftsApi.getBreaks(shift.id, shift.current_version_id);
        shiftBreaks = breakRes.breaks || [];
      } catch {
        shiftBreaks = [];
      }
    }
    setSelectedShiftBreaks(shiftBreaks);

    const lateGrace = shift.late_grace_minutes !== undefined && shift.late_grace_minutes !== null
      ? Number(shift.late_grace_minutes)
      : 15;
    const earlyGrace = shift.early_departure_grace_minutes !== undefined && shift.early_departure_grace_minutes !== null
      ? Number(shift.early_departure_grace_minutes)
      : 15;

    setFormData({
      code: shift.code,
      name: shift.name,
      start_time: shift.start_time?.slice(0, 5) || "09:00",
      end_time: shift.end_time?.slice(0, 5) || "17:00",
      late_grace_minutes: lateGrace,
      early_departure_grace_minutes: earlyGrace,
      effective_from: new Date().toISOString().slice(0, 10),
      is_active: Boolean(shift.is_active),
      breaks: shiftBreaks.map((b) => ({
        break_name: b.break_name || "Break",
        break_type: b.break_type || "unpaid",
        start_offset_minutes: Number(b.start_offset_minutes),
        end_offset_minutes: Number(b.end_offset_minutes),
        duration_minutes: Number(b.duration_minutes || (b.end_offset_minutes - b.start_offset_minutes)),
        is_mandatory: Boolean(b.is_mandatory),
      })),
    });
    setFormError("");
    setEditModalOpen(true);
  };

  const handleOpenHistory = async (shift) => {
    setSelectedShift(shift);
    setHistoryModalOpen(true);
    setHistoryLoading(true);
    try {
      const data = await shiftsApi.getVersions(shift.id);
      setShiftVersions(data.versions || []);
    } catch {
      popup?.showPopup("Failed to retrieve shift version history", "error");
      setHistoryModalOpen(false);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleToggleStatus = async (shift) => {
    const newStatus = !shift.is_active;
    try {
      await shiftsApi.toggleStatus(shift.id, newStatus);
      popup?.showPopup(`Shift '${shift.name}' ${newStatus ? "activated" : "deactivated"}`, "success");
      loadShifts(pagination.page);
    } catch (err) {
      popup?.showPopup(err?.response?.data?.error || "Status update failed", "error");
    }
  };

  const handleDeleteClick = (shift) => {
    setSelectedShift(shift);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!selectedShift) return;
    try {
      setSubmitting(true);
      await shiftsApi.delete(selectedShift.id);
      popup?.showPopup(`Shift '${selectedShift.name}' deleted successfully`, "success");
      setDeleteConfirmOpen(false);
      setSelectedShift(null);
      loadShifts(1);
    } catch (err) {
      popup?.showPopup(err?.response?.data?.error || "Could not delete shift", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // BUG-SH13: Add break to form
  const handleAddBreak = () => {
    const currentBreaks = formData.breaks || [];
    const nextStart = currentBreaks.length > 0
      ? Math.max(...currentBreaks.map((b) => Number(b.end_offset_minutes || 0))) + 60
      : 240;
    setFormData({
      ...formData,
      breaks: [
        ...currentBreaks,
        {
          break_name: currentBreaks.length === 0 ? "Lunch Break" : `Break ${currentBreaks.length + 1}`,
          break_type: "unpaid",
          start_offset_minutes: nextStart,
          end_offset_minutes: nextStart + 30,
          duration_minutes: 30,
          is_mandatory: true,
        },
      ],
    });
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    const timing = calculateClientTiming(formData.start_time, formData.end_time);
    if (!timing || timing.error) {
      setFormError(timing?.error || "Please check shift timings");
      return;
    }

    if (formData.breaks && formData.breaks.length > 0) {
      for (const b of formData.breaks) {
        const start = Number(b.start_offset_minutes);
        const end = Number(b.end_offset_minutes);
        if (isNaN(start) || start < 0) {
          setFormError(`Break '${b.break_name || "Break"}': start offset must be 0 or greater.`);
          return;
        }
        if (isNaN(end) || end <= start) {
          setFormError(`Break '${b.break_name || "Break"}': end offset must be greater than start offset.`);
          return;
        }
        if (end > timing.durationMinutes) {
          setFormError(`Break '${b.break_name || "Break"}': end offset (${end}m) exceeds shift duration (${timing.durationMinutes}m).`);
          return;
        }
      }
    }

    try {
      setSubmitting(true);
      await shiftsApi.create({
        code: formData.code.trim().toUpperCase(),
        name: formData.name.trim(),
        start_time: formData.start_time,
        end_time: formData.end_time,
        late_grace_minutes: Number(formData.late_grace_minutes),
        early_departure_grace_minutes: Number(formData.early_departure_grace_minutes),
        effective_from: formData.effective_from,
        is_active: formData.is_active,
        breaks: formData.breaks || [],
      });

      popup?.showPopup("Shift successfully created with version 1", "success");
      setCreateModalOpen(false);
      loadShifts(1);
    } catch (err) {
      setFormError(err?.response?.data?.error || "Shift creation failed");
    } finally {
      setSubmitting(false);
    }
  };

  // BUG-SH02 & BUG-SH03: Omit immutable code and only request new version when needed
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    const timing = calculateClientTiming(formData.start_time, formData.end_time);
    if (!timing || timing.error) {
      setFormError(timing?.error || "Please check shift timings");
      return;
    }

    if (formData.breaks && formData.breaks.length > 0) {
      for (const b of formData.breaks) {
        const start = Number(b.start_offset_minutes);
        const end = Number(b.end_offset_minutes);
        if (isNaN(start) || start < 0) {
          setFormError(`Break '${b.break_name || "Break"}': start offset must be 0 or greater.`);
          return;
        }
        if (isNaN(end) || end <= start) {
          setFormError(`Break '${b.break_name || "Break"}': end offset must be greater than start offset.`);
          return;
        }
        if (end > timing.durationMinutes) {
          setFormError(`Break '${b.break_name || "Break"}': end offset (${end}m) exceeds shift duration (${timing.durationMinutes}m).`);
          return;
        }
      }
    }

    try {
      setSubmitting(true);
      const payload = hasTimingChanges
        ? {
            name: formData.name.trim(),
            start_time: formData.start_time,
            end_time: formData.end_time,
            late_grace_minutes: Number(formData.late_grace_minutes),
            early_departure_grace_minutes: Number(formData.early_departure_grace_minutes),
            effective_from: formData.effective_from,
            is_active: formData.is_active,
            breaks: formData.breaks || [],
          }
        : {
            name: formData.name.trim(),
            is_active: formData.is_active,
          };

      const res = await shiftsApi.update(selectedShift.id, payload);

      if (res.version_generated) {
        popup?.showPopup(`Shift updated! New version v${res.version_number} generated to protect historical records.`, "success");
      } else {
        popup?.showPopup("Shift details updated successfully without creating unnecessary versions.", "success");
      }
      setEditModalOpen(false);
      loadShifts(pagination.page);
    } catch (err) {
      setFormError(err?.response?.data?.error || "Shift update failed");
    } finally {
      setSubmitting(false);
    }
  };

  // Live timing calculation for forms
  const liveTiming = useMemo(() => {
    return calculateClientTiming(formData.start_time, formData.end_time);
  }, [formData.start_time, formData.end_time]);

  // BUG-SH09: Full change detection including grace periods and breaks
  const hasTimingChanges = useMemo(() => {
    if (!selectedShift) return false;
    const origStart = selectedShift.start_time?.slice(0, 5) || "09:00";
    const origEnd = selectedShift.end_time?.slice(0, 5) || "17:00";
    const origLate = selectedShift.late_grace_minutes !== undefined && selectedShift.late_grace_minutes !== null
      ? Number(selectedShift.late_grace_minutes)
      : 15;
    const origEarly = selectedShift.early_departure_grace_minutes !== undefined && selectedShift.early_departure_grace_minutes !== null
      ? Number(selectedShift.early_departure_grace_minutes)
      : 15;

    const startChanged = origStart !== formData.start_time;
    const endChanged = origEnd !== formData.end_time;
    const lateChanged = origLate !== Number(formData.late_grace_minutes);
    const earlyChanged = origEarly !== Number(formData.early_departure_grace_minutes);

    const normBreaks = (arr) => (arr || []).map((b) => ({
      name: b.break_name,
      start: Number(b.start_offset_minutes),
      end: Number(b.end_offset_minutes),
      type: b.break_type || "unpaid",
    }));
    const breaksChanged = JSON.stringify(normBreaks(selectedShiftBreaks)) !== JSON.stringify(normBreaks(formData.breaks));

    return startChanged || endChanged || lateChanged || earlyChanged || breaksChanged;
  }, [selectedShift, formData.start_time, formData.end_time, formData.late_grace_minutes, formData.early_departure_grace_minutes, formData.breaks, selectedShiftBreaks]);

  return (
    <Layout>
      <>
        <main className="shift-page" aria-labelledby="shift-page-title">
          <header className="shift-page__header">
            <div className="shift-page__heading">
              <div className="shift-page__icon">
                <CalendarDays size={25} aria-hidden="true" />
              </div>
              <div>
                <h1 id="shift-page-title">Shift Management</h1>
                <p>Configure shifts, grace periods, breaks and manage immutable version schedules</p>
              </div>
            </div>
            <div className="shift-page__header-actions">
              <button
                type="button"
                className="shift-button shift-button--secondary"
                onClick={() => {
                  if (activeTab === "policies" || activeTab === "weekly-off") {
                    loadPolicies(activeTab);
                  } else if (activeTab === "sites") {
                    refreshSites();
                  } else if (activeTab === "versions") {
                    loadShifts(pagination.page);
                    if (versionTabShiftId) fetchVersionTabHistory(versionTabShiftId);
                  } else {
                    loadShifts(pagination.page);
                  }
                }}
                disabled={loading || policyLoading || versionTabLoading}
              >
                <RefreshCw size={17} className={loading || policyLoading || versionTabLoading ? "shift-spin" : ""} />
                Refresh
              </button>
              {(activeTab === "policies" || activeTab === "weekly-off") && (
                <button
                  type="button"
                  className="shift-button shift-button--primary"
                  onClick={() => handleOpenCreatePolicy(null)}
                  disabled={policyLoading}
                >
                  <Plus size={18} />
                  Configure {activeTab === "policies" ? "Attendance" : "Weekly-Off"} Policy
                </button>
              )}
              {activeTab === "shifts" && (
                <button type="button" className="shift-button shift-button--primary" onClick={handleOpenCreate}>
                  <Plus size={18} />
                  Create Shift
                </button>
              )}
            </div>
          </header>

          <nav className="shift-tabs" aria-label="Shift management sections">
            {[
              ["shifts", "Shifts", CalendarDays],
              ["policies", "Policies", Shield],
              ["weekly-off", "Weekly Off", Calendar],
              ["versions", "Version History", Layers],
              ...(canManageSites ? [["sites", "Work Sites", MapPin]] : []),
            ].map(([key, label, TabIcon]) => (
              <button
                key={key}
                type="button"
                className={`shift-tabs__tab ${activeTab === key ? "is-active" : ""}`}
                onClick={() => setActiveTab(key)}
                aria-current={activeTab === key ? "page" : undefined}
              >
                {createElement(TabIcon, { size: 17 })}
                {label}
              </button>
            ))}
          </nav>

          {/* TAB 1: WORK SITES */}
          {activeTab === "sites" && canManageSites && <SiteManagement />}

          {/* TAB 2: GENERAL SHIFTS LIST */}
          {activeTab === "shifts" && (
            <>
              <form className="shift-filters" onSubmit={handleSearchSubmit}>
                <label className="shift-search">
                  <Search size={19} aria-hidden="true" />
                  <span className="sr-only">Search by shift name, code or description</span>
                  <input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search by shift name, code or description..."
                  />
                </label>
                <label className="shift-select-wrap">
                  <span>Shift Type</span>
                  <select
                    value={typeFilter}
                    onChange={(event) => {
                      const val = event.target.value;
                      setTypeFilter(val);
                      setPagination((prev) => ({ ...prev, page: 1 }));
                      loadShifts(1, { type: val });
                    }}
                    aria-label="Filter by shift type"
                  >
                    <option value="all">All Types</option>
                    <option value="daytime">Daytime</option>
                    <option value="overnight">Overnight</option>
                  </select>
                </label>
                <label className="shift-select-wrap">
                  <span>Status</span>
                  <select
                    value={statusFilter}
                    onChange={(event) => {
                      const val = event.target.value;
                      setStatusFilter(val);
                      setPagination((prev) => ({ ...prev, page: 1 }));
                      loadShifts(1, { status: val });
                    }}
                    aria-label="Filter by status"
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>
                <button type="submit" className="shift-button shift-button--search">
                  Search
                </button>
              </form>

              <section className="shift-table-card" aria-label="Shift list">
                {loading ? (
                  <div className="shift-state" role="status">
                    <Loader />
                    <span>Loading shifts…</span>
                  </div>
                ) : loadError ? (
                  <div className="shift-state shift-state--error" role="alert">
                    <AlertCircle size={28} />
                    <h2>Shifts could not be loaded</h2>
                    <p>{loadError}</p>
                    <button type="button" className="shift-button shift-button--secondary" onClick={() => loadShifts(pagination.page)}>
                      Try again
                    </button>
                  </div>
                ) : shifts.length === 0 ? (
                  <div className="shift-state">
                    {searchTerm || statusFilter !== "all" || typeFilter !== "all" ? (
                      <>
                        <Search size={28} />
                        <h2>No shifts match these filters</h2>
                        <p>Try clearing your search query or selecting other filter options.</p>
                        <button type="button" className="shift-button shift-button--secondary" onClick={handleClearFilters}>
                          Clear filters
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="shift-empty-icon">
                          <CalendarDays size={27} />
                        </div>
                        <h2>No shifts configured</h2>
                        <p>Create your first shift to start configuring employee schedules.</p>
                        <button type="button" className="shift-button shift-button--primary" onClick={handleOpenCreate}>
                          <Plus size={17} />
                          Create Shift
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="shift-table-scroll">
                    <table className="shift-table">
                      <thead>
                        <tr>
                          <th scope="col">#</th>
                          <th scope="col">Shift Name</th>
                          <th scope="col">Code</th>
                          <th scope="col">Type</th>
                          <th scope="col">Timing</th>
                          <th scope="col">Duration</th>
                          <th scope="col">Graces (L/E)</th>
                          <th scope="col">Current Version</th>
                          <th scope="col">Effective From</th>
                          <th scope="col">Status</th>
                          <th scope="col" className="shift-actions-heading">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shifts.map((shift, index) => {
                          const duration = Number(shift.duration_minutes || 0);
                          const hours = Math.floor(duration / 60);
                          const minutes = duration % 60;
                          const overnight = Boolean(shift.is_overnight);
                          const lateG = shift.late_grace_minutes !== undefined && shift.late_grace_minutes !== null ? shift.late_grace_minutes : 15;
                          const earlyG = shift.early_departure_grace_minutes !== undefined && shift.early_departure_grace_minutes !== null ? shift.early_departure_grace_minutes : 15;

                          return (
                            <tr key={shift.id}>
                              <td className="shift-row-number">
                                {(pagination.page - 1) * pagination.limit + index + 1}
                              </td>
                              <td>
                                <strong>{shift.name}</strong>
                                <span className="shift-subtext">{overnight ? "Overnight schedule" : "Daytime schedule"}</span>
                              </td>
                              <td>
                                <span className="shift-code">{shift.code}</span>
                              </td>
                              <td>
                                <span className={`shift-type ${overnight ? "shift-type--night" : "shift-type--day"}`}>
                                  {overnight ? "Overnight" : "Daytime"}
                                </span>
                              </td>
                              <td className="shift-timing">
                                <Clock size={16} />
                                <span>
                                  {shift.start_time?.slice(0, 5) || "--:--"} – {shift.end_time?.slice(0, 5) || "--:--"}
                                  {overnight ? " (+1)" : ""}
                                </span>
                              </td>
                              <td>
                                {hours.toString().padStart(2, "0")}h {minutes.toString().padStart(2, "0")}m
                              </td>
                              <td className="font-mono text-xs text-gray-400">
                                {lateG}m / {earlyG}m
                              </td>
                              <td>
                                <button
                                  className="shift-version"
                                  type="button"
                                  onClick={() => handleOpenHistory(shift)}
                                  aria-label={`View version history for ${shift.name}`}
                                >
                                  v{shift.version_number || 1}
                                </button>
                              </td>
                              <td>{shift.effective_from ? String(shift.effective_from).slice(0, 10) : "—"}</td>
                              <td>
                                <span className={`shift-status ${shift.is_active ? "is-active" : "is-inactive"}`}>
                                  <i />
                                  {shift.is_active ? "Active" : "Inactive"}
                                </span>
                              </td>
                              <td>
                                <div className="shift-row-actions">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEdit(shift)}
                                    aria-label={`Edit ${shift.name}`}
                                    title="Edit shift"
                                  >
                                    <Edit2 size={16} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleStatus(shift)}
                                    aria-label={`${shift.is_active ? "Deactivate" : "Activate"} ${shift.name}`}
                                    title={shift.is_active ? "Deactivate shift" : "Activate shift"}
                                  >
                                    <Power size={16} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenHistory(shift)}
                                    aria-label={`View ${shift.name} version history`}
                                    title="Version history"
                                  >
                                    <History size={16} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteClick(shift)}
                                    aria-label={`Delete ${shift.name}`}
                                    title="Delete shift"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {!loading && !loadError && shifts.length > 0 && (
                  <footer className="shift-pagination">
                    <span>
                      Showing {Math.min((pagination.page - 1) * pagination.limit + 1, pagination.total)} to{" "}
                      {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} shifts
                    </span>
                    {pagination.totalPages > 1 && (
                      <div className="shift-pagination__controls">
                        <button
                          type="button"
                          aria-label="Previous page"
                          disabled={pagination.page <= 1}
                          onClick={() => loadShifts(pagination.page - 1)}
                        >
                          <ChevronLeft size={17} />
                        </button>
                        <span>{pagination.page}</span>
                        <button
                          type="button"
                          aria-label="Next page"
                          disabled={pagination.page >= pagination.totalPages}
                          onClick={() => loadShifts(pagination.page + 1)}
                        >
                          <ChevronRight size={17} />
                        </button>
                      </div>
                    )}
                  </footer>
                )}
              </section>
            </>
          )}

          {/* TAB 3: DEDICATED VERSION HISTORY AUDIT VIEW (BUG-SH14) */}
          {activeTab === "versions" && (
            <div className="space-y-4">
              <div className="shift-section-note">
                <FileClock size={18} />
                <span>
                  <strong>Immutable Version Audit Trail:</strong> Every shift timing modification archives prior versions with deterministic timestamp attributions. Historical rosters remain permanently preserved.
                </span>
              </div>

              {shifts.length === 0 ? (
                <div className="shift-table-card p-8 text-center text-gray-500">
                  <p>No shifts configured yet. Create a shift to track immutable versions.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                  {/* Left Column: Select shift */}
                  <div className="lg:col-span-1 shift-table-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wider">Select Shift</h3>
                      <span className="text-xs text-gray-400 font-semibold">{shifts.length}</span>
                    </div>
                    {shifts.length > 5 && (
                      <input
                        type="text"
                        placeholder="Filter shifts..."
                        value={versionSearchTerm}
                        onChange={(e) => setVersionSearchTerm(e.target.value)}
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-800 focus:outline-none focus:border-blue-500"
                      />
                    )}
                    <div className="space-y-1.5 max-h-[500px] overflow-y-auto">
                      {shifts
                        .filter(
                          (s) =>
                            !versionSearchTerm ||
                            s.name.toLowerCase().includes(versionSearchTerm.toLowerCase()) ||
                            s.code.toLowerCase().includes(versionSearchTerm.toLowerCase())
                        )
                        .map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setVersionTabShiftId(s.id)}
                          className={`w-full text-left px-3 py-2.5 rounded-xl border text-xs transition flex items-center justify-between ${
                            versionTabShiftId === s.id
                              ? "bg-blue-50 border-blue-200 text-blue-900 font-bold"
                              : "bg-white border-gray-100 hover:bg-gray-50 text-gray-700"
                          }`}
                        >
                          <div>
                            <p className="font-semibold">{s.name}</p>
                            <span className="font-mono text-[10px] text-gray-500">{s.code}</span>
                          </div>
                          <span className="shift-version">v{s.version_number || 1}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Right Column: Historical version table */}
                  <div className="lg:col-span-3 shift-table-card p-5 space-y-4">
                    <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                      <div>
                        <h3 className="text-base font-bold text-gray-900">
                          {shifts.find((s) => s.id === versionTabShiftId)?.name || "Shift"} Audit History
                        </h3>
                        <p className="text-xs text-gray-500">
                          Code: {shifts.find((s) => s.id === versionTabShiftId)?.code}
                        </p>
                      </div>
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                        {versionTabVersions.length} historical version{versionTabVersions.length === 1 ? "" : "s"}
                      </span>
                    </div>

                    {versionTabLoading ? (
                      <div className="py-12 flex justify-center">
                        <Loader />
                      </div>
                    ) : versionTabVersions.length === 0 ? (
                      <p className="text-sm text-gray-500 py-8 text-center">No historical versions found.</p>
                    ) : (
                      <div className="shift-table-scroll">
                        <table className="shift-table">
                          <thead>
                            <tr>
                              <th scope="col">Version</th>
                              <th scope="col">Schedule</th>
                              <th scope="col">Duration</th>
                              <th scope="col">Graces (Late/Early)</th>
                              <th scope="col">Effective Period</th>
                              <th scope="col">Status</th>
                              <th scope="col">Integrity</th>
                            </tr>
                          </thead>
                          <tbody>
                            {versionTabVersions.map((v) => {
                              const isCurrent = v.effective_to === null;
                              // BUG-SH10: Safe date formatting without UTC shifting
                              const effFrom = v.effective_from ? String(v.effective_from).slice(0, 10) : "--";
                              const effTo = v.effective_to ? String(v.effective_to).slice(0, 10) : "Present";
                              const hours = Math.floor((v.duration_minutes || 0) / 60);
                              const mins = (v.duration_minutes || 0) % 60;

                              return (
                                <tr key={v.id} className={isCurrent ? "bg-blue-50/40" : ""}>
                                  <td className="font-mono font-bold text-blue-700">v{v.version_number}</td>
                                  <td>
                                    <span className="font-mono font-semibold">
                                      {v.start_time?.slice(0, 5)} – {v.end_time?.slice(0, 5)}
                                    </span>
                                    {Boolean(v.is_overnight) && (
                                      <span className="block text-[11px] text-purple-700 font-sans font-medium">Overnight</span>
                                    )}
                                  </td>
                                  <td>
                                    {hours}h {mins > 0 ? `${mins}m` : ""}
                                  </td>
                                  <td className="font-mono">
                                    {v.late_grace_minutes ?? 15}m / {v.early_departure_grace_minutes ?? 15}m
                                  </td>
                                  <td className="font-mono text-xs">
                                    {effFrom} → {effTo}
                                  </td>
                                  <td>
                                    {isCurrent ? (
                                      <span className="shift-status is-active">Active</span>
                                    ) : (
                                      <span className="shift-status is-inactive">Archived</span>
                                    )}
                                  </td>
                                  <td>
                                    <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-medium">
                                      <Shield size={12} /> Verified
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: POLICIES & WEEKLY-OFF */}
          {(activeTab === "policies" || activeTab === "weekly-off") && (
            <section className="shift-policy-card">
              <div className="shift-policy-card__heading">
                <div>
                  <h2>{activeTab === "policies" ? "Attendance Policies" : "Weekly-Off Policies"}</h2>
                  <p>
                    {activeTab === "policies"
                      ? "Current attendance policy settings from your organization."
                      : "Current weekly-off rules from your organization."}
                  </p>
                </div>
                <span>
                  {policyRows.length} {policyRows.length === 1 ? "policy" : "policies"}
                </span>
              </div>
              {policyLoading ? (
                <div className="shift-state" role="status">
                  <Loader />
                  <span>Loading policies…</span>
                </div>
              ) : policyError ? (
                <div className="shift-state shift-state--error" role="alert">
                  <AlertCircle size={28} />
                  <h2>Policies could not be loaded</h2>
                  <p>{policyError}</p>
                  <button type="button" className="shift-button shift-button--secondary" onClick={() => loadPolicies(activeTab)}>
                    Try again
                  </button>
                </div>
              ) : policyRows.length === 0 ? (
                <div className="shift-state">
                  <Shield size={28} />
                  <h2>No policies configured</h2>
                  <p>Configure a policy to establish company-wide attendance and weekly off rules.</p>
                  <button type="button" className="shift-button shift-button--primary" onClick={() => handleOpenCreatePolicy(null)}>
                    <Plus size={17} />
                    Configure {activeTab === "policies" ? "Attendance" : "Weekly-Off"} Policy
                  </button>
                </div>
              ) : (
                <div className="shift-policy-list">
                  {policyRows.map((policy) => (
                    <article className="shift-policy-row" key={policy.id}>
                      <div className="shift-policy-row__icon">
                        {activeTab === "policies" ? <Shield size={19} /> : <Calendar size={19} />}
                      </div>
                      <div className="shift-policy-row__main">
                        <strong>{policy.name || policy.code || `Policy ${policy.id}`}</strong>
                        <span>
                          {activeTab === "policies"
                            ? `Grace ${policy.grace_period_in_minutes ?? "—"} min · Rest ${policy.min_rest_period_minutes ?? "—"} min`
                            : `${policy.policy_type || "Weekly off"} · ${formatWeeklyOffDays(policy.days_of_week)}`}
                        </span>
                      </div>
                      <span className="shift-version">v{policy.current_version_number || 1}</span>
                      <span className={`shift-status ${policy.is_active ? "is-active" : "is-inactive"}`}>
                        <i />
                        {policy.current_version_status || (policy.is_active ? "Active" : "Inactive")}
                      </span>
                      {/* BUG-SH07: Action button to configure a new version for existing policy */}
                      <button
                        type="button"
                        onClick={() => handleOpenCreatePolicy(policy)}
                        className="shift-button shift-button--secondary text-xs h-8 px-3"
                        title="Configure new policy version"
                      >
                        + New Version
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}
        </main>

        {/* ------------------------------------------------------------------ */}
        {/* POLICY CONFIGURATION MODAL (BUG-SH07)                              */}
        {/* ------------------------------------------------------------------ */}
        {policyModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white">
                    {editingPolicy ? "Create New Version for " : "Configure "}
                    {activeTab === "policies" ? "Attendance Policy" : "Weekly-Off Policy"}
                  </h2>
                  <p className="mt-1 text-xs text-gray-400">
                    {editingPolicy
                      ? "A new immutable version will be created and activated while preserving past records."
                      : "The policy will be created and activated for this company."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPolicyModalOpen(false);
                    setEditingPolicy(null);
                  }}
                  className="text-gray-400 hover:text-white"
                  aria-label="Close policy form"
                >
                  <X size={19} />
                </button>
              </div>

              {activeTab === "policies" ? (
                <form onSubmit={handleCreatePolicy} className="space-y-4 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="text-gray-300">
                      Policy Name
                      <input
                        required
                        value={companyPolicyForm.name}
                        onChange={(e) => setCompanyPolicyForm({ ...companyPolicyForm, name: e.target.value })}
                        className="mt-1 w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2.5 text-white"
                      />
                    </label>
                    <label className="text-gray-300">
                      Effective From
                      <input
                        required
                        type="date"
                        value={companyPolicyForm.effective_from}
                        onChange={(e) => setCompanyPolicyForm({ ...companyPolicyForm, effective_from: e.target.value })}
                        className="mt-1 w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2.5 text-white"
                      />
                    </label>
                    <label className="text-gray-300">
                      Minimum Rest (minutes)
                      <input
                        required
                        min="0"
                        type="number"
                        value={companyPolicyForm.min_rest_period_minutes}
                        onChange={(e) => setCompanyPolicyForm({ ...companyPolicyForm, min_rest_period_minutes: e.target.value })}
                        className="mt-1 w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2.5 text-white"
                      />
                    </label>
                    <label className="text-gray-300">
                      Late Grace (minutes)
                      <input
                        required
                        min="0"
                        type="number"
                        value={companyPolicyForm.grace_period_in_minutes}
                        onChange={(e) => setCompanyPolicyForm({ ...companyPolicyForm, grace_period_in_minutes: e.target.value })}
                        className="mt-1 w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2.5 text-white"
                      />
                    </label>
                    <label className="text-gray-300">
                      Early Departure Grace (minutes)
                      <input
                        required
                        min="0"
                        type="number"
                        value={companyPolicyForm.early_departure_grace_minutes}
                        onChange={(e) => setCompanyPolicyForm({ ...companyPolicyForm, early_departure_grace_minutes: e.target.value })}
                        className="mt-1 w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2.5 text-white"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-gray-300">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={companyPolicyForm.early_departure_requires_approval}
                        onChange={(e) => setCompanyPolicyForm({ ...companyPolicyForm, early_departure_requires_approval: e.target.checked })}
                      />
                      Early departure requires approval
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={companyPolicyForm.allow_unscheduled_punch}
                        onChange={(e) => setCompanyPolicyForm({ ...companyPolicyForm, allow_unscheduled_punch: e.target.checked })}
                      />
                      Allow unscheduled punches
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={companyPolicyForm.overtime_enabled}
                        onChange={(e) => setCompanyPolicyForm({ ...companyPolicyForm, overtime_enabled: e.target.checked })}
                      />
                      Enable overtime
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={companyPolicyForm.overtime_requires_approval}
                        onChange={(e) => setCompanyPolicyForm({ ...companyPolicyForm, overtime_requires_approval: e.target.checked })}
                      />
                      Overtime requires approval
                    </label>
                  </div>

                  {companyPolicyForm.overtime_enabled && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="text-gray-300">
                        Overtime Qualifying Time (minutes)
                        <input
                          required
                          min="1"
                          type="number"
                          value={companyPolicyForm.overtime_min_qualifying_minutes}
                          onChange={(e) => setCompanyPolicyForm({ ...companyPolicyForm, overtime_min_qualifying_minutes: e.target.value })}
                          className="mt-1 w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2.5 text-white"
                        />
                      </label>
                      <label className="text-gray-300">
                        Overtime Rounding (minutes)
                        <input
                          required
                          min="1"
                          type="number"
                          value={companyPolicyForm.overtime_rounding_minutes}
                          onChange={(e) => setCompanyPolicyForm({ ...companyPolicyForm, overtime_rounding_minutes: e.target.value })}
                          className="mt-1 w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2.5 text-white"
                        />
                      </label>
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPolicyModalOpen(false);
                        setEditingPolicy(null);
                      }}
                      className="shift-button shift-button--secondary"
                    >
                      Cancel
                    </button>
                    <button type="submit" disabled={policySubmitting} className="shift-button shift-button--primary disabled:opacity-50">
                      {policySubmitting ? "Saving…" : editingPolicy ? "Publish New Version" : "Save and Activate"}
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleCreatePolicy} className="space-y-4 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="text-gray-300">
                      Policy Code
                      <input
                        required
                        disabled={Boolean(editingPolicy)}
                        value={weeklyOffForm.code}
                        onChange={(e) => setWeeklyOffForm({ ...weeklyOffForm, code: e.target.value.toUpperCase() })}
                        className="mt-1 w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2.5 text-white disabled:opacity-50"
                      />
                    </label>
                    <label className="text-gray-300">
                      Policy Name
                      <input
                        required
                        value={weeklyOffForm.name}
                        onChange={(e) => setWeeklyOffForm({ ...weeklyOffForm, name: e.target.value })}
                        className="mt-1 w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2.5 text-white"
                      />
                    </label>
                    <label className="text-gray-300">
                      Effective From
                      <input
                        required
                        type="date"
                        value={weeklyOffForm.effective_from}
                        onChange={(e) => setWeeklyOffForm({ ...weeklyOffForm, effective_from: e.target.value })}
                        className="mt-1 w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2.5 text-white"
                      />
                    </label>
                    <label className="text-gray-300">
                      Description (Optional)
                      <input
                        value={weeklyOffForm.description}
                        onChange={(e) => setWeeklyOffForm({ ...weeklyOffForm, description: e.target.value })}
                        className="mt-1 w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2.5 text-white"
                      />
                    </label>
                  </div>
                  <fieldset className="space-y-2">
                    <legend className="text-gray-300">Weekly Off Days</legend>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-gray-300">
                      {DAY_NAMES.map((day, dayIndex) => (
                        <label key={day} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={weeklyOffForm.days_of_week.includes(dayIndex)}
                            onChange={(e) =>
                              setWeeklyOffForm({
                                ...weeklyOffForm,
                                days_of_week: e.target.checked
                                  ? [...weeklyOffForm.days_of_week, dayIndex].sort((a, b) => a - b)
                                  : weeklyOffForm.days_of_week.filter((value) => value !== dayIndex),
                              })
                            }
                          />
                          {day}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPolicyModalOpen(false);
                        setEditingPolicy(null);
                      }}
                      className="shift-button shift-button--secondary"
                    >
                      Cancel
                    </button>
                    <button type="submit" disabled={policySubmitting} className="shift-button shift-button--primary disabled:opacity-50">
                      {policySubmitting ? "Saving…" : editingPolicy ? "Publish New Version" : "Save and Activate"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* CREATE SHIFT MODAL                                                 */}
        {/* ------------------------------------------------------------------ */}
        {createModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto animate-in fade-in duration-200">
              <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-blue-600/20 text-blue-400 rounded-lg">
                    <Clock size={18} />
                  </div>
                  <h3 className="text-lg font-bold text-white">Create New Shift</h3>
                </div>
                <button
                  onClick={() => setCreateModalOpen(false)}
                  className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
                {formError && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-xs flex items-center gap-2">
                    <AlertCircle size={16} className="shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                      Shift Code *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. MORNING_A"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                      className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3.5 py-2 text-sm text-white font-mono uppercase focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                      Shift Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Morning Shift"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                      Start Time *
                    </label>
                    <input
                      type="time"
                      required
                      value={formData.start_time}
                      onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                      className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3.5 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                      End Time *
                    </label>
                    <input
                      type="time"
                      required
                      value={formData.end_time}
                      onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                      className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3.5 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Live timing preview card */}
                {liveTiming && !liveTiming.error && (
                  <div className="bg-gray-950 border border-gray-800 rounded-lg p-3 text-xs flex items-center justify-between">
                    <span className="text-gray-400">
                      Calculated Duration: <strong className="text-white">{liveTiming.formatted}</strong> ({liveTiming.durationMinutes} min)
                    </span>
                    {liveTiming.isOvernight ? (
                      <span className="inline-flex items-center gap-1 text-indigo-400 font-medium">
                        <Moon size={12} /> Overnight Shift (Crosses midnight)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-400 font-medium">
                        <Sun size={12} /> Daytime Shift
                      </span>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                      Late Grace (mins)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="240"
                      value={formData.late_grace_minutes}
                      onChange={(e) => setFormData({ ...formData, late_grace_minutes: e.target.value })}
                      className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                      Early Departure Grace (mins)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="240"
                      value={formData.early_departure_grace_minutes}
                      onChange={(e) => setFormData({ ...formData, early_departure_grace_minutes: e.target.value })}
                      className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    Effective From Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.effective_from}
                    onChange={(e) => setFormData({ ...formData, effective_from: e.target.value })}
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3.5 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                </div>

                {/* SHIFT BREAKS CONFIGURATION (BUG-SH13) */}
                <div className="space-y-3 pt-2 border-t border-gray-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider">
                        Shift Breaks ({formData.breaks?.length || 0})
                      </label>
                      <p className="text-[11px] text-gray-500">Configure scheduled rest or meal windows (offset from start)</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddBreak}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 transition border border-blue-500/30"
                    >
                      <Plus size={13} /> Add Break
                    </button>
                  </div>

                  {formData.breaks && formData.breaks.length > 0 && (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {formData.breaks.map((b, idx) => (
                        <div key={idx} className="p-3 bg-gray-950 border border-gray-800 rounded-xl space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <input
                              type="text"
                              required
                              placeholder="Break Name"
                              value={b.break_name}
                              onChange={(e) => {
                                const updated = [...formData.breaks];
                                updated[idx].break_name = e.target.value;
                                setFormData({ ...formData, breaks: updated });
                              }}
                              className="w-1/2 bg-gray-900 border border-gray-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                            />
                            <select
                              value={b.break_type}
                              onChange={(e) => {
                                const updated = [...formData.breaks];
                                updated[idx].break_type = e.target.value;
                                setFormData({ ...formData, breaks: updated });
                              }}
                              className="bg-gray-900 border border-gray-800 rounded-lg px-2 py-1.5 text-xs text-white"
                            >
                              <option value="unpaid">Unpaid</option>
                              <option value="paid">Paid</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => {
                                setFormData({
                                  ...formData,
                                  breaks: formData.breaks.filter((_, i) => i !== idx),
                                });
                              }}
                              className="p-1 text-gray-500 hover:text-rose-400 rounded-lg transition"
                              title="Remove break"
                            >
                              <X size={15} />
                            </button>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-[11px] text-gray-400">
                            <div>
                              <span className="block text-[10px] uppercase font-mono">Start (min offset)</span>
                              <input
                                type="number"
                                min="0"
                                required
                                value={b.start_offset_minutes}
                                onChange={(e) => {
                                  const updated = [...formData.breaks];
                                  const val = Number(e.target.value);
                                  updated[idx].start_offset_minutes = val;
                                  updated[idx].duration_minutes = Math.max(0, Number(updated[idx].end_offset_minutes || 0) - val);
                                  setFormData({ ...formData, breaks: updated });
                                }}
                                className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-white"
                              />
                            </div>
                            <div>
                              <span className="block text-[10px] uppercase font-mono">End (min offset)</span>
                              <input
                                type="number"
                                min="1"
                                required
                                value={b.end_offset_minutes}
                                onChange={(e) => {
                                  const updated = [...formData.breaks];
                                  const val = Number(e.target.value);
                                  updated[idx].end_offset_minutes = val;
                                  updated[idx].duration_minutes = Math.max(0, val - Number(updated[idx].start_offset_minutes || 0));
                                  setFormData({ ...formData, breaks: updated });
                                }}
                                className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-white"
                              />
                            </div>
                            <div>
                              <span className="block text-[10px] uppercase font-mono">Duration</span>
                              <span className="block font-mono text-xs text-white py-1">
                                {Math.max(0, Number(b.end_offset_minutes || 0) - Number(b.start_offset_minutes || 0))}m
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="create_is_active"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="rounded bg-gray-950 border-gray-800 text-blue-600 focus:ring-blue-500 h-4 w-4"
                  />
                  <label htmlFor="create_is_active" className="text-sm text-gray-300 font-medium">
                    Shift is active immediately
                  </label>
                </div>

                <div className="pt-4 border-t border-gray-800 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setCreateModalOpen(false)}
                    className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold shadow-lg shadow-blue-500/20 disabled:opacity-50 transition"
                  >
                    {submitting ? "Creating..." : "Create Shift"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* EDIT SHIFT MODAL                                                   */}
        {/* ------------------------------------------------------------------ */}
        {editModalOpen && selectedShift && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto animate-in fade-in duration-200">
              <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-blue-600/20 text-blue-400 rounded-lg">
                    <Edit2 size={18} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Edit Shift Configuration</h3>
                    <p className="text-xs text-gray-400">Current active version: v{selectedShift.version_number || 1}</p>
                  </div>
                </div>
                <button
                  onClick={() => setEditModalOpen(false)}
                  className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
                {/* Versioning policy alert (BUG-SH09) */}
                {hasTimingChanges ? (
                  <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-300 text-xs space-y-1">
                    <div className="font-semibold flex items-center gap-1.5">
                      <Layers size={14} /> Immutable Versioning Will Be Triggered
                    </div>
                    <p className="text-amber-200/80 leading-relaxed">
                      You are changing schedule timings, grace periods, or breaks. A new version <strong>v{(selectedShift.version_number || 1) + 1}</strong> will automatically be created. Version v{selectedShift.version_number || 1} will be closed on the day prior to the effective date. Past roster entries remain permanently untouched.
                    </p>
                  </div>
                ) : (
                  <div className="p-3 bg-gray-950 border border-gray-800 rounded-xl text-gray-400 text-xs flex items-center gap-2">
                    <Shield size={14} className="text-blue-400 shrink-0" />
                    <span>Modifying only shift name or active status updates header records without incrementing version.</span>
                  </div>
                )}

                {formError && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-rose-400 text-xs flex items-center gap-2">
                    <AlertCircle size={16} className="shrink-0" />
                    <span>{formError}</span>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  {/* BUG-SH03: Immutable code is read-only */}
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                      Shift Code
                    </label>
                    <input
                      type="text"
                      disabled
                      readOnly
                      value={formData.code}
                      className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3.5 py-2 text-sm text-gray-400 font-mono uppercase cursor-not-allowed"
                    />
                    <p className="text-[10px] text-gray-500 mt-1">Shift code cannot be changed after creation.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                      Shift Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                      Start Time *
                    </label>
                    <input
                      type="time"
                      required
                      value={formData.start_time}
                      onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                      className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3.5 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                      End Time *
                    </label>
                    <input
                      type="time"
                      required
                      value={formData.end_time}
                      onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                      className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3.5 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                {liveTiming && !liveTiming.error && (
                  <div className="bg-gray-950 border border-gray-800 rounded-lg p-3 text-xs flex items-center justify-between">
                    <span className="text-gray-400">
                      Calculated Duration: <strong className="text-white">{liveTiming.formatted}</strong> ({liveTiming.durationMinutes} min)
                    </span>
                    {liveTiming.isOvernight ? (
                      <span className="inline-flex items-center gap-1 text-indigo-400 font-medium">
                        <Moon size={12} /> Overnight Shift
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-400 font-medium">
                        <Sun size={12} /> Daytime Shift
                      </span>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                      Late Grace (mins)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="240"
                      value={formData.late_grace_minutes}
                      onChange={(e) => setFormData({ ...formData, late_grace_minutes: e.target.value })}
                      className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                      Early Departure Grace (mins)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="240"
                      value={formData.early_departure_grace_minutes}
                      onChange={(e) => setFormData({ ...formData, early_departure_grace_minutes: e.target.value })}
                      className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    Effective From Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.effective_from}
                    onChange={(e) => setFormData({ ...formData, effective_from: e.target.value })}
                    className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3.5 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
                  />
                  {hasTimingChanges && (
                    <p className="text-xs text-gray-500 mt-1">
                      New version will take effect from this date.
                    </p>
                  )}
                </div>

                {/* SHIFT BREAKS CONFIGURATION (BUG-SH13) */}
                <div className="space-y-3 pt-2 border-t border-gray-800">
                  <div className="flex items-center justify-between">
                    <div>
                      <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider">
                        Shift Breaks ({formData.breaks?.length || 0})
                      </label>
                      <p className="text-[11px] text-gray-500">Configure scheduled rest or meal windows (offset from start)</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddBreak}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 transition border border-blue-500/30"
                    >
                      <Plus size={13} /> Add Break
                    </button>
                  </div>

                  {formData.breaks && formData.breaks.length > 0 && (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {formData.breaks.map((b, idx) => (
                        <div key={idx} className="p-3 bg-gray-950 border border-gray-800 rounded-xl space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <input
                              type="text"
                              required
                              placeholder="Break Name"
                              value={b.break_name}
                              onChange={(e) => {
                                const updated = [...formData.breaks];
                                updated[idx].break_name = e.target.value;
                                setFormData({ ...formData, breaks: updated });
                              }}
                              className="w-1/2 bg-gray-900 border border-gray-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                            />
                            <select
                              value={b.break_type}
                              onChange={(e) => {
                                const updated = [...formData.breaks];
                                updated[idx].break_type = e.target.value;
                                setFormData({ ...formData, breaks: updated });
                              }}
                              className="bg-gray-900 border border-gray-800 rounded-lg px-2 py-1.5 text-xs text-white"
                            >
                              <option value="unpaid">Unpaid</option>
                              <option value="paid">Paid</option>
                            </select>
                            <button
                              type="button"
                              onClick={() => {
                                setFormData({
                                  ...formData,
                                  breaks: formData.breaks.filter((_, i) => i !== idx),
                                });
                              }}
                              className="p-1 text-gray-500 hover:text-rose-400 rounded-lg transition"
                              title="Remove break"
                            >
                              <X size={15} />
                            </button>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-[11px] text-gray-400">
                            <div>
                              <span className="block text-[10px] uppercase font-mono">Start (min offset)</span>
                              <input
                                type="number"
                                min="0"
                                required
                                value={b.start_offset_minutes}
                                onChange={(e) => {
                                  const updated = [...formData.breaks];
                                  const val = Number(e.target.value);
                                  updated[idx].start_offset_minutes = val;
                                  updated[idx].duration_minutes = Math.max(0, Number(updated[idx].end_offset_minutes || 0) - val);
                                  setFormData({ ...formData, breaks: updated });
                                }}
                                className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-white"
                              />
                            </div>
                            <div>
                              <span className="block text-[10px] uppercase font-mono">End (min offset)</span>
                              <input
                                type="number"
                                min="1"
                                required
                                value={b.end_offset_minutes}
                                onChange={(e) => {
                                  const updated = [...formData.breaks];
                                  const val = Number(e.target.value);
                                  updated[idx].end_offset_minutes = val;
                                  updated[idx].duration_minutes = Math.max(0, val - Number(updated[idx].start_offset_minutes || 0));
                                  setFormData({ ...formData, breaks: updated });
                                }}
                                className="w-full bg-gray-900 border border-gray-800 rounded px-2 py-1 text-xs text-white"
                              />
                            </div>
                            <div>
                              <span className="block text-[10px] uppercase font-mono">Duration</span>
                              <span className="block font-mono text-xs text-white py-1">
                                {Math.max(0, Number(b.end_offset_minutes || 0) - Number(b.start_offset_minutes || 0))}m
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="edit_is_active"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="rounded bg-gray-950 border-gray-800 text-blue-600 focus:ring-blue-500 h-4 w-4"
                  />
                  <label htmlFor="edit_is_active" className="text-sm text-gray-300 font-medium">
                    Shift is active
                  </label>
                </div>

                <div className="pt-4 border-t border-gray-800 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setEditModalOpen(false)}
                    className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold shadow-lg shadow-blue-500/20 disabled:opacity-50 transition"
                  >
                    {submitting ? "Saving..." : hasTimingChanges ? "Save & Create Version" : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* SHIFT VERSION HISTORY MODAL (BUG-SH10)                             */}
        {/* ------------------------------------------------------------------ */}
        {historyModalOpen && selectedShift && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in duration-200">
              <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-cyan-600/20 text-cyan-400 rounded-lg">
                    <History size={18} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">Shift Version Audit Trail</h3>
                    <p className="text-xs text-gray-400 font-mono">
                      {selectedShift.name} ({selectedShift.code})
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setHistoryModalOpen(false)}
                  className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-6">
                {historyLoading ? (
                  <div className="py-12 flex justify-center">
                    <Loader />
                  </div>
                ) : shiftVersions.length === 0 ? (
                  <p className="text-center text-sm text-gray-500 py-8">No historical versions found.</p>
                ) : (
                  <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
                    <div className="text-xs text-gray-400 flex items-center gap-2">
                      <Shield size={14} className="text-cyan-400" />
                      <span>Every timing modification preserves historical rosters with deterministic attribution.</span>
                    </div>

                    <div className="border border-gray-800 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-gray-950 text-gray-400 uppercase border-b border-gray-800">
                          <tr>
                            <th className="px-4 py-2.5">Version</th>
                            <th className="px-4 py-2.5">Schedule</th>
                            <th className="px-4 py-2.5">Duration</th>
                            <th className="px-4 py-2.5">Graces (L/E)</th>
                            <th className="px-4 py-2.5">Effective Span</th>
                            <th className="px-4 py-2.5">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800/60">
                          {shiftVersions.map((v) => {
                            const isCurrent = v.effective_to === null;
                            // BUG-SH10: Date string safe slice without UTC conversion rollback
                            const effFrom = v.effective_from ? String(v.effective_from).slice(0, 10) : "--";
                            const effTo = v.effective_to ? String(v.effective_to).slice(0, 10) : "Present";
                            const hours = Math.floor((v.duration_minutes || 0) / 60);
                            const mins = (v.duration_minutes || 0) % 60;
                            return (
                              <tr key={v.id} className={isCurrent ? "bg-cyan-950/20" : "hover:bg-gray-800/30"}>
                                <td className="px-4 py-3 font-mono font-bold text-cyan-400">
                                  v{v.version_number}
                                </td>
                                <td className="px-4 py-3 font-mono text-gray-200">
                                  {v.start_time?.slice(0, 5)} - {v.end_time?.slice(0, 5)}
                                  {Boolean(v.is_overnight) && (
                                    <span className="block text-[10px] text-indigo-400 font-sans">Overnight</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-gray-300">
                                  {hours}h {mins > 0 ? `${mins}m` : ""}
                                </td>
                                <td className="px-4 py-3 text-gray-400 font-mono">
                                  {v.late_grace_minutes ?? 15}m / {v.early_departure_grace_minutes ?? 15}m
                                </td>
                                <td className="px-4 py-3 font-mono text-gray-400">
                                  {effFrom} → {effTo}
                                </td>
                                <td className="px-4 py-3">
                                  {isCurrent ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                      Active
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-800 text-gray-400">
                                      Archived
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => setHistoryModalOpen(false)}
                    className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium transition"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* DELETE CONFIRMATION DIALOG                                         */}
        {/* ------------------------------------------------------------------ */}
        {deleteConfirmOpen && selectedShift && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
              <div className="flex items-center gap-3 text-rose-400">
                <div className="p-2.5 bg-rose-500/10 rounded-xl border border-rose-500/20">
                  <AlertCircle size={22} />
                </div>
                <h3 className="text-lg font-bold text-white">Delete Shift Configuration?</h3>
              </div>

              <p className="text-sm text-gray-300 leading-relaxed">
                Are you sure you want to permanently delete shift{" "}
                <strong className="text-white">'{selectedShift.name}'</strong> ({selectedShift.code})?
              </p>

              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-xs text-amber-300">
                <strong>Safety Check:</strong> If this shift has existing roster entries or employee assignments, the deletion will be safely rejected to prevent orphaned records. You may deactivate the shift instead.
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(false)}
                  className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleConfirmDelete}
                  className="px-5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold shadow-lg shadow-rose-600/20 disabled:opacity-50 transition"
                >
                  {submitting ? "Deleting..." : "Confirm Delete"}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    </Layout>
  );
}
