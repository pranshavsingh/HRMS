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
  employee_name: string;
  leave_type: string;
  from: string;
  to: string;
  reason: string;
  status: string;
  applied_at: string;
}

export default function ApprovalsScreen() {
  const { user, isAuthenticated } = useAuth();
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
          leave_type: l.type,
          from: l.from,
          to: l.to,
          reason: l.reason,
          status: l.status,
          applied_at: l.created_at,
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

  useEffect(() => {
    fetchQueues(true);
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
            <User size={14} color="#94a3b8" />
            <Text style={styles.userName}>{item.employee_name}</Text>
          </View>
          <Text style={styles.punchTypeTag}>PUNCH {item.type?.toUpperCase()}</Text>
        </View>

        <View style={styles.cardContent}>
          <Text style={styles.cardMeta}>Date: {item.date}</Text>
          <Text style={styles.cardMeta}>Time: {item.punch_time}</Text>
          <View style={styles.coordsRow}>
            <MapPin size={12} color="#f59e0b" style={{ marginRight: 4 }} />
            <Text style={styles.coordsText}>
              Outside Zone: {item.latitude?.toFixed(5)}, {item.longitude?.toFixed(5)}
            </Text>
          </View>
        </View>

        <View style={styles.cardFooter}>
          <TouchableOpacity style={styles.viewBtn} onPress={() => setSelectedPunch(item)}>
            <Eye size={14} color="#ffffff" style={{ marginRight: 6 }} />
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
            <User size={14} color="#94a3b8" />
            <Text style={styles.userName}>{item.employee_name}</Text>
          </View>
          <View style={styles.leaveTypeBadge}>
            <Text style={styles.leaveTypeText}>{item.leave_type?.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.cardContent}>
          <View style={styles.dateDurationRow}>
            <Calendar size={14} color="#94a3b8" style={{ marginRight: 6 }} />
            <Text style={styles.cardMeta}>
              {item.from} to {item.to}
            </Text>
          </View>
          <View style={styles.reasonCard}>
            <FileText size={12} color="#64748b" style={{ marginRight: 6, marginTop: 2 }} />
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
        <ActivityIndicator size="large" color="#10b981" />
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
          <Text style={[styles.toggleText, activeQueue === "punches" && styles.toggleTextActive]}>
            Punch Exceptions ({punchQueue.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleBtn, activeQueue === "leaves" && styles.toggleBtnActive]}
          onPress={() => setActiveQueue("leaves")}
        >
          <Text style={[styles.toggleText, activeQueue === "leaves" && styles.toggleTextActive]}>
            Leaves Queue ({leaveQueue.length})
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={(activeQueue === "punches" ? punchQueue : leaveQueue) as any[]}
        keyExtractor={(item) => String(item.id)}
        renderItem={activeQueue === "punches" ? (renderPunchItem as any) : (renderLeaveItem as any)}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Inbox size={40} color="#64748b" />
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
                <TouchableOpacity onPress={() => setSelectedPunch(null)}>
                  <X size={20} color="#ffffff" />
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
                  <Text style={styles.metaRow}>Date: {selectedPunch.date}</Text>
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
    backgroundColor: "#0f172a",
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
  },
  toggleContainer: {
    flexDirection: "row",
    backgroundColor: "#1e293b",
    margin: 16,
    borderRadius: 14,
    padding: 4,
    borderWidth: 1,
    borderColor: "#33415550",
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 12,
  },
  toggleBtnActive: {
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#334155",
  },
  toggleText: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "700",
  },
  toggleTextActive: {
    color: "#10b981",
  },
  listContent: {
    padding: 16,
    paddingTop: 0,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: "#1e293b",
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#334155",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
    paddingBottom: 8,
    marginBottom: 12,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  userName: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
    marginLeft: 6,
  },
  punchTypeTag: {
    fontSize: 10,
    color: "#a5b4fc",
    fontWeight: "700",
    textTransform: "uppercase",
  },
  leaveTypeBadge: {
    backgroundColor: "#1e1b4b",
    borderWidth: 1,
    borderColor: "#312e81",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  leaveTypeText: {
    color: "#a5b4fc",
    fontSize: 9,
    fontWeight: "700",
  },
  cardContent: {
    marginBottom: 16,
  },
  cardMeta: {
    color: "#94a3b8",
    fontSize: 12,
    marginTop: 2,
  },
  coordsRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
  },
  coordsText: {
    color: "#f59e0b",
    fontSize: 11,
    fontWeight: "600",
  },
  dateDurationRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  reasonCard: {
    backgroundColor: "#0f172a60",
    borderRadius: 12,
    padding: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#33415540",
    flexDirection: "row",
    alignItems: "flex-start",
  },
  reasonText: {
    color: "#94a3b8",
    fontSize: 12,
    lineHeight: 16,
    flex: 1,
  },
  cardFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#334155",
    paddingTop: 12,
  },
  viewBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#334155",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  viewBtnText: {
    color: "#ffffff",
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
    color: "#64748b",
    fontSize: 13,
    marginTop: 12,
    textAlign: "center",
  },
  // Modal Styles
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
    maxHeight: "90%",
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
  modalScroll: {
    paddingBottom: 24,
  },
  selfieImage: {
    width: "100%",
    aspectRatio: 0.85,
    borderRadius: 20,
    backgroundColor: "#0f172a",
    marginBottom: 16,
  },
  modalMetaCard: {
    backgroundColor: "#0f172a60",
    borderRadius: 18,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#33415580",
  },
  metaRow: {
    color: "#94a3b8",
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
