import React, { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { AppState, AppStateStatus, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import axios from "axios";
import api, { registerLogoutCallback, registerTokenChangeCallback, setAuthToken } from "../services/api";
import { isJwtExpired } from "../utils/jwt";

export interface User {
  id: number;
  username: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  role: string; // 'superadmin', 'admin', 'hr', 'manager', 'employee'
  joining_date?: string;
  is_active_employee?: boolean;
  profile_picture?: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  registerPreLogoutHook: (fn: () => Promise<void>) => () => void;
  updateUserProfile: (updatedData: Partial<User>) => Promise<void>;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  themeColor: string;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<string>("system");
  const preLogoutHooksRef = useRef<Set<() => Promise<void>>>(new Set());

  const registerPreLogoutHook = useCallback((fn: () => Promise<void>) => {
    preLogoutHooksRef.current.add(fn);
    return () => {
      preLogoutHooksRef.current.delete(fn);
    };
  }, []);

  const syncDefaultTabForUser = useCallback((u: User | null) => {
    if (u && u.role && ["admin", "superadmin", "hr", "manager"].includes(u.role.toLowerCase())) {
      setActiveTab("system");
    } else {
      setActiveTab("personal");
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await Promise.allSettled(Array.from(preLogoutHooksRef.current).map((fn) => fn()));
      const storedRefreshToken = await SecureStore.getItemAsync("refresh_token");
      if (storedRefreshToken) {
        try {
          await api.post("/auth/logout/", { refresh_token: storedRefreshToken });
        } catch {
          // Ignore logout API errors during local cleanup
        }
      }
      await SecureStore.deleteItemAsync("token");
      await SecureStore.deleteItemAsync("refresh_token");
      await AsyncStorage.removeItem("user");
      setAuthToken(null);
      setToken(null);
      setUser(null);
      setActiveTab("personal");
      setIsAuthenticated(false);
    } catch (err) {
      console.error("Logout failed:", err);
    }
  }, []);

  // Restore session from storage on boot
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const storedToken = await SecureStore.getItemAsync("token");
        const storedRefreshToken = await SecureStore.getItemAsync("refresh_token");
        const storedUser = await AsyncStorage.getItem("user");

        if (storedToken && storedUser) {
          if (isJwtExpired(storedToken)) {
            if (storedRefreshToken) {
              try {
                const res = await axios.post(`${api.defaults.baseURL}/auth/refresh/`, {
                  refresh_token: storedRefreshToken,
                  platform: Platform.OS,
                });
                const { access, refresh } = res.data;
                if (access) {
                  await SecureStore.setItemAsync("token", access);
                  if (refresh) await SecureStore.setItemAsync("refresh_token", refresh);
                  setAuthToken(access);
                  setToken(access);
                  const parsedUser = JSON.parse(storedUser);
                  setUser(parsedUser);
                  syncDefaultTabForUser(parsedUser);
                  setIsAuthenticated(true);
                  return;
                }
              } catch (refreshErr) {
                console.warn("[Auth] Stored session expired and refresh failed:", refreshErr);
                await SecureStore.deleteItemAsync("token");
                await SecureStore.deleteItemAsync("refresh_token");
                await AsyncStorage.removeItem("user");
                setAuthToken(null);
                setToken(null);
                setUser(null);
                setIsAuthenticated(false);
                return;
              }
            } else {
              await SecureStore.deleteItemAsync("token");
              await AsyncStorage.removeItem("user");
              setAuthToken(null);
              setToken(null);
              setUser(null);
              setIsAuthenticated(false);
              return;
            }
          }

          setAuthToken(storedToken);
          setToken(storedToken);
          const parsedUser = JSON.parse(storedUser);
          setUser(parsedUser);
          syncDefaultTabForUser(parsedUser);
          setIsAuthenticated(true);
        }
      } catch (err) {
        console.error("Failed to restore session:", err);
      } finally {
        setIsLoading(false);
      }
    };

    restoreSession();
  }, [syncDefaultTabForUser]);

  // Register Axios global 401 interceptor & token synchronization callbacks
  useEffect(() => {
    registerLogoutCallback(logout);
    registerTokenChangeCallback((freshToken: string) => {
      setToken(freshToken);
      setAuthToken(freshToken);
    });
  }, [logout]);

  // Listen for AppState changes to validate session on foreground resume
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === "active" && isAuthenticated) {
        try {
          const storedToken = await SecureStore.getItemAsync("token");
          if (storedToken) {
            if (isJwtExpired(storedToken)) {
              const storedRefreshToken = await SecureStore.getItemAsync("refresh_token");
              if (storedRefreshToken) {
                try {
                  const res = await axios.post(`${api.defaults.baseURL}/auth/refresh/`, {
                    refresh_token: storedRefreshToken,
                    platform: Platform.OS,
                  });
                  const { access, refresh } = res.data;
                  if (access) {
                    await SecureStore.setItemAsync("token", access);
                    if (refresh) await SecureStore.setItemAsync("refresh_token", refresh);
                    setAuthToken(access);
                    setToken(access);
                    return;
                  }
                } catch { }
              }
            }
            setAuthToken(storedToken);
            setToken(storedToken);
          }
        } catch (err) {
          console.error("Foreground resume session check failed:", err);
        }
      }
    };

    const subscription = AppState.addEventListener("change", handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, [isAuthenticated]);

  const login = async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await api.post("/auth/login/", { username, password });
      const jwtToken = res.data.access || res.data.token;
      const refreshJwtToken = res.data.refresh;
      const userData = res.data.user;

      if (!jwtToken) {
        throw new Error("No token returned from server");
      }

      await SecureStore.setItemAsync("token", jwtToken);
      if (refreshJwtToken) {
        await SecureStore.setItemAsync("refresh_token", refreshJwtToken);
      }
      await AsyncStorage.setItem("user", JSON.stringify(userData));

      setAuthToken(jwtToken);
      setToken(jwtToken);
      setUser(userData);
      syncDefaultTabForUser(userData);
      setIsAuthenticated(true);
      return { success: true };
    } catch (err: any) {
      console.error("Login attempt failed:", err);
      return {
        success: false,
        error:
          err.response?.data?.error ||
          (err.response?.status === 502
            ? "Server unreachable (502 Bad Gateway). Please check backend server status."
            : err.code === "ERR_NETWORK"
              ? "Network error. Unable to reach backend server."
              : "Invalid username or password"),
      };
    }
  };

  const updateUserProfile = async (updatedData: Partial<User>) => {
    if (user) {
      const newUser = { ...user, ...updatedData };
      await AsyncStorage.setItem("user", JSON.stringify(newUser));
      setUser(newUser);
    }
  };

  const getRoleThemeColor = (role: string) => {
    switch ((role || "").toLowerCase()) {
      case "superadmin":
      case "admin":
        return "#6366f1"; // Indigo
      case "hr":
        return "#10b981"; // Emerald
      case "manager":
        return "#0ea5e9"; // Sky Blue
      case "employee":
      default:
        return "#2563eb"; // Royal Blue
    }
  };

  const themeColor = user ? getRoleThemeColor(user.role) : "#2563eb";

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated,
        isLoading,
        login,
        logout,
        registerPreLogoutHook,
        updateUserProfile,
        activeTab,
        setActiveTab,
        themeColor,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export default AuthContext;
