import { useEffect, useMemo, useState, useRef } from "react";
import {
  Briefcase,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Eye,
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

const documentLabels = [
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
  const userRole = localStorage.getItem("role") || "employee";

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
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState("");
  const [statusDialog, setStatusDialog] = useState(null);
  const [noticePopup, setNoticePopup] = useState(null);
  const [mapPickerTarget, setMapPickerTarget] = useState(null);

  // UI state for Directory, Collapsible Form & Pagination
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [viewingEmployee, setViewingEmployee] = useState(null);

  const formCardRef = useRef(null);

  const showPopup = (text, type = "error", title = type === "error" ? "Action failed" : "Success") => {
    setNoticePopup({ text, type, title });
  };

  const loadData = async () => {
    try {
      const [managerRes, employeeRes] = await Promise.all([
        API.get("/auth/managers/"),
        API.get("/auth/employees/?limit=100"),
      ]);
      setManagers(Array.isArray(managerRes.data) ? managerRes.data : (managerRes.data?.data || []));
      setEmployees(Array.isArray(employeeRes.data) ? employeeRes.data : (employeeRes.data?.data || []));
    } catch (err) {
      console.log(err);
      showPopup("Unable to load employee setup data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useRealtime("employee_update", loadData);

  const canManage = (targetRole) => {
    if (userRole === "superadmin") return true;
    if (userRole === "admin") return ["employee", "manager", "hr"].includes(targetRole);
    if (userRole === "hr") return ["employee", "manager"].includes(targetRole);
    return false;
  };

  const totalStaffCount = employees.length;
  const activeStaffCount = useMemo(
    () => employees.filter((item) => item.is_active_employee).length,
    [employees]
  );
  const inactiveStaffCount = useMemo(
    () => employees.filter((item) => !item.is_active_employee).length,
    [employees]
  );

  const employeeCount = useMemo(
    () => employees.filter((item) => item.role === "employee").length,
    [employees]
  );
  const managerCount = useMemo(
    () => employees.filter((item) => item.role === "manager").length,
    [employees]
  );
  const hrCount = useMemo(
    () => employees.filter((item) => item.role === "hr").length,
    [employees]
  );
  const adminCount = useMemo(
    () => employees.filter((item) => item.role === "admin" || item.role === "superadmin").length,
    [employees]
  );

  const availableTeams = useMemo(() => {
    const teamsSet = new Set();
    employees.forEach((emp) => {
      if (emp.team_name && emp.team_name.trim()) {
        teamsSet.add(emp.team_name.trim());
      }
    });
    managers.forEach((mgr) => {
      if (mgr.team_name && mgr.team_name.trim()) {
        teamsSet.add(mgr.team_name.trim());
      }
    });
    return Array.from(teamsSet).sort();
  }, [employees, managers]);

  const uploadedDocumentTitles = useMemo(
    () => new Set(existingDocuments.map((document) => document.title)),
    [existingDocuments]
  );

  const filteredEmployees = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return employees.filter((employee) => {
      const matchesSearch =
        !normalizedSearch ||
        [
          employee.name,
          employee.username,
          employee.email,
          employee.role,
          employee.team_name,
          employee.manager,
          employee.designation,
          String(employee.id),
        ]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(normalizedSearch));

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && employee.is_active_employee) ||
        (statusFilter === "inactive" && !employee.is_active_employee);

      const matchesRole =
        roleFilter === "all" || employee.role === roleFilter;

      const matchesTeam =
        teamFilter === "all" ||
        employee.team_name === teamFilter ||
        (employee.role === "manager" && employee.team_name === teamFilter);

      return matchesSearch && matchesStatus && matchesRole && matchesTeam;
    });
  }, [employees, searchTerm, statusFilter, roleFilter, teamFilter]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / rowsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * rowsPerPage;
  const endIndex = Math.min(startIndex + rowsPerPage, filteredEmployees.length);
  const paginatedEmployees = useMemo(() => {
    return filteredEmployees.slice(startIndex, endIndex);
  }, [filteredEmployees, startIndex, endIndex]);

  const handleClearFilters = () => {
    setSearchTerm("");
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
        { latitude: "", longitude: "", allowed_radius: "100", is_primary: false },
      ],
    }));
  };

  const handleRemoveLocation = (index) => {
    setForm((current) => ({
      ...current,
      locations: current.locations.filter((_, i) => i !== index),
    }));
  };

  const handleLocationChange = (index, field, value) => {
    setForm((current) => {
      const nextLocs = [...current.locations];
      nextLocs[index] = { ...nextLocs[index], [field]: value };
      return { ...current, locations: nextLocs };
    });
  };

  const resetForm = () => {
    setForm(initialForm);
    setFiles({});
    setEditingId(null);
    setExistingDocuments([]);
    setMessage("");
  };

  const startEdit = async (employee) => {
    setEditingId(employee.id);
    setIsFormOpen(true);
    setDocumentsLoading(true);
    setMessage("Existing documents are protected. You can upload any missing ones.");
    setFiles({});
    setForm({
      username: employee.username || "",
      first_name: employee.first_name || "",
      last_name: employee.last_name || "",
      email: employee.email || "",
      password: "",
      role: employee.role || "employee",
      manager: employee.manager_id ? String(employee.manager_id) : "",
      team_name: employee.team_name || "",
      joining_date: employee.joining_date || "",
      leave_allotted: String(employee.leave_allotted ?? 0),
      designation: employee.designation || "",
      locations: employee.locations && employee.locations.length > 0
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
          }],
      is_active_employee: employee.is_active_employee ?? true,
    });

    try {
      const response = await API.get(`/auth/documents/${employee.id}/`);
      setExistingDocuments(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.log(err.response?.data || err.message);
      setExistingDocuments([]);
      showPopup("Unable to load employee documents for edit");
    } finally {
      setDocumentsLoading(false);
    }
    setTimeout(() => {
      formCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");

    if (!editingId && (!files.aadhar_file || !files.pan_file || !files.bank_file)) {
      showPopup("Aadhar, PAN and bank details documents are required", "warning", "Missing documents");
      return;
    }

    const primaryLoc = form.locations[0];
    if (!primaryLoc || !primaryLoc.latitude || !primaryLoc.longitude) {
      showPopup("Primary location latitude and longitude are required", "warning", "Validation Error");
      return;
    }

    for (let i = 0; i < form.locations.length; i++) {
      const loc = form.locations[i];
      if (i > 0) {
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

        const primary = filteredLocs.find((l) => l.is_primary) || filteredLocs[0];

        const payload = {
          username: form.username,
          first_name: form.first_name,
          last_name: form.last_name,
          email: form.email,
          role: form.role,
          manager: form.role === "employee" && form.manager ? Number(form.manager) : null,
          team_name: form.role === "manager" ? form.team_name : "",
          joining_date: form.joining_date || null,
          leave_allotted: form.leave_allotted === "" ? 0 : Number(form.leave_allotted),
          latitude: primary ? Number(primary.latitude) : null,
          longitude: primary ? Number(primary.longitude) : null,
          allowed_radius: primary ? Number(primary.allowed_radius) : 100,
          is_active_employee: Boolean(form.is_active_employee),
          designation: form.designation || null,
          locations: filteredLocs,
        };

        if (form.password) {
          payload.password = form.password;
        }

        const res = await API.put(`/auth/employees/${editingId}/`, payload);
        const pendingDocumentUploads = documentLabels.filter(
          (doc) => !uploadedDocumentTitles.has(doc.label) && files[doc.key]
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
            ? `${res.data.message || "Employee updated successfully"} and ${uploadedCount} missing document${uploadedCount > 1 ? "s were" : " was"} uploaded.`
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
      Object.entries(form).forEach(([key, value]) => {
        if (key === "is_active_employee") {
          return;
        }
        if (key === "team_name" && form.role !== "manager") {
          return;
        }
        if (key === "manager" && form.role !== "employee") {
          return;
        }
        if (key === "leave_allotted") {
          formData.append(key, value === "" ? "0" : value);
          return;
        }
        if (key === "locations") {
          const filteredLocs = value
            .filter((loc) => loc.latitude !== "" && loc.longitude !== "")
            .map((loc) => ({
              latitude: Number(loc.latitude),
              longitude: Number(loc.longitude),
              allowed_radius: loc.allowed_radius === "" ? 100 : Number(loc.allowed_radius),
              is_primary: Boolean(loc.is_primary),
            }));
          formData.append("locations", JSON.stringify(filteredLocs));

          const primary = filteredLocs.find((l) => l.is_primary) || filteredLocs[0];
          if (primary) {
            formData.append("latitude", String(primary.latitude));
            formData.append("longitude", String(primary.longitude));
            formData.append("allowed_radius", String(primary.allowed_radius));
          }
          return;
        }
        if (key === "latitude" || key === "longitude" || key === "allowed_radius") {
          return;
        }
        if (value !== "") {
          formData.append(key, value);
        }
      });

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
                HR can onboard employees and managers, assign reporting teams, capture office attendance settings, and update or remove staff details without changing stored documents from this screen.
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
                  Required joining documents: Aadhar, PAN, Bank Details. Optional: CV, Voter ID, Driving License.
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
                  <InputField
                    label={editingId ? "Password (Leave blank to keep unchanged)" : "Password"}
                    type="password"
                    value={form.password}
                    onChange={(value) => handleChange("password", value)}
                  />
                  {editingId && (
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
                      options={managers.map((manager) => ({
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
                        className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 relative"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                            {loc.is_primary ? "Location #1 (Primary)" : `Location #${idx + 1}`}
                          </span>
                          {!loc.is_primary && (
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
                            type="file"
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
                {paginatedEmployees.length === 0 ? (
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
                  paginatedEmployees.map((employee, idx) => {
                    const rowNumber = startIndex + idx + 1;
                    const initials = getInitials(employee.name, employee.username);
                    const avatarStyle = getAvatarStyle(employee.role, employee.name || employee.username);
                    const roleBadgeStyle = getRoleBadgeStyle(employee.role);
                    const displayTeam =
                      employee.role === "manager"
                        ? (employee.team_name ? `Own: ${employee.team_name}` : "Own team owner")
                        : employee.role === "employee"
                          ? employee.team_name || employee.manager || "Not assigned"
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
                            <div
                              className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border text-xs font-bold ${avatarStyle}`}
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
                            {canManage(employee.role) && (
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
                {filteredEmployees.length === 0 ? 0 : startIndex + 1}
              </span>{" "}
              –{" "}
              <span className="font-semibold text-slate-700">{endIndex}</span> of{" "}
              <span className="font-semibold text-slate-700">{filteredEmployees.length}</span> employees
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-5">
          <div className="flex items-center gap-4">
            <div
              className={`flex h-14 w-14 items-center justify-center rounded-full border text-base font-bold ${avatarStyle}`}
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
                {employee.manager || (employee.role === "manager" ? "N/A (Manager)" : "None")}
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

function SelectField({ label, value, onChange, options, placeholder }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-slate-700">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-900 outline-none transition focus:border-cyan-400 focus:bg-white"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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

  useEffect(() => {
    if (window.google?.maps) {
      return;
    }

    let script = document.getElementById("google-maps-script");
    if (!script) {
      const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
      script = document.createElement("script");
      script.id = "google-maps-script";
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    const handleScriptLoad = () => setMapsLoaded(true);
    script.addEventListener("load", handleScriptLoad);

    return () => {
      if (script) {
        script.removeEventListener("load", handleScriptLoad);
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
          setSearchError("No results found. You can still click or drag anywhere on the map.");
        }
      } catch (err) {
        console.error("Nominatim fallback failed:", err);
        setSearchError("Location search unavailable. You can click anywhere on the map to set the pin.");
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

    const initialLat = parseFloat(latitude) || parseFloat(defaultLatitude) || 22.5726;
    const initialLng = parseFloat(longitude) || parseFloat(defaultLongitude) || 88.3639;

    const mapElement = document.getElementById(containerId);
    if (!mapElement) return;

    const map = new window.google.maps.Map(mapElement, {
      center: { lat: initialLat, lng: initialLng },
      zoom: 15,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });
    mapRef.current = map;

    const marker = new window.google.maps.Marker({
      position: { lat: initialLat, lng: initialLng },
      map: map,
      draggable: true,
      animation: window.google.maps.Animation.DROP,
    });
    map._selectedMarker = marker;

    marker.addListener("dragend", () => {
      const pos = marker.getPosition();
      map.panTo(pos);
    });

    map.addListener("click", (e) => {
      const pos = e.latLng;
      marker.setPosition(pos);
      map.panTo(pos);
      setSearchResults([]);
    });
  }, [mapsLoaded, latitude, longitude, defaultLatitude, defaultLongitude]);

  const handleConfirm = () => {
    if (mapRef.current && mapRef.current._selectedMarker) {
      const pos = mapRef.current._selectedMarker.getPosition();
      onSelect(pos.lat().toFixed(6), pos.lng().toFixed(6));
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 px-4">
      <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
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

        {/* Map Container */}
        {!mapsLoaded ? (
          <div className="w-full h-[350px] rounded-2xl border border-slate-200 bg-slate-50 flex items-center justify-center text-sm text-slate-500 font-semibold">
            Loading Google Maps...
          </div>
        ) : (
          <div
            id={containerId}
            className="w-full h-[350px] rounded-2xl overflow-hidden border border-slate-200 shadow-inner"
          />
        )}

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
