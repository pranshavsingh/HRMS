import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { io } from "socket.io-client";
import API, { getInMemoryToken } from "../api/axios";

const RealtimeContext = createContext(null);

export const RealtimeProvider = ({ children }) => {
  const eventSourceRef = useRef(null);
  const socketRef = useRef(null);
  const listenersRef = useRef({});
  const reconnectTimerRef = useRef(null);
  const connectionAttemptRef = useRef(0);
  const retryCountRef = useRef(0);

  const dispatchEvent = useCallback((type, data) => {
    const listeners = listenersRef.current[type] || [];
    listeners.forEach((callback) => {
      try { callback(data); }
      catch (error) { console.error(`[Realtime] Listener callback error for ${type}:`, error); }
    });
  }, []);

  const connectSse = useCallback(async () => {
    const attempt = ++connectionAttemptRef.current;
    const token = getInMemoryToken() || localStorage.getItem("token");
    if (!token) return;

    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
    eventSourceRef.current?.close();

    let es;
    try {
      // EventSource cannot send Authorization headers. Mint a short-lived,
      // single-use ticket instead of placing the raw access token in the URL.
      const response = await API.post("/v1/auth/realtime/ticket/");
      const ticket = response.data?.ticket || response.data?.data?.ticket;
      if (!ticket) throw new Error("Realtime ticket was not returned");
      if (attempt !== connectionAttemptRef.current || !(getInMemoryToken() || localStorage.getItem("token"))) return;

      const base = API.defaults.baseURL || "/api";
      es = new EventSource(`${base}/v1/auth/realtime?ticket=${encodeURIComponent(ticket)}`);
    } catch (error) {
      if (attempt !== connectionAttemptRef.current) return;
      console.warn("[Realtime] Could not open live updates; will retry.", error?.message);
      const nextDelay = Math.min(5000 * Math.pow(1.5, Math.min(retryCountRef.current++, 5)), 60000);
      reconnectTimerRef.current = setTimeout(() => connectSse(), nextDelay);
      return;
    }
    eventSourceRef.current = es;

    es.onopen = () => {
      retryCountRef.current = 0;
      console.log("[Realtime] Connected to live updates stream");
    };

    es.onerror = () => {
      if (attempt !== connectionAttemptRef.current) return;
      es.close();
      if (eventSourceRef.current === es) eventSourceRef.current = null;
      if (getInMemoryToken() || localStorage.getItem("token")) {
        const nextDelay = Math.min(5000 * Math.pow(1.5, Math.min(retryCountRef.current++, 5)), 60000);
        reconnectTimerRef.current = setTimeout(() => connectSse(), nextDelay);
      }
    };

    // Generic message handler or specific event handlers
    const handleEvent = (event) => {
      const type = event.type;
      let data = null;
      try {
        data = event.data ? JSON.parse(event.data) : null;
      } catch {
        data = event.data;
      }
      
      dispatchEvent(type, data);
    };

    // Listen for core real-time events
    const events = ["new_audit_log", "attendance_update", "leave_update", "leave_notice", "employee_update", "document_update"];
    events.forEach(evt => {
      es.addEventListener(evt, handleEvent);
    });
  }, [dispatchEvent]);

  const connectSocket = useCallback((requestedTenantId) => {
    const token = getInMemoryToken() || localStorage.getItem("token");
    if (!token) return;
    socketRef.current?.disconnect();

    const base = API.defaults.baseURL || "/api";
    const origin = new URL(base, window.location.origin).origin;
    const tenantId = localStorage.getItem("role") === "superadmin"
      ? (requestedTenantId === undefined ? localStorage.getItem("holidayCalendarTenant") : requestedTenantId)
      : null;
    const socket = io(origin, {
      auth: { token, ...(tenantId ? { tenantId } : {}) },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });
    socketRef.current = socket;
    socket.on("connect", () => dispatchEvent("realtime:connected", {}));
    socket.onAny((event, data) => {
      if (event.startsWith("holiday:")) dispatchEvent(event, data);
    });
    socket.on("connect_error", (error) => {
      console.warn("[Realtime] Socket.IO connection failed:", error.message);
    });
  }, [dispatchEvent]);

  const connect = useCallback(() => {
    connectSse();
    connectSocket();
  }, [connectSse, connectSocket]);

  const disconnect = useCallback(() => {
    connectionAttemptRef.current += 1;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      console.log("[Realtime] Disconnected from stream");
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }, []);

  const subscribe = useCallback((event, callback) => {
    if (!listenersRef.current[event]) {
      listenersRef.current[event] = [];
    }
    listenersRef.current[event].push(callback);

    // Return unsubscribe function
    return () => {
      listenersRef.current[event] = (listenersRef.current[event] || []).filter(cb => cb !== callback);
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

    const token = getInMemoryToken() || localStorage.getItem("token");
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
    subscribe
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
