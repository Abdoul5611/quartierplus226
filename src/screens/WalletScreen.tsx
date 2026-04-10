import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";
import RewardedVideoButton from "../components/RewardedVideoButton";
import AdBanner from "../components/AdBanner";

const COLORS = {
  primary: "#2E7D32",
  bg: "#F0FFF4",
  card: "#FFFFFF",
  text: "#1A1A2E",
  muted: "#6C757D",
  border: "#E9ECEF",
  gold: "#F9A825",
  orange: "#E65100",
};

const PROVIDERS = [
  { id: "orange", name: "Orange Money", flag: "🟠" },
  { id: "wave", name: "Wave", flag: "💙" },
  { id: "mtn", name: "MTN MoMo", flag: "🟡" },
  { id: "moov", name: "Moov Money", flag: "🔵" },
];

const POINTS_TO_FCFA = 0.1;
const MIN_WITHDRAWAL = 10000;
const MAX_DAILY = 15;
const POINTS_PER_VIDEO = 20;

interface RewardStatus {
  totalPoints: number;
  todayViews: number;
  maxDaily: number;
  fcfaEquivalent: number;
  canWithdraw: boolean;
  minWithdrawalPoints: number;
  isBanned: boolean;
}

interface HistoryEntry {
  id: string;
  points_earned?: number;
  amount?: number;
  viewed_at?: string;
  created_at?: string;
  type?: string;
  description?: string;
  mobile_money?: string;
  mobile_money_provider?: string;
  status?: string;
}

