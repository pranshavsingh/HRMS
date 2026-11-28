import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "../../context/AuthContext";
import api from "../../services/api";
import { useRealtime } from "../../context/RealtimeContext";
import PaginatedFlatList from "../../components/pagination/PaginatedFlatList";
import { useCursorPagination } from "../../hooks/useCursorPagination";
import { 
  Calendar, 
  FileText, 
  Clock3, 
  ShieldCheck, 
  Plus, 
  X, 
  ChevronLeft, 
  ChevronRight,
  Send,
  AlertTriangle
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatCompanyDate, formatCompanyDateRange } from "../../utils/date";

interface LeaveRecord {
  id: number;
  leave_type: string;
  from: string;
  to: string;
  reason: string;
  status: string;
  applied_at: string;
}

export default function LeaveScreen() {
  const { user, isAuthenticated } = useAuth();
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const [submitting, setSubmitting] = useState(false);

  const [summary, setSummary] = useState({
    leave_allotted: 0,
    leaves_taken: 0,
    leave_balance: 0,
    pending: 0,
    management_concession: 0,
    pending_leave_days: 0,
  });

  const [form, setForm] = useState({
    leave_type: "casual",
    from_date: todayStr,
    to_date: todayStr,
    reason: "",
  });

  const [availableLeaveTypes, setAvailableLeaveTypes] = useState<Array<{ leave_code: string; leave_name: string }>>([
    { leave_code: "casual", leave_name: "CASUAL" },
    { leave_code: "sick", leave_name: "SICK" },
    { leave_code: "paid", leave_name: "PAID" },
  ]);

  // Calendar picker modal state
  const [calendarTarget, setCalendarTarget] = useState<"from" | "to" | null>(null);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth()); // 0-11

  const {
    items: leaves,
    loading,
    refreshing,
    loadingMore,
    error: leavesError,
    hasMore,
    refresh: refreshLeaves,
    loadMore: loadMoreLeaves,
    retry: retryLeaves,
  } = useCursorPagination<LeaveRecord>({
    endpoint: "/leave/my/",
    limit: 20,
    itemsKey: "records",
    enabled: Boolean(user && isAuthenticated),
    getItemKey: (l) => l.id,
    onData: (pageRes) => {
      const apiSummary = pageRes.raw?.summary;
      if (apiSummary) {
        setSummary({
          leave_allotted: Number(apiSummary.leave_allotted || 0),
          leaves_taken: Number(apiSummary.leaves_taken || 0),
          leave_balance: Number(apiSummary.leave_balance || 0),
          pending: Number(apiSummary.pending_requests || 0),
          management_concession: Number(apiSummary.management_concession || 0),
          pending_leave_days: Number(apiSummary.pending_leave_days || 0),
        });
      }
    },
  });

  const fetchLeaveTypes = useCallback(async () => {
    if (!user || !isAuthenticated) return;
    try {
      const typesRes = await api.get("/leave/policy/available-types/").catch(() => ({ data: { leave_types: [] } }));
      const policyTypes = Array.isArray(typesRes.data?.leave_types) ? typesRes.data.leave_types : [];
      if (policyTypes.length > 0) {
        const mapped = policyTypes.map((t: any) => ({
          leave_code: String(t.leave_code),
          leave_name: String(t.leave_name || t.leave_code).toUpperCase(),
        }));
        setAvailableLeaveTypes(mapped);
        setForm((prev) =>
          mapped.some((t: any) => t.leave_code === prev.leave_type)
            ? prev
            : { ...prev, leave_type: mapped[0].leave_code }
        );
      }
    } catch {}
  }, [user, isAuthenticated]);

  const fetchLeaveData = useCallback(async () => {
    await Promise.all([refreshLeaves(), fetchLeaveTypes()]);
  }, [refreshLeaves, fetchLeaveTypes]);

  useRealtime("leave_update", () => void refreshLeaves());
  useRealtime("realtime:connected", () => void fetchLeaveData());
  useRealtime("leave_notice", (notice: any) => {
    void refreshLeaves();
    if (notice?.status === "concession_granted") {
      Alert.alert("Leave Concession Granted", `${notice.additional_days} ${notice.leave_type} leave days granted. Updated balance: ${notice.updated_balance} days.`);
    } else if (notice?.status === "concession_reversed") {
      Alert.alert("Leave Concession Reversed", `Updated balance: ${notice.updated_balance} days.`);
    } else if (notice?.status === "approved" || notice?.status === "rejected") {
      Alert.alert("Leave Request Updated", `Your ${notice.leave_type} request was ${notice.status}. Updated balance: ${notice.updated_balance} days.`);
    }
  });

  useEffect(() => {
    const t = setTimeout(() => {
      void fetchLeaveTypes();
    }, 0);
    return () => clearTimeout(t);
  }, [fetchLeaveTypes]);

  const dayDifference = (from: string, to: string) => {
    if (!from || !to) return 0;
    const start = new Date(from);
    const end = new Date(to);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;
    return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  };

  const durationDays = useMemo(() => {
    return dayDifference(form.from_date, form.to_date);
  }, [form.from_date, form.to_date]);

  // Frontend leave overlap guard check
  const hasOverlap = useMemo(() => {
    if (!form.from_date || !form.to_date) return false;
    const reqFrom = form.from_date.slice(0, 10);
    const reqTo = form.to_date.slice(0, 10);
    return leaves.some((r: any) => {
      if (r.status !== "approved" && r.status !== "pending") return false;
      const existFrom = String(r.from || r.from_date || "").slice(0, 10);
      const existTo = String(r.to || r.to_date || "").slice(0, 10);
      if (!existFrom || !existTo) return false;
      return existFrom <= reqTo && existTo >= reqFrom;
    });
  }, [form.from_date, form.to_date, leaves]);

  const handleSubmit = async (confirmedBalance?: { available: number; projected: number; snapshot: string }) => {
    if (hasOverlap) {
      Alert.alert("Date Overlap", "Selected dates overlap with an existing approved or pending leave request.");
      return;
    }

    if (!form.reason.trim()) {
      Alert.alert("Field Missing", "Please enter a reason for your leave request.");
      return;
    }

    if (form.to_date < form.from_date) {
      Alert.alert("Invalid Range", "To date cannot be earlier than from date.");
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        leave_type: form.leave_type,
        from_date: form.from_date,
        to_date: form.to_date,
        reason: form.reason.trim(),
        confirm_insufficient_balance: Boolean(confirmedBalance),
        ...(confirmedBalance ? {
          confirmed_available_balance: confirmedBalance.available,
          confirmed_projected_balance: confirmedBalance.projected,
          confirmed_balance_snapshot: confirmedBalance.snapshot,
        } : {}),
      };

      const res = await api.post("/leave/apply/", payload);
      Alert.alert("Success", res.data.message || "Leave applied successfully.");
      setForm({
        leave_type: "casual",
        from_date: todayStr,
        to_date: todayStr,
        reason: "",
      });
      void fetchLeaveData();
    } catch (err: any) {
      console.error("Apply leave error", err);
      const detail = err.response?.data;
      if (err.response?.status === 409 && detail?.code === "INSUFFICIENT_LEAVE_BALANCE") {
        const available = Number(detail.current_available_balance);
        const requested = Number(detail.requested_days);
        const projected = Number(detail.projected_balance);
        Alert.alert(
          "Insufficient Leave Balance",
          `Your available leave balance is ${available} days, but you are requesting ${requested} days of leave. Submitting this application will result in a projected negative leave balance of ${projected} days.`,
          [
            { text: "Cancel Application", style: "cancel" },
            { text: "Continue & Submit", onPress: () => handleSubmit({ available, projected, snapshot: detail.confirmation_snapshot }) },
          ]
        );
        return;
      }
      const errMsg = err.response?.data?.error || "Failed to submit leave request.";
      Alert.alert("Submission Failure", errMsg);
    } finally {
      setSubmitting(false);
    }
  };

  // --- CALENDAR GENERATION HELPERS ---

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const daysOfWeek = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  const handleMonthChange = (direction: "prev" | "next") => {
    if (direction === "prev") {
      if (currentMonth === 0) {
        setCurrentMonth(11);
        setCurrentYear(y => y - 1);
      } else {
        setCurrentMonth(m => m - 1);
      }
    } else {
      if (currentMonth === 11) {
        setCurrentMonth(0);
        setCurrentYear(y => y + 1);
      } else {
        setCurrentMonth(m => m + 1);
      }
    }
  };

  const calendarDays = useMemo(() => {
    const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();

    const days = [];
    // Pad start of month
    for (let i = 0; i < firstDayIndex; i++) {
      days.push(null);
    }
    // Add month dates
    for (let d = 1; d <= totalDays; d++) {
      days.push(d);
    }
    return days;
  }, [currentYear, currentMonth]);

  const selectDate = (day: number | null) => {
    if (day === null) return;
    const yyyy = currentYear;
    const mm = String(currentMonth + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    const dateStr = `${yyyy}-${mm}-${dd}`;

    if (calendarTarget === "from") {
      setForm(prev => ({
        ...prev,
        from_date: dateStr,
        to_date: dateStr > prev.to_date ? dateStr : prev.to_date,
      }));
    } else if (calendarTarget === "to") {
      if (dateStr < form.from_date) {
        Alert.alert("Invalid Range", "To Date cannot be earlier than From Date.");
        return;
      }
      setForm(prev => ({ ...prev, to_date: dateStr }));
    }
    setCalendarTarget(null);
  };

  const headerContent = (
    <View>
      {/* Metric Overview Section */}
        <View style={styles.heroSection}>
          <View style={styles.heroPreRow}>
            <Calendar size={13} color="#2457D6" />
            <Text style={styles.heroPreText}>Leave Balances</Text>
          </View>
          <Text style={styles.heroTitle}>Time Off Requests</Text>

          <View style={styles.statsGrid}>
            <View style={styles.statTile}>
              <View style={[styles.statIconWrap, { backgroundColor: "#ECFDF5" }]}>
                <FileText size={16} color="#059669" />
              </View>
              <Text style={styles.statValue}>{summary.leave_allotted}</Text>
              <Text style={styles.statLabel}>Allotted</Text>
            </View>
            <View style={styles.statTile}>
              <View style={[styles.statIconWrap, { backgroundColor: "#F0FDF4" }]}>
                <ShieldCheck size={16} color="#16A34A" />
              </View>
              <Text style={styles.statValue}>{summary.leaves_taken}</Text>
              <Text style={styles.statLabel}>Taken</Text>
            </View>
            <View style={styles.statTile}>
              <View style={[styles.statIconWrap, { backgroundColor: "#EAF0FF" }]}>
                <Clock3 size={16} color="#2457D6" />
              </View>
              <Text style={[styles.statValue, { color: "#2457D6" }]}>{summary.leave_balance}</Text>
              <Text style={styles.statLabel}>Balance</Text>
            </View>
            <View style={styles.statTile}>
              <View style={[styles.statIconWrap, { backgroundColor: "#ECFDF5" }]}>
                <ShieldCheck size={16} color="#0D9488" />
              </View>
              <Text style={styles.statValue}>{summary.management_concession}</Text>
              <Text style={styles.statLabel}>Concession</Text>
            </View>
            <View style={styles.statTile}>
              <View style={[styles.statIconWrap, { backgroundColor: "#FFFBEB" }]}>
                <Calendar size={16} color="#D97706" />
              </View>
              <Text style={styles.statValue}>{summary.pending_leave_days}</Text>
              <Text style={styles.statLabel}>Pending days</Text>
            </View>
          </View>
        </View>

        {/* Apply for Leave Form Panel */}
        <View style={styles.formPanel}>
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>Request Time Off</Text>
            <View style={styles.formHeaderBadge}>
              <Plus size={18} color="#2457D6" />
            </View>
          </View>

          {/* Leave Type Dropdown */}
          <Text style={styles.inputLabel}>Leave Type</Text>
          <View style={styles.selectorRow}>
            {availableLeaveTypes.map((typeObj) => (
              <TouchableOpacity
                key={typeObj.leave_code}
                style={[styles.selectorBtn, form.leave_type === typeObj.leave_code && styles.selectorBtnActive]}
                onPress={() => setForm(prev => ({ ...prev, leave_type: typeObj.leave_code }))}
              >
                <Text style={[styles.selectorText, form.leave_type === typeObj.leave_code && styles.selectorTextActive]}>
                  {typeObj.leave_name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Date Picker Triggers */}
          <View style={styles.datePickerRow}>
            <View style={styles.datePickerContainer}>
              <Text style={styles.inputLabel}>From Date</Text>
              <TouchableOpacity
                style={styles.dateTrigger}
                onPress={() => {
                  setCalendarTarget("from");
                }}
              >
                <Calendar size={15} color="#68758A" />
                <Text style={styles.dateTriggerText}>{formatCompanyDate(form.from_date)}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.datePickerContainer}>
              <Text style={styles.inputLabel}>To Date</Text>
              <TouchableOpacity
                style={styles.dateTrigger}
                onPress={() => {
                  setCalendarTarget("to");
                }}
              >
                <Calendar size={15} color="#68758A" />
                <Text style={styles.dateTriggerText}>{formatCompanyDate(form.to_date)}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Requested Duration summary card */}
          <View style={styles.durationCard}>
            <Text style={styles.durationLabel}>Requested Duration</Text>
            <Text style={styles.durationValue}>
              {durationDays} Day{durationDays === 1 ? "" : "s"}
            </Text>
          </View>

          {/* Reason Input */}
          <Text style={styles.inputLabel}>Reason for Leave</Text>
          <TextInput
            style={styles.reasonInput}
            multiline
            numberOfLines={4}
            placeholder="Provide a clear, brief explanation for your request..."
            placeholderTextColor="#94A3B8"
            value={form.reason}
            onChangeText={val => setForm(prev => ({ ...prev, reason: val }))}
          />

          {hasOverlap && (
            <View style={styles.overlapWarning}>
              <AlertTriangle size={16} color="#DC2626" style={styles.warningIcon} />
              <Text style={styles.overlapWarningText}>
                Selected dates overlap with an existing approved or pending leave.
              </Text>
            </View>
          )}

          {/* Submit Trigger */}
          <TouchableOpacity
            style={[styles.submitBtn, (submitting || hasOverlap) && styles.submitBtnDisabled]}
            disabled={submitting || hasOverlap}
            onPress={() => handleSubmit()}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Send size={16} color="#ffffff" style={{ marginRight: 8 }} />
                <Text style={styles.submitBtnText}>Submit Request</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <Text style={[styles.listTitle, { marginBottom: 8 }]}>Leave History</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      <PaginatedFlatList
        items={leaves}
        loading={loading}
        refreshing={refreshing}
        loadingMore={loadingMore}
        hasMore={hasMore}
        error={leavesError}
        onRefresh={refreshLeaves}
        onLoadMore={loadMoreLeaves}
        onRetry={retryLeaves}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item: LeaveRecord) => String(item.id)}
        contentContainerStyle={styles.scrollContent}
        ListHeaderComponent={headerContent}
        emptyTitle="No leaves filed yet"
        emptySubtitle="Your leave applications will appear here."
        renderItem={({ item }: { item: LeaveRecord }) => {
          const days = dayDifference(item.from, item.to);
          const status = item.status?.toLowerCase() || "pending";
          return (
            <View style={[styles.historyRow, { backgroundColor: "#FFFFFF", paddingHorizontal: 14, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: "#E5EAF2" }]}>
              <View style={styles.historyMain}>
                <Text style={styles.historyType}>
                  {item.leave_type ? item.leave_type.toUpperCase() : "LEAVE"} - {days} Day{days === 1 ? "" : "s"}
                </Text>
                <Text style={styles.historyDates}>
                  {formatCompanyDateRange(item.from || (item as any).from_date, item.to || (item as any).to_date)}
                </Text>
                <Text style={styles.historyReason} numberOfLines={2}>
                  Reason: {item.reason}
                </Text>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  status === "approved"
                    ? styles.badgeApproved
                    : status === "rejected"
                    ? styles.badgeRejected
                    : styles.badgePending,
                ]}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    status === "approved"
                      ? styles.textApproved
                      : status === "rejected"
                      ? styles.textRejected
                      : styles.textPending,
                  ]}
                >
                  {status}
                </Text>
              </View>
            </View>
          );
        }}
      />

      {/* --- CUSTOM MONTH CALENDAR PICKER MODAL --- */}
      <Modal
        visible={calendarTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setCalendarTarget(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.calendarModal}>
            {/* Modal Header */}
            <View style={styles.calendarHeader}>
              <TouchableOpacity onPress={() => handleMonthChange("prev")} style={styles.arrowBtn}>
                <ChevronLeft size={20} color="#152238" />
              </TouchableOpacity>
              <Text style={styles.monthLabel}>
                {monthNames[currentMonth]} {currentYear}
              </Text>
              <TouchableOpacity onPress={() => handleMonthChange("next")} style={styles.arrowBtn}>
                <ChevronRight size={20} color="#152238" />
              </TouchableOpacity>
            </View>

            {/* Days Of Week row */}
            <View style={styles.weekRow}>
              {daysOfWeek.map(day => (
                <Text key={day} style={styles.weekLabel}>
                  {day}
                </Text>
              ))}
            </View>

            {/* Grid numbers */}
            <View style={styles.daysGrid}>
              {calendarDays.map((day, idx) => {
                const cellDateStr =
                  day !== null
                    ? `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                    : "";
                const isSelected =
                  day !== null &&
                  cellDateStr === (calendarTarget === "from" ? form.from_date : form.to_date);

                return (
                  <TouchableOpacity
                    key={idx}
                    style={[styles.dayCell, isSelected && styles.dayCellSelected]}
                    disabled={day === null}
                    onPress={() => selectDate(day)}
                  >
                    <Text style={[styles.dayText, isSelected && styles.dayTextSelected]}>
                      {day !== null ? day : ""}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Cancel Trigger */}
            <TouchableOpacity style={styles.closeModalBtn} onPress={() => setCalendarTarget(null)}>
              <X size={16} color="#475569" style={{ marginRight: 6 }} />
              <Text style={styles.closeModalText}>Cancel</Text>
            </TouchableOpacity>
          </View>
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#F6F8FC",
    alignItems: "center",
    justifyContent: "center",
  },
  // Overview Section
  heroSection: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E5EAF2",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  heroPreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  heroPreText: {
    color: "#2457D6",
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  heroTitle: {
    color: "#152238",
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statTile: {
    flexGrow: 1,
    minWidth: "30%",
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E5EAF2",
  },
  statIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  statLabel: {
    color: "#68758A",
    fontSize: 10,
    textTransform: "uppercase",
    fontWeight: "700",
    letterSpacing: 0.4,
    marginTop: 2,
  },
  statValue: {
    color: "#152238",
    fontSize: 18,
    fontWeight: "800",
  },
  // Form Panel
  formPanel: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E5EAF2",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  formHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  formHeaderBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#EAF0FF",
    alignItems: "center",
    justifyContent: "center",
  },
  formTitle: {
    color: "#152238",
    fontSize: 18,
    fontWeight: "800",
  },
  inputLabel: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 8,
    marginTop: 12,
  },
  selectorRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    backgroundColor: "#F1F5F9",
    borderRadius: 14,
    padding: 4,
  },
  selectorBtn: {
    flex: 1,
    minWidth: "28%",
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
    borderRadius: 10,
  },
  selectorBtnActive: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  selectorText: {
    color: "#68758A",
    fontSize: 12,
    fontWeight: "700",
  },
  selectorTextActive: {
    color: "#2457D6",
  },
  datePickerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  datePickerContainer: {
    width: "48%",
  },
  dateTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  dateTriggerText: {
    color: "#152238",
    fontSize: 13,
    fontWeight: "700",
  },
  durationCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#F0F5FF",
    borderWidth: 1,
    borderColor: "#DBEAFE",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginVertical: 14,
  },
  durationLabel: {
    color: "#1E40AF",
    fontSize: 11,
    textTransform: "uppercase",
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  durationValue: {
    color: "#2457D6",
    fontSize: 16,
    fontWeight: "800",
  },
  reasonInput: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 14,
    color: "#152238",
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    textAlignVertical: "top",
    minHeight: 96,
    marginTop: 2,
    marginBottom: 16,
  },
  overlapWarning: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  warningIcon: {
    marginRight: 8,
  },
  overlapWarningText: {
    color: "#B91C1C",
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  submitBtn: {
    flexDirection: "row",
    backgroundColor: "#2457D6",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    marginTop: 4,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  // Leave History List
  listContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: "#E5EAF2",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  listTitle: {
    color: "#152238",
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 12,
  },
  emptyText: {
    color: "#8995A7",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 20,
  },
  historyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#EDF1F6",
    paddingVertical: 14,
  },
  historyMain: {
    flex: 1,
    paddingRight: 12,
  },
  historyType: {
    color: "#152238",
    fontSize: 14,
    fontWeight: "700",
  },
  historyDates: {
    color: "#68758A",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
  },
  historyReason: {
    color: "#8995A7",
    fontSize: 12,
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  badgeApproved: {
    backgroundColor: "#DEF7EC",
    borderColor: "#A7F3D0",
  },
  badgeRejected: {
    backgroundColor: "#FEE2E2",
    borderColor: "#FECACA",
  },
  badgePending: {
    backgroundColor: "#FEF3C7",
    borderColor: "#FDE68A",
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  textApproved: {
    color: "#03543F",
  },
  textRejected: {
    color: "#991B1B",
  },
  textPending: {
    color: "#92400E",
  },
  // Calendar Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  calendarModal: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E5EAF2",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 6,
  },
  calendarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  arrowBtn: {
    backgroundColor: "#F1F5F9",
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  monthLabel: {
    color: "#152238",
    fontSize: 16,
    fontWeight: "800",
  },
  weekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  weekLabel: {
    color: "#8995A7",
    fontSize: 12,
    fontWeight: "700",
    width: "13%",
    textAlign: "center",
  },
  daysGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  dayCell: {
    width: "13%",
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
    marginVertical: 4,
    borderRadius: 18,
  },
  dayCellSelected: {
    backgroundColor: "#2457D6",
  },
  dayText: {
    color: "#152238",
    fontSize: 13,
    fontWeight: "600",
  },
  dayTextSelected: {
    color: "#FFFFFF",
    fontWeight: "800",
  },
  closeModalBtn: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  closeModalText: {
    color: "#475569",
    fontSize: 14,
    fontWeight: "700",
  },
});
