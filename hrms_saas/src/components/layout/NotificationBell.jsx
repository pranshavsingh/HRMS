import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  Calendar,
  Clock,
  FileText,
  Megaphone,
  ShieldAlert,
  CalendarClock,
  CalendarDays,
  CheckCheck,
} from "lucide-react";
import { useNotifications } from "../../context/NotificationContext";

function getCategoryIcon(category) {
  switch (category) {
    case "LEAVE":
      return <Calendar size={16} className="text-purple-600" />;
    case "ATTENDANCE":
      return <Clock size={16} className="text-emerald-600" />;
    case "ROSTER":
      return <CalendarClock size={16} className="text-blue-600" />;
    case "DOCUMENT":
      return <FileText size={16} className="text-amber-600" />;
    case "HOLIDAY":
      return <CalendarDays size={16} className="text-indigo-600" />;
    case "ANNOUNCEMENT":
      return <Megaphone size={16} className="text-indigo-600" />;
    case "SYSTEM":
      return <ShieldAlert size={16} className="text-rose-600" />;
    default:
      return <Bell size={16} className="text-slate-600" />;
  }
}

function formatRelativeTime(value) {
  if (!value) return "";
  const ts = new Date(value).getTime();
  if (Number.isNaN(ts)) return "";
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const {
    recentNotifications,
    unreadCount,
    loading,
    fetchRecentNotifications,
    markAsRead,
    markAllAsRead,
  } = useNotifications();

  const [open, setOpen] = useState(false);
  const [filterMode, setFilterMode] = useState("all"); // "all" | "unread"
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const handleToggle = () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen) {
      void fetchRecentNotifications(filterMode === "unread");
    }
  };

  const handleFilterChange = (mode) => {
    setFilterMode(mode);
    void fetchRecentNotifications(mode === "unread");
  };

  const handleItemClick = async (item) => {
    if (!item.readAt) {
      await markAsRead(item.id).catch(() => {});
    }
    setOpen(false);
    if (item.actionUrl && item.actionUrl.startsWith("/")) {
      navigate(item.actionUrl);
    } else {
      navigate("/notifications");
    }
  };

  const badgeLabel = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={handleToggle}
        aria-label={
          unreadCount > 0
            ? `Notifications (${unreadCount} unread)`
            : "Notifications"
        }
        aria-expanded={open}
        className="relative rounded-full p-2 text-slate-700 transition hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
      >
        <Bell size={19} aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center leading-none shadow-sm">
            {badgeLabel}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
              {unreadCount > 0 && (
                <span className="text-[11px] font-semibold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                  {unreadCount} unread
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void markAllAsRead()}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800"
              >
                <CheckCheck size={14} />
                Mark all read
              </button>
            )}
          </div>

          <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex gap-2">
            <button
              type="button"
              onClick={() => handleFilterChange("all")}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                filterMode === "all"
                  ? "bg-white text-blue-700 shadow-sm border border-slate-200"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => handleFilterChange("unread")}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition ${
                filterMode === "unread"
                  ? "bg-white text-blue-700 shadow-sm border border-slate-200"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Unread
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
            {loading ? (
              <div className="p-6 text-center text-xs text-slate-500">Loading notifications...</div>
            ) : recentNotifications.length === 0 ? (
              <div className="p-8 text-center">
                <Bell size={28} className="mx-auto text-slate-300 mb-2" />
                <p className="text-sm font-medium text-slate-600">No notifications</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {filterMode === "unread" ? "You're all caught up!" : "New alerts will appear here."}
                </p>
              </div>
            ) : (
              recentNotifications.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void handleItemClick(item)}
                  className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition flex items-start gap-3 ${
                    !item.readAt ? "bg-blue-50/40" : ""
                  }`}
                >
                  <div className="mt-0.5 p-2 rounded-xl bg-slate-100 shrink-0">
                    {getCategoryIcon(item.category)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-xs truncate ${!item.readAt ? "font-bold text-slate-900" : "font-medium text-slate-700"}`}>
                        {item.title}
                      </p>
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {formatRelativeTime(item.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 line-clamp-2 mt-0.5">{item.message}</p>
                  </div>
                  {!item.readAt && (
                    <span className="mt-2 w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                  )}
                </button>
              ))
            )}
          </div>

          <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 text-center">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                navigate("/notifications");
              }}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800"
            >
              View all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
