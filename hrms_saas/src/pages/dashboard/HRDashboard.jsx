import { useEffect, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  ShieldCheck,
  Users,
} from "lucide-react";
import Layout from "../../components/layout/Layout";
import Loader from "../../components/common/Loader";
import API from "../../api/axios";
import { useRealtime } from "../../context/RealtimeContext";

const emptyDashboard = {
  people_summary: {
    total_people: 0,
    present_today: 0,
    pending_leave_requests: 0,
    pending_attendance_approvals: 0,
    recent_people_attendance: [],
  },
};

export default function HRDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState("");

  const loadDashboard = async (showLoader = false) => {
    if (showLoader) setLoading(true);
    try {
      const res = await API.get("/attendance/hr-dashboard/");
      setData(mergeDashboard(res.data));
      setWarning("");
    } catch (hrErr) {
      console.error("HR dashboard API failed:", hrErr);
      setData(emptyDashboard);
      setWarning(
        "Dashboard data could not be loaded right now. Please refresh after the backend is running."
      );
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard(true);
  }, []);

  useRealtime("attendance_update", () => loadDashboard(false));
  useRealtime("leave_update", () => loadDashboard(false));
  useRealtime("employee_update", () => loadDashboard(false));

  if (loading) {
    return (
      <Layout>
        <Loader />
      </Layout>
    );
  }

  const people = data?.people_summary || emptyDashboard.people_summary;

  return (
    <Layout>
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#3f1d2e_0%,#7c2d12_48%,#14532d_100%)] px-8 py-8 text-white shadow-xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.14),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(134,239,172,0.18),_transparent_32%)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between w-full">
            <div className="max-w-2xl">
              <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-emerald-100">
                <ShieldCheck size={14} />
                HR Dashboard
              </p>
              <h1 className="text-3xl font-bold tracking-tight">
                People and Workforce Overview
              </h1>
              <p className="mt-3 text-sm text-slate-200">
                Monitor total active staff count, attendance status, and pending approvals across employees and managers.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 w-full lg:w-auto flex-1 max-w-2xl">
              <HeroTile icon={<Users size={18} />} label="Total People" value={people.total_people} />
              <HeroTile icon={<CheckCircle2 size={18} />} label="Present Today" value={people.present_today} />
              <HeroTile icon={<FileText size={18} />} label="Leave Requests" value={people.pending_leave_requests} />
              <HeroTile icon={<AlertCircle size={18} />} label="Attendance Appr" value={people.pending_attendance_approvals} />
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
            <h2 className="text-xl font-semibold text-slate-900">People Overview</h2>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="Employees + Managers" value={people.total_people} subtitle="Admin excluded" icon={<Users size={20} />} tone="cyan" />
            <MetricCard title="Present Today" value={people.present_today} subtitle="Current workforce attendance" icon={<CheckCircle2 size={20} />} tone="emerald" />
            <MetricCard title="Pending Leave Requests" value={people.pending_leave_requests} subtitle="Employee and manager leave queue" icon={<FileText size={20} />} tone="amber" />
            <MetricCard title="Pending Attendance Approvals" value={people.pending_attendance_approvals} subtitle="HR attendance approvals waiting action" icon={<AlertCircle size={20} />} tone="rose" />
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
                {people.recent_people_attendance.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-6 py-8 text-center text-slate-500">
                      No people attendance records found yet.
                    </td>
                  </tr>
                ) : (
                  people.recent_people_attendance.map((item, index) => (
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
      </div>
    </Layout>
  );
}

function mergeDashboard(payload) {
  return {
    people_summary: {
      ...emptyDashboard.people_summary,
      ...(payload?.people_summary || {}),
      recent_people_attendance: Array.isArray(payload?.people_summary?.recent_people_attendance)
        ? payload.people_summary.recent_people_attendance
        : [],
    },
  };
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
