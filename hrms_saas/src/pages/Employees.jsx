import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import {
  AlertCircle,
  Briefcase,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Eye,
  EyeOff,
  FileBadge2,
  FileText,
  MapPin,
  MoreVertical,
  Paperclip,
  Pencil,
  RotateCcw,
  Search,
  ShieldCheck,
  UserCheck,
  UserCog,
  UserPlus,
  Users,
  UserX,
  X,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import Loader from "../components/common/Loader";
import API from "../api/axios";
import { useRealtime } from "../context/RealtimeContext";
import { useSite } from "../context/SiteContext";
import { useAuth } from "../context/AuthContext";

const documentLabels = [
  { key: "photo_copy", label: "Photo Copy", required: true },
  { key: "aadhar_file", label: "Aadhar Card", required: true },
  { key: "pan_file", label: "PAN Card", required: true },
  { key: "bank_file", label: "Bank Details", required: true },
  { key: "cv_file", label: "CV", required: false },
  { key: "voter_file", label: "Voter ID", required: false },
  { key: "dl_file", label: "Driving License", required: false },
];

const initialForm = {
  username: "",
  first_name: "",
  last_name: "",
  email: "",
  password: "",
  role: "employee",
  site_id: "",
  manager: "",
  team_name: "",
  joining_date: "",
  leave_allotted: "0",
  designation: "",
  locations: [{ latitude: "", longitude: "", allowed_radius: "100", is_primary: true }],
  is_active_employee: true,
};

function formatJoiningDate(dateStr) {
  if (!dateStr) return "N/A";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = String(d.getDate()).padStart(2, "0");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
  } catch {
    return dateStr;
  }
}

