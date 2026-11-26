import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import api from "../../services/api";
import { useRealtime } from "../../context/RealtimeContext";
import EmployeeRegisterModal from "../../components/EmployeeRegisterModal";
import {
  Contact,
  Search,
  MapPin,
  User,
  CalendarDays,
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface Employee {
  id: number;
  username: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  role: string;
  designation?: string;
  joining_date?: string;
  latitude?: number | null;
  longitude?: number | null;
  allowed_radius?: number | null;
}

export default function EmployeesScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [registerTarget, setRegisterTarget] = useState<{ id: number; name: string; username: string } | null>(null);

  const fetchEmployeesList = useCallback(async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const empRes = await api.get("/auth/employees/");
      const empList = Array.isArray(empRes.data)
        ? empRes.data
        : Array.isArray(empRes.data?.data)
        ? empRes.data.data
        : Array.isArray(empRes.data?.records)
        ? empRes.data.records
        : [];
      setEmployees(empList);
    } catch (err: any) {
      console.error("Error loading staff roster directory", err);
      Alert.alert("Sync Error", "Unable to load employees database.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useRealtime("employee_update", () => fetchEmployeesList(false));
  useRealtime("realtime:connected", () => fetchEmployeesList(false));

  useEffect(() => {
    const t = setTimeout(() => { void fetchEmployeesList(true); }, 0);
    return () => clearTimeout(t);
  }, [fetchEmployeesList]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchEmployeesList(false);
  };

  const filteredEmployees = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return employees;
    return employees.filter(
      (emp) =>
        emp.username?.toLowerCase().includes(query) ||
        emp.first_name?.toLowerCase().includes(query) ||
        emp.last_name?.toLowerCase().includes(query) ||
        emp.email?.toLowerCase().includes(query) ||
        emp.designation?.toLowerCase().includes(query)
    );
  }, [employees, searchQuery]);

  const renderRosterItem = ({ item }: { item: Employee }) => {
    const hasLocation =
      item.latitude !== undefined &&
      item.latitude !== null &&
      item.longitude !== undefined &&
      item.longitude !== null;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.userRow}>
            <View style={styles.avatarBox}>
              <User size={14} color="#2457D6" />
            </View>
            <Text style={styles.employeeName} numberOfLines={1}>
              {item.first_name ? `${item.first_name} ${item.last_name || ""}`.trim() : item.username}
            </Text>
          </View>
          <View style={styles.roleTag}>
            <Text style={styles.roleTagText}>{item.role?.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.cardContent}>
          {item.designation ? (
            <Text style={styles.metaRow}>Title: {item.designation}</Text>
          ) : null}
          <Text style={styles.metaRow}>Username: {item.username}</Text>
          <Text style={styles.metaRow}>Email: {item.email || "N/A"}</Text>

          {hasLocation ? (
            <View style={styles.telemetryBox}>
              <MapPin size={12} color="#2457D6" style={{ marginRight: 6 }} />
              <Text style={styles.telemetryText}>
                Perimeter: {Number(item.latitude).toFixed(4)}, {Number(item.longitude).toFixed(4)} ({item.allowed_radius || 100}m zone)
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.cardFooter}>
          <TouchableOpacity
            style={styles.registerBtn}
            onPress={() =>
              setRegisterTarget({
                id: item.id,
                name: item.first_name ? `${item.first_name} ${item.last_name || ""}`.trim() : item.username,
                username: item.username,
              })
            }
          >
            <CalendarDays size={14} color="#2457D6" style={{ marginRight: 6 }} />
            <Text style={styles.registerBtnText}>View Attendance Register</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2457D6" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      <View style={styles.filterSection}>
        <View style={styles.searchRow}>
          <Search size={16} color="#68758A" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search staff database..."
            placeholderTextColor="#8995A7"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      <FlatList
        data={filteredEmployees}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderRosterItem}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2457D6" />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Contact size={32} color="#8995A7" />
            <Text style={styles.emptyText}>No employee records found in payroll registry.</Text>
          </View>
        }
      />

      <EmployeeRegisterModal
        employee={registerTarget}
        onClose={() => setRegisterTarget(null)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F6F8FC",
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#F6F8FC",
    alignItems: "center",
    justifyContent: "center",
  },
  filterSection: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5EAF2",
    padding: 16,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    color: "#152238",
    flex: 1,
    height: 40,
    fontSize: 14,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5EAF2",
    shadowColor: "#243B64",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#EDF1F6",
    paddingBottom: 10,
    marginBottom: 10,
  },
  userRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    marginRight: 8,
  },
  avatarBox: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: "#EAF0FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  employeeName: {
    flex: 1,
    color: "#152238",
    fontSize: 14,
    fontWeight: "700",
  },
  roleTag: {
    backgroundColor: "#EAF0FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  roleTagText: {
    color: "#2457D6",
    fontSize: 10,
    fontWeight: "700",
  },
  cardContent: {
    marginTop: 2,
  },
  metaRow: {
    color: "#68758A",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 2,
  },
  telemetryBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F0F6FF",
    borderWidth: 1,
    borderColor: "#DBEAFE",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 10,
  },
  telemetryText: {
    color: "#2457D6",
    fontSize: 11,
    fontWeight: "600",
  },
  cardFooter: {
    borderTopWidth: 1,
    borderTopColor: "#EDF1F6",
    paddingTop: 12,
    marginTop: 12,
  },
  registerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EAF0FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  registerBtnText: {
    color: "#2457D6",
    fontSize: 12,
    fontWeight: "700",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
  },
  emptyText: {
    color: "#8995A7",
    fontSize: 13,
    marginTop: 12,
    textAlign: "center",
  },
});
