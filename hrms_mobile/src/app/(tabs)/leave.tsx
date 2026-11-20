import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
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
  const todayStr = new Date().toISOString().split("T")[0];

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [leaves, setLeaves] = useState<LeaveRecord[]>([]);
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

  // Calendar picker modal state
  const [calendarTarget, setCalendarTarget] = useState<"from" | "to" | null>(null);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth()); // 0-11

  const fetchLeaveData = useCallback(async (showLoader = true) => {
    if (!user || !isAuthenticated) return;
    if (showLoader) setLoading(true);
    try {
      const res = await api.get("/leave/my/");
      const records = Array.isArray(res.data) 
        ? res.data 
        : Array.isArray(res.data?.records) 
          ? res.data.records 
          : [];
      
      const apiSummary = res.data?.summary || null;

      // Map to matching object schema
      setLeaves(records);
      setSummary({
        leave_allotted: Number(apiSummary?.leave_allotted || 0),
        leaves_taken: Number(apiSummary?.leaves_taken || 0),
        leave_balance: Number(apiSummary?.leave_balance || 0),
        pending: Number(
          apiSummary?.pending_requests || records.filter((item: any) => item.status === "pending").length
        ),
        management_concession: Number(apiSummary?.management_concession || 0),
        pending_leave_days: Number(apiSummary?.pending_leave_days || 0),
      });
    } catch (err: any) {
      console.error("Leave fetch error:", err);
      Alert.alert("Sync Error", "Unable to load leave records.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, isAuthenticated]);

  useRealtime("leave_update", () => fetchLeaveData(false));
  useRealtime("leave_notice", (notice: any) => {
    fetchLeaveData(false);
    if (notice?.status === "concession_granted") {
      Alert.alert("Leave Concession Granted", `${notice.additional_days} ${notice.leave_type} leave days granted. Updated balance: ${notice.updated_balance} days.`);
    } else if (notice?.status === "concession_reversed") {
      Alert.alert("Leave Concession Reversed", `Updated balance: ${notice.updated_balance} days.`);
    } else if (notice?.status === "approved" || notice?.status === "rejected") {
      Alert.alert("Leave Request Updated", `Your ${notice.leave_type} request was ${notice.status}. Updated balance: ${notice.updated_balance} days.`);
    }
  });

  useEffect(() => {
    fetchLeaveData(true);
  }, [fetchLeaveData]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchLeaveData(false);
  };

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
    return leaves.some((r) => {
      if (r.status !== "approved") return false;
      return r.from <= form.to_date && r.to >= form.from_date;
    });
  }, [form.from_date, form.to_date, leaves]);

  const handleSubmit = async (confirmedBalance?: { available: number; projected: number; snapshot: string }) => {
    if (hasOverlap) {
      Alert.alert("Date Overlap", "Selected dates overlap with an already approved leave request.");
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
      fetchLeaveData(false);
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
    const dateObj = new Date(currentYear, currentMonth, day);
    const dateStr = dateObj.toISOString().split("T")[0];

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

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />
        }
      >
        {/* Metric Overview Section */}
        <View style={styles.heroSection}>
          <Text style={styles.heroPreText}>
            <Calendar size={12} color="#10b981" /> Leave Balances
          </Text>
          <Text style={styles.heroTitle}>Time Off Requests</Text>

          <View style={styles.statsGrid}>
            <View style={styles.statTile}>
              <FileText size={18} color="#10b981" />
              <Text style={styles.statLabel}>Allotted</Text>
              <Text style={styles.statValue}>{summary.leave_allotted}</Text>
            </View>
            <View style={styles.statTile}>
              <ShieldCheck size={18} color="#10b981" />
              <Text style={styles.statLabel}>Taken</Text>
              <Text style={styles.statValue}>{summary.leaves_taken}</Text>
            </View>
            <View style={styles.statTile}>
              <Clock3 size={18} color="#2563eb" />
              <Text style={styles.statLabel}>Balance</Text>
              <Text style={styles.statValue}>{summary.leave_balance}</Text>
            </View>
            <View style={styles.statTile}>
              <ShieldCheck size={18} color="#10b981" />
              <Text style={styles.statLabel}>Concession</Text>
              <Text style={styles.statValue}>{summary.management_concession}</Text>
            </View>
            <View style={styles.statTile}>
              <Calendar size={18} color="#f59e0b" />
              <Text style={styles.statLabel}>Pending days</Text>
              <Text style={styles.statValue}>{summary.pending_leave_days}</Text>
            </View>
          </View>
        </View>

        {/* Apply for Leave Form Panel */}
        <View style={styles.formPanel}>
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>Request Time Off</Text>
            <Plus size={20} color="#10b981" />
          </View>

          {/* Leave Type Dropdown */}
          <Text style={styles.inputLabel}>Leave Type</Text>
          <View style={styles.selectorRow}>
            {["casual", "sick", "paid"].map(type => (
              <TouchableOpacity
                key={type}
                style={[styles.selectorBtn, form.leave_type === type && styles.selectorBtnActive]}
                onPress={() => setForm(prev => ({ ...prev, leave_type: type }))}
              >
                <Text style={[styles.selectorText, form.leave_type === type && styles.selectorTextActive]}>
                  {type.toUpperCase()}
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
                <Text style={styles.dateTriggerText}>{form.from_date}</Text>
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
                <Text style={styles.dateTriggerText}>{form.to_date}</Text>
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
            placeholderTextColor="#64748b"
            value={form.reason}
            onChangeText={val => setForm(prev => ({ ...prev, reason: val }))}
          />

          {hasOverlap && (
            <View style={styles.overlapWarning}>
              <AlertTriangle size={16} color="#ef4444" style={styles.warningIcon} />
              <Text style={styles.overlapWarningText}>
                Selected dates overlap with an approved leave.
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

        {/* Leaves Request History Ledger */}
        <View style={styles.listContainer}>
          <Text style={styles.listTitle}>Leave History</Text>
          {leaves.length === 0 ? (
            <Text style={styles.emptyText}>No leaves filed yet.</Text>
          ) : (
            leaves.map((item, idx) => {
              const days = dayDifference(item.from, item.to);
              const status = item.status?.toLowerCase() || "pending";
              return (
                <View key={`${item.id}-${idx}`} style={styles.historyRow}>
                  <View style={styles.historyMain}>
                    <Text style={styles.historyType}>
                      {item.leave_type ? item.leave_type.toUpperCase() : "LEAVE"} - {days} Day{days === 1 ? "" : "s"}
                    </Text>
                    <Text style={styles.historyDates}>
                      {item.from} to {item.to}
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
            })
          )}
        </View>
      </ScrollView>

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
                <ChevronLeft size={20} color="#ffffff" />
              </TouchableOpacity>
              <Text style={styles.monthLabel}>
                {monthNames[currentMonth]} {currentYear}
              </Text>
              <TouchableOpacity onPress={() => handleMonthChange("next")} style={styles.arrowBtn}>
                <ChevronRight size={20} color="#ffffff" />
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
                const isSelected =
                  day !== null &&
                  new Date(currentYear, currentMonth, day).toISOString().split("T")[0] ===
                    (calendarTarget === "from" ? form.from_date : form.to_date);

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
              <X size={16} color="#ffffff" style={{ marginRight: 6 }} />
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
    backgroundColor: "#0f172a",
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
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  // Overview Section
  heroSection: {
    backgroundColor: "#1e293b",
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#334155",
  },
  heroPreText: {
    color: "#10b981",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 2,
    marginBottom: 8,
  },
  heroTitle: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
  },
  statTile: {
    width: "23%",
    backgroundColor: "#0f172a70",
    borderRadius: 16,
    padding: 10,
    margin: "1%",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#33415550",
  },
  statLabel: {
    color: "#94a3b8",
    fontSize: 9,
    textTransform: "uppercase",
    fontWeight: "600",
    marginTop: 4,
  },
  statValue: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
    marginTop: 2,
  },
  // Form Panel
  formPanel: {
    backgroundColor: "#1e293b",
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#334155",
  },
  formHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  formTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
  },
  inputLabel: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
    marginTop: 12,
  },
  selectorRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#0f172a",
    borderRadius: 14,
    padding: 4,
  },
  selectorBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 12,
  },
  selectorBtnActive: {
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
  },
  selectorText: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
  },
  selectorTextActive: {
    color: "#10b981",
  },
  datePickerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
  },
  datePickerContainer: {
    width: "48%",
  },
  dateTrigger: {
    backgroundColor: "#0f172a",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#334155",
  },
  dateTriggerText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  durationCard: {
    backgroundColor: "#0f172a60",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 16,
    padding: 12,
    marginVertical: 14,
  },
  durationLabel: {
    color: "#94a3b8",
    fontSize: 10,
    textTransform: "uppercase",
    fontWeight: "600",
  },
  durationValue: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
    marginTop: 4,
  },
  reasonInput: {
    backgroundColor: "#0f172a",
    borderRadius: 14,
    padding: 14,
    color: "#ffffff",
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#334155",
    textAlignVertical: "top",
    marginTop: 6,
    marginBottom: 16,
  },
  overlapWarning: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#7f1d1d30",
    borderWidth: 1,
    borderColor: "#ef444450",
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  warningIcon: {
    marginRight: 8,
  },
  overlapWarningText: {
    color: "#fca5a5",
    fontSize: 12,
    fontWeight: "600",
    flex: 1,
  },
  submitBtn: {
    flexDirection: "row",
    backgroundColor: "#10b981",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    marginTop: 8,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  // Leave History List
  listContainer: {
    backgroundColor: "#1e293b",
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: "#334155",
  },
  listTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 16,
  },
  emptyText: {
    color: "#64748b",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 20,
  },
  historyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#334155",
    paddingVertical: 14,
  },
  historyMain: {
    flex: 1,
    paddingRight: 12,
  },
  historyType: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  historyDates: {
    color: "#94a3b8",
    fontSize: 11,
    marginTop: 4,
  },
  historyReason: {
    color: "#64748b",
    fontSize: 11,
    marginTop: 6,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
  },
  badgeApproved: {
    backgroundColor: "#064e3b",
    borderColor: "#065f46",
  },
  badgeRejected: {
    backgroundColor: "#7f1d1d",
    borderColor: "#991b1b",
  },
  badgePending: {
    backgroundColor: "#78350f",
    borderColor: "#92400e",
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  textApproved: {
    color: "#34d399",
  },
  textRejected: {
    color: "#f87171",
  },
  textPending: {
    color: "#fbbf24",
  },
  // Calendar Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  calendarModal: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#1e293b",
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: "#334155",
  },
  calendarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  arrowBtn: {
    backgroundColor: "#0f172a",
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
  },
  monthLabel: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  weekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  weekLabel: {
    color: "#64748b",
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
    backgroundColor: "#10b981",
  },
  dayText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },
  dayTextSelected: {
    color: "#ffffff",
    fontWeight: "800",
  },
  closeModalBtn: {
    flexDirection: "row",
    backgroundColor: "#334155",
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 16,
  },
  closeModalText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
});
