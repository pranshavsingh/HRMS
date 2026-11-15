import React, { useEffect, useState, useMemo, useCallback } from "react";
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
import { 
  TrendingUp, 
  Search, 
  X, 
  User, 
  Clock, 
  Award, 
  AlertTriangle, 
  Calendar,
  CheckCircle2
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface AnalyticsMember {
  user_id: number;
  employee_name: string;
  username: string;
  email: string;
  team_name: string;
  present_days: number;
  leave_days: number;
  under_target_days: number;
  shortfall_hours: number;
  average_work_hours: number;
  pending_approval_items: number;
  rejected_days: number;
  today_status: string;
}

export default function TeamAnalyticsScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [days, setDays] = useState("30");
  const [searchQuery, setSearchQuery] = useState("");
  const [focusFilter, setFocusFilter] = useState<"all" | "attention" | "ontrack">("all");

  const [summary, setSummary] = useState<any>(null);
  const [insights, setInsights] = useState<any>(null);
  const [members, setMembers] = useState<AnalyticsMember[]>([]);
  const [selectedMember, setSelectedMember] = useState<AnalyticsMember | null>(null);

  const fetchAnalytics = useCallback(async (selectedDays: string, showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
      const res = await api.get("/attendance/team-analytics/", {
        params: { days: selectedDays },
      });
      const data = res.data || {};
      setSummary(data.summary || null);
      setInsights(data.insights || null);
      setMembers(Array.isArray(data.members) ? data.members : []);
    } catch (err: any) {
      console.error("Error loading team analytics", err);
      Alert.alert("Sync Error", "Unable to load team analytics.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useRealtime("attendance_update", () => fetchAnalytics(days, false));
  useRealtime("leave_update", () => fetchAnalytics(days, false));

  useEffect(() => {
    fetchAnalytics(days, true);
  }, [days, fetchAnalytics]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchAnalytics(days, false);
  };

  // Filter members based on search query and attention/on-track tabs
  const filteredMembers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return members.filter((item) => {
      const matchesSearch =
        !query ||
        item.employee_name?.toLowerCase().includes(query) ||
        item.username?.toLowerCase().includes(query) ||
        item.email?.toLowerCase().includes(query) ||
        item.today_status?.toLowerCase().includes(query);

      const isAttention =
        item.under_target_days > 0 ||
        item.pending_approval_items > 0 ||
        item.rejected_days > 0;

      if (focusFilter === "attention") {
        return matchesSearch && isAttention;
      }
      if (focusFilter === "ontrack") {
        return matchesSearch && !isAttention;
      }
      return matchesSearch;
    });
  }, [members, searchQuery, focusFilter]);

  const renderMemberItem = ({ item }: { item: AnalyticsMember }) => {
    const isAttention =
      item.under_target_days > 0 ||
      item.pending_approval_items > 0 ||
      item.rejected_days > 0;

    return (
      <TouchableOpacity style={styles.card} onPress={() => setSelectedMember(item)}>
        <View style={styles.cardHeader}>
          <View style={styles.userRow}>
            <User size={14} color="#94a3b8" />
            <Text style={styles.memberName}>{item.employee_name}</Text>
          </View>
          {isAttention ? (
            <View style={styles.attentionTag}>
              <AlertTriangle size={10} color="#f59e0b" style={{ marginRight: 4 }} />
              <Text style={styles.attentionTagText}>Attention Required</Text>
            </View>
          ) : (
            <View style={styles.ontrackTag}>
              <CheckCircle2 size={10} color="#10b981" style={{ marginRight: 4 }} />
              <Text style={styles.ontrackTagText}>On Track</Text>
            </View>
          )}
        </View>

        <View style={styles.cardContent}>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Daily Avg Hours:</Text>
            <Text style={styles.metricValue}>
              {Number(item.average_work_hours || 0).toFixed(2)}h
            </Text>
          </View>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Shortfall Hours:</Text>
            <Text style={[styles.metricValue, item.shortfall_hours > 0 && { color: "#f87171" }]}>
              {Number(item.shortfall_hours || 0).toFixed(2)}h
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      {/* Scrollable View for Headers and Summaries */}
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />
        }
      >
        {/* Days Period Selector */}
        <View style={styles.periodRow}>
          {["7", "15", "30"].map((p) => {
            const active = days === p;
            return (
              <TouchableOpacity
                key={p}
                style={[styles.periodPill, active && styles.periodPillActive]}
                onPress={() => setDays(p)}
              >
                <Text style={[styles.periodText, active && styles.periodTextActive]}>
                  {p} Days Window
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Unified metrics cards */}
        {summary && (
          <View style={styles.metricsContainer}>
            <View style={styles.metricBox}>
              <Text style={styles.metricBoxVal}>
                {Number(summary.average_hours_per_present_day || 0).toFixed(2)}h
              </Text>
              <Text style={styles.metricBoxLbl}>Average hours</Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={[styles.metricBoxVal, { color: "#f87171" }]}>
                {Number(summary.total_shortfall_hours || 0).toFixed(2)}h
              </Text>
              <Text style={styles.metricBoxLbl}>Total Shortfall</Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={[styles.metricBoxVal, { color: "#f59e0b" }]}>
                {summary.members_below_target || 0}
              </Text>
              <Text style={styles.metricBoxLbl}>Below Target</Text>
            </View>
          </View>
        )}

        {/* Champions / Highlights spotlight tiles */}
        {insights && (
          <View style={styles.spotlightContainer}>
            <Text style={styles.sectionTitle}>Workplace Spotlights</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.spotlightScroll}>
              {insights.highest_hours_member && (
                <View style={styles.spotlightCard}>
                  <Award size={18} color="#10b981" />
                  <Text style={styles.spotlightTitle}>Work Champion</Text>
                  <Text style={styles.spotlightVal}>{insights.highest_hours_member.name}</Text>
                  <Text style={styles.spotlightSub}>
                    Logged {Number(insights.highest_hours_member.total_hours).toFixed(1)}h
                  </Text>
                </View>
              )}
              {insights.highest_leave_member && (
                <View style={styles.spotlightCard}>
                  <Calendar size={18} color="#818cf8" />
                  <Text style={styles.spotlightTitle}>Time-Off Leader</Text>
                  <Text style={styles.spotlightVal}>{insights.highest_leave_member.name}</Text>
                  <Text style={styles.spotlightSub}>
                    Approved {insights.highest_leave_member.leave_days} Days
                  </Text>
                </View>
              )}
              {insights.most_under_target_member && (
                <View style={styles.spotlightCard}>
                  <AlertTriangle size={18} color="#f43f5e" />
                  <Text style={styles.spotlightTitle}>Attention Spotlight</Text>
                  <Text style={styles.spotlightVal}>{insights.most_under_target_member.name}</Text>
                  <Text style={styles.spotlightSub}>
                    Shortfall {Number(insights.most_under_target_member.shortfall_hours).toFixed(1)}h
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        )}

        {/* Member Focus Segment Tabs */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabBtn, focusFilter === "all" && styles.tabBtnActive]}
            onPress={() => setFocusFilter("all")}
          >
            <Text style={[styles.tabText, focusFilter === "all" && styles.tabTextActive]}>
              All Staff ({members.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, focusFilter === "attention" && styles.tabBtnActive]}
            onPress={() => setFocusFilter("attention")}
          >
            <Text style={[styles.tabText, focusFilter === "attention" && styles.tabTextActive]}>
              Attention Queue
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, focusFilter === "ontrack" && styles.tabBtnActive]}
            onPress={() => setFocusFilter("ontrack")}
          >
            <Text style={[styles.tabText, focusFilter === "ontrack" && styles.tabTextActive]}>
              On Track
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search Field */}
        <View style={styles.searchRow}>
          <Search size={16} color="#64748b" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search department analytics..."
            placeholderTextColor="#64748b"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Roster of members */}
        <View style={styles.membersListContainer}>
          {filteredMembers.length === 0 ? (
            <Text style={styles.emptyText}>No matching employee records found.</Text>
          ) : (
            filteredMembers.map((item) => (
              <View key={item.user_id} style={{ marginBottom: 12 }}>
                {renderMemberItem({ item })}
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* --- DETAILED METRICS MODAL FOR A SINGLE MEMBER --- */}
      <Modal
        visible={selectedMember !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedMember(null)}
      >
        <View style={styles.modalOverlay}>
          {selectedMember && (
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>{selectedMember.employee_name}</Text>
                  <Text style={styles.modalSub}>{selectedMember.team_name || "Department"}</Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedMember(null)} style={styles.closeBtn}>
                  <X size={20} color="#ffffff" />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={styles.modalScroll}>
                <View style={styles.modalGrid}>
                  <View style={styles.modalStatTile}>
                    <Text style={styles.modalStatLabel}>Days Present</Text>
                    <Text style={styles.modalStatValue}>{selectedMember.present_days}</Text>
                  </View>
                  <View style={styles.modalStatTile}>
                    <Text style={styles.modalStatLabel}>Days On Leave</Text>
                    <Text style={styles.modalStatValue}>{selectedMember.leave_days}</Text>
                  </View>
                  <View style={styles.modalStatTile}>
                    <Text style={styles.modalStatLabel}>Shortfall Days</Text>
                    <Text style={[styles.modalStatValue, selectedMember.under_target_days > 0 && { color: "#f87171" }]}>
                      {selectedMember.under_target_days}
                    </Text>
                  </View>
                  <View style={styles.modalStatTile}>
                    <Text style={styles.modalStatLabel}>Shortfall Hours</Text>
                    <Text style={[styles.modalStatValue, selectedMember.shortfall_hours > 0 && { color: "#f87171" }]}>
                      {Number(selectedMember.shortfall_hours || 0).toFixed(1)}h
                    </Text>
                  </View>
                  <View style={styles.modalStatTile}>
                    <Text style={styles.modalStatLabel}>Daily Average</Text>
                    <Text style={styles.modalStatValue}>
                      {Number(selectedMember.average_work_hours || 0).toFixed(1)}h
                    </Text>
                  </View>
                  <View style={styles.modalStatTile}>
                    <Text style={styles.modalStatLabel}>Pending Approvals</Text>
                    <Text style={[styles.modalStatValue, selectedMember.pending_approval_items > 0 && { color: "#fbbf24" }]}>
                      {selectedMember.pending_approval_items}
                    </Text>
                  </View>
                </View>

                <View style={styles.metaInfoBox}>
                  <Text style={styles.metaInfoText}>Email: {selectedMember.email}</Text>
                  <Text style={styles.metaInfoText}>Username: {selectedMember.username}</Text>
                  <Text style={styles.metaInfoText}>Today's Status: {selectedMember.today_status}</Text>
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
  scrollView: {
    flex: 1,
  },
  periodRow: {
    flexDirection: "row",
    backgroundColor: "#1e293b",
    margin: 16,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: "#33415550",
  },
  periodPill: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 12,
  },
  periodPillActive: {
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#334155",
  },
  periodText: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "700",
  },
  periodTextActive: {
    color: "#10b981",
  },
  metricsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  metricBox: {
    width: "31%",
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  metricBoxVal: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "800",
  },
  metricBoxLbl: {
    color: "#64748b",
    fontSize: 9,
    textTransform: "uppercase",
    fontWeight: "700",
    marginTop: 4,
  },
  spotlightContainer: {
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  sectionTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 10,
  },
  spotlightScroll: {
    flexDirection: "row",
  },
  spotlightCard: {
    width: 160,
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 18,
    padding: 14,
    marginRight: 12,
  },
  spotlightTitle: {
    color: "#64748b",
    fontSize: 9,
    textTransform: "uppercase",
    fontWeight: "700",
    marginTop: 8,
  },
  spotlightVal: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 4,
  },
  spotlightSub: {
    color: "#94a3b8",
    fontSize: 11,
    marginTop: 2,
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#1e293b",
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: "#33415550",
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 12,
  },
  tabBtnActive: {
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#334155",
  },
  tabText: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "700",
  },
  tabTextActive: {
    color: "#10b981",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1e293b",
    borderRadius: 14,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginBottom: 16,
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
  membersListContainer: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  emptyText: {
    color: "#64748b",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 20,
  },
  // Card styles
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 16,
    padding: 14,
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
  memberName: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
    marginLeft: 6,
  },
  attentionTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#78350f",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#92400e",
  },
  attentionTagText: {
    color: "#fbbf24",
    fontSize: 9,
    fontWeight: "700",
  },
  ontrackTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#064e3b",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#065f46",
  },
  ontrackTagText: {
    color: "#34d399",
    fontSize: 9,
    fontWeight: "700",
  },
  cardContent: {
    marginTop: 4,
  },
  metricRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  metricLabel: {
    color: "#64748b",
    fontSize: 12,
  },
  metricValue: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  // Modal details
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
    maxHeight: "80%",
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
    fontSize: 18,
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
  modalGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  modalStatTile: {
    width: "48%",
    backgroundColor: "#0f172a60",
    borderRadius: 16,
    padding: 12,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: "#33415580",
  },
  modalStatLabel: {
    color: "#64748b",
    fontSize: 10,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  modalStatValue: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "800",
    marginTop: 4,
  },
  metaInfoBox: {
    backgroundColor: "#0f172a70",
    borderRadius: 18,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#33415580",
  },
  metaInfoText: {
    color: "#94a3b8",
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 4,
  },
});
