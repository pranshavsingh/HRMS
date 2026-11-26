import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react-native";
import api from "../services/api";
import { formatCompanyDate } from "../utils/date";

interface EmployeeTarget {
  id: number;
  name: string;
  username: string;
}

interface RegisterCell {
  date: string;
  code: string;
  work_hours: number;
  punch_in: string;
  punch_out: string;
  status: string | null;
  holiday_name: string | null;
}

interface RegisterDate {
  date: string;
  day: number;
  weekday?: string;
  day_name?: string;
}

interface EmployeeRegisterModalProps {
  employee: EmployeeTarget | null;
  onClose: () => void;
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

export default function EmployeeRegisterModal({ employee, onClose }: EmployeeRegisterModalProps) {
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [selectedMonth, setSelectedMonth] = useState(currentMonthStr);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [registerDates, setRegisterDates] = useState<RegisterDate[]>([]);
  const [empRow, setEmpRow] = useState<any>(null);

  useEffect(() => {
    if (employee) {
      setSelectedMonth(currentMonthStr);
    }
  }, [employee, currentMonthStr]);

  const fetchRegister = useCallback(async () => {
    if (!employee) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/attendance/team-attendance/", {
        params: { month: selectedMonth, page: "all" },
      });
      const payload = res.data || {};
      const dates: RegisterDate[] = Array.isArray(payload.register_dates) ? payload.register_dates : [];
      const rows: any[] = Array.isArray(payload.register_rows) ? payload.register_rows : [];
      const matched = rows.find((r) => Number(r.user_id) === Number(employee.id)) || null;
      setRegisterDates(dates);
      setEmpRow(matched);
      if (!matched) {
        setError("No attendance register records found for this employee in the selected month.");
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || "Unable to load employee attendance register.");
      setEmpRow(null);
    } finally {
      setLoading(false);
    }
  }, [employee, selectedMonth]);

  useEffect(() => {
    if (employee) {
      void fetchRegister();
    }
  }, [employee, fetchRegister]);

  const changeMonth = (delta: number) => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const nextStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (nextStr > currentMonthStr) return;
    setSelectedMonth(nextStr);
  };

  const monthLabel = (() => {
    const [y, m] = selectedMonth.split("-").map(Number);
    return new Date(y, m - 1, 1).toLocaleString("default", { month: "long", year: "numeric" });
  })();

  const cellMap = new Map<string, RegisterCell>();
  if (Array.isArray(empRow?.cells)) {
    empRow.cells.forEach((c: RegisterCell) => {
      cellMap.set(c.date, c);
    });
  }

  return (
    <Modal
      visible={employee !== null}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        {employee && (
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={styles.modalTitle} numberOfLines={1}>
                  {employee.name}
                </Text>
                <Text style={styles.modalSub}>
                  Attendance Register • @{employee.username}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <X size={20} color="#152238" />
              </TouchableOpacity>
            </View>

            {/* Month Switcher */}
            <View style={styles.monthBar}>
              <TouchableOpacity style={styles.monthNavBtn} onPress={() => changeMonth(-1)}>
                <ChevronLeft size={18} color="#152238" />
              </TouchableOpacity>
              <View style={styles.monthCenter}>
                <CalendarDays size={15} color="#2457D6" style={{ marginRight: 6 }} />
                <Text style={styles.monthText}>{monthLabel}</Text>
              </View>
              <TouchableOpacity
                style={[styles.monthNavBtn, selectedMonth >= currentMonthStr && styles.monthNavDisabled]}
                onPress={() => changeMonth(1)}
                disabled={selectedMonth >= currentMonthStr}
              >
                <ChevronRight size={18} color={selectedMonth >= currentMonthStr ? "#CBD5E1" : "#152238"} />
              </TouchableOpacity>
            </View>

            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color="#2457D6" />
                <Text style={styles.loadingText}>Loading attendance register...</Text>
              </View>
            ) : error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : empRow ? (
              <ScrollView contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
                {/* Summary Matrix */}
                <View style={styles.summaryGrid}>
                  <View style={styles.summaryPill}>
                    <Text style={[styles.summaryVal, { color: "#03543F" }]}>{empRow.present_marks ?? 0}</Text>
                    <Text style={styles.summaryLbl}>Present</Text>
                  </View>
                  <View style={styles.summaryPill}>
                    <Text style={[styles.summaryVal, { color: "#991B1B" }]}>{empRow.absent_marks ?? 0}</Text>
                    <Text style={styles.summaryLbl}>Absent</Text>
                  </View>
                  <View style={styles.summaryPill}>
                    <Text style={[styles.summaryVal, { color: "#5521B5" }]}>{empRow.leave_marks ?? 0}</Text>
                    <Text style={styles.summaryLbl}>Leave</Text>
                  </View>
                  <View style={styles.summaryPill}>
                    <Text style={[styles.summaryVal, { color: "#2457D6" }]}>
                      {Number(empRow.total_work_hours || 0).toFixed(1)}h
                    </Text>
                    <Text style={styles.summaryLbl}>Hours</Text>
                  </View>
                </View>

                <View style={[styles.summaryGrid, { marginTop: 8, marginBottom: 14 }]}>
                  <View style={styles.summaryPill}>
                    <Text style={[styles.summaryVal, { color: "#234E52" }]}>{empRow.holiday_marks ?? 0}</Text>
                    <Text style={styles.summaryLbl}>Holiday</Text>
                  </View>
                  <View style={styles.summaryPill}>
                    <Text style={[styles.summaryVal, { color: "#475569" }]}>{empRow.week_off_marks ?? 0}</Text>
                    <Text style={styles.summaryLbl}>Week Off</Text>
                  </View>
                  <View style={styles.summaryPill}>
                    <Text style={[styles.summaryVal, { color: "#713F12" }]}>{empRow.pending_marks ?? 0}</Text>
                    <Text style={styles.summaryLbl}>Pending</Text>
                  </View>
                  <View style={styles.summaryPill}>
                    <Text style={[styles.summaryVal, { color: "#B45309" }]}>{empRow.shortfall_days ?? 0}</Text>
                    <Text style={styles.summaryLbl}>Shortfall</Text>
                  </View>
                </View>

                {/* Daily Cells */}
                {registerDates
                  .slice()
                  .reverse()
                  .map((d) => {
                    const cell = cellMap.get(d.date);
                    const code = cell?.code || "--";
                    const theme = CODE_COLORS[code] || CODE_COLORS["--"];
                    return (
                      <View key={d.date} style={styles.dayRow}>
                        <View style={styles.dayLeft}>
                          <Text style={styles.dayNum}>{d.day}</Text>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.dayDateText}>
                              {d.weekday || d.day_name || ""} • {formatCompanyDate(d.date)}
                            </Text>
                            {cell?.holiday_name ? (
                              <Text style={styles.daySubText}>{cell.holiday_name}</Text>
                            ) : cell && (cell.punch_in !== "--" || cell.punch_out !== "--") ? (
                              <Text style={styles.daySubText}>
                                In: {cell.punch_in}  |  Out: {cell.punch_out}  ({Number(cell.work_hours || 0).toFixed(2)}h)
                              </Text>
                            ) : null}
                          </View>
                        </View>
                        <View style={[styles.codeBadge, { backgroundColor: theme.bg }]}>
                          <Text style={[styles.codeBadgeText, { color: theme.text }]}>{theme.label}</Text>
                        </View>
                      </View>
                    );
                  })}
              </ScrollView>
            ) : null}
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
    height: "88%",
    borderTopWidth: 1,
    borderTopColor: "#E5EAF2",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#EDF1F6",
    paddingBottom: 12,
    marginBottom: 12,
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
    padding: 8,
    borderRadius: 12,
  },
  monthBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    padding: 6,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 14,
  },
  monthNavBtn: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  monthNavDisabled: {
    opacity: 0.5,
  },
  monthCenter: {
    flexDirection: "row",
    alignItems: "center",
  },
  monthText: {
    color: "#152238",
    fontSize: 14,
    fontWeight: "700",
  },
  loadingBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    color: "#68758A",
    fontSize: 13,
    marginTop: 10,
  },
  errorBox: {
    paddingVertical: 40,
    alignItems: "center",
  },
  errorText: {
    color: "#68758A",
    fontSize: 13,
    textAlign: "center",
  },
  scrollBody: {
    paddingBottom: 32,
  },
  summaryGrid: {
    flexDirection: "row",
    gap: 8,
  },
  summaryPill: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E5EAF2",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: "center",
  },
  summaryVal: {
    fontSize: 15,
    fontWeight: "800",
  },
  summaryLbl: {
    color: "#68758A",
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    marginTop: 2,
  },
  dayRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EDF1F6",
  },
  dayLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 10,
  },
  dayNum: {
    color: "#152238",
    fontSize: 16,
    fontWeight: "800",
    minWidth: 28,
  },
  dayDateText: {
    color: "#152238",
    fontSize: 13,
    fontWeight: "600",
  },
  daySubText: {
    color: "#68758A",
    fontSize: 11,
    marginTop: 2,
  },
  codeBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  codeBadgeText: {
    fontSize: 10,
    fontWeight: "700",
  },
});
