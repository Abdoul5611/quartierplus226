import React, { useState, useRef, useEffect } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  ActivityIndicator, Alert, ScrollView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { BASE_URL } from "../services/api";

const C = {
  primary: "#2E7D32",
  gold: "#F9A825",
  bg: "#FFF8E1",
  card: "#FFFFFF",
  text: "#1A1A1A",
  sub: "#6B7280",
  border: "#E0E0E0",
  win: "#2E7D32",
  lose: "#C62828",
};

const PRIZE_TABLE = [
  { sym: "🍋", prize: 200 }, { sym: "🍊", prize: 300 }, { sym: "🍇", prize: 500 },
  { sym: "⭐", prize: 750 }, { sym: "🔔", prize: 400 }, { sym: "🌸", prize: 350 },
  { sym: "🍀", prize: 1000 }, { sym: "🎯", prize: 1500 }, { sym: "💎", prize: 2000 },
];

function ScratchCell({
  symbol, revealed, onReveal, isWinCell, disabled,
}: {
  symbol: string; revealed: boolean; onReveal: () => void; isWinCell: boolean; disabled: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const handlePress = () => {
    if (revealed || disabled) return;
    Animated.parallel([
      Animated.spring(scale, { toValue: 1.15, useNativeDriver: true, speed: 30 }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start(() => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start());
    onReveal();
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.8} disabled={disabled && !revealed}>
      <Animated.View style={[
        styles.cell,
        revealed && styles.cellRevealed,
        revealed && isWinCell && styles.cellWin,
        { transform: [{ scale }] },
      ]}>
        {revealed ? (
          <Animated.Text style={[styles.cellSymbol, { opacity }]}>{symbol}</Animated.Text>
        ) : (
          <Text style={styles.cellHidden}>?</Text>
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

export default function ScratchScreen() {
  const navigation = useNavigation<any>();
  const { dbUser, firebaseUser } = useAuth() as any;
  const balance = dbUser?.wallet_balance ?? 0;

  const [grid, setGrid] = useState<string[] | null>(null);
  const [revealed, setRevealed] = useState<boolean[]>(new Array(9).fill(false));
  const [winLine, setWinLine] = useState<number[]>([]);
  const [prize, setPrize] = useState(0);
  const [won, setWon] = useState(false);
  const [loading, setLoading] = useState(false);
  const [played, setPlayed] = useState(false);
  const [serverBalance, setServerBalance] = useState<number | null>(null);

  const revealAll = useRef(false);

  const handlePlay = async () => {
    if (!firebaseUser) return Alert.alert("Connexion requise", "Connectez-vous dans Profil.");
    if (balance < 50 && serverBalance === null) return Alert.alert("Solde insuffisant", "Il vous faut 50 FCFA.");
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/games/scratch/play`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uid: firebaseUser.uid }),
      });
      const data = await res.json();
      if (!res.ok) { Alert.alert("Erreur", data.error); return; }
      setGrid(data.grid);
      setRevealed(new Array(9).fill(false));
      setWinLine(data.winLine || []);
      setPrize(data.prize || 0);
      setWon(data.won || false);
      setPlayed(true);
      setServerBalance(data.balance);
      revealAll.current = false;
    } catch { Alert.alert("Erreur réseau", "Réessayez."); }
    finally { setLoading(false); }
  };

  const revealCell = (idx: number) => {
    setRevealed(prev => {
      const next = [...prev];
      next[idx] = true;
      return next;
    });
  };

  const revealAllCells = () => {
    if (!grid || revealAll.current) return;
    revealAll.current = true;
    grid.forEach((_, i) => {
      setTimeout(() => revealCell(i), i * 80);
    });
    setTimeout(() => {
      if (won && prize > 0) {
        Alert.alert("🎉 GAGNÉ !", `Ligne gagnante ! Vous remportez ${prize.toLocaleString()} FCFA !`);
      } else {
        Alert.alert("😔 Perdu", "Pas de ligne gagnante cette fois. Retentez votre chance !");
      }
    }, 9 * 80 + 300);
  };

  const currentBalance = serverBalance ?? balance;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>🍀 Grattage Instantané</Text>
        <View style={styles.balanceBadge}>
          <Text style={styles.balanceText}>{currentBalance.toLocaleString()} FCFA</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.priceCard}>
          <Text style={styles.priceLine}>🎟️ Prix : <Text style={{ fontWeight: "800", color: C.primary }}>50 FCFA</Text></Text>
          <Text style={styles.priceLine}>🏆 Grattez 3 symboles identiques en ligne pour gagner</Text>
        </View>

        <View style={styles.prizeTable}>
          <Text style={styles.prizeTableTitle}>Tableau des gains</Text>
          <View style={styles.prizeRow}>
            {PRIZE_TABLE.map(({ sym, prize: p }) => (
              <View key={sym} style={styles.prizeCell}>
                <Text style={styles.prizeSym}>{sym}</Text>
                <Text style={styles.prizeAmt}>{p}</Text>
              </View>
            ))}
          </View>
        </View>

        {grid ? (
          <View style={styles.gridWrapper}>
            <Text style={styles.gridLabel}>
              {revealed.filter(Boolean).length < 9 ? "Grattez toutes les cases !" : (won ? `🎉 Gagné : ${prize.toLocaleString()} FCFA !` : "😔 Perdu — Retentez !")}
            </Text>
            <View style={styles.grid}>
              {grid.map((sym, i) => (
                <ScratchCell
                  key={i}
                  symbol={sym}
                  revealed={revealed[i]}
                  onReveal={() => revealCell(i)}
                  isWinCell={winLine.includes(i)}
                  disabled={played && revealed.filter(Boolean).length >= 9}
                />
              ))}
            </View>
            {revealed.filter(Boolean).length > 0 && revealed.filter(Boolean).length < 9 && (
              <TouchableOpacity style={styles.revealAllBtn} onPress={revealAllCells}>
                <Text style={styles.revealAllBtnText}>Tout révéler</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.placeholderGrid}>
            <Text style={styles.placeholderText}>Achetez un ticket pour gratter !</Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.playBtn, (loading || currentBalance < 50) && styles.playBtnDisabled]}
          onPress={grid ? handlePlay : handlePlay}
          disabled={loading || currentBalance < 50}
        >
          {loading ? <ActivityIndicator color="#fff" /> : (
            <Text style={styles.playBtnText}>{grid ? "🎟️ Nouveau ticket — 50 FCFA" : "🎟️ Acheter un ticket — 50 FCFA"}</Text>
          )}
        </TouchableOpacity>

        {currentBalance < 50 && (
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
  priceCard: { backgroundColor: "#FFF9C4", borderRadius: 14, padding: 14, marginBottom: 16, gap: 4 },
  priceLine: { fontSize: 13, color: C.text, lineHeight: 20 },
  prizeTable: { backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 16 },
  prizeTableTitle: { fontSize: 12, fontWeight: "700", color: C.sub, textTransform: "uppercase", marginBottom: 10 },
  prizeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  prizeCell: { alignItems: "center", minWidth: 48 },
  prizeSym: { fontSize: 20 },
  prizeAmt: { fontSize: 11, color: C.gold, fontWeight: "700" },
  gridWrapper: { alignItems: "center", marginBottom: 20 },
  gridLabel: { fontSize: 14, fontWeight: "700", color: C.text, marginBottom: 14, textAlign: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", width: 246, gap: 6 },
  cell: {
    width: 78, height: 78, borderRadius: 14, backgroundColor: "#E0E0E0",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3,
  },
  cellRevealed: { backgroundColor: "#FFF9C4" },
  cellWin: { backgroundColor: "#C8E6C9", borderWidth: 2, borderColor: C.primary },
  cellSymbol: { fontSize: 32 },
  cellHidden: { fontSize: 28, fontWeight: "900", color: C.sub },
  revealAllBtn: { marginTop: 14, backgroundColor: "#F5F5F5", borderRadius: 10, paddingHorizontal: 20, paddingVertical: 8 },
  revealAllBtnText: { fontSize: 13, color: C.sub, fontWeight: "600" },
  placeholderGrid: {
    width: 246, height: 246, borderRadius: 18, borderWidth: 2, borderColor: C.border, borderStyle: "dashed",
    alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 20,
  },
  placeholderText: { fontSize: 14, color: C.sub, textAlign: "center" },
  playBtn: { backgroundColor: C.gold, borderRadius: 14, paddingVertical: 16, alignItems: "center", marginBottom: 12 },
  playBtnDisabled: { opacity: 0.5 },
  playBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  rechargeBtn: { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  rechargeBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
