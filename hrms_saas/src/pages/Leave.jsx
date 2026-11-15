import { useEffect, useMemo, useState } from "react";
import {
  CalendarCheck2,
  Clock3,
  FileText,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import Loader from "../components/common/Loader";
import API from "../api/axios";
import { usePopup } from "../context/PopupContext";
import { useRealtime } from "../context/RealtimeContext";

const leaveTypes = [
  { value: "casual", label: "Casual Leave" },
  { value: "sick", label: "Sick Leave" },
  { value: "paid", label: "Paid Leave" },
];

const statusStyles = {
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  rejected: "bg-rose-50 text-rose-700 ring-rose-200",
};

const formatDate = (value) => {
  if (!value) return "--";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
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
  }).format(date);
};

const dayDifference = (fromDate, toDate) => {
  if (!fromDate || !toDate) return 0;

  const start = new Date(fromDate);
  const end = new Date(toDate);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 0;
  }

  return Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
};

export default function Leave() {
  const { showPopup } = usePopup();
  const today = new Date().toISOString().split("T")[0];

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [leaves, setLeaves] = useState([]);
  const [leaveSummary, setLeaveSummary] = useState({
    leave_allotted: 0,
    leaves_taken: 0,
    leave_balance: 0,
    total_requests: 0,
    approved_requests: 0,
    pending_requests: 0,
    rejected_requests: 0,
  });
  const [form, setForm] = useState({
    leave_type: "casual",
    from_date: today,
    to_date: today,
    reason: "",
  });

  const fetchLeaves = async (showLoader = true) => {
    if (showLoader) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const res = await API.get("/leave/my/");
      const records = Array.isArray(res.data)
        ? res.data
        : Array.isArray(res.data?.records)
          ? res.data.records
          : [];
      const summary = res.data?.summary || null;

      setLeaves(records);
      setLeaveSummary({
        leave_allotted: Number(summary?.leave_allotted || 0),
        leaves_taken: Number(summary?.leaves_taken || 0),
        leave_balance: Number(summary?.leave_balance || 0),
        total_requests: Number(summary?.total_requests || records.length),
        approved_requests: Number(
          summary?.approved_requests || records.filter((item) => item.status === "approved").length
        ),
        pending_requests: Number(
          summary?.pending_requests || records.filter((item) => item.status === "pending").length
        ),
        rejected_requests: Number(
          summary?.rejected_requests || records.filter((item) => item.status === "rejected").length
        ),
      });
    } catch (err) {
      console.error("Leave fetch error:", err.response?.data || err.message);
      showPopup("Unable to load leave records", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLeaves();
  }, []);

  useRealtime("leave_update", () => fetchLeaves(false));

  const summary = useMemo(() => {
    const approved = leaves.filter((item) => item.status === "approved").length;
    const pending = leaves.filter((item) => item.status === "pending").length;
    const rejected = leaves.filter((item) => item.status === "rejected").length;
    const totalDays = leaves.reduce(
      (sum, item) => sum + dayDifference(item.from, item.to),
      0
    );

    return {
      totalRequests: leaveSummary.total_requests || leaves.length,
      approved: leaveSummary.approved_requests || approved,
      pending: leaveSummary.pending_requests || pending,
      rejected: leaveSummary.rejected_requests || rejected,
      totalDays,
      leaveAllotted: leaveSummary.leave_allotted,
      leavesTaken: leaveSummary.leaves_taken,
      leaveBalance: leaveSummary.leave_balance,
    };
  }, [leaveSummary, leaves]);

  const handleChange = (key, value) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const resetForm = () => {
    setForm({
      leave_type: "casual",
      from_date: today,
      to_date: today,
      reason: "",
    });
  };

  const hasOverlap = useMemo(() => {
    if (!form.from_date || !form.to_date) return false;
    return leaves.some((r) => {
      if (r.status !== "approved") return false;
      return r.from <= form.to_date && r.to >= form.from_date;
    });
  }, [form.from_date, form.to_date, leaves]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (hasOverlap) {
      showPopup("Selected dates overlap with an already approved leave request", "warning");
      return;
    }

    if (!form.reason.trim()) {
      showPopup("Please enter a reason for leave", "warning");
      return;
    }

    if (form.to_date < form.from_date) {
      showPopup("To date cannot be earlier than from date", "warning");
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        leave_type: form.leave_type,
        from_date: form.from_date,
        to_date: form.to_date,
        reason: form.reason.trim(),
      };

      const res = await API.post("/leave/apply/", payload);
      showPopup(res.data.message || "Leave applied successfully", "success");
      resetForm();
      fetchLeaves(false);
    } catch (err) {
      console.error("Leave apply error:", err.response?.data || err.message);

      const apiError =
        err.response?.data?.error ||
        Object.values(err.response?.data || {})[0];

      showPopup(apiError || "Unable to apply leave", "error");
    } finally {
      setSubmitting(false);
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
        <section className="relative overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#0f172a_0%,#1e293b_45%,#14532d_100%)] px-8 py-8 text-white shadow-xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.16),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(134,239,172,0.18),_transparent_30%)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-emerald-100">
                <CalendarCheck2 size={14} />
                Leave Management
              </p>
              <h1 className="text-3xl font-bold tracking-tight">
                Plan and track leave requests from one workspace
              </h1>
              <p className="mt-3 text-sm text-slate-200">
                Submit leave requests, monitor approvals, and keep your leave
                timeline organized with a cleaner employee experience.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MetricCard
                icon={<FileText size={18} />}
                label="Allotted"
                value={summary.leaveAllotted}
              />
              <MetricCard
                icon={<ShieldCheck size={18} />}
                label="Used"
                value={summary.leavesTaken}
              />
              <MetricCard
                icon={<Clock3 size={18} />}
                label="Balance"
                value={summary.leaveBalance}
              />
              <MetricCard
                icon={<CalendarCheck2 size={18} />}
                label="Pending"
                value={summary.pending}
              />
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.05fr_1.4fr]">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">
                  Apply for Leave
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Create a leave request with dates and a short explanation.
                </p>
              </div>

              <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
                <Plus size={20} />
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">
                  Leave Type
                </span>
                <select
                  value={form.leave_type}
                  onChange={(e) => handleChange("leave_type", e.target.value)}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white"
                >
                  {leaveTypes.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium text-slate-700">
                    From Date
                  </span>
                  <input
                    type="date"
                    value={form.from_date}
                    min={today}
                    onChange={(e) => handleChange("from_date", e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white"
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium text-slate-700">
                    To Date
                  </span>
                  <input
                    type="date"
                    value={form.to_date}
                    min={form.from_date}
                    onChange={(e) => handleChange("to_date", e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white"
                  />
                </label>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Requested Duration
                </p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {dayDifference(form.from_date, form.to_date)} day
                  {dayDifference(form.from_date, form.to_date) === 1 ? "" : "s"}
                </p>
              </div>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">
                  Reason
                </span>
                <textarea
                  rows="5"
                  value={form.reason}
                  onChange={(e) => handleChange("reason", e.target.value)}
                  placeholder="Write a short and clear reason for your leave request"
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-400 focus:bg-white"
                />
              </label>

              {hasOverlap && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 flex items-center gap-2">
                  <XCircle size={16} className="text-rose-500 shrink-0" />
                  <span>Selected dates overlap with an already approved leave request. Please choose different dates.</span>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={submitting || hasOverlap}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <Send size={16} />
                  {submitting ? "Submitting..." : "Submit Request"}
                </button>

                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  Reset Form
                </button>
              </div>
            </form>
          </section>

          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">
                  My Leave Requests
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  View the latest approval status of your submitted leave.
                </p>
              </div>

              <button
                onClick={() => fetchLeaves(false)}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
                Refresh
              </button>
            </div>

            {leaves.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                  <CalendarCheck2 size={28} />
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-900">
                  No leave requests yet
                </h3>
                <p className="mt-2 text-sm text-slate-500">
                  Your leave applications will appear here after submission.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Type</th>
                      <th className="px-6 py-4 font-semibold">From</th>
                      <th className="px-6 py-4 font-semibold">To</th>
                      <th className="px-6 py-4 font-semibold">Days</th>
                      <th className="px-6 py-4 font-semibold">Reason</th>
                      <th className="px-6 py-4 font-semibold">Status</th>
                      <th className="px-6 py-4 font-semibold">Decision By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaves.map((item) => (
                      <tr
                        key={item.id}
                        className="border-t border-slate-100 transition hover:bg-slate-50/80"
                      >
                        <td className="px-6 py-4 font-medium capitalize text-slate-900">
                          {item.type}
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          {formatDate(item.from)}
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          {formatDate(item.to)}
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          {dayDifference(item.from, item.to)}
                        </td>
                        <td className="max-w-xs px-6 py-4 text-slate-600">
                          <span className="line-clamp-2">{item.reason}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold capitalize ring-1 ${
                              statusStyles[item.status] || "bg-slate-100 text-slate-700 ring-slate-200"
                            }`}
                          >
                            {item.status === "approved" && <ShieldCheck size={14} />}
                            {item.status === "pending" && <Clock3 size={14} />}
                            {item.status === "rejected" && <XCircle size={14} />}
                            {item.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          {item.status === "pending" ? (
                            <div>
                              <div className="font-medium text-amber-700">
                                Waiting for review
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                Route: {item.approval_route || "--"}
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className="font-medium text-slate-900">
                                {item.action_by_name || "Unknown reviewer"}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {formatDateTime(item.action_at)}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </Layout>
  );
}

function MetricCard({ icon, label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-emerald-100">
        {icon}
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}
