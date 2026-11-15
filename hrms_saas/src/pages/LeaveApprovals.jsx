import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  Filter,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  XCircle,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import Loader from "../components/common/Loader";
import API from "../api/axios";
import { usePopup } from "../context/PopupContext";
import { useRealtime } from "../context/RealtimeContext";

const statusStyles = {
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  rejected: "bg-rose-50 text-rose-700 ring-rose-200",
};

const roleStyles = {
  employee: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  manager: "bg-violet-50 text-violet-700 ring-violet-200",
  hr: "bg-indigo-50 text-indigo-700 ring-indigo-200",
};

const emptySummary = {
  scope_label: "",
  total_requests: 0,
  pending_requests: 0,
  approved_requests: 0,
  rejected_requests: 0,
  actionable_requests: 0,
};

const heroByRole = {
  manager: {
    tag: "Team Leave Desk",
    title: "Review employee leave requests across your reporting team",
    description:
      "Employee leave requests stay visible to you, HR, and admin. The first final decision closes the request and records that approver.",
    gradient:
      "bg-[linear-gradient(135deg,#172554_0%,#1e3a8a_48%,#0f766e_100%)]",
    badge: "text-cyan-100",
  },
  hr: {
    tag: "HR Leave Control",
    title: "Manage leave approvals with clear routing and visible ownership",
    description:
      "Employee requests reach manager, HR, and admin. Manager requests reach HR and admin. HR requests go to admin, and the approver name is saved on every final decision.",
    gradient:
      "bg-[linear-gradient(135deg,#3f1d2e_0%,#7c2d12_48%,#14532d_100%)]",
    badge: "text-emerald-100",
  },
  admin: {
    tag: "Admin Review Queue",
    title: "Finalize cross-company leave requests with full approval trace",
    description:
      "Admin can review employee, manager, and HR leave requests, and every final action shows exactly who approved or rejected it.",
    gradient:
      "bg-[linear-gradient(135deg,#111827_0%,#1f2937_48%,#312e81_100%)]",
    badge: "text-indigo-100",
  },
};

const formatDate = (value) => {
  if (!value) return "--";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
};

