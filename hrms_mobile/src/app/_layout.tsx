import React, { useEffect } from "react";
import { ActivityIndicator, Alert, StyleSheet, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { RealtimeProvider, useRealtime } from "../context/RealtimeContext";

function InitialLayout() {
  const { isAuthenticated, isLoading, logout } = useAuth();
  const segments = useSegments();
  const router = useRouter();

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
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RealtimeProvider>
        <InitialLayout />
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
