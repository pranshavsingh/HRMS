import React, { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import api from "../services/api";
import { useRealtime } from "../context/RealtimeContext";
import { formatCompanyDate } from "../utils/date";

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
      const items = Array.isArray(response.data?.holidays)
        ? response.data.holidays
        : Array.isArray(response.data?.data)
        ? response.data.data
        : Array.isArray(response.data)
        ? response.data
        : [];
      setHolidays(items);
    } catch (err: any) {
      const errMsg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        "Holiday calendar could not be loaded. Pull down to try again.";
      setError(errMsg);
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
      <View style={styles.heading}><CalendarDays color="#2457D6" size={26} /><View><Text style={styles.title}>Holiday Calendar</Text><Text style={styles.subtitle}>Company holidays and observances</Text></View></View>
      <View style={styles.monthBar}>
        <TouchableOpacity accessibilityLabel="Previous month" onPress={() => changeMonth(-1)} style={styles.arrow}><ChevronLeft color="#68758A" /></TouchableOpacity>
        <Text style={styles.month}>{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</Text>
        <TouchableOpacity accessibilityLabel="Next month" onPress={() => changeMonth(1)} style={styles.arrow}><ChevronRight color="#68758A" /></TouchableOpacity>
      </View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {loading ? <ActivityIndicator color="#2457D6" style={{ marginTop: 32 }} /> : <FlatList
        data={holidays}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={holidays.length ? styles.list : styles.emptyList}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor="#2457D6" onRefresh={() => { setRefreshing(true); load(); }} />}
        ListEmptyComponent={<Text style={styles.empty}>No holidays are scheduled for this month.</Text>}
        renderItem={({ item }) => {
          const dateStr = String(item.holiday_date || "").slice(0, 10);
          const d = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date();
          const day = !isNaN(d.getTime()) ? String(d.getDate()) : "--";
          const weekday = !isNaN(d.getTime()) ? d.toLocaleDateString(undefined, { weekday: "short" }) : "";
          const fullFormattedDate = formatCompanyDate(item.holiday_date);

          return (
            <View style={styles.card}>
              <View style={styles.date}>
                <Text style={styles.day}>{day}</Text>
                <Text style={styles.weekday}>{weekday}</Text>
              </View>
              <View style={styles.details}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.formattedDate}>{fullFormattedDate}</Text>
                <Text style={styles.description}>
                  {item.description || (item.is_optional ? "Optional holiday" : "Company holiday")}
                </Text>
              </View>
              {item.is_optional ? <Text style={styles.badge}>Optional</Text> : null}
            </View>
          );
        }}
      />}
    </View>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F6F8FC" },
  container: { flex: 1, padding: 18 },
  heading: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 },
  title: { color: "#152238", fontSize: 22, fontWeight: "700" },
  subtitle: { color: "#68758A", marginTop: 2, fontSize: 13 },
  monthBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#FFFFFF", borderRadius: 16, padding: 8, marginBottom: 16, borderWidth: 1, borderColor: "#E5EAF2" },
  month: { color: "#152238", fontSize: 16, fontWeight: "700" },
  arrow: { padding: 8 },
  list: { gap: 12, paddingBottom: 24 },
  emptyList: { flexGrow: 1, justifyContent: "center", alignItems: "center" },
  empty: { color: "#8995A7", textAlign: "center", fontSize: 14 },
  error: { color: "#E11D48", marginVertical: 8 },
  card: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 18, padding: 14, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E5EAF2", shadowColor: "#243B64", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  date: { width: 50, height: 54, borderRadius: 14, backgroundColor: "#EAF0FF", alignItems: "center", justifyContent: "center" },
  day: { color: "#2457D6", fontSize: 20, fontWeight: "800" },
  weekday: { color: "#2457D6", fontSize: 11, fontWeight: "600" },
  details: { flex: 1 },
  name: { color: "#152238", fontWeight: "700", fontSize: 15 },
  formattedDate: { color: "#2457D6", fontSize: 12, fontWeight: "600", marginTop: 2 },
  description: { color: "#68758A", marginTop: 4, fontSize: 12 },
  badge: { color: "#6C43C8", fontSize: 11, fontWeight: "700", backgroundColor: "#F1ECFF", paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
});
