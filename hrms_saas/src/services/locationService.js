import API from "../api/axios";

const clientCache = new Map();
const inflightMap = new Map();

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

export function encodePlusCode(rawLat, rawLng, codeLength = 11) {
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

  const pairChars = [];
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

export function formatLocationOneLine(location, lat, lng) {
  if (location?.display_label) {
    return location.display_label;
  }
  const fullPlusCode = location?.plus_code || encodePlusCode(lat, lng, 11);
  const shortPlusCode = location?.short_plus_code || (fullPlusCode ? fullPlusCode.slice(4) : null);
  if (!fullPlusCode) return null;

  const loc = location?.sub_locality || location?.locality || location?.district || null;
  const parts = [];
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

export function parseCoords(rawLat, rawLng) {
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

export function getGoogleMapsUrl(lat, lng) {
  return `https://www.google.com/maps?q=${encodeURIComponent(lat)},${encodeURIComponent(lng)}`;
}

export async function reverseGeocode(rawLat, rawLng) {
  const parsed = parseCoords(rawLat, rawLng);
  if (parsed.status !== "valid") {
    return { status: parsed.status, data: null };
  }

  const { lat, lng, key } = parsed;

  if (clientCache.has(key)) {
    return { status: "resolved", data: clientCache.get(key) };
  }

  if (inflightMap.has(key)) {
    return inflightMap.get(key);
  }

  const promise = (async () => {
    try {
      const res = await API.get("/location/reverse-geocode", {
        params: { lat, lng },
      });
      const payload = res.data?.data || res.data;
      if (payload && (payload.formatted_address || payload.display_label)) {
        clientCache.set(key, payload);
        return { status: "resolved", data: payload };
      }
      return { status: "unavailable", data: payload || null };
    } catch {
      return { status: "unavailable", data: null };
    } finally {
      inflightMap.delete(key);
    }
  })();

  inflightMap.set(key, promise);
  return promise;
}

/**
 * Watch-based GPS convergence for Web browsers.
 * Collects fresh readings for up to `timeoutMs`, selects the lowest-accuracy reading,
 * and stops early once `accuracy <= targetAccuracy`.
 */
export function acquireBestGpsPosition({
  targetAccuracy = 25,
  timeoutMs = 7000,
  onSample = null,
} = {}) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      const err = new Error("Geolocation is not supported by your browser.");
      err.code = 2;
      return reject(err);
    }

    let watchId = null;
    let timerId = null;
    let settled = false;
    let bestSample = null;
    let lastError = null;

    const cleanup = () => {
      if (watchId !== null) {
        try {
          navigator.geolocation.clearWatch(watchId);
        } catch (clearErr) {
          console.warn("[locationService] clearWatch failed:", clearErr?.message || clearErr);
        }
        watchId = null;
      }
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
    };

    const normalizeGeoError = (geoError) => {
      let message = "Unable to retrieve location.";
      if (geoError?.code === 1) {
        message = "Location permission denied. Please allow location access in your browser settings to punch attendance.";
      } else if (geoError?.code === 2) {
        message = "Location unavailable. Please ensure GPS or device location services are turned on.";
      } else if (geoError?.code === 3) {
        message = "Location request timed out. Please check your signal and try again.";
      }
      const err = new Error(message);
      err.code = geoError?.code ?? 2;
      err.originalError = geoError;
      return err;
    };

    const finishSuccess = (sample) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(sample);
    };

    const finishError = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    timerId = setTimeout(() => {
      if (bestSample) {
        finishSuccess(bestSample);
      } else if (lastError) {
        finishError(normalizeGeoError(lastError));
      } else {
        finishError(normalizeGeoError({ code: 3 }));
      }
    }, timeoutMs);

    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const sample = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          altitude: pos.coords.altitude,
          accuracy: pos.coords.accuracy,
          timestamp: pos.timestamp || Date.now(),
          provider: "web_geolocation",
        };
        if (
          !bestSample ||
          (sample.accuracy != null &&
            (bestSample.accuracy == null || sample.accuracy < bestSample.accuracy))
        ) {
          bestSample = sample;
          if (typeof onSample === "function") {
            try {
              onSample(bestSample);
            } catch (callbackErr) {
              console.warn("[locationService] onSample callback failed:", callbackErr?.message || callbackErr);
            }
          }
        }
        if (sample.accuracy != null && sample.accuracy <= targetAccuracy) {
          finishSuccess(bestSample);
        }
      },
      (geoError) => {
        lastError = geoError;
        if (geoError?.code === 1) {
          finishError(normalizeGeoError(geoError));
        }
      },
      {
        enableHighAccuracy: true,
        timeout: timeoutMs,
        maximumAge: 0,
      }
    );
  });
}
