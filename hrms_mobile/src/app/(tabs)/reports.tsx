import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Share,
} from "react-native";
import api from "../../services/api";
import { FileSpreadsheet, Calendar, Settings, Download, ShieldAlert } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function ReportsScreen() {
  const today = new Date();
  const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;

  const [month, setMonth] = useState(defaultMonth);
  const [reportType, setReportType] = useState<"basic" | "duration">("basic");
  const [exporting, setExporting] = useState(false);

  // Format cells matching backend helper
  const formatCell = (cell: any, type: "basic" | "duration") => {
    if (!cell) return "--";
    if (type === "duration") {
      if (cell.punch_in && cell.punch_in !== "--") {
        return `${cell.punch_in} - ${cell.punch_out || "Active"}`;
      }
    }
    return cell.code || "A";
  };

  const handleExportMonthlyAttendance = async () => {
    setExporting(true);
    try {
      const res = await api.get("/attendance/team-attendance/", {
        params: { month },
      });

      const registerDates = Array.isArray(res.data?.register_dates) ? res.data.register_dates : [];
      const registerRows = Array.isArray(res.data?.register_rows) ? res.data.register_rows : [];

      if (registerRows.length === 0) {
        Alert.alert("No Data", `There are no attendance records logged for the month of ${month}.`);
        setExporting(false);
        return;
      }

      // 1. Build CSV headers
      const headers = [
        "Emp Code",
        "Emp Name",
        ...registerDates.map((day: any) => `${day.day} (${day.day_name})`),
        "Present Days",
        "Leave Days",
        "Pending Approvals",
        "Absent Days",
        "Shortfall Days",
        "Total Work Hours",
      ];

      // 2. Build CSV rows
      const csvRows = registerRows.map((row: any) => [
        row.employee_code || "N/A",
        row.employee_name || row.username,
        ...row.cells.map((cell: any) => formatCell(cell, reportType)),
        String(row.present_marks || 0),
        String(row.leave_marks || 0),
        String(row.pending_marks || 0),
        String(row.absent_marks || 0),
        String(row.shortfall_days || 0),
        Number(row.total_work_hours || 0).toFixed(2),
      ]);

      const csvContent = [
        headers.join(","),
        ...csvRows.map((r: any) => r.map((cell: any) => `"${cell.replace(/"/g, '""')}"`).join(","))
      ].join("\n");

      // 3. Share the file natively
      await Share.share({
        title: `HRMS Attendance Report - ${month}`,
        message: csvContent,
      });

    } catch (err: any) {
      console.error("Export monthly attendance error:", err);
      const errMsg = err.response?.data?.error || err.message || "Unable to compile CSV report.";
      Alert.alert("Export Failed", errMsg);
    } finally {
      setExporting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Info Header */}
        <View style={styles.heroSection}>
          <Text style={styles.heroPreText}>
            <FileSpreadsheet size={12} color="#818cf8" /> Reports Desk
          </Text>
          <Text style={styles.heroTitle}>Workforce Reports</Text>
          <Text style={styles.heroDesc}>
            Generate, compile, and download customized monthly attendance sheets and payroll shortfall metrics.
          </Text>
        </View>

        {/* Configuration Panel */}
        <View style={styles.panelCard}>
          <Text style={styles.panelTitle}>Monthly Attendance Sheet</Text>
          <Text style={styles.panelSubtitle}>Configure export parameters below:</Text>

          {/* Month Selector dropdown placeholder */}
          <Text style={styles.inputLabel}>
            <Calendar size={14} color="#94a3b8" style={{ marginRight: 6 }} /> Select Month
          </Text>
          <View style={styles.pickerSubstitute}>
            {[-2, -1, 0].map(offset => {
              const date = new Date(today.getFullYear(), today.getMonth() + offset, 1);
              const mStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
              const active = month === mStr;
              const label = date.toLocaleString("default", { month: "long", year: "numeric" });
              return (
                <TouchableOpacity
                  key={mStr}
                  style={[styles.pillBtn, active && styles.pillBtnActive]}
                  onPress={() => setMonth(mStr)}
                >
                  <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Format Type dropdown placeholder */}
          <Text style={styles.inputLabel}>
            <Settings size={14} color="#94a3b8" style={{ marginRight: 6 }} /> Report Format
          </Text>
          <View style={styles.formatSelectorRow}>
            <TouchableOpacity
              style={[styles.formatBtn, reportType === "basic" && styles.formatBtnActive]}
              onPress={() => setReportType("basic")}
            >
              <Text style={[styles.formatText, reportType === "basic" && styles.formatTextActive]}>
                Basic (P / A / L)
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.formatBtn, reportType === "duration" && styles.formatBtnActive]}
              onPress={() => setReportType("duration")}
            >
              <Text style={[styles.formatText, reportType === "duration" && styles.formatTextActive]}>
                Times (In / Out)
              </Text>
            </TouchableOpacity>
          </View>

          {/* Submit Trigger */}
          <TouchableOpacity
            style={[styles.exportBtn, exporting && styles.disabledBtn]}
            onPress={handleExportMonthlyAttendance}
            disabled={exporting}
          >
            {exporting ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Download size={18} color="#ffffff" style={{ marginRight: 8 }} />
                <Text style={styles.exportBtnText}>Generate & Share CSV</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Informational Guidelines */}
        <View style={styles.infoCard}>
          <ShieldAlert size={20} color="#818cf8" style={{ marginBottom: 8 }} />
          <Text style={styles.infoTitle}>CSV Sheet Structure</Text>
          <Text style={styles.infoText}>
            The generated sheet compiles Employee codes, names, daily rosters, cumulative work hours, leave days used, absent shortfall days, and pending approvals matching standard payroll templates.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  container: {
    padding: 16,
    paddingBottom: 40,
  },
  heroSection: {
    backgroundColor: "#1e293b",
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#334155",
  },
  heroPreText: {
    color: "#818cf8",
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
  },
  heroDesc: {
    color: "#94a3b8",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
  },
  panelCard: {
    backgroundColor: "#1e293b",
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: "#334155",
    marginBottom: 20,
  },
  panelTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  panelSubtitle: {
    color: "#94a3b8",
    fontSize: 12,
    marginTop: 2,
    marginBottom: 16,
  },
  inputLabel: {
    flexDirection: "row",
    alignItems: "center",
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
    marginTop: 12,
  },
  pickerSubstitute: {
    backgroundColor: "#0f172a",
    borderRadius: 16,
    padding: 6,
  },
  pillBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginBottom: 4,
    alignItems: "center",
  },
  pillBtnActive: {
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
  },
  pillText: {
    color: "#64748b",
    fontSize: 13,
    fontWeight: "700",
  },
  pillTextActive: {
    color: "#818cf8",
  },
  formatSelectorRow: {
    flexDirection: "row",
    backgroundColor: "#0f172a",
    borderRadius: 16,
    padding: 4,
  },
  formatBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 12,
  },
  formatBtnActive: {
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
  },
  formatText: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "700",
  },
  formatBtnActiveText: {
    color: "#818cf8",
  },
  formatTextActive: {
    color: "#818cf8",
  },
  exportBtn: {
    flexDirection: "row",
    backgroundColor: "#818cf8",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    marginTop: 24,
    borderWidth: 1,
    borderColor: "#a5b4fc50",
  },
  disabledBtn: {
    opacity: 0.6,
  },
  exportBtnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  infoCard: {
    backgroundColor: "#1e293b",
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: "#334155",
  },
  infoTitle: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 6,
  },
  infoText: {
    color: "#94a3b8",
    fontSize: 12,
    lineHeight: 18,
  },
});
