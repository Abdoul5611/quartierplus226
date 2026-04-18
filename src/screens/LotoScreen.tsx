import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Modal,
  FlatList,
  Alert,
  Platform,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { api, LotoTicket, BASE_URL } from "../services/api";

function getLotoWsUrl(): string {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}`;
  }
  return BASE_URL.replace("https://", "wss://").replace("http://", "ws://");
}

const COLORS = {
  primary: "#2E7D32",
  primaryLight: "#E8F5E9",
  gold: "#F9A825",
  goldLight: "#FFF8E1",
  red: "#C62828",
  redLight: "#FFEBEE",
  blue: "#1565C0",
  blueLight: "#E3F2FD",
  bg: "#F5F5F5",
  card: "#FFFFFF",
  text: "#212121",
  textSub: "#757575",
  border: "#E0E0E0",
  selected: "#2E7D32",
  selectedLight: "#E8F5E9",
};

const TOTAL = 30;
const PICK = 5;
const TICKET_PRICE = 100;
const PRIZES: Record<number, number> = { 3: 300, 4: 1500, 5: 50000 };

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

type DrawResult = {
  drawnNumbers: number[];
  matchedCount: number;
  prizeAmount: number;
  newBalance: number;
  isJackpot: boolean;
  chosenNumbers: number[];
};

export default function LotoScreen({ navigation }: any) {
  const { user, dbUser, refreshUser } = useAuth() as any;
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DrawResult | null>(null);
  const [pendingTicket, setPendingTicket] = useState<{ chosenNumbers: number[]; ticketId: string } | null>(null);
  const [history, setHistory] = useState<LotoTicket[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const confirmOpacity = useRef(new Animated.Value(0)).current;
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const balance = dbUser?.wallet_balance ?? 0;
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!user?.uid) return;
    let alive = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (!alive) return;
      try {
        const ws = new WebSocket(getLotoWsUrl());
        wsRef.current = ws;
        ws.onopen = () => ws.send(JSON.stringify({ type: "register", uid: user.uid }));
        ws.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data.type === "loto_result") {
              if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
              setPendingTicket(null);
              refreshUser?.();
              loadHistory();
              setResult({
                drawnNumbers: data.drawn_numbers ?? [],
                matchedCount: data.matched_count ?? 0,
                prizeAmount: data.prize_amount ?? 0,
                newBalance: data.new_balance ?? balance,
                isJackpot: (data.matched_count ?? 0) >= 5,
                chosenNumbers: data.chosen_numbers ?? [],
              });
            }
          } catch {}
        };
        ws.onclose = () => { if (alive) reconnectTimer = setTimeout(connect, 5000); };
        ws.onerror = () => ws.close();
      } catch {}
    }

    connect();
    return () => {
      alive = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [user?.uid]);

  const showConfirmToast = () => {
    setShowConfirm(true);
    Animated.sequence([
      Animated.timing(confirmOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.delay(1600),
      Animated.timing(confirmOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setShowConfirm(false));
  };

  const loadHistory = useCallback(async () => {
    if (!user?.uid) return;
    setHistoryLoading(true);
    try {
      const h = await api.getLotoHistory(user.uid);
      setHistory(h);
    } catch {
    } finally {
      setHistoryLoading(false);
    }
  }, [user?.uid]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const startResultPolling = (ticketId: string, chosen: number[]) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const h = await api.getLotoHistory(user?.uid);
        const found = h.find((t: LotoTicket) => t.id === ticketId && t.status === "completed");
        if (found) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setPendingTicket(null);
          setHistory(h);
          await refreshUser?.();
          setResult({
            drawnNumbers: found.drawn_numbers ?? [],
            matchedCount: found.matched_count ?? 0,
            prizeAmount: found.prize_amount ?? 0,
            newBalance: (dbUser?.wallet_balance ?? 0) + (found.prize_amount ?? 0),
            isJackpot: (found.matched_count ?? 0) >= 5,
            chosenNumbers: chosen,
          });
        }
      } catch {}
    }, 8000);
  };

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const toggleNumber = (n: number) => {
    if (result || pendingTicket) return;
    setSelected((prev) => {
      if (prev.includes(n)) return prev.filter((x) => x !== n);
      if (prev.length >= PICK) return prev;
      return [...prev, n];
    });
  };

  const handleBuy = async () => {
    if (!user?.uid) {
      Alert.alert("Connexion requise", "Veuillez vous connecter pour jouer.");
      return;
    }
    if (selected.length < PICK) {
      Alert.alert("Sélection incomplète", `Veuillez choisir ${PICK} numéros.`);
      return;
    }
    if (balance < TICKET_PRICE) {
      Alert.alert(
        "Solde insuffisant",
        `Il vous faut au moins ${TICKET_PRICE} FCFA pour jouer.\nSolde actuel : ${balance} FCFA`,
        [{ text: "OK" }]
      );
      return;
    }

    setLoading(true);
    try {
      const res = await api.buyLotoTicket(user.uid, selected);
      await refreshUser?.();
      await loadHistory();

      if (res.pending) {
        const ticketId = res.ticket?.id;
        const chosen = [...selected];
        setPendingTicket({ chosenNumbers: chosen, ticketId });
        showConfirmToast();
        if (ticketId) startResultPolling(ticketId, chosen);
      } else {
        showConfirmToast();
        await new Promise((r) => setTimeout(r, 2200));
        setResult({
          drawnNumbers: res.drawn_numbers ?? res.drawnNumbers ?? [],
          matchedCount: res.matched_count ?? res.matchedCount ?? 0,
          prizeAmount: res.prize_amount ?? res.prizeAmount ?? 0,
          newBalance: res.new_balance ?? res.newBalance ?? balance,
          isJackpot: res.is_jackpot ?? res.isJackpot ?? false,
          chosenNumbers: selected,
        });
      }
    } catch (err: any) {
      Alert.alert("Erreur", err?.message || "Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSelected([]);
    setResult(null);
    setPendingTicket(null);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };

  const getResultColor = () => {
    if (!result) return COLORS.primary;
    if (result.isJackpot) return COLORS.gold;
    if (result.prizeAmount > 0) return "#388E3C";
    return COLORS.red;
  };

  const getResultIcon = () => {
    if (!result) return "trophy";
    if (result.isJackpot) return "star";
    if (result.prizeAmount > 0) return "checkmark-circle";
    return "close-circle";
  };

  const getResultTitle = () => {
    if (!result) return "";
    if (result.isJackpot) return "🎉 JACKPOT !";
    if (result.prizeAmount > 0) return `Bravo ! ${result.matchedCount} bons numéros !`;
    return "Pas de chance cette fois…";
  };

  const renderNumber = (n: number) => {
    const isSelected = selected.includes(n);
    const isDrawn = result?.drawnNumbers.includes(n);
    const isChosen = result?.chosenNumbers.includes(n);
    const isMatch = isDrawn && isChosen;

    let bgColor = COLORS.card;
    let textColor = COLORS.text;
    let borderColor = COLORS.border;

    if (result) {
      if (isMatch) {
        bgColor = COLORS.primary;
        textColor = "#fff";
        borderColor = COLORS.primary;
      } else if (isDrawn) {
        bgColor = COLORS.goldLight;
        textColor = COLORS.gold;
        borderColor = COLORS.gold;
      } else if (isChosen) {
        bgColor = COLORS.redLight;
        textColor = COLORS.red;
        borderColor = COLORS.red;
      }
    } else if (isSelected) {
      bgColor = COLORS.primaryLight;
      textColor = COLORS.primary;
      borderColor = COLORS.primary;
    }

    return (
      <TouchableOpacity
        key={n}
        onPress={() => toggleNumber(n)}
        disabled={!!result}
        style={[styles.numberCell, { backgroundColor: bgColor, borderColor }]}
        activeOpacity={0.7}
      >
        <Text style={[styles.numberText, { color: textColor }]}>{n}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack?.()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.primary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Loto 5/30</Text>
          <Text style={styles.headerSub}>Choisissez 5 numéros — 100 FCFA</Text>
        </View>
        <TouchableOpacity
          onPress={() => { setShowHistory(true); loadHistory(); }}
          style={styles.historyBtn}
        >
          <Ionicons name="time-outline" size={22} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.walletCard}>
          <Ionicons name="wallet-outline" size={18} color={COLORS.primary} />
          <Text style={styles.walletText}>
            Solde : <Text style={styles.walletBold}>{balance.toLocaleString("fr-FR")} FCFA</Text>
          </Text>
        </View>

        <View style={styles.prizeTable}>
          <Text style={styles.prizeTitle}>Tableau des gains</Text>
          <View style={styles.prizeRow}>
            <View style={[styles.prizeBadge, { backgroundColor: "#E8F5E9" }]}>
              <Text style={[styles.prizeMatch, { color: COLORS.primary }]}>3 numéros</Text>
            </View>
            <Text style={styles.prizeAmount}>300 FCFA</Text>
          </View>
          <View style={styles.prizeRow}>
            <View style={[styles.prizeBadge, { backgroundColor: COLORS.blueLight }]}>
              <Text style={[styles.prizeMatch, { color: COLORS.blue }]}>4 numéros</Text>
            </View>
            <Text style={styles.prizeAmount}>1 500 FCFA</Text>
          </View>
          <View style={[styles.prizeRow, styles.jackpotRow]}>
            <View style={[styles.prizeBadge, { backgroundColor: COLORS.goldLight }]}>
              <Text style={[styles.prizeMatch, { color: COLORS.gold }]}>5 numéros</Text>
            </View>
            <Text style={[styles.prizeAmount, { color: COLORS.gold, fontWeight: "800" }]}>JACKPOT — 50 000 FCFA</Text>
          </View>
        </View>

        <View style={styles.selectionBar}>
          <Text style={styles.selectionLabel}>
            {result ? "Tirage effectué"
              : pendingTicket ? `🎟️ Ticket en attente — ${pendingTicket.chosenNumbers.join(" - ")}`
              : `Numéros choisis : ${selected.length} / ${PICK}`}
          </Text>
          {selected.length > 0 && !result && !pendingTicket && (
            <TouchableOpacity onPress={() => setSelected([])}>
              <Text style={styles.clearText}>Effacer</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.grid}>
          {Array.from({ length: TOTAL }, (_, i) => i + 1).map(renderNumber)}
        </View>

        {pendingTicket && !result && (
          <View style={[styles.resultCard, { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight }]}>
            <Ionicons name="time-outline" size={40} color={COLORS.primary} />
            <Text style={[styles.resultTitle, { color: COLORS.primary }]}>🎟️ Ticket enregistré !</Text>
            <Text style={{ textAlign: "center", color: COLORS.textSub, fontSize: 13, marginBottom: 8, lineHeight: 20 }}>
              Vos numéros ont été enregistrés.{"\n"}Les résultats seront publiés lors du prochain tirage admin.{"\n"}La page se mettra à jour automatiquement.
            </Text>
            <View style={styles.drawnRow}>
              <Text style={styles.drawnLabel}>Vos numéros :</Text>
              <View style={styles.drawnNumbers}>
                {pendingTicket.chosenNumbers.map(n => (
                  <View key={n} style={[styles.drawnBall, { backgroundColor: COLORS.primary }]}>
                    <Text style={[styles.drawnBallText, { color: "#fff" }]}>{n}</Text>
                  </View>
                ))}
              </View>
            </View>
            <ActivityIndicator color={COLORS.primary} style={{ marginTop: 8, marginBottom: 4 }} />
            <Text style={{ color: COLORS.textSub, fontSize: 12 }}>En attente du tirage…</Text>
            <TouchableOpacity style={[styles.playAgainBtn, { backgroundColor: COLORS.border, marginTop: 12 }]} onPress={handleReset}>
              <Text style={[styles.playAgainText, { color: COLORS.text }]}>Fermer et jouer un autre ticket</Text>
            </TouchableOpacity>
          </View>
        )}

        {result && (
          <View style={[styles.resultCard, { borderColor: getResultColor() }]}>
            <Ionicons name={getResultIcon() as any} size={40} color={getResultColor()} />
            <Text style={[styles.resultTitle, { color: getResultColor() }]}>{getResultTitle()}</Text>

            <View style={styles.drawnRow}>
              <Text style={styles.drawnLabel}>Numéros tirés :</Text>
              <View style={styles.drawnNumbers}>
                {result.drawnNumbers.map((n) => {
                  const isMatch = result.chosenNumbers.includes(n);
                  return (
                    <View key={n} style={[styles.drawnBall, isMatch && { backgroundColor: COLORS.primary }]}>
                      <Text style={[styles.drawnBallText, isMatch && { color: "#fff" }]}>{n}</Text>
                    </View>
                  );
                })}
              </View>
            </View>

            {result.prizeAmount > 0 ? (
              <View style={styles.gainBox}>
                <Text style={styles.gainLabel}>Gains crédités</Text>
                <Text style={[styles.gainAmount, { color: getResultColor() }]}>
                  +{result.prizeAmount.toLocaleString("fr-FR")} FCFA
                </Text>
              </View>
            ) : (
              <Text style={styles.loseText}>Coût : -{TICKET_PRICE} FCFA</Text>
            )}

            <Text style={styles.newBalance}>
              Nouveau solde : {(result.newBalance).toLocaleString("fr-FR")} FCFA
            </Text>

            <TouchableOpacity style={styles.playAgainBtn} onPress={handleReset}>
              <Text style={styles.playAgainText}>Rejouer</Text>
            </TouchableOpacity>
          </View>
        )}

        {!result && !pendingTicket && (
          <TouchableOpacity
            style={[
              styles.buyBtn,
              selected.length === PICK && balance >= TICKET_PRICE && !loading
                ? styles.buyBtnActive
                : styles.buyBtnDisabled,
            ]}
            onPress={handleBuy}
            disabled={selected.length < PICK || loading || balance < TICKET_PRICE}
            activeOpacity={0.85}
          >
            {loading ? (
              <View style={styles.buyInner}>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.buyText}>Enregistrement du ticket…</Text>
              </View>
            ) : (
              <View style={styles.buyInner}>
                <Ionicons name="ticket" size={22} color="#fff" />
                <View style={styles.buyTextBlock}>
                  <Text style={styles.buyText}>
                    {balance < TICKET_PRICE
                      ? `Solde insuffisant — min. ${TICKET_PRICE} FCFA`
                      : selected.length < PICK
                      ? `Choisissez encore ${PICK - selected.length} numéro${PICK - selected.length > 1 ? "s" : ""}`
                      : "Acheter mon ticket"}
                  </Text>
                  {selected.length === PICK && balance >= TICKET_PRICE && (
                    <Text style={styles.buySubText}>100 FCFA sera déduit de votre solde</Text>
                  )}
                </View>
                {selected.length === PICK && balance >= TICKET_PRICE && (
                  <View style={styles.buyPriceBadge}>
                    <Text style={styles.buyPriceText}>100 FCFA</Text>
                  </View>
                )}
              </View>
            )}
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {showConfirm && (
        <Animated.View style={[styles.confirmToast, { opacity: confirmOpacity }]}>
          <Ionicons name="checkmark-circle" size={22} color="#fff" />
          <View>
            <Text style={styles.confirmTitle}>Ticket enregistré !</Text>
            <Text style={styles.confirmSub}>Bonne chance 🍀 — tirage en cours…</Text>
          </View>
        </Animated.View>
      )}

      <Modal visible={showHistory} animationType="slide" onRequestClose={() => setShowHistory(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Mes tickets</Text>
            <TouchableOpacity onPress={() => setShowHistory(false)}>
              <Ionicons name="close" size={26} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          {historyLoading ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
          ) : history.length === 0 ? (
            <View style={styles.emptyHistory}>
              <Ionicons name="ticket-outline" size={48} color={COLORS.border} />
              <Text style={styles.emptyText}>Aucun ticket pour l'instant</Text>
            </View>
          ) : (
            <FlatList
              data={history}
              keyExtractor={(t) => t.id}
              contentContainerStyle={{ padding: 16 }}
              renderItem={({ item }) => {
                const isPending = item.status === "pending";
                const won = !isPending && (item.prize_amount ?? 0) > 0;
                const jackpot = !isPending && item.matched_count === 5;
                return (
                  <View style={[styles.historyCard,
                    isPending ? { borderLeftColor: COLORS.primary, borderLeftWidth: 4 }
                    : won ? { borderLeftColor: jackpot ? COLORS.gold : COLORS.primary }
                    : {}
                  ]}>
                    <View style={styles.historyTop}>
                      <View style={styles.historyNumbers}>
                        {(item.chosen_numbers ?? []).map((n) => {
                          const isMatch = !isPending && (item.drawn_numbers ?? []).includes(n);
                          return (
                            <View key={n} style={[styles.histBall, isMatch && { backgroundColor: COLORS.primary }]}>
                              <Text style={[styles.histBallText, isMatch && { color: "#fff" }]}>{n}</Text>
                            </View>
                          );
                        })}
                      </View>
                      <View style={styles.histResult}>
                        {isPending ? (
                          <Text style={[styles.histWon, { color: COLORS.primary, fontSize: 12 }]}>⏳ En attente</Text>
                        ) : (
                          <Text style={[styles.histWon, { color: won ? (jackpot ? COLORS.gold : COLORS.primary) : COLORS.red }]}>
                            {jackpot ? "JACKPOT !" : won ? `+${item.prize_amount} FCFA` : `-${TICKET_PRICE} FCFA`}
                          </Text>
                        )}
                        {!isPending && <Text style={styles.histMatch}>{item.matched_count} bon(s)</Text>}
                      </View>
                    </View>
                    <Text style={styles.histDate}>{formatDate(item.created_at)}</Text>
                  </View>
                );
              }}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

const CELL = 52;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: Platform.OS === "ios" ? 56 : 16,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: COLORS.card,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
  },
  backBtn: { padding: 4, marginRight: 8 },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 18, fontWeight: "700", color: COLORS.text },
  headerSub: { fontSize: 12, color: COLORS.textSub, marginTop: 1 },
  historyBtn: { padding: 4 },
  scroll: { padding: 16 },
  walletCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.primaryLight,
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
    gap: 8,
  },
  walletText: { fontSize: 14, color: COLORS.primary },
  walletBold: { fontWeight: "700" },
  prizeTable: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    gap: 8,
  },
  prizeTitle: { fontSize: 13, fontWeight: "700", color: COLORS.textSub, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  prizeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  jackpotRow: { borderTopWidth: 0.5, borderTopColor: COLORS.border, paddingTop: 8, marginTop: 4 },
  prizeBadge: { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3 },
  prizeMatch: { fontSize: 13, fontWeight: "600" },
  prizeAmount: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  selectionBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  selectionLabel: { fontSize: 13, fontWeight: "600", color: COLORS.textSub },
  clearText: { fontSize: 13, color: COLORS.red, fontWeight: "600" },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "flex-start",
    marginBottom: 16,
  },
  numberCell: {
    width: CELL,
    height: CELL,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  numberText: { fontSize: 16, fontWeight: "700" },
  buyBtn: {
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 20,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  buyBtnActive: { backgroundColor: COLORS.primary },
  buyBtnDisabled: { backgroundColor: "#BDBDBD", shadowOpacity: 0 },
  buyInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  buyTextBlock: { flex: 1 },
  buyText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  buySubText: { color: "rgba(255,255,255,0.8)", fontSize: 12, marginTop: 2 },
  buyPriceBadge: {
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  buyPriceText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  confirmToast: {
    position: "absolute",
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 999,
  },
  confirmTitle: { color: "#fff", fontWeight: "700", fontSize: 15 },
  confirmSub: { color: "rgba(255,255,255,0.85)", fontSize: 12, marginTop: 2 },
  resultCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    alignItems: "center",
    marginBottom: 16,
    gap: 10,
  },
  resultTitle: { fontSize: 22, fontWeight: "800" },
  drawnRow: { width: "100%", alignItems: "center", gap: 6 },
  drawnLabel: { fontSize: 12, color: COLORS.textSub, fontWeight: "600", textTransform: "uppercase" },
  drawnNumbers: { flexDirection: "row", gap: 6, flexWrap: "wrap", justifyContent: "center" },
  drawnBall: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.goldLight,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: COLORS.gold,
  },
  drawnBallText: { fontSize: 14, fontWeight: "700", color: COLORS.gold },
  gainBox: { alignItems: "center" },
  gainLabel: { fontSize: 12, color: COLORS.textSub },
  gainAmount: { fontSize: 26, fontWeight: "900" },
  loseText: { fontSize: 14, color: COLORS.red, fontWeight: "600" },
  newBalance: { fontSize: 13, color: COLORS.textSub },
  playAgainBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 12,
    marginTop: 4,
  },
  playAgainText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  modalContainer: { flex: 1, backgroundColor: COLORS.bg },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 56 : 16,
    paddingBottom: 12,
    backgroundColor: COLORS.card,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: COLORS.text },
  emptyHistory: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, opacity: 0.5 },
  emptyText: { fontSize: 15, color: COLORS.textSub },
  historyCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.red,
  },
  historyTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  historyNumbers: { flexDirection: "row", gap: 4, flexWrap: "wrap", flex: 1 },
  histBall: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F5F5F5",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  histBallText: { fontSize: 11, fontWeight: "700", color: COLORS.text },
  histResult: { alignItems: "flex-end", marginLeft: 8 },
  histWon: { fontSize: 15, fontWeight: "800" },
  histMatch: { fontSize: 11, color: COLORS.textSub },
  histDate: { fontSize: 11, color: COLORS.textSub, marginTop: 2 },
});
