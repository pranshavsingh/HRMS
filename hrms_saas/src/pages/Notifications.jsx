import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  Calendar,
  CalendarClock,
  CalendarDays,
  Check,
  CheckCheck,
  Clock,
  FileText,
  Megaphone,
  Settings,
  ShieldAlert,
  Smartphone,
  Trash2,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import Pagination from "../components/common/Pagination";
import API from "../api/axios";
import { useNotifications } from "../context/NotificationContext";
import { useRealtime } from "../context/RealtimeContext";

const CATEGORIES = ["ALL", "LEAVE", "ATTENDANCE", "ROSTER", "DOCUMENT", "HOLIDAY", "SYSTEM"];

function getCategoryIcon(category) {
  switch (category) {
    case "LEAVE":
      return <Calendar size={18} className="text-purple-600" />;
    case "ATTENDANCE":
      return <Clock size={18} className="text-emerald-600" />;
    case "ROSTER":
      return <CalendarClock size={18} className="text-blue-600" />;
    case "DOCUMENT":
      return <FileText size={18} className="text-amber-600" />;
    case "HOLIDAY":
      return <CalendarDays size={18} className="text-indigo-600" />;
    case "ANNOUNCEMENT":
      return <Megaphone size={18} className="text-indigo-600" />;
    case "SYSTEM":
      return <ShieldAlert size={18} className="text-rose-600" />;
    default:
      return <Bell size={18} className="text-slate-600" />;
  }
}

