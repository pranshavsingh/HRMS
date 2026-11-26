import React from "react";
import { Tabs, useRouter } from "expo-router";
import { useAuth } from "../../context/AuthContext";
import { useNotifications } from "../../context/NotificationContext";
import { useApprovalCounts } from "../../context/ApprovalCountsContext";
import PendingCountBadge from "../../components/PendingCountBadge";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { 
  Bell,
  LayoutDashboard, 
  Fingerprint, 
  Calendar, 
  CalendarClock,
  History, 
  CheckSquare, 
  Users, 
  TrendingUp, 
  Shield, 
  Contact, 
  FileSpreadsheet, 
  Files,
  CalendarDays,
  ChevronLeft
} from "lucide-react-native";
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function TabsLayout() {
  const { user, isLoading, activeTab } = useAuth();
  const { unreadCount } = useNotifications();
  const { attendancePendingCount, leavePendingCount, loading: countsLoading, error: countsError } = useApprovalCounts();
  const totalApprovalsPending = attendancePendingCount + leavePendingCount;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabBarBottomInset = Math.max(insets.bottom, 8);
  const profileInitial = (user?.first_name || user?.username || "U").charAt(0).toUpperCase();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  const role = user?.role || "employee";
  const isEmployee = role === "employee";
  const isManager = role === "manager";
  const isHR = role === "hr";
  const isAdmin = role === "admin" || role === "superadmin";
  const isSuperadmin = role === "superadmin";

  const showWorkspace = isManager || isHR || isAdmin || isSuperadmin;
  const showAudit = isSuperadmin;
  const showStaffDir = isHR || isAdmin || isSuperadmin;

  const isPersonal = activeTab === "personal";
  const isSystem = activeTab === "system";

  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        headerStyle: {
          backgroundColor: "#F6F8FC",
          borderBottomWidth: 0,
          elevation: 0,
          shadowOpacity: 0,
        },
        headerTitleStyle: {
          color: "#152238",
          fontWeight: "700",
          fontSize: 18,
        },
        headerTitleAlign: "left",
        tabBarActiveTintColor: "#2457D6",
        tabBarInactiveTintColor: "#8995A7",
        headerRight: () => (
          <View style={styles.headerRightContainer} pointerEvents="box-none">
            <TouchableOpacity
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications"}
              style={styles.bellButton}
              onPress={() => router.push("/notifications")}
            >
              <Bell size={20} color="#2457D6" />
              {unreadCount > 0 && (
                <View style={styles.bellBadge}>
                  <Text style={styles.bellBadgeText}>
                    {unreadCount > 99 ? "99+" : String(unreadCount)}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Open profile"
              style={styles.profileButton}
              onPress={() => router.push("/profile")}
            >
              {user?.profile_picture ? (
                <Image source={{ uri: user.profile_picture }} style={styles.profileImage} />
              ) : (
                <View style={styles.profileInitial}><Text style={styles.profileInitialText}>{profileInitial}</Text></View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Open holiday calendar"
              style={styles.calendarButton}
              onPress={() => router.push("/holidays")}
            >
              <CalendarDays size={20} color="#2457D6" />
            </TouchableOpacity>
          </View>
        ),
        headerRightContainerStyle: { paddingRight: 16 },
        tabBarStyle: {
          backgroundColor: "#FFFFFF",
          borderTopColor: "#E8EDF4",
          borderTopWidth: 1,
          height: 59 + tabBarBottomInset,
          paddingBottom: tabBarBottomInset,
          paddingTop: 8,
          elevation: 10,
          shadowColor: "#172B4D",
          shadowOpacity: 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: -3 },
        },
      }}
    >
      {/* 1. Portal Tabs - Visible to all */}
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Dashboard",
          tabBarLabel: "Dashboard",
          tabBarIcon: ({ color, size }) => <LayoutDashboard color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="punch"
        options={{
          title: "Punch Desk",
          tabBarLabel: "Punch",
          tabBarIcon: ({ color, size }) => <Fingerprint color={color} size={size} />,
          href: isPersonal ? "/(tabs)/punch" : null,
        }}
      />
      <Tabs.Screen
        name="leave"
        options={{
          title: "Leaves",
          tabBarLabel: "Leaves",
          tabBarIcon: ({ color, size }) => <Calendar color={color} size={size} />,
          href: isPersonal ? "/(tabs)/leave" : null,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "Attendance Register",
          tabBarLabel: "Register",
          tabBarIcon: ({ color, size }) => <CalendarDays color={color} size={size} />,
          href: isPersonal ? "/(tabs)/history" : null,
        }}
      />
      <Tabs.Screen
        name="shifts"
        options={{
          title: "My Shifts",
          tabBarLabel: "Shifts",
          tabBarIcon: ({ color, size }) => <CalendarClock color={color} size={size} />,
          href: isPersonal ? "/(tabs)/shifts" : null,
        }}
      />

      {/* 2. Workspace Tabs - Visible to Managers / HR / Admin */}
      <Tabs.Screen
        name="approvals"
        options={{
          title: "Approvals",
          tabBarLabel: "Approvals",
          tabBarIcon: ({ color, size }) => (
            <View style={{ position: "relative" }}>
              <CheckSquare color={color} size={size} />
              <PendingCountBadge
                count={totalApprovalsPending}
                loading={countsLoading}
                error={countsError}
                label="Pending Approvals"
                style={{ position: "absolute", top: -6, right: -12 }}
              />
            </View>
          ),
          href: (isSystem && showWorkspace) ? "/(tabs)/approvals" : null,
        }}
      />
      <Tabs.Screen
        name="team-attendance"
        options={{
          title: "Roster Attendance",
          tabBarLabel: "Roster",
          tabBarIcon: ({ color, size }) => <Users color={color} size={size} />,
          href: (isSystem && showWorkspace) ? "/(tabs)/team-attendance" : null,
        }}
      />
      <Tabs.Screen
        name="team-analytics"
        options={{
          title: "Team Analytics",
          tabBarLabel: "Analytics",
          tabBarIcon: ({ color, size }) => <TrendingUp color={color} size={size} />,
          href: (isSystem && showWorkspace) ? "/(tabs)/team-analytics" : null,
        }}
      />
      <Tabs.Screen
        name="employee-documents"
        options={{
          title: "Staff Docs",
          tabBarLabel: "Docs Portal",
          tabBarIcon: ({ color, size }) => <Files color={color} size={size} />,
          href: (isSystem && showStaffDir) ? "/(tabs)/employee-documents" : null,
        }}
      />

      {/* 3. HR/Admin Roster Directory */}
      <Tabs.Screen
        name="employees"
        options={{
          title: "Staff Directory",
          tabBarLabel: "Staff",
          tabBarIcon: ({ color, size }) => <Contact color={color} size={size} />,
          href: (isSystem && showStaffDir) ? "/(tabs)/employees" : null,
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: "Reports Desk",
          tabBarLabel: "Reports",
          tabBarIcon: ({ color, size }) => <FileSpreadsheet color={color} size={size} />,
          href: null, // Restricted on mobile per Part 1 Enterprise Export Restrictions
        }}
      />

      {/* 4. Superadmin System Audits */}
      <Tabs.Screen
        name="audit-logs"
        options={{
          title: "Compliance Audit",
          tabBarLabel: "Audits",
          tabBarIcon: ({ color, size }) => <Shield color={color} size={size} />,
          href: (isSystem && showAudit) ? "/(tabs)/audit-logs" : null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  headerRightContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  bellButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF4FF",
    borderWidth: 1,
    borderColor: "#D9E5FF",
    position: "relative",
  },
  bellBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#E11D48",
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#F6F8FC",
  },
  bellBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
  },
  profileButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#D9E5FF",
  },
  calendarButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF4FF",
    borderWidth: 1,
    borderColor: "#D9E5FF",
  },
  backButton: {
    padding: 6,
    marginLeft: 12,
  },
  profileImage: {
    width: "100%",
    height: "100%",
  },
  profileInitial: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2457D6",
  },
  profileInitialText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#F6F8FC",
    alignItems: "center",
    justifyContent: "center",
  },
});
