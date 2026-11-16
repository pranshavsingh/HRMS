/**
 * Web and Mobile Client Simulators for HRMS E2E Testing
 * Faithfully simulates Web (in-memory token + CookieJar + 401 mutex) and
 * Mobile (SecureStore + AsyncStorage + Bearer header + 401 mutex).
 */
import { HttpClient, CookieJar } from "./http-client.js";

export class WebClient {
  constructor(baseUrl) {
    this.cookieJar = new CookieJar();
    this.httpClient = new HttpClient({
      baseUrl,
      cookieJar: this.cookieJar,
      defaultHeaders: {
        "X-Platform": "web",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) HRMS-WebClient/1.0"
      }
    });

    this.inMemoryAccessToken = null;
    this.user = null;
    this.isRefreshing = false;
    this.failedQueue = [];
    this.refreshCallCount = 0;
  }

  getAccessToken() {
    return this.inMemoryAccessToken;
  }

  setAccessToken(token) {
    this.inMemoryAccessToken = token;
  }

  async refreshToken() {
    return this.silentRefresh();
  }

  processQueue(error, token = null) {
    const queue = [...this.failedQueue];
    this.failedQueue = [];
    for (const item of queue) {
      if (error) {
        item.reject(error);
      } else {
        item.resolve(token);
      }
    }
  }

  async login(username, password, extra = {}) {
    const res = await this.httpClient.post("/api/auth/login/", {
      username,
      password,
      platform: "web",
      ...extra
    });

    const body = res.body?.data || res.body || {};
    if (res.ok) {
      if (body.access) {
        this.inMemoryAccessToken = body.access;
      }
      this.user = body.user || null;

      // Transitional bridge: If server returned refresh in body instead of Set-Cookie,
      // populate CookieJar so client acts as browser with cookie
      if (body.refresh && !this.cookieJar.getCookie("refreshToken")) {
        this.cookieJar.setCookies([`refreshToken=${body.refresh}; Path=/api/auth; HttpOnly; SameSite=Lax`]);
      }
    }
    return res;
  }

  async silentRefresh() {
    this.refreshCallCount++;
    const cookieVal = this.cookieJar.getCookieValue("refreshToken");
    // Send cookie via CookieJar; include in body for transitional backward compatibility
    const payload = cookieVal ? { refresh_token: cookieVal } : {};

    const res = await this.httpClient.post("/api/auth/refresh/", payload);
    const body = res.body?.data || res.body || {};
    if (res.ok) {
      if (body.access) {
        this.inMemoryAccessToken = body.access;
      }
      if (body.user) this.user = body.user;
      if (body.refresh) {
        this.cookieJar.setCookies([`refreshToken=${body.refresh}; Path=/api/auth; HttpOnly; SameSite=Lax`]);
      }
    }
    return res;
  }

  async request(method, endpoint, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (this.inMemoryAccessToken && !headers["Authorization"] && !headers["authorization"]) {
      headers["Authorization"] = `Bearer ${this.inMemoryAccessToken}`;
    }

    const res = await this.httpClient.request(method, endpoint, { ...options, headers });

    // 401 Interceptor with Mutex Queue and _retry guard
    if (res.status === 401 && !options._retry && !endpoint.includes("/login/") && !endpoint.includes("/refresh/")) {
      const currentToken = this.inMemoryAccessToken;
      const sentHeader = headers["Authorization"] || headers["authorization"];
      if (currentToken && sentHeader && sentHeader !== `Bearer ${currentToken}`) {
        return await this.request(method, endpoint, {
          ...options,
          _retry: true,
          headers: { ...headers, Authorization: `Bearer ${currentToken}` }
        });
      }

      if (this.isRefreshing) {
        return new Promise((resolve, reject) => {
          this.failedQueue.push({ resolve, reject });
        }).then((newToken) => {
          return this.request(method, endpoint, {
            ...options,
            _retry: true,
            headers: { ...headers, Authorization: `Bearer ${newToken}` }
          });
        });
      }

      this.isRefreshing = true;
      try {
        const refreshRes = await this.silentRefresh();
        if (refreshRes.ok && this.inMemoryAccessToken) {
          const newToken = this.inMemoryAccessToken;
          this.isRefreshing = false;
          this.processQueue(null, newToken);
          return await this.request(method, endpoint, {
            ...options,
            _retry: true,
            headers: { ...headers, Authorization: `Bearer ${newToken}` }
          });
        } else {
          this.isRefreshing = false;
          this.processQueue(new Error("Token refresh failed"), null);
          this.logoutLocal();
          return res;
        }
      } catch (err) {
        this.isRefreshing = false;
        this.processQueue(err, null);
        this.logoutLocal();
        return res;
      } finally {
        this.isRefreshing = false;
        if (this.failedQueue.length > 0) {
          this.processQueue(null, this.inMemoryAccessToken);
        }
      }
    }

    return res;
  }

  async get(endpoint, options = {}) {
    return this.request("GET", endpoint, options);
  }

  async post(endpoint, body = {}, options = {}) {
    return this.request("POST", endpoint, { ...options, body });
  }

  async put(endpoint, body = {}, options = {}) {
    return this.request("PUT", endpoint, { ...options, body });
  }

  async delete(endpoint, body = null, options = {}) {
    return this.request("DELETE", endpoint, { ...options, body });
  }

  async logout() {
    const headers = {};
    if (this.inMemoryAccessToken) {
      headers["Authorization"] = `Bearer ${this.inMemoryAccessToken}`;
    }
    const res = await this.httpClient.post("/api/auth/logout/", {}, { headers });
    this.logoutLocal();
    return res;
  }

  logoutLocal() {
    this.inMemoryAccessToken = null;
    this.user = null;
    this.cookieJar.clear();
  }
}

