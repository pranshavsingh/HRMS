import { createContext, useContext, useEffect, useRef } from "react";
import API from "../api/axios";

const RealtimeContext = createContext(null);

export const RealtimeProvider = ({ children }) => {
  const eventSourceRef = useRef(null);
  const listenersRef = useRef({});

  // Helper to get baseURL for SSE
  const getSseUrl = () => {
    const base = API.defaults.baseURL || "http://127.0.0.1:8000/api";
    const token = localStorage.getItem("token") || "";
    return `${base}/auth/realtime?token=${token}`;
  };

  const connect = () => {
    const token = localStorage.getItem("token");
    if (!token) return;

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const url = getSseUrl();
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onopen = () => {
      console.log("[Realtime] Connected to live updates stream");
    };

    es.onerror = (err) => {
      console.error("[Realtime] SSE connection error:", err);
      // Wait 5 seconds and attempt to reconnect
      setTimeout(() => {
        const activeToken = localStorage.getItem("token");
        if (activeToken && (!eventSourceRef.current || eventSourceRef.current.readyState === EventSource.CLOSED)) {
          console.log("[Realtime] Attempting reconnection...");
          connect();
        }
      }, 5000);
    };

    // Generic message handler or specific event handlers
    const handleEvent = (event) => {
      const type = event.type;
      let data = null;
      try {
        data = event.data ? JSON.parse(event.data) : null;
      } catch (err) {
        data = event.data;
      }
      
      const listeners = listenersRef.current[type] || [];
      listeners.forEach(cb => {
        try {
          cb(data);
        } catch (cbErr) {
          console.error(`[Realtime] Listener callback error for ${type}:`, cbErr);
        }
      });
    };

    // Listen for core real-time events
    const events = ["new_audit_log", "attendance_update", "leave_update", "employee_update"];
    events.forEach(evt => {
      es.addEventListener(evt, handleEvent);
    });
  };

  const disconnect = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
      console.log("[Realtime] Disconnected from stream");
    }
  };

  const subscribe = (event, callback) => {
    if (!listenersRef.current[event]) {
      listenersRef.current[event] = [];
    }
    listenersRef.current[event].push(callback);

    // Return unsubscribe function
    return () => {
      listenersRef.current[event] = listenersRef.current[event].filter(cb => cb !== callback);
    };
  };

  useEffect(() => {
    const handleRefresh = () => {
      console.log("[Realtime] Token refreshed in background. Reconnecting...");
      connect();
    };

    window.addEventListener("token-refreshed", handleRefresh);

    const token = localStorage.getItem("token");
    if (token) {
      connect();
    }

    return () => {
      window.removeEventListener("token-refreshed", handleRefresh);
      disconnect();
    };
  }, []);

  return (
    <RealtimeContext.Provider value={{ connect, disconnect, subscribe }}>
      {children}
    </RealtimeContext.Provider>
  );
};

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
