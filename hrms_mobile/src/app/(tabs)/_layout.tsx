import React from "react";
import { Tabs } from "expo-router";
import { useAuth } from "../../context/AuthContext";
import { 
  LayoutDashboard, 
  Fingerprint, 
  Calendar, 
  History, 
  User, 
  CheckSquare, 
  Users, 
  TrendingUp, 
  Shield, 
  Contact, 
  FileSpreadsheet, 
  Files 
} from "lucide-react-native";
import { ActivityIndicator, View, StyleSheet } from "react-native";

export default function TabsLayout() {
  const { user, isLoading, activeTab } = useAuth();

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
          backgroundColor: "#0f172a",
          borderBottomWidth: 1,
          borderBottomColor: "#1e293b",
        },
        headerTitleStyle: {
          color: "#ffffff",
          fontWeight: "700",
          fontSize: 18,
        },
        tabBarActiveTintColor: "#10b981", // Emerald
        tabBarInactiveTintColor: "#94a3b8", // Slate 400
        tabBarStyle: {
          backgroundColor: "#0f172a",
          borderTopColor: "#1e293b",
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
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
          title: "My History",
          tabBarLabel: "History",
          tabBarIcon: ({ color, size }) => <History color={color} size={size} />,
          href: isPersonal ? "/(tabs)/history" : null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarLabel: "Profile",
          tabBarIcon: ({ color, size }) => <User color={color} size={size} />,
          href: isPersonal ? "/(tabs)/profile" : null,
        }}
      />
      <Tabs.Screen name="holidays" options={{ title: "Holiday Calendar", href: null }} />

      {/* 2. Workspace Tabs - Visible to Managers / HR / Admin */}
      <Tabs.Screen
        name="approvals"
        options={{
          title: "Approvals",
          tabBarLabel: "Approvals",
          tabBarIcon: ({ color, size }) => <CheckSquare color={color} size={size} />,
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
          href: (isSystem && showWorkspace) ? "/(tabs)/employee-documents" : null,
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
          href: (isSystem && showStaffDir) ? "/(tabs)/reports" : null,
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
  loadingContainer: {
    flex: 1,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
});
