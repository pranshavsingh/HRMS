import React, { useEffect, useState, useCallback, useMemo } from "react";
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
  Image,
} from "react-native";
import api from "../../services/api";
import { useRealtime } from "../../context/RealtimeContext";
import {
  Clock3,
  Calendar,
  CalendarDays,
  CheckCircle2,
  AlertTriangle,
  FileCheck,
  X,
  Filter,
  ChevronLeft,
  ChevronRight,
  Sun,
  FileText,
  Timer,
  Clock,
  RefreshCw,
  Image as ImageIcon
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatCompanyDate } from "../../utils/date";

interface HistoryRecord {
  id: number;
  date: string;
  punch_in: string;
  punch_out: string | null;
  punch_in_status: string;
  punch_out_status: string | null;
  work_hours: number;
}

interface RegisterCell {
  date: string;
  day: number;
  weekday: string;
  is_week_off: boolean;
  code: string;
  work_hours: number;
  punch_in: string;
  punch_out: string;
  status: string | null;
  holiday_name: string | null;
  holiday_optional: boolean | null;
  leave_type: string | null;
  punch_in_photo: string | null;
  punch_out_photo: string | null;
  attendance_id: number | null;
}

interface RegisterSummary {
  month: string;
  month_label: string;
  total_days: number;
  present_marks: number;
  leave_marks: number;
  pending_marks: number;
  absent_marks: number;
  rejected_marks: number;
  week_off_marks: number;
  holiday_marks: number;
  total_work_hours: number;
  shortfall_days: number;
}

const CODE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  P: { bg: "#DEF7EC", text: "#03543F", label: "Present" },
  IP: { bg: "#E1EFFE", text: "#1E429F", label: "In Progress" },
  PR: { bg: "#FEF08A", text: "#713F12", label: "Pending Review" },
  RJ: { bg: "#FDE8E8", text: "#9B1C1C", label: "Rejected" },
  L: { bg: "#EDEBFE", text: "#5521B5", label: "Leave" },
  H: { bg: "#E6FFFA", text: "#234E52", label: "Holiday" },
  WO: { bg: "#F1F5F9", text: "#475569", label: "Weekly Off" },
  A: { bg: "#FEE2E2", text: "#991B1B", label: "Absent" },
  "--": { bg: "#F8FAFC", text: "#94A3B8", label: "Upcoming" },
};

type ViewMode = "register" | "logs";
type FilterRange = "this_month" | "last_month" | "all";

