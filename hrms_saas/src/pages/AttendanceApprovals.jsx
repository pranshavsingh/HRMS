import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Eye,
  MapPinned,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
  XCircle,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import Loader from "../components/common/Loader";
import Pagination from "../components/common/Pagination";
import API from "../api/axios";
import { useAuth } from "../context/AuthContext";
import { usePopup } from "../context/PopupContext";
import { useRealtime } from "../context/RealtimeContext";
import { useSite } from "../context/SiteContext";

const badgeStyles = {
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  rejected: "bg-rose-50 text-rose-700 ring-rose-200",
  closed: "bg-slate-100 text-slate-700 ring-slate-200",
};

const heroByRole = {
  manager: {
    tag: "Team Attendance Desk",
    title: "Review out-of-area attendance exceptions from your team",
    description:
      "Only the punch step outside the allotted area comes for review. If both punch in and punch out are outside, both review items appear separately.",
    gradient:
      "bg-[linear-gradient(135deg,#172554_0%,#1e3a8a_48%,#0f766e_100%)]",
    badge: "text-cyan-100",
  },
  hr: {
    tag: "HR Attendance Control",
    title: "Handle attendance exception approvals with clear punch-level review",
    description:
      "Employee exceptions reach manager, HR, and admin. Manager exceptions reach HR and admin. HR exceptions reach admin, and counted hours begin only after approval.",
    gradient:
      "bg-[linear-gradient(135deg,#3f1d2e_0%,#7c2d12_48%,#14532d_100%)]",
    badge: "text-emerald-100",
  },
  admin: {
    tag: "Admin Attendance Queue",
    title: "Finalize attendance exceptions across the company",
    description:
      "Admin can review the final queue for employee, manager, and HR exceptions and see exactly who cleared or rejected each punch item.",
    gradient:
      "bg-[linear-gradient(135deg,#111827_0%,#1f2937_48%,#312e81_100%)]",
    badge: "text-indigo-100",
  },
  superadmin: {
    tag: "Superadmin Attendance Queue",
    title: "Review final attendance exceptions across every role",
    description:
      "Superadmin receives employee, manager, HR, and admin out-of-area punch approvals whenever a punch needs higher review.",
    gradient:
      "bg-[linear-gradient(135deg,#111827_0%,#3730a3_48%,#0f766e_100%)]",
    badge: "text-indigo-100",
  },
};

const emptySummary = {
  scope_label: "",
  total_items: 0,
  pending_items: 0,
  approved_items: 0,
  rejected_items: 0,
  closed_items: 0,
  actionable_items: 0,
};

const formatDate = (value) => {
  if (!value) return "--";
  if (typeof value === "string") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [, y, m, d] = match;
      const date = new Date(Number(y), Number(m) - 1, Number(d));
      return new Intl.DateTimeFormat("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(date);
    }
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(date);
};

const formatDateTime = (value) => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(date);
};

const capitalize = (value) =>
  value ? value.charAt(0).toUpperCase() + value.slice(1) : "";

