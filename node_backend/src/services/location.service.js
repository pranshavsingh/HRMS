import { db } from "../db/index.js";
import { config } from "../config/env.js";
import redisService from "./redis.service.js";
import logger from "../utils/logger.js";
import { AppError } from "../middleware/errorHandler.js";
import { encodePlusCode, getShortPlusCode, formatPlusCodeLocation } from "../utils/plusCode.js";

const MEM_CACHE_MAX = 2000;
const MEM_CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours in-process
const memCache = new Map();
const inflightRequests = new Map();

let lastExternalRequestAt = 0;
let throttleChain = Promise.resolve();

function setMemCache(key, value) {
  if (memCache.size >= MEM_CACHE_MAX) {
    const firstKey = memCache.keys().next().value;
    if (firstKey !== undefined) memCache.delete(firstKey);
  }
  memCache.set(key, { value, expiresAt: Date.now() + MEM_CACHE_TTL_MS });
}

function getMemCache(key) {
  const entry = memCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    memCache.delete(key);
    return null;
  }
  return entry.value;
}

export function validateAndNormalizeCoords(rawLat, rawLng) {
  if (rawLat === null || rawLat === undefined || rawLat === "" || rawLng === null || rawLng === undefined || rawLng === "") {
    return { valid: false, reason: "missing" };
  }
  const lat = Number(rawLat);
  const lng = Number(rawLng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { valid: false, reason: "invalid" };
  }
  const latKey = Number(lat.toFixed(4));
  const lngKey = Number(lng.toFixed(4));
  const cacheKey = `${latKey.toFixed(4)},${lngKey.toFixed(4)}`;
  return { valid: true, lat, lng, latKey, lngKey, cacheKey };
}

function buildShortName({ subLocality, locality, city, district, state, formattedAddress }) {
  const parts = [];
  for (const candidate of [subLocality, locality, city, district]) {
    if (candidate && !parts.some((p) => p.toLowerCase() === candidate.toLowerCase())) {
      parts.push(candidate);
    }
    if (parts.length >= 3) break;
  }
  if (parts.length === 0 && state) parts.push(state);
  if (parts.length > 0) return parts.join(", ");
  return formattedAddress || null;
}

function cleanField(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s || null;
}

