import React, { useState, useEffect, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert,
  ActivityIndicator, RefreshControl, Modal,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { api, WithdrawalRequest } from "../../services/api";

const ADMIN_EMAIL = "administrateurquartierplus@gmail.com";

const C = {
  primary: "#2E7D32",
  danger: "#C62828",
  warning: "#F57F17",
  bg: "#F0F2F5",
  card: "#FFFFFF",
  text: "#1A1A1A",
  sub: "#6B7280",
  border: "#E5E7EB",
  pillPending: "#FFF3E0",
  pillPendingTxt: "#E65100",
  pillDone: "#E8F5E9",
  pillDoneTxt: "#1B5E20",
  pillReject: "#FFEBEE",
  pillRejectTxt: "#B71C1C",
};

type Filter = "pending" | "completed" | "all";

export default function GestionRetraitsScreen() {
  const navigation = useNavigation<any>();
  const [items, setItems] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("pending");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [resultModal, setResultModal] = useState<{ title: string; message: string; success: boolean } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const data = await api.getAdminWithdrawals(ADMIN_EMAIL);
      setItems(data);
    } catch (e: any) {
      Alert.alert("Erreur", e?.message || "Impossible de charger les retraits");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = () => { setRefreshing(true); fetchData(); };

  const isPending = (s: string) => s === "pending" || s === "awaiting_admin";
  const filtered = items.filter(i => filter === "all" ? true : filter === "pending" ? isPending(i.status) : i.status === "completed");
  const counts = {
    pending: items.filter(i => isPending(i.status)).length,
    completed: items.filter(i => i.status === "completed").length,
    all: items.length,
  };

  const handleConfirm = (item: WithdrawalRequest) => {
    Alert.alert(
      "Confirmer le retrait ?",
      `Envoyer ${item.amount?.toLocaleString()} FCFA à ${item.user_name || item.user_email} sur ${item.mobile_money_provider?.toUpperCase()} (${item.mobile_money}) ?\n\nLe portefeuille sera débité et l'utilisateur sera notifié.`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Confirmer",
          style: "default",
          onPress: async () => {
            setConfirming(item.id);
            try {
              const res = await api.confirmWithdrawal(item.id, ADMIN_EMAIL);
              const payout = res.payout || {};
              let payoutLine = "";
              if (payout.payoutId) payoutLine = `\nFedaPay payout ID : ${payout.payoutId}`;
              else if (payout.error) payoutLine = `\n⚠️ FedaPay : ${payout.error} — transfert manuel requis.`;
              else if (payout.reason) payoutLine = `\n${payout.reason}`;
              setResultModal({
                title: res.alreadyCompleted ? "Déjà complété" : "Retrait complété ✅",
                message: `${item.amount?.toLocaleString()} FCFA — Statut : Complété.${payoutLine}\n\n📲 L'utilisateur a été notifié.`,
                success: true,
              });
              fetchData();
            } catch (e: any) {
              setResultModal({ title: "Erreur", message: e?.message || "Échec de la confirmation", success: false });
            } finally {
              setConfirming(null);
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }: { item: WithdrawalRequest }) => {
    const itemPending = isPending(item.status);
    const isCompleted = item.status === "completed";
    const isRejected = item.status === "rejected";
    const pillStyle = isCompleted ? styles.pillDone : isRejected ? styles.pillReject : styles.pillPending;
    const pillTxt = isCompleted ? styles.pillDoneTxt : isRejected ? styles.pillRejectTxt : styles.pillPendingTxt;
    const pillLabel = isCompleted ? "Complété" : isRejected ? "Refusé" : "En attente";

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName} numberOfLines={1}>{item.user_name || "Utilisateur"}</Text>
            <Text style={styles.userEmail} numberOfLines={1}>{item.user_email || item.user_id}</Text>
          </View>
          <View style={[styles.pill, pillStyle]}>
            <Text style={[styles.pillLabel, pillTxt]}>{pillLabel}</Text>
          </View>
        </View>

        <View style={styles.amountRow}>
          <Text style={styles.amountLabel}>Montant</Text>
          <Text style={styles.amount}>{item.amount?.toLocaleString()} FCFA</Text>
        </View>

        <View style={styles.detailRow}>
          <Ionicons name="phone-portrait-outline" size={16} color={C.sub} />
          <Text style={styles.detailText}>
            {item.mobile_money_provider?.toUpperCase() || "—"} · {item.mobile_money || "Pas de numéro"}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Ionicons name="time-outline" size={16} color={C.sub} />
          <Text style={styles.detailText}>
            {item.created_at ? new Date(item.created_at).toLocaleString("fr-FR") : ""}
          </Text>
        </View>

        {item.description ? (
          <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
        ) : null}

        {itemPending && (
          <TouchableOpacity
            style={[styles.confirmBtn, confirming === item.id && styles.confirmBtnDisabled]}
            disabled={confirming === item.id}
            onPress={() => handleConfirm(item)}
            activeOpacity={0.85}
          >
            {confirming === item.id ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={styles.confirmBtnText}>Confirmer le Retrait</Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={26} color={C.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Gestion des Retraits</Text>
        <TouchableOpacity onPress={onRefresh} style={styles.backBtn}>
          <Ionicons name="refresh" size={22} color={C.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.tabs}>
        {(["pending", "completed", "all"] as Filter[]).map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.tab, filter === f && styles.tabActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.tabText, filter === f && styles.tabTextActive]}>
              {f === "pending" ? `En attente (${counts.pending})` : f === "completed" ? `Complétés (${counts.completed})` : `Tous (${counts.all})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[C.primary]} />}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="cash-outline" size={48} color={C.sub} />
              <Text style={styles.emptyText}>
                {filter === "pending" ? "Aucun retrait en attente." : filter === "completed" ? "Aucun retrait complété." : "Aucune demande de retrait."}
              </Text>
            </View>
          }
        />
      )}

      <Modal visible={!!resultModal} transparent animationType="fade" onRequestClose={() => setResultModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Ionicons name={resultModal?.success ? "checkmark-circle" : "alert-circle"} size={56} color={resultModal?.success ? C.primary : C.danger} />
            <Text style={styles.modalTitle}>{resultModal?.title}</Text>
            <Text style={styles.modalMessage}>{resultModal?.message}</Text>
            <TouchableOpacity style={styles.modalBtn} onPress={() => setResultModal(null)}>
              <Text style={styles.modalBtnText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 12,
    backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  backBtn: { padding: 4, width: 36, alignItems: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: C.text },
  tabs: { flexDirection: "row", backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
  tab: { flex: 1, paddingVertical: 12, alignItems: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabActive: { borderBottomColor: C.primary },
  tabText: { fontSize: 13, color: C.sub, fontWeight: "600" },
  tabTextActive: { color: C.primary },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  card: {
    backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: C.border,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
  userName: { fontSize: 15, fontWeight: "700", color: C.text },
  userEmail: { fontSize: 12, color: C.sub, marginTop: 2 },

  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  pillLabel: { fontSize: 11, fontWeight: "700" },
  pillPending: { backgroundColor: C.pillPending },
  pillPendingTxt: { color: C.pillPendingTxt },
  pillDone: { backgroundColor: C.pillDone },
  pillDoneTxt: { color: C.pillDoneTxt },
  pillReject: { backgroundColor: C.pillReject },
  pillRejectTxt: { color: C.pillRejectTxt },

  amountRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    backgroundColor: "#F8FAF8", padding: 10, borderRadius: 8, marginBottom: 8,
  },
  amountLabel: { fontSize: 13, color: C.sub, fontWeight: "600" },
  amount: { fontSize: 20, fontWeight: "800", color: C.primary },

  detailRow: { flexDirection: "row", alignItems: "center", gap: 8, marginVertical: 3 },
  detailText: { fontSize: 13, color: C.text },
  description: { fontSize: 12, color: C.sub, marginTop: 6, fontStyle: "italic" },

  confirmBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: C.primary, paddingVertical: 13, borderRadius: 10, marginTop: 12,
  },
  confirmBtnDisabled: { backgroundColor: "#A5D6A7" },
  confirmBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  emptyBox: { alignItems: "center", padding: 40, gap: 12 },
  emptyText: { fontSize: 14, color: C.sub, textAlign: "center" },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24 },
  modalCard: { backgroundColor: C.card, borderRadius: 14, padding: 24, alignItems: "center", width: "100%", maxWidth: 360 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: C.text, marginTop: 12, textAlign: "center" },
  modalMessage: { fontSize: 14, color: C.sub, textAlign: "center", marginTop: 8, lineHeight: 20 },
  modalBtn: { backgroundColor: C.primary, paddingVertical: 12, paddingHorizontal: 36, borderRadius: 8, marginTop: 18 },
  modalBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },
});
