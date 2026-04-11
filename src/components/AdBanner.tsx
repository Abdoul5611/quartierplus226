import React from "react";
import { View, Text, StyleSheet } from "react-native";

export default function AdBanner() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Publicité bientôt disponible</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    backgroundColor: "#f8f9fa",
    borderTopWidth: 1,
    borderTopColor: "#E9ECEF",
    paddingVertical: 8,
  },
  text: {
    fontSize: 12,
    color: "#adb5bd",
    fontStyle: "italic",
  },
});
