import { createContext, useCallback, useContext, useEffect, useState } from "react";
import API, { getInMemoryToken } from "../api/axios";
import { useAuth } from "./AuthContext";
import { useRealtime } from "./RealtimeContext";

const NotificationContext = createContext(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return ctx;
}

export function NotificationProvider({ children }) {
  const { user, accessToken } = useAuth();
  const { subscribe } = useRealtime();

  const [recentNotifications, setRecentNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const isAuthenticated = Boolean(user && (accessToken || getInMemoryToken()));

  const fetchUnreadCount = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await API.get("/notifications/unread-count");
      setUnreadCount(Number(res.data?.unreadCount || 0));
    } catch {
      // Ignore silent background sync error
    }
  }, [isAuthenticated]);

  const fetchRecentNotifications = useCallback(async (unreadOnly = false) => {
    if (!isAuthenticated) return;
    setLoading(true);
    try {
      const res = await API.get("/notifications", {
        params: { page: 1, limit: 10, ...(unreadOnly ? { unreadOnly: true } : {}) },
      });
      const records = Array.isArray(res.data?.records)
        ? res.data.records
        : Array.isArray(res.data?.data)
        ? res.data.data
        : [];
      setRecentNotifications(records);
      if (res.data?.unreadCount !== undefined) {
        setUnreadCount(Number(res.data.unreadCount || 0));
      }
    } catch {
      // Ignore silent dropdown error
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const markAsRead = useCallback(async (id) => {
    if (!isAuthenticated) return;
    try {
      const res = await API.patch(`/notifications/${id}/read`);
      const updated = res.data?.notification;
      if (res.data?.unreadCount !== undefined) {
        setUnreadCount(Number(res.data.unreadCount || 0));
      }
      setRecentNotifications((prev) =>
        prev.map((n) => (Number(n.id) === Number(id) ? { ...n, readAt: updated?.readAt || new Date().toISOString() } : n))
      );
      return res.data;
    } catch (err) {
      console.error("Failed to mark notification as read:", err);
      throw err;
    }
  }, [isAuthenticated]);

  const markAllAsRead = useCallback(async (category = null) => {
    if (!isAuthenticated) return;
    try {
      const res = await API.patch("/notifications/read-all", category ? { category } : {});
      if (res.data?.unreadCount !== undefined) {
        setUnreadCount(Number(res.data.unreadCount || 0));
      } else {
        setUnreadCount(0);
      }
      const nowIso = new Date().toISOString();
      setRecentNotifications((prev) =>
        prev.map((n) => (!category || n.category === category ? { ...n, readAt: n.readAt || nowIso } : n))
      );
      return res.data;
    } catch (err) {
      console.error("Failed to mark all notifications as read:", err);
      throw err;
    }
  }, [isAuthenticated]);

  // Reset state cleanly on logout or account switch, and sync on window focus
  useEffect(() => {
    if (!isAuthenticated) {
      setRecentNotifications([]);
      setUnreadCount(0);
      return;
    }
    void fetchUnreadCount();
    void fetchRecentNotifications(false);

    const handleFocus = () => {
      void fetchUnreadCount();
    };
    window.addEventListener("focus", handleFocus);
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        void fetchUnreadCount();
      }
    }, 30000);

    return () => {
      window.removeEventListener("focus", handleFocus);
      clearInterval(interval);
    };
  }, [isAuthenticated, user?.id, fetchUnreadCount, fetchRecentNotifications]);

  // Real-time Socket.IO synchronization (web <-> mobile & multi-tab)
  useEffect(() => {
    if (!isAuthenticated) return;

    const unsubNew = subscribe("notification:new", (payload) => {
      const notif = payload?.notification;
      if (payload?.unreadCount !== undefined) {
        setUnreadCount(Number(payload.unreadCount || 0));
      } else {
        setUnreadCount((c) => c + 1);
      }
      if (notif) {
        setRecentNotifications((prev) => {
          if (prev.some((item) => Number(item.id) === Number(notif.id))) return prev;
          return [notif, ...prev].slice(0, 10);
        });
      }
    });

    const unsubRead = subscribe("notification:read", (payload) => {
      if (payload?.unreadCount !== undefined) {
        setUnreadCount(Number(payload.unreadCount || 0));
      }
      if (payload?.id) {
        setRecentNotifications((prev) =>
          prev.map((n) =>
            Number(n.id) === Number(payload.id) ? { ...n, readAt: payload.readAt || new Date().toISOString() } : n
          )
        );
      }
    });

    const unsubReadAll = subscribe("notification:read-all", (payload) => {
      if (payload?.unreadCount !== undefined) {
        setUnreadCount(Number(payload.unreadCount || 0));
      } else {
        setUnreadCount(0);
      }
      const nowIso = new Date().toISOString();
      setRecentNotifications((prev) =>
        prev.map((n) => (!payload?.category || n.category === payload.category ? { ...n, readAt: n.readAt || nowIso } : n))
      );
    });

    const unsubUnread = subscribe("notification:unread-count", (payload) => {
      if (payload?.unreadCount !== undefined) {
        setUnreadCount(Number(payload.unreadCount || 0));
      }
    });

    const unsubReconnect = subscribe("realtime:connected", () => {
      void fetchUnreadCount();
    });

    return () => {
      unsubNew();
      unsubRead();
      unsubReadAll();
      unsubUnread();
      unsubReconnect();
    };
  }, [isAuthenticated, subscribe, fetchUnreadCount]);

  return (
    <NotificationContext.Provider
      value={{
        recentNotifications,
        unreadCount,
        loading,
        fetchRecentNotifications,
        fetchUnreadCount,
        markAsRead,
        markAllAsRead,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