export default function HistoryScreen() {
  const [viewMode, setViewMode] = useState<ViewMode>("register");

  // Monthly Register States
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
  const [registerLoading, setRegisterLoading] = useState(true);
  const [registerSummary, setRegisterSummary] = useState<RegisterSummary | null>(null);
  const [registerCells, setRegisterCells] = useState<RegisterCell[]>([]);
  const [selectedCell, setSelectedCell] = useState<RegisterCell | null>(null);

  // Punch Logs States
  const [logsLoading, setLogsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [filterRange, setFilterRange] = useState<FilterRange>("this_month");

  // Attendance Regularization States
  const [selectedRecord, setSelectedRecord] = useState<HistoryRecord | null>(null);
  const [regularizeTime, setRegularizeTime] = useState("");
  const [regularizeReason, setRegularizeReason] = useState("");
  const [regularizing, setRegularizing] = useState(false);

  // 1. Fetch Monthly Register
  const fetchMonthlyRegister = useCallback(async (monthStr: string, showLoader = true) => {
    if (showLoader) setRegisterLoading(true);
    try {
      const res = await api.get("/attendance/my-register/", {
        params: { month: monthStr },
      });
      const data = res.data?.data || res.data || {};
      setRegisterSummary(data.summary || null);
      setRegisterCells(Array.isArray(data.cells) ? data.cells : []);
    } catch (err: any) {
      console.error("Monthly register fetch error:", err);
      Alert.alert("Sync Error", err?.response?.data?.error || "Unable to load your monthly attendance register.");
    } finally {
      setRegisterLoading(false);
      setRefreshing(false);
    }
  }, []);

  // 2. Fetch Punch Logs
  const getDateParams = (range: FilterRange) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    if (range === "this_month") {
      const year = now.getFullYear();
      const month = pad(now.getMonth() + 1);
      const day = pad(now.getDate());
      return { start_date: `${year}-${month}-01`, end_date: `${year}-${month}-${day}` };
    } else if (range === "last_month") {
      const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const year = prevDate.getFullYear();
      const month = pad(prevDate.getMonth() + 1);
      const lastDay = pad(new Date(year, prevDate.getMonth() + 1, 0).getDate());
      return { start_date: `${year}-${month}-01`, end_date: `${year}-${month}-${lastDay}` };
    }
    return {};
  };

  const [historyCursor, setHistoryCursor] = useState<string | null>(null);

  const fetchHistory = useCallback(
    async (pageToFetch = 1, showLoader = true, range = filterRange, cursorToken: string | null = null) => {
      if (showLoader) {
        if (pageToFetch === 1) setLogsLoading(true);
        else setLoadingMore(true);
      }
      try {
        const dateParams = getDateParams(range);
        const res = await api.get("/attendance/history/", {
          params: {
            cursor_mode: "true",
            limit: 20,
            ...(pageToFetch > 1 && cursorToken ? { cursor: cursorToken } : {}),
            ...dateParams,
          },
        });
        const responseData = res.data;
        const rawRecords = Array.isArray(responseData)
          ? responseData
          : Array.isArray(responseData?.records)
          ? responseData.records
          : Array.isArray(responseData?.data)
          ? responseData.data
          : [];
        const attendanceOnly: HistoryRecord[] = rawRecords.filter(
          (r: any) => r.status !== "leave" && r.punch_in_status !== "leave" && r.punch_out_status !== "leave"
        );
        if (pageToFetch === 1) {
          setHistory(attendanceOnly);
        } else {
          setHistory((prev) => {
            const seen = new Set(prev.map((x) => x.id));
            return [...prev, ...attendanceOnly.filter((x) => !seen.has(x.id))];
          });
        }
        const pagination = responseData?.pagination;
        setHistoryCursor(pagination?.nextCursor || null);
        setHasMore(Boolean(pagination?.hasMore ?? pagination?.hasNextPage));
        setPage(pageToFetch);
      } catch (err: any) {
        console.error("History fetch error:", err);
      } finally {
        setLogsLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [filterRange]
  );

  useEffect(() => {
    const t = setTimeout(() => { void fetchMonthlyRegister(selectedMonth, true); }, 0);
    return () => clearTimeout(t);
  }, [fetchMonthlyRegister, selectedMonth]);

  useEffect(() => {
    const t = setTimeout(() => { void fetchHistory(1, true, filterRange); }, 0);
    return () => clearTimeout(t);
  }, [fetchHistory, filterRange]);

  // Real-Time Handlers
  useRealtime("attendance_update", () => {
    fetchMonthlyRegister(selectedMonth, false);
    fetchHistory(1, false, filterRange);
  });
  useRealtime("leave_update", () => {
    fetchMonthlyRegister(selectedMonth, false);
    fetchHistory(1, false, filterRange);
  });
  useRealtime("realtime:connected", () => {
    fetchMonthlyRegister(selectedMonth, false);
    fetchHistory(1, false, filterRange);
  });

  const onRefresh = () => {
    setRefreshing(true);
    if (viewMode === "register") {
      fetchMonthlyRegister(selectedMonth, false);
    } else {
      fetchHistory(1, false, filterRange);
    }
  };

  const handlePrevMonth = () => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const prev = new Date(y, m - 2, 1);
    const prevStr = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
    setSelectedMonth(prevStr);
  };

  const handleNextMonth = () => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const next = new Date(y, m, 1);
    const nextStr = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`;
    setSelectedMonth(nextStr);
  };

  const handleOpenRegularizeFromCell = (cell: RegisterCell) => {
    setSelectedCell(null);
    setSelectedRecord({
      id: cell.attendance_id || 0,
      date: cell.date,
      punch_in: cell.punch_in,
      punch_out: null,
      punch_in_status: "approved",
      punch_out_status: null,
      work_hours: 0,
    });
    setRegularizeTime("18:00");
    setRegularizeReason("");
  };

  const handleSubmitRegularize = async () => {
    if (!selectedRecord || !selectedRecord.id) {
      Alert.alert("Missing Record", "No attendance record found to regularize.");
      return;
    }
    const cleanTime = regularizeTime.trim();
    const cleanReason = regularizeReason.trim();
    if (!cleanTime || !cleanReason) {
      Alert.alert("Required Fields", "Please provide punch out time and reason.");
      return;
    }
    setRegularizing(true);
    try {
      await api.post("/attendance/regularize/", {
        attendance_id: selectedRecord.id,
        punch_out_time: cleanTime,
        reason: cleanReason,
      });
      Alert.alert("Submitted", "Regularization request submitted successfully for approval.");
      setSelectedRecord(null);
      fetchMonthlyRegister(selectedMonth, false);
      fetchHistory(1, false, filterRange);
    } catch (err: any) {
      Alert.alert("Submission Failed", err?.response?.data?.error || "Unable to regularize.");
    } finally {
      setRegularizing(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      {/* View Switcher Header Bar */}
      <View style={styles.topTabBar}>
        <TouchableOpacity
          style={[styles.topTabBtn, viewMode === "register" && styles.topTabBtnActive]}
          onPress={() => setViewMode("register")}
        >
          <CalendarDays size={16} color={viewMode === "register" ? "#2457D6" : "#68758A"} />
          <Text style={[styles.topTabText, viewMode === "register" && styles.topTabTextActive]}>
            Monthly Register
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.topTabBtn, viewMode === "logs" && styles.topTabBtnActive]}
          onPress={() => setViewMode("logs")}
        >
          <Clock3 size={16} color={viewMode === "logs" ? "#2457D6" : "#68758A"} />
          <Text style={[styles.topTabText, viewMode === "logs" && styles.topTabTextActive]}>
            Punch Logs
          </Text>
        </TouchableOpacity>
      </View>

      {/* VIEW MODE 1: MONTHLY REGISTER */}
      {viewMode === "register" ? (
        <ScrollView
          contentContainerStyle={styles.scrollContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2457D6" />}
        >
          {/* Month Navigation Control */}
          <View style={styles.monthNavCard}>
            <TouchableOpacity onPress={handlePrevMonth} style={styles.navArrowBtn}>
              <ChevronLeft size={20} color="#152238" />
            </TouchableOpacity>

            <View style={styles.monthLabelContainer}>
              <Calendar size={16} color="#2457D6" style={{ marginRight: 6 }} />
              <Text style={styles.monthLabelText}>
                {registerSummary?.month_label || selectedMonth}
              </Text>
            </View>

            <TouchableOpacity onPress={handleNextMonth} style={styles.navArrowBtn}>
              <ChevronRight size={20} color="#152238" />
            </TouchableOpacity>
          </View>

          {/* Overview Stat Counters (Horizontal Grid) */}
          {registerSummary && (
            <View style={styles.summaryGrid}>
              <View style={[styles.summaryTile, { borderColor: "#A7F3D0" }]}>
                <Text style={styles.summaryTileLabel}>PRESENT</Text>
                <Text style={[styles.summaryTileVal, { color: "#059669" }]}>
                  {registerSummary.present_marks}
                </Text>
                <Text style={styles.summaryTileSub}>days</Text>
              </View>

              <View style={[styles.summaryTile, { borderColor: "#FECDD3" }]}>
                <Text style={styles.summaryTileLabel}>ABSENT</Text>
                <Text style={[styles.summaryTileVal, { color: "#E11D48" }]}>
                  {registerSummary.absent_marks}
                </Text>
                <Text style={styles.summaryTileSub}>days</Text>
              </View>

              <View style={[styles.summaryTile, { borderColor: "#DDD6FE" }]}>
                <Text style={styles.summaryTileLabel}>LEAVES</Text>
                <Text style={[styles.summaryTileVal, { color: "#7C3AED" }]}>
                  {registerSummary.leave_marks}
                </Text>
                <Text style={styles.summaryTileSub}>approved</Text>
              </View>

              <View style={[styles.summaryTile, { borderColor: "#99F6E4" }]}>
                <Text style={styles.summaryTileLabel}>HOLIDAYS</Text>
                <Text style={[styles.summaryTileVal, { color: "#0D9488" }]}>
                  {registerSummary.holiday_marks}
                </Text>
                <Text style={styles.summaryTileSub}>paid</Text>
              </View>

              <View style={[styles.summaryTile, { borderColor: "#E2E8F0" }]}>
                <Text style={styles.summaryTileLabel}>WEEK OFFS</Text>
                <Text style={[styles.summaryTileVal, { color: "#475569" }]}>
                  {registerSummary.week_off_marks}
                </Text>
                <Text style={styles.summaryTileSub}>rest days</Text>
              </View>

              <View style={[styles.summaryTile, { borderColor: "#FEF08A" }]}>
                <Text style={styles.summaryTileLabel}>PENDING</Text>
                <Text style={[styles.summaryTileVal, { color: "#CA8A04" }]}>
                  {registerSummary.pending_marks}
                </Text>
                <Text style={styles.summaryTileSub}>in review</Text>
              </View>

              <View style={[styles.summaryTile, { borderColor: "#BFDBFE" }]}>
                <Text style={styles.summaryTileLabel}>HOURS</Text>
                <Text style={[styles.summaryTileVal, { color: "#2563EB" }]}>
                  {registerSummary.total_work_hours}h
                </Text>
                <Text style={styles.summaryTileSub}>logged</Text>
              </View>

              <View style={[styles.summaryTile, { borderColor: "#FED7AA" }]}>
                <Text style={styles.summaryTileLabel}>SHORTFALL</Text>
                <Text style={[styles.summaryTileVal, { color: "#EA580C" }]}>
                  {registerSummary.shortfall_days}
                </Text>
                <Text style={styles.summaryTileSub}>&lt; 8h shifts</Text>
              </View>
            </View>
          )}

          {/* Legend Banner */}
          <View style={styles.legendBanner}>
            <Text style={styles.legendTitle}>LEGEND:</Text>
            <View style={styles.legendItemsRow}>
              {Object.entries(CODE_COLORS).map(([code, cfg]) => (
                <View key={code} style={[styles.legendPill, { backgroundColor: cfg.bg }]}>
                  <Text style={[styles.legendText, { color: cfg.text }]}>
                    {code}: {cfg.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Register Sheet - Day-by-Day Cards */}
          <View style={styles.sheetSection}>
            <Text style={styles.sheetHeaderTitle}>DAY-BY-DAY ATTENDANCE RECORD</Text>
            <Text style={styles.sheetHeaderSub}>Tap any day to view details, photos, or regularize punch.</Text>

            {registerLoading ? (
              <View style={styles.centerLoading}>
                <ActivityIndicator size="large" color="#2457D6" />
                <Text style={styles.loadingText}>Loading monthly register...</Text>
              </View>
            ) : registerCells.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No records found for this month.</Text>
              </View>
            ) : (
              registerCells.map((cell) => {
                const colorCfg = CODE_COLORS[cell.code] || CODE_COLORS["--"];
                const isSunday = cell.weekday === "Sun" || cell.is_week_off;

                return (
                  <TouchableOpacity
                    key={cell.date}
                    style={[styles.dayCard, isSunday && styles.dayCardSunday]}
                    activeOpacity={0.7}
                    onPress={() => setSelectedCell(cell)}
                  >
                    {/* Left: Date Block */}
                    <View style={styles.dayDateBlock}>
                      <Text style={styles.dayNumText}>{String(cell.day).padStart(2, "0")}</Text>
                      <Text style={styles.dayWeekdayText}>{cell.weekday}</Text>
                    </View>

                    {/* Middle: In / Out Details */}
                    <View style={styles.dayInfoBlock}>
                      {cell.code === "P" || cell.code === "IP" || cell.code === "PR" ? (
                        <>
                          <View style={styles.timeRow}>
                            <Text style={styles.timeSub}>In: </Text>
                            <Text style={styles.timeMain}>{cell.punch_in || "--"}</Text>
                            <Text style={styles.timeDivider}> • </Text>
                            <Text style={styles.timeSub}>Out: </Text>
                            <Text style={styles.timeMain}>{cell.punch_out || "--"}</Text>
                          </View>
                          <Text style={styles.hoursText}>
                            {cell.work_hours > 0 ? `${cell.work_hours.toFixed(1)} hrs worked` : "Session in progress"}
                          </Text>
                        </>
                      ) : cell.code === "H" ? (
                        <Text style={styles.holidayDescText}>{cell.holiday_name || "Company Holiday"}</Text>
                      ) : cell.code === "L" ? (
                        <Text style={styles.leaveDescText}>{cell.leave_type ? `${cell.leave_type.toUpperCase()} Leave` : "Approved Leave"}</Text>
                      ) : cell.code === "WO" ? (
                        <Text style={styles.woDescText}>Weekly Rest Day</Text>
                      ) : cell.code === "A" ? (
                        <Text style={styles.absentDescText}>No punch recorded</Text>
                      ) : (
                        <Text style={styles.upcomingDescText}>Upcoming schedule</Text>
                      )}
                    </View>

                    {/* Right: Code Badge */}
                    <View style={[styles.codeBadge, { backgroundColor: colorCfg.bg }]}>
                      <Text style={[styles.codeBadgeText, { color: colorCfg.text }]}>{cell.code}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </ScrollView>
      ) : (
        /* VIEW MODE 2: PUNCH LOGS */
        <View style={{ flex: 1 }}>
          <View style={styles.filterBar}>
            <TouchableOpacity
              style={[styles.filterPill, filterRange === "this_month" && styles.filterPillActive]}
              onPress={() => setFilterRange("this_month")}
            >
              <Text style={[styles.filterText, filterRange === "this_month" && styles.filterTextActive]}>
                This Month
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterPill, filterRange === "last_month" && styles.filterPillActive]}
              onPress={() => setFilterRange("last_month")}
            >
              <Text style={[styles.filterText, filterRange === "last_month" && styles.filterTextActive]}>
                Last Month
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterPill, filterRange === "all" && styles.filterPillActive]}
              onPress={() => setFilterRange("all")}
            >
              <Text style={[styles.filterText, filterRange === "all" && styles.filterTextActive]}>
                All History
              </Text>
            </TouchableOpacity>
          </View>

          {logsLoading && page === 1 ? (
            <View style={styles.centerLoading}>
              <ActivityIndicator size="large" color="#2457D6" />
            </View>
          ) : (
            <FlatList
              data={history}
              keyExtractor={(item) => String(item.id)}
              contentContainerStyle={styles.listContent}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2457D6" />}
              onEndReached={() => {
                if (!logsLoading && !loadingMore && hasMore && historyCursor) {
                  void fetchHistory(page + 1, true, filterRange, historyCursor);
                }
              }}
              onEndReachedThreshold={0.3}
              renderItem={({ item }) => (
                <View style={styles.logCard}>
                  <View style={styles.logCardHeader}>
                    <View style={styles.dateRow}>
                      <Calendar size={15} color="#2457D6" />
                      <Text style={styles.dateText}>{formatCompanyDate(item.date)}</Text>
                    </View>
                    <View style={[styles.logBadge, item.punch_out ? styles.badgeSuccess : styles.badgeWarning]}>
                      <Text style={item.punch_out ? styles.textSuccess : styles.textWarning}>
                        {item.punch_out ? "Completed" : "Active Session"}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.logCardBody}>
                    <View style={styles.logSection}>
                      <Text style={styles.logLabel}>In</Text>
                      <Text style={styles.logVal}>{item.punch_in || "--"}</Text>
                    </View>
                    <View style={styles.logSection}>
                      <Text style={styles.logLabel}>Out</Text>
                      <Text style={styles.logVal}>{item.punch_out || "--"}</Text>
                    </View>
                    <View style={styles.logSection}>
                      <Text style={styles.logLabel}>Hours</Text>
                      <Text style={styles.logVal}>{Number(item.work_hours || 0).toFixed(1)}h</Text>
                    </View>
                  </View>

                  {(!item.punch_out || item.punch_out === "Pending") && (
                    <TouchableOpacity
                      style={styles.logRegBtn}
                      onPress={() => {
                        setSelectedRecord(item);
                        setRegularizeTime("18:00");
                        setRegularizeReason("");
                      }}
                    >
                      <Text style={styles.logRegBtnText}>Regularize Punch Out</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            />
          )}
        </View>
      )}

      {/* DAY DETAIL INSPECTION MODAL */}
      <Modal visible={!!selectedCell} transparent animationType="fade" onRequestClose={() => setSelectedCell(null)}>
        <View style={styles.modalBackdrop}>
          {selectedCell && (
            <View style={styles.detailModal}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalEyebrow}>ATTENDANCE DETAIL</Text>
                  <Text style={styles.modalTitle}>
                    {formatCompanyDate(selectedCell.date)} ({selectedCell.weekday})
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedCell(null)} style={styles.closeBtn}>
                  <X size={20} color="#68758A" />
                </TouchableOpacity>
              </View>

              <View style={styles.modalBody}>
                {/* Status Badge Row */}
                <View style={styles.modalStatusRow}>
                  <Text style={styles.modalStatusLabel}>Register Status</Text>
                  <View style={[styles.codeBadge, { backgroundColor: CODE_COLORS[selectedCell.code]?.bg || "#F1F5F9" }]}>
                    <Text style={[styles.codeBadgeText, { color: CODE_COLORS[selectedCell.code]?.text || "#1E293B" }]}>
                      {selectedCell.code} – {CODE_COLORS[selectedCell.code]?.label}
                    </Text>
                  </View>
                </View>

                {/* Timings Grid */}
                <View style={styles.modalTimingsGrid}>
                  <View style={styles.modalTimingBox}>
                    <Text style={styles.modalTimingSub}>PUNCH IN</Text>
                    <Text style={styles.modalTimingVal}>{selectedCell.punch_in || "--"}</Text>
                  </View>
                  <View style={styles.modalTimingBox}>
                    <Text style={styles.modalTimingSub}>PUNCH OUT</Text>
                    <Text style={styles.modalTimingVal}>{selectedCell.punch_out || "--"}</Text>
                  </View>
                  <View style={[styles.modalTimingBox, { backgroundColor: "#EAF0FF" }]}>
                    <Text style={[styles.modalTimingSub, { color: "#2457D6" }]}>HOURS</Text>
                    <Text style={[styles.modalTimingVal, { color: "#2457D6" }]}>
                      {selectedCell.work_hours > 0 ? `${selectedCell.work_hours.toFixed(1)}h` : "--"}
                    </Text>
                  </View>
                </View>

                {/* Holiday / Leave Info */}
                {selectedCell.holiday_name && (
                  <View style={styles.holidayBanner}>
                    <Sun size={16} color="#0D9488" />
                    <Text style={styles.holidayBannerText}>Paid Holiday: {selectedCell.holiday_name}</Text>
                  </View>
                )}

                {selectedCell.leave_type && (
                  <View style={styles.leaveBanner}>
                    <FileText size={16} color="#6D28D9" />
                    <Text style={styles.leaveBannerText}>Approved Leave: {selectedCell.leave_type.toUpperCase()}</Text>
                  </View>
                )}

                {/* Punch Photos */}
                <View style={styles.photosRow}>
                  <View style={styles.photoBox}>
                    <Text style={styles.photoLabel}>Clock In Photo</Text>
                    {selectedCell.punch_in_photo ? (
                      <Image source={{ uri: selectedCell.punch_in_photo }} style={styles.punchImg} />
                    ) : (
                      <View style={styles.noPhotoBox}><Text style={styles.noPhotoText}>No photo</Text></View>
                    )}
                  </View>
                  <View style={styles.photoBox}>
                    <Text style={styles.photoLabel}>Clock Out Photo</Text>
                    {selectedCell.punch_out_photo ? (
                      <Image source={{ uri: selectedCell.punch_out_photo }} style={styles.punchImg} />
                    ) : (
                      <View style={styles.noPhotoBox}><Text style={styles.noPhotoText}>No photo</Text></View>
                    )}
                  </View>
                </View>

                {/* Regularize Action Button */}
                {selectedCell.attendance_id && (!selectedCell.punch_out || selectedCell.punch_out === "--") && (
                  <TouchableOpacity
                    style={styles.modalRegBtn}
                    onPress={() => handleOpenRegularizeFromCell(selectedCell)}
                  >
                    <Clock size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.modalRegBtnText}>Regularize Missed Punch Out</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* REGULARIZATION FORM MODAL */}
      <Modal visible={!!selectedRecord} transparent animationType="slide" onRequestClose={() => setSelectedRecord(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.detailModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Regularize Attendance</Text>
              <TouchableOpacity onPress={() => setSelectedRecord(null)}>
                <X size={20} color="#68758A" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>Punch Out Time (HH:mm)</Text>
              <TextInput
                style={styles.input}
                value={regularizeTime}
                onChangeText={setRegularizeTime}
                placeholder="e.g. 18:00"
              />

              <Text style={styles.inputLabel}>Reason for Regularization</Text>
              <TextInput
                style={[styles.input, { height: 80 }]}
                value={regularizeReason}
                onChangeText={setRegularizeReason}
                placeholder="Reason for missing punch out..."
                multiline
              />

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setSelectedRecord(null)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.submitBtn} onPress={handleSubmitRegularize} disabled={regularizing}>
                  {regularizing ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.submitBtnText}>Submit</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F6F8FC" },
  topTabBar: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5EAF2",
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 8,
  },
  topTabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    gap: 6,
  },
  topTabBtnActive: { backgroundColor: "#EAF0FF" },
  topTabText: { fontSize: 13, fontWeight: "700", color: "#68758A" },
  topTabTextActive: { color: "#2457D6" },

  scrollContainer: { padding: 16, paddingBottom: 40 },
  monthNavCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#E5EAF2",
    padding: 12,
    marginBottom: 14,
  },
  navArrowBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  monthLabelContainer: { flexDirection: "row", alignItems: "center" },
  monthLabelText: { fontSize: 16, fontWeight: "800", color: "#152238" },

  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  summaryTile: {
    width: "23%",
    minWidth: 74,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    padding: 8,
    alignItems: "center",
  },
  summaryTileLabel: { fontSize: 9, fontWeight: "800", color: "#68758A", letterSpacing: 0.5 },
  summaryTileVal: { fontSize: 16, fontWeight: "900", marginTop: 2 },
  summaryTileSub: { fontSize: 9, color: "#94A3B8" },

  legendBanner: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5EAF2",
    padding: 10,
    marginBottom: 16,
  },
  legendTitle: { fontSize: 10, fontWeight: "800", color: "#68758A", marginBottom: 6 },
  legendItemsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  legendPill: { paddingHorizontal: 7, paddingVertical: 2.5, borderRadius: 6 },
  legendText: { fontSize: 10, fontWeight: "700" },

  sheetSection: { marginBottom: 20 },
  sheetHeaderTitle: { fontSize: 12, fontWeight: "800", color: "#68758A", letterSpacing: 0.8 },
  sheetHeaderSub: { fontSize: 11, color: "#94A3B8", marginTop: 2, marginBottom: 10 },

  centerLoading: { padding: 40, alignItems: "center", justifyContent: "center" },
  loadingText: { marginTop: 8, color: "#68758A", fontSize: 12 },
  emptyCard: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 24, alignItems: "center" },
  emptyText: { color: "#68758A", fontSize: 13 },

  dayCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E5EAF2",
    padding: 12,
    marginBottom: 8,
  },
  dayCardSunday: { backgroundColor: "#F8FAFC" },
  dayDateBlock: { width: 50, alignItems: "center", borderRightWidth: 1, borderRightColor: "#EDF1F6", paddingRight: 8 },
  dayNumText: { fontSize: 16, fontWeight: "900", color: "#152238" },
  dayWeekdayText: { fontSize: 11, fontWeight: "700", color: "#8995A7", textTransform: "uppercase" },
  dayInfoBlock: { flex: 1, paddingHorizontal: 12 },
  timeRow: { flexDirection: "row", alignItems: "center" },
  timeSub: { fontSize: 11, color: "#8995A7" },
  timeMain: { fontSize: 12, fontWeight: "700", color: "#152238" },
  timeDivider: { fontSize: 11, color: "#CBD5E1" },
  hoursText: { fontSize: 11, color: "#2457D6", fontWeight: "700", marginTop: 2 },
  holidayDescText: { fontSize: 12, fontWeight: "700", color: "#0D9488" },
  leaveDescText: { fontSize: 12, fontWeight: "700", color: "#6D28D9" },
  woDescText: { fontSize: 12, fontWeight: "600", color: "#64748B" },
  absentDescText: { fontSize: 12, fontWeight: "700", color: "#DC2626" },
  upcomingDescText: { fontSize: 12, color: "#94A3B8" },

  codeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  codeBadgeText: { fontSize: 12, fontWeight: "900" },

  // Log Card Styles
  filterBar: { flexDirection: "row", padding: 12, backgroundColor: "#FFFFFF", gap: 8, borderBottomWidth: 1, borderBottomColor: "#E5EAF2" },
  filterPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: "#F1F5F9" },
  filterPillActive: { backgroundColor: "#EAF0FF" },
  filterText: { fontSize: 12, color: "#68758A", fontWeight: "600" },
  filterTextActive: { color: "#2457D6", fontWeight: "700" },
  listContent: { padding: 16, paddingBottom: 40 },
  logCard: { backgroundColor: "#FFFFFF", borderRadius: 16, borderWidth: 1, borderColor: "#E5EAF2", padding: 14, marginBottom: 12 },
  logCardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#EDF1F6", paddingBottom: 8, marginBottom: 10 },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dateText: { fontSize: 13, fontWeight: "700", color: "#152238" },
  logBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  badgeSuccess: { backgroundColor: "#DEF7EC" },
  badgeWarning: { backgroundColor: "#FEF08A" },
  textSuccess: { color: "#03543F", fontSize: 11, fontWeight: "700" },
  textWarning: { color: "#713F12", fontSize: 11, fontWeight: "700" },
  logCardBody: { flexDirection: "row", justifyContent: "space-between", marginVertical: 4 },
  logSection: { alignItems: "center" },
  logLabel: { fontSize: 10, color: "#8995A7", textTransform: "uppercase" },
  logVal: { fontSize: 13, fontWeight: "700", color: "#152238", marginTop: 2 },
  logRegBtn: { marginTop: 10, paddingVertical: 7, borderRadius: 8, backgroundColor: "#EAF0FF", alignItems: "center" },
  logRegBtnText: { color: "#2457D6", fontSize: 12, fontWeight: "700" },

  // Modal Styles
  modalBackdrop: { flex: 1, backgroundColor: "rgba(15, 23, 42, 0.5)", justifyContent: "center", padding: 16 },
  detailModal: { backgroundColor: "#FFFFFF", borderRadius: 20, overflow: "hidden" },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: "#EDF1F6", backgroundColor: "#F8FAFC" },
  modalEyebrow: { fontSize: 10, fontWeight: "800", color: "#2457D6", letterSpacing: 0.5 },
  modalTitle: { fontSize: 16, fontWeight: "800", color: "#152238", marginTop: 2 },
  closeBtn: { padding: 4 },
  modalBody: { padding: 16 },
  modalStatusRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  modalStatusLabel: { fontSize: 13, fontWeight: "700", color: "#475569" },
  modalTimingsGrid: { flexDirection: "row", gap: 8, marginBottom: 12 },
  modalTimingBox: { flex: 1, backgroundColor: "#F8FAFC", borderRadius: 12, padding: 10, alignItems: "center" },
  modalTimingSub: { fontSize: 9, fontWeight: "800", color: "#8995A7" },
  modalTimingVal: { fontSize: 14, fontWeight: "800", color: "#152238", marginTop: 2 },
  holidayBanner: { flexDirection: "row", alignItems: "center", backgroundColor: "#F0FDFA", padding: 10, borderRadius: 10, gap: 8, marginBottom: 10 },
  holidayBannerText: { fontSize: 12, fontWeight: "700", color: "#0F766E" },
  leaveBanner: { flexDirection: "row", alignItems: "center", backgroundColor: "#FAF5FF", padding: 10, borderRadius: 10, gap: 8, marginBottom: 10 },
  leaveBannerText: { fontSize: 12, fontWeight: "700", color: "#7E22CE" },
  photosRow: { flexDirection: "row", gap: 10, marginVertical: 8 },
  photoBox: { flex: 1 },
  photoLabel: { fontSize: 11, fontWeight: "700", color: "#64748B", marginBottom: 4 },
  punchImg: { width: "100%", height: 110, borderRadius: 10 },
  noPhotoBox: { width: "100%", height: 70, backgroundColor: "#F1F5F9", borderRadius: 10, alignItems: "center", justifyContent: "center" },
  noPhotoText: { fontSize: 11, color: "#94A3B8" },
  modalRegBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", backgroundColor: "#2457D6", paddingVertical: 12, borderRadius: 12, marginTop: 12 },
  modalRegBtnText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },

  inputLabel: { fontSize: 12, fontWeight: "700", color: "#475569", marginBottom: 4, marginTop: 10 },
  input: { borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 10, padding: 10, fontSize: 14 },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 16 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10 },
  cancelBtnText: { color: "#64748B", fontWeight: "700" },
  submitBtn: { backgroundColor: "#2457D6", paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10 },
  submitBtnText: { color: "#FFFFFF", fontWeight: "700" },
});
