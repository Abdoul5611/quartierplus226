import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  ActivityIndicator, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { BASE_URL } from "../services/api";

const C = {
  primary: "#00838F",
  bg: "#E0F7FA",
  card: "#FFFFFF",
  text: "#1A1A1A",
  sub: "#6B7280",
  gold: "#F9A825",
  selected: "#00838F",
  drawn: "#43A047",
  hit: "#F9A825",
  border: "#B2EBF2",
};

const PRIZES: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 150, 4: 750, 5: 5000 };
const KENO_COST = 75;
const MAX_PICKS = 5;
const NUMBERS = Array.from({ length: 30 }, (_, i) => i + 1);

export default function KenoScreen() {
  const navigation = useNavigation<any>();
  const { dbUser, firebaseUser } = useAuth() as any;
  const balance = dbUser?.wallet_balance ?? 0;

  const [picks, setPicks] = useState<number[]>([]);
  const [drawn, setDrawn] = useState<number[]>([]);
  const [matches, setMatches] = useState<number | null>(null);
  const [prize, setPrize] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [played, setPlayed] = useState(false);
  const [serverBalance, setServerBalance] = useState<number | null>(null);

  const currentBalance = serverBalance ?? balance;

  const togglePick = (n: number) => {
    if (played) return;
    setPicks(prev => {
      if (prev.includes(n)) return prev.filter(x => x !== n);
      if (prev.length >= MAX_PICKS) { Alert.alert("Maximum", `Vous pouvez choisir ${MAX_PICKS} numéros maximum.`); return prev; }
      return [...prev, n];
    });
  };

  const handlePlay = async () => {
    if (!firebaseUser) return Alert.alert("Connexion requise", "Connectez-vous dans Profil.");
    if (picks.length !== MAX_PICKS) return Alert.alert("", `Choisissez exactement ${MAX_PICKS} numéros.`);
    if (currentBalance < KENO_COST) return Alert.alert("Solde insuffisant", `Il vous faut ${KENO_COST} FCFA.`);
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/games/keno/play`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: firebaseUser.uid, picks }),
      });
      const data = await res.json();
      if (!res.ok) { Alert.alert("Erreur", data.error); return; }
      setDrawn(data.drawn);
      setMatches(data.matches);
      setPrize(data.prize);
      setServerBalance(data.balance);
      setPlayed(true);
    } catch { Alert.alert("Erreur réseau", "Réessayez."); }
    finally { setLoading(false); }
  };

  const handleReset = () => {
    setPicks([]);
    setDrawn([]);
    setMatches(null);
    setPrize(null);
    setPlayed(false);
  };

  const isHit = (n: number) => picks.includes(n) && drawn.includes(n);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🎯 Keno Express</Text>
        <View style={styles.balanceBadge}>
          <Text style={styles.balanceText}>{currentBalance.toLocaleString()} FCFA</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.infoRow}>
          <View style={styles.infoChip}>
            <Text style={styles.infoChipLabel}>Mise</Text>
            <Text style={styles.infoChipVal}>{KENO_COST} FCFA</Text>
          </View>
          <View style={styles.infoChip}>
            <Text style={styles.infoChipLabel}>Choix</Text>
            <Text style={[styles.infoChipVal, picks.length === MAX_PICKS && { color: C.primary }]}>{picks.length}/{MAX_PICKS}</Text>
          </View>
          <View style={styles.infoChip}>
            <Text style={styles.infoChipLabel}>Jackpot</Text>
            <Text style={[styles.infoChipVal, { color: C.gold }]}>5 000 FCFA</Text>
          </View>
        </View>

        <View style={styles.prizeTable}>
          <Text style={styles.prizeTableTitle}>Grille des gains</Text>
          <View style={styles.prizeRow}>
            {[3, 4, 5].map(k => (
              <View key={k} style={styles.prizeCell}>
                <Text style={styles.prizeCellMatch}>{k} / 10</Text>
                <Text style={[styles.prizeCellAmt, k === 5 && { color: C.gold }]}>{PRIZES[k].toLocaleString()}</Text>
                <Text style={styles.prizeCellUnit}>FCFA</Text>
              </View>
            ))}
          </View>
        </View>

        <Text style={styles.gridTitle}>
          {played ? "🎰 Résultats du tirage" : "Choisissez 5 numéros (1–30)"}
        </Text>

        <View style={styles.numbersGrid}>
          {NUMBERS.map(n => {
            const isPicked = picks.includes(n);
            const isDrawn = drawn.includes(n);
            const hitCell = isHit(n);
            return (
              <TouchableOpacity
                key={n}
                onPress={() => togglePick(n)}
                disabled={played}
                style={[
                  styles.numBtn,
                  isPicked && !played && styles.numBtnPicked,
                  played && isDrawn && styles.numBtnDrawn,
                  played && hitCell && styles.numBtnHit,
                ]}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.numText,
                  isPicked && !played && styles.numTextPicked,
                  played && isDrawn && styles.numTextDrawn,
                  played && hitCell && styles.numTextHit,
                ]}>{n}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {played && drawn.length > 0 && (
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>
              {(prize ?? 0) > 0 ? "🎉 Félicitations !" : "😔 Pas de chance cette fois"}
            </Text>
            <Text style={styles.resultMatches}>{matches} numéro{matches !== 1 ? "s" : ""} trouvé{matches !== 1 ? "s" : ""} sur 10 tirés</Text>
            {(prize ?? 0) > 0 && <Text style={styles.resultPrize}>+{prize!.toLocaleString()} FCFA</Text>}
            <View style={styles.drawnRow}>
              <Text style={styles.drawnLabel}>Numéros tirés :</Text>
              <Text style={styles.drawnNumbers}>{drawn.join(" · ")}</Text>
            </View>
          </View>
        )}

        {!played ? (
          <TouchableOpacity
            style={[styles.playBtn, (loading || picks.length !== MAX_PICKS || currentBalance < KENO_COST) && styles.playBtnDisabled]}
            onPress={handlePlay}
            disabled={loading || picks.length !== MAX_PICKS || currentBalance < KENO_COST}
          >
            {loading ? <ActivityIndicator color="#fff" /> : (
              <Text style={styles.playBtnText}>
                {picks.length !== MAX_PICKS ? `Choisissez ${MAX_PICKS - picks.length} numéro(s) de plus` : `🎯 Lancer le tirage — ${KENO_COST} FCFA`}
              </Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.playBtn} onPress={handleReset}>
            <Text style={styles.playBtnText}>🔄 Nouveau tirage</Text>
          </TouchableOpacity>
        )}

        {currentBalance < KENO_COST && !played && (
          <TouchableOpacity style={styles.rechargeBtn} onPress={() => navigation.navigate("Profil")}>
            <Text style={styles.rechargeBtnText}>💳 Recharger mon portefeuille</Text>
          </TouchableOpacity>
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
  infoRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  infoChip: { flex: 1, backgroundColor: C.card, borderRadius: 12, padding: 12, alignItems: "center", borderWidth: 1, borderColor: C.border },
  infoChipLabel: { fontSize: 11, color: C.sub, fontWeight: "600", textTransform: "uppercase" },
  infoChipVal: { fontSize: 15, fontWeight: "800", color: C.text, marginTop: 2 },
  prizeTable: { backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 16 },
  prizeTableTitle: { fontSize: 12, fontWeight: "700", color: C.sub, textTransform: "uppercase", marginBottom: 10, textAlign: "center" },
  prizeRow: { flexDirection: "row", justifyContent: "space-around" },
  prizeCell: { alignItems: "center", gap: 2 },
  prizeCellMatch: { fontSize: 13, fontWeight: "700", color: C.primary },
  prizeCellAmt: { fontSize: 16, fontWeight: "900", color: C.text },
  prizeCellUnit: { fontSize: 10, color: C.sub },
  gridTitle: { fontSize: 14, fontWeight: "700", color: C.text, marginBottom: 12, textAlign: "center" },
  numbersGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center", marginBottom: 20 },
  numBtn: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: C.card,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: C.border,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 2, elevation: 1,
  },
  numBtnPicked: { backgroundColor: C.primary, borderColor: C.primary },
  numBtnDrawn: { backgroundColor: "#E0F2F1", borderColor: C.drawn },
  numBtnHit: { backgroundColor: C.gold, borderColor: C.gold },
  numText: { fontSize: 14, fontWeight: "700", color: C.text },
  numTextPicked: { color: "#fff" },
  numTextDrawn: { color: C.drawn, fontWeight: "800" },
  numTextHit: { color: "#fff" },
  resultCard: { backgroundColor: C.card, borderRadius: 16, padding: 18, marginBottom: 16, alignItems: "center", gap: 8 },
  resultTitle: { fontSize: 20, fontWeight: "900", color: C.text },
  resultMatches: { fontSize: 14, color: C.sub },
  resultPrize: { fontSize: 26, fontWeight: "900", color: C.gold },
  drawnRow: { alignItems: "center", gap: 4 },
  drawnLabel: { fontSize: 12, color: C.sub, fontWeight: "600" },
  drawnNumbers: { fontSize: 13, color: C.text, fontWeight: "700" },
  playBtn: { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 16, alignItems: "center", marginBottom: 12 },
  playBtnDisabled: { opacity: 0.5 },
  playBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  rechargeBtn: { backgroundColor: "#2E7D32", borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  rechargeBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
