import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { io } from "socket.io-client";
import API, { getInMemoryToken } from "../api/axios";

const RealtimeContext = createContext(null);

export const RealtimeProvider = ({ children }) => {
  const socketRef = useRef(null);
  const listenersRef = useRef({});
  const processedEventsRef = useRef(new Set());
  const lastEventTimestampRef = useRef(null);
  const connectionAttemptRef = useRef(0);

  const dispatchEvent = useCallback((type, data) => {
    const listeners = listenersRef.current[type] || [];
    listeners.forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error(`[Realtime] Listener callback error for ${type}:`, error);
      }
    });
  }, []);

  // Missed-event reconciliation via authoritative sync endpoint
  const syncMissedEvents = useCallback(async () => {
    const token = getInMemoryToken();
    if (!token) return;
    try {
      const response = await API.get("/v1/auth/realtime/sync/", {
        params: lastEventTimestampRef.current ? { since: lastEventTimestampRef.current } : {},
      });
      const data = response.data?.data || response.data || {};
      if (data.timestamp) {
        lastEventTimestampRef.current = data.timestamp;
      }
      if (Array.isArray(data.events) && data.events.length > 0) {
        data.events.forEach((evt) => {
          if (evt.eventId && !processedEventsRef.current.has(evt.eventId)) {
            processedEventsRef.current.add(evt.eventId);
            const payload = evt.payload !== undefined ? evt.payload : evt;
            dispatchEvent(evt.eventType, payload);
          }
        });
      }
    } catch (err) {
      console.warn("[Realtime] Sync reconciliation note:", err?.message);
    }
  }, [dispatchEvent]);

  const connectSocket = useCallback((requestedTenantId) => {
    const token = getInMemoryToken();
    if (!token) return;
    socketRef.current?.disconnect();

    const base = API.defaults.baseURL || "/api";
    let origin = window.location.origin;
    try {
      origin = new URL(base, window.location.origin).origin;
    } catch (err) {
      console.warn("[Realtime] Invalid API base URL, using window.location.origin:", err?.message);
    }

    const tenantId = requestedTenantId ?? null;
    const socket = io(origin, {
      path: "/socket.io",
      auth: { token, ...(tenantId ? { tenantId } : {}) },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      randomizationFactor: 0.5,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("[Realtime] Socket.IO connected:", socket.id);
      dispatchEvent("realtime:connected", {});
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
          processedEventsRef.current.delete(first);
        }
      }
      if (data?.timestamp) {
        lastEventTimestampRef.current = data.timestamp;
      }

      const payload = data?.payload !== undefined ? data.payload : data;
      dispatchEvent(event, payload);
    });

    socket.on("session:revoked", (data) => {
      console.warn("[Realtime] Session revoked by server:", data);
      dispatchEvent("session:revoked", data);
    });

    socket.on("connect_error", (error) => {
      console.warn("[Realtime] Socket.IO connection note:", error.message);
    });
  }, [dispatchEvent, syncMissedEvents]);

  const connect = useCallback(() => {
    connectSocket();
  }, [connectSocket]);

  const disconnect = useCallback(() => {
    connectionAttemptRef.current += 1;
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    processedEventsRef.current.clear();
  }, []);

  const subscribe = useCallback((event, callback) => {
    if (!listenersRef.current[event]) {
      listenersRef.current[event] = [];
    }
    listenersRef.current[event].push(callback);

    // Return unsubscribe function
    return () => {
      listenersRef.current[event] = (listenersRef.current[event] || []).filter((cb) => cb !== callback);
    };
  }, []);

  useEffect(() => {
    const handleRefresh = () => {
      console.log("[Realtime] Token refreshed in background. Reconnecting...");
      connect();
    };
    const handleTenantChange = (event) => connectSocket(event.detail?.tenantId ?? null);

    window.addEventListener("token-refreshed", handleRefresh);
    window.addEventListener("auth-logout", disconnect);
    window.addEventListener("realtime-tenant-change", handleTenantChange);

    const token = getInMemoryToken();
    if (token) {
      connect();
    }

    return () => {
      window.removeEventListener("token-refreshed", handleRefresh);
      window.removeEventListener("auth-logout", disconnect);
      window.removeEventListener("realtime-tenant-change", handleTenantChange);
      disconnect();
    };
  }, [connect, connectSocket, disconnect]);

  const contextValue = useMemo(() => ({
    connect,
    disconnect,
    subscribe,
  }), [connect, disconnect, subscribe]);

  return (
    <RealtimeContext.Provider value={contextValue}>
      {children}
    </RealtimeContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useRealtime = (event, callback) => {
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
