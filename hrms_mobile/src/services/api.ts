import axios, { InternalAxiosRequestConfig } from "axios";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

// Use EXPO_PUBLIC_API_URL environment variable if set, otherwise fallback to local dev endpoints.
const isProd = process.env.NODE_ENV === "production";
const envUrl = process.env.EXPO_PUBLIC_API_URL;

if (isProd && !envUrl) {
  console.warn("[Security Alert] EXPO_PUBLIC_API_URL is not set in production build!");
}

const BASE_URL = envUrl || (Platform.OS === "android" ? "http://10.0.2.2:8000/api" : "http://localhost:8000/api");

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

export const registerLogoutCallback = (cb: () => void) => {
  logoutCallback = cb;
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

// Response Interceptor: Catch 401 errors, refresh token, and retry requests
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

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
