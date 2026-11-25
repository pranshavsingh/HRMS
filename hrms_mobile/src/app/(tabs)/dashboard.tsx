import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useRouter } from "expo-router";
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
import { formatCompanyDate } from "../../utils/date";
import { 
  Users, 
  CheckCircle2, 
  FileText, 
  AlertCircle, 
  Clock3, 
  Timer, 
  CalendarDays,
  ShieldCheck,
  Briefcase,
  ChevronRight
} from "lucide-react-native";

export default function DashboardScreen() {
  const router = useRouter();
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

      if (role === "hr" || role === "admin" || role === "superadmin") {
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
  useRealtime("schedule_update", () => loadDashboardData(false));
  useRealtime("realtime:connected", () => loadDashboardData(false));

  useEffect(() => {
    const t = setTimeout(() => { void loadDashboardData(true); }, 0);
    return () => clearTimeout(t);
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
        <Card title="Pending Review" value={String(pending)} info="Action Required" icon="AlertCircle" tone="rose" fullWidth={true} />
      </View>
    );
  };

  const renderPersonalTimeline = () => {
    const dailyWork = personalData?.daily_work || [];

    return (
      <View style={styles.listContainer}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={styles.listTitle}>Work Timeline</Text>
          <TouchableOpacity
            onPress={() => router.push("/(tabs)/history")}
            style={styles.timelineRegisterLink}
          >
            <Text style={styles.timelineRegisterLinkText}>Monthly Register</Text>
            <ChevronRight size={14} color="#2457D6" />
          </TouchableOpacity>
        </View>
        <Text style={styles.listSubtitle}>Your recent punch records</Text>

        {dailyWork.length === 0 ? (
          <Text style={styles.emptyText}>No shifts logged in the last 7 days.</Text>
        ) : (
          dailyWork.map((item: any, idx: number) => (
            <View key={`${item.date}-${idx}`} style={styles.timelineRow}>
              <View style={styles.timelineMain}>
                <Text style={styles.timelineDate}>{formatCompanyDate(item.date)}</Text>
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
    const isMgrRole = role === "manager";
    const totalStaff = isMgrRole
      ? (managerData?.team_summary?.team_members ?? 0)
      : (adminSummary?.staff ?? hrData?.people_summary?.total_people ?? 0);
    const presentToday = isMgrRole
      ? (managerData?.team_summary?.present_today ?? 0)
      : (adminSummary?.present_today ?? hrData?.people_summary?.present_today ?? 0);
    const pendingLeave = isMgrRole
      ? (managerData?.team_summary?.pending_leave_approvals ?? 0)
      : (adminSummary?.pending_leave_requests ?? hrData?.people_summary?.pending_leave_requests ?? 0);
    const pendingPunch = isMgrRole
      ? (managerData?.team_summary?.pending_attendance_approvals ?? 0)
      : (adminSummary?.pending_attendance_approvals ?? hrData?.people_summary?.pending_attendance_approvals ?? 0);

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
    const isMgrRole = role === "manager";
    const present = isMgrRole
      ? (managerData?.team_summary?.present_today ?? 0)
      : (adminSummary?.present_today ?? hrData?.people_summary?.present_today ?? 0);
    const pendingLeaves = isMgrRole
      ? (managerData?.team_summary?.pending_leave_approvals ?? 0)
      : (adminSummary?.pending_leave_requests ?? hrData?.people_summary?.pending_leave_requests ?? 0);
    const pendingPunches = isMgrRole
      ? (managerData?.team_summary?.pending_attendance_approvals ?? 0)
      : (adminSummary?.pending_attendance_approvals ?? hrData?.people_summary?.pending_attendance_approvals ?? 0);
    const totalStaff = isMgrRole
      ? (managerData?.team_summary?.team_members ?? 0)
      : (adminSummary?.staff ?? hrData?.people_summary?.total_people ?? 0);

    return (
      <View style={styles.metricsContainer}>
        <Card title="Present Today" value={String(present)} info={isMgrRole ? "Team in-office" : "In-office attendance"} icon="CheckCircle2" tone="emerald" />
        <Card title="Pending Leave" value={String(pendingLeaves)} info={isMgrRole ? "Team leave approvals" : "Leave queue requests"} icon="FileText" tone="amber" />
        <Card title="Pending Punch" value={String(pendingPunches)} info={isMgrRole ? "Team punch approvals" : "Exception adjustments"} icon="AlertCircle" tone="rose" />
        <Card title={isMgrRole ? "Team Members" : "Total Staff"} value={String(totalStaff)} info={isMgrRole ? "Direct reports assigned" : "Active payroll directory"} icon="Users" tone="cyan" />
      </View>
    );
  };

  const renderRecentAttendance = () => {
    const isMgrRole = role === "manager";
    const recent = isMgrRole
      ? (managerData?.team_summary?.recent_team_attendance || [])
      : (hrData?.people_summary?.recent_people_attendance || adminSummary?.today_present_employees || []);

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
                  Role: {item.role || "Employee"} | Date: {item.date ? formatCompanyDate(item.date) : "Today"}
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2457D6" />
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
            {role !== "employee" && renderPersonalMetrics()}
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
    backgroundColor: "#F6F8FC",
  },
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 36,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#F6F8FC",
    alignItems: "center",
    justifyContent: "center",
  },
  warningContainer: {
    backgroundColor: "#FFF5F5",
    borderRadius: 14,
    padding: 13,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#F3CACA",
  },
  warningText: {
    color: "#A73434",
    fontSize: 13,
    textAlign: "center",
  },
  // Switcher Tab Styles
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#EAF0F8",
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
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9E3F0",
  },
  tabButtonText: {
    color: "#6B778C",
    fontSize: 14,
    fontWeight: "600",
  },
  tabButtonTextActive: {
    color: "#2457D6",
  },
  // Hero Section
  heroSection: {
    backgroundColor: "#2457D6",
    borderRadius: 24,
    padding: 22,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#2457D6",
    shadowColor: "#2457D6",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  workspaceHero: {
    borderColor: "#2457D6",
  },
  heroPreText: {
    color: "#C9D8FF",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 2,
    marginBottom: 8,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "800",
  },
  heroDesc: {
    color: "#D8E4FF",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
    marginBottom: 16,
  },
  timelineRegisterLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  timelineRegisterLinkText: {
    fontSize: 12,
    color: "#2457D6",
    fontWeight: "700",
  },
  heroGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -4,
  },
  heroTile: {
    width: "48%",
    backgroundColor: "#1D4FB9",
    borderRadius: 16,
    padding: 12,
    margin: "1%",
    borderWidth: 1,
    borderColor: "#5B82DE",
  },
  heroTileLabel: {
    color: "#D4E0FF",
    fontSize: 10,
    textTransform: "uppercase",
    fontWeight: "600",
    marginTop: 4,
  },
  heroTileValue: {
    color: "#FFFFFF",
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
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E5EAF2",
    shadowColor: "#243B64",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  listTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
  listSubtitle: {
    color: "#6B778C",
    fontSize: 12,
    marginTop: 2,
    marginBottom: 16,
  },
  emptyText: {
    color: "#8793A5",
    fontSize: 14,
    textAlign: "center",
    paddingVertical: 20,
  },
  timelineRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#EDF1F6",
    paddingVertical: 12,
  },
  timelineMain: {
    flex: 1,
    paddingRight: 12,
  },
  timelineDate: {
    color: "#152238",
    fontSize: 14,
    fontWeight: "600",
  },
  timelinePunches: {
    color: "#6B778C",
    fontSize: 11,
    marginTop: 4,
  },
  timelineBadgeContainer: {
    alignItems: "flex-end",
  },
  timelineHours: {
    color: "#152238",
    fontSize: 14,
    fontWeight: "700",
  },
  badgeApproved: {
    backgroundColor: "#174AB8",
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
  // Stage 3 Roster schedule styles
  rosterHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  rosterBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  rosterBadgeDay: {
    backgroundColor: "#174AB8",
    borderColor: "#065f46",
  },
  rosterBadgeOvernight: {
    backgroundColor: "#312e81",
    borderColor: "#4338ca",
  },
  rosterBadgeTextDay: {
    color: "#34d399",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  rosterBadgeTextOvernight: {
    color: "#a5b4fc",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  activeShiftCard: {
    backgroundColor: "#0f172a",
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#334155",
    marginBottom: 16,
  },
  activeShiftInfo: {
    flex: 1,
  },
  activeShiftName: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
  activeShiftTimes: {
    color: "#34d399",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 2,
  },
  activeShiftHours: {
    alignItems: "flex-end",
    backgroundColor: "#1e293b",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  activeShiftHoursText: {
    color: "#152238",
    fontSize: 15,
    fontWeight: "800",
  },
  activeShiftHoursLabel: {
    color: "#94a3b8",
    fontSize: 9,
    textTransform: "uppercase",
  },
  rosterList: {
    marginTop: 8,
  },
  rosterSubheading: {
    color: "#6B778C",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  rosterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#EDF1F6",
    paddingVertical: 10,
  },
  rosterRowDate: {
    width: 90,
  },
  rosterDateText: {
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: "600",
  },
  rosterRowShift: {
    flex: 1,
    paddingHorizontal: 8,
  },
  rosterShiftName: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "600",
  },
  rosterShiftTimes: {
    color: "#6B778C",
    fontSize: 11,
  },
  rosterRowHours: {
    alignItems: "flex-end",
  },
  rosterHoursText: {
    color: "#10b981",
    fontSize: 12,
    fontWeight: "700",
  },
});
