import React, { useEffect, useRef } from "react";
import { ActivityIndicator, Alert, AppState, AppStateStatus, StyleSheet, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { RealtimeProvider, useRealtime } from "../context/RealtimeContext";
import { NotificationProvider } from "../context/NotificationContext";
import { ApprovalCountsProvider } from "../context/ApprovalCountsContext";
import { checkAndFetchOtaUpdate } from "../services/otaUpdateService";

function InitialLayout() {
  const { isAuthenticated, isLoading, logout } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const appStateRef = useRef<AppStateStatus>((AppState.currentState as AppStateStatus) || "active");

  // Silent background OTA update check on startup and foreground resume (never forces mid-workflow reload)
  useEffect(() => {
    void checkAndFetchOtaUpdate({ reason: "startup" });
    const sub = AppState.addEventListener("change", (nextState) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;
      if (prev.match(/inactive|background/) && nextState === "active") {
        void checkAndFetchOtaUpdate({ reason: "foreground" });
      }
    });
    return () => sub.remove();
  }, []);

  useRealtime("session:revoked", (data) => {
    Alert.alert(
      "Session Terminated",
      data?.message || "Your session has been terminated by an administrator. Please log in again."
    );
    logout();
  });

  useEffect(() => {
    if (isLoading) return;

    const segs = segments as string[];
    const isLoginScreen = segs.length === 0 || segs[0] === "index" || segs[0] === "";

    if (!isAuthenticated && !isLoginScreen) {
      // Redirect unauthenticated user trying to access protected screen to login
      router.replace("/");
    } else if (isAuthenticated && isLoginScreen) {
      // Redirect authenticated user away from login page to dashboard
      router.replace("/(tabs)/dashboard");
    }
  }, [isAuthenticated, isLoading, segments, router]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2457D6" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ gestureEnabled: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="profile" options={{ headerShown: true, title: "Profile Details", headerStyle: { backgroundColor: "#F6F8FC" }, headerTintColor: "#152238", headerTitleStyle: { fontWeight: "700" } }} />
      <Stack.Screen name="holidays" options={{ headerShown: true, title: "Holiday Calendar", headerStyle: { backgroundColor: "#F6F8FC" }, headerTintColor: "#152238", headerTitleStyle: { fontWeight: "700" } }} />
      <Stack.Screen name="documents" options={{ presentation: "modal", headerShown: true, title: "Upload Documents", headerStyle: { backgroundColor: "#F6F8FC" }, headerTintColor: "#152238", headerTitleStyle: { fontWeight: "700" } }} />
      <Stack.Screen name="my-documents" options={{ presentation: "modal", headerShown: true, title: "My Documents", headerStyle: { backgroundColor: "#F6F8FC" }, headerTintColor: "#152238", headerTitleStyle: { fontWeight: "700" } }} />
      <Stack.Screen name="notifications" options={{ headerShown: true, title: "Notifications", headerStyle: { backgroundColor: "#F6F8FC" }, headerTintColor: "#152238", headerTitleStyle: { fontWeight: "700" } }} />
      <Stack.Screen name="team-employee-register" options={{ headerShown: true, title: "Attendance Register", headerStyle: { backgroundColor: "#F6F8FC" }, headerTintColor: "#152238", headerTitleStyle: { fontWeight: "700" } }} />
      <Stack.Screen name="team-daily-attendance" options={{ headerShown: true, title: "Daily Attendance", headerStyle: { backgroundColor: "#F6F8FC" }, headerTintColor: "#152238", headerTitleStyle: { fontWeight: "700" } }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RealtimeProvider>
        <NotificationProvider>
          <ApprovalCountsProvider>
            <InitialLayout />
          </ApprovalCountsProvider>
        </NotificationProvider>
      </RealtimeProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: "#F6F8FC",
    alignItems: "center",
    justifyContent: "center",
  },
});
