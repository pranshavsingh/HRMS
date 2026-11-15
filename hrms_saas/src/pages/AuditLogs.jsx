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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
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
  return key
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const formatDetailValue = (val) => {
  if (val === null || val === undefined) return "N/A";
  if (typeof val === "object" && val !== null && !Array.isArray(val)) {
    if ("old" in val && "new" in val) {
      const oldStr = formatDetailValue(val.old);
      const newStr = formatDetailValue(val.new);
      return (
        <span className="inline-flex items-center gap-1.5 flex-wrap justify-end text-sm">
          <span className="line-through text-slate-400">{oldStr}</span>
          <span className="text-slate-400">➔</span>
          <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-semibold text-xs">{newStr}</span>
        </span>
      );
    }
  }
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (Array.isArray(val)) {
    return val.map(v => {
      if (typeof v === "object" && v !== null) {
        if ("latitude" in v && "longitude" in v) {
          const pri = v.is_primary ? " (Primary)" : "";
          return `Lat: ${v.latitude}, Lng: ${v.longitude}, Rad: ${v.allowed_radius}m${pri}`;
        }
        return JSON.stringify(v);
      }
      return String(v);
    }).join("; ");
  }
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
};

export default function AuditLogs() {
  const { showPopup } = usePopup();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
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
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sort, setSort] = useState("desc");
  const [page, setPage] = useState(1);

  // Selected Log detail popup state
  const [selectedLog, setSelectedLog] = useState(null);

  const fetchLogs = async (showLoader = true) => {
    if (showLoader) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const params = {
        limit: 50,
        page,
        search,
        sort,
        action: actionType,
        start_date: startDate,
        end_date: endDate
      };

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
    fetchLogs(true);
  }, [page, sort]);

  useRealtime("new_audit_log", (newLog) => {
    if (page > 1 || search.trim() || actionType || startDate || endDate || sort === "asc") {
      fetchLogs(false);
    } else {
      setLogs((prev) => {
        if (prev.some(l => l.id === newLog.id)) return prev;
        return [newLog, ...prev];
      });
      setPagination(prev => ({ ...prev, total: prev.total + 1 }));
    }
  });

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchLogs(true);
  };

  const handleResetFilters = () => {
    setSearch("");
    setActionType("");
    setStartDate("");
    setEndDate("");
    setSort("desc");
    setPage(1);
    // Directly fetch state with default params
    setTimeout(() => {
      fetchLogs(true);
    }, 50);
  };

  const handleExportCSV = () => {
    if (logs.length === 0) {
      showPopup("No audit logs to export", "warning");
      return;
    }
    const headers = ["Timestamp", "Severity", "Username", "Action", "Target", "IP Address", "Details"];
    const csvRows = [
      headers.join(","),
      ...logs.map(log => [
        log.created_at,
        log.severity,
        log.username,
        log.action,
        log.target_display ? log.target_display : (log.target_id || ""),
        log.ip_address || "",
        JSON.stringify(log.details || "")
      ].map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))
    ];
    
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `hrms_audit_logs_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
                className="flex items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
              >
                <Download size={18} />
                Export CSV
              </button>
            </div>
          </div>
        </section>

        {/* Filters Card */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <form onSubmit={handleSearchSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              
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
                  onChange={(e) => setActionType(e.target.value)}
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

              {/* Sort Order */}
              <label className="block">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Sort Timestamp</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
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
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="rounded-xl border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= pagination.pages}
                  onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
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
                <div className="mt-2 rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm max-h-56 overflow-auto">
                  {selectedLog.details && typeof selectedLog.details === "object" ? (
                    <div className="space-y-3">
                      {Object.entries(selectedLog.details).map(([key, val]) => (
                        <div key={key} className="flex flex-col sm:flex-row sm:justify-between border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                          <span className="font-semibold text-slate-600 text-xs uppercase tracking-wider">{formatDetailKey(key)}</span>
                          <span className="text-slate-800 font-medium text-right sm:max-w-xs break-all mt-1 sm:mt-0">{formatDetailValue(val)}</span>
                        </div>
                      ))}
                    </div>
                  ) : selectedLog.details ? (
                    <p className="text-slate-800 font-medium">{String(selectedLog.details)}</p>
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
