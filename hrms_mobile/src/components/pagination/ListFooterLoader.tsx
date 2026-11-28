import React from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface ListFooterLoaderProps {
  loadingMore: boolean;
  hasMore: boolean;
  itemCount: number;
  error?: string;
  onRetry?: () => void;
}

export default function ListFooterLoader({
  loadingMore,
  hasMore,
  itemCount,
  error,
  onRetry,
}: ListFooterLoaderProps) {
  if (loadingMore) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color="#2457D6" />
        <Text style={styles.text}>Loading more...</Text>
      </View>
    );
  }

  if (error && itemCount > 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error}</Text>
        {onRetry ? (
          <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }

  if (!hasMore && itemCount > 0) {
    return (
      <View style={styles.endContainer}>
        <Text style={styles.endText}>End of records</Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  endContainer: {
    paddingVertical: 14,
    alignItems: "center",
  },
  text: {
    fontSize: 12,
    color: "#64748B",
  },
  endText: {
    fontSize: 11,
    color: "#94A3B8",
    fontWeight: "500",
  },
  errorText: {
    fontSize: 12,
    color: "#DC2626",
    textAlign: "center",
  },
  retryBtn: {
    backgroundColor: "#EEF4FF",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  retryText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2457D6",
  },
});
