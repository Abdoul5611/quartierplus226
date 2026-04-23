import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert,
  TextInput, ActivityIndicator, RefreshControl, Modal, Switch, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { api, WithdrawalRequest, HelpRequest, MerchantValidation } from "../services/api";
import { BASE_URL } from "../services/api";

const ADMIN_EMAIL = "administrateurquartierplus@gmail.com";

const C = {
  primary: "#2E7D32",
  danger: "#C62828",
  warning: "#F57F17",
  success: "#2E7D32",
  orange: "#E65100",
  gold: "#F9A825",
  bg: "#F0F2F5",
  card: "#FFFFFF",
  text: "#1A1A1A",
  sub: "#6B7280",
  border: "#E5E7EB",
};

type Tab = "cockpit" | "withdrawals" | "deposits" | "help" | "merchants" | "finance" | "jeux";

interface SystemStats { total_wallets: number; total_paris_en_cours: number; user_count: number; active_course: any | null; }
interface GainEntry { id: string; type: string; to_uid: string; amount: number; description: string; created_at: string; }
interface AdminCourse {
  id: string; titre: string; status: string;
  coureurs: { id: string; name: string; emoji: string }[];
  total_mises: number; cagnotte_amount: number; carryover_amount: number;
  winner_coureur_id?: string; repartition?: Record<string, number>;
  paris?: { id: string; user_name: string; coureur_id: string; montant: number; status: string; gain: number }[];
}
interface UserResult { firebase_uid: string; display_name: string; email: string; wallet_balance: number; is_banned: boolean; is_admin: boolean; }

