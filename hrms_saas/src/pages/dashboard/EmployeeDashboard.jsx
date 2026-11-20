import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
  Timer,
} from "lucide-react";
import Layout from "../../components/layout/Layout";
import Loader from "../../components/common/Loader";
import Pagination from "../../components/common/Pagination";
import { usePagination } from "../../hooks/usePagination";
import API from "../../api/axios";
import { useRealtime } from "../../context/RealtimeContext";

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

export default function EmployeeDashboard() {
  const [data, setData] = useState(null);

  const loadData = () => {
    API.get("/attendance/dashboard/")
      .then((res) => setData(res.data))
      .catch((err) => console.log(err));
  };

  useEffect(() => {
    loadData();
  }, []);

  useRealtime("attendance_update", loadData);
  useRealtime("leave_update", loadData);

  const weeklyAverage = useMemo(() => {
    if (!data?.daily_work?.length) return "0.00";

    const total = data.daily_work.reduce(
      (sum, item) => sum + Number(item.work_hours || 0),
      0
    );

    return (total / data.daily_work.length).toFixed(2);
  }, [data]);
  const timelinePagination = usePagination(data?.daily_work || []);

  if (!data) return <Loader />;

  return (
    <Layout>
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#0f172a_0%,#1e293b_48%,#0f766e_100%)] px-8 py-8 text-white shadow-xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.16),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(45,212,191,0.20),_transparent_32%)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-cyan-100">
                <CalendarDays size={14} />
                Employee Overview
              </p>
              <h1 className="text-3xl font-bold tracking-tight">
                A sharper view of your workday performance
              </h1>
              <p className="mt-3 text-sm text-slate-200">
                Review working hours, leave balance, approval status, and your recent attendance trend from one cleaner dashboard.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <HeroCard
                icon={<Clock3 size={18} />}
                label="Weekly Hours"
                value={data.total_working_hours.toFixed(2)}
              />
              <HeroCard
                icon={<Timer size={18} />}
                label="Daily Avg"
                value={weeklyAverage}
              />
              <HeroCard
                icon={<FileText size={18} />}
                label="Leave Balance"
                value={data.leave_balance}
              />
              <HeroCard
                icon={<AlertCircle size={18} />}
                label="Pending"
                value={data.pending_approvals}
              />
            </div>
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            title="Total Hours"
            value={`${data.total_working_hours.toFixed(2)} hrs`}
            icon={<Clock3 size={20} />}
            tone="cyan"
          />
          <MetricCard
            title="Leave Balance"
            value={data.leave_balance}
            icon={<FileText size={20} />}
            tone="emerald"
          />
          <MetricCard
            title="Leaves Taken"
            value={data.leaves_taken}
            icon={<CheckCircle2 size={20} />}
            tone="amber"
          />
          <MetricCard
            title="Allotted Leave"
            value={data.total_leaves_allocated}
            icon={<CalendarDays size={20} />}
            tone="violet"
          />
          <MetricCard
            title="Pending Approvals"
            value={data.pending_approvals}
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
                {timelinePagination.pageItems.map((item, index) => (
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
                ))}
                {(data.daily_work || []).length === 0 && (
                  <tr><td colSpan="5" className="px-6 py-8 text-center text-slate-500">No recent work timeline records.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {(data.daily_work || []).length > 0 && <Pagination {...timelinePagination} itemLabel="days" />}
        </section>
      </div>
    </Layout>
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

function MetricCard({ title, value, icon, tone }) {
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
