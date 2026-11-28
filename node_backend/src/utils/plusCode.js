/**
 * Open Location Code (Plus Code) encoder — pure mathematical specification.
 * Generates an 11-character full Plus Code (e.g. "7MJCJFP8+V6R") and a
 * 7-character local short Plus Code (e.g. "JFP8+V6R") from GPS coordinates.
 */
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

function clipLatitude(lat) {
  return Math.min(LATITUDE_MAX, Math.max(-LATITUDE_MAX, lat));
}

function normalizeLongitude(lng) {
  let n = lng;
  while (n < -LONGITUDE_MAX) n += 360;
  while (n >= LONGITUDE_MAX) n -= 360;
  return n;
}

export function encodePlusCode(rawLat, rawLng, codeLength = 11) {
  const latNum = Number(rawLat);
  const lngNum = Number(rawLng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return null;

  let lat = clipLatitude(latNum);
  const lng = normalizeLongitude(lngNum);
  if (lat === LATITUDE_MAX) {
    lat -= PAIR_RESOLUTIONS[PAIR_RESOLUTIONS.length - 1];
  }

  let latVal = Math.floor((lat + LATITUDE_MAX) * 8000 * 5); // precision for 11 digits
  let lngVal = Math.floor((lng + LONGITUDE_MAX) * 8000 * 4);

  let code = "";

  // Grid refinement (11th character)
  const gridLatDigit = latVal % GRID_ROWS;
  const gridLngDigit = lngVal % GRID_COLUMNS;
  latVal = Math.floor(latVal / GRID_ROWS);
  lngVal = Math.floor(lngVal / GRID_COLUMNS);

  // 5 pairs (10 characters)
  const pairChars = [];
  for (let i = 0; i < PAIR_CODE_LENGTH / 2; i++) {
    const latDigit = latVal % ENCODING_BASE;
    const lngDigit = lngVal % ENCODING_BASE;
    latVal = Math.floor(latVal / ENCODING_BASE);
    lngVal = Math.floor(lngVal / ENCODING_BASE);
    pairChars.unshift(CODE_ALPHABET[latDigit] + CODE_ALPHABET[lngDigit]);
  }

  const tenChar = pairChars.join("");
  code = tenChar.slice(0, SEPARATOR_POSITION) + SEPARATOR + tenChar.slice(SEPARATOR_POSITION);

  if (codeLength >= 11) {
    const gridIndex = gridLatDigit * GRID_COLUMNS + gridLngDigit;
    code += CODE_ALPHABET[gridIndex];
  }

  return code;
}

export function getShortPlusCode(rawLat, rawLng) {
  const full = encodePlusCode(rawLat, rawLng, 11);
  if (!full) return null;
  // Strip the 4-character regional prefix (e.g. "7MJCJFP8+V6R" -> "JFP8+V6R")
  return full.slice(4);
}

export function formatPlusCodeLocation({ latitude, longitude, locality, sub_locality, city, display_city, district, state }) {
  const fullPlusCode = encodePlusCode(latitude, longitude, 11);
  const shortPlusCode = getShortPlusCode(latitude, longitude);
  if (!fullPlusCode) return null;

  const loc = sub_locality || locality || district || null;
  const resolvedCity = display_city || city || null;
  const parts = [];
  for (const item of [loc, resolvedCity, state]) {
    const trimmed = item ? String(item).trim() : "";
    if (trimmed && !parts.some((p) => p.toLowerCase() === trimmed.toLowerCase())) {
      parts.push(trimmed);
    }
  }

  if (parts.length === 0) {
    // Without locality context, return full Plus Code so it is never ambiguous
    return fullPlusCode;
  }

  return `${shortPlusCode} ${parts.join(", ")}`;
}
