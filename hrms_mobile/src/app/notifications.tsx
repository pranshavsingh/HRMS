import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  Bell,
  Calendar,
  CalendarClock,
  CalendarDays,
  CheckCheck,
  Clock,
  FileText,
  Megaphone,
  ShieldAlert,
  Trash2,
} from "lucide-react-native";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useRealtime } from "../context/RealtimeContext";
import { AppNotification, useNotifications } from "../context/NotificationContext";

function getCategoryIcon(category: string) {
  switch (category) {
    case "LEAVE":
      return <Calendar size={18} color="#7E22CE" />;
    case "ATTENDANCE":
      return <Clock size={18} color="#059669" />;
    case "ROSTER":
      return <CalendarClock size={18} color="#2457D6" />;
    case "DOCUMENT":
      return <FileText size={18} color="#D97706" />;
    case "HOLIDAY":
      return <CalendarDays size={18} color="#4F46E5" />;
    case "ANNOUNCEMENT":
      return <Megaphone size={18} color="#4F46E5" />;
    case "SYSTEM":
      return <ShieldAlert size={18} color="#DC2626" />;
    default:
      return <Bell size={18} color="#68758A" />;
  }
}

function formatRelativeTime(value: string) {
  if (!value) return "";
  const ts = new Date(value).getTime();
  if (Number.isNaN(ts)) return "";
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return "Just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export default function NotificationsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { unreadCount, markAsRead, markAllAsRead, deleteNotification, clearAllNotifications, resolveMobileRoute } = useNotifications();

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const fetchList = useCallback(
    async (targetPage = 1, append = false, showLoader = true) => {
      if (showLoader && !append) setLoading(true);
      setError("");
      try {
        const res = await api.get("/notifications", {
          params: {
            page: targetPage,
            limit: 20,
            ...(unreadOnly ? { unreadOnly: true } : {}),
          },
        });
        const list: AppNotification[] = Array.isArray(res.data?.records) ? res.data.records : [];
        const pag = res.data?.pagination || {};
        setHasMore(Boolean(pag.hasNextPage));
        setPage(targetPage);
        setNotifications((prev) => (append ? [...prev, ...list] : list));
      } catch (err: any) {
        setError(err?.response?.data?.error || "Unable to load notifications.");
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [unreadOnly]
  );

  useEffect(() => {
    void fetchList(1, false, true);
  }, [fetchList]);

  const refreshSilent = useCallback(() => {
    void fetchList(1, false, false);
  }, [fetchList]);

  useRealtime("notification:new", refreshSilent);
  useRealtime("notification:read", refreshSilent);
  useRealtime("notification:read-all", refreshSilent);

  const handleLoadMore = () => {
    if (loadingMore || !hasMore || loading) return;
    setLoadingMore(true);
    void fetchList(page + 1, true, false);
  };

  const handlePressItem = async (item: AppNotification) => {
    if (!item.readAt) {
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n))
      );
      await markAsRead(item.id).catch(() => {});
    }
    if (item.actionUrl && item.actionUrl !== "/notifications") {
      const target = resolveMobileRoute(item.actionUrl, user?.role);
      router.push(target as any);
    }
  };

  const handleMarkAll = async () => {
    await markAllAsRead(null).catch(() => {});
    const nowIso = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || nowIso })));
  };

  const handleDeleteOne = async (id: number) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    await deleteNotification(id).catch(() => {
      void fetchList(1, false, false);
    });
  };

  const handleClearAll = () => {
    Alert.alert(
      "Clear Notifications",
      "Are you sure you want to clear all notifications?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear All",
          style: "destructive",
          onPress: async () => {
            setNotifications([]);
            await clearAllNotifications().catch(() => {
              void fetchList(1, false, false);
            });
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["left", "right"]}>
      {/* Filter & Mark All Header */}
      <View style={styles.topBar}>
        <View style={styles.filterPills}>
          <TouchableOpacity
            style={[styles.pill, !unreadOnly && styles.pillActive]}
            onPress={() => setUnreadOnly(false)}
          >
            <Text style={[styles.pillText, !unreadOnly && styles.pillTextActive]}>All</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.pill, unreadOnly && styles.pillActive]}
            onPress={() => setUnreadOnly(true)}
          >
            <Text style={[styles.pillText, unreadOnly && styles.pillTextActive]}>
              Unread{unreadCount > 0 ? ` (${unreadCount})` : ""}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.topActions}>
          {unreadCount > 0 && (
            <TouchableOpacity style={styles.markAllBtn} onPress={handleMarkAll}>
              <CheckCheck size={14} color="#2457D6" style={{ marginRight: 4 }} />
              <Text style={styles.markAllText}>Read all</Text>
            </TouchableOpacity>
          )}
          {notifications.length > 0 && (
            <TouchableOpacity style={styles.clearAllBtn} onPress={handleClearAll}>
              <Trash2 size={14} color="#BE123C" style={{ marginRight: 4 }} />
              <Text style={styles.clearAllText}>Clear all</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color="#2457D6" />
        </View>
      ) : error ? (
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => void fetchList(1, false, true)}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.4}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void fetchList(1, false, false);
              }}
              tintColor="#2457D6"
            />
          }
          renderItem={({ item }) => {
            const isUnread = !item.readAt;
            return (
              <TouchableOpacity
                style={[styles.card, isUnread && styles.cardUnread]}
                activeOpacity={0.75}
                onPress={() => void handlePressItem(item)}
              >
                <View style={styles.iconBox}>{getCategoryIcon(item.category)}</View>
                <View style={styles.cardBody}>
                  <View style={styles.cardTop}>
                    <Text style={[styles.title, isUnread && styles.titleUnread]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    <Text style={styles.timeText}>{formatRelativeTime(item.createdAt)}</Text>
                  </View>
                  <Text style={styles.message}>{item.message}</Text>
                  <View style={styles.metaRow}>
                    <View style={styles.categoryBadge}>
                      <Text style={styles.categoryText}>{item.category}</Text>
                    </View>
                    <View style={styles.cardRightActions}>
                      {isUnread && <View style={styles.unreadDot} />}
                      <TouchableOpacity
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        onPress={() => void handleDeleteOne(item.id)}
                        style={styles.deleteIconBtn}
                      >
                        <Trash2 size={14} color="#94A3B8" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator size="small" color="#2457D6" style={{ marginVertical: 16 }} />
            ) : undefined
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Bell size={38} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>No notifications</Text>
              <Text style={styles.emptySub}>
                {unreadOnly ? "You are all caught up." : "Updates on leave, attendance, and shifts will appear here."}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#F6F8FC",
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5EAF2",
  },
  filterPills: {
    flexDirection: "row",
    gap: 8,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  pillActive: {
    backgroundColor: "#EAF0FF",
    borderColor: "#2457D6",
  },
  pillText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#68758A",
  },
  pillTextActive: {
    color: "#2457D6",
    fontWeight: "700",
  },
  topActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  markAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#EAF0FF",
  },
  markAllText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#2457D6",
  },
  clearAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#FFF1F2",
  },
  clearAllText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#BE123C",
  },
  centerBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorText: {
    color: "#BE123C",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 12,
  },
  retryBtn: {
    backgroundColor: "#2457D6",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5EAF2",
    shadowColor: "#243B64",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  cardUnread: {
    backgroundColor: "#F8FAFF",
    borderColor: "#BFDBFE",
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  cardBody: {
    flex: 1,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#334155",
  },
  titleUnread: {
    fontWeight: "800",
    color: "#152238",
  },
  timeText: {
    fontSize: 11,
    color: "#8995A7",
  },
  message: {
    fontSize: 13,
    color: "#68758A",
    lineHeight: 18,
    marginTop: 4,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  categoryBadge: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  categoryText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#68758A",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#2457D6",
  },
  cardRightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  deleteIconBtn: {
    padding: 4,
  },
  emptyBox: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#152238",
    marginTop: 12,
  },
  emptySub: {
    fontSize: 13,
    color: "#8995A7",
    textAlign: "center",
    marginTop: 6,
  },
});
