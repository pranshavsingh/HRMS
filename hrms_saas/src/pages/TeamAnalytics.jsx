import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Briefcase,
  CalendarClock,
  Clock3,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Search,
  ShieldAlert,
  TrendingUp,
  Users,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import Loader from "../components/common/Loader";
import API from "../api/axios";
import { usePopup } from "../context/PopupContext";
import { useRealtime } from "../context/RealtimeContext";
import { useSite } from "../context/SiteContext";

const emptyAnalytics = {
  summary: {
    period_days: 30,
    required_hours_per_day: 8,
    team_members: 0,
    present_today: 0,
    on_leave_today: 0,
    pending_review_today: 0,
    absent_today: 0,
    total_present_days: 0,
    total_leave_days: 0,
    total_work_hours: 0,
    average_hours_per_member: 0,
    average_hours_per_present_day: 0,
    under_target_days: 0,
    members_below_target: 0,
    total_shortfall_hours: 0,
  },
  insights: {
    highest_hours_member: null,
    highest_leave_member: null,
    most_under_target_member: null,
  },
  members: [],
};

// TA-AN02: Canonical status class mappings with robust fallbacks
const statusClasses = {
  PRESENT: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  IN_PROGRESS: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  PENDING_REVIEW: "bg-amber-50 text-amber-700 ring-amber-200",
  ON_LEAVE: "bg-violet-50 text-violet-700 ring-violet-200",
  ABSENT: "bg-slate-100 text-slate-700 ring-slate-200",
  REJECTED: "bg-rose-50 text-rose-700 ring-rose-200",
  // Legacy / fallback strings
  Present: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "In Progress": "bg-cyan-50 text-cyan-700 ring-cyan-200",
  "Pending Review": "bg-amber-50 text-amber-700 ring-amber-200",
  "On Leave": "bg-violet-50 text-violet-700 ring-violet-200",
  Absent: "bg-slate-100 text-slate-700 ring-slate-200",
  Rejected: "bg-rose-50 text-rose-700 ring-rose-200",
  P: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  IP: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  PR: "bg-amber-50 text-amber-700 ring-amber-200",
  L: "bg-violet-50 text-violet-700 ring-violet-200",
  A: "bg-slate-100 text-slate-700 ring-slate-200",
  RJ: "bg-rose-50 text-rose-700 ring-rose-200",
};

const STATUS_LABELS = {
  PRESENT: "Present",
  IN_PROGRESS: "In Progress",
  PENDING_REVIEW: "Pending Review",
  ON_LEAVE: "On Leave",
  ABSENT: "Absent",
  REJECTED: "Rejected",
  Present: "Present",
  "In Progress": "In Progress",
  "Pending Review": "Pending Review",
  "On Leave": "On Leave",
  Absent: "Absent",
  Rejected: "Rejected",
  P: "Present",
  IP: "In Progress",
  PR: "Pending Review",
  L: "On Leave",
  A: "Absent",
  RJ: "Rejected",
  "--": "Absent",
};

// TA-AN02: Canonical status normalizer
function normalizeStatus(status) {
  if (!status) return "ABSENT";
  const s = String(status).toUpperCase().trim();
  if (s === "PRESENT" || s === "P") return "PRESENT";
  if (s === "IN_PROGRESS" || s === "IN PROGRESS" || s === "IP") return "IN_PROGRESS";
  if (s === "PENDING_REVIEW" || s === "PENDING REVIEW" || s === "PR") return "PENDING_REVIEW";
  if (s === "ON_LEAVE" || s === "ON LEAVE" || s === "L") return "ON_LEAVE";
  if (s === "REJECTED" || s === "RJ") return "REJECTED";
  if (s === "ABSENT" || s === "A" || s === "--") return "ABSENT";
  return s;
}

const focusOptions = {
  all: () => true,
  attention: (item) =>
    item.under_target_days > 0 ||
    item.pending_approval_items > 0 ||
    item.rejected_days > 0,
  on_track: (item) =>
    item.under_target_days === 0 &&
    item.pending_approval_items === 0 &&
    item.rejected_days === 0,
};

function formatValue(value, suffix = "") {
  return `${Number(value || 0).toFixed(2)}${suffix}`;
}

