import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../context/AuthContext";
import { api, WithdrawalRequest, HelpRequest, MerchantValidation } from "../services/api";
import { BASE_URL } from "../services/api";

const ADMIN_EMAIL = "administrateurquartierplus@gmail.com";
const COLORS = {
  primary: "#2E7D32",
  danger: "#C62828",
  warning: "#F57F17",
  success: "#2E7D32",
  orange: "#E65100",
  gold: "#F9A825",
  bg: "#F5F5F5",
  card: "#FFFFFF",
  text: "#212121",
  sub: "#757575",
  border: "#E0E0E0",
};

type Tab = "withdrawals" | "help" | "merchants" | "finance" | "jeux";

interface SystemStats {
  total_wallets: number;
  total_paris_en_cours: number;
  user_count: number;
  active_course: any | null;
}

interface GainEntry {
  id: string;
  type: string;
  from_uid: string;
  to_uid: string;
  amount: number;
  description: string;
  created_at: string;
}

interface AdminCourse {
  id: string;
  titre: string;
  status: string;
  coureurs: { id: string; name: string; emoji: string }[];
  total_mises: number;
  cagnotte_amount: number;
  carryover_amount: number;
  winner_coureur_id?: string;
  repartition?: Record<string, number>;
  paris?: { id: string; user_name: string; coureur_id: string; montant: number; status: string; gain: number }[];
}

