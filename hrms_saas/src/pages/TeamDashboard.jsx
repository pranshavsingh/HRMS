import { useEffect, useState } from "react";
import {
  AlertCircle,
  Briefcase,
  CheckCircle2,
  Clock3,
  FileText,
  ShieldCheck,
  Users,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import Loader from "../components/common/Loader";
import API from "../api/axios";

const emptyTeamDashboard = {
  team_summary: {
    team_members: 0,
    present_today: 0,
    team_total_hours: 0,
    pending_attendance_approvals: 0,
    pending_leave_approvals: 0,
    recent_team_attendance: [],
  },
};

export default function TeamDashboard() {
  const [data, setData] = useState(emptyTeamDashboard);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState("");

  useEffect(() => {
    const loadTeamDashboard = async () => {
      try {
        const res = await API.get("/attendance/manager-dashboard/");
        setData(mergeDashboard(res.data));
        setWarning("");
      } catch (err) {
        console.log("Team dashboard API failed:", err);
        setData(emptyTeamDashboard);
        setWarning(
          err?.response?.status === 403
            ? "You do not have permission to view the Manager Team Dashboard."
            : (err?.response?.data?.error || "Team dashboard data could not be loaded right now. Please try again.")
        );
      } finally {
        setLoading(false);
      }
    };

    loadTeamDashboard();
  }, []);

  if (loading) {
    return (
      <Layout>
        <Loader />
      </Layout>
    );
  }

  const team = data.team_summary || emptyTeamDashboard.team_summary;

  return (
    <Layout>
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_45%,#0f766e_100%)] px-8 py-8 text-white shadow-xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.14),_transparent_30%),radial-gradient(circle_at_bottom_right,_rgba(45,212,191,0.16),_transparent_34%)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-cyan-100">
                <Briefcase size={14} />
                Team Dashboard
              </p>
              <h1 className="text-3xl font-bold tracking-tight">
                Keep your team overview in a separate manager workspace
              </h1>
              <p className="mt-3 text-sm text-slate-200">
                Review direct reports, presence, team hours, pending approvals,
                and recent attendance activity from one clean page.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <HeroTile
                icon={<Users size={18} />}
                label="Team Members"
                value={team.team_members}
              />
              <HeroTile
                icon={<CheckCircle2 size={18} />}
                label="Present Today"
                value={team.present_today}
              />
              <HeroTile
                icon={<Clock3 size={18} />}
                label="Team Hours"
                value={`${Number(team.team_total_hours || 0).toFixed(2)}h`}
              />
              <HeroTile
                icon={<ShieldCheck size={18} />}
                label="Approvals"
                value={team.pending_attendance_approvals + team.pending_leave_approvals}
              />
            </div>
          </div>
        </section>

        {warning ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {warning}
          </div>
        ) : null}

        <section>
          <div className="mb-4 flex items-center gap-2">
            <Users size={18} className="text-slate-700" />
            <h2 className="text-xl font-semibold text-slate-900">Team Summary</h2>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              title="Team Members"
              value={team.team_members}
              subtitle="Active direct reports"
              icon={<Users size={20} />}
              tone="cyan"
            />
            <MetricCard
              title="Present Today"
              value={team.present_today}
              subtitle="Team attendance marked today"
              icon={<CheckCircle2 size={20} />}
              tone="emerald"
            />
            <MetricCard
              title="Team Work Hours"
              value={`${Number(team.team_total_hours || 0).toFixed(2)} hrs`}
              subtitle="Last 7 days"
              icon={<Clock3 size={20} />}
              tone="amber"
            />
            <MetricCard
              title="Attendance Approvals"
              value={team.pending_attendance_approvals}
              subtitle="Pending team attendance approvals"
              icon={<AlertCircle size={20} />}
              tone="violet"
            />
            <MetricCard
              title="Leave Approvals"
              value={team.pending_leave_approvals}
              subtitle="Pending team leave approvals"
              icon={<FileText size={20} />}
              tone="rose"
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
                Snapshot of your team&apos;s latest attendance activity.
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
                {team.recent_team_attendance.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="px-6 py-8 text-center text-slate-500">
                      No team attendance records found yet.
                    </td>
                  </tr>
                ) : (
                  team.recent_team_attendance.map((item, index) => (
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
      </div>
    </Layout>
  );
}

function mergeDashboard(payload) {
  return {
    team_summary: {
      ...emptyTeamDashboard.team_summary,
      ...(payload?.team_summary || {}),
      recent_team_attendance: Array.isArray(payload?.team_summary?.recent_team_attendance)
        ? payload.team_summary.recent_team_attendance
        : [],
    },
  };
}

function HeroTile({ icon, label, value }) {
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

function MetricCard({ title, value, subtitle, icon, tone }) {
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
          <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
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
