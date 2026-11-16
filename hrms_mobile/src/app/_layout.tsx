import React, { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { AuthProvider, useAuth } from "../context/AuthContext";
import { RealtimeProvider } from "../context/RealtimeContext";

function InitialLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    // Check if the current route is within authenticated workspace (tabs or modals)
    const segs = segments as string[];
    const inAuthGroup = segs[0] === "(tabs)" || segs[0] === "documents" || segs[0] === "my-documents";

    if (!isAuthenticated && inAuthGroup) {
      // Redirect unauthenticated user trying to access protected screen to login
      router.replace("/");
    } else if (isAuthenticated && !inAuthGroup) {
      // Redirect authenticated user away from login page to dashboard
      router.replace("/(tabs)/dashboard");
    }
  }, [isAuthenticated, isLoading, segments, router]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" options={{ gestureEnabled: false }} />
      <Stack.Screen name="documents" options={{ presentation: "modal", headerShown: true, title: "Upload Documents", headerStyle: { backgroundColor: "#1e293b" }, headerTintColor: "#ffffff" }} />
      <Stack.Screen name="my-documents" options={{ presentation: "modal", headerShown: true, title: "My Documents", headerStyle: { backgroundColor: "#1e293b" }, headerTintColor: "#ffffff" }} />
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
    backgroundColor: "#0f172a", // Sleek dark slate theme
    alignItems: "center",
    justifyContent: "center",
  },
});
