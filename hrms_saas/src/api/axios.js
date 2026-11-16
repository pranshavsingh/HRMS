import axios from "axios";

// In-memory token store (violating zero-trust to store refresh tokens in localStorage)
let inMemoryAccessToken = null;

export const setInMemoryToken = (token) => {
  inMemoryAccessToken = token;
};

export const getInMemoryToken = () => {
  return inMemoryAccessToken;
};

const API = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api",
  timeout: 15000,
  withCredentials: true, // Crucial for RFC 6265 HttpOnly cookie transport
  headers: {
    "X-Platform": "web",
  },
});

// Request interceptor: Attach access token from memory (with localStorage fallback for backwards compatibility)
API.interceptors.request.use((req) => {
  const token = inMemoryAccessToken || localStorage.getItem("token");

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

// Response interceptor: Automatic silent refresh via HttpOnly cookie on 401
API.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (!originalRequest) return Promise.reject(error);

    if (error.response && error.response.status === 401 && !originalRequest._retry) {
      // If refresh or login endpoints themselves fail with 401, terminate session
      if (originalRequest.url?.includes("/auth/refresh/") || originalRequest.url?.includes("/auth/login/")) {
        setInMemoryToken(null);
        localStorage.removeItem("token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("role");
        localStorage.removeItem("username");
        window.dispatchEvent(new Event("auth-logout"));
        return Promise.reject(error);
      }

      // Mutex lock: Queue concurrent 401 requests during an active refresh
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            originalRequest._retry = true;
            return API(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        // Web silent refresh sends HttpOnly refreshToken cookie automatically via withCredentials: true
        const res = await axios.post(
          `${API.defaults.baseURL}/auth/refresh/`,
          { platform: "web" },
          { withCredentials: true, timeout: 15000 }
        );

        const { access } = res.data;
        if (!access) {
          throw new Error("No access token returned from refresh endpoint");
        }

        setInMemoryToken(access);
        localStorage.setItem("token", access); // backward compatibility during migration
        // NEVER overwrite storage with null or string 'null'
        if (res.data.refresh) {
          localStorage.setItem("refresh_token", res.data.refresh);
        }

        API.defaults.headers.common["Authorization"] = `Bearer ${access}`;
        originalRequest.headers.Authorization = `Bearer ${access}`;

        window.dispatchEvent(new CustomEvent("token-refreshed", { detail: { access } }));
        processQueue(null, access);
        return API(originalRequest);
      } catch (err) {
        processQueue(err, null);
        setInMemoryToken(null);
        localStorage.removeItem("token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("role");
        localStorage.removeItem("username");
        window.dispatchEvent(new Event("auth-logout"));
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default API;
