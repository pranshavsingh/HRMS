import { useEffect, useState } from "react";
import {
  Activity,
  ArrowUpDown,
  Calendar,
  Download,
  Filter,
  RefreshCw,
  Search,
  Shield,
  Eye,
  X,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import Loader from "../components/common/Loader";
import API from "../api/axios";
import { usePopup } from "../context/PopupContext";
import { useRealtime } from "../context/RealtimeContext";

const severityClasses = {
  INFO: "bg-blue-50 text-blue-700 ring-blue-200",
  WARNING: "bg-amber-50 text-amber-700 ring-amber-200",
  CRITICAL: "bg-rose-50 text-rose-700 ring-rose-200",
};

const formatDateTime = (value) => {
  if (!value) return "--";
  const dateStr = String(value).replace(" ", "T");
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
};

const formatDetailKey = (key) => {
  if (key === null || key === undefined) return "";
  return String(key)
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const renderFormattedValue = (val, depth = 0) => {
  if (val === null || val === undefined) {
    return <span className="text-slate-400 italic">N/A</span>;
  }
  if (typeof val === "boolean") {
    return (
      <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-semibold ${val ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
        {val ? "Yes" : "No"}
      </span>
    );
  }
  if (typeof val === "number") {
    return <span className="font-mono text-slate-800">{val}</span>;
  }
  if (typeof val === "string") {
    const trimmed = val.trim();
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
      try {
        const parsed = JSON.parse(val);
        return renderFormattedValue(parsed, depth + 1);
      } catch {
        // Raw string
      }
    }
    return <span className="text-slate-800 break-words">{val}</span>;
  }
  if (Array.isArray(val)) {
    if (val.length === 0) return <span className="text-slate-400 italic">Empty list</span>;
    const allPrimitives = val.every(v => v === null || typeof v !== "object");
    if (allPrimitives) {
      return <span className="text-slate-800 font-mono text-xs">{val.map(v => String(v ?? "null")).join(", ")}</span>;
    }
    return (
      <div className="space-y-1.5 pl-2 border-l-2 border-slate-200 mt-1">
        {val.map((item, idx) => (
          <div key={idx} className="text-xs">
            <span className="text-slate-400 font-mono mr-1">#{idx + 1}</span>
            {renderFormattedValue(item, depth + 1)}
          </div>
        ))}
      </div>
    );
  }
  if (typeof val === "object") {
    if (depth > 5) return <span className="text-slate-500 font-mono text-xs">{JSON.stringify(val)}</span>;
    if ("old" in val && "new" in val) {
      return (
        <span className="inline-flex items-center gap-1.5 flex-wrap justify-end text-xs">
          <span className="line-through text-slate-400">{renderFormattedValue(val.old, depth + 1)}</span>
          <span className="text-slate-400">➔</span>
          <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-semibold">{renderFormattedValue(val.new, depth + 1)}</span>
        </span>
      );
    }
    return (
      <div className="space-y-1 pl-2 border-l-2 border-slate-200 text-xs mt-1 w-full">
        {Object.entries(val).map(([subKey, subVal]) => (
          <div key={subKey} className="flex justify-between gap-2 border-b border-slate-100 py-0.5 last:border-0">
            <span className="font-semibold text-slate-500">{formatDetailKey(subKey)}:</span>
            <span className="text-slate-800 text-right">{renderFormattedValue(subVal, depth + 1)}</span>
          </div>
        ))}
      </div>
    );
  }
  return <span className="text-slate-800">{String(val)}</span>;
};

// Safe CSV sanitizer protecting against formula injection (=, +, -, @, \t, \r)
const sanitizeCsvValue = (val) => {
  if (val === null || val === undefined) return '""';
  let str = typeof val === "object" ? JSON.stringify(val) : String(val);
  const trimmed = str.trimStart();
  if (trimmed.length > 0 && ["=", "+", "-", "@", "\t", "\r"].includes(trimmed[0])) {
    str = "'" + str;
  }
  return `"${str.replace(/"/g, '""')}"`;
};

export default function AuditLogs() {
  const { showPopup } = usePopup();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Data States
  const [logs, setLogs] = useState([]);
  const [availableActions, setAvailableActions] = useState([]);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 50,
    pages: 1
  });

  // Filter States
  const [search, setSearch] = useState("");
  const [actionType, setActionType] = useState("");
  const [severity, setSeverity] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sort, setSort] = useState("desc");
  const [page, setPage] = useState(1);

  // Selected Log detail popup state
  const [selectedLog, setSelectedLog] = useState(null);

  // BUG-AL03 & BUG-AL08: Explicit parameter-driven fetch
  const fetchLogs = async (targetPage = page, showLoader = true, overrides = {}) => {
    if (showLoader) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const activeSearch = overrides.search !== undefined ? overrides.search : search;
      const activeAction = overrides.actionType !== undefined ? overrides.actionType : actionType;
      const activeSeverity = overrides.severity !== undefined ? overrides.severity : severity;
      const activeStartDate = overrides.startDate !== undefined ? overrides.startDate : startDate;
      const activeEndDate = overrides.endDate !== undefined ? overrides.endDate : endDate;
      const activeSort = overrides.sort !== undefined ? overrides.sort : sort;

      const params = {
        limit: 50,
        page: targetPage,
        sort: activeSort,
      };

      if (activeSearch && activeSearch.trim()) params.search = activeSearch.trim();
      if (activeAction && activeAction.trim()) params.action = activeAction.trim();
      if (activeSeverity && activeSeverity.trim()) params.severity = activeSeverity.trim();
      if (activeStartDate && activeStartDate.trim()) params.start_date = activeStartDate.trim();
      if (activeEndDate && activeEndDate.trim()) params.end_date = activeEndDate.trim();

      const res = await API.get("/auth/audit-logs/", { params });
      setLogs(Array.isArray(res.data.logs) ? res.data.logs : []);
      setAvailableActions(Array.isArray(res.data.availableActions) ? res.data.availableActions : []);
      if (res.data.pagination) {
        setPagination(res.data.pagination);
      }
    } catch (err) {
      console.error(err);
      showPopup("Unable to load system audit logs", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLogs(1, true);
  }, []);

  // BUG-AL07: Bounded realtime updates (capped to limit of 50, pagination recalculated)
  useRealtime("new_audit_log", (newLog) => {
    if (!newLog || !newLog.id) return;
    const hasActiveFilters = Boolean(
      search.trim() || actionType.trim() || severity.trim() || startDate.trim() || endDate.trim()
    );
    if (page > 1 || hasActiveFilters || sort === "asc") {
      fetchLogs(page, false);
    } else {
      setLogs((prev) => {
        if (prev.some((l) => l.id === newLog.id)) return prev;
        return [newLog, ...prev].slice(0, 50);
      });
      setPagination((prev) => {
        const newTotal = prev.total + 1;
        const limit = prev.limit || 50;
        return {
          ...prev,
          total: newTotal,
          pages: Math.ceil(newTotal / limit) || 1,
        };
      });
    }
  });

  // BUG-AL03: Explicit page 1 on search submit
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchLogs(1, true);
  };

  // BUG-AL04: Clean atomic filter reset without timing delay
  const handleResetFilters = () => {
    setSearch("");
    setActionType("");
    setSeverity("");
    setStartDate("");
    setEndDate("");
    setSort("desc");
    setPage(1);
    fetchLogs(1, true, {
      search: "",
      actionType: "",
      severity: "",
      startDate: "",
      endDate: "",
      sort: "desc",
    });
  };

  // BUG-AL06: Complete and Safe CSV Export
  const handleExportCSV = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const exportLimit = Math.min(Math.max(pagination.total || 50, 50), 5000);
      const params = {
        limit: exportLimit,
        page: 1,
        sort,
      };
      if (search.trim()) params.search = search.trim();
      if (actionType.trim()) params.action = actionType.trim();
      if (severity.trim()) params.severity = severity.trim();
      if (startDate.trim()) params.start_date = startDate.trim();
      if (endDate.trim()) params.end_date = endDate.trim();

      const res = await API.get("/auth/audit-logs/", { params });
      const records = Array.isArray(res.data.logs) ? res.data.logs : logs;

      if (records.length === 0) {
        showPopup("No audit logs to export", "warning");
        return;
      }

      if (pagination.total > 5000) {
        showPopup("Export contains the maximum allowed limit of 5,000 records.", "warning");
      }

      const headers = ["Timestamp", "Severity", "Username", "Action", "Target", "IP Address", "Details"];
      const csvRows = [
        headers.map((h) => `"${h}"`).join(","),
        ...records.map((log) =>
          [
            log.created_at,
            log.severity,
            log.username,
            log.action,
            log.target_display ? log.target_display : log.target_id || "",
            log.ip_address || "",
            log.details,
          ]
            .map(sanitizeCsvValue)
            .join(",")
        ),
      ];

      const blob = new Blob(["\uFEFF" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `hrms_audit_logs_${new Date().toISOString().split("T")[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showPopup(`Exported ${records.length} audit logs successfully`, "success");
    } catch (err) {
      console.error("CSV Export failed", err);
      showPopup("Failed to export audit logs", "error");
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <Loader />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Banner Section */}
        <section className="relative overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#1e1b4b_0%,#311042_50%,#450a0a_100%)] px-8 py-8 text-white shadow-xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.12),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(239,68,68,0.15),_transparent_30%)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-red-200">
                <Shield size={14} />
                Compliance Desk
              </p>
              <h1 className="text-3xl font-bold tracking-tight">
                System Audit & Security Logs
              </h1>
              <p className="mt-3 text-sm text-slate-200">
                Track administrative updates, document deletions, role modifications, and login events. This security record is append-only and cannot be altered.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
              <HeroTile icon={<Activity size={18} />} label="Total Records" value={pagination.total} />
              <button
                onClick={handleExportCSV}
                disabled={exporting}
                className="flex items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20 disabled:opacity-50"
              >
                <Download size={18} className={exporting ? "animate-bounce" : ""} />
                {exporting ? "Exporting..." : "Export CSV"}
              </button>
            </div>
          </div>
        </section>

        {/* Filters Card */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <form onSubmit={handleSearchSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">

              {/* Search Field */}
              <label className="block lg:col-span-2">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Search Log</span>
                <div className="relative mt-2">
                  <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search username, action, target..."
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-900 outline-none transition focus:border-purple-400 focus:bg-white"
                  />
                </div>
              </label>

              {/* Action Filter */}
              <label className="block">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Action Type</span>
                <select
                  value={actionType}
                  onChange={(e) => {
                    const val = e.target.value;
                    setActionType(val);
                    setPage(1);
                    fetchLogs(1, true, { actionType: val });
                  }}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-purple-400 focus:bg-white"
                >
                  <option value="">All Actions</option>
                  {availableActions.map((action) => (
                    <option key={action} value={action}>
                      {action}
                    </option>
                  ))}
                </select>
              </label>

              {/* BUG-AL08: Severity Filter */}
              <label className="block">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Severity</span>
                <select
                  value={severity}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSeverity(val);
                    setPage(1);
                    fetchLogs(1, true, { severity: val });
                  }}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-purple-400 focus:bg-white"
                >
                  <option value="">All Severities</option>
                  <option value="INFO">INFO</option>
                  <option value="WARNING">WARNING</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>
              </label>

              {/* Sort Order */}
              <label className="block">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Sort Timestamp</span>
                <select
                  value={sort}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSort(val);
                    setPage(1);
                    fetchLogs(1, true, { sort: val });
                  }}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-purple-400 focus:bg-white"
                >
                  <option value="desc">Newest First</option>
                  <option value="asc">Oldest First</option>
                </select>
              </label>

              {/* Action Buttons */}
              <div className="flex items-end gap-2 lg:col-span-1">
                <button
                  type="submit"
                  className="flex-1 rounded-2xl bg-purple-950 hover:bg-purple-900 text-white font-semibold text-sm py-3 transition shadow-sm"
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="rounded-2xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold text-sm px-4 py-3 transition"
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Date Filters Row */}
            <div className="grid gap-4 sm:grid-cols-2 max-w-xl">
              <label className="block">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Start Date</span>
                <div className="relative mt-2">
                  <Calendar size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-900 outline-none transition focus:border-purple-400 focus:bg-white"
                  />
                </div>
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">End Date</span>
                <div className="relative mt-2">
                  <Calendar size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-900 outline-none transition focus:border-purple-400 focus:bg-white"
                  />
                </div>
              </label>
            </div>
          </form>
        </section>

        {/* Audit Logs Table */}
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Audit Directory</h2>
              <p className="mt-1 text-sm text-slate-500">
                Displaying system logs corresponding to search parameters.
              </p>
            </div>
            <button
              onClick={() => fetchLogs(false)}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-semibold">Timestamp</th>
                  <th className="px-6 py-4 font-semibold">Severity</th>
                  <th className="px-6 py-4 font-semibold">User</th>
                  <th className="px-6 py-4 font-semibold">Action</th>
                  <th className="px-6 py-4 font-semibold">Target</th>
                  <th className="px-6 py-4 font-semibold">IP Address</th>
                  <th className="px-6 py-4 font-semibold text-right">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-6 py-12 text-center text-slate-500 font-medium">
                      No matching audit log records found.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="border-t border-slate-100 transition hover:bg-slate-50/50">
                      <td className="px-6 py-4 whitespace-nowrap text-slate-600">
                        {formatDateTime(log.created_at)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${severityClasses[log.severity] || "bg-slate-100 text-slate-600"}`}>
                          {log.severity}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-900">
                        {log.username}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap font-semibold text-slate-700 uppercase tracking-tight">
                        {log.action}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-slate-500">
                        {log.target_display ? log.target_display : (log.target_id || "--")}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-slate-500">
                        {log.ip_address || "Local"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedLog(log)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                        >
                          <Eye size={14} />
                          Details
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {pagination.pages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
              <span className="text-xs font-semibold text-slate-500">
                Page {pagination.page} of {pagination.pages}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => {
                    const prevP = Math.max(1, page - 1);
                    setPage(prevP);
                    fetchLogs(prevP, true);
                  }}
                  className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= pagination.pages}
                  onClick={() => {
                    const nextP = Math.min(pagination.pages, page + 1);
                    setPage(nextP);
                    fetchLogs(nextP, true);
                  }}
                  className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Expanded Details Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <div className="flex items-center gap-2">
                <Shield className="text-purple-950" size={20} />
                <h2 className="text-lg font-semibold text-slate-900">Audit Entry details</h2>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1 rounded-lg hover:bg-slate-100 transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm border-b border-slate-50 pb-4">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Performed By</span>
                  <p className="font-semibold text-slate-800 mt-1">{selectedLog.username}</p>
                </div>
                <div>
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Timestamp</span>
                  <p className="font-semibold text-slate-800 mt-1">{formatDateTime(selectedLog.created_at)}</p>
                </div>
                <div>
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Action</span>
                  <p className="font-bold text-slate-800 uppercase mt-1 tracking-tight">{selectedLog.action}</p>
                </div>
                <div>
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-400">IP Address</span>
                  <p className="font-semibold text-slate-800 mt-1">{selectedLog.ip_address || "Local"}</p>
                </div>
              </div>

              <div>
                <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Action Metadata (Details)</span>
                <div className="mt-2 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm max-h-72 overflow-auto">
                  {selectedLog.details !== null && selectedLog.details !== undefined ? (
                    typeof selectedLog.details === "object" && !Array.isArray(selectedLog.details) ? (
                      <div className="space-y-3">
                        {Object.entries(selectedLog.details).map(([key, val]) => (
                          <div key={key} className="flex flex-col sm:flex-row sm:justify-between border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                            <span className="font-semibold text-slate-600 text-xs uppercase tracking-wider">{formatDetailKey(key)}</span>
                            <div className="text-slate-800 font-medium text-right sm:max-w-xs break-all mt-1 sm:mt-0">{renderFormattedValue(val)}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      renderFormattedValue(selectedLog.details)
                    )
                  ) : (
                    <span className="text-slate-400 italic">No additional details recorded.</span>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedLog(null)}
                className="rounded-2xl bg-slate-900 hover:bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white transition"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function HeroTile({ icon, label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur-sm min-w-[120px]">
      <div className="flex items-center gap-2 text-red-200">
        {icon}
        <span className="text-xs uppercase tracking-wide font-medium">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}
