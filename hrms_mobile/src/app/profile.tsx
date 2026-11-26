import React from "react";
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  Alert,
  Image,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { User, LogOut, Mail, Award, Calendar, Bookmark } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { formatCompanyDate } from "../utils/date";

export default function ProfileScreen() {
  const router = useRouter();
  const { user, logout, themeColor } = useAuth();

  const handleLogout = () => {
    Alert.alert(
      "Confirm Sign Out",
      "Are you sure you want to end your active workspace session?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Log Out",
          style: "destructive",
          onPress: async () => {
            await logout();
          },
        },
      ]
    );
  };

  const getRoleName = (role: string) => {
    switch (role?.toLowerCase()) {
      case "superadmin":
        return "System Owner";
      case "admin":
        return "Administrator";
      case "hr":
        return "HR Representative";
      case "manager":
        return "Workspace Manager";
      case "employee":
      default:
        return "Active Employee";
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Header Avatar Card */}
        <View style={styles.profileHeaderCard}>
          {user?.profile_picture ? (
            <Image
              source={{ uri: user.profile_picture }}
              style={[styles.avatarCircle, { borderColor: themeColor }]}
            />
          ) : (
            <View style={[styles.avatarCircle, { borderColor: themeColor }]}>
              <User size={40} color={themeColor} />
            </View>
          )}
          <Text style={styles.profileName}>
            {user?.first_name ? `${user.first_name} ${user.last_name || ""}` : user?.username}
          </Text>
          <View style={[styles.roleBadge, { backgroundColor: `${themeColor}20`, borderColor: themeColor }]}>
            <Award size={12} color={themeColor} style={{ marginRight: 4 }} />
            <Text style={[styles.roleBadgeText, { color: themeColor }]}>
              {getRoleName(user?.role || "")}
            </Text>
          </View>
        </View>

        {/* Credentials Details Block */}
        <View style={styles.detailsBlock}>
          <Text style={styles.blockTitle}>Profile Information</Text>

          <View style={styles.detailRow}>
            <Bookmark size={18} color="#64748b" style={styles.rowIcon} />
            <View>
              <Text style={styles.detailLabel}>Username</Text>
              <Text style={styles.detailValue}>{user?.username}</Text>
            </View>
          </View>

          <View style={styles.detailRow}>
            <Mail size={18} color="#64748b" style={styles.rowIcon} />
            <View>
              <Text style={styles.detailLabel}>Email Address</Text>
              <Text style={styles.detailValue}>{user?.email || "No email registered"}</Text>
            </View>
          </View>

          {user?.joining_date && (
            <View style={styles.detailRow}>
              <Calendar size={18} color="#64748b" style={styles.rowIcon} />
              <View>
                <Text style={styles.detailLabel}>Joining Date</Text>
                <Text style={styles.detailValue}>{formatCompanyDate(user.joining_date)}</Text>
              </View>
            </View>
          )}

          <TouchableOpacity 
            style={[styles.detailRow, { marginTop: 8 }]} 
            onPress={() => router.push("/my-documents")}
          >
            <Bookmark size={18} color={themeColor} style={styles.rowIcon} />
            <View>
              <Text style={[styles.detailValue, { color: themeColor }]}>My Documents</Text>
              <Text style={styles.detailLabel}>Tap to view your files</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Workspace support contact */}
        <View style={styles.detailsBlock}>
          <Text style={styles.blockTitle}>Workspace Support</Text>
          <Text style={styles.supportText}>
            For shifts modifications, geofence updates, or salary approvals, contact your HR department.
          </Text>
        </View>

        {/* Sign Out Button */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <LogOut size={18} color="#f87171" style={{ marginRight: 8 }} />
          <Text style={styles.logoutButtonText}>Sign Out of Workspace</Text>
        </TouchableOpacity>
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
    padding: 16,
    paddingBottom: 40,
  },
  profileHeaderCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E5EAF2",
    shadowColor: "#243B64",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#EAF0FF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    marginBottom: 16,
  },
  profileName: {
    color: "#152238",
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 8,
  },
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  detailsBlock: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E5EAF2",
    shadowColor: "#243B64",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  blockTitle: {
    color: "#152238",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#EDF1F6",
    paddingBottom: 10,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  rowIcon: {
    marginRight: 14,
  },
  detailLabel: {
    color: "#68758A",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  detailValue: {
    color: "#152238",
    fontSize: 15,
    fontWeight: "700",
    marginTop: 2,
  },
  supportText: {
    color: "#68758A",
    fontSize: 13,
    lineHeight: 19,
  },
  logoutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF1F2",
    borderWidth: 1,
    borderColor: "#FECDD3",
    paddingVertical: 14,
    borderRadius: 16,
    marginTop: 10,
  },
  logoutButtonText: {
    color: "#E11D48",
    fontSize: 15,
    fontWeight: "700",
  },
});