export default function TeamAnalytics() {
  const { showPopup } = usePopup();
  const { querySiteId } = useSite();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analytics, setAnalytics] = useState(emptyAnalytics);
  const [days, setDays] = useState("30");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [focusFilter, setFocusFilter] = useState("all");

  const daysRef = useRef(days);
  daysRef.current = days;
  const querySiteIdRef = useRef(querySiteId);
  querySiteIdRef.current = querySiteId;

  // TA-AN09: Include site_id in query parameters
  const fetchAnalytics = useCallback(async (selectedDays, showLoader = true) => {
    if (showLoader) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const params = { days: selectedDays };
      if (querySiteIdRef.current) params.site_id = querySiteIdRef.current;
      const res = await API.get("/attendance/team-analytics/", {
        params,
      });
      setAnalytics({
        ...emptyAnalytics,
        ...(res.data || {}),
        summary: {
          ...emptyAnalytics.summary,
          ...(res.data?.summary || {}),
        },
        insights: {
          ...emptyAnalytics.insights,
          ...(res.data?.insights || {}),
        },
        members: Array.isArray(res.data?.members) ? res.data.members : [],
      });
    } catch (err) {
      console.error("Team analytics fetch error:", err.response?.data || err.message);
      showPopup(err.response?.data?.error || "Unable to load team analytics", "error");
      setAnalytics(emptyAnalytics);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showPopup]);

  useEffect(() => {
    fetchAnalytics(days);
  }, [fetchAnalytics, days, querySiteId]);

  // TA-AN08: Stable real-time SSE listener avoiding subscription churn
  const handleRealtimeUpdate = useCallback(() => {
    fetchAnalytics(daysRef.current, false);
  }, [fetchAnalytics]);

  useRealtime("attendance_update", handleRealtimeUpdate);
  useRealtime("leave_update", handleRealtimeUpdate);

  // TA-AN02: Filter members using canonical status normalization
  const filteredMembers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return analytics.members.filter((item) => {
      const matchesSearch =
        !query ||
        [
          item.employee_name,
          item.username,
          item.email,
          item.team_name,
          STATUS_LABELS[normalizeStatus(item.today_status)] || item.today_status,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query));

      const matchesStatus =
        statusFilter === "all" ? true : normalizeStatus(item.today_status) === statusFilter;
      const matchesFocus = (focusOptions[focusFilter] || focusOptions.all)(item);

      return matchesSearch && matchesStatus && matchesFocus;
    });
  }, [analytics.members, focusFilter, search, statusFilter]);

  const attentionMembers = useMemo(
    () =>
      [...analytics.members]
        .filter(focusOptions.attention)
        .sort(
          (a, b) =>
            b.under_target_days - a.under_target_days ||
            b.pending_approval_items - a.pending_approval_items ||
            b.shortfall_hours - a.shortfall_hours
        )
        .slice(0, 5),
    [analytics.members]
  );

  // Safe CSV export with formula injection protection and UTF-8 BOM
  const sanitizeCsvValue = (value) => {
    if (value === null || value === undefined) return "";
    let str = String(value);
    if (/^[=+\-@\t\r]/.test(str)) {
      str = "'" + str;
    }
    return `"${str.replace(/"/g, '""')}"`;
  };

  const handleExportCsv = () => {
    if (!filteredMembers.length) {
      showPopup("No team members to export", "error");
      return;
    }
    const headers = [
      "Employee Name",
      "Username",
      "Email",
      "Team",
      "Joining Date",
      "Today Status",
      "Present Days",
      "Approved Days",
      "Pending Days",
      "Rejected Days",
      "Leave Days",
      "Total Hours",
      "Avg Hours/Day",
      "Completion Rate",
      "Fulfilled Days",
      "Under Target Days",
      "Shortfall Hours",
      "Pending Approval Items",
      "Last Attendance Date",
    ];
    const rows = filteredMembers.map((m) => [
      sanitizeCsvValue(m.employee_name || m.username),
      sanitizeCsvValue(m.username),
      sanitizeCsvValue(m.email || ""),
      sanitizeCsvValue(m.team_name || ""),
      sanitizeCsvValue(m.joining_date || ""),
      sanitizeCsvValue(STATUS_LABELS[normalizeStatus(m.today_status)] || m.today_status),
      sanitizeCsvValue(m.present_days),
      sanitizeCsvValue(m.approved_days),
      sanitizeCsvValue(m.pending_days),
      sanitizeCsvValue(m.rejected_days),
      sanitizeCsvValue(m.leave_days),
      sanitizeCsvValue(m.total_work_hours),
      sanitizeCsvValue(m.average_hours),
      sanitizeCsvValue(`${Number(m.completion_rate || 0).toFixed(1)}%`),
      sanitizeCsvValue(m.fulfilled_days),
      sanitizeCsvValue(m.under_target_days),
      sanitizeCsvValue(m.shortfall_hours),
      sanitizeCsvValue(m.pending_approval_items),
      sanitizeCsvValue(m.last_attendance_date || ""),
    ]);
    const csvContent =
      "\uFEFF" +
      [headers.map(sanitizeCsvValue).join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `team_analytics_${days}d_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showPopup("Team analytics exported successfully", "success");
  };

  if (loading) {
    return (
      <Layout>
        <Loader />
      </Layout>
    );
  }

  const { summary, insights } = analytics;

  return (
    <Layout>
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#0f172a_0%,#0f3d68_45%,#166534_100%)] px-8 py-8 text-white shadow-xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.14),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(74,222,128,0.18),_transparent_34%)]" />
          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-emerald-100">
                <Briefcase size={14} />
                Team Analytics
              </p>
              <h1 className="text-3xl font-bold tracking-tight">
                Keep the team&apos;s attendance, effort, and shortfall signals in one view
              </h1>
              <p className="mt-3 text-sm text-slate-200">
                Review team working hours, present days, leave usage, pending reviews,
                and under-target days across the selected analysis window.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <HeroTile icon={<Users size={18} />} label="Team Members" value={summary.team_members} />
              <HeroTile icon={<Clock3 size={18} />} label="Team Hours" value={`${formatValue(summary.total_work_hours)}h`} />
              <HeroTile icon={<CalendarClock size={18} />} label="Present Today" value={summary.present_today} />
              <HeroTile icon={<ShieldAlert size={18} />} label="Below Target" value={summary.members_below_target} />
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Analytics Controls</h2>
              <p className="mt-1 text-sm text-slate-500">
                Filter the team summary by analysis period, today status, or attention level.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleExportCsv}
                disabled={!filteredMembers.length}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Export filtered records to CSV"
              >
                <FileSpreadsheet size={16} className="text-emerald-600" />
                Export CSV
              </button>

              <button
                onClick={() => fetchAnalytics(days, false)}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
                Refresh
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[0.8fr_1.4fr_1fr_1fr]">
            <label className="block">
              <span className="mb-2 text-sm font-medium text-slate-700">Period</span>
              <select
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              >
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                <Search size={16} />
                Search Team
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by member, email, team, or status"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              />
            </label>

            {/* TA-AN02: Canonical status filter dropdown */}
            <label className="block">
              <span className="mb-2 text-sm font-medium text-slate-700">Today Status</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              >
                <option value="all">All statuses</option>
                <option value="PRESENT">Present</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="PENDING_REVIEW">Pending Review</option>
                <option value="ON_LEAVE">On Leave</option>
                <option value="ABSENT">Absent</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-2 text-sm font-medium text-slate-700">Focus</span>
              <select
                value={focusFilter}
                onChange={(e) => setFocusFilter(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              >
                <option value="all">Full team</option>
                <option value="attention">Needs attention</option>
                <option value="on_track">On track</option>
              </select>
            </label>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-2">
              <TrendingUp size={18} className="text-slate-700" />
              <h2 className="text-xl font-semibold text-slate-900">Performance Spotlight</h2>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <InsightCard
                title="Highest Work Hours"
                subtitle="Top contributor in selected window"
                member={insights.highest_hours_member}
                metric={`${formatValue(insights.highest_hours_member?.total_work_hours)} hrs`}
                tone="emerald"
              />
              <InsightCard
                title="Highest Leave Usage"
                subtitle="Most approved leave days"
                member={insights.highest_leave_member}
                metric={`${Number(insights.highest_leave_member?.leave_days || 0)} days`}
                tone="violet"
              />
              <InsightCard
                title="Needs Attention"
                subtitle="Most under-target approved days"
                member={insights.most_under_target_member}
                metric={`${Number(insights.most_under_target_member?.under_target_days || 0)} days`}
                tone="rose"
              />
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-5 flex items-center gap-2">
              <ShieldAlert size={18} className="text-slate-700" />
              <h2 className="text-xl font-semibold text-slate-900">Attention Queue</h2>
            </div>
            {attentionMembers.length === 0 ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-5 text-sm text-emerald-700">
                The team is currently looking healthy. No members are showing shortfall or pending review signals right now.
              </div>
            ) : (
              <div className="space-y-3">
                {attentionMembers.map((item) => (
                  <div
                    key={item.user_id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-slate-900">{item.employee_name || item.username}</p>
                        <p className="mt-1 text-xs text-slate-500">{item.email || item.username}</p>
                      </div>
                      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusClasses[normalizeStatus(item.today_status)] || statusClasses.ABSENT}`}>
                        {STATUS_LABELS[normalizeStatus(item.today_status)] || item.today_status}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-3 text-xs text-slate-500">
                      <div>
                        <p className="uppercase tracking-wide">Under Target</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{item.under_target_days}</p>
                      </div>
                      <div>
                        <p className="uppercase tracking-wide">Pending Reviews</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{item.pending_approval_items}</p>
                      </div>
                      <div>
                        <p className="uppercase tracking-wide">Shortfall</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{formatValue(item.shortfall_hours)}h</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Team Member Summary</h2>
              <p className="mt-1 text-sm text-slate-500">
                {filteredMembers.length} member{filteredMembers.length === 1 ? "" : "s"} visible in the current view
              </p>
            </div>
          </div>

          {filteredMembers.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <Users size={28} />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">No team members match these filters</h3>
              <p className="mt-2 text-sm text-slate-500">
                Try changing the period, today status, or focus filter.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Member</th>
                    <th className="px-6 py-4 font-semibold">Today</th>
                    <th className="px-6 py-4 font-semibold">Present / Leave</th>
                    <th className="px-6 py-4 font-semibold">Hours</th>
                    <th className="px-6 py-4 font-semibold">Target Match</th>
                    <th className="px-6 py-4 font-semibold">Reviews</th>
                    <th className="px-6 py-4 font-semibold">Last Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.map((item) => (
                    <tr key={item.user_id} className="border-t border-slate-100 align-top transition hover:bg-slate-50/80">
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900">{item.employee_name || item.username}</div>
                        <div className="mt-1 text-xs text-slate-500">@{item.username}</div>
                        <div className="mt-1 text-xs text-slate-500">{item.email || "--"}</div>
                        <div className="mt-1 text-xs text-slate-500">Joined: {item.joining_date || "--"}</div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${statusClasses[normalizeStatus(item.today_status)] || statusClasses.ABSENT}`}>
                          {STATUS_LABELS[normalizeStatus(item.today_status)] || item.today_status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-700">
                        <div className="font-medium text-slate-900">{item.present_days} present days</div>
                        <div className="mt-1 text-xs text-slate-500">{item.leave_days} leave days</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {item.approved_days} approved, {item.pending_days} pending, {item.rejected_days} rejected
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-700">
                        <div className="font-medium text-slate-900">{formatValue(item.total_work_hours)} hrs</div>
                        <div className="mt-1 text-xs text-slate-500">Avg/day: {formatValue(item.average_hours)} hrs</div>
                        <div className="mt-1 text-xs text-slate-500">Completion: {Number(item.completion_rate || 0).toFixed(1)}%</div>
                      </td>
                      <td className="px-6 py-4 text-slate-700">
                        <div className="font-medium text-slate-900">{item.fulfilled_days} fulfilled days</div>
                        <div className="mt-1 text-xs text-rose-600">{item.under_target_days} under target days</div>
                        <div className="mt-1 text-xs text-slate-500">Shortfall: {formatValue(item.shortfall_hours)} hrs</div>
                      </td>
                      <td className="px-6 py-4 text-slate-700">
                        <div className="font-medium text-slate-900">{item.pending_approval_items} pending items</div>
                        <div className="mt-1 text-xs text-slate-500">Team: {item.team_name || "--"}</div>
                      </td>
                      <td className="px-6 py-4 text-slate-700">
                        {item.last_attendance_date || "--"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}

function HeroTile({ icon, label, value }) {
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

function InsightCard({ title, subtitle, member, metric, tone }) {
  const toneStyles = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    violet: "border-violet-200 bg-violet-50 text-violet-700",
    rose: "border-rose-200 bg-rose-50 text-rose-700",
  };

  return (
    <div className={`rounded-2xl border px-4 py-5 ${toneStyles[tone]}`}>
      <p className="text-xs font-medium uppercase tracking-[0.2em]">{title}</p>
      <p className="mt-2 text-2xl font-bold">{metric}</p>
      <p className="mt-2 text-sm font-semibold">{member?.employee_name || member?.username || "--"}</p>
      <p className="mt-1 text-xs opacity-80">{subtitle}</p>
    </div>
  );
}
