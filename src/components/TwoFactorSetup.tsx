import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ScrollView,
  ActivityIndicator,
  Linking,
} from "react-native";
import { api } from "../services/api";

interface Props {
  visible: boolean;
  firebaseUid: string;
  userEmail: string;
  isAdmin: boolean;
  twoFactorEnabled: boolean;
  onClose: () => void;
}

const COLORS = {
  primary: "#2E7D32",
  danger: "#C62828",
  bg: "#F5F5F5",
  card: "#FFFFFF",
  text: "#212121",
  sub: "#757575",
  border: "#E0E0E0",
};

export default function TwoFactorSetup({ visible, firebaseUid, userEmail, isAdmin, twoFactorEnabled, onClose }: Props) {
  const [step, setStep] = useState<"menu" | "setup" | "verify" | "disable">("menu");
  const [secret, setSecret] = useState("");
  const [otpauthUrl, setOtpauthUrl] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);

  const handleClose = () => {
    setStep("menu");
    setSecret("");
    setOtpauthUrl("");
    setToken("");
    onClose();
  };

  const startSetup = async () => {
    setLoading(true);
    try {
      const { secret: s, otpauthUrl: url } = await api.setup2FA(firebaseUid);
      setSecret(s);
      setOtpauthUrl(url);
      setStep("setup");
    } catch (e: any) {
      Alert.alert("Erreur", e.message || "Impossible de configurer le 2FA");
    } finally {
      setLoading(false);
    }
  };

  const verifyToken = async () => {
    if (!token.trim() || token.length !== 6) {
      Alert.alert("Erreur", "Le code doit comporter 6 chiffres");
      return;
    }
    setLoading(true);
    try {
      await api.verify2FA(firebaseUid, token.trim());
      await api.toggle2FA(firebaseUid, true);
      Alert.alert("✅ 2FA Activé", "La double authentification est maintenant active sur votre compte.");
      handleClose();
    } catch (e: any) {
      Alert.alert("Code invalide", "Le code entré est incorrect ou expiré. Vérifiez votre application d'authentification.");
    } finally {
      setLoading(false);
    }
  };

  const disableConfirm = async () => {
    if (isAdmin) {
      Alert.alert("Interdit", "Le 2FA ne peut pas être désactivé pour le compte administrateur.");
      return;
    }
    setLoading(true);
    try {
      await api.toggle2FA(firebaseUid, false);
      Alert.alert("2FA Désactivé", "La double authentification a été désactivée.");
      handleClose();
    } catch (e: any) {
      Alert.alert("Erreur", e.message);
    } finally {
      setLoading(false);
    }
  };

  const openAuthenticatorApp = () => {
    Linking.openURL("https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2")
      .catch(() => Linking.openURL("https://apps.apple.com/app/google-authenticator/id388497605"));
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.box}>
          <View style={styles.handle} />
          <Text style={styles.title}>🔐 Double Authentification</Text>

          {step === "menu" && (
            <ScrollView bounces={false}>
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>
                  La double authentification (2FA) protège votre compte avec un code unique généré toutes les 30 secondes.
                </Text>
                {isAdmin && (
                  <View style={styles.adminBadge}>
                    <Text style={styles.adminBadgeText}>🛡️ Obligatoire pour le compte Administrateur</Text>
                  </View>
                )}
              </View>

              <View style={styles.statusBox}>
                <Text style={styles.statusLabel}>Statut actuel :</Text>
                <View style={[styles.statusBadge, { backgroundColor: twoFactorEnabled ? "#2E7D32" : "#757575" }]}>
                  <Text style={styles.statusBadgeText}>
                    {twoFactorEnabled ? "✓ Activé" : "✗ Désactivé"}
                  </Text>
                </View>
              </View>

              {!twoFactorEnabled ? (
                <TouchableOpacity style={styles.primaryBtn} onPress={startSetup} disabled={loading}>
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Activer le 2FA</Text>}
                </TouchableOpacity>
              ) : (
                <>
                  {!isAdmin && (
                    <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: COLORS.danger }]} onPress={() => setStep("disable")}>
                      <Text style={styles.primaryBtnText}>Désactiver le 2FA</Text>
                    </TouchableOpacity>
                  )}
                  {isAdmin && (
                    <View style={[styles.primaryBtn, { backgroundColor: "#E8F5E9" }]}>
                      <Text style={[styles.primaryBtnText, { color: COLORS.primary }]}>2FA permanent pour l'admin</Text>
                    </View>
                  )}
                </>
              )}

              <TouchableOpacity style={styles.cancelBtn} onPress={handleClose}>
                <Text style={styles.cancelBtnText}>Fermer</Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          {step === "setup" && (
            <ScrollView bounces={false}>
              <Text style={styles.stepTitle}>Étape 1 : Installez une application d'authentification</Text>
              <TouchableOpacity style={styles.linkBtn} onPress={openAuthenticatorApp}>
                <Text style={styles.linkBtnText}>📲 Télécharger Google Authenticator</Text>
              </TouchableOpacity>

              <Text style={styles.stepTitle}>Étape 2 : Entrez cette clé manuellement</Text>
              <View style={styles.secretBox}>
                <Text style={styles.secretKey} selectable>{secret}</Text>
                <Text style={styles.secretHint}>Nom du compte : QuartierPlus ({userEmail})</Text>
              </View>

              <Text style={styles.stepTitle}>Étape 3 : Entrez le code à 6 chiffres</Text>
              <TextInput
                style={styles.codeInput}
                value={token}
                onChangeText={setToken}
                placeholder="000000"
                keyboardType="number-pad"
                maxLength={6}
                textAlign="center"
              />

              <TouchableOpacity style={styles.primaryBtn} onPress={verifyToken} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Vérifier et Activer</Text>}
              </TouchableOpacity>

              <TouchableOpacity style={styles.cancelBtn} onPress={() => setStep("menu")}>
                <Text style={styles.cancelBtnText}>Retour</Text>
              </TouchableOpacity>
            </ScrollView>
          )}

          {step === "disable" && (
            <ScrollView bounces={false}>
              <View style={[styles.infoBox, { backgroundColor: "#FFEBEE" }]}>
                <Text style={[styles.infoText, { color: COLORS.danger }]}>
                  Êtes-vous sûr de vouloir désactiver le 2FA ? Votre compte sera moins sécurisé.
                </Text>
              </View>
              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: COLORS.danger }]} onPress={disableConfirm} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Confirmer la désactivation</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setStep("menu")}>
                <Text style={styles.cancelBtnText}>Annuler</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  box: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    maxHeight: "85%",
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 16,
    textAlign: "center",
  },
  infoBox: {
    backgroundColor: "#E8F5E9",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    gap: 8,
  },
  infoText: { fontSize: 14, color: COLORS.text, lineHeight: 20 },
  adminBadge: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    padding: 8,
    marginTop: 4,
  },
  adminBadgeText: { color: "#fff", fontSize: 13, fontWeight: "700", textAlign: "center" },
  statusBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  statusLabel: { fontSize: 15, color: COLORS.text, fontWeight: "600" },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statusBadgeText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  primaryBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 12,
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  cancelBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelBtnText: { color: COLORS.sub, fontWeight: "600", fontSize: 15 },
  stepTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 10,
    marginTop: 8,
  },
  linkBtn: {
    backgroundColor: "#E3F2FD",
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 16,
  },
  linkBtnText: { color: "#1565C0", fontWeight: "700", fontSize: 14 },
  secretBox: {
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  secretKey: {
    fontSize: 20,
    fontWeight: "800",
    color: COLORS.primary,
    letterSpacing: 2,
    textAlign: "center",
  },
  secretHint: { fontSize: 12, color: COLORS.sub, textAlign: "center" },
  codeInput: {
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderRadius: 12,
    padding: 16,
    fontSize: 28,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 16,
    letterSpacing: 8,
  },
});
