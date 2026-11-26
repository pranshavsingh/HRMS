import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import api from "../services/api";
import { useAuth } from "./AuthContext";
import { useRealtime } from "./RealtimeContext";

const APPROVER_ROLES = new Set(["manager", "hr", "admin", "superadmin"]);

interface ApprovalCountsContextType {
  attendancePendingCount: number;
  leavePendingCount: number;
  loading: boolean;
  error: boolean;
  refreshCounts: () => Promise<void>;
  fetchAttendanceCount: () => Promise<void>;
  fetchLeaveCount: () => Promise<void>;
}

const ApprovalCountsContext = createContext<ApprovalCountsContextType | null>(null);

export const useApprovalCounts = () => {
  const ctx = useContext(ApprovalCountsContext);
  if (!ctx) {
    throw new Error("useApprovalCounts must be used within an ApprovalCountsProvider");
  }
  return ctx;
};

export const ApprovalCountsProvider = ({ children }: { children: React.ReactNode }) => {
  const { user, isAuthenticated } = useAuth();

  const [attendancePendingCount, setAttendancePendingCount] = useState(0);
  const [leavePendingCount, setLeavePendingCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const inFlightAttendanceRef = useRef(false);
  const inFlightLeaveRef = useRef(false);

  const normalizedRole = String(user?.role || "").toLowerCase();
  const isApprover = APPROVER_ROLES.has(normalizedRole);

  const fetchAttendanceCount = useCallback(async () => {
    if (!isAuthenticated || !isApprover || inFlightAttendanceRef.current) return;
    inFlightAttendanceRef.current = true;
    try {
      const res = await api.get("/attendance/approvals/pending-count");
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
      const res = await api.get("/leave/approvals/pending-count");
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

  useRealtime("approval:attendance:count-updated", useCallback(() => {
    void fetchAttendanceCount();
  }, [fetchAttendanceCount]));

  useRealtime("approval:leave:count-updated", useCallback(() => {
    void fetchLeaveCount();
  }, [fetchLeaveCount]));

  useRealtime("realtime:connected", useCallback(() => {
    void fetchAttendanceCount();
    void fetchLeaveCount();
  }, [fetchAttendanceCount, fetchLeaveCount]));

  useEffect(() => {
    if (!isAuthenticated || !isApprover) {
      const resetTimer = setTimeout(() => {
        setAttendancePendingCount(0);
        setLeavePendingCount(0);
        setLoading(false);
        setError(false);
      }, 0);
      return () => clearTimeout(resetTimer);
    }

    const initTimer = setTimeout(() => {
      void refreshCounts();
    }, 0);

    return () => {
      clearTimeout(initTimer);
    };
  }, [
    isAuthenticated,
    isApprover,
    refreshCounts,
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
};