function getInitials(name, username) {
  if (name && name.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (username) {
    return username.slice(0, 2).toUpperCase();
  }
  return "ST";
}

function getRoleBadgeStyle(role) {
  switch (role) {
    case "manager":
      return "bg-purple-50 text-purple-700 border-purple-200/80";
    case "employee":
      return "bg-blue-50 text-blue-700 border-blue-200/80";
    case "hr":
      return "bg-amber-50 text-amber-700 border-amber-200/80";
    case "admin":
      return "bg-indigo-50 text-indigo-700 border-indigo-200/80";
    case "superadmin":
      return "bg-rose-50 text-rose-700 border-rose-200/80";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200/80";
  }
}

function getAvatarStyle(role, name = "") {
  switch (role) {
    case "manager":
      return "bg-purple-100 text-purple-700 border-purple-200";
    case "employee":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "hr":
      return "bg-amber-100 text-amber-700 border-amber-200";
    case "admin":
      return "bg-indigo-100 text-indigo-700 border-indigo-200";
    case "superadmin":
      return "bg-rose-100 text-rose-700 border-rose-200";
    default: {
      const colors = [
        "bg-teal-100 text-teal-700 border-teal-200",
        "bg-cyan-100 text-cyan-700 border-cyan-200",
        "bg-emerald-100 text-emerald-700 border-emerald-200",
      ];
      const index = (name.charCodeAt(0) || 0) % colors.length;
      return colors[index];
    }
  }
}

export default function Employees() {
  const { role: authRole, user: authUser } = useAuth();
  const userRole = authRole || localStorage.getItem("role") || "employee";
  const currentUserId = authUser?.id || (() => {
    try {
      const stored = localStorage.getItem("user");
      return stored ? JSON.parse(stored)?.id : null;
    } catch {
      return null;
    }
  })();
  const { sites, querySiteId } = useSite();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [statusChangingId, setStatusChangingId] = useState(null);
  const [managers, setManagers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [existingDocuments, setExistingDocuments] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [files, setFiles] = useState({});
  const [fileInputKey, setFileInputKey] = useState(0);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState("");
  const [statusDialog, setStatusDialog] = useState(null);
  const [noticePopup, setNoticePopup] = useState(null);
  const [mapPickerTarget, setMapPickerTarget] = useState(null);

  // UI state for Directory, Collapsible Form & Server Pagination
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [metrics, setMetrics] = useState({ total: 0, active: 0, inactive: 0, managers: 0, employees: 0, hr: 0, admin: 0 });
  const [availableTeams, setAvailableTeams] = useState([]);
  const [viewingEmployee, setViewingEmployee] = useState(null);

  const formCardRef = useRef(null);
  const documentAbortRef = useRef(null);
  const activeEditingIdRef = useRef(null);

  const showPopup = (text, type = "error", title = type === "error" ? "Action failed" : "Success") => {
    setNoticePopup({ text, type, title });
  };

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        page: currentPage,
        limit: rowsPerPage,
        search: debouncedSearch.trim() || undefined,
        role: roleFilter !== "all" ? roleFilter : undefined,
        team: teamFilter !== "all" ? teamFilter : undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
        site_id: querySiteId || undefined,
      };

      const [managerRes, employeeRes] = await Promise.all([
        API.get("/auth/managers/", { params: { limit: 1000 } }),
        API.get("/auth/employees/", { params }),
      ]);
      setManagers(Array.isArray(managerRes.data) ? managerRes.data : (managerRes.data?.data || []));

      const empData = Array.isArray(employeeRes.data) ? employeeRes.data : (employeeRes.data?.data || []);
      setEmployees(empData);

      const pagination = employeeRes.data?.pagination;
      const fetchedTotal = pagination?.total ?? employeeRes.data?.total_count ?? empData.length;
      setTotalRecords(fetchedTotal);
      setTotalPages(pagination?.totalPages ?? Math.max(1, Math.ceil(fetchedTotal / rowsPerPage)));

      if (employeeRes.data?.metrics) {
        setMetrics(employeeRes.data.metrics);
      } else {
        setMetrics({
          total: fetchedTotal,
          active: empData.filter((e) => e.is_active_employee).length,
          inactive: empData.filter((e) => !e.is_active_employee).length,
          managers: empData.filter((e) => e.role === "manager").length,
          employees: empData.filter((e) => e.role === "employee").length,
          hr: empData.filter((e) => e.role === "hr").length,
          admin: empData.filter((e) => e.role === "admin" || e.role === "superadmin").length,
        });
      }

      if (Array.isArray(employeeRes.data?.available_teams)) {
        setAvailableTeams(employeeRes.data.available_teams);
      }
    } catch (err) {
      console.log(err);
      showPopup("Unable to load employee setup data");
    } finally {
      setLoading(false);
    }
  }, [currentPage, rowsPerPage, debouncedSearch, roleFilter, teamFilter, statusFilter, querySiteId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setCurrentPage(1);
  }, [querySiteId]);

  useRealtime("employee_update", loadData);

  const canManage = (targetRole) => {
    if (userRole === "superadmin") return true;
    if (userRole === "admin") return ["employee", "manager", "hr"].includes(targetRole);
    if (userRole === "hr") return ["employee", "manager"].includes(targetRole);
    return false;
  };

  const totalStaffCount = metrics.total;
  const activeStaffCount = metrics.active;
  const inactiveStaffCount = metrics.inactive;
  const managerCount = metrics.managers;
  const employeeCount = metrics.employees;
  const hrCount = metrics.hr;
  const adminCount = metrics.admin;

  const uploadedDocumentTitles = useMemo(
    () => new Set(existingDocuments.map((document) => document.title)),
    [existingDocuments]
  );

  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * rowsPerPage;
  const endIndex = Math.min(startIndex + rowsPerPage, totalRecords);

  const handleClearFilters = () => {
    setSearchTerm("");
    setDebouncedSearch("");
    setRoleFilter("all");
    setTeamFilter("all");
    setStatusFilter("all");
    setCurrentPage(1);
  };

  const handleAddEmployeeClick = () => {
    if (editingId) {
      resetForm();
    }
    setIsFormOpen(true);
    setTimeout(() => {
      formCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const handleChange = (key, value) => {
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (key === "role") {
        if (value === "manager" || value === "hr") {
          next.manager = "";
        }
        if (value === "employee" || value === "hr") {
          next.team_name = "";
        }
      }
      return next;
    });
  };

  const handleFileChange = (key, file) => {
    setFiles((current) => ({
      ...current,
      [key]: file,
    }));
  };

  const handleAddLocation = () => {
    setForm((current) => ({
      ...current,
      locations: [
        ...current.locations,
        { latitude: "", longitude: "", allowed_radius: "100", is_primary: current.locations.length === 0 },
      ],
    }));
  };

  const handleSetPrimaryLocation = (targetIndex) => {
    setForm((current) => ({
      ...current,
      locations: current.locations.map((loc, i) => ({
        ...loc,
        is_primary: i === targetIndex,
      })),
    }));
  };

  const handleRemoveLocation = (index) => {
    setForm((current) => {
      const next = current.locations.filter((_, i) => i !== index);
      if (next.length > 0 && !next.some((l) => l.is_primary)) {
        next[0] = { ...next[0], is_primary: true };
      }
      return { ...current, locations: next };
    });
  };

  const handleLocationChange = (index, field, value) => {
    setForm((current) => {
      const nextLocs = [...current.locations];
      nextLocs[index] = { ...nextLocs[index], [field]: value };
      return { ...current, locations: nextLocs };
    });
  };

  const resetForm = () => {
    if (documentAbortRef.current) {
      documentAbortRef.current.abort();
    }
    activeEditingIdRef.current = null;
    setForm(initialForm);
    setFiles({});
    setFileInputKey((k) => k + 1);
    setEditingId(null);
    setExistingDocuments([]);
    setMessage("");
  };

  const startEdit = async (employee) => {
    if (documentAbortRef.current) {
      documentAbortRef.current.abort();
    }
    const controller = new AbortController();
    documentAbortRef.current = controller;
    activeEditingIdRef.current = employee.id;

    setEditingId(employee.id);
    setIsFormOpen(true);
    setDocumentsLoading(true);
    setExistingDocuments([]);
    setMessage("Existing documents are protected. You can upload any missing ones or select a new file to replace an existing one.");
    setFiles({});
    setFileInputKey((k) => k + 1);

    const rawLocs = employee.locations && employee.locations.length > 0
      ? employee.locations.map((loc) => ({
          latitude: String(loc.latitude ?? ""),
          longitude: String(loc.longitude ?? ""),
          allowed_radius: String(loc.allowed_radius ?? 100),
          is_primary: Boolean(loc.is_primary),
        }))
      : [{
          latitude: employee.latitude !== null && employee.latitude !== undefined ? String(employee.latitude) : "",
          longitude: employee.longitude !== null && employee.longitude !== undefined ? String(employee.longitude) : "",
          allowed_radius: String(employee.allowed_radius ?? 100),
          is_primary: true,
        }];

    if (!rawLocs.some((l) => l.is_primary)) {
      rawLocs[0].is_primary = true;
    }

    setForm({
      username: employee.username || "",
      first_name: employee.first_name || "",
      last_name: employee.last_name || "",
      email: employee.email || "",
      password: "",
      role: employee.role || "employee",
      site_id: employee.site_id ? String(employee.site_id) : "",
      manager: employee.manager_id ? String(employee.manager_id) : "",
      team_name: employee.team_name || "",
      joining_date: employee.joining_date || "",
      leave_allotted: String(employee.leave_allotted ?? 0),
      designation: employee.designation || "",
      locations: rawLocs,
      is_active_employee: employee.is_active_employee ?? true,
    });

    try {
      const response = await API.get(`/auth/documents/${employee.id}/`, {
        signal: controller.signal,
      });
      if (activeEditingIdRef.current === employee.id) {
        setExistingDocuments(Array.isArray(response.data) ? response.data : []);
      }
    } catch (err) {
      if (err.name === "CanceledError" || err.name === "AbortError" || API.isCancel?.(err)) {
        return;
      }
      console.log(err.response?.data || err.message);
      if (activeEditingIdRef.current === employee.id) {
        setExistingDocuments([]);
        showPopup("Unable to load employee documents for edit");
      }
    } finally {
      if (activeEditingIdRef.current === employee.id) {
        setDocumentsLoading(false);
      }
    }
    setTimeout(() => {
      formCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");

    const isEditingSelf = editingId && String(editingId) === String(currentUserId);
    if (isEditingSelf && form.role !== (authUser?.role || userRole)) {
      showPopup("You cannot change or demote your own role", "warning", "Action Blocked");
      return;
    }

    // Input sanitization and whitespace trimming (BUG-E04)
    const cleanUsername = (form.username || "").trim();
    const cleanFirstName = (form.first_name || "").trim();
    const cleanLastName = (form.last_name || "").trim();
    const cleanEmail = (form.email || "").trim();
    const cleanDesignation = (form.designation || "").trim();
    const cleanTeamName = (form.team_name || "").trim();

    if (!cleanUsername) {
      showPopup("Username is required", "warning", "Validation Error");
      return;
    }
    if (!cleanFirstName) {
      showPopup("Employee first name is required", "warning", "Validation Error");
      return;
    }

    if (["employee", "manager", "hr"].includes(form.role) && !form.site_id) {
      showPopup("Select a work site for this employee", "warning", "Work site required");
      return;
    }

    // Password validation (BUG-E03)
    if (!editingId) {
      if (!form.password || form.password.length < 12) {
        showPopup("Password must be at least 12 characters", "warning", "Password Too Short");
        return;
      }
      if (form.password.length > 128) {
        showPopup("Password must not exceed 128 characters", "warning", "Password Too Long");
        return;
      }
    } else if (form.password && form.password.trim()) {
      if (form.password.length < 12) {
        showPopup("New password must be at least 12 characters", "warning", "Password Too Short");
        return;
      }
      if (form.password.length > 128) {
        showPopup("New password must not exceed 128 characters", "warning", "Password Too Long");
        return;
      }
    }

    if (!editingId && (!files.photo_copy || !files.aadhar_file || !files.pan_file || !files.bank_file)) {
      showPopup("Photo Copy, Aadhar, PAN and bank details documents are required", "warning", "Missing documents");
      return;
    }

    // Primary Location Validation (BUG-E02)
    const primaryLoc = form.locations.find((l) => l.is_primary) || form.locations[0];
    if (!primaryLoc || primaryLoc.latitude === "" || primaryLoc.longitude === "") {
      showPopup("Primary location latitude and longitude are required", "warning", "Validation Error");
      return;
    }

    const primLat = Number(primaryLoc.latitude);
    const primLng = Number(primaryLoc.longitude);
    if (isNaN(primLat) || primLat < -90 || primLat > 90) {
      showPopup("Primary location latitude must be a valid number between -90 and 90", "warning", "Validation Error");
      return;
    }
    if (isNaN(primLng) || primLng < -180 || primLng > 180) {
      showPopup("Primary location longitude must be a valid number between -180 and 180", "warning", "Validation Error");
      return;
    }

    for (let i = 0; i < form.locations.length; i++) {
      const loc = form.locations[i];
      if (loc !== primaryLoc) {
        const hasLat = loc.latitude !== "";
        const hasLng = loc.longitude !== "";
        if (hasLat !== hasLng) {
          showPopup(`Location #${i + 1} requires both latitude and longitude to be filled, or both empty`, "warning", "Validation Error");
          return;
        }
      }
    }

    if (editingId) {
      setSavingEdit(true);
      try {
        const filteredLocs = form.locations
          .filter((loc) => loc.latitude !== "" && loc.longitude !== "")
          .map((loc) => ({
            latitude: Number(loc.latitude),
            longitude: Number(loc.longitude),
            allowed_radius: loc.allowed_radius === "" ? 100 : Number(loc.allowed_radius),
            is_primary: Boolean(loc.is_primary),
          }));

        // Ensure at least one primary exists in filteredLocs
        if (filteredLocs.length > 0 && !filteredLocs.some((l) => l.is_primary)) {
          filteredLocs[0].is_primary = true;
        }

        const primary = filteredLocs.find((l) => l.is_primary) || filteredLocs[0];

        const payload = {
          username: cleanUsername,
          first_name: cleanFirstName,
          last_name: cleanLastName,
          email: cleanEmail,
          role: form.role,
          site_id: form.site_id ? Number(form.site_id) : null,
          manager: form.role === "employee" && form.manager ? Number(form.manager) : null,
          team_name: form.role === "manager" ? (cleanTeamName || null) : null,
          joining_date: form.joining_date || null,
          leave_allotted: form.leave_allotted === "" ? 0 : Number(form.leave_allotted),
          latitude: primary ? Number(primary.latitude) : null,
          longitude: primary ? Number(primary.longitude) : null,
          allowed_radius: primary ? Number(primary.allowed_radius) : 100,
          is_active_employee: Boolean(form.is_active_employee),
          designation: cleanDesignation || null,
          locations: filteredLocs,
        };

        if (form.password && ["admin", "superadmin"].includes(userRole)) {
          payload.password = form.password;
        }

        const res = await API.put(`/auth/employees/${editingId}/`, payload);
        const pendingDocumentUploads = documentLabels.filter(
          (doc) => Boolean(files[doc.key])
        );
        let uploadedCount = 0;
        let uploadError = null;

        for (const document of pendingDocumentUploads) {
          const formData = new FormData();
          formData.append("user", String(editingId));
          formData.append("title", document.label);
          formData.append("file", files[document.key]);

          try {
            await API.post("/auth/documents/upload/", formData, {
              headers: { "Content-Type": "multipart/form-data" },
            });
            uploadedCount += 1;
          } catch (err) {
            console.log(err.response?.data || err.message);
            uploadError = extractError(err.response?.data, `Unable to upload ${document.label}`);
            break;
          }
        }

        if (uploadError) {
          showPopup(uploadError);
        }

        setMessage(
          uploadedCount > 0
            ? `${res.data.message || "Employee updated successfully"} and ${uploadedCount} document${uploadedCount > 1 ? "s were" : " was"} uploaded.`
            : res.data.message || "Employee updated successfully"
        );
        resetForm();
        setIsFormOpen(false);
        await loadData();
      } catch (err) {
        console.log(err.response?.data || err.message);
        showPopup(extractError(err.response?.data, "Unable to update employee"));
      } finally {
        setSavingEdit(false);
      }
      return;
    }

    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("username", cleanUsername);
      formData.append("first_name", cleanFirstName);
      formData.append("last_name", cleanLastName);
      formData.append("email", cleanEmail);
      formData.append("role", form.role);
      formData.append("password", form.password);

      if (["employee", "manager", "hr"].includes(form.role) && form.site_id) {
        formData.append("site_id", form.site_id);
      }
      if (form.role === "manager" && cleanTeamName) {
        formData.append("team_name", cleanTeamName);
      }
      if (form.role === "employee" && form.manager) {
        formData.append("manager", form.manager);
      }
      if (form.joining_date) {
        formData.append("joining_date", form.joining_date);
      }
      formData.append("leave_allotted", form.leave_allotted === "" ? "0" : String(form.leave_allotted));
      if (cleanDesignation) {
        formData.append("designation", cleanDesignation);
      }

      const filteredLocs = form.locations
        .filter((loc) => loc.latitude !== "" && loc.longitude !== "")
        .map((loc) => ({
          latitude: Number(loc.latitude),
          longitude: Number(loc.longitude),
          allowed_radius: loc.allowed_radius === "" ? 100 : Number(loc.allowed_radius),
          is_primary: Boolean(loc.is_primary),
        }));

      if (filteredLocs.length > 0 && !filteredLocs.some((l) => l.is_primary)) {
        filteredLocs[0].is_primary = true;
      }

      formData.append("locations", JSON.stringify(filteredLocs));

      const primary = filteredLocs.find((l) => l.is_primary) || filteredLocs[0];
      if (primary) {
        formData.append("latitude", String(primary.latitude));
        formData.append("longitude", String(primary.longitude));
        formData.append("allowed_radius", String(primary.allowed_radius));
      }

      Object.entries(files).forEach(([key, file]) => {
        if (file) {
          formData.append(key, file);
        }
      });

      const res = await API.post("/auth/create-employee/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setMessage(res.data.message || "Employee created successfully");
      resetForm();
      setIsFormOpen(false);
      await loadData();
    } catch (err) {
      console.log(err.response?.data || err.message);
      showPopup(extractError(err.response?.data, "Unable to create employee"));
    } finally {
      setSubmitting(false);
    }
  };

  const openStatusDialog = (employee) => {
    setStatusDialog(employee);
    setNoticePopup(null);
  };

  const closeStatusDialog = () => {
    if (!statusChangingId) {
      setStatusDialog(null);
    }
  };

  const handleStatusToggle = async () => {
    const employee = statusDialog;
    if (!employee) {
      return;
    }

    const nextStatus = !employee.is_active_employee;
    const actionLabel = nextStatus ? "activate" : "deactivate";

    setStatusChangingId(employee.id);
    setMessage("");
    setNoticePopup(null);
    try {
      const res = await API.put(`/auth/employees/${employee.id}/`, {
        is_active_employee: nextStatus,
      });
      setStatusDialog(null);
      showPopup(
        res.data.message || `Employee ${nextStatus ? "activated" : "deactivated"} successfully`,
        "success",
        "Status updated"
      );
      if (editingId === employee.id) {
        resetForm();
      }
      await loadData();
    } catch (err) {
      console.log(err.response?.data || err.message);
      showPopup(extractError(err.response?.data, `Failed to ${actionLabel} employee`));
    } finally {
      setStatusChangingId(null);
    }
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
        {/* 1. Workforce Hero Banner */}
        <section className="relative overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#064e3b_0%,#0f766e_50%,#064e3b_100%)] px-8 py-8 text-white shadow-xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.16),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(34,197,94,0.20),_transparent_30%)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-100">
                <UserCog size={14} />
                HR Workforce Desk
              </p>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Create staff accounts, assign teams, and manage employee records from one workspace
              </h1>
              <p className="mt-3 text-sm text-slate-200">
                HR can onboard employees and managers, assign reporting teams, capture office attendance settings, and update staff details without changing stored documents from this screen.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
              <HeroTile icon={<Users size={16} />} label="Total Staff" value={totalStaffCount} />
              <HeroTile icon={<Briefcase size={16} />} label="Managers" value={managerCount} />
              <HeroTile icon={<UserPlus size={16} />} label="Employees" value={employeeCount} />
              <HeroTile icon={<UserCog size={16} />} label="HRs" value={hrCount} />
              <HeroTile icon={<ShieldCheck size={16} />} label="Admins" value={adminCount} />
            </div>
          </div>
        </section>

        {/* Status / Notice Alert Banner */}
        {message ? (
          <div className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3.5 text-sm font-medium text-emerald-800 shadow-sm">
            <span>{message}</span>
            <button
              type="button"
              onClick={() => setMessage("")}
              className="text-emerald-600 hover:text-emerald-800"
            >
              <X size={16} />
            </button>
          </div>
        ) : null}

        {/* 2. Collapsible Employee Creation / Edit Card */}
        <section
          ref={formCardRef}
          className="rounded-3xl border border-slate-200 bg-white shadow-sm transition-all duration-300"
        >
          {/* Card Header with Collapse / Expand Toggle */}
          <div
            className={`flex items-center justify-between px-6 py-5 cursor-pointer select-none transition ${
              isFormOpen ? "border-b border-slate-100" : "hover:bg-slate-50/60"
            }`}
            onClick={() => setIsFormOpen((prev) => !prev)}
          >
            <div className="flex items-center gap-4">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
                {editingId ? <Pencil size={20} /> : <FileBadge2 size={20} />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-900">
                    {editingId ? "Edit Staff Details" : "Create Employee or Manager"}
                  </h2>
                  {editingId && (
                    <span className="rounded-full bg-cyan-100 px-2.5 py-0.5 text-xs font-semibold text-cyan-800">
                      ID: #{editingId}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  Required joining documents: Photo Copy, Aadhar, PAN, Bank Details. Optional: CV, Voter ID, Driving License.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {editingId && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    resetForm();
                    setIsFormOpen(false);
                  }}
                  className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
                >
                  Cancel Edit
                </button>
              )}
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 transition"
                aria-label={isFormOpen ? "Collapse Form" : "Expand Form"}
              >
                {isFormOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>
            </div>
          </div>

          {/* Collapsible Form Body */}
          {isFormOpen && (
            <div className="p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <SelectField
                    label="Role"
                    value={form.role}
                    disabled={Boolean(editingId && String(editingId) === String(currentUserId))}
                    helperText={editingId && String(editingId) === String(currentUserId) ? "You cannot modify your own role" : ""}
                    onChange={(value) => handleChange("role", value)}
                    options={[
                      { value: "employee", label: "Employee" },
                      { value: "manager", label: "Manager" },
                      ...(userRole === "admin" ? [{ value: "hr", label: "HR" }] : []),
                      ...(userRole === "superadmin"
                        ? [
                            { value: "hr", label: "HR" },
                            { value: "admin", label: "Admin" },
                            { value: "superadmin", label: "Superadmin" },
                          ]
                        : []),
                    ]}
                    placeholder="Select role"
                  />
                  {["employee", "manager", "hr"].includes(form.role) && (
                    <SelectField
                      label="Work Site"
                      value={form.site_id}
                      onChange={(value) => handleChange("site_id", value)}
                      options={sites.map((site) => ({ value: String(site.id), label: site.name }))}
                      placeholder={sites.length ? "Select work site" : "Create a site first"}
                    />
                  )}
                  <InputField
                    label="Username"
                    value={form.username}
                    onChange={(value) => handleChange("username", value)}
                  />
                  <InputField
                    label="Employee First Name"
                    value={form.first_name}
                    onChange={(value) => handleChange("first_name", value)}
                  />
                  <InputField
                    label="Employee Last Name"
                    value={form.last_name}
                    onChange={(value) => handleChange("last_name", value)}
                  />
                  <InputField
                    label="Email"
                    type="email"
                    value={form.email}
                    onChange={(value) => handleChange("email", value)}
                  />
                  <InputField
                    label="Designation"
                    value={form.designation}
                    onChange={(value) => handleChange("designation", value)}
                    placeholder="e.g. Senior Software Engineer"
                  />
                  {(!editingId || ["admin", "superadmin"].includes(userRole)) && (
                    <PasswordField
                      label={editingId ? "Password (Leave blank to keep unchanged)" : "Password"}
                      value={form.password}
                      onChange={(value) => handleChange("password", value)}
                      placeholder={editingId ? "Enter new password" : "Min. 12 characters"}
                    />
                  )}
                  {editingId && String(editingId) !== String(currentUserId) && (
                    <ToggleField
                      label="Status"
                      checked={Boolean(form.is_active_employee)}
                      onChange={(value) => handleChange("is_active_employee", value)}
                    />
                  )}

                  {form.role === "employee" ? (
                    <SelectField
                      label="Assign Team / Manager"
                      value={form.manager}
                      onChange={(value) => handleChange("manager", value)}
                      options={managers
                        .filter((manager) => !editingId || String(manager.id) !== String(editingId))
                        .map((manager) => ({
                          value: String(manager.id),
                          label: manager.team_name ? `${manager.name} - ${manager.team_name}` : manager.name,
                        }))}
                      placeholder="Select reporting manager"
                    />
                  ) : form.role === "manager" ? (
                    <InputField
                      label="Managed Team Name"
                      value={form.team_name}
                      onChange={(value) => handleChange("team_name", value)}
                      placeholder="e.g. Frontend Engineering"
                    />
                  ) : null}

                  <InputField
                    label="Joining Date"
                    type="date"
                    value={form.joining_date}
                    onChange={(value) => handleChange("joining_date", value)}
                  />
                  <InputField
                    label="Leave Allotted (Days)"
                    type="number"
                    value={form.leave_allotted}
                    onChange={(value) => handleChange("leave_allotted", value)}
                  />
                </div>

                {/* Dynamic Multiple Locations Component */}
                <div className="border-t border-slate-200 pt-6 mt-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-base font-semibold text-slate-900">Allowed Office Locations</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Primary location is mandatory; additional locations are optional for clocking in/out.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddLocation}
                      className="rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-700 hover:bg-cyan-100 transition"
                    >
                      + Add Location
                    </button>
                  </div>

                  <div className="space-y-4">
                    {form.locations.map((loc, idx) => (
                      <div
                        key={idx}
                        className={`rounded-2xl border p-4 relative transition ${
                          loc.is_primary ? "border-cyan-300 bg-cyan-50/30" : "border-slate-200 bg-slate-50/60"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="radio"
                              name="primary_location_selection"
                              checked={Boolean(loc.is_primary)}
                              onChange={() => handleSetPrimaryLocation(idx)}
                              className="h-4 w-4 text-cyan-600 focus:ring-cyan-500 border-slate-300"
                            />
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                              {loc.is_primary ? `Location #${idx + 1} (Primary)` : `Location #${idx + 1}`}
                            </span>
                          </label>
                          {form.locations.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveLocation(idx)}
                              className="text-xs font-semibold text-rose-600 hover:text-rose-800 transition"
                            >
                              Remove
                            </button>
                          )}
                        </div>

                        <div className="grid gap-3 sm:grid-cols-3">
                          <InputField
                            label="Latitude"
                            value={loc.latitude}
                            onChange={(val) => handleLocationChange(idx, "latitude", val)}
                            placeholder="e.g. 22.5726"
                          />
                          <InputField
                            label="Longitude"
                            value={loc.longitude}
                            onChange={(val) => handleLocationChange(idx, "longitude", val)}
                            placeholder="e.g. 88.3639"
                          />
                          <InputField
                            label="Allowed Radius (Meters)"
                            type="number"
                            value={loc.allowed_radius}
                            onChange={(val) => handleLocationChange(idx, "allowed_radius", val)}
                            placeholder="100"
                          />
                        </div>

                        <div className="mt-3 flex justify-end">
                          <button
                            type="button"
                            onClick={() => setMapPickerTarget(idx)}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition"
                          >
                            <MapPin size={14} className="text-cyan-600" />
                            Select on Map
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Document Uploads Component */}
                <div className="border-t border-slate-200 pt-6 mt-6">
                  <div className="mb-4">
                    <h3 className="text-base font-semibold text-slate-900">Joining Documents</h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Upload mandatory and optional identity and banking documents.
                    </p>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {documentLabels.map((doc) => {
                      const uploadedDocument = uploadedDocumentTitles.has(doc.label);
                      return (
                        <label
                          key={doc.key}
                          className={`block rounded-2xl border p-4 transition ${
                            uploadedDocument
                              ? "border-emerald-200 bg-emerald-50/50"
                              : "border-slate-200 bg-slate-50"
                          }`}
                        >
                          <span
                            className={`text-sm font-medium ${
                              uploadedDocument ? "text-emerald-950" : "text-slate-700"
                            }`}
                          >
                            {doc.label} {doc.required && !uploadedDocument ? "*" : "(Optional)"}
                          </span>
                          <input
                            key={`${doc.key}-${fileInputKey}`}
                            type="file"
                            accept={doc.key === "photo_copy" ? "image/jpeg,image/png,image/webp,image/jpg" : undefined}
                            onChange={(e) => handleFileChange(doc.key, e.target.files?.[0] || null)}
                            className={`mt-2 block w-full text-sm ${
                              uploadedDocument ? "text-emerald-800" : "text-slate-600"
                            }`}
                            disabled={documentsLoading}
                          />
                          <p
                            className={`mt-2 text-xs ${
                              uploadedDocument ? "text-emerald-600 font-medium" : "text-slate-500"
                            }`}
                          >
                            {uploadedDocument
                              ? "Already uploaded. Select a new file to overwrite."
                              : "Missing document. Upload now if you want to add it."}
                          </p>
                        </label>
                      );
                    })}
                  </div>
                  {documentsLoading ? (
                    <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                      Loading uploaded documents...
                    </div>
                  ) : null}
                </div>

                {/* Form Action Buttons */}
                <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="submit"
                    disabled={submitting || savingEdit || documentsLoading}
                    className="rounded-2xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-70 shadow-sm"
                  >
                    {editingId ? (savingEdit ? "Saving..." : "Save Changes") : submitting ? "Creating..." : "Create Staff"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      resetForm();
                      setIsFormOpen(false);
                    }}
                    className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                  >
                    {editingId ? "Cancel Edit" : "Close Form"}
                  </button>
                </div>
              </form>
            </div>
          )}
        </section>

        {/* 3. Full-Width Staff Directory Section */}
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          {/* Directory Header Bar */}
          <div className="border-b border-slate-100 px-6 py-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3.5">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                  <Users size={22} />
                </div>
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-slate-900">Staff Directory</h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Manage all employees and managers in your organization
                  </p>
                </div>
              </div>

              {/* 3 Badges: Total Staff, Active, Inactive */}
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex items-center gap-2.5 rounded-2xl border border-blue-100 bg-blue-50/70 px-3.5 py-1.5 text-blue-700">
                  <Users size={16} />
                  <div className="flex flex-col">
                    <span className="text-sm font-bold leading-none">{totalStaffCount}</span>
                    <span className="text-[10px] font-medium leading-none text-blue-600/80 mt-0.5">Total</span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-3.5 py-1.5 text-emerald-700">
                  <UserCheck size={16} />
                  <div className="flex flex-col">
                    <span className="text-sm font-bold leading-none">{activeStaffCount}</span>
                    <span className="text-[10px] font-medium leading-none text-emerald-600/80 mt-0.5">Active</span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 rounded-2xl border border-rose-100 bg-rose-50/70 px-3.5 py-1.5 text-rose-700">
                  <UserX size={16} />
                  <div className="flex flex-col">
                    <span className="text-sm font-bold leading-none">{inactiveStaffCount}</span>
                    <span className="text-[10px] font-medium leading-none text-rose-600/80 mt-0.5">Inactive</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Filter & Action Toolbar */}
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              {/* Search Bar */}
              <div className="relative min-w-[240px] flex-1">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="Search by name, username, email or employee ID..."
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-3.5 text-xs text-slate-900 outline-none transition focus:border-cyan-400 focus:bg-white"
                />
              </div>

              {/* Role Dropdown */}
              <div className="relative min-w-[130px]">
                <select
                  value={roleFilter}
                  onChange={(e) => {
                    setRoleFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full appearance-none rounded-2xl border border-slate-200 bg-slate-50 py-2.5 pl-8 pr-8 text-xs font-medium text-slate-700 outline-none transition focus:border-cyan-400 focus:bg-white"
                >
                  <option value="all">All Roles</option>
                  <option value="employee">Employee</option>
                  <option value="manager">Manager</option>
                  <option value="hr">HR</option>
                  <option value="admin">Admin</option>
                  <option value="superadmin">Superadmin</option>
                </select>
                <ShieldCheck
                  size={14}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <ChevronDown
                  size={13}
                  className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
              </div>

              {/* Team Dropdown */}
              <div className="relative min-w-[130px]">
                <select
                  value={teamFilter}
                  onChange={(e) => {
                    setTeamFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full appearance-none rounded-2xl border border-slate-200 bg-slate-50 py-2.5 pl-8 pr-8 text-xs font-medium text-slate-700 outline-none transition focus:border-cyan-400 focus:bg-white"
                >
                  <option value="all">All Teams</option>
                  {availableTeams.map((team) => (
                    <option key={team} value={team}>
                      {team}
                    </option>
                  ))}
                </select>
                <Briefcase
                  size={14}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <ChevronDown
                  size={13}
                  className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
              </div>

              {/* Status Dropdown */}
              <div className="relative min-w-[120px]">
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full appearance-none rounded-2xl border border-slate-200 bg-slate-50 py-2.5 pl-8 pr-8 text-xs font-medium text-slate-700 outline-none transition focus:border-cyan-400 focus:bg-white"
                >
                  <option value="all">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
                <CheckCircle2
                  size={14}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <ChevronDown
                  size={13}
                  className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
              </div>

              {/* Clear Filter Button */}
              {(searchTerm || roleFilter !== "all" || teamFilter !== "all" || statusFilter !== "all") && (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition shadow-sm"
                >
                  <X size={13} />
                  Clear
                </button>
              )}

              {/* Add Employee Button */}
              <button
                type="button"
                onClick={handleAddEmployeeClick}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 transition shadow-sm"
              >
                <UserPlus size={15} />
                + Add Employee
              </button>
            </div>
          </div>

          {/* Directory Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="w-12 px-4 py-3.5 text-center">#</th>
                  <th className="px-5 py-3.5">Staff</th>
                  <th className="px-4 py-3.5">Role</th>
                  <th className="px-4 py-3.5">Team</th>
                  <th className="px-4 py-3.5">Documents</th>
                  <th className="px-4 py-3.5">Joining Date</th>
                  <th className="px-4 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="px-6 py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Users size={32} className="text-slate-300" />
                        <p className="text-sm font-medium text-slate-700">No staff members found</p>
                        <p className="text-xs text-slate-400">
                          Try adjusting your search or filters to find what you are looking for.
                        </p>
                        <button
                          type="button"
                          onClick={handleClearFilters}
                          className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                        >
                          <RotateCcw size={13} />
                          Reset Filters
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  employees.map((employee, idx) => {
                    const rowNumber = startIndex + idx + 1;
                    const initials = getInitials(employee.name, employee.username);
                    const avatarStyle = getAvatarStyle(employee.role, employee.name || employee.username);
                    const roleBadgeStyle = getRoleBadgeStyle(employee.role);
                    const displayManager = employee.manager_name || employee.manager;
                    const displayTeam =
                      employee.role === "manager"
                        ? (employee.team_name ? `Own: ${employee.team_name}` : "Own team owner")
                        : employee.role === "employee"
                          ? (
                              <div className="flex flex-col">
                                <span className="font-medium text-slate-800">{employee.team_name || "No team assigned"}</span>
                                {displayManager && (
                                  <span className="text-[11px] text-slate-400">
                                    Mgr: {displayManager}
                                  </span>
                                )}
                              </div>
                            )
                          : "N/A";

                    return (
                      <tr
                        key={employee.id}
                        className="transition hover:bg-slate-50/70"
                      >
                        {/* 1. Row Index */}
                        <td className="w-12 px-4 py-3.5 text-center font-mono text-xs text-slate-400">
                          {rowNumber}
                        </td>

                        {/* 2. Staff: Avatar + Name + Email */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            {employee.profile_picture ? (
                              <img
                                src={employee.profile_picture}
                                alt={employee.name || employee.username}
                                className="h-10 w-10 flex-shrink-0 rounded-full border border-slate-200 object-cover"
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                  if (e.currentTarget.nextElementSibling) {
                                    e.currentTarget.nextElementSibling.classList.remove("hidden");
                                  }
                                }}
                              />
                            ) : null}
                            <div
                              className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border text-xs font-bold ${avatarStyle} ${
                                employee.profile_picture ? "hidden" : ""
                              }`}
                            >
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <div
                                onClick={() => setViewingEmployee(employee)}
                                className="font-semibold text-slate-900 hover:text-cyan-700 cursor-pointer truncate max-w-[200px]"
                                title={employee.name || employee.username}
                              >
                                {employee.name || employee.username}
                              </div>
                              <div
                                className="text-xs text-slate-400 truncate max-w-[200px]"
                                title={employee.email}
                              >
                                {employee.email || "No email"}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* 3. Role */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span
                            className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${roleBadgeStyle}`}
                          >
                            {employee.role}
                          </span>
                        </td>

                        {/* 4. Team */}
                        <td className="px-4 py-3.5 text-xs text-slate-700 whitespace-nowrap">
                          {displayTeam}
                        </td>

                        {/* 5. Documents */}
                        <td className="px-4 py-3.5 text-xs text-slate-600 whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5 text-slate-600">
                            <Paperclip size={13} className="text-slate-400" />
                            <span>{employee.document_count ?? 0}</span>
                          </div>
                        </td>

                        {/* 6. Joining Date */}
                        <td className="px-4 py-3.5 text-xs text-slate-600 whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5 text-slate-600">
                            <Calendar size={13} className="text-slate-400" />
                            <span>{formatJoiningDate(employee.joining_date)}</span>
                          </div>
                        </td>

                        {/* 7. Status */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                              employee.is_active_employee
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : "border-slate-200 bg-slate-100 text-slate-600"
                            }`}
                          >
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                employee.is_active_employee ? "bg-emerald-500" : "bg-slate-400"
                              }`}
                            />
                            {employee.is_active_employee ? "Active" : "Inactive"}
                          </span>
                        </td>

                        {/* 8. Actions */}
                        <td className="px-5 py-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            {/* View Profile Button */}
                            <button
                              type="button"
                              onClick={() => setViewingEmployee(employee)}
                              title="View Staff Details"
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-cyan-700 transition"
                            >
                              <Eye size={16} />
                            </button>

                            {/* Edit Button */}
                            {canManage(employee.role) && (
                              <button
                                type="button"
                                onClick={() => startEdit(employee)}
                                title="Edit Staff Record"
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-blue-700 transition"
                              >
                                <Pencil size={15} />
                              </button>
                            )}

                            {/* Status Toggle / Options */}
                            {canManage(employee.role) && String(employee.id) !== String(currentUserId) && (
                              <button
                                type="button"
                                onClick={() => openStatusDialog(employee)}
                                disabled={statusChangingId === employee.id}
                                title={employee.is_active_employee ? "Deactivate Staff" : "Activate Staff"}
                                className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
                                  employee.is_active_employee
                                    ? "text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                                    : "text-slate-500 hover:bg-emerald-50 hover:text-emerald-600"
                                }`}
                              >
                                <MoreVertical size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Directory Pagination Footer */}
          <div className="flex flex-col items-center justify-between gap-4 border-t border-slate-100 px-6 py-4 sm:flex-row">
            {/* Left: Summary Count */}
            <div className="text-xs text-slate-500">
              Showing{" "}
              <span className="font-semibold text-slate-700">
                {totalRecords === 0 ? 0 : startIndex + 1}
              </span>{" "}
              –{" "}
              <span className="font-semibold text-slate-700">{endIndex}</span> of{" "}
              <span className="font-semibold text-slate-700">{totalRecords}</span> employees
            </div>

            {/* Right: Rows Per Page & Page Controls */}
            <div className="flex items-center gap-4">
              {/* Rows Per Page Selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-medium">Rows per page</span>
                <select
                  value={rowsPerPage}
                  onChange={(e) => {
                    setRowsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 outline-none transition focus:border-cyan-400 focus:bg-white"
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>

              {/* Page Buttons */}
              <div className="flex items-center gap-1">
                {/* Previous Button */}
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safeCurrentPage <= 1}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent transition"
                  aria-label="Previous Page"
                >
                  <ChevronLeft size={16} />
                </button>

                {/* Page Numbers */}
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => {
                    if (totalPages <= 7) return true;
                    if (p === 1 || p === totalPages) return true;
                    return Math.abs(p - safeCurrentPage) <= 1;
                  })
                  .reduce((acc, p, i, arr) => {
                    if (i > 0 && p - arr[i - 1] > 1) {
                      acc.push("ellipsis-" + p);
                    }
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((item) => {
                    if (typeof item === "string" && item.startsWith("ellipsis")) {
                      return (
                        <span key={item} className="px-1 text-xs text-slate-400">
                          ...
                        </span>
                      );
                    }
                    const p = item;
                    const isActive = p === safeCurrentPage;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setCurrentPage(p)}
                        className={`h-8 min-w-[32px] rounded-xl px-2 text-xs font-semibold transition ${
                          isActive
                            ? "bg-slate-900 text-white shadow-sm"
                            : "border border-slate-200 text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {p}
                      </button>
                    );
                  })}

                {/* Next Button */}
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safeCurrentPage >= totalPages}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent transition"
                  aria-label="Next Page"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* View Employee Details Modal */}
      {viewingEmployee && (
        <ViewEmployeeModal
          employee={viewingEmployee}
          canEdit={canManage(viewingEmployee.role)}
          onEdit={() => {
            const emp = viewingEmployee;
            setViewingEmployee(null);
            startEdit(emp);
          }}
          onClose={() => setViewingEmployee(null)}
        />
      )}

      {/* Status Confirmation Modal */}
      {statusDialog ? (
        <StatusConfirmPopup
          employee={statusDialog}
          loading={statusChangingId === statusDialog.id}
          onCancel={closeStatusDialog}
          onConfirm={handleStatusToggle}
        />
      ) : null}

      {/* Map Picker Modal */}
      {mapPickerTarget !== null && (
        <MapPickerModal
          latitude={form.locations[mapPickerTarget]?.latitude}
          longitude={form.locations[mapPickerTarget]?.longitude}
          defaultLatitude={form.locations.find((l) => l.latitude && l.longitude)?.latitude || "22.5726"}
          defaultLongitude={form.locations.find((l) => l.latitude && l.longitude)?.longitude || "88.3639"}
          onSelect={(lat, lng) => {
            handleLocationChange(mapPickerTarget, "latitude", lat);
            handleLocationChange(mapPickerTarget, "longitude", lng);
            setMapPickerTarget(null);
          }}
          onClose={() => setMapPickerTarget(null)}
        />
      )}

      {/* Notice Popup */}
      {noticePopup ? (
        <NoticePopup notice={noticePopup} onClose={() => setNoticePopup(null)} />
      ) : null}
    </Layout>
  );
}

