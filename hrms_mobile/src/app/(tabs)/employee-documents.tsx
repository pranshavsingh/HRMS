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
import { useAuth } from "../../context/AuthContext";
import * as WebBrowser from "expo-web-browser";
import { Users, FileText, Search, Eye, ExternalLink, ShieldCheck, FolderOpen, X, ShieldAlert } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatCompanyDate } from "../../utils/date";

interface Employee {
  id: number;
  username: string;
  first_name?: string;
  last_name?: string;
  role: string;
}

interface DocumentRecord {
  id: number;
  title: string;
  file: string;
  uploaded_at: string;
}

export default function EmployeeDocumentsScreen() {
  const { user } = useAuth();
  const isAuthorized = user && ["hr", "admin", "superadmin"].includes(user.role?.toLowerCase());

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);

  const fetchEmployees = useCallback(async (showLoader = true) => {
    if (!isAuthorized) {
      setLoading(false);
      return;
    }
    if (showLoader) setLoading(true);
    try {
      const res = await api.get("/auth/employees/");
      const empList = Array.isArray(res.data)
        ? res.data
        : Array.isArray(res.data?.data)
        ? res.data.data
        : Array.isArray(res.data?.records)
        ? res.data.records
        : [];
      setEmployees(empList);
    } catch (err: any) {
      console.error("Error fetching employees in documents", err);
      Alert.alert("Sync Error", "Unable to load employees list.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAuthorized]);

  const fetchDocuments = async (userId: number) => {
    setDocsLoading(true);
    try {
      const res = await api.get(`/auth/documents/${userId}/`);
      const docList = Array.isArray(res.data)
        ? res.data
        : Array.isArray(res.data?.data)
        ? res.data.data
        : Array.isArray(res.data?.records)
        ? res.data.records
        : [];
      setDocuments(docList);
    } catch (err: any) {
      console.error("Error fetching employee docs", err);
      Alert.alert("Sync Error", "Unable to load files list for this employee.");
      setDocuments([]);
    } finally {
      setDocsLoading(false);
    }
  };

  useRealtime("employee_update", () => fetchEmployees(false));
  useRealtime("document_update", () => {
    fetchEmployees(false);
    if (selectedEmp) {
      fetchDocuments(selectedEmp.id);
    }
  });
  useRealtime("realtime:connected", () => {
    fetchEmployees(false);
    if (selectedEmp) {
      fetchDocuments(selectedEmp.id);
    }
  });

  useEffect(() => {
    const t = setTimeout(() => { void fetchEmployees(true); }, 0);
    return () => clearTimeout(t);
  }, [fetchEmployees]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchEmployees(false);
    if (selectedEmp) {
      fetchDocuments(selectedEmp.id);
    }
  };

  const handleSelectEmployee = (emp: Employee) => {
    setSelectedEmp(emp);
    fetchDocuments(emp.id);
  };

  const handleClearSelection = () => {
    setSelectedEmp(null);
    setDocuments([]);
  };

  const handleOpenDocument = async (url: string) => {
    if (!url) return;
    try {
      let fullUrl = url;
      if (url.startsWith("/")) {
        const base = api.defaults.baseURL || "";
        const origin = base.replace(/\/api\/?$/, "");
        fullUrl = `${origin}${url}`;
      }
      await WebBrowser.openBrowserAsync(fullUrl);
    } catch {
      Alert.alert("Error", "Could not open document viewer.");
    }
  };

  const filteredEmployees = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return employees;
    return employees.filter(
      (emp) =>
        emp.username?.toLowerCase().includes(query) ||
        emp.first_name?.toLowerCase().includes(query) ||
        emp.last_name?.toLowerCase().includes(query)
    );
  }, [employees, searchQuery]);

  if (!isAuthorized) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
        <View style={styles.emptyContainer}>
          <ShieldAlert size={44} color="#DC2626" style={{ marginBottom: 12 }} />
          <Text style={[styles.emptyText, { fontWeight: "700", fontSize: 16, color: "#DC2626" }]}>
            Access Restricted
          </Text>
          <Text style={[styles.emptyText, { marginTop: 6, textAlign: "center", paddingHorizontal: 20 }]}>
            Only HR and Administration roles are authorized to access the staff compliance documents desk.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // --- RENDER EMPLOYEE LIST (CHOOSE MEMBER) ---
  if (!selectedEmp) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
        <View style={styles.filterSection}>
          <View style={styles.searchRow}>
            <Search size={16} color="#68758A" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search staff folder..."
              placeholderTextColor="#8995A7"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
        </View>

        {loading ? (
          <View style={styles.centeredSpinner}>
            <ActivityIndicator size="large" color="#2457D6" />
          </View>
        ) : (
          <FlatList
            data={filteredEmployees}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.empCard} onPress={() => handleSelectEmployee(item)}>
                <View style={styles.empInfo}>
                  <View style={styles.empIconBox}>
                    <Users size={18} color="#2457D6" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.empName}>
                      {item.first_name ? `${item.first_name} ${item.last_name || ""}` : item.username}
                    </Text>
                    <Text style={styles.empMeta}>
                      Username: {item.username} | Role: {item.role}
                    </Text>
                  </View>
                </View>
                <FolderOpen size={18} color="#68758A" />
              </TouchableOpacity>
            )}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2457D6" />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Users size={32} color="#8995A7" />
                <Text style={styles.emptyText}>No employee records found.</Text>
              </View>
            }
          />
        )}
      </SafeAreaView>
    );
  }

  // --- RENDER SELECTED EMPLOYEE DOCUMENTS LIST ---
  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      {/* Target Member Header Info Card */}
      <View style={styles.selectedEmpHeader}>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>
            {selectedEmp.first_name
              ? `${selectedEmp.first_name} ${selectedEmp.last_name || ""}`
              : selectedEmp.username}
          </Text>
          <Text style={styles.headerSubtitle}>Member Directory Folder</Text>
        </View>
        <TouchableOpacity style={styles.backBtn} onPress={handleClearSelection}>
          <X size={16} color="#152238" style={{ marginRight: 6 }} />
          <Text style={styles.backBtnText}>Close Folder</Text>
        </TouchableOpacity>
      </View>

      {docsLoading ? (
        <View style={styles.centeredSpinner}>
          <ActivityIndicator size="large" color="#2457D6" />
        </View>
      ) : (
        <FlatList
          data={documents}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <View style={styles.docCard}>
              <View style={styles.docInfo}>
                <View style={styles.docIconBox}>
                  <FileText size={20} color="#2457D6" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.docTitle}>{item.title}</Text>
                  <Text style={styles.docDate}>
                    Uploaded: {formatCompanyDate(item.uploaded_at)}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.openBtn}
                onPress={() => handleOpenDocument(item.file)}
              >
                <ExternalLink size={14} color="#2457D6" style={{ marginRight: 6 }} />
                <Text style={styles.openBtnText}>Preview</Text>
              </TouchableOpacity>
            </View>
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2457D6" />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <FileText size={32} color="#8995A7" />
              <Text style={styles.emptyText}>No documents uploaded in this folder yet.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F6F8FC",
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
  centeredSpinner: {
    flex: 1,
    justifyContent: "center",
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  empCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5EAF2",
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#243B64",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  empInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingRight: 10,
  },
  empIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#EAF0FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  empName: {
    color: "#152238",
    fontSize: 14,
    fontWeight: "700",
  },
  empMeta: {
    color: "#68758A",
    fontSize: 11,
    marginTop: 2,
  },
  selectedEmpHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5EAF2",
  },
  headerInfo: {
    flex: 1,
    paddingRight: 10,
  },
  headerTitle: {
    color: "#152238",
    fontSize: 16,
    fontWeight: "800",
  },
  headerSubtitle: {
    color: "#2457D6",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    marginTop: 2,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  backBtnText: {
    color: "#152238",
    fontSize: 11,
    fontWeight: "700",
  },
  docCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5EAF2",
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#243B64",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  docInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingRight: 10,
  },
  docIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#EAF0FF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  docTitle: {
    color: "#152238",
    fontSize: 14,
    fontWeight: "700",
  },
  docDate: {
    color: "#68758A",
    fontSize: 11,
    marginTop: 2,
  },
  openBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EAF0FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  openBtnText: {
    color: "#2457D6",
    fontSize: 11,
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
