import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { AppState, AppStateStatus } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import api, { registerLogoutCallback, setAuthToken } from "../services/api";

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

  // Automatically reset default workspace tab when user profile/role loads
  useEffect(() => {
    if (user && user.role && ["admin", "superadmin", "hr", "manager"].includes(user.role.toLowerCase())) {
      setActiveTab("system");
    } else {
      setActiveTab("personal");
    }
  }, [user]);

  // Restore session from storage on boot
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const storedToken = await SecureStore.getItemAsync("token");
        const storedUser = await AsyncStorage.getItem("user");

        if (storedToken && storedUser) {
          setAuthToken(storedToken);
          setToken(storedToken);
          setUser(JSON.parse(storedUser));
          setIsAuthenticated(true);
        }
      } catch (err) {
        console.error("Failed to restore session:", err);
      } finally {
        setIsLoading(false);
      }
    };

    restoreSession();
  }, []);

  // Register Axios global 401 interceptor callback
  useEffect(() => {
    registerLogoutCallback(logout);
  }, []);

  // Listen for AppState changes to validate session on foreground resume
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === "active" && isAuthenticated) {
        try {
          const storedToken = await SecureStore.getItemAsync("token");
          if (storedToken) {
            setAuthToken(storedToken);
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
      setIsAuthenticated(true);
      return { success: true };
    } catch (err: any) {
      console.error("Login attempt failed:", err);
      return {
        success: false,
        error: err.response?.data?.error || "Invalid username or password",
      };
    }
  };

  const logout = async () => {
    try {
      const storedRefreshToken = await SecureStore.getItemAsync("refresh_token");
      if (storedRefreshToken) {
        try {
          await api.post("/auth/logout/", { refresh_token: storedRefreshToken });
        } catch (e) {
          // Suppress errors
        }
      }
      await SecureStore.deleteItemAsync("token");
      await SecureStore.deleteItemAsync("refresh_token");
      await AsyncStorage.removeItem("user");
      setAuthToken(null);
      setToken(null);
      setUser(null);
      setIsAuthenticated(false);
    } catch (err) {
      console.error("Logout failed:", err);
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
