import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Calendar,
  Download,
  FileSpreadsheet,
  Settings,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import Loader from "../components/common/Loader";
import Pagination from "../components/common/Pagination";
import { usePagination } from "../hooks/usePagination";
import API from "../api/axios";
import { usePopup } from "../context/PopupContext";
import { useRealtime } from "../context/RealtimeContext";
import { useSite } from "../context/SiteContext";

export default function Reports() {
  const { showPopup } = usePopup();
  const { querySiteId } = useSite();
  const today = new Date();
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(defaultMonth);
  const [exporting, setExporting] = useState(false);
  
  const [reportType, setReportType] = useState("basic"); // "basic" | "duration"
  const [previewLoading, setPreviewLoading] = useState(false);
  const [reportData, setReportData] = useState(null);
  const previewRows = useMemo(
    () => reportData?.register_rows || [],
    [reportData?.register_rows]
  );
  const pagination = usePagination(previewRows);

  const loadPreviewData = useCallback(async (targetMonth) => {
    if (!targetMonth) return;
    setPreviewLoading(true);
    try {
      const res = await API.get("/attendance/team-attendance/", {
        params: { month: targetMonth, site_id: querySiteId, page: "all" },
      });
      setReportData(res.data);
    } catch (err) {
      console.error("Preview data error:", err);
      showPopup("Unable to load preview data for this month", "error");
      setReportData(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [querySiteId, showPopup]);

  useEffect(() => {
    loadPreviewData(month);
  }, [loadPreviewData, month]);

  useRealtime("attendance_update", () => loadPreviewData(month));
  useRealtime("leave_update", () => loadPreviewData(month));

  const formatCell = (cell, type) => {
    if (!cell) return "--";
    if (type === "duration") {
      if (cell.punch_in && cell.punch_in !== "--") {
        const inTime = cell.punch_in;
        const outTime = cell.punch_out && cell.punch_out !== "--" ? cell.punch_out : "In Progress";
        return `${inTime} - ${outTime}`;
      }
    }
    return cell.code;
  };

  const cellCodeStyle = (val) => {
    if (val === "P") return "bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold";
    if (val === "A") return "bg-rose-50 text-rose-700 border border-rose-200 font-bold";
    if (val === "WO") return "bg-slate-100 text-slate-500 border border-slate-200 font-medium";
    if (val === "H") return "bg-teal-50 text-teal-700 border border-teal-200 font-bold";
    if (val === "L") return "bg-violet-50 text-violet-700 border border-violet-200 font-bold";
    if (val === "IP" || val === "PR") return "bg-amber-50 text-amber-700 border border-amber-200 font-bold";
    if (val === "RJ") return "bg-slate-200 text-slate-700 border border-slate-300 font-medium";
    if (val === "--") return "bg-slate-50 text-slate-400 border border-slate-200";
    // Check if it's duration (contains a hyphen and is not "--")
    if (val.includes("-") && val !== "--") {
      return "bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold px-2 text-[9px]";
    }
    return "bg-slate-50 text-slate-600 border border-slate-200";
  };

  const sanitizeCsvValue = (val) => {
    if (val === null || val === undefined) return '""';
    let str = typeof val === "object" ? JSON.stringify(val) : String(val);
    const trimmed = str.trimStart();
    if (trimmed.length > 0 && ["=", "+", "-", "@", "\t", "\r"].includes(trimmed[0])) {
      str = "'" + str;
    }
    return `"${str.replace(/"/g, '""')}"`;
  };

  const downloadCsv = (filename, rows) => {
    const csv = rows
      .map((row) =>
        row
          .map(sanitizeCsvValue)
          .join(",")
      )
      .join("\n");

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportMonthlyAttendance = async () => {
    setExporting(true);
    try {
      const res = await API.get("/attendance/team-attendance/", {
        params: { month, site_id: querySiteId, page: "all" },
      });

      const registerDates = Array.isArray(res.data?.register_dates) ? res.data.register_dates : [];
      const registerRows = Array.isArray(res.data?.register_rows) ? res.data.register_rows : [];

      if (registerRows.length === 0) {
        showPopup("No attendance records found for the selected month", "warning");
        setExporting(false);
        return;
      }

      const header = [
        "Emp Code",
        "Emp Name",
        ...registerDates.map((day) => `${day.day} ${day.weekday}`),
        "Present Days",
        "Leave Days",
        "Pending Approvals",
        "Absent Days",
        "Holidays",
        "Shortfall Days",
        "Total Work Hours",
      ];

      const csvRows = registerRows.map((row) => [
        row.employee_code,
        row.employee_name || row.username,
        ...row.cells.map((cell) => formatCell(cell, reportType)),
        row.present_marks,
        row.leave_marks,
        row.pending_marks,
        row.absent_marks,
        row.holiday_marks || 0,
        row.shortfall_days,
        Number(row.total_work_hours || 0).toFixed(2),
      ]);

      downloadCsv(`attendance-report-${month}-${reportType}.csv`, [header, ...csvRows]);
      showPopup("Monthly attendance report exported successfully", "success");
    } catch (err) {
      console.error("Export monthly attendance error:", err.response?.data || err.message);
      showPopup(
        err.response?.data?.error || "Unable to export monthly attendance report",
        "error"
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Top Banner */}
        <section className="relative overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#1e1b4b_0%,#312e81_40%,#4338ca_100%)] px-8 py-8 text-white shadow-xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.14),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(129,140,248,0.22),_transparent_32%)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-indigo-100">
                <BarChart3 size={14} />
                Reports & Excel
              </p>
              <h1 className="text-3xl font-bold tracking-tight">
                Workforce Reports Center
              </h1>
              <p className="mt-3 text-sm text-slate-200">
                Generate, preview, and export customized monthly attendance registries and payroll reports.
              </p>
            </div>
          </div>
        </section>

        {/* Configuration Card */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-4 pb-4 border-b border-slate-100">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700 shrink-0">
              <FileSpreadsheet size={24} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Custom Monthly Attendance Report</h2>
              <p className="mt-1 text-sm text-slate-500">
                Select your parameters below to preview and download customized daily attendance logs with optional work hour ranges.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-6 sm:grid-cols-3 items-end">
            <label className="block">
              <span className="text-sm font-medium text-slate-700 inline-flex items-center gap-1.5">
                <Calendar size={14} className="text-slate-500" />
                Select Month
              </span>
              <input
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700 inline-flex items-center gap-1.5">
                <Settings size={14} className="text-slate-500" />
                Report Format Type
              </span>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-400 focus:bg-white"
              >
                <option value="basic">Basic Attendance (P / A / L / WO)</option>
                <option value="duration">Attendance with Duration (Punch In/Out Times)</option>
              </select>
            </label>

            <button
              onClick={handleExportMonthlyAttendance}
              disabled={exporting || previewLoading}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-900 px-6 py-3.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-75 h-fit cursor-pointer"
            >
              <Download size={16} />
              {exporting ? "Exporting..." : "Export CSV Report"}
            </button>
          </div>
        </section>

        {/* Live Preview Section */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm overflow-hidden">
          <div className="flex flex-col gap-2 border-b border-slate-100 pb-4 mb-4">
            <h2 className="text-xl font-semibold text-slate-900">Live Export Preview</h2>
            <p className="text-sm text-slate-500">
              A real-time snapshot of the workforce attendance register demonstrating the column layouts for the selected month and format type.
            </p>
          </div>

          {previewLoading ? (
            <div className="py-16 text-center">
              <Loader />
              <p className="mt-2 text-sm text-slate-500">Generating live preview data...</p>
            </div>
          ) : !reportData || !reportData.register_rows || reportData.register_rows.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <p className="text-sm font-medium">No records found for the month of {month}.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3.5 py-1.5 text-xs font-semibold text-indigo-700">
                  Showing {pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1}–{Math.min(pagination.page * pagination.pageSize, pagination.total)} of {pagination.total} total staff profiles
                </span>
                <span className="text-xs text-slate-400">
                  Scroll horizontally to review all dates and metrics columns
                </span>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <table className="min-w-full text-xs text-left border-collapse">
                  <thead className="bg-slate-50 text-slate-600 uppercase tracking-wider font-semibold border-b border-slate-200 select-none">
                    <tr>
                      <th className="px-4 py-3 border-r border-slate-200 min-w-[100px] sticky left-0 bg-slate-50 z-10">Emp Code</th>
                      <th className="px-4 py-3 border-r border-slate-200 min-w-[150px] sticky left-[100px] bg-slate-50 z-10 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">Emp Name</th>
                      {reportData.register_dates.map((day) => (
                        <th key={day.date} className="px-3 py-3 border-r border-slate-200 text-center min-w-[60px]">
                          {day.day}
                          <span className="block text-[9px] font-normal text-slate-400">{day.weekday}</span>
                        </th>
                      ))}
                      <th className="px-3 py-3 border-r border-slate-200 text-center min-w-[70px]">Present</th>
                      <th className="px-3 py-3 border-r border-slate-200 text-center min-w-[60px]">Leave</th>
                      <th className="px-3 py-3 border-r border-slate-200 text-center min-w-[60px]">Pending</th>
                      <th className="px-3 py-3 border-r border-slate-200 text-center min-w-[60px]">Absent</th>
                      <th className="px-3 py-3 border-r border-slate-200 text-center min-w-[60px]">Holidays</th>
                      <th className="px-3 py-3 border-r border-slate-200 text-center min-w-[70px]">Shortfall</th>
                      <th className="px-3 py-3 text-center min-w-[80px]">Work Hours</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 bg-white">
                    {pagination.pageItems.map((row) => (
                      <tr key={row.user_id} className="hover:bg-slate-50/50 transition">
                        <td className="px-4 py-3 font-medium text-slate-900 border-r border-slate-200 sticky left-0 bg-white">{row.employee_code}</td>
                        <td className="px-4 py-3 font-medium text-slate-900 border-r border-slate-200 sticky left-[100px] bg-white shadow-[2px_0_5px_rgba(0,0,0,0.05)]">{row.employee_name || row.username}</td>
                        {row.cells.map((cell) => {
                          const formatted = formatCell(cell, reportType);
                          return (
                            <td key={cell.date} className="px-2 py-3 border-r border-slate-200 text-center min-w-[65px]">
                              <span className={`inline-flex items-center justify-center rounded-lg px-2 py-1 text-[10px] ${cellCodeStyle(formatted)}`}>
                                {formatted}
                              </span>
                            </td>
                          );
                        })}
                        <td className="px-3 py-3 text-center font-bold text-emerald-700 border-r border-slate-200">{row.present_marks}</td>
                        <td className="px-3 py-3 text-center text-slate-600 border-r border-slate-200">{row.leave_marks}</td>
                        <td className="px-3 py-3 text-center text-amber-700 border-r border-slate-200">{row.pending_marks}</td>
                        <td className="px-3 py-3 text-center text-rose-700 border-r border-slate-200">{row.absent_marks}</td>
                        <td className="px-3 py-3 text-center font-bold text-teal-700 border-r border-slate-200">{row.holiday_marks || 0}</td>
                        <td className="px-3 py-3 text-center text-red-600 border-r border-slate-200">{row.shortfall_days}</td>
                        <td className="px-3 py-3 text-center font-bold text-slate-800">{Number(row.total_work_hours || 0).toFixed(1)}h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination {...pagination} itemLabel="employees" />
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}
