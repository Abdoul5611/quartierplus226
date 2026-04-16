import React, { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { api } from "../services/api";

const COLORS = {
  primary: "#2E7D32",
  gold: "#F9A825",
  bg: "#E8F5E9",
  muted: "#6C757D",
  border: "#A5D6A7",
};

const VIDEO_DURATION = 5;

interface Props {
  todayViews: number;
  maxDaily: number;
  userUid: string;
  onPointsEarned: (newBalance: number) => void;
}

export default function RewardedVideoButton({ todayViews, maxDaily, userUid, onPointsEarned }: Props) {
  const [phase, setPhase] = useState<"idle" | "watching" | "loading" | "done" | "error">("idle");
  const [countdown, setCountdown] = useState(VIDEO_DURATION);
  const [earned, setEarned] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isDone = todayViews >= maxDaily;

  const handleWatch = () => {
    if (isDone || phase === "watching" || phase === "loading") return;
    setPhase("watching");
    setCountdown(VIDEO_DURATION);

    intervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          creditReward();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const creditReward = async () => {
    setPhase("loading");
    try {
      const result = await api.rewardVideoComplete(userUid);
      setEarned(result.fcfaEarned);
      onPointsEarned(result.newWalletBalance);
      setPhase("done");
      setTimeout(() => setPhase("idle"), 3000);
    } catch (e: any) {
      setErrorMsg(e.message || "Erreur serveur");
      setPhase("error");
      setTimeout(() => setPhase("idle"), 4000);
    }
  };

  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  if (isDone) {
    return (
      <View style={styles.doneBox}>
        <Text style={styles.doneIcon}>🎉</Text>
        <Text style={styles.doneText}>Quota journalier atteint ({maxDaily}/{maxDaily})</Text>
        <Text style={styles.doneSub}>Revenez demain pour gagner plus !</Text>
      </View>
    );
  }

  if (phase === "watching") {
    return (
      <View style={styles.watchingBox}>
        <Text style={styles.watchingIcon}>📺</Text>
        <Text style={styles.watchingTitle}>Publicité en cours…</Text>
        <View style={styles.countdownCircle}>
          <Text style={styles.countdownNum}>{countdown}</Text>
        </View>
        <Text style={styles.watchingSub}>Attendez la fin pour recevoir votre récompense</Text>
      </View>
    );
  }

  if (phase === "loading") {
    return (
      <View style={styles.watchingBox}>
        <ActivityIndicator color={COLORS.primary} size="large" />
        <Text style={styles.watchingSub}>Crédit en cours…</Text>
      </View>
    );
  }

  if (phase === "done") {
    return (
      <View style={[styles.watchingBox, { backgroundColor: "#E8F5E9", borderColor: COLORS.primary }]}>
        <Text style={styles.watchingIcon}>✅</Text>
        <Text style={[styles.watchingTitle, { color: COLORS.primary }]}>+{earned} FCFA crédité !</Text>
        <Text style={styles.watchingSub}>Ajouté directement à votre portefeuille</Text>
      </View>
    );
  }

  if (phase === "error") {
    return (
      <View style={[styles.watchingBox, { backgroundColor: "#FFEBEE", borderColor: "#EF9A9A" }]}>
        <Text style={styles.watchingIcon}>⚠️</Text>
        <Text style={[styles.watchingTitle, { color: "#C62828" }]}>Erreur</Text>
        <Text style={[styles.watchingSub, { color: "#B71C1C" }]}>{errorMsg}</Text>
      </View>
    );
  }

  return (
    <TouchableOpacity style={styles.btn} onPress={handleWatch} activeOpacity={0.82}>
      <Text style={styles.btnIcon}>▶️</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.btnTitle}>Regarder une pub (+2 FCFA)</Text>
        <Text style={styles.btnSub}>{todayViews}/{maxDaily} vidéos aujourd'hui · max {maxDaily * 2} FCFA/jour</Text>
      </View>
      <View style={styles.earnBadge}>
        <Text style={styles.earnText}>+2 FCFA</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: COLORS.bg,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    marginBottom: 4,
  },
  btnIcon: { fontSize: 28 },
  btnTitle: { fontSize: 14, fontWeight: "800", color: COLORS.primary },
  btnSub: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  earnBadge: {
    backgroundColor: COLORS.gold,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  earnText: { fontSize: 12, fontWeight: "800", color: "#fff" },
  watchingBox: {
    alignItems: "center",
    backgroundColor: "#FFF8E1",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1.5,
    borderColor: COLORS.gold,
    gap: 8,
    marginBottom: 4,
  },
  watchingIcon: { fontSize: 36 },
  watchingTitle: { fontSize: 16, fontWeight: "800", color: "#5D4037" },
  countdownCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  countdownNum: { fontSize: 26, fontWeight: "900", color: "#fff" },
  watchingSub: { fontSize: 12, color: COLORS.muted, textAlign: "center" },
  doneBox: {
    alignItems: "center",
    backgroundColor: "#F3E5F5",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: "#CE93D8",
    gap: 4,
    marginBottom: 4,
  },
  doneIcon: { fontSize: 32 },
  doneText: { fontSize: 14, fontWeight: "800", color: "#6A1B9A" },
  doneSub: { fontSize: 12, color: COLORS.muted, textAlign: "center" },
});
