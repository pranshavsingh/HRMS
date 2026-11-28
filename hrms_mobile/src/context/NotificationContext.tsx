import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { AndroidImportance } from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import api from "../services/api";
import { useAuth } from "./AuthContext";
import { useRealtime } from "./RealtimeContext";

// Avoid duplicate foreground alerts when Socket.IO is already updating the in-app UI
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: false,
    shouldPlaySound: false,
    shouldSetBadge: true,
    shouldShowBanner: false,
    shouldShowList: false,
  }),
});

export interface AppNotification {
  id: number;
  tenantId: number;
  recipientId: number;
  actorId: number | null;
  type: string;
  category: string;
  title: string;
  message: string;
  data: any;
  actionUrl: string | null;
  priority: string;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPreferences {
  web_push_enabled: boolean;
  mobile_push_enabled: boolean;
  disabled_categories: string[];
}

export interface NotificationDevice {
  id: number;
  platform: string;
  provider: string;
  device_id: string | null;
  device_name: string | null;
  is_active: number | boolean;
  last_used_at: string | null;
  created_at: string | null;
}

interface NotificationContextType {
  unreadCount: number;
  preferences: NotificationPreferences | null;
  devices: NotificationDevice[];
  pushPermission: string;
  pushError: string | null;
  fetchUnreadCount: () => Promise<void>;
  fetchPreferences: () => Promise<NotificationPreferences | null>;
  updatePreferences: (patch: Partial<NotificationPreferences>) => Promise<NotificationPreferences | null>;
  fetchDevices: () => Promise<NotificationDevice[]>;
  removeDevice: (deviceId: number) => Promise<void>;
  refreshPushStatus: () => Promise<void>;
  requestMobilePushPermission: () => Promise<boolean>;
  unregisterMobilePush: () => Promise<void>;
  markAsRead: (id: number) => Promise<void>;
  markAllAsRead: (category?: string | null) => Promise<void>;
  deleteNotification: (id: number) => Promise<void>;
  clearAllNotifications: () => Promise<void>;
  resolveMobileRoute: (actionUrl: string | null | undefined, role?: string) => string;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return ctx;
};

export function resolveMobileRoute(actionUrl: string | null | undefined, role = "employee"): string {
  const clean = String(actionUrl || "").split("?")[0].trim();
  const isWorkspaceRole = ["manager", "hr", "admin", "superadmin"].includes(role.toLowerCase());

  switch (clean) {
    case "/leave":
      return "/(tabs)/leave";
    case "/leave-approvals":
    case "/attendance-approvals":
      return isWorkspaceRole ? "/(tabs)/approvals" : "/(tabs)/dashboard";
    case "/history":
    case "/monthly-register":
      return "/(tabs)/history";
    case "/shifts":
    case "/roster":
      return "/(tabs)/shifts";
    case "/documents":
      return "/my-documents";
    case "/employee-documents":
      return ["hr", "admin", "superadmin"].includes(role.toLowerCase())
        ? "/(tabs)/employee-documents"
        : "/(tabs)/dashboard";
    case "/employees":
      return ["hr", "admin", "superadmin"].includes(role.toLowerCase())
        ? "/(tabs)/employees"
        : "/(tabs)/dashboard";
    case "/holidays":
      return "/holidays";
    case "/profile":
      return "/profile";
    case "/notifications":
      return "/notifications";
    default:
      return "/(tabs)/dashboard";
  }
}

export const NotificationProvider = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter();
  const { user, isAuthenticated, registerPreLogoutHook } = useAuth();

  const [unreadCount, setUnreadCount] = useState(0);
  const pushTokenRef = useRef<string | null>(null);

