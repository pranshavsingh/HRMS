import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import API, { getInMemoryToken } from "../api/axios";
import { useAuth } from "./AuthContext";
import { useRealtime } from "./RealtimeContext";

const APPROVER_ROLES = new Set(["manager", "hr", "admin", "superadmin"]);

const ApprovalCountsContext = createContext(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useApprovalCounts() {
  const ctx = useContext(ApprovalCountsContext);
  if (!ctx) {
    throw new Error("useApprovalCounts must be used within an ApprovalCountsProvider");
  }
  return ctx;
}

export function ApprovalCountsProvider({ children }) {
  const { user, role, accessToken } = useAuth();
  const { subscribe } = useRealtime();

  const [attendancePendingCount, setAttendancePendingCount] = useState(0);
  const [leavePendingCount, setLeavePendingCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const inFlightAttendanceRef = useRef(false);
  const inFlightLeaveRef = useRef(false);

  const normalizedRole = String(role || user?.role || "").toLowerCase();
  const isApprover = APPROVER_ROLES.has(normalizedRole);
  const isAuthenticated = Boolean(user && (accessToken || getInMemoryToken()));

  const fetchAttendanceCount = useCallback(async () => {
    if (!isAuthenticated || !isApprover || inFlightAttendanceRef.current) return;
    inFlightAttendanceRef.current = true;
    try {
      const res = await API.get("/attendance/approvals/pending-count");
      setAttendancePendingCount(Number(res.data?.count || 0));
      setError(false);
    } catch {
      setError(true);
    } finally {
      inFlightAttendanceRef.current = false;
    }
  }, [isAuthenticated, isApprover]);

  const fetchLeaveCount = useCallback(async () => {
    if (!isAuthenticated || !isApprover || inFlightLeaveRef.current) return;
    inFlightLeaveRef.current = true;
    try {
      const res = await API.get("/leave/approvals/pending-count");
      setLeavePendingCount(Number(res.data?.count || 0));
      setError(false);
    } catch {
      setError(true);
    } finally {
      inFlightLeaveRef.current = false;
    }
  }, [isAuthenticated, isApprover]);

  const refreshCounts = useCallback(async () => {
    if (!isAuthenticated || !isApprover) {
      setAttendancePendingCount(0);
      setLeavePendingCount(0);
      setLoading(false);
      setError(false);
      return;
    }
    setLoading(true);
    await Promise.all([fetchAttendanceCount(), fetchLeaveCount()]);
    setLoading(false);
  }, [isAuthenticated, isApprover, fetchAttendanceCount, fetchLeaveCount]);

  useEffect(() => {
    if (!isAuthenticated || !isApprover) {
      setAttendancePendingCount(0);
      setLeavePendingCount(0);
      setLoading(false);
      setError(false);
      return;
    }

    void refreshCounts();

    const unsubAttendance = subscribe("approval:attendance:count-updated", () => {
      void fetchAttendanceCount();
    });
    const unsubLeave = subscribe("approval:leave:count-updated", () => {
      void fetchLeaveCount();
    });
    const unsubConnected = subscribe("realtime:connected", () => {
      void fetchAttendanceCount();
      void fetchLeaveCount();
    });

    return () => {
      unsubAttendance();
      unsubLeave();
      unsubConnected();
    };
  }, [
    isAuthenticated,
    isApprover,
    subscribe,
    refreshCounts,
    fetchAttendanceCount,
    fetchLeaveCount,
  ]);

  const value = useMemo(
    () => ({
      attendancePendingCount,
      leavePendingCount,
      loading,
      error,
      refreshCounts,
      fetchAttendanceCount,
      fetchLeaveCount,
    }),
    [
      attendancePendingCount,
      leavePendingCount,
      loading,
      error,
      refreshCounts,
      fetchAttendanceCount,
      fetchLeaveCount,
    ]
  );

  return (
    <ApprovalCountsContext.Provider value={value}>
      {children}
    </ApprovalCountsContext.Provider>
  );
}
