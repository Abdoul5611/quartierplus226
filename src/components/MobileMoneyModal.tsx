import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { api } from "../services/api";

const COLORS = {
  primary: "#2E7D32",
  bg: "#F8FBF8",
  card: "#FFFFFF",
  text: "#1A1A2E",
  muted: "#6C757D",
  border: "#E9ECEF",
  orange: "#FF6D00",
  orangeLight: "#FFF3E0",
};

interface Country {
  code: string;
  name: string;
  flag: string;
  dialCode: string;
  operators: Operator[];
}

interface Operator {
  id: string;
  name: string;
  color: string;
  logo: string;
}

const COUNTRIES: Country[] = [
  {
    code: "BF", name: "Burkina Faso", flag: "🇧🇫", dialCode: "+226",
    operators: [
      { id: "orange-money-bf", name: "Orange Money", color: "#FF6600", logo: "🟠" },
      { id: "moov-bf", name: "Moov Money", color: "#0047AB", logo: "🔵" },
      { id: "coris-money-bf", name: "Coris Money", color: "#006400", logo: "🟢" },
    ],
  },
  {
    code: "CI", name: "Côte d'Ivoire", flag: "🇨🇮", dialCode: "+225",
    operators: [
      { id: "orange-money-ci", name: "Orange Money", color: "#FF6600", logo: "🟠" },
      { id: "mtn-ci", name: "MTN MoMo", color: "#FFCC00", logo: "🟡" },
      { id: "moov-ci", name: "Moov Money", color: "#0047AB", logo: "🔵" },
      { id: "wave-ci", name: "Wave", color: "#1A73E8", logo: "💙" },
    ],
  },
  {
    code: "ML", name: "Mali", flag: "🇲🇱", dialCode: "+223",
    operators: [
      { id: "orange-money-ml", name: "Orange Money", color: "#FF6600", logo: "🟠" },
      { id: "moov-ml", name: "Moov Money", color: "#0047AB", logo: "🔵" },
      { id: "wave-ml", name: "Wave", color: "#1A73E8", logo: "💙" },
    ],
  },
  {
    code: "NE", name: "Niger", flag: "🇳🇪", dialCode: "+227",
    operators: [
      { id: "orange-money-ne", name: "Orange Money", color: "#FF6600", logo: "🟠" },
      { id: "airtel-ne", name: "Airtel Money", color: "#E40000", logo: "🔴" },
    ],
  },
  {
    code: "SN", name: "Sénégal", flag: "🇸🇳", dialCode: "+221",
    operators: [
      { id: "orange-money-sn", name: "Orange Money", color: "#FF6600", logo: "🟠" },
      { id: "wave-sn", name: "Wave", color: "#1A73E8", logo: "💙" },
      { id: "free-money-sn", name: "Free Money", color: "#CC0000", logo: "🔴" },
    ],
  },
  {
    code: "TG", name: "Togo", flag: "🇹🇬", dialCode: "+228",
    operators: [
      { id: "t-money-tg", name: "T-Money", color: "#009900", logo: "🟢" },
      { id: "flooz-tg", name: "Flooz (Moov)", color: "#0047AB", logo: "🔵" },
    ],
  },
  {
    code: "BJ", name: "Bénin", flag: "🇧🇯", dialCode: "+229",
    operators: [
      { id: "mtn-bj", name: "MTN MoMo", color: "#FFCC00", logo: "🟡" },
      { id: "moov-bj", name: "Moov Money", color: "#0047AB", logo: "🔵" },
    ],
  },
  {
    code: "GN", name: "Guinée", flag: "🇬🇳", dialCode: "+224",
    operators: [
      { id: "orange-money-gn", name: "Orange Money", color: "#FF6600", logo: "🟠" },
    ],
  },
];

type Step = "form" | "waiting" | "success" | "error";

interface MobileMoneyModalProps {
  visible: boolean;
  userUid: string;
  userEmail: string;
  onClose: () => void;
  onSuccess: (amount: number, newBalance: number) => void;
}

