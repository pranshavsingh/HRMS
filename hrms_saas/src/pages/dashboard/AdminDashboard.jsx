import { useEffect, useState, useMemo, useCallback } from "react";
import { useLocation } from "react-router-dom";
import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  FileBadge2,
  Settings,
  ShieldCheck,
  Users,
  Clock3,
  Timer,
  CheckCircle2,
  FileText,
  Briefcase,
} from "lucide-react";
import Layout from "../../components/layout/Layout";
import Loader from "../../components/common/Loader";
import Pagination from "../../components/common/Pagination";
import { usePagination } from "../../hooks/usePagination";
import API from "../../api/axios";
import { useRealtime } from "../../context/RealtimeContext";
import { useAuth } from "../../context/AuthContext";

const emptySummary = {
  staff: 0,
  managers: 0,
  employees: 0,
  hr: 0,
  pending_attendance_approvals: 0,
  pending_leave_requests: 0,
  present_today: 0,
  absent_today: 0,
  today_present_employees: [],
};

const formatTimelineDate = (value) => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
};

export default function AdminDashboard() {
  const [summary, setSummary] = useState(emptySummary);
  const [personalData, setPersonalData] = useState(null);
  const [hrData, setHrData] = useState(null);
  const [teamData, setTeamData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState("");

  const { role: authRole } = useAuth();
  const role = authRole || localStorage.getItem("role");

  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const view = searchParams.get("view");
  const [activeTab, setActiveTab] = useState(view === "personal" ? "personal" : "system");
  const timelinePagination = usePagination(personalData?.daily_work || []);

  useEffect(() => {
    setActiveTab(view === "personal" ? "personal" : "system");
  }, [view]);

  const loadData = useCallback(async (showLoader = false) => {
    if (showLoader) setLoading(true);
    try {
      const calls = [
        API.get("/auth/admin-summary/"),
        API.get("/attendance/dashboard/").catch((err) => {
          console.error("Personal dashboard fetch error:", err);
          return { data: null };
        }),
      ];

      if (role === "superadmin") {
        calls.push(
          API.get("/attendance/hr-dashboard/").catch((err) => {
            console.error("HR dashboard fetch error:", err);
            return { data: null };
          })
        );
        calls.push(
          API.get("/attendance/manager-dashboard/").catch((err) => {
            console.error("Manager dashboard fetch error:", err);
            return { data: null };
          })
        );
      }

      const [summaryRes, personalRes, hrRes, teamRes] = await Promise.all(calls);

      setSummary({ ...emptySummary, ...(summaryRes.data || {}) });
      setPersonalData(personalRes?.data);
      if (role === "superadmin") {
        setHrData(hrRes?.data);
        setTeamData(teamRes?.data);
      }
      setWarning("");
    } catch (err) {
      console.error("Dashboard data fetch error:", err.response?.data || err.message);
      setSummary(emptySummary);
      setWarning("Dashboard data could not be fully loaded. Please refresh after backend is running.");
    } finally {
      if (showLoader) setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    loadData(true);
  }, [loadData]);

  useRealtime("attendance_update", () => loadData(false));
  useRealtime("leave_update", () => loadData(false));
  useRealtime("employee_update", () => loadData(false));

  const weeklyAverage = useMemo(() => {
    if (!personalData?.daily_work?.length) return "0.00";
    const total = personalData.daily_work.reduce(
      (sum, item) => sum + Number(item.work_hours || 0),
      0
    );
    return (total / personalData.daily_work.length).toFixed(2);
  }, [personalData]);

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
        {/* Dashboard Title & Tabs Selector */}
        <div className="border-b border-slate-200 pb-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {role === "superadmin" ? "Superadmin Combined Dashboard" : "Dashboard"}
            </h1>
            <p className="text-sm text-slate-500">
              {activeTab === "system" && "Administrative and platform overview"}
              {activeTab === "hr" && "Workforce and general human resources overview"}
              {activeTab === "team" && "Manager dashboard and direct reports overview"}
              {activeTab === "personal" && "Your personal work activity and records"}
            </p>
          </div>

          {/* Premium Segmented Switcher */}
          <div className="flex bg-slate-100 p-1.5 rounded-xl border border-slate-200 self-start">
            <button
              onClick={() => setActiveTab("system")}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition ${
                activeTab === "system"
                  ? "bg-white text-slate-950 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              System
            </button>
            {role === "superadmin" && (
              <>
                <button
                  onClick={() => setActiveTab("hr")}
                  className={`px-4 py-2 text-xs font-semibold rounded-lg transition ${
                    activeTab === "hr"
                      ? "bg-white text-slate-950 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  HR Workspace
                </button>
                <button
                  onClick={() => setActiveTab("team")}
                  className={`px-4 py-2 text-xs font-semibold rounded-lg transition ${
                    activeTab === "team"
                      ? "bg-white text-slate-950 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Team/Manager
                </button>
              </>
            )}
            <button
              onClick={() => setActiveTab("personal")}
              className={`px-4 py-2 text-xs font-semibold rounded-lg transition ${
                activeTab === "personal"
                  ? "bg-white text-slate-950 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              My Portal
            </button>
          </div>
        </div>

        {warning ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {warning}
          </div>
        ) : null}

        {/* ---------------- 1. SYSTEM OVERVIEW ---------------- */}
        {activeTab === "system" && (
          <>
            <section className="relative overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#111827_0%,#1f2937_48%,#312e81_100%)] px-8 py-8 text-white shadow-xl">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.14),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(129,140,248,0.22),_transparent_32%)]" />
              <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between w-full">
                <div className="max-w-md xl:max-w-xl">
                  <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-indigo-100">
                    <ShieldCheck size={14} />
                    System Overview
                  </p>
                  <h1 className="text-3xl font-bold tracking-tight">
                    See platform health and administrative signals at a glance
                  </h1>
                  <p className="mt-3 text-sm text-slate-200">
                    Review system users, reporting volume, and settings posture from a cleaner admin dashboard experience.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5 w-full lg:w-auto flex-1 max-w-4xl">
                  <HeroTile icon={<Users size={18} />} label="Total Emp" value={summary.staff} />
                  <HeroTile icon={<CheckCircle2 size={18} />} label="Today Present" value={summary.present_today} />
                  <HeroTile icon={<AlertCircle size={18} />} label="Today Absent" value={summary.absent_today} />
                  <HeroTile icon={<CheckCircle2 size={18} />} label="Attendance Appr" value={summary.pending_attendance_approvals} />
                  <HeroTile icon={<FileText size={18} />} label="Leave Appr" value={summary.pending_leave_requests} />
                </div>
              </div>
            </section>

            <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
              <MetricCard title="Total Employees" value={summary.staff} subtitle={`${summary.employees} employees, ${summary.managers} managers, ${summary.hr} HR`} icon={<Users size={20} />} />
              <MetricCard title="Today Present" value={summary.present_today} subtitle="Staff punched in today" icon={<CheckCircle2 size={20} />} />
              <MetricCard title="Today Absent" value={summary.absent_today} subtitle="Staff not punched in today" icon={<AlertCircle size={20} />} />
              <MetricCard title="Attendance Approvals" value={summary.pending_attendance_approvals} subtitle="Pending attendance items" icon={<CheckCircle2 size={20} />} />
              <MetricCard title="Leave Approvals" value={summary.pending_leave_requests} subtitle="Pending leave requests" icon={<FileText size={20} />} />
            </section>

            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">Today's Present Employees</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Employees, managers, and HR who have punched in today.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-6 py-4 font-semibold">User</th>
                      <th className="px-6 py-4 font-semibold">Role</th>
                      <th className="px-6 py-4 font-semibold">Date</th>
                      <th className="px-6 py-4 font-semibold">Status</th>
                      <th className="px-6 py-4 font-semibold">Work Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.today_present_employees && summary.today_present_employees.length > 0 ? (
                      summary.today_present_employees.map((item, index) => (
                        <tr key={`${item.username}-${item.date}-${index}`} className="border-t border-slate-100 transition hover:bg-slate-50/80">
                          <td className="px-6 py-4 font-medium text-slate-900">{item.employee_name}</td>
                          <td className="px-6 py-4 text-slate-700 capitalize">{item.role}</td>
                          <td className="px-6 py-4 text-slate-700">{item.date}</td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold capitalize ring-1 ${statusTone(item.status)}`}>
                              {item.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-slate-700">{Number(item.work_hours || 0).toFixed(2)} hrs</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="5" className="px-6 py-8 text-center text-slate-500">
                          No employees present today yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {/* ---------------- 2. HR OVERVIEW (SUPERADMIN ONLY) ---------------- */}
        {activeTab === "hr" && role === "superadmin" && (
          <>
            <section className="relative overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#3f1d2e_0%,#7c2d12_48%,#14532d_100%)] px-8 py-8 text-white shadow-xl">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.14),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(134,239,172,0.18),_transparent_32%)]" />
              <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between w-full">
                <div className="max-w-2xl">
                  <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-emerald-100">
                    <ShieldCheck size={14} />
                    HR Overview
                  </p>
                  <h1 className="text-3xl font-bold tracking-tight">
                    People and Workforce Overview
                  </h1>
                  <p className="mt-3 text-sm text-slate-200">
                    Monitor total active staff count, attendance status, and pending approvals across employees and managers.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 w-full lg:w-auto flex-1 max-w-2xl">
                  <HeroTile icon={<Users size={18} />} label="Total People" value={hrData?.people_summary?.total_people || 0} />
                  <HeroTile icon={<CheckCircle2 size={18} />} label="Present Today" value={hrData?.people_summary?.present_today || 0} />
                  <HeroTile icon={<FileText size={18} />} label="Leave Requests" value={hrData?.people_summary?.pending_leave_requests || 0} />
                  <HeroTile icon={<AlertCircle size={18} />} label="Attendance Appr" value={hrData?.people_summary?.pending_attendance_approvals || 0} />
                </div>
              </div>
            </section>

            <section>
              <div className="mb-4 flex items-center gap-2">
                <Users size={18} className="text-slate-700" />
                <h2 className="text-xl font-semibold text-slate-900">People Overview</h2>
              </div>

              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard title="Employees + Managers" value={hrData?.people_summary?.total_people || 0} subtitle="Admin excluded" icon={<Users size={20} />} />
                <MetricCard title="Present Today" value={hrData?.people_summary?.present_today || 0} subtitle="Current workforce attendance" icon={<CheckCircle2 size={20} />} />
                <MetricCard title="Pending Leave Requests" value={hrData?.people_summary?.pending_leave_requests || 0} subtitle="Employee and manager leave queue" icon={<FileText size={20} />} />
                <MetricCard title="Pending Attendance Approvals" value={hrData?.people_summary?.pending_attendance_approvals || 0} subtitle="HR attendance approvals waiting action" icon={<AlertCircle size={20} />} />
              </div>
            </section>

            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">Recent People Attendance</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Latest attendance records from employees and managers.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-6 py-4 font-semibold">User</th>
                      <th className="px-6 py-4 font-semibold">Role</th>
                      <th className="px-6 py-4 font-semibold">Date</th>
                      <th className="px-6 py-4 font-semibold">Status</th>
                      <th className="px-6 py-4 font-semibold">Work Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!hrData?.people_summary?.recent_people_attendance || hrData.people_summary.recent_people_attendance.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="px-6 py-8 text-center text-slate-500">
                          No people attendance records found yet.
                        </td>
                      </tr>
                    ) : (
                      hrData.people_summary.recent_people_attendance.map((item, index) => (
                        <tr key={`${item.employee}-${item.date}-${index}`} className="border-t border-slate-100 transition hover:bg-slate-50/80">
                          <td className="px-6 py-4 font-medium text-slate-900">{item.employee}</td>
                          <td className="px-6 py-4 text-slate-700 capitalize">{item.role}</td>
                          <td className="px-6 py-4 text-slate-700">{item.date}</td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold capitalize ring-1 ${statusTone(item.status)}`}>
                              {item.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-slate-700">{Number(item.work_hours || 0).toFixed(2)} hrs</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {/* ---------------- 3. TEAM/MANAGER OVERVIEW (SUPERADMIN ONLY) ---------------- */}
        {activeTab === "team" && role === "superadmin" && (
          <>
            <section className="relative overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_45%,#0f766e_100%)] px-8 py-8 text-white shadow-xl">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.14),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(45,212,191,0.16),_transparent_34%)]" />
              <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-2xl">
                  <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-cyan-100">
                    <Briefcase size={14} />
                    Team Overview
                  </p>
                  <h1 className="text-3xl font-bold tracking-tight">
                    Keep your team overview in a separate manager workspace
                  </h1>
                  <p className="mt-3 text-sm text-slate-200">
                    Review direct reports, presence, team hours, pending approvals, and recent attendance activity.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 w-full lg:w-auto flex-1 max-w-2xl">
                  <HeroTile
                    icon={<Users size={18} />}
                    label="Team Members"
                    value={teamData?.team_summary?.team_members || 0}
                  />
                  <HeroTile
                    icon={<CheckCircle2 size={18} />}
                    label="Present Today"
                    value={teamData?.team_summary?.present_today || 0}
                  />
                  <HeroTile
                    icon={<Clock3 size={18} />}
                    label="Team Hours"
                    value={`${Number(teamData?.team_summary?.team_total_hours || 0).toFixed(2)}h`}
                  />
                  <HeroTile
                    icon={<ShieldCheck size={18} />}
                    label="Approvals"
                    value={(teamData?.team_summary?.pending_attendance_approvals || 0) + (teamData?.team_summary?.pending_leave_approvals || 0)}
                  />
                </div>
              </div>
            </section>

            <section>
              <div className="mb-4 flex items-center gap-2">
                <Users size={18} className="text-slate-700" />
                <h2 className="text-xl font-semibold text-slate-900">Team Summary</h2>
              </div>

              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
                <MetricCard
                  title="Team Members"
                  value={teamData?.team_summary?.team_members || 0}
                  subtitle="Active direct reports"
                  icon={<Users size={20} />}
                />
                <MetricCard
                  title="Present Today"
                  value={teamData?.team_summary?.present_today || 0}
                  subtitle="Team attendance marked today"
                  icon={<CheckCircle2 size={20} />}
                />
                <MetricCard
                  title="Team Work Hours"
                  value={`${Number(teamData?.team_summary?.team_total_hours || 0).toFixed(2)} hrs`}
                  subtitle="Last 7 days"
                  icon={<Clock3 size={20} />}
                />
                <MetricCard
                  title="Attendance Approvals"
                  value={teamData?.team_summary?.pending_attendance_approvals || 0}
                  subtitle="Pending team attendance approvals"
                  icon={<AlertCircle size={20} />}
                />
                <MetricCard
                  title="Leave Approvals"
                  value={teamData?.team_summary?.pending_leave_approvals || 0}
                  subtitle="Pending team leave approvals"
                  icon={<FileText size={20} />}
                />
              </div>
            </section>

            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">
                    Recent Team Attendance
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Snapshot of your team's latest attendance activity.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Employee</th>
                      <th className="px-6 py-4 font-semibold">Date</th>
                      <th className="px-6 py-4 font-semibold">Status</th>
                      <th className="px-6 py-4 font-semibold">Work Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!teamData?.team_summary?.recent_team_attendance || teamData.team_summary.recent_team_attendance.length === 0 ? (
                      <tr>
                        <td colSpan="4" className="px-6 py-8 text-center text-slate-500">
                          No team attendance records found yet.
                        </td>
                      </tr>
                    ) : (
                      teamData.team_summary.recent_team_attendance.map((item, index) => (
                        <tr
                          key={`${item.employee}-${item.date}-${index}`}
                          className="border-t border-slate-100 transition hover:bg-slate-50/80"
                        >
                          <td className="px-6 py-4 font-medium text-slate-900">
                            {item.employee}
                          </td>
                          <td className="px-6 py-4 text-slate-700">{item.date}</td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold capitalize ring-1 ${statusTone(item.status)}`}
                            >
                              {item.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-slate-700">
                            {Number(item.work_hours || 0).toFixed(2)} hrs
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {/* ---------------- 4. PERSONAL PORTAL ---------------- */}
        {activeTab === "personal" && (
          <>
            <section className="relative overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#0f172a_0%,#1e293b_48%,#0f766e_100%)] px-8 py-8 text-white shadow-xl">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.16),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(45,212,191,0.20),_transparent_32%)]" />
              <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-2xl">
                  <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-cyan-100">
                    <CalendarDays size={14} />
                    Personal Overview
                  </p>
                  <h1 className="text-3xl font-bold tracking-tight">
                    A sharper view of your workday performance
                  </h1>
                  <p className="mt-3 text-sm text-slate-200">
                    Review working hours, leave balance, approval status, and your recent attendance trend from one cleaner dashboard.
                  </p>
                </div>

                {personalData ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <HeroCard
                      icon={<Clock3 size={18} />}
                      label="Weekly Hours"
                      value={Number(personalData.total_working_hours || 0).toFixed(2)}
                    />
                    <HeroCard
                      icon={<Timer size={18} />}
                      label="Daily Avg"
                      value={weeklyAverage}
                    />
                    <HeroCard
                      icon={<FileText size={18} />}
                      label="Leave Balance"
                      value={personalData.leave_balance}
                    />
                    <HeroCard
                      icon={<AlertCircle size={18} />}
                      label="Pending"
                      value={personalData.pending_approvals}
                    />
                  </div>
                ) : (
                  <div className="text-sm text-cyan-100">No personal data loaded.</div>
                )}
              </div>
            </section>

            {personalData ? (
              <>
                <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
                  <MetricCardPersonal
                    title="Total Hours"
                    value={`${personalData.total_working_hours.toFixed(2)} hrs`}
                    icon={<Clock3 size={20} />}
                    tone="cyan"
                  />
                  <MetricCardPersonal
                    title="Leave Balance"
                    value={personalData.leave_balance}
                    icon={<FileText size={20} />}
                    tone="emerald"
                  />
                  <MetricCardPersonal
                    title="Leaves Taken"
                    value={personalData.leaves_taken}
                    icon={<CheckCircle2 size={20} />}
                    tone="amber"
                  />
                  <MetricCardPersonal
                    title="Allotted Leave"
                    value={personalData.total_leaves_allocated}
                    icon={<CalendarDays size={20} />}
                    tone="violet"
                  />
                  <MetricCardPersonal
                    title="Pending Approvals"
                    value={personalData.pending_approvals}
                    icon={<AlertCircle size={20} />}
                    tone="rose"
                  />
                </section>

                <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
                    <div>
                      <h2 className="text-xl font-semibold text-slate-900">Daily Work Timeline</h2>
                      <p className="mt-1 text-sm text-slate-500">
                        Your recent punch activity and tracked working hours.
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-6 py-4 font-semibold">Date</th>
                          <th className="px-6 py-4 font-semibold">Punch In</th>
                          <th className="px-6 py-4 font-semibold">Punch Out</th>
                          <th className="px-6 py-4 font-semibold">Work Hours</th>
                          <th className="px-6 py-4 font-semibold">Status</th>
                        </tr>
                      </thead>

                      <tbody>
                        {personalData.daily_work && personalData.daily_work.length > 0 ? (
                          timelinePagination.pageItems.map((item, index) => (
                            <tr
                              key={`${item.date}-${index}`}
                              className="border-t border-slate-100 transition hover:bg-slate-50/80"
                            >
                              <td className="px-6 py-4 font-medium text-slate-900">{formatTimelineDate(item.date)}</td>
                              <td className="px-6 py-4 text-slate-700">{item.punch_in || "--"}</td>
                              <td className="px-6 py-4 text-slate-700">
                                {item.punch_out === "Pending" ? (
                                  <span className="font-medium text-amber-600">Pending</span>
                                ) : (
                                  item.punch_out || "--"
                                )}
                              </td>
                              <td className="px-6 py-4 text-slate-700">
                                {Number(item.work_hours || 0).toFixed(2)} hrs
                              </td>
                              <td className="px-6 py-4">
                                <span className="inline-flex items-center rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-700 ring-1 ring-cyan-200">
                                  Logged
                                </span>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="5" className="px-6 py-8 text-center text-slate-500">
                              No recent work timeline records.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {personalData.daily_work?.length > 0 && <Pagination {...timelinePagination} itemLabel="days" />}
                </section>
              </>
            ) : (
              <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-slate-500">
                Failed to load personal workday details. Please make sure profile exists.
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}

function HeroTile({ icon, label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 px-3 py-3 backdrop-blur-sm flex flex-col justify-between">
      <div className="flex items-center gap-2 text-indigo-100">
        {icon}
        <span className="text-[10px] sm:text-xs uppercase tracking-wider font-medium truncate">{label}</span>
      </div>
      <p className="mt-2 text-lg sm:text-2xl font-bold text-white leading-none">{value}</p>
    </div>
  );
}

function HeroCard({ icon, label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-cyan-100">
        {icon}
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function MetricCard({ title, value, subtitle, icon }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          <h3 className="mt-2 text-2xl font-bold text-slate-900">{value}</h3>
          <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
        </div>
        <div className="rounded-2xl bg-indigo-50 p-3 text-indigo-700">{icon}</div>
      </div>
    </div>
  );
}

function MetricCardPersonal({ title, value, icon, tone }) {
  const toneClasses = {
    cyan: "bg-cyan-50 text-cyan-700",
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    violet: "bg-violet-50 text-violet-700",
    rose: "bg-rose-50 text-rose-700",
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          <h3 className="mt-2 text-2xl font-bold text-slate-900">{value}</h3>
        </div>
        <div className={`rounded-2xl p-3 ${toneClasses[tone]}`}>{icon}</div>
      </div>
    </div>
  );
}

function statusTone(status) {
  if (status === "approved") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if (status === "rejected") return "bg-rose-50 text-rose-700 ring-rose-200";
  return "bg-amber-50 text-amber-700 ring-amber-200";
}
