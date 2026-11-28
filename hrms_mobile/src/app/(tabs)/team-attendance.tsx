import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import {
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  RefreshCw,
  Search,
  Users,
  AlertCircle,
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import api from "../../services/api";
import { useRealtime } from "../../context/RealtimeContext";
import { formatCompanyDate } from "../../utils/date";

interface TeamMemberAttendance {
  employee_id: number;
  employee_code: string;
  name: string;
  username: string;
  designation: string | null;
  department: string | null;
  profile_picture: string | null;
  reporting_manager: string | null;
  date: string;
  status: string;
  status_code: string;
  is_late: boolean;
  late_minutes: number;
  early_departure_minutes: number;
  punch_in_time: string | null;
  punch_out_time: string | null;
  work_hours: number;
}

interface TeamSummary {
  total_team_members: number;
  present: number;
  absent: number;
  late_arrivals: number;
  on_leave: number;
  not_checked_in: number;
}

const STATUS_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  present: { bg: "#DEF7EC", text: "#03543F", label: "Present" },
  absent: { bg: "#FEE2E2", text: "#991B1B", label: "Absent" },
  late: { bg: "#FFEDD5", text: "#C2410C", label: "Late" },
  half_day: { bg: "#FEF08A", text: "#854D0E", label: "Half Day" },
  on_leave: { bg: "#DBEAFE", text: "#1E40AF", label: "On Leave" },
  weekly_off: { bg: "#F1F5F9", text: "#475569", label: "Weekly Off" },
  holiday: { bg: "#F1F5F9", text: "#475569", label: "Holiday" },
  not_checked_in: { bg: "#F8FAFC", text: "#64748B", label: "Not Checked In" },
};

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "present", label: "Present" },
  { key: "absent", label: "Absent" },
  { key: "late", label: "Late" },
  { key: "half_day", label: "Half Day" },
  { key: "on_leave", label: "On Leave" },
  { key: "weekly_off", label: "Weekly Off" },
  { key: "holiday", label: "Holiday" },
  { key: "not_checked_in", label: "Not Checked In" },
];

