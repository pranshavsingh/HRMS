import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
} from "react-native";
import api from "../../services/api";
import { useRealtime } from "../../context/RealtimeContext";
import PaginatedFlatList from "../../components/pagination/PaginatedFlatList";
import { useCursorPagination } from "../../hooks/useCursorPagination";
import { 
  Shield, 
  Search, 
  X, 
  ArrowUpDown, 
  Calendar, 
  Eye, 
  ChevronLeft, 
  ChevronRight,
  ShieldAlert,
  User,
  Info,
  AlertTriangle,
  AlertOctagon
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatCompanyDateTime } from "../../utils/date";

interface AuditRecord {
  id: number;
  username?: string;
  user_username?: string;
  action: string;
  created_at?: string;
  timestamp?: string;
  ip_address: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  details: Record<string, any>;
}

export default function AuditLogsScreen() {
  const [availableActions, setAvailableActions] = useState<string[]>([]);

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [actionType, setActionType] = useState("");
  const [severity] = useState("");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  // Selected Log detail modal
  const [selectedLog, setSelectedLog] = useState<AuditRecord | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const {
    items: logs,
    loading,
    refreshing,
    loadingMore,
    error,
    hasMore,
    refresh,
    loadMore,
    retry,
  } = useCursorPagination<AuditRecord>({
    endpoint: "/auth/audit-logs/",
    limit: 20,
    itemsKey: "logs",
    params: {
      sort: sortOrder,
      search: debouncedSearch || undefined,
      action: actionType || undefined,
      severity: severity || undefined,
    },
    getItemKey: (l) => l.id,
    onData: (pageRes) => {
      const actions = pageRes.raw?.availableActions || pageRes.raw?.actions;
      if (Array.isArray(actions) && actions.length > 0) {
        setAvailableActions(actions);
      }
    },
  });

  useRealtime("new_audit_log", () => void refresh());
  useRealtime("realtime:connected", () => void refresh());

  // Helper to parse detail value diffs
  const renderDetailItem = (key: string, val: any) => {
    const formatKey = key.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    
    if (typeof val === "object" && val !== null) {
      return (
        <View key={key} style={styles.diffItem}>
          <Text style={styles.diffKey}>{formatKey}:</Text>
          <View style={styles.diffObj}>
            <Text style={styles.diffObjText}>{JSON.stringify(val, null, 2)}</Text>
          </View>
        </View>
      );
    }

    return (
      <View key={key} style={styles.diffItem}>
        <Text style={styles.diffKey}>{formatKey}:</Text>
        <Text style={styles.diffVal}>{String(val)}</Text>
      </View>
    );
  };

  const getSeverityStyle = (sev: string) => {
    switch (sev) {
      case "CRITICAL":
        return {
          badge: styles.badgeCritical,
          text: styles.textCritical,
          icon: <AlertOctagon size={11} color="#be123c" />,
        };
      case "WARNING":
        return {
          badge: styles.badgeWarning,
          text: styles.textWarning,
          icon: <AlertTriangle size={11} color="#b45309" />,
        };
      case "INFO":
      default:
        return {
          badge: styles.badgeInfo,
          text: styles.textInfo,
          icon: <Info size={11} color="#0369a1" />,
        };
    }
  };

  const renderLogItem = ({ item }: { item: AuditRecord }) => {
    const sev = getSeverityStyle(item.severity);

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.headerLeft}>
            <Text style={styles.logId}>#{item.id}</Text>
            <Text style={styles.userText}>{item.username || item.user_username || "System"}</Text>
          </View>
          <View style={[styles.badge, sev.badge]}>
            {sev.icon}
            <Text style={[styles.badgeText, sev.text]}>{item.severity}</Text>
          </View>
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.actionTag}>{item.action}</Text>
          <Text style={styles.timestampText}>
            {formatCompanyDateTime(item.created_at || item.timestamp || "")}
          </Text>
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.ipText}>IP: {item.ip_address || "N/A"}</Text>
          <TouchableOpacity style={styles.viewBtn} onPress={() => setSelectedLog(item)}>
            <Eye size={12} color="#2457D6" style={{ marginRight: 6 }} />
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
          <Search size={16} color="#68758A" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search audit compliance logs..."
            placeholderTextColor="#8995A7"
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
            onPress={() => setSortOrder(prev => (prev === "desc" ? "asc" : "desc"))}
          >
            <ArrowUpDown size={14} color="#68758A" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Security Advisory & Pagination Header (Replaces unauthorized native CSV export) */}
      <View style={styles.exportHeader}>
        <Text style={styles.resultsCount}>{logs.length} loaded</Text>
        <View style={styles.securityBadge}>
          <ShieldAlert size={12} color="#68758A" style={{ marginRight: 5 }} />
          <Text style={styles.securityBadgeText}>Export via Web Portal</Text>
        </View>
      </View>

      {/* Roster of Logs */}
      <PaginatedFlatList
        items={logs}
        loading={loading}
        refreshing={refreshing}
        loadingMore={loadingMore}
        hasMore={hasMore}
        error={error}
        onRefresh={refresh}
        onLoadMore={loadMore}
        onRetry={retry}
        keyExtractor={(item: AuditRecord) => String(item.id)}
        renderItem={renderLogItem}
        contentContainerStyle={styles.listContent}
        emptyTitle="No matching compliance logs found"
        emptySubtitle="Try adjusting your search or action filter."
      />

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
                    Logged by {selectedLog.username || selectedLog.user_username || "System"}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedLog(null)} style={styles.closeBtn}>
                  <X size={20} color="#152238" />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={styles.modalScroll}>
                <View style={styles.modalMetaBox}>
                  <Text style={styles.metaText}>Severity: {selectedLog.severity}</Text>
                  <Text style={styles.metaText}>
                    Timestamp: {formatCompanyDateTime(selectedLog.created_at || selectedLog.timestamp || "")}
                  </Text>
                  <Text style={styles.metaText}>IP Address: {selectedLog.ip_address || "N/A"}</Text>
                </View>

                <Text style={styles.diffBlockTitle}>Change Ledger Diffs</Text>
                <View style={styles.diffContainer}>
                  {selectedLog.details && Object.keys(selectedLog.details).length > 0 ? (
                    Object.entries(selectedLog.details).map(([k, v]) => renderDetailItem(k, v))
                  ) : (
                    <Text style={styles.emptyDiffText}>No diff snapshots attached to this log entry.</Text>
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
    backgroundColor: "#F6F8FC",
  },
  filterSection: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5EAF2",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingHorizontal: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: 40,
    color: "#152238",
    fontSize: 13,
  },
  dropdownsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
  },
  scrollFilters: {
    flex: 1,
    marginRight: 10,
  },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginRight: 8,
  },
  filterPillActive: {
    backgroundColor: "#EAF0FF",
    borderColor: "#2457D6",
  },
  filterPillText: {
    fontSize: 11,
    color: "#68758A",
    fontWeight: "600",
  },
  filterPillTextActive: {
    color: "#2457D6",
    fontWeight: "700",
  },
  sortBtn: {
    padding: 8,
    borderRadius: 10,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  exportHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  resultsCount: {
    color: "#68758A",
    fontSize: 12,
    fontWeight: "600",
  },
  securityBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EDF2F7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
  },
  securityBadgeText: {
    color: "#68758A",
    fontSize: 11,
    fontWeight: "600",
  },
  listContent: {
    padding: 16,
    paddingTop: 0,
    paddingBottom: 20,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5EAF2",
    shadowColor: "#243B64",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#EDF1F6",
    paddingBottom: 8,
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  logId: {
    color: "#2457D6",
    fontSize: 12,
    fontWeight: "700",
    marginRight: 8,
  },
  userText: {
    color: "#152238",
    fontSize: 13,
    fontWeight: "700",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
  },
  badgeCritical: {
    backgroundColor: "#FFE4E6",
  },
  badgeWarning: {
    backgroundColor: "#FEF3C7",
  },
  badgeInfo: {
    backgroundColor: "#E0F2FE",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  textCritical: {
    color: "#BE123C",
  },
  textWarning: {
    color: "#B45309",
  },
  textInfo: {
    color: "#0369A1",
  },
  cardBody: {
    marginBottom: 10,
  },
  actionTag: {
    color: "#152238",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 4,
  },
  timestampText: {
    color: "#68758A",
    fontSize: 11,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#EDF1F6",
    paddingTop: 8,
  },
  ipText: {
    color: "#8995A7",
    fontSize: 11,
  },
  viewBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EAF0FF",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#C9D8FF",
  },
  viewBtnText: {
    color: "#2457D6",
    fontSize: 11,
    fontWeight: "700",
  },
  centeredSpinner: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
  emptyText: {
    color: "#8995A7",
    fontSize: 13,
    marginTop: 10,
  },
  paginationRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: "#E5EAF2",
  },
  pagBtn: {
    backgroundColor: "#2457D6",
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  pagBtnDisabled: {
    opacity: 0.3,
  },
  pagText: {
    color: "#152238",
    fontSize: 13,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 1,
    borderBottomColor: "#EDF1F6",
    paddingBottom: 14,
    marginBottom: 16,
  },
  modalTitle: {
    color: "#152238",
    fontSize: 17,
    fontWeight: "700",
  },
  modalSub: {
    color: "#68758A",
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
  },
  modalScroll: {
    paddingBottom: 24,
  },
  modalMetaBox: {
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  metaText: {
    color: "#152238",
    fontSize: 12,
    marginBottom: 4,
  },
  diffBlockTitle: {
    color: "#152238",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 10,
    textTransform: "uppercase",
  },
  diffContainer: {
    gap: 8,
  },
  diffItem: {
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  diffKey: {
    color: "#2457D6",
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 4,
  },
  diffVal: {
    color: "#152238",
    fontSize: 12,
  },
  diffObj: {
    backgroundColor: "#FFFFFF",
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  diffObjText: {
    color: "#152238",
    fontSize: 10,
    fontFamily: "monospace",
  },
  emptyDiffText: {
    color: "#8995A7",
    fontSize: 12,
    fontStyle: "italic",
  },
});
