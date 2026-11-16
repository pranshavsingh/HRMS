/**
 * Native HTTP Client with integrated CookieJar for HRMS E2E Testing
 * Supports dual-mode transport (Web HttpOnly cookies and Mobile Bearer headers).
 */

export class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  /**
   * Ingest Set-Cookie header(s)
   * @param {string|string[]} rawHeaders
   */
  setCookies(rawHeaders) {
    if (!rawHeaders) return;
    const headers = Array.isArray(rawHeaders) ? rawHeaders : [rawHeaders];

    for (const header of headers) {
      if (!header || typeof header !== "string") continue;
      
      const parts = header.split(";").map((p) => p.trim());
      const [first, ...directives] = parts;
      const equalsIdx = first.indexOf("=");
      if (equalsIdx === -1) continue;

      const name = first.slice(0, equalsIdx).trim();
      const value = first.slice(equalsIdx + 1).trim();

      const cookie = {
        name,
        value,
        path: "/",
        httpOnly: false,
        secure: false,
        sameSite: "Lax",
        maxAge: null,
        expires: null,
        raw: header
      };

      for (const directive of directives) {
        const dEqualsIdx = directive.indexOf("=");
        let dKey = directive;
        let dVal = "";
        if (dEqualsIdx !== -1) {
          dKey = directive.slice(0, dEqualsIdx).trim();
          dVal = directive.slice(dEqualsIdx + 1).trim();
        } else {
          dKey = directive.trim();
        }

        const lowerKey = dKey.toLowerCase();
        if (lowerKey === "path") {
          cookie.path = dVal;
        } else if (lowerKey === "httponly") {
          cookie.httpOnly = true;
        } else if (lowerKey === "secure") {
          cookie.secure = true;
        } else if (lowerKey === "samesite") {
          cookie.sameSite = dVal;
        } else if (lowerKey === "max-age") {
          cookie.maxAge = parseInt(dVal, 10);
        } else if (lowerKey === "expires") {
          cookie.expires = new Date(dVal);
        }
      }

      // Check deletion directives (Max-Age <= 0 or expired)
      if (cookie.maxAge !== null && cookie.maxAge <= 0) {
        this.cookies.delete(name);
      } else if (cookie.expires && cookie.expires.getTime() <= Date.now()) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, cookie);
      }
    }
  }

  get(name) {
    return this.cookies.get(name) ||
      this.cookies.get(name.toLowerCase()) ||
      (name.includes("refresh") ? (this.cookies.get("refreshToken") || this.cookies.get("refresh_token")) : null) ||
      null;
  }

  getCookie(name) {
    return this.cookies.get(name) || null;
  }

  getCookieValue(name) {
    const c = this.cookies.get(name);
    return c ? c.value : null;
  }

  getCookieHeader(requestPath = "/") {
    const matched = [];
    for (const [, cookie] of this.cookies) {
      if (!cookie.path || requestPath.startsWith(cookie.path)) {
        matched.push(`${cookie.name}=${cookie.value}`);
      }
    }
    return matched.join("; ");
  }

  clear() {
    this.cookies.clear();
  }
}

export class HttpClient {
  constructor(options = {}) {
    const opts = typeof options === "string" ? { baseUrl: options } : (options || {});
    const { baseUrl = "", cookieJar = new CookieJar(), defaultHeaders = {} } = opts;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.cookieJar = cookieJar;
    this.defaultHeaders = { ...defaultHeaders };
  }

  setBaseUrl(url) {
    this.baseUrl = url.replace(/\/+$/, "");
  }

  setHeader(name, value) {
    this.defaultHeaders[name] = value;
  }

  removeHeader(name) {
    delete this.defaultHeaders[name];
  }

  async request(method, endpoint, options = {}) {
    const url = endpoint.startsWith("http://") || endpoint.startsWith("https://")
      ? endpoint
      : `${this.baseUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;

    const headers = { ...this.defaultHeaders, ...(options.headers || {}) };

    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname;

    if (options.credentials !== "omit") {
      const cookieHeader = this.cookieJar.getCookieHeader(pathname);
      if (cookieHeader && !headers["Cookie"] && !headers["cookie"]) {
        headers["Cookie"] = cookieHeader;
      }
    }

    let body = options.body;
    if (body && typeof body === "object" && !(body instanceof FormData) && !(body instanceof Buffer) && !(body instanceof URLSearchParams)) {
      if (!headers["Content-Type"] && !headers["content-type"]) {
        headers["Content-Type"] = "application/json";
      }
      body = JSON.stringify(body);
    }

    const fetchOptions = {
      method: method.toUpperCase(),
      headers,
      body,
      signal: options.signal,
      redirect: options.redirect || "manual"
    };

    const res = await fetch(url, fetchOptions);

    // Ingest Set-Cookie
    let rawSetCookies = [];
    if (typeof res.headers.getSetCookie === "function") {
      rawSetCookies = res.headers.getSetCookie();
    } else {
      const single = res.headers.get("set-cookie");
      if (single) rawSetCookies = [single];
    }
    this.cookieJar.setCookies(rawSetCookies);

    // Read body
    const rawText = await res.text();
    let parsedBody = null;
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        parsedBody = JSON.parse(rawText);
      } catch (err) {
        parsedBody = rawText;
      }
    } else {
      parsedBody = rawText;
    }

    return {
      status: res.status,
      ok: res.ok,
      headers: res.headers,
      body: parsedBody,
      rawText,
      cookieJar: this.cookieJar
    };
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
}