const formatDateTime = (value) => {
  if (!value) return "--";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const capitalize = (value) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : "";

export default function LeaveApprovals() {
  const { showPopup } = usePopup();
  const role = localStorage.getItem("role") || "hr";
  const hero = heroByRole[role] || heroByRole.hr;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submittingKey, setSubmittingKey] = useState("");
  const [summary, setSummary] = useState(emptySummary);
  const [records, setRecords] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");

  const fetchApprovals = async (showLoader = true) => {
    if (showLoader) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const res = await API.get("/leave/approvals/");
      const payload = Array.isArray(res.data)
        ? { summary: emptySummary, records: res.data }
        : res.data || {};

      setSummary({
        ...emptySummary,
        ...(payload.summary || {}),
      });
      setRecords(Array.isArray(payload.records) ? payload.records : []);
    } catch (err) {
      console.error("Leave approvals fetch error:", err.response?.data || err.message);
      showPopup(err.response?.data?.error || "Unable to load leave approvals", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchApprovals();
  }, []);

  useRealtime("leave_update", () => fetchApprovals(false));

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase();

    return records.filter((item) => {
      const matchesSearch =
        !query ||
        [
          item.employee,
          item.employee_name,
          item.employee_email,
          item.employee_role,
          item.team_name,
          item.reporting_manager,
          item.type,
          item.reason,
          item.action_by_name,
          item.approval_route,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));

      const matchesStatus =
        statusFilter === "all" ? true : item.status === statusFilter;

      const matchesRole =
        roleFilter === "all" ? true : item.employee_role === roleFilter;

      return matchesSearch && matchesStatus && matchesRole;
    });
  }, [records, roleFilter, search, statusFilter]);

  const visibleSummary = useMemo(
    () => ({
      total: filteredRecords.length,
      pending: filteredRecords.filter((item) => item.status === "pending").length,
      approved: filteredRecords.filter((item) => item.status === "approved").length,
      rejected: filteredRecords.filter((item) => item.status === "rejected").length,
      actionable: filteredRecords.filter((item) => item.can_approve).length,
    }),
    [filteredRecords]
  );

  const handleAction = async (leaveId, nextStatus) => {
    setSubmittingKey(`${leaveId}-${nextStatus}`);

    try {
      const res = await API.post(`/leave/action/${leaveId}/`, {
        status: nextStatus,
      });

      const updatedLeave = res.data?.leave;

      if (updatedLeave) {
        setRecords((current) =>
          current.map((item) => (item.id === leaveId ? updatedLeave : item))
        );
      } else {
        await fetchApprovals(false);
      }

      showPopup(res.data?.message || `Leave ${nextStatus} successfully`, "success");
    } catch (err) {
      console.error("Leave action error:", err.response?.data || err.message);
      showPopup(err.response?.data?.error || `Unable to ${nextStatus} leave`, "error");
    } finally {
      setSubmittingKey("");
      fetchApprovals(false);
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
        <section
          className={`relative overflow-hidden rounded-3xl px-8 py-8 text-white shadow-xl ${hero.gradient}`}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.14),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(255,255,255,0.10),_transparent_32%)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p
                className={`mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] ${hero.badge}`}
              >
                <ShieldCheck size={14} />
                {hero.tag}
              </p>
              <h1 className="text-3xl font-bold tracking-tight">{hero.title}</h1>
              <p className="mt-3 text-sm text-slate-200">{hero.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <HeroMetric
                icon={<Clock3 size={18} />}
                label="Pending"
                value={summary.pending_requests}
              />
              <HeroMetric
                icon={<AlertCircle size={18} />}
                label="Actionable"
                value={summary.actionable_requests}
              />
              <HeroMetric
                icon={<CheckCircle2 size={18} />}
                label="Approved"
                value={summary.approved_requests}
              />
              <HeroMetric
                icon={<XCircle size={18} />}
                label="Rejected"
                value={summary.rejected_requests}
              />
            </div>
          </div>
        </section>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                Approval Workspace
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {summary.scope_label || "Review visible leave requests by status, team, and final approver."}
              </p>
            </div>

            <button
              onClick={() => fetchApprovals(false)}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1.7fr_0.9fr_0.9fr]">
            <label className="block">
              <span className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                <Search size={16} />
                Search
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, team, type, reason, or approver"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              />
            </label>

            <label className="block">
              <span className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                <Filter size={16} />
                Status Filter
              </span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                <UserRound size={16} />
                Role Filter
              </span>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              >
                <option value="all">All Roles</option>
                <option value="employee">Employees</option>
                <option value="manager">Managers</option>
                <option value="hr">HR</option>
              </select>
            </label>
          </div>
        </div>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
          <StatCard
            title="Visible Requests"
            value={visibleSummary.total}
            subtitle="Current filtered queue"
            icon={<ShieldCheck size={20} />}
            tone="slate"
          />
          <StatCard
            title="Pending"
            value={visibleSummary.pending}
            subtitle="Waiting for final review"
            icon={<Clock3 size={20} />}
            tone="amber"
          />
          <StatCard
            title="Actionable"
            value={visibleSummary.actionable}
            subtitle="Requests you can decide now"
            icon={<AlertCircle size={20} />}
            tone="cyan"
          />
          <StatCard
            title="Approved"
            value={visibleSummary.approved}
            subtitle="Closed with approval"
            icon={<CheckCircle2 size={20} />}
            tone="emerald"
          />
          <StatCard
            title="Rejected"
            value={visibleSummary.rejected}
            subtitle="Closed with rejection"
            icon={<XCircle size={20} />}
            tone="rose"
          />
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-5">
            <h2 className="text-xl font-semibold text-slate-900">
              Leave Approval Queue
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Final action by any allowed reviewer closes the request and records that reviewer by name.
            </p>
          </div>

          {filteredRecords.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <ShieldCheck size={28} />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">
                No leave requests match these filters
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                Try changing the search text or status filters to see more requests.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Employee</th>
                    <th className="px-6 py-4 font-semibold">Role / Team</th>
                    <th className="px-6 py-4 font-semibold">Leave Window</th>
                    <th className="px-6 py-4 font-semibold">Reason</th>
                    <th className="px-6 py-4 font-semibold">Routing</th>
                    <th className="px-6 py-4 font-semibold">Status</th>
                    <th className="px-6 py-4 font-semibold">Decision</th>
                    <th className="px-6 py-4 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.map((item) => {
                    const approveBusy = submittingKey === `${item.id}-approved`;
                    const rejectBusy = submittingKey === `${item.id}-rejected`;

                    return (
                      <tr
                        key={item.id}
                        className="border-t border-slate-100 align-top transition hover:bg-slate-50/80"
                      >
                        <td className="px-6 py-4">
                          <div className="font-semibold text-slate-900">
                            {item.employee_name || item.employee}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            @{item.employee}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {item.employee_email || "--"}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          <span
                            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold capitalize ring-1 ${
                              roleStyles[item.employee_role] ||
                              "bg-slate-100 text-slate-700 ring-slate-200"
                            }`}
                          >
                            {item.employee_role}
                          </span>
                          <div className="mt-3 text-xs text-slate-500">
                            Team: {item.team_name || "--"}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            Manager: {item.reporting_manager || "--"}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          <div className="font-medium text-slate-900 capitalize">
                            {item.type}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {formatDate(item.from)} to {formatDate(item.to)}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {item.days} day{item.days === 1 ? "" : "s"}
                          </div>
                        </td>
                        <td className="max-w-xs px-6 py-4 text-slate-600">
                          <div className="line-clamp-3">{item.reason}</div>
                          <div className="mt-2 text-xs text-slate-400">
                            Requested {formatDateTime(item.created_at)}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
                            {item.approval_route}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold capitalize ring-1 ${
                              statusStyles[item.status] ||
                              "bg-slate-100 text-slate-700 ring-slate-200"
                            }`}
                          >
                            {item.status === "approved" && <CheckCircle2 size={14} />}
                            {item.status === "pending" && <Clock3 size={14} />}
                            {item.status === "rejected" && <XCircle size={14} />}
                            {item.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          {item.status === "pending" ? (
                            <div>
                              <div className="font-medium text-amber-700">
                                Awaiting final review
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                Visible by route: {item.approval_route}
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className="font-medium text-slate-900">
                                {capitalize(item.status)} by{" "}
                                {item.action_by_name || "Unknown reviewer"}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">
                                {formatDateTime(item.action_at)}
                              </div>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {item.can_approve ? (
                            <div className="flex flex-col gap-2">
                              <button
                                onClick={() => handleAction(item.id, "approved")}
                                disabled={Boolean(submittingKey)}
                                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                              >
                                <CheckCircle2 size={14} />
                                {approveBusy ? "Approving..." : "Approve"}
                              </button>
                              <button
                                onClick={() => handleAction(item.id, "rejected")}
                                disabled={Boolean(submittingKey)}
                                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-70"
                              >
                                <XCircle size={14} />
                                {rejectBusy ? "Rejecting..." : "Reject"}
                              </button>
                            </div>
                          ) : (
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs font-medium text-slate-500">
                              {item.status === "pending"
                                ? "View only"
                                : "Decision locked"}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}

function HeroMetric({ icon, label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-white/80">
        {icon}
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function StatCard({ title, value, subtitle, icon, tone }) {
  const toneStyles = {
    slate: "bg-slate-50 text-slate-700",
    amber: "bg-amber-50 text-amber-700",
    cyan: "bg-cyan-50 text-cyan-700",
    emerald: "bg-emerald-50 text-emerald-700",
    rose: "bg-rose-50 text-rose-700",
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          <h3 className="mt-2 text-2xl font-bold text-slate-900">{value}</h3>
          <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
        </div>
        <div className={`rounded-2xl p-3 ${toneStyles[tone]}`}>{icon}</div>
      </div>
    </div>
  );
}
