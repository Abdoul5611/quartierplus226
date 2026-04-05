import React from "react";
import { View, Text, StyleSheet } from "react-native";

interface Props {
  todayViews: number;
  maxDaily: number;
  onPointsEarned: (newTotal: number) => void;
  userUid: string;
}

export default function RewardedVideoButton({ todayViews, maxDaily }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>📱 Les vidéos récompensées sont disponibles uniquement dans l'application mobile.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#E8F5E9",
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#A5D6A7",
  },
  text: {
    color: "#2E7D32",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 20,
  },
});