export default function Notifications() {
  const navigate = useNavigate();
  const {
    unreadCount,
    markAsRead,
    markAllAsRead,
    fetchUnreadCount,
    pushSupported,
    pushPermission,
    isPushSubscribed,
    preferences,
    devices,
    enableWebPush,
    disableWebPush,
    updatePreferences,
    removeDevice,
  } = useNotifications();
  const { subscribe } = useRealtime();

  const [showSettings, setShowSettings] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState("");

  const [records, setRecords] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [category, setCategory] = useState("ALL");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await API.get("/notifications", {
        params: {
          page,
          limit: 15,
          ...(category !== "ALL" ? { category } : {}),
          ...(unreadOnly ? { unreadOnly: true } : {}),
        },
      });
      const list = Array.isArray(res.data?.records) ? res.data.records : [];
      setRecords(list);
      const pag = res.data?.pagination || {};
      setTotalPages(Number(pag.totalPages || 1));
      setTotalItems(Number(pag.total || list.length));
    } catch (err) {
      setError(err?.response?.data?.error || "Unable to load notifications.");
    } finally {
      setLoading(false);
    }
  }, [page, category, unreadOnly]);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    const unsub1 = subscribe("notification:new", () => void loadNotifications());
    const unsub2 = subscribe("notification:read", () => void loadNotifications());
    const unsub3 = subscribe("notification:read-all", () => void loadNotifications());
    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, [subscribe, loadNotifications]);

  const handleMarkRead = async (item) => {
    if (!item.readAt) {
      await markAsRead(item.id).catch(() => {});
      void loadNotifications();
    }
  };

  const handleDelete = async (id) => {
    try {
      await API.delete(`/notifications/${id}`);
      void fetchUnreadCount();
      void loadNotifications();
    } catch (err) {
      console.error("Delete notification error:", err);
    }
  };

  const handleOpen = async (item) => {
    if (!item.readAt) {
      await markAsRead(item.id).catch(() => {});
    }
    if (item.actionUrl && item.actionUrl.startsWith("/")) {
      navigate(item.actionUrl);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Notification Center</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Stay updated on leave requests, attendance approvals, rosters, and documents.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setShowSettings((prev) => !prev)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 transition"
            >
              <Settings size={16} />
              Push & Devices
            </button>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={async () => {
                  await markAllAsRead(category !== "ALL" ? category : null);
                  void loadNotifications();
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition"
              >
                <CheckCheck size={16} />
                Mark All as Read
              </button>
            )}
          </div>
        </div>

        {showSettings && (
          <section className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Push Notification Preferences & Devices</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Browser permission: <span className="font-semibold capitalize">{pushPermission}</span> ·{" "}
                  Status: <span className="font-semibold">{isPushSubscribed ? "Subscribed" : "Not subscribed"}</span>
                </p>
              </div>
              {pushSupported && (
                <button
                  type="button"
                  disabled={pushBusy}
                  onClick={async () => {
                    setPushBusy(true);
                    setPushMsg("");
                    try {
                      if (isPushSubscribed) {
                        await disableWebPush();
                        setPushMsg("Browser push disabled for this device.");
                      } else {
                        await enableWebPush();
                        setPushMsg("Browser push enabled for this device.");
                      }
                    } catch (err) {
                      setPushMsg(err?.message || "Unable to update browser push.");
                    } finally {
                      setPushBusy(false);
                    }
                  }}
                  className={`px-4 py-2 rounded-xl text-sm font-semibold text-white transition disabled:opacity-60 ${
                    isPushSubscribed ? "bg-slate-700 hover:bg-slate-800" : "bg-emerald-600 hover:bg-emerald-700"
                  }`}
                >
                  {pushBusy ? "Updating…" : isPushSubscribed ? "Disable Browser Push" : "Enable Browser Push"}
                </button>
              )}
            </div>

            {pushMsg && <p className="text-xs font-medium text-blue-700 bg-blue-50 px-3 py-2 rounded-lg">{pushMsg}</p>}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-slate-800">Channel & Category Preferences</h3>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={Boolean(preferences.web_push_enabled)}
                      onChange={(e) => void updatePreferences({ ...preferences, web_push_enabled: e.target.checked })}
                    />
                    Web Push
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={Boolean(preferences.mobile_push_enabled)}
                      onChange={(e) => void updatePreferences({ ...preferences, mobile_push_enabled: e.target.checked })}
                    />
                    Mobile Push
                  </label>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {CATEGORIES.filter((c) => c !== "ALL").map((cat) => {
                    const disabled = (preferences.disabled_categories || []).includes(cat);
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          const current = preferences.disabled_categories || [];
                          const next = disabled ? current.filter((c) => c !== cat) : [...current, cat];
                          void updatePreferences({ ...preferences, disabled_categories: next });
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${
                          disabled
                            ? "bg-slate-100 text-slate-400 border-slate-200 line-through"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200"
                        }`}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 p-4 space-y-2">
                <h3 className="text-sm font-semibold text-slate-800">Registered Devices ({devices.length})</h3>
                {devices.length === 0 ? (
                  <p className="text-xs text-slate-500">No active push devices registered.</p>
                ) : (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {devices.map((dev) => (
                      <div key={dev.id} className="flex items-center justify-between gap-2 text-xs bg-slate-50 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Smartphone size={14} className="text-slate-500 shrink-0" />
                          <div className="min-w-0">
                            <div className="font-medium text-slate-800 truncate">
                              {dev.device_name || `${dev.platform} (${dev.provider})`}
                            </div>
                            <div className="text-[11px] text-slate-500">
                              {dev.platform} · {dev.provider}
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => void removeDevice(dev.id)}
                          className="text-rose-600 hover:underline shrink-0"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => {
                  setCategory(cat);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                  category === cat
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => {
                setUnreadOnly(e.target.checked);
                setPage(1);
              }}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Unread only
          </label>
        </div>

        {error ? (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 p-6 rounded-2xl text-center">
            <p className="font-semibold">{error}</p>
            <button
              type="button"
              onClick={() => void loadNotifications()}
              className="mt-3 px-4 py-2 bg-rose-600 text-white rounded-xl text-sm font-medium hover:bg-rose-700"
            >
              Retry
            </button>
          </div>
        ) : loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-4 animate-pulse">
            {[1, 2, 3, 4].map((k) => (
              <div key={k} className="h-16 bg-slate-100 rounded-xl" />
            ))}
          </div>
        ) : records.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <Bell size={40} className="mx-auto text-slate-300 mb-3" />
            <h3 className="text-base font-semibold text-slate-800">No notifications found</h3>
            <p className="text-sm text-slate-500 mt-1">
              {unreadOnly ? "You have no unread notifications matching this filter." : "No notifications in this category yet."}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
            {records.map((item) => (
              <div
                key={item.id}
                className={`p-4 sm:p-5 flex items-start justify-between gap-4 transition hover:bg-slate-50 ${
                  !item.readAt ? "bg-blue-50/40" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => void handleOpen(item)}
                  className="flex items-start gap-3.5 text-left flex-1 min-w-0"
                >
                  <div className="p-2.5 rounded-xl bg-slate-100 shrink-0">
                    {getCategoryIcon(item.category)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-sm ${!item.readAt ? "font-bold text-slate-900" : "font-semibold text-slate-700"}`}>
                        {item.title}
                      </span>
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {item.category}
                      </span>
                      {!item.readAt && (
                        <span className="w-2 h-2 rounded-full bg-blue-600" />
                      )}
                    </div>
                    <p className="text-sm text-slate-600 mt-1">{item.message}</p>
                    <p className="text-xs text-slate-400 mt-1.5">
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </div>
                </button>

                <div className="flex items-center gap-1.5 shrink-0">
                  {!item.readAt && (
                    <button
                      type="button"
                      onClick={() => void handleMarkRead(item)}
                      title="Mark as read"
                      className="p-2 rounded-lg text-blue-600 hover:bg-blue-50 transition"
                    >
                      <Check size={16} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void handleDelete(item.id)}
                    title="Delete notification"
                    className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={totalItems}
          onPageChange={setPage}
        />
      </div>
    </Layout>
  );
}
