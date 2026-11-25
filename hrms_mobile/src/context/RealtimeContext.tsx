import React, { createContext, useContext, useEffect, useRef, ReactNode, useCallback } from "react";
import { AppState, AppStateStatus } from "react-native";
import * as SecureStore from "expo-secure-store";
import axios from "axios";
import { useAuth } from "./AuthContext";
import api, { setAuthToken } from "../services/api";
import { io, Socket } from "socket.io-client";

interface RealtimeContextType {
  connect: () => void;
  disconnect: () => void;
  subscribe: (event: string, callback: (data: any) => void) => () => void;
}

const RealtimeContext = createContext<RealtimeContextType | null>(null);

export const RealtimeProvider = ({ children }: { children: ReactNode }) => {
  const { token } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const listenersRef = useRef<{ [event: string]: ((data: any) => void)[] }>({});
  const processedEventsRef = useRef<Set<string>>(new Set());
  const lastEventTimestampRef = useRef<string | null>(null);
  const appStateRef = useRef<AppStateStatus>((AppState.currentState as AppStateStatus) || "active");

  const triggerEvent = useCallback((event: string, dataValue: any) => {
    let data: any = null;
    try {
      data = typeof dataValue === "string" ? (dataValue ? JSON.parse(dataValue) : null) : dataValue;
    } catch {
      data = dataValue;
    }

    const callbacks = listenersRef.current[event] || [];
    callbacks.forEach((cb) => {
      try {
        cb(data);
      } catch (err) {
        console.error(`[Realtime] Error running callback for event ${event}:`, err);
      }
    });
  }, []);

  // Missed-event reconciliation via authoritative sync endpoint
  const syncMissedEvents = useCallback(async () => {
    if (!token) return;
    try {
      const response = await api.get("/auth/realtime/sync/", {
        params: lastEventTimestampRef.current ? { since: lastEventTimestampRef.current } : {},
      });
      const data = response.data?.data || response.data || {};
      if (data.timestamp) {
        lastEventTimestampRef.current = data.timestamp;
      }
      if (Array.isArray(data.events) && data.events.length > 0) {
        data.events.forEach((evt: any) => {
          if (evt.eventId && !processedEventsRef.current.has(evt.eventId)) {
            processedEventsRef.current.add(evt.eventId);
            const payload = evt.payload !== undefined ? evt.payload : evt;
            triggerEvent(evt.eventType, payload);
          }
        });
      }
    } catch (err: any) {
      console.warn("[Realtime] Sync reconciliation note:", err?.message);
    }
  }, [token, triggerEvent]);

  const connect = useCallback(() => {
    if (!token) return;

    if (!socketRef.current) {
      const apiBase = api.defaults.baseURL || "http://localhost:8000/api";
      let origin = "http://localhost:8000";
      try {
        origin = new URL(apiBase).origin;
      } catch {}

      const socket = io(origin, {
        path: "/socket.io",
        auth: { token },
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
        randomizationFactor: 0.5,
      });

      socket.on("connect", () => {
        console.log("[Realtime] Mobile Socket.IO connected:", socket.id);
        triggerEvent("realtime:connected", {});
        syncMissedEvents();
      });

      socket.onAny((event, data) => {
        // Event deduplication via eventId
        const eventId = data?.eventId;
        if (eventId) {
          if (processedEventsRef.current.has(eventId)) return;
          processedEventsRef.current.add(eventId);
          if (processedEventsRef.current.size > 200) {
            const first = processedEventsRef.current.values().next().value;
            if (first) processedEventsRef.current.delete(first);
          }
        }
        if (data?.timestamp) {
          lastEventTimestampRef.current = data.timestamp;
        }

        const payload = data?.payload !== undefined ? data.payload : data;
        triggerEvent(String(event), payload);
      });

      socket.on("session:revoked", (data) => {
        console.warn("[Realtime] Mobile session revoked by server:", data);
        triggerEvent("session:revoked", data);
      });

      socket.on("connect_error", async (error) => {
        console.warn("[Realtime] Mobile Socket connection note:", error.message);
        if (error.message && error.message.includes("Invalid or expired token")) {
          try {
            const refreshToken = await SecureStore.getItemAsync("refresh_token");
            if (refreshToken) {
              const res = await axios.post(`${apiBase}/auth/refresh/`, {
                refresh_token: refreshToken,
                platform: "mobile",
              });
              const newAccess = res.data?.access;
              if (newAccess) {
                await SecureStore.setItemAsync("token", newAccess);
                setAuthToken(newAccess);
                socket.auth = { token: newAccess };
                socket.connect();
                return;
              }
            }
          } catch (refreshErr) {
            console.warn("[Realtime] Token refresh during socket connect failed:", refreshErr);
          }
          socket.disconnect();
        }
      });

      socketRef.current = socket;
    } else {
      socketRef.current.auth = { token };
      if (!socketRef.current.connected) {
        socketRef.current.connect();
      }
    }
  }, [token, triggerEvent, syncMissedEvents]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    processedEventsRef.current.clear();
  }, []);

  const subscribe = useCallback((event: string, callback: (data: any) => void) => {
    if (!listenersRef.current[event]) {
      listenersRef.current[event] = [];
    }
    listenersRef.current[event].push(callback);

    return () => {
      listenersRef.current[event] = (listenersRef.current[event] || []).filter(
        (cb) => cb !== callback
      );
    };
  }, []);

  // React Native AppState Lifecycle Management (Foreground / Background Synchronization)
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextAppState: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && nextAppState === "active") {
        console.log("[Realtime] App returned to active foreground. Re-verifying synchronization...");
        if (socketRef.current && !socketRef.current.connected) {
          socketRef.current.connect();
        } else if (socketRef.current?.connected) {
          triggerEvent("realtime:connected", {});
        }
        syncMissedEvents();
      }
      appStateRef.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [triggerEvent, syncMissedEvents]);

  useEffect(() => {
    if (token) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [token, connect, disconnect]);

  return (
    <RealtimeContext.Provider value={{ connect, disconnect, subscribe }}>
      {children}
    </RealtimeContext.Provider>
  );
};

export const useRealtime = (event: string, callback: (data: any) => void) => {
  const realtime = useContext(RealtimeContext);
  useEffect(() => {
    if (!realtime) return;
    const unsubscribe = realtime.subscribe(event, callback);
    return () => {
      unsubscribe();
    };
  }, [realtime, event, callback]);

  return realtime;
};

export default RealtimeContext;
