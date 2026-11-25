import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Clock3,
  Coffee,
  Eye,
  FileText,
  History,
  Image as ImageIcon,
  MapPin,
  RefreshCw,
  Sun,
  Timer,
  X,
  XCircle,
  AlertCircle
} from "lucide-react";
import Layout from "../components/layout/Layout";
import Loader from "../components/common/Loader";
import API from "../api/axios";
import { usePopup } from "../context/PopupContext";
import { useRealtime } from "../context/RealtimeContext";

const CODE_CONFIG = {
  P: { label: "Present", bg: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  IP: { label: "In Progress", bg: "bg-cyan-50 text-cyan-700 border-cyan-200", dot: "bg-cyan-500" },
  PR: { label: "Pending Review", bg: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500" },
  RJ: { label: "Rejected", bg: "bg-rose-50 text-rose-700 border-rose-200", dot: "bg-rose-500" },
  L: { label: "Leave", bg: "bg-purple-50 text-purple-700 border-purple-200", dot: "bg-purple-500" },
  H: { label: "Holiday", bg: "bg-teal-50 text-teal-700 border-teal-200", dot: "bg-teal-500" },
  WO: { label: "Weekly Off", bg: "bg-slate-100 text-slate-700 border-slate-200", dot: "bg-slate-400" },
  A: { label: "Absent", bg: "bg-red-50 text-red-700 border-red-200", dot: "bg-red-500" },
  "--": { label: "Upcoming", bg: "bg-gray-50 text-gray-400 border-gray-200", dot: "bg-gray-300" },
};

function formatHours(val) {
  const num = Number(val || 0);
  return `${num.toFixed(1)}h`;
}

export default function MonthlyRegister() {
  const { showPopup } = usePopup();

  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [registerData, setRegisterData] = useState(null);

  // Selected Day Detail Modal
  const [selectedCell, setSelectedCell] = useState(null);

  // Regularize Modal
  const [regularizeModalOpen, setRegularizeModalOpen] = useState(false);
  const [regularizeCell, setRegularizeCell] = useState(null);
  const [regularizeForm, setRegularizeForm] = useState({ punch_out_time: "", reason: "" });
  const [submittingRegularize, setSubmittingRegularize] = useState(false);

  const fetchRegister = useCallback(async (monthStr, showLoader = true) => {
    if (showLoader) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await API.get("/attendance/my-register/", {
        params: { month: monthStr },
      });
      setRegisterData(res.data?.data || res.data);
    } catch (err) {
      console.error("Failed to load monthly register:", err);
      showPopup(err?.response?.data?.error || "Unable to load monthly attendance register", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showPopup]);

  useEffect(() => {
    fetchRegister(selectedMonth, true);
  }, [fetchRegister, selectedMonth]);

  useRealtime("attendance_update", () => fetchRegister(selectedMonth, false));
  useRealtime("leave_update", () => fetchRegister(selectedMonth, false));
  useRealtime("realtime:connected", () => fetchRegister(selectedMonth, false));

  const handlePrevMonth = () => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const prev = new Date(y, m - 2, 1);
    const prevStr = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
    setSelectedMonth(prevStr);
  };

  const handleNextMonth = () => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const next = new Date(y, m, 1);
    const nextStr = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
    setSelectedMonth(nextStr);
  };

  const summary = registerData?.summary || {
    month_label: "",
    total_days: 0,
    present_marks: 0,
    absent_marks: 0,
    leave_marks: 0,
    holiday_marks: 0,
    week_off_marks: 0,
    pending_marks: 0,
    total_work_hours: 0,
    shortfall_days: 0,
  };

  const cells = registerData?.cells || [];

  const handleOpenRegularize = (cell) => {
    setSelectedCell(null);
    setRegularizeCell(cell);
    setRegularizeForm({ punch_out_time: "", reason: "" });
    setRegularizeModalOpen(true);
  };

  const handleRegularizeSubmit = async (e) => {
    e.preventDefault();
    if (!regularizeCell?.attendance_id) {
      showPopup("No punch-in record found to regularize for this date.", "error");
      return;
    }
    if (!regularizeForm.punch_out_time || !regularizeForm.reason.trim()) {
      showPopup("Please specify punch-out time and reason.", "error");
      return;
    }
    setSubmittingRegularize(true);
    try {
      await API.post("/attendance/regularize/", {
        attendance_id: regularizeCell.attendance_id,
        punch_out_time: regularizeForm.punch_out_time,
        reason: regularizeForm.reason.trim(),
      });
      showPopup("Regularization request submitted successfully!", "success");
      setRegularizeModalOpen(false);
      fetchRegister(selectedMonth, false);
    } catch (err) {
      showPopup(err?.response?.data?.error || "Failed to submit regularization", "error");
    } finally {
      setSubmittingRegularize(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6 pb-12">
        {/* Top Header Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-blue-600 text-xs font-bold tracking-wider uppercase mb-1">
              <CalendarDays size={14} />
              <span>Personal Attendance Register</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Monthly Attendance Register
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Complete calendar audit sheet for {summary.month_label || selectedMonth} with day-wise status, timings, and work hours.
            </p>
          </div>

          {/* Month Switcher Controls & Action Links */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center bg-slate-100 rounded-xl p-1 border border-slate-200">
              <button
                type="button"
                onClick={handlePrevMonth}
                aria-label="Previous Month"
                className="p-2 rounded-lg hover:bg-white text-slate-700 transition"
              >
                <ChevronLeft size={16} />
              </button>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => e.target.value && setSelectedMonth(e.target.value)}
                className="bg-transparent text-sm font-bold text-slate-800 px-2 py-1 outline-none border-none cursor-pointer"
              />
              <button
                type="button"
                onClick={handleNextMonth}
                aria-label="Next Month"
                className="p-2 rounded-lg hover:bg-white text-slate-700 transition"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <button
              type="button"
              onClick={() => fetchRegister(selectedMonth, false)}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition disabled:opacity-50"
            >
              <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
              <span>Sync</span>
            </button>

            <Link
              to="/history"
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-xl transition"
            >
              <History size={13} />
              <span>Punch Logs</span>
            </Link>
          </div>
        </div>

        {/* Overview Stat Counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Present</span>
            <span className="text-2xl font-black text-emerald-600 mt-1 block">{summary.present_marks}</span>
            <span className="text-[10px] text-slate-400">days attended</span>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Absent</span>
            <span className="text-2xl font-black text-rose-600 mt-1 block">{summary.absent_marks}</span>
            <span className="text-[10px] text-slate-400">missed days</span>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Leaves</span>
            <span className="text-2xl font-black text-purple-600 mt-1 block">{summary.leave_marks}</span>
            <span className="text-[10px] text-slate-400">approved leaves</span>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Holidays</span>
            <span className="text-2xl font-black text-teal-600 mt-1 block">{summary.holiday_marks}</span>
            <span className="text-[10px] text-slate-400">paid holidays</span>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Week Offs</span>
            <span className="text-2xl font-black text-slate-600 mt-1 block">{summary.week_off_marks}</span>
            <span className="text-[10px] text-slate-400">rest days</span>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Pending</span>
            <span className="text-2xl font-black text-amber-600 mt-1 block">{summary.pending_marks}</span>
            <span className="text-[10px] text-slate-400">awaiting review</span>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Total Hours</span>
            <span className="text-2xl font-black text-blue-600 mt-1 block">{summary.total_work_hours}h</span>
            <span className="text-[10px] text-slate-400">worked this month</span>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-3.5 shadow-sm">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Shortfall</span>
            <span className="text-2xl font-black text-orange-600 mt-1 block">{summary.shortfall_days}</span>
            <span className="text-[10px] text-slate-400">&lt; 8h shifts</span>
          </div>
        </div>

        {/* Legend */}
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-bold text-slate-500 uppercase text-[10px] tracking-wider">Legend:</span>
          <div className="flex flex-wrap items-center gap-2">
            {Object.entries(CODE_CONFIG).map(([code, cfg]) => (
              <span key={code} className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-bold text-[11px] border ${cfg.bg}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                <span>{code} – {cfg.label}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Calendar Register Matrix / Grid */}
        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 flex justify-center">
            <Loader text="Loading your monthly register..." />
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/50 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-800">
                  {summary.month_label} Daily Attendance Sheet
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Click on any day cell to inspect punch timestamps, location, photos, or request missed punch regularization.
                </p>
              </div>
              <span className="text-xs font-semibold text-slate-500 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs">
                {cells.length} Calendar Days
              </span>
            </div>

            {/* Grid Layout: Desktop 7-col or responsive table */}
            <div className="p-4 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
              {cells.map((cell) => {
                const cfg = CODE_CONFIG[cell.code] || CODE_CONFIG["--"];
                const isSunday = cell.weekday === "Sun" || cell.is_week_off;

                return (
                  <button
                    key={cell.date}
                    type="button"
                    onClick={() => setSelectedCell(cell)}
                    className={`text-left p-3 rounded-xl border transition relative flex flex-col justify-between min-h-[105px] group hover:shadow-md ${
                      isSunday ? "bg-slate-50/70 border-slate-200" : "bg-white border-slate-200 hover:border-blue-400"
                    }`}
                  >
                    {/* Top Row: Date & Status Badge */}
                    <div className="flex items-start justify-between w-full">
                      <div>
                        <span className="text-xs font-black text-slate-800 block">
                          {String(cell.day).padStart(2, "0")}
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">
                          {cell.weekday}
                        </span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[11px] font-black border tracking-wider ${cfg.bg}`}>
                        {cell.code}
                      </span>
                    </div>

                    {/* Middle: Work Hours & Label */}
                    <div className="my-1.5">
                      {cell.code === "P" || cell.code === "IP" || cell.code === "PR" ? (
                        <div className="flex items-center gap-1 text-slate-700 font-bold text-xs">
                          <Clock3 size={11} className="text-blue-500" />
                          <span>{cell.work_hours > 0 ? formatHours(cell.work_hours) : "--"}</span>
                        </div>
                      ) : cell.code === "H" ? (
                        <span className="text-[11px] font-semibold text-teal-700 truncate block max-w-full">
                          {cell.holiday_name || "Holiday"}
                        </span>
                      ) : cell.code === "L" ? (
                        <span className="text-[11px] font-semibold text-purple-700 truncate block">
                          {cell.leave_type ? `${cell.leave_type.toUpperCase()} Leave` : "On Leave"}
                        </span>
                      ) : cell.code === "WO" ? (
                        <span className="text-[11px] font-semibold text-slate-500 block">
                          Weekly Off
                        </span>
                      ) : cell.code === "A" ? (
                        <span className="text-[11px] font-bold text-red-600 block">
                          Absent
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400 block">--</span>
                      )}
                    </div>

                    {/* Bottom Row: In/Out Timings */}
                    <div className="text-[10px] text-slate-400 flex items-center justify-between border-t border-slate-100 pt-1 mt-1">
                      <span>In: {cell.punch_in || "--"}</span>
                      <span>Out: {cell.punch_out || "--"}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* DAY INSPECTION MODAL */}
      {selectedCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Attendance Detail</span>
                <h3 className="text-lg font-black text-slate-900 mt-0.5">
                  {selectedCell.date} ({selectedCell.weekday})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCell(null)}
                aria-label="Close modal"
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Status Pill */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-xs font-bold text-slate-600">Register Status</span>
                <span className={`px-2.5 py-1 rounded-md text-xs font-black border ${CODE_CONFIG[selectedCell.code]?.bg}`}>
                  {selectedCell.code} – {CODE_CONFIG[selectedCell.code]?.label}
                </span>
              </div>

              {/* Timings & Work Hours */}
              <div className="grid grid-cols-3 gap-2">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Punch In</span>
                  <span className="text-sm font-black text-slate-800 mt-1 block">{selectedCell.punch_in || "--"}</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-center">
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">Punch Out</span>
                  <span className="text-sm font-black text-slate-800 mt-1 block">{selectedCell.punch_out || "--"}</span>
                </div>
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-100 text-center">
                  <span className="text-[10px] font-bold text-blue-600 uppercase block">Hours</span>
                  <span className="text-sm font-black text-blue-800 mt-1 block">{formatHours(selectedCell.work_hours)}</span>
                </div>
              </div>

              {/* Extra Info: Holiday or Leave */}
              {selectedCell.holiday_name && (
                <div className="p-3 rounded-xl bg-teal-50 border border-teal-200 flex items-center gap-2 text-teal-800 text-xs font-bold">
                  <Sun size={15} />
                  <span>Company Holiday: {selectedCell.holiday_name}</span>
                </div>
              )}

              {selectedCell.leave_type && (
                <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 flex items-center gap-2 text-purple-800 text-xs font-bold">
                  <FileText size={15} />
                  <span>Approved Leave: {selectedCell.leave_type.toUpperCase()}</span>
                </div>
              )}

              {/* Photos */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <div>
                  <span className="text-xs font-bold text-slate-600 block mb-1">Punch In Photo</span>
                  {selectedCell.punch_in_photo ? (
                    <img
                      src={selectedCell.punch_in_photo}
                      alt="Punch In Photo"
                      className="w-full h-32 object-cover rounded-xl border border-slate-200"
                    />
                  ) : (
                    <div className="w-full h-24 bg-slate-100 rounded-xl flex flex-col items-center justify-center text-slate-400 text-xs font-semibold gap-1">
                      <ImageIcon size={18} />
                      <span>No Photo</span>
                    </div>
                  )}
                </div>

                <div>
                  <span className="text-xs font-bold text-slate-600 block mb-1">Punch Out Photo</span>
                  {selectedCell.punch_out_photo ? (
                    <img
                      src={selectedCell.punch_out_photo}
                      alt="Punch Out Photo"
                      className="w-full h-32 object-cover rounded-xl border border-slate-200"
                    />
                  ) : (
                    <div className="w-full h-24 bg-slate-100 rounded-xl flex flex-col items-center justify-center text-slate-400 text-xs font-semibold gap-1">
                      <ImageIcon size={18} />
                      <span>No Photo</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Regularization Trigger if incomplete */}
              {selectedCell.attendance_id && (!selectedCell.punch_out || selectedCell.punch_out === "--") && (
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => handleOpenRegularize(selectedCell)}
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition flex items-center justify-center gap-2"
                  >
                    <Clock size={14} />
                    <span>Regularize Missed Punch Out</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* REGULARIZATION MODAL */}
      {regularizeModalOpen && regularizeCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">Regularization Request</span>
                <h3 className="text-lg font-black text-slate-900 mt-0.5">
                  Regularize {regularizeCell.date}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRegularizeModalOpen(false)}
                aria-label="Close modal"
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleRegularizeSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Correct Punch Out Time (24h) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="time"
                  required
                  value={regularizeForm.punch_out_time}
                  onChange={(e) => setRegularizeForm({ ...regularizeForm, punch_out_time: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Reason for Regularization <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="e.g. Forgot punch-out due to client visit"
                  value={regularizeForm.reason}
                  onChange={(e) => setRegularizeForm({ ...regularizeForm, reason: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRegularizeModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingRegularize}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-sm transition disabled:opacity-50"
                >
                  {submittingRegularize ? "Submitting..." : "Submit Request"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
