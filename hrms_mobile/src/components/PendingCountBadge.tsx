import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";

interface PendingCountBadgeProps {
  count?: number;
  loading?: boolean;
  error?: boolean;
  label?: string;
  style?: ViewStyle;
}

/**
 * Reusable pill badge displaying pending approval counts.
 * Hides automatically when count is 0, loading, or in an error state.
 */
export default function PendingCountBadge({
  count = 0,
  loading = false,
  error = false,
  label = "Pending approvals",
  style,
}: PendingCountBadgeProps) {
  if (loading || error) {
    return null;
  }

  const numericCount = Number(count);
  if (!Number.isFinite(numericCount) || numericCount <= 0) {
    return null;
  }

  const displayText = numericCount > 99 ? "99+" : String(Math.floor(numericCount));

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${numericCount} pending`}
      style={[styles.badge, style]}
    >
      <Text style={styles.badgeText}>{displayText}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 13,
  },
});