  const fetchUnreadCount = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await api.get("/notifications/unread-count");
      setUnreadCount(Number(res.data?.unreadCount || 0));
    } catch {
      // Silent fallback
    }
  }, [isAuthenticated]);

  const markAsRead = useCallback(async (id: number) => {
    if (!isAuthenticated) return;
    const res = await api.patch(`/notifications/${id}/read`);
    if (res.data?.unreadCount !== undefined) {
      setUnreadCount(Number(res.data.unreadCount || 0));
    }
  }, [isAuthenticated]);

  const markAllAsRead = useCallback(async (category: string | null = null) => {
    if (!isAuthenticated) return;
    const res = await api.patch("/notifications/read-all", category ? { category } : {});
    if (res.data?.unreadCount !== undefined) {
      setUnreadCount(Number(res.data.unreadCount || 0));
    } else {
      setUnreadCount(0);
    }
  }, [isAuthenticated]);

  const deleteNotification = useCallback(async (id: number) => {
    if (!isAuthenticated) return;
    const res = await api.delete(`/notifications/${id}`);
    if (res.data?.unreadCount !== undefined) {
      setUnreadCount(Number(res.data.unreadCount || 0));
    }
  }, [isAuthenticated]);

  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null);
  const [devices, setDevices] = useState<NotificationDevice[]>([]);
  const [pushPermission, setPushPermission] = useState<string>("undetermined");
  const [pushError, setPushError] = useState<string | null>(null);

  const clearAllNotifications = useCallback(async () => {
    if (!isAuthenticated) return;
    const res = await api.delete("/notifications/clear-all");
    if (res.data?.unreadCount !== undefined) {
      setUnreadCount(Number(res.data.unreadCount || 0));
    } else {
      setUnreadCount(0);
    }
  }, [isAuthenticated]);

  const fetchPreferences = useCallback(async (): Promise<NotificationPreferences | null> => {
    if (!isAuthenticated) return null;
    try {
      const res = await api.get("/notifications/preferences");
      const prefs = res.data?.preferences || res.data || null;
      setPreferences(prefs);
      return prefs;
    } catch {
      return null;
    }
  }, [isAuthenticated]);

  const updatePreferences = useCallback(
    async (patch: Partial<NotificationPreferences>): Promise<NotificationPreferences | null> => {
      if (!isAuthenticated) return null;
      const res = await api.put("/notifications/preferences", patch);
      const prefs = res.data?.preferences || res.data || null;
      setPreferences(prefs);
      return prefs;
    },
    [isAuthenticated]
  );

  const fetchDevices = useCallback(async (): Promise<NotificationDevice[]> => {
    if (!isAuthenticated) return [];
    try {
      const res = await api.get("/notifications/devices");
      const rows = Array.isArray(res.data?.devices) ? res.data.devices : [];
      setDevices(rows);
      return rows;
    } catch {
      return [];
    }
  }, [isAuthenticated]);

  const removeDevice = useCallback(
    async (deviceId: number) => {
      if (!isAuthenticated) return;
      await api.delete(`/notifications/devices/${deviceId}`);
      setDevices((prev) => prev.filter((d) => d.id !== deviceId));
    },
    [isAuthenticated]
  );

  // Register push token ONLY when permission is already granted (no unsolicited OS prompt on login)
  const registerForPushNotifications = useCallback(async ({ allowPrompt = false } = {}) => {
    if (!isAuthenticated || !user?.id) return;
    setPushError(null);
    try {
      if (Platform.OS === "android") {
        try {
          await Notifications.setNotificationChannelAsync("default", {
            name: "Default",
            importance: AndroidImportance.MAX,
          });
        } catch (channelErr: any) {
          console.warn("[Push] Android notification channel setup skipped:", channelErr?.message);
        }
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== "granted" && allowPrompt) {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      setPushPermission(finalStatus);
      if (finalStatus !== "granted") {
        setPushError(
          finalStatus === "denied"
            ? "OS notification permission is denied. Enable it in device settings."
            : "OS notification permission has not been granted yet."
        );
        return;
      }

      if (!Device.isDevice) {
        setPushError("Push tokens require a physical device (emulator/simulator unsupported).");
        return;
      }

      if (Constants?.appOwnership === "expo" || (Constants as any)?.executionEnvironment === "storeClient") {
        setPushError("Expo Go does not support remote push notifications on SDK 58. Use an EAS development or production build.");
        return;
      }

      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ||
        Constants?.easConfig?.projectId ||
        undefined;

      if (!projectId) {
        setPushError("EAS projectId is missing in app.json.");
        return;
      }

      const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
      const token = tokenResponse?.data;
      if (token) {
        pushTokenRef.current = token;
        await api.post("/notifications/push-token", {
          token,
          platform: Platform.OS,
          provider: "expo",
          deviceId: Device.osInternalBuildId || Device.modelId || undefined,
          deviceName: Device.modelName || `${Platform.OS} device`,
        });
        setPushError(null);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || err?.message || "Failed to register mobile push token.";
      setPushError(msg);
      console.warn("[Push] Registration skipped or unavailable:", msg);
    }
  }, [isAuthenticated, user?.id]);

  const unregisterMobilePush = useCallback(async () => {
    const tokenToRemove = pushTokenRef.current;
    pushTokenRef.current = null;
    if (tokenToRemove) {
      await api.delete("/notifications/push-token", { data: { token: tokenToRemove } }).catch(() => {});
    }
  }, []);

  // Pre-logout cleanup: deactivate authenticated device registration before clearing credentials
  useEffect(() => {
    if (!registerPreLogoutHook) return undefined;
    return registerPreLogoutHook(async () => {
      await unregisterMobilePush();
      setPreferences(null);
      setDevices([]);
    });
  }, [registerPreLogoutHook, unregisterMobilePush]);

  // Sync unread count, preferences, and silently register token only if already granted & enabled
  useEffect(() => {
    if (!isAuthenticated) {
      return undefined;
    }

    let active = true;
    Promise.resolve().then(async () => {
      if (!active) return;
      void fetchUnreadCount();
      const prefs = await fetchPreferences();
      if (!active) return;
      const perms = await Notifications.getPermissionsAsync().catch(() => ({ status: "undetermined" }));
      if (!active) return;
      setPushPermission(perms.status);
      if (perms.status === "granted" && prefs?.mobile_push_enabled !== false) {
        void registerForPushNotifications({ allowPrompt: false });
      }
    });
    return () => {
      active = false;
    };
  }, [isAuthenticated, user?.id, fetchUnreadCount, fetchPreferences, registerForPushNotifications]);

  const effectiveUnreadCount = isAuthenticated ? unreadCount : 0;

  // Real-time Socket.IO sync
  useRealtime(
    "notification:new",
    useCallback((payload: any) => {
      if (!isAuthenticated) return;
      if (payload?.unreadCount !== undefined) {
        setUnreadCount(Number(payload.unreadCount || 0));
      } else {
        setUnreadCount((c) => c + 1);
      }
    }, [isAuthenticated])
  );

  useRealtime(
    "notification:read",
    useCallback((payload: any) => {
      if (!isAuthenticated) return;
      if (payload?.unreadCount !== undefined) {
        setUnreadCount(Number(payload.unreadCount || 0));
      }
    }, [isAuthenticated])
  );

  useRealtime(
    "notification:read-all",
    useCallback((payload: any) => {
      if (!isAuthenticated) return;
      if (payload?.unreadCount !== undefined) {
        setUnreadCount(Number(payload.unreadCount || 0));
      } else {
        setUnreadCount(0);
      }
    }, [isAuthenticated])
  );

  useRealtime(
    "notification:unread-count",
    useCallback((payload: any) => {
      if (!isAuthenticated) return;
      if (payload?.unreadCount !== undefined) {
        setUnreadCount(Number(payload.unreadCount || 0));
      }
    }, [isAuthenticated])
  );

  useRealtime(
    "realtime:connected",
    useCallback(() => {
      if (isAuthenticated) {
        void fetchUnreadCount();
      }
    }, [isAuthenticated, fetchUnreadCount])
  );

  // Handle notification tap navigation (warm + cold start)
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleResponse = (response: Notifications.NotificationResponse | null) => {
      if (!response) return;
      const data: any = response.notification?.request?.content?.data || {};
      if (data.notificationId) {
        void api
          .post(`/notifications/${Number(data.notificationId)}/click`, {
            channel: data.channel || "mobile_push",
            deviceTokenId: data.deviceTokenId || null,
          })
          .catch(() => {});
        void markAsRead(Number(data.notificationId)).catch(() => {});
      }
      const target = resolveMobileRoute(data.actionUrl, user?.role);
      router.push(target as any);
    };

    Notifications.getLastNotificationResponseAsync()
      .then((last) => {
        if (last) handleResponse(last);
      })
      .catch(() => {});

    const sub = Notifications.addNotificationResponseReceivedListener(handleResponse);
    return () => sub.remove();
  }, [isAuthenticated, user?.role, markAsRead, router]);

  const refreshPushStatus = useCallback(async () => {
    try {
      const perms = await Notifications.getPermissionsAsync();
      setPushPermission(perms.status);
    } catch {
      // Ignore permission check failure
    }
  }, []);

  const requestMobilePushPermission = useCallback(async (): Promise<boolean> => {
    if (!isAuthenticated) return false;
    try {
      const perms = await Notifications.getPermissionsAsync();
      let status = perms.status;
      if (status !== "granted") {
        const req = await Notifications.requestPermissionsAsync();
        status = req.status;
      }
      setPushPermission(status);
      if (status === "granted") {
        await registerForPushNotifications({ allowPrompt: true });
        await fetchDevices();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [isAuthenticated, registerForPushNotifications, fetchDevices]);

  return (
    <NotificationContext.Provider
      value={{
        unreadCount: effectiveUnreadCount,
        preferences: isAuthenticated ? preferences : null,
        devices: isAuthenticated ? devices : [],
        pushPermission,
        pushError,
        fetchUnreadCount,
        fetchPreferences,
        updatePreferences,
        fetchDevices,
        removeDevice,
        refreshPushStatus,
        requestMobilePushPermission,
        unregisterMobilePush,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        clearAllNotifications,
        resolveMobileRoute,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};
