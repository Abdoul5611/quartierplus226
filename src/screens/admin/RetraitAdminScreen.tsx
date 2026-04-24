import React, { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  ActivityIndicator, RefreshControl, Modal, Alert, KeyboardAvoidingView, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";

const C = {
  primary: "#1B5E20",
  primaryLight: "#2E7D32",
  danger: "#C62828",
  warning: "#F57F17",
  bg: "#F0F2F5",
  card: "#FFFFFF",
  text: "#1A1A1A",
  sub: "#6B7280",
  border: "#E5E7EB",
};

type Provider = "mtn" | "moov" | "wave" | "orange";

const PROVIDERS: { id: Provider; label: string; color: string }[] = [
  { id: "mtn", label: "MTN MoMo", color: "#FFCC00" },
  { id: "moov", label: "Moov Money", color: "#0066B3" },
  { id: "wave", label: "Wave", color: "#1DC8E5" },
  { id: "orange", label: "Orange Money", color: "#FF7900" },
];

const SOURCE_LABELS: Record<string, { label: string; emoji: string }> = {
  withdrawal_commission: { label: "Commissions retraits", emoji: "🏦" },
  boost_revenue: { label: "Boosts annonces", emoji: "🚀" },
  course_commission: { label: "Course de Rue", emoji: "🏃" },
  loto_ticket: { label: "Tickets Loto", emoji: "🎰" },
  commission: { label: "Commissions (legacy)", emoji: "💼" },
  boost: { label: "Boost (legacy)", emoji: "📢" },
  other: { label: "Autres revenus", emoji: "✨" },
};

function fmtFCFA(n: number) {
  return `${(n || 0).toLocaleString("fr-FR")} FCFA`;
}

export default function RetraitAdminScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const adminEmail = user?.email || "";

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<Awaited<ReturnType<typeof api.getAdminBalance>> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState("");
  const [provider, setProvider] = useState<Provider>("mtn");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [resultModal, setResultModal] = useState<{
    visible: boolean;
    success: boolean;
    title: string;
    message: string;
    payoutId?: string;
  }>({ visible: false, success: false, title: "", message: "" });

  const loadBalance = useCallback(async () => {
    if (!adminEmail) return;
    try {
      setError(null);
      const d = await api.getAdminBalance(adminEmail);
      setData(d);
    } catch (e: any) {
      setError(e?.message || "Erreur de chargement du solde");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [adminEmail]);

  useEffect(() => { loadBalance(); }, [loadBalance]);

  const onRefresh = () => {
    setRefreshing(true);
    loadBalance();
  };

  const validateAndOpenConfirm = () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return Alert.alert("Montant invalide", "Veuillez saisir un montant valide.");
    }
    if (!data || amt > data.wallet_balance) {
      return Alert.alert("Solde insuffisant", `Votre solde est de ${fmtFCFA(data?.wallet_balance || 0)}.`);
    }
    if (!/^[0-9+]{8,15}$/.test(phone.replace(/\s/g, ""))) {
      return Alert.alert("Numéro invalide", "Veuillez saisir un numéro Mobile Money valide (8 à 15 chiffres).");
    }
    setConfirmVisible(true);
  };

  const submitWithdraw = async () => {
    setConfirmVisible(false);
    setSubmitting(true);
    try {
      const res = await api.adminWithdraw({
        email: adminEmail,
        amount: Number(amount),
        provider,
        phone: phone.replace(/\s/g, ""),
      });
      const payoutOk = res.payout?.ok;
      setAmount("");
      setPhone("");
      await loadBalance();
      setResultModal({
        visible: true,
        success: true,
        title: payoutOk ? "✅ Retrait effectué !" : "✅ Retrait enregistré",
        message: payoutOk
          ? `${fmtFCFA(Number(amount))} envoyé via ${PROVIDERS.find(p => p.id === provider)?.label}.\nNouveau solde : ${fmtFCFA(res.new_balance)}`
          : `${fmtFCFA(Number(amount))} débité de votre compte admin.\nLe paiement Mobile Money sera traité manuellement (${res.payout?.reason || "FedaPay non activé"}).\nNouveau solde : ${fmtFCFA(res.new_balance)}`,
        payoutId: res.payout?.payoutId,
      });
    } catch (e: any) {
      setResultModal({
        visible: true,
        success: false,
        title: "❌ Échec du retrait",
        message: e?.message || "Erreur inconnue",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={C.primary} />
          <Text style={styles.loadingTxt}>Chargement du solde admin…</Text>
        </View>
      </SafeAreaView>
    );
  }

  const balance = data?.wallet_balance ?? 0;
  const breakdown = data?.breakdown || {};
  const breakdownEntries = Object.entries(breakdown).sort((a, b) => b[1].total - a[1].total);

  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Retrait Admin</Text>
        <TouchableOpacity onPress={onRefresh} style={styles.refreshBtn}>
          <Ionicons name="refresh" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
          keyboardShouldPersistTaps="handled"
        >
          {error && (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color={C.danger} />
              <Text style={styles.errorTxt}>{error}</Text>
            </View>
          )}

          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>💰 Solde Admin Centralisé</Text>
            <Text style={styles.balanceValue}>{fmtFCFA(balance)}</Text>
            <Text style={styles.balanceSub}>
              Total déjà retiré : {fmtFCFA(data?.total_withdrawn || 0)}
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>📊 Répartition des gains</Text>
            {breakdownEntries.length === 0 ? (
              <Text style={styles.emptyTxt}>Aucun gain enregistré pour le moment.</Text>
            ) : (
              breakdownEntries.map(([key, v]) => {
                const meta = SOURCE_LABELS[key] || { label: key, emoji: "•" };
                return (
                  <View key={key} style={styles.breakdownRow}>
                    <Text style={styles.breakdownEmoji}>{meta.emoji}</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.breakdownLabel}>{meta.label}</Text>
                      <Text style={styles.breakdownCount}>{v.count} opération(s)</Text>
                    </View>
                    <Text style={styles.breakdownAmt}>{fmtFCFA(v.total)}</Text>
                  </View>
                );
              })
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>💸 Effectuer un Retrait</Text>

            <Text style={styles.fieldLabel}>Montant (FCFA)</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex : 5000"
              placeholderTextColor={C.sub}
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
              editable={!submitting}
            />
            <View style={styles.quickRow}>
              {[1000, 5000, 10000, balance].filter(v => v > 0 && v <= balance).map(v => (
                <TouchableOpacity key={v} style={styles.quickBtn} onPress={() => setAmount(String(v))}>
                  <Text style={styles.quickBtnTxt}>{v === balance ? "Tout" : v.toLocaleString("fr-FR")}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Opérateur Mobile Money</Text>
            <View style={styles.providerGrid}>
              {PROVIDERS.map(p => (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    styles.providerBtn,
                    provider === p.id && { borderColor: p.color, backgroundColor: p.color + "1A" },
                  ]}
                  onPress={() => setProvider(p.id)}
                  disabled={submitting}
                >
                  <View style={[styles.providerDot, { backgroundColor: p.color }]} />
                  <Text style={[styles.providerTxt, provider === p.id && { fontWeight: "700" }]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Numéro Mobile Money</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex : 96000000"
              placeholderTextColor={C.sub}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
              editable={!submitting}
            />

            <TouchableOpacity
              style={[styles.submitBtn, (submitting || balance <= 0) && { opacity: 0.5 }]}
              onPress={validateAndOpenConfirm}
              disabled={submitting || balance <= 0}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="cash" size={20} color="#fff" />
                  <Text style={styles.submitTxt}>Effectuer le Retrait</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.helperTxt}>
              Le montant sera débité immédiatement et envoyé via FedaPay si activé,
              sinon enregistré pour traitement manuel.
            </Text>
          </View>

          {data?.recent_withdrawals && data.recent_withdrawals.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>📜 Historique des retraits admin</Text>
              {data.recent_withdrawals.map((w: any) => (
                <View key={w.id} style={styles.histRow}>
                  <Ionicons
                    name={w.status === "completed" ? "checkmark-circle" : "time"}
                    size={18}
                    color={w.status === "completed" ? C.primary : C.warning}
                  />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={styles.histAmt}>{fmtFCFA(w.amount)}</Text>
                    <Text style={styles.histDesc}>
                      {(w.mobile_money_provider || "").toUpperCase()} {w.mobile_money} ·{" "}
                      {new Date(w.created_at).toLocaleString("fr-FR")}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Confirmation modal */}
      <Modal visible={confirmVisible} transparent animationType="fade" onRequestClose={() => setConfirmVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Confirmer le retrait ?</Text>
            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>Montant</Text>
              <Text style={styles.modalValue}>{fmtFCFA(Number(amount))}</Text>
            </View>
            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>Opérateur</Text>
              <Text style={styles.modalValue}>{PROVIDERS.find(p => p.id === provider)?.label}</Text>
            </View>
            <View style={styles.modalRow}>
              <Text style={styles.modalLabel}>Numéro</Text>
              <Text style={styles.modalValue}>{phone}</Text>
            </View>
            <View style={[styles.modalRow, { borderBottomWidth: 0, marginTop: 6 }]}>
              <Text style={styles.modalLabel}>Solde restant</Text>
              <Text style={[styles.modalValue, { color: C.primary }]}>
                {fmtFCFA(balance - Number(amount))}
              </Text>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, styles.modalCancel]} onPress={() => setConfirmVisible(false)}>
                <Text style={styles.modalCancelTxt}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalConfirm]} onPress={submitWithdraw}>
                <Text style={styles.modalConfirmTxt}>Confirmer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Result modal */}
      <Modal visible={resultModal.visible} transparent animationType="fade" onRequestClose={() => setResultModal(s => ({ ...s, visible: false }))}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={[styles.modalTitle, { color: resultModal.success ? C.primary : C.danger }]}>
              {resultModal.title}
            </Text>
            <Text style={styles.resultMsg}>{resultModal.message}</Text>
            {resultModal.payoutId && (
              <Text style={styles.payoutId}>Réf. paiement : {resultModal.payoutId}</Text>
            )}
            <TouchableOpacity
              style={[styles.modalBtn, styles.modalConfirm, { marginTop: 16 }]}
              onPress={() => setResultModal(s => ({ ...s, visible: false }))}
            >
              <Text style={styles.modalConfirmTxt}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  loadingBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingTxt: { color: C.sub, fontSize: 15 },
  header: {
    backgroundColor: C.primary, flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 12,
  },
  backBtn: { padding: 4 },
  refreshBtn: { padding: 4 },
  headerTitle: { flex: 1, color: "#fff", fontSize: 18, fontWeight: "700", marginLeft: 8 },
  scroll: { padding: 14, paddingBottom: 60 },
  errorBox: {
    flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FFEBEE",
    borderRadius: 10, padding: 12, marginBottom: 12,
  },
  errorTxt: { color: C.danger, flex: 1, fontSize: 13 },
  balanceCard: {
    backgroundColor: C.primary, borderRadius: 14, padding: 20, marginBottom: 14,
    alignItems: "center",
  },
  balanceLabel: { color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: "600", marginBottom: 6 },
  balanceValue: { color: "#fff", fontSize: 34, fontWeight: "800", letterSpacing: -0.5 },
  balanceSub: { color: "rgba(255,255,255,0.75)", fontSize: 12, marginTop: 8 },
  card: {
    backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: C.border,
  },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: C.text, marginBottom: 12 },
  emptyTxt: { color: C.sub, fontSize: 13, fontStyle: "italic", textAlign: "center", paddingVertical: 8 },
  breakdownRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: "#F3F4F6",
  },
  breakdownEmoji: { fontSize: 22, marginRight: 10 },
  breakdownLabel: { fontSize: 14, color: C.text, fontWeight: "600" },
  breakdownCount: { fontSize: 11, color: C.sub, marginTop: 2 },
  breakdownAmt: { fontSize: 14, color: C.primary, fontWeight: "700" },
  fieldLabel: { fontSize: 13, color: C.sub, fontWeight: "600", marginTop: 12, marginBottom: 6 },
  input: {
    borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12,
    fontSize: 15, backgroundColor: "#FAFAFA", color: C.text,
  },
  quickRow: { flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" },
  quickBtn: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: "#E8F5E9", borderWidth: 1, borderColor: C.primaryLight,
  },
  quickBtnTxt: { color: C.primary, fontSize: 12, fontWeight: "600" },
  providerGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  providerBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderWidth: 2, borderColor: C.border, borderRadius: 10, padding: 10,
    minWidth: "47%", backgroundColor: "#FAFAFA",
  },
  providerDot: { width: 12, height: 12, borderRadius: 6 },
  providerTxt: { fontSize: 13, color: C.text },
  submitBtn: {
    backgroundColor: C.primary, borderRadius: 12, padding: 14,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    marginTop: 18,
  },
  submitTxt: { color: "#fff", fontSize: 16, fontWeight: "700" },
  helperTxt: { color: C.sub, fontSize: 11, marginTop: 10, textAlign: "center", lineHeight: 16 },
  histRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: "#F3F4F6",
  },
  histAmt: { fontSize: 14, fontWeight: "700", color: C.text },
  histDesc: { fontSize: 11, color: C.sub, marginTop: 2 },
  modalBackdrop: {
    flex: 1, backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center", alignItems: "center", padding: 20,
  },
  modalCard: {
    backgroundColor: "#fff", borderRadius: 14, padding: 20, width: "100%", maxWidth: 380,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: C.text, marginBottom: 14, textAlign: "center" },
  modalRow: {
    flexDirection: "row", justifyContent: "space-between", paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: "#F3F4F6",
  },
  modalLabel: { fontSize: 13, color: C.sub },
  modalValue: { fontSize: 14, color: C.text, fontWeight: "600" },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 16 },
  modalBtn: { flex: 1, padding: 12, borderRadius: 10, alignItems: "center" },
  modalCancel: { backgroundColor: "#F3F4F6" },
  modalCancelTxt: { color: C.text, fontWeight: "600" },
  modalConfirm: { backgroundColor: C.primary },
  modalConfirmTxt: { color: "#fff", fontWeight: "700" },
  resultMsg: { fontSize: 14, color: C.text, textAlign: "center", lineHeight: 20 },
  payoutId: { fontSize: 11, color: C.sub, textAlign: "center", marginTop: 8, fontStyle: "italic" },
});
