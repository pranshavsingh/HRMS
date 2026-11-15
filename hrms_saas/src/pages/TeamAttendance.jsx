import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  Download,
  Eye,
  FileSpreadsheet,
  RefreshCw,
  Search,
  Users,
  XCircle,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import Loader from "../components/common/Loader";
import API from "../api/axios";
import { usePopup } from "../context/PopupContext";
import { useRealtime } from "../context/RealtimeContext";


const emptyData = {
  summary: {
    month: "",
    month_label: "",
    team_members: 0,
    present_today: 0,
    total_present_marks: 0,
    total_leave_marks: 0,
    total_pending_marks: 0,
    total_absent_marks: 0,
    total_shortfall_days: 0,
    total_work_hours: 0,
  },
  employees: [],
  register_dates: [],
  register_rows: [],
  selected_employee_detail: null,
};

const codeStyles = {
  P: "bg-emerald-50 text-emerald-700",
  PR: "bg-amber-50 text-amber-700",
  IP: "bg-cyan-50 text-cyan-700",
  RJ: "bg-rose-50 text-rose-700",
  L: "bg-violet-50 text-violet-700",
  A: "bg-slate-100 text-slate-700",
  WO: "bg-slate-200 text-slate-700",
};

function formatHours(value) {
  return `${Number(value || 0).toFixed(2)}h`;
}