export class MobileClient {
  constructor(baseUrl, deviceId = "test-device-uuid-001") {
    this.deviceId = deviceId;
    this.secureStore = new Map();
    this.asyncStorage = new Map();

    this.httpClient = new HttpClient({
      baseUrl,
      cookieJar: new CookieJar(), // isolated or unused for mobile
      defaultHeaders: {
        "X-Platform": "mobile",
        "User-Agent": "HRMS-Mobile/1.0.0 (Android 14; Pixel 8)"
      }
    });

    this.isRefreshing = false;
    this.failedQueue = [];
    this.refreshCallCount = 0;
  }

  getAccessToken() {
    return this.inMemoryAccessToken;
  }

  setAccessToken(token) {
    this.inMemoryAccessToken = token;
  }

  async refreshToken() {
    return this.silentRefresh();
  }

  processQueue(error, token = null) {
    const queue = [...this.failedQueue];
    this.failedQueue = [];
    for (const item of queue) {
      if (error) {
        item.reject(error);
      } else {
        item.resolve(token);
      }
    }
  }

  getSecureToken() {
    return this.secureStore.get("token") || null;
  }

  getAccessToken() {
    return this.getSecureToken();
  }

  setAccessToken(token) {
    if (token) {
      this.secureStore.set("token", token);
    } else {
      this.secureStore.delete("token");
    }
  }

  getRefreshToken() {
    return this.secureStore.get("refresh_token") || null;
  }

  setRefreshToken(token) {
    if (token) {
      this.secureStore.set("refresh_token", token);
    } else {
      this.secureStore.delete("refresh_token");
    }
  }

  async refreshToken() {
    return this.silentRefresh();
  }

  getUserProfile() {
    const raw = this.asyncStorage.get("user");
    return raw ? JSON.parse(raw) : null;
  }

