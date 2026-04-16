import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Platform, ActivityIndicator, Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { BASE_URL } from "../services/api";

const COLORS = {
  primary: "#AD1457",
  primaryLight: "#FCE4EC",
  gold: "#F9A825",
  goldLight: "#FFF8E1",
  green: "#2E7D32",
  greenLight: "#E8F5E9",
  red: "#C62828",
  redLight: "#FFEBEE",
  bg: "#F5F5F5",
  card: "#FFFFFF",
  text: "#212121",
  textSub: "#757575",
  border: "#E0E0E0",
  dark: "#1A1A2E",
};

const TOTAL_ADS = 5;
const AD_DURATION = 10;

type Phase = "ads" | "waiting" | "question" | "review" | "eliminated" | "ended";

interface QuizSession {
  id: string;
  titre: string;
  status: string;
  scheduled_at?: string;
  prize_pool: number;
  total_questions: number;
}

interface QuestionData {
  index: number;
  total: number;
  question: string;
  options: string[];
  seconds: number;
}

function getWsUrl(): string {
  if (Platform.OS === "web") {
    const proto = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = typeof window !== "undefined" ? window.location.host : "localhost:5000";
    return `${proto}//${host}`;
  }
  return BASE_URL.replace("https://", "wss://").replace("http://", "ws://");
}

