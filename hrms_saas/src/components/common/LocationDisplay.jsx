import { useReverseGeocode } from "../../hooks/useReverseGeocode";
import { encodePlusCode, formatLocationOneLine, getGoogleMapsUrl, parseCoords } from "../../services/locationService";

export default function LocationDisplay({
  latitude,
  longitude,
  prefix = "",
  suffix = "",
  showMapLink = true,
  className = "",
}) {
  const { status, location } = useReverseGeocode(latitude, longitude);
  const parsed = parseCoords(latitude, longitude);

  if (status === "missing") {
    return (
      <span className={`block truncate text-xs text-slate-400 ${className}`}>
        Location not recorded
      </span>
    );
  }

  if (status === "invalid") {
    return (
      <span className={`block truncate text-xs text-rose-500 ${className}`}>
        Invalid location
      </span>
    );
  }

  const mapsUrl = parsed.status === "valid" ? getGoogleMapsUrl(parsed.lat, parsed.lng) : null;
  const fallbackCoords =
    parsed.status === "valid" ? `${parsed.lat.toFixed(4)}, ${parsed.lng.toFixed(4)}` : "";

  if (status === "loading") {
    return (
      <span className={`block truncate text-xs text-slate-500 ${className}`}>
        Resolving location...
      </span>
    );
  }

  const formattedOneLine =
    parsed.status === "valid"
      ? status === "resolved" && location
        ? formatLocationOneLine(location, parsed.lat, parsed.lng)
        : encodePlusCode(parsed.lat, parsed.lng, 11) || "Location unavailable"
      : "Location unavailable";

  const fullTitle =
    location?.formatted_address
      ? `${formattedOneLine} — ${location.formatted_address} (${fallbackCoords})`
      : `${formattedOneLine} (${fallbackCoords})`;

  const textNode = (
    <span className="truncate">
      {prefix ? `${prefix} ` : ""}
      {formattedOneLine}
      {suffix ? ` ${suffix}` : ""}
    </span>
  );

  if (showMapLink && mapsUrl) {
    return (
      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={fullTitle}
        className={`block max-w-full truncate text-xs font-medium text-slate-700 hover:text-slate-900 hover:underline ${className}`}
      >
        {textNode}
      </a>
    );
  }

  return (
    <span
      title={fullTitle}
      className={`block max-w-full truncate text-xs font-medium text-slate-700 ${className}`}
    >
      {textNode}
    </span>
  );
}
