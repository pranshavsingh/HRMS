import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
} from "react-native";
import api from "../../services/api";
import { useRealtime } from "../../context/RealtimeContext";
import { 
  Shield, 
  Search, 
  X, 
  Share2, 
  ArrowUpDown, 
  Calendar, 
  Eye, 
  ChevronLeft, 
  ChevronRight 
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface AuditRecord {
  id: number;
  user_username: string;
  action: string;
  timestamp: string;
  ip_address: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  details: Record<string, any>;
}

export default function AuditLogsScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [logs, setLogs] = useState<AuditRecord[]>([]);
  const [availableActions, setAvailableActions] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [search, setSearch] = useState("");
  const [actionType, setActionType] = useState("");
  const [severity, setSeverity] = useState("");
  const [sortOrder, setSortOrder] = useState<"-timestamp" | "timestamp">("-timestamp");

  // Selected Log detail modal
  const [selectedLog, setSelectedLog] = useState<AuditRecord | null>(null);

  const fetchLogs = useCallback(async (pageNumber = 1, showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const params: Record<string, any> = {
        page: pageNumber,
        sort: sortOrder,
        search: search.trim() || undefined,
        action_type: actionType || undefined,
        severity: severity || undefined,
      };

      const res = await api.get("/auth/audit-logs/", { params });
      const payload = res.data || {};
      
      setLogs(Array.isArray(payload.logs) ? payload.logs : []);
      setAvailableActions(Array.isArray(payload.actions) ? payload.actions : []);
      
      if (payload.pagination) {
        setTotalPages(payload.pagination.pages || 1);
        setPage(payload.pagination.page || 1);
      }
    } catch (err: any) {
      console.error("Error loading audit logs", err);
      // Suppress alert on quick background polling, show on initial load
      if (showLoader) {
        Alert.alert("Sync Error", "Unable to retrieve system compliance logs.");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [search, actionType, severity, sortOrder]);

  useRealtime("new_audit_log", () => fetchLogs(1, false));

  useEffect(() => {
    fetchLogs(1, true);
  }, [fetchLogs]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchLogs(1, false);
  };

  const handlePageChange = (direction: "prev" | "next") => {
    if (direction === "prev" && page > 1) {
      fetchLogs(page - 1, true);
    } else if (direction === "next" && page < totalPages) {
      fetchLogs(page + 1, true);
    }
  };

  // Compile and share CSV data natively
  const handleExportCSV = async () => {
    if (logs.length === 0) {
      Alert.alert("No Data", "There are no log records available to export.");
      return;
    }

    try {
      const headers = ["ID", "User", "Action", "Timestamp", "IP Address", "Severity"];
      const rows = logs.map(log => [
        String(log.id),
        log.user_username || "System",
        log.action,
        log.timestamp,
        log.ip_address || "N/A",
        log.severity
      ]);

      const csvContent = [
        headers.join(","),
        ...rows.map(r => r.map(cell => `"${cell.replace(/"/g, '""')}"`).join(","))
      ].join("\n");

      await Share.share({
        title: "Compliance Audit Logs Export",
        message: csvContent,
      });
    } catch (err: any) {
      Alert.alert("Export Failed", err.message);
    }
  };

  // Helper to parse detail value diffs
  const renderDetailItem = (key: string, val: any) => {
    const formatKey = key.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

    // Check if it represents a value change diff
    if (val !== null && typeof val === "object" && "old" in val && "new" in val) {
      const oldVal = val.old === null || val.old === undefined ? "N/A" : String(val.old);
      const newVal = val.new === null || val.new === undefined ? "N/A" : String(val.new);

      return (
        <View key={key} style={styles.diffRow}>
          <Text style={styles.diffKey}>{formatKey}:</Text>
          <View style={styles.diffValues}>
            <Text style={styles.diffOld}>{oldVal}</Text>
            <Text style={styles.diffArrow}>➔</Text>
            <Text style={styles.diffNew}>{newVal}</Text>
          </View>
        </View>
      );
    }

    const valStr = typeof val === "object" ? JSON.stringify(val) : String(val);
    return (
      <View key={key} style={styles.diffRow}>
        <Text style={styles.diffKey}>{formatKey}:</Text>
        <Text style={styles.diffStatic}>{valStr}</Text>
      </View>
    );
  };

  const getSeverityStyle = (sev: string) => {
    switch (sev?.toUpperCase()) {
      case "CRITICAL":
        return { style: styles.badgeCritical, text: styles.textCritical };
      case "WARNING":
        return { style: styles.badgeWarning, text: styles.textWarning };
      case "INFO":
      default:
        return { style: styles.badgeInfo, text: styles.textInfo };
    }
  };

  const renderLogItem = ({ item }: { item: AuditRecord }) => {
    const sev = getSeverityStyle(item.severity);
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.userRow}>
            <Shield size={14} color="#a5b4fc" />
            <Text style={styles.userName}>{item.user_username || "System"}</Text>
          </View>
          <View style={[styles.badge, sev.style]}>
            <Text style={[styles.badgeText, sev.text]}>{item.severity}</Text>
          </View>
        </View>

        <View style={styles.cardContent}>
          <Text style={styles.actionText}>{item.action}</Text>
          <Text style={styles.timestampText}>
            {new Date(item.timestamp).toLocaleString("en-IN")}
          </Text>
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.ipText}>IP: {item.ip_address || "N/A"}</Text>
          <TouchableOpacity style={styles.viewBtn} onPress={() => setSelectedLog(item)}>
            <Eye size={12} color="#ffffff" style={{ marginRight: 6 }} />
            <Text style={styles.viewBtnText}>View Details</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      {/* Filtering Section */}
      <View style={styles.filterSection}>
        <View style={styles.searchRow}>
          <Search size={16} color="#64748b" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search audit compliance logs..."
            placeholderTextColor="#64748b"
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <View style={styles.dropdownsRow}>
          {/* Action Type Filter */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollFilters}>
            <TouchableOpacity
              style={[styles.filterPill, actionType === "" && styles.filterPillActive]}
              onPress={() => setActionType("")}
            >
              <Text style={[styles.filterPillText, actionType === "" && styles.filterPillTextActive]}>
                All Actions
              </Text>
            </TouchableOpacity>
            {availableActions.map(action => (
              <TouchableOpacity
                key={action}
                style={[styles.filterPill, actionType === action && styles.filterPillActive]}
                onPress={() => setActionType(action)}
              >
                <Text style={[styles.filterPillText, actionType === action && styles.filterPillTextActive]}>
                  {action}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Sort order Toggle */}
          <TouchableOpacity
            style={styles.sortBtn}
            onPress={() => setSortOrder(prev => (prev === "-timestamp" ? "timestamp" : "-timestamp"))}
          >
            <ArrowUpDown size={14} color="#94a3b8" />
          </TouchableOpacity>
        </View>
      </View>

      {/* CSV Export & Pagination Header */}
      <View style={styles.exportHeader}>
        <Text style={styles.resultsCount}>Page {page} of {totalPages}</Text>
        <TouchableOpacity style={styles.exportBtn} onPress={handleExportCSV}>
          <Share2 size={14} color="#10b981" style={{ marginRight: 6 }} />
          <Text style={styles.exportBtnText}>Share CSV</Text>
        </TouchableOpacity>
      </View>

      {/* Roster of Logs */}
      {loading ? (
        <View style={styles.centeredSpinner}>
          <ActivityIndicator size="large" color="#10b981" />
        </View>
      ) : (
        <FlatList
          data={logs}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderLogItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Shield size={32} color="#64748b" />
              <Text style={styles.emptyText}>No matching compliance logs found.</Text>
            </View>
          }
        />
      )}

      {/* Pagination controls */}
      <View style={styles.paginationRow}>
        <TouchableOpacity
          style={[styles.pagBtn, page <= 1 && styles.pagBtnDisabled]}
          disabled={page <= 1}
          onPress={() => handlePageChange("prev")}
        >
          <ChevronLeft size={20} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.pagText}>
          Page {page} / {totalPages}
        </Text>
        <TouchableOpacity
          style={[styles.pagBtn, page >= totalPages && styles.pagBtnDisabled]}
          disabled={page >= totalPages}
          onPress={() => handlePageChange("next")}
        >
          <ChevronRight size={20} color="#ffffff" />
        </TouchableOpacity>
      </View>

      {/* --- AUDIT LOGS DETAILS DIFF MODAL --- */}
      <Modal
        visible={selectedLog !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedLog(null)}
      >
        <View style={styles.modalOverlay}>
          {selectedLog && (
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>Action: {selectedLog.action}</Text>
                  <Text style={styles.modalSub}>
                    Logged by {selectedLog.user_username || "System"}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedLog(null)} style={styles.closeBtn}>
                  <X size={20} color="#ffffff" />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={styles.modalScroll}>
                <View style={styles.modalMetaBox}>
                  <Text style={styles.metaText}>Severity: {selectedLog.severity}</Text>
                  <Text style={styles.metaText}>
                    Timestamp: {new Date(selectedLog.timestamp).toLocaleString("en-IN")}
                  </Text>
                  <Text style={styles.metaText}>IP Address: {selectedLog.ip_address || "N/A"}</Text>
                </View>

                <Text style={styles.diffBlockTitle}>Change Ledger Diffs</Text>
                <View style={styles.diffCard}>
                  {selectedLog.details && Object.keys(selectedLog.details).length > 0 ? (
                    Object.keys(selectedLog.details).map(key =>
                      renderDetailItem(key, selectedLog.details[key])
                    )
                  ) : (
                    <Text style={styles.emptyDiffText}>No detailed logs changes record payload.</Text>
                  )}
                </View>
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0f172a",
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  centeredSpinner: {
    flex: 1,
    justifyContent: "center",
  },
  filterSection: {
    backgroundColor: "#1e293b",
    borderBottomWidth: 1,
    borderBottomColor: "#33415550",
    padding: 16,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0f172a",
    borderRadius: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#334155",
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    color: "#ffffff",
    flex: 1,
    height: 40,
    fontSize: 14,
  },
  dropdownsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    justifyContent: "space-between",
  },
  scrollFilters: {
    flexDirection: "row",
    flex: 1,
    marginRight: 10,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#0f172a",
    marginRight: 6,
    borderWidth: 1,
    borderColor: "#334155",
  },
  filterPillActive: {
    borderColor: "#10b981",
    backgroundColor: "#10b98115",
  },
  filterPillText: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "700",
  },
  filterPillTextActive: {
    color: "#10b981",
  },
  sortBtn: {
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#334155",
    padding: 10,
    borderRadius: 12,
  },
  exportHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  resultsCount: {
    color: "#64748b",
    fontSize: 12,
    fontWeight: "600",
  },
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1e293b",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#33415550",
  },
  exportBtnText: {
    color: "#10b981",
    fontSize: 11,
    fontWeight: "700",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#334155",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#33415540",
    paddingBottom: 8,
    marginBottom: 8,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  userName: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
    marginLeft: 6,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: "700",
  },
  // Severity designs
  badgeInfo: { backgroundColor: "#1e3a8a30" },
  textInfo: { color: "#60a5fa" },
  badgeWarning: { backgroundColor: "#78350f30" },
  textWarning: { color: "#fbbf24" },
  badgeCritical: { backgroundColor: "#7f1d1d30" },
  textCritical: { color: "#f87171" },

  cardContent: {
    marginVertical: 4,
  },
  actionText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  timestampText: {
    color: "#94a3b8",
    fontSize: 11,
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#33415540",
    paddingTop: 10,
    marginTop: 8,
  },
  ipText: {
    color: "#64748b",
    fontSize: 11,
  },
  viewBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#334155",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  viewBtnText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "600",
  },
  paginationRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#1e293b",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: "#33415550",
  },
  pagBtn: {
    backgroundColor: "#0f172a",
    padding: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#334155",
  },
  pagBtnDisabled: {
    opacity: 0.4,
  },
  pagText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
  },
  emptyText: {
    color: "#64748b",
    fontSize: 13,
    marginTop: 12,
    textAlign: "center",
  },
  // Modal Details layout
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.85)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#1e293b",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    maxHeight: "85%",
    borderTopWidth: 1,
    borderTopColor: "#334155",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
    paddingBottom: 14,
    marginBottom: 16,
  },
  modalTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
  },
  modalSub: {
    color: "#94a3b8",
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    padding: 6,
    borderRadius: 14,
  },
  modalScroll: {
    paddingBottom: 24,
  },
  modalMetaBox: {
    backgroundColor: "#0f172a60",
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#33415580",
  },
  metaText: {
    color: "#94a3b8",
    fontSize: 12,
    lineHeight: 18,
  },
  diffBlockTitle: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 10,
  },
  diffCard: {
    backgroundColor: "#0f172a90",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#33415580",
  },
  emptyDiffText: {
    color: "#64748b",
    fontSize: 12,
    textAlign: "center",
  },
  diffRow: {
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#33415520",
    paddingBottom: 8,
  },
  diffKey: {
    color: "#a5b4fc",
    fontSize: 12,
    fontWeight: "700",
  },
  diffStatic: {
    color: "#ffffff",
    fontSize: 13,
    marginTop: 4,
  },
  diffValues: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    marginTop: 4,
  },
  diffOld: {
    color: "#f87171",
    fontSize: 12,
    textDecorationLine: "line-through",
  },
  diffArrow: {
    color: "#64748b",
    marginHorizontal: 8,
    fontSize: 12,
  },
  diffNew: {
    color: "#10b981",
    fontSize: 12,
    fontWeight: "700",
    backgroundColor: "#10b98115",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
});
