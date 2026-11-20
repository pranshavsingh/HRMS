import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Calendar,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FileBadge2,
  FileText,
  Folder,
  FolderOpen,
  LayoutGrid,
  List,
  Loader2,
  MoreVertical,
  RefreshCw,
  Search,
  Trash2,
  User,
  Users,
  X,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import Loader from "../components/common/Loader";
import API from "../api/axios";
import { usePopup } from "../context/PopupContext";
import { useSite } from "../context/SiteContext";
import { useRealtime } from "../context/RealtimeContext";

const getFileUrl = (path) => {
  if (!path) return "#";
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  const baseOrigin = API.defaults.baseURL?.replace(/\/api\/?$/, "") || "";
  return `${baseOrigin}${path}`;
};

function formatJoiningDate(dateStr) {
  if (!dateStr) return "--";
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

export default function EmployeeDocuments() {
  const userRole = localStorage.getItem("role") || "employee";
  const { querySiteId } = useSite();
  const { showPopup } = usePopup();

  // Core Data States
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [docsLoading, setDocsLoading] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [totalEmployees, setTotalEmployees] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [totalDocsCount, setTotalDocsCount] = useState(null);
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedEmployeeObj, setSelectedEmployeeObj] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [downloadingId, setDownloadingId] = useState(null);

  // Toolbar & Filter States
  const [filterRole, setFilterRole] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [viewMode, setViewMode] = useState("grid"); // 'grid' | 'list'

  // Pagination States
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(15);

  // Active Context Menu for Card (holds employee id)
  const [activeMenuId, setActiveMenuId] = useState(null);
  const menuRef = useRef(null);
  const detailSectionRef = useRef(null);

  // Debounce search term by 250ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Close card menu on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setActiveMenuId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadEmployees = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    try {
      const params = {
        page: currentPage,
        limit: rowsPerPage,
        site_id: querySiteId || undefined,
        search: debouncedSearch.trim() || undefined,
        role: filterRole !== "all" ? filterRole : undefined,
      };

      const res = await API.get("/auth/employees/", { params });
      const list = Array.isArray(res.data) ? res.data : (res.data?.data || []);
      setEmployees(list);

      const totalCount = res.data?.pagination?.total ?? res.data?.total_count ?? list.length;
      const pagesCount = res.data?.pagination?.totalPages ?? Math.max(1, Math.ceil(totalCount / rowsPerPage));
      setTotalEmployees(totalCount);
      setTotalPages(pagesCount);

      // Total documents count: authoritative metric from backend database query
      if (res.data?.total_documents !== undefined && res.data?.total_documents !== null) {
        setTotalDocsCount(Number(res.data.total_documents));
      }

      if (isManualRefresh) {
        showPopup("Data refreshed successfully", "success");
      }
    } catch (err) {
      console.error("Failed to load employees:", err);
      showPopup("Unable to load employees", "error");
    } finally {
      setLoading(false);
      if (isManualRefresh) setRefreshing(false);
    }
  }, [currentPage, rowsPerPage, querySiteId, debouncedSearch, filterRole, showPopup]);

  const loadDocuments = useCallback(async (userId) => {
    if (!userId) {
      setDocuments([]);
      return;
    }
    setDocsLoading(true);
    try {
      const res = await API.get(`/auth/documents/${userId}/`);
      setDocuments(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
      showPopup("Unable to load documents for this employee", "error");
    } finally {
      setDocsLoading(false);
    }
  }, [showPopup]);

  const handleDelete = async (docId, title) => {
    if (!window.confirm(`Are you sure you want to delete the document "${title}"?`)) {
      return;
    }
    try {
      await API.delete(`/auth/documents/${docId}/`);
      showPopup("Document deleted successfully", "success");
      loadDocuments(selectedUser);
      loadEmployees();
    } catch (err) {
      console.error(err);
      showPopup(err.response?.data?.error || "Unable to delete document", "error");
    }
  };

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  useEffect(() => {
    if (!selectedUser) {
      setSelectedEmployeeObj(null);
      setDocuments([]);
      return;
    }
    const found = employees.find((emp) => String(emp.id) === String(selectedUser));
    if (found) {
      setSelectedEmployeeObj(found);
    } else {
      API.get(`/auth/employees/${selectedUser}/`)
        .then((res) => {
          setSelectedEmployeeObj(res.data?.data || res.data || null);
        })
        .catch(() => {});
    }
    loadDocuments(selectedUser);
  }, [selectedUser, loadDocuments, employees]);

  // Real-time synchronization
  useRealtime("employee_update", () => {
    loadEmployees();
  });
  useRealtime("document_update", (data) => {
    loadEmployees();
    if (selectedUser && (!data?.userId || String(data.userId) === String(selectedUser))) {
      loadDocuments(selectedUser);
    }
  });

  // Server-side paginated items
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = totalEmployees === 0 ? 0 : (safeCurrentPage - 1) * rowsPerPage;
  const endIndex = Math.min(startIndex + rowsPerPage, totalEmployees);
  const paginatedEmployees = employees;

  const handleSelectEmployee = (emp) => {
    setSelectedUser(String(emp.id));
    setSelectedEmployeeObj(emp);
    setActiveMenuId(null);
    setTimeout(() => {
      detailSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  const handleClearFilters = () => {
    setSearchTerm("");
    setDebouncedSearch("");
    setFilterRole("all");
    setCurrentPage(1);
  };

  const handleCopyEmail = (email, e) => {
    e.stopPropagation();
    if (email) {
      navigator.clipboard?.writeText(email);
      showPopup(`Copied "${email}" to clipboard`, "success");
    }
    setActiveMenuId(null);
  };

  const handleDownload = async (doc) => {
    const targetUrl = doc.download_url || getFileUrl(doc.file);
    const empName = selectedEmployeeObj?.name || selectedEmployeeObj?.username || "employee";
    setDownloadingId(doc.id);
    try {
      const res = await fetch(targetUrl);
      if (!res.ok) throw new Error("Download request failed");
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      const cleanTitle = (doc.title || "document").replace(/[^a-zA-Z0-9_-]/g, "_");
      const cleanEmp = empName.replace(/[^a-zA-Z0-9_-]/g, "_");
      let ext = "";
      if (blob.type === "application/pdf") ext = ".pdf";
      else if (blob.type.includes("webp")) ext = ".webp";
      else if (blob.type.includes("jpeg") || blob.type.includes("jpg")) ext = ".jpg";
      else if (blob.type.includes("png")) ext = ".png";
      else if (targetUrl.includes(".pdf")) ext = ".pdf";
      else if (targetUrl.includes(".webp")) ext = ".webp";
      else if (targetUrl.includes(".jpg") || targetUrl.includes(".jpeg")) ext = ".jpg";
      else ext = ".png";

      link.download = `${cleanEmp}_${cleanTitle}${ext || ".pdf"}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.warn("Direct blob download failed, falling back to secure attachment URL:", err);
      window.location.assign(targetUrl);
    } finally {
      setDownloadingId(null);
    }
  };

  const displayTotalDocs = totalDocsCount !== null ? totalDocsCount : 0;

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
        {/* A. Hero Banner */}
        <section className="relative overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_52%,#0891b2_100%)] px-8 py-8 text-white shadow-xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.14),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(125,211,252,0.18),_transparent_30%)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-sky-100">
                <FolderOpen size={14} />
                EMPLOYEE DOCUMENTS
              </p>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                View Employee Documents
              </h1>
              <p className="mt-3 text-sm text-slate-200">
                Inspect, access, and download identity files, CVs, and qualifications uploaded by employees and managers.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <HeroTile
                icon={<Users size={18} />}
                label="TOTAL STAFF"
                value={totalEmployees}
              />
              <HeroTile
                icon={<FileBadge2 size={18} />}
                label="DOCUMENTS"
                value={displayTotalDocs.toLocaleString()}
              />
            </div>
          </div>
        </section>

        {/* B. Filter Toolbar */}
        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* Filter Dropdown */}
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
              <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">
                Choose Employee or Manager
              </span>
              <div className="relative min-w-[210px]">
                <select
                  value={selectedUser ? `user-${selectedUser}` : filterRole}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val.startsWith("user-")) {
                      const uid = val.replace("user-", "");
                      setSelectedUser(uid);
                      const found = employees.find((emp) => String(emp.id) === String(uid));
                      if (found) setSelectedEmployeeObj(found);
                    } else {
                      setSelectedUser("");
                      setSelectedEmployeeObj(null);
                      setFilterRole(val);
                      setCurrentPage(1);
                    }
                  }}
                  className="w-full appearance-none rounded-2xl border border-slate-200 bg-slate-50 py-2.5 pl-4 pr-9 text-xs font-semibold text-slate-800 outline-none transition focus:border-sky-400 focus:bg-white cursor-pointer"
                >
                  <option value="all">All Employees</option>
                  <option value="employee">Employees Only</option>
                  <option value="manager">Managers Only</option>
                  <option value="hr">HR Staff</option>
                  <optgroup label="Direct Staff View">
                    {employees.map((emp) => (
                      <option key={emp.id} value={`user-${emp.id}`}>
                        {emp.name || emp.username} ({emp.role})
                      </option>
                    ))}
                  </optgroup>
                </select>
                <ChevronDown
                  size={14}
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
              </div>
            </div>

            {/* Search Input */}
            <div className="relative min-w-[260px] flex-1">
              <Search
                size={16}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by employee name, username or email..."
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-9 text-xs text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Action Buttons: Clear & Refresh */}
            <div className="flex items-center gap-2">
              {(searchTerm || filterRole !== "all") && (
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition shadow-sm"
                >
                  <X size={13} />
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  loadEmployees(true);
                  if (selectedUser) loadDocuments(selectedUser);
                }}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-sm disabled:opacity-60 whitespace-nowrap"
              >
                <RefreshCw size={14} className={refreshing ? "animate-spin text-sky-600" : "text-slate-500"} />
                Refresh Data
              </button>
            </div>
          </div>
        </section>

        {/* C & D. Main Content Area */}
        {selectedUser ? (
          /* D. Selected Employee Document Detail View */
          <section ref={detailSectionRef} className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden transition-all duration-300">
            {/* Detail View Header */}
            <div className="border-b border-slate-100 px-6 py-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedUser("")}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition"
                    title="Return to Directory"
                  >
                    <ArrowLeft size={14} />
                    Back to Employee Directory
                  </button>

                  <div className="h-6 w-px bg-slate-200" />

                  <div className="flex items-center gap-2.5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
                      <FolderOpen size={20} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold text-slate-900">
                          {selectedEmployeeObj?.name || selectedEmployeeObj?.username || "Employee"}
                        </h2>
                        {selectedEmployeeObj?.role && (
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${getRoleBadgeStyle(
                              selectedEmployeeObj.role
                            )}`}
                          >
                            {selectedEmployeeObj.role}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">
                        {selectedEmployeeObj?.email || "No email"} • #{selectedEmployeeObj?.id}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                    <FileBadge2 size={13} />
                    {documents.length} {documents.length === 1 ? "document" : "documents"} uploaded
                  </span>
                </div>
              </div>
            </div>

            {/* Documents List */}
            {docsLoading ? (
              <div className="p-16 text-center">
                <Loader />
                <p className="mt-2 text-xs text-slate-400">Loading documents...</p>
              </div>
            ) : documents.length === 0 ? (
              <div className="p-16 text-center text-slate-500">
                <AlertCircle size={40} className="mx-auto text-slate-300" />
                <p className="mt-3 text-sm font-semibold text-slate-700">No documents uploaded yet</p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  This employee has not uploaded any identity cards, certificates, or files yet.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50/70 border-b border-slate-100 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-6 py-4">Document Title</th>
                      <th className="px-6 py-4">Uploaded Date</th>
                      <th className="px-6 py-4">Status / Storage</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {documents.map((doc) => {
                      const dateStr = doc.uploaded_at
                        ? formatJoiningDate(doc.uploaded_at)
                        : "--";
                      return (
                        <tr
                          key={doc.id}
                          className="transition hover:bg-slate-50/70"
                        >
                          <td className="px-6 py-4 font-semibold text-slate-900">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-700">
                                <FileText size={16} />
                              </div>
                              <span>{doc.title}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-600">
                            <div className="inline-flex items-center gap-1.5 text-slate-600">
                              <Calendar size={13} className="text-slate-400" />
                              <span>{dateStr}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-xs text-slate-500">
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
                              <CheckCircle size={11} />
                              Available
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2">
                              <a
                                href={getFileUrl(doc.file)}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                              >
                                <ExternalLink size={13} />
                                View File
                              </a>
                              <button
                                type="button"
                                onClick={() => handleDownload(doc)}
                                disabled={downloadingId === doc.id}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60 cursor-pointer"
                              >
                                {downloadingId === doc.id ? (
                                  <Loader2 size={13} className="animate-spin text-emerald-700" />
                                ) : (
                                  <Download size={13} />
                                )}
                                Download
                              </button>
                              {userRole === "superadmin" && (
                                <button
                                  type="button"
                                  onClick={() => handleDelete(doc.id, doc.title)}
                                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                                >
                                  <Trash2 size={13} />
                                  Delete
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : (
          /* C. Employee Document Directory Section */
          <section className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            {/* Directory Section Header */}
            <div className="border-b border-slate-100 px-6 py-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                    <Folder size={22} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold tracking-tight text-slate-900">
                      Employee Document Directory
                    </h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Browse and manage documents for all employees and managers.
                    </p>
                  </div>
                </div>

                {/* View Mode Switcher */}
                <div className="flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 p-1">
                  <button
                    type="button"
                    onClick={() => setViewMode("grid")}
                    className={`flex h-8 w-8 items-center justify-center rounded-xl transition ${
                      viewMode === "grid"
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                    title="Grid View"
                  >
                    <LayoutGrid size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("list")}
                    className={`flex h-8 w-8 items-center justify-center rounded-xl transition ${
                      viewMode === "list"
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-slate-500 hover:text-slate-800"
                    }`}
                    title="List View"
                  >
                    <List size={16} />
                  </button>
                </div>
              </div>
            </div>

            {/* Directory Cards / List Content */}
            <div className="p-4 sm:p-5">
              {paginatedEmployees.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 py-16 text-center">
                  <FolderOpen size={44} className="mx-auto text-slate-300" />
                  <h3 className="mt-3 text-base font-bold text-slate-700">No staff records match</h3>
                  <p className="mt-1 text-xs text-slate-400 max-w-sm mx-auto">
                    Try adjusting your search terms or filter to find what you are looking for.
                  </p>
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
                  >
                    <RefreshCw size={13} />
                    Reset Search & Filters
                  </button>
                </div>
              ) : viewMode === "grid" ? (
                /* 5-Column Responsive Card Grid matching mockup */
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-3 xl:gap-3">
                  {paginatedEmployees.map((employee) => {
                    const docCount = Number(employee.document_count) || 0;
                    const docText = `${docCount} ${docCount === 1 ? "file" : "files"}`;
                    const displayName = employee.name || employee.username;
                    const isMenuOpen = activeMenuId === employee.id;

                    return (
                      <div
                        key={employee.id}
                        tabIndex={0}
                        role="button"
                        onClick={() => handleSelectEmployee(employee)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            handleSelectEmployee(employee);
                          }
                        }}
                        className="group relative flex items-center justify-between rounded-2xl border border-slate-200/90 bg-white px-3 py-2.5 sm:px-3.5 sm:py-3 shadow-sm hover:shadow-md hover:border-blue-400 transition-all cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        {/* Left: Folder Icon Container */}
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-slate-50 text-blue-600 border border-slate-100 group-hover:bg-blue-50/80 group-hover:border-blue-200 transition">
                            <Folder size={18} className="stroke-[1.75]" />
                          </div>

                          {/* Middle: Name + Files count */}
                          <div className="min-w-0 flex-1">
                            <div
                              className="font-bold text-slate-900 text-[11px] sm:text-xs truncate group-hover:text-blue-600 transition leading-tight"
                              title={displayName}
                            >
                              {displayName}
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-slate-500 font-medium mt-0.5 leading-none">
                              <FileText size={11} className="text-slate-400 flex-shrink-0" />
                              <span className="truncate">{docText}</span>
                            </div>
                          </div>
                        </div>

                        {/* Right: Three Dots Action Menu */}
                        <div className="relative ml-1 flex-shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuId(isMenuOpen ? null : employee.id);
                            }}
                            className="flex h-6 w-6 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
                            aria-label={`Actions for ${displayName}`}
                          >
                            <MoreVertical size={14} />
                          </button>

                          {/* Context Popover Menu */}
                          {isMenuOpen && (
                            <div
                              ref={menuRef}
                              onClick={(e) => e.stopPropagation()}
                              className="absolute right-0 top-7 z-30 w-36 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl text-xs"
                            >
                              <button
                                type="button"
                                onClick={() => handleSelectEmployee(employee)}
                                className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-slate-700 hover:bg-blue-50 hover:text-blue-700 font-medium transition"
                              >
                                <FolderOpen size={13} />
                                Open Folder
                              </button>
                              {employee.email && (
                                <button
                                  type="button"
                                  onClick={(e) => handleCopyEmail(employee.email, e)}
                                  className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-slate-700 hover:bg-slate-50 font-medium transition"
                                >
                                  <Copy size={13} />
                                  Copy Email
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* List View Mode */
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="px-5 py-3.5">Staff</th>
                        <th className="px-4 py-3.5">Role</th>
                        <th className="px-4 py-3.5">Email</th>
                        <th className="px-4 py-3.5">Documents</th>
                        <th className="px-5 py-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {paginatedEmployees.map((employee) => {
                        const docCount = Number(employee.document_count) || 0;
                        const docText = `${docCount} ${docCount === 1 ? "file" : "files"}`;
                        return (
                          <tr
                            key={employee.id}
                            onClick={() => handleSelectEmployee(employee)}
                            className="cursor-pointer transition hover:bg-slate-50/70"
                          >
                            <td className="px-5 py-3.5">
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                                  <Folder size={18} />
                                </div>
                                <span className="font-semibold text-slate-900">
                                  {employee.name || employee.username}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-3.5">
                              <span
                                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${getRoleBadgeStyle(
                                  employee.role
                                )}`}
                              >
                                {employee.role}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-xs text-slate-500">{employee.email || "--"}</td>
                            <td className="px-4 py-3.5 text-xs font-semibold text-slate-700">{docText}</td>
                            <td className="px-5 py-3.5 text-right">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectEmployee(employee);
                                }}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                              >
                                <FolderOpen size={13} />
                                Open
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* E. Pagination Footer */}
            <div className="flex flex-col items-center justify-between gap-4 border-t border-slate-100 px-6 py-4 sm:flex-row">
              {/* Left: Summary */}
              <div className="text-xs text-slate-500">
                Showing{" "}
                <span className="font-semibold text-slate-700">
                  {totalEmployees === 0 ? 0 : startIndex + 1}
                </span>{" "}
                –{" "}
                <span className="font-semibold text-slate-700">{endIndex}</span> of{" "}
                <span className="font-semibold text-slate-700">{totalEmployees}</span> employees
              </div>

              {/* Right: Rows per page & Page controls */}
              <div className="flex items-center gap-4">
                {/* Rows per page */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-medium">Rows per page</span>
                  <select
                    value={rowsPerPage}
                    onChange={(e) => {
                      setRowsPerPage(Number(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 outline-none transition focus:border-sky-400 focus:bg-white cursor-pointer"
                  >
                    <option value={10}>10</option>
                    <option value={15}>15</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </div>

                {/* Page Navigation */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={safeCurrentPage <= 1}
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent transition"
                    aria-label="Previous Page"
                  >
                    <ChevronLeft size={16} />
                  </button>

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
        )}
      </div>
    </Layout>
  );
}

function HeroTile({ icon, label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur-sm min-w-[110px] flex flex-col justify-between">
      <div className="flex items-center gap-2 text-sky-100">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wider text-sky-100 whitespace-nowrap">
          {label}
        </span>
      </div>
      <p className="mt-2 text-xl font-bold text-white sm:text-2xl leading-none">{value}</p>
    </div>
  );
}
