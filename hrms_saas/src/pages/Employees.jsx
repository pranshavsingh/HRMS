import { useEffect, useMemo, useState, useRef } from "react";
import {
  Briefcase,
  CheckCircle2,
  FileBadge2,
  Pencil,
  Search,
  ShieldCheck,
  UserCog,
  UserCheck,
  UserPlus,
  UserX,
  Users,
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
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [mapPickerTarget, setMapPickerTarget] = useState(null);

  const showPopup = (text, type = "error", title = type === "error" ? "Action failed" : "Success") => {
    setNoticePopup({ text, type, title });
  };

  const loadData = async () => {
    try {
      const [managerRes, employeeRes] = await Promise.all([
        API.get("/auth/managers/"),
        API.get("/auth/employees/"),
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
    () => employees.filter((item) => item.role === "admin").length,
    [employees]
  );
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
        ]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(normalizedSearch));

      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && employee.is_active_employee) ||
        (statusFilter === "inactive" && !employee.is_active_employee);

      return matchesSearch && matchesStatus;
    });
  }, [employees, searchTerm, statusFilter]);

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
        { latitude: "", longitude: "", allowed_radius: "100", is_primary: false }
      ]
    }));
  };

  const handleRemoveLocation = (index) => {
    setForm((current) => ({
      ...current,
      locations: current.locations.filter((_, i) => i !== index)
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
        ? employee.locations.map(loc => ({
            latitude: String(loc.latitude ?? ""),
            longitude: String(loc.longitude ?? ""),
            allowed_radius: String(loc.allowed_radius ?? 100),
            is_primary: Boolean(loc.is_primary)
          }))
        : [{ latitude: employee.latitude !== null && employee.latitude !== undefined ? String(employee.latitude) : "", longitude: employee.longitude !== null && employee.longitude !== undefined ? String(employee.longitude) : "", allowed_radius: String(employee.allowed_radius ?? 100), is_primary: true }],
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
    window.scrollTo({ top: 0, behavior: "smooth" });
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
          .filter(loc => loc.latitude !== "" && loc.longitude !== "")
          .map(loc => ({
            latitude: Number(loc.latitude),
            longitude: Number(loc.longitude),
            allowed_radius: loc.allowed_radius === "" ? 100 : Number(loc.allowed_radius),
            is_primary: Boolean(loc.is_primary)
          }));

        const primary = filteredLocs.find(l => l.is_primary) || filteredLocs[0];

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
          locations: filteredLocs
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
            .filter(loc => loc.latitude !== "" && loc.longitude !== "")
            .map(loc => ({
              latitude: Number(loc.latitude),
              longitude: Number(loc.longitude),
              allowed_radius: loc.allowed_radius === "" ? 100 : Number(loc.allowed_radius),
              is_primary: Boolean(loc.is_primary)
            }));
          formData.append("locations", JSON.stringify(filteredLocs));
          
          const primary = filteredLocs.find(l => l.is_primary) || filteredLocs[0];
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
        <section className="relative overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#0f172a_0%,#155e75_45%,#14532d_100%)] px-8 py-8 text-white shadow-xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.16),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(34,197,94,0.20),_transparent_30%)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-emerald-100">
                <UserCog size={14} />
                HR Workforce Desk
              </p>
              <h1 className="text-3xl font-bold tracking-tight">
                Create staff accounts, assign teams, and manage employee records from one workspace
              </h1>
              <p className="mt-3 text-sm text-slate-200">
                HR can onboard employees and managers, assign reporting teams, capture office attendance settings, and update or remove staff details without changing stored documents from this screen.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
              <HeroTile icon={<Users size={18} />} label="Total Staff" value={employees.length} />
              <HeroTile icon={<Briefcase size={18} />} label="Managers" value={managerCount} />
              <HeroTile icon={<UserPlus size={18} />} label="Employees" value={employeeCount} />
              <HeroTile icon={<UserCog size={18} />} label="HRs" value={hrCount} />
              <HeroTile icon={<ShieldCheck size={18} />} label="Admins" value={adminCount} />
              <HeroTile icon={<ShieldCheck size={18} />} label="Mode" value={editingId ? "Edit" : "Create"} />
            </div>
          </div>
        </section>

        {message ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            {message}
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[1.15fr_1fr]">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">
                  {editingId ? "Edit Staff Details" : "Create Employee or Manager"}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  Required joining documents: Aadhar, PAN, Bank Details. Optional: CV, Voter ID, Driving License.
                </p>
              </div>
              <div className="rounded-2xl bg-cyan-50 p-3 text-cyan-700">
                <FileBadge2 size={20} />
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <SelectField
                  label="Role"
                  value={form.role}
                  onChange={(value) => handleChange("role", value)}
                  options={[
                    { value: "employee", label: "Employee" },
                    { value: "manager", label: "Manager" },
                    ...(userRole === "admin" ? [{ value: "hr", label: "HR" }] : []),
                    ...(userRole === "superadmin" ? [
                      { value: "hr", label: "HR" },
                      { value: "admin", label: "Admin" },
                      { value: "superadmin", label: "Superadmin" },
                    ] : []),
                  ]}
                  placeholder="Select role"
                />
                <InputField label="Username" value={form.username} onChange={(value) => handleChange("username", value)} />
                <InputField label="Employee First Name" value={form.first_name} onChange={(value) => handleChange("first_name", value)} />
                <InputField label="Employee Last Name" value={form.last_name} onChange={(value) => handleChange("last_name", value)} />
                <InputField label="Email" type="email" value={form.email} onChange={(value) => handleChange("email", value)} />
                <InputField label="Designation" value={form.designation} onChange={(value) => handleChange("designation", value)} />
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
                    label="Assign Team"
                    value={form.manager}
                    onChange={(value) => handleChange("manager", value)}
                    options={managers.map((manager) => ({
                      value: String(manager.id),
                      label: manager.team_name ? `${manager.name} - ${manager.team_name}` : manager.name,
                    }))}
                    placeholder="Select reporting manager"
                  />
                ) : form.role === "manager" ? (
                  <InputField label="Managed Team Name" value={form.team_name} onChange={(value) => handleChange("team_name", value)} />
                ) : null}

                <InputField label="Joining Date" type="date" value={form.joining_date} onChange={(value) => handleChange("joining_date", value)} />
                <InputField label="Leave Allotted" type="number" value={form.leave_allotted} onChange={(value) => handleChange("leave_allotted", value)} />
              </div>

              {/* Dynamic Multiple Locations Component */}
              <div className="border-t border-slate-200 pt-6 mt-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">Allowed Office Locations</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Primary location is mandatory; additional locations are optional for clocking in/out.</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddLocation}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3.5 py-2 rounded-xl transition-all"
                  >
                    + Add Location
                  </button>
                </div>
                
                <div className="space-y-4">
                  {form.locations.map((loc, idx) => (
                    <div key={idx} className="p-4 rounded-2xl border border-slate-100 bg-slate-50/50 relative transition-all">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${
                            loc.is_primary 
                              ? 'bg-emerald-50/80 text-emerald-700 border-emerald-200' 
                              : 'bg-slate-100 text-slate-600 border-slate-200'
                          }`}>
                            {loc.is_primary ? "Primary Location (Mandatory)" : `Location #${idx + 1} (Optional)`}
                          </span>
                          <button
                            type="button"
                            onClick={() => setMapPickerTarget(idx)}
                            className="text-xs font-semibold text-cyan-600 hover:text-cyan-700 hover:bg-cyan-50 px-2 py-1 rounded-lg border border-cyan-200 transition"
                          >
                            📍 Select on Map
                          </button>
                        </div>
                        {!loc.is_primary && (
                          <button
                            type="button"
                            onClick={() => handleRemoveLocation(idx)}
                            className="text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-2 py-1 rounded-lg transition"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                      <div className="grid gap-4 sm:grid-cols-3">
                        <InputField
                          label="Latitude"
                          value={loc.latitude}
                          onChange={(val) => handleLocationChange(idx, "latitude", val)}
                        />
                        <InputField
                          label="Longitude"
                          value={loc.longitude}
                          onChange={(val) => handleLocationChange(idx, "longitude", val)}
                        />
                        <InputField
                          label="Allowed Radius (meters)"
                          type="number"
                          value={loc.allowed_radius}
                          onChange={(val) => handleLocationChange(idx, "allowed_radius", val)}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {!editingId ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {documentLabels.map((doc) => (
                    <label key={doc.key} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <span className="text-sm font-medium text-slate-700">
                        {doc.label} {doc.required ? "*" : "(Optional)"}
                      </span>
                      <input
                        type="file"
                        onChange={(e) => handleFileChange(doc.key, e.target.files?.[0] || null)}
                        className="mt-2 block w-full text-sm text-slate-600"
                      />
                    </label>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className={`rounded-2xl border px-4 py-3 text-sm ${
                    userRole === "superadmin"
                      ? "border-purple-200 bg-purple-50 text-purple-800"
                      : "border-amber-200 bg-amber-50 text-amber-800"
                  }`}>
                    {userRole === "superadmin"
                      ? "As a Superadmin, you can edit and overwrite already uploaded documents by selecting new files."
                      : "Only already uploaded documents are protected. Missing documents can still be added from this edit form."}
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    {documentLabels.map((doc) => {
                      const uploadedDocument = existingDocuments.find(
                        (document) => document.title === doc.label
                      );

                      if (uploadedDocument && userRole !== "superadmin") {
                        return (
                          <div
                            key={doc.key}
                            className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-sm font-medium text-emerald-900">{doc.label}</span>
                              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                                Protected
                              </span>
                            </div>
                            <p className="mt-2 text-xs text-emerald-700">
                              Already uploaded. This file stays locked during edit.
                            </p>
                          </div>
                        );
                      }

                      return (
                        <label
                          key={doc.key}
                          className={`rounded-2xl border px-4 py-3 block transition ${
                            uploadedDocument 
                              ? "border-emerald-200 bg-emerald-50/50" 
                              : "border-slate-200 bg-slate-50"
                          }`}
                        >
                          <span className={`text-sm font-medium ${uploadedDocument ? "text-emerald-950" : "text-slate-700"}`}>
                            {doc.label} {doc.required && !uploadedDocument ? "*" : "(Optional)"}
                          </span>
                          <input
                            type="file"
                            onChange={(e) => handleFileChange(doc.key, e.target.files?.[0] || null)}
                            className={`mt-2 block w-full text-sm ${uploadedDocument ? "text-emerald-800" : "text-slate-600"}`}
                            disabled={documentsLoading}
                          />
                          <p className={`mt-2 text-xs ${uploadedDocument ? "text-emerald-600 font-medium" : "text-slate-500"}`}>
                            {uploadedDocument 
                              ? "Already uploaded. Select a new file to overwrite/edit." 
                              : "Missing document. Upload now if you want to add it."}
                          </p>
                        </label>
                      );
                    })}
                  </div>
                  {documentsLoading ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                      Loading uploaded documents...
                    </div>
                  ) : null}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={submitting || savingEdit || documentsLoading}
                  className="rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-70"
                >
                  {editingId ? (savingEdit ? "Saving..." : "Save Changes") : submitting ? "Creating..." : "Create Staff"}
                </button>
                <button
                  type="button"
                  onClick={resetForm}
                  className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                >
                  {editingId ? "Cancel Edit" : "Reset"}
                </button>
              </div>
            </form>
          </section>

          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-6 py-5">
              <div className="flex flex-col gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">Staff Directory</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    HR can manage employees and managers here. Edit and delete change account details only, while document handling stays separate.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-[1fr_180px]">
                  <label className="relative block">
                    <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search by name, username, email, team, or role"
                      className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-11 pr-4 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:bg-white"
                    />
                  </label>
                  <SelectField
                    label="Status Filter"
                    value={statusFilter}
                    onChange={setStatusFilter}
                    options={[
                      { value: "all", label: "All Status" },
                      { value: "active", label: "Active" },
                      { value: "inactive", label: "Inactive" },
                    ]}
                    placeholder="All Status"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Staff</th>
                    <th className="px-6 py-4 font-semibold">Role / Team</th>
                    <th className="px-6 py-4 font-semibold">Assign Team</th>
                    <th className="px-6 py-4 font-semibold">Documents</th>
                    <th className="px-6 py-4 font-semibold">Status</th>
                    <th className="px-6 py-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredEmployees.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="px-6 py-8 text-center text-slate-500">
                        No staff records match the current search or filter.
                      </td>
                    </tr>
                  ) : (
                    filteredEmployees.map((employee) => (
                      <tr key={employee.id} className="border-t border-slate-100 align-top transition hover:bg-slate-50/80">
                        <td className="px-6 py-4 font-medium text-slate-900">
                          <div>{employee.name}</div>
                          {employee.designation && (
                            <div className="text-xs font-semibold text-cyan-700 mt-0.5">{employee.designation}</div>
                          )}
                          <div className="text-xs text-slate-500">{employee.username}</div>
                          <div className="text-xs text-slate-500">{employee.email}</div>
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          <div className="capitalize">{employee.role}</div>
                          <div className="text-xs text-slate-500">{employee.team_name || "No team"}</div>
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          {employee.role === "employee"
                            ? employee.manager || "Not assigned"
                            : employee.role === "manager"
                              ? "Own team owner"
                              : "N/A"}
                        </td>
                        <td className="px-6 py-4 text-slate-700">{employee.document_count}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${employee.is_active_employee ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-100 text-slate-700 ring-slate-200"}`}>
                            {employee.is_active_employee ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {canManage(employee.role) && (
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => startEdit(employee)}
                                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                              >
                                <Pencil size={14} />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => openStatusDialog(employee)}
                                disabled={statusChangingId === employee.id}
                                className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition disabled:opacity-70 ${
                                  employee.is_active_employee
                                    ? "border-rose-200 text-rose-700 hover:bg-rose-50"
                                    : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                }`}
                              >
                                {employee.is_active_employee ? <UserX size={14} /> : <UserCheck size={14} />}
                                {statusChangingId === employee.id
                                  ? "Updating..."
                                  : employee.is_active_employee
                                    ? "Inactive"
                                    : "Active"}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      {statusDialog ? (
        <StatusConfirmPopup
          employee={statusDialog}
          loading={statusChangingId === statusDialog.id}
          onCancel={closeStatusDialog}
          onConfirm={handleStatusToggle}
        />
      ) : null}

      {mapPickerTarget !== null && (
        <MapPickerModal
          latitude={form.locations[mapPickerTarget]?.latitude}
          longitude={form.locations[mapPickerTarget]?.longitude}
          defaultLatitude={form.locations.find(l => l.latitude && l.longitude)?.latitude || "22.5726"}
          defaultLongitude={form.locations.find(l => l.latitude && l.longitude)?.longitude || "88.3639"}
          onSelect={(lat, lng) => {
            handleLocationChange(mapPickerTarget, "latitude", lat);
            handleLocationChange(mapPickerTarget, "longitude", lng);
            setMapPickerTarget(null);
          }}
          onClose={() => setMapPickerTarget(null)}
        />
      )}

      {noticePopup ? (
        <NoticePopup notice={noticePopup} onClose={() => setNoticePopup(null)} />
      ) : null}
    </Layout>
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
    <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-emerald-100">
        {icon}
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function InputField({ label, type = "text", value, onChange }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:bg-white"
      />
    </label>
  );
}

function SelectField({ label, value, onChange, options, placeholder }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:bg-white"
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
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`mt-2 flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-sm font-medium transition ${checked ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}
      >
        <span>{checked ? "Active employee" : "Inactive employee"}</span>
        <CheckCircle2 size={16} />
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

    // Helper to perform Nominatim search as a fallback
    const runNominatimFallback = async (reason) => {
      console.log(`Google Geocoder failed (${reason}), running Nominatim fallback...`);
      
      const pinMatch = originalQuery.match(/\b\d{6}\b/);
      const queryPostcode = pinMatch ? pinMatch[0] : null;

      let data = [];
      let fallbackType = "";
      let matchedQuery = originalQuery;

      const findPostcodeMatch = (results, code) => {
        if (!code) return null;
        return results.find(item => {
          const addr = item.address || {};
          const postcode = (item.display_name || "").includes(code) || 
                           addr.postcode === code || 
                           (addr.postcode && String(addr.postcode).replace(/\s+/g, "").includes(code));
          return postcode;
        });
      };

      const fetchNominatim = async (q) => {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=in&limit=10&addressdetails=1`);
          return await res.json();
        } catch (err) {
          console.error("Nominatim fetch failed:", err);
          return [];
        }
      };

      // Try 1: Exact search
      data = await fetchNominatim(originalQuery);

      // Try 2: Segment-stripping loop
      let fuzzyFallback = null;
      let fuzzyQuery = "";

      if (data.length > 0 && queryPostcode) {
        const exactPostcodeMatch = findPostcodeMatch(data, queryPostcode);
        if (exactPostcodeMatch) {
          data = [exactPostcodeMatch, ...data.filter(x => x !== exactPostcodeMatch)];
        } else {
          fuzzyFallback = data[0];
          fuzzyQuery = originalQuery;
          data = [];
        }
      }

      if (data.length === 0) {
        let currentQuery = originalQuery;
        while (true) {
          const commaIdx = currentQuery.indexOf(",");
          if (commaIdx !== -1 && commaIdx < currentQuery.length - 1) {
            currentQuery = currentQuery.substring(commaIdx + 1).trim();
          } else {
            break;
          }

          const results = await fetchNominatim(currentQuery);
          if (results.length > 0) {
            if (queryPostcode) {
              const match = findPostcodeMatch(results, queryPostcode);
              if (match) {
                data = [match, ...results.filter(x => x !== match)];
                fallbackType = "broader";
                matchedQuery = currentQuery;
                break;
              } else if (!fuzzyFallback) {
                fuzzyFallback = results[0];
                fuzzyQuery = currentQuery;
              }
            } else {
              data = results;
              fallbackType = "broader";
              matchedQuery = currentQuery;
              break;
            }
          }
        }
      }

      // Try 3: Direct postcode search
      if (data.length === 0 && queryPostcode) {
        const results = await fetchNominatim(queryPostcode);
        if (results.length > 0) {
          data = results;
          fallbackType = "postcode";
          matchedQuery = queryPostcode;
        }
      }

      // Try 4: Fuzzy fallback
      if (data.length === 0 && fuzzyFallback) {
        data = [fuzzyFallback];
        fallbackType = "broader";
        matchedQuery = fuzzyQuery;
      }

      setSearchResults(data);

      if (data.length > 0) {
        let warnMsg = "";
        if (fallbackType === "postcode") {
          warnMsg = `Address details not found. Centered on postal code area: "${matchedQuery}".`;
        } else if (fallbackType === "broader") {
          warnMsg = `Specific landmark not found. Showing nearby results for: "${matchedQuery}".`;
        } else {
          warnMsg = "Showing OpenStreetMap fallback results.";
        }
        setSearchError(`${warnMsg} (Google API Key config needed for precise search)`);

        const first = data[0];
        const lat = Number(first.lat);
        const lng = Number(first.lon);
        if (mapRef.current) {
          mapRef.current.setCenter({ lat, lng });
          mapRef.current.setZoom(15);
          if (mapRef.current._selectedMarker) {
            mapRef.current._selectedMarker.setPosition({ lat, lng });
          }
        }
      } else {
        setSearchError("No matches found. Please check your address or drag the pin manually.");
      }
      setSearchLoading(false);
    };

    if (!window.google?.maps?.Geocoder) {
      await runNominatimFallback("Google SDK not loaded");
      return;
    }

    const geocoder = new window.google.maps.Geocoder();
    geocoder.geocode({ address: originalQuery }, async (results, status) => {
      if (status === window.google.maps.GeocoderStatus.OK && results && results.length > 0) {
        const formattedResults = results.map(item => ({
          display_name: item.formatted_address,
          lat: item.geometry.location.lat(),
          lon: item.geometry.location.lng()
        }));

        setSearchResults(formattedResults);

        const first = formattedResults[0];
        if (mapRef.current) {
          mapRef.current.setCenter({ lat: first.lat, lng: first.lon });
          mapRef.current.setZoom(16);
          if (mapRef.current._selectedMarker) {
            mapRef.current._selectedMarker.setPosition({ lat: first.lat, lng: first.lon });
          }
        }
        setSearchLoading(false);
      } else if (status === window.google.maps.GeocoderStatus.ZERO_RESULTS) {
        await runNominatimFallback("Zero results on Google");
      } else {
        await runNominatimFallback(`Google Geocoder error: ${status}`);
      }
    });
  };

  const handleSelectResult = (result) => {
    if (mapRef.current) {
      mapRef.current.setCenter({ lat: result.lat, lng: result.lon });
      mapRef.current.setZoom(16);
      if (mapRef.current._selectedMarker) {
        mapRef.current._selectedMarker.setPosition({ lat: result.lat, lng: result.lon });
      }
    }
    setSearchResults([]);
    setSearchQuery(result.display_name);
  };

  useEffect(() => {
    if (!mapsLoaded) return;

    const startLat = latitude && !isNaN(Number(latitude)) 
      ? Number(latitude) 
      : (defaultLatitude && !isNaN(Number(defaultLatitude)) ? Number(defaultLatitude) : 22.5726);
    const startLng = longitude && !isNaN(Number(longitude)) 
      ? Number(longitude) 
      : (defaultLongitude && !isNaN(Number(defaultLongitude)) ? Number(defaultLongitude) : 88.3639);

    const mapOptions = {
      center: { lat: startLat, lng: startLng },
      zoom: 15,
      mapTypeControl: false,
      fullscreenControl: false,
      streetViewControl: false,
    };

    const mapElement = document.getElementById(containerId);
    if (!mapElement) return;

    const map = new window.google.maps.Map(mapElement, mapOptions);
    mapRef.current = map;

    const marker = new window.google.maps.Marker({
      position: { lat: startLat, lng: startLng },
      map: map,
      draggable: true,
    });
    mapRef.current._selectedMarker = marker;

    // Drag end listener
    marker.addListener("dragend", () => {
      const pos = marker.getPosition();
      map.panTo(pos);
    });

    // Map click listener to relocate pin
    map.addListener("click", (e) => {
      const pos = e.latLng;
      marker.setPosition(pos);
      map.panTo(pos);
      setSearchResults([]); // close dropdown on map click
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
              className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-cyan-400 focus:bg-white"
            />
            <button
              type="submit"
              disabled={searchLoading}
              className="rounded-2xl bg-cyan-600 hover:bg-cyan-700 px-4 py-2.5 text-sm font-semibold text-white transition disabled:opacity-75"
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
            className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded-2xl bg-slate-900 hover:bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white transition"
          >
            Confirm Location
          </button>
        </div>
      </div>
    </div>
  );
}
