import { useEffect, useState } from "react";
import {
  AlertCircle,
  FileBadge2,
  FolderOpen,
  RefreshCw,
  Users,
  ExternalLink,
  Download,
  Trash2,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import Loader from "../components/common/Loader";
import API from "../api/axios";
import { usePopup } from "../context/PopupContext";

const getFileUrl = (path) => {
  if (!path) return "#";
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  const baseOrigin = API.defaults.baseURL?.replace(/\/api\/?$/, "") || "";
  return `${baseOrigin}${path}`;
};

export default function EmployeeDocuments() {
  const userRole = localStorage.getItem("role") || "employee";
  const { showPopup } = usePopup();
  const [loading, setLoading] = useState(true);
  const [docsLoading, setDocsLoading] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [selectedUser, setSelectedUser] = useState("");
  const [documents, setDocuments] = useState([]);

  const handleDelete = async (docId, title) => {
    if (!window.confirm(`Are you sure you want to delete the document "${title}"?`)) {
      return;
    }
    try {
      await API.delete(`/auth/documents/${docId}/`);
      showPopup("Document deleted successfully", "success");
      loadDocuments(selectedUser);
    } catch (err) {
      console.error(err);
      showPopup(err.response?.data?.error || "Unable to delete document", "error");
    }
  };

  const loadEmployees = async () => {
    try {
      const res = await API.get("/auth/employees/");
      setEmployees(Array.isArray(res.data) ? res.data : (res.data?.data || []));
    } catch (err) {
      console.error(err);
      showPopup("Unable to load employees", "error");
    } finally {
      setLoading(false);
    }
  };

  const loadDocuments = async (userId) => {
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
  };

  const handleDownload = async (fileUrl, title) => {
    try {
      const response = await fetch(fileUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const extension = fileUrl.split('.').pop().split('?')[0] || 'pdf';
      link.setAttribute("download", `${title}.${extension}`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to download file:", err);
      window.open(fileUrl, "_blank");
    }
  };

  useEffect(() => {
    loadEmployees();
  }, []);

  useEffect(() => {
    loadDocuments(selectedUser);
  }, [selectedUser]);

  if (loading) {
    return (
      <Layout>
        <Loader />
      </Layout>
    );
  }

  const selectedEmployeeObj = employees.find((emp) => String(emp.id) === String(selectedUser));

  return (
    <Layout>
      <div className="space-y-6">
        {/* Top Banner */}
        <section className="relative overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_52%,#0891b2_100%)] px-8 py-8 text-white shadow-xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.14),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(125,211,252,0.18),_transparent_30%)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-sky-100">
                <FolderOpen size={14} />
                Employee Documents
              </p>
              <h1 className="text-3xl font-bold tracking-tight">
                View Employee Documents
              </h1>
              <p className="mt-3 text-sm text-slate-200">
                Inspect, access, and download identity files, CVs, and qualifications uploaded by employees and managers.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
              <HeroTile icon={<Users size={18} />} label="Total Staff" value={employees.length} />
              <HeroTile icon={<FileBadge2 size={18} />} label="Documents" value={selectedUser ? documents.length : "--"} />
            </div>
          </div>
        </section>

        {/* Selection Card */}
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex-1">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Choose Employee or Manager</span>
                <select
                  value={selectedUser}
                  onChange={(e) => setSelectedUser(e.target.value)}
                  className="mt-2 w-full max-w-md rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
                >
                  <option value="">Select a staff member</option>
                  {employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name} ({employee.role === "manager" ? "Manager" : "Employee"})
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex items-end">
              <button
                onClick={() => {
                  loadEmployees();
                  if (selectedUser) loadDocuments(selectedUser);
                }}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                <RefreshCw size={16} />
                Refresh Data
              </button>
            </div>
          </div>
        </section>

        {/* Selected Employee Documents & Actions */}
        {!selectedUser ? (
          <section className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/50 p-12 text-center">
            <FolderOpen size={48} className="mx-auto text-slate-400" />
            <h3 className="mt-4 text-lg font-semibold text-slate-700">No Staff Selected</h3>
            <p className="mt-2 text-sm text-slate-500 max-w-sm mx-auto">
              Please choose an employee or manager from the dropdown list above to view their files.
            </p>
          </section>
        ) : (
          <section className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Uploaded Documents</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Showing documents for {selectedEmployeeObj?.name}.
                </p>
              </div>
            </div>

            {docsLoading ? (
              <div className="p-12 text-center">
                <Loader />
              </div>
            ) : documents.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <AlertCircle size={36} className="mx-auto text-slate-300" />
                <p className="mt-2 text-sm font-medium">No documents uploaded yet.</p>
                <p className="text-xs text-slate-400 mt-1">
                  This employee has not uploaded any identity cards or files yet.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-6 py-4 font-semibold">Document Title</th>
                      <th className="px-6 py-4 font-semibold">Uploaded Date</th>
                      <th className="px-6 py-4 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc) => {
                      const dateStr = doc.uploaded_at
                        ? new Date(doc.uploaded_at).toLocaleDateString()
                        : "--";
                      return (
                        <tr
                          key={doc.id}
                          className="border-t border-slate-100 transition hover:bg-slate-50/50"
                        >
                          <td className="px-6 py-4 font-medium text-slate-900">{doc.title}</td>
                          <td className="px-6 py-4 text-slate-700">{dateStr}</td>
                          <td className="px-6 py-4">
                            <div className="flex gap-2">
                              <a
                                href={getFileUrl(doc.file)}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-700 ring-1 ring-sky-200 transition hover:bg-sky-100"
                              >
                                <ExternalLink size={12} />
                                View File
                              </a>
                              <a
                                href={getFileUrl(doc.file)}
                                download={`${selectedEmployeeObj?.name || "employee"}_${doc.title}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 transition hover:bg-emerald-100"
                              >
                                <Download size={12} />
                                Download
                              </a>
                              {userRole === "superadmin" && (
                                <button
                                  type="button"
                                  onClick={() => handleDelete(doc.id, doc.title)}
                                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200 transition hover:bg-rose-100"
                                >
                                  <Trash2 size={12} />
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
        )}
      </div>
    </Layout>
  );
}

function HeroTile({ icon, label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-sky-100">
        {icon}
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}
