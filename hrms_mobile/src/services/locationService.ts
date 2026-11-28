import * as Location from "expo-location";
import api from "./api";

export interface GpsSample {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: number;
  provider: string;
}

export interface ResolvedLocation {
  latitude: number;
  longitude: number;
  plus_code?: string | null;
  short_plus_code?: string | null;
  display_label?: string | null;
  formatted_address: string | null;
  short_name: string | null;
  locality?: string | null;
  sub_locality?: string | null;
  city?: string | null;
  district?: string | null;
  state?: string | null;
  country?: string | null;
  postal_code?: string | null;
  provider?: string | null;
  cached?: boolean;
  unavailable?: boolean;
}

export type CoordsParseResult =
  | { status: "missing" }
  | { status: "invalid" }
  | { status: "valid"; lat: number; lng: number; key: string };

const clientCache = new Map<string, ResolvedLocation>();
const inflightMap = new Map<string, Promise<{ status: "resolved" | "unavailable"; data: ResolvedLocation | null }>>();

const CODE_ALPHABET = "23456789CFGHJMPQRVWX";
const ENCODING_BASE = 20;
const LATITUDE_MAX = 90;
const LONGITUDE_MAX = 180;
const PAIR_CODE_LENGTH = 10;
const PAIR_RESOLUTIONS = [20.0, 1.0, 0.05, 0.0025, 0.000125];
const GRID_COLUMNS = 4;
const GRID_ROWS = 5;
const SEPARATOR = "+";
const SEPARATOR_POSITION = 8;

export function encodePlusCode(
  rawLat: number | string | null | undefined,
  rawLng: number | string | null | undefined,
  codeLength = 11
): string | null {
  const latNum = Number(rawLat);
  const lngNum = Number(rawLng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return null;

  let lat = Math.min(LATITUDE_MAX, Math.max(-LATITUDE_MAX, latNum));
  let lng = lngNum;
  while (lng < -LONGITUDE_MAX) lng += 360;
  while (lng >= LONGITUDE_MAX) lng -= 360;
  if (lat === LATITUDE_MAX) {
    lat -= PAIR_RESOLUTIONS[PAIR_RESOLUTIONS.length - 1];
  }

  let latVal = Math.floor((lat + LATITUDE_MAX) * 8000 * 5);
  let lngVal = Math.floor((lng + LONGITUDE_MAX) * 8000 * 4);

  const gridLatDigit = latVal % GRID_ROWS;
  const gridLngDigit = lngVal % GRID_COLUMNS;
  latVal = Math.floor(latVal / GRID_ROWS);
  lngVal = Math.floor(lngVal / GRID_COLUMNS);

  const pairChars: string[] = [];
  for (let i = 0; i < PAIR_CODE_LENGTH / 2; i++) {
    const latDigit = latVal % ENCODING_BASE;
    const lngDigit = lngVal % ENCODING_BASE;
    latVal = Math.floor(latVal / ENCODING_BASE);
    lngVal = Math.floor(lngVal / ENCODING_BASE);
    pairChars.unshift(CODE_ALPHABET[latDigit] + CODE_ALPHABET[lngDigit]);
  }

  const tenChar = pairChars.join("");
  let code = tenChar.slice(0, SEPARATOR_POSITION) + SEPARATOR + tenChar.slice(SEPARATOR_POSITION);
  if (codeLength >= 11) {
    code += CODE_ALPHABET[gridLatDigit * GRID_COLUMNS + gridLngDigit];
  }
  return code;
}

export function formatLocationOneLine(
  location: ResolvedLocation | null,
  lat: number,
  lng: number
): string | null {
  if (location?.display_label) {
    return location.display_label;
  }
  const fullPlusCode = location?.plus_code || encodePlusCode(lat, lng, 11);
  const shortPlusCode = location?.short_plus_code || (fullPlusCode ? fullPlusCode.slice(4) : null);
  if (!fullPlusCode) return null;

  const loc = location?.sub_locality || location?.locality || location?.district || null;
  const parts: string[] = [];
  for (const candidate of [loc, location?.city, location?.state]) {
    const trimmed = candidate ? String(candidate).trim() : "";
    if (trimmed && !parts.some((p) => p.toLowerCase() === trimmed.toLowerCase())) {
      parts.push(trimmed);
    }
  }

  if (parts.length === 0) {
    return fullPlusCode;
  }

  return `${shortPlusCode} ${parts.join(", ")}`;
}

export function parseCoords(rawLat: number | string | null | undefined, rawLng: number | string | null | undefined): CoordsParseResult {
  if (rawLat === null || rawLat === undefined || rawLat === "" || rawLng === null || rawLng === undefined || rawLng === "") {
    return { status: "missing" };
  }
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { status: "invalid" };
  }
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  return { status: "valid", lat, lng, key };
}

