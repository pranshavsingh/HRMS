import { useEffect, useState } from "react";
import {
  AlertCircle,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  Clock3,
  FileText,
} from "lucide-react";
import Layout from "../../components/layout/Layout";
import Loader from "../../components/common/Loader";
import Pagination from "../../components/common/Pagination";
import { usePagination } from "../../hooks/usePagination";
import API from "../../api/axios";
import { useRealtime } from "../../context/RealtimeContext";

const emptyDashboard = {
  own_summary: {
    total_working_hours: 0,
    leave_balance: 0,
    leaves_taken: 0,
    pending_approvals: 0,
    total_leaves_allocated: 0,
    daily_work: [],
  },
};

export default function ManagerDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [warning, setWarning] = useState("");

  const loadDashboard = async (showLoader = false) => {
    if (showLoader) setLoading(true);
    try {
      const res = await API.get("/attendance/manager-dashboard/");
      setData(mergeDashboard(res.data));
      setWarning("");
    } catch (managerErr) {
      console.error("Manager dashboard API failed:", managerErr);

      try {
        const fallback = await API.get("/attendance/dashboard/");
        setData({
          own_summary: {
            total_working_hours: Number(fallback.data?.total_working_hours || 0),
            leave_balance: Number(fallback.data?.leave_balance || 0),
            leaves_taken: Number(fallback.data?.leaves_taken || 0),
            pending_approvals: Number(fallback.data?.pending_approvals || 0),
            total_leaves_allocated: Number(
              fallback.data?.total_leaves_allocated || 0
            ),
            daily_work: Array.isArray(fallback.data?.daily_work)
              ? fallback.data.daily_work
              : [],
          },
        });
        setWarning("");
      } catch (fallbackErr) {
        console.error("Fallback dashboard API failed:", fallbackErr);
        setData(emptyDashboard);
        setWarning(
          "Dashboard data could not be loaded right now. Please refresh after the backend is running."
        );
      }
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard(true);
  }, []);

  useRealtime("attendance_update", () => loadDashboard(false));
  useRealtime("leave_update", () => loadDashboard(false));

  const ownDailyWork = data?.own_summary?.daily_work || [];
  const timelinePagination = usePagination(ownDailyWork);
  useRealtime("employee_update", () => loadDashboard(false));

  if (loading) {
    return (
      <Layout>
        <Loader />
      </Layout>
    );
  }

  const own = data?.own_summary || emptyDashboard.own_summary;

  return (
    <Layout>
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#172554_0%,#1e3a8a_48%,#0f766e_100%)] px-8 py-8 text-white shadow-xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.16),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(45,212,191,0.16),_transparent_32%)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-cyan-100">
                <Briefcase size={14} />
                Manager Workspace
              </p>
              <h1 className="text-3xl font-bold tracking-tight">
                Stay on top of your own workday with a cleaner manager dashboard
              </h1>
              <p className="mt-3 text-sm text-slate-200">
                Mark your own attendance, apply leave, review your documents,
                and track your recent work activity from one focused personal dashboard.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
              <HeroTile
                icon={<Clock3 size={18} />}
                label="My Hours"
                value={`${Number(own.total_working_hours || 0).toFixed(2)}h`}
              />
              <HeroTile
                icon={<CheckCircle2 size={18} />}
                label="Pending"
                value={own.pending_approvals}
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
            <CalendarDays size={18} className="text-slate-700" />
            <h2 className="text-xl font-semibold text-slate-900">My Details</h2>
          </div>

          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              title="My Working Hours"
              value={`${Number(own.total_working_hours || 0).toFixed(2)} hrs`}
              subtitle="Last 7 days"
              icon={<Clock3 size={20} />}
              tone="cyan"
            />
            <MetricCard
              title="Leave Balance"
              value={own.leave_balance}
              subtitle="Available leave balance"
              icon={<FileText size={20} />}
              tone="emerald"
            />
            <MetricCard
              title="Leaves Taken"
              value={own.leaves_taken}
              subtitle="Approved leave days used"
              icon={<CheckCircle2 size={20} />}
              tone="amber"
            />
            <MetricCard
              title="Allotted Leave"
              value={own.total_leaves_allocated}
              subtitle="Allocated leave days"
              icon={<CalendarDays size={20} />}
              tone="violet"
            />
            <MetricCard
              title="My Pending Approvals"
              value={own.pending_approvals}
              subtitle="Attendance approvals on your records"
              icon={<AlertCircle size={20} />}
              tone="rose"
            />
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                My Attendance Timeline
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Your own recent attendance activity as manager.
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
                </tr>
              </thead>
              <tbody>
                {own.daily_work.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="px-6 py-8 text-center text-slate-500">
                      No attendance records available yet.
                    </td>
                  </tr>
                ) : (
                  timelinePagination.paginatedItems.map((item, index) => (
                    <tr
                      key={`${item.date}-${index}`}
                      className="border-t border-slate-100 transition hover:bg-slate-50/80"
                    >
                      <td className="px-6 py-4 font-medium text-slate-900">
                        {item.date}
                      </td>
                      <td className="px-6 py-4 text-slate-700">
                        {item.punch_in || "--"}
                      </td>
                      <td className="px-6 py-4 text-slate-700">
                        {item.punch_out === "Pending" ? (
                          <span className="font-medium text-amber-600">
                            Pending
                          </span>
                        ) : (
                          item.punch_out || "--"
                        )}
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
          <Pagination
            page={timelinePagination.page}
            setPage={timelinePagination.setPage}
            pageSize={timelinePagination.pageSize}
            changePageSize={timelinePagination.changePageSize}
            total={timelinePagination.total}
            pageCount={timelinePagination.pageCount}
            itemLabel="records"
          />
        </section>

      </div>
    </Layout>
  );
}

function mergeDashboard(payload) {
  return {
    own_summary: {
      ...emptyDashboard.own_summary,
      ...(payload?.own_summary || {}),
      daily_work: Array.isArray(payload?.own_summary?.daily_work)
        ? payload.own_summary.daily_work
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
