import React, { useState, useMemo } from "react";
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
} from "react-native";
import { useRealtime } from "../../context/RealtimeContext";
import { useCursorPagination } from "../../hooks/useCursorPagination";
import PaginatedFlatList from "../../components/pagination/PaginatedFlatList";
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
  average_work_hours?: number;
  average_hours?: number;
  pending_approval_items: number;
  rejected_days: number;
  today_status: string;
}

export default function TeamAnalyticsScreen() {
  const [days, setDays] = useState("30");
  const [searchQuery, setSearchQuery] = useState("");
  const [focusFilter, setFocusFilter] = useState<"all" | "attention" | "ontrack">("all");

  const [summary, setSummary] = useState<any>(null);
  const [insights, setInsights] = useState<any>(null);
  const [selectedMember, setSelectedMember] = useState<AnalyticsMember | null>(null);

  const {
    items: members,
    loading,
    refreshing,
    loadingMore,
    hasMore,
    error,
    refresh,
    loadMore,
    retry,
  } = useCursorPagination<AnalyticsMember>({
    endpoint: "/attendance/team-analytics/",
    params: useMemo(
      () => ({
        days,
        search: searchQuery.trim() || undefined,
        focusFilter: focusFilter !== "all" ? focusFilter : undefined,
      }),
      [days, searchQuery, focusFilter]
    ),
    itemsKey: "members",
    limit: 20,
    getItemKey: (m) => m.user_id,
    onData: (payload: any) => {
      const raw = payload?.raw || payload;
      if (raw?.summary) setSummary(raw.summary);
      if (raw?.insights) setInsights(raw.insights);
    },
  });

  useRealtime("attendance_update", () => refresh());
  useRealtime("leave_update", () => refresh());
  useRealtime("realtime:connected", () => refresh());

  const onRefresh = () => {
    void refresh();
  };

  const filteredMembers = members;

  const renderMemberItem = ({ item }: { item: AnalyticsMember }) => {
    const isAttention =
      item.under_target_days > 0 ||
      item.shortfall_hours > 0 ||
      item.pending_approval_items > 0 ||
      item.today_status === "ABSENT";

    return (
      <TouchableOpacity style={styles.card} onPress={() => setSelectedMember(item)}>
        <View style={styles.cardHeader}>
          <View style={styles.userRow}>
            <User size={14} color="#68758A" />
            <Text style={styles.memberName}>{item.employee_name}</Text>
          </View>
          {isAttention ? (
            <View style={styles.attentionTag}>
              <AlertTriangle size={10} color="#B45309" style={{ marginRight: 4 }} />
              <Text style={styles.attentionTagText}>Attention Required</Text>
            </View>
          ) : (
            <View style={styles.ontrackTag}>
              <CheckCircle2 size={10} color="#15803D" style={{ marginRight: 4 }} />
              <Text style={styles.ontrackTagText}>On Track</Text>
            </View>
          )}
        </View>

        <View style={styles.cardContent}>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Daily Avg Hours:</Text>
            <Text style={styles.metricValue}>
              {Number(item.average_hours ?? item.average_work_hours ?? 0).toFixed(2)}h
            </Text>
          </View>
          <View style={styles.metricRow}>
            <Text style={styles.metricLabel}>Shortfall Hours:</Text>
            <Text style={[styles.metricValue, item.shortfall_hours > 0 && { color: "#BE123C" }]}>
              {Number(item.shortfall_hours || 0).toFixed(2)}h
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const listHeader = (
    <View style={styles.scrollView}>
        {/* Days Period Selector */}
        <View style={styles.periodRow}>
          {["7", "30", "90"].map((p) => {
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
              <Text style={styles.metricBoxLbl}>Average Shift</Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={[styles.metricBoxVal, { color: "#BE123C" }]}>
                {Number(summary.total_shortfall_hours || 0).toFixed(1)}h
              </Text>
              <Text style={styles.metricBoxLbl}>Total Shortfall</Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={[styles.metricBoxVal, { color: "#2457D6" }]}>
                {summary.team_members ?? summary.members_count ?? members.length}
              </Text>
              <Text style={styles.metricBoxLbl}>Team Size</Text>
            </View>
          </View>
        )}

        {/* Spotlight Insights */}
        {insights && (
          <View style={styles.spotlightContainer}>
            <Text style={styles.sectionTitle}>Performance Highlights</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.spotlightScroll}>
              {(insights.highest_hours_member || insights.most_punctual_member) && (() => {
                const topMember = insights.highest_hours_member || insights.most_punctual_member;
                return (
                  <View style={styles.spotlightCard}>
                    <Award size={18} color="#15803D" />
                    <Text style={styles.spotlightTitle}>Top Presentee</Text>
                    <Text style={styles.spotlightVal}>{topMember.employee_name || topMember.name || topMember.username || "--"}</Text>
                    <Text style={styles.spotlightSub}>
                      {topMember.present_days} Days Logged
                    </Text>
                  </View>
                );
              })()}
              {insights.highest_leave_member && (
                <View style={styles.spotlightCard}>
                  <Calendar size={18} color="#2457D6" />
                  <Text style={styles.spotlightTitle}>Time-Off Leader</Text>
                  <Text style={styles.spotlightVal}>{insights.highest_leave_member.employee_name || insights.highest_leave_member.name || insights.highest_leave_member.username || "--"}</Text>
                  <Text style={styles.spotlightSub}>
                    Approved {insights.highest_leave_member.leave_days} Days
                  </Text>
                </View>
              )}
              {insights.most_under_target_member && (
                <View style={styles.spotlightCard}>
                  <AlertTriangle size={18} color="#B45309" />
                  <Text style={styles.spotlightTitle}>Attention Spotlight</Text>
                  <Text style={styles.spotlightVal}>{insights.most_under_target_member.employee_name || insights.most_under_target_member.name || insights.most_under_target_member.username || "--"}</Text>
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
          <Search size={16} color="#68758A" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search department analytics..."
            placeholderTextColor="#8995A7"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      <PaginatedFlatList
        items={filteredMembers}
        keyExtractor={(item: AnalyticsMember) => String(item.user_id)}
        renderItem={({ item }: { item: AnalyticsMember }) => (
          <View style={{ marginBottom: 12, paddingHorizontal: 16 }}>
            {renderMemberItem({ item })}
          </View>
        )}
        contentContainerStyle={{ paddingBottom: 32 }}
        ListHeaderComponent={listHeader}
        loading={loading && members.length === 0}
        refreshing={refreshing}
        loadingMore={loadingMore}
        hasMore={hasMore}
        error={error}
        onRefresh={onRefresh}
        onLoadMore={loadMore}
        onRetry={retry}
        emptyTitle="No matching employee records found"
        emptySubtitle="Try adjusting your search or window filter."
      />

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
                  <X size={20} color="#152238" />
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
                    <Text style={[styles.modalStatValue, selectedMember.under_target_days > 0 && { color: "#BE123C" }]}>
                      {selectedMember.under_target_days}
                    </Text>
                  </View>
                  <View style={styles.modalStatTile}>
                    <Text style={styles.modalStatLabel}>Shortfall Hours</Text>
                    <Text style={[styles.modalStatValue, selectedMember.shortfall_hours > 0 && { color: "#BE123C" }]}>
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
                    <Text style={[styles.modalStatValue, selectedMember.pending_approval_items > 0 && { color: "#B45309" }]}>
                      {selectedMember.pending_approval_items}
                    </Text>
                  </View>
                </View>

                <View style={styles.metaInfoBox}>
                  <Text style={styles.metaInfoText}>Email: {selectedMember.email}</Text>
                  <Text style={styles.metaInfoText}>Username: {selectedMember.username}</Text>
                  <Text style={styles.metaInfoText}>Today&apos;s Status: {selectedMember.today_status}</Text>
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
  loadingContainer: {
    flex: 1,
    backgroundColor: "#F6F8FC",
    alignItems: "center",
    justifyContent: "center",
  },
  scrollView: {
    flex: 1,
  },
  periodRow: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    margin: 16,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  periodPill: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 12,
  },
  periodPillActive: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#2457D6",
    shadowColor: "#000000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  periodText: {
    color: "#68758A",
    fontSize: 11,
    fontWeight: "700",
  },
  periodTextActive: {
    color: "#2457D6",
  },
  metricsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  metricBox: {
    width: "31%",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5EAF2",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    shadowColor: "#243B64",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  metricBoxVal: {
    color: "#152238",
    fontSize: 18,
    fontWeight: "800",
  },
  metricBoxLbl: {
    color: "#68758A",
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
    color: "#152238",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 10,
  },
  spotlightScroll: {
    flexDirection: "row",
  },
  spotlightCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5EAF2",
    borderRadius: 16,
    padding: 14,
    minWidth: 150,
    marginRight: 12,
    shadowColor: "#243B64",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  spotlightTitle: {
    color: "#68758A",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 6,
  },
  spotlightVal: {
    color: "#152238",
    fontSize: 15,
    fontWeight: "800",
    marginTop: 2,
  },
  spotlightSub: {
    color: "#8995A7",
    fontSize: 10,
    marginTop: 4,
  },
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 12,
  },
  tabBtnActive: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#2457D6",
    shadowColor: "#000000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    color: "#68758A",
    fontSize: 11,
    fontWeight: "700",
  },
  tabTextActive: {
    color: "#2457D6",
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginBottom: 16,
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
    fontSize: 13,
  },
  membersListContainer: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  emptyText: {
    color: "#8995A7",
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 20,
  },
  // Card styles
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5EAF2",
    shadowColor: "#243B64",
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
    marginBottom: 8,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  memberName: {
    color: "#152238",
    fontSize: 13,
    fontWeight: "700",
    marginLeft: 6,
  },
  attentionTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  attentionTagText: {
    color: "#B45309",
    fontSize: 9,
    fontWeight: "700",
  },
  ontrackTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  ontrackTagText: {
    color: "#15803D",
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
    color: "#68758A",
    fontSize: 12,
  },
  metricValue: {
    color: "#152238",
    fontSize: 12,
    fontWeight: "700",
  },
  // Modal details
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    maxHeight: "80%",
    borderTopWidth: 1,
    borderTopColor: "#E5EAF2",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#EDF1F6",
    paddingBottom: 14,
    marginBottom: 16,
  },
  modalTitle: {
    color: "#152238",
    fontSize: 18,
    fontWeight: "800",
  },
  modalSub: {
    color: "#68758A",
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    backgroundColor: "#F1F5F9",
    padding: 6,
    borderRadius: 12,
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
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    padding: 12,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  modalStatLabel: {
    color: "#68758A",
    fontSize: 10,
    textTransform: "uppercase",
    fontWeight: "700",
  },
  modalStatValue: {
    color: "#152238",
    fontSize: 16,
    fontWeight: "800",
    marginTop: 4,
  },
  metaInfoBox: {
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  metaInfoText: {
    color: "#152238",
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 4,
  },
});
