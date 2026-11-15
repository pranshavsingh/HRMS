import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as WebBrowser from "expo-web-browser";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { FileUp, Upload, CheckCircle2, FileText, ExternalLink, Calendar } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface Document {
  id: number;
  title: string;
  file: string;
  uploaded_at: string;
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

export default function MyDocumentsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const [selectedDocType, setSelectedDocType] = useState<string>("Aadhar Card");
  const [selectedFile, setSelectedFile] = useState<{
    uri: string;
    name: string;
    type?: string;
  } | null>(null);

  const [showDocSelector, setShowDocSelector] = useState<boolean>(false);

  const fetchMyDocuments = async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const res = await api.get("/auth/documents/my/");
      setDocuments(Array.isArray(res.data) ? res.data : (res.data?.data || []));
    } catch (err) {
      console.error("Failed to load documents:", err);
      Alert.alert("Error", "Unable to load documents list");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchMyDocuments();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchMyDocuments(false);
  };

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
    if (!user) return;
    if (!selectedFile) {
      Alert.alert("Input Required", "Please select a file to upload");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("user", String(user.id));
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

      Alert.alert("Success", res.data?.message || "Document uploaded successfully");
      setSelectedFile(null);
      fetchMyDocuments(false);
    } catch (err: any) {
      console.error("Upload failed:", err.response?.data || err.message);
      Alert.alert("Upload Failed", err.response?.data?.error || "Failed to upload document");
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewDocument = async (url: string) => {
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch (err) {
      console.error("Failed to open document browser:", err);
      Alert.alert("Error", "Unable to open document");
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />
        }
      >
        {/* Upload Form Card */}
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>Upload New Document</Text>

          {/* Document Type Dropdown */}
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

          {/* Document Picker */}
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
            style={[styles.uploadBtn, (submitting || !selectedFile) && styles.uploadBtnDisabled]}
            onPress={handleUpload}
            disabled={submitting || !selectedFile}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <>
                <Upload size={18} color="#ffffff" style={{ marginRight: 8 }} />
                <Text style={styles.uploadBtnText}>Upload Document</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Uploaded Documents List */}
        <View style={styles.listContainer}>
          <Text style={styles.listTitle}>My Uploaded Documents</Text>

          {documents.length === 0 ? (
            <View style={styles.emptyContainer}>
              <FileText size={36} color="#64748b" style={{ marginBottom: 8 }} />
              <Text style={styles.emptyText}>No documents uploaded yet.</Text>
            </View>
          ) : (
            documents.map((doc) => (
              <View key={doc.id} style={styles.documentRow}>
                <View style={styles.docInfo}>
                  <Text style={styles.docTitle}>{doc.title}</Text>
                  <View style={styles.docMetaRow}>
                    <Calendar size={12} color="#64748b" style={{ marginRight: 4 }} />
                    <Text style={styles.docMetaText}>
                      Uploaded: {new Date(doc.uploaded_at).toLocaleDateString()}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.viewBtn}
                  onPress={() => handleViewDocument(doc.file)}
                >
                  <ExternalLink size={14} color="#10b981" style={{ marginRight: 4 }} />
                  <Text style={styles.viewBtnText}>View</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
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
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    backgroundColor: "#0f172a",
    justifyContent: "center",
    alignItems: "center",
  },
  formCard: {
    backgroundColor: "#1e293b",
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: "#334155",
    marginBottom: 20,
  },
  formTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 8,
  },
  selectorBtn: {
    backgroundColor: "#0f172a",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#334155",
  },
  selectorBtnText: {
    color: "#ffffff",
    fontSize: 14,
  },
  dropdownList: {
    backgroundColor: "#0f172a",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#334155",
    marginTop: 4,
    overflow: "hidden",
  },
  dropdownItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#33415550",
  },
  dropdownItemActive: {
    backgroundColor: "#1e293b",
  },
  dropdownItemText: {
    color: "#ffffff",
    fontSize: 14,
  },
  filePickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0f172a",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#334155",
  },
  filePickerText: {
    color: "#94a3b8",
    fontSize: 14,
    flex: 1,
  },
  uploadBtn: {
    flexDirection: "row",
    backgroundColor: "#10b981",
    borderRadius: 14,
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
  listContainer: {
    backgroundColor: "#1e293b",
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: "#334155",
  },
  listTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 16,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
  },
  emptyText: {
    color: "#64748b",
    fontSize: 13,
  },
  documentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#33415580",
  },
  docInfo: {
    flex: 1,
    paddingRight: 12,
  },
  docTitle: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },
  docMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  docMetaText: {
    color: "#64748b",
    fontSize: 11,
  },
  viewBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#10b98120",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#10b98140",
  },
  viewBtnText: {
    color: "#10b981",
    fontSize: 12,
    fontWeight: "700",
  },
});
