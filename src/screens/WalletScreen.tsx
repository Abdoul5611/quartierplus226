import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, Modal, TextInput, Alert, ActivityIndicator,
  Platform, Animated, StyleProp, ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { BASE_URL } from "../services/api";
import RewardedVideoButton from "../components/RewardedVideoButton";

function BottomSheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  if (Platform.OS === "web") {
    if (!visible) return null;
    return (
      <View style={webSheetStyles.fixed as any}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />
        <View style={webSheetStyles.sheet}>{children}</View>
      </View>
    );
  }
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={webSheetStyles.overlay}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />
        <View style={webSheetStyles.sheet}>{children}</View>
      </View>
    </Modal>
  );
}

const webSheetStyles = {
  fixed: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end", zIndex: 9999, display: "flex", flexDirection: "column" } as any,
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" as const },
  sheet: { backgroundColor: "#fff", borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, gap: 16 } as any,
};

const C = {
  primary: "#2E7D32",
  bg: "#F0FFF4",
  card: "#FFFFFF",
  text: "#1A1A2E",
  muted: "#6C757D",
  border: "#E5E7EB",
  gold: "#F9A825",
  orange: "#E65100",
  danger: "#C62828",
  success: "#2E7D32",
};

const PROVIDERS = [
  { id: "orange", name: "Orange Money", emoji: "🟠", color: "#FF5722" },
  { id: "wave", name: "Wave", emoji: "💙", color: "#1565C0" },
  { id: "mtn", name: "MTN MoMo", emoji: "🟡", color: "#F9A825" },
  { id: "moov", name: "Moov Money", emoji: "🔵", color: "#0D47A1" },
];

const MAX_DAILY = 15;
const POINTS_PER_VIDEO = 20;
const MIN_WITHDRAWAL = 1000;

interface WalletState { balance: number; isBanned: boolean; fetchedAt: string; }
interface TxEntry {
  id: string; type: string; amount: number; description: string;
  mobile_money?: string; mobile_money_provider?: string; status: string; created_at: string;
}
interface RewardStatus { totalPoints: number; todayViews: number; walletBalance: number; isBanned: boolean; }