function extractMetroCity(municipality) {
  if (!municipality) return null;
  const match = String(municipality).trim().match(/^Greater\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export function normalizeGeoapifyAddress(props = {}, lat = null, lng = null) {
  const subLocality = cleanField(props.suburb || props.neighbourhood || props.quarter || props.district);
  const county = cleanField(props.county);
  const locality = cleanField(props.city_district || props.town || props.village || props.hamlet || county || subLocality);
  const city = cleanField(props.city || props.town || props.village || props.municipality);
  const municipality = cleanField(props.municipality);
  const metropolitanArea = municipality && /^Greater\s+/i.test(municipality) ? municipality : null;
  const metroCity = extractMetroCity(metropolitanArea);
  const isRural = Boolean(props.village || props.hamlet);
  const displayCity =
    !subLocality && !isRural && metroCity && locality && county && locality === county
      ? metroCity
      : city;
  const district = cleanField(props.state_district || props.county);
  const state = cleanField(props.state);
  const country = cleanField(props.country);
  const postalCode = cleanField(props.postcode);
  const formattedAddress = cleanField(props.formatted);
  const shortName = buildShortName({ subLocality, locality, city: displayCity, district, state, formattedAddress });

  return {
    latitude: lat,
    longitude: lng,
    formatted_address: formattedAddress || shortName,
    short_name: shortName || formattedAddress,
    locality,
    sub_locality: subLocality,
    municipality,
    metropolitan_area: metropolitanArea,
    city,
    display_city: displayCity,
    district,
    state,
    country,
    postal_code: postalCode,
    provider: "geoapify_v3",
  };
}

export function normalizeNominatimAddress(addr = {}, displayName = null, lat = null, lng = null) {
  const subLocality = cleanField(
    addr.suburb || addr.neighbourhood || addr.quarter || addr.residential || addr.road
  );
  const county = cleanField(addr.county);
  // In Indian OSM records, sub-districts/blocks (e.g. "Rajarhat") live in county or city_district/town/village
  const locality = cleanField(
    addr.city_district || addr.town || addr.village || addr.hamlet || county || subLocality
  );
  const municipality = cleanField(addr.municipality);
  const metropolitanArea = municipality && /^Greater\s+/i.test(municipality) ? municipality : null;
  const metroCity = extractMetroCity(metropolitanArea);
  const city = cleanField(addr.city || addr.town || addr.village || municipality);
  const isRural = Boolean(addr.village || addr.hamlet);
  // When a suburban sub-district (county) sits inside a "Greater <Metro>" area without a finer urban suburb,
  // normalize the display city to the metro core city while preserving original city & municipality fields.
  const displayCity =
    !subLocality && !isRural && metroCity && locality && county && locality === county
      ? metroCity
      : city;
  const district = cleanField(addr.state_district || county);
  const state = cleanField(addr.state);
  const country = cleanField(addr.country);
  const postalCode = cleanField(addr.postcode);
  const formattedAddress = cleanField(displayName);
  const shortName = buildShortName({ subLocality, locality, city: displayCity, district, state, formattedAddress });

  return {
    latitude: lat,
    longitude: lng,
    formatted_address: formattedAddress || shortName,
    short_name: shortName || formattedAddress,
    locality,
    sub_locality: subLocality,
    municipality,
    metropolitan_area: metropolitanArea,
    city,
    display_city: displayCity,
    district,
    state,
    country,
    postal_code: postalCode,
    provider: "nominatim_v3",
  };
}

function scheduleThrottled(fn, minIntervalMs = 1100) {
  const run = async () => {
    const elapsed = Date.now() - lastExternalRequestAt;
    if (elapsed < minIntervalMs) {
      await new Promise((r) => setTimeout(r, minIntervalMs - elapsed));
    }
    lastExternalRequestAt = Date.now();
    return fn();
  };
  const next = throttleChain.then(run, run);
  throttleChain = next.catch(() => {});
  return next;
}

async function fetchFromGeoapify(lat, lng) {
  const apiKey = config.geoapifyApiKey;
  if (!apiKey) return null;

  const url = `https://api.geoapify.com/v1/geocode/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&apiKey=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) {
    throw new Error(`Geoapify HTTP ${res.status}`);
  }
  const data = await res.json();
  const feature = Array.isArray(data?.features) ? data.features[0] : null;
  if (!feature?.properties) {
    return { notFound: true };
  }
  return normalizeGeoapifyAddress(feature.properties, lat, lng);
}

async function fetchFromNominatim(lat, lng) {
  return scheduleThrottled(async () => {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&addressdetails=1`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "HRMS-Enterprise-Geocoder/1.0",
        "Accept-Language": "en",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      throw new Error(`Nominatim HTTP ${res.status}`);
    }
    const data = await res.json();
    if (!data || data.error || !data.display_name) {
      return { notFound: true };
    }
    return normalizeNominatimAddress(data.address || {}, data.display_name, lat, lng);
  }, 1100);
}

async function fetchFromProvider(lat, lng) {
  const preferred = String(config.geocodingProvider || "auto").toLowerCase();
  if (preferred !== "nominatim" && config.geoapifyApiKey) {
    try {
      const g = await fetchFromGeoapify(lat, lng);
      if (g && !g.notFound) return g;
      if (g?.notFound && preferred === "geoapify") return null;
    } catch (err) {
      logger.warn("[Location] Geoapify reverse geocode failed, falling back to Nominatim: %s", err.message);
    }
  }
  if (preferred !== "geoapify") {
    const n = await fetchFromNominatim(lat, lng);
    if (n && !n.notFound) return n;
  }
  return null;
}

