import React from "react";
import { View, Text, StyleSheet } from "react-native";

interface Props {
  todayViews: number;
  maxDaily: number;
  userUid: string;
  onPointsEarned: (newTotal: number) => void;
}

export default function RewardedVideoButton(_props: Props) {
  return (
    <View style={styles.btn}>
      <Text style={styles.btnIcon}>▶️</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.btnTitle}>Publicité bientôt disponible</Text>
        <Text style={styles.btnSub}>Les vidéos récompensées arrivent prochainement</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#E9ECEF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 4,
  },
  btnIcon: { fontSize: 28 },
  btnTitle: { fontSize: 14, fontWeight: "800", color: "#6C757D" },
  btnSub: { fontSize: 12, color: "#adb5bd", marginTop: 2 },
});
