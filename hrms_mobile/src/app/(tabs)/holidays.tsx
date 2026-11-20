import React, { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import api from "../../services/api";
import { useRealtime } from "../../context/RealtimeContext";

type Holiday = { id: number; name: string; holiday_date: string; description?: string | null; is_optional?: boolean };
const monthRange = (date: Date) => ({
  from: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`,
  to: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()).padStart(2, "0")}`,
});

export default function HolidaysScreen() {
  const [month, setMonth] = useState(() => new Date());
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError("");
    try {
      const response = await api.get("/v1/workforce/holidays", { params: monthRange(month) });
      setHolidays(response.data?.holidays || []);
    } catch {
      setError("Holiday calendar could not be loaded. Pull down to try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [month]);
  useRealtime("holiday:created", () => load());
  useRealtime("holiday:updated", () => load());
  useRealtime("holiday:deleted", () => load());
  useRealtime("realtime:connected", () => load());
  useFocusEffect(useCallback(() => { load(true); }, [load]));

  const changeMonth = (delta: number) => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  return <SafeAreaView style={styles.safe} edges={["bottom"]}>
    <View style={styles.container}>
      <View style={styles.heading}><CalendarDays color="#34d399" size={25} /><View><Text style={styles.title}>Holiday Calendar</Text><Text style={styles.subtitle}>Company holidays and observances</Text></View></View>
      <View style={styles.monthBar}>
        <TouchableOpacity accessibilityLabel="Previous month" onPress={() => changeMonth(-1)} style={styles.arrow}><ChevronLeft color="#cbd5e1" /></TouchableOpacity>
        <Text style={styles.month}>{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</Text>
        <TouchableOpacity accessibilityLabel="Next month" onPress={() => changeMonth(1)} style={styles.arrow}><ChevronRight color="#cbd5e1" /></TouchableOpacity>
      </View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {loading ? <ActivityIndicator color="#34d399" style={{ marginTop: 32 }} /> : <FlatList
        data={holidays}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={holidays.length ? styles.list : styles.emptyList}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor="#34d399" onRefresh={() => { setRefreshing(true); load(); }} />}
        ListEmptyComponent={<Text style={styles.empty}>No holidays are scheduled for this month.</Text>}
        renderItem={({ item }) => <View style={styles.card}>
          <View style={styles.date}><Text style={styles.day}>{new Date(`${item.holiday_date.slice(0, 10)}T00:00:00`).getDate()}</Text><Text style={styles.weekday}>{new Date(`${item.holiday_date.slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" })}</Text></View>
          <View style={styles.details}><Text style={styles.name}>{item.name}</Text><Text style={styles.description}>{item.description || (item.is_optional ? "Optional holiday" : "Company holiday")}</Text></View>
          {item.is_optional ? <Text style={styles.badge}>Optional</Text> : null}
        </View>}
      />}
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: "#0b1220" }, container: { flex: 1, padding: 18 }, heading: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 22 }, title: { color: "#f8fafc", fontSize: 21, fontWeight: "700" }, subtitle: { color: "#94a3b8", marginTop: 3 }, monthBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#111c2e", borderRadius: 14, padding: 8, marginBottom: 14 }, month: { color: "#f8fafc", fontSize: 17, fontWeight: "700" }, arrow: { padding: 8 }, list: { gap: 10, paddingBottom: 24 }, emptyList: { flexGrow: 1, justifyContent: "center", alignItems: "center" }, empty: { color: "#94a3b8", textAlign: "center" }, error: { color: "#fca5a5", marginVertical: 8 }, card: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 14, padding: 14, backgroundColor: "#111c2e", borderWidth: 1, borderColor: "#1e293b" }, date: { width: 48, height: 52, borderRadius: 11, backgroundColor: "#064e3b", alignItems: "center", justifyContent: "center" }, day: { color: "#a7f3d0", fontSize: 19, fontWeight: "800" }, weekday: { color: "#6ee7b7", fontSize: 11 }, details: { flex: 1 }, name: { color: "#f1f5f9", fontWeight: "700", fontSize: 15 }, description: { color: "#94a3b8", marginTop: 4 }, badge: { color: "#c4b5fd", fontSize: 11, backgroundColor: "#312e81", paddingHorizontal: 8, paddingVertical: 5, borderRadius: 9 } });