function ViewEmployeeModal({ employee, canEdit, onEdit, onClose }) {
  const initials = getInitials(employee.name, employee.username);
  const avatarStyle = getAvatarStyle(employee.role, employee.name || employee.username);
  const roleBadgeStyle = getRoleBadgeStyle(employee.role);
  const canGrantConcession = ["hr", "admin", "superadmin"].includes(localStorage.getItem("role"));
  const [concessions, setConcessions] = useState([]);
  const [concessionForm, setConcessionForm] = useState({ leave_type: "casual", additional_days: "", effective_date: new Date().toISOString().slice(0, 10), expiry_date: "", reason: "" });
  const [concessionBusy, setConcessionBusy] = useState(false);
  const [concessionError, setConcessionError] = useState("");

  const loadConcessions = useCallback(async () => {
    if (!canGrantConcession) return;
    try {
      const response = await API.get(`/leave/concessions/${employee.id}/`);
      setConcessions(response.data?.records || []);
    } catch (error) {
      setConcessionError(error.response?.data?.error || "Unable to load leave concessions");
    }
  }, [canGrantConcession, employee.id]);
  useEffect(() => { loadConcessions(); }, [loadConcessions]);

  const grantConcession = async (event) => {
    event.preventDefault();
    setConcessionBusy(true);
    setConcessionError("");
    try {
      await API.post("/leave/concessions/", {
        employee_id: Number(employee.id),
        leave_type: concessionForm.leave_type,
        additional_days: Number(concessionForm.additional_days),
        effective_date: concessionForm.effective_date,
        expiry_date: concessionForm.expiry_date || null,
        reason: concessionForm.reason.trim(),
        idempotency_key: crypto.randomUUID(),
      });
      setConcessionForm((current) => ({ ...current, additional_days: "", expiry_date: "", reason: "" }));
      await loadConcessions();
    } catch (error) {
      setConcessionError(error.response?.data?.error || "Unable to grant leave concession");
    } finally {
      setConcessionBusy(false);
    }
  };

  const reverseConcession = async (concession) => {
    const reason = window.prompt("Reason for reversing this concession:");
    if (!reason?.trim()) return;
    try {
      await API.post(`/leave/concessions/${concession.id}/reverse/`, { reason: reason.trim(), idempotency_key: crypto.randomUUID() });
      await loadConcessions();
    } catch (error) {
      setConcessionError(error.response?.data?.error || "Unable to reverse concession");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-5">
          <div className="flex items-center gap-4">
            {employee.profile_picture ? (
              <img
                src={employee.profile_picture}
                alt={employee.name || employee.username}
                className="h-14 w-14 flex-shrink-0 rounded-full border border-slate-200 object-cover"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                  if (e.currentTarget.nextElementSibling) {
                    e.currentTarget.nextElementSibling.classList.remove("hidden");
                  }
                }}
              />
            ) : null}
            <div
              className={`flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full border text-base font-bold ${avatarStyle} ${
                employee.profile_picture ? "hidden" : ""
              }`}
            >
              {initials}
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {employee.name || employee.username}
              </h2>
              {employee.designation && (
                <p className="text-xs font-semibold text-cyan-700">{employee.designation}</p>
              )}
              <div className="mt-1 flex items-center gap-2">
                <span
                  className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${roleBadgeStyle}`}
                >
                  {employee.role}
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                    employee.is_active_employee
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-slate-100 text-slate-600"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      employee.is_active_employee ? "bg-emerald-500" : "bg-slate-400"
                    }`}
                  />
                  {employee.is_active_employee ? "Active" : "Inactive"}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Details Grid */}
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-4 rounded-2xl bg-slate-50 p-4 border border-slate-100 text-xs">
            <div>
              <span className="text-slate-400 block font-medium">Username</span>
              <span className="font-semibold text-slate-800 mt-0.5 block">{employee.username}</span>
            </div>
            <div>
              <span className="text-slate-400 block font-medium">Email</span>
              <span className="font-semibold text-slate-800 mt-0.5 block truncate" title={employee.email}>
                {employee.email || "N/A"}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block font-medium">Assigned Team</span>
              <span className="font-semibold text-slate-800 mt-0.5 block">
                {employee.role === "manager"
                  ? (employee.team_name ? `Own: ${employee.team_name}` : "Own team owner")
                  : employee.team_name || "Not assigned"}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block font-medium">Reporting Manager</span>
              <span className="font-semibold text-slate-800 mt-0.5 block">
                {employee.manager_name || employee.manager || (employee.role === "manager" ? "N/A (Manager)" : "None")}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block font-medium">Joining Date</span>
              <span className="font-semibold text-slate-800 mt-0.5 block">
                {formatJoiningDate(employee.joining_date)}
              </span>
            </div>
            <div>
              <span className="text-slate-400 block font-medium">Leave Allotted</span>
              <span className="font-semibold text-slate-800 mt-0.5 block">
                {employee.leave_allotted ?? 0} days
              </span>
            </div>
            <div>
              <span className="text-slate-400 block font-medium">Stored Documents</span>
              <span className="font-semibold text-slate-800 mt-0.5 block">
                {employee.document_count ?? 0} file(s)
              </span>
            </div>
            <div>
              <span className="text-slate-400 block font-medium">Employee ID</span>
              <span className="font-mono font-semibold text-slate-800 mt-0.5 block">
                #{employee.id}
              </span>
            </div>
          </div>

          {/* Locations summary */}
          {employee.locations && employee.locations.length > 0 ? (
            <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                Allowed Office Locations ({employee.locations.length})
              </h4>
              <div className="space-y-2">
                {employee.locations.map((loc, i) => (
                  <div key={i} className="flex items-center justify-between text-xs text-slate-600 bg-white p-2.5 rounded-xl border border-slate-200">
                    <div className="flex items-center gap-2">
                      <MapPin size={14} className="text-cyan-600 flex-shrink-0" />
                      <span>
                        Lat: {loc.latitude}, Lng: {loc.longitude}
                      </span>
                    </div>
                    <span className="text-[11px] font-medium text-slate-400">
                      {loc.allowed_radius}m {loc.is_primary ? "(Primary)" : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : employee.latitude && employee.longitude ? (
            <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Office Location
              </h4>
              <p className="text-xs text-slate-600">
                Lat: {employee.latitude}, Lng: {employee.longitude} ({employee.allowed_radius || 100}m radius)
              </p>
            </div>
          ) : null}
        </div>

        {canGrantConcession && employee.role === "employee" && (
          <section className="mt-5 rounded-2xl border border-slate-200 p-4">
            <h3 className="text-sm font-bold text-slate-900">Leave Concession / Additional Leave Allocation</h3>
            <form onSubmit={grantConcession} className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <label className="text-slate-600">Leave Type<select required value={concessionForm.leave_type} onChange={(e) => setConcessionForm({ ...concessionForm, leave_type: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 p-2 text-sm"><option value="casual">Casual Leave</option><option value="sick">Sick Leave</option><option value="paid">Paid Leave</option></select></label>
              <label className="text-slate-600">Additional Days<input required min="0.01" max="365" step="0.01" type="number" value={concessionForm.additional_days} onChange={(e) => setConcessionForm({ ...concessionForm, additional_days: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 p-2 text-sm" /></label>
              <label className="text-slate-600">Effective Date<input required type="date" value={concessionForm.effective_date} onChange={(e) => setConcessionForm({ ...concessionForm, effective_date: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 p-2 text-sm" /></label>
              <label className="text-slate-600">Expiry Date (optional)<input type="date" value={concessionForm.expiry_date} onChange={(e) => setConcessionForm({ ...concessionForm, expiry_date: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 p-2 text-sm" /></label>
              <label className="col-span-2 text-slate-600">Reason<input required maxLength="2000" value={concessionForm.reason} onChange={(e) => setConcessionForm({ ...concessionForm, reason: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-200 p-2 text-sm" /></label>
              <p className="col-span-2 text-slate-500">Granted by: {localStorage.getItem("username") || "Signed-in manager"}</p>
              {concessionError && <p className="col-span-2 text-rose-700">{concessionError}</p>}
              <button disabled={concessionBusy} className="col-span-2 rounded-xl bg-slate-900 px-3 py-2 font-semibold text-white disabled:opacity-60">{concessionBusy ? "Saving…" : "Grant Leave"}</button>
            </form>
            {concessions.length > 0 && <div className="mt-4 space-y-2">{concessions.map((item) => <div key={item.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-xs"><span className="capitalize">{item.leave_type}: {item.adjustment_days} days · {item.reason}</span>{!item.reverses_id && Number(item.adjustment_days) > 0 && <button onClick={() => reverseConcession(item)} className="font-semibold text-rose-700">Reverse</button>}</div>)}</div>}
          </section>
        )}

        {/* Footer Actions */}
        <div className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            Close
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-1.5 rounded-2xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition"
            >
              <Pencil size={13} />
              Edit Record
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function extractError(data, fallback) {
  if (!data) {
    return fallback;
  }
  if (typeof data.error === "string") {
    return data.error;
  }
  const firstValue = Object.values(data)[0];
  if (Array.isArray(firstValue)) {
    return firstValue[0];
  }
  if (typeof firstValue === "string") {
    return firstValue;
  }
  return fallback;
}

function HeroTile({ icon, label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 px-3.5 py-3 backdrop-blur-sm min-w-[85px] flex flex-col justify-between">
      <div className="flex items-center gap-1.5 text-emerald-100">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-100/90 whitespace-nowrap">{label}</span>
      </div>
      <p className="mt-2 text-xl font-bold text-white sm:text-2xl leading-none">{value}</p>
    </div>
  );
}

function InputField({ label, type = "text", value, onChange, placeholder = "" }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-900 outline-none transition focus:border-cyan-400 focus:bg-white"
      />
    </label>
  );
}

function PasswordField({ label, value, onChange, placeholder = "", minLength = 12, maxLength = 128 }) {
  const [showPassword, setShowPassword] = useState(false);
  const length = value ? value.length : 0;
  const isTooShort = length > 0 && length < minLength;
  const isTooLong = length > maxLength;

  return (
    <label className="block">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700">{label}</span>
        {length > 0 && (
          <span className={`text-[11px] font-medium ${isTooShort || isTooLong ? "text-rose-600" : "text-emerald-600"}`}>
            {length}/{maxLength} {isTooShort ? `(Min ${minLength})` : isTooLong ? `(Max ${maxLength})` : "✓"}
          </span>
        )}
      </div>
      <div className="relative mt-1.5">
        <input
          type={showPassword ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full rounded-2xl border bg-slate-50 py-2.5 pl-3.5 pr-10 text-xs text-slate-900 outline-none transition focus:bg-white ${
            isTooShort || isTooLong ? "border-rose-400 focus:border-rose-500" : "border-slate-200 focus:border-cyan-400"
          }`}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShowPassword((prev) => !prev)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition focus:outline-none"
          aria-label={showPassword ? "Hide password" : "Show password"}
          title={showPassword ? "Hide password" : "Show password"}
        >
          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {isTooShort && (
        <p className="mt-1 text-[11px] text-rose-600 font-medium">
          Password must be at least {minLength} characters
        </p>
      )}
      {isTooLong && (
        <p className="mt-1 text-[11px] text-rose-600 font-medium">
          Password must not exceed {maxLength} characters
        </p>
      )}
    </label>
  );
}

function SelectField({ label, value, onChange, options, placeholder, disabled = false, helperText = "" }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-900 outline-none transition focus:border-cyan-400 focus:bg-white ${
          disabled ? "opacity-60 cursor-not-allowed bg-slate-100" : ""
        }`}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {helperText ? <p className="mt-1 text-[11px] text-amber-600 font-medium">{helperText}</p> : null}
    </label>
  );
}

function ToggleField({ label, checked, onChange }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`mt-1.5 flex w-full items-center justify-between rounded-2xl border px-3.5 py-2.5 text-xs font-medium transition ${
          checked
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-slate-200 bg-slate-50 text-slate-600"
        }`}
      >
        <span>{checked ? "Active employee" : "Inactive employee"}</span>
        <CheckCircle2 size={15} />
      </button>
    </label>
  );
}

function StatusConfirmPopup({ employee, loading, onCancel, onConfirm }) {
  const shouldActivate = !employee.is_active_employee;
  const actionText = shouldActivate ? "Active" : "Inactive";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          <div
            className={`rounded-2xl p-3 ${
              shouldActivate ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
            }`}
          >
            {shouldActivate ? <UserCheck size={22} /> : <UserX size={22} />}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Mark employee as {actionText}?
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              This will update the real account status for {employee.name || employee.username}.
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-70"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`rounded-2xl px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-70 ${
              shouldActivate ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"
            }`}
          >
            {loading ? "Updating..." : actionText}
          </button>
        </div>
      </div>
    </div>
  );
}

function NoticePopup({ notice, onClose }) {
  const isSuccess = notice.type === "success";
  const isWarning = notice.type === "warning";
  const iconClass = isSuccess
    ? "bg-emerald-50 text-emerald-700"
    : isWarning
      ? "bg-amber-50 text-amber-700"
      : "bg-rose-50 text-rose-700";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/50 px-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start gap-4">
          <div className={`rounded-2xl p-3 ${iconClass}`}>
            {isSuccess ? <CheckCircle2 size={22} /> : isWarning ? <ShieldCheck size={22} /> : <UserX size={22} />}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{notice.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">{notice.text}</p>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

function MapPickerModal({ latitude, longitude, defaultLatitude, defaultLongitude, onSelect, onClose }) {
  const mapRef = useRef(null);
  const containerId = "map-picker-container";
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [mapsLoaded, setMapsLoaded] = useState(Boolean(window.google?.maps));
  const [mapsError, setMapsError] = useState("");

  const initialLat = latitude || defaultLatitude || "22.5726";
  const initialLng = longitude || defaultLongitude || "88.3639";
  const [manualLat, setManualLat] = useState(String(initialLat));
  const [manualLng, setManualLng] = useState(String(initialLng));

  useEffect(() => {
    if (window.google?.maps) {
      setMapsLoaded(true);
      return;
    }

    let script = document.getElementById("google-maps-script");
    const handleScriptLoad = () => {
      setMapsLoaded(true);
      setMapsError("");
    };
    const handleScriptError = () => {
      setMapsError("Google Maps failed to load. Please verify your network connection or API key.");
    };

    window.gm_authFailure = () => {
      setMapsError("Google Maps authentication failed (Invalid API key or unauthorized referrer).");
    };

    if (!script) {
      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
      if (!apiKey) {
        setMapsError("Google Maps API key is not configured. You can still enter coordinates manually.");
      }
      script = document.createElement("script");
      script.id = "google-maps-script";
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    script.addEventListener("load", handleScriptLoad);
    script.addEventListener("error", handleScriptError);

    const timeoutTimer = setTimeout(() => {
      if (!window.google?.maps) {
        setMapsError((prev) => prev || "Google Maps took too long to load. You can enter coordinates manually.");
      }
    }, 6000);

    return () => {
      clearTimeout(timeoutTimer);
      if (script) {
        script.removeEventListener("load", handleScriptLoad);
        script.removeEventListener("error", handleScriptError);
      }
    };
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    setSearchError("");
    setSearchResults([]);

    const originalQuery = searchQuery.trim();

    const runNominatimFallback = async (reason) => {
      console.log(`Google Geocoder failed (${reason}), running Nominatim fallback...`);

      const pinMatch = originalQuery.match(/\b\d{6}\b/);
      const queryPostcode = pinMatch ? pinMatch[0] : "";
      const queryCleaned = originalQuery.replace(/\b\d{6}\b/g, "").trim().replace(/\s+/g, " ");

      const fetchNominatim = async (paramObj) => {
        const url = new URL("https://nominatim.openstreetmap.org/search");
        url.searchParams.set("format", "json");
        url.searchParams.set("addressdetails", "1");
        url.searchParams.set("limit", "5");
        url.searchParams.set("countrycodes", "in");
        Object.entries(paramObj).forEach(([k, v]) => {
          if (v) url.searchParams.set(k, v);
        });

        const res = await fetch(url.toString(), {
          headers: {
            "Accept-Language": "en",
            "User-Agent": "HRMS-Location-Picker/1.0",
          },
        });
        if (!res.ok) throw new Error("Nominatim HTTP " + res.status);
        return res.json();
      };

      try {
        let data = [];
        if (queryPostcode && queryCleaned) {
          data = await fetchNominatim({ q: queryCleaned, postalcode: queryPostcode });
        }
        if (!data || data.length === 0) {
          data = await fetchNominatim({ q: originalQuery });
        }
        if (!data || data.length === 0) {
          const parts = originalQuery.split(",").map((p) => p.trim()).filter(Boolean);
          if (parts.length > 1) {
            data = await fetchNominatim({ q: parts.slice(-2).join(", ") });
          }
        }

        if (data && data.length > 0) {
          setSearchResults(data);
        } else {
          setSearchError("No results found. You can enter coordinates manually or click on the map.");
        }
      } catch (err) {
        console.error("Nominatim fallback failed:", err);
        setSearchError("Location search unavailable. You can enter coordinates manually.");
      } finally {
        setSearchLoading(false);
      }
    };

    if (window.google?.maps?.Geocoder) {
      const geocoder = new window.google.maps.Geocoder();
      geocoder.geocode({ address: originalQuery }, (results, status) => {
        if (status === "OK" && results && results.length > 0) {
          const formatted = results.map((r) => ({
            display_name: r.formatted_address,
            lat: r.geometry.location.lat(),
            lon: r.geometry.location.lng(),
          }));
          setSearchResults(formatted);
          setSearchLoading(false);
        } else {
          runNominatimFallback(status);
        }
      });
    } else {
      runNominatimFallback("Google Geocoder unavailable");
    }
  };

  const handleSelectResult = (result) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);
    setManualLat(lat.toFixed(6));
    setManualLng(lng.toFixed(6));
    if (mapRef.current && mapRef.current._selectedMarker) {
      const pos = new window.google.maps.LatLng(lat, lng);
      mapRef.current._selectedMarker.setPosition(pos);
      mapRef.current.panTo(pos);
      mapRef.current.setZoom(16);
    }
    setSearchResults([]);
    setSearchQuery(result.display_name);
  };

  useEffect(() => {
    if (!mapsLoaded || !window.google?.maps) return;

    const latNum = parseFloat(initialLat) || 22.5726;
    const lngNum = parseFloat(initialLng) || 88.3639;

    const mapElement = document.getElementById(containerId);
    if (!mapElement) return;

    try {
      const map = new window.google.maps.Map(mapElement, {
        center: { lat: latNum, lng: lngNum },
        zoom: 15,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });
      mapRef.current = map;

      const marker = new window.google.maps.Marker({
        position: { lat: latNum, lng: lngNum },
        map: map,
        draggable: true,
        animation: window.google.maps.Animation.DROP,
      });
      map._selectedMarker = marker;

      marker.addListener("dragend", () => {
        const pos = marker.getPosition();
        map.panTo(pos);
        setManualLat(pos.lat().toFixed(6));
        setManualLng(pos.lng().toFixed(6));
      });

      map.addListener("click", (e) => {
        const pos = e.latLng;
        marker.setPosition(pos);
        map.panTo(pos);
        setManualLat(pos.lat().toFixed(6));
        setManualLng(pos.lng().toFixed(6));
        setSearchResults([]);
      });
    } catch (err) {
      console.error("Error initializing Google Maps:", err);
      setMapsError("Failed to initialize Google Maps interface.");
    }
  }, [mapsLoaded, initialLat, initialLng]);

  const handleConfirm = () => {
    let latToSave = manualLat;
    let lngToSave = manualLng;
    if (mapRef.current && mapRef.current._selectedMarker) {
      const pos = mapRef.current._selectedMarker.getPosition();
      latToSave = pos.lat().toFixed(6);
      lngToSave = pos.lng().toFixed(6);
    }
    const latNum = Number(latToSave);
    const lngNum = Number(lngToSave);
    if (isNaN(latNum) || latNum < -90 || latNum > 90) {
      setSearchError("Latitude must be a valid number between -90 and 90");
      return;
    }
    if (isNaN(lngNum) || lngNum < -180 || lngNum > 180) {
      setSearchError("Longitude must be a valid number between -180 and 180");
      return;
    }
    onSelect(String(latToSave), String(lngToSave));
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 px-4">
      <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Select Office Location</h2>
            <p className="text-xs text-slate-500 mt-0.5">Click on the map or drag the pin to set the exact coordinates.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 font-bold"
          >
            ✕
          </button>
        </div>

        {/* Google Maps Failure Notice (BUG-E11) */}
        {mapsError && (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-xs text-rose-800">
            <div className="flex items-center gap-2 font-semibold">
              <AlertCircle size={16} className="text-rose-600 flex-shrink-0" />
              <span>Map Load Notice</span>
            </div>
            <p className="mt-1 text-rose-700">{mapsError}</p>
            <p className="mt-0.5 text-slate-600">You can manually type or adjust coordinates below and click Confirm Location.</p>
          </div>
        )}

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="mb-4 relative z-[1050]">
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for a location or address..."
              className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-900 outline-none transition focus:border-cyan-400 focus:bg-white"
            />
            <button
              type="submit"
              disabled={searchLoading}
              className="rounded-2xl bg-cyan-600 hover:bg-cyan-700 px-4 py-2.5 text-xs font-semibold text-white transition disabled:opacity-75"
            >
              {searchLoading ? "Searching..." : "Search"}
            </button>
          </div>

          {searchError && (
            <p className="text-xs mt-1.5 font-medium text-rose-600">
              {searchError}
            </p>
          )}

          {/* Search Result Dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute left-0 right-0 mt-1 bg-white border border-slate-200 rounded-2xl shadow-lg z-[1050] max-h-48 overflow-y-auto">
              {searchResults.map((result, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleSelectResult(result)}
                  className="w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-slate-50 border-b border-slate-100 last:border-0 transition"
                >
                  {result.display_name}
                </button>
              ))}
            </div>
          )}
        </form>

        {/* Map Container or Manual Coordinates Fallback */}
        {!mapsLoaded ? (
          <div className="w-full h-[280px] rounded-2xl border border-slate-200 bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
            {mapsError ? (
              <div className="space-y-2">
                <AlertCircle size={32} className="mx-auto text-amber-500" />
                <p className="text-sm font-semibold text-slate-700">Map Interface Offline</p>
                <p className="text-xs text-slate-500 max-w-sm">Use the manual coordinate inputs below to save this location.</p>
              </div>
            ) : (
              <div className="text-sm text-slate-500 font-semibold">Loading Google Maps...</div>
            )}
          </div>
        ) : (
          <div
            id={containerId}
            className="w-full h-[320px] rounded-2xl overflow-hidden border border-slate-200 shadow-inner"
          />
        )}

        {/* Manual Latitude & Longitude Inputs (Always available as fallback / fine-tuning) */}
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl border border-slate-100 bg-slate-50/80 p-3">
          <div>
            <label className="text-[11px] font-semibold text-slate-600 block mb-1">Latitude</label>
            <input
              type="text"
              value={manualLat}
              onChange={(e) => {
                setManualLat(e.target.value);
                const latNum = parseFloat(e.target.value);
                const lngNum = parseFloat(manualLng);
                if (!isNaN(latNum) && !isNaN(lngNum) && mapRef.current && mapRef.current._selectedMarker) {
                  const pos = new window.google.maps.LatLng(latNum, lngNum);
                  mapRef.current._selectedMarker.setPosition(pos);
                  mapRef.current.panTo(pos);
                }
              }}
              placeholder="e.g. 22.5726"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-cyan-400"
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold text-slate-600 block mb-1">Longitude</label>
            <input
              type="text"
              value={manualLng}
              onChange={(e) => {
                setManualLng(e.target.value);
                const latNum = parseFloat(manualLat);
                const lngNum = parseFloat(e.target.value);
                if (!isNaN(latNum) && !isNaN(lngNum) && mapRef.current && mapRef.current._selectedMarker) {
                  const pos = new window.google.maps.LatLng(latNum, lngNum);
                  mapRef.current._selectedMarker.setPosition(pos);
                  mapRef.current.panTo(pos);
                }
              }}
              placeholder="e.g. 88.3639"
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 outline-none focus:border-cyan-400"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded-2xl bg-slate-900 hover:bg-slate-800 px-5 py-2.5 text-xs font-semibold text-white transition"
          >
            Confirm Location
          </button>
        </div>
      </div>
    </div>
  );
}
