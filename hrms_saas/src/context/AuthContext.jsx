import { createContext, useContext, useState, useEffect, useCallback } from "react";
import API, { setInMemoryToken, getInMemoryToken } from "../api/axios";

const AuthContext = createContext(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem("user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  const [role, setRole] = useState(() => localStorage.getItem("role") || "");
  const [accessToken, setAccessToken] = useState(() => getInMemoryToken());
  const [loading, setLoading] = useState(true);

  // Synchronize in-memory token across components and Axios
  const handleTokenUpdate = useCallback((token) => {
    setAccessToken(token);
    setInMemoryToken(token);
    if (token) {
      localStorage.setItem("token", token);
    } else {
      localStorage.removeItem("token");
    }
  }, []);

  const clearSession = useCallback(() => {
    handleTokenUpdate(null);
    setUser(null);
    setRole("");
    localStorage.removeItem("user");
    localStorage.removeItem("role");
    localStorage.removeItem("username");
    localStorage.removeItem("refresh_token");
  }, [handleTokenUpdate]);

  // Attempt silent refresh on mount using HttpOnly cookie
  const silentRefresh = useCallback(async () => {
    try {
      const res = await API.post("/auth/refresh/", { platform: "web" });
      const { access, user: userData } = res.data;
      if (access) {
        handleTokenUpdate(access);
      }
      if (userData) {
        setUser(userData);
        setRole(userData.role || "");
        localStorage.setItem("user", JSON.stringify(userData));
        localStorage.setItem("role", userData.role || "");
        localStorage.setItem("username", userData.username || "");
      }
      return true;
    } catch {
      // If refresh fails on mount and there is no valid access token in memory or storage
      if (!getInMemoryToken() && !localStorage.getItem("token")) {
        clearSession();
      }
      return false;
    }
  }, [handleTokenUpdate, clearSession]);

  // Initialize session on mount
  useEffect(() => {
    let isMounted = true;

    const initAuth = async () => {
      await silentRefresh();
      if (isMounted) {
        setLoading(false);
      }
    };

    initAuth();

    // Listen for axios interceptor events
    const handleLogoutEvent = () => clearSession();
    const handleTokenRefreshed = (e) => {
      if (e.detail?.access) {
        handleTokenUpdate(e.detail.access);
      }
    };

    window.addEventListener("auth-logout", handleLogoutEvent);
    window.addEventListener("token-refreshed", handleTokenRefreshed);

    return () => {
      isMounted = false;
      window.removeEventListener("auth-logout", handleLogoutEvent);
      window.removeEventListener("token-refreshed", handleTokenRefreshed);
    };
  }, [silentRefresh, clearSession, handleTokenUpdate]);

  const login = async (username, password) => {
    const res = await API.post("/auth/login/", { username, password, platform: "web" });
    const { access, user: userData } = res.data;

    handleTokenUpdate(access);

    if (userData) {
      setUser(userData);
      setRole(userData.role || "");
      localStorage.setItem("user", JSON.stringify(userData));
      localStorage.setItem("role", userData.role || "");
      localStorage.setItem("username", userData.username || "");
    }

    // Never store refresh_token in localStorage in web mode (server sets HttpOnly cookie)
    return res.data;
  };

  const logout = async () => {
    try {
      await API.post("/auth/logout/", { platform: "web" });
    } catch {
      // Ignore network errors on logout
    } finally {
      clearSession();
      window.location.href = "/";
    }
  };

  const isAuthenticated = Boolean(accessToken || localStorage.getItem("token") || user);

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        accessToken,
        isAuthenticated,
        loading,
        login,
        logout,
        silentRefresh,
        getAccessToken: getInMemoryToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export default AuthContext;
