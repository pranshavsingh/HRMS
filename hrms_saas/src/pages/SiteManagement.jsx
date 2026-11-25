import { useState } from "react";
import {
  MapPin,
  Plus,
  Pencil,
  Trash2,
  Building2,
  Users,
  X,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import API from "../api/axios";
import { useSite } from "../context/SiteContext";
import { useAuth } from "../context/AuthContext";
import Layout from "../components/layout/Layout";

export default function SiteManagement({ embedded = false }) {
  const { sites, refreshSites, loadingSites } = useSite();
  const { role } = useAuth();
  const userRole = role || "";
  const isSuperAdmin = userRole === "superadmin";
  const canEditSites = ["admin", "superadmin"].includes(userRole);

  // Site Creation Form state
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  // Edit Modal state (superadmin)
  const [editingSite, setEditingSite] = useState(null);
  const [editForm, setEditForm] = useState({ name: "", code: "", address: "", is_active: true });
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");

  // Delete Modal state (superadmin)
  const [deletingSite, setDeletingSite] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  // Handler: Create new site
  const handleCreateSite = async (e) => {
    e.preventDefault();
    setMessage(null);
    if (!name.trim() || !code.trim()) {
      setMessage({ type: "error", text: "Site name and site code are required." });
      return;
    }

    setSubmitting(true);
    try {
      await API.post("/workforce/sites/", {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        address: address.trim() || undefined,
      });
      await refreshSites();
      setName("");
      setCode("");
      setAddress("");
      setMessage({ type: "success", text: "Work site created successfully." });
    } catch (error) {
      setMessage({
        type: "error",
        text: error.response?.data?.error || "Could not create work site.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Handler: Open edit modal
  const handleOpenEdit = (site) => {
    setEditingSite(site);
    setEditForm({
      name: site.name || "",
      code: site.code || "",
      address: site.address || "",
      is_active: Boolean(site.is_active),
    });
    setEditError("");
  };

  // Handler: Save site edits
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingSite) return;
    setEditError("");
    setSavingEdit(true);

    try {
      await API.patch(`/workforce/sites/${editingSite.id}/`, {
        name: editForm.name.trim(),
        code: editForm.code.trim().toUpperCase(),
        address: editForm.address.trim() || null,
        is_active: editForm.is_active,
      });
      await refreshSites();
      setEditingSite(null);
      setMessage({ type: "success", text: `Work site "${editForm.name}" updated successfully.` });
    } catch (error) {
      setEditError(error.response?.data?.error || "Could not update work site.");
    } finally {
      setSavingEdit(false);
    }
  };

  // Handler: Delete site permanently
  const handleConfirmDelete = async () => {
    if (!deletingSite) return;
    setDeleteError("");
    setDeleting(true);

    try {
      await API.delete(`/workforce/sites/${deletingSite.id}/`);
      await refreshSites();
      setMessage({ type: "success", text: `Work site "${deletingSite.name}" deleted successfully.` });
      setDeletingSite(null);
    } catch (error) {
      setDeleteError(error.response?.data?.error || "Could not delete work site.");
    } finally {
      setDeleting(false);
    }
  };

  // Quick fallback: Deactivate site if permanent delete is blocked by history
  const handleDeactivateInstead = async () => {
    if (!deletingSite) return;
    setDeleting(true);
    try {
      await API.patch(`/workforce/sites/${deletingSite.id}/`, { is_active: false });
      await refreshSites();
      setMessage({
        type: "success",
        text: `Work site "${deletingSite.name}" has been deactivated instead of deleted.`,
      });
      setDeletingSite(null);
    } catch (error) {
      setDeleteError(error.response?.data?.error || "Could not deactivate work site.");
    } finally {
      setDeleting(false);
    }
  };

  const content = (
      <div className="shift-sites max-w-6xl mx-auto space-y-6">
      {/* Alert banner */}
      {message && (
        <div
          role="status"
          className={`flex items-center justify-between p-4 rounded-xl border text-sm transition-all ${
            message.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-red-50 border-red-200 text-red-800"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {message.type === "success" ? (
              <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle size={18} className="text-red-600 shrink-0" />
            )}
            <span className="font-medium">{message.text}</span>
          </div>
          <button
            onClick={() => setMessage(null)}
            className="text-gray-400 hover:text-gray-600 p-1 rounded-lg"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* 1. SITE CREATION FORM */}
      {canEditSites && (
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2.5 mb-5 pb-3 border-b border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Plus size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 leading-tight">Create Work Site</h2>
            <p className="text-xs text-slate-500">
              Add a new company workplace or branch location
            </p>
          </div>
        </div>

        <form onSubmit={handleCreateSite} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Site Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Headquarters / Mumbai Branch"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-sm text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Site Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. HQ-01 / MUM-02"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-sm font-mono text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all outline-none uppercase"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Address <span className="text-slate-400 font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. 4th Floor, Tech Park, City"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-2.5 text-sm text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={submitting || !name.trim() || !code.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:ring-2 focus:ring-blue-400 disabled:opacity-50 transition-colors"
            >
              <Plus size={18} />
              {submitting ? "Creating..." : "Create Work Site"}
            </button>
          </div>
        </form>
      </section>
      )}

      {/* 2. CREATED SITES AS CARDS */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">Registered Work Sites</h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
              {sites.length}
            </span>
          </div>
          {loadingSites && (
            <span className="text-xs text-slate-400 animate-pulse">Refreshing sites...</span>
          )}
        </div>

        {sites.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-500 mx-auto flex items-center justify-center mb-3">
              <Building2 size={24} />
            </div>
            <h3 className="text-base font-semibold text-slate-800">No work sites registered</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Use the form above to add your first work site location.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sites.map((site) => (
              <div
                key={site.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow"
              >
                <div>
                  {/* Card Header: Icon, Name, Code, and Status */}
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          site.is_active
                            ? "bg-blue-50 text-blue-600"
                            : "bg-slate-100 text-slate-400"
                        }`}
                      >
                        <Building2 size={20} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-slate-900 text-base leading-snug truncate">
                          {site.name}
                        </h3>
                        <span className="inline-block mt-0.5 font-mono text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200/80">
                          {site.code}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 ${
                        site.is_active
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-slate-100 text-slate-600 border border-slate-200"
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          site.is_active ? "bg-emerald-500" : "bg-slate-400"
                        }`}
                      />
                      {site.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>

                  {/* Card Body: Address & Assigned Employees */}
                  <div className="space-y-2 py-2 border-t border-slate-100 text-xs">
                    <div className="flex items-start gap-2 text-slate-600">
                      <MapPin size={15} className="text-slate-400 shrink-0 mt-0.5" />
                      <span className={site.address ? "text-slate-700" : "text-slate-400 italic"}>
                        {site.address || "No address specified"}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-slate-500">
                      <Users size={15} className="text-slate-400 shrink-0" />
                      <span>
                        <strong className="text-slate-800 font-semibold">
                          {site.assigned_employee_count ?? 0}
                        </strong>{" "}
                        employee{(site.assigned_employee_count ?? 0) === 1 ? "" : "s"} assigned
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Footer: Site Actions (Edit: Admin & Superadmin, Delete: Superadmin) */}
                {(canEditSites || isSuperAdmin) && (
                  <div className="flex items-center justify-end gap-2 pt-3 mt-3 border-t border-slate-100">
                    {canEditSites && (
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(site)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 text-xs font-semibold hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-colors"
                      >
                        <Pencil size={13} />
                        Edit
                      </button>
                    )}
                    {isSuperAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          setDeletingSite(site);
                          setDeleteError("");
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 bg-red-50/60 text-red-700 text-xs font-semibold hover:bg-red-100/80 transition-colors"
                      >
                        <Trash2 size={13} />
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* EDIT MODAL (SUPERADMIN ONLY) */}
      {editingSite && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Pencil size={18} className="text-blue-600" />
                <h3 className="text-base font-bold text-slate-900">Edit Work Site</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingSite(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {editError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{editError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Site Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Site Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editForm.code}
                  onChange={(e) => setEditForm({ ...editForm, code: e.target.value.toUpperCase() })}
                  className="w-full rounded-xl border border-slate-200 p-2.5 font-mono text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none uppercase"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Address <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  placeholder="Optional workplace address"
                  className="w-full rounded-xl border border-slate-200 p-2.5 text-slate-900 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none"
                />
              </div>

              <div className="flex items-center gap-2.5 pt-1">
                <input
                  type="checkbox"
                  id="siteActiveCheck"
                  checked={editForm.is_active}
                  onChange={(e) => setEditForm({ ...editForm, is_active: e.target.checked })}
                  className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                />
                <label htmlFor="siteActiveCheck" className="text-slate-700 font-medium cursor-pointer">
                  Work site is Active
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingSite(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit || !editForm.name.trim() || !editForm.code.trim()}
                  className="px-5 py-2 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingEdit ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL (SUPERADMIN ONLY) */}
      {deletingSite && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Delete Work Site</h3>
                <p className="text-xs text-slate-500">
                  Site: <strong className="text-slate-800">{deletingSite.name}</strong> ({deletingSite.code})
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to delete this work site? If any historical attendance, leave, or
              roster records reference this site, permanent deletion will be prevented.
            </p>

            {deleteError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 space-y-2">
                <div className="flex items-start gap-2">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{deleteError}</span>
                </div>
                {deleteError.includes("deactivate") && (
                  <button
                    type="button"
                    onClick={handleDeactivateInstead}
                    disabled={deleting}
                    className="w-full mt-2 py-1.5 px-3 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold text-xs transition"
                  >
                    Deactivate Site Instead
                  </button>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeletingSite(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? "Deleting..." : "Permanently Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
  );

  return embedded ? content : <Layout>{content}</Layout>;
}
