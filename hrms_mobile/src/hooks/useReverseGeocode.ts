import { useEffect, useState } from "react";
import { parseCoords, ResolvedLocation, reverseGeocode } from "../services/locationService";

export type GeocodeHookStatus = "missing" | "invalid" | "loading" | "resolved" | "unavailable";

export function useReverseGeocode(
  latitude: number | string | null | undefined,
  longitude: number | string | null | undefined
): { status: GeocodeHookStatus; location: ResolvedLocation | null } {
  const parsed = parseCoords(latitude, longitude);
  const validKey = parsed.status === "valid" ? parsed.key : null;

  const [resolvedState, setResolvedState] = useState<{
    key: string;
    status: "resolved" | "unavailable";
    location: ResolvedLocation | null;
  } | null>(null);

  useEffect(() => {
    if (parsed.status !== "valid") return;
    let active = true;

    reverseGeocode(parsed.lat, parsed.lng).then((res) => {
      if (!active) return;
      if (res.status === "resolved" && res.data?.formatted_address) {
        setResolvedState({ key: parsed.key, status: "resolved", location: res.data });
      } else {
        setResolvedState({ key: parsed.key, status: "unavailable", location: res.data || null });
      }
    });

    return () => {
      active = false;
    };
  }, [validKey, parsed.status === "valid" ? parsed.lat : null, parsed.status === "valid" ? parsed.lng : null]);

  if (parsed.status === "missing") return { status: "missing", location: null };
  if (parsed.status === "invalid") return { status: "invalid", location: null };
  if (resolvedState && resolvedState.key === parsed.key) {
    return { status: resolvedState.status, location: resolvedState.location };
  }
  return { status: "loading", location: null };
}