function getWsUrl(): string {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}`;
  }
  return BASE_URL.replace("https://", "wss://").replace("http://", "ws://");
}

function useWalletRealtime(uid: string | null, onBalanceUpdate: (balance: number) => void) {
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!uid) return;
    let alive = true;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (!alive) return;
      try {
        const ws = new WebSocket(getWsUrl());
        wsRef.current = ws;

        ws.onopen = () => {
          ws.send(JSON.stringify({ type: "register", uid }));
        };

        ws.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data.type === "balance_update") {
              onBalanceUpdate(data.balance);
            }
          } catch {}
        };

        ws.onclose = () => {
          if (alive) reconnectTimeout = setTimeout(connect, 5000);
        };
        ws.onerror = () => { ws.close(); };
      } catch {}
    }

    connect();
    return () => {
      alive = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      wsRef.current?.close();
    };
  }, [uid]);
}

export default function WalletScreen() {
  const { firebaseUser, dbUser, refreshUser } = useAuth();
  const uid = firebaseUser?.uid;

  const [walletState, setWalletState] = useState<WalletState | null>(null);
  const [rewardStatus, setRewardStatus] = useState<RewardStatus | null>(null);
  const [transactions, setTransactions] = useState<TxEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"wallet" | "videos" | "history">("wallet");

  const [withdrawStep, setWithdrawStep] = useState<0 | 1 | 2>(0);
  const [withdrawPhone, setWithdrawPhone] = useState("");
  const [withdrawProvider, setWithdrawProvider] = useState(PROVIDERS[0]);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawTxId, setWithdrawTxId] = useState("");
  const [withdrawOtpGenerated, setWithdrawOtpGenerated] = useState("");
  const [withdrawOtpInput, setWithdrawOtpInput] = useState("");
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawOtpExpiry, setWithdrawOtpExpiry] = useState<Date | null>(null);

  const [depositStep, setDepositStep] = useState<0 | 1 | 2>(0);
  const [depositPhone, setDepositPhone] = useState("");
  const [depositProvider, setDepositProvider] = useState(PROVIDERS[0]);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositTxId, setDepositTxId] = useState("");
  const [depositOtpGenerated, setDepositOtpGenerated] = useState("");
  const [depositOtpInput, setDepositOtpInput] = useState("");
  const [depositLoading, setDepositLoading] = useState(false);

  const balancePulse = useRef(new Animated.Value(1)).current;

  const pulseBalance = () => {
    Animated.sequence([
      Animated.timing(balancePulse, { toValue: 1.08, duration: 200, useNativeDriver: true }),
      Animated.timing(balancePulse, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  };

  useWalletRealtime(uid || null, (newBalance) => {
    setWalletState(prev => prev ? { ...prev, balance: newBalance } : null);
    pulseBalance();
    fetchTransactions();
  });

  const fetchBalance = useCallback(async () => {
    if (!uid) return;
    try {
      const res = await fetch(`${BASE_URL}/api/wallet/balance/${uid}`);
      const data = await res.json();
      if (res.ok) setWalletState({ balance: data.balance, isBanned: data.is_banned, fetchedAt: data.fetched_at });
    } catch {}
  }, [uid]);

  const fetchRewardStatus = useCallback(async () => {
    if (!uid) return;
    try {
      const res = await fetch(`${BASE_URL}/api/rewards/status/${uid}`);
      const data = await res.json();
      if (res.ok) setRewardStatus(data);
    } catch {}
  }, [uid]);

  const fetchTransactions = useCallback(async () => {
    if (!uid) return;
    try {
      const [txRes, videoRes, wdRes] = await Promise.all([
        fetch(`${BASE_URL}/api/wallet/transactions/${uid}`),
        fetch(`${BASE_URL}/api/rewards/history/${uid}`),
      ]);
      const txData = txRes.ok ? await txRes.json() : [];
      const history = videoRes.ok ? await videoRes.json() : { videoHistory: [], withdrawals: [] };
      const combined = [
        ...txData.map((t: any) => ({ ...t, _source: "wallet" })),
        ...(history.withdrawals || []).filter((w: any) => !txData.some((t: any) => t.id === w.id)).map((w: any) => ({ ...w, type: "withdrawal_request", _source: "rewards" })),
        ...(history.videoHistory || []).map((v: any) => ({ ...v, type: "video_reward", amount: v.points_earned, status: "completed", created_at: v.viewed_at, description: "Vidéo récompensée", _source: "video" })),
      ];
      combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setTransactions(combined.slice(0, 50));
    } catch {}
  }, [uid]);

  const fetchAll = useCallback(async () => {
    if (!uid) return;
    await Promise.all([fetchBalance(), fetchRewardStatus(), fetchTransactions()]);
    setLoading(false);
    setRefreshing(false);
  }, [uid, fetchBalance, fetchRewardStatus, fetchTransactions]);

  useFocusEffect(useCallback(() => { fetchAll(); }, [fetchAll]));

  const handleRefresh = () => { setRefreshing(true); fetchAll(); };

  const handleWithdrawRequest = async () => {
    const amount = parseInt(withdrawAmount) || (walletState?.balance ?? 0);
    if (!withdrawPhone.trim() || withdrawPhone.trim().length < 6) return Alert.alert("Numéro invalide", "Entrez un numéro Mobile Money valide.");
    if (amount < MIN_WITHDRAWAL) return Alert.alert("Montant trop faible", `Minimum : ${MIN_WITHDRAWAL.toLocaleString()} FCFA`);
    setWithdrawLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/wallet/withdraw/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_uid: uid, phone_number: withdrawPhone.trim(), provider: withdrawProvider.id, amount }),
      });
      const data = await res.json();
      if (!res.ok) { Alert.alert("Erreur", data.error); return; }
      setWithdrawTxId(data.transaction_id);
      setWithdrawOtpGenerated(data.otp);
      setWithdrawOtpExpiry(new Date(data.expires_at));
      setWithdrawStep(2);
    } catch { Alert.alert("Erreur réseau", "Vérifiez votre connexion."); }
    setWithdrawLoading(false);
  };

  const handleWithdrawConfirm = async () => {
    if (withdrawOtpInput.trim().length !== 6) return Alert.alert("Code invalide", "Le code de sécurité est à 6 chiffres.");
    setWithdrawLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/wallet/withdraw/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_uid: uid, transaction_id: withdrawTxId, otp_code: withdrawOtpInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { Alert.alert("Erreur", data.error); return; }
      setWithdrawStep(0);
      setWithdrawPhone(""); setWithdrawAmount(""); setWithdrawOtpInput(""); setWithdrawOtpGenerated(""); setWithdrawTxId("");
      setWalletState(prev => prev ? { ...prev, balance: data.new_balance } : null);
      fetchTransactions();
      refreshUser();
      Alert.alert("✅ Retrait confirmé !", data.message);
    } catch { Alert.alert("Erreur réseau", "Vérifiez votre connexion."); }
    setWithdrawLoading(false);
  };

  const handleDepositRequest = async () => {
    const amount = parseInt(depositAmount);
    if (!amount || amount < 500) return Alert.alert("Montant invalide", "Dépôt minimum : 500 FCFA");
    if (!depositPhone.trim() || depositPhone.trim().length < 6) return Alert.alert("Numéro invalide", "Entrez votre numéro Mobile Money.");
    setDepositLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/wallet/deposit/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_uid: uid, amount, phone_number: depositPhone.trim(), provider: depositProvider.id }),
      });
      const data = await res.json();
      if (!res.ok) { Alert.alert("Erreur", data.error); return; }
      setDepositTxId(data.transaction_id);
      setDepositOtpGenerated(data.otp);
      setDepositStep(2);
    } catch { Alert.alert("Erreur réseau", "Vérifiez votre connexion."); }
    setDepositLoading(false);
  };

  const handleDepositConfirm = async () => {
    if (depositOtpInput.trim().length !== 6) return Alert.alert("Code invalide", "Le code est à 6 chiffres.");
    setDepositLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/wallet/deposit/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_uid: uid, transaction_id: depositTxId, otp_code: depositOtpInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { Alert.alert("Erreur", data.error); return; }
      setDepositStep(0);
      setDepositPhone(""); setDepositAmount(""); setDepositOtpInput(""); setDepositOtpGenerated(""); setDepositTxId("");
      setWalletState(prev => prev ? { ...prev, balance: data.new_balance } : null);
      fetchTransactions();
      refreshUser();
      Alert.alert("✅ Dépôt confirmé !", data.message);
    } catch { Alert.alert("Erreur réseau", "Vérifiez votre connexion."); }
    setDepositLoading(false);
  };

  const formatTime = (d?: string) => {
    if (!d) return "";
    const dt = new Date(d);
    const now = new Date();
    const diff = now.getTime() - dt.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "à l'instant";
    if (mins < 60) return `il y a ${mins}min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `il y a ${hrs}h`;
    return `${dt.getDate().toString().padStart(2, "0")}/${(dt.getMonth() + 1).toString().padStart(2, "0")}`;
  };

  const txIcon = (type: string) => {
    const map: Record<string, string> = {
      withdrawal_request: "💸", deposit_request: "📥", deposit: "📥",
      video_reward: "▶️", course_pari: "🏁", course_gain: "🏆",
      quiz_win: "🎯", loto_win: "🎰", boost: "🚀",
    };
    return map[type] || "💳";
  };

  const txLabel = (type: string) => {
    const map: Record<string, string> = {
      withdrawal_request: "Retrait Mobile Money", deposit_request: "Dépôt Mobile Money",
      deposit: "Dépôt crédité", video_reward: "Vidéo récompensée",
      course_pari: "Paris Course de Rue", course_gain: "Gain Course de Rue",
      quiz_win: "Gain Live Quiz", loto_win: "Gain Loto", boost: "Boost Annonce",
    };
    return map[type] || type;
  };

  const statusColor = (s: string) => {
    const map: Record<string, string> = {
      pending: "#F57F17", awaiting_admin: "#E65100", completed: "#2E7D32",
      rejected: "#C62828", expired: "#9E9E9E",
    };
    return map[s] || "#9E9E9E";
  };

  const statusLabel = (s: string) => {
    const map: Record<string, string> = {
      pending: "⏳ En attente OTP", awaiting_admin: "🔄 En traitement",
      completed: "✅ Confirmé", rejected: "❌ Refusé", expired: "⌛ Expiré",
    };
    return map[s] || s;
  };

  if (!uid) {
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: C.bg, justifyContent: "center", alignItems: "center", padding: 32 }]}>
        <Text style={{ fontSize: 64, marginBottom: 16 }}>🔒</Text>
        <Text style={{ fontSize: 20, fontWeight: "800", color: C.text, marginBottom: 8 }}>Connexion requise</Text>
        <Text style={{ fontSize: 14, color: C.muted, textAlign: "center" }}>Connectez-vous pour accéder à votre portefeuille.</Text>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.flex, { backgroundColor: C.bg }]}>
        <View style={styles.header}><Text style={styles.headerTitle}>💰 Mon Portefeuille</Text></View>
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={{ marginTop: 12, color: C.muted, fontSize: 14 }}>Chargement de votre solde...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const balance = walletState?.balance ?? 0;
  const isBanned = walletState?.isBanned ?? false;
  const todayViews = rewardStatus?.todayViews ?? 0;
  const progressPct = Math.min((todayViews / MAX_DAILY) * 100, 100);
  const canWithdraw = balance >= MIN_WITHDRAWAL && !isBanned;

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: C.bg }]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>💰 Mon Portefeuille</Text>
          <Text style={styles.headerSub}>Sécurisé · Temps réel</Text>
        </View>
        <TouchableOpacity style={styles.headerRefresh} onPress={() => { fetchBalance(); pulseBalance(); }}>
          <Ionicons name="refresh" size={18} color="rgba(255,255,255,0.85)" />
        </TouchableOpacity>
      </View>

      <View style={styles.tabBar}>
        {(["wallet", "videos", "history"] as const).map(t => (
          <TouchableOpacity key={t} style={[styles.tab, activeTab === t && styles.tabActive]} onPress={() => setActiveTab(t)}>
            <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>
              {t === "wallet" ? "💳 Wallet" : t === "videos" ? "▶️ Vidéos" : "📊 Historique"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={C.primary} />}
        showsVerticalScrollIndicator={false}
      >
        {isBanned && (
          <View style={styles.bannedCard}>
            <Text style={{ fontSize: 36 }}>🚫</Text>
            <Text style={styles.bannedTitle}>Compte suspendu</Text>
            <Text style={styles.bannedText}>Contactez le support : abdoulquartierplus@gmail.com</Text>
          </View>
        )}

        {activeTab === "wallet" && (
          <>
            <Animated.View style={[styles.balanceCard, { transform: [{ scale: balancePulse }] }]}>
              <View style={styles.balanceTop}>
                <Text style={styles.balanceLabel}>Solde disponible</Text>
                <View style={styles.liveBadge}><View style={styles.liveDot} /><Text style={styles.liveText}>LIVE</Text></View>
              </View>
              <Text style={styles.balanceAmount}>{balance.toLocaleString("fr-FR")} FCFA</Text>
              <Text style={styles.balanceSub}>Mis à jour en temps réel</Text>
              <View style={styles.balanceActions}>
                <TouchableOpacity style={[styles.actionBtn, styles.depositBtn]} onPress={() => setDepositStep(1)} disabled={isBanned}>
                  <Ionicons name="add-circle" size={20} color="#fff" />
                  <Text style={styles.actionBtnText}>Déposer</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, styles.withdrawBtn, !canWithdraw && styles.actionBtnDisabled]} onPress={() => canWithdraw && setWithdrawStep(1)} disabled={!canWithdraw}>
                  <Ionicons name="arrow-up-circle" size={20} color="#fff" />
                  <Text style={styles.actionBtnText}>Retirer</Text>
                </TouchableOpacity>
              </View>
            </Animated.View>

            {!canWithdraw && !isBanned && (
              <View style={styles.progressCard}>
                <Text style={styles.progressTitle}>🔒 Retrait disponible à {MIN_WITHDRAWAL.toLocaleString()} FCFA</Text>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${Math.min((balance / MIN_WITHDRAWAL) * 100, 100)}%` as any }]} />
                </View>
                <Text style={styles.progressCaption}>{balance.toLocaleString()} / {MIN_WITHDRAWAL.toLocaleString()} FCFA — {Math.round((balance / MIN_WITHDRAWAL) * 100)}%</Text>
              </View>
            )}

            <View style={styles.securityCard}>
              <Ionicons name="shield-checkmark" size={22} color={C.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.securityTitle}>Transactions sécurisées OTP</Text>
                <Text style={styles.securitySub}>Chaque opération est protégée par un code de confirmation à usage unique.</Text>
              </View>
            </View>

            <View style={styles.recentSection}>
              <Text style={styles.sectionTitle}>Dernières transactions</Text>
              {transactions.slice(0, 5).length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={{ fontSize: 40 }}>📭</Text>
                  <Text style={styles.emptyText}>Aucune transaction pour le moment</Text>
                </View>
              ) : (
                transactions.slice(0, 5).map(tx => <TxRow key={tx.id} tx={tx} txIcon={txIcon} txLabel={txLabel} statusColor={statusColor} statusLabel={statusLabel} formatTime={formatTime} />)
              )}
              {transactions.length > 5 && (
                <TouchableOpacity style={styles.seeAllBtn} onPress={() => setActiveTab("history")}>
                  <Text style={styles.seeAllText}>Voir tout l'historique ({transactions.length}) →</Text>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}

        {activeTab === "videos" && (
          <View style={{ padding: 16, gap: 16 }}>
            <View style={styles.videoProgressCard}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <Text style={styles.videoProgressTitle}>📺 Vidéos du jour</Text>
                <View style={styles.videoPill}><Text style={styles.videoPillText}>{todayViews} / {MAX_DAILY}</Text></View>
              </View>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${progressPct}%` as any, backgroundColor: C.gold }]} />
              </View>
              <Text style={[styles.progressCaption, { marginTop: 8 }]}>
                {todayViews < MAX_DAILY
                  ? `Encore ${MAX_DAILY - todayViews} vidéo(s) — jusqu'à +${(MAX_DAILY - todayViews) * POINTS_PER_VIDEO} FCFA ce soir`
                  : "✅ Quota atteint — Revenez demain !"}
              </Text>
            </View>

            {!isBanned && (
              <RewardedVideoButton
                todayViews={todayViews}
                maxDaily={MAX_DAILY}
                userUid={uid}
                onPointsEarned={(newTotal) => {
                  setRewardStatus(prev => prev ? { ...prev, totalPoints: newTotal, todayViews: prev.todayViews + 1 } : null);
                  fetchBalance();
                }}
              />
            )}

            <View style={styles.earningsGuide}>
              <Text style={styles.earningsGuideTitle}>💡 Comment gagner ?</Text>
              {[
                { icon: "▶️", text: "Regardez 1 vidéo = +20 FCFA crédités instantanément" },
                { icon: "🎯", text: "Jusqu'à 15 vidéos par jour = 300 FCFA max" },
                { icon: "💸", text: "Retrait minimum : 1 000 FCFA vers votre Mobile Money" },
                { icon: "🔒", text: "Chaque retrait protégé par un code OTP unique" },
              ].map((item, i) => (
                <View key={i} style={styles.guideRow}>
                  <Text style={{ fontSize: 18, width: 28 }}>{item.icon}</Text>
                  <Text style={styles.guideText}>{item.text}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {activeTab === "history" && (
          <View style={{ padding: 16 }}>
            <Text style={styles.sectionTitle}>Toutes les transactions ({transactions.length})</Text>
            {transactions.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={{ fontSize: 48 }}>📊</Text>
                <Text style={styles.emptyText}>Aucune transaction</Text>
                <Text style={styles.emptySub}>Vos dépôts, retraits et gains apparaîtront ici.</Text>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {transactions.map(tx => <TxRow key={tx.id} tx={tx} txIcon={txIcon} txLabel={txLabel} statusColor={statusColor} statusLabel={statusLabel} formatTime={formatTime} />)}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <WithdrawModal
        step={withdrawStep}
        onClose={() => { setWithdrawStep(0); setWithdrawOtpInput(""); setWithdrawPhone(""); setWithdrawAmount(""); }}
        phone={withdrawPhone} setPhone={setWithdrawPhone}
        provider={withdrawProvider} setProvider={setWithdrawProvider}
        amount={withdrawAmount} setAmount={setWithdrawAmount}
        balance={balance}
        otpGenerated={withdrawOtpGenerated}
        otpInput={withdrawOtpInput} setOtpInput={setWithdrawOtpInput}
        loading={withdrawLoading}
        onRequest={handleWithdrawRequest}
        onConfirm={handleWithdrawConfirm}
        otpExpiry={withdrawOtpExpiry}
      />

      <DepositModal
        step={depositStep}
        onClose={() => { setDepositStep(0); setDepositOtpInput(""); setDepositPhone(""); setDepositAmount(""); }}
        phone={depositPhone} setPhone={setDepositPhone}
        provider={depositProvider} setProvider={setDepositProvider}
        amount={depositAmount} setAmount={setDepositAmount}
        otpGenerated={depositOtpGenerated}
        otpInput={depositOtpInput} setOtpInput={setDepositOtpInput}
        loading={depositLoading}
        onRequest={handleDepositRequest}
        onConfirm={handleDepositConfirm}
      />
    </SafeAreaView>
  );
}

function TxRow({ tx, txIcon, txLabel, statusColor, statusLabel, formatTime }: any) {
  const isCredit = ["deposit", "video_reward", "course_gain", "quiz_win", "loto_win", "referral_bonus"].includes(tx.type);
  return (
    <View style={styles.txRow}>
      <View style={styles.txIconBox}>
        <Text style={{ fontSize: 20 }}>{txIcon(tx.type)}</Text>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.txLabel}>{txLabel(tx.type)}</Text>
        {tx.description && <Text style={styles.txDesc} numberOfLines={1}>{tx.description}</Text>}
        <Text style={[styles.txStatus, { color: statusColor(tx.status) }]}>{statusLabel(tx.status)}</Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={[styles.txAmount, { color: isCredit ? C.success : C.danger }]}>
          {isCredit ? "+" : "-"}{(tx.amount || 0).toLocaleString()} FCFA
        </Text>
        <Text style={styles.txDate}>{formatTime(tx.created_at)}</Text>
      </View>
    </View>
  );
}

function OtpDisplay({ otp }: { otp: string }) {
  return (
    <View style={styles.otpDisplay}>
      <Text style={styles.otpDisplayLabel}>🔐 Votre code de sécurité</Text>
      <View style={styles.otpDigits}>
        {otp.split("").map((d, i) => (
          <View key={i} style={styles.otpDigitBox}><Text style={styles.otpDigitText}>{d}</Text></View>
        ))}
      </View>
      <Text style={styles.otpDisplayHint}>Entrez ce code pour valider l'opération</Text>
    </View>
  );
}

function WithdrawModal({ step, onClose, phone, setPhone, provider, setProvider, amount, setAmount, balance, otpGenerated, otpInput, setOtpInput, loading, onRequest, onConfirm, otpExpiry }: any) {
  const withdrawAmount = parseInt(amount) || balance;
  return (
    <BottomSheet visible={step > 0} onClose={onClose}>
      <View style={styles.modalHandle} />
      <View style={styles.modalHeaderRow}>
        <Text style={styles.modalTitle}>{step === 1 ? "💸 Demander un retrait" : "🔐 Confirmer le retrait"}</Text>
        <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={C.muted} /></TouchableOpacity>
      </View>

      {step === 1 && (
        <>
          <View style={styles.amountBox}>
            <Text style={styles.amountBoxLabel}>Montant disponible</Text>
            <Text style={styles.amountBoxValue}>{balance.toLocaleString()} FCFA</Text>
          </View>
          <Text style={styles.fieldLabel}>Montant à retirer (min 1 000)</Text>
          <TextInput
            style={styles.input}
            placeholder={`${balance.toLocaleString()} FCFA (tout retirer)`}
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            placeholderTextColor={C.muted}
          />
          <Text style={styles.fieldLabel}>Opérateur Mobile Money</Text>
          <View style={styles.providerGrid}>
            {PROVIDERS.map(p => (
              <TouchableOpacity key={p.id} style={[styles.providerChip, provider.id === p.id && styles.providerChipActive]} onPress={() => setProvider(p)}>
                <Text style={styles.providerEmoji}>{p.emoji}</Text>
                <Text style={[styles.providerName, provider.id === p.id && { color: C.primary, fontWeight: "700" as any }]}>{p.name}</Text>
                {provider.id === p.id && <Ionicons name="checkmark-circle" size={14} color={C.primary} />}
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.fieldLabel}>Numéro {provider.name}</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex: 07 00 00 00 00"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            maxLength={15}
            placeholderTextColor={C.muted}
          />
          <View style={styles.noticeBox}>
            <Ionicons name="information-circle" size={16} color="#5D4037" />
            <Text style={styles.noticeText}>Un code OTP sera généré pour sécuriser votre retrait.</Text>
          </View>
          <TouchableOpacity style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]} onPress={onRequest} disabled={loading || !phone.trim()}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Générer le code de sécurité →</Text>}
          </TouchableOpacity>
        </>
      )}

      {step === 2 && (
        <>
          <View style={styles.confirmSummary}>
            <Text style={styles.confirmSummaryLabel}>Retrait de</Text>
            <Text style={styles.confirmSummaryAmount}>{withdrawAmount.toLocaleString()} FCFA</Text>
            <Text style={styles.confirmSummaryDetail}>{provider.emoji} {provider.name} · {phone}</Text>
          </View>
          {otpGenerated && <OtpDisplay otp={otpGenerated} />}
          <Text style={styles.fieldLabel}>Entrez votre code de confirmation</Text>
          <TextInput
            style={[styles.input, styles.otpInput]}
            placeholder="_ _ _ _ _ _"
            value={otpInput}
            onChangeText={t => setOtpInput(t.replace(/\D/g, "").slice(0, 6))}
            keyboardType="numeric"
            maxLength={6}
            placeholderTextColor={C.muted}
            textAlign="center"
          />
          {otpExpiry && (
            <Text style={styles.expiryText}>⏱️ Code valide jusqu'à {new Date(otpExpiry).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</Text>
          )}
          <TouchableOpacity style={[styles.primaryBtn, (otpInput.length !== 6 || loading) && styles.primaryBtnDisabled]} onPress={onConfirm} disabled={otpInput.length !== 6 || loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>✅ Valider le retrait</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => { setOtpInput(""); onRequest(); }}>
            <Text style={styles.secondaryBtnText}>↻ Renvoyer le code</Text>
          </TouchableOpacity>
        </>
      )}
    </BottomSheet>
  );
}

function DepositModal({ step, onClose, phone, setPhone, provider, setProvider, amount, setAmount, otpGenerated, otpInput, setOtpInput, loading, onRequest, onConfirm }: any) {
  return (
    <BottomSheet visible={step > 0} onClose={onClose}>
      <View style={styles.modalHandle} />
      <View style={styles.modalHeaderRow}>
        <Text style={styles.modalTitle}>{step === 1 ? "📥 Déposer des fonds" : "🔐 Confirmer le dépôt"}</Text>
        <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={C.muted} /></TouchableOpacity>
      </View>

      {step === 1 && (
        <>
          <Text style={styles.fieldLabel}>Montant à déposer (min 500 FCFA)</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex: 5000"
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            placeholderTextColor={C.muted}
          />
          <Text style={styles.fieldLabel}>Votre opérateur Mobile Money</Text>
          <View style={styles.providerGrid}>
            {PROVIDERS.map(p => (
              <TouchableOpacity key={p.id} style={[styles.providerChip, provider.id === p.id && styles.providerChipActive]} onPress={() => setProvider(p)}>
                <Text style={styles.providerEmoji}>{p.emoji}</Text>
                <Text style={[styles.providerName, provider.id === p.id && { color: C.primary, fontWeight: "700" as any }]}>{p.name}</Text>
                {provider.id === p.id && <Ionicons name="checkmark-circle" size={14} color={C.primary} />}
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.fieldLabel}>Votre numéro {provider.name}</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex: 07 00 00 00 00"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            maxLength={15}
            placeholderTextColor={C.muted}
          />
          <View style={styles.noticeBox}>
            <Ionicons name="information-circle" size={16} color="#5D4037" />
            <Text style={styles.noticeText}>Un code de confirmation OTP sera généré après votre demande.</Text>
          </View>
          <TouchableOpacity style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]} onPress={onRequest} disabled={loading || !phone.trim() || !amount}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Continuer →</Text>}
          </TouchableOpacity>
        </>
      )}

      {step === 2 && (
        <>
          <View style={styles.confirmSummary}>
            <Text style={styles.confirmSummaryLabel}>Dépôt de</Text>
            <Text style={[styles.confirmSummaryAmount, { color: C.success }]}>{parseInt(amount).toLocaleString()} FCFA</Text>
            <Text style={styles.confirmSummaryDetail}>{provider.emoji} {provider.name} · {phone}</Text>
          </View>
          {otpGenerated && <OtpDisplay otp={otpGenerated} />}
          <View style={styles.depositInstructions}>
            <Text style={styles.depositInstructionsTitle}>📋 Instructions :</Text>
            <Text style={styles.depositInstructionsText}>
              1. Envoyez {parseInt(amount).toLocaleString()} FCFA sur {provider.name}{"\n"}
              2. Entrez le code de confirmation ci-dessous{"\n"}
              3. Votre solde sera crédité instantanément
            </Text>
          </View>
          <Text style={styles.fieldLabel}>Code de confirmation</Text>
          <TextInput
            style={[styles.input, styles.otpInput]}
            placeholder="_ _ _ _ _ _"
            value={otpInput}
            onChangeText={t => setOtpInput(t.replace(/\D/g, "").slice(0, 6))}
            keyboardType="numeric"
            maxLength={6}
            placeholderTextColor={C.muted}
            textAlign="center"
          />
          <TouchableOpacity style={[styles.primaryBtn, (otpInput.length !== 6 || loading) && styles.primaryBtnDisabled]} onPress={onConfirm} disabled={otpInput.length !== 6 || loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>✅ Confirmer le dépôt</Text>}
          </TouchableOpacity>
        </>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerTitle: { fontSize: 22, fontWeight: "900", color: "#fff" },
  headerSub: { fontSize: 11, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  headerRefresh: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  tabBar: { flexDirection: "row", backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
  tab: { flex: 1, paddingVertical: 12, alignItems: "center" },
  tabActive: { borderBottomWidth: 2.5, borderBottomColor: C.primary },
  tabText: { fontSize: 12, color: C.muted, fontWeight: "600" },
  tabTextActive: { color: C.primary, fontWeight: "800" },
  bannedCard: { margin: 16, backgroundColor: "#FFEBEE", borderRadius: 16, padding: 16, borderWidth: 1.5, borderColor: "#EF9A9A", alignItems: "center", gap: 6 },
  bannedTitle: { fontSize: 16, fontWeight: "800", color: C.danger },
  bannedText: { fontSize: 12, color: "#B71C1C", textAlign: "center" },
  balanceCard: {
    margin: 16, marginTop: 20, backgroundColor: C.primary, borderRadius: 24, padding: 24,
    shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 20, elevation: 10,
  },
  balanceTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  balanceLabel: { fontSize: 13, fontWeight: "600", color: "rgba(255,255,255,0.75)" },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#69F0AE" },
  liveText: { fontSize: 10, fontWeight: "800", color: "#fff" },
  balanceAmount: { fontSize: 42, fontWeight: "900", color: "#fff", letterSpacing: -1.5 },
  balanceSub: { fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 4, marginBottom: 20 },
  balanceActions: { flexDirection: "row", gap: 12 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 14 },
  depositBtn: { backgroundColor: "rgba(255,255,255,0.25)" },
  withdrawBtn: { backgroundColor: "rgba(255,255,255,0.2)", borderWidth: 1, borderColor: "rgba(255,255,255,0.4)" },
  actionBtnDisabled: { opacity: 0.4 },
  actionBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  progressCard: { marginHorizontal: 16, marginBottom: 12, backgroundColor: C.card, borderRadius: 16, padding: 16, gap: 8, borderWidth: 1, borderColor: C.border },
  progressTitle: { fontSize: 13, fontWeight: "700", color: C.text },
  progressBarBg: { height: 8, backgroundColor: "#E9ECEF", borderRadius: 4, overflow: "hidden" },
  progressBarFill: { height: "100%", backgroundColor: C.primary, borderRadius: 4 },
  progressCaption: { fontSize: 12, color: C.muted },
  securityCard: { marginHorizontal: 16, marginBottom: 16, backgroundColor: "#E8F5E9", borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "flex-start", gap: 10, borderWidth: 1, borderColor: "#A5D6A7" },
  securityTitle: { fontSize: 13, fontWeight: "700", color: C.primary, marginBottom: 2 },
  securitySub: { fontSize: 12, color: "#388E3C", lineHeight: 17 },
  recentSection: { marginHorizontal: 16, gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: "800", color: C.text, marginBottom: 8 },
  txRow: {
    flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.card, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: C.border,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  txIconBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" },
  txLabel: { fontSize: 14, fontWeight: "700", color: C.text },
  txDesc: { fontSize: 12, color: C.muted },
  txStatus: { fontSize: 12, fontWeight: "600" },
  txAmount: { fontSize: 14, fontWeight: "800" },
  txDate: { fontSize: 11, color: C.muted, marginTop: 2 },
  emptyState: { alignItems: "center", paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 16, fontWeight: "700", color: C.text },
  emptySub: { fontSize: 13, color: C.muted, textAlign: "center" },
  seeAllBtn: { paddingVertical: 12, alignItems: "center", borderTopWidth: 1, borderTopColor: C.border, marginTop: 4 },
  seeAllText: { fontSize: 13, color: C.primary, fontWeight: "700" },
  videoProgressCard: { backgroundColor: C.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.border },
  videoProgressTitle: { fontSize: 15, fontWeight: "800", color: C.text },
  videoPill: { backgroundColor: "#E8F5E9", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  videoPillText: { fontSize: 12, fontWeight: "700", color: C.primary },
  earningsGuide: { backgroundColor: C.card, borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: C.border },
  earningsGuideTitle: { fontSize: 14, fontWeight: "800", color: C.text, marginBottom: 4 },
  guideRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  guideText: { flex: 1, fontSize: 13, color: C.text, lineHeight: 18 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: C.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, gap: 16 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#E0E0E0", alignSelf: "center", marginBottom: 8 },
  modalHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { fontSize: 18, fontWeight: "800", color: C.text },
  amountBox: { backgroundColor: "#E8F5E9", borderRadius: 14, padding: 16, alignItems: "center", borderWidth: 1, borderColor: "#A5D6A7" },
  amountBoxLabel: { fontSize: 12, color: C.muted, fontWeight: "600", marginBottom: 4 },
  amountBoxValue: { fontSize: 30, fontWeight: "900", color: C.primary },
  fieldLabel: { fontSize: 12, fontWeight: "700", color: C.muted, marginBottom: -4 },
  input: { backgroundColor: "#F8F9FA", borderRadius: 12, padding: 14, fontSize: 16, color: C.text, borderWidth: 1.5, borderColor: C.border },
  otpInput: { fontSize: 28, fontWeight: "900", letterSpacing: 8, borderColor: C.primary, backgroundColor: "#E8F5E9" },
  providerGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  providerChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: C.border, backgroundColor: "#F8F9FA" },
  providerChipActive: { borderColor: C.primary, backgroundColor: "#E8F5E9" },
  providerEmoji: { fontSize: 16 },
  providerName: { fontSize: 12, fontWeight: "600", color: C.muted },
  noticeBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#FFF8E1", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "#FFE082" },
  noticeText: { flex: 1, fontSize: 12, color: "#5D4037", lineHeight: 18 },
  primaryBtn: { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  primaryBtnDisabled: { backgroundColor: "#A5D6A7" },
  primaryBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  secondaryBtn: { paddingVertical: 12, alignItems: "center" },
  secondaryBtnText: { fontSize: 14, color: C.muted, fontWeight: "600" },
  confirmSummary: { backgroundColor: "#F8F9FA", borderRadius: 16, padding: 16, alignItems: "center", borderWidth: 1, borderColor: C.border },
  confirmSummaryLabel: { fontSize: 12, color: C.muted, fontWeight: "600", marginBottom: 4 },
  confirmSummaryAmount: { fontSize: 32, fontWeight: "900", color: C.danger },
  confirmSummaryDetail: { fontSize: 14, color: C.muted, marginTop: 4 },
  otpDisplay: { backgroundColor: "#1B5E20", borderRadius: 16, padding: 20, alignItems: "center", gap: 8 },
  otpDisplayLabel: { fontSize: 12, color: "rgba(255,255,255,0.75)", fontWeight: "600" },
  otpDigits: { flexDirection: "row", gap: 8 },
  otpDigitBox: { width: 42, height: 52, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  otpDigitText: { fontSize: 26, fontWeight: "900", color: "#fff" },
  otpDisplayHint: { fontSize: 11, color: "rgba(255,255,255,0.65)", textAlign: "center" },
  expiryText: { fontSize: 12, color: C.muted, textAlign: "center" },
  depositInstructions: { backgroundColor: "#E3F2FD", borderRadius: 12, padding: 14, borderWidth: 1, borderColor: "#90CAF9" },
  depositInstructionsTitle: { fontSize: 13, fontWeight: "700", color: "#1565C0", marginBottom: 6 },
  depositInstructionsText: { fontSize: 13, color: "#1565C0", lineHeight: 22 },
});