export default function LiveQuizScreen() {
  const navigation = useNavigation<any>();
  const { dbUser, isAdmin } = useAuth() as any;
  const userUid = dbUser?.firebase_uid;
  const userName = dbUser?.display_name || "Joueur";

  const [phase, setPhase] = useState<Phase>("ads");
  const [session, setSession] = useState<QuizSession | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);

  const [currentAd, setCurrentAd] = useState(1);
  const [adSeconds, setAdSeconds] = useState(AD_DURATION);
  const [adsCompleted, setAdsCompleted] = useState(false);

  const [playerCount, setPlayerCount] = useState(0);
  const [question, setQuestion] = useState<QuestionData | null>(null);
  const [timerSeconds, setTimerSeconds] = useState(10);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [answerResult, setAnswerResult] = useState<"correct" | "wrong" | null>(null);
  const [correctIndex, setCorrectIndex] = useState<number | null>(null);

  const [endData, setEndData] = useState<{ won: boolean; prize: number; winnerCount: number; totalPlayers: number } | null>(null);
  const [eliminatedReason, setEliminatedReason] = useState<string>("");

  const wsRef = useRef<WebSocket | null>(null);
  const adTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    fetchSession();
    return () => {
      isMounted.current = false;
      if (adTimerRef.current) clearInterval(adTimerRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const fetchSession = async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/quiz/next`);
      const data = await res.json();
      if (isMounted.current) {
        setSession(data);
        setLoadingSession(false);
      }
    } catch {
      if (isMounted.current) setLoadingSession(false);
    }
  };

  const startAdTimer = useCallback(() => {
    if (adTimerRef.current) clearInterval(adTimerRef.current);
    setAdSeconds(AD_DURATION);
    adTimerRef.current = setInterval(() => {
      setAdSeconds((s) => {
        if (s <= 1) {
          if (adTimerRef.current) clearInterval(adTimerRef.current);
          if (isMounted.current) {
            setCurrentAd((a) => {
              const next = a + 1;
              if (next > TOTAL_ADS) {
                setAdsCompleted(true);
                return a;
              }
              setTimeout(() => {
                if (isMounted.current) startAdTimer();
              }, 300);
              return next;
            });
          }
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    if (phase === "ads") startAdTimer();
  }, [phase, startAdTimer]);

  const enterWaitingRoom = () => {
    if (!session) return;
    setPhase("waiting");
    connectWebSocket(session.id);
  };

  const connectWebSocket = (sessionId: string) => {
    const url = getWsUrl();
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      Alert.alert("Erreur", "Impossible de se connecter au serveur temps réel");
      return;
    }
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "join", sessionId, userUid, userName }));
    };

    ws.onmessage = (event) => {
      if (!isMounted.current) return;
      try {
        const msg = JSON.parse(event.data);
        handleWsMessage(msg);
      } catch {}
    };

    ws.onerror = () => {
      if (isMounted.current) Alert.alert("Connexion perdue", "Impossible de rejoindre le quiz en temps réel");
    };

    ws.onclose = () => {};
  };

  const handleWsMessage = (msg: any) => {
    switch (msg.type) {
      case "joined":
        setPlayerCount(msg.player_count ?? 0);
        break;
      case "player_count":
        setPlayerCount(msg.count ?? 0);
        break;
      case "quiz_starting":
        break;
      case "question":
        setQuestion({
          index: msg.index,
          total: msg.total,
          question: msg.question,
          options: msg.options,
          seconds: msg.seconds,
        });
        setTimerSeconds(msg.seconds ?? 10);
        setSelectedAnswer(null);
        setAnswerResult(null);
        setCorrectIndex(null);
        setPhase("question");
        break;
      case "timer":
        setTimerSeconds(msg.seconds ?? 0);
        break;
      case "answer_ack":
        setAnswerResult(msg.correct ? "correct" : "wrong");
        break;
      case "answer_reveal":
        setCorrectIndex(msg.correct_index);
        setPhase("review");
        break;
      case "eliminated":
        setEliminatedReason(msg.reason === "timeout" ? "temps écoulé" : "mauvaise réponse");
        setPhase("eliminated");
        break;
      case "quiz_end":
        setEndData({
          won: msg.won,
          prize: msg.prize ?? 0,
          winnerCount: msg.winner_count ?? 0,
          totalPlayers: msg.total_players ?? 0,
        });
        setPhase("ended");
        break;
    }
  };

  const submitAnswer = (index: number) => {
    if (selectedAnswer !== null || phase !== "question") return;
    setSelectedAnswer(index);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "answer", answer_index: index }));
    }
  };

  const adminStart = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "admin_start" }));
    }
  };

  const adminEnd = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "admin_end" }));
    }
  };

  const createSession = async () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() + 30);
    try {
      const res = await fetch(`${BASE_URL}/api/quiz/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titre: "Live Quiz QuartierPlus",
          prize_pool: 10000,
          scheduled_at: now.toISOString(),
          admin_uid: userUid,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert("Erreur", data.error || "Impossible de créer le quiz");
      } else {
        setSession(data);
        Alert.alert("Quiz créé !", `Quiz programmé pour ${now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`);
      }
    } catch {
      Alert.alert("Erreur réseau");
    }
  };

  const formatScheduledTime = (d?: string) => {
    if (!d) return "";
    return new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  };

  const getTimerColor = () => {
    if (timerSeconds > 6) return COLORS.green;
    if (timerSeconds > 3) return COLORS.gold;
    return COLORS.red;
  };

  const getOptionStyle = (index: number) => {
    if (phase === "review" && correctIndex !== null) {
      if (index === correctIndex) return styles.optionCorrect;
      if (index === selectedAnswer && index !== correctIndex) return styles.optionWrong;
      return styles.optionDisabled;
    }
    if (selectedAnswer !== null) {
      if (index === selectedAnswer) return answerResult === "correct" ? styles.optionCorrect : styles.optionWrong;
      return styles.optionDisabled;
    }
    return styles.option;
  };

  if (loadingSession) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (phase === "ads") {
    const progress = ((AD_DURATION - adSeconds) / AD_DURATION) * 100;
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>📺 Publicités requises</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.adGateInfo}>
            <Ionicons name="information-circle" size={20} color={COLORS.primary} />
            <Text style={styles.adGateInfoText}>
              Regardez {TOTAL_ADS} courtes vidéos publicitaires pour accéder au quiz.
              Ces publicités financent la cagnotte de {(session?.prize_pool ?? 10000).toLocaleString("fr-FR")} FCFA !
            </Text>
          </View>

          <View style={styles.adProgressRow}>
            {Array.from({ length: TOTAL_ADS }, (_, i) => (
              <View key={i} style={[styles.adDot, i < currentAd - 1 || adsCompleted ? styles.adDotDone : i === currentAd - 1 && !adsCompleted ? styles.adDotActive : styles.adDotPending]} />
            ))}
          </View>
          <Text style={styles.adProgressText}>
            {adsCompleted ? "Toutes les publicités regardées !" : `Publicité ${currentAd} / ${TOTAL_ADS}`}
          </Text>

          {!adsCompleted ? (
            <View style={styles.adPlayer}>
              <View style={styles.adScreen}>
                <Ionicons name="play-circle" size={60} color="rgba(255,255,255,0.6)" />
                <Text style={styles.adScreenLabel}>Publicité {currentAd}</Text>
                <Text style={styles.adScreenSub}>QuartierPlus — Votre voisinage, vos opportunités</Text>
              </View>
              <View style={styles.adTimerRow}>
                <Text style={styles.adTimerLabel}>Fermeture dans</Text>
                <Text style={styles.adTimerValue}>{adSeconds}s</Text>
              </View>
              <View style={styles.adBar}>
                <View style={[styles.adBarFill, { width: `${progress}%` as any }]} />
              </View>
              <Text style={styles.adSkipNote}>Vous ne pouvez pas sauter cette publicité</Text>
            </View>
          ) : (
            <View style={styles.adsCompleteCard}>
              <Text style={styles.adsCompleteEmoji}>✅</Text>
              <Text style={styles.adsCompleteTitle}>Publicités terminées !</Text>
              <Text style={styles.adsCompleteSub}>Vous pouvez maintenant entrer dans la salle du quiz.</Text>
              {session ? (
                <TouchableOpacity style={styles.enterBtn} onPress={enterWaitingRoom}>
                  <Ionicons name="enter" size={20} color="#fff" />
                  <Text style={styles.enterBtnText}>Entrer dans la salle</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.noSessionText}>Aucun quiz actif pour le moment. Revenez bientôt !</Text>
              )}
            </View>
          )}

          {isAdmin && !session && (
            <TouchableOpacity style={styles.adminCreateBtn} onPress={createSession}>
              <Ionicons name="add-circle" size={18} color="#fff" />
              <Text style={styles.adminCreateBtnText}>Admin — Créer un quiz maintenant</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    );
  }

  if (phase === "waiting") {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>🎯 Salle d'attente</Text>
        </View>
        <ScrollView contentContainerStyle={styles.scrollCentered}>
          <View style={styles.waitingCard}>
            <Text style={styles.waitingTitle}>{session?.titre ?? "Live Quiz"}</Text>
            <View style={styles.cagnotteWaitCard}>
              <Text style={styles.cagnotteWaitLabel}>🏆 Cagnotte</Text>
              <Text style={styles.cagnotteWaitAmount}>
                {(session?.prize_pool ?? 0).toLocaleString("fr-FR")} FCFA
              </Text>
            </View>
            {session?.scheduled_at && (
              <View style={styles.scheduledRow}>
                <Ionicons name="time" size={18} color={COLORS.primary} />
                <Text style={styles.scheduledText}>
                  Prévu à {formatScheduledTime(session.scheduled_at)}
                </Text>
              </View>
            )}
            <View style={styles.playerCountRow}>
              <Ionicons name="people" size={22} color={COLORS.primary} />
              <Text style={styles.playerCountText}>{playerCount} joueur{playerCount !== 1 ? "s" : ""} dans la salle</Text>
            </View>
            <Text style={styles.waitingInfo}>
              Le quiz démarre quand l'administrateur lance la partie. Restez connecté !
            </Text>
            <View style={styles.waitingDots}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={[styles.waitingDot, { opacity: 0.3 + (i * 0.35) }]} />
              ))}
            </View>
          </View>

          {isAdmin && (
            <View style={styles.adminWaitPanel}>
              <Text style={styles.adminWaitTitle}>Contrôles Admin</Text>
              <TouchableOpacity style={styles.adminStartBtn} onPress={adminStart}>
                <Ionicons name="play" size={18} color="#fff" />
                <Text style={styles.adminStartBtnText}>Lancer le quiz maintenant</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.adminStartBtn, { backgroundColor: COLORS.red, marginTop: 8 }]} onPress={adminEnd}>
                <Ionicons name="stop" size={18} color="#fff" />
                <Text style={styles.adminStartBtnText}>Terminer le quiz</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  if (phase === "question" || phase === "review") {
    const timerPercent = (timerSeconds / 10) * 100;
    return (
      <View style={styles.quizContainer}>
        <View style={styles.quizHeader}>
          <View style={styles.quizHeaderLeft}>
            <Text style={styles.quizQuestionIndex}>
              Question {(question?.index ?? 0) + 1} / {question?.total ?? 10}
            </Text>
            <Text style={styles.quizPlayerCount}>
              <Ionicons name="people" size={12} /> {playerCount} joueurs
            </Text>
          </View>
          <View style={[styles.quizTimer, { borderColor: getTimerColor() }]}>
            <Text style={[styles.quizTimerText, { color: getTimerColor() }]}>
              {phase === "review" ? "✓" : timerSeconds}
            </Text>
          </View>
        </View>

        <View style={styles.timerBar}>
          <View style={[styles.timerBarFill, {
            width: `${timerPercent}%` as any,
            backgroundColor: getTimerColor(),
          }]} />
        </View>

        <ScrollView contentContainerStyle={styles.quizBody}>
          <View style={styles.questionCard}>
            <Text style={styles.questionText}>{question?.question}</Text>
          </View>

          {question?.options.map((opt, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.option, getOptionStyle(i)]}
              onPress={() => submitAnswer(i)}
              disabled={selectedAnswer !== null || phase === "review"}
            >
              <View style={styles.optionLetter}>
                <Text style={styles.optionLetterText}>{["A", "B", "C", "D"][i]}</Text>
              </View>
              <Text style={styles.optionText}>{opt}</Text>
              {phase === "review" && i === correctIndex && (
                <Ionicons name="checkmark-circle" size={20} color={COLORS.green} style={{ marginLeft: "auto" }} />
              )}
              {phase === "review" && i === selectedAnswer && i !== correctIndex && (
                <Ionicons name="close-circle" size={20} color={COLORS.red} style={{ marginLeft: "auto" }} />
              )}
            </TouchableOpacity>
          ))}

          {selectedAnswer !== null && phase === "question" && (
            <View style={[styles.answerAck, answerResult === "correct" ? styles.answerAckCorrect : styles.answerAckWrong]}>
              <Ionicons
                name={answerResult === "correct" ? "checkmark-circle" : "time"}
                size={18}
                color={answerResult === "correct" ? COLORS.green : COLORS.gold}
              />
              <Text style={styles.answerAckText}>
                {answerResult === "correct" ? "Bonne réponse ! En attente des autres..." : "Réponse enregistrée. En attente..."}
              </Text>
            </View>
          )}

          {phase === "review" && (
            <View style={styles.reviewCard}>
              <Text style={styles.reviewText}>Prochaine question dans quelques secondes...</Text>
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  if (phase === "eliminated") {
    return (
      <View style={styles.endContainer}>
        <Text style={styles.endEmoji}>😔</Text>
        <Text style={styles.endTitle}>Vous êtes éliminé !</Text>
        <Text style={styles.endSub}>Raison : {eliminatedReason}</Text>
        <Text style={styles.endEncouragement}>Courage ! Le prochain quiz vous attend.</Text>
        <TouchableOpacity style={styles.endBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.endBtnText}>Retour aux jeux</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (phase === "ended" && endData) {
    return (
      <View style={[styles.endContainer, endData.won && { backgroundColor: COLORS.goldLight }]}>
        <Text style={styles.endEmoji}>{endData.won ? "🏆" : "👏"}</Text>
        <Text style={[styles.endTitle, endData.won && { color: COLORS.gold }]}>
          {endData.won ? "Félicitations !" : "Quiz terminé"}
        </Text>
        {endData.won ? (
          <>
            <Text style={styles.endPrize}>+{endData.prize.toLocaleString("fr-FR")} FCFA</Text>
            <Text style={styles.endSub}>Crédité sur votre wallet !</Text>
            <Text style={styles.endStats}>
              Vous faites partie des {endData.winnerCount} gagnants sur {endData.totalPlayers} joueurs
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.endSub}>
              {endData.winnerCount} gagnant{endData.winnerCount !== 1 ? "s" : ""} sur {endData.totalPlayers} joueurs
            </Text>
            <Text style={styles.endEncouragement}>Réessayez au prochain quiz !</Text>
          </>
        )}
        <TouchableOpacity style={[styles.endBtn, endData.won && { backgroundColor: COLORS.gold }]} onPress={() => navigation.goBack()}>
          <Text style={styles.endBtnText}>Retour aux jeux</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    paddingTop: Platform.OS === "ios" ? 56 : 20,
    paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: COLORS.card, borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border, flexDirection: "row",
    alignItems: "center", gap: 10,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 18, fontWeight: "800", color: COLORS.text },
  scroll: { padding: 16 },
  scrollCentered: { padding: 16, alignItems: "center" },
  adGateInfo: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: COLORS.primaryLight, borderRadius: 12,
    padding: 12, marginBottom: 20,
  },
  adGateInfoText: { flex: 1, fontSize: 13, color: COLORS.primary, lineHeight: 19 },
  adProgressRow: { flexDirection: "row", gap: 8, justifyContent: "center", marginBottom: 8 },
  adDot: { width: 32, height: 8, borderRadius: 4 },
  adDotDone: { backgroundColor: COLORS.primary },
  adDotActive: { backgroundColor: COLORS.gold },
  adDotPending: { backgroundColor: COLORS.border },
  adProgressText: { fontSize: 13, fontWeight: "700", color: COLORS.textSub, textAlign: "center", marginBottom: 20 },
  adPlayer: {
    backgroundColor: COLORS.card, borderRadius: 16, overflow: "hidden",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 4,
  },
  adScreen: {
    backgroundColor: COLORS.dark, height: 200,
    justifyContent: "center", alignItems: "center", gap: 8,
  },
  adScreenLabel: { fontSize: 18, fontWeight: "800", color: "#fff" },
  adScreenSub: { fontSize: 12, color: "rgba(255,255,255,0.6)", textAlign: "center", paddingHorizontal: 20 },
  adTimerRow: { flexDirection: "row", justifyContent: "space-between", padding: 12, alignItems: "center" },
  adTimerLabel: { fontSize: 13, color: COLORS.textSub },
  adTimerValue: { fontSize: 18, fontWeight: "900", color: COLORS.primary },
  adBar: { height: 6, backgroundColor: COLORS.border, marginHorizontal: 12, borderRadius: 3, marginBottom: 4 },
  adBarFill: { height: 6, backgroundColor: COLORS.primary, borderRadius: 3 },
  adSkipNote: { fontSize: 11, color: COLORS.textSub, textAlign: "center", padding: 10 },
  adsCompleteCard: {
    backgroundColor: COLORS.card, borderRadius: 16, padding: 24,
    alignItems: "center", gap: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  adsCompleteEmoji: { fontSize: 48 },
  adsCompleteTitle: { fontSize: 20, fontWeight: "800", color: COLORS.text },
  adsCompleteSub: { fontSize: 14, color: COLORS.textSub, textAlign: "center" },
  enterBtn: {
    backgroundColor: COLORS.primary, borderRadius: 14, paddingHorizontal: 28,
    paddingVertical: 14, flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8,
  },
  enterBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  noSessionText: { fontSize: 14, color: COLORS.textSub, textAlign: "center", fontStyle: "italic" },
  adminCreateBtn: {
    backgroundColor: COLORS.primary, borderRadius: 12, padding: 14, marginTop: 20,
    flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center",
  },
  adminCreateBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  waitingCard: {
    backgroundColor: COLORS.card, borderRadius: 20, padding: 24,
    alignItems: "center", gap: 16, width: "100%",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 10, elevation: 4,
  },
  waitingTitle: { fontSize: 20, fontWeight: "800", color: COLORS.text, textAlign: "center" },
  cagnotteWaitCard: {
    backgroundColor: COLORS.primary, borderRadius: 14, padding: 16,
    alignItems: "center", width: "100%",
  },
  cagnotteWaitLabel: { fontSize: 13, color: "rgba(255,255,255,0.8)", marginBottom: 4 },
  cagnotteWaitAmount: { fontSize: 28, fontWeight: "900", color: "#fff" },
  scheduledRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  scheduledText: { fontSize: 15, fontWeight: "700", color: COLORS.primary },
  playerCountRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  playerCountText: { fontSize: 18, fontWeight: "700", color: COLORS.text },
  waitingInfo: { fontSize: 13, color: COLORS.textSub, textAlign: "center", lineHeight: 19, paddingHorizontal: 8 },
  waitingDots: { flexDirection: "row", gap: 6 },
  waitingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.primary },
  adminWaitPanel: {
    backgroundColor: "#FFF3E0", borderRadius: 14, padding: 16,
    width: "100%", marginTop: 20, borderWidth: 1, borderColor: "#FFE0B2",
  },
  adminWaitTitle: { fontSize: 12, fontWeight: "700", color: "#E65100", textTransform: "uppercase", marginBottom: 10 },
  adminStartBtn: {
    backgroundColor: COLORS.green, borderRadius: 10, padding: 12,
    flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "center",
  },
  adminStartBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  quizContainer: { flex: 1, backgroundColor: COLORS.dark },
  quizHeader: {
    paddingTop: Platform.OS === "ios" ? 56 : 20,
    paddingHorizontal: 16, paddingBottom: 12,
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
  },
  quizHeaderLeft: { gap: 2 },
  quizQuestionIndex: { fontSize: 16, fontWeight: "800", color: "#fff" },
  quizPlayerCount: { fontSize: 12, color: "rgba(255,255,255,0.6)" },
  quizTimer: {
    width: 48, height: 48, borderRadius: 24, borderWidth: 3,
    justifyContent: "center", alignItems: "center",
  },
  quizTimerText: { fontSize: 18, fontWeight: "900" },
  timerBar: { height: 4, backgroundColor: "rgba(255,255,255,0.15)", marginHorizontal: 16, borderRadius: 2 },
  timerBarFill: { height: 4, borderRadius: 2 },
  quizBody: { padding: 16 },
  questionCard: {
    backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 16, padding: 20,
    marginBottom: 20, marginTop: 8,
  },
  questionText: { fontSize: 18, fontWeight: "700", color: "#fff", lineHeight: 26, textAlign: "center" },
  option: {
    backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 14, padding: 16,
    marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 12,
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.2)",
  },
  optionCorrect: {
    backgroundColor: "rgba(46,125,50,0.3)", borderRadius: 14, padding: 16,
    marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 12,
    borderWidth: 1.5, borderColor: COLORS.green,
  },
  optionWrong: {
    backgroundColor: "rgba(198,40,40,0.3)", borderRadius: 14, padding: 16,
    marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 12,
    borderWidth: 1.5, borderColor: COLORS.red,
  },
  optionDisabled: {
    backgroundColor: "rgba(255,255,255,0.05)", borderRadius: 14, padding: 16,
    marginBottom: 10, flexDirection: "row", alignItems: "center", gap: 12,
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.1)", opacity: 0.6,
  },
  optionLetter: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center", alignItems: "center",
  },
  optionLetterText: { fontSize: 13, fontWeight: "800", color: "#fff" },
  optionText: { flex: 1, fontSize: 15, fontWeight: "600", color: "#fff" },
  answerAck: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: 12, padding: 12, marginTop: 8,
  },
  answerAckCorrect: { backgroundColor: "rgba(46,125,50,0.2)" },
  answerAckWrong: { backgroundColor: "rgba(249,168,37,0.2)" },
  answerAckText: { fontSize: 13, color: "#fff", fontWeight: "600", flex: 1 },
  reviewCard: {
    backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 12,
    padding: 14, marginTop: 8, alignItems: "center",
  },
  reviewText: { fontSize: 13, color: "rgba(255,255,255,0.7)" },
  endContainer: {
    flex: 1, justifyContent: "center", alignItems: "center",
    backgroundColor: COLORS.bg, padding: 32, gap: 12,
  },
  endEmoji: { fontSize: 64, marginBottom: 8 },
  endTitle: { fontSize: 26, fontWeight: "900", color: COLORS.text, textAlign: "center" },
  endPrize: { fontSize: 36, fontWeight: "900", color: COLORS.gold },
  endSub: { fontSize: 15, color: COLORS.textSub, textAlign: "center" },
  endStats: { fontSize: 14, color: COLORS.textSub, textAlign: "center" },
  endEncouragement: { fontSize: 15, color: COLORS.textSub, textAlign: "center", fontStyle: "italic" },
  endBtn: {
    backgroundColor: COLORS.primary, borderRadius: 14, paddingHorizontal: 28,
    paddingVertical: 14, marginTop: 16,
  },
  endBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
});