function downloadCsv(filename, rows) {
  const csv = rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
        .join(",")
    )
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function TeamAttendance() {
  const { showPopup } = usePopup();
  const today = new Date();
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 5, 1);
  const defaultDetailStart = `${sixMonthsAgo.getFullYear()}-${String(
    sixMonthsAgo.getMonth() + 1
  ).padStart(2, "0")}-01`;
  const defaultDetailEnd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(today.getDate()).padStart(2, "0")}`;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState(emptyData);
  const [month, setMonth] = useState(defaultMonth);
  const [employeeId, setEmployeeId] = useState("");
  const [detailStart, setDetailStart] = useState(defaultDetailStart);
  const [detailEnd, setDetailEnd] = useState(defaultDetailEnd);
  const [search, setSearch] = useState("");
  const [photoModal, setPhotoModal] = useState(null);

  const fetchAttendance = useCallback(async (showLoader = true) => {
    if (showLoader) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const params = {
        month,
        detail_start: detailStart,
        detail_end: detailEnd,
      };
      if (employeeId) {
        params.employee_id = employeeId;
      }
      const res = await API.get("/attendance/team-attendance/", { params });
      setData({
        ...emptyData,
        ...(res.data || {}),
        summary: {
          ...emptyData.summary,
          ...(res.data?.summary || {}),
        },
        employees: Array.isArray(res.data?.employees) ? res.data.employees : [],
        register_dates: Array.isArray(res.data?.register_dates) ? res.data.register_dates : [],
        register_rows: Array.isArray(res.data?.register_rows) ? res.data.register_rows : [],
        selected_employee_detail: res.data?.selected_employee_detail || null,
      });
    } catch (err) {
      console.error("Team attendance fetch error:", err.response?.data || err.message);
      showPopup(err.response?.data?.error || "Unable to load team attendance", "error");
      setData(emptyData);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [detailEnd, detailStart, employeeId, month]);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  useRealtime("attendance_update", () => fetchAttendance(false));
  useRealtime("leave_update", () => fetchAttendance(false));

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data.register_rows.filter((row) => {
      if (!query) return true;
      return [row.employee_name, row.username, row.employee_code, row.today_status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [data.register_rows, search]);

  const handleApplyDetailRange = () => {
    fetchAttendance(false);
  };

  const exportRegister = () => {
    const header = [
      "Emp Code",
      "Emp Name",
      ...data.register_dates.map((day) => `${day.day} ${day.weekday}`),
      "Present",
      "Leave",
      "Pending",
      "Absent",
      "Shortfall Days",
      "Working Hours",
    ];

    const rows = filteredRows.map((row) => [
      row.employee_code,
      row.employee_name || row.username,
      ...row.cells.map((cell) => cell.code),
      row.present_marks,
      row.leave_marks,
      row.pending_marks,
      row.absent_marks,
      row.shortfall_days,
      Number(row.total_work_hours || 0).toFixed(2),
    ]);

    downloadCsv(`team-attendance-${data.summary.month || month}.csv`, [header, ...rows]);
  };

  const exportEmployeeHistory = () => {
    if (!data.selected_employee_detail) return;
    const detail = data.selected_employee_detail;
    const header = [
      "Date",
      "Status",
      "Punch In",
      "Punch Out",
      "Work Hours",
      "Punch In Review",
      "Punch Out Review",
      "Under Target",
    ];
    const rows = detail.history.map((item) => [
      item.date,
      item.status,
      item.punch_in,
      item.punch_out,
      Number(item.work_hours || 0).toFixed(2),
      item.punch_in_status,
      item.punch_out_status,
      item.under_target ? "Yes" : "No",
    ]);

    downloadCsv(
      `${detail.username}-attendance-${detail.range_start}-to-${detail.range_end}.csv`,
      [header, ...rows]
    );
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
        <section className="relative overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_45%,#0f766e_100%)] px-8 py-8 text-white shadow-xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.12),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(45,212,191,0.18),_transparent_34%)]" />
          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-cyan-100">
                <FileSpreadsheet size={14} />
                Team Attendance
              </p>
              <h1 className="text-3xl font-bold tracking-tight">
                Review your full team attendance register and drill into any employee
              </h1>
              <p className="mt-3 text-sm text-slate-200">
                See the full monthly attendance sheet, export it to Excel, and open
                any team member&apos;s last 6 months attendance with date-wise export.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <HeroTile label="Members" value={data.summary.team_members} />
              <HeroTile label="Present Today" value={data.summary.present_today} />
              <HeroTile label="Month Hours" value={formatHours(data.summary.total_work_hours)} />
              <HeroTile label="Shortfall Days" value={data.summary.total_shortfall_days} />
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Attendance Controls</h2>
              <p className="mt-1 text-sm text-slate-500">
                Switch month, search team members, and export the register or employee history.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => fetchAttendance(false)}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
                Refresh
              </button>
              <button
                onClick={exportRegister}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                <Download size={16} />
                Export Register
              </button>
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[0.9fr_1.2fr_1fr]">
            <label className="block">
              <span className="mb-2 text-sm font-medium text-slate-700">Month</span>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              />
            </label>

            <label className="block">
              <span className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                <Search size={16} />
                Search Team
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by employee name or code"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              />
            </label>

            <label className="block">
              <span className="mb-2 text-sm font-medium text-slate-700">Employee Detail</span>
              <select
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              >
                <option value="">All Team Members</option>
                {data.employees.map((employee) => (
                  <option key={employee.user_id} value={employee.user_id}>
                    {employee.employee_name || employee.username}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Monthly Team Attendance Register</h2>
              <p className="mt-1 text-sm text-slate-500">
                {data.summary.month_label || "Selected month"} attendance sheet for all direct reports.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-left font-semibold">Emp</th>
                  {data.register_dates.map((day) => (
                    <th
                      key={day.date}
                      className={`min-w-[72px] px-2 py-3 text-center font-semibold ${
                        day.is_week_off ? "bg-slate-100 text-slate-700" : ""
                      }`}
                    >
                      <div>{day.day}</div>
                      <div className="mt-1 text-[10px]">{day.weekday}</div>
                    </th>
                  ))}
                  <th className="px-3 py-3 text-center font-semibold">P</th>
                  <th className="px-3 py-3 text-center font-semibold">L</th>
                  <th className="px-3 py-3 text-center font-semibold">PR</th>
                  <th className="px-3 py-3 text-center font-semibold">A</th>
                  <th className="px-3 py-3 text-center font-semibold">Short</th>
                  <th className="px-3 py-3 text-center font-semibold">Hours</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={data.register_dates.length + 7}
                      className="px-6 py-10 text-center text-sm text-slate-500"
                    >
                      No team attendance rows match this search.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map((row) => (
                    <tr key={row.user_id} className="border-t border-slate-100">
                      <td className="sticky left-0 z-10 bg-white px-4 py-3">
                        <div className="font-semibold text-slate-900">{row.employee_name || row.username}</div>
                        <div className="mt-1 text-[11px] text-slate-500">{row.employee_code}</div>
                      </td>
                      {row.cells.map((cell) => (
                        <td key={cell.date} className="px-1 py-2 text-center border-r border-slate-50 last:border-r-0">
                          <div className="flex flex-col items-center gap-1 min-w-[64px]">
                            <span
                              title={`${cell.date} | ${cell.punch_in} - ${cell.punch_out} | ${formatHours(cell.work_hours)}`}
                              className={`inline-flex min-w-[32px] justify-center rounded px-1.5 py-0.5 text-[10px] font-bold ${codeStyles[cell.code] || codeStyles.A}`}
                            >
                              {cell.code}
                            </span>
                            {cell.code !== "A" && cell.code !== "WO" && (
                              <div className="text-[9px] text-slate-500 font-mono flex flex-col items-center leading-tight">
                                <span>{cell.punch_in}</span>
                                <span>{cell.punch_out}</span>
                                {(cell.punch_in_photo || cell.punch_out_photo) && (
                                  <button
                                    onClick={() => setPhotoModal({
                                      employeeName: row.employee_name || row.username,
                                      date: cell.date,
                                      punchIn: cell.punch_in,
                                      punchOut: cell.punch_out,
                                      punchInPhoto: cell.punch_in_photo,
                                      punchOutPhoto: cell.punch_out_photo,
                                    })}
                                    className="mt-1 text-slate-400 hover:text-slate-900 transition focus:outline-none cursor-pointer"
                                    title="View punch photos"
                                  >
                                    <Eye size={11} />
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      ))}
                      <td className="px-3 py-3 text-center font-semibold text-slate-900">{row.present_marks}</td>
                      <td className="px-3 py-3 text-center font-semibold text-slate-900">{row.leave_marks}</td>
                      <td className="px-3 py-3 text-center font-semibold text-amber-700">{row.pending_marks}</td>
                      <td className="px-3 py-3 text-center font-semibold text-slate-700">{row.absent_marks}</td>
                      <td className="px-3 py-3 text-center font-semibold text-rose-700">{row.shortfall_days}</td>
                      <td className="px-3 py-3 text-center font-semibold text-slate-900">{formatHours(row.total_work_hours)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {data.selected_employee_detail ? (
          <div className="space-y-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">
                    Employee 6-Month Attendance Detail
                  </h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {data.selected_employee_detail.employee_name} | {data.selected_employee_detail.range_start} to {data.selected_employee_detail.range_end}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={exportEmployeeHistory}
                    className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    <Download size={16} />
                    Export Employee
                  </button>
                </div>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <MetricCard title="Present Days" value={data.selected_employee_detail.summary.present_days} subtitle="Attendance rows in range" />
                <MetricCard title="Leave Days" value={data.selected_employee_detail.summary.leave_days} subtitle="Approved leave overlap" />
                <MetricCard title="Work Hours" value={formatHours(data.selected_employee_detail.summary.total_work_hours)} subtitle="Counted approved hours" />
                <MetricCard title="Shortfall Days" value={data.selected_employee_detail.summary.shortfall_days} subtitle="Approved days below 8h" />
                <MetricCard title="Employee Code" value={data.selected_employee_detail.username} subtitle="Selected team member" />
              </div>

              <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1fr_auto_auto]">
                <label className="block">
                  <span className="mb-2 text-sm font-medium text-slate-700">Detail Start</span>
                  <input
                    type="date"
                    value={detailStart}
                    onChange={(e) => setDetailStart(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 text-sm font-medium text-slate-700">Detail End</span>
                  <input
                    type="date"
                    value={detailEnd}
                    onChange={(e) => setDetailEnd(e.target.value)}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
                  />
                </label>
                <button
                  onClick={handleApplyDetailRange}
                  className="self-end inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
                >
                  <CalendarDays size={16} />
                  Apply Range
                </button>
                <button
                  onClick={exportEmployeeHistory}
                  className="self-end inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  <FileSpreadsheet size={16} />
                  Date-wise Export
                </button>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">Last 6 Months Snapshot</h3>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Month</th>
                      <th className="px-4 py-3 font-semibold">Present Days</th>
                      <th className="px-4 py-3 font-semibold">Leave Days</th>
                      <th className="px-4 py-3 font-semibold">Work Hours</th>
                      <th className="px-4 py-3 font-semibold">Shortfall Days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.selected_employee_detail.monthly_breakdown.map((item) => (
                      <tr key={item.month} className="border-t border-slate-100">
                        <td className="px-4 py-3 font-medium text-slate-900">{item.month}</td>
                        <td className="px-4 py-3 text-slate-700">{item.present_days}</td>
                        <td className="px-4 py-3 text-slate-700">{item.leave_days}</td>
                        <td className="px-4 py-3 text-slate-700">{formatHours(item.total_work_hours)}</td>
                        <td className="px-4 py-3 text-slate-700">{item.shortfall_days}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-6 py-5">
                <h3 className="text-lg font-semibold text-slate-900">Attendance History</h3>
                <p className="mt-1 text-sm text-slate-500">
                  Detailed attendance history for the selected employee.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Date</th>
                      <th className="px-6 py-4 font-semibold">Status</th>
                      <th className="px-6 py-4 font-semibold">Punch In</th>
                      <th className="px-6 py-4 font-semibold">Punch Out</th>
                      <th className="px-6 py-4 font-semibold">Hours</th>
                      <th className="px-6 py-4 font-semibold">Review</th>
                      <th className="px-6 py-4 font-semibold">Photos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.selected_employee_detail.history.map((item, index) => (
                      <tr key={`${item.date}-${index}`} className="border-t border-slate-100">
                        <td className="px-6 py-4 font-medium text-slate-900">{item.date}</td>
                        <td className="px-6 py-4 text-slate-700">{item.status}</td>
                        <td className="px-6 py-4 text-slate-700">{item.punch_in}</td>
                        <td className="px-6 py-4 text-slate-700">{item.punch_out}</td>
                        <td className="px-6 py-4 text-slate-700">{formatHours(item.work_hours)}</td>
                        <td className="px-6 py-4 text-slate-700 font-medium">
                          {item.punch_in_status}/{item.punch_out_status}
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          {item.punch_in_photo || item.punch_out_photo ? (
                            <button
                              onClick={() => setPhotoModal({
                                employeeName: data.selected_employee_detail.employee_name,
                                date: item.date,
                                punchIn: item.punch_in,
                                punchOut: item.punch_out,
                                punchInPhoto: item.punch_in_photo,
                                punchOutPhoto: item.punch_out_photo,
                              })}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 text-xs font-semibold transition cursor-pointer"
                            >
                              <Eye size={14} />
                              View Photos
                            </button>
                          ) : (
                            "--"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        ) : (
          <section className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center shadow-sm">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <Users size={28} />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-slate-900">
              Select a team member to open the 6-month attendance view
            </h3>
            <p className="mt-2 text-sm text-slate-500">
              You can export the full team register already, or choose one employee for detailed history.
            </p>
          </section>
        )}

        {photoModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm transition-opacity duration-300"
              onClick={() => setPhotoModal(null)}
            />

            {/* Modal Container */}
            <div className="relative w-full max-w-2xl transform overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl transition-all duration-300 flex flex-col gap-6">
              
              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">Attendance Photo Verification</h3>
                  <p className="text-sm text-slate-500 mt-1">
                    {photoModal.employeeName} | {photoModal.date}
                  </p>
                </div>
                <button
                  onClick={() => setPhotoModal(null)}
                  className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition cursor-pointer"
                >
                  <XCircle size={22} />
                </button>
              </div>

              {/* Photos Grid */}
              <div className="grid gap-6 md:grid-cols-2">
                {/* Punch In */}
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 flex flex-col items-center justify-center">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Punch In Image
                  </span>
                  <span className="text-sm text-slate-700 font-mono mb-4">
                    Time: {photoModal.punchIn || "--"}
                  </span>
                  {photoModal.punchInPhoto ? (
                    <img
                      src={photoModal.punchInPhoto.startsWith("http")
                        ? photoModal.punchInPhoto
                        : (photoModal.punchInPhoto.startsWith("/media")
                          ? `http://127.0.0.1:8000${photoModal.punchInPhoto}`
                          : `http://127.0.0.1:8000/media/${photoModal.punchInPhoto}`)}
                      alt="Punch In Verification"
                      className="w-full h-64 object-cover rounded-xl shadow-md border border-white"
                    />
                  ) : (
                    <div className="w-full h-64 flex flex-col items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                      <span className="text-xs font-medium">No Punch In Photo</span>
                    </div>
                  )}
                </div>

                {/* Punch Out */}
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 flex flex-col items-center justify-center">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Punch Out Image
                  </span>
                  <span className="text-sm text-slate-700 font-mono mb-4">
                    Time: {photoModal.punchOut || "--"}
                  </span>
                  {photoModal.punchOutPhoto ? (
                    <img
                      src={photoModal.punchOutPhoto.startsWith("http")
                        ? photoModal.punchOutPhoto
                        : (photoModal.punchOutPhoto.startsWith("/media")
                          ? `http://127.0.0.1:8000${photoModal.punchOutPhoto}`
                          : `http://127.0.0.1:8000/media/${photoModal.punchOutPhoto}`)}
                      alt="Punch Out Verification"
                      className="w-full h-64 object-cover rounded-xl shadow-md border border-white"
                    />
                  ) : (
                    <div className="w-full h-64 flex flex-col items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                      <span className="text-xs font-medium">No Punch Out Photo</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="flex justify-end border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setPhotoModal(null)}
                  className="rounded-2xl bg-slate-900 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 cursor-pointer"
                >
                  Close
                </button>
              </div>

            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

function HeroTile({ label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur-sm">
      <div className="text-xs uppercase tracking-wide text-cyan-100">{label}</div>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function MetricCard({ title, value, subtitle }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm text-slate-500">{title}</p>
      <h3 className="mt-2 text-2xl font-bold text-slate-900">{value}</h3>
      <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
    </div>
  );
}
