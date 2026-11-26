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
  ShieldAlert,
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
  const { unreadCount, markAsRead, markAllAsRead, fetchUnreadCount } = useNotifications();
  const { subscribe } = useRealtime();

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
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={async () => {
                await markAllAsRead(category !== "ALL" ? category : null);
                void loadNotifications();
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition self-start sm:self-auto"
            >
              <CheckCheck size={16} />
              Mark All as Read
            </button>
          )}
        </div>

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