export default function AttendanceApprovals() {
  const { showPopup } = usePopup();
  const { role: authRole } = useAuth();
  const role = authRole || "";
  const { querySiteId } = useSite();
  const hero = heroByRole[role] || heroByRole.hr;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submittingKey, setSubmittingKey] = useState("");
  const [summary, setSummary] = useState(emptySummary);
  const [records, setRecords] = useState([]);

  // Server-side Pagination & Filtering States
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [totalRecords, setTotalRecords] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Modals
  const [previewPhoto, setPreviewPhoto] = useState(null);
  const [rejectModal, setRejectModal] = useState({ open: false, item: null, reason: "" });

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Fetch approvals from server
  const fetchApprovals = useCallback(async (showLoader = true) => {
    if (showLoader) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const res = await API.get("/attendance/approvals/", {
        params: {
          site_id: querySiteId,
          page: currentPage,
          limit: pageSize,
          search: debouncedSearch || undefined,
          status: statusFilter !== "all" ? statusFilter : undefined,
          type: typeFilter !== "all" ? typeFilter : undefined,
        },
      });

      const payload = res.data || {};
      const items = Array.isArray(payload.data)
        ? payload.data
        : Array.isArray(payload.records)
          ? payload.records
          : Array.isArray(payload)
            ? payload
            : [];

      const totalCount = payload.pagination?.total ?? payload.total ?? items.length;
      const pagesCount = payload.pagination?.totalPages ?? payload.totalPages ?? Math.max(1, Math.ceil(totalCount / pageSize));

      setRecords(items);
      setTotalRecords(totalCount);
      setTotalPages(pagesCount);

      if (currentPage > pagesCount && pagesCount >= 1) {
        setCurrentPage((prev) => (prev > pagesCount ? pagesCount : prev));
      }

      if (payload.summary) {
        setSummary({
          ...emptySummary,
          ...payload.summary,
        });
      }
    } catch (err) {
      console.error("Attendance approvals fetch error:", err.response?.data || err.message);
      showPopup(err.response?.data?.error || "Unable to load attendance approvals", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentPage, debouncedSearch, pageSize, querySiteId, showPopup, statusFilter, typeFilter]);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  useRealtime("attendance_update", () => fetchApprovals(false));

  const handleAction = async (approvalId, nextStatus, comment = "") => {
    setSubmittingKey(`${approvalId}-${nextStatus}`);

    try {
      const payload = { status: nextStatus };
      if (comment && comment.trim()) {
        payload.comment = comment.trim();
      }
      const res = await API.post(`/attendance/approvals/${approvalId}/`, payload);
      showPopup(res.data?.message || `Attendance ${nextStatus} successfully`, "success");
      setRejectModal({ open: false, item: null, reason: "" });
      await fetchApprovals(false);
    } catch (err) {
      console.error("Attendance approval action error:", err.response?.data || err.message);
      showPopup(err.response?.data?.error || `Unable to ${nextStatus} this punch item`, "error");
    } finally {
      setSubmittingKey("");
    }
  };

  const openRejectModal = (item) => {
    setRejectModal({
      open: true,
      item,
      reason: "",
    });
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
        <section
          className={`relative overflow-hidden rounded-3xl px-8 py-8 text-white shadow-xl ${hero.gradient}`}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.14),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(255,255,255,0.10),_transparent_32%)]" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p
                className={`mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] ${hero.badge}`}
              >
                <ShieldCheck size={14} />
                {hero.tag}
              </p>
              <h1 className="text-3xl font-bold tracking-tight">{hero.title}</h1>
              <p className="mt-3 text-sm text-slate-200">{hero.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <HeroMetric icon={<Clock3 size={18} />} label="Pending" value={summary.pending_items} />
              <HeroMetric icon={<AlertCircle size={18} />} label="Actionable" value={summary.actionable_items} />
              <HeroMetric icon={<CheckCircle2 size={18} />} label="Approved" value={summary.approved_items} />
              <HeroMetric icon={<XCircle size={18} />} label="Rejected" value={summary.rejected_items} />
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-slate-900">Approval Workspace</h2>
              <p className="mt-1 text-sm text-slate-500">
                {summary.scope_label || "Review assigned attendance exceptions by punch item."}
              </p>
            </div>

            <button
              onClick={() => fetchApprovals(false)}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1.7fr_0.9fr_0.9fr]">
            <label className="block">
              <span className="mb-2 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                <Search size={16} />
                Search
              </span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by employee, team, review type, or approver"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              />
            </label>

            <label className="block">
              <span className="mb-2 text-sm font-medium text-slate-700">Status Filter</span>
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
                <option value="closed">Closed by other approver</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-2 text-sm font-medium text-slate-700">Punch / Exception Type</span>
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:bg-white"
              >
                <option value="all">All Types</option>
                <option value="in">Punch In (Location)</option>
                <option value="out">Punch Out (Location)</option>
                <option value="early_departure">Early Departure</option>
                <option value="overtime">Overtime</option>
              </select>
            </label>
          </div>
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
          <StatCard title="Total In Queue" value={summary.total_items} subtitle="Total exception queue" icon={<ShieldCheck size={20} />} tone="slate" />
          <StatCard title="Pending" value={summary.pending_items} subtitle="Waiting for review" icon={<Clock3 size={20} />} tone="amber" />
          <StatCard title="Actionable" value={summary.actionable_items} subtitle="Awaiting your action" icon={<AlertCircle size={20} />} tone="cyan" />
          <StatCard title="Approved" value={summary.approved_items} subtitle="Approved items" icon={<CheckCircle2 size={20} />} tone="emerald" />
          <StatCard title="Rejected" value={summary.rejected_items} subtitle="Rejected items" icon={<XCircle size={20} />} tone="rose" />
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-5">
            <h2 className="text-xl font-semibold text-slate-900">Attendance Approval Queue</h2>
            <p className="mt-1 text-sm text-slate-500">
              Counted attendance hours start only after the required punch item is approved.
            </p>
          </div>

          {records.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                <MapPinned size={28} />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-900">No attendance approvals match these filters</h3>
              <p className="mt-2 text-sm text-slate-500">Try changing the search text, status, or punch type filter.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Employee</th>
                    <th className="px-6 py-4 font-semibold">Review Item</th>
                    <th className="px-6 py-4 font-semibold">Attendance Window</th>
                    <th className="px-6 py-4 font-semibold">Location & Proof</th>
                    <th className="px-6 py-4 font-semibold">Queue Status</th>
                    <th className="px-6 py-4 font-semibold">Decision</th>
                    <th className="px-6 py-4 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((item) => {
                    const approveBusy = submittingKey === `${item.approval_id}-approved`;
                    const rejectBusy = submittingKey === `${item.approval_id}-rejected`;

                    // Photo corresponding to this review item
                    const currentPhoto = item.review_type === "in" ? item.punch_in_photo : item.punch_out_photo;
                    const altPhoto = item.review_type === "in" ? item.punch_out_photo : item.punch_in_photo;

                    return (
                      <tr key={item.approval_id} className="border-t border-slate-100 align-top transition hover:bg-slate-50/80">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-slate-900">{item.employee_name || item.employee}</div>
                          <div className="mt-1 text-xs text-slate-500">@{item.employee}</div>
                          <div className="mt-1 text-xs text-slate-500">{capitalize(item.employee_role)} | {item.team_name || "--"}</div>
                          <div className="mt-1 text-xs text-slate-500">Manager: {item.reporting_manager || "--"}</div>
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          <div className="font-semibold text-slate-900">{item.review_label}</div>
                          {item.comment && (
                            <div className="mt-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 inline-block">
                              {item.comment}
                            </div>
                          )}
                          <div className="mt-2 text-xs text-slate-500">Route: {item.approval_route}</div>
                          <div className="mt-1 text-xs text-slate-500">Overall attendance: {capitalize(item.attendance_status)}</div>
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          <div className="font-medium text-slate-900">{formatDate(item.date)}</div>
                          <div className="mt-2 text-xs text-slate-500">Punch In: {formatDateTime(item.punch_in_time)}</div>
                          <div className="mt-1 text-xs text-slate-500">Punch Out: {formatDateTime(item.punch_out_time)}</div>
                          <div className="mt-1 text-xs text-slate-500">Counted hours: {Number(item.work_hours || 0).toFixed(2)} hrs</div>
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
                            {item.location_label}
                          </div>

                          {/* GPS Coordinates and Google Maps Link */}
                          {item.latitude != null && item.longitude != null ? (
                            <div className="mt-2 flex items-center gap-1.5 text-xs">
                              <MapPinned size={14} className="text-slate-400 shrink-0" />
                              <a
                                href={`https://www.google.com/maps?q=${item.latitude},${item.longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 hover:underline font-mono"
                                title="View location on Google Maps"
                              >
                                {Number(item.latitude).toFixed(4)}, {Number(item.longitude).toFixed(4)}
                                <ExternalLink size={11} />
                              </a>
                            </div>
                          ) : (
                            <div className="mt-1 text-xs text-slate-400">No GPS data</div>
                          )}

                          {/* Punch Selfie Proof */}
                          <div className="mt-2 flex items-center gap-2">
                            {currentPhoto ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setPreviewPhoto({
                                    url: currentPhoto,
                                    employeeName: item.employee_name || item.employee,
                                    time: item.review_type === "in" ? item.punch_in_time : item.punch_out_time,
                                    label: `${item.review_label} Selfie`,
                                  })
                                }
                                className="group relative flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-1 hover:border-blue-400 transition"
                                title="Click to enlarge punch photo"
                              >
                                <img
                                  src={currentPhoto}
                                  alt="Punch selfie"
                                  className="h-8 w-8 rounded object-cover"
                                  onError={(e) => {
                                    e.target.style.display = "none";
                                  }}
                                />
                                <span className="text-[11px] font-medium text-slate-600 group-hover:text-blue-600 flex items-center gap-0.5 pr-1">
                                  <Eye size={12} />
                                  Selfie
                                </span>
                              </button>
                            ) : altPhoto ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setPreviewPhoto({
                                    url: altPhoto,
                                    employeeName: item.employee_name || item.employee,
                                    time: item.review_type === "in" ? item.punch_out_time : item.punch_in_time,
                                    label: "Alternate Punch Selfie",
                                  })
                                }
                                className="group relative flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-1 hover:border-blue-400 transition"
                                title="Click to view alternate punch photo"
                              >
                                <img
                                  src={altPhoto}
                                  alt="Punch selfie"
                                  className="h-8 w-8 rounded object-cover"
                                  onError={(e) => {
                                    e.target.style.display = "none";
                                  }}
                                />
                                <span className="text-[11px] font-medium text-slate-600 group-hover:text-blue-600 flex items-center gap-0.5 pr-1">
                                  <Camera size={12} />
                                  Photo
                                </span>
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400">No selfie attached</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold capitalize ring-1 ${badgeStyles[item.approval_status] || badgeStyles.closed}`}>
                            {item.approval_status === "approved" && <CheckCircle2 size={14} />}
                            {item.approval_status === "pending" && <Clock3 size={14} />}
                            {item.approval_status === "rejected" && <XCircle size={14} />}
                            {item.approval_status === "closed" && <AlertCircle size={14} />}
                            {item.approval_status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-700">
                          {item.final_decision ? (
                            <div>
                              <div className="font-medium text-slate-900">
                                {capitalize(item.final_decision)} by {item.action_by_name || "Unknown reviewer"}
                              </div>
                              <div className="mt-1 text-xs text-slate-500">{formatDateTime(item.action_at)}</div>
                            </div>
                          ) : (
                            <div>
                              <div className="font-medium text-amber-700">Awaiting decision</div>
                              <div className="mt-1 text-xs text-slate-500">This punch item will count only after approval.</div>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {item.can_approve ? (
                            <div className="flex flex-col gap-2">
                              <button
                                onClick={() => handleAction(item.approval_id, "approved")}
                                disabled={Boolean(submittingKey)}
                                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-70"
                              >
                                <CheckCircle2 size={14} />
                                {approveBusy ? "Approving..." : "Approve"}
                              </button>
                              <button
                                onClick={() => openRejectModal(item)}
                                disabled={Boolean(submittingKey)}
                                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-70"
                              >
                                <XCircle size={14} />
                                {rejectBusy ? "Rejecting..." : "Reject"}
                              </button>
                            </div>
                          ) : (
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs font-medium text-slate-500">
                              {item.approval_status === "closed" ? "Closed by another reviewer" : "No action needed"}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Server-side Pagination Controls */}
          <Pagination
            page={currentPage}
            setPage={setCurrentPage}
            pageSize={pageSize}
            changePageSize={(size) => {
              setPageSize(size);
              setCurrentPage(1);
            }}
            total={totalRecords}
            pageCount={totalPages}
            itemLabel="approval items"
          />
        </section>
      </div>

      {/* Photo Preview Modal */}
      {previewPhoto && (
        <div
          onClick={() => setPreviewPhoto(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[90vh] max-w-lg w-full overflow-hidden rounded-2xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900">{previewPhoto.label}</h3>
                <p className="text-xs text-slate-500">
                  {previewPhoto.employeeName} • {formatDateTime(previewPhoto.time)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewPhoto(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-4 bg-slate-900 flex items-center justify-center min-h-[250px]">
              <img
                src={previewPhoto.url}
                alt="Enlarged selfie"
                className="max-h-[60vh] max-w-full rounded-lg object-contain shadow-md"
              />
            </div>
            <div className="border-t border-slate-100 px-6 py-3 flex justify-end">
              <button
                type="button"
                onClick={() => setPreviewPhoto(null)}
                className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rejection Confirmation Modal */}
      {rejectModal.open && rejectModal.item && (
        <div
          onClick={() => {
            if (!submittingKey) setRejectModal({ open: false, item: null, reason: "" });
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-md w-full rounded-2xl bg-white p-6 shadow-2xl border border-slate-200"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                <AlertCircle size={24} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-slate-900">
                  Reject {rejectModal.item.review_label}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Are you sure you want to reject this exception for{" "}
                  <span className="font-semibold text-slate-800">
                    {rejectModal.item.employee_name || rejectModal.item.employee}
                  </span>
                  ?
                </p>
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-700">
                Reason / Comment (Optional)
              </label>
              <textarea
                value={rejectModal.reason}
                onChange={(e) =>
                  setRejectModal((prev) => ({ ...prev, reason: e.target.value }))
                }
                rows={3}
                placeholder="Specify reason for rejecting this exception..."
                className="mt-1.5 w-full rounded-xl border border-slate-200 p-3 text-sm text-slate-900 placeholder-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                maxLength={500}
                disabled={Boolean(submittingKey)}
              />
            </div>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                type="button"
                disabled={Boolean(submittingKey)}
                onClick={() => setRejectModal({ open: false, item: null, reason: "" })}
                className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  handleAction(
                    rejectModal.item.approval_id,
                    "rejected",
                    rejectModal.reason
                  )
                }
                disabled={Boolean(submittingKey)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-70 transition"
              >
                <XCircle size={15} />
                {submittingKey ? "Rejecting..." : "Confirm Rejection"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function HeroMetric({ icon, label, value }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 backdrop-blur-sm">
      <div className="flex items-center gap-2 text-white/80">
        {icon}
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}

function StatCard({ title, value, subtitle, icon, tone }) {
  const toneStyles = {
    slate: "bg-slate-50 text-slate-700",
    amber: "bg-amber-50 text-amber-700",
    emerald: "bg-emerald-50 text-emerald-700",
    rose: "bg-rose-50 text-rose-700",
    cyan: "bg-cyan-50 text-cyan-700",
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">{title}</p>
          <h3 className="mt-2 text-2xl font-bold text-slate-900">{value}</h3>
          <p className="mt-2 text-sm text-slate-500">{subtitle}</p>
        </div>
        <div className={`rounded-2xl p-3 ${toneStyles[tone]}`}>{icon}</div>
      </div>
    </div>
  );
}
