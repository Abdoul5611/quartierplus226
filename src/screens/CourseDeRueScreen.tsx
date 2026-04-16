import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Platform, ActivityIndicator, Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { BASE_URL } from "../services/api";

const COLORS = {
  primary: "#2E7D32",
  primaryLight: "#E8F5E9",
  gold: "#F9A825",
  goldLight: "#FFF8E1",
  red: "#C62828",
  redLight: "#FFEBEE",
  orange: "#E65100",
  orangeLight: "#FFF3E0",
  bg: "#F5F5F5",
  card: "#FFFFFF",
  text: "#212121",
  textSub: "#757575",
  border: "#E0E0E0",
  disabled: "#BDBDBD",
};

const COUREURS_DEFAUT = [
  { id: "c1", name: "Kofi le Rapide", emoji: "🏃" },
  { id: "c2", name: "Awa la Gazelle", emoji: "💨" },
  { id: "c3", name: "Moussa l'Éclair", emoji: "⚡" },
  { id: "c4", name: "Fatou la Tornade", emoji: "🌪️" },
  { id: "c5", name: "Ibra le Lion", emoji: "🦁" },
];

interface Coureur { id: string; name: string; emoji: string; }
interface Course {
  id: string;
  titre: string;
  status: "open" | "running" | "finished";
  coureurs: Coureur[];
  total_mises: number;
  cagnotte_amount: number;
  carryover_amount: number;
  winner_coureur_id?: string;
  repartition?: Record<string, number>;
  finished_at?: string;
  admin_cut?: number;
}
interface MonPari { coureur_id: string; montant: number; status: string; gain: number; }

