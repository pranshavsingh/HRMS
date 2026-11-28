import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import API, { getInMemoryToken } from "../api/axios";
import { useAuth } from "./AuthContext";
import { useRealtime } from "./RealtimeContext";
import {
  getBrowserNotificationPermission,
  getExistingPushSubscription,
  isWebPushSupported,
  subscribeBrowserPush,
  unsubscribeBrowserPush,
} from "../services/webPushService";

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
  const { user, accessToken, registerPreLogoutHook } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { subscribe } = useRealtime();

  const [recentNotifications, setRecentNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [pushSupported] = useState(() => isWebPushSupported());
  const [pushPermission, setPushPermission] = useState(() => getBrowserNotificationPermission());
  const [isPushSubscribed, setIsPushSubscribed] = useState(false);
  const [preferences, setPreferences] = useState({
    web_push_enabled: true,
    mobile_push_enabled: true,
    disabled_categories: [],
  });
  const [devices, setDevices] = useState([]);
  const activeEndpointRef = useRef(null);

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

  const fetchPreferences = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await API.get("/notifications/preferences");
      if (res.data) setPreferences(res.data);
    } catch {
      // Ignore silent preference load failure
    }
  }, [isAuthenticated]);

  const updatePreferences = useCallback(async (nextPrefs) => {
    if (!isAuthenticated) return null;
    const res = await API.put("/notifications/preferences", nextPrefs);
    if (res.data) setPreferences(res.data);
    return res.data;
  }, [isAuthenticated]);

  const fetchDevices = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await API.get("/notifications/devices");
      setDevices(Array.isArray(res.data?.devices) ? res.data.devices : []);
    } catch {
      // Ignore silent device list failure
    }
  }, [isAuthenticated]);

  const removeDevice = useCallback(async (deviceId) => {
    if (!isAuthenticated) return;
    await API.delete(`/notifications/devices/${deviceId}`);
    setDevices((prev) => prev.filter((d) => Number(d.id) !== Number(deviceId)));
  }, [isAuthenticated]);

  const enableWebPush = useCallback(async () => {
    const sub = await subscribeBrowserPush({ requestPermission: true });
    activeEndpointRef.current = sub?.endpoint || null;
    setPushPermission(getBrowserNotificationPermission());
    setIsPushSubscribed(Boolean(sub));
    await fetchDevices();
    return sub;
  }, [fetchDevices]);

  const disableWebPush = useCallback(async () => {
    const res = await unsubscribeBrowserPush();
    activeEndpointRef.current = null;
    setPushPermission(getBrowserNotificationPermission());
    setIsPushSubscribed(false);
    await fetchDevices();
    if (res && !res.serverUnregistered && res.endpoint) {
      throw new Error(res.serverError || "Browser unsubscribed, but server token deactivation failed.");
    }
  }, [fetchDevices]);

  // Pre-logout cleanup: unregister Web Push while authenticated session is still active
  useEffect(() => {
    if (!registerPreLogoutHook) return undefined;
    return registerPreLogoutHook(async () => {
      if (isWebPushSupported()) {
        await unsubscribeBrowserPush().catch(() => {});
      } else if (activeEndpointRef.current) {
        const ep = activeEndpointRef.current;
        await API.delete("/notifications/push-token", { data: { token: ep } }).catch(() => {});
      }
      activeEndpointRef.current = null;
      setIsPushSubscribed(false);
    });
  }, [registerPreLogoutHook]);

  // Sync on auth & window focus
  useEffect(() => {
    if (!isAuthenticated) {
      return undefined;
    }

    // Consume post-login redirect or cold-start notification click query params
    try {
      const pendingRedirect = sessionStorage.getItem("hrms_post_login_redirect");
      if (pendingRedirect && pendingRedirect.startsWith("/")) {
        sessionStorage.removeItem("hrms_post_login_redirect");
        navigate(pendingRedirect, { replace: true });
      } else if (location.search) {
        const params = new URLSearchParams(location.search);
        const notifClickId = params.get("notif_click");
        if (notifClickId) {
          const channel = params.get("notif_channel") || "web_push";
          const deviceTokenId = params.get("notif_device") || null;
          void API.post(`/notifications/${Number(notifClickId)}/click`, { channel, deviceTokenId }).catch(() => {});
          params.delete("notif_click");
          params.delete("notif_channel");
          params.delete("notif_device");
          const nextSearch = params.toString();
          navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ""}`, { replace: true });
        }
      }
    } catch {
      // Ignore URL/storage errors
    }

    let active = true;
    Promise.resolve().then(async () => {
      if (!active) return;
      void fetchUnreadCount();
      void fetchRecentNotifications(false);
      void fetchPreferences();
      void fetchDevices();
      if (isWebPushSupported()) {
        setPushPermission(getBrowserNotificationPermission());
        const existingSub = await getExistingPushSubscription().catch(() => null);
        if (!active) return;
        setIsPushSubscribed(Boolean(existingSub));
        if (Notification.permission === "granted" && existingSub) {
          const synced = await subscribeBrowserPush({ requestPermission: false }).catch(() => null);
          if (active && synced) {
            activeEndpointRef.current = synced.endpoint;
            setIsPushSubscribed(true);
            void fetchDevices();
          }
        }
      }
    });

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
      active = false;
      window.removeEventListener("focus", handleFocus);
      clearInterval(interval);
    };
  }, [isAuthenticated, user?.id, fetchUnreadCount, fetchRecentNotifications, fetchPreferences, fetchDevices, location.pathname, location.search, navigate]);

  // Listen for Service Worker notification click messages (both authenticated and login-page tabs)
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return undefined;
    const onSwMessage = (event) => {
      const msg = event?.data;
      if (msg?.type === "HRMS_NOTIFICATION_CLICK") {
        const safePath = msg.actionUrl && String(msg.actionUrl).startsWith("/") ? msg.actionUrl : "/notifications";
        if (!isAuthenticated) {
          try {
            sessionStorage.setItem("hrms_post_login_redirect", safePath);
          } catch {
            // Ignore storage errors
          }
          return;
        }
        if (msg.notificationId) {
          void API.post(`/notifications/${msg.notificationId}/click`, {
            channel: msg.channel || "web_push",
            deviceTokenId: msg.deviceTokenId || null,
          }).catch(() => {});
        }
        navigate(safePath);
      }
    };
    navigator.serviceWorker.addEventListener("message", onSwMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onSwMessage);
  }, [isAuthenticated, navigate]);

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
        recentNotifications: isAuthenticated ? recentNotifications : [],
        unreadCount: isAuthenticated ? unreadCount : 0,
        loading,
        pushSupported,
        pushPermission,
        isPushSubscribed,
        preferences,
        devices: isAuthenticated ? devices : [],
        fetchRecentNotifications,
        fetchUnreadCount,
        markAsRead,
        markAllAsRead,
        enableWebPush,
        disableWebPush,
        fetchPreferences,
        updatePreferences,
        fetchDevices,
        removeDevice,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
