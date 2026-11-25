import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import API from "../api/axios";
import { useAuth } from "./AuthContext";
import { useRealtime } from "./RealtimeContext";

const SiteContext = createContext(null);

export function SiteProvider({ children }) {
  const { user, role, isAuthenticated } = useAuth();
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState(() => localStorage.getItem("hrms.siteId") || "all");
  const [loadingSites, setLoadingSites] = useState(false);
  const refreshSites = useCallback(async () => {
    if (!isAuthenticated || !["admin", "superadmin", "hr", "manager"].includes(role)) { setSites([]); return; }
    setLoadingSites(true);
    try {
      const response = await API.get("/workforce/sites/", { params: { include_inactive: ["admin", "superadmin"].includes(role) ? "true" : undefined } });
      setSites(response.data.sites || []);
    } catch { setSites([]); }
    finally { setLoadingSites(false); }
  }, [isAuthenticated, role]);

  useEffect(() => { refreshSites(); }, [refreshSites, user?.id]);

  useRealtime("site:updated", () => { refreshSites(); });
  useRealtime("realtime:connected", () => { refreshSites(); });
  useEffect(() => {
    if (siteId !== "all" && siteId !== "unassigned" && sites.length && !sites.some((site) => site.is_active && String(site.id) === String(siteId))) {
      const inactiveSite = sites.find((s) => String(s.id) === String(siteId));
      const siteName = inactiveSite ? inactiveSite.name : `ID #${siteId}`;
      console.warn(`[SiteContext] Selected site "${siteName}" is no longer active. Resetting filter to "all".`);
      setSiteId("all");
      window.dispatchEvent(new CustomEvent("site-inactive-reset", { detail: { siteName } }));
    }
  }, [siteId, sites]);
  useEffect(() => { localStorage.setItem("hrms.siteId", siteId); }, [siteId]);

  const querySiteId = siteId === "all" ? undefined : siteId;
  const value = useMemo(() => ({ sites, siteId, setSiteId, querySiteId, loadingSites, refreshSites }), [sites, siteId, querySiteId, loadingSites, refreshSites]);
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSite() {
  const context = useContext(SiteContext);
  if (!context) throw new Error("useSite must be used within SiteProvider");
  return context;
}