export default function WalletScreen() {
  const { firebaseUser } = useAuth();
  const [status, setStatus] = useState<RewardStatus | null>(null);
  const [history, setHistory] = useState<{ videoHistory: HistoryEntry[]; withdrawals: HistoryEntry[] }>({ videoHistory: [], withdrawals: [] });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [withdrawModal, setWithdrawModal] = useState(false);
  const [phone, setPhone] = useState("");
  const [provider, setProvider] = useState(PROVIDERS[0]);
  const [withdrawing, setWithdrawing] = useState(false);

  const fetchData = useCallback(async () => {
    if (!firebaseUser) return;
    try {
      const [s, h] = await Promise.all([
        api.getRewardStatus(firebaseUser.uid),
        api.getRewardHistory(firebaseUser.uid),
      ]);
      setStatus(s);
      setHistory(h);
    } catch (e) {
      console.error("Wallet fetch error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [firebaseUser]);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const handleWithdraw = async () => {
    if (!firebaseUser || !status) return;
    if (phone.trim().length < 6) {
      Alert.alert("Numéro invalide", "Entrez un numéro de téléphone Mobile Money valide.");
      return;
    }
    setWithdrawing(true);
    try {
      const result = await api.requestWithdrawal({
        userUid: firebaseUser.uid,
        phoneNumber: phone.trim(),
        provider: provider.id,
      });
      setWithdrawModal(false);
      setPhone("");
      await fetchData();
      Alert.alert("✅ Demande envoyée !", result.message, [{ text: "OK" }]);
    } catch (e: any) {
      Alert.alert("Erreur", e.message || "Impossible de traiter la demande.");
    } finally {
      setWithdrawing(false);
    }
  };

  const timeAgo = (dateStr?: string) => {
    if (!dateStr) return "";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "à l'instant";
    if (mins < 60) return `il y a ${mins}min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `il y a ${hrs}h`;
    return `il y a ${Math.floor(hrs / 24)}j`;
  };

  if (!firebaseUser) {
    return (
      <View style={styles.center}>
        <Text style={styles.lockIcon}>🔒</Text>
        <Text style={styles.lockTitle}>Connexion requise</Text>
        <Text style={styles.lockSub}>Connectez-vous pour accéder à votre portefeuille de points.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const pts = status?.totalPoints ?? 0;
  const fcfa = Math.floor(pts * POINTS_TO_FCFA);
  const todayViews = status?.todayViews ?? 0;
  const progressPct = Math.min((todayViews / MAX_DAILY) * 100, 100);
  const canWithdraw = pts >= MIN_WITHDRAWAL;
  const isBanned = status?.isBanned ?? false;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>💰 Mon Portefeuille</Text>
        <Text style={styles.headerSub}>Vidéos · Points · Retraits</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(); }} tintColor={COLORS.primary} />}
      >
        {isBanned && (
          <View style={styles.bannedCard}>
            <Text style={styles.bannedIcon}>🚫</Text>
            <Text style={styles.bannedTitle}>Compte bloqué</Text>
            <Text style={styles.bannedText}>Activité suspecte détectée. Contactez le support : abdoulquartierplus@gmail.com</Text>
          </View>
        )}

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Solde total</Text>
          <Text style={styles.balancePoints}>{pts.toLocaleString("fr-FR")} pts</Text>
          <Text style={styles.balanceFcfa}>{fcfa.toLocaleString("fr-FR")} FCFA</Text>
          <View style={styles.balanceInfo}>
            <Text style={styles.balanceInfoText}>10 000 pts = 1 000 FCFA</Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>📺 Vidéos du jour</Text>
            <View style={styles.progressPill}>
              <Text style={styles.progressText}>{todayViews} / {MAX_DAILY}</Text>
            </View>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progressPct}%` as any }]} />
          </View>
          <Text style={styles.progressCaption}>
            {todayViews < MAX_DAILY
              ? `${MAX_DAILY - todayViews} vidéo${MAX_DAILY - todayViews > 1 ? "s" : ""} restante${MAX_DAILY - todayViews > 1 ? "s" : ""} (+${(MAX_DAILY - todayViews) * POINTS_PER_VIDEO} pts max)`
              : "Revenez demain pour plus de points !"}
          </Text>

          {!isBanned && (
            <View style={styles.videoButtonWrapper}>
              <RewardedVideoButton
                todayViews={todayViews}
                maxDaily={MAX_DAILY}
                userUid={firebaseUser.uid}
                onPointsEarned={(newTotal) => {
                  setStatus((prev) => prev ? {
                    ...prev,
                    totalPoints: newTotal,
                    todayViews: prev.todayViews + 1,
                    fcfaEquivalent: Math.floor(newTotal * POINTS_TO_FCFA),
                    canWithdraw: newTotal >= MIN_WITHDRAWAL,
                  } : prev);
                }}
              />
            </View>
          )}
        </View>

        <View style={styles.section}>
          <TouchableOpacity style={styles.missionsCard} activeOpacity={0.85} onPress={() => Alert.alert("🚀 Missions Spéciales", "Bientôt disponible : Gagnez jusqu'à 5 000 points par mission !")}>
            <View style={styles.missionsLeft}>
              <Text style={styles.missionsIcon}>🎯</Text>
              <View>
                <Text style={styles.missionsTitle}>Missions Spéciales</Text>
                <Text style={styles.missionsSub}>Bientôt disponible : Gagnez jusqu'à 5 000 points par mission !</Text>
              </View>
            </View>
            <Text style={styles.missionsArrow}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💸 Retrait Mobile Money</Text>
          <View style={styles.withdrawCard}>
            <View style={styles.withdrawRow}>
              <Text style={styles.withdrawIcon}>{canWithdraw ? "✅" : "🔒"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.withdrawTitle}>
                  {canWithdraw ? "Retrait disponible !" : `${(MIN_WITHDRAWAL - pts).toLocaleString("fr-FR")} pts manquants`}
                </Text>
                <Text style={styles.withdrawSub}>
                  {canWithdraw
                    ? `Vous pouvez retirer ${fcfa.toLocaleString("fr-FR")} FCFA`
                    : `Minimum requis : ${MIN_WITHDRAWAL.toLocaleString("fr-FR")} pts = 1 000 FCFA`}
                </Text>
              </View>
            </View>

            {!canWithdraw && (
              <View style={styles.withdrawProgressBg}>
                <View style={[styles.withdrawProgressFill, { width: `${Math.min((pts / MIN_WITHDRAWAL) * 100, 100)}%` as any }]} />
                <Text style={styles.withdrawProgressLabel}>{Math.round((pts / MIN_WITHDRAWAL) * 100)}%</Text>
              </View>
            )}

            {canWithdraw && !isBanned && (
              <TouchableOpacity style={styles.withdrawBtn} onPress={() => setWithdrawModal(true)}>
                <Text style={styles.withdrawBtnText}>Demander mon paiement →</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📊 Historique</Text>
          {history.withdrawals.map((w) => (
            <View key={w.id} style={styles.historyRow}>
              <Text style={styles.historyIcon}>💸</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.historyTitle}>Retrait {w.mobile_money_provider?.toUpperCase()}</Text>
                <Text style={styles.historySub}>{w.mobile_money} · {timeAgo(w.created_at)}</Text>
              </View>
              <View>
                <Text style={styles.historyAmount}>-{w.amount?.toLocaleString("fr-FR")} FCFA</Text>
                <Text style={[styles.historyStatus, { color: w.status === "pending" ? "#F9A825" : "#2E7D32" }]}>
                  {w.status === "pending" ? "⏳ En attente" : "✅ Validé"}
                </Text>
              </View>
            </View>
          ))}
          {history.videoHistory.slice(0, 20).map((v) => (
            <View key={v.id} style={styles.historyRow}>
              <Text style={styles.historyIcon}>▶️</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.historyTitle}>Vidéo récompensée</Text>
                <Text style={styles.historySub}>{timeAgo(v.viewed_at)}</Text>
              </View>
              <Text style={styles.historyEarned}>+{v.points_earned} pts</Text>
            </View>
          ))}
          {history.videoHistory.length === 0 && history.withdrawals.length === 0 && (
            <View style={styles.emptyHistory}>
              <Text style={styles.emptyHistoryIcon}>📭</Text>
              <Text style={styles.emptyHistoryText}>Aucune activité pour l'instant.</Text>
              <Text style={styles.emptyHistorySubText}>Regardez des vidéos pour gagner vos premiers points !</Text>
            </View>
          )}
        </View>
      </ScrollView>

      <AdBanner />

      <Modal visible={withdrawModal} animationType="slide" transparent onRequestClose={() => setWithdrawModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>💸 Demander mon paiement</Text>
              <TouchableOpacity onPress={() => setWithdrawModal(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalAmountBadge}>
              <Text style={styles.modalAmountLabel}>Montant à recevoir</Text>
              <Text style={styles.modalAmountValue}>{fcfa.toLocaleString("fr-FR")} FCFA</Text>
              <Text style={styles.modalAmountPts}>{pts.toLocaleString("fr-FR")} points</Text>
            </View>

            <Text style={styles.fieldLabel}>Opérateur Mobile Money</Text>
            <View style={styles.providerRow}>
              {PROVIDERS.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.providerChip, provider.id === p.id && styles.providerChipActive]}
                  onPress={() => setProvider(p)}
                >
                  <Text style={styles.providerFlag}>{p.flag}</Text>
                  <Text style={[styles.providerName, provider.id === p.id && styles.providerNameActive]}>{p.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Numéro {provider.name}</Text>
            <TextInput
              style={styles.phoneInput}
              placeholder="Ex : 07 00 00 00 00"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              maxLength={15}
              placeholderTextColor={COLORS.muted}
            />

            <View style={styles.modalNotice}>
              <Text style={styles.modalNoticeText}>
                ⏱️ Paiement effectué dans les 24-48h ouvrées par l'administrateur.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.confirmBtn, (!phone.trim() || withdrawing) && styles.confirmBtnDisabled]}
              onPress={handleWithdraw}
              disabled={!phone.trim() || withdrawing}
            >
              {withdrawing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.confirmBtnText}>✅ Confirmer la demande</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  lockIcon: { fontSize: 56, marginBottom: 16 },
  lockTitle: { fontSize: 20, fontWeight: "800", color: COLORS.text, marginBottom: 8 },
  lockSub: { fontSize: 14, color: COLORS.muted, textAlign: "center", lineHeight: 22 },
  header: {
    paddingHorizontal: 20, paddingTop: 52, paddingBottom: 16,
    backgroundColor: COLORS.primary,
  },
  headerTitle: { fontSize: 22, fontWeight: "900", color: "#fff" },
  headerSub: { fontSize: 12, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  bannedCard: {
    margin: 16, backgroundColor: "#FFEBEE", borderRadius: 16, padding: 16,
    borderWidth: 1.5, borderColor: "#EF9A9A", alignItems: "center",
  },
  bannedIcon: { fontSize: 36, marginBottom: 8 },
  bannedTitle: { fontSize: 16, fontWeight: "800", color: "#C62828", marginBottom: 4 },
  bannedText: { fontSize: 13, color: "#B71C1C", textAlign: "center", lineHeight: 20 },
  balanceCard: {
    margin: 16, backgroundColor: COLORS.primary, borderRadius: 24, padding: 24,
    alignItems: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 16, elevation: 8,
  },
  balanceLabel: { fontSize: 13, fontWeight: "600", color: "rgba(255,255,255,0.75)", marginBottom: 4 },
  balancePoints: { fontSize: 44, fontWeight: "900", color: "#fff", letterSpacing: -1 },
  balanceFcfa: { fontSize: 22, fontWeight: "700", color: "#A5D6A7", marginTop: 4 },
  balanceInfo: { marginTop: 12, backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 20, paddingHorizontal: 14, paddingVertical: 5 },
  balanceInfoText: { fontSize: 12, color: "rgba(255,255,255,0.9)", fontWeight: "600" },
  section: { marginHorizontal: 16, marginBottom: 16 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: COLORS.text, marginBottom: 10 },
  progressPill: { backgroundColor: "#E8F5E9", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  progressText: { fontSize: 12, fontWeight: "700", color: COLORS.primary },
  progressBarBg: { height: 8, backgroundColor: "#E9ECEF", borderRadius: 4, marginBottom: 6, overflow: "hidden" },
  progressBarFill: { height: "100%", backgroundColor: COLORS.primary, borderRadius: 4 },
  progressCaption: { fontSize: 12, color: COLORS.muted, marginBottom: 12 },
  videoButtonWrapper: { marginTop: 4 },
  missionsCard: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: "#FFF8E1", borderRadius: 16, padding: 16,
    borderWidth: 1.5, borderColor: "#FFE082",
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  missionsLeft: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1 },
  missionsIcon: { fontSize: 30 },
  missionsTitle: { fontSize: 14, fontWeight: "800", color: "#5D4037", marginBottom: 3 },
  missionsSub: { fontSize: 12, color: "#795548", lineHeight: 17, flexWrap: "wrap", maxWidth: "90%" },
  missionsArrow: { fontSize: 26, color: "#F9A825", fontWeight: "700" },
  withdrawCard: {
    backgroundColor: COLORS.card, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: COLORS.border,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  withdrawRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  withdrawIcon: { fontSize: 28 },
  withdrawTitle: { fontSize: 14, fontWeight: "800", color: COLORS.text, marginBottom: 2 },
  withdrawSub: { fontSize: 12, color: COLORS.muted, lineHeight: 18 },
  withdrawProgressBg: {
    height: 10, backgroundColor: "#E9ECEF", borderRadius: 5, overflow: "hidden",
    marginBottom: 4, position: "relative", justifyContent: "center",
  },
  withdrawProgressFill: { height: "100%", backgroundColor: COLORS.gold, borderRadius: 5 },
  withdrawProgressLabel: { position: "absolute", right: 8, fontSize: 10, fontWeight: "700", color: "#5D4037" },
  withdrawBtn: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 12, alignItems: "center", marginTop: 4 },
  withdrawBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  historyRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: COLORS.card, borderRadius: 12, padding: 12,
    marginBottom: 8, borderWidth: 1, borderColor: COLORS.border,
  },
  historyIcon: { fontSize: 24 },
  historyTitle: { fontSize: 13, fontWeight: "700", color: COLORS.text },
  historySub: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  historyAmount: { fontSize: 13, fontWeight: "700", color: "#C62828", textAlign: "right" },
  historyStatus: { fontSize: 11, fontWeight: "600", textAlign: "right", marginTop: 2 },
  historyEarned: { fontSize: 14, fontWeight: "800", color: COLORS.primary },
  emptyHistory: { alignItems: "center", paddingVertical: 32 },
  emptyHistoryIcon: { fontSize: 48, marginBottom: 12 },
  emptyHistoryText: { fontSize: 16, fontWeight: "700", color: COLORS.text, marginBottom: 4 },
  emptyHistorySubText: { fontSize: 13, color: COLORS.muted, textAlign: "center" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: {
    backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: COLORS.text },
  modalClose: { fontSize: 22, color: COLORS.muted, padding: 4 },
  modalAmountBadge: {
    backgroundColor: "#E8F5E9", borderRadius: 16, padding: 16, alignItems: "center",
    marginBottom: 20, borderWidth: 1.5, borderColor: "#A5D6A7",
  },
  modalAmountLabel: { fontSize: 12, color: COLORS.muted, fontWeight: "600", marginBottom: 4 },
  modalAmountValue: { fontSize: 32, fontWeight: "900", color: COLORS.primary },
  modalAmountPts: { fontSize: 13, color: COLORS.muted, marginTop: 2 },
  fieldLabel: { fontSize: 13, fontWeight: "700", color: COLORS.muted, marginBottom: 10 },
  providerRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  providerChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: "#F8F9FA",
  },
  providerChipActive: { borderColor: COLORS.primary, backgroundColor: "#E8F5E9" },
  providerFlag: { fontSize: 16 },
  providerName: { fontSize: 12, fontWeight: "600", color: COLORS.muted },
  providerNameActive: { color: COLORS.primary },
  phoneInput: {
    backgroundColor: "#F8F9FA", borderRadius: 12, padding: 14,
    fontSize: 16, color: COLORS.text, borderWidth: 1.5, borderColor: COLORS.border,
    marginBottom: 16,
  },
  modalNotice: { backgroundColor: "#FFF8E1", borderRadius: 10, padding: 12, marginBottom: 16 },
  modalNoticeText: { fontSize: 12, color: "#5D4037", lineHeight: 18 },
  confirmBtn: { backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  confirmBtnDisabled: { backgroundColor: "#A5D6A7" },
  confirmBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
});
