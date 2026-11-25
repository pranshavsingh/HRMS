import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Clock3, FileText, CheckCircle2, CalendarDays, AlertCircle, Users } from "lucide-react-native";

interface CardProps {
  title: string;
  value: string;
  info?: string;
  icon: "Clock3" | "FileText" | "CheckCircle2" | "CalendarDays" | "AlertCircle" | "Users" | string;
  tone: "cyan" | "emerald" | "amber" | "violet" | "rose";
  fullWidth?: boolean;
}

const iconMap: Record<string, any> = { Clock3, FileText, CheckCircle2, CalendarDays, AlertCircle, Users };

const toneStyles = {
  cyan: { bg: "#F4F8FF", border: "#DCE8FF", iconBg: "#E4EEFF", iconColor: "#2457D6", text: "#152238" },
  emerald: { bg: "#F1FBF7", border: "#D5F1E4", iconBg: "#DCF6E9", iconColor: "#11845B", text: "#152238" },
  amber: { bg: "#FFF9ED", border: "#F8E6BA", iconBg: "#FFF0CB", iconColor: "#A86500", text: "#152238" },
  violet: { bg: "#F7F4FF", border: "#E6DDFC", iconBg: "#EEE7FF", iconColor: "#6C43C8", text: "#152238" },
  rose: { bg: "#FFF5F5", border: "#F7DCDC", iconBg: "#FFE6E6", iconColor: "#C23838", text: "#152238" },
};

export default function Card({ title, value, info, icon, tone, fullWidth }: CardProps) {
  const IconComponent = iconMap[icon] || AlertCircle;
  const style = toneStyles[tone] || toneStyles.cyan;

  return (
    <View style={[styles.card, fullWidth && styles.cardFullWidth, { backgroundColor: style.bg, borderColor: style.border }]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{title}</Text>
        <View style={[styles.iconWrap, { backgroundColor: style.iconBg }]}>
          <IconComponent size={17} color={style.iconColor} strokeWidth={2.2} />
        </View>
      </View>
      <Text style={[styles.cardValue, { color: style.text }]}>{value}</Text>
      {info && <Text style={styles.cardInfo}>{info}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "48%",
    borderRadius: 18,
    padding: 15,
    marginBottom: 14,
    borderWidth: 1,
    shadowColor: "#243B64",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardFullWidth: {
    width: "100%",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    color: "#718096",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cardValue: {
    fontSize: 22,
    fontWeight: "700",
  },
  cardInfo: {
    color: "#718096",
    fontSize: 11,
    marginTop: 5,
  },
});
