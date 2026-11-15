import React, { createContext, useContext, useEffect, useRef, ReactNode } from "react";
import { useAuth } from "./AuthContext";
import api from "../services/api";

interface RealtimeContextType {
  connect: () => void;
  disconnect: () => void;
  subscribe: (event: string, callback: (data: any) => void) => () => void;
}

const RealtimeContext = createContext<RealtimeContextType | null>(null);

export const RealtimeProvider = ({ children }: { children: ReactNode }) => {
  const { token } = useAuth();
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const listenersRef = useRef<{ [event: string]: ((data: any) => void)[] }>({});

  const connect = () => {
    if (!token) return;

    if (xhrRef.current) {
      xhrRef.current.abort();
    }

    const baseURL = api.defaults.baseURL;
    const url = `${baseURL}/auth/realtime`;

    console.log("[Realtime] Connecting to secure live updates stream:", url);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.open("GET", url);
    xhr.setRequestHeader("Accept", "text/event-stream");
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Bypass-Tunnel-Reminder", "true");

    let lastIndex = 0;

    xhr.onreadystatechange = () => {
      if (xhr.readyState === 3 || xhr.readyState === 4) {
        const text = xhr.responseText || "";
        const chunk = text.slice(lastIndex);
        lastIndex = text.length;
        parseChunk(chunk);
      }
      if (xhr.readyState === 4) {
        console.log("[Realtime] Stream closed. Attempting reconnect in 5s...");
        setTimeout(() => {
          if (xhrRef.current === xhr) {
            connect();
          }
        }, 5000);
      }
    };

    xhr.onerror = (err) => {
      console.error("[Realtime] Stream error:", err);
    };

    xhr.send();
  };

  const disconnect = () => {
    if (xhrRef.current) {
      xhrRef.current.abort();
      xhrRef.current = null;
      console.log("[Realtime] Stream disconnected manually");
    }
  };

  const parseChunk = (chunk: string) => {
    const lines = chunk.split("\n");
    let currentEvent = "message";
    let currentData = "";

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        if (currentData) {
          triggerEvent(currentEvent, currentData);
          currentData = "";
          currentEvent = "message";
        }
        return;
      }

      if (trimmed.startsWith("event:")) {
        currentEvent = trimmed.slice(6).trim();
      } else if (trimmed.startsWith("data:")) {
        currentData = trimmed.slice(5).trim();
      }
    });
  };

  const triggerEvent = (event: string, dataStr: string) => {
    let data: any = null;
    try {
      data = dataStr ? JSON.parse(dataStr) : null;
    } catch (err) {
      data = dataStr;
    }

    console.log(`[Realtime] Received event: ${event}`, data);

    const callbacks = listenersRef.current[event] || [];
    callbacks.forEach((cb) => {
      try {
        cb(data);
      } catch (err) {
        console.error(`[Realtime] Error running callback for event ${event}:`, err);
      }
    });
  };

  const subscribe = (event: string, callback: (data: any) => void) => {
    if (!listenersRef.current[event]) {
      listenersRef.current[event] = [];
    }
    listenersRef.current[event].push(callback);

    return () => {
      listenersRef.current[event] = (listenersRef.current[event] || []).filter(
        (cb) => cb !== callback
      );
    };
  };

  useEffect(() => {
    if (token) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [token]);

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
