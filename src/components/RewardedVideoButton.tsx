import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { RewardedAd, RewardedAdEventType, AdEventType, TestIds } from "react-native-google-mobile-ads";
import { api } from "../services/api";

const AD_UNIT_ID = TestIds.REWARDED;
const POINTS_PER_VIDEO = 5;

interface Props {
  todayViews: number;
  maxDaily: number;
  userUid: string;
  onPointsEarned: (newTotal: number) => void;
}

type AdStatus = "idle" | "loading" | "ready" | "showing" | "done";

export default function RewardedVideoButton({ todayViews, maxDaily, userUid, onPointsEarned }: Props) {
  const [status, setStatus] = useState<AdStatus>("idle");
  const [localViews, setLocalViews] = useState(todayViews);
  const adRef = useRef<RewardedAd | null>(null);
  const earnedRef = useRef(false);

  const canWatch = localViews < maxDaily;

  const loadAd = () => {
    if (!canWatch) return;
    setStatus("loading");
    earnedRef.current = false;

    const ad = RewardedAd.createForAdRequest(AD_UNIT_ID, {
      requestNonPersonalizedAdsOnly: true,
    });

    const unsubLoaded = ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      setStatus("ready");
      ad.show();
      setStatus("showing");
    });

    const unsubEarned = ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, async () => {
      earnedRef.current = true;
      try {
        const result = await api.rewardVideoComplete(userUid);
        setLocalViews(result.todayViews);
        onPointsEarned(result.totalPoints);
        Alert.alert(
          "🎉 Bravo !",
          `+${POINTS_PER_VIDEO} points crédités ! Total : ${result.totalPoints} pts (${(result.totalPoints * 0.25).toFixed(0)} FCFA)`,
          [{ text: "Super !" }]
        );
      } catch (e: any) {
        Alert.alert("Erreur", e.message || "Impossible de créditer les points.");
      }
    });

    const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, () => {
      setStatus("idle");
      unsubLoaded();
      unsubEarned();
      unsubClosed();
      adRef.current = null;
    });

    const unsubError = ad.addAdEventListener(AdEventType.ERROR, () => {
      setStatus("idle");
      Alert.alert("Pas de publicité disponible", "Réessayez dans quelques instants.");
      unsubLoaded();
      unsubEarned();
      unsubClosed();
      unsubError();
      adRef.current = null;
    });

    adRef.current = ad;
    ad.load();
  };

  useEffect(() => {
    setLocalViews(todayViews);
  }, [todayViews]);

  const remaining = maxDaily - localViews;

  if (!canWatch) {
    return (
      <View style={[styles.btn, styles.btnDisabled]}>
        <Text style={styles.btnIcon}>✅</Text>
        <View>
          <Text style={styles.btnTitle}>Limite atteinte pour aujourd'hui</Text>
          <Text style={styles.btnSub}>Revenez demain pour gagner plus de points</Text>
        </View>
      </View>
    );
  }

  if (status === "loading" || status === "showing") {
    return (
      <View style={[styles.btn, styles.btnLoading]}>
        <ActivityIndicator color="#fff" size="small" />
        <Text style={styles.btnTitleWhite}>Chargement de la vidéo…</Text>
      </View>
    );
  }

  return (
    <TouchableOpacity style={styles.btn} onPress={loadAd} activeOpacity={0.85}>
      <Text style={styles.btnIcon}>▶️</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.btnTitle}>Regarder une vidéo (+{POINTS_PER_VIDEO} pts)</Text>
        <Text style={styles.btnSub}>{remaining} vidéo{remaining > 1 ? "s" : ""} restante{remaining > 1 ? "s" : ""} aujourd'hui</Text>
      </View>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>+{POINTS_PER_VIDEO}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#1B5E20",
    borderRadius: 16,
    padding: 16,
    marginBottom: 4,
  },
  btnDisabled: {
    backgroundColor: "#E9ECEF",
  },
  btnLoading: {
    backgroundColor: "#2E7D32",
    justifyContent: "center",
  },
  btnIcon: { fontSize: 28 },
  btnTitle: { fontSize: 14, fontWeight: "800", color: "#fff" },
  btnTitleWhite: { fontSize: 14, fontWeight: "700", color: "#fff", marginLeft: 10 },
  btnSub: { fontSize: 12, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  badge: {
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { color: "#fff", fontWeight: "900", fontSize: 13 },
});
