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
  AlertCircle,
  ChevronRight
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatCompanyDate } from "../../utils/date";

interface RegisterCellDetail {
  date: string;
  code: string;
  work_hours?: number;
  punch_in?: string;
  punch_out?: string;
  holiday_name?: string | null;
}

interface RegisterRow {
  employee_id: number;
  employee_name: string;
  username: string;
  employee_code: string;
  today_status: string;
  work_hours?: number;
  present_marks?: number;
  absent_marks?: number;
  leave_marks?: number;
  date_status: Record<string, string>; // Maps YYYY-MM-DD -> status code (e.g. 'P', 'A', 'L', 'PR')
  date_details?: Record<string, RegisterCellDetail>;
}

interface RegisterDate {
  date: string;
  day: number;
  weekday?: string;
  day_name?: string;
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
        params: { month: monthStr, page: "all" },
      });
      const payload = res.data || {};
      setSummary(payload.summary || null);
      setRegisterDates(Array.isArray(payload.register_dates) ? payload.register_dates : []);
      const rows = (payload.register_rows || []).map((row: any) => {
        const date_status: Record<string, string> = {};
        const date_details: Record<string, RegisterCellDetail> = {};
        if (Array.isArray(row.cells)) {
          row.cells.forEach((cell: any) => {
            date_status[cell.date] = cell.code;
            date_details[cell.date] = cell;
          });
        }
        return {
          employee_id: row.user_id,
          employee_name: row.employee_name,
          username: row.username,
          employee_code: row.employee_code,
          today_status: row.today_status,
          work_hours: row.total_work_hours,
          present_marks: row.present_marks,
          absent_marks: row.absent_marks,
          leave_marks: row.leave_marks,
          date_status,
          date_details,
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
  useRealtime("realtime:connected", () => fetchTeamAttendanceList(selectedMonth, false));

  useEffect(() => {
    const t = setTimeout(() => { void fetchTeamAttendanceList(selectedMonth, true); }, 0);
    return () => clearTimeout(t);
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
      case "W":
        return { text: "Weekly Off", style: styles.badgeWO, textStyle: styles.textWO };
      case "H":
        return { text: "Holiday", style: styles.badgeIP, textStyle: styles.textIP };
      case "HD":
        return { text: "Half Day", style: styles.badgePR, textStyle: styles.textPR };
      default:
        return { text: status || "No Record", style: styles.badgeNone, textStyle: styles.textNone };
    }
  };

  const renderRosterItem = ({ item }: { item: RegisterRow }) => {
    const status = getStatusLabelAndColor(item.today_status || "A");
    return (
      <TouchableOpacity style={styles.card} activeOpacity={0.75} onPress={() => setSelectedRow(item)}>
        <View style={styles.cardHeader}>
          <View style={styles.userRow}>
            <View style={styles.avatarIcon}>
              <User size={14} color="#2457D6" />
            </View>
            <Text style={styles.employeeName} numberOfLines={1}>
              {item.employee_name || item.username}
            </Text>
          </View>
          {item.employee_code ? (
            <View style={styles.codePill}>
              <Text style={styles.codeText}>{item.employee_code}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.cardContent}>
          <Text style={styles.usernameText} numberOfLines={1}>
            @{item.username}{item.work_hours !== undefined ? `  •  ${Number(item.work_hours || 0).toFixed(1)}h this month` : ""}
          </Text>
          <View style={styles.statusRow}>
            <View style={styles.statusLeft}>
              <Text style={styles.statusLabel}>Today:</Text>
              <View style={[styles.statusBadge, status.style]}>
                <Text style={[styles.statusBadgeText, status.textStyle]}>{status.text}</Text>
              </View>
            </View>
            <View style={styles.ledgerHint}>
              <Text style={styles.ledgerHintText}>Ledger</Text>
              <ChevronRight size={14} color="#2457D6" />
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2457D6" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      {/* Top Filter and Search Bar */}
      <View style={styles.filterSection}>
        <View style={styles.searchRow}>
          <Search size={16} color="#68758A" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search team roster..."
            placeholderTextColor="#8995A7"
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2457D6" />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Users size={36} color="#8995A7" />
            <Text style={styles.emptyText}>No matching members found in team register.</Text>
          </View>
        }
      />

      {/* --- EMPLOYEE MONTHLY LEDGER DETAIL MODAL --- */}
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
                  <X size={20} color="#152238" />
                </TouchableOpacity>
              </View>

              {/* Monthly Ledger dates detail */}
              <ScrollView contentContainerStyle={styles.modalScroll}>
                <View style={styles.modalSummaryRow}>
                  <View style={styles.modalSummaryPill}>
                    <Text style={[styles.modalSummaryVal, { color: "#15803D" }]}>
                      {selectedRow.present_marks ?? 0}
                    </Text>
                    <Text style={styles.modalSummaryLbl}>Present</Text>
                  </View>
                  <View style={styles.modalSummaryPill}>
                    <Text style={[styles.modalSummaryVal, { color: "#BE123C" }]}>
                      {selectedRow.absent_marks ?? 0}
                    </Text>
                    <Text style={styles.modalSummaryLbl}>Absent</Text>
                  </View>
                  <View style={styles.modalSummaryPill}>
                    <Text style={[styles.modalSummaryVal, { color: "#7E22CE" }]}>
                      {selectedRow.leave_marks ?? 0}
                    </Text>
                    <Text style={styles.modalSummaryLbl}>Leave</Text>
                  </View>
                  <View style={styles.modalSummaryPill}>
                    <Text style={[styles.modalSummaryVal, { color: "#2457D6" }]}>
                      {Number(selectedRow.work_hours || 0).toFixed(1)}h
                    </Text>
                    <Text style={styles.modalSummaryLbl}>Hours</Text>
                  </View>
                </View>

                {registerDates
                  .slice()
                  .reverse() // Descending chronological list
                  .map((dateObj) => {
                    const statusVal = selectedRow.date_status[dateObj.date] || "A";
                    const detail = selectedRow.date_details?.[dateObj.date];
                    const status = getStatusLabelAndColor(statusVal);
                    return (
                      <View key={dateObj.date} style={styles.timelineDetailRow}>
                        <View style={[styles.timelineLeft, { flex: 1, paddingRight: 10 }]}>
                          <Text style={styles.timelineDayNum}>{dateObj.day}</Text>
                          <View style={{ flex: 1, marginLeft: 10 }}>
                            <Text style={[styles.timelineDayName, { marginLeft: 0 }]}>
                              {dateObj.weekday || dateObj.day_name || ""} • {formatCompanyDate(dateObj.date)}
                            </Text>
                            {detail?.holiday_name ? (
                              <Text style={styles.timelinePunchMeta}>{detail.holiday_name}</Text>
                            ) : detail && (detail.punch_in !== "--" || detail.punch_out !== "--") ? (
                              <Text style={styles.timelinePunchMeta}>
                                In: {detail.punch_in} | Out: {detail.punch_out} ({Number(detail.work_hours || 0).toFixed(2)}h)
                              </Text>
                            ) : null}
                          </View>
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
    backgroundColor: "#F6F8FC",
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#F6F8FC",
    alignItems: "center",
    justifyContent: "center",
  },
  filterSection: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5EAF2",
    padding: 16,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    color: "#152238",
    flex: 1,
    height: 40,
    fontSize: 13,
  },
  monthSelectorRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
  },
  monthLabel: {
    color: "#68758A",
    fontSize: 12,
    fontWeight: "700",
  },
  monthScroll: {
    flexDirection: "row",
  },
  monthPill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  monthPillActive: {
    borderColor: "#2457D6",
    backgroundColor: "#EAF0FF",
  },
  monthPillText: {
    color: "#68758A",
    fontSize: 11,
    fontWeight: "600",
  },
  monthPillTextActive: {
    color: "#2457D6",
    fontWeight: "700",
  },
  // Stats Section
  statsSection: {
    paddingHorizontal: 16,
    marginTop: 16,
  },
  statsRow: {
    flexDirection: "row",
    gap: 8,
  },
  statBox: {
    flex: 1,
    minHeight: 74,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5EAF2",
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#243B64",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  statVal: {
    color: "#152238",
    fontSize: 18,
    fontWeight: "800",
  },
  statLbl: {
    color: "#68758A",
    fontSize: 9,
    textTransform: "uppercase",
    fontWeight: "700",
    marginTop: 4,
    textAlign: "center",
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  // Roster item cards
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5EAF2",
    shadowColor: "#243B64",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#EDF1F6",
    paddingBottom: 10,
    marginBottom: 10,
  },
  userRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginRight: 8,
  },
  avatarIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: "#EAF0FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  employeeName: {
    flex: 1,
    color: "#152238",
    fontSize: 14,
    fontWeight: "700",
  },
  codePill: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  codeText: {
    color: "#68758A",
    fontSize: 11,
    fontWeight: "700",
  },
  cardContent: {
    marginTop: 2,
  },
  usernameText: {
    color: "#68758A",
    fontSize: 12,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 10,
  },
  statusLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusLabel: {
    color: "#68758A",
    fontSize: 12,
    fontWeight: "600",
    marginRight: 8,
  },
  ledgerHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  ledgerHintText: {
    color: "#2457D6",
    fontSize: 12,
    fontWeight: "700",
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
  badgeP: { backgroundColor: "#DCFCE7" },
  textP: { color: "#15803D" },
  badgeIP: { backgroundColor: "#E0F2FE" },
  textIP: { color: "#0369A1" },
  badgePR: { backgroundColor: "#FEF3C7" },
  textPR: { color: "#B45309" },
  badgeL: { backgroundColor: "#F3E8FF" },
  textL: { color: "#7E22CE" },
  badgeA: { backgroundColor: "#FFE4E6" },
  textA: { color: "#BE123C" },
  badgeWO: { backgroundColor: "#F1F5F9" },
  textWO: { color: "#68758A" },
  badgeNone: { backgroundColor: "#F8FAFC" },
  textNone: { color: "#8995A7" },

  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
  },
  emptyText: {
    color: "#8995A7",
    fontSize: 13,
    marginTop: 12,
    textAlign: "center",
  },
  // Modal detail Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    maxHeight: "85%",
    borderTopWidth: 1,
    borderTopColor: "#E5EAF2",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#EDF1F6",
    paddingBottom: 14,
    marginBottom: 16,
  },
  modalTitle: {
    color: "#152238",
    fontSize: 18,
    fontWeight: "800",
  },
  modalSub: {
    color: "#68758A",
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    backgroundColor: "#F1F5F9",
    padding: 6,
    borderRadius: 12,
  },
  modalScroll: {
    paddingBottom: 24,
  },
  modalSummaryRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  modalSummaryPill: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E5EAF2",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: "center",
  },
  modalSummaryVal: {
    fontSize: 15,
    fontWeight: "800",
  },
  modalSummaryLbl: {
    color: "#68758A",
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    marginTop: 2,
  },
  timelinePunchMeta: {
    color: "#8995A7",
    fontSize: 11,
    marginTop: 2,
  },
  timelineDetailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EDF1F6",
  },
  timelineLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  timelineDayNum: {
    color: "#152238",
    fontSize: 16,
    fontWeight: "800",
    minWidth: 28,
  },
  timelineDayName: {
    color: "#68758A",
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
