import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useAuth } from "../../context/AuthContext";
import api from "../../services/api";
import { useRealtime } from "../../context/RealtimeContext";
import Card from "../../components/Card";
import { SafeAreaView } from "react-native-safe-area-context";
import { 
  Users, 
  CheckCircle2, 
  FileText, 
  AlertCircle, 
  Clock3, 
  Timer, 
  CalendarDays,
  ShieldCheck,
  Briefcase
} from "lucide-react-native";

export default function DashboardScreen() {
  const { user, isAuthenticated, activeTab, setActiveTab } = useAuth();
  const role = user?.role || "employee";

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // State data for different views
  const [personalData, setPersonalData] = useState<any>(null);
  const [managerData, setManagerData] = useState<any>(null);
  const [hrData, setHrData] = useState<any>(null);
  const [adminSummary, setAdminSummary] = useState<any>(null);
  const [warning, setWarning] = useState("");

  const showSystemToggle = role !== "employee";

  const loadDashboardData = useCallback(async (showLoader = false) => {
    if (!user || !isAuthenticated) return;
    if (showLoader) setLoading(true);
    setWarning("");

    try {
      // 1. Fetch Personal data for all roles (or fallback)
      const personalRes = await api.get("/attendance/dashboard/");
      setPersonalData(personalRes.data);

      // 2. Fetch specific role-based data
      if (role === "manager" || role === "superadmin") {
        try {
          const mgrRes = await api.get("/attendance/manager-dashboard/");
          setManagerData(mgrRes.data);
        } catch (e) {
          console.error("Manager dashboard load error", e);
        }
      }

      if (role === "hr" || role === "superadmin") {
        try {
          const hrRes = await api.get("/attendance/hr-dashboard/");
          setHrData(hrRes.data);
        } catch (e) {
          console.error("HR dashboard load error", e);
        }
      }

      if (role === "admin" || role === "superadmin") {
        try {
          const adminRes = await api.get("/auth/admin-summary/");
          setAdminSummary(adminRes.data);
        } catch (e) {
          console.error("Admin summary load error", e);
        }
      }
    } catch (err: any) {
      console.error("Dashboard general load error:", err);
      setWarning("Unable to sync fresh dashboard metrics from server.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [role, user, isAuthenticated]);

  // Hook up SSE live events
  useRealtime("attendance_update", () => loadDashboardData(false));
  useRealtime("leave_update", () => loadDashboardData(false));
  useRealtime("employee_update", () => loadDashboardData(false));

  useEffect(() => {
    loadDashboardData(true);
  }, [loadDashboardData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadDashboardData(false);
  };

  // Calculations for personal view
  const weeklyAverage = useMemo(() => {
    const dailyWork = personalData?.daily_work;
    if (!dailyWork || !dailyWork.length) return "0.00";
    const total = dailyWork.reduce(
      (sum: number, item: any) => sum + Number(item.work_hours || 0),
      0
    );
    return (total / dailyWork.length).toFixed(2);
  }, [personalData]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  // --- RENDERING SUB-COMPONENTS ---

  const renderPersonalHeader = () => {
    const workHours = personalData?.total_working_hours || 0;
    const leaveBal = personalData?.leave_balance || 0;
    const pendingApp = personalData?.pending_approvals || 0;

    return (
      <View style={styles.heroSection}>
        <Text style={styles.heroPreText}>
          <Clock3 size={12} color="#a7f3d0" /> Personal Overview
        </Text>
        <Text style={styles.heroTitle}>Workday Performance</Text>
        <Text style={styles.heroDesc}>
          Review logged shift metrics, leave balances, and pending supervisor reviews.
        </Text>

        <View style={styles.heroGrid}>
          <View style={styles.heroTile}>
            <Clock3 size={18} color="#2dd4bf" />
            <Text style={styles.heroTileLabel}>Weekly Hours</Text>
            <Text style={styles.heroTileValue}>{workHours.toFixed(2)}</Text>
          </View>
          <View style={styles.heroTile}>
            <Timer size={18} color="#2dd4bf" />
            <Text style={styles.heroTileLabel}>Daily Average</Text>
            <Text style={styles.heroTileValue}>{weeklyAverage}h</Text>
          </View>
          <View style={styles.heroTile}>
            <FileText size={18} color="#2dd4bf" />
            <Text style={styles.heroTileLabel}>Leave Balance</Text>
            <Text style={styles.heroTileValue}>{leaveBal}</Text>
          </View>
          <View style={styles.heroTile}>
            <AlertCircle size={18} color="#f43f5e" />
            <Text style={styles.heroTileLabel}>Pending Rev</Text>
            <Text style={styles.heroTileValue}>{pendingApp}</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderPersonalMetrics = () => {
    const hours = personalData?.total_working_hours || 0;
    const balance = personalData?.leave_balance || 0;
    const taken = personalData?.leaves_taken || 0;
    const allotted = personalData?.total_leaves_allocated || 0;
    const pending = personalData?.pending_approvals || 0;

    return (
      <View style={styles.metricsContainer}>
        <Card title="Tracked Hours" value={`${hours.toFixed(2)}h`} info="Last 7 Days" icon="Clock3" tone="cyan" />
        <Card title="Leave Balance" value={String(balance)} info="Days Available" icon="FileText" tone="emerald" />
        <Card title="Leaves Taken" value={String(taken)} info="Approved Applications" icon="CheckCircle2" tone="amber" />
        <Card title="Leaves Allotted" value={String(allotted)} info="Total Allocation" icon="CalendarDays" tone="violet" />
        <Card title="Pending Review" value={String(pending)} info="Action Required" icon="AlertCircle" tone="rose" />
      </View>
    );
  };

  const renderPersonalTimeline = () => {
    const dailyWork = personalData?.daily_work || [];

    return (
      <View style={styles.listContainer}>
        <Text style={styles.listTitle}>Work Timeline</Text>
        <Text style={styles.listSubtitle}>Your recent punch records</Text>

        {dailyWork.length === 0 ? (
          <Text style={styles.emptyText}>No shifts logged in the last 7 days.</Text>
        ) : (
          dailyWork.map((item: any, idx: number) => (
            <View key={`${item.date}-${idx}`} style={styles.timelineRow}>
              <View style={styles.timelineMain}>
                <Text style={styles.timelineDate}>{item.date}</Text>
                <Text style={styles.timelinePunches}>
                  In: {item.punch_in || "--"} | Out: {item.punch_out || "--"}
                </Text>
              </View>
              <View style={styles.timelineBadgeContainer}>
                <Text style={styles.timelineHours}>
                  {Number(item.work_hours || 0).toFixed(2)}h
                </Text>
                <View style={styles.badgeApproved}>
                  <Text style={styles.badgeTextApproved}>Logged</Text>
                </View>
              </View>
            </View>
          ))
        )}
      </View>
    );
  };

  const renderSystemHeader = () => {
    const totalStaff = adminSummary?.staff || hrData?.people_summary?.total_people || 0;
    const presentToday = adminSummary?.present_today || hrData?.people_summary?.present_today || 0;
    const pendingLeave = adminSummary?.pending_leave_requests || hrData?.people_summary?.pending_leave_requests || 0;
    const pendingPunch = adminSummary?.pending_attendance_approvals || hrData?.people_summary?.pending_attendance_approvals || 0;

    return (
      <View style={[styles.heroSection, styles.workspaceHero]}>
        <Text style={styles.heroPreText}>
          <ShieldCheck size={12} color="#68d391" /> Workspace Summary
        </Text>
        <Text style={styles.heroTitle}>Workforce Status</Text>
        <Text style={styles.heroDesc}>
          Monitor organization size, attendance rosters, and action items.
        </Text>

        <View style={styles.heroGrid}>
          <View style={styles.heroTile}>
            <Users size={18} color="#68d391" />
            <Text style={styles.heroTileLabel}>Total People</Text>
            <Text style={styles.heroTileValue}>{totalStaff}</Text>
          </View>
          <View style={styles.heroTile}>
            <CheckCircle2 size={18} color="#68d391" />
            <Text style={styles.heroTileLabel}>Present Today</Text>
            <Text style={styles.heroTileValue}>{presentToday}</Text>
          </View>
          <View style={styles.heroTile}>
            <FileText size={18} color="#f6ad55" />
            <Text style={styles.heroTileLabel}>Leave Requests</Text>
            <Text style={styles.heroTileValue}>{pendingLeave}</Text>
          </View>
          <View style={styles.heroTile}>
            <AlertCircle size={18} color="#fc8181" />
            <Text style={styles.heroTileLabel}>Punch Exception</Text>
            <Text style={styles.heroTileValue}>{pendingPunch}</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderSystemMetrics = () => {
    const present = adminSummary?.present_today || hrData?.people_summary?.present_today || 0;
    const pendingLeaves = adminSummary?.pending_leave_requests || hrData?.people_summary?.pending_leave_requests || 0;
    const pendingPunches = adminSummary?.pending_attendance_approvals || hrData?.people_summary?.pending_attendance_approvals || 0;
    const totalStaff = adminSummary?.staff || hrData?.people_summary?.total_people || 0;

    return (
      <View style={styles.metricsContainer}>
        <Card title="Present Today" value={String(present)} info="In-office attendance" icon="CheckCircle2" tone="emerald" />
        <Card title="Pending Leave" value={String(pendingLeaves)} info="Leave queue requests" icon="FileText" tone="amber" />
        <Card title="Pending Punch" value={String(pendingPunches)} info="Exception adjustments" icon="AlertCircle" tone="rose" />
        <Card title="Total Staff" value={String(totalStaff)} info="Active payroll directory" icon="Users" tone="cyan" />
      </View>
    );
  };

  const renderRecentAttendance = () => {
    const recent = hrData?.people_summary?.recent_people_attendance || adminSummary?.today_present_employees || [];

    return (
      <View style={styles.listContainer}>
        <Text style={styles.listTitle}>Recent Attendance Activity</Text>
        <Text style={styles.listSubtitle}>Updates across the department</Text>

        {recent.length === 0 ? (
          <Text style={styles.emptyText}>No recent punch records logged today.</Text>
        ) : (
          recent.map((item: any, idx: number) => (
            <View key={`${item.employee || item.username}-${idx}`} style={styles.timelineRow}>
              <View style={styles.timelineMain}>
                <Text style={styles.timelineDate}>{item.employee || item.username}</Text>
                <Text style={styles.timelinePunches}>
                  Role: {item.role || "Employee"} | Date: {item.date || "Today"}
                </Text>
              </View>
              <View style={styles.timelineBadgeContainer}>
                <Text style={styles.timelineHours}>
                  {item.work_hours ? `${Number(item.work_hours).toFixed(2)}h` : "--"}
                </Text>
                <View style={item.status === "approved" || item.punch_in ? styles.badgeApproved : styles.badgePending}>
                  <Text style={item.status === "approved" || item.punch_in ? styles.badgeTextApproved : styles.badgeTextPending}>
                    {item.status || "Present"}
                  </Text>
                </View>
              </View>
            </View>
          ))
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />
        }
      >
        {/* Warning Indicator */}
        {warning !== "" && (
          <View style={styles.warningContainer}>
            <Text style={styles.warningText}>{warning}</Text>
          </View>
        )}

        {/* View Switcher Tabs (Managers, HR, Admins) */}
        {showSystemToggle && (
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tabButton, activeTab === "personal" && styles.tabButtonActive]}
              onPress={() => setActiveTab("personal")}
            >
              <Text style={[styles.tabButtonText, activeTab === "personal" && styles.tabButtonTextActive]}>
                Personal View
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabButton, activeTab === "system" && styles.tabButtonActive]}
              onPress={() => setActiveTab("system")}
            >
              <Text style={[styles.tabButtonText, activeTab === "system" && styles.tabButtonTextActive]}>
                Workspace View
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Content Render based on selected Tab */}
        {activeTab === "personal" ? (
          <>
            {renderPersonalHeader()}
            {renderPersonalMetrics()}
            {renderPersonalTimeline()}
          </>
        ) : (
          <>
            {renderSystemHeader()}
            {renderSystemMetrics()}
            {renderRecentAttendance()}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0f172a", // Premium Dark Slate
  },
  container: {
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
  warningContainer: {
    backgroundColor: "#7f1d1d",
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#f87171",
  },
  warningText: {
    color: "#fecaca",
    fontSize: 13,
    textAlign: "center",
  },
  // Switcher Tab Styles
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#1e293b",
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 12,
  },
  tabButtonActive: {
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#334155",
  },
  tabButtonText: {
    color: "#94a3b8",
    fontSize: 14,
    fontWeight: "600",
  },
  tabButtonTextActive: {
    color: "#10b981", // Active emerald text
  },
  // Hero Section
  heroSection: {
    backgroundColor: "#1e293b",
    borderRadius: 24,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#334155",
  },
  workspaceHero: {
    borderColor: "#10b98130", // Emerald glow border
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
  },
  heroDesc: {
    color: "#94a3b8",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
    marginBottom: 16,
  },
  heroGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
  },
  heroTile: {
    width: "48%",
    backgroundColor: "#0f172a90",
    borderRadius: 16,
    padding: 12,
    margin: "1%",
    borderWidth: 1,
    borderColor: "#33415550",
  },
  heroTileLabel: {
    color: "#94a3b8",
    fontSize: 10,
    textTransform: "uppercase",
    fontWeight: "600",
    marginTop: 4,
  },
  heroTileValue: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
    marginTop: 2,
  },
  // Metrics Grid
  metricsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  // Roster or Timeline rows
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
  },
  listSubtitle: {
    color: "#94a3b8",
    fontSize: 12,
    marginTop: 2,
    marginBottom: 16,
  },
  emptyText: {
    color: "#64748b",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 20,
  },
  timelineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#334155",
    paddingVertical: 12,
  },
  timelineMain: {
    flex: 1,
    paddingRight: 12,
  },
  timelineDate: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  timelinePunches: {
    color: "#94a3b8",
    fontSize: 11,
    marginTop: 4,
  },
  timelineBadgeContainer: {
    alignItems: "flex-end",
  },
  timelineHours: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  badgeApproved: {
    backgroundColor: "#064e3b",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 4,
    borderWidth: 1,
    borderColor: "#065f46",
  },
  badgeTextApproved: {
    color: "#34d399",
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  badgePending: {
    backgroundColor: "#78350f",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 4,
    borderWidth: 1,
    borderColor: "#92400e",
  },
  badgeTextPending: {
    color: "#fbbf24",
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
  },
});