export default function AdminScreen() {
  const { firebaseUser, dbUser, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("withdrawals");
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [helpReqs, setHelpReqs] = useState<HelpRequest[]>([]);
  const [merchants, setMerchants] = useState<MerchantValidation[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [responseModal, setResponseModal] = useState<{ visible: boolean; requestId: string }>({ visible: false, requestId: "" });
  const [responseText, setResponseText] = useState("");

  const [systemStats, setSystemStats] = useState<SystemStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [gains, setGains] = useState<GainEntry[]>([]);
  const [gainsLoading, setGainsLoading] = useState(false);

  const [adminCourse, setAdminCourse] = useState<AdminCourse | null>(null);
  const [courseLoading, setCourseLoading] = useState(false);
  const [courseAction, setCourseAction] = useState(false);
  const [selectedWinner, setSelectedWinner] = useState("");
  const [showWinnerPanel, setShowWinnerPanel] = useState(false);

  const [quizQuestion, setQuizQuestion] = useState("");
  const [quizOptions, setQuizOptions] = useState(["", "", "", ""]);
  const [quizCorrect, setQuizCorrect] = useState<number | null>(null);
  const [quizSending, setQuizSending] = useState(false);

  const adminEmail = firebaseUser?.email || dbUser?.email || "";
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
    } catch (e: any) {
      Alert.alert("Erreur", e.message || "Impossible de charger les données");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isAdmin]);

  const fetchSystemStats = useCallback(async () => {
    if (!isAdmin) return;
    setStatsLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/admin/system-stats?email=${encodeURIComponent(adminEmail)}`);
      const data = await res.json();
      if (res.ok) setSystemStats(data);
    } catch {}
    setStatsLoading(false);
  }, [isAdmin, adminEmail]);

  const fetchGains = useCallback(async () => {
    if (!isAdmin) return;
    setGainsLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/admin/gains-history?email=${encodeURIComponent(adminEmail)}`);
      const data = await res.json();
      if (res.ok) setGains(data);
    } catch {}
    setGainsLoading(false);
  }, [isAdmin, adminEmail]);

  const fetchAdminCourse = useCallback(async () => {
    if (!isAdmin) return;
    setCourseLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/admin/course-active?email=${encodeURIComponent(adminEmail)}`);
      const data = await res.json();
      if (res.ok) setAdminCourse(data);
    } catch {}
    setCourseLoading(false);
  }, [isAdmin, adminEmail]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (activeTab === "finance") {
      fetchSystemStats();
      fetchGains();
      statsInterval.current = setInterval(fetchSystemStats, 15000);
    } else if (activeTab === "jeux") {
      fetchAdminCourse();
    } else {
      if (statsInterval.current) clearInterval(statsInterval.current);
    }
    return () => {
      if (statsInterval.current) clearInterval(statsInterval.current);
    };
  }, [activeTab, fetchSystemStats, fetchGains, fetchAdminCourse]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
    if (activeTab === "finance") { fetchSystemStats(); fetchGains(); }
    if (activeTab === "jeux") { fetchAdminCourse(); }
  };

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.denied}>
          <Text style={styles.deniedIcon}>🔒</Text>
          <Text style={styles.deniedTitle}>Accès Refusé</Text>
          <Text style={styles.deniedSub}>Cette section est réservée à l'administrateur QuartierPlus.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const pendingWithdrawals = withdrawals.filter((w) => w.status === "pending");
  const openHelp = helpReqs.filter((h) => h.status === "open");
  const pendingMerchants = merchants.filter((m) => m.validation_status === "pending");

  const handleWithdrawalAction = async (id: string, status: "approved" | "rejected") => {
    Alert.alert(
      status === "approved" ? "Valider le retrait ?" : "Rejeter le retrait ?",
      status === "approved"
        ? "Confirmez-vous le paiement de ce retrait ?"
        : "Voulez-vous rejeter cette demande ?",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Confirmer",
          style: status === "rejected" ? "destructive" : "default",
          onPress: async () => {
            try {
              await api.updateWithdrawalStatus(id, status, ADMIN_EMAIL);
              fetchData();
              Alert.alert("Succès", status === "approved" ? "Retrait validé." : "Retrait rejeté.");
            } catch (e: any) {
              Alert.alert("Erreur", e.message);
            }
          },
        },
      ]
    );
  };

  const handleMerchantAction = async (id: string, validationStatus: "approved" | "rejected") => {
    try {
      await api.updateMerchantValidation(id, validationStatus, ADMIN_EMAIL);
      fetchData();
      Alert.alert("Succès", validationStatus === "approved" ? "Annonce approuvée." : "Annonce rejetée.");
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    }
  };

  const openResponseModal = (id: string) => {
    setResponseText("");
    setResponseModal({ visible: true, requestId: id });
  };

  const submitResponse = async () => {
    if (!responseText.trim()) {
      Alert.alert("Erreur", "Veuillez saisir une réponse");
      return;
    }
    try {
      await api.respondToHelpRequest(responseModal.requestId, responseText.trim(), ADMIN_EMAIL);
      setResponseModal({ visible: false, requestId: "" });
      fetchData();
      Alert.alert("Succès", "Réponse envoyée.");
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    }
  };

  const handleLancerDepart = async () => {
    if (!adminCourse) return;
    Alert.alert("Lancer le départ ?", "La course passera en mode 'En course'. Les paris seront fermés.", [
      { text: "Annuler", style: "cancel" },
      {
        text: "Lancer !",
        onPress: async () => {
          setCourseAction(true);
          try {
            const adminUser = await fetch(`${BASE_URL}/api/users/firebase/${firebaseUser?.uid}`);
            const adminData = await adminUser.json();
            const res = await fetch(`${BASE_URL}/api/courses/${adminCourse.id}/status`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "running", admin_uid: adminData.firebase_uid }),
            });
            if (res.ok) {
              await fetchAdminCourse();
              Alert.alert("🏁 Départ lancé !", "La course est maintenant en cours. Tous les utilisateurs ont été notifiés.");
            } else {
              const d = await res.json();
              Alert.alert("Erreur", d.error || "Impossible de lancer");
            }
          } catch {
            Alert.alert("Erreur réseau");
          }
          setCourseAction(false);
        },
      },
    ]);
  };

  const handleValiderGagnant = async () => {
    if (!selectedWinner || !adminCourse) return;
    const coureur = adminCourse.coureurs.find((c) => c.id === selectedWinner);
    Alert.alert("Valider le gagnant ?", `Confirmer ${coureur?.emoji} ${coureur?.name} comme gagnant ?`, [
      { text: "Annuler", style: "cancel" },
      {
        text: "Valider et distribuer",
        onPress: async () => {
          setCourseAction(true);
          try {
            const adminUser = await fetch(`${BASE_URL}/api/users/firebase/${firebaseUser?.uid}`);
            const adminData = await adminUser.json();
            const res = await fetch(`${BASE_URL}/api/courses/${adminCourse.id}/finish`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ winner_coureur_id: selectedWinner, admin_uid: adminData.firebase_uid }),
            });
            const data = await res.json();
            if (res.ok) {
              setShowWinnerPanel(false);
              setSelectedWinner("");
              await fetchAdminCourse();
              await fetchSystemStats();
              const msg = data.has_carryover
                ? `Aucun parieur sur le gagnant !\n${data.carryover_amount?.toLocaleString()} FCFA reportés.`
                : `${data.nb_gagnants} gagnant(s) — ${data.gain_par_gagnant?.toLocaleString()} FCFA chacun\nAdmin : ${data.admin_cut?.toLocaleString()} FCFA`;
              Alert.alert("✅ Course terminée !", msg);
            } else {
              Alert.alert("Erreur", data.error || "Impossible de terminer");
            }
          } catch {
            Alert.alert("Erreur réseau");
          }
          setCourseAction(false);
        },
      },
    ]);
  };

  const handleAddQuizQuestion = async () => {
    if (!quizQuestion.trim()) return Alert.alert("Erreur", "Saisissez la question");
    if (quizOptions.some((o) => !o.trim())) return Alert.alert("Erreur", "Remplissez les 4 options");
    if (quizCorrect === null) return Alert.alert("Erreur", "Sélectionnez la bonne réponse");
    setQuizSending(true);
    try {
      const res = await fetch(`${BASE_URL}/api/admin/quiz/add-question`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: adminEmail,
          question: quizQuestion.trim(),
          options: quizOptions.map((o) => o.trim()),
          correct_index: quizCorrect,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setQuizQuestion("");
        setQuizOptions(["", "", "", ""]);
        setQuizCorrect(null);
        Alert.alert("✅ Question ajoutée !", `La question a été insérée en première position (${data.total_questions} questions au total).`);
      } else {
        Alert.alert("Erreur", data.error || "Impossible d'ajouter");
      }
    } catch {
      Alert.alert("Erreur réseau");
    }
    setQuizSending(false);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getFullYear()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { bg: string; label: string }> = {
      pending: { bg: COLORS.warning, label: "En attente" },
      approved: { bg: COLORS.success, label: "Approuvé" },
      rejected: { bg: COLORS.danger, label: "Rejeté" },
      open: { bg: COLORS.warning, label: "Ouvert" },
      closed: { bg: COLORS.sub, label: "Fermé" },
      running: { bg: COLORS.orange, label: "En course" },
      finished: { bg: COLORS.sub, label: "Terminé" },
    };
    const s = map[status] || { bg: COLORS.sub, label: status };
    return (
      <View style={[styles.badge, { backgroundColor: s.bg }]}>
        <Text style={styles.badgeText}>{s.label}</Text>
      </View>
    );
  };

  const gainTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      course_gain: "🏁 Course de Rue",
      quiz_win: "🎯 Live Quiz",
      loto_win: "🎰 Loto 5/30",
    };
    return map[type] || type;
  };

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id: "withdrawals", label: "💸 Retraits", badge: pendingWithdrawals.length },
    { id: "help", label: "🆘 Aide", badge: openHelp.length },
    { id: "merchants", label: "🏪 Commerçants", badge: pendingMerchants.length },
    { id: "finance", label: "💰 Finance" },
    { id: "jeux", label: "🎮 Jeux" },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🛡️ Administration</Text>
        <Text style={styles.headerSub}>Tableau de bord sécurisé — {adminEmail}</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsScroll}>
        <View style={styles.tabs}>
          {TABS.map((t) => (
            <TouchableOpacity
              key={t.id}
              style={[styles.tab, activeTab === t.id && styles.tabActive]}
              onPress={() => setActiveTab(t.id)}
            >
              <Text style={[styles.tabText, activeTab === t.id && styles.tabTextActive]}>
                {t.label}{t.badge ? ` (${t.badge})` : ""}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {loading && !refreshing && (activeTab === "withdrawals" || activeTab === "help" || activeTab === "merchants") ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Chargement...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={[COLORS.primary]} />}
        >
          {activeTab === "withdrawals" && (
            <>
              <Text style={styles.sectionTitle}>Demandes de retrait ({withdrawals.length})</Text>
              {withdrawals.length === 0 ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyIcon}>✅</Text>
                  <Text style={styles.emptyText}>Aucune demande de retrait</Text>
                </View>
              ) : (
                withdrawals.map((w) => (
                  <View key={w.id} style={styles.card}>
                    <View style={styles.cardRow}>
                      <View style={styles.cardInfo}>
                        <Text style={styles.cardTitle}>{w.user_name || w.user_email || w.user_id}</Text>
                        <Text style={styles.cardSub}>{w.user_email}</Text>
                        <Text style={styles.cardAmount}>{w.amount?.toLocaleString()} FCFA</Text>
                        <Text style={styles.cardSub}>
                          {w.mobile_money_provider?.toUpperCase()} — {w.mobile_money}
                        </Text>
                        <Text style={styles.cardDate}>{formatDate(w.created_at)}</Text>
                      </View>
                      <View style={styles.cardRight}>
                        {statusBadge(w.status)}
                      </View>
                    </View>
                    {w.status === "pending" && (
                      <View style={styles.actions}>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: COLORS.success }]}
                          onPress={() => handleWithdrawalAction(w.id, "approved")}
                        >
                          <Text style={styles.actionBtnText}>✓ Valider</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: COLORS.danger }]}
                          onPress={() => handleWithdrawalAction(w.id, "rejected")}
                        >
                          <Text style={styles.actionBtnText}>✗ Rejeter</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))
              )}
            </>
          )}

          {activeTab === "help" && (
            <>
              <Text style={styles.sectionTitle}>Demandes d'aide ({helpReqs.length})</Text>
              {helpReqs.length === 0 ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyIcon}>✅</Text>
                  <Text style={styles.emptyText}>Aucune demande d'aide</Text>
                </View>
              ) : (
                helpReqs.map((h) => (
                  <View key={h.id} style={styles.card}>
                    <View style={styles.cardRow}>
                      <View style={styles.cardInfo}>
                        <Text style={styles.cardTitle}>{h.user_name || h.user_email || h.user_id}</Text>
                        <Text style={styles.cardSub}>{h.user_email}</Text>
                        <Text style={styles.cardSubject}>{h.subject}</Text>
                        <Text style={styles.cardMessage} numberOfLines={3}>{h.message}</Text>
                        <Text style={styles.cardDate}>{formatDate(h.created_at)}</Text>
                        {h.admin_response && (
                          <View style={styles.responseBox}>
                            <Text style={styles.responseLabel}>Votre réponse :</Text>
                            <Text style={styles.responseText}>{h.admin_response}</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.cardRight}>
                        {statusBadge(h.status)}
                      </View>
                    </View>
                    {h.status === "open" && (
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: COLORS.primary, alignSelf: "stretch" }]}
                        onPress={() => openResponseModal(h.id)}
                      >
                        <Text style={styles.actionBtnText}>💬 Répondre & Fermer</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ))
              )}
            </>
          )}

          {activeTab === "merchants" && (
            <>
              <Text style={styles.sectionTitle}>Annonces commerçants ({merchants.length})</Text>
              {merchants.length === 0 ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyIcon}>✅</Text>
                  <Text style={styles.emptyText}>Aucune annonce à valider</Text>
                </View>
              ) : (
                merchants.map((m) => (
                  <View key={m.id} style={styles.card}>
                    <View style={styles.cardRow}>
                      <View style={styles.cardInfo}>
                        <Text style={styles.cardTitle}>{m.titre}</Text>
                        <Text style={styles.cardSub}>{m.categorie}</Text>
                        {m.description && (
                          <Text style={styles.cardMessage} numberOfLines={2}>{m.description}</Text>
                        )}
                        <Text style={styles.cardAmount}>{m.prix ? `${Number(m.prix).toLocaleString()} FCFA` : "Prix non défini"}</Text>
                        <Text style={styles.cardDate}>{formatDate(m.created_at)}</Text>
                      </View>
                      <View style={styles.cardRight}>
                        {statusBadge(m.validation_status)}
                      </View>
                    </View>
                    {m.validation_status === "pending" && (
                      <View style={styles.actions}>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: COLORS.success }]}
                          onPress={() => handleMerchantAction(m.id, "approved")}
                        >
                          <Text style={styles.actionBtnText}>✓ Approuver</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.actionBtn, { backgroundColor: COLORS.danger }]}
                          onPress={() => handleMerchantAction(m.id, "rejected")}
                        >
                          <Text style={styles.actionBtnText}>✗ Rejeter</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))
              )}
            </>
          )}

          {activeTab === "finance" && (
            <>
              <View style={styles.systemCard}>
                <Text style={styles.systemCardTitle}>💰 Solde Total Système</Text>
                <Text style={styles.systemCardSub}>Mise à jour automatique toutes les 15 secondes</Text>
                {statsLoading && !systemStats ? (
                  <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 16 }} />
                ) : systemStats ? (
                  <>
                    <View style={styles.statRow}>
                      <View style={styles.statBox}>
                        <Text style={styles.statLabel}>Portefeuilles cumulés</Text>
                        <Text style={styles.statValue}>{systemStats.total_wallets.toLocaleString("fr-FR")} FCFA</Text>
                      </View>
                      <View style={styles.statBox}>
                        <Text style={styles.statLabel}>Paris en cours</Text>
                        <Text style={[styles.statValue, { color: COLORS.orange }]}>
                          {systemStats.total_paris_en_cours.toLocaleString("fr-FR")} FCFA
                        </Text>
                      </View>
                    </View>
                    <View style={styles.statRow}>
                      <View style={styles.statBox}>
                        <Text style={styles.statLabel}>Utilisateurs inscrits</Text>
                        <Text style={styles.statValue}>{systemStats.user_count}</Text>
                      </View>
                      <View style={styles.statBox}>
                        <Text style={styles.statLabel}>Course active</Text>
                        <Text style={styles.statValue}>
                          {systemStats.active_course ? `${systemStats.active_course.status === "running" ? "🔴 En cours" : "🟢 Ouverte"}` : "Aucune"}
                        </Text>
                      </View>
                    </View>
                  </>
                ) : null}
                <TouchableOpacity style={styles.refreshSmallBtn} onPress={fetchSystemStats}>
                  <Text style={styles.refreshSmallText}>↻ Actualiser maintenant</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.sectionTitle}>🏆 Historique des Gains récents</Text>
              {gainsLoading && gains.length === 0 ? (
                <ActivityIndicator size="large" color={COLORS.primary} style={{ marginVertical: 20 }} />
              ) : gains.length === 0 ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyIcon}>📊</Text>
                  <Text style={styles.emptyText}>Aucun gain enregistré</Text>
                </View>
              ) : (
                gains.map((g) => (
                  <View key={g.id} style={styles.gainCard}>
                    <View style={styles.gainLeft}>
                      <Text style={styles.gainType}>{gainTypeLabel(g.type)}</Text>
                      <Text style={styles.gainUser} numberOfLines={1}>{g.to_uid}</Text>
                      <Text style={styles.gainDesc} numberOfLines={2}>{g.description}</Text>
                      <Text style={styles.cardDate}>{formatDate(g.created_at)}</Text>
                    </View>
                    <Text style={styles.gainAmount}>+{g.amount.toLocaleString("fr-FR")} FCFA</Text>
                  </View>
                ))
              )}
            </>
          )}

          {activeTab === "jeux" && (
            <>
              <Text style={styles.sectionTitle}>🏁 Course de Rue — Contrôle Admin</Text>
              {courseLoading ? (
                <ActivityIndicator size="large" color={COLORS.primary} style={{ marginVertical: 20 }} />
              ) : !adminCourse ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyIcon}>⏳</Text>
                  <Text style={styles.emptyText}>Aucune course active en ce moment</Text>
                  <TouchableOpacity style={styles.reloadBtn} onPress={fetchAdminCourse}>
                    <Text style={styles.reloadBtnText}>↻ Actualiser</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.courseAdminCard}>
                  <View style={styles.courseAdminHeader}>
                    <Text style={styles.courseAdminTitle}>{adminCourse.titre}</Text>
                    {statusBadge(adminCourse.status)}
                  </View>
                  <View style={styles.courseStatsRow}>
                    <View style={styles.courseStatBox}>
                      <Text style={styles.courseStatLabel}>Total misé</Text>
                      <Text style={styles.courseStatValue}>{(adminCourse.total_mises || 0).toLocaleString("fr-FR")} FCFA</Text>
                    </View>
                    <View style={styles.courseStatBox}>
                      <Text style={styles.courseStatLabel}>Cagnotte</Text>
                      <Text style={[styles.courseStatValue, { color: COLORS.gold }]}>
                        {(adminCourse.cagnotte_amount || 0).toLocaleString("fr-FR")} FCFA
                      </Text>
                    </View>
                    <View style={styles.courseStatBox}>
                      <Text style={styles.courseStatLabel}>Paris</Text>
                      <Text style={styles.courseStatValue}>{adminCourse.paris?.length || 0}</Text>
                    </View>
                  </View>

                  <Text style={styles.coureurListTitle}>Répartition des paris :</Text>
                  {adminCourse.coureurs.map((c) => {
                    const nb = adminCourse.repartition?.[c.id] ?? 0;
                    return (
                      <View key={c.id} style={styles.coureurRow}>
                        <Text style={styles.coureurEmoji}>{c.emoji}</Text>
                        <Text style={styles.coureurName}>{c.name}</Text>
                        <Text style={styles.coureurBets}>{nb} pari{nb !== 1 ? "s" : ""}</Text>
                      </View>
                    );
                  })}

                  <View style={styles.courseActionBtns}>
                    {adminCourse.status === "open" && (
                      <TouchableOpacity
                        style={[styles.bigActionBtn, { backgroundColor: COLORS.orange }]}
                        onPress={handleLancerDepart}
                        disabled={courseAction}
                      >
                        {courseAction
                          ? <ActivityIndicator color="#fff" />
                          : <Text style={styles.bigActionBtnText}>🏁 Lancer le départ</Text>
                        }
                      </TouchableOpacity>
                    )}
                    {(adminCourse.status === "open" || adminCourse.status === "running") && (
                      <TouchableOpacity
                        style={[styles.bigActionBtn, { backgroundColor: COLORS.danger }]}
                        onPress={() => { setShowWinnerPanel(!showWinnerPanel); setSelectedWinner(""); }}
                        disabled={courseAction}
                      >
                        <Text style={styles.bigActionBtnText}>🏆 Valider le gagnant</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {showWinnerPanel && (
                    <View style={styles.winnerPanel}>
                      <Text style={styles.winnerPanelTitle}>Sélectionnez le coureur gagnant :</Text>
                      {adminCourse.coureurs.map((c) => (
                        <TouchableOpacity
                          key={c.id}
                          style={[styles.winnerOption, selectedWinner === c.id && styles.winnerOptionSelected]}
                          onPress={() => setSelectedWinner(c.id)}
                        >
                          <Text style={styles.winnerOptionEmoji}>{c.emoji}</Text>
                          <Text style={[styles.winnerOptionName, selectedWinner === c.id && { color: COLORS.primary, fontWeight: "700" }]}>
                            {c.name}
                          </Text>
                          {selectedWinner === c.id && <Text style={{ color: COLORS.primary }}>✓</Text>}
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity
                        style={[styles.bigActionBtn, { backgroundColor: COLORS.success, opacity: !selectedWinner ? 0.4 : 1 }]}
                        onPress={handleValiderGagnant}
                        disabled={!selectedWinner || courseAction}
                      >
                        {courseAction
                          ? <ActivityIndicator color="#fff" />
                          : <Text style={styles.bigActionBtnText}>✅ Confirmer et distribuer les gains</Text>
                        }
                      </TouchableOpacity>
                    </View>
                  )}

                  <TouchableOpacity style={styles.refreshSmallBtn} onPress={fetchAdminCourse}>
                    <Text style={styles.refreshSmallText}>↻ Rafraîchir</Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={{ marginTop: 24 }}>
                <Text style={styles.sectionTitle}>🎯 Quiz — Ajouter une Question du Jour</Text>
                <View style={styles.quizForm}>
                  <Text style={styles.quizFormLabel}>Question :</Text>
                  <TextInput
                    style={styles.quizInput}
                    placeholder="Saisissez la question..."
                    value={quizQuestion}
                    onChangeText={setQuizQuestion}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />

                  <Text style={styles.quizFormLabel}>Options de réponse (sélectionnez la bonne) :</Text>
                  {quizOptions.map((opt, i) => (
                    <TouchableOpacity
                      key={i}
                      style={[styles.quizOptionRow, quizCorrect === i && styles.quizOptionCorrect]}
                      onPress={() => setQuizCorrect(i)}
                    >
                      <View style={[styles.quizOptionRadio, quizCorrect === i && styles.quizOptionRadioActive]}>
                        {quizCorrect === i && <View style={styles.quizOptionRadioDot} />}
                      </View>
                      <TextInput
                        style={[styles.quizOptionInput, quizCorrect === i && { color: COLORS.primary, fontWeight: "700" as any }]}
                        placeholder={`Option ${i + 1}`}
                        value={opt}
                        onChangeText={(v) => {
                          const next = [...quizOptions];
                          next[i] = v;
                          setQuizOptions(next);
                        }}
                      />
                    </TouchableOpacity>
                  ))}

                  {quizCorrect !== null && (
                    <View style={styles.quizCorrectBadge}>
                      <Text style={styles.quizCorrectBadgeText}>
                        ✅ Bonne réponse : Option {quizCorrect + 1} — {quizOptions[quizCorrect] || "..."}
                      </Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={[styles.bigActionBtn, { backgroundColor: COLORS.primary, marginTop: 12 }]}
                    onPress={handleAddQuizQuestion}
                    disabled={quizSending}
                  >
                    {quizSending
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={styles.bigActionBtnText}>➕ Ajouter au Quiz</Text>
                    }
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}
        </ScrollView>
      )}

      <Modal visible={responseModal.visible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Répondre à la demande</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Tapez votre réponse..."
              value={responseText}
              onChangeText={setResponseText}
              multiline
              numberOfLines={5}
              textAlignVertical="top"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: COLORS.sub }]}
                onPress={() => setResponseModal({ visible: false, requestId: "" })}
              >
                <Text style={styles.modalBtnText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: COLORS.primary }]}
                onPress={submitResponse}
              >
                <Text style={styles.modalBtnText}>Envoyer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    backgroundColor: COLORS.primary,
    padding: 20,
    paddingTop: 10,
  },
  headerTitle: { fontSize: 22, fontWeight: "800", color: "#fff" },
  headerSub: { fontSize: 12, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  tabsScroll: { maxHeight: 52, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tabs: {
    flexDirection: "row",
    backgroundColor: COLORS.card,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  tabActive: {
    borderBottomWidth: 3,
    borderBottomColor: COLORS.primary,
  },
  tabText: { fontSize: 12, color: COLORS.sub, fontWeight: "600" },
  tabTextActive: { color: COLORS.primary, fontWeight: "800" },
  loadingBox: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  loadingText: { color: COLORS.sub, fontSize: 15 },
  content: { padding: 16, gap: 12, paddingBottom: 40 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 8,
    marginTop: 4,
  },
  empty: { alignItems: "center", paddingVertical: 48, gap: 8 },
  emptyIcon: { fontSize: 48 },
  emptyText: { fontSize: 16, color: COLORS.sub },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardRow: { flexDirection: "row", gap: 12 },
  cardInfo: { flex: 1, gap: 3 },
  cardRight: { alignItems: "flex-end" },
  cardTitle: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  cardSub: { fontSize: 13, color: COLORS.sub },
  cardSubject: { fontSize: 14, fontWeight: "600", color: COLORS.text, marginTop: 4 },
  cardAmount: { fontSize: 16, fontWeight: "800", color: COLORS.primary, marginTop: 4 },
  cardMessage: { fontSize: 13, color: COLORS.sub, marginTop: 2, lineHeight: 18 },
  cardDate: { fontSize: 12, color: COLORS.sub, marginTop: 4 },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeText: { fontSize: 11, fontWeight: "700", color: "#fff" },
  actions: { flexDirection: "row", gap: 10 },
  actionBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  actionBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  responseBox: {
    backgroundColor: "#E8F5E9",
    borderRadius: 8,
    padding: 10,
    marginTop: 8,
  },
  responseLabel: { fontSize: 12, fontWeight: "700", color: COLORS.primary },
  responseText: { fontSize: 13, color: COLORS.text, marginTop: 4 },
  denied: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32, gap: 12 },
  deniedIcon: { fontSize: 64 },
  deniedTitle: { fontSize: 22, fontWeight: "800", color: COLORS.text },
  deniedSub: { fontSize: 15, color: COLORS.sub, textAlign: "center" },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  modalBox: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    gap: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: COLORS.text },
  modalInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: COLORS.text,
    minHeight: 120,
  },
  modalActions: { flexDirection: "row", gap: 12 },
  modalBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  modalBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  sub: { color: COLORS.sub },

  systemCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  systemCardTitle: { fontSize: 18, fontWeight: "800", color: COLORS.text },
  systemCardSub: { fontSize: 12, color: COLORS.sub, marginTop: 2, marginBottom: 16 },
  statRow: { flexDirection: "row", gap: 12, marginBottom: 12 },
  statBox: {
    flex: 1,
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  statLabel: { fontSize: 12, color: COLORS.sub, textAlign: "center", marginBottom: 4 },
  statValue: { fontSize: 18, fontWeight: "800", color: COLORS.primary, textAlign: "center" },
  refreshSmallBtn: {
    marginTop: 12,
    paddingVertical: 8,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  refreshSmallText: { fontSize: 13, color: COLORS.primary, fontWeight: "600" },
  gainCard: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  gainLeft: { flex: 1, gap: 2 },
  gainType: { fontSize: 13, fontWeight: "700", color: COLORS.text },
  gainUser: { fontSize: 12, color: COLORS.sub },
  gainDesc: { fontSize: 12, color: COLORS.sub, lineHeight: 16 },
  gainAmount: { fontSize: 16, fontWeight: "800", color: COLORS.success },

  courseAdminCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  courseAdminHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  courseAdminTitle: { fontSize: 16, fontWeight: "800", color: COLORS.text },
  courseStatsRow: { flexDirection: "row", gap: 8 },
  courseStatBox: { flex: 1, backgroundColor: COLORS.bg, borderRadius: 10, padding: 10, alignItems: "center" },
  courseStatLabel: { fontSize: 11, color: COLORS.sub, marginBottom: 3 },
  courseStatValue: { fontSize: 15, fontWeight: "800", color: COLORS.text },
  coureurListTitle: { fontSize: 13, fontWeight: "700", color: COLORS.text, marginTop: 4 },
  coureurRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6, gap: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  coureurEmoji: { fontSize: 20, width: 30 },
  coureurName: { flex: 1, fontSize: 14, color: COLORS.text },
  coureurBets: { fontSize: 13, color: COLORS.sub, fontWeight: "600" },
  courseActionBtns: { flexDirection: "row", gap: 10, marginTop: 8 },
  bigActionBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  bigActionBtnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  winnerPanel: {
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    padding: 14,
    gap: 8,
    marginTop: 4,
  },
  winnerPanelTitle: { fontSize: 14, fontWeight: "700", color: COLORS.text, marginBottom: 4 },
  winnerOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: COLORS.card,
    gap: 10,
    borderWidth: 2,
    borderColor: "transparent",
  },
  winnerOptionSelected: {
    borderColor: COLORS.primary,
    backgroundColor: "#E8F5E9",
  },
  winnerOptionEmoji: { fontSize: 22 },
  winnerOptionName: { flex: 1, fontSize: 14, color: COLORS.text },
  reloadBtn: {
    marginTop: 12,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  reloadBtnText: { color: "#fff", fontWeight: "700" },

  quizForm: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  quizFormLabel: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  quizInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: COLORS.text,
    minHeight: 80,
  },
  quizOptionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  quizOptionCorrect: {
    borderColor: COLORS.primary,
    backgroundColor: "#E8F5E9",
  },
  quizOptionRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  quizOptionRadioActive: {
    borderColor: COLORS.primary,
  },
  quizOptionRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
  },
  quizOptionInput: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    paddingVertical: 4,
  },
  quizCorrectBadge: {
    backgroundColor: "#E8F5E9",
    borderRadius: 8,
    padding: 10,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  quizCorrectBadgeText: { fontSize: 13, color: COLORS.primary, fontWeight: "600" },
});