function Card({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

function LotoDrawPanel({ adminEmail }: { adminEmail: string }) {
  const [stats, setStats] = React.useState<{ pending_count: number; pot_total: number; last_draw_at: string | null } | null>(null);
  const [statsLoading, setStatsLoading] = React.useState(false);
  const [drawing, setDrawing] = React.useState(false);
  const [lastResult, setLastResult] = React.useState<{ drawn_numbers: number[]; nb_participants: number; nb_winners: number; total_prizes_paid: number } | null>(null);

  const fetchStats = React.useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/admin/loto/stats?email=${encodeURIComponent(adminEmail)}`);
      const d = await res.json();
      if (res.ok) setStats(d);
    } catch {}
    setStatsLoading(false);
  }, [adminEmail]);

  React.useEffect(() => { fetchStats(); }, [fetchStats]);

  const handleDraw = () => {
    Alert.alert(
      "🎰 Lancer le tirage Loto ?",
      `${stats?.pending_count ?? 0} ticket(s) en attente.\nLe tirage va être effectué et les gains distribués immédiatement.`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "🎰 Lancer le tirage",
          onPress: async () => {
            setDrawing(true);
            try {
              const res = await fetch(`${BASE_URL}/api/admin/loto/draw`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: adminEmail }),
              });
              const d = await res.json();
              if (res.ok) {
                setLastResult(d);
                fetchStats();
                Alert.alert(
                  "✅ Tirage effectué !",
                  `Numéros : ${d.drawn_numbers?.join(" - ")}\n${d.nb_participants} participant(s)\n${d.nb_winners} gagnant(s)\n${d.total_prizes_paid?.toLocaleString()} FCFA distribués`
                );
              } else Alert.alert("Erreur", d.error);
            } catch { Alert.alert("Erreur réseau"); }
            setDrawing(false);
          },
        },
      ]
    );
  };

  if (statsLoading) return <ActivityIndicator color={C.primary} style={{ marginVertical: 12 }} />;

  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1, backgroundColor: "#E8F5E9", borderRadius: 10, padding: 12, alignItems: "center" }}>
          <Text style={{ fontSize: 22, fontWeight: "800", color: C.primary }}>{stats?.pending_count ?? 0}</Text>
          <Text style={{ fontSize: 12, color: C.sub }}>Tickets en attente</Text>
        </View>
        <View style={{ flex: 1, backgroundColor: "#FFF8E1", borderRadius: 10, padding: 12, alignItems: "center" }}>
          <Text style={{ fontSize: 22, fontWeight: "800", color: C.gold }}>{(stats?.pot_total ?? 0).toLocaleString()}</Text>
          <Text style={{ fontSize: 12, color: C.sub }}>FCFA en jeu</Text>
        </View>
      </View>
      {stats?.last_draw_at && (
        <Text style={{ fontSize: 12, color: C.sub, textAlign: "center" }}>
          Dernier tirage : {new Date(stats.last_draw_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
        </Text>
      )}
      {lastResult && (
        <View style={{ backgroundColor: "#E8F5E9", borderRadius: 10, padding: 12 }}>
          <Text style={{ fontWeight: "700", color: C.success, marginBottom: 4 }}>Résultat du dernier tirage</Text>
          <Text style={{ color: C.text, fontSize: 13 }}>Numéros : <Text style={{ fontWeight: "700" }}>{lastResult.drawn_numbers?.join(" - ")}</Text></Text>
          <Text style={{ color: C.text, fontSize: 13 }}>Gagnants : {lastResult.nb_winners} / {lastResult.nb_participants}</Text>
          <Text style={{ color: C.text, fontSize: 13 }}>Distribués : {lastResult.total_prizes_paid?.toLocaleString()} FCFA</Text>
        </View>
      )}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TouchableOpacity
          style={[styles.bigActionBtn, { flex: 1, backgroundColor: C.sub }]}
          onPress={fetchStats}
        >
          <Text style={styles.bigActionBtnText}>↻ Actualiser</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.bigActionBtn, {
            flex: 2,
            backgroundColor: (stats?.pending_count ?? 0) > 0 ? C.gold : C.border,
            opacity: drawing ? 0.6 : 1,
          }]}
          onPress={handleDraw}
          disabled={drawing || (stats?.pending_count ?? 0) === 0}
        >
          {drawing
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={[styles.bigActionBtnText, { color: (stats?.pending_count ?? 0) > 0 ? "#fff" : C.sub }]}>
                🎰 Lancer le tirage
                {(stats?.pending_count ?? 0) > 0 ? ` (${stats?.pending_count})` : " — aucun ticket"}
              </Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SectionHeader({ icon, title }: { icon: string; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderIcon}>{icon}</Text>
      <Text style={styles.sectionHeaderTitle}>{title}</Text>
    </View>
  );
}

export default function AdminScreen() {
  const { firebaseUser, dbUser, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("cockpit");
  const adminEmail = firebaseUser?.email || dbUser?.email || ADMIN_EMAIL;

  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [helpReqs, setHelpReqs] = useState<HelpRequest[]>([]);
  const [merchants, setMerchants] = useState<MerchantValidation[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [responseModal, setResponseModal] = useState<{ visible: boolean; requestId: string }>({ visible: false, requestId: "" });
  const [responseText, setResponseText] = useState("");

  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [gains, setGains] = useState<GainEntry[]>([]);
  const [gainsLoading, setGainsLoading] = useState(false);

  const [adminCourse, setAdminCourse] = useState<AdminCourse | null>(null);
  const [courseLoading, setCourseLoading] = useState(false);
  const [courseAction, setCourseAction] = useState(false);
  const [selectedWinner, setSelectedWinner] = useState("");
  const [showWinnerPanel, setShowWinnerPanel] = useState(false);

  const [quizTitre, setQuizTitre] = useState("");
  const [quizPrize, setQuizPrize] = useState("10000");
  const emptyQuestion = () => ({ question: "", options: ["", "", "", ""], correct: null as number | null });
  const [quizBatch, setQuizBatch] = useState(() => Array.from({ length: 10 }, emptyQuestion));
  const [quizSending, setQuizSending] = useState(false);
  const [quizActive, setQuizActive] = useState<{ id: string; titre: string; prize_pool: number; total_questions: number; status: string } | null>(null);

  const [gameStatus, setGameStatus] = useState({ course: true, quiz: true, loto: true });
  const [gameToggling, setGameToggling] = useState({ course: false, quiz: false, loto: false });

  const [flashTitle, setFlashTitle] = useState("");
  const [flashMessage, setFlashMessage] = useState("");
  const [flashSending, setFlashSending] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [banningUid, setBanningUid] = useState<string | null>(null);
  const [creditUid, setCreditUid] = useState<string | null>(null);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditReason, setCreditReason] = useState("");
  const [creditModalUid, setCreditModalUid] = useState<string | null>(null);
  const [crediting, setCrediting] = useState(false);

  const [deposits, setDeposits] = useState<any[]>([]);
  const [depositsLoading, setDepositsLoading] = useState(false);
  const [depositActing, setDepositActing] = useState<string | null>(null);

  const [commissionMode, setCommissionMode] = useState<"percent" | "fixed">("percent");
  const [commissionValue, setCommissionValue] = useState("20");
  const [commissionSaving, setCommissionSaving] = useState(false);

  const statsInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const [w, h, m] = await Promise.all([
        api.getAdminWithdrawals(ADMIN_EMAIL),
        api.getAdminHelpRequests(ADMIN_EMAIL),
        api.getAdminMerchantValidations(ADMIN_EMAIL),
      ]);
      setWithdrawals(w);
      setHelpReqs(h);
      setMerchants(m);
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [isAdmin]);

  const fetchSystemStats = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch(`${BASE_URL}/api/admin/system-stats?email=${encodeURIComponent(adminEmail)}`);
      const data = await res.json();
      if (res.ok) setSystemStats(data);
    } catch {}
  }, [isAdmin, adminEmail]);

  const fetchGains = useCallback(async () => {
    setGainsLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/admin/gains-history?email=${encodeURIComponent(adminEmail)}`);
      const data = await res.json();
      if (res.ok) setGains(data);
    } catch {}
    setGainsLoading(false);
  }, [adminEmail]);

  const fetchAdminCourse = useCallback(async () => {
    setCourseLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/admin/course-active?email=${encodeURIComponent(adminEmail)}`);
      const data = await res.json();
      if (res.ok) setAdminCourse(data);
    } catch {}
    setCourseLoading(false);
  }, [adminEmail]);

  const fetchGameStatus = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/admin/game-status?email=${encodeURIComponent(adminEmail)}`);
      const data = await res.json();
      if (res.ok) setGameStatus(data);
    } catch {}
  }, [adminEmail]);

  const fetchCommission = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/admin/commission?email=${encodeURIComponent(adminEmail)}`);
      const data = await res.json();
      if (res.ok) {
        setCommissionMode(data.mode);
        setCommissionValue(data.mode === "fixed" ? String(data.fcfa ?? 0) : String(data.percent ?? 20));
      }
    } catch {}
  }, [adminEmail]);

  const fetchDeposits = useCallback(async () => {
    if (!isAdmin) return;
    setDepositsLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/admin/deposits?email=${encodeURIComponent(adminEmail)}`);
      const data = await res.json();
      if (res.ok) setDeposits(data);
    } catch {}
    setDepositsLoading(false);
  }, [isAdmin, adminEmail]);

  const handleDepositAction = async (id: string, action: "approved" | "rejected") => {
    const label = action === "approved" ? "Valider ce dépôt ?" : "Refuser ce dépôt ?";
    Alert.alert(label, action === "approved" ? "Le solde de l'utilisateur sera crédité immédiatement." : "Le dépôt sera annulé.", [
      { text: "Annuler", style: "cancel" },
      {
        text: action === "approved" ? "✅ Valider" : "❌ Refuser",
        style: action === "rejected" ? "destructive" : "default",
        onPress: async () => {
          setDepositActing(id);
          try {
            const res = await fetch(`${BASE_URL}/api/admin/deposits/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: adminEmail, action }),
            });
            const data = await res.json();
            if (res.ok) {
              fetchDeposits();
              Alert.alert("✅ Succès", action === "approved" ? data.message : "Dépôt refusé.");
            } else Alert.alert("Erreur", data.error);
          } catch { Alert.alert("Erreur réseau"); }
          setDepositActing(null);
        },
      },
    ]);
  };

  const handleDirectCredit = async () => {
    if (!creditModalUid) return;
    const amount = parseInt(creditAmount);
    if (!amount || amount <= 0) return Alert.alert("Erreur", "Montant invalide");
    setCrediting(true);
    try {
      const res = await fetch(`${BASE_URL}/api/admin/users/${creditModalUid}/credit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: adminEmail, amount, reason: creditReason || `Crédit admin: ${amount} FCFA` }),
      });
      const data = await res.json();
      if (res.ok) {
        setCreditModalUid(null);
        setCreditAmount("");
        setCreditReason("");
        setSearchResults(prev => prev.map(u => u.firebase_uid === creditModalUid ? { ...u, wallet_balance: data.new_balance } : u));
        Alert.alert("✅ Crédité !", data.message);
      } else Alert.alert("Erreur", data.error);
    } catch { Alert.alert("Erreur réseau"); }
    setCrediting(false);
  };

  useEffect(() => { fetchData(); fetchGameStatus(); fetchCommission(); }, [fetchData, fetchGameStatus, fetchCommission]);

  useEffect(() => {
    if (activeTab === "cockpit") {
      fetchSystemStats();
      fetchGameStatus();
      statsInterval.current = setInterval(fetchSystemStats, 15000);
    } else if (activeTab === "finance") {
      fetchSystemStats();
      fetchGains();
    } else if (activeTab === "jeux") {
      fetchAdminCourse();
    } else if (activeTab === "deposits") {
      fetchDeposits();
    }
    return () => { if (statsInterval.current) clearInterval(statsInterval.current); };
  }, [activeTab]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
    fetchSystemStats();
    if (activeTab === "jeux") { fetchAdminCourse(); fetchActiveQuiz(); }
    if (activeTab === "finance") fetchGains();
    if (activeTab === "deposits") fetchDeposits();
  };

  if (!isAdmin) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={styles.denied}>
          <Text style={{ fontSize: 64 }}>🔒</Text>
          <Text style={styles.deniedTitle}>Accès Refusé</Text>
          <Text style={styles.deniedSub}>Réservé à l'administrateur QuartierPlus.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const pendingW = withdrawals.filter(w => w.status === "pending");
  const openH = helpReqs.filter(h => h.status === "open");
  const pendingM = merchants.filter(m => m.validation_status === "pending");

  const handleWithdrawalAction = async (id: string, status: "approved" | "rejected") => {
    Alert.alert(
      status === "approved" ? "Valider le transfert ?" : "Refuser ?",
      status === "approved" ? "Confirmez le paiement de ce retrait ?" : "Voulez-vous refuser cette demande ?",
      [{ text: "Annuler", style: "cancel" }, {
        text: "Confirmer", style: status === "rejected" ? "destructive" : "default",
        onPress: async () => {
          try {
            await api.updateWithdrawalStatus(id, status, ADMIN_EMAIL);
            fetchData();
            Alert.alert("Succès", status === "approved" ? "Transfert validé." : "Demande refusée.");
          } catch (e: any) { Alert.alert("Erreur", e.message); }
        },
      }]
    );
  };

  const handleMerchantAction = async (id: string, s: "approved" | "rejected") => {
    try {
      await api.updateMerchantValidation(id, s, ADMIN_EMAIL);
      fetchData();
      Alert.alert("Succès", s === "approved" ? "Approuvé." : "Rejeté.");
    } catch (e: any) { Alert.alert("Erreur", e.message); }
  };

  const handleGameToggle = async (game: "course" | "quiz" | "loto", value: boolean) => {
    setGameToggling(prev => ({ ...prev, [game]: true }));
    try {
      const res = await fetch(`${BASE_URL}/api/admin/game-toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: adminEmail, game, enabled: value }),
      });
      const data = await res.json();
      if (res.ok) setGameStatus(prev => ({ ...prev, [game]: data.enabled }));
      else Alert.alert("Erreur", data.error);
    } catch { Alert.alert("Erreur réseau"); }
    setGameToggling(prev => ({ ...prev, [game]: false }));
  };

  const handleGameReset = async (game: "course" | "quiz") => {
    const label = game === "course" ? "Course de Rue" : "Quiz";
    Alert.alert(`Réinitialiser ${label} ?`, "Les scores et paris en cours seront effacés. Cette action est irréversible.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Réinitialiser", style: "destructive",
        onPress: async () => {
          try {
            const res = await fetch(`${BASE_URL}/api/admin/game-reset`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: adminEmail, game }),
            });
            const data = await res.json();
            if (res.ok) { Alert.alert("✅ Réinitialisé", data.message); fetchAdminCourse(); }
            else Alert.alert("Erreur", data.error);
          } catch { Alert.alert("Erreur réseau"); }
        },
      },
    ]);
  };

  const handleFlashSend = async () => {
    if (!flashMessage.trim()) return Alert.alert("Erreur", "Saisissez un message");
    setFlashSending(true);
    try {
      const res = await fetch(`${BASE_URL}/api/admin/flash-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: adminEmail, title: flashTitle.trim() || "📢 Message du Quartier", message: flashMessage.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setFlashTitle("");
        setFlashMessage("");
        Alert.alert("📢 Envoyé !", `Message diffusé à ${data.recipients} utilisateur(s) connecté(s).`);
      } else Alert.alert("Erreur", data.error);
    } catch { Alert.alert("Erreur réseau"); }
    setFlashSending(false);
  };

  const handleSearch = async () => {
    if (searchQuery.trim().length < 2) return Alert.alert("Erreur", "Saisissez au moins 2 caractères");
    setSearching(true);
    try {
      const res = await fetch(`${BASE_URL}/api/admin/users/search?email=${encodeURIComponent(adminEmail)}&q=${encodeURIComponent(searchQuery.trim())}`);
      const data = await res.json();
      if (res.ok) setSearchResults(data);
      else Alert.alert("Erreur", data.error);
    } catch { Alert.alert("Erreur réseau"); }
    setSearching(false);
  };

  const handleBan = async (uid: string, currentBanned: boolean) => {
    const action = currentBanned ? "Débannir" : "Bannir";
    Alert.alert(`${action} cet utilisateur ?`, currentBanned ? "L'utilisateur pourra à nouveau accéder à l'application." : "L'utilisateur sera bloqué immédiatement.", [
      { text: "Annuler", style: "cancel" },
      {
        text: action, style: currentBanned ? "default" : "destructive",
        onPress: async () => {
          setBanningUid(uid);
          try {
            const res = await fetch(`${BASE_URL}/api/admin/users/${uid}/ban`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: adminEmail, ban: !currentBanned }),
            });
            const data = await res.json();
            if (res.ok) {
              setSearchResults(prev => prev.map(u => u.firebase_uid === uid ? { ...u, is_banned: !currentBanned } : u));
              Alert.alert("✅ Succès", `Utilisateur ${!currentBanned ? "banni" : "débanni"}.`);
            } else Alert.alert("Erreur", data.error);
          } catch { Alert.alert("Erreur réseau"); }
          setBanningUid(null);
        },
      },
    ]);
  };

  const handleSaveCommission = async () => {
    const val = parseFloat(commissionValue);
    if (isNaN(val) || val < 0) return Alert.alert("Erreur", "Valeur invalide");
    setCommissionSaving(true);
    try {
      const res = await fetch(`${BASE_URL}/api/admin/commission`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: adminEmail, mode: commissionMode, value: val }),
      });
      const data = await res.json();
      if (res.ok) Alert.alert("✅ Enregistré", commissionMode === "fixed" ? `Frais fixe : ${val} FCFA par transaction` : `Commission : ${val}% par transaction`);
      else Alert.alert("Erreur", data.error);
    } catch { Alert.alert("Erreur réseau"); }
    setCommissionSaving(false);
  };

  const handleLancerDepart = async () => {
    if (!adminCourse) return;
    Alert.alert("Lancer le départ ?", "La course passera en mode 'En course'. Les paris seront fermés.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "🏁 Lancer !", onPress: async () => {
          setCourseAction(true);
          try {
            const res = await fetch(`${BASE_URL}/api/courses/${adminCourse.id}/status`, {
              method: "PATCH", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "running", admin_uid: firebaseUser?.uid, admin_email: adminEmail }),
            });
            if (res.ok) { await fetchAdminCourse(); Alert.alert("🏁 Départ lancé !", "Tous les utilisateurs ont été notifiés."); }
            else { const d = await res.json(); Alert.alert("Erreur", d.error); }
          } catch { Alert.alert("Erreur réseau"); }
          setCourseAction(false);
        },
      },
    ]);
  };

  const handleValiderGagnant = async () => {
    if (!selectedWinner || !adminCourse) return;
    const coureur = adminCourse.coureurs.find(c => c.id === selectedWinner);
    Alert.alert("Valider le gagnant ?", `Confirmer ${coureur?.emoji} ${coureur?.name} comme gagnant ?`, [
      { text: "Annuler", style: "cancel" },
      {
        text: "✅ Valider", onPress: async () => {
          setCourseAction(true);
          try {
            const res = await fetch(`${BASE_URL}/api/courses/${adminCourse.id}/finish`, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ winner_coureur_id: selectedWinner, admin_uid: firebaseUser?.uid, admin_email: adminEmail }),
            });
            const data = await res.json();
            if (res.ok) {
              setShowWinnerPanel(false); setSelectedWinner("");
              await fetchAdminCourse(); await fetchSystemStats();
              Alert.alert("✅ Course terminée !", data.has_carryover
                ? `Report : ${data.carryover_amount?.toLocaleString()} FCFA`
                : `${data.nb_gagnants} gagnant(s) — ${data.gain_par_gagnant?.toLocaleString()} FCFA chacun`);
            } else Alert.alert("Erreur", data.error);
          } catch { Alert.alert("Erreur réseau"); }
          setCourseAction(false);
        },
      },
    ]);
  };

  const updateQuizQuestion = (idx: number, patch: Partial<{ question: string; options: string[]; correct: number | null }>) => {
    setQuizBatch(prev => prev.map((q, i) => i === idx ? { ...q, ...patch } : q));
  };

  const fetchActiveQuiz = useCallback(async () => {
    if (!adminEmail) return;
    try {
      const res = await fetch(`${BASE_URL}/api/admin/quiz/active?email=${encodeURIComponent(adminEmail)}`);
      const d = await res.json();
      if (res.ok) setQuizActive(d.active);
    } catch {}
  }, [adminEmail]);

  const handleCreateQuizBatch = async () => {
    const ready = quizBatch.filter(q => q.question.trim() && q.options.every(o => o.trim()) && q.correct !== null);
    if (ready.length === 0) return Alert.alert("Erreur", "Remplissez au moins 1 question complète (texte + 4 options + bonne réponse).");
    Alert.alert(
      `🎯 Activer le Quiz ?`,
      `${ready.length} question(s) prête(s) sur ${quizBatch.length}.\nDotation : ${Number(quizPrize) || 10000} FCFA.`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "✅ Créer et activer", onPress: async () => {
            setQuizSending(true);
            try {
              const res = await fetch(`${BASE_URL}/api/admin/quiz/create-batch`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  email: adminEmail,
                  titre: quizTitre.trim() || "Live Quiz QuartierPlus",
                  prize_pool: Number(quizPrize) || 10000,
                  questions: ready.map(q => ({ question: q.question.trim(), options: q.options.map(o => o.trim()), correct_index: q.correct })),
                }),
              });
              const data = await res.json();
              if (res.ok) {
                setQuizBatch(Array.from({ length: 10 }, emptyQuestion));
                setQuizTitre("");
                await fetchActiveQuiz();
                Alert.alert("✅ Quiz activé !", `${data.total_questions} questions enregistrées. Les joueurs peuvent rejoindre.`);
              } else Alert.alert("Erreur", data.error);
            } catch { Alert.alert("Erreur réseau"); }
            setQuizSending(false);
          },
        },
      ]
    );
  };

  const [agilityLeaderboard, setAgilityLeaderboard] = useState<any[]>([]);
  const [agilityLoading, setAgilityLoading] = useState(false);

  const fetchAgilityLeaderboard = useCallback(async () => {
    if (!adminEmail) return;
    setAgilityLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/admin/agility/leaderboard?email=${encodeURIComponent(adminEmail)}&limit=50`);
      const d = await res.json();
      if (res.ok && Array.isArray(d)) setAgilityLeaderboard(d);
    } catch {}
    setAgilityLoading(false);
  }, [adminEmail]);

  const handleAgilityReward = (scoreId: string, userName: string, score: number) => {
    Alert.prompt
      ? Alert.prompt(
          "🎁 Distribuer le gain",
          `Récompenser ${userName} (${score} clics). Montant en FCFA :`,
          [
            { text: "Annuler", style: "cancel" },
            {
              text: "Valider",
              onPress: async (val?: string) => {
                const amount = Number(val) || 1000;
                await sendAgilityReward(scoreId, amount);
              },
            },
          ],
          "plain-text",
          "1000"
        )
      : Alert.alert(
          "🎁 Distribuer 1000 FCFA ?",
          `Récompenser ${userName} (${score} clics) avec 1000 FCFA.`,
          [
            { text: "Annuler", style: "cancel" },
            { text: "Valider", onPress: () => sendAgilityReward(scoreId, 1000) },
          ]
        );
  };

  const sendAgilityReward = async (scoreId: string, amount: number) => {
    try {
      const res = await fetch(`${BASE_URL}/api/admin/agility/reward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: adminEmail, score_id: scoreId, amount }),
      });
      const d = await res.json();
      if (res.ok) {
        Alert.alert("✅ Gain distribué", `${amount.toLocaleString()} FCFA crédité.`);
        fetchAgilityLeaderboard();
      } else Alert.alert("Erreur", d.error || "Échec");
    } catch {
      Alert.alert("Erreur réseau");
    }
  };

  const handleAgilityReset = () => {
    Alert.alert("⚠️ Réinitialiser ?", "Tous les scores de la Course d'Agilité seront supprimés.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Confirmer", style: "destructive", onPress: async () => {
          try {
            const res = await fetch(`${BASE_URL}/api/admin/agility/reset`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email: adminEmail }),
            });
            const d = await res.json();
            if (res.ok) {
              Alert.alert("✅ Réinitialisé", `${d.deleted} score(s) supprimé(s).`);
              fetchAgilityLeaderboard();
            } else Alert.alert("Erreur", d.error || "Échec");
          } catch { Alert.alert("Erreur réseau"); }
        }
      }
    ]);
  };

  const formatDate = (d: string) => {
    const dt = new Date(d);
    return `${dt.getDate().toString().padStart(2, "0")}/${(dt.getMonth() + 1).toString().padStart(2, "0")} ${dt.getHours().toString().padStart(2, "0")}:${dt.getMinutes().toString().padStart(2, "0")}`;
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { bg: string; label: string }> = {
      pending: { bg: C.warning, label: "En attente" },
      approved: { bg: C.success, label: "Approuvé" },
      rejected: { bg: C.danger, label: "Rejeté" },
      open: { bg: "#1565C0", label: "Ouvert" },
      closed: { bg: C.sub, label: "Fermé" },
      running: { bg: C.orange, label: "En course" },
      finished: { bg: C.sub, label: "Terminé" },
    };
    const s = map[status] || { bg: C.sub, label: status };
    return <View style={[styles.badge, { backgroundColor: s.bg }]}><Text style={styles.badgeText}>{s.label}</Text></View>;
  };

  const gainTypeLabel = (type: string) => ({ course_gain: "🏁 Course", quiz_win: "🎯 Quiz", loto_win: "🎰 Loto" }[type] || type);

  const pendingDeposits = deposits.filter(d => d.status === "pending" || d.status === "awaiting_admin");

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id: "cockpit", label: "🎛️ Cockpit" },
    { id: "withdrawals", label: "💸 Retraits", badge: pendingW.length },
    { id: "deposits", label: "📥 Dépôts", badge: pendingDeposits.length },
    { id: "help", label: "🆘 Aide", badge: openH.length },
    { id: "merchants", label: "🏪 Marchands", badge: pendingM.length },
    { id: "finance", label: "💰 Finance" },
    { id: "jeux", label: "🎮 Jeux" },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>🛡️ Administration</Text>
          <Text style={styles.headerSub}>{adminEmail}</Text>
        </View>
        {systemStats && (
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>{systemStats.user_count} utilisateurs</Text>
          </View>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll} contentContainerStyle={styles.tabsContent}>
        {TABS.map(t => (
          <TouchableOpacity key={t.id} style={[styles.tab, activeTab === t.id && styles.tabActive]} onPress={() => setActiveTab(t.id)}>
            <Text style={[styles.tabText, activeTab === t.id && styles.tabTextActive]}>
              {t.label}{t.badge ? ` (${t.badge})` : ""}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[C.primary]} />}
      >

        {activeTab === "cockpit" && (
          <>
            <Card>
              <SectionHeader icon="🎮" title="Zone de Contrôle — Jeux" />
              <View style={styles.toggleRow}>
                <View style={styles.toggleInfo}>
                  <Text style={styles.toggleLabel}>🏁 Course de Rue</Text>
                  <Text style={styles.toggleSub}>{gameStatus.course ? "Activée — les utilisateurs peuvent parier" : "Désactivée — accès bloqué"}</Text>
                </View>
                {gameToggling.course
                  ? <ActivityIndicator size="small" color={C.primary} />
                  : <Switch value={gameStatus.course} onValueChange={v => handleGameToggle("course", v)} trackColor={{ false: "#E0E0E0", true: "#A5D6A7" }} thumbColor={gameStatus.course ? C.primary : "#9E9E9E"} />
                }
              </View>
              <View style={styles.toggleRow}>
                <View style={styles.toggleInfo}>
                  <Text style={styles.toggleLabel}>🎯 Live Quiz</Text>
                  <Text style={styles.toggleSub}>{gameStatus.quiz ? "Activé — nouvelles sessions possibles" : "Désactivé — création bloquée"}</Text>
                </View>
                {gameToggling.quiz
                  ? <ActivityIndicator size="small" color={C.primary} />
                  : <Switch value={gameStatus.quiz} onValueChange={v => handleGameToggle("quiz", v)} trackColor={{ false: "#E0E0E0", true: "#A5D6A7" }} thumbColor={gameStatus.quiz ? C.primary : "#9E9E9E"} />
                }
              </View>
              <View style={[styles.toggleRow, { borderBottomWidth: 0 }]}>
                <View style={styles.toggleInfo}>
                  <Text style={styles.toggleLabel}>🎰 Loto 5/30</Text>
                  <Text style={styles.toggleSub}>{gameStatus.loto ? "Activé — achat de tickets possible" : "Désactivé — achat bloqué"}</Text>
                </View>
                {gameToggling.loto
                  ? <ActivityIndicator size="small" color={C.primary} />
                  : <Switch value={gameStatus.loto} onValueChange={v => handleGameToggle("loto", v)} trackColor={{ false: "#E0E0E0", true: "#A5D6A7" }} thumbColor={gameStatus.loto ? C.primary : "#9E9E9E"} />
                }
              </View>
              <View style={styles.resetRow}>
                <TouchableOpacity style={styles.resetBtn} onPress={() => handleGameReset("course")}>
                  <Ionicons name="refresh-circle" size={16} color={C.orange} />
                  <Text style={styles.resetBtnText}>Reset Course</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.resetBtn} onPress={() => handleGameReset("quiz")}>
                  <Ionicons name="refresh-circle" size={16} color={C.orange} />
                  <Text style={styles.resetBtnText}>Reset Quiz</Text>
                </TouchableOpacity>
              </View>
            </Card>

            <Card>
              <SectionHeader icon="💸" title="Zone de Paiement — Retraits en attente" />
              {pendingW.length === 0 ? (
                <View style={styles.miniEmpty}><Text style={styles.miniEmptyText}>✅ Aucune demande en attente</Text></View>
              ) : (
                pendingW.map(w => (
                  <View key={w.id} style={styles.withdrawItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.withdrawName}>{w.user_name || w.user_email}</Text>
                      <Text style={styles.withdrawAmount}>{w.amount?.toLocaleString()} FCFA</Text>
                      <Text style={styles.withdrawDetail}>{w.mobile_money_provider?.toUpperCase()} — {w.mobile_money}</Text>
                      <Text style={styles.withdrawDate}>{formatDate(w.created_at)}</Text>
                    </View>
                    <View style={styles.withdrawActions}>
                      <TouchableOpacity style={styles.validateBtn} onPress={() => handleWithdrawalAction(w.id, "approved")}>
                        <Ionicons name="checkmark" size={14} color="#fff" />
                        <Text style={styles.validateBtnText}>Valider</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.refuseBtn} onPress={() => handleWithdrawalAction(w.id, "rejected")}>
                        <Ionicons name="close" size={14} color="#fff" />
                        <Text style={styles.refuseBtnText}>Refuser</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
              {withdrawals.length > pendingW.length && (
                <TouchableOpacity onPress={() => setActiveTab("withdrawals")} style={styles.seeMoreBtn}>
                  <Text style={styles.seeMoreText}>Voir tous les retraits ({withdrawals.length}) →</Text>
                </TouchableOpacity>
              )}
            </Card>

            <Card>
              <SectionHeader icon="📢" title="Zone de Notification — Message Flash" />
              <TextInput
                style={styles.flashTitleInput}
                placeholder="Titre (optionnel)"
                value={flashTitle}
                onChangeText={setFlashTitle}
                placeholderTextColor={C.sub}
              />
              <TextInput
                style={styles.flashBodyInput}
                placeholder="Tapez votre message à diffuser à tout le quartier..."
                value={flashMessage}
                onChangeText={setFlashMessage}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                placeholderTextColor={C.sub}
              />
              <TouchableOpacity
                style={[styles.flashSendBtn, (!flashMessage.trim() || flashSending) && { opacity: 0.5 }]}
                onPress={handleFlashSend}
                disabled={!flashMessage.trim() || flashSending}
              >
                {flashSending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <><Ionicons name="megaphone" size={18} color="#fff" /><Text style={styles.flashSendBtnText}>Envoyer à tout le quartier</Text></>
                }
              </TouchableOpacity>
            </Card>

            <Card>
              <SectionHeader icon="🔒" title="Gestion de Bannissement" />
              <View style={styles.searchRow}>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Rechercher par nom ou email..."
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  onSubmitEditing={handleSearch}
                  returnKeyType="search"
                  placeholderTextColor={C.sub}
                />
                <TouchableOpacity style={styles.searchBtn} onPress={handleSearch} disabled={searching}>
                  {searching ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="search" size={18} color="#fff" />}
                </TouchableOpacity>
              </View>
              {searchResults.length > 0 && (
                <View style={{ marginTop: 12, gap: 8 }}>
                  {searchResults.map(u => (
                    <View key={u.firebase_uid} style={[styles.userResultItem, u.is_banned && styles.userResultBanned]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.userResultName}>{u.display_name || u.email}</Text>
                        <Text style={styles.userResultSub}>{u.email}</Text>
                        <Text style={styles.userResultBalance}>Solde : {(u.wallet_balance || 0).toLocaleString()} FCFA</Text>
                        {u.is_banned && <Text style={styles.bannedLabel}>🔴 BANNI</Text>}
                        {u.is_admin && <Text style={styles.adminLabel}>🛡️ ADMIN</Text>}
                      </View>
                      <View style={{ gap: 6 }}>
                        <TouchableOpacity
                          style={[styles.banBtn, u.is_banned ? styles.unbanBtn : styles.banBtnActive]}
                          onPress={() => handleBan(u.firebase_uid, u.is_banned)}
                          disabled={banningUid === u.firebase_uid || u.is_admin}
                        >
                          {banningUid === u.firebase_uid
                            ? <ActivityIndicator size="small" color="#fff" />
                            : <Text style={styles.banBtnText}>{u.is_banned ? "Débannir" : "🚫 Bannir"}</Text>
                          }
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.banBtn, { backgroundColor: C.primary }]}
                          onPress={() => { setCreditModalUid(u.firebase_uid); setCreditAmount(""); setCreditReason(""); }}
                        >
                          <Text style={styles.banBtnText}>💳 Créditer</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}
              {searchResults.length === 0 && searchQuery.length > 0 && !searching && (
                <View style={styles.miniEmpty}><Text style={styles.miniEmptyText}>Aucun utilisateur trouvé</Text></View>
              )}
            </Card>

            <Card style={{ marginBottom: 24 }}>
              <SectionHeader icon="⚙️" title="Réglage de Commission" />
              <View style={styles.commissionModeRow}>
                <TouchableOpacity
                  style={[styles.modeBtn, commissionMode === "percent" && styles.modeBtnActive]}
                  onPress={() => setCommissionMode("percent")}
                >
                  <Text style={[styles.modeBtnText, commissionMode === "percent" && styles.modeBtnTextActive]}>% Pourcentage</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modeBtn, commissionMode === "fixed" && styles.modeBtnActive]}
                  onPress={() => setCommissionMode("fixed")}
                >
                  <Text style={[styles.modeBtnText, commissionMode === "fixed" && styles.modeBtnTextActive]}>Frais fixe (FCFA)</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.commissionInputRow}>
                <TextInput
                  style={styles.commissionInput}
                  value={commissionValue}
                  onChangeText={setCommissionValue}
                  keyboardType="numeric"
                  placeholder={commissionMode === "percent" ? "ex: 20" : "ex: 500"}
                  placeholderTextColor={C.sub}
                />
                <Text style={styles.commissionUnit}>{commissionMode === "percent" ? "%" : "FCFA"}</Text>
              </View>
              <Text style={styles.commissionHelp}>
                {commissionMode === "percent"
                  ? `Ta part sera de ${commissionValue || "0"}% prélevé sur chaque transaction (Course, Wallet...)`
                  : `Frais fixe de ${commissionValue || "0"} FCFA par transaction`
                }
              </Text>
              <TouchableOpacity
                style={[styles.saveCommissionBtn, commissionSaving && { opacity: 0.5 }]}
                onPress={handleSaveCommission}
                disabled={commissionSaving}
              >
                {commissionSaving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.saveCommissionBtnText}>💾 Enregistrer</Text>
                }
              </TouchableOpacity>
            </Card>
          </>
        )}

        {activeTab === "withdrawals" && (
          <>
            <Text style={styles.sectionTitle}>Demandes de retrait ({withdrawals.length})</Text>
            {withdrawals.length === 0 ? (
              <View style={styles.empty}><Text style={{ fontSize: 40 }}>✅</Text><Text style={styles.emptyText}>Aucune demande</Text></View>
            ) : (
              withdrawals.map(w => (
                <Card key={w.id}>
                  <View style={styles.cardRow}>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={styles.cardTitle}>{w.user_name || w.user_email}</Text>
                      <Text style={styles.cardAmount}>{w.amount?.toLocaleString()} FCFA</Text>
                      <Text style={styles.cardSub}>{w.mobile_money_provider?.toUpperCase()} — {w.mobile_money}</Text>
                      <Text style={styles.cardDate}>{formatDate(w.created_at)}</Text>
                    </View>
                    {statusBadge(w.status)}
                  </View>
                  {w.status === "pending" && (
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <TouchableOpacity style={[styles.actionBtn, { backgroundColor: C.success }]} onPress={() => handleWithdrawalAction(w.id, "approved")}>
                        <Text style={styles.actionBtnText}>✓ Valider le transfert</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.actionBtn, { backgroundColor: C.danger }]} onPress={() => handleWithdrawalAction(w.id, "rejected")}>
                        <Text style={styles.actionBtnText}>✗ Refuser</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </Card>
              ))
            )}
          </>
        )}

        {activeTab === "deposits" && (
          <>
            <Text style={styles.sectionTitle}>Dépôts Mobile Money ({deposits.length})</Text>
            {depositsLoading ? <ActivityIndicator color={C.primary} style={{ marginVertical: 20 }} />
              : deposits.length === 0 ? (
                <View style={styles.empty}><Text style={{ fontSize: 40 }}>✅</Text><Text style={styles.emptyText}>Aucun dépôt</Text></View>
              ) : (
                deposits.map(d => (
                  <Card key={d.id}>
                    <View style={styles.cardRow}>
                      <View style={{ flex: 1, gap: 3 }}>
                        <Text style={styles.cardTitle}>{d.user_name || d.user_email || d.user_id}</Text>
                        <Text style={[styles.cardAmount, { color: C.primary }]}>+{d.amount?.toLocaleString()} FCFA</Text>
                        <Text style={styles.cardSub}>{d.mobile_money_provider?.toUpperCase()} — {d.mobile_money}</Text>
                        <Text style={styles.cardDate}>{formatDate(d.created_at)}</Text>
                      </View>
                      {statusBadge(d.status)}
                    </View>
                    {(d.status === "pending" || d.status === "awaiting_admin") && (
                      <View style={{ flexDirection: "row", gap: 10 }}>
                        {depositActing === d.id ? <ActivityIndicator color={C.primary} style={{ marginVertical: 8 }} /> : (
                          <>
                            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: C.success }]} onPress={() => handleDepositAction(d.id, "approved")}>
                              <Text style={styles.actionBtnText}>✓ Créditer</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.actionBtn, { backgroundColor: C.danger }]} onPress={() => handleDepositAction(d.id, "rejected")}>
                              <Text style={styles.actionBtnText}>✗ Refuser</Text>
                            </TouchableOpacity>
                          </>
                        )}
                      </View>
                    )}
                  </Card>
                ))
              )
            }
          </>
        )}

        {activeTab === "help" && (
          <>
            <Text style={styles.sectionTitle}>Demandes d'aide ({helpReqs.length})</Text>
            {helpReqs.length === 0 ? (
              <View style={styles.empty}><Text style={{ fontSize: 40 }}>✅</Text><Text style={styles.emptyText}>Aucune demande</Text></View>
            ) : (
              helpReqs.map(h => (
                <Card key={h.id}>
                  <View style={styles.cardRow}>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={styles.cardTitle}>{h.user_name || h.user_email}</Text>
                      <Text style={[styles.cardSub, { fontWeight: "600" as any }]}>{h.subject}</Text>
                      <Text style={styles.cardSub} numberOfLines={3}>{h.message}</Text>
                      <Text style={styles.cardDate}>{formatDate(h.created_at)}</Text>
                      {h.admin_response && (
                        <View style={styles.responseBox}><Text style={styles.responseLabel}>Votre réponse :</Text><Text style={styles.responseText}>{h.admin_response}</Text></View>
                      )}
                    </View>
                    {statusBadge(h.status)}
                  </View>
                  {h.status === "open" && (
                    <TouchableOpacity style={[styles.actionBtn, { backgroundColor: C.primary, alignSelf: "stretch" as any }]} onPress={() => { setResponseText(""); setResponseModal({ visible: true, requestId: h.id }); }}>
                      <Text style={styles.actionBtnText}>💬 Répondre & Fermer</Text>
                    </TouchableOpacity>
                  )}
                </Card>
              ))
            )}
          </>
        )}

        {activeTab === "merchants" && (
          <>
            <Text style={styles.sectionTitle}>Annonces commerçants ({merchants.length})</Text>
            {merchants.length === 0 ? (
              <View style={styles.empty}><Text style={{ fontSize: 40 }}>✅</Text><Text style={styles.emptyText}>Aucune annonce</Text></View>
            ) : (
              merchants.map(m => (
                <Card key={m.id}>
                  <View style={styles.cardRow}>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={styles.cardTitle}>{m.titre}</Text>
                      <Text style={styles.cardSub}>{m.categorie}</Text>
                      {m.description && <Text style={styles.cardSub} numberOfLines={2}>{m.description}</Text>}
                      <Text style={styles.cardAmount}>{m.prix ? `${Number(m.prix).toLocaleString()} FCFA` : "Prix libre"}</Text>
                      <Text style={styles.cardDate}>{formatDate(m.created_at)}</Text>
                    </View>
                    {statusBadge(m.validation_status)}
                  </View>
                  {m.validation_status === "pending" && (
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <TouchableOpacity style={[styles.actionBtn, { backgroundColor: C.success }]} onPress={() => handleMerchantAction(m.id, "approved")}>
                        <Text style={styles.actionBtnText}>✓ Approuver</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.actionBtn, { backgroundColor: C.danger }]} onPress={() => handleMerchantAction(m.id, "rejected")}>
                        <Text style={styles.actionBtnText}>✗ Rejeter</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </Card>
              ))
            )}
          </>
        )}

        {activeTab === "finance" && (
          <>
            <Card>
              <SectionHeader icon="💰" title="Solde Total Système" />
              {systemStats ? (
                <>
                  <View style={styles.statRow}>
                    <View style={styles.statBox}><Text style={styles.statLabel}>Portefeuilles cumulés</Text><Text style={styles.statValue}>{systemStats.total_wallets.toLocaleString()} FCFA</Text></View>
                    <View style={styles.statBox}><Text style={styles.statLabel}>Paris en cours</Text><Text style={[styles.statValue, { color: C.orange }]}>{systemStats.total_paris_en_cours.toLocaleString()} FCFA</Text></View>
                  </View>
                  <View style={styles.statRow}>
                    <View style={styles.statBox}><Text style={styles.statLabel}>Utilisateurs</Text><Text style={styles.statValue}>{systemStats.user_count}</Text></View>
                    <View style={styles.statBox}><Text style={styles.statLabel}>Course active</Text><Text style={styles.statValue}>{systemStats.active_course ? "🟢 Oui" : "⚫ Non"}</Text></View>
                  </View>
                </>
              ) : <ActivityIndicator color={C.primary} style={{ marginVertical: 20 }} />}
            </Card>

            <Text style={styles.sectionTitle}>🏆 Historique des Gains</Text>
            {gainsLoading ? <ActivityIndicator color={C.primary} style={{ marginVertical: 20 }} />
              : gains.length === 0 ? <View style={styles.empty}><Text style={{ fontSize: 40 }}>📊</Text><Text style={styles.emptyText}>Aucun gain enregistré</Text></View>
              : gains.map(g => (
                <Card key={g.id} style={styles.gainCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.gainType}>{gainTypeLabel(g.type)}</Text>
                    <Text style={styles.cardSub} numberOfLines={1}>{g.to_uid}</Text>
                    <Text style={styles.cardSub} numberOfLines={2}>{g.description}</Text>
                    <Text style={styles.cardDate}>{formatDate(g.created_at)}</Text>
                  </View>
                  <Text style={styles.gainAmount}>+{g.amount.toLocaleString()} FCFA</Text>
                </Card>
              ))
            }
          </>
        )}

        {activeTab === "jeux" && (
          <>
            <Text style={styles.sectionTitle}>🏁 Course de Rue — Contrôle Admin</Text>
            {courseLoading ? <ActivityIndicator color={C.primary} style={{ marginVertical: 20 }} />
              : !adminCourse ? (
                <Card>
                  <View style={styles.miniEmpty}><Text style={styles.miniEmptyText}>⏳ Aucune course active</Text></View>
                  <TouchableOpacity style={styles.reloadBtn} onPress={fetchAdminCourse}><Text style={styles.reloadBtnText}>↻ Rafraîchir</Text></TouchableOpacity>
                </Card>
              ) : (
                <Card>
                  <View style={[styles.cardRow, { justifyContent: "space-between" }]}>
                    <Text style={styles.cardTitle}>{adminCourse.titre}</Text>
                    {statusBadge(adminCourse.status)}
                  </View>
                  <View style={styles.courseStatsRow}>
                    <View style={styles.courseStatBox}><Text style={styles.courseStatLabel}>Total misé</Text><Text style={styles.courseStatValue}>{(adminCourse.total_mises || 0).toLocaleString()} FCFA</Text></View>
                    <View style={styles.courseStatBox}><Text style={styles.courseStatLabel}>Cagnotte</Text><Text style={[styles.courseStatValue, { color: C.gold }]}>{(adminCourse.cagnotte_amount || 0).toLocaleString()} FCFA</Text></View>
                    <View style={styles.courseStatBox}><Text style={styles.courseStatLabel}>Paris</Text><Text style={styles.courseStatValue}>{adminCourse.paris?.length || 0}</Text></View>
                  </View>
                  <Text style={[styles.cardSub, { fontWeight: "700" as any, marginTop: 8 }]}>Répartition :</Text>
                  {adminCourse.coureurs.map(c => (
                    <View key={c.id} style={styles.coureurRow}>
                      <Text style={{ fontSize: 18, width: 30 }}>{c.emoji}</Text>
                      <Text style={{ flex: 1, fontSize: 14, color: C.text }}>{c.name}</Text>
                      <Text style={styles.cardSub}>{adminCourse.repartition?.[c.id] ?? 0} pari(s)</Text>
                    </View>
                  ))}
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                    {adminCourse.status === "open" && (
                      <TouchableOpacity style={[styles.bigActionBtn, { backgroundColor: C.orange }]} onPress={handleLancerDepart} disabled={courseAction}>
                        {courseAction ? <ActivityIndicator color="#fff" /> : <Text style={styles.bigActionBtnText}>🏁 Lancer le départ</Text>}
                      </TouchableOpacity>
                    )}
                    {(adminCourse.status === "open" || adminCourse.status === "running") && (
                      <TouchableOpacity style={[styles.bigActionBtn, { backgroundColor: C.danger }]} onPress={() => { setShowWinnerPanel(!showWinnerPanel); setSelectedWinner(""); }}>
                        <Text style={styles.bigActionBtnText}>🏆 Valider gagnant</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {showWinnerPanel && (
                    <View style={styles.winnerPanel}>
                      <Text style={[styles.cardSub, { fontWeight: "700" as any, marginBottom: 8 }]}>Sélectionnez le gagnant :</Text>
                      {adminCourse.coureurs.map(c => (
                        <TouchableOpacity key={c.id} style={[styles.winnerOption, selectedWinner === c.id && styles.winnerOptionSelected]} onPress={() => setSelectedWinner(c.id)}>
                          <Text style={{ fontSize: 20 }}>{c.emoji}</Text>
                          <Text style={[{ flex: 1, fontSize: 14, color: C.text }, selectedWinner === c.id && { color: C.primary, fontWeight: "700" as any }]}>{c.name}</Text>
                          {selectedWinner === c.id && <Ionicons name="checkmark-circle" size={18} color={C.primary} />}
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity
                        style={[styles.bigActionBtn, { backgroundColor: C.success, marginTop: 8, opacity: !selectedWinner ? 0.4 : 1 }]}
                        onPress={handleValiderGagnant} disabled={!selectedWinner || courseAction}>
                        {courseAction ? <ActivityIndicator color="#fff" /> : <Text style={styles.bigActionBtnText}>✅ Confirmer et distribuer</Text>}
                      </TouchableOpacity>
                    </View>
                  )}
                </Card>
              )
            }

            <View style={{ marginTop: 20 }}>
              <Text style={styles.sectionTitle}>🎰 Loto 5/30 — Tirage Admin</Text>
              <Card>
                <LotoDrawPanel adminEmail={adminEmail} />
              </Card>
            </View>

            <View style={{ marginTop: 20 }}>
              <Text style={styles.sectionTitle}>🎯 Quiz — Créer un Lot (jusqu'à 10 questions)</Text>
              <Card>
                {quizActive ? (
                  <View style={{ backgroundColor: "#E8F5E9", borderRadius: 10, padding: 10, marginBottom: 10 }}>
                    <Text style={{ fontWeight: "700", color: C.success }}>✅ Quiz actif : {quizActive.titre}</Text>
                    <Text style={{ fontSize: 12, color: C.sub }}>{quizActive.total_questions} question(s) — Dotation {quizActive.prize_pool?.toLocaleString()} FCFA — Statut : {quizActive.status}</Text>
                  </View>
                ) : (
                  <View style={{ backgroundColor: "#FFF3E0", borderRadius: 10, padding: 10, marginBottom: 10 }}>
                    <Text style={{ fontWeight: "700", color: C.orange }}>Aucun quiz actif</Text>
                    <Text style={{ fontSize: 12, color: C.sub }}>Remplissez les questions ci-dessous puis activez.</Text>
                  </View>
                )}

                <TextInput style={styles.quizInput} placeholder="Titre du quiz (optionnel)" value={quizTitre} onChangeText={setQuizTitre} placeholderTextColor={C.sub} />
                <TextInput style={[styles.quizInput, { marginTop: 8 }]} placeholder="Dotation totale (FCFA)" value={quizPrize} onChangeText={setQuizPrize} keyboardType="numeric" placeholderTextColor={C.sub} />

                {quizBatch.map((q, qi) => (
                  <View key={qi} style={{ marginTop: 14, padding: 10, borderWidth: 1, borderColor: C.border, borderRadius: 10, backgroundColor: "#FAFAFA" }}>
                    <Text style={{ fontWeight: "700", color: C.text, marginBottom: 6 }}>Question {qi + 1}</Text>
                    <TextInput
                      style={styles.quizInput}
                      placeholder={`Texte de la question ${qi + 1}...`}
                      value={q.question}
                      onChangeText={v => updateQuizQuestion(qi, { question: v })}
                      multiline numberOfLines={2} textAlignVertical="top"
                      placeholderTextColor={C.sub}
                    />
                    {q.options.map((opt, oi) => (
                      <TouchableOpacity key={oi} style={[styles.quizOptionRow, q.correct === oi && styles.quizOptionCorrect, { marginTop: 6 }]} onPress={() => updateQuizQuestion(qi, { correct: oi })}>
                        <View style={[styles.quizOptionRadio, q.correct === oi && styles.quizOptionRadioActive]}>
                          {q.correct === oi && <View style={styles.quizOptionRadioDot} />}
                        </View>
                        <TextInput
                          style={[styles.quizOptionInput, q.correct === oi && { color: C.primary, fontWeight: "700" as any }]}
                          placeholder={`Option ${oi + 1}`} value={opt}
                          onChangeText={v => { const n = [...q.options]; n[oi] = v; updateQuizQuestion(qi, { options: n }); }}
                          placeholderTextColor={C.sub}
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                ))}

                <TouchableOpacity style={[styles.bigActionBtn, { backgroundColor: C.primary, marginTop: 16 }]} onPress={handleCreateQuizBatch} disabled={quizSending}>
                  {quizSending ? <ActivityIndicator color="#fff" /> : <Text style={styles.bigActionBtnText}>🚀 Créer & Activer le Quiz</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={[styles.bigActionBtn, { backgroundColor: C.sub, marginTop: 8 }]} onPress={fetchActiveQuiz}>
                  <Text style={styles.bigActionBtnText}>↻ Rafraîchir le statut</Text>
                </TouchableOpacity>
              </Card>
            </View>

            <View style={{ marginTop: 24 }}>
              <Text style={styles.sectionTitle}>🏃 Course d'Agilité — Classement</Text>
              <Card>
                <View style={[styles.cardRow, { justifyContent: "space-between" }]}>
                  <Text style={styles.cardSub}>Top scores en attente de récompense</Text>
                  <TouchableOpacity onPress={fetchAgilityLeaderboard}><Text style={{ color: C.primary, fontWeight: "700" }}>↻</Text></TouchableOpacity>
                </View>
                {agilityLoading ? <ActivityIndicator color={C.primary} style={{ marginVertical: 16 }} />
                  : agilityLeaderboard.length === 0 ? (
                    <Text style={[styles.cardSub, { textAlign: "center", paddingVertical: 12 }]}>Aucun score pour l'instant.</Text>
                  ) : (
                    agilityLeaderboard.map((row, i) => (
                      <View key={row.id} style={[styles.coureurRow, { gap: 8 }]}>
                        <Text style={{ fontSize: 14, fontWeight: "700", width: 32, color: C.text }}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: "700", color: C.text }} numberOfLines={1}>{row.user_name || "Voisin"}</Text>
                          <Text style={{ fontSize: 11, color: C.sub }}>{row.score} clics{row.rewarded ? ` • ✅ ${(row.reward_amount || 0).toLocaleString()} FCFA` : ""}</Text>
                        </View>
                        {row.rewarded ? (
                          <Text style={{ fontSize: 11, color: C.primary, fontWeight: "700" }}>Récompensé</Text>
                        ) : (
                          <TouchableOpacity
                            style={{ backgroundColor: C.gold, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}
                            onPress={() => handleAgilityReward(row.id, row.user_name, row.score)}
                          >
                            <Text style={{ color: "#fff", fontSize: 12, fontWeight: "800" }}>🎁 Distribuer</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ))
                  )}
                <TouchableOpacity
                  style={[styles.bigActionBtn, { backgroundColor: C.danger, marginTop: 12 }]}
                  onPress={handleAgilityReset}
                >
                  <Text style={styles.bigActionBtnText}>🗑️ Réinitialiser le classement</Text>
                </TouchableOpacity>
              </Card>
            </View>
          </>
        )}
      </ScrollView>

      <Modal visible={responseModal.visible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Répondre à la demande</Text>
            <TextInput style={styles.modalInput} placeholder="Tapez votre réponse..." value={responseText} onChangeText={setResponseText} multiline numberOfLines={5} textAlignVertical="top" />
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: C.sub }]} onPress={() => setResponseModal({ visible: false, requestId: "" })}>
                <Text style={styles.modalBtnText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: C.primary }]} onPress={async () => {
                if (!responseText.trim()) return Alert.alert("Erreur", "Saisissez une réponse");
                try { await api.respondToHelpRequest(responseModal.requestId, responseText.trim(), ADMIN_EMAIL); setResponseModal({ visible: false, requestId: "" }); fetchData(); Alert.alert("Envoyé."); } catch (e: any) { Alert.alert("Erreur", e.message); }
              }}>
                <Text style={styles.modalBtnText}>Envoyer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!creditModalUid} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>💳 Crédit direct</Text>
            <Text style={[styles.cardSub, { marginBottom: 8 }]}>Créditez directement le portefeuille de cet utilisateur.</Text>
            <TextInput
              style={[styles.modalInput, { marginBottom: 10 }]}
              placeholder="Montant en FCFA (ex: 5000)"
              value={creditAmount}
              onChangeText={setCreditAmount}
              keyboardType="numeric"
              placeholderTextColor={C.sub}
            />
            <TextInput
              style={[styles.modalInput, { marginBottom: 16 }]}
              placeholder="Raison (optionnel)"
              value={creditReason}
              onChangeText={setCreditReason}
              placeholderTextColor={C.sub}
            />
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: C.sub }]} onPress={() => { setCreditModalUid(null); setCreditAmount(""); setCreditReason(""); }}>
                <Text style={styles.modalBtnText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: C.primary, opacity: (!creditAmount || crediting) ? 0.5 : 1 }]}
                onPress={handleDirectCredit}
                disabled={!creditAmount || crediting}
              >
                {crediting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalBtnText}>✅ Créditer</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: { backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headerTitle: { fontSize: 20, fontWeight: "800", color: "#fff" },
  headerSub: { fontSize: 11, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  headerBadge: { backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  headerBadgeText: { fontSize: 12, color: "#fff", fontWeight: "700" },
  tabsScroll: { backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border, maxHeight: 50 },
  tabsContent: { flexDirection: "row", alignItems: "center" },
  tab: { paddingHorizontal: 14, paddingVertical: 14 },
  tabActive: { borderBottomWidth: 3, borderBottomColor: C.primary },
  tabText: { fontSize: 12, color: C.sub, fontWeight: "600", whiteSpace: "nowrap" as any },
  tabTextActive: { color: C.primary, fontWeight: "800" },
  content: { padding: 14, gap: 14, paddingBottom: 40 },
  card: {
    backgroundColor: C.card, borderRadius: 16, padding: 16, gap: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  sectionHeaderIcon: { fontSize: 20 },
  sectionHeaderTitle: { fontSize: 15, fontWeight: "800", color: C.text },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: C.text, marginBottom: 4 },
  denied: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12, padding: 32 },
  deniedTitle: { fontSize: 22, fontWeight: "800", color: C.text },
  deniedSub: { fontSize: 15, color: C.sub, textAlign: "center" },
  empty: { alignItems: "center", paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 16, color: C.sub },
  miniEmpty: { alignItems: "center", paddingVertical: 16 },
  miniEmptyText: { fontSize: 14, color: C.sub },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: "700", color: "#fff" },

  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  toggleInfo: { flex: 1 },
  toggleLabel: { fontSize: 15, fontWeight: "700", color: C.text },
  toggleSub: { fontSize: 12, color: C.sub, marginTop: 2 },
  resetRow: { flexDirection: "row", gap: 10 },
  resetBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: C.orange },
  resetBtnText: { fontSize: 13, color: C.orange, fontWeight: "700" },

  withdrawItem: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  withdrawName: { fontSize: 14, fontWeight: "700", color: C.text },
  withdrawAmount: { fontSize: 16, fontWeight: "800", color: C.primary },
  withdrawDetail: { fontSize: 12, color: C.sub },
  withdrawDate: { fontSize: 12, color: C.sub },
  withdrawActions: { gap: 6 },
  validateBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.success, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  validateBtnText: { fontSize: 12, color: "#fff", fontWeight: "700" },
  refuseBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.danger, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  refuseBtnText: { fontSize: 12, color: "#fff", fontWeight: "700" },
  seeMoreBtn: { marginTop: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border, alignItems: "center" },
  seeMoreText: { fontSize: 13, color: C.primary, fontWeight: "600" },

  flashTitleInput: { borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: C.text },
  flashBodyInput: { borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12, fontSize: 14, color: C.text, minHeight: 100 },
  flashSendBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#1B5E20", paddingVertical: 14, borderRadius: 12 },
  flashSendBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },

  searchRow: { flexDirection: "row", gap: 10 },
  searchInput: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: C.text },
  searchBtn: { backgroundColor: C.primary, paddingHorizontal: 14, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  userResultItem: { backgroundColor: C.bg, borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: C.border },
  userResultBanned: { borderColor: C.danger, backgroundColor: "#FFF5F5" },
  userResultName: { fontSize: 14, fontWeight: "700", color: C.text },
  userResultSub: { fontSize: 12, color: C.sub },
  userResultBalance: { fontSize: 13, color: C.primary, fontWeight: "600" },
  bannedLabel: { fontSize: 12, color: C.danger, fontWeight: "700", marginTop: 2 },
  adminLabel: { fontSize: 12, color: C.primary, fontWeight: "700", marginTop: 2 },
  banBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, alignItems: "center" },
  banBtnActive: { backgroundColor: C.danger },
  unbanBtn: { backgroundColor: C.success },
  banBtnText: { color: "#fff", fontWeight: "800", fontSize: 13 },

  commissionModeRow: { flexDirection: "row", gap: 10 },
  modeBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", borderWidth: 1.5, borderColor: C.border },
  modeBtnActive: { borderColor: C.primary, backgroundColor: "#E8F5E9" },
  modeBtnText: { fontSize: 13, color: C.sub, fontWeight: "600" },
  modeBtnTextActive: { color: C.primary, fontWeight: "800" },
  commissionInputRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  commissionInput: { flex: 1, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 22, fontWeight: "700" as any, color: C.text },
  commissionUnit: { fontSize: 20, color: C.sub, fontWeight: "700" as any, minWidth: 40 },
  commissionHelp: { fontSize: 13, color: C.sub, lineHeight: 18 },
  saveCommissionBtn: { backgroundColor: C.primary, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  saveCommissionBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },

  cardRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: C.text },
  cardAmount: { fontSize: 16, fontWeight: "800", color: C.primary, marginTop: 4 },
  cardSub: { fontSize: 13, color: C.sub },
  cardDate: { fontSize: 12, color: C.sub, marginTop: 4 },
  actionBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center" },
  actionBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  responseBox: { backgroundColor: "#E8F5E9", borderRadius: 8, padding: 10, marginTop: 8 },
  responseLabel: { fontSize: 12, fontWeight: "700", color: C.primary },
  responseText: { fontSize: 13, color: C.text, marginTop: 4 },

  statRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
  statBox: { flex: 1, backgroundColor: C.bg, borderRadius: 12, padding: 14, alignItems: "center" },
  statLabel: { fontSize: 12, color: C.sub, textAlign: "center", marginBottom: 4 },
  statValue: { fontSize: 16, fontWeight: "800", color: C.primary, textAlign: "center" },
  gainCard: { flexDirection: "row", alignItems: "center" },
  gainType: { fontSize: 13, fontWeight: "700", color: C.text },
  gainAmount: { fontSize: 15, fontWeight: "800", color: C.success },

  courseStatsRow: { flexDirection: "row", gap: 8 },
  courseStatBox: { flex: 1, backgroundColor: C.bg, borderRadius: 10, padding: 10, alignItems: "center" },
  courseStatLabel: { fontSize: 11, color: C.sub, marginBottom: 3 },
  courseStatValue: { fontSize: 14, fontWeight: "800", color: C.text },
  coureurRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6, gap: 8, borderBottomWidth: 1, borderBottomColor: C.border },
  bigActionBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  bigActionBtnText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  winnerPanel: { backgroundColor: C.bg, borderRadius: 12, padding: 12, gap: 6, marginTop: 4 },
  winnerOption: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: C.card, gap: 10, borderWidth: 2, borderColor: "transparent" },
  winnerOptionSelected: { borderColor: C.primary, backgroundColor: "#E8F5E9" },
  reloadBtn: { alignSelf: "center", backgroundColor: C.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8 },
  reloadBtnText: { color: "#fff", fontWeight: "700" },

  quizInput: { borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12, fontSize: 14, color: C.text, minHeight: 80 },
  quizOptionRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1.5, borderColor: C.border, borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10 },
  quizOptionCorrect: { borderColor: C.primary, backgroundColor: "#E8F5E9" },
  quizOptionRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: C.border, alignItems: "center", justifyContent: "center" },
  quizOptionRadioActive: { borderColor: C.primary },
  quizOptionRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.primary },
  quizOptionInput: { flex: 1, fontSize: 14, color: C.text, paddingVertical: 4 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalBox: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 16 },
  modalTitle: { fontSize: 18, fontWeight: "700", color: C.text },
  modalInput: { borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12, fontSize: 14, color: C.text, minHeight: 120 },
  modalBtn: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: "center" },
  modalBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
});