function enrichWithPlusCode(payload, lat, lng) {
  const plus_code = encodePlusCode(lat, lng, 11);
  const short_plus_code = getShortPlusCode(lat, lng);
  const display_label = formatPlusCodeLocation({
    latitude: lat,
    longitude: lng,
    locality: payload?.locality,
    sub_locality: payload?.sub_locality,
    city: payload?.city,
    display_city: payload?.display_city,
    district: payload?.district,
    state: payload?.state,
  });
  return {
    ...payload,
    latitude: lat,
    longitude: lng,
    plus_code,
    short_plus_code,
    display_label,
  };
}

function rowToLocationPayload(row, lat, lng, cached = true) {
  const shortParts = String(row.short_name || "").split(",").map((s) => s.trim()).filter(Boolean);
  const inferredDisplayCity =
    !row.sub_locality && shortParts.length >= 2 && shortParts[0] === row.locality
      ? shortParts[1]
      : row.city || null;
  return enrichWithPlusCode({
    formatted_address: row.formatted_address,
    short_name: row.short_name || row.formatted_address,
    locality: row.locality || null,
    sub_locality: row.sub_locality || null,
    city: row.city || null,
    display_city: inferredDisplayCity,
    district: row.district || null,
    state: row.state || null,
    country: row.country || null,
    postal_code: row.postal_code || null,
    provider: row.provider || "cache",
    cached,
    resolved_at: row.resolved_at || new Date().toISOString(),
  }, lat, lng);
}

