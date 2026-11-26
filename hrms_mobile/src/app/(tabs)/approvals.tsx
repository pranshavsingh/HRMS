import React, { useEffect, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
} from "react-native";
import api from "../../services/api";
import { useRealtime } from "../../context/RealtimeContext";
import { useAuth } from "../../context/AuthContext";
import { useApprovalCounts } from "../../context/ApprovalCountsContext";
import PendingCountBadge from "../../components/PendingCountBadge";
import { formatCompanyDate, formatCompanyDateRange } from "../../utils/date";
import { Image } from "expo-image";
import { 
  Check, 
  X, 
  Eye, 
  MapPin, 
  Calendar, 
  FileText, 
  User,
  Inbox
} from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";

interface PunchException {
  id: number;
  employee_name: string;
  date: string;
  punch_time: string;
  type: string; // 'in' or 'out'
  latitude: number;
  longitude: number;
  photo_url: string;
  status: string;
}

interface LeaveApproval {
  id: number;
  employee_id?: number;
  employee_name: string;
  employee_role?: string;
  team_name?: string;
  designation?: string;
  leave_type: string;
  from: string;
  to: string;
  reason: string;
  status: string;
  applied_at: string;
  balance?: {
    base_entitlement: number;
    management_concession: number;
    leaves_used: number;
    pending_days: number;
    pending_requests: number;
    available_balance: number;
    projected_balance: number;
  };
}

