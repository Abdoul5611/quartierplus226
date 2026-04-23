import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";

const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === "web" ? "" : "http://localhost:5000");

const C = {
  primary: "#2E7D32",
  primaryLight: "#E8F5E9",
  orange: "#E65100",
  orangeLight: "#FFF3E0",
  gold: "#F9A825",
  goldLight: "#FFF8E1",
  red: "#C62828",
  bg: "#F5F5F5",
  card: "#FFFFFF",
  text: "#212121",
  sub: "#757575",
  border: "#E0E0E0",
  white: "#FFFFFF",
};

const DURATION_MS = 10000;
const TRACK_TARGET_CLICKS = 80; // 100% de la piste = 80 clics

type Phase = "idle" | "countdown" | "running" | "finished" | "submitting";

export default function CourseAgiliteScreen() {
  const navigation = useNavigation<any>();
  const { firebaseUser, dbUser } = useAuth() as any;

  const [phase, setPhase] = useState<Phase>("idle");
  const [score, setScore] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(DURATION_MS / 1000);
  const [countdown, setCountdown] = useState(3);
  const [bestScore, setBestScore] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [savedScoreId, setSavedScoreId] = useState<string | null>(null);

  const tickRef = useRef<any>(null);
  const countRef = useRef<any>(null);
  const startTsRef = useRef<number>(0);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/agility/leaderboard?limit=10`);
      const d = await res.json();
      if (res.ok && Array.isArray(d)) setLeaderboard(d);
    } catch {}
  }, []);

  const fetchBest = useCallback(async () => {
    if (!firebaseUser?.uid) return;
    try {
      const res = await fetch(`${BASE_URL}/api/agility/best/${firebaseUser.uid}`);
      const d = await res.json();
      if (res.ok && d?.score != null) setBestScore(d.score);
    } catch {}
  }, [firebaseUser?.uid]);

  useEffect(() => {
    fetchLeaderboard();
    fetchBest();
  }, [fetchLeaderboard, fetchBest]);

  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      if (countRef.current) clearInterval(countRef.current);
    };
  }, []);

  const startCountdown = () => {
    setScore(0);
    setSavedScoreId(null);
    setSecondsLeft(DURATION_MS / 1000);
    setCountdown(3);
    setPhase("countdown");
    countRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(countRef.current);
          beginRun();
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  const beginRun = () => {
    setPhase("running");
    startTsRef.current = Date.now();
    tickRef.current = setInterval(() => {
      const elapsed = Date.now() - startTsRef.current;
      const remaining = Math.max(0, DURATION_MS - elapsed);
      setSecondsLeft(Math.ceil(remaining / 1000));
      if (remaining <= 0) {
        clearInterval(tickRef.current);
        finishRun();
      }
    }, 100);
  };

  const finishRun = () => {
    setPhase("finished");
    setScore((current) => {
      submitScore(current);
      return current;
    });
  };

  const submitScore = async (finalScore: number) => {
    if (!firebaseUser?.uid) {
      Alert.alert("Connexion requise", "Connecte-toi pour enregistrer ton score.");
      return;
    }
    setPhase("submitting");
    try {
      const res = await fetch(`${BASE_URL}/api/agility/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_uid: firebaseUser.uid,
          user_name: dbUser?.full_name || dbUser?.email || "Voisin",
          score: finalScore,
          duration_ms: DURATION_MS,
        }),
      });
      const d = await res.json();
      if (res.ok) {
        setSavedScoreId(d.id);
        await fetchLeaderboard();
        await fetchBest();
      } else {
        Alert.alert("Erreur", d.error || "Impossible d'enregistrer le score");
      }
    } catch {
      Alert.alert("Erreur réseau", "Impossible de contacter le serveur.");
    }
    setPhase("finished");
  };

  const handleTap = () => {
    if (phase !== "running") return;
    setScore((s) => s + 1);
  };

  const trackProgress = Math.min(1, score / TRACK_TARGET_CLICKS);
  const runnerLeftPercent = trackProgress * 100;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={C.white} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>🏃 Course d'Agilité</Text>
          <Text style={styles.headerSub}>Clique le plus vite possible en 10s !</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Ton meilleur</Text>
            <Text style={styles.statValue}>{bestScore != null ? bestScore : "—"}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Score actuel</Text>
            <Text style={[styles.statValue, { color: C.orange }]}>{score}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Temps</Text>
            <Text style={[styles.statValue, { color: phase === "running" && secondsLeft <= 3 ? C.red : C.primary }]}>
              {phase === "countdown" ? countdown : `${secondsLeft}s`}
            </Text>
          </View>
        </View>

        <View style={styles.trackCard}>
          <Text style={styles.trackLabel}>🏁 Piste</Text>
          <View style={styles.track}>
            <View style={[styles.trackFill, { width: `${runnerLeftPercent}%` }]} />
            <View style={[styles.runner, { left: `${runnerLeftPercent}%` }]}>
              <Text style={styles.runnerEmoji}>🏃</Text>
            </View>
            <View style={styles.finishLine}>
              <Text style={styles.finishEmoji}>🏁</Text>
            </View>
          </View>
          <Text style={styles.trackHint}>{score} / {TRACK_TARGET_CLICKS} clics pour atteindre la ligne</Text>
        </View>

        {phase === "idle" && (
          <TouchableOpacity style={styles.primaryBtn} onPress={startCountdown}>
            <Ionicons name="play" size={22} color={C.white} />
            <Text style={styles.primaryBtnText}>Démarrer la course</Text>
          </TouchableOpacity>
        )}

        {phase === "countdown" && (
          <View style={styles.countdownBox}>
            <Text style={styles.countdownText}>{countdown}</Text>
            <Text style={styles.countdownHint}>Prépare ton doigt…</Text>
          </View>
        )}

        {phase === "running" && (
          <TouchableOpacity
            style={styles.tapBtn}
            onPress={handleTap}
            activeOpacity={0.7}
          >
            <Ionicons name="flash" size={48} color={C.white} />
            <Text style={styles.tapBtnText}>TAP !</Text>
            <Text style={styles.tapBtnSub}>{score} clics</Text>
          </TouchableOpacity>
        )}

        {phase === "submitting" && (
          <View style={styles.countdownBox}>
            <ActivityIndicator size="large" color={C.primary} />
            <Text style={styles.countdownHint}>Enregistrement du score…</Text>
          </View>
        )}

        {phase === "finished" && (
          <View>
            <View style={styles.resultCard}>
              <Text style={styles.resultTitle}>🎉 Course terminée !</Text>
              <Text style={styles.resultScore}>{score} clics</Text>
              {savedScoreId && (
                <Text style={styles.resultHint}>Score enregistré. L'admin distribuera les gains au meilleur joueur.</Text>
              )}
              {bestScore != null && score > bestScore && (
                <Text style={[styles.resultHint, { color: C.gold, fontWeight: "700" }]}>🏆 Nouveau record personnel !</Text>
              )}
            </View>
            <TouchableOpacity style={[styles.primaryBtn, { marginTop: 12 }]} onPress={startCountdown}>
              <Ionicons name="refresh" size={20} color={C.white} />
              <Text style={styles.primaryBtnText}>Rejouer</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.lbCard}>
          <View style={styles.lbHeader}>
            <Text style={styles.lbTitle}>🏆 Top 10</Text>
            <TouchableOpacity onPress={fetchLeaderboard}>
              <Ionicons name="refresh" size={18} color={C.sub} />
            </TouchableOpacity>
          </View>
          {leaderboard.length === 0 ? (
            <Text style={styles.lbEmpty}>Aucun score enregistré pour l'instant. Sois le premier !</Text>
          ) : (
            leaderboard.map((row, i) => (
              <View key={row.id} style={styles.lbRow}>
                <Text style={styles.lbRank}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}</Text>
                <Text style={styles.lbName} numberOfLines={1}>{row.user_name || "Voisin"}</Text>
                <Text style={styles.lbScore}>{row.score} clics</Text>
                {row.rewarded ? <Ionicons name="checkmark-circle" size={16} color={C.primary} style={{ marginLeft: 6 }} /> : null}
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { backgroundColor: C.orange, paddingTop: Platform.OS === "ios" ? 50 : 20, paddingBottom: 16, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 8 },
  backBtn: { padding: 4 },
  headerTitle: { color: C.white, fontSize: 18, fontWeight: "800" },
  headerSub: { color: "#FFE0B2", fontSize: 12 },
  scroll: { padding: 14, paddingBottom: 60 },
  statsRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  statBox: { flex: 1, backgroundColor: C.card, borderRadius: 12, padding: 12, alignItems: "center", borderWidth: 1, borderColor: C.border },
  statLabel: { fontSize: 11, color: C.sub, marginBottom: 4 },
  statValue: { fontSize: 22, fontWeight: "800", color: C.primary },
  trackCard: { backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 14, borderWidth: 1, borderColor: C.border },
  trackLabel: { fontSize: 13, fontWeight: "700", color: C.text, marginBottom: 10 },
  track: { height: 50, backgroundColor: C.orangeLight, borderRadius: 25, position: "relative", overflow: "hidden", justifyContent: "center" },
  trackFill: { position: "absolute", top: 0, bottom: 0, left: 0, backgroundColor: "#FFCC80" },
  runner: { position: "absolute", top: 4, marginLeft: -14 },
  runnerEmoji: { fontSize: 32 },
  finishLine: { position: "absolute", right: 8, top: 8 },
  finishEmoji: { fontSize: 28 },
  trackHint: { fontSize: 11, color: C.sub, textAlign: "center", marginTop: 8 },
  primaryBtn: { flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center", backgroundColor: C.primary, paddingVertical: 14, borderRadius: 12 },
  primaryBtnText: { color: C.white, fontSize: 16, fontWeight: "700" },
  countdownBox: { backgroundColor: C.card, borderRadius: 12, padding: 28, alignItems: "center", borderWidth: 1, borderColor: C.border },
  countdownText: { fontSize: 72, fontWeight: "900", color: C.orange },
  countdownHint: { fontSize: 14, color: C.sub, marginTop: 8 },
  tapBtn: { backgroundColor: C.orange, borderRadius: 100, paddingVertical: 50, alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
  tapBtnText: { color: C.white, fontSize: 36, fontWeight: "900", marginTop: 8 },
  tapBtnSub: { color: "#FFE0B2", fontSize: 14, fontWeight: "600", marginTop: 4 },
  resultCard: { backgroundColor: C.primaryLight, borderRadius: 12, padding: 20, alignItems: "center", borderWidth: 1, borderColor: C.primary },
  resultTitle: { fontSize: 18, fontWeight: "800", color: C.primary },
  resultScore: { fontSize: 48, fontWeight: "900", color: C.orange, marginVertical: 8 },
  resultHint: { fontSize: 12, color: C.sub, textAlign: "center", marginTop: 4 },
  lbCard: { backgroundColor: C.card, borderRadius: 12, padding: 14, marginTop: 16, borderWidth: 1, borderColor: C.border },
  lbHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  lbTitle: { fontSize: 15, fontWeight: "800", color: C.text },
  lbEmpty: { fontSize: 12, color: C.sub, fontStyle: "italic", textAlign: "center", paddingVertical: 12 },
  lbRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.border },
  lbRank: { width: 32, fontSize: 14, fontWeight: "700", color: C.text },
  lbName: { flex: 1, fontSize: 13, color: C.text },
  lbScore: { fontSize: 13, fontWeight: "700", color: C.orange },
});
