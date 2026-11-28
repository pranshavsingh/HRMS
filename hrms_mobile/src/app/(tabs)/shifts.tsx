import React, { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CalendarClock, Clock3, Moon, Sun } from "lucide-react-native";
import { useAuth } from "../../context/AuthContext";
import { useRealtime } from "../../context/RealtimeContext";
import { useCursorPagination } from "../../hooks/useCursorPagination";
import PaginatedFlatList from "../../components/pagination/PaginatedFlatList";
import { formatCompanyDate } from "../../utils/date";

export default function ShiftsScreen() {
  const { user, isAuthenticated } = useAuth();
  const [rosterMeta, setRosterMeta] = useState<any>(null);

  const {
    items: schedule,
    loading,
    refreshing,
    loadingMore,
    hasMore,
    error,
    refresh,
    loadMore,
    retry,
  } = useCursorPagination<any>({
    endpoint: "/v1/workforce/rosters/my-roster",
    itemsKey: "schedule",
    limit: 20,
    enabled: Boolean(user && isAuthenticated),
    getItemKey: (item) => item.entry_id || item.work_date,
    onData: (payload: any) => {
      const raw = payload?.raw || payload;
      if (raw?.current_shift !== undefined || raw?.today !== undefined) {
        setRosterMeta(raw);
      }
    },
  });

  useRealtime("schedule_update", () => refresh());
  useRealtime("roster:published", () => refresh());
  useRealtime("realtime:connected", () => refresh());

  const currentShift = rosterMeta?.current_shift;
  const isOvernight = Boolean(currentShift?.is_overnight);
  const notice = error ? "We couldn't load your shift schedule. Pull down to try again." : "";

  const listHeader = (
    <View>
      <View style={styles.hero}>
        <View style={styles.heroIcon}><CalendarClock size={22} color="#FFFFFF" /></View>
        <Text style={styles.eyebrow}>MY SCHEDULE</Text>
        <Text style={styles.title}>Shift details</Text>
        <Text style={styles.description}>See today&apos;s assignment and your upcoming work schedule.</Text>
      </View>
      {notice ? <View style={styles.notice}><Text style={styles.noticeText}>{notice}</Text></View> : null}
      <Text style={styles.sectionLabel}>TODAY</Text>
      {currentShift ? (
        <View style={styles.currentCard}>
          <View style={[styles.shiftIcon, isOvernight && styles.shiftIconOvernight]}>{isOvernight ? <Moon size={21} color="#6C43C8" /> : <Sun size={21} color="#2457D6" />}</View>
          <View style={styles.currentMain}><Text style={styles.shiftName}>{currentShift.shift_name}</Text><Text style={styles.shiftTime}>{currentShift.start_time?.slice(0, 5)} – {currentShift.end_time?.slice(0, 5)}{isOvernight ? "  •  Next day" : ""}</Text></View>
          <View style={styles.hoursPill}><Text style={styles.hoursValue}>{Number(currentShift.total_work_hours || 0).toFixed(1)}h</Text><Text style={styles.hoursLabel}>planned</Text></View>
        </View>
      ) : <View style={styles.emptyCard}><Clock3 size={22} color="#8995A7" /><Text style={styles.emptyText}>No shift is assigned for today.</Text></View>}
      <View style={styles.scheduleHeader}><View><Text style={styles.sectionLabel}>UPCOMING</Text><Text style={styles.subtitle}>Your next scheduled shifts</Text></View><Text style={styles.scheduleCount}>{schedule.filter((s: any) => !s.is_off_day).length} shifts</Text></View>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      <PaginatedFlatList
        items={schedule}
        keyExtractor={(item: any, index: number) => String(item.entry_id || item.work_date || index)}
        contentContainerStyle={styles.content}
        ListHeaderComponent={listHeader}
        loading={loading && schedule.length === 0}
        refreshing={refreshing}
        loadingMore={loadingMore}
        hasMore={hasMore}
        error={error}
        onRefresh={refresh}
        onLoadMore={loadMore}
        onRetry={retry}
        emptyTitle="No upcoming shifts"
        emptySubtitle="No upcoming shifts have been assigned."
        renderItem={({ item, index }: { item: any; index: number }) => {
          const isOff = Boolean(item.is_off_day);
          const title = isOff
            ? (item.off_day_label || item.holiday_name || (item.status === "holiday" ? "Company Holiday" : "Weekly Off"))
            : (item.shift_name || "Assigned Shift");
          const timeLabel = isOff
            ? (item.status === "holiday" ? "Holiday" : "Off day")
            : `${item.start_time?.slice(0, 5) || "--:--"} – ${item.end_time?.slice(0, 5) || "--:--"}${item.is_overnight ? " • Next day" : ""}`;
          return (
            <View style={[styles.scheduleCard, styles.scheduleRow, index > 0 && styles.scheduleRowBorder]}>
              <View style={styles.dateBlock}><Text style={styles.dateText}>{formatCompanyDate(item.work_date)}</Text></View>
              <View style={styles.rowMain}><Text style={styles.rowName}>{title}</Text><Text style={styles.rowTime}>{timeLabel}</Text></View>
              <Text style={styles.rowHours}>{isOff ? "—" : `${Number(item.total_work_hours || 0).toFixed(1)}h`}</Text>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F6F8FC" }, loading: { flex: 1, backgroundColor: "#F6F8FC", alignItems: "center", justifyContent: "center" }, content: { padding: 20, paddingBottom: 36 },
  hero: { backgroundColor: "#2457D6", borderRadius: 24, padding: 22, marginBottom: 20, shadowColor: "#2457D6", shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 5 }, heroIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#174AB8", alignItems: "center", justifyContent: "center", marginBottom: 18 }, eyebrow: { color: "#C9D8FF", fontSize: 11, fontWeight: "800", letterSpacing: 1.4 }, title: { color: "#FFFFFF", fontSize: 25, fontWeight: "800", marginTop: 6 }, description: { color: "#D8E4FF", fontSize: 13, lineHeight: 19, marginTop: 7 },
  notice: { backgroundColor: "#FFF5F5", borderColor: "#F3CACA", borderWidth: 1, borderRadius: 14, padding: 13, marginBottom: 18 }, noticeText: { color: "#A73434", fontSize: 13 }, sectionLabel: { color: "#718096", fontSize: 11, fontWeight: "800", letterSpacing: 1.2, marginBottom: 9 },
  currentCard: { backgroundColor: "#FFFFFF", borderRadius: 20, borderWidth: 1, borderColor: "#E5EAF2", padding: 16, flexDirection: "row", alignItems: "center", shadowColor: "#243B64", shadowOpacity: 0.04, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1, marginBottom: 24 }, shiftIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: "#EAF0FF", alignItems: "center", justifyContent: "center", marginRight: 12 }, shiftIconOvernight: { backgroundColor: "#F1ECFF" }, currentMain: { flex: 1 }, shiftName: { color: "#152238", fontSize: 16, fontWeight: "800" }, shiftTime: { color: "#68758A", fontSize: 12, marginTop: 4 }, hoursPill: { alignItems: "flex-end" }, hoursValue: { color: "#2457D6", fontSize: 16, fontWeight: "800" }, hoursLabel: { color: "#8995A7", fontSize: 10, marginTop: 2 },
  emptyCard: { minHeight: 100, backgroundColor: "#FFFFFF", borderRadius: 20, borderWidth: 1, borderColor: "#E5EAF2", alignItems: "center", justifyContent: "center", gap: 9, marginBottom: 24 }, emptyText: { color: "#68758A", fontSize: 13 }, scheduleHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }, subtitle: { color: "#8995A7", fontSize: 12 }, scheduleCount: { color: "#2457D6", backgroundColor: "#EAF0FF", borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5, fontSize: 11, fontWeight: "700" },
  scheduleCard: { backgroundColor: "#FFFFFF", borderRadius: 20, borderWidth: 1, borderColor: "#E5EAF2", paddingHorizontal: 16 }, scheduleRow: { flexDirection: "row", alignItems: "center", paddingVertical: 15 }, scheduleRowBorder: { borderTopWidth: 1, borderTopColor: "#EDF1F6" }, dateBlock: { width: 86 }, dateText: { color: "#68758A", fontSize: 12, fontWeight: "700" }, rowMain: { flex: 1, paddingRight: 8 }, rowName: { color: "#152238", fontSize: 14, fontWeight: "700" }, rowTime: { color: "#8995A7", fontSize: 11, marginTop: 3 }, rowHours: { color: "#2457D6", fontSize: 13, fontWeight: "800" }, noSchedule: { color: "#8995A7", fontSize: 13, textAlign: "center", paddingVertical: 28 },
});