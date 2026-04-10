import React from "react";
// DÉSACTIVÉ pour le build de test - réactiver au build suivant
// import { useEffect, useRef, useState } from "react";
// import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from "react-native";
// import { RewardedAd, RewardedAdEventType, AdEventType, TestIds } from "react-native-google-mobile-ads";
// import { api } from "../services/api";

interface Props {
  todayViews: number;
  maxDaily: number;
  userUid: string;
  onPointsEarned: (newTotal: number) => void;
}

export default function RewardedVideoButton(_props: Props) {
  return null; // Pubs désactivées pour le build de test
}