export const locationService = {
  validateAndNormalizeCoords,

  async reverseGeocode(rawLat, rawLng, { forceRefresh = false } = {}) {
    const norm = validateAndNormalizeCoords(rawLat, rawLng);
    if (!norm.valid) {
      throw new AppError(
        norm.reason === "missing"
          ? "Latitude and longitude are required"
          : "Invalid GPS coordinates. Latitude must be between -90 and 90 and longitude between -180 and 180.",
        400
      );
    }

    const { lat, lng, latKey, lngKey, cacheKey } = norm;

    // 1. In-memory cache
    if (!forceRefresh) {
      const memHit = getMemCache(cacheKey);
      if (memHit) {
        return enrichWithPlusCode({ ...memHit, cached: true }, lat, lng);
      }

      // 2. Redis cache (v3)
      try {
        const redisHit = await redisService.get(`geo:v3:${cacheKey}`);
        if (redisHit) {
          const parsed = typeof redisHit === "string" ? JSON.parse(redisHit) : redisHit;
          if (parsed?.formatted_address) {
            const enriched = enrichWithPlusCode({ ...parsed, cached: true }, lat, lng);
            setMemCache(cacheKey, enriched);
            return enriched;
          }
        }
      } catch {}
    }

    // 3. Deduplicate concurrent in-flight lookups for identical normalized coordinates
    if (inflightRequests.has(cacheKey)) {
      const shared = await inflightRequests.get(cacheKey);
      return { ...shared, latitude: lat, longitude: lng };
    }

    const lookupPromise = (async () => {
      let staleFallback = null;

      // 4. MySQL centralized location_cache (invalidate pre-v3 normalized entries automatically)
      if (!forceRefresh) {
        try {
          const dbRow = await db.get(
            `SELECT *, (expires_at > NOW()) AS is_fresh
             FROM location_cache
             WHERE lat_key = ? AND lng_key = ?
             LIMIT 1`,
            [latKey, lngKey]
          );
          if (dbRow) {
            const payload = rowToLocationPayload(dbRow, lat, lng, true);
            const isCurrentVersion = String(dbRow.provider || "").endsWith("_v3");
            if (Number(dbRow.is_fresh) === 1 && isCurrentVersion) {
              setMemCache(cacheKey, payload);
              void redisService.set(`geo:v3:${cacheKey}`, JSON.stringify(payload), 86400 * 7).catch(() => {});
              return payload;
            }
            staleFallback = payload;
          }
        } catch (err) {
          logger.warn("[Location] DB cache lookup failed: %s", err.message);
        }
      }

      // 5. External Geocoding Provider
      let resolved = null;
      try {
        resolved = await fetchFromProvider(lat, lng);
      } catch (err) {
        logger.warn("[Location] External provider lookup failed for %s: %s", cacheKey, err.message);
      }

      if (resolved && resolved.formatted_address) {
        const cacheDays = Math.max(1, Number(config.geocodingCacheDays || 30));
        const payload = enrichWithPlusCode({
          ...resolved,
          cached: false,
          resolved_at: new Date().toISOString(),
        }, lat, lng);

        // Persist to MySQL, Redis & Memory
        try {
          await db.run(
            `INSERT INTO location_cache
               (lat_key, lng_key, original_lat, original_lng, formatted_address, short_name,
                locality, sub_locality, city, district, state, country, postal_code, provider, resolved_at, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? DAY))
             ON DUPLICATE KEY UPDATE
               formatted_address = VALUES(formatted_address),
               short_name = VALUES(short_name),
               locality = VALUES(locality),
               sub_locality = VALUES(sub_locality),
               city = VALUES(city),
               district = VALUES(district),
               state = VALUES(state),
               country = VALUES(country),
               postal_code = VALUES(postal_code),
               provider = VALUES(provider),
               resolved_at = NOW(),
               expires_at = DATE_ADD(NOW(), INTERVAL ? DAY)`,
            [
              latKey,
              lngKey,
              lat,
              lng,
              payload.formatted_address.slice(0, 512),
              (payload.short_name || payload.formatted_address).slice(0, 255),
              payload.locality ? payload.locality.slice(0, 160) : null,
              payload.sub_locality ? payload.sub_locality.slice(0, 160) : null,
              payload.city ? payload.city.slice(0, 160) : null,
              payload.district ? payload.district.slice(0, 160) : null,
              payload.state ? payload.state.slice(0, 160) : null,
              payload.country ? payload.country.slice(0, 160) : null,
              payload.postal_code ? payload.postal_code.slice(0, 32) : null,
              payload.provider,
              cacheDays,
              cacheDays,
            ]
          );
        } catch (dbErr) {
          logger.warn("[Location] Failed to persist location_cache: %s", dbErr.message);
        }

        setMemCache(cacheKey, payload);
        void redisService.set(`geo:v3:${cacheKey}`, JSON.stringify(payload), 86400 * 7).catch(() => {});
        return payload;
      }

      // 6. Stale cache fallback when provider unavailable
      if (staleFallback) {
        return { ...staleFallback, stale: true, cached: true };
      }

      // 7. Graceful unavailable response (never crashes attendance flows)
      return {
        latitude: lat,
        longitude: lng,
        formatted_address: null,
        short_name: null,
        locality: null,
        sub_locality: null,
        city: null,
        district: null,
        state: null,
        country: null,
        postal_code: null,
        provider: null,
        cached: false,
        unavailable: true,
      };
    })();

    inflightRequests.set(cacheKey, lookupPromise);
    try {
      return await lookupPromise;
    } finally {
      inflightRequests.delete(cacheKey);
    }
  },

  async reverseGeocodeBatch(coordinates = []) {
    if (!Array.isArray(coordinates)) {
      throw new AppError("coordinates array is required", 400);
    }
    const items = coordinates.slice(0, 25);
    const results = [];
    for (const item of items) {
      const norm = validateAndNormalizeCoords(item?.lat ?? item?.latitude, item?.lng ?? item?.longitude);
      if (!norm.valid) {
        results.push({
          latitude: item?.lat ?? item?.latitude ?? null,
          longitude: item?.lng ?? item?.longitude ?? null,
          invalid: true,
          formatted_address: null,
        });
        continue;
      }
      try {
        const resolved = await this.reverseGeocode(norm.lat, norm.lng);
        results.push(resolved);
      } catch {
        results.push({
          latitude: norm.lat,
          longitude: norm.lng,
          unavailable: true,
          formatted_address: null,
        });
      }
    }
    return results;
  },
};

export default locationService;
