import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AlertCircle, ChevronLeft, ChevronRight, Clock } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import api from "../services/api";
import { useRealtime } from "../context/RealtimeContext";
import { formatCompanyDate } from "../utils/date";

interface RegisterDay {
  date: string;
  day: number;
  weekday: string;
  code: string;
  work_hours: number;
  punch_in: string;
  punch_out: string;
  status: string | null;
  holiday_name: string | null;
  late_minutes: number;
  early_departure_minutes: number;
  punctuality_status: string | null;
  shift_name: string | null;
  has_missing_punch: boolean;
  regularization_status: string | null;
}

interface EmployeeInfo {
  id: number;
  employee_code: string;
  name: string;
  username: string;
  designation: string | null;
  department: string | null;
  profile_picture: string | null;
  reporting_manager: string | null;
}

const CODE_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  P: { bg: "#DEF7EC", text: "#03543F", label: "Present" },
  IP: { bg: "#DBEAFE", text: "#1E40AF", label: "In Progress" },
  PR: { bg: "#FEF08A", text: "#854D0E", label: "Pending Review" },
  RJ: { bg: "#FEE2E2", text: "#991B1B", label: "Absent (Rejected)" },
  L: { bg: "#DBEAFE", text: "#1E40AF", label: "On Leave" },
  H: { bg: "#F1F5F9", text: "#475569", label: "Holiday" },
  WO: { bg: "#F1F5F9", text: "#475569", label: "Weekly Off" },
  A: { bg: "#FEE2E2", text: "#991B1B", label: "Absent" },
  "--": { bg: "#F8FAFC", text: "#94A3B8", label: "Upcoming" },
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "present", label: "Present" },
  { key: "absent", label: "Absent" },
  { key: "late", label: "Late" },
  { key: "on_leave", label: "On Leave" },
  { key: "weekly_off", label: "Weekly Off" },
  { key: "holiday", label: "Holiday" },
];

export default function TeamEmployeeRegisterScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ employeeId?: string; month?: string }>();
  const employeeId = Number(params.employeeId || 0);

  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [selectedMonth, setSelectedMonth] = useState(params.month || currentMonthStr);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [employee, setEmployee] = useState<EmployeeInfo | null>(null);
  const [days, setDays] = useState<RegisterDay[]>([]);

  const fetchRegister = useCallback(
    async (showLoader = true) => {
      if (!employeeId) return;
      if (showLoader) setLoading(true);
      setErrorMsg("");
      try {
        const res = await api.get(`/manager/team/${employeeId}/attendance`, {
          params: { month: selectedMonth, status: statusFilter },
        });
        setEmployee(res.data?.employee || null);
        setDays(Array.isArray(res.data?.days) ? res.data.days : []);
      } catch (err: any) {
        setErrorMsg(err?.response?.data?.error || "Unable to load employee attendance register.");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [employeeId, selectedMonth, statusFilter]
  );

  useEffect(() => {
    const t = setTimeout(() => {
      void fetchRegister(true);
    }, 0);
    return () => clearTimeout(t);
  }, [fetchRegister]);

  const silentSync = useCallback(() => {
    void fetchRegister(false);
  }, [fetchRegister]);

  useRealtime("attendance_update", silentSync);
  useRealtime("attendance:punch_in", silentSync);
  useRealtime("attendance:punch_out", silentSync);
  useRealtime("attendance:approval_decision", silentSync);
  useRealtime("attendance:regularization", silentSync);
  useRealtime("realtime:connected", silentSync);

  const changeMonth = (delta: number) => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const next = new Date(y, m - 1 + delta, 1);
    const nextStr = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
    if (nextStr > currentMonthStr) return;
    setSelectedMonth(nextStr);
  };

  const monthTitle = useMemo(() => {
    const [y, m] = selectedMonth.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }, [selectedMonth]);

  const renderDay = ({ item }: { item: RegisterDay }) => {
    const badge = CODE_BADGE[item.code] || CODE_BADGE["--"];
    const isLate = item.late_minutes > 0 || item.punctuality_status === "late";
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        style={styles.dayCard}
        onPress={() =>
          router.push({
            pathname: "/team-daily-attendance",
            params: { employeeId: String(employeeId), date: item.date },
          } as any)
        }
      >
        <View style={styles.dayTopRow}>
          <View>
            <Text style={styles.dayDate}>{formatCompanyDate(item.date)}</Text>
            <Text style={styles.dayWeek}>{item.weekday}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: badge.bg }]}>
            <Text style={[styles.badgeText, { color: badge.text }]}>{badge.label}</Text>
          </View>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>PUNCH IN</Text>
            <Text style={styles.metricVal}>{item.punch_in || "--"}</Text>
          </View>
          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>PUNCH OUT</Text>
            <Text style={styles.metricVal}>{item.punch_out || "--"}</Text>
          </View>
          <View style={styles.metricCol}>
            <Text style={styles.metricLabel}>HOURS</Text>
            <Text style={[styles.metricVal, { color: "#2457D6" }]}>
              {item.work_hours > 0 ? `${item.work_hours.toFixed(1)}h` : "--"}
            </Text>
          </View>
        </View>

        <View style={styles.tagsRow}>
          {isLate && (
            <View style={[styles.infoTag, { backgroundColor: "#FFF7ED" }]}>
              <Clock size={11} color="#C2410C" />
              <Text style={[styles.infoTagText, { color: "#C2410C" }]}>Late {item.late_minutes}m</Text>
            </View>
          )}
          {item.early_departure_minutes > 0 && (
            <View style={[styles.infoTag, { backgroundColor: "#F1F5F9" }]}>
              <Text style={[styles.infoTagText, { color: "#475569" }]}>
                Early Out {item.early_departure_minutes}m (Info)
              </Text>
            </View>
          )}
          {item.has_missing_punch && (
            <View style={[styles.infoTag, { backgroundColor: "#FEF2F2" }]}>
              <Text style={[styles.infoTagText, { color: "#DC2626" }]}>Missing Punch Out</Text>
            </View>
          )}
          {item.regularization_status && (
            <View style={[styles.infoTag, { backgroundColor: "#EAF0FF" }]}>
              <Text style={[styles.infoTagText, { color: "#2457D6" }]}>
                Reg: {item.regularization_status}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right", "bottom"]}>
      <FlatList
        data={loading ? [] : days}
        keyExtractor={(item) => item.date}
        renderItem={renderDay}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void fetchRegister(false);
            }}
            tintColor="#2457D6"
          />
        }
        ListHeaderComponent={
          <View>
            {employee && (
              <View style={styles.empCard}>
                <View style={styles.empTop}>
                  {employee.profile_picture ? (
                    <Image source={{ uri: employee.profile_picture }} style={styles.avatarImg} />
                  ) : (
                    <View style={styles.avatarCircle}>
                      <Text style={styles.avatarInitial}>{(employee.name || "E").charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.empName}>{employee.name}</Text>
                    <Text style={styles.empMeta}>
                      {employee.employee_code}
                      {employee.designation ? ` · ${employee.designation}` : ""}
                    </Text>
                    <Text style={styles.empSubMeta}>
                      Dept: {employee.department || "Unassigned"} · Manager: {employee.reporting_manager || "--"}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            <View style={styles.monthBar}>
              <TouchableOpacity style={styles.navBtn} onPress={() => changeMonth(-1)}>
                <ChevronLeft size={18} color="#152238" />
              </TouchableOpacity>
              <Text style={styles.monthText}>{monthTitle}</Text>
              <TouchableOpacity
                style={[styles.navBtn, selectedMonth >= currentMonthStr && { opacity: 0.4 }]}
                disabled={selectedMonth >= currentMonthStr}
                onPress={() => changeMonth(1)}
              >
                <ChevronRight size={18} color="#152238" />
              </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {FILTERS.map((f) => (
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
                <TouchableOpacity onPress={() => void fetchRegister(true)} style={styles.retryBtn}>
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color="#2457D6" />
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No attendance records match the selected filter.</Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F6F8FC" },
  listContent: { padding: 16, paddingBottom: 36 },
  empCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5EAF2",
    marginBottom: 12,
  },
  empTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  avatarImg: { width: 48, height: 48, borderRadius: 24 },
  avatarCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: "#EAF0FF", alignItems: "center", justifyContent: "center" },
  avatarInitial: { fontSize: 18, fontWeight: "800", color: "#2457D6" },
  empName: { fontSize: 17, fontWeight: "800", color: "#152238" },
  empMeta: { fontSize: 12, color: "#68758A", fontWeight: "600", marginTop: 2 },
  empSubMeta: { fontSize: 11, color: "#8995A7", marginTop: 2 },

  monthBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5EAF2",
    padding: 12,
    marginBottom: 10,
  },
  navBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center" },
  monthText: { fontSize: 15, fontWeight: "800", color: "#152238" },

  filterRow: { gap: 6, paddingBottom: 12 },
  filterPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E5EAF2" },
  filterPillActive: { backgroundColor: "#EAF0FF", borderColor: "#2457D6" },
  filterPillText: { fontSize: 12, fontWeight: "600", color: "#68758A" },
  filterPillTextActive: { color: "#2457D6", fontWeight: "700" },

  dayCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5EAF2",
    padding: 14,
    marginBottom: 10,
  },
  dayTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  dayDate: { fontSize: 14, fontWeight: "800", color: "#152238" },
  dayWeek: { fontSize: 11, color: "#68758A", fontWeight: "600" },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 11, fontWeight: "800" },

  metricsRow: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#F8FAFC", borderRadius: 12, padding: 10 },
  metricCol: { alignItems: "center", flex: 1 },
  metricLabel: { fontSize: 9, fontWeight: "700", color: "#8995A7" },
  metricVal: { fontSize: 13, fontWeight: "800", color: "#152238", marginTop: 2 },

  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  infoTag: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  infoTagText: { fontSize: 11, fontWeight: "700" },

  centerBox: { padding: 40, alignItems: "center" },
  emptyCard: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 24, alignItems: "center", borderWidth: 1, borderColor: "#E5EAF2" },
  emptyText: { fontSize: 13, color: "#68758A" },
  errorBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FEF2F2", borderColor: "#FECACA", borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  errorText: { flex: 1, fontSize: 12, color: "#991B1B", fontWeight: "600" },
  retryBtn: { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: "#DC2626", borderRadius: 8 },
  retryText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
});
