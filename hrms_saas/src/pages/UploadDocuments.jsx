import { useEffect, useState } from "react";
import {
  FileBadge2,
  FileUp,
  RefreshCw,
  Upload,
  Users,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import Loader from "../components/common/Loader";
import API from "../api/axios";
import { usePopup } from "../context/PopupContext";

const documentOptions = [
  "Aadhar Card",
  "PAN Card",
  "Bank Details",
  "CV",
  "Voter ID",
  "Driving License",
  "Other",
];

export default function UploadDocuments() {
  const { showPopup } = usePopup();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState({
    user: "",
    title: "Aadhar Card",
  });
  const [file, setFile] = useState(null);

  const loadEmployees = async () => {
    try {
      const res = await API.get("/auth/employees/");
      setEmployees(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.log(err);
      showPopup("Unable to load employees", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployees();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.user || !file) {
      showPopup("Please select employee and file", "warning");
      return;
    }

    setSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("user", form.user);
      formData.append("title", form.title);
      formData.append("file", file);

      const res = await API.post("/auth/documents/upload/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      showPopup(res.data.message || "Document uploaded", "success");
      setForm({ user: "", title: "Aadhar Card" });
      setFile(null);
    } catch (err) {
      console.log(err.response?.data || err.message);
      showPopup(err.response?.data?.error || "Unable to upload document", "error");
    } finally {
      setSubmitting(false);
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
        <section className="relative overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#0f172a_0%,#1d4ed8_52%,#0891b2_100%)] px-8 py-8 text-white shadow-xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.14),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(125,211,252,0.18),_transparent_30%)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-sky-100">
                <FileUp size={14} />
                Document Upload
              </p>
              <h1 className="text-3xl font-bold tracking-tight">
                Upload or add more employee documents
              </h1>
              <p className="mt-3 text-sm text-slate-200">
                HR can upload employee joining or additional documents after onboarding from one clean panel.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
              <HeroTile icon={<Users size={18} />} label="Employees" value={employees.length} />
              <HeroTile icon={<FileBadge2 size={18} />} label="Mode" value="Upload" />
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Upload Document</h2>
              <p className="mt-1 text-sm text-slate-500">
                Select the employee, choose the document type, and upload the file.
              </p>
            </div>
            <button
              onClick={loadEmployees}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              <RefreshCw size={16} />
              Refresh
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Employee</span>
              <select
                value={form.user}
                onChange={(e) => setForm((current) => ({ ...current, user: e.target.value }))}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
              >
                <option value="">Select employee</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.username}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-700">Document Type</span>
              <select
                value={form.title}
                onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
              >
                {documentOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="block xl:col-span-1">
              <span className="text-sm font-medium text-slate-700">File</span>
              <input
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="mt-2 block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
              />
            </label>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-70"
              >
                <Upload size={16} />
                {submitting ? "Uploading..." : "Upload Document"}
              </button>
            </div>
          </form>
        </section>
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
