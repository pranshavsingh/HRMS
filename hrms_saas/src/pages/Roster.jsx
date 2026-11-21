import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Calendar as CalendarIcon,
  Clock,
  Plus,
  Search,
  Filter,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Users,
  Repeat,
  ChevronLeft,
  ChevronRight,
  Moon,
  Sun,
  Shield,
  Layers,
  X,
  Ban,
  FileSpreadsheet,
  Coffee,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import Loader from "../components/common/Loader";
import { shiftsApi } from "../api/shifts.api";
import API from "../api/axios";
import SearchableEmployeeSelect from "../components/common/SearchableEmployeeSelect";
import { useRealtime } from "../context/RealtimeContext";
import { usePopup } from "../context/PopupContext";
import { useSite } from "../context/SiteContext";
import { useAuth } from "../context/AuthContext";
import "./Roster.css";

const dateOnly = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

// Formula injection protection for CSV export (BUG-RS13)
const sanitizeCsvValue = (val) => {
  if (val === null || val === undefined) return '""';
  const str = String(val).replace(/"/g, '""');
  if (/^[=+\-@\t\r]/.test(str) || /^[\s]+[=+\-@\t\r]/.test(str)) {
    return `"'${str}"`;
  }
  return `"${str}"`;
};

// Safe date formatting with readable weekday (BUG FIX 06)
const formatReadableDate = (dateStr) => {
  if (!dateStr) return "";
  const [year, month, day] = String(dateStr).slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return dateStr;
  const d = new Date(year, month - 1, day);
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${weekdays[d.getDay()]}, ${String(day).padStart(2, "0")} ${months[d.getMonth()]}`;
};

// Safe numeric working hours formatting (BUG FIX 07)
const formatWorkHours = (val) => {
  if (val === null || val === undefined || val === "") return "0.00";
  const num = Number(val);
  if (Number.isNaN(num) || !Number.isFinite(num) || num < 0) return "0.00";
  return num.toFixed(2);
};

export default function Roster() {
  const popup = usePopup();
  const popupRef = useRef(popup);
  useEffect(() => {
    popupRef.current = popup;
  }, [popup]);
  const { querySiteId, siteId } = useSite();
  const { role: authRole } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  // BUG-RS02: Reactive role from useAuth instead of stale localStorage
  const userRole = authRole || localStorage.getItem("role") || "employee";
  const isManagerOrAdmin = ["admin", "superadmin", "hr", "manager"].includes(userRole);
  const isAdminOrHr = ["admin", "superadmin", "hr"].includes(userRole);

  // BUG-RS01: Safe role-based tab initialization respecting URL ?tab= parameter
  const getInitialTab = () => {
    const requested = searchParams.get("tab");
    if (requested) {
      if (requested === "calendar" && isManagerOrAdmin) return "calendar";
      if ((requested === "assignments" || requested === "rotations") && isAdminOrHr) return requested;
      if (requested === "my-schedule") return "my-schedule";
    }
    return isManagerOrAdmin ? "calendar" : "my-schedule";
  };

  const [activeTab, setActiveTab] = useState(getInitialTab);
  const [loading, setLoading] = useState(true);

  // Synchronize activeTab when searchParams change externally
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam) {
      if (tabParam === "calendar" && isManagerOrAdmin) setActiveTab("calendar");
      else if ((tabParam === "assignments" || tabParam === "rotations") && isAdminOrHr) setActiveTab(tabParam);
      else if (tabParam === "my-schedule") setActiveTab("my-schedule");
    }
  }, [searchParams, isManagerOrAdmin, isAdminOrHr]);

  // --- Calendar State ---
  const [viewMode, setViewMode] = useState("weekly"); // daily, weekly, monthly
  const [currentDate, setCurrentDate] = useState(new Date());
  const [teamFilter, setTeamFilter] = useState("all");
  const [searchEmp, setSearchEmp] = useState("");
  const [calendarData, setCalendarData] = useState(null);
  const [draftRosters, setDraftRosters] = useState([]);

  // --- Assignments State ---
  const [assignments, setAssignments] = useState([]);
  const [assignFilterStatus, setAssignFilterStatus] = useState("all");
  const [assignSearch, setAssignSearch] = useState("");

  // --- Rotations State ---
  const [rotations, setRotations] = useState([]);
  const [selectedRotation, setSelectedRotation] = useState(null);
  const [rotationPreview, setRotationPreview] = useState(null);

  // --- My Roster State ---
  const [myRoster, setMyRoster] = useState(null);
  const [myRosterError, setMyRosterError] = useState("");
  const [retryingMyRoster, setRetryingMyRoster] = useState(false);

  // --- Shift Masters & Employees for Modals ---
  const [shiftList, setShiftList] = useState([]);
  const [employeeList, setEmployeeList] = useState([]);

  // --- Modals ---
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [newAssignmentModalOpen, setNewAssignmentModalOpen] = useState(false);
  const [_bulkModalOpen, setBulkModalOpen] = useState(false);
  const [newRotationModalOpen, setNewRotationModalOpen] = useState(false);
  const [enrollModalOpen, setEnrollModalOpen] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelTargetId, setCancelTargetId] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [previewModalOpen, setPreviewModalOpen] = useState(false);

  // Form states
  const [generateForm, setGenerateForm] = useState({
    start_date: dateOnly(new Date()),
    end_date: dateOnly(new Date(Date.now() + 7 * 86400000)),
    team_name: "",
    name: "",
  });

  const [assignmentForm, setAssignmentForm] = useState({
    user_id: "",
    shift_id: "",
    shift_version_id: "",
    effective_from: dateOnly(new Date()),
    effective_to: "",
    publish_immediately: true,
  });
  const [assignmentUserError, setAssignmentUserError] = useState("");

  const [_bulkForm, _setBulkForm] = useState({
    team_name: "",
    user_ids: [],
    shift_id: "",
    shift_version_id: "",
    effective_from: dateOnly(new Date()),
    effective_to: "",
  });

  const [rotationForm, setRotationForm] = useState({
    code: "",
    name: "",
    description: "",
    cycle_length_days: 7,
    steps: [
      { step_order: 1, shift_id: "", duration_days: 5, is_off_day: false },
      { step_order: 2, shift_id: "", duration_days: 2, is_off_day: true },
    ],
  });

  const [enrollForm, setEnrollForm] = useState({
    user_id: "",
    rotation_id: "",
    start_date: dateOnly(new Date()),
    offset_days: 0,
  });

  // Calculate current view date range
  const dateRange = useMemo(() => {
    const start = new Date(currentDate);
    const end = new Date(currentDate);

    if (viewMode === "daily") {
      // 1 day
    } else if (viewMode === "weekly") {
      const day = start.getDay();
      const diffToMonday = (day === 0 ? -6 : 1) - day;
      start.setDate(start.getDate() + diffToMonday);
      end.setDate(start.getDate() + 6);
    } else if (viewMode === "monthly") {
      start.setDate(1);
      end.setDate(1);
      end.setMonth(end.getMonth() + 1);
      end.setDate(0);
    }

    return {
      startDate: dateOnly(start),
      endDate: dateOnly(end),
    };
  }, [currentDate, viewMode]);

  // Load calendar
  const loadCalendar = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
      };
      if (querySiteId) params.site_id = querySiteId;
      const data = await shiftsApi.getRosterCalendar(params);
      setCalendarData(data);

      if (isAdminOrHr) {
        const drafts = await shiftsApi.listRosters({ status: "draft", site_id: querySiteId });
        setDraftRosters(drafts || []);
      }
    } catch (err) {
      popup?.showPopup(err?.response?.data?.error || "Failed to load calendar", "error");
    } finally {
      setLoading(false);
    }
  }, [dateRange.endDate, dateRange.startDate, isAdminOrHr, popup, querySiteId]);

  // Load assignments
  const loadAssignments = useCallback(async () => {
    try {
      setLoading(true);
      const params = { limit: 100 };
      if (querySiteId) params.site_id = querySiteId;
      if (assignFilterStatus !== "all") params.status = assignFilterStatus;
      const data = await shiftsApi.listAssignments(params);
      setAssignments(data.assignments || []);
    } catch (err) {
      popup?.showPopup(err?.response?.data?.error || "Failed to load assignments", "error");
    } finally {
      setLoading(false);
    }
  }, [assignFilterStatus, popup, querySiteId]);

  // Load rotations
  const loadRotations = useCallback(async () => {
    try {
      setLoading(true);
      const data = await shiftsApi.listRotations();
      setRotations(data || []);
    } catch (err) {
      popup?.showPopup(err?.response?.data?.error || "Failed to load rotations", "error");
    } finally {
      setLoading(false);
    }
  }, [popup]);

  // Load My Roster with dedicated error handling & retry state (BUG FIX 02)
  const loadMyRoster = useCallback(async (isRetry = false) => {
    try {
      if (isRetry) {
        setRetryingMyRoster(true);
      } else {
        setLoading(true);
      }
      setMyRosterError("");
      const data = await shiftsApi.getMyRoster();
      setMyRoster(data);
    } catch (err) {
      const errorMsg =
        err?.response?.data?.error ||
        (err?.response?.status >= 500
          ? "The server encountered an error while retrieving your schedule. Please try again."
          : err?.response?.status === 401
          ? "Your session has expired. Please refresh or log in again."
          : err?.response?.status === 403
          ? "You do not have permission to view this schedule."
          : !navigator.onLine
          ? "You are currently offline. Check your network connection and try again."
          : "Unable to load your shift schedule. Please check your connection and try again.");
      setMyRosterError(errorMsg);
      if (isRetry) {
        popupRef.current?.showPopup(errorMsg, "error");
      }
    } finally {
      setLoading(false);
      setRetryingMyRoster(false);
    }
  }, []);

  // Load masters (shifts & employees) - restricted to Admin and HR (BUG FIX 01)
  const loadMasters = useCallback(async () => {
    if (!isAdminOrHr) return;
    try {
      const sData = await shiftsApi.list({ is_active: true, limit: 100 });
      setShiftList(sData.items || []);
      try {
        const eData = await API.get("/auth/employees/", { params: { limit: 500, site_id: querySiteId } });
        const employees = Array.isArray(eData.data) ? eData.data : (eData.data?.records || eData.data?.data || []);
        setEmployeeList(employees);
      } catch {
        setEmployeeList([]);
      }
    } catch (err) {
      console.error(err);
    }
  }, [isAdminOrHr, querySiteId]);

  useEffect(() => {
    if (isAdminOrHr) {
      loadMasters();
    }
  }, [isAdminOrHr, loadMasters]);

  useEffect(() => {
    if (activeTab === "calendar" && isManagerOrAdmin) {
      loadCalendar();
    } else if (activeTab === "assignments" && isAdminOrHr) {
      loadAssignments();
    } else if (activeTab === "rotations" && isAdminOrHr) {
      loadRotations();
    } else if (activeTab === "my-schedule") {
      loadMyRoster();
    }
  }, [activeTab, isAdminOrHr, isManagerOrAdmin, loadAssignments, loadCalendar, loadMyRoster, loadRotations]);

  // BUG-RS10: Stabilized callback avoiding subscription churn on every render
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const handleRealtimeUpdate = useCallback(() => {
    const tab = activeTabRef.current;
    if (tab === "calendar") loadCalendar();
    else if (tab === "assignments") loadAssignments();
    else if (tab === "rotations") loadRotations();
    else if (tab === "my-schedule") loadMyRoster();
  }, [loadAssignments, loadCalendar, loadMyRoster, loadRotations]);

  useRealtime("schedule_update", handleRealtimeUpdate);

  // BUG-RS01: changeTab keeps URL searchParams in sync
  const changeTab = (tab) => {
    setGenerateModalOpen(false);
    setNewAssignmentModalOpen(false);
    setBulkModalOpen(false);
    setNewRotationModalOpen(false);
    setEnrollModalOpen(false);
    setCancelModalOpen(false);
    setPreviewModalOpen(false);
    setActiveTab(tab);
    setSearchParams({ tab }, { replace: true });
  };

  const visibleDates = useMemo(() => {
    const dates = [];
    const day = new Date(`${dateRange.startDate}T00:00:00Z`);
    const finalDay = new Date(`${dateRange.endDate}T00:00:00Z`);
    while (day <= finalDay) {
      dates.push(day.toISOString().slice(0, 10));
      day.setUTCDate(day.getUTCDate() + 1);
    }
    return dates;
  }, [dateRange]);
  const todayDate = dateOnly(new Date());

  // BUG-RS05: Extract available unique teams from calendar data
  const availableTeams = useMemo(() => {
    const teams = new Set();
    (calendarData?.employees || []).forEach((emp) => {
      if (emp.team && emp.team !== "Unassigned") teams.add(emp.team);
    });
    return Array.from(teams).sort();
  }, [calendarData]);

  // BUG-RS05: Reactive employee filter for Calendar grid
  const filteredEmployees = useMemo(() => {
    if (!calendarData?.employees) return [];
    let list = calendarData.employees;
    if (teamFilter !== "all") {
      list = list.filter((emp) => String(emp.team || "").toLowerCase() === teamFilter.toLowerCase());
    }
    if (searchEmp.trim()) {
      const q = searchEmp.toLowerCase().trim();
      list = list.filter((emp) =>
        String(emp.name || "").toLowerCase().includes(q) ||
        String(emp.email || "").toLowerCase().includes(q) ||
        String(emp.team || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [calendarData, teamFilter, searchEmp]);

  // BUG-RS06: Filtered assignments for Assignments tab
  const filteredAssignments = useMemo(() => {
    if (!assignments) return [];
    if (!assignSearch.trim()) return assignments;
    const q = assignSearch.toLowerCase().trim();
    return assignments.filter((a) =>
      `${a.first_name || ""} ${a.last_name || ""}`.toLowerCase().includes(q) ||
      String(a.email || "").toLowerCase().includes(q) ||
      String(a.shift_name || "").toLowerCase().includes(q) ||
      String(a.shift_code || "").toLowerCase().includes(q) ||
      String(a.team_name || "").toLowerCase().includes(q)
    );
  }, [assignments, assignSearch]);

  // BUG-RS13: Safe CSV Export for Team Roster Calendar
  const handleExportCalendarCsv = () => {
    if (!filteredEmployees.length || !visibleDates.length) {
      popup?.showPopup("No schedule data available to export for the current filters", "warning");
      return;
    }

    const headers = ["Employee Name", "Team", "Email", "Date", "Day", "Shift Name", "Shift Code", "Timings", "Work Hours", "Roster Status"];
    const rows = [];

    for (const emp of filteredEmployees) {
      for (const dateStr of visibleDates) {
        const slot = calendarData?.grid?.[emp.user_id]?.[dateStr];
        const dayOfWeek = new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
        rows.push([
          sanitizeCsvValue(emp.name),
          sanitizeCsvValue(emp.team || "Unassigned"),
          sanitizeCsvValue(emp.email || ""),
          sanitizeCsvValue(dateStr),
          sanitizeCsvValue(dayOfWeek),
          sanitizeCsvValue(slot ? slot.shift_name : "Weekly Off"),
          sanitizeCsvValue(slot ? slot.shift_code || "" : ""),
          sanitizeCsvValue(slot ? `${slot.start_time?.slice(0, 5)} - ${slot.end_time?.slice(0, 5)}${slot.is_overnight ? " (+1d)" : ""}` : "-"),
          sanitizeCsvValue(slot ? slot.total_work_hours : 0),
          sanitizeCsvValue(slot ? slot.roster_status : "off"),
        ]);
      }
    }

    const csvContent = "\uFEFF" + [headers.map(sanitizeCsvValue).join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `team_roster_${dateRange.startDate}_to_${dateRange.endDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    popup?.showPopup("Team roster exported successfully!", "success");
  };

  // BUG-RS04: Date navigation helpers with day-1 clamping to prevent month skipping
  const handlePrev = () => {
    const nextD = new Date(currentDate);
    if (viewMode === "daily") {
      nextD.setDate(nextD.getDate() - 1);
    } else if (viewMode === "weekly") {
      nextD.setDate(nextD.getDate() - 7);
    } else {
      nextD.setDate(1);
      nextD.setMonth(nextD.getMonth() - 1);
    }
    setCurrentDate(nextD);
  };

  const handleNext = () => {
    const nextD = new Date(currentDate);
    if (viewMode === "daily") {
      nextD.setDate(nextD.getDate() + 1);
    } else if (viewMode === "weekly") {
      nextD.setDate(nextD.getDate() + 7);
    } else {
      nextD.setDate(1);
      nextD.setMonth(nextD.getMonth() + 1);
    }
    setCurrentDate(nextD);
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Handler: Generate Roster
  const handleGenerateRoster = async (e) => {
    e.preventDefault();
    if (!siteId || siteId === "all" || siteId === "unassigned") {
      popup?.showPopup("Select one work site in the header before generating a roster", "warning");
      return;
    }
    try {
      setLoading(true);
      const res = await shiftsApi.generateDraftRoster({ ...generateForm, site_id: Number(siteId) });
      popup?.showPopup(`Draft roster generated: ${res.entries_count} entries created`, "success");
      setGenerateModalOpen(false);
      loadCalendar();
    } catch (err) {
      popup?.showPopup(err?.response?.data?.error || "Failed to generate roster", "error");
    } finally {
      setLoading(false);
    }
  };

  // Handler: Publish Roster
  const handlePublishRoster = async (headerId) => {
    if (!window.confirm("Publishing will freeze shift snapshots and make roster visible to employees. Proceed?")) return;
    try {
      setLoading(true);
      await shiftsApi.publishRoster(headerId);
      popup?.showPopup("Roster published successfully!", "success");
      loadCalendar();
    } catch (err) {
      popup?.showPopup(err?.response?.data?.error || "Failed to publish roster", "error");
    } finally {
      setLoading(false);
    }
  };

  // Handler: Create Fixed Assignment
  const handleCreateAssignment = async (e) => {
    e.preventDefault();
    if (!assignmentForm.user_id) {
      setAssignmentUserError("Please select a registered employee");
      return;
    }
    try {
      setLoading(true);
      const draft = await shiftsApi.createDraftAssignment({
        user_id: Number(assignmentForm.user_id),
        shift_id: Number(assignmentForm.shift_id),
        shift_version_id: Number(assignmentForm.shift_version_id),
        effective_from: assignmentForm.effective_from,
        effective_to: assignmentForm.effective_to || null,
      });

      if (assignmentForm.publish_immediately) {
        await shiftsApi.publishAssignment(draft.id);
        popup?.showPopup("Shift assignment created and published!", "success");
      } else {
        popup?.showPopup("Draft shift assignment created!", "success");
      }
      setNewAssignmentModalOpen(false);
      loadAssignments();
    } catch (err) {
      popup?.showPopup(err?.response?.data?.error || "Failed to create assignment", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRotation = async (e) => {
    e.preventDefault();
    const steps = rotationForm.steps.map((step, index) => ({
      step_order: index + 1,
      shift_id: step.is_off_day ? null : Number(step.shift_id),
      duration_days: Number(step.duration_days),
      is_off_day: Boolean(step.is_off_day),
    }));
    const invalidStep = steps.find((step) =>
      (!step.is_off_day && !step.shift_id) || !Number.isInteger(step.duration_days) || step.duration_days < 1
    );
    if (invalidStep || steps.length === 0) {
      popup?.showPopup("Choose a shift or weekly off and enter at least 1 day for every step.", "error");
      return;
    }

    try {
      setLoading(true);
      await shiftsApi.createRotation({
        code: rotationForm.code.trim(),
        name: rotationForm.name.trim(),
        description: rotationForm.description.trim() || null,
        cycle_length_days: steps.reduce((sum, step) => sum + step.duration_days, 0),
        steps,
      });
      popup?.showPopup("Rotation pattern created as a draft.", "success");
      setNewRotationModalOpen(false);
      setRotationForm({
        code: "",
        name: "",
        description: "",
        cycle_length_days: 7,
        steps: [
          { step_order: 1, shift_id: "", duration_days: 5, is_off_day: false },
          { step_order: 2, shift_id: "", duration_days: 2, is_off_day: true },
        ],
      });
      loadRotations();
    } catch (err) {
      popup?.showPopup(err?.response?.data?.error || "Failed to create rotation pattern", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleEnrollRotation = async (e) => {
    e.preventDefault();
    if (!selectedRotation || !enrollForm.user_id) return;
    try {
      setLoading(true);
      await shiftsApi.enrollRotation(selectedRotation.id, {
        user_id: Number(enrollForm.user_id),
        start_date: enrollForm.start_date,
        offset_days: Number(enrollForm.offset_days || 0),
        initial_step_order: Number(enrollForm.initial_step_order || 1),
      });
      popup?.showPopup("Employee enrolled in the rotation pattern.", "success");
      setEnrollModalOpen(false);
      setEnrollForm({ user_id: "", rotation_id: "", start_date: dateOnly(new Date()), offset_days: 0 });
      loadRotations();
    } catch (err) {
      popup?.showPopup(err?.response?.data?.error || "Failed to enroll employee", "error");
    } finally {
      setLoading(false);
    }
  };

  const handlePreviewRotation = async (rotation) => {
    try {
      const start = dateOnly(new Date());
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 13);
      const preview = await shiftsApi.previewRotation(rotation.id, { startDate: start, endDate: dateOnly(endDate) });
      setSelectedRotation(rotation);
      setRotationPreview(preview);
      setPreviewModalOpen(true);
    } catch (err) {
      popup?.showPopup(err?.response?.data?.error || "Failed to preview rotation", "error");
    }
  };

  const updateRotationStep = (index, changes) => {
    setRotationForm((current) => ({
      ...current,
      steps: current.steps.map((step, stepIndex) =>
        stepIndex === index ? { ...step, ...changes } : step
      ),
    }));
  };

  const addRotationStep = () => {
    setRotationForm((current) => ({
      ...current,
      steps: [
        ...current.steps,
        { step_order: current.steps.length + 1, shift_id: "", duration_days: 1, is_off_day: false },
      ],
    }));
  };

  // Handler: Cancel Assignment
  const handleConfirmCancel = async () => {
    try {
      setLoading(true);
      await shiftsApi.cancelAssignment(cancelTargetId, cancelReason);
      popup?.showPopup("Assignment cancelled", "success");
      setCancelModalOpen(false);
      loadAssignments();
    } catch (err) {
      popup?.showPopup(err?.response?.data?.error || "Failed to cancel assignment", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6 roster-page">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-900 border border-gray-800 p-6 rounded-xl">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-3">
              <CalendarIcon className="text-emerald-500" size={28} />
              Work Schedules
            </h1>
            <p className="text-sm text-gray-400 mt-1">
              Plan employee shifts, create team rosters, and view your upcoming schedule.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (activeTab === "calendar") loadCalendar();
                else if (activeTab === "assignments") loadAssignments();
                else if (activeTab === "rotations") loadRotations();
                else loadMyRoster();
              }}
              className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition"
            >
              <RefreshCw size={16} /> Refresh
            </button>

            {isAdminOrHr && activeTab === "calendar" && (
              <button
                onClick={() => setGenerateModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition shadow-lg shadow-emerald-900/30"
              >
                <Plus size={16} /> Generate Roster
              </button>
            )}

            {isAdminOrHr && activeTab === "assignments" && (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setAssignmentUserError("");
                    if (employeeList.length === 0) loadMasters();
                    setNewAssignmentModalOpen(true);
                  }}
                  className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition"
                >
                  <Plus size={16} /> Assign Shift
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-gray-800 gap-2">
          {isManagerOrAdmin && (
            <button
              onClick={() => changeTab("calendar")}
              className={`px-4 py-3 text-sm font-medium border-b-2 flex items-center gap-2 transition ${
                activeTab === "calendar"
                  ? "border-emerald-500 text-emerald-400"
                  : "border-transparent text-gray-400 hover:text-gray-200"
              }`}
            >
              <CalendarIcon size={16} /> Roster Calendar
            </button>
          )}

          {isAdminOrHr && (
            <>
              <button
                onClick={() => changeTab("assignments")}
                className={`px-4 py-3 text-sm font-medium border-b-2 flex items-center gap-2 transition ${
                  activeTab === "assignments"
                    ? "border-emerald-500 text-emerald-400"
                    : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
              >
                <Users size={16} /> Shift Assignments
              </button>

              <button
                onClick={() => changeTab("rotations")}
                className={`px-4 py-3 text-sm font-medium border-b-2 flex items-center gap-2 transition ${
                  activeTab === "rotations"
                    ? "border-emerald-500 text-emerald-400"
                    : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
              >
                <Repeat size={16} /> Rotation Patterns
              </button>
            </>
          )}

          <button
            onClick={() => changeTab("my-schedule")}
            className={`px-4 py-3 text-sm font-medium border-b-2 flex items-center gap-2 transition ${
              activeTab === "my-schedule"
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-gray-400 hover:text-gray-200"
            }`}
          >
            <Clock size={16} /> My Schedule
          </button>
        </div>

        <div className="roster-guide" role="note">
          <CalendarIcon size={19} aria-hidden="true" />
          {activeTab === "my-schedule" ? (
            <p><strong>Your personal schedule:</strong> My Schedule displays today&apos;s active shift or scheduled off day, along with your confirmed shifts, weekly offs, and company holidays for the upcoming 14 days.</p>
          ) : activeTab === "assignments" ? (
            <p><strong>Shift Assignments:</strong> Assign fixed shifts to employees with effective start and end dates. These assignments apply automatically across attendance tracking and roster scheduling.</p>
          ) : activeTab === "rotations" ? (
            <p><strong>Rotation Patterns:</strong> Define cyclic repeating shift schedules (e.g., 5 days working, 2 days off) and enroll employees with custom start dates and cycle offsets.</p>
          ) : isAdminOrHr ? (
            <p><strong>How scheduling works:</strong> Create shifts in Shift Management, set fixed assignments or repeating rotation patterns, then generate a roster for the selected dates. The calendar shows team coverage; each shift also shows its source and draft or published status.</p>
          ) : (
            <p><strong>Team Calendar:</strong> Review your team&apos;s scheduled shifts and daily coverage across the selected date range.</p>
          )}
        </div>

        {/* TAB 1: ROSTER CALENDAR */}
        {activeTab === "calendar" && isManagerOrAdmin && (
          <div className="space-y-4">
            {/* Draft Roster Pending Publication Banner */}
            {isAdminOrHr && draftRosters.length > 0 && (() => {
              const publishableDraft = draftRosters.find((roster) => Number(roster.entry_count) > 0);
              const latestDraft = publishableDraft || draftRosters[0];
              return (
              <div className="bg-amber-950/40 border border-amber-800/60 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg shadow-amber-950/20">
                <div className="flex items-start sm:items-center gap-3">
                  <AlertCircle className="text-amber-400 shrink-0 mt-0.5 sm:mt-0" size={20} />
                  <div>
                    <div className="text-white font-semibold text-sm">
                      {draftRosters.length} Draft Roster{draftRosters.length > 1 ? "s" : ""} Pending Publication
                    </div>
                    <div className="text-xs text-amber-300/80">
                      {latestDraft.name || `Roster #${latestDraft.id}`} ({latestDraft.start_date} to {latestDraft.end_date} • {latestDraft.entry_count} entries). {publishableDraft ? 'Shifts will become visible to employees in "My Schedule" once published.' : "Generate a roster with scheduled shifts before publishing."}
                    </div>
                  </div>
                </div>
                {/* BUG-RS03: Safe publish handler prevents undefined id evaluation */}
                <button
                  onClick={() => publishableDraft && handlePublishRoster(publishableDraft.id)}
                  disabled={!publishableDraft || loading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold transition shadow-lg shadow-emerald-950 flex items-center justify-center gap-2 shrink-0"
                >
                  <CheckCircle2 size={15} /> Publish Roster to Team
                </button>
              </div>
              );
            })()}

            {/* Calendar Controls */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-gray-900 border border-gray-800 p-4 rounded-xl">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handlePrev}
                  className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition"
                  title="Previous period"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  onClick={handleToday}
                  className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold rounded-lg transition"
                >
                  Today
                </button>
                <button
                  onClick={handleNext}
                  className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition"
                  title="Next period"
                >
                  <ChevronRight size={18} />
                </button>

                <span className="text-white font-semibold text-sm ml-2">
                  {dateRange.startDate} to {dateRange.endDate}
                </span>
              </div>

              {/* BUG-RS05 & BUG-RS13: Search, Team Filter, CSV Export, View Toggles */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={searchEmp}
                    onChange={(e) => setSearchEmp(e.target.value)}
                    placeholder="Search employee..."
                    className="pl-8 pr-3 py-1.5 bg-gray-800 text-gray-200 text-xs rounded-lg border border-gray-700 focus:outline-none focus:border-emerald-500 w-44"
                  />
                  {searchEmp && (
                    <button
                      onClick={() => setSearchEmp("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-xs"
                      aria-label="Clear search"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  <Filter size={14} className="text-gray-400" />
                  <select
                    value={teamFilter}
                    onChange={(e) => setTeamFilter(e.target.value)}
                    className="bg-gray-800 text-gray-300 text-xs px-2.5 py-1.5 rounded-lg border border-gray-700 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="all">All Teams</option>
                    {availableTeams.map((team) => (
                      <option key={team} value={team}>{team}</option>
                    ))}
                  </select>
                </div>

                {(searchEmp || teamFilter !== "all") && (
                  <button
                    onClick={() => { setSearchEmp(""); setTeamFilter("all"); }}
                    className="text-xs text-gray-400 hover:text-gray-200 underline"
                  >
                    Clear
                  </button>
                )}

                <button
                  onClick={handleExportCalendarCsv}
                  disabled={!filteredEmployees.length}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 text-xs font-medium rounded-lg transition border border-gray-700"
                  title="Export filtered roster calendar to CSV"
                >
                  <FileSpreadsheet size={14} className="text-emerald-400" />
                  Export CSV
                </button>

                {/* View toggles */}
                <div className="bg-gray-800 p-1 rounded-lg flex text-xs">
                  {["daily", "weekly", "monthly"].map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setViewMode(mode)}
                      className={`px-3 py-1 rounded capitalize transition ${
                        viewMode === mode ? "bg-emerald-600 text-white" : "text-gray-400 hover:text-gray-200"
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Calendar Grid Matrix */}
            {loading ? (
              <div className="p-12 flex justify-center"><Loader /></div>
            ) : calendarData && calendarData.employees?.length > 0 ? (
              filteredEmployees.length > 0 ? (
              <div className="overflow-x-auto bg-gray-900 border border-gray-800 rounded-xl shadow-lg">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-800 bg-gray-950/60 text-xs font-semibold text-gray-400">
                      <th className="p-4 w-64 sticky left-0 bg-gray-950 z-10">Employee</th>
                      {/* Dates columns */}
                      {visibleDates.map((dateStr) => (
                        <th key={dateStr} className={`p-3 text-center border-l border-gray-800 min-w-[130px] ${dateStr === todayDate ? "bg-emerald-950/50 text-emerald-300" : ""}`}>
                          <div>{new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })}</div>
                          <div className={`text-xs ${dateStr === todayDate ? "text-emerald-300 font-bold" : "text-white"}`}>{dateStr.slice(5)}{dateStr === todayDate ? " · Today" : ""}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800 text-xs">
                    {filteredEmployees.map((emp) => (
                      <tr key={emp.user_id} className="hover:bg-gray-800/40 transition">
                        <td className="p-4 font-medium text-white sticky left-0 bg-gray-900 z-10 border-r border-gray-800">
                          <div className="font-semibold">{emp.name}</div>
                          <div className="text-gray-400 text-[11px]">{emp.team}</div>
                        </td>
                        {visibleDates.map((dateStr) => {
                          const slot = calendarData.grid[emp.user_id]?.[dateStr];
                          return (
                            <td key={dateStr} className={`p-2 border-l border-gray-800 text-center ${dateStr === todayDate ? "bg-emerald-950/10" : ""}`}>
                              {slot ? (
                                <div
                                  className={`p-2 rounded-lg border text-left flex flex-col justify-between h-full ${
                                    slot.is_overnight
                                      ? "bg-indigo-950/40 border-indigo-700/60 text-indigo-300"
                                      : "bg-emerald-950/40 border-emerald-700/60 text-emerald-300"
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-semibold truncate">{slot.shift_name}</span>
                                    {slot.is_overnight ? <Moon size={12} className="text-indigo-400" /> : <Sun size={12} className="text-emerald-400" />}
                                  </div>
                                  <div className="text-[10px] text-gray-400 mt-1">
                                    {slot.start_time?.slice(0, 5)} - {slot.end_time?.slice(0, 5)}
                                    {slot.is_overnight && <span className="ml-1 text-indigo-400 font-bold">+1d</span>}
                                  </div>
                                  <div className="flex items-center justify-between mt-1 text-[9px]">
                                    <span className="capitalize text-gray-400">{slot.source_type}</span>
                                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                                      slot.roster_status === "published" ? "bg-emerald-900/60 text-emerald-300" : "bg-yellow-900/60 text-yellow-300"
                                    }`}>
                                      {slot.roster_status}
                                    </span>
                                  </div>
                                </div>
                              ) : (
                                <div className="text-gray-600 text-[11px] italic">Off</div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              ) : (
                <div className="p-12 text-center bg-gray-900 border border-gray-800 rounded-xl space-y-3">
                  <Users size={32} className="mx-auto text-gray-500" />
                  <div className="text-sm font-semibold text-gray-300">No employees match your search criteria</div>
                  <p className="text-xs text-gray-500 max-w-sm mx-auto">Try clearing or adjusting your search keyword or team filter.</p>
                  <button
                    onClick={() => { setSearchEmp(""); setTeamFilter("all"); }}
                    className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded-lg transition"
                  >
                    Clear Filters
                  </button>
                </div>
              )
            ) : (
              <div className="roster-empty-state">
                <div className="roster-empty-state__icon"><CalendarIcon size={24} /></div>
                <h2>No shifts scheduled for this period</h2>
                <p>Create shift types in Shift Management, then set fixed assignments or repeating rotation patterns. Select <strong>Generate Roster</strong> to fill this calendar for the chosen dates.</p>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: SHIFT ASSIGNMENTS */}
        {activeTab === "assignments" && isAdminOrHr && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 bg-gray-900 border border-gray-800 p-4 rounded-xl">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Filter size={16} className="text-gray-400" />
                  <select
                    value={assignFilterStatus}
                    onChange={(e) => setAssignFilterStatus(e.target.value)}
                    className="bg-gray-800 text-gray-300 text-xs px-3 py-2 rounded-lg border border-gray-700"
                  >
                    <option value="all">All Statuses</option>
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="superseded">Superseded</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                {/* BUG-RS06: Functional search input in Shift Assignments */}
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={assignSearch}
                    onChange={(e) => setAssignSearch(e.target.value)}
                    placeholder="Search employee or shift..."
                    className="pl-8 pr-3 py-1.5 bg-gray-800 text-gray-200 text-xs rounded-lg border border-gray-700 focus:outline-none focus:border-emerald-500 w-56"
                  />
                  {assignSearch && (
                    <button
                      onClick={() => setAssignSearch("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-xs"
                      aria-label="Clear assignment search"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {assignSearch && (
                  <button
                    onClick={() => setAssignSearch("")}
                    className="text-xs text-gray-400 hover:text-gray-200 underline"
                  >
                    Clear Search
                  </button>
                )}

                {assignments.length >= 100 && (
                  <span className="text-xs text-amber-400 font-medium">
                    (Displaying first 100 records. Filter by status to narrow results)
                  </span>
                )}
              </div>
            </div>

            {/* BUG-RS09: Explicit loading state prevents empty-state flash */}
            {loading ? (
              <div className="p-12 flex justify-center bg-gray-900 border border-gray-800 rounded-xl">
                <Loader />
              </div>
            ) : (
              <div className="overflow-x-auto bg-gray-900 border border-gray-800 rounded-xl">
                <table className="w-full text-left text-xs text-gray-300">
                  <thead className="bg-gray-950/60 text-gray-400 font-semibold border-b border-gray-800">
                    <tr>
                      <th className="p-4">Employee</th>
                      <th className="p-4">Assigned Shift</th>
                      <th className="p-4">Version</th>
                      <th className="p-4">Timings</th>
                      <th className="p-4">Effective Dates</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {filteredAssignments.length > 0 ? (
                      filteredAssignments.map((a) => (
                        <tr key={a.id} className="hover:bg-gray-800/40">
                          <td className="p-4 font-medium text-white">
                            <div>{a.first_name} {a.last_name}</div>
                            <div className="text-[11px] text-gray-400">{a.team_name || a.email}</div>
                          </td>
                          <td className="p-4 font-semibold text-emerald-400">{a.shift_name} ({a.shift_code})</td>
                          <td className="p-4">v{a.shift_version_number}</td>
                          <td className="p-4">{a.start_time?.slice(0, 5)} - {a.end_time?.slice(0, 5)}</td>
                          <td className="p-4">{a.effective_from} → {a.effective_to || "Indefinite"}</td>
                          <td className="p-4">
                            <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                              a.status === "published"
                                ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                                : a.status === "draft"
                                ? "bg-yellow-950 text-yellow-400 border border-yellow-800"
                                : a.status === "cancelled"
                                ? "bg-red-950 text-red-400 border border-red-800"
                                : "bg-gray-800 text-gray-400"
                            }`}>
                              {a.status}
                            </span>
                          </td>
                          <td className="p-4 text-right space-x-2">
                            {a.status === "draft" && (
                              <button
                                onClick={async () => {
                                  await shiftsApi.publishAssignment(a.id);
                                  popup?.showPopup("Assignment published!", "success");
                                  loadAssignments();
                                }}
                                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[10px] font-semibold"
                              >
                                Publish
                              </button>
                            )}
                            {a.status === "published" && (
                              <button
                                onClick={() => {
                                  setCancelTargetId(a.id);
                                  setCancelModalOpen(true);
                                }}
                                className="px-2 py-1 bg-red-950 hover:bg-red-900 text-red-300 border border-red-800 rounded text-[10px]"
                              >
                                Cancel
                              </button>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : assignments.length > 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-gray-400">
                          <p>No shift assignments match your search &ldquo;{assignSearch}&rdquo;.</p>
                          <button
                            onClick={() => setAssignSearch("")}
                            className="mt-2 text-xs text-emerald-400 hover:text-emerald-300 underline"
                          >
                            Clear search
                          </button>
                        </td>
                      </tr>
                    ) : (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-gray-500">No shift assignments registered yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: ROTATION PATTERNS */}
        {activeTab === "rotations" && isAdminOrHr && (
          <div className="space-y-4">
            <div className="flex justify-between items-center bg-gray-900 border border-gray-800 p-4 rounded-xl">
              <span className="text-sm font-semibold text-white">Configured Rotation Patterns</span>
              <button
                onClick={() => setNewRotationModalOpen(true)}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
              >
                <Plus size={14} /> New Pattern
              </button>
            </div>

            {/* BUG-RS09: Explicit loading state */}
            {loading ? (
              <div className="p-12 flex justify-center bg-gray-900 border border-gray-800 rounded-xl">
                <Loader />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {rotations.map((r) => (
                  <div key={r.id} className="bg-gray-900 border border-gray-800 p-5 rounded-xl space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="text-white font-bold text-base">{r.name}</h3>
                        <p className="text-xs text-gray-400">Code: {r.code}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        r.status === "published" ? "bg-emerald-950 text-emerald-400 border border-emerald-800" : "bg-yellow-950 text-yellow-400"
                      }`}>
                        {r.status}
                      </span>
                    </div>

                    <p className="text-xs text-gray-300">{r.description || "Deterministic cycle rotation"}</p>

                    <div className="flex items-center justify-between text-xs text-gray-400 border-t border-gray-800 pt-3">
                      <span>Cycle: <strong className="text-white">{r.cycle_length_days} days</strong></span>
                      <span>Steps: <strong className="text-white">{r.step_count || 0}</strong></span>
                      <span>Enrolled: <strong className="text-white">{r.enrolled_count || 0}</strong>{Number(r.enrolled_count) === 0 && <span className="ml-1 text-amber-400">Unused</span>}</span>
                    </div>

                    <div className="flex gap-2 pt-2">
                      {r.status === "draft" && (
                        <button
                          onClick={async () => {
                            await shiftsApi.publishRotation(r.id);
                            popup?.showPopup("Pattern published!", "success");
                            loadRotations();
                          }}
                          className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold"
                        >
                          Publish
                        </button>
                      )}
                      <button
                        onClick={() => handlePreviewRotation(r)}
                        className="flex-1 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded text-xs"
                      >
                        Preview
                      </button>
                      {r.status === "published" && (
                        <button
                          onClick={async () => {
                            try {
                              const details = await shiftsApi.getRotation(r.id);
                              setSelectedRotation(details);
                              setEnrollForm({ user_id: "", rotation_id: r.id, start_date: dateOnly(new Date()), offset_days: 0, initial_step_order: 1 });
                              setEnrollModalOpen(true);
                            } catch (err) {
                              popup?.showPopup(err?.response?.data?.error || "Failed to load rotation details", "error");
                            }
                          }}
                          className="flex-1 py-1.5 bg-blue-900/60 hover:bg-blue-800 text-blue-200 rounded text-xs"
                        >Enroll</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: MY SCHEDULE (EMPLOYEE SELF-SERVICE) */}
        {activeTab === "my-schedule" && (
          <div className="space-y-6">
            {/* BUG-RS09: Loading guard prevents flashing empty state */}
            {loading ? (
              <div className="p-16 flex justify-center bg-gray-900 border border-gray-800 rounded-2xl">
                <Loader />
              </div>
            ) : myRosterError ? (
              /* BUG FIX 02: Dedicated error banner with retry button */
              <div className="bg-rose-950/40 border border-rose-800/60 p-6 rounded-2xl space-y-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="text-rose-400 shrink-0 mt-0.5" size={24} />
                  <div>
                    <h3 className="text-base font-bold text-white">Unable to Load Shift Schedule</h3>
                    <p className="text-sm text-rose-300/90 mt-1">{myRosterError}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => loadMyRoster(true)}
                  disabled={retryingMyRoster}
                  className="flex items-center gap-2 px-4 py-2 bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition shadow-sm"
                >
                  <RefreshCw size={16} className={retryingMyRoster ? "animate-spin" : ""} />
                  {retryingMyRoster ? "Retrying..." : "Retry"}
                </button>
              </div>
            ) : (
              <>
                {/* BUG FIX 04: Today's Card Supporting Working, Off, Holiday, and Rest Day states */}
                {(() => {
                  const todayItem =
                    myRoster?.today_entry ||
                    (myRoster?.schedule && myRoster.schedule.find((s) => s.work_date === myRoster?.today)) ||
                    myRoster?.current_shift;

                  const isWorking = todayItem && !todayItem.is_off_day && Boolean(todayItem.shift_name);
                  const isHoliday = todayItem?.status === "holiday";
                  const isWeeklyOff = todayItem?.status === "weekly_off";
                  const isRestDay = todayItem?.status === "rest_day";

                  if (isWorking) {
                    return (
                      <div className="bg-gradient-to-r from-emerald-950/60 to-gray-900 border border-emerald-800/60 p-6 rounded-2xl">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-xs uppercase tracking-wider text-emerald-400 font-bold">Today&apos;s Active Shift</div>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            todayItem.source === "fixed_assignment"
                              ? "bg-blue-950 text-blue-400 border border-blue-800"
                              : todayItem.source === "rotation"
                              ? "bg-indigo-950 text-indigo-400 border border-indigo-800"
                              : "bg-emerald-950 text-emerald-400 border border-emerald-800"
                          }`}>
                            {todayItem.source === "fixed_assignment" ? "Fixed Shift" : todayItem.source === "rotation" ? "Rotation" : "Published Roster"}
                          </span>
                        </div>
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                          <div>
                            <h2 className="text-2xl font-black text-white">{todayItem.shift_name}</h2>
                            <p className="text-sm text-gray-300 mt-0.5">
                              <span className="font-semibold text-emerald-300">{formatReadableDate(todayItem.work_date)}:</span>{" "}
                              {todayItem.start_time?.slice(0, 5)} - {todayItem.end_time?.slice(0, 5)}
                              {todayItem.is_overnight && (
                                <span className="ml-2 px-2 py-0.5 rounded bg-indigo-950 text-indigo-400 border border-indigo-800 text-xs font-medium">
                                  Overnight (+1 day)
                                </span>
                              )}
                            </p>
                          </div>
                          <div className="px-4 py-2 bg-emerald-900/40 border border-emerald-700/50 rounded-xl text-emerald-300 text-sm font-semibold">
                            Scheduled: {formatWorkHours(todayItem.total_work_hours)} hrs
                          </div>
                        </div>
                      </div>
                    );
                  }

                  if (isHoliday) {
                    return (
                      <div className="bg-gradient-to-r from-purple-950/60 to-gray-900 border border-purple-800/60 p-6 rounded-2xl">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-xs uppercase tracking-wider text-purple-400 font-bold">Today is a Company Holiday</div>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-purple-950 text-purple-300 border border-purple-800">
                            Company Holiday
                          </span>
                        </div>
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                          <div>
                            <h2 className="text-2xl font-black text-white flex items-center gap-2">
                              <Sun size={24} className="text-amber-400" />
                              {todayItem.holiday_name || "Official Company Holiday"}
                            </h2>
                            <p className="text-sm text-purple-200/90 mt-0.5">
                              {formatReadableDate(todayItem.work_date)} • Office is closed for observance. No working shift scheduled.
                            </p>
                          </div>
                          <div className="px-4 py-2 bg-purple-900/40 border border-purple-700/50 rounded-xl text-purple-300 text-sm font-semibold">
                            Holiday (0.00 hrs)
                          </div>
                        </div>
                      </div>
                    );
                  }

                  if (isWeeklyOff) {
                    return (
                      <div className="bg-gradient-to-r from-blue-950/60 to-gray-900 border border-blue-800/60 p-6 rounded-2xl">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-xs uppercase tracking-wider text-blue-400 font-bold">Today is Your Weekly Off</div>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-950 text-blue-300 border border-blue-800">
                            Weekly Off
                          </span>
                        </div>
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                          <div>
                            <h2 className="text-2xl font-black text-white flex items-center gap-2">
                              <Coffee size={24} className="text-blue-400" />
                              Scheduled Day of Rest
                            </h2>
                            <p className="text-sm text-blue-200/90 mt-0.5">
                              {formatReadableDate(todayItem.work_date)} • Authorized weekly off. No working shift scheduled.
                            </p>
                          </div>
                          <div className="px-4 py-2 bg-blue-900/40 border border-blue-700/50 rounded-xl text-blue-300 text-sm font-semibold">
                            Weekly Off
                          </div>
                        </div>
                      </div>
                    );
                  }

                  if (isRestDay) {
                    return (
                      <div className="bg-gradient-to-r from-teal-950/60 to-gray-900 border border-teal-800/60 p-6 rounded-2xl">
                        <div className="flex items-center justify-between mb-1">
                          <div className="text-xs uppercase tracking-wider text-teal-400 font-bold">Today is Your Rest Day</div>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-teal-950 text-teal-300 border border-teal-800">
                            Rest Day
                          </span>
                        </div>
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                          <div>
                            <h2 className="text-2xl font-black text-white flex items-center gap-2">
                              <Moon size={24} className="text-teal-400" />
                              Roster Rest Day
                            </h2>
                            <p className="text-sm text-teal-200/90 mt-0.5">
                              {formatReadableDate(todayItem.work_date)} • Scheduled non-working day under published roster.
                            </p>
                          </div>
                          <div className="px-4 py-2 bg-teal-900/40 border border-teal-700/50 rounded-xl text-teal-300 text-sm font-semibold">
                            Rest Day
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // Default Unassigned
                  return (
                    <div className="bg-gradient-to-r from-gray-900 to-gray-950 border border-gray-800 p-6 rounded-2xl">
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-xs uppercase tracking-wider text-gray-400 font-bold">Today&apos;s Schedule Status</div>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-gray-800 text-gray-400 border border-gray-700">
                          Unassigned
                        </span>
                      </div>
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                          <h2 className="text-2xl font-black text-white">No Shift Assigned for Today</h2>
                          <p className="text-sm text-gray-400 mt-0.5">
                            {todayItem?.work_date ? formatReadableDate(todayItem.work_date) : formatReadableDate(dateOnly(new Date()))} • No shift has been assigned for today. Contact HR or your manager if this is unexpected.
                          </p>
                        </div>
                        <div className="px-4 py-2 bg-gray-800/60 border border-gray-700 rounded-xl text-gray-400 text-sm font-semibold">
                          No Shift
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* 14-Day Upcoming Schedule Grid (BUG FIX 05, 06, 07) */}
                <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <CalendarIcon size={18} className="text-emerald-500" /> Upcoming 14-Day Schedule
                    </h3>
                    <span className="text-xs text-gray-400">Employee Self-Service (Read-Only)</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {myRoster?.schedule?.length ? (
                      myRoster.schedule.map((item) => {
                        const isWorking = !item.is_off_day && Boolean(item.shift_name);
                        const isHoliday = item.status === "holiday";
                        const isWeeklyOff = item.status === "weekly_off";
                        const isRestDay = item.status === "rest_day";
                        const isUnassigned = item.status === "unassigned";

                        let cardBg = "bg-gray-950 border-gray-800 hover:border-emerald-800/60";
                        let badgeClass = "bg-emerald-950/80 text-emerald-400 border-emerald-800";
                        let badgeText = item.source === "fixed_assignment" ? "Fixed" : item.source === "rotation" ? "Rotation" : "Roster";

                        if (isHoliday) {
                          cardBg = "bg-purple-950/20 border-purple-900/40 hover:border-purple-700/60";
                          badgeClass = "bg-purple-950 text-purple-300 border-purple-800";
                          badgeText = "Holiday";
                        } else if (isWeeklyOff) {
                          cardBg = "bg-blue-950/20 border-blue-900/40 hover:border-blue-700/60";
                          badgeClass = "bg-blue-950 text-blue-300 border-blue-800";
                          badgeText = "Weekly Off";
                        } else if (isRestDay) {
                          cardBg = "bg-teal-950/20 border-teal-900/40 hover:border-teal-700/60";
                          badgeClass = "bg-teal-950 text-teal-300 border-teal-800";
                          badgeText = "Rest Day";
                        } else if (isUnassigned) {
                          cardBg = "bg-gray-950/40 border-dashed border-gray-800";
                          badgeClass = "bg-gray-800 text-gray-400 border-gray-700";
                          badgeText = "Unassigned";
                        }

                        return (
                          <div
                            key={item.entry_id || item.work_date}
                            className={`p-4 border rounded-xl space-y-2 transition ${cardBg}`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-300 font-bold">
                                {formatReadableDate(item.work_date)}
                              </span>
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${badgeClass}`}>
                                {badgeText}
                              </span>
                            </div>

                            {isWorking ? (
                              <>
                                <div className="text-white font-bold text-sm truncate" title={item.shift_name}>
                                  {item.shift_name}
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-emerald-400 font-medium">
                                    {item.start_time?.slice(0, 5)} - {item.end_time?.slice(0, 5)}
                                    {item.is_overnight && " (+1d)"}
                                  </span>
                                  <span className="text-gray-400 text-[11px]">
                                    {formatWorkHours(item.total_work_hours)} hrs
                                  </span>
                                </div>
                              </>
                            ) : isHoliday ? (
                              <>
                                <div className="text-purple-200 font-bold text-sm truncate" title={item.holiday_name || "Company Holiday"}>
                                  {item.holiday_name || "Company Holiday"}
                                </div>
                                <div className="text-xs text-purple-400/80">Official Non-Working Holiday</div>
                              </>
                            ) : isWeeklyOff ? (
                              <>
                                <div className="text-blue-200 font-bold text-sm truncate">Weekly Off</div>
                                <div className="text-xs text-blue-400/80">Scheduled day of rest</div>
                              </>
                            ) : isRestDay ? (
                              <>
                                <div className="text-teal-200 font-bold text-sm truncate">Rest Day</div>
                                <div className="text-xs text-teal-400/80">Roster scheduled rest day</div>
                              </>
                            ) : (
                              <>
                                <div className="text-gray-400 font-bold text-sm truncate">No Shift Assigned</div>
                                <div className="text-xs text-gray-500">Not scheduled</div>
                              </>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="col-span-full py-10 px-4 text-center bg-gray-950/50 border border-dashed border-gray-800 rounded-xl space-y-3">
                        <Clock size={36} className="text-gray-500 mx-auto" />
                        <div className="text-sm font-semibold text-gray-300">No shifts scheduled for the next 14 days</div>
                        <p className="text-xs text-gray-500 max-w-md mx-auto">
                          You currently have no active fixed assignment, rotation, or published roster.
                        </p>
                        <div className="text-[11px] text-gray-400 bg-gray-900 border border-gray-800 p-4 rounded-xl max-w-md mx-auto text-left space-y-2">
                          <div className="font-bold text-emerald-400 text-xs">How shift scheduling works:</div>
                          <div className="flex items-start gap-2">
                            <span className="bg-gray-800 text-gray-300 w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 mt-0.5">1</span>
                            <span><strong>Shift Management:</strong> HR configures shift timings &amp; breaks.</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="bg-gray-800 text-gray-300 w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 mt-0.5">2</span>
                            <span><strong>Shift Assignments:</strong> HR assigns you to a fixed shift or rotation pattern.</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="bg-gray-800 text-gray-300 w-4 h-4 rounded-full flex items-center justify-center text-[10px] shrink-0 mt-0.5">3</span>
                            <span><strong>Roster Calendar:</strong> HR generates and publishes rosters, which appear here automatically.</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* MODAL: GENERATE DRAFT ROSTER */}
        {generateModalOpen && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-md w-full p-6 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-white">Generate Draft Roster</h3>
                <button onClick={() => setGenerateModalOpen(false)} className="text-gray-400 hover:text-white">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleGenerateRoster} className="space-y-4 text-xs">
                <div>
                  <label className="block text-gray-400 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={generateForm.start_date}
                    onChange={(e) => setGenerateForm({ ...generateForm, start_date: e.target.value })}
                    className="w-full bg-gray-800 text-white p-2.5 rounded-lg border border-gray-700"
                    required
                  />
                </div>
                <div>
                  <label className="block text-gray-400 mb-1">End Date</label>
                  <input
                    type="date"
                    value={generateForm.end_date}
                    onChange={(e) => setGenerateForm({ ...generateForm, end_date: e.target.value })}
                    className="w-full bg-gray-800 text-white p-2.5 rounded-lg border border-gray-700"
                    required
                  />
                </div>
                <div>
                  <label className="block text-gray-400 mb-1">Team Filter (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Engineering, Sales (leave blank for all)"
                    value={generateForm.team_name}
                    onChange={(e) => setGenerateForm({ ...generateForm, team_name: e.target.value })}
                    className="w-full bg-gray-800 text-white p-2.5 rounded-lg border border-gray-700"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setGenerateModalOpen(false)}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-lg"
                  >
                    Generate
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: ASSIGN SHIFT */}
        {newAssignmentModalOpen && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-md w-full p-6 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-white">Assign Fixed Shift</h3>
                <button
                  onClick={() => {
                    setAssignmentUserError("");
                    setNewAssignmentModalOpen(false);
                  }}
                  className="text-gray-400 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleCreateAssignment} className="space-y-4 text-xs">
                <SearchableEmployeeSelect
                  employees={employeeList}
                  value={assignmentForm.user_id}
                  onChange={(userId) => {
                    setAssignmentForm({ ...assignmentForm, user_id: userId });
                    if (assignmentUserError) setAssignmentUserError("");
                  }}
                  label="Registered Employee"
                  placeholder="Search registered employee (name, email, ID)..."
                  required
                  error={assignmentUserError}
                />

                <div>
                  <label className="block text-gray-400 mb-1">Select Shift Template</label>
                  <select
                    value={assignmentForm.shift_id}
                    onChange={(e) => {
                      const sId = e.target.value;
                      const shift = shiftList.find(s => String(s.id) === sId);
                      setAssignmentForm({
                        ...assignmentForm,
                        shift_id: sId,
                        shift_version_id: shift?.current_version_id || "",
                      });
                    }}
                    className="w-full bg-gray-800 text-white p-2.5 rounded-lg border border-gray-700"
                    required
                  >
                    <option value="">-- Choose Shift --</option>
                    {shiftList.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code}) - {s.start_time?.slice(0, 5)} to {s.end_time?.slice(0, 5)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* BUG-RS08: Human-readable published version selection */}
                <div>
                  <label className="block text-gray-400 mb-1">Shift Version (Published)</label>
                  {assignmentForm.shift_id ? (() => {
                    const selectedShift = shiftList.find((s) => String(s.id) === String(assignmentForm.shift_id));
                    if (selectedShift?.current_version_id) {
                      return (
                        <div className="bg-gray-800 p-3 rounded-lg border border-gray-700 space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-emerald-400 text-xs">
                              Version {selectedShift.current_version_number || 1} · Published
                            </span>
                            <span className="text-[10px] text-gray-400">
                              ID #{selectedShift.current_version_id}
                            </span>
                          </div>
                          <div className="text-gray-300 text-xs">
                            {selectedShift.start_time?.slice(0, 5)} - {selectedShift.end_time?.slice(0, 5)}
                            {selectedShift.is_overnight ? " (Overnight +1d)" : ""}
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div className="bg-amber-950/40 border border-amber-800 p-3 rounded-lg text-amber-300 text-xs space-y-1">
                        <div className="font-semibold">No Published Version Available</div>
                        <p className="text-[11px] text-amber-400/80">
                          This shift template does not have an active published version. Please publish a version in Shift Management before assigning.
                        </p>
                      </div>
                    );
                  })() : (
                    <div className="text-gray-500 italic p-2 bg-gray-800/40 rounded-lg border border-gray-800">
                      Choose a shift template above to link its active version.
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-gray-400 mb-1">Effective From</label>
                    <input
                      type="date"
                      value={assignmentForm.effective_from}
                      onChange={(e) => setAssignmentForm({ ...assignmentForm, effective_from: e.target.value })}
                      className="w-full bg-gray-800 text-white p-2.5 rounded-lg border border-gray-700"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 mb-1">Effective To (Optional)</label>
                    <input
                      type="date"
                      value={assignmentForm.effective_to}
                      onChange={(e) => setAssignmentForm({ ...assignmentForm, effective_to: e.target.value })}
                      className="w-full bg-gray-800 text-white p-2.5 rounded-lg border border-gray-700"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="publishNow"
                    checked={assignmentForm.publish_immediately}
                    onChange={(e) => setAssignmentForm({ ...assignmentForm, publish_immediately: e.target.checked })}
                    className="rounded bg-gray-800 border-gray-700 text-emerald-600 focus:ring-0"
                  />
                  <label htmlFor="publishNow" className="text-gray-300">Publish immediately (freeze snapshot)</label>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setNewAssignmentModalOpen(false)}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!assignmentForm.shift_version_id}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-lg"
                  >
                    Confirm Assignment
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {newRotationModalOpen && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-white">New Rotation Pattern</h3>
                <button onClick={() => setNewRotationModalOpen(false)} className="text-gray-400 hover:text-white">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleCreateRotation} className="space-y-4 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block text-gray-400">
                    Pattern Code
                    <input
                      value={rotationForm.code}
                      onChange={(e) => setRotationForm({ ...rotationForm, code: e.target.value })}
                      className="mt-1 w-full bg-gray-800 text-white p-2.5 rounded-lg border border-gray-700"
                      required
                    />
                  </label>
                  <label className="block text-gray-400">
                    Pattern Name
                    <input
                      value={rotationForm.name}
                      onChange={(e) => setRotationForm({ ...rotationForm, name: e.target.value })}
                      className="mt-1 w-full bg-gray-800 text-white p-2.5 rounded-lg border border-gray-700"
                      required
                    />
                  </label>
                </div>
                <label className="block text-gray-400">
                  Description (Optional)
                  <textarea
                    value={rotationForm.description}
                    onChange={(e) => setRotationForm({ ...rotationForm, description: e.target.value })}
                    className="mt-1 w-full bg-gray-800 text-white p-2.5 rounded-lg border border-gray-700"
                    rows={2}
                  />
                </label>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-white">Pattern Steps</span>
                    <button type="button" onClick={addRotationStep} className="text-emerald-400 hover:text-emerald-300">
                      Add Step
                    </button>
                  </div>
                  {rotationForm.steps.map((step, index) => (
                    <div key={index} className="grid grid-cols-[1fr_110px_auto] gap-2 items-end">
                      <label className="block text-gray-400">
                        Step {index + 1}
                        <select
                          value={step.is_off_day ? "off" : step.shift_id}
                          onChange={(e) => updateRotationStep(index, e.target.value === "off"
                            ? { shift_id: "", is_off_day: true }
                            : { shift_id: e.target.value, is_off_day: false })}
                          className="mt-1 w-full bg-gray-800 text-white p-2.5 rounded-lg border border-gray-700"
                        >
                          <option value="">Choose shift</option>
                          {shiftList.map((shift) => (
                            <option key={shift.id} value={shift.id}>{shift.name} ({shift.code})</option>
                          ))}
                          <option value="off">Weekly off</option>
                        </select>
                      </label>
                      <label className="block text-gray-400">
                        Days
                        <input
                          type="number"
                          min="1"
                          value={step.duration_days}
                          onChange={(e) => updateRotationStep(index, { duration_days: e.target.value })}
                          className="mt-1 w-full bg-gray-800 text-white p-2.5 rounded-lg border border-gray-700"
                          required
                        />
                      </label>
                      {rotationForm.steps.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setRotationForm((current) => ({
                            ...current,
                            steps: current.steps.filter((_, stepIndex) => stepIndex !== index),
                          }))}
                          className="px-2.5 py-2.5 text-gray-400 hover:text-red-400"
                          aria-label={`Remove step ${index + 1}`}
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setNewRotationModalOpen(false)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg">
                    Cancel
                  </button>
                  <button type="submit" disabled={loading} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-semibold rounded-lg">
                    Create Draft Pattern
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {previewModalOpen && rotationPreview && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-white">{rotationPreview.rotation?.name || selectedRotation?.name} Preview</h3>
                  <p className="text-xs text-gray-400">{rotationPreview.start_date} to {rotationPreview.end_date} · {rotationPreview.total_days} days</p>
                </div>
                <button onClick={() => setPreviewModalOpen(false)} className="text-gray-400 hover:text-white" aria-label="Close preview"><X size={20} /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {rotationPreview.schedule?.map((day) => (
                  <div key={day.work_date} className="p-3 bg-gray-950 border border-gray-800 rounded-lg">
                    <div className="text-xs text-gray-400">{day.day_of_week}, {day.work_date}</div>
                    <div className="text-sm text-white font-semibold mt-1">{day.is_off_day ? "Off day" : day.shift_name}</div>
                    {!day.is_off_day && <div className="text-xs text-emerald-300">{day.start_time?.slice(0, 5) || "Time not set"}{day.end_time ? ` – ${day.end_time.slice(0, 5)}` : ""}</div>}
                    <div className="text-[10px] text-gray-500">Step {day.step_order}</div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end"><button onClick={() => setPreviewModalOpen(false)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-sm">Close</button></div>
            </div>
          </div>
        )}

        {enrollModalOpen && selectedRotation && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <form onSubmit={handleEnrollRotation} className="bg-gray-900 border border-gray-800 rounded-2xl max-w-md w-full p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div><h3 className="text-lg font-bold text-white">Enroll Employee</h3><p className="text-xs text-gray-400">{selectedRotation.name}</p></div>
                <button type="button" onClick={() => setEnrollModalOpen(false)} className="text-gray-400 hover:text-white" aria-label="Close enrollment"><X size={20} /></button>
              </div>
              <div className="pt-1">
                <SearchableEmployeeSelect
                  employees={employeeList}
                  value={enrollForm.user_id}
                  onChange={(userId) => setEnrollForm({ ...enrollForm, user_id: userId })}
                  label="Registered Employee"
                  placeholder="Choose employee..."
                  required
                />
              </div>
              <label className="block text-xs text-gray-400">Start date
                <input type="date" value={enrollForm.start_date} onChange={(e) => setEnrollForm({ ...enrollForm, start_date: e.target.value })} required className="mt-1 w-full bg-gray-800 text-white p-2.5 rounded-lg border border-gray-700" />
              </label>
              {/* BUG-RS07: Reliable steps source from selectedRotation or rotationPreview */}
              <label className="block text-xs text-gray-400">Starting step
                <select value={enrollForm.initial_step_order || 1} onChange={(e) => setEnrollForm({ ...enrollForm, initial_step_order: Number(e.target.value) })} className="mt-1 w-full bg-gray-800 text-white p-2.5 rounded-lg border border-gray-700">
                  {(() => {
                    const steps = (selectedRotation?.steps?.length ? selectedRotation.steps : (rotationPreview?.rotation?.steps || []));
                    if (steps.length > 0) {
                      return steps.map((step) => (
                        <option key={step.step_order} value={step.step_order}>
                          Step {step.step_order} · {step.is_off_day ? "Off day" : (step.shift_name || `Shift #${step.shift_id}`)} ({step.duration_days}d)
                        </option>
                      ));
                    }
                    return <option value={1}>Step 1</option>;
                  })()}
                </select>
              </label>
              <label className="block text-xs text-gray-400">Offset days
                <input type="number" min="0" value={enrollForm.offset_days} onChange={(e) => setEnrollForm({ ...enrollForm, offset_days: e.target.value })} className="mt-1 w-full bg-gray-800 text-white p-2.5 rounded-lg border border-gray-700" />
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setEnrollModalOpen(false)} className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg">Cancel</button>
                <button disabled={loading || employeeList.length === 0} className="px-4 py-2 bg-emerald-600 disabled:opacity-50 text-white font-semibold rounded-lg">Enroll</button>
              </div>
            </form>
          </div>
        )}

        {/* MODAL: CANCEL ASSIGNMENT */}
        {cancelModalOpen && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl max-w-sm w-full p-6 space-y-4">
              <h3 className="text-lg font-bold text-white">Cancel Assignment</h3>
              <p className="text-xs text-gray-400">Specify reason for cancellation:</p>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Schedule revised, employee transferred"
                className="w-full bg-gray-800 text-white p-3 rounded-lg border border-gray-700 text-xs h-24"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setCancelModalOpen(false)}
                  className="px-3 py-1.5 bg-gray-800 text-gray-300 rounded-lg text-xs"
                >
                  Close
                </button>
                <button
                  onClick={handleConfirmCancel}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-lg text-xs"
                >
                  Confirm Cancel
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </Layout>
  );
}
