import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
} from "react-native";
import api from "../../services/api";
import { useRealtime } from "../../context/RealtimeContext";
import { 
  Users, 
  Search, 
  Calendar, 
  Clock, 
  X, 
  MapPin, 
  User, 
  TrendingUp, 
  CheckCircle2, 
  AlertCircle 
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface RegisterRow {
  employee_id: number;
  employee_name: string;
  username: string;
  employee_code: string;
  today_status: string;
  work_hours?: number;
  date_status: Record<string, string>; // Maps YYYY-MM-DD -> status code (e.g. 'P', 'A', 'L', 'PR')
}

interface RegisterDate {
  date: string;
  day: number;
  day_name: string;
}

export default function TeamAttendanceScreen() {
  const today = new Date();
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth);
  const [searchQuery, setSearchQuery] = useState("");

  const [summary, setSummary] = useState<any>(null);
  const [registerDates, setRegisterDates] = useState<RegisterDate[]>([]);
  const [registerRows, setRegisterRows] = useState<RegisterRow[]>([]);
  const [selectedRow, setSelectedRow] = useState<RegisterRow | null>(null);

  const fetchTeamAttendanceList = useCallback(async (monthStr: string, showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const res = await api.get("/attendance/team-attendance/", {
        params: { month: monthStr },
      });
      const payload = res.data || {};
      setSummary(payload.summary || null);
      setRegisterDates(Array.isArray(payload.register_dates) ? payload.register_dates : []);
      const rows = (payload.register_rows || []).map((row: any) => {
        const date_status: Record<string, string> = {};
        if (Array.isArray(row.cells)) {
          row.cells.forEach((cell: any) => {
            date_status[cell.date] = cell.code;
          });
        }
        return {
          employee_id: row.user_id,
          employee_name: row.employee_name,
          username: row.username,
          employee_code: row.employee_code,
          today_status: row.today_status,
          work_hours: row.total_work_hours,
          date_status,
        };
      });
      setRegisterRows(rows);
    } catch (err: any) {
      console.error("Error loading team attendance registry", err);
      Alert.alert("Sync Error", "Unable to load team attendance registry.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useRealtime("attendance_update", () => fetchTeamAttendanceList(selectedMonth, false));
  useRealtime("leave_update", () => fetchTeamAttendanceList(selectedMonth, false));

  useEffect(() => {
    fetchTeamAttendanceList(selectedMonth, true);
  }, [selectedMonth, fetchTeamAttendanceList]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchTeamAttendanceList(selectedMonth, false);
  };

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return registerRows;
    return registerRows.filter(
      (row) =>
        row.employee_name?.toLowerCase().includes(query) ||
        row.username?.toLowerCase().includes(query) ||
        row.employee_code?.toLowerCase().includes(query) ||
        row.today_status?.toLowerCase().includes(query)
    );
  }, [registerRows, searchQuery]);

  const getStatusLabelAndColor = (status: string) => {
    switch (status?.toUpperCase()) {
      case "P":
        return { text: "Present", style: styles.badgeP, textStyle: styles.textP };
      case "IP":
        return { text: "In Perimeter", style: styles.badgeIP, textStyle: styles.textIP };
      case "PR":
        return { text: "Pending Review", style: styles.badgePR, textStyle: styles.textPR };
      case "L":
        return { text: "On Leave", style: styles.badgeL, textStyle: styles.textL };
      case "A":
        return { text: "Absent", style: styles.badgeA, textStyle: styles.textA };
      case "WO":
        return { text: "Weekend", style: styles.badgeWO, textStyle: styles.textWO };
      default:
        return { text: status || "No Record", style: styles.badgeNone, textStyle: styles.textNone };
    }
  };

  const renderRosterItem = ({ item }: { item: RegisterRow }) => {
    const status = getStatusLabelAndColor(item.today_status || "A");
    return (
      <TouchableOpacity style={styles.card} onPress={() => setSelectedRow(item)}>
        <View style={styles.cardHeader}>
          <View style={styles.userRow}>
            <User size={14} color="#94a3b8" />
            <Text style={styles.employeeName}>{item.employee_name}</Text>
          </View>
          <Text style={styles.codeText}>{item.employee_code}</Text>
        </View>

        <View style={styles.cardContent}>
          <Text style={styles.usernameText}>Username: {item.username}</Text>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Today's Status:</Text>
            <View style={[styles.statusBadge, status.style]}>
              <Text style={[styles.statusBadgeText, status.textStyle]}>{status.text}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      {/* Top Filter and Search Bar */}
      <View style={styles.filterSection}>
        <View style={styles.searchRow}>
          <Search size={16} color="#64748b" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search team roster..."
            placeholderTextColor="#64748b"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Month Selector Carousel Row */}
        <View style={styles.monthSelectorRow}>
          <Text style={styles.monthLabel}>Select Month: </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.monthScroll}>
            {[-2, -1, 0].map((offset) => {
              const date = new Date(today.getFullYear(), today.getMonth() + offset, 1);
              const mStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
              const active = selectedMonth === mStr;
              const formatLabel = date.toLocaleString("default", { month: "short", year: "2-digit" });
              return (
                <TouchableOpacity
                  key={mStr}
                  style={[styles.monthPill, active && styles.monthPillActive]}
                  onPress={() => setSelectedMonth(mStr)}
                >
                  <Text style={[styles.monthPillText, active && styles.monthPillTextActive]}>
                    {formatLabel}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>

      {/* Summary Matrix Cards */}
      {summary && (
        <View style={styles.statsSection}>
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statVal}>{summary.team_members}</Text>
              <Text style={styles.statLbl}>Roster Size</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statVal, { color: "#10b981" }]}>{summary.present_today}</Text>
              <Text style={styles.statLbl}>Present Today</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statVal, { color: "#ef4444" }]}>{summary.total_absent_marks || 0}</Text>
              <Text style={styles.statLbl}>Month Absences</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={[styles.statVal, { color: "#f59e0b" }]}>{summary.total_shortfall_days || 0}</Text>
              <Text style={styles.statLbl}>Shortfalls</Text>
            </View>
          </View>
        </View>
      )}

      {/* Roster List */}
      <FlatList
        data={filteredRows}
        keyExtractor={(item) => String(item.employee_id)}
        renderItem={renderRosterItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Users size={32} color="#64748b" />
            <Text style={styles.emptyText}>No matching employee records in current register.</Text>
          </View>
        }
      />

      {/* --- EMPLOYEE CALENDAR TIMELINE DETAIL MODAL --- */}
      <Modal
        visible={selectedRow !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedRow(null)}
      >
        <View style={styles.modalOverlay}>
          {selectedRow && (
            <View style={styles.modalContent}>
              {/* Header */}
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>{selectedRow.employee_name}</Text>
                  <Text style={styles.modalSub}>
                    Roster timeline details for {selectedMonth}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedRow(null)} style={styles.closeBtn}>
                  <X size={20} color="#ffffff" />
                </TouchableOpacity>
              </View>

              {/* Monthly Ledger dates detail */}
              <ScrollView contentContainerStyle={styles.modalScroll}>
                {registerDates
                  .slice()
                  .reverse() // Descending chronological list
                  .map((dateObj) => {
                    const statusVal = selectedRow.date_status[dateObj.date] || "A";
                    const status = getStatusLabelAndColor(statusVal);
                    return (
                      <View key={dateObj.date} style={styles.timelineDetailRow}>
                        <View style={styles.timelineLeft}>
                          <Text style={styles.timelineDayNum}>{dateObj.day}</Text>
                          <Text style={styles.timelineDayName}>
                            {dateObj.day_name} ({dateObj.date.substring(5)})
                          </Text>
                        </View>
                        <View style={[styles.timelineBadge, status.style]}>
                          <Text style={[styles.timelineBadgeText, status.textStyle]}>
                            {status.text}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>
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
  filterSection: {
    backgroundColor: "#1e293b",
    borderBottomWidth: 1,
    borderBottomColor: "#33415550",
    padding: 16,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0f172a",
    borderRadius: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#334155",
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    color: "#ffffff",
    flex: 1,
    height: 40,
    fontSize: 14,
  },
  monthSelectorRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
  },
  monthLabel: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "700",
  },
  monthScroll: {
    flexDirection: "row",
  },
  monthPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#0f172a",
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: "#334155",
  },
  monthPillActive: {
    borderColor: "#10b981",
    backgroundColor: "#10b98115",
  },
  monthPillText: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "700",
  },
  monthPillTextActive: {
    color: "#10b981",
  },
  // Stats Section
  statsSection: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statBox: {
    width: "23%",
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: "center",
  },
  statVal: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "800",
  },
  statLbl: {
    color: "#64748b",
    fontSize: 8,
    textTransform: "uppercase",
    fontWeight: "700",
    marginTop: 4,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  // Roster item cards
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#334155",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#33415540",
    paddingBottom: 8,
    marginBottom: 8,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  employeeName: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
    marginLeft: 6,
  },
  codeText: {
    color: "#64748b",
    fontSize: 11,
    fontWeight: "600",
  },
  cardContent: {
    marginTop: 4,
  },
  usernameText: {
    color: "#94a3b8",
    fontSize: 12,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  statusLabel: {
    color: "#64748b",
    fontSize: 12,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
  // Badges Status Colors matching React codeStyles
  badgeP: { backgroundColor: "#064e3b" },
  textP: { color: "#34d399" },
  badgeIP: { backgroundColor: "#083344" },
  textIP: { color: "#22d3ee" },
  badgePR: { backgroundColor: "#78350f" },
  textPR: { color: "#fbbf24" },
  badgeL: { backgroundColor: "#2e1065" },
  textL: { color: "#c084fc" },
  badgeA: { backgroundColor: "#7f1d1d" },
  textA: { color: "#f87171" },
  badgeWO: { backgroundColor: "#334155" },
  textWO: { color: "#94a3b8" },
  badgeNone: { backgroundColor: "#0f172a" },
  textNone: { color: "#64748b" },

  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
  },
  emptyText: {
    color: "#64748b",
    fontSize: 13,
    marginTop: 12,
    textAlign: "center",
  },
  // Modal detail Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#1e293b",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    maxHeight: "85%",
    borderTopWidth: 1,
    borderTopColor: "#334155",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
    paddingBottom: 14,
    marginBottom: 16,
  },
  modalTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "800",
  },
  modalSub: {
    color: "#94a3b8",
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    padding: 6,
    borderRadius: 14,
  },
  modalScroll: {
    paddingBottom: 24,
  },
  timelineDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#33415560",
  },
  timelineLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  timelineDayNum: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
    width: 24,
  },
  timelineDayName: {
    color: "#94a3b8",
    fontSize: 13,
    marginLeft: 10,
  },
  timelineBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  timelineBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
});
