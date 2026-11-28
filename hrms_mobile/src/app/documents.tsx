import React, { useEffect, useState, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useRealtime } from "../context/RealtimeContext";
import { useCursorPagination } from "../hooks/useCursorPagination";
import PaginatedFlatList from "../components/pagination/PaginatedFlatList";
import { FileUp, Upload, CheckCircle2, FileText, Search, ChevronDown, User, X } from "lucide-react-native";

interface Employee {
  id: number;
  username: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  employee_code?: string;
}

const documentOptions = [
  "Aadhar Card",
  "PAN Card",
  "Bank Details",
  "CV",
  "Voter ID",
  "Driving License",
  "Other",
];

export default function DocumentUploadScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [submitting, setSubmitting] = useState<boolean>(false);

  const [selectedEmpId, setSelectedEmpId] = useState<string>("");
  const [empSearchQuery, setEmpSearchQuery] = useState<string>("");
  const [selectedDocType, setSelectedDocType] = useState<string>("Aadhar Card");
  const [selectedFile, setSelectedFile] = useState<{
    uri: string;
    name: string;
    type?: string;
  } | null>(null);

  // Selector modal states
  const [showEmpSelector, setShowEmpSelector] = useState<boolean>(false);
  const [showDocSelector, setShowDocSelector] = useState<boolean>(false);

  const {
    items: employees,
    loading,
    refreshing,
    loadingMore,
    hasMore,
    error,
    refresh,
    loadMore,
    retry,
  } = useCursorPagination<Employee>({
    endpoint: "/auth/employees/",
    params: useMemo(() => ({ search: empSearchQuery.trim() || undefined }), [empSearchQuery]),
    limit: 25,
    getItemKey: (e) => e.id,
  });

  useRealtime("document_update", () => refresh());
  useRealtime("employee_update", () => refresh());
  useRealtime("realtime:connected", () => refresh());

  const filteredEmployees = useMemo(() => {
    return employees.filter((e) => String(e.id) !== String(user?.id));
  }, [employees, user?.id]);

  const handlePickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setSelectedFile({
          uri: asset.uri,
          name: asset.name,
          type: asset.mimeType,
        });
      }
    } catch (err) {
      console.error("Document picking failed:", err);
      Alert.alert("Error", "Failed to select document");
    }
  };

  const handleUpload = async () => {
    if (!selectedEmpId) {
      Alert.alert("Input Required", "Please select an employee");
      return;
    }
    if (String(selectedEmpId) === String(user?.id)) {
      Alert.alert("Action Restricted", "You cannot upload your own documents from the mobile application.");
      return;
    }
    if (!selectedFile) {
      Alert.alert("Input Required", "Please select a file to upload");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("user", selectedEmpId);
      formData.append("title", selectedDocType);

      const fileData = {
        uri: selectedFile.uri,
        name: selectedFile.name,
        type: selectedFile.type || "application/octet-stream",
      };
      formData.append("file", fileData as any);

      const res = await api.post("/auth/documents/upload/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      Alert.alert("Success", res.data?.message || "Document uploaded successfully", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (err: any) {
      console.error("Upload failed:", err.response?.data || err.message);
      Alert.alert("Upload Failed", err.response?.data?.error || "Failed to upload document");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2457D6" />
      </View>
    );
  }

  const selectedEmp = employees.find((e) => String(e.id) === selectedEmpId);
  const selectedEmployeeName = selectedEmp
    ? `${selectedEmp.first_name || ""} ${selectedEmp.last_name || ""}`.trim() || selectedEmp.username
    : "Select Employee...";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <View style={styles.heroCard}>
        <View style={styles.heroHeader}>
          <FileUp size={20} color="#2457D6" style={{ marginRight: 8 }} />
          <Text style={styles.heroTitle}>Document Upload Desk</Text>
        </View>
        <Text style={styles.heroDesc}>
          Upload joining letters, onboarding forms, or critical certificates for staff files securely.
        </Text>
      </View>

      <View style={styles.formCard}>
        {/* Employee Dropdown Selection */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Select Employee</Text>
          <TouchableOpacity
            style={styles.selectorBtn}
            onPress={() => setShowEmpSelector(!showEmpSelector)}
          >
            <Text style={[styles.selectorBtnText, !selectedEmpId && styles.placeholderText]}>
              {selectedEmployeeName}
            </Text>
            <ChevronDown size={16} color="#68758A" />
          </TouchableOpacity>

          {showEmpSelector && (
            <View style={styles.dropdownContainer}>
              {/* Search input for large employee rosters */}
              <View style={styles.searchRow}>
                <Search size={14} color="#68758A" style={{ marginRight: 6 }} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search staff by name or code..."
                  placeholderTextColor="#8995A7"
                  value={empSearchQuery}
                  onChangeText={setEmpSearchQuery}
                />
                {empSearchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setEmpSearchQuery("")}>
                    <X size={14} color="#8995A7" />
                  </TouchableOpacity>
                )}
              </View>

              <View style={styles.dropdownScroll}>
                <PaginatedFlatList
                  items={filteredEmployees}
                  keyExtractor={(emp: Employee) => String(emp.id)}
                  nestedScrollEnabled
                  loading={loading && employees.length === 0}
                  refreshing={refreshing}
                  loadingMore={loadingMore}
                  hasMore={hasMore}
                  error={error}
                  onRefresh={refresh}
                  onLoadMore={loadMore}
                  onRetry={retry}
                  emptyTitle="No matching staff members found"
                  renderItem={({ item: emp }: { item: Employee }) => {
                    const fullName = `${emp.first_name || ""} ${emp.last_name || ""}`.trim();
                    const isSelected = selectedEmpId === String(emp.id);
                    return (
                      <TouchableOpacity
                        style={[styles.dropdownItem, isSelected && styles.dropdownItemActive]}
                        onPress={() => {
                          setSelectedEmpId(String(emp.id));
                          setShowEmpSelector(false);
                        }}
                      >
                        <View style={styles.empRow}>
                          <Text style={[styles.empName, isSelected && styles.empNameActive]}>
                            {fullName || emp.username}
                          </Text>
                          <Text style={styles.empMeta}>
                            {emp.employee_code ? `Code: ${emp.employee_code} • ` : ""}@{emp.username}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                />
              </View>
            </View>
          )}
        </View>

        {/* Document Type Dropdown Selection */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Document Type</Text>
          <TouchableOpacity
            style={styles.selectorBtn}
            onPress={() => setShowDocSelector(!showDocSelector)}
          >
            <Text style={styles.selectorBtnText}>{selectedDocType}</Text>
            <ChevronDown size={16} color="#68758A" />
          </TouchableOpacity>

          {showDocSelector && (
            <View style={styles.dropdownContainer}>
              {documentOptions.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.dropdownItem, selectedDocType === opt && styles.dropdownItemActive]}
                  onPress={() => {
                    setSelectedDocType(opt);
                    setShowDocSelector(false);
                  }}
                >
                  <Text style={[styles.empName, selectedDocType === opt && styles.empNameActive]}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Document Picker Button */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Select File</Text>
          <TouchableOpacity
            style={styles.filePickerBtn}
            onPress={handlePickDocument}
          >
            <FileText size={18} color="#68758A" style={{ marginRight: 8 }} />
            <Text style={styles.filePickerText} numberOfLines={1}>
              {selectedFile ? selectedFile.name : "Choose File..."}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Action Button */}
        <TouchableOpacity
          style={[styles.uploadBtn, (submitting || !selectedEmpId || !selectedFile) && styles.uploadBtnDisabled]}
          onPress={handleUpload}
          disabled={submitting || !selectedEmpId || !selectedFile}
        >
          {submitting ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <>
              <Upload size={16} color="#ffffff" style={{ marginRight: 8 }} />
              <Text style={styles.uploadBtnText}>Upload Document</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F6F8FC",
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: "#F6F8FC",
    justifyContent: "center",
    alignItems: "center",
  },
  heroCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5EAF2",
    padding: 20,
    marginBottom: 20,
    shadowColor: "#243B64",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  heroHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#152238",
  },
  heroDesc: {
    fontSize: 13,
    color: "#68758A",
    lineHeight: 18,
  },
  formCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5EAF2",
    padding: 20,
    shadowColor: "#243B64",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  inputGroup: {
    marginBottom: 18,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "#68758A",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  selectorBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  selectorBtnText: {
    color: "#152238",
    fontSize: 14,
    fontWeight: "600",
  },
  placeholderText: {
    color: "#8995A7",
    fontWeight: "normal",
  },
  dropdownContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginTop: 6,
    overflow: "hidden",
    elevation: 3,
    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderBottomWidth: 1,
    borderBottomColor: "#EDF1F6",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    color: "#152238",
    fontSize: 13,
    paddingVertical: 4,
  },
  dropdownScroll: {
    maxHeight: 200,
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#EDF1F6",
  },
  dropdownItemActive: {
    backgroundColor: "#EAF0FF",
  },
  empRow: {
    flexDirection: "column",
  },
  empName: {
    color: "#152238",
    fontSize: 14,
    fontWeight: "600",
  },
  empNameActive: {
    color: "#2457D6",
    fontWeight: "700",
  },
  empMeta: {
    color: "#68758A",
    fontSize: 11,
    marginTop: 2,
  },
  emptySearchText: {
    color: "#8995A7",
    fontSize: 12,
    textAlign: "center",
    paddingVertical: 16,
  },
  filePickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  filePickerText: {
    color: "#68758A",
    fontSize: 14,
    flex: 1,
  },
  uploadBtn: {
    flexDirection: "row",
    backgroundColor: "#2457D6",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  uploadBtnDisabled: {
    opacity: 0.5,
  },
  uploadBtnText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
});
