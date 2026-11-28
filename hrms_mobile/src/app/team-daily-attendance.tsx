import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useLocalSearchParams } from "expo-router";
import { AlertCircle, Calendar, Clock } from "lucide-react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import api from "../services/api";
import { formatCompanyDate } from "../utils/date";
import LocationDisplay from "../components/LocationDisplay";

function fmtTime(iso: string | null) {
  if (!iso) return "--:--";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function TeamDailyAttendanceScreen() {
  const params = useLocalSearchParams<{ employeeId?: string; date?: string }>();
  const employeeId = Number(params.employeeId || 0);
  const dateStr = String(params.date || "");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [detail, setDetail] = useState<any>(null);

  const fetchDetail = useCallback(async (showLoader = true) => {
    if (!employeeId || !dateStr) return;
    if (showLoader) setLoading(true);
    setErrorMsg("");
    try {
      const res = await api.get(`/manager/team/${employeeId}/attendance/${dateStr}`);
      setDetail(res.data || null);
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.error || "Unable to load daily attendance details.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [employeeId, dateStr]);

  useEffect(() => {
    const t = setTimeout(() => {
      void fetchDetail(true);
    }, 0);
    return () => clearTimeout(t);
  }, [fetchDetail]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2457D6" />
      </View>
    );
  }

  if (errorMsg || !detail) {
    return (
      <View style={styles.center}>
        <AlertCircle size={32} color="#DC2626" />
        <Text style={styles.errorText}>{errorMsg || "Record unavailable"}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => void fetchDetail(true)}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const emp = detail.employee || {};
  const att = detail.attendance;

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right", "bottom"]}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void fetchDetail(false);
            }}
            tintColor="#2457D6"
          />
        }
      >
        {/* Employee Header */}
        <View style={styles.card}>
          <Text style={styles.eyebrow}>{formatCompanyDate(detail.date)} · {detail.weekday}</Text>
          <Text style={styles.title}>{emp.name}</Text>
          <Text style={styles.sub}>
            {emp.employee_code}
            {emp.designation ? ` · ${emp.designation}` : ""}
            {emp.department ? ` · ${emp.department}` : ""}
          </Text>
        </View>

        {/* Shift Information */}
        {detail.shift && (
          <View style={styles.card}>
            <View style={styles.rowTitle}>
              <Clock size={16} color="#2457D6" />
              <Text style={styles.sectionTitle}>Scheduled Shift</Text>
            </View>
            <Text style={styles.shiftText}>
              {detail.shift.name} ({detail.shift.start_time?.slice(0, 5)} – {detail.shift.end_time?.slice(0, 5)})
            </Text>
          </View>
        )}

        {/* Leave / Holiday Banner */}
        {detail.holiday && (
          <View style={[styles.banner, { backgroundColor: "#F0FDFA", borderColor: "#CCFBF1" }]}>
            <Calendar size={16} color="#0F766E" />
            <Text style={[styles.bannerText, { color: "#0F766E" }]}>Holiday: {detail.holiday.name}</Text>
          </View>
        )}
        {detail.leave && (
          <View style={[styles.banner, { backgroundColor: "#EFF6FF", borderColor: "#BFDBFE" }]}>
            <Calendar size={16} color="#1E40AF" />
            <Text style={[styles.bannerText, { color: "#1E40AF" }]}>
              Approved {detail.leave.leave_type} Leave — {detail.leave.reason}
            </Text>
          </View>
        )}

        {/* Attendance Timings & Metrics */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Attendance Timings</Text>
          {att ? (
            <>
              <View style={styles.timingsGrid}>
                <View style={styles.timingBox}>
                  <Text style={styles.timingLabel}>PUNCH IN</Text>
                  <Text style={styles.timingVal}>{fmtTime(att.punch_in_time)}</Text>
                </View>
                <View style={styles.timingBox}>
                  <Text style={styles.timingLabel}>PUNCH OUT</Text>
                  <Text style={styles.timingVal}>{fmtTime(att.punch_out_time)}</Text>
                </View>
                <View style={styles.timingBox}>
                  <Text style={styles.timingLabel}>TOTAL HOURS</Text>
                  <Text style={[styles.timingVal, { color: "#2457D6" }]}>{att.work_hours}h</Text>
                </View>
              </View>

              <View style={styles.metaList}>
                <Text style={styles.metaRow}>Status: <Text style={styles.metaBold}>{att.status}</Text></Text>
                <Text style={styles.metaRow}>Late Arrival: <Text style={styles.metaBold}>{att.late_minutes || 0} min</Text></Text>
                <Text style={styles.metaRow}>
                  Early Departure (Info only): <Text style={styles.metaBold}>{att.early_departure_minutes || 0} min</Text>
                </Text>
              </View>

              {/* Locations */}
              {(att.punch_in_location || att.punch_out_location) && (
                <View style={styles.locSection}>
                  {att.punch_in_location && (
                    <View style={styles.locRow}>
                      <LocationDisplay
                        latitude={att.punch_in_location.latitude}
                        longitude={att.punch_in_location.longitude}
                        prefix="In:"
                        suffix={att.punch_in_location.outside ? "(Outside Zone)" : "(Inside Zone)"}
                      />
                    </View>
                  )}
                  {att.punch_out_location && (
                    <View style={styles.locRow}>
                      <LocationDisplay
                        latitude={att.punch_out_location.latitude}
                        longitude={att.punch_out_location.longitude}
                        prefix="Out:"
                        suffix={att.punch_out_location.outside ? "(Outside Zone)" : "(Inside Zone)"}
                      />
                    </View>
                  )}
                </View>
              )}

              {/* Selfie Photos */}
              {(att.punch_in_photo || att.punch_out_photo) && (
                <View style={styles.photosRow}>
                  {att.punch_in_photo && (
                    <View style={styles.photoBox}>
                      <Text style={styles.photoLabel}>Punch-In Photo</Text>
                      <Image source={{ uri: att.punch_in_photo }} style={styles.photoImg} />
                    </View>
                  )}
                  {att.punch_out_photo && (
                    <View style={styles.photoBox}>
                      <Text style={styles.photoLabel}>Punch-Out Photo</Text>
                      <Image source={{ uri: att.punch_out_photo }} style={styles.photoImg} />
                    </View>
                  )}
                </View>
              )}
            </>
          ) : (
            <Text style={styles.emptySub}>No punch record logged for this date.</Text>
          )}
        </View>

        {/* Approval / Regularization History */}
        {Array.isArray(detail.approval_history) && detail.approval_history.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Approval & Regularization History</Text>
            {detail.approval_history.map((ap: any) => (
              <View key={ap.id} style={styles.historyRow}>
                <Text style={styles.historyType}>
                  {ap.type?.toUpperCase()} — {ap.status?.toUpperCase()}
                </Text>
                {ap.comment && <Text style={styles.historyComment}>{ap.comment}</Text>}
                {ap.reviewer_name && <Text style={styles.historyReviewer}>Reviewer: {ap.reviewer_name}</Text>}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F6F8FC" },
  container: { padding: 16, paddingBottom: 36 },
  center: { flex: 1, backgroundColor: "#F6F8FC", alignItems: "center", justifyContent: "center", padding: 20 },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5EAF2",
    marginBottom: 12,
  },
  eyebrow: { fontSize: 11, fontWeight: "800", color: "#2457D6", textTransform: "uppercase" },
  title: { fontSize: 19, fontWeight: "800", color: "#152238", marginTop: 4 },
  sub: { fontSize: 12, color: "#68758A", marginTop: 2 },
  rowTitle: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: "#152238", marginBottom: 8 },
  shiftText: { fontSize: 13, color: "#475569", fontWeight: "600" },
  banner: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 12 },
  bannerText: { fontSize: 13, fontWeight: "700", flex: 1 },
  timingsGrid: { flexDirection: "row", gap: 8, marginBottom: 12 },
  timingBox: { flex: 1, backgroundColor: "#F8FAFC", borderRadius: 12, padding: 10, alignItems: "center" },
  timingLabel: { fontSize: 9, fontWeight: "800", color: "#8995A7" },
  timingVal: { fontSize: 14, fontWeight: "800", color: "#152238", marginTop: 2 },
  metaList: { gap: 4, marginBottom: 10 },
  metaRow: { fontSize: 13, color: "#68758A" },
  metaBold: { color: "#152238", fontWeight: "700" },
  locSection: { gap: 6, marginTop: 6, backgroundColor: "#F8FAFC", padding: 10, borderRadius: 12 },
  locRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  locText: { fontSize: 12, color: "#475569", flex: 1 },
  photosRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  photoBox: { flex: 1 },
  photoLabel: { fontSize: 11, fontWeight: "700", color: "#68758A", marginBottom: 4 },
  photoImg: { width: "100%", height: 120, borderRadius: 12 },
  emptySub: { fontSize: 13, color: "#8995A7" },
  historyRow: { borderTopWidth: 1, borderTopColor: "#EDF1F6", paddingVertical: 10 },
  historyType: { fontSize: 13, fontWeight: "800", color: "#152238" },
  historyComment: { fontSize: 12, color: "#475569", marginTop: 2 },
  historyReviewer: { fontSize: 11, color: "#8995A7", marginTop: 2 },
  errorText: { fontSize: 14, color: "#991B1B", marginTop: 8, textAlign: "center" },
  retryBtn: { marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: "#2457D6", borderRadius: 10 },
  retryText: { color: "#FFFFFF", fontWeight: "700" },
});
