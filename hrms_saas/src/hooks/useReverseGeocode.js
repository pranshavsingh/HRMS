import { useEffect, useState } from "react";
import { parseCoords, reverseGeocode } from "../services/locationService";

export function useReverseGeocode(latitude, longitude) {
  const parsed = parseCoords(latitude, longitude);
  const coordKey = parsed.status === "valid" ? `${parsed.lat},${parsed.lng}` : null;

  const [asyncState, setAsyncState] = useState({ key: null, status: "loading", location: null });

  useEffect(() => {
    if (!coordKey || parsed.status !== "valid") {
      return undefined;
    }
    let active = true;
    reverseGeocode(parsed.lat, parsed.lng).then((res) => {
      if (!active) return;
      if (res.status === "resolved" && res.data?.formatted_address) {
        setAsyncState({ key: coordKey, status: "resolved", location: res.data });
      } else {
        setAsyncState({ key: coordKey, status: "unavailable", location: res.data || null });
      }
    });
    return () => {
      active = false;
    };
  }, [coordKey, parsed.status, parsed.lat, parsed.lng]);

  if (parsed.status === "missing") return { status: "missing", location: null };
  if (parsed.status === "invalid") return { status: "invalid", location: null };
  if (asyncState.key !== coordKey) return { status: "loading", location: null };
  return { status: asyncState.status, location: asyncState.location };
}