export default function CourseDeRueScreen() {
  const navigation = useNavigation<any>();
  const { dbUser, isAdmin } = useAuth() as any;
  const balance = dbUser?.wallet_balance ?? 0;
  const userUid = dbUser?.firebase_uid;

  const [course, setCourse] = useState<Course | null>(null);
  const [history, setHistory] = useState<Course[]>([]);
  const [monPari, setMonPari] = useState<MonPari | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"active" | "history">("active");

  const [showBetPanel, setShowBetPanel] = useState(false);
  const [selectedCoureur, setSelectedCoureur] = useState<Coureur | null>(null);
  const [montantInput, setMontantInput] = useState("100");
  const [betting, setBetting] = useState(false);

  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showFinishPanel, setShowFinishPanel] = useState(false);
  const [selectedWinner, setSelectedWinner] = useState<string>("");
  const [finishing, setFinishing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [lastCarryover, setLastCarryover] = useState(0);

  const isMounted = useRef(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const fetchCourse = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/courses/active`);
      const data = await res.json();
      if (!isMounted.current) return;
      setCourse(data);
      if (data && userUid) {
        const parisRes = await fetch(`${BASE_URL}/api/courses/${data.id}/paris`);
        const paris = await parisRes.json();
        if (!isMounted.current) return;
        const myPari = paris.find((p: any) => p.user_uid === userUid);
        setMonPari(myPari || null);
      } else {
        setMonPari(null);
      }
    } catch {
      if (isMounted.current) setCourse(null);
    }
  }, [userUid]);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/api/courses/history`);
      const data = await res.json();
      if (!isMounted.current) return;
      setHistory(data || []);
      if (data && data.length > 0) {
        setLastCarryover(data[0].carryover_amount ?? 0);
      }
    } catch {
      if (isMounted.current) setHistory([]);
    }
  }, []);

  const loadAll = useCallback(async () => {
    if (!isMounted.current) return;
    setLoading(true);
    await Promise.all([fetchCourse(), fetchHistory()]);
    if (isMounted.current) setLoading(false);
  }, [fetchCourse, fetchHistory]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (course?.status !== "finished") {
      intervalRef.current = setInterval(() => {
        if (isMounted.current) fetchCourse();
      }, 10000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [course?.status, fetchCourse]);

  const openBetPanel = (coureur: Coureur) => {
    setSelectedCoureur(coureur);
    setMontantInput("100");
    setShowBetPanel(true);
    setShowFinishPanel(false);
  };

  const closeBetPanel = () => {
    setShowBetPanel(false);
    setSelectedCoureur(null);
  };

  const placerPari = async () => {
    const montant = parseInt(montantInput, 10);
    if (!selectedCoureur) return;
    if (isNaN(montant) || montant < 50) {
      Alert.alert("Mise invalide", "La mise minimum est de 50 FCFA");
      return;
    }
    if (montant > balance) {
      Alert.alert("Solde insuffisant", `Votre solde est de ${balance} FCFA`);
      return;
    }
    if (!course) return;
    setBetting(true);
    try {
      const res = await fetch(`${BASE_URL}/api/courses/pari`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course_id: course.id,
          user_uid: userUid,
          user_name: dbUser?.display_name || "Voisin",
          coureur_id: selectedCoureur.id,
          montant,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert("Erreur", data.error || "Impossible de miser");
      } else {
        closeBetPanel();
        await fetchCourse();
        Alert.alert("Pari enregistré !", `Vous avez misé ${montant} FCFA sur ${selectedCoureur.emoji} ${selectedCoureur.name}`);
      }
    } catch {
      Alert.alert("Erreur réseau", "Vérifiez votre connexion");
    } finally {
      if (isMounted.current) setBetting(false);
    }
  };

  const creerCourse = async () => {
    setCreating(true);
    try {
      const res = await fetch(`${BASE_URL}/api/courses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titre: "Course de Rue",
          coureurs: COUREURS_DEFAUT,
          admin_uid: userUid,
          carryover_amount: lastCarryover,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert("Erreur", data.error || "Impossible de créer la course");
      } else {
        setLastCarryover(0);
        setShowAdminPanel(false);
        await fetchCourse();
        Alert.alert("Course créée !", lastCarryover > 0
          ? `Course créée avec un report de ${lastCarryover} FCFA`
          : "La course est ouverte aux paris");
      }
    } catch {
      Alert.alert("Erreur réseau");
    } finally {
      if (isMounted.current) setCreating(false);
    }
  };

  const changerStatus = async (newStatus: "open" | "running") => {
    if (!course) return;
    try {
      const res = await fetch(`${BASE_URL}/api/courses/${course.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus, admin_uid: userUid }),
      });
      if (res.ok && isMounted.current) await fetchCourse();
    } catch {
      Alert.alert("Erreur réseau");
    }
  };

  const terminerCourse = async () => {
    if (!selectedWinner || !course) return;
    setFinishing(true);
    try {
      const res = await fetch(`${BASE_URL}/api/courses/${course.id}/finish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ winner_coureur_id: selectedWinner, admin_uid: userUid }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert("Erreur", data.error || "Impossible de terminer");
      } else {
        setShowFinishPanel(false);
        setShowAdminPanel(false);
        await loadAll();
        const msg = data.has_carryover
          ? `Aucun parieur sur le gagnant !\n${data.carryover_amount?.toLocaleString("fr-FR")} FCFA reportés à la prochaine course.`
          : `${data.nb_gagnants} gagnant(s)\n${data.gain_par_gagnant?.toLocaleString("fr-FR")} FCFA chacun\nAdmin : ${data.admin_cut?.toLocaleString("fr-FR")} FCFA`;
        Alert.alert("Course terminée !", msg);
      }
    } catch {
      Alert.alert("Erreur réseau");
    } finally {
      if (isMounted.current) setFinishing(false);
    }
  };

  const getWinnerCoureur = (c: Course) =>
    (c.coureurs as Coureur[]).find((r) => r.id === c.winner_coureur_id);

  const formatDate = (d?: string) => {
    if (!d) return "";
    return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Chargement de la course...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>🏁 Course de Rue</Text>
          <Text style={styles.headerSub}>Pari Mutuel — Misez sur le bon coureur !</Text>
        </View>
        {isAdmin && (
          <TouchableOpacity
            onPress={() => {
              setShowAdminPanel(!showAdminPanel);
              setShowBetPanel(false);
              setShowFinishPanel(false);
            }}
            style={styles.adminBtn}
          >
            <Ionicons name="settings" size={20} color={COLORS.primary} />
          </TouchableOpacity>
        )}
      </View>

      {isAdmin && showAdminPanel && (
        <View style={styles.adminPanel}>
          <Text style={styles.adminTitle}>Panneau Admin</Text>
          <View style={styles.adminBtns}>
            {!course && (
              <TouchableOpacity style={styles.adminAction} onPress={creerCourse} disabled={creating}>
                <Ionicons name="add-circle" size={16} color="#fff" />
                <Text style={styles.adminActionText}>
                  {creating ? "Création..." : lastCarryover > 0 ? `Nouvelle course (+${lastCarryover} FCFA)` : "Nouvelle course"}
                </Text>
              </TouchableOpacity>
            )}
            {course?.status === "open" && (
              <TouchableOpacity style={[styles.adminAction, { backgroundColor: COLORS.orange }]} onPress={() => changerStatus("running")}>
                <Ionicons name="play" size={16} color="#fff" />
                <Text style={styles.adminActionText}>Lancer la course</Text>
              </TouchableOpacity>
            )}
            {course && course.status !== "finished" && (
              <TouchableOpacity
                style={[styles.adminAction, { backgroundColor: COLORS.red }]}
                onPress={() => { setSelectedWinner(""); setShowFinishPanel(!showFinishPanel); setShowBetPanel(false); }}
              >
                <Ionicons name="flag" size={16} color="#fff" />
                <Text style={styles.adminActionText}>Déclarer le gagnant</Text>
              </TouchableOpacity>
            )}
          </View>
          {showFinishPanel && course && (
            <View style={styles.finishPanel}>
              <Text style={styles.finishPanelTitle}>Sélectionnez le coureur gagnant :</Text>
              {(course.coureurs as Coureur[]).map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.winnerOption, selectedWinner === c.id && styles.winnerOptionSelected]}
                  onPress={() => setSelectedWinner(c.id)}
                >
                  <Text style={styles.winnerOptionEmoji}>{c.emoji}</Text>
                  <Text style={[styles.winnerOptionName, selectedWinner === c.id && { color: COLORS.primary, fontWeight: "700" }]}>
                    {c.name}
                  </Text>
                  {selectedWinner === c.id && <Ionicons name="checkmark-circle" size={18} color={COLORS.primary} />}
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.adminAction, { backgroundColor: COLORS.red, marginTop: 8, opacity: !selectedWinner ? 0.5 : 1 }]}
                onPress={terminerCourse}
                disabled={finishing || !selectedWinner}
              >
                {finishing
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <><Ionicons name="trophy" size={16} color="#fff" /><Text style={styles.adminActionText}>Confirmer et distribuer</Text></>
                }
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, tab === "active" && styles.tabActive]} onPress={() => setTab("active")}>
          <Text style={[styles.tabText, tab === "active" && styles.tabTextActive]}>Course en cours</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === "history" && styles.tabActive]} onPress={() => setTab("history")}>
          <Text style={[styles.tabText, tab === "history" && styles.tabTextActive]}>Historique</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {tab === "active" ? (
          <>
            <View style={styles.walletRow}>
              <Ionicons name="wallet-outline" size={18} color={COLORS.primary} />
              <Text style={styles.walletText}>
                Solde : <Text style={styles.walletBold}>{balance.toLocaleString("fr-FR")} FCFA</Text>
              </Text>
              <TouchableOpacity onPress={fetchCourse} style={styles.refreshBtn}>
                <Ionicons name="refresh" size={16} color={COLORS.primary} />
              </TouchableOpacity>
            </View>

            {!course ? (
              <View style={styles.noCourse}>
                <Text style={styles.noCourseEmoji}>⏳</Text>
                <Text style={styles.noCourseTitle}>Prochaine course en préparation</Text>
                <Text style={styles.noCourseText}>Une nouvelle course est créée automatiquement. Revenez dans quelques instants !</Text>
                <TouchableOpacity style={styles.reloadBtn} onPress={fetchCourse}>
                  <Ionicons name="refresh" size={16} color="#fff" />
                  <Text style={styles.reloadBtnText}>Actualiser</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.cagnotteCard}>
                  <View style={styles.cagnotteTop}>
                    <Text style={styles.cagnotteLabel}>💰 Cagnotte totale</Text>
                    <View style={[
                      styles.statusBadge,
                      course.status === "running" && styles.statusRunning,
                      course.status === "finished" && styles.statusFinished,
                    ]}>
                      <Text style={styles.statusText}>
                        {course.status === "open" ? "🟢 Ouvert aux paris" : course.status === "running" ? "🔴 En course !" : "🏁 Terminé"}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.cagnotteAmount}>
                    {(course.cagnotte_amount ?? 0).toLocaleString("fr-FR")} FCFA
                  </Text>
                  <View style={styles.cagnotteDetails}>
                    <View style={styles.cagnotteDetail}>
                      <Text style={styles.cagnotteDetailLabel}>Total misé</Text>
                      <Text style={styles.cagnotteDetailValue}>{(course.total_mises ?? 0).toLocaleString("fr-FR")} FCFA</Text>
                    </View>
                    <View style={styles.cagnotteDivider} />
                    <View style={styles.cagnotteDetail}>
                      <Text style={styles.cagnotteDetailLabel}>Prélèvement</Text>
                      <Text style={styles.cagnotteDetailValue}>20%</Text>
                    </View>
                    {(course.carryover_amount ?? 0) > 0 && (
                      <>
                        <View style={styles.cagnotteDivider} />
                        <View style={styles.cagnotteDetail}>
                          <Text style={[styles.cagnotteDetailLabel, { color: "#FFD54F" }]}>Report</Text>
                          <Text style={[styles.cagnotteDetailValue, { color: "#FFD54F" }]}>
                            +{(course.carryover_amount ?? 0).toLocaleString("fr-FR")} FCFA
                          </Text>
                        </View>
                      </>
                    )}
                  </View>
                </View>

                {monPari && (
                  <View style={[
                    styles.monPariCard,
                    monPari.status === "won" && { borderColor: COLORS.gold, backgroundColor: COLORS.goldLight },
                    monPari.status === "lost" && { borderColor: COLORS.red, backgroundColor: COLORS.redLight },
                  ]}>
                    <Ionicons
                      name={monPari.status === "won" ? "trophy" : monPari.status === "lost" ? "close-circle" : "ticket"}
                      size={20}
                      color={monPari.status === "won" ? COLORS.gold : monPari.status === "lost" ? COLORS.red : COLORS.primary}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.monPariTitle}>Mon pari</Text>
                      <Text style={styles.monPariText}>
                        {(course.coureurs as Coureur[]).find((r) => r.id === monPari.coureur_id)?.emoji}{" "}
                        {(course.coureurs as Coureur[]).find((r) => r.id === monPari.coureur_id)?.name}
                        {" — "}{monPari.montant.toLocaleString("fr-FR")} FCFA
                      </Text>
                      {monPari.status === "won" && (
                        <Text style={[styles.monPariResult, { color: COLORS.primary }]}>
                          Gagné : +{(monPari.gain ?? 0).toLocaleString("fr-FR")} FCFA
                        </Text>
                      )}
                      {monPari.status === "lost" && (
                        <Text style={[styles.monPariResult, { color: COLORS.red }]}>Perdu</Text>
                      )}
                    </View>
                  </View>
                )}

                {course.status === "finished" && (
                  <View style={styles.resultCard}>
                    <Text style={styles.resultTitle}>🏆 Résultats</Text>
                    {getWinnerCoureur(course) ? (
                      <>
                        <Text style={styles.resultWinner}>
                          {getWinnerCoureur(course)?.emoji} {getWinnerCoureur(course)?.name}
                        </Text>
                        <Text style={styles.resultSub}>a remporté la course !</Text>
                        {(course.carryover_amount ?? 0) > 0 && (
                          <View style={styles.carryoverBadge}>
                            <Ionicons name="arrow-forward-circle" size={15} color={COLORS.orange} />
                            <Text style={styles.carryoverText}>
                              {(course.carryover_amount ?? 0).toLocaleString("fr-FR")} FCFA reportés
                            </Text>
                          </View>
                        )}
                      </>
                    ) : (
                      <Text style={styles.resultSub}>En attente du résultat...</Text>
                    )}
                  </View>
                )}

                <Text style={styles.sectionTitle}>Les Coureurs</Text>

                {(course.coureurs as Coureur[]).map((coureur) => {
                  const nbParis = course.repartition?.[coureur.id] ?? 0;
                  const isMyChoice = monPari?.coureur_id === coureur.id;
                  const isWinner = course.winner_coureur_id === coureur.id;
                  const canBet = course.status === "open" && !monPari;
                  return (
                    <View
                      key={coureur.id}
                      style={[
                        styles.coureurCard,
                        isWinner && styles.coureurWinner,
                        isMyChoice && !isWinner && styles.coureurMyChoice,
                      ]}
                    >
                      <Text style={styles.coureurEmoji}>{coureur.emoji}</Text>
                      <View style={styles.coureurInfo}>
                        <View style={styles.coureurNameRow}>
                          <Text style={styles.coureurName}>{coureur.name}</Text>
                          {isWinner && (
                            <View style={styles.winnerBadge}>
                              <Text style={styles.winnerBadgeText}>🏆</Text>
                            </View>
                          )}
                          {isMyChoice && !isWinner && course.status !== "finished" && (
                            <View style={styles.myChoiceBadge}>
                              <Text style={styles.myChoiceBadgeText}>Mon choix</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.coureurStats}>
                          {nbParis} pari{nbParis !== 1 ? "s" : ""}
                        </Text>
                      </View>
                      {canBet && (
                        <TouchableOpacity style={styles.parierBtn} onPress={() => openBetPanel(coureur)}>
                          <Text style={styles.parierBtnText}>Parier</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}

                {showBetPanel && selectedCoureur && (
                  <View style={styles.betPanel}>
                    <View style={styles.betPanelHeader}>
                      <Text style={styles.betPanelTitle}>
                        {selectedCoureur.emoji} {selectedCoureur.name}
                      </Text>
                      <TouchableOpacity onPress={closeBetPanel}>
                        <Ionicons name="close" size={20} color={COLORS.text} />
                      </TouchableOpacity>
                    </View>
                    <Text style={styles.betPanelLabel}>Montant de votre mise (min. 50 FCFA)</Text>
                    <View style={styles.betInputRow}>
                      <TextInput
                        style={styles.betInput}
                        value={montantInput}
                        onChangeText={setMontantInput}
                        keyboardType="numeric"
                        placeholder="100"
                        maxLength={6}
                      />
                      <Text style={styles.betInputSuffix}>FCFA</Text>
                    </View>
                    <View style={styles.quickBets}>
                      {[100, 250, 500, 1000].map((v) => (
                        <TouchableOpacity
                          key={v}
                          style={[styles.quickBetBtn, montantInput === String(v) && styles.quickBetBtnActive]}
                          onPress={() => setMontantInput(String(v))}
                        >
                          <Text style={[styles.quickBetText, montantInput === String(v) && styles.quickBetTextActive]}>
                            {v}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={styles.betHint}>Solde : {balance.toLocaleString("fr-FR")} FCFA</Text>
                    <View style={styles.betBtns}>
                      <TouchableOpacity style={styles.betCancel} onPress={closeBetPanel}>
                        <Text style={styles.betCancelText}>Annuler</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.betConfirm} onPress={placerPari} disabled={betting}>
                        {betting
                          ? <ActivityIndicator size="small" color="#fff" />
                          : <Text style={styles.betConfirmText}>Confirmer le pari</Text>
                        }
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                <View style={styles.regleBox}>
                  <Ionicons name="information-circle-outline" size={15} color={COLORS.primary} />
                  <Text style={styles.regleText}>
                    20% du total misé est prélevé pour l'application. La cagnotte restante (80%) est divisée équitablement
                    entre tous les gagnants. Si personne ne mise sur le gagnant, la cagnotte est reportée à la course suivante.
                  </Text>
                </View>
              </>
            )}
          </>
        ) : (
          <>
            {history.length === 0 ? (
              <View style={styles.noCourse}>
                <Text style={styles.noCourseEmoji}>📋</Text>
                <Text style={styles.noCourseTitle}>Aucune course terminée</Text>
                <Text style={styles.noCourseText}>L'historique apparaîtra ici après les premières courses.</Text>
              </View>
            ) : (
              history.map((c) => {
                const winner = getWinnerCoureur(c);
                return (
                  <View key={c.id} style={styles.historyCard}>
                    <View style={styles.historyHeader}>
                      <Text style={styles.historyDate}>{formatDate(c.finished_at)}</Text>
                      {(c.carryover_amount ?? 0) > 0 && (
                        <View style={styles.carryoverBadgeSmall}>
                          <Text style={styles.carryoverBadgeSmallText}>
                            Report: {c.carryover_amount?.toLocaleString("fr-FR")} FCFA
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.historyWinnerRow}>
                      <Text style={styles.historyWinnerEmoji}>{winner?.emoji ?? "?"}</Text>
                      <View>
                        <Text style={styles.historyWinnerName}>{winner?.name ?? "Inconnu"}</Text>
                        <Text style={styles.historyWinnerLabel}>Vainqueur</Text>
                      </View>
                    </View>
                    <View style={styles.historyStats}>
                      <View style={styles.historyStat}>
                        <Text style={styles.historyStatLabel}>Total misé</Text>
                        <Text style={styles.historyStatValue}>{(c.total_mises ?? 0).toLocaleString("fr-FR")} FCFA</Text>
                      </View>
                      <View style={styles.historyStat}>
                        <Text style={styles.historyStatLabel}>Cagnotte</Text>
                        <Text style={styles.historyStatValue}>{(c.cagnotte_amount ?? 0).toLocaleString("fr-FR")} FCFA</Text>
                      </View>
                      <View style={styles.historyStat}>
                        <Text style={styles.historyStatLabel}>Admin</Text>
                        <Text style={styles.historyStatValue}>{(c.admin_cut ?? 0).toLocaleString("fr-FR")} FCFA</Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  loadingText: { fontSize: 14, color: COLORS.textSub },
  header: {
    paddingTop: Platform.OS === "ios" ? 56 : 20,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: COLORS.card,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: "800", color: COLORS.text },
  headerSub: { fontSize: 12, color: COLORS.textSub, marginTop: 1 },
  adminBtn: { padding: 8, backgroundColor: COLORS.primaryLight, borderRadius: 10 },
  adminPanel: {
    backgroundColor: "#FFF3E0",
    borderBottomWidth: 1,
    borderBottomColor: "#FFE0B2",
    padding: 12,
  },
  adminTitle: { fontSize: 12, fontWeight: "700", color: COLORS.orange, marginBottom: 8, textTransform: "uppercase" },
  adminBtns: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  adminAction: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  adminActionText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  finishPanel: {
    marginTop: 12,
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 10,
  },
  finishPanelTitle: { fontSize: 13, fontWeight: "600", color: COLORS.text, marginBottom: 8 },
  winnerOption: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 10, borderRadius: 8, borderWidth: 1.5,
    borderColor: COLORS.border, marginBottom: 6,
  },
  winnerOptionSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  winnerOptionEmoji: { fontSize: 22 },
  winnerOptionName: { flex: 1, fontSize: 14, fontWeight: "600", color: COLORS.text },
  tabs: {
    flexDirection: "row",
    backgroundColor: COLORS.card,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
  },
  tab: { flex: 1, paddingVertical: 12, alignItems: "center" },
  tabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  tabText: { fontSize: 13, fontWeight: "600", color: COLORS.textSub },
  tabTextActive: { color: COLORS.primary },
  scroll: { padding: 16 },
  walletRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: COLORS.primaryLight, borderRadius: 10,
    padding: 10, marginBottom: 14,
  },
  walletText: { flex: 1, fontSize: 13, color: COLORS.primary },
  walletBold: { fontWeight: "800", fontSize: 15 },
  refreshBtn: { padding: 4 },
  noCourse: { alignItems: "center", paddingVertical: 50 },
  noCourseEmoji: { fontSize: 44, marginBottom: 12 },
  noCourseTitle: { fontSize: 17, fontWeight: "700", color: COLORS.text, marginBottom: 6 },
  noCourseText: { fontSize: 14, color: COLORS.textSub, textAlign: "center", paddingHorizontal: 24, lineHeight: 20 },
  reloadBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: COLORS.primary, borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 10, marginTop: 16,
  },
  reloadBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  cagnotteCard: {
    backgroundColor: COLORS.primary, borderRadius: 16,
    padding: 16, marginBottom: 14,
  },
  cagnotteTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  cagnotteLabel: { fontSize: 13, fontWeight: "700", color: "rgba(255,255,255,0.85)" },
  statusBadge: { backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  statusRunning: { backgroundColor: "rgba(198,40,40,0.3)" },
  statusFinished: { backgroundColor: "rgba(0,0,0,0.2)" },
  statusText: { fontSize: 11, fontWeight: "700", color: "#fff" },
  cagnotteAmount: { fontSize: 30, fontWeight: "900", color: "#fff", marginBottom: 12 },
  cagnotteDetails: { flexDirection: "row", backgroundColor: "rgba(255,255,255,0.15)", borderRadius: 10, padding: 10 },
  cagnotteDetail: { flex: 1, alignItems: "center" },
  cagnotteDetailLabel: { fontSize: 10, color: "rgba(255,255,255,0.7)", marginBottom: 2 },
  cagnotteDetailValue: { fontSize: 12, fontWeight: "700", color: "#fff" },
  cagnotteDivider: { width: 1, backgroundColor: "rgba(255,255,255,0.3)", marginHorizontal: 6 },
  monPariCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: COLORS.primaryLight, borderRadius: 12,
    padding: 12, marginBottom: 14, borderWidth: 1.5, borderColor: COLORS.primary,
  },
  monPariTitle: { fontSize: 10, fontWeight: "700", color: COLORS.textSub, textTransform: "uppercase" },
  monPariText: { fontSize: 14, fontWeight: "600", color: COLORS.text, marginTop: 2 },
  monPariResult: { fontSize: 13, fontWeight: "700", marginTop: 2 },
  resultCard: {
    backgroundColor: COLORS.goldLight, borderRadius: 12,
    padding: 16, marginBottom: 14, alignItems: "center",
    borderWidth: 1.5, borderColor: COLORS.gold,
  },
  resultTitle: { fontSize: 16, fontWeight: "800", color: COLORS.text, marginBottom: 8 },
  resultWinner: { fontSize: 26, fontWeight: "900", color: COLORS.text },
  resultSub: { fontSize: 14, color: COLORS.textSub, marginTop: 4 },
  carryoverBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: COLORS.orangeLight, borderRadius: 8, padding: 8, marginTop: 10,
  },
  carryoverText: { fontSize: 13, color: COLORS.orange, fontWeight: "600" },
  sectionTitle: {
    fontSize: 12, fontWeight: "700", color: COLORS.textSub,
    textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10, marginTop: 4,
  },
  coureurCard: {
    backgroundColor: COLORS.card, borderRadius: 14, padding: 14,
    flexDirection: "row", alignItems: "center", marginBottom: 10, gap: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    borderWidth: 1.5, borderColor: "transparent",
  },
  coureurWinner: { borderColor: COLORS.gold, backgroundColor: COLORS.goldLight },
  coureurMyChoice: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  coureurEmoji: { fontSize: 30 },
  coureurInfo: { flex: 1 },
  coureurNameRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  coureurName: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  coureurStats: { fontSize: 12, color: COLORS.textSub },
  winnerBadge: { backgroundColor: COLORS.gold, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  winnerBadgeText: { fontSize: 12 },
  myChoiceBadge: { backgroundColor: COLORS.primary, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  myChoiceBadgeText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  parierBtn: { backgroundColor: COLORS.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  parierBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  betPanel: {
    backgroundColor: COLORS.card, borderRadius: 16,
    padding: 16, marginTop: 8, marginBottom: 12,
    borderWidth: 1.5, borderColor: COLORS.primary,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 4,
  },
  betPanelHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  betPanelTitle: { fontSize: 16, fontWeight: "800", color: COLORS.text },
  betPanelLabel: { fontSize: 12, fontWeight: "600", color: COLORS.textSub, marginBottom: 8 },
  betInputRow: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10,
  },
  betInput: { flex: 1, fontSize: 20, fontWeight: "700", color: COLORS.text },
  betInputSuffix: { fontSize: 14, fontWeight: "600", color: COLORS.textSub },
  quickBets: { flexDirection: "row", gap: 8, marginBottom: 10 },
  quickBetBtn: { flex: 1, backgroundColor: COLORS.primaryLight, borderRadius: 8, paddingVertical: 8, alignItems: "center" },
  quickBetBtnActive: { backgroundColor: COLORS.primary },
  quickBetText: { fontSize: 13, fontWeight: "700", color: COLORS.primary },
  quickBetTextActive: { color: "#fff" },
  betHint: { fontSize: 12, color: COLORS.textSub, marginBottom: 14 },
  betBtns: { flexDirection: "row", gap: 10 },
  betCancel: { flex: 1, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  betCancelText: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  betConfirm: { flex: 2, backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  betConfirmText: { fontSize: 14, fontWeight: "700", color: "#fff" },
  regleBox: {
    flexDirection: "row", alignItems: "flex-start",
    backgroundColor: COLORS.primaryLight, borderRadius: 10,
    padding: 12, gap: 8, marginTop: 8,
  },
  regleText: { flex: 1, fontSize: 12, color: COLORS.primary, lineHeight: 18 },
  historyCard: {
    backgroundColor: COLORS.card, borderRadius: 14, padding: 14,
    marginBottom: 12, shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  historyHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  historyDate: { fontSize: 12, color: COLORS.textSub },
  carryoverBadgeSmall: { backgroundColor: COLORS.orangeLight, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  carryoverBadgeSmallText: { fontSize: 11, color: COLORS.orange, fontWeight: "700" },
  historyWinnerRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  historyWinnerEmoji: { fontSize: 26 },
  historyWinnerName: { fontSize: 15, fontWeight: "800", color: COLORS.text },
  historyWinnerLabel: { fontSize: 11, color: COLORS.textSub },
  historyStats: { flexDirection: "row", backgroundColor: COLORS.bg, borderRadius: 8, padding: 8 },
  historyStat: { flex: 1, alignItems: "center" },
  historyStatLabel: { fontSize: 10, color: COLORS.textSub, marginBottom: 2 },
  historyStatValue: { fontSize: 12, fontWeight: "700", color: COLORS.text },
});
