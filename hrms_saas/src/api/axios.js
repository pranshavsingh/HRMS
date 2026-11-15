import axios from "axios";

const API = axios.create({
  baseURL: "http://127.0.0.1:8000/api",
});

// Attach token except login
API.interceptors.request.use((req) => {
  const token = localStorage.getItem("token");

  if (token && !req.url.includes("/auth/login/")) {
    req.headers.Authorization = `Bearer ${token}`;
  }

  return req;
});

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Response interceptor for automatic refresh on 401
API.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response && error.response.status === 401 && !originalRequest._retry) {
      if (originalRequest.url.includes("/auth/refresh/") || originalRequest.url.includes("/auth/login/")) {
        // If the refresh or login request itself fails with 401, force logout.
        localStorage.removeItem("token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("role");
        localStorage.removeItem("username");
        window.location.href = "/";
        return Promise.reject(error);
      }

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = "Bearer " + token;
            return API(originalRequest);
          })
          .catch((err) => {
            return Promise.reject(err);
          });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem("refresh_token");
      if (!refreshToken) {
        localStorage.removeItem("token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("role");
        localStorage.removeItem("username");
        window.location.href = "/";
        return Promise.reject(error);
      }

      try {
        const res = await axios.post(`${API.defaults.baseURL}/auth/refresh/`, {
          refresh_token: refreshToken,
          platform: "web",
        });

        const { access, refresh } = res.data;
        localStorage.setItem("token", access);
        localStorage.setItem("refresh_token", refresh);
        window.dispatchEvent(new Event("token-refreshed"));

        API.defaults.headers.common["Authorization"] = "Bearer " + access;
        originalRequest.headers.Authorization = "Bearer " + access;

        processQueue(null, access);
        return API(originalRequest);
      } catch (err) {
        processQueue(err, null);
        localStorage.removeItem("token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("role");
        localStorage.removeItem("username");
        window.location.href = "/";
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default API;