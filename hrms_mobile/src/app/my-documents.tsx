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
import * as WebBrowser from "expo-web-browser";
import api from "../services/api";
import { useRealtime } from "../context/RealtimeContext";
import { FileText, ExternalLink, Calendar, ShieldCheck } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatCompanyDate } from "../utils/date";

interface Document {
  id: number;
  title: string;
  file: string;
  uploaded_at: string;
}

export default function MyDocumentsScreen() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

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
    const t = setTimeout(() => { void fetchMyDocuments(); }, 0);
    return () => clearTimeout(t);
  }, []);

  useRealtime("document_update", () => fetchMyDocuments(false));
  useRealtime("realtime:connected", () => fetchMyDocuments(false));

  const onRefresh = () => {
    setRefreshing(true);
    fetchMyDocuments(false);
  };

  const handleViewDocument = async (url: string) => {
    if (!url) {
      Alert.alert("Invalid Document", "The document path is missing or unavailable.");
      return;
    }

    let targetUrl = url;
    if (targetUrl.startsWith("/media/") || targetUrl.startsWith("media/")) {
      const base = (api.defaults.baseURL || "").replace(/\/api\/?$/, "");
      targetUrl = `${base}${targetUrl.startsWith("/") ? "" : "/"}${targetUrl}`;
    }

    if (!targetUrl.startsWith("http://") && !targetUrl.startsWith("https://")) {
      Alert.alert("Unsupported Format", "Unable to open document: invalid URL protocol.");
      return;
    }

    try {
      await WebBrowser.openBrowserAsync(targetUrl);
    } catch (err: any) {
      console.error("Failed to open document browser:", err);
      Alert.alert("Error", "Unable to open document: " + (err.message || "Unknown error"));
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2457D6" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2457D6" />
        }
      >
        <View style={styles.infoBanner}>
          <ShieldCheck size={18} color="#2457D6" style={{ marginRight: 10 }} />
          <Text style={styles.infoBannerText}>
            View your uploaded compliance documents below. Document uploads are managed via the HRMS Web Console.
          </Text>
        </View>

        <View style={styles.listContainer}>
          <Text style={styles.listTitle}>My Documents</Text>

          {documents.length === 0 ? (
            <View style={styles.emptyContainer}>
              <FileText size={36} color="#8995A7" style={{ marginBottom: 8 }} />
              <Text style={styles.emptyText}>No documents uploaded yet.</Text>
            </View>
          ) : (
            documents.map((doc) => (
              <View key={doc.id} style={styles.documentRow}>
                <View style={styles.docInfo}>
                  <Text style={styles.docTitle}>{doc.title}</Text>
                  <View style={styles.docMetaRow}>
                    <Calendar size={12} color="#68758A" style={{ marginRight: 4 }} />
                    <Text style={styles.docMetaText}>
                      Uploaded: {formatCompanyDate(doc.uploaded_at)}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.viewBtn}
                  onPress={() => handleViewDocument(doc.file)}
                >
                  <ExternalLink size={14} color="#2457D6" style={{ marginRight: 4 }} />
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
    backgroundColor: "#F6F8FC",
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
    backgroundColor: "#F6F8FC",
    justifyContent: "center",
    alignItems: "center",
  },
  infoBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EAF0FF",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    marginBottom: 16,
  },
  infoBannerText: {
    flex: 1,
    color: "#1E3A8A",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
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
    color: "#152238",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 16,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 30,
  },
  emptyText: {
    color: "#8995A7",
    fontSize: 14,
  },
  documentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: "#EDF1F6",
  },
  docInfo: {
    flex: 1,
    marginRight: 12,
  },
  docTitle: {
    color: "#152238",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  docMetaRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  docMetaText: {
    color: "#68758A",
    fontSize: 12,
  },
  viewBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EAF0FF",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  viewBtnText: {
    color: "#2457D6",
    fontSize: 12,
    fontWeight: "700",
  },
});
