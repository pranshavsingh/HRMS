import axios, { AxiosHeaders, InternalAxiosRequestConfig } from "axios";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";

// React Native / Axios fix: React Native's XMLHttpRequest returns CRLF or empty strings for responses without headers
// (e.g., 204 No Content, empty bodies, network errors), which crashes Axios's strict AxiosHeaders validator with "header name must be a non-empty string".
if (AxiosHeaders) {
  const origFrom = AxiosHeaders.from as any;
  if (typeof origFrom === "function") {
    Object.defineProperty(AxiosHeaders, "from", {
      value: function (thing: any) {
        if (!thing || (typeof thing === "string" && !thing.trim())) {
          return new AxiosHeaders();
        }
        return origFrom.call(this, thing);
      },
      writable: true,
      configurable: true,
    });
  }

  const origSet = AxiosHeaders.prototype.set as any;
  if (typeof origSet === "function") {
    Object.defineProperty(AxiosHeaders.prototype, "set", {
      value: function (header: any, valueOrRewrite: any, rewrite: any) {
        if (typeof header === "string" && !header.trim()) {
          return this;
        }
        return origSet.call(this, header, valueOrRewrite, rewrite);
      },
      writable: true,
      configurable: true,
    });
  }
}

// Dynamically resolve development backend host from Metro bundler's host URI
export const getDevApiUrl = (): string => {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants as any)?.manifest?.debuggerHost ||
    (Constants as any)?.manifest2?.extra?.expoClient?.hostUri ||
    (Constants as any)?.manifest2?.extra?.expoGo?.debuggerHost;

  if (hostUri) {
    const ip = hostUri.split(":")[0];
    if (ip && ip !== "localhost" && ip !== "127.0.0.1") {
      return `http://${ip}:8000/api`;
    }
  }
  return Platform.OS === "android" ? "http://10.0.2.2:8000/api" : "http://localhost:8000/api";
};

// Use EXPO_PUBLIC_API_URL environment variable if set, otherwise fallback to local dev endpoints.
const isProd = process.env.NODE_ENV === "production";
const envUrl = process.env.EXPO_PUBLIC_API_URL;

if (isProd && !envUrl) {
  console.warn("[Security Alert] EXPO_PUBLIC_API_URL is not set in production build!");
}

const BASE_URL = envUrl || getDevApiUrl();

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
    "Bypass-Tunnel-Reminder": "true",
    "X-Platform": "mobile",
  },
});

let logoutCallback: (() => void) | null = null;
let tokenChangeCallback: ((token: string) => void) | null = null;

export const registerLogoutCallback = (cb: () => void) => {
  logoutCallback = cb;
};

export const registerTokenChangeCallback = (cb: (token: string) => void) => {
  tokenChangeCallback = cb;
};

// Expose synchronous token setter to prevent SecureStore reading race conditions on fast views loading
export const setAuthToken = (token: string | null) => {
  if (token) {
    api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common["Authorization"];
  }
};

// Request Interceptor: Fallback to SecureStore if header isn't set yet in defaults
api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    if (config.headers && !config.headers.Authorization) {
      try {
        const token = await SecureStore.getItemAsync("token");
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
      } catch (err) {
        console.error("Failed to fetch token from SecureStore in interceptor:", err);
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

let isRefreshing = false;
let failedQueue: any[] = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Response Interceptor: Catch tunnel 502 / network failures, catch 401 errors, refresh token, and retry requests
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Failover: If a tunnel returns 502 Bad Gateway or Network Error in development, fall back to local LAN IP
    if (!isProd && originalRequest && !originalRequest._fallbackAttempted) {
      const requestBaseUrl = originalRequest.baseURL || api.defaults.baseURL || "";
      const isTunnelEndpoint =
        typeof requestBaseUrl === "string" &&
        (requestBaseUrl.includes(".lhr.life") ||
          requestBaseUrl.includes("localhost.run") ||
          requestBaseUrl.includes(".ngrok") ||
          requestBaseUrl.includes(".loca.lt"));

      if (error.response?.status === 502 || (isTunnelEndpoint && (error.code === "ERR_NETWORK" || !error.response))) {
        originalRequest._fallbackAttempted = true;
        const devFallback = getDevApiUrl();
        console.warn(
          `[API Failover] Endpoint ${requestBaseUrl} returned ${error.response?.status || "network failure"}. Failing over to local backend: ${devFallback}`
        );
        api.defaults.baseURL = devFallback;
        originalRequest.baseURL = devFallback;
        return api(originalRequest);
      }
    }

    if (error.response && error.response.status === 401 && !originalRequest._retry) {
      if (originalRequest.url.includes("/auth/refresh/") || originalRequest.url.includes("/auth/login/")) {
        if (logoutCallback) {
          logoutCallback();
        }
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = "Bearer " + token;
            }
            originalRequest._retry = true;
            return api(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = await SecureStore.getItemAsync("refresh_token");
        if (!refreshToken) {
          if (logoutCallback) logoutCallback();
          return Promise.reject(error);
        }

        const res = await axios.post(`${api.defaults.baseURL}/auth/refresh/`, {
          refresh_token: refreshToken,
          platform: Platform.OS,
        });

        const { access, refresh } = res.data;
        await SecureStore.setItemAsync("token", access);
        if (refresh) {
          await SecureStore.setItemAsync("refresh_token", refresh);
        }

        setAuthToken(access);
        if (tokenChangeCallback) {
          try {
            tokenChangeCallback(access);
          } catch {}
        }
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = "Bearer " + access;
        }

        processQueue(null, access);
        return api(originalRequest);
      } catch (err) {
        processQueue(err, null);
        if (logoutCallback) logoutCallback();
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