function formatTime(iso: string | null): string {
  if (!iso) return "--:--";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function getLocalYMD(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function TeamAttendanceScreen() {
  const router = useRouter();
  const todayStr = getLocalYMD();
  const currentMonthStr = todayStr.slice(0, 7);

  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [statusFilter, setStatusFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [summary, setSummary] = useState<TeamSummary>({
    total_team_members: 0,
    present: 0,
    absent: 0,
    late_arrivals: 0,
    on_leave: 0,
    not_checked_in: 0,
  });
  const [departments, setDepartments] = useState<string[]>([]);
  const [records, setRecords] = useState<TeamMemberAttendance[]>([]);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  const monthDays = useMemo(() => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const total = new Date(y, m, 0).getDate();
    const list: { date: string; day: number; weekday: string }[] = [];
    for (let d = 1; d <= total; d++) {
      const dt = new Date(y, m - 1, d);
      list.push({
        date: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
        day: d,
        weekday: dt.toLocaleDateString("en-US", { weekday: "short" }),
      });
    }
    return list;
  }, [selectedMonth]);

  const fetchAttendance = useCallback(
    async (targetPage = 1, append = false, showSkeleton = true) => {
      if (append) {
        setLoadingMore(true);
      } else if (showSkeleton) {
        setLoading(true);
      }
      setErrorMsg("");

      try {
        const res = await api.get("/manager/team/attendance", {
          params: {
            date: selectedDate,
            month: selectedMonth,
            status: statusFilter,
            department: departmentFilter,
            search: debouncedSearch,
            page: targetPage,
            limit: 20,
          },
        });
        const data = res.data || {};
        const nextRows: TeamMemberAttendance[] = Array.isArray(data.records) ? data.records : [];

        setSummary(
          data.summary || {
            total_team_members: 0,
            present: 0,
            absent: 0,
            late_arrivals: 0,
            on_leave: 0,
            not_checked_in: 0,
          }
        );
        if (Array.isArray(data.departments)) {
          setDepartments(data.departments);
        }
        setRecords((prev) => (append ? [...prev, ...nextRows] : nextRows));
        setPage(targetPage);
        setHasNextPage(Boolean(data.pagination?.has_next_page));
      } catch (err: any) {
        setErrorMsg(err?.response?.data?.error || "Unable to load team attendance.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [selectedDate, selectedMonth, statusFilter, departmentFilter, debouncedSearch]
  );

  useEffect(() => {
    const t = setTimeout(() => {
      void fetchAttendance(1, false, true);
    }, 0);
    return () => clearTimeout(t);
  }, [fetchAttendance]);

  const syncSilent = useCallback(() => {
    void fetchAttendance(1, false, false);
  }, [fetchAttendance]);

  useRealtime("attendance_update", syncSilent);
  useRealtime("attendance:punch_in", syncSilent);
  useRealtime("attendance:punch_out", syncSilent);
  useRealtime("attendance:approval_decision", syncSilent);
  useRealtime("attendance:regularization", syncSilent);
  useRealtime("leave_update", syncSilent);
  useRealtime("realtime:connected", syncSilent);

  const changeMonth = (delta: number) => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const next = new Date(y, m - 1 + delta, 1);
    const nextMonth = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
    if (nextMonth > currentMonthStr) return;
    setSelectedMonth(nextMonth);
    setSelectedDate(nextMonth === currentMonthStr ? todayStr : `${nextMonth}-01`);
  };

  const monthTitle = useMemo(() => {
    const [y, m] = selectedMonth.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }, [selectedMonth]);

  const onRefresh = () => {
    setRefreshing(true);
    void fetchAttendance(1, false, false);
  };

  const renderMemberCard = ({ item }: { item: TeamMemberAttendance }) => {
    const badge = STATUS_BADGE[item.status] || STATUS_BADGE.not_checked_in;
    const initial = (item.name || "E").charAt(0).toUpperCase();

    return (
      <TouchableOpacity
        activeOpacity={0.8}
        style={styles.memberCard}
        onPress={() =>
          router.push({
            pathname: "/team-employee-register",
            params: { employeeId: String(item.employee_id), month: selectedMonth },
          } as any)
        }
      >
        <View style={styles.memberTopRow}>
          <View style={styles.avatarRow}>
            {item.profile_picture ? (
              <Image source={{ uri: item.profile_picture }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarInitial}>{initial}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.memberName} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={styles.memberMeta} numberOfLines={1}>
                {item.employee_code}
                {item.designation ? ` · ${item.designation}` : ""}
                {item.department ? ` · ${item.department}` : ""}
              </Text>
            </View>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.statusBadgeText, { color: badge.text }]}>{badge.label}</Text>
          </View>
        </View>

        <View style={styles.timesRow}>
          <View style={styles.timeBox}>
            <Text style={styles.timeLabel}>PUNCH IN</Text>
            <Text style={styles.timeVal}>{formatTime(item.punch_in_time)}</Text>
          </View>
          <View style={styles.timeBox}>
            <Text style={styles.timeLabel}>PUNCH OUT</Text>
            <Text style={styles.timeVal}>{formatTime(item.punch_out_time)}</Text>
          </View>
          <View style={styles.timeBox}>
            <Text style={styles.timeLabel}>DURATION</Text>
            <Text style={[styles.timeVal, { color: "#2457D6" }]}>
              {item.work_hours > 0 ? `${item.work_hours.toFixed(1)}h` : "--"}
            </Text>
          </View>
          <ChevronRight size={18} color="#8995A7" />
        </View>

        {item.is_late && item.late_minutes > 0 && (
          <View style={styles.lateTag}>
            <Clock size={12} color="#C2410C" />
            <Text style={styles.lateTagText}>Late by {item.late_minutes} min</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderSkeleton = () => (
    <View style={{ paddingHorizontal: 16 }}>
      {[1, 2, 3, 4].map((k) => (
        <View key={k} style={styles.skeletonCard} />
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      <FlatList
        data={loading ? [] : records}
        keyExtractor={(item) => String(item.employee_id)}
        renderItem={renderMemberCard}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2457D6" colors={["#2457D6"]} />
        }
        ListHeaderComponent={
          <View>
            {/* Header & Month Navigation */}
            <View style={styles.headerCard}>
              <View style={styles.headerTopRow}>
                <View style={styles.headerTitleRow}>
                  <CalendarCheck size={18} color="#2457D6" />
                  <Text style={styles.headerTitle}>My Team Attendance</Text>
                </View>
                <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn} accessibilityLabel="Refresh attendance">
                  <RefreshCw size={16} color="#2457D6" />
                </TouchableOpacity>
              </View>

              <View style={styles.monthNavRow}>
                <TouchableOpacity style={styles.navBtn} onPress={() => changeMonth(-1)}>
                  <ChevronLeft size={18} color="#152238" />
                </TouchableOpacity>
                <View style={{ alignItems: "center" }}>
                  <Text style={styles.monthText}>{monthTitle}</Text>
                  <Text style={styles.selectedDateSub}>Selected: {formatCompanyDate(selectedDate)}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.navBtn, selectedMonth >= currentMonthStr && { opacity: 0.4 }]}
                  disabled={selectedMonth >= currentMonthStr}
                  onPress={() => changeMonth(1)}
                >
                  <ChevronRight size={18} color="#152238" />
                </TouchableOpacity>
              </View>

              {/* Horizontal Date Strip */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateStrip}>
                {monthDays.map((d) => {
                  const active = d.date === selectedDate;
                  return (
                    <TouchableOpacity
                      key={d.date}
                      style={[styles.dateChip, active && styles.dateChipActive]}
                      onPress={() => setSelectedDate(d.date)}
                    >
                      <Text style={[styles.dateChipWeek, active && styles.dateChipTextActive]}>{d.weekday}</Text>
                      <Text style={[styles.dateChipDay, active && styles.dateChipTextActive]}>{d.day}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* 6 Summary Cards */}
            <View style={styles.summaryGrid}>
              <TouchableOpacity style={styles.summaryCard} onPress={() => setStatusFilter("all")}>
                <Text style={styles.summaryVal}>{summary.total_team_members}</Text>
                <Text style={styles.summaryLabel}>Total Team</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.summaryCard, { borderColor: "#A7F3D0" }]} onPress={() => setStatusFilter("present")}>
                <Text style={[styles.summaryVal, { color: "#059669" }]}>{summary.present}</Text>
                <Text style={styles.summaryLabel}>Present</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.summaryCard, { borderColor: "#FECACA" }]} onPress={() => setStatusFilter("absent")}>
                <Text style={[styles.summaryVal, { color: "#DC2626" }]}>{summary.absent}</Text>
                <Text style={styles.summaryLabel}>Absent</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.summaryCard, { borderColor: "#FED7AA" }]} onPress={() => setStatusFilter("late")}>
                <Text style={[styles.summaryVal, { color: "#C2410C" }]}>{summary.late_arrivals}</Text>
                <Text style={styles.summaryLabel}>Late Arrivals</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.summaryCard, { borderColor: "#BFDBFE" }]} onPress={() => setStatusFilter("on_leave")}>
                <Text style={[styles.summaryVal, { color: "#2563EB" }]}>{summary.on_leave}</Text>
                <Text style={styles.summaryLabel}>On Leave</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.summaryCard} onPress={() => setStatusFilter("not_checked_in")}>
                <Text style={[styles.summaryVal, { color: "#64748B" }]}>{summary.not_checked_in}</Text>
                <Text style={styles.summaryLabel}>Not Checked In</Text>
              </TouchableOpacity>
            </View>

            {/* Search Bar */}
            <View style={styles.searchBar}>
              <Search size={16} color="#8995A7" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search by employee name or ID..."
                placeholderTextColor="#94A3B8"
                value={searchInput}
                onChangeText={setSearchInput}
              />
            </View>

            {/* Department Filters (if multiple) */}
            {departments.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
                {["all", ...departments].map((dept) => (
                  <TouchableOpacity
                    key={dept}
                    style={[styles.filterPill, departmentFilter === dept && styles.filterPillActive]}
                    onPress={() => setDepartmentFilter(dept)}
                  >
                    <Text style={[styles.filterPillText, departmentFilter === dept && styles.filterPillTextActive]}>
                      {dept === "all" ? "All Depts" : dept}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* Status Filter Pills */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {STATUS_FILTERS.map((f) => (
                <TouchableOpacity
                  key={f.key}
                  style={[styles.filterPill, statusFilter === f.key && styles.filterPillActive]}
                  onPress={() => setStatusFilter(f.key)}
                >
                  <Text style={[styles.filterPillText, statusFilter === f.key && styles.filterPillTextActive]}>
                    {f.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {errorMsg !== "" && (
              <View style={styles.errorBanner}>
                <AlertCircle size={16} color="#DC2626" />
                <Text style={styles.errorText}>{errorMsg}</Text>
                <TouchableOpacity onPress={() => void fetchAttendance(1, false, true)} style={styles.retryBtn}>
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            renderSkeleton()
          ) : (
            <View style={styles.emptyCard}>
              <Users size={36} color="#8995A7" />
              <Text style={styles.emptyTitle}>No team members found</Text>
              <Text style={styles.emptySub}>Try adjusting your search, date, or status filter.</Text>
            </View>
          )
        }
        ListFooterComponent={
          hasNextPage ? (
            <TouchableOpacity
              style={styles.loadMoreBtn}
              disabled={loadingMore}
              onPress={() => void fetchAttendance(page + 1, true, false)}
            >
              {loadingMore ? (
                <ActivityIndicator size="small" color="#2457D6" />
              ) : (
                <Text style={styles.loadMoreText}>Load More Team Members</Text>
              )}
            </TouchableOpacity>
          ) : undefined
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F6F8FC" },
  listContent: { padding: 16, paddingBottom: 40 },
  headerCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5EAF2",
    marginBottom: 12,
  },
  headerTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  headerTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerTitle: { fontSize: 17, fontWeight: "800", color: "#152238" },
  refreshBtn: { padding: 8, borderRadius: 10, backgroundColor: "#EAF0FF" },
  monthNavRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  navBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" },
  monthText: { fontSize: 15, fontWeight: "800", color: "#152238" },
  selectedDateSub: { fontSize: 11, color: "#68758A", marginTop: 2 },
  dateStrip: { gap: 6, paddingVertical: 2 },
  dateChip: {
    width: 44,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E5EAF2",
    alignItems: "center",
  },
  dateChipActive: { backgroundColor: "#2457D6", borderColor: "#2457D6" },
  dateChipWeek: { fontSize: 10, fontWeight: "700", color: "#68758A" },
  dateChipDay: { fontSize: 14, fontWeight: "800", color: "#152238", marginTop: 1 },
  dateChipTextActive: { color: "#FFFFFF" },

  summaryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  summaryCard: {
    flexGrow: 1,
    minWidth: "30%",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5EAF2",
  },
  summaryVal: { fontSize: 18, fontWeight: "900", color: "#152238" },
  summaryLabel: { fontSize: 10, fontWeight: "700", color: "#68758A", marginTop: 2, textAlign: "center" },

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5EAF2",
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 10,
    gap: 8,
  },
  searchInput: { flex: 1, color: "#152238", fontSize: 14 },

  filterRow: { gap: 6, paddingBottom: 10 },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5EAF2",
  },
  filterPillActive: { backgroundColor: "#EAF0FF", borderColor: "#2457D6" },
  filterPillText: { fontSize: 12, fontWeight: "600", color: "#68758A" },
  filterPillTextActive: { color: "#2457D6", fontWeight: "700" },

  memberCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5EAF2",
    padding: 14,
    marginBottom: 10,
  },
  memberTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  avatarRow: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, paddingRight: 8 },
  avatarImg: { width: 40, height: 40, borderRadius: 20 },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#EAF0FF",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: { fontSize: 16, fontWeight: "800", color: "#2457D6" },
  memberName: { fontSize: 15, fontWeight: "800", color: "#152238" },
  memberMeta: { fontSize: 11, color: "#68758A", marginTop: 2 },
  statusBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8 },
  statusBadgeText: { fontSize: 11, fontWeight: "800" },

  timesRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  timeBox: { alignItems: "center" },
  timeLabel: { fontSize: 9, fontWeight: "700", color: "#8995A7" },
  timeVal: { fontSize: 13, fontWeight: "800", color: "#152238", marginTop: 2 },

  lateTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
    backgroundColor: "#FFF7ED",
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  lateTagText: { fontSize: 11, fontWeight: "700", color: "#C2410C" },

  skeletonCard: { height: 108, borderRadius: 16, backgroundColor: "#E5EAF2", marginBottom: 10, opacity: 0.6 },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  errorText: { flex: 1, fontSize: 12, color: "#991B1B", fontWeight: "600" },
  retryBtn: { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: "#DC2626", borderRadius: 8 },
  retryText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },

  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 32,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5EAF2",
  },
  emptyTitle: { fontSize: 15, fontWeight: "800", color: "#152238", marginTop: 10 },
  emptySub: { fontSize: 12, color: "#68758A", marginTop: 4, textAlign: "center" },

  loadMoreBtn: {
    backgroundColor: "#EAF0FF",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 6,
  },
  loadMoreText: { color: "#2457D6", fontSize: 13, fontWeight: "700" },
});
