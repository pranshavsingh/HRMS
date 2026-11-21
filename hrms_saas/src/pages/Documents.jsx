import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Download,
  Eye,
  FileBadge2,
  FileCheck2,
  FileText,
  RefreshCw,
  Shield,
  Loader2,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import Loader from "../components/common/Loader";
import API from "../api/axios";
import { usePopup } from "../context/PopupContext";
import { useRealtime } from "../context/RealtimeContext";

const formatDateTime = (value) => {
  if (!value) return "--";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const getFileUrl = (path) => {
  if (!path) return "#";
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  const baseOrigin = API.defaults.baseURL?.replace(/\/api\/?$/, "") || "";
  return `${baseOrigin}${path}`;
};



export default function Documents() {
  const { showPopup } = usePopup();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);

  const fetchDocuments = useCallback(async (showLoader = true) => {
    if (showLoader) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const res = await API.get("/auth/documents/my/");
      setDocuments(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Documents fetch error:", err.response?.data || err.message);
      showPopup("Unable to load your documents", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showPopup]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Real-time synchronization: refresh when documents are uploaded, replaced, or deleted
  useRealtime("document_update", () => {
    fetchDocuments(false);
  });
  useRealtime("employee_update", () => {
    fetchDocuments(false);
  });

  const handleDownload = async (doc) => {
    const targetUrl = doc.download_url || getFileUrl(doc.file);
    const cleanTitle = (doc.title || "document").replace(/[^a-zA-Z0-9_-]/g, "_");
    setDownloadingId(doc.id);
    try {
      const res = await fetch(targetUrl);
      if (!res.ok) throw new Error("Download request failed");
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      let ext = "";
      if (blob.type === "application/pdf") ext = ".pdf";
      else if (blob.type.includes("webp")) ext = ".webp";
      else if (blob.type.includes("jpeg") || blob.type.includes("jpg")) ext = ".jpg";
      else if (blob.type.includes("png")) ext = ".png";
      else if (targetUrl.includes(".pdf")) ext = ".pdf";
      else if (targetUrl.includes(".webp")) ext = ".webp";
      else if (targetUrl.includes(".jpg") || targetUrl.includes(".jpeg")) ext = ".jpg";
      else ext = ".png";

      link.download = `${cleanTitle}${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.warn("Direct blob download failed, opening secure attachment safely in new tab:", err);
      // Fallback: open attachment safely in a new tab without navigating away from the HRMS application
      const fallbackLink = document.createElement("a");
      fallbackLink.href = targetUrl;
      fallbackLink.target = "_blank";
      fallbackLink.rel = "noopener noreferrer";
      document.body.appendChild(fallbackLink);
      fallbackLink.click();
      document.body.removeChild(fallbackLink);
    } finally {
      setDownloadingId(null);
    }
  };

  const summary = useMemo(() => {
    const latestUpload = documents.length
      ? formatDateTime(
          [...documents].sort(
            (a, b) => new Date(b.uploaded_at) - new Date(a.uploaded_at)
          )[0]?.uploaded_at
        )
      : "--";

    return {
      total: documents.length,
      latestUpload,
    };
  }, [documents]);

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
        <section className="relative overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#0f172a_0%,#1e293b_50%,#0f766e_100%)] px-8 py-8 text-white shadow-xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.16),_transparent_30%),radial-gradient(circle_at_bottom_left,_rgba(45,212,191,0.22),_transparent_30%)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-cyan-100">
                <FileBadge2 size={14} />
                Employee Documents
              </p>
              <h1 className="text-3xl font-bold tracking-tight">
                Secure access to your joining documents
              </h1>
              <p className="mt-3 text-sm text-slate-200">
                View and download only the documents uploaded for you during
                joining. This page is read-only, so files cannot be edited or
                deleted here.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard
                icon={<FileCheck2 size={18} />}
                label="My Documents"
                value={summary.total}
              />
              <StatCard
                icon={<Shield size={18} />}
                label="Access"
                value="Read Only"
              />
              <StatCard
                icon={<FileText size={18} />}
                label="Latest Upload"
                value={summary.latestUpload}
                compact
              />
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                Available Documents
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                You can preview or download your own uploaded documents only.
              </p>
            </div>

            <button
              onClick={() => fetchDocuments(false)}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>

          {documents.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <FileText size={28} />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">
                No documents available
              </h3>
              <p className="mt-2 text-sm text-slate-500">
                Your joining documents will appear here once HR uploads them.
              </p>
            </div>
          ) : (
            <div className="grid gap-5 p-6 md:grid-cols-2 xl:grid-cols-3">
              {documents.map((doc) => {
                const fileUrl = getFileUrl(doc.file);

                return (
                  <article
                    key={doc.id}
                    className="rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700">
                        <FileBadge2 size={22} />
                      </div>
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                        Read Only
                      </span>
                    </div>

                    <h3 className="mt-4 text-lg font-semibold text-slate-900">
                      {doc.title}
                    </h3>

                    <p className="mt-2 text-sm text-slate-500">
                      Last Update: {formatDateTime(doc.uploaded_at)}
                    </p>

                    <div className="mt-5 flex flex-wrap gap-3">
                      <a
                        href={fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                      >
                        <Eye size={16} />
                        View
                      </a>

                      <button
                        type="button"
                        onClick={() => handleDownload(doc)}
                        disabled={downloadingId === doc.id}
                        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
                      >
                        {downloadingId === doc.id ? (
                          <Loader2 size={16} className="animate-spin text-slate-600" />
                        ) : (
                          <Download size={16} />
                        )}
                        Download
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}

function StatCard({ icon, label, value, compact = false }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-cyan-100">
        {icon}
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <p className={`mt-2 font-semibold text-white ${compact ? "text-sm" : "text-2xl"}`}>
        {value}
      </p>
    </div>
  );
}
