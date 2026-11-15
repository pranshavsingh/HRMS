import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { 
  Clock3, 
  FileText, 
  CheckCircle2, 
  CalendarDays, 
  AlertCircle, 
  Users 
} from "lucide-react-native";

interface CardProps {
  title: string;
  value: string;
  info?: string;
  icon: "Clock3" | "FileText" | "CheckCircle2" | "CalendarDays" | "AlertCircle" | "Users";
  tone: "cyan" | "emerald" | "amber" | "violet" | "rose";
}

const iconMap = {
  Clock3,
  FileText,
  CheckCircle2,
  CalendarDays,
  AlertCircle,
  Users,
};

export default function Card({ title, value, info, icon, tone }: CardProps) {
  const IconComponent = iconMap[icon] || FileText;

  const toneStyles = {
    cyan: { bg: "#083344", border: "#0e749030", iconColor: "#22d3ee", text: "#e0f7fa" },
    emerald: { bg: "#064e3b", border: "#04785730", iconColor: "#34d399", text: "#e8f5e9" },
    amber: { bg: "#78350f", border: "#b4530930", iconColor: "#fbbf24", text: "#fff8e1" },
    violet: { bg: "#2e1065", border: "#6d28d930", iconColor: "#c084fc", text: "#f3e5f5" },
    rose: { bg: "#7f1d1d", border: "#be123c30", iconColor: "#f87171", text: "#ffebee" },
  };

  const style = toneStyles[tone] || toneStyles.cyan;

  return (
    <View style={[styles.card, { backgroundColor: style.bg, borderColor: style.border }]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{title}</Text>
        <IconComponent size={18} color={style.iconColor} />
      </View>
      <Text style={[styles.cardValue, { color: style.text }]}>{value}</Text>
      {info && <Text style={styles.cardInfo}>{info}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "48%",
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  cardTitle: {
    color: "#94a3b8",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cardValue: {
    fontSize: 20,
    fontWeight: "800",
    marginTop: 4,
  },
  cardInfo: {
    color: "#64748b",
    fontSize: 10,
    marginTop: 4,
  },
});
