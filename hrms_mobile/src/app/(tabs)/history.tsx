import React, { useEffect, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import api from "../../services/api";
import { useRealtime } from "../../context/RealtimeContext";
import { Clock3, Calendar, MapPin, CheckCircle2, AlertTriangle } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface HistoryRecord {
  id: number;
  date: string;
  punch_in: string;
  punch_out: string | null;
  punch_in_status: string;
  punch_out_status: string | null;
  work_hours: number;
}

export default function HistoryScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [history, setHistory] = useState<HistoryRecord[]>([]);

  const fetchHistory = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const res = await api.get("/attendance/history/");
      const data = Array.isArray(res.data) ? res.data : [];
      setHistory(data);
    } catch (err: any) {
      console.error("History fetch error:", err);
      Alert.alert("Sync Error", "Unable to load attendance ledger.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useRealtime("attendance_update", () => fetchHistory(false));

  useEffect(() => {
    fetchHistory(true);
  }, [fetchHistory]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchHistory(false);
  };

  const renderHistoryItem = ({ item }: { item: HistoryRecord }) => {
    const isException = item.punch_in_status === "exception" || item.punch_out_status === "exception";
    const statusText = item.punch_out ? "Completed" : "Active Session";

    return (
      <View style={[styles.card, isException && styles.cardException]}>
        {/* Header Row */}
        <View style={styles.cardHeader}>
          <View style={styles.dateRow}>
            <Calendar size={14} color="#94a3b8" />
            <Text style={styles.dateText}>{item.date}</Text>
          </View>
          <View style={[styles.badge, isException ? styles.badgeWarning : styles.badgeSuccess]}>
            <Text style={[styles.badgeText, isException ? styles.textWarning : styles.textSuccess]}>
              {statusText}
            </Text>
          </View>
        </View>

        {/* Content Row */}
        <View style={styles.cardContent}>
          {/* Time logs */}
          <View style={styles.timeSection}>
            <Text style={styles.timeLabel}>Clock In</Text>
            <Text style={styles.timeValue}>{item.punch_in}</Text>
            <View style={styles.locationStatusRow}>
              {item.punch_in_status === "exception" ? (
                <View style={styles.statusLabelContainer}>
                  <AlertTriangle size={10} color="#f59e0b" />
                  <Text style={styles.exceptionLabel}>Exception (Out of range)</Text>
                </View>
              ) : (
                <View style={styles.statusLabelContainer}>
                  <CheckCircle2 size={10} color="#10b981" />
                  <Text style={styles.approvedLabel}>Approved perimeter</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.timeSection}>
            <Text style={styles.timeLabel}>Clock Out</Text>
            <Text style={styles.timeValue}>
              {item.punch_out === "Pending" ? "Active" : item.punch_out || "--"}
            </Text>
            <View style={styles.locationStatusRow}>
              {item.punch_out ? (
                item.punch_out_status === "exception" ? (
                  <View style={styles.statusLabelContainer}>
                    <AlertTriangle size={10} color="#f59e0b" />
                    <Text style={styles.exceptionLabel}>Exception (Out of range)</Text>
                  </View>
                ) : (
                  <View style={styles.statusLabelContainer}>
                    <CheckCircle2 size={10} color="#10b981" />
                    <Text style={styles.approvedLabel}>Approved perimeter</Text>
                  </View>
                )
              ) : (
                <Text style={styles.waitingLabel}>Active shift timer</Text>
              )}
            </View>
          </View>
        </View>

        {/* Work Hours Summary Footer */}
        <View style={styles.cardFooter}>
          <Clock3 size={14} color="#94a3b8" />
          <Text style={styles.footerText}>
            Work Duration:{" "}
            <Text style={styles.hoursValue}>
              {Number(item.work_hours || 0).toFixed(2)} hrs
            </Text>
          </Text>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      <FlatList
        data={history}
        keyExtractor={(item, index) => `${item.date}_${item.punch_in}_${index}`}
        renderItem={renderHistoryItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Clock3 size={40} color="#64748b" />
            <Text style={styles.emptyText}>No attendance records in your ledger yet.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#334155",
  },
  cardException: {
    borderColor: "#f59e0b30", // Amber border highlight for exception punch logs
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
    paddingBottom: 10,
    marginBottom: 12,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  dateText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
    marginLeft: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  badgeSuccess: {
    backgroundColor: "#064e3b",
  },
  badgeWarning: {
    backgroundColor: "#78350f",
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  textSuccess: {
    color: "#34d399",
  },
  textWarning: {
    color: "#fbbf24",
  },
  cardContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  timeSection: {
    width: "48%",
  },
  timeLabel: {
    color: "#94a3b8",
    fontSize: 10,
    textTransform: "uppercase",
    fontWeight: "600",
  },
  timeValue: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 4,
  },
  locationStatusRow: {
    marginTop: 4,
  },
  statusLabelContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  exceptionLabel: {
    color: "#fbbf24",
    fontSize: 9,
    fontWeight: "600",
    marginLeft: 4,
  },
  approvedLabel: {
    color: "#34d399",
    fontSize: 9,
    fontWeight: "600",
    marginLeft: 4,
  },
  waitingLabel: {
    color: "#64748b",
    fontSize: 9,
    fontWeight: "500",
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#334155",
    paddingTop: 10,
  },
  footerText: {
    color: "#94a3b8",
    fontSize: 12,
    marginLeft: 6,
  },
  hoursValue: {
    color: "#ffffff",
    fontWeight: "700",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
  },
  emptyText: {
    color: "#64748b",
    fontSize: 14,
    marginTop: 12,
    textAlign: "center",
  },
});