export default function MobileMoneyModal({ visible, userUid, userEmail, onClose, onSuccess }: MobileMoneyModalProps) {
  const [country, setCountry] = useState<Country>(COUNTRIES[0]);
  const [operator, setOperator] = useState<Operator>(COUNTRIES[0].operators[0]);
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<Step>("form");
  const [fedapayTxId, setFedapayTxId] = useState<string | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!visible) {
      resetForm();
    }
  }, [visible]);

  const resetForm = () => {
    setStep("form");
    setPhone("");
    setAmount("");
    setFedapayTxId(null);
    setPollCount(0);
    if (pollRef.current) clearInterval(pollRef.current);
  };

  const selectCountry = (c: Country) => {
    setCountry(c);
    setOperator(c.operators[0]);
    setPhone("");
  };

  const handlePay = async () => {
    const amountNum = parseInt(amount, 10);
    if (!phone.trim() || phone.length < 6) {
      Alert.alert("Numéro invalide", "Entrez un numéro de téléphone valide.");
      return;
    }
    if (isNaN(amountNum) || amountNum < 100) {
      Alert.alert("Montant invalide", "Le montant minimum est 100 FCFA.");
      return;
    }

    setStep("waiting");
    try {
      const fullPhone = `${country.dialCode}${phone.replace(/^0+/, "")}`;
      const data = await api.initiateMobileMoneyPayment({
        userUid,
        userEmail,
        amount: amountNum,
        phoneNumber: fullPhone,
        countryCode: country.code,
        operatorId: operator.id,
      });
      setFedapayTxId(data.txId);
      startPolling(data.txId, amountNum);
    } catch (e: any) {
      setStep("error");
      Alert.alert("Erreur", e.message || "Impossible d'initier le paiement. Vérifiez votre connexion.");
    }
  };

  const startPolling = (txId: string, amountNum: number) => {
    let count = 0;
    pollRef.current = setInterval(async () => {
      count++;
      setPollCount(count);
      if (count > 24) {
        clearInterval(pollRef.current!);
        setStep("error");
        Alert.alert("Timeout", "Le paiement n'a pas été confirmé dans les temps. Réessayez.");
        return;
      }
      try {
        const data = await api.checkMMPaymentStatus(txId, userUid, amountNum);
        if (data.status === "approved") {
          clearInterval(pollRef.current!);
          setStep("success");
          onSuccess(amountNum, data.newBalance ?? 0);
        }
      } catch { }
    }, 5000);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={() => { if (step !== "waiting") onClose(); }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.overlay}>
        <View style={styles.sheet}>

          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>📱 Recharger par Mobile Money</Text>
            {step !== "waiting" && (
              <TouchableOpacity onPress={onClose}>
                <Text style={styles.closeBtn}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {step === "form" && (
            <ScrollView keyboardShouldPersistTaps="handled">
              {/* Sélection pays */}
              <Text style={styles.label}>Pays</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.countryRow}>
                {COUNTRIES.map((c) => (
                  <TouchableOpacity
                    key={c.code}
                    style={[styles.countryChip, country.code === c.code && styles.countryChipActive]}
                    onPress={() => selectCountry(c)}
                  >
                    <Text style={styles.countryFlag}>{c.flag}</Text>
                    <Text style={[styles.countryName, country.code === c.code && styles.countryNameActive]}>{c.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Sélection opérateur */}
              <Text style={styles.label}>Opérateur</Text>
              <View style={styles.operatorGrid}>
                {country.operators.map((op) => (
                  <TouchableOpacity
                    key={op.id}
                    style={[styles.operatorCard, operator.id === op.id && styles.operatorCardActive, { borderColor: op.color }]}
                    onPress={() => setOperator(op)}
                  >
                    <Text style={styles.operatorLogo}>{op.logo}</Text>
                    <Text style={[styles.operatorName, operator.id === op.id && { color: op.color }]}>{op.name}</Text>
                    {operator.id === op.id && <Text style={[styles.operatorCheck, { color: op.color }]}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </View>

              {/* Numéro de téléphone */}
              <Text style={styles.label}>Numéro Mobile Money</Text>
              <View style={styles.phoneRow}>
                <View style={styles.dialCode}>
                  <Text style={styles.dialCodeText}>{country.flag} {country.dialCode}</Text>
                </View>
                <TextInput
                  style={styles.phoneInput}
                  placeholder="XX XX XX XX"
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  maxLength={10}
                  placeholderTextColor={COLORS.muted}
                />
              </View>

              {/* Montant */}
              <Text style={styles.label}>Montant à recharger (FCFA)</Text>
              <View style={styles.amountRow}>
                {[500, 1000, 2000, 5000].map((v) => (
                  <TouchableOpacity
                    key={v}
                    style={[styles.amountChip, amount === String(v) && styles.amountChipActive]}
                    onPress={() => setAmount(String(v))}
                  >
                    <Text style={[styles.amountChipText, amount === String(v) && styles.amountChipTextActive]}>
                      {v.toLocaleString("fr-FR")}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={styles.amountInput}
                placeholder="Ou saisir un montant..."
                value={amount}
                onChangeText={setAmount}
                keyboardType="numeric"
                placeholderTextColor={COLORS.muted}
              />

              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  💡 Vous recevrez une notification USSD sur votre téléphone pour confirmer le paiement.
                  La recharge est créditée instantanément sur votre wallet QuartierPlus.
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.payBtn, (!phone || !amount) && styles.payBtnDisabled]}
                onPress={handlePay}
                disabled={!phone || !amount}
              >
                <Text style={styles.payBtnText}>
                  💸 Payer {amount ? parseInt(amount || "0").toLocaleString("fr-FR") + " FCFA" : ""} via {operator.name}
                </Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          {step === "waiting" && (
            <View style={styles.waitingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.waitingTitle}>⏳ En attente de confirmation</Text>
              <Text style={styles.waitingText}>
                Vérifiez votre téléphone et confirmez le paiement de{" "}
                <Text style={{ fontWeight: "800" }}>{parseInt(amount || "0").toLocaleString("fr-FR")} FCFA</Text>{" "}
                via <Text style={{ fontWeight: "800" }}>{operator.name}</Text>.
              </Text>
              <Text style={styles.waitingPhone}>📱 {country.dialCode}{phone}</Text>
              <View style={styles.progressDots}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <View key={i} style={[styles.dot, (pollCount % 5) === i && styles.dotActive]} />
                ))}
              </View>
              <Text style={styles.waitingHint}>Vérification automatique toutes les 5 secondes…</Text>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { if (pollRef.current) clearInterval(pollRef.current); resetForm(); onClose(); }}>
                <Text style={styles.cancelBtnText}>Annuler</Text>
              </TouchableOpacity>
            </View>
          )}

          {step === "success" && (
            <View style={styles.resultContainer}>
              <Text style={styles.resultIcon}>✅</Text>
              <Text style={styles.resultTitle}>Recharge réussie !</Text>
              <Text style={styles.resultText}>
                {parseInt(amount || "0").toLocaleString("fr-FR")} FCFA ont été ajoutés à votre wallet QuartierPlus.
              </Text>
              <TouchableOpacity style={styles.payBtn} onPress={() => { resetForm(); onClose(); }}>
                <Text style={styles.payBtnText}>Fermer</Text>
              </TouchableOpacity>
            </View>
          )}

          {step === "error" && (
            <View style={styles.resultContainer}>
              <Text style={styles.resultIcon}>❌</Text>
              <Text style={styles.resultTitle}>Paiement échoué</Text>
              <Text style={styles.resultText}>Le paiement n'a pas pu être confirmé. Vérifiez votre solde Mobile Money et réessayez.</Text>
              <TouchableOpacity style={[styles.payBtn, { backgroundColor: COLORS.primary }]} onPress={() => setStep("form")}>
                <Text style={styles.payBtnText}>Réessayer</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => { resetForm(); onClose(); }}>
                <Text style={styles.cancelBtnText}>Fermer</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: { backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 40, maxHeight: "90%" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 20, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  title: { fontSize: 17, fontWeight: "800", color: COLORS.text },
  closeBtn: { fontSize: 20, color: COLORS.muted, padding: 4 },
  label: { fontSize: 13, fontWeight: "700", color: COLORS.muted, marginTop: 16, marginBottom: 8, paddingHorizontal: 20 },
  countryRow: { paddingLeft: 20, marginBottom: 4 },
  countryChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: COLORS.border, marginRight: 8, backgroundColor: COLORS.bg },
  countryChipActive: { borderColor: COLORS.primary, backgroundColor: "#E8F5E9" },
  countryFlag: { fontSize: 18 },
  countryName: { fontSize: 12, fontWeight: "600", color: COLORS.muted },
  countryNameActive: { color: COLORS.primary },
  operatorGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: 20 },
  operatorCard: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.bg, minWidth: "44%" },
  operatorCardActive: { backgroundColor: COLORS.orangeLight },
  operatorLogo: { fontSize: 20 },
  operatorName: { fontSize: 12, fontWeight: "700", color: COLORS.text, flex: 1 },
  operatorCheck: { fontSize: 14, fontWeight: "800" },
  phoneRow: { flexDirection: "row", marginHorizontal: 20, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12, overflow: "hidden" },
  dialCode: { backgroundColor: COLORS.bg, paddingHorizontal: 12, justifyContent: "center", borderRightWidth: 1, borderRightColor: COLORS.border },
  dialCodeText: { fontSize: 13, fontWeight: "700", color: COLORS.text },
  phoneInput: { flex: 1, padding: 14, fontSize: 16, color: COLORS.text },
  amountRow: { flexDirection: "row", gap: 8, paddingHorizontal: 20, marginBottom: 10 },
  amountChip: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.border, alignItems: "center", backgroundColor: COLORS.bg },
  amountChipActive: { borderColor: COLORS.primary, backgroundColor: "#E8F5E9" },
  amountChipText: { fontSize: 13, fontWeight: "700", color: COLORS.muted },
  amountChipTextActive: { color: COLORS.primary },
  amountInput: { marginHorizontal: 20, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12, padding: 14, fontSize: 16, color: COLORS.text, marginBottom: 4 },
  infoBox: { marginHorizontal: 20, marginTop: 12, backgroundColor: "#E8F5E9", borderRadius: 12, padding: 12 },
  infoText: { fontSize: 12, color: COLORS.primary, lineHeight: 18 },
  payBtn: { marginHorizontal: 20, marginTop: 16, backgroundColor: "#FF6D00", borderRadius: 14, paddingVertical: 16, alignItems: "center" },
  payBtnDisabled: { backgroundColor: "#BDBDBD" },
  payBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  waitingContainer: { alignItems: "center", padding: 32, gap: 16 },
  waitingTitle: { fontSize: 18, fontWeight: "800", color: COLORS.text },
  waitingText: { fontSize: 14, color: COLORS.muted, textAlign: "center", lineHeight: 22 },
  waitingPhone: { fontSize: 16, fontWeight: "700", color: COLORS.primary },
  progressDots: { flexDirection: "row", gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.border },
  dotActive: { backgroundColor: COLORS.primary },
  waitingHint: { fontSize: 12, color: COLORS.muted },
  cancelBtn: { marginTop: 8, paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border },
  cancelBtnText: { color: COLORS.muted, fontWeight: "600", fontSize: 14 },
  resultContainer: { alignItems: "center", padding: 32, gap: 12 },
  resultIcon: { fontSize: 56 },
  resultTitle: { fontSize: 22, fontWeight: "800", color: COLORS.text },
  resultText: { fontSize: 14, color: COLORS.muted, textAlign: "center", lineHeight: 22 },
});