export default function ApprovalsScreen() {
  const { user, isAuthenticated } = useAuth();
  const { attendancePendingCount, leavePendingCount, loading: countsLoading, error: countsError } = useApprovalCounts();
  const [activeQueue, setActiveQueue] = useState<"punches" | "leaves">("punches");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [punchQueue, setPunchQueue] = useState<PunchException[]>([]);
  const [leaveQueue, setLeaveQueue] = useState<LeaveApproval[]>([]);

  // Selected punch modal display
  const [selectedPunch, setSelectedPunch] = useState<PunchException | null>(null);
  const [actioningId, setActioningId] = useState<number | null>(null);

  const fetchQueues = useCallback(async (showLoader = true) => {
    if (!user || !isAuthenticated) return;
    if (showLoader) setLoading(true);
    try {
      // 1. Fetch Punch Approvals
      const punchRes = await api.get("/attendance/approvals/");
      const punchData = Array.isArray(punchRes.data)
        ? punchRes.data
        : Array.isArray(punchRes.data?.records)
        ? punchRes.data.records
        : [];
      
      const mappedPunches: PunchException[] = punchData.map((r: any) => {
        const timeVal = r.review_type === "in" ? r.punch_in_time : r.punch_out_time;
        let formattedTime = "--";
        if (timeVal) {
          try {
            const dateObj = new Date(timeVal);
            formattedTime = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          } catch (e) {
            formattedTime = timeVal;
          }
        }
        return {
          id: r.approval_id,
          employee_name: r.employee_name || r.employee,
          date: r.date,
          punch_time: formattedTime,
          type: r.review_type,
          latitude: r.latitude || 0,
          longitude: r.longitude || 0,
          photo_url: r.review_type === "in" ? r.punch_in_photo : r.punch_out_photo,
          status: r.approval_status,
        };
      });
      setPunchQueue(mappedPunches.filter((p) => p.status === "pending"));

      // 2. Fetch Leave Approvals
      const leaveRes = await api.get("/leave/approvals/");
      const leaveData = Array.isArray(leaveRes.data)
        ? leaveRes.data
        : Array.isArray(leaveRes.data?.records)
        ? leaveRes.data.records
        : [];
      
      const mappedLeaves: LeaveApproval[] = leaveData.map((l: any) => {
        return {
          id: l.id,
          employee_name: l.employee_name || l.employee,
          employee_id: l.employee_id,
          employee_role: l.employee_role,
          team_name: l.team_name,
          designation: l.designation,
          leave_type: l.type,
          from: l.from,
          to: l.to,
          reason: l.reason,
          status: l.status,
          applied_at: l.created_at,
          balance: l.balance,
        };
      });
      setLeaveQueue(mappedLeaves.filter((l) => l.status === "pending"));

    } catch (err) {
      console.error("Error loading approvals queues:", err);
      Alert.alert("Sync Error", "Unable to load approval items.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user, isAuthenticated]);

  useRealtime("leave_update", () => fetchQueues(false));
  useRealtime("attendance_update", () => fetchQueues(false));
  useRealtime("realtime:connected", () => fetchQueues(false));

  useEffect(() => {
    const t = setTimeout(() => { void fetchQueues(true); }, 0);
    return () => clearTimeout(t);
  }, [fetchQueues]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchQueues(false);
  };

  const handleActionPunch = async (id: number, decision: "approved" | "rejected") => {
    setActioningId(id);
    try {
      await api.post(`/attendance/approvals/${id}/`, { status: decision });
      Alert.alert("Success", `Punch exception ${decision} successfully.`);
      setSelectedPunch(null);
      fetchQueues(false);
    } catch (err: any) {
      console.error("Error actioning punch", err);
      Alert.alert("Error", err.response?.data?.error || "Failed to submit decision.");
    } finally {
      setActioningId(null);
    }
  };

  const handleActionLeave = async (id: number, decision: "approved" | "rejected") => {
    setActioningId(id);
    try {
      await api.post(`/leave/action/${id}/`, { status: decision });
      Alert.alert("Success", `Leave application ${decision} successfully.`);
      fetchQueues(false);
    } catch (err: any) {
      console.error("Error actioning leave", err);
      Alert.alert("Error", err.response?.data?.error || "Failed to submit decision.");
    } finally {
      setActioningId(null);
    }
  };

  const renderPunchItem = ({ item }: { item: PunchException }) => {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.userRow}>
            <User size={14} color="#68758A" />
            <Text style={styles.userName}>{item.employee_name}</Text>
          </View>
          <Text style={styles.punchTypeTag}>PUNCH {item.type?.toUpperCase()}</Text>
        </View>

        <View style={styles.cardContent}>
          <Text style={styles.cardMeta}>Date: {formatCompanyDate(item.date)}</Text>
          <Text style={styles.cardMeta}>Time: {item.punch_time}</Text>
          <View style={styles.coordsRow}>
            <MapPin size={12} color="#D97706" style={{ marginRight: 4 }} />
            <Text style={styles.coordsText}>
              Outside Zone: {item.latitude?.toFixed(5)}, {item.longitude?.toFixed(5)}
            </Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <TouchableOpacity style={styles.viewBtn} onPress={() => setSelectedPunch(item)}>
            <Eye size={14} color="#2457D6" style={{ marginRight: 6 }} />
            <Text style={styles.viewBtnText}>Expand Selfie</Text>
          </TouchableOpacity>

          <View style={styles.actionGroup}>
            <TouchableOpacity
              style={[styles.circleBtn, styles.btnReject]}
              onPress={() => handleActionPunch(item.id, "rejected")}
              disabled={actioningId !== null}
            >
              <X size={16} color="#ffffff" />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.circleBtn, styles.btnApprove]}
              onPress={() => handleActionPunch(item.id, "approved")}
              disabled={actioningId !== null}
            >
              <Check size={16} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  };

  const renderLeaveItem = ({ item }: { item: LeaveApproval }) => {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.userRow}>
            <User size={14} color="#68758A" />
            <Text style={styles.userName}>{item.employee_name}</Text>
          </View>
          <View style={styles.leaveTypeBadge}>
            <Text style={styles.leaveTypeText}>{item.leave_type?.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.cardContent}>
          <Text style={styles.cardMeta}>Employee ID: {item.employee_id ?? "--"} · {item.team_name || "Team not assigned"} · {item.designation || "Designation not set"}</Text>
          <View style={styles.dateDurationRow}>
            <Calendar size={14} color="#68758A" style={{ marginRight: 6 }} />
            <Text style={styles.cardMeta}>
              {formatCompanyDateRange(item.from || (item as any).from_date, item.to || (item as any).to_date)}
            </Text>
          </View>
          <View style={styles.reasonCard}>
            <Text style={styles.reasonText}>
              Balance: entitlement {item.balance?.base_entitlement ?? "--"}d · concession {item.balance?.management_concession ?? "--"}d · used {item.balance?.leaves_used ?? "--"}d · pending {item.balance?.pending_days ?? "--"}d ({item.balance?.pending_requests ?? 0} requests) · available {item.balance?.available_balance ?? "--"}d · projected {item.balance?.projected_balance ?? "--"}d
            </Text>
          </View>
          {Number(item.balance?.projected_balance) < 0 && <Text style={{ color: "#be123c", fontWeight: "700", marginTop: 6 }}>Negative balance warning</Text>}
          <View style={styles.reasonCard}>
            <FileText size={12} color="#68758A" style={{ marginRight: 6, marginTop: 2 }} />
            <Text style={styles.reasonText}>{item.reason}</Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <View style={{ flex: 1 }} />
          <View style={styles.actionGroup}>
            <TouchableOpacity
              style={[styles.quickBtn, styles.btnReject]}
              onPress={() => handleActionLeave(item.id, "rejected")}
              disabled={actioningId !== null}
            >
              <Text style={styles.btnText}>Deny</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickBtn, styles.btnApprove]}
              onPress={() => handleActionLeave(item.id, "approved")}
              disabled={actioningId !== null}
            >
              <Text style={styles.btnText}>Approve</Text>
            </TouchableOpacity>
          </View>
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
      {/* Sliding Queue Segment Toggle */}
      <View style={styles.toggleContainer}>
        <TouchableOpacity
          style={[styles.toggleBtn, activeQueue === "punches" && styles.toggleBtnActive]}
          onPress={() => setActiveQueue("punches")}
        >
          <View style={styles.toggleBtnInner}>
            <Text style={[styles.toggleText, activeQueue === "punches" && styles.toggleTextActive]}>
              Attendance Approvals
            </Text>
            <PendingCountBadge
              count={attendancePendingCount}
              loading={countsLoading}
              error={countsError}
              label="Attendance Approvals"
            />
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, activeQueue === "leaves" && styles.toggleBtnActive]}
          onPress={() => setActiveQueue("leaves")}
        >
          <View style={styles.toggleBtnInner}>
            <Text style={[styles.toggleText, activeQueue === "leaves" && styles.toggleTextActive]}>
              Leave Approvals
            </Text>
            <PendingCountBadge
              count={leavePendingCount}
              loading={countsLoading}
              error={countsError}
              label="Leave Approvals"
            />
          </View>
        </TouchableOpacity>
      </View>

      <FlatList
        data={(activeQueue === "punches" ? punchQueue : leaveQueue) as any[]}
        keyExtractor={(item) => String(item.id)}
        renderItem={activeQueue === "punches" ? (renderPunchItem as any) : (renderLeaveItem as any)}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2457D6" />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Inbox size={40} color="#8995A7" />
            <Text style={styles.emptyText}>All caught up! No pending approvals found.</Text>
          </View>
        }
      />

      {/* --- SELFIE VIEW MODAL --- */}
      <Modal
        visible={selectedPunch !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedPunch(null)}
      >
        <View style={styles.modalOverlay}>
          {selectedPunch && (
            <View style={styles.modalContent}>
              {/* Header */}
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{selectedPunch.employee_name}</Text>
                <TouchableOpacity onPress={() => setSelectedPunch(null)} style={styles.closeBtn}>
                  <X size={20} color="#152238" />
                </TouchableOpacity>
              </View>

              {/* Photo Display */}
              <ScrollView contentContainerStyle={styles.modalScroll}>
                <Image
                  source={{ uri: selectedPunch.photo_url }}
                  style={styles.selfieImage}
                  contentFit="cover"
                />

                <View style={styles.modalMetaCard}>
                  <Text style={styles.metaRow}>
                    Session: Punch {selectedPunch.type?.toUpperCase()}
                  </Text>
                  <Text style={styles.metaRow}>Date: {formatCompanyDate(selectedPunch.date)}</Text>
                  <Text style={styles.metaRow}>Time: {selectedPunch.punch_time}</Text>
                  <Text style={styles.metaRow}>
                    Telemetry: {selectedPunch.latitude?.toFixed(6)}, {selectedPunch.longitude?.toFixed(6)}
                  </Text>
                </View>

                {/* Approve / Reject Actions in Modal */}
                <View style={styles.modalActionRow}>
                  <TouchableOpacity
                    style={[styles.modalActionBtn, styles.btnReject, { marginRight: 12 }]}
                    onPress={() => handleActionPunch(selectedPunch.id, "rejected")}
                    disabled={actioningId !== null}
                  >
                    <Text style={styles.btnText}>Reject Punch</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalActionBtn, styles.btnApprove]}
                    onPress={() => handleActionPunch(selectedPunch.id, "approved")}
                    disabled={actioningId !== null}
                  >
                    <Text style={styles.btnText}>Approve Punch</Text>
                  </TouchableOpacity>
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
  toggleContainer: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    margin: 16,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 12,
  },
  toggleBtnInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  toggleBtnActive: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#2457D6",
    shadowColor: "#000000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  toggleText: {
    color: "#68758A",
    fontSize: 12,
    fontWeight: "700",
  },
  toggleTextActive: {
    color: "#2457D6",
  },
  listContent: {
    padding: 16,
    paddingTop: 0,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#E5EAF2",
    shadowColor: "#243B64",
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#EDF1F6",
    paddingBottom: 8,
    marginBottom: 12,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  userName: {
    color: "#152238",
    fontSize: 14,
    fontWeight: "700",
    marginLeft: 6,
  },
  punchTypeTag: {
    fontSize: 10,
    color: "#2457D6",
    fontWeight: "700",
    textTransform: "uppercase",
  },
  leaveTypeBadge: {
    backgroundColor: "#EAF0FF",
    borderWidth: 1,
    borderColor: "#C9D8FF",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  leaveTypeText: {
    color: "#2457D6",
    fontSize: 9,
    fontWeight: "700",
  },
  cardContent: {
    marginBottom: 16,
  },
  cardMeta: {
    color: "#68758A",
    fontSize: 12,
    marginTop: 2,
  },
  coordsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  coordsText: {
    color: "#D97706",
    fontSize: 11,
    fontWeight: "600",
  },
  dateDurationRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  reasonCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    flexDirection: "row",
    alignItems: "flex-start",
  },
  reasonText: {
    color: "#152238",
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#EDF1F6",
    paddingTop: 12,
  },
  viewBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EAF0FF",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#C9D8FF",
  },
  viewBtnText: {
    color: "#2457D6",
    fontSize: 12,
    fontWeight: "600",
  },
  actionGroup: {
    flexDirection: "row",
  },
  circleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 10,
  },
  quickBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    marginLeft: 10,
  },
  btnApprove: {
    backgroundColor: "#10b981",
  },
  btnReject: {
    backgroundColor: "#ef4444",
  },
  btnText: {
    color: "#ffffff",
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
  // Modal Styles
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
    maxHeight: "90%",
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
  closeBtn: {
    padding: 6,
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
  },
  modalScroll: {
    paddingBottom: 24,
  },
  selfieImage: {
    width: "100%",
    aspectRatio: 0.85,
    borderRadius: 20,
    backgroundColor: "#F8FAFC",
    marginBottom: 16,
  },
  modalMetaCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 18,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  metaRow: {
    color: "#152238",
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 4,
  },
  modalActionRow: {
    flexDirection: "row",
  },
  modalActionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
});
