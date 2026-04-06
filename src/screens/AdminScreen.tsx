import React, { useState, useEffect, useCallback } from "react";
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

const ADMIN_EMAIL = "administrateurquartierplus@gmail.com";
const COLORS = {
  primary: "#2E7D32",
  danger: "#C62828",
  warning: "#F57F17",
  success: "#2E7D32",
  bg: "#F5F5F5",
  card: "#FFFFFF",
  text: "#212121",
  sub: "#757575",
  border: "#E0E0E0",
};

type Tab = "withdrawals" | "help" | "merchants";

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

  const adminEmail = firebaseUser?.email || dbUser?.email || "";

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

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
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
    };
    const s = map[status] || { bg: COLORS.sub, label: status };
    return (
      <View style={[styles.badge, { backgroundColor: s.bg }]}>
        <Text style={styles.badgeText}>{s.label}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🛡️ Administration</Text>
        <Text style={styles.headerSub}>Tableau de bord sécurisé</Text>
      </View>

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "withdrawals" && styles.tabActive]}
          onPress={() => setActiveTab("withdrawals")}
        >
          <Text style={[styles.tabText, activeTab === "withdrawals" && styles.tabTextActive]}>
            💸 Retraits {pendingWithdrawals.length > 0 && `(${pendingWithdrawals.length})`}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "help" && styles.tabActive]}
          onPress={() => setActiveTab("help")}
        >
          <Text style={[styles.tabText, activeTab === "help" && styles.tabTextActive]}>
            🆘 Aide {openHelp.length > 0 && `(${openHelp.length})`}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "merchants" && styles.tabActive]}
          onPress={() => setActiveTab("merchants")}
        >
          <Text style={[styles.tabText, activeTab === "merchants" && styles.tabTextActive]}>
            🏪 Commerçants {pendingMerchants.length > 0 && `(${pendingMerchants.length})`}
          </Text>
        </TouchableOpacity>
      </View>

      {loading && !refreshing ? (
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
  headerSub: { fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 2 },
  tabs: {
    flexDirection: "row",
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
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
  content: { padding: 16, gap: 12 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 4,
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
});
