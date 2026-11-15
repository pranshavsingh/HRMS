import React from "react";
import { StyleSheet, Text, View, Dimensions } from "react-native";

const { width, height } = Dimensions.get("window");

interface CameraViewOverlayProps {
  message?: string;
  status?: "loading" | "error" | "success" | "neutral";
}

export default function CameraViewOverlay({
  message = "Center your face within the oval",
  status = "neutral",
}: CameraViewOverlayProps) {
  const getBorderColor = () => {
    switch (status) {
      case "success":
        return "#10b981"; // Emerald Green
      case "error":
        return "#ef4444"; // Rose Red
      case "loading":
        return "#3b82f6"; // Sky Blue
      default:
        return "rgba(255, 255, 255, 0.45)"; // Slate/White dash fallback
    }
  };

  const getMessageBgColor = () => {
    switch (status) {
      case "success":
        return "rgba(16, 185, 129, 0.9)";
      case "error":
        return "rgba(239, 68, 68, 0.9)";
      case "loading":
        return "rgba(59, 130, 246, 0.9)";
      default:
        return "rgba(15, 23, 42, 0.85)";
    }
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Outer semi-transparent background mask */}
      <View style={styles.maskContainer}>
        {/* Top bar */}
        <View style={[styles.maskSegment, { height: (height - 300) / 2 }]} />

        {/* Middle row containing left-side mask, center cut-out, right-side mask */}
        <View style={styles.middleRow}>
          <View style={styles.sideMask} />
          {/* Oval alignment guide */}
          <View style={styles.ovalCutout}>
            <View
              style={[
                styles.ovalBorder,
                {
                  borderColor: getBorderColor(),
                  borderStyle: status === "success" ? "solid" : "dashed",
                },
              ]}
            />
          </View>
          <View style={styles.sideMask} />
        </View>

        {/* Bottom bar */}
        <View style={[styles.maskSegment, { flex: 1 }]}>
          <Text style={[styles.guideText, { backgroundColor: getMessageBgColor() }]}>
            {message}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  maskContainer: {
    flex: 1,
    backgroundColor: "transparent",
  },
  maskSegment: {
    width: "100%",
    backgroundColor: "rgba(15, 23, 42, 0.65)", // Slate dark overlay
    justifyContent: "center",
    alignItems: "center",
  },
  middleRow: {
    height: 300,
    width: "100%",
    flexDirection: "row",
  },
  sideMask: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.65)",
  },
  ovalCutout: {
    width: 250,
    height: 300,
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
  },
  ovalBorder: {
    width: 240,
    height: 290,
    borderWidth: 2.5,
    borderColor: "#10b981", // Emerald green color
    borderStyle: "dashed",
    borderRadius: 120, // Perfectly rounded oval
  },
  guideText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
    textAlign: "center",
    marginTop: 15,
    backgroundColor: "rgba(15, 23, 42, 0.8)",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    overflow: "hidden",
  },
});
