import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Inbox } from "lucide-react-native";

interface ListEmptyStateProps {
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
}

export default function ListEmptyState({
  title = "No records found",
  subtitle = "Try adjusting your filters or check back later.",
  icon,
}: ListEmptyStateProps) {
  return (
    <View style={styles.card}>
      {icon || <Inbox size={36} color="#8995A7" />}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5EAF2",
    padding: 28,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  title: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: "700",
    color: "#152238",
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
  },
});