  async login(username, password, extra = {}) {
    const res = await this.httpClient.post("/api/auth/login/", {
      username,
      password,
      platform: "android",
      device_id: this.deviceId,
      device_name: "Pixel 8 Pro",
      ...extra
    });

    const body = res.body?.data || res.body || {};
    if (res.ok) {
      if (body.access) this.secureStore.set("token", body.access);
      if (body.refresh) this.secureStore.set("refresh_token", body.refresh);
      if (body.user) this.asyncStorage.set("user", JSON.stringify(body.user));
    }
    return res;
  }

  async silentRefresh() {
    this.refreshCallCount++;
    const refreshToken = this.getRefreshToken();
    const res = await this.httpClient.post("/api/auth/refresh/", {
      refresh_token: refreshToken,
      platform: "android",
      device_id: this.deviceId
    });

    const body = res.body?.data || res.body || {};
    if (res.ok) {
      if (body.access) this.secureStore.set("token", body.access);
      // DEF-04 / Contract: Only overwrite refresh token if new token provided (preserve on null in grace window)
      if (body.refresh) {
        this.secureStore.set("refresh_token", body.refresh);
      }
      if (body.user) {
        this.asyncStorage.set("user", JSON.stringify(body.user));
      }
    }
    return res;
  }

  async request(method, endpoint, options = {}) {
    const token = this.getSecureToken();
    const headers = { ...(options.headers || {}) };
    if (token && !headers["Authorization"] && !headers["authorization"]) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await this.httpClient.request(method, endpoint, { ...options, headers });

    // 401 Interceptor with Mutex Queue and _retry guard
    if (res.status === 401 && !options._retry && !endpoint.includes("/login/") && !endpoint.includes("/refresh/")) {
      const currentToken = this.getSecureToken();
      const sentHeader = headers["Authorization"] || headers["authorization"];
      if (currentToken && sentHeader && sentHeader !== `Bearer ${currentToken}`) {
        return await this.request(method, endpoint, {
          ...options,
          _retry: true,
          headers: { ...headers, Authorization: `Bearer ${currentToken}` }
        });
      }

      if (this.isRefreshing) {
        return new Promise((resolve, reject) => {
          this.failedQueue.push({ resolve, reject });
        }).then((newToken) => {
          return this.request(method, endpoint, {
            ...options,
            _retry: true,
            headers: { ...headers, Authorization: `Bearer ${newToken}` }
          });
        });
      }

      this.isRefreshing = true;
      try {
        const refreshRes = await this.silentRefresh();
        const newToken = this.getSecureToken();
        if (refreshRes.ok && newToken) {
          this.isRefreshing = false;
          this.processQueue(null, newToken);
          return await this.request(method, endpoint, {
            ...options,
            _retry: true,
            headers: { ...headers, Authorization: `Bearer ${newToken}` }
          });
        } else {
          this.isRefreshing = false;
          this.processQueue(new Error("Mobile token refresh failed"), null);
          this.logoutLocal();
          return res;
        }
      } catch (err) {
        this.isRefreshing = false;
        this.processQueue(err, null);
        this.logoutLocal();
        return res;
      } finally {
        this.isRefreshing = false;
        if (this.failedQueue.length > 0) {
          this.processQueue(null, this.getSecureToken());
        }
      }
    }

    return res;
  }

  async get(endpoint, options = {}) {
    return this.request("GET", endpoint, options);
  }

  async post(endpoint, body = {}, options = {}) {
    return this.request("POST", endpoint, { ...options, body });
  }

  async put(endpoint, body = {}, options = {}) {
    return this.request("PUT", endpoint, { ...options, body });
  }

  async delete(endpoint, body = null, options = {}) {
    return this.request("DELETE", endpoint, { ...options, body });
  }

  async logout() {
    const token = this.getSecureToken();
    const refreshToken = this.getRefreshToken();
    const headers = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await this.httpClient.post("/api/auth/logout/", {
      refresh_token: refreshToken
    }, { headers });

    this.logoutLocal();
    return res;
  }

  logoutLocal() {
    this.secureStore.clear();
    this.asyncStorage.clear();
  }
}
