import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { AlertCircle } from "lucide-react-native";

interface ListErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export default function ListErrorState({
  message = "Unable to load records.",
  onRetry,
}: ListErrorStateProps) {
  return (
    <View style={styles.card}>
      <AlertCircle size={34} color="#DC2626" />
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.subtitle}>{message}</Text>
      {onRetry ? (
        <TouchableOpacity style={styles.btn} onPress={onRetry}>
          <Text style={styles.btnText}>Retry</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#FECACA",
    padding: 24,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  title: {
    marginTop: 10,
    fontSize: 15,
    fontWeight: "700",
    color: "#991B1B",
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
  },
  btn: {
    marginTop: 14,
    backgroundColor: "#2457D6",
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 10,
  },
  btnText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
});
