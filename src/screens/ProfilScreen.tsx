import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  ScrollView,
  Image,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useAuth } from "../context/AuthContext";

const COLORS = {
  primary: "#2E7D32",
  accent: "#FF6B35",
  bg: "#F8F9FA",
  card: "#FFFFFF",
  text: "#1A1A2E",
  muted: "#6C757D",
  border: "#E9ECEF",
};

export default function ProfilScreen() {
  const { firebaseUser, dbUser, signIn, signUp, logout, loading } = useAuth();
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState("");
  const [logoutModal, setLogoutModal] = useState(false);

  const handleAuth = async () => {
    if (!email.trim() || !password.trim()) {
      setError("Veuillez remplir tous les champs.");
      return;
    }
    if (authMode === "register" && !displayName.trim()) {
      setError("Veuillez entrer votre prénom.");
      return;
    }
    setError("");
    setAuthLoading(true);
    try {
      if (authMode === "login") {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password, displayName.trim());
      }
    } catch (e: any) {
      const msg = e.code === "auth/user-not-found" ? "Utilisateur introuvable"
        : e.code === "auth/wrong-password" ? "Mot de passe incorrect"
        : e.code === "auth/email-already-in-use" ? "Email déjà utilisé"
        : e.code === "auth/weak-password" ? "Mot de passe trop court (6 caractères min)"
        : e.code === "auth/invalid-email" ? "Email invalide"
        : e.message || "Erreur de connexion";
      setError(msg);
    } finally {
      setAuthLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!firebaseUser) {
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView contentContainerStyle={styles.authContainer} keyboardShouldPersistTaps="handled">
          <View style={styles.authHeader}>
            <Text style={styles.authLogo}>🏘️</Text>
            <Text style={styles.authTitle}>QuartierPlus</Text>
            <Text style={styles.authSubtitle}>Rejoignez votre communauté de voisins</Text>
          </View>

          <View style={styles.authCard}>
            <View style={styles.tabRow}>
              <TouchableOpacity
                style={[styles.tab, authMode === "login" && styles.tabActive]}
                onPress={() => { setAuthMode("login"); setError(""); }}
              >
                <Text style={[styles.tabText, authMode === "login" && styles.tabTextActive]}>Connexion</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, authMode === "register" && styles.tabActive]}
                onPress={() => { setAuthMode("register"); setError(""); }}
              >
                <Text style={[styles.tabText, authMode === "register" && styles.tabTextActive]}>Inscription</Text>
              </TouchableOpacity>
            </View>

            {authMode === "register" && (
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Prénom & Nom</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex: Marie Dupont"
                  value={displayName}
                  onChangeText={setDisplayName}
                  autoCapitalize="words"
                  placeholderTextColor={COLORS.muted}
                />
              </View>
            )}

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="votre@email.com"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                placeholderTextColor={COLORS.muted}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Mot de passe</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="password"
                placeholderTextColor={COLORS.muted}
              />
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>⚠️ {error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.authBtn, authLoading && styles.authBtnDisabled]}
              onPress={handleAuth}
              disabled={authLoading}
            >
              {authLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.authBtnText}>
                  {authMode === "login" ? "Se connecter" : "Créer mon compte"}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.featuresBox}>
            {[
              { icon: "🤝", text: "Entraide entre voisins" },
              { icon: "🛒", text: "Marché du quartier" },
              { icon: "💬", text: "Discussions en temps réel" },
              { icon: "🗺️", text: "Carte interactive" },
            ].map((f, i) => (
              <View key={i} style={styles.featureRow}>
                <Text style={styles.featureIcon}>{f.icon}</Text>
                <Text style={styles.featureText}>{f.text}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  const displayNameText = firebaseUser.displayName || dbUser?.display_name || "Voisin";
  const initial = displayNameText[0].toUpperCase();

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>
      <View style={styles.profileHeader}>
        <View style={styles.avatarLarge}>
          {firebaseUser.photoURL ? (
            <Image source={{ uri: firebaseUser.photoURL }} style={styles.avatarImg} />
          ) : (
            <Text style={styles.avatarInitial}>{initial}</Text>
          )}
        </View>
        <Text style={styles.profileName}>{displayNameText}</Text>
        <Text style={styles.profileEmail}>{firebaseUser.email}</Text>
        {dbUser?.is_verified && (
          <View style={styles.verifiedBadge}>
            <Text style={styles.verifiedText}>✓ Voisin vérifié</Text>
          </View>
        )}
        {dbUser?.is_premium && (
          <View style={styles.premiumBadge}>
            <Text style={styles.premiumText}>⭐ Premium</Text>
          </View>
        )}
      </View>

      <View style={styles.statsGrid}>
        {[
          { label: "Points", value: dbUser?.points ?? 10, icon: "⭐" },
          { label: "Mercis", value: dbUser?.merci_count ?? 0, icon: "🙏" },
          { label: "Wallet", value: `${(dbUser?.wallet_balance ?? 0).toLocaleString()} F`, icon: "💰" },
        ].map((stat, i) => (
          <View key={i} style={styles.statCard}>
            <Text style={styles.statIcon}>{stat.icon}</Text>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Mon profil</Text>
        {[
          { icon: "📧", label: "Email", value: firebaseUser.email },
          { icon: "📍", label: "Quartier", value: dbUser?.quartier || "Non renseigné" },
          { icon: "🏠", label: "Ville natale", value: dbUser?.hometown || "Non renseigné" },
          { icon: "💼", label: "Travail", value: dbUser?.work || "Non renseigné" },
        ].map((item, i) => (
          <View key={i} style={styles.infoRow}>
            <Text style={styles.infoIcon}>{item.icon}</Text>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>{item.label}</Text>
              <Text style={styles.infoValue}>{item.value}</Text>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Actions rapides</Text>
        {[
          { icon: "✏️", label: "Modifier mon profil", action: () => {} },
          { icon: "🔔", label: "Notifications", action: () => {} },
          { icon: "🔒", label: "Confidentialité", action: () => {} },
          { icon: "❓", label: "Aide & Support", action: () => {} },
        ].map((item, i) => (
          <TouchableOpacity key={i} style={styles.menuItem} onPress={item.action} activeOpacity={0.7}>
            <Text style={styles.menuIcon}>{item.icon}</Text>
            <Text style={styles.menuLabel}>{item.label}</Text>
            <Text style={styles.menuChevron}>›</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={() => setLogoutModal(true)}>
        <Text style={styles.logoutIcon}>🚪</Text>
        <Text style={styles.logoutText}>Se déconnecter</Text>
      </TouchableOpacity>

      <Modal visible={logoutModal} transparent animationType="fade">
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Se déconnecter ?</Text>
            <Text style={styles.confirmSub}>Vous devrez vous reconnecter pour accéder à l'application.</Text>
            <TouchableOpacity style={styles.confirmBtn} onPress={async () => { await logout(); setLogoutModal(false); }}>
              <Text style={styles.confirmBtnText}>Se déconnecter</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setLogoutModal(false)}>
              <Text style={styles.cancelBtnText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  authContainer: { flexGrow: 1, paddingBottom: 40 },
  authHeader: { alignItems: "center", paddingTop: 60, paddingBottom: 30 },
  authLogo: { fontSize: 64, marginBottom: 12 },
  authTitle: { fontSize: 28, fontWeight: "800", color: COLORS.primary },
  authSubtitle: { fontSize: 14, color: COLORS.muted, marginTop: 6, textAlign: "center" },
  authCard: {
    backgroundColor: COLORS.card,
    marginHorizontal: 20,
    borderRadius: 20,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  tabRow: { flexDirection: "row", backgroundColor: COLORS.bg, borderRadius: 12, padding: 4, marginBottom: 20 },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 10 },
  tabActive: { backgroundColor: COLORS.primary },
  tabText: { fontWeight: "700", color: COLORS.muted, fontSize: 14 },
  tabTextActive: { color: "#fff" },
  fieldGroup: { marginBottom: 14 },
  fieldLabel: { fontSize: 13, fontWeight: "700", color: COLORS.muted, marginBottom: 6 },
  input: {
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  errorBox: { backgroundColor: "#FFEBEE", borderRadius: 10, padding: 12, marginBottom: 14 },
  errorText: { color: "#C62828", fontSize: 13, fontWeight: "600" },
  authBtn: { backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  authBtnDisabled: { backgroundColor: "#A5D6A7" },
  authBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  featuresBox: { margin: 20, padding: 20, backgroundColor: COLORS.card, borderRadius: 16 },
  featureRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  featureIcon: { fontSize: 24, marginRight: 14 },
  featureText: { fontSize: 14, color: COLORS.text, fontWeight: "600" },
  profileHeader: {
    alignItems: "center",
    paddingTop: 60,
    paddingBottom: 24,
    backgroundColor: COLORS.card,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  avatarLarge: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginBottom: 14,
    borderWidth: 4,
    borderColor: "#E8F5E9",
  },
  avatarImg: { width: 90, height: 90, borderRadius: 45 },
  avatarInitial: { color: "#fff", fontSize: 36, fontWeight: "800" },
  profileName: { fontSize: 22, fontWeight: "800", color: COLORS.text },
  profileEmail: { fontSize: 13, color: COLORS.muted, marginTop: 4 },
  verifiedBadge: { backgroundColor: "#E8F5E9", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4, marginTop: 8 },
  verifiedText: { color: COLORS.primary, fontWeight: "700", fontSize: 12 },
  premiumBadge: { backgroundColor: "#FFF9C4", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4, marginTop: 6 },
  premiumText: { color: "#F57F17", fontWeight: "700", fontSize: 12 },
  statsGrid: { flexDirection: "row", margin: 16, gap: 10 },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  statIcon: { fontSize: 24, marginBottom: 6 },
  statValue: { fontSize: 18, fontWeight: "800", color: COLORS.primary },
  statLabel: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  section: { margin: 16, backgroundColor: COLORS.card, borderRadius: 16, overflow: "hidden" },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: COLORS.muted, padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  infoRow: { flexDirection: "row", alignItems: "center", padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  infoIcon: { fontSize: 22, marginRight: 14 },
  infoContent: { flex: 1 },
  infoLabel: { fontSize: 12, color: COLORS.muted, fontWeight: "600" },
  infoValue: { fontSize: 14, color: COLORS.text, fontWeight: "600", marginTop: 2 },
  menuItem: { flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  menuIcon: { fontSize: 22, marginRight: 14 },
  menuLabel: { flex: 1, fontSize: 14, fontWeight: "600", color: COLORS.text },
  menuChevron: { fontSize: 22, color: COLORS.muted },
  logoutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    margin: 16,
    padding: 16,
    backgroundColor: "#FFEBEE",
    borderRadius: 14,
    gap: 10,
  },
  logoutIcon: { fontSize: 20 },
  logoutText: { fontWeight: "700", color: "#C62828", fontSize: 15 },
  confirmOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 40 },
  confirmCard: { backgroundColor: COLORS.card, borderRadius: 20, padding: 24, width: "100%" },
  confirmTitle: { fontSize: 20, fontWeight: "800", color: COLORS.text, textAlign: "center", marginBottom: 8 },
  confirmSub: { fontSize: 14, color: COLORS.muted, textAlign: "center", marginBottom: 24 },
  confirmBtn: { backgroundColor: "#D32F2F", borderRadius: 14, paddingVertical: 14, alignItems: "center", marginBottom: 10 },
  confirmBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  cancelBtn: { alignItems: "center", padding: 10 },
  cancelBtnText: { color: COLORS.muted, fontSize: 14 },
});
