import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  ActivityIndicator, Alert, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { BASE_URL } from "../services/api";

const C = {
  primary: "#1565C0",
  correct: "#2E7D32",
  wrong: "#C62828",
  bg: "#E3F2FD",
  card: "#FFFFFF",
  text: "#1A1A1A",
  sub: "#6B7280",
  border: "#BBDEFB",
  gold: "#F9A825",
};

const TIMER_SECS = 15;

interface Question { id: number; question: string; options: string[]; correctIndex: number; }

type Phase = "lobby" | "question" | "result" | "summary";

export default function QuizQuartierScreen() {
  const navigation = useNavigation<any>();
  const { dbUser, firebaseUser } = useAuth() as any;
  const balance = dbUser?.wallet_balance ?? 0;

  const [phase, setPhase] = useState<Phase>("lobby");
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState<Question | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [serverCorrectIdx, setServerCorrectIdx] = useState<number | null>(null);
  const [prize, setPrize] = useState(0);
  const [score, setScore] = useState(0);
  const [round, setRound] = useState(0);
  const [totalPrize, setTotalPrize] = useState(0);
  const [serverBalance, setServerBalance] = useState<number | null>(null);
  const [timer, setTimer] = useState(TIMER_SECS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const answered = useRef(false);

  const currentBalance = serverBalance ?? balance;

  const clearTimer = () => { if (timerRef.current) clearInterval(timerRef.current); };

  const startTimer = () => {
    clearTimer();
    setTimer(TIMER_SECS);
    answered.current = false;
    timerRef.current = setInterval(() => {
      setTimer(t => {
        if (t <= 1) {
          clearTimer();
          if (!answered.current) handleAnswer(-1);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
  };

  useEffect(() => () => clearTimer(), []);

  const fetchQuestion = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/games/quiz-quartier/question`);
      const data = await res.json();
      setQuestion({ id: data.id, question: data.question, options: data.options, correctIndex: data.correct_index ?? data.correctIndex });
      setSelected(null);
      setCorrect(null);
      setServerCorrectIdx(null);
      setPhase("question");
      startTimer();
    } catch { Alert.alert("Erreur réseau"); }
    finally { setLoading(false); }
  };

  const handleStart = async () => {
    if (!firebaseUser) return Alert.alert("Connexion requise", "Connectez-vous dans Profil.");
    if (currentBalance < 25) return Alert.alert("Solde insuffisant", "Il vous faut 25 FCFA par question.");
    setRound(0); setScore(0); setTotalPrize(0); setServerBalance(null);
    await fetchQuestion();
  };

  const handleAnswer = async (idx: number) => {
    if (!question || !firebaseUser || answered.current) return;
    answered.current = true;
    clearTimer();
    if (currentBalance < 25) { Alert.alert("Solde insuffisant", "Il vous faut 25 FCFA."); setPhase("summary"); return; }
    setSelected(idx);
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/games/quiz-quartier/play`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: firebaseUser.uid, questionId: question.id, answerIndex: idx }),
      });
      const data = await res.json();
      if (!res.ok) { Alert.alert("Erreur", data.error); setPhase("lobby"); return; }
      const isCorrect = data.correct;
      setCorrect(isCorrect);
      setServerCorrectIdx(data.correct_index ?? data.correctIndex);
      setPrize(data.prize || 0);
      setServerBalance(data.balance);
      const newRound = round + 1;
      setRound(newRound);
      if (isCorrect) { setScore(s => s + 1); setTotalPrize(t => t + (data.prize || 0)); }
      setPhase("result");
    } catch { Alert.alert("Erreur réseau"); setPhase("lobby"); }
    finally { setLoading(false); }
  };

  const handleNext = async () => {
    if (round >= 5 || currentBalance < 25) { setPhase("summary"); return; }
    await fetchQuestion();
  };

  const timerColor = timer <= 5 ? C.wrong : timer <= 10 ? C.gold : C.primary;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🧠 Quiz Quartier</Text>
        <View style={styles.balanceBadge}>
          <Text style={styles.balanceText}>{currentBalance.toLocaleString()} FCFA</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {phase === "lobby" && (
          <View style={styles.lobbyBox}>
            <Text style={styles.lobbyEmoji}>🧠</Text>
            <Text style={styles.lobbyTitle}>Quiz Quartier</Text>
            <Text style={styles.lobbyDesc}>Répondez à des questions sur votre quartier et la vie en Afrique. Chaque bonne réponse rapporte 100 FCFA.</Text>
            <View style={styles.rulesBox}>
              {[
                ["🎟️", "Mise par question", "25 FCFA"],
                ["✅", "Bonne réponse", "+100 FCFA"],
                ["❌", "Mauvaise réponse", "-25 FCFA"],
                ["⏱️", "Temps par question", "15 secondes"],
                ["📊", "Questions par session", "5 max"],
              ].map(([icon, label, val]) => (
                <View key={label} style={styles.ruleRow}>
                  <Text style={styles.ruleIcon}>{icon}</Text>
                  <Text style={styles.ruleLabel}>{label}</Text>
                  <Text style={styles.ruleVal}>{val}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.startBtn, currentBalance < 25 && styles.startBtnDisabled]}
              onPress={handleStart}
              disabled={currentBalance < 25 || loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.startBtnText}>🚀 Commencer</Text>}
            </TouchableOpacity>
            {currentBalance < 25 && (
              <TouchableOpacity style={styles.rechargeBtn} onPress={() => navigation.navigate("Profil")}>
                <Text style={styles.rechargeBtnText}>💳 Recharger</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {phase === "question" && question && (
          <View style={styles.questionBox}>
            <View style={styles.progressBar}>
              <Text style={styles.progressText}>Question {round + 1} / 5</Text>
              <View style={[styles.timerBadge, { backgroundColor: timerColor }]}>
                <Text style={styles.timerText}>{timer}s</Text>
              </View>
            </View>
            <Text style={styles.questionText}>{question.question}</Text>
            <View style={styles.optionsGrid}>
              {question.options.map((opt, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.optBtn, selected === i && styles.optBtnSelected]}
                  onPress={() => handleAnswer(i)}
                  disabled={loading || selected !== null}
                >
                  <Text style={styles.optLetter}>{String.fromCharCode(65 + i)}</Text>
                  <Text style={styles.optText}>{opt}</Text>
                  {loading && selected === i && <ActivityIndicator size="small" color={C.primary} />}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {phase === "result" && question && (
          <View style={styles.resultBox}>
            <Text style={styles.resultEmoji}>{correct ? "🎉" : "😔"}</Text>
            <Text style={[styles.resultTitle, { color: correct ? C.correct : C.wrong }]}>
              {correct ? "Bonne réponse !" : selected === -1 ? "Temps écoulé !" : "Mauvaise réponse !"}
            </Text>
            {correct && <Text style={styles.resultPrize}>+{prize.toLocaleString()} FCFA</Text>}
            {!correct && serverCorrectIdx !== null && (
              <Text style={styles.resultCorrectAnswer}>
                ✅ Réponse : {question.options[serverCorrectIdx]}
              </Text>
            )}
            <View style={styles.scoreCard}>
              <Text style={styles.scoreLabel}>Score : {score}/{round}</Text>
              <Text style={styles.scorePrize}>Total gagné : {totalPrize.toLocaleString()} FCFA</Text>
            </View>
            {round < 5 && currentBalance >= 25 ? (
              <TouchableOpacity style={styles.nextBtn} onPress={handleNext} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.nextBtnText}>Question suivante →</Text>}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.endBtn} onPress={() => setPhase("summary")}>
                <Text style={styles.endBtnText}>Voir le résumé</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {phase === "summary" && (
          <View style={styles.summaryBox}>
            <Text style={styles.summaryEmoji}>{score >= 4 ? "🏆" : score >= 2 ? "🥈" : "😤"}</Text>
            <Text style={styles.summaryTitle}>Session terminée</Text>
            <Text style={styles.summaryScore}>{score}/{round} bonnes réponses</Text>
            <Text style={styles.summaryPrize}>{totalPrize.toLocaleString()} FCFA gagnés</Text>
            <Text style={styles.summaryBalance}>Solde actuel : {currentBalance.toLocaleString()} FCFA</Text>
            <TouchableOpacity style={styles.startBtn} onPress={handleStart} disabled={currentBalance < 25 || loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.startBtnText}>🔄 Rejouer</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.backToGamesBtn} onPress={() => navigation.goBack()}>
              <Text style={styles.backToGamesBtnText}>← Retour aux jeux</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border, gap: 10 },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: "800", color: C.text },
  balanceBadge: { backgroundColor: C.primary, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  balanceText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  scroll: { padding: 16 },
  lobbyBox: { backgroundColor: C.card, borderRadius: 20, padding: 20, alignItems: "center", gap: 12 },
  lobbyEmoji: { fontSize: 52, marginBottom: 4 },
  lobbyTitle: { fontSize: 24, fontWeight: "900", color: C.primary },
  lobbyDesc: { fontSize: 14, color: C.sub, textAlign: "center", lineHeight: 20 },
  rulesBox: { width: "100%", backgroundColor: C.bg, borderRadius: 12, padding: 14, gap: 8 },
  ruleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  ruleIcon: { fontSize: 16, width: 24 },
  ruleLabel: { flex: 1, fontSize: 13, color: C.text },
  ruleVal: { fontSize: 13, fontWeight: "700", color: C.primary },
  startBtn: { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, width: "100%", alignItems: "center" },
  startBtnDisabled: { opacity: 0.5 },
  startBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  rechargeBtn: { backgroundColor: C.correct, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 24, width: "100%", alignItems: "center" },
  rechargeBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  questionBox: { backgroundColor: C.card, borderRadius: 20, padding: 20, gap: 16 },
  progressBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  progressText: { fontSize: 13, fontWeight: "700", color: C.sub },
  timerBadge: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  timerText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  questionText: { fontSize: 17, fontWeight: "700", color: C.text, lineHeight: 24 },
  optionsGrid: { gap: 10 },
  optBtn: { flexDirection: "row", alignItems: "center", backgroundColor: C.bg, borderRadius: 12, padding: 14, borderWidth: 2, borderColor: "transparent", gap: 12 },
  optBtnSelected: { borderColor: C.primary },
  optLetter: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.primary, textAlign: "center", lineHeight: 28, color: "#fff", fontWeight: "800", fontSize: 13, overflow: "hidden" },
  optText: { flex: 1, fontSize: 14, color: C.text, fontWeight: "600" },
  resultBox: { backgroundColor: C.card, borderRadius: 20, padding: 20, alignItems: "center", gap: 14 },
  resultEmoji: { fontSize: 56 },
  resultTitle: { fontSize: 22, fontWeight: "900" },
  resultPrize: { fontSize: 24, fontWeight: "800", color: C.gold },
  resultCorrectAnswer: { fontSize: 14, color: C.correct, fontWeight: "600", textAlign: "center" },
  scoreCard: { backgroundColor: C.bg, borderRadius: 12, padding: 14, width: "100%", alignItems: "center", gap: 4 },
  scoreLabel: { fontSize: 15, fontWeight: "700", color: C.text },
  scorePrize: { fontSize: 13, color: C.sub },
  nextBtn: { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32, width: "100%", alignItems: "center" },
  nextBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  endBtn: { backgroundColor: C.sub, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 32, width: "100%", alignItems: "center" },
  endBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  summaryBox: { backgroundColor: C.card, borderRadius: 20, padding: 24, alignItems: "center", gap: 14 },
  summaryEmoji: { fontSize: 60 },
  summaryTitle: { fontSize: 22, fontWeight: "900", color: C.text },
  summaryScore: { fontSize: 18, fontWeight: "700", color: C.primary },
  summaryPrize: { fontSize: 22, fontWeight: "800", color: C.gold },
  summaryBalance: { fontSize: 14, color: C.sub },
  backToGamesBtn: { marginTop: 4 },
  backToGamesBtnText: { fontSize: 14, color: C.sub, fontWeight: "600" },
});