export function getGoogleMapsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(lat)},${encodeURIComponent(lng)}`;
}

export async function reverseGeocode(
  rawLat: number | string | null | undefined,
  rawLng: number | string | null | undefined
): Promise<{ status: "missing" | "invalid" | "resolved" | "unavailable"; data: ResolvedLocation | null }> {
  const parsed = parseCoords(rawLat, rawLng);
  if (parsed.status !== "valid") {
    return { status: parsed.status, data: null };
  }

  const { lat, lng, key } = parsed;

  const cached = clientCache.get(key);
  if (cached) {
    return { status: "resolved", data: cached };
  }

  const inflight = inflightMap.get(key);
  if (inflight) {
    return inflight;
  }

  const promise = (async () => {
    try {
      const res = await api.get("/location/reverse-geocode", {
        params: { lat, lng },
      });
      const payload: ResolvedLocation | null = res.data?.data || res.data || null;
      if (payload && (payload.formatted_address || payload.display_label)) {
        clientCache.set(key, payload);
        return { status: "resolved" as const, data: payload };
      }
      return { status: "unavailable" as const, data: payload };
    } catch {
      return { status: "unavailable" as const, data: null };
    } finally {
      inflightMap.delete(key);
    }
  })();

  inflightMap.set(key, promise);
  return promise;
}

/**
 * Watch-based GPS convergence for Expo Mobile.
 * Checks GPS services enabled, collects fresh readings via watchPositionAsync for up to `timeoutMs`,
 * selects the lowest-accuracy valid sample, and stops early when accuracy <= targetAccuracy.
 */
export async function acquireBestMobileGpsPosition(options: {
  targetAccuracy?: number;
  timeoutMs?: number;
  onSample?: (sample: GpsSample) => void;
  cancelToken?: { aborted: boolean };
} = {}): Promise<GpsSample> {
  const { targetAccuracy = 25, timeoutMs = 7000, onSample, cancelToken } = options;

  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) {
    throw new Error("Location services (GPS) are disabled. Please turn on GPS and try again.");
  }

  return new Promise<GpsSample>((resolve, reject) => {
    let subscription: Location.LocationSubscription | null = null;
    let timerId: ReturnType<typeof setTimeout> | null = null;
    let abortPollId: ReturnType<typeof setInterval> | null = null;
    let settled = false;
    let bestSample: GpsSample | null = null;

    const cleanup = () => {
      if (subscription) {
        try {
          subscription.remove();
        } catch {}
        subscription = null;
      }
      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }
      if (abortPollId) {
        clearInterval(abortPollId);
        abortPollId = null;
      }
    };

    const finishSuccess = (sample: GpsSample) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(sample);
    };

    const finishError = (err: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    if (cancelToken) {
      abortPollId = setInterval(() => {
        if (cancelToken.aborted) {
          finishError(new Error("Location acquisition cancelled."));
        }
      }, 200);
    }

    timerId = setTimeout(async () => {
      if (bestSample) {
        finishSuccess(bestSample);
        return;
      }
      try {
        const single = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        finishSuccess({
          latitude: single.coords.latitude,
          longitude: single.coords.longitude,
          accuracy: single.coords.accuracy ?? null,
          timestamp: single.timestamp || Date.now(),
          provider: "expo_location",
        });
      } catch (err: any) {
        finishError(new Error(err?.message || "Location request timed out. Please check GPS signal."));
      }
    }, timeoutMs);

    Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000,
        distanceInterval: 0,
      },
      (loc) => {
        if (settled || cancelToken?.aborted) return;
        const sample: GpsSample = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          accuracy: loc.coords.accuracy ?? null,
          timestamp: loc.timestamp || Date.now(),
          provider: "expo_location",
        };
        if (
          !bestSample ||
          (sample.accuracy != null &&
            (bestSample.accuracy == null || sample.accuracy < bestSample.accuracy))
        ) {
          bestSample = sample;
          if (onSample) {
            try {
              onSample(bestSample);
            } catch {}
          }
        }
        if (sample.accuracy != null && sample.accuracy <= targetAccuracy) {
          finishSuccess(bestSample);
        }
      }
    )
      .then((sub) => {
        if (settled || cancelToken?.aborted) {
          try {
            sub.remove();
          } catch {}
          return;
        }
        subscription = sub;
      })
      .catch((err) => {
        finishError(new Error(err?.message || "Failed to start GPS location watch."));
      });
  });
}
