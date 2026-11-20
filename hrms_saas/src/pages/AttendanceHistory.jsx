import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Filter,
  MapPinned,
  RefreshCw,
  Timer,
  XCircle,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import Loader from "../components/common/Loader";
import Pagination from "../components/common/Pagination";
import { usePagination } from "../hooks/usePagination";
import API from "../api/axios";
import { usePopup } from "../context/PopupContext";
import { useRealtime } from "../context/RealtimeContext";

const statusClasses = {
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  rejected: "bg-rose-50 text-rose-700 ring-rose-200",
};

const formatDate = (value) => {
  if (!value) return "--";

  if (typeof value === "string") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [, y, m, d] = match;
      const date = new Date(Number(y), Number(m) - 1, Number(d), 12, 0, 0);
      return new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Kolkata",
      }).format(date);
    }
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(date);
};

const formatTime = (value) => {
  if (!value || value === "--" || value === "Pending") return value || "--";

  if (typeof value === "string" && /^\d{1,2}:\d{2}(:\d{2})?$/.test(value.trim())) {
    const [h, m] = value.trim().split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 || 12;
    return `${String(h12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(date);
};

const formatHours = (value) => `${Number(value || 0).toFixed(2)} hrs`;

const getReviewLabel = (item) => {
  const inStatus = item.punch_in_status;
  const outStatus = item.punch_out_status;

  if (inStatus === "pending" && outStatus === "pending") {
    return "Punch In & Out Pending";
  }

  if (inStatus === "pending") {
    return "Punch In Pending";
  }

  if (outStatus === "pending") {
    return "Punch Out Pending";
  }

  if (inStatus === "rejected" && outStatus === "rejected") {
    return "Punch In & Out Rejected";
  }

  if (inStatus === "rejected") {
    return "Punch In Rejected";
  }

  if (outStatus === "rejected") {
    return "Punch Out Rejected";
  }

  return "All Clear";
};

export default function AttendanceHistory() {
  const { showPopup } = usePopup();
  const today = new Date().toISOString().split("T")[0];
  const monthAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];
  const initialFilters = useMemo(
    () => ({
      startDate: monthAgo,
      endDate: today,
    }),
    [monthAgo, today]
  );

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState(initialFilters);
  const pagination = usePagination(records);

  const fetchHistory = async (activeFilters, showLoader = true) => {
    if (showLoader) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const params = {
        limit: 500,
      };

      if (activeFilters.startDate && activeFilters.endDate) {
        params.start_date = activeFilters.startDate;
        params.end_date = activeFilters.endDate;
      }

      const res = await API.get("/attendance/history/", { params });
      setRecords(Array.isArray(res.data) ? res.data : (res.data?.data || res.data?.records || []));
    } catch (err) {
      console.error("Attendance history error:", err.response?.data || err.message);
      showPopup("Unable to load attendance history", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHistory(initialFilters);
  }, [initialFilters]);

  useRealtime("attendance_update", () => fetchHistory(filters, false));
  useRealtime("leave_update", () => fetchHistory(filters, false));

  const summary = useMemo(() => {
    const approved = records.filter((item) => item.status === "approved").length;
    const pending = records.filter((item) => item.status === "pending").length;
    const rejected = records.filter((item) => item.status === "rejected").length;
    const totalHours = records.reduce(
      (sum, item) => sum + Number(item.work_hours || 0),
      0
    );

    return {
      totalDays: records.length,
      approved,
      pending,
      rejected,
      totalHours,
    };
  }, [records]);

  const handleFilterChange = (key, value) => {
    setFilters((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleApplyFilters = () => {
    fetchHistory(filters, false);
  };

  const handleResetFilters = () => {
    const nextFilters = {
      startDate: monthAgo,
      endDate: today,
    };

    setFilters(nextFilters);
    fetchHistory(nextFilters, false);
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
        <section className="relative overflow-hidden rounded-3xl bg-slate-900 px-8 py-8 text-white shadow-xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(56,189,248,0.35),_transparent_35%),radial-gradient(circle_at_bottom_left,_rgba(16,185,129,0.25),_transparent_30%)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-sky-100">
                <CalendarDays size={14} />
                Attendance History
              </p>
              <h1 className="text-3xl font-bold tracking-tight">
                Review your attendance timeline with clarity
              </h1>
              <p className="mt-3 text-sm text-slate-300">
                Track punch in and punch out activity, review approval status,
                and understand your working hours across a selected date range.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryCard
                icon={<Clock3 size={18} />}
                label="Working Days"
                value={summary.totalDays}
              />
              <SummaryCard
                icon={<Timer size={18} />}
                label="Total Hours"
                value={summary.totalHours.toFixed(2)}
              />
              <SummaryCard
                icon={<CheckCircle2 size={18} />}
                label="Approved"
                value={summary.approved}
              />
              <SummaryCard
                icon={<MapPinned size={18} />}
                label="Pending"
                value={summary.pending}
              />
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Filters</h2>
              <p className="text-sm text-slate-500">
                Narrow the records by date range and refresh whenever needed.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleResetFilters}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
                Reset
              </button>
              <button
                onClick={handleApplyFilters}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                <Filter size={16} />
                Apply Filters
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Start Date
              </span>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => handleFilterChange("startDate", e.target.value)}
                className="mt-2 w-full bg-transparent text-sm font-medium text-slate-900 outline-none"
              />
            </label>

            <label className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                End Date
              </span>
              <input
                type="date"
                value={filters.endDate}
                max={today}
                onChange={(e) => handleFilterChange("endDate", e.target.value)}
                className="mt-2 w-full bg-transparent text-sm font-medium text-slate-900 outline-none"
              />
            </label>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Rejected Days
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {summary.rejected}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Current Range
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {formatDate(filters.startDate)} to {formatDate(filters.endDate)}
              </p>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Attendance Records
              </h2>
              <p className="text-sm text-slate-500">
                {records.length} record{records.length === 1 ? "" : "s"} found
              </p>
            </div>

            {refreshing && (
              <span className="inline-flex items-center gap-2 text-sm text-slate-500">
                <RefreshCw size={16} className="animate-spin" />
                Updating...
              </span>
            )}
          </div>

          {records.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <CalendarDays size={28} />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">
                No attendance records found
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                Try a different date range to see older attendance entries.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Date</th>
                    <th className="px-6 py-4 font-semibold">Punch In</th>
                    <th className="px-6 py-4 font-semibold">Punch Out</th>
                    <th className="px-6 py-4 font-semibold">Work Hours</th>
                    <th className="px-6 py-4 font-semibold">Review</th>
                    <th className="px-6 py-4 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pagination.pageItems.map((item, index) => (
                    <tr
                      key={`${item.date}-${index}`}
                      className="border-t border-slate-100 transition hover:bg-slate-50/80"
                    >
                      <td className="px-6 py-4 font-medium text-slate-900">
                        {formatDate(item.date)}
                      </td>
                      <td className="px-6 py-4 text-slate-700">
                        {formatTime(item.punch_in)}
                      </td>
                      <td className="px-6 py-4 text-slate-700">
                        {item.punch_out ? (
                          formatTime(item.punch_out)
                        ) : (
                          <span className="font-medium text-amber-600">
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-700">
                        {formatHours(item.work_hours)}
                      </td>
                      <td className="px-6 py-4 text-slate-700">
                        {getReviewLabel(item)}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold capitalize ring-1 ${
                            statusClasses[item.status] || "bg-slate-100 text-slate-700 ring-slate-200"
                          }`}
                        >
                          {item.status === "approved" && <CheckCircle2 size={14} />}
                          {item.status === "pending" && <Clock3 size={14} />}
                          {item.status === "rejected" && <XCircle size={14} />}
                          {item.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination {...pagination} itemLabel="records" />
        </section>
      </div>
    </Layout>
  );
}

function SummaryCard({ icon, label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-sky-100">
        {icon}
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}
