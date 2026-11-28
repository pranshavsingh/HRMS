import React from "react";
import { Text, TouchableOpacity, StyleSheet, Linking } from "react-native";
import { useReverseGeocode } from "../hooks/useReverseGeocode";
import {
  encodePlusCode,
  formatLocationOneLine,
  getGoogleMapsUrl,
  parseCoords,
} from "../services/locationService";

interface LocationDisplayProps {
  latitude?: number | string | null;
  longitude?: number | string | null;
  prefix?: string;
  suffix?: string;
  compact?: boolean;
  dark?: boolean;
  showMapLink?: boolean;
  showSecondaryLine?: boolean;
  iconColor?: string;
}

export default function LocationDisplay({
  latitude,
  longitude,
  prefix = "",
  suffix = "",
  dark = false,
  showMapLink = true,
}: LocationDisplayProps) {
  const { status, location } = useReverseGeocode(latitude, longitude);
  const parsed = parseCoords(latitude, longitude);

  const textColor = dark ? "#F8FAFC" : "#152238";

  if (status === "missing") {
    return (
      <Text style={[styles.mutedText, dark && styles.darkMuted]} numberOfLines={1} ellipsizeMode="tail">
        Location not recorded
      </Text>
    );
  }

  if (status === "invalid") {
    return (
      <Text style={styles.errorText} numberOfLines={1} ellipsizeMode="tail">
        Invalid location
      </Text>
    );
  }

  if (status === "loading") {
    return (
      <Text style={[styles.mutedText, dark && styles.darkMuted]} numberOfLines={1} ellipsizeMode="tail">
        Resolving location...
      </Text>
    );
  }

  const oneLine =
    parsed.status === "valid"
      ? status === "resolved" && location
        ? formatLocationOneLine(location, parsed.lat, parsed.lng)
        : encodePlusCode(parsed.lat, parsed.lng, 11) || "Location unavailable"
      : "Location unavailable";

  const displayText = `${prefix ? `${prefix} ` : ""}${oneLine}${suffix ? ` ${suffix}` : ""}`;
  const mapsUrl = parsed.status === "valid" ? getGoogleMapsUrl(parsed.lat, parsed.lng) : null;

  const textEl = (
    <Text
      style={[styles.primaryText, { color: textColor }]}
      numberOfLines={1}
      ellipsizeMode="tail"
    >
      {displayText}
    </Text>
  );

  if (showMapLink && mapsUrl) {
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => {
          void Linking.openURL(mapsUrl);
        }}
        style={styles.touchable}
        accessibilityRole="link"
        accessibilityLabel={`Open location ${displayText} in Google Maps`}
      >
        {textEl}
      </TouchableOpacity>
    );
  }

  return textEl;
}

const styles = StyleSheet.create({
  touchable: {
    flexShrink: 1,
    maxWidth: "100%",
  },
  primaryText: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 17,
    flexShrink: 1,
  },
  mutedText: {
    fontSize: 12,
    color: "#64748B",
  },
  darkMuted: {
    color: "#CBD5E1",
  },
  errorText: {
    fontSize: 12,
    color: "#EF4444",
    fontWeight: "600",
  },
});
