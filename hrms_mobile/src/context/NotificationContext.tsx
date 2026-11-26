import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
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

interface NotificationContextType {
  unreadCount: number;
  fetchUnreadCount: () => Promise<void>;
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
  const { user, isAuthenticated } = useAuth();

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

  const clearAllNotifications = useCallback(async () => {
    if (!isAuthenticated) return;
    const res = await api.delete("/notifications/clear-all");
    if (res.data?.unreadCount !== undefined) {
      setUnreadCount(Number(res.data.unreadCount || 0));
    } else {
      setUnreadCount(0);
    }
  }, [isAuthenticated]);

  // Register push token safely (supports Expo dev/prod builds; gracefully skips in Expo Go without projectId)
  const registerForPushNotifications = useCallback(async () => {
    if (!isAuthenticated || !user?.id) return;
    try {
      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "Default",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
        });
      }

      if (!Device.isDevice) return;

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== "granted") return;

      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ||
        Constants?.easConfig?.projectId ||
        undefined;

      if (!projectId) {
        // Skip remote token fetch when EAS projectId is not configured (e.g. Expo Go local dev)
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
        });
      }
    } catch (err: any) {
      console.warn("[Push] Registration skipped or unavailable:", err?.message);
    }
  }, [isAuthenticated, user?.id]);

  // Unregister token on logout / account switch
  useEffect(() => {
    if (!isAuthenticated) {
      setUnreadCount(0);
      if (pushTokenRef.current) {
        const tokenToRemove = pushTokenRef.current;
        pushTokenRef.current = null;
        api.delete("/notifications/push-token", { data: { token: tokenToRemove } }).catch(() => {});
      }
      return;
    }

    void fetchUnreadCount();
    void registerForPushNotifications();
  }, [isAuthenticated, user?.id, fetchUnreadCount, registerForPushNotifications]);

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

  return (
    <NotificationContext.Provider
      value={{
        unreadCount,
        fetchUnreadCount,
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
