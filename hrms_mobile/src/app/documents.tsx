import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import api from "../services/api";
import { FileUp, Upload, CheckCircle2, FileText } from "lucide-react-native";

interface Employee {
  id: number;
  username: string;
  name?: string;
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
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const [selectedEmpId, setSelectedEmpId] = useState<string>("");
  const [selectedDocType, setSelectedDocType] = useState<string>("Aadhar Card");
  const [selectedFile, setSelectedFile] = useState<{
    uri: string;
    name: string;
    type?: string;
  } | null>(null);

  // Selector modal states
  const [showEmpSelector, setShowEmpSelector] = useState<boolean>(false);
  const [showDocSelector, setShowDocSelector] = useState<boolean>(false);

  const fetchEmployees = async () => {
    try {
      const res = await api.get("/auth/employees/");
      setEmployees(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("Failed to load employees:", err);
      Alert.alert("Error", "Unable to load employees list");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

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
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  const selectedEmployeeName = employees.find((e) => String(e.id) === selectedEmpId)?.username || "Select Employee";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      <View style={styles.heroCard}>
        <View style={styles.heroHeader}>
          <FileUp size={20} color="#6366f1" style={{ marginRight: 8 }} />
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
            <Text style={styles.selectorBtnText}>{selectedEmployeeName}</Text>
          </TouchableOpacity>

          {showEmpSelector && (
            <View style={styles.dropdownList}>
              {employees.map((emp) => (
                <TouchableOpacity
                  key={emp.id}
                  style={[styles.dropdownItem, selectedEmpId === String(emp.id) && styles.dropdownItemActive]}
                  onPress={() => {
                    setSelectedEmpId(String(emp.id));
                    setShowEmpSelector(false);
                  }}
                >
                  <Text style={styles.dropdownItemText}>{emp.username}</Text>
                </TouchableOpacity>
              ))}
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
          </TouchableOpacity>

          {showDocSelector && (
            <View style={styles.dropdownList}>
              {documentOptions.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.dropdownItem, selectedDocType === opt && styles.dropdownItemActive]}
                  onPress={() => {
                    setSelectedDocType(opt);
                    setShowDocSelector(false);
                  }}
                >
                  <Text style={styles.dropdownItemText}>{opt}</Text>
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
            <FileText size={18} color="#94a3b8" style={{ marginRight: 8 }} />
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
    backgroundColor: "#0f172a", // Dark slate background matching the web theme
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: "#0f172a",
    justifyContent: "center",
    alignItems: "center",
  },
  heroCard: {
    backgroundColor: "#1e293b",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#334155",
    padding: 20,
    marginBottom: 20,
  },
  heroHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },
  heroDesc: {
    fontSize: 12,
    color: "#94a3b8",
    lineHeight: 16,
  },
  formCard: {
    backgroundColor: "#1e293b",
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#334155",
    padding: 20,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "#94a3b8",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  selectorBtn: {
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  selectorBtnText: {
    fontSize: 14,
    color: "#ffffff",
    fontWeight: "600",
  },
  dropdownList: {
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 16,
    marginTop: 8,
    overflow: "hidden",
  },
  dropdownItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1e293b",
  },
  dropdownItemActive: {
    backgroundColor: "rgba(99, 102, 241, 0.15)",
  },
  dropdownItemText: {
    fontSize: 14,
    color: "#cbd5e1",
    fontWeight: "500",
  },
  filePickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  filePickerText: {
    fontSize: 14,
    color: "#ffffff",
    fontWeight: "500",
    flex: 1,
  },
  uploadBtn: {
    flexDirection: "row",
    backgroundColor: "#6366f1", // Indigo button color
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  uploadBtnDisabled: {
    opacity: 0.5,
  },
  uploadBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
  },
});
