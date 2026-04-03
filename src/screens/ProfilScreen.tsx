import React, { useState, useCallback } from "react";
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
  Switch,
  Linking,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "../context/AuthContext";
import { api } from "../services/api";

const COLORS = {
  primary: "#2E7D32",
  bg: "#F8F9FA",
  card: "#FFFFFF",
  text: "#1A1A2E",
  muted: "#6C757D",
  border: "#E9ECEF",
  danger: "#D32F2F",
};

export default function ProfilScreen() {
  const { firebaseUser, dbUser, signIn, signUp, logout, loading, refreshUser } = useAuth();
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState("");
  const [logoutModal, setLogoutModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [settingsModal, setSettingsModal] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  const [editForm, setEditForm] = useState({
    display_name: "",
    quartier: "",
    hometown: "",
    work: "",
    bio: "",
  });

  const notificationsOn = dbUser?.notifications_enabled !== false;
  const locationVisible = dbUser?.location_visible !== false;

  useFocusEffect(
    useCallback(() => {
      if (firebaseUser) refreshUser();
    }, [firebaseUser])
  );

  const openEditModal = () => {
    setEditForm({
      display_name: dbUser?.display_name || firebaseUser?.displayName || "",
      quartier: dbUser?.quartier || "",
      hometown: dbUser?.hometown || "",
      work: dbUser?.work || "",
      bio: dbUser?.bio || "",
    });
    setSettingsModal(false);
    setEditModal(true);
  };

  const handleSaveProfile = async () => {
    if (!firebaseUser) return;
    setAuthLoading(true);
    try {
      await fetch(`/api/users/firebase/${firebaseUser.uid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: editForm.display_name.trim(),
          quartier: editForm.quartier.trim(),
          hometown: editForm.hometown.trim(),
          work: editForm.work.trim(),
          bio: editForm.bio.trim(),
        }),
      });
      await refreshUser();
      setEditModal(false);
      Alert.alert("✅", "Profil mis à jour !");
    } catch (e: any) {
      Alert.alert("Erreur", e.message || "Impossible de sauvegarder.");
    } finally {
      setAuthLoading(false);
    }
  };

  const toggleNotifications = async (value: boolean) => {
    if (!firebaseUser) return;
    setSavingSettings(true);
    try {
      await api.updateUserSettings(firebaseUser.uid, { notifications_enabled: value });
      await refreshUser();
    } catch {
      Alert.alert("Erreur", "Impossible de mettre à jour les paramètres.");
    } finally {
      setSavingSettings(false);
    }
  };

  const toggleLocation = async (value: boolean) => {
    if (!firebaseUser) return;
    setSavingSettings(true);
    try {
      await api.updateUserSettings(firebaseUser.uid, { location_visible: value });
      await refreshUser();
    } catch {
      Alert.alert("Erreur", "Impossible de mettre à jour les paramètres.");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleContactAdmin = () => {
    const waUrl = "https://wa.me/+2250101010101?text=Bonjour%2C%20j%27ai%20besoin%20d%27aide%20sur%20QuartierPlus.";
    const mailUrl = "mailto:admin@quartierplus.app?subject=Support%20QuartierPlus";
    Alert.alert("Contacter l'Admin", "Choisissez votre mode de contact :", [
      { text: "WhatsApp", onPress: () => Linking.openURL(waUrl) },
      { text: "Email", onPress: () => Linking.openURL(mailUrl) },
      { text: "Annuler", style: "cancel" },
    ]);
  };

  const handlePickProfilePhoto = async () => {
    if (!firebaseUser) return;
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission refusée", "Autorisez l'accès à la galerie dans les réglages.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        base64: true,
        allowsEditing: true,
        aspect: [1, 1],
      });
      if (!result.canceled && result.assets[0]?.base64) {
        setPhotoUploading(true);
        try {
          const res = await fetch("/api/upload/profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ base64: result.assets[0].base64, user_id: firebaseUser.uid }),
          });
          if (!res.ok) throw new Error("Erreur upload");
          await refreshUser();
          Alert.alert("✅", "Photo de profil mise à jour !");
        } finally {
          setPhotoUploading(false);
        }
      }
    } catch (err: any) {
      setPhotoUploading(false);
      Alert.alert("Erreur", err.message || "Impossible de mettre à jour la photo.");
    }
  };

  const handleAuth = async () => {
    if (!email.trim() || !password.trim()) { setError("Veuillez remplir tous les champs."); return; }
    if (authMode === "register" && !displayName.trim()) { setError("Veuillez entrer votre prénom."); return; }
    setError("");
    setAuthLoading(true);
    try {
      if (authMode === "login") {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password, displayName.trim());
      }
    } catch (e: any) {
      const codes: Record<string, string> = {
        "auth/user-not-found": "Utilisateur introuvable",
        "auth/wrong-password": "Mot de passe incorrect",
        "auth/invalid-credential": "Email ou mot de passe incorrect",
        "auth/email-already-in-use": "Email déjà utilisé",
        "auth/weak-password": "Mot de passe trop court (6 caractères min)",
        "auth/invalid-email": "Email invalide",
      };
      setError(codes[e.code] || e.message || "Erreur de connexion");
    } finally {
      setAuthLoading(false);
    }
  };

  if (loading) {
    return <View style={styles.loadingContainer}><ActivityIndicator size="large" color={COLORS.primary} /></View>;
  }

  if (!firebaseUser) {
    return (
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView contentContainerStyle={styles.authContainer} keyboardShouldPersistTaps="handled">
          <View style={styles.authHeader}>
            <Text style={styles.authLogo}>🏘️</Text>
            <Text style={styles.authTitle}>QuartierPlus</Text>
            <Text style={styles.authSubtitle}>Rejoignez votre communauté de voisins</Text>
          </View>

          <View style={styles.authCard}>
            <View style={styles.tabRow}>
              {(["login", "register"] as const).map((mode) => (
                <TouchableOpacity key={mode} style={[styles.tab, authMode === mode && styles.tabActive]} onPress={() => { setAuthMode(mode); setError(""); }}>
                  <Text style={[styles.tabText, authMode === mode && styles.tabTextActive]}>{mode === "login" ? "Connexion" : "Inscription"}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {authMode === "register" && (
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Prénom & Nom</Text>
                <TextInput style={styles.input} placeholder="Ex: Marie Dupont" value={displayName} onChangeText={setDisplayName} autoCapitalize="words" placeholderTextColor={COLORS.muted} />
              </View>
            )}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput style={styles.input} placeholder="votre@email.com" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" placeholderTextColor={COLORS.muted} />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Mot de passe</Text>
              <TextInput style={styles.input} placeholder="••••••••" value={password} onChangeText={setPassword} secureTextEntry placeholderTextColor={COLORS.muted} />
            </View>

            {error ? <View style={styles.errorBox}><Text style={styles.errorText}>⚠️ {error}</Text></View> : null}

            <TouchableOpacity style={[styles.authBtn, authLoading && styles.authBtnDisabled]} onPress={handleAuth} disabled={authLoading}>
              {authLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.authBtnText}>{authMode === "login" ? "Se connecter" : "Créer mon compte"}</Text>}
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

  const displayNameText = dbUser?.display_name || firebaseUser.displayName || "Voisin";
  const profilePhoto = dbUser?.profile_photo || dbUser?.avatar || firebaseUser.photoURL;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 100 }}>

      {/* ─── Header profil avec bouton ··· ─── */}
      <View style={styles.profileHeader}>
        <TouchableOpacity style={styles.settingsBtn} onPress={() => setSettingsModal(true)}>
          <Text style={styles.settingsBtnText}>···</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.avatarContainer} onPress={handlePickProfilePhoto} disabled={photoUploading}>
          <View style={styles.avatarLarge}>
            {profilePhoto ? (
              <Image source={{ uri: profilePhoto }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarInitial}>{displayNameText[0].toUpperCase()}</Text>
            )}
            {photoUploading && (
              <View style={styles.avatarLoadingOverlay}>
                <ActivityIndicator color="#fff" />
              </View>
            )}
          </View>
          <View style={styles.avatarPlusBtn}>
            <Text style={styles.avatarPlusIcon}>+</Text>
          </View>
        </TouchableOpacity>

        <Text style={styles.profileName}>{displayNameText}</Text>
        <Text style={styles.profileEmail}>{firebaseUser.email}</Text>
        <View style={styles.badgesRow}>
          {dbUser?.is_verified && <View style={styles.verifiedBadge}><Text style={styles.verifiedText}>✓ Voisin vérifié</Text></View>}
          {dbUser?.is_premium && <View style={styles.premiumBadge}><Text style={styles.premiumText}>⭐ Premium</Text></View>}
          {notificationsOn && <View style={styles.notifBadge}><Text style={styles.notifBadgeText}>🔔 Notifs actives</Text></View>}
        </View>
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
          { icon: "👤", label: "Nom", value: displayNameText },
          { icon: "📧", label: "Email", value: firebaseUser.email || "" },
          { icon: "📍", label: "Quartier", value: dbUser?.quartier || "Non renseigné" },
          { icon: "🏠", label: "Ville natale", value: dbUser?.hometown || "Non renseigné" },
          { icon: "💼", label: "Travail", value: dbUser?.work || "Non renseigné" },
          { icon: "📝", label: "Bio", value: dbUser?.bio || "Non renseigné" },
        ].map((item, i) => (
          <View key={i} style={styles.infoRow}>
            <Text style={styles.infoIcon}>{item.icon}</Text>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>{item.label}</Text>
              <Text style={styles.infoValue} numberOfLines={2}>{item.value}</Text>
            </View>
          </View>
        ))}
      </View>

      <TouchableOpacity style={styles.logoutBtn} onPress={() => setLogoutModal(true)}>
        <Text style={styles.logoutIcon}>🚪</Text>
        <Text style={styles.logoutText}>Se déconnecter</Text>
      </TouchableOpacity>

      {/* ─── Modal Paramètres (···) ─── */}
      <Modal visible={settingsModal} animationType="slide" transparent onRequestClose={() => setSettingsModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSettingsModal(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.settingsCard} onPress={() => {}}>
            <View style={styles.settingsHandle} />
            <Text style={styles.settingsTitle}>Paramètres</Text>

            <TouchableOpacity style={styles.settingsItem} onPress={openEditModal}>
              <Text style={styles.settingsItemIcon}>✏️</Text>
              <Text style={styles.settingsItemLabel}>Modifier le profil</Text>
              <Text style={styles.settingsChevron}>›</Text>
            </TouchableOpacity>

            <View style={[styles.settingsItem, styles.settingsItemToggle]}>
              <Text style={styles.settingsItemIcon}>🔔</Text>
              <View style={styles.settingsItemInfo}>
                <Text style={styles.settingsItemLabel}>Notifications</Text>
                <Text style={styles.settingsItemSub}>{notificationsOn ? "Activées" : "Désactivées"}</Text>
              </View>
              {savingSettings ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <Switch
                  value={notificationsOn}
                  onValueChange={toggleNotifications}
                  trackColor={{ false: COLORS.border, true: "#A5D6A7" }}
                  thumbColor={notificationsOn ? COLORS.primary : COLORS.muted}
                />
              )}
            </View>

            <View style={[styles.settingsItem, styles.settingsItemToggle]}>
              <Text style={styles.settingsItemIcon}>📍</Text>
              <View style={styles.settingsItemInfo}>
                <Text style={styles.settingsItemLabel}>Ma position visible</Text>
                <Text style={styles.settingsItemSub}>{locationVisible ? "Visible par les voisins" : "Masquée"}</Text>
              </View>
              {savingSettings ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <Switch
                  value={locationVisible}
                  onValueChange={toggleLocation}
                  trackColor={{ false: COLORS.border, true: "#A5D6A7" }}
                  thumbColor={locationVisible ? COLORS.primary : COLORS.muted}
                />
              )}
            </View>

            <TouchableOpacity style={styles.settingsItem} onPress={handleContactAdmin}>
              <Text style={styles.settingsItemIcon}>📱</Text>
              <Text style={styles.settingsItemLabel}>Contacter l'Admin</Text>
              <Text style={styles.settingsChevron}>›</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.settingsItem, styles.settingsItemDanger]}
              onPress={() => { setSettingsModal(false); setTimeout(() => setLogoutModal(true), 300); }}
            >
              <Text style={styles.settingsItemIcon}>🚪</Text>
              <Text style={[styles.settingsItemLabel, { color: COLORS.danger }]}>Déconnexion</Text>
              <Text style={styles.settingsChevron}>›</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ─── Modal Modifier profil ─── */}
      <Modal visible={editModal} animationType="slide" transparent onRequestClose={() => setEditModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Modifier le profil</Text>
                <TouchableOpacity onPress={() => setEditModal(false)}>
                  <Text style={styles.closeBtn}>✕</Text>
                </TouchableOpacity>
              </View>

              {[
                { key: "display_name", label: "Nom complet", placeholder: "Votre nom", icon: "👤" },
                { key: "quartier", label: "Quartier", placeholder: "Ex: Cocody, Yopougon...", icon: "📍" },
                { key: "hometown", label: "Ville natale", placeholder: "Ex: Abidjan, Dakar...", icon: "🏠" },
                { key: "work", label: "Travail", placeholder: "Ex: Enseignant, Commerçant...", icon: "💼" },
                { key: "bio", label: "Biographie", placeholder: "Parlez de vous...", icon: "📝" },
              ].map((field) => (
                <View key={field.key} style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>{field.icon} {field.label}</Text>
                  <TextInput
                    style={[styles.input, field.key === "bio" && { height: 80, textAlignVertical: "top" }]}
                    placeholder={field.placeholder}
                    value={(editForm as any)[field.key]}
                    onChangeText={(v) => setEditForm((prev) => ({ ...prev, [field.key]: v }))}
                    multiline={field.key === "bio"}
                    placeholderTextColor={COLORS.muted}
                  />
                </View>
              ))}

              <TouchableOpacity
                style={[styles.authBtn, authLoading && styles.authBtnDisabled]}
                onPress={handleSaveProfile}
                disabled={authLoading}
              >
                {authLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.authBtnText}>Enregistrer</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ─── Modal Déconnexion ─── */}
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
  authCard: { backgroundColor: COLORS.card, marginHorizontal: 20, borderRadius: 20, padding: 24, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 5 },
  tabRow: { flexDirection: "row", backgroundColor: COLORS.bg, borderRadius: 12, padding: 4, marginBottom: 20 },
  tab: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: 10 },
  tabActive: { backgroundColor: COLORS.primary },
  tabText: { fontWeight: "700", color: COLORS.muted, fontSize: 14 },
  tabTextActive: { color: "#fff" },
  fieldGroup: { marginBottom: 14 },
  fieldLabel: { fontSize: 13, fontWeight: "700", color: COLORS.muted, marginBottom: 6 },
  input: { backgroundColor: COLORS.bg, borderRadius: 12, padding: 14, fontSize: 14, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border },
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
    alignItems: "center", paddingTop: 50, paddingBottom: 24, backgroundColor: COLORS.card,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
    position: "relative",
  },
  settingsBtn: {
    position: "absolute", top: 50, right: 16,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.bg, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: COLORS.border,
  },
  settingsBtnText: { fontSize: 20, color: COLORS.text, fontWeight: "800", letterSpacing: 1 },
  avatarContainer: { position: "relative", marginBottom: 14 },
  avatarLarge: { width: 100, height: 100, borderRadius: 50, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center", overflow: "hidden", borderWidth: 4, borderColor: "#E8F5E9" },
  avatarImg: { width: 100, height: 100, borderRadius: 50 },
  avatarInitial: { color: "#fff", fontSize: 40, fontWeight: "800" },
  avatarLoadingOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center" },
  avatarPlusBtn: { position: "absolute", bottom: 0, right: 0, width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: "#fff" },
  avatarPlusIcon: { color: "#fff", fontSize: 20, fontWeight: "700", lineHeight: 22 },
  profileName: { fontSize: 22, fontWeight: "800", color: COLORS.text },
  profileEmail: { fontSize: 13, color: COLORS.muted, marginTop: 4 },
  badgesRow: { flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap", justifyContent: "center", paddingHorizontal: 16 },
  verifiedBadge: { backgroundColor: "#E8F5E9", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4 },
  verifiedText: { color: COLORS.primary, fontWeight: "700", fontSize: 12 },
  premiumBadge: { backgroundColor: "#FFF9C4", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4 },
  premiumText: { color: "#F57F17", fontWeight: "700", fontSize: 12 },
  notifBadge: { backgroundColor: "#E3F2FD", borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4 },
  notifBadgeText: { color: "#1565C0", fontWeight: "700", fontSize: 12 },
  statsGrid: { flexDirection: "row", margin: 16, gap: 10 },
  statCard: { flex: 1, backgroundColor: COLORS.card, borderRadius: 14, padding: 14, alignItems: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2 },
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
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", margin: 16, padding: 16, backgroundColor: "#FFEBEE", borderRadius: 14, gap: 10 },
  logoutIcon: { fontSize: 20 },
  logoutText: { fontWeight: "700", color: "#C62828", fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  settingsCard: { backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 12, paddingBottom: 44 },
  settingsHandle: { width: 40, height: 4, backgroundColor: COLORS.border, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
  settingsTitle: { fontSize: 18, fontWeight: "800", color: COLORS.text, paddingHorizontal: 20, marginBottom: 8 },
  settingsItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  settingsItemToggle: { justifyContent: "space-between" },
  settingsItemDanger: { borderBottomWidth: 0 },
  settingsItemIcon: { fontSize: 22, marginRight: 14 },
  settingsItemInfo: { flex: 1 },
  settingsItemLabel: { fontSize: 15, fontWeight: "600", color: COLORS.text },
  settingsItemSub: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  settingsChevron: { fontSize: 22, color: COLORS.muted },
  modalCard: { backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 50 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: COLORS.text },
  closeBtn: { fontSize: 22, color: COLORS.muted, padding: 4 },
  confirmOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 40 },
  confirmCard: { backgroundColor: COLORS.card, borderRadius: 20, padding: 24, width: "100%" },
  confirmTitle: { fontSize: 20, fontWeight: "800", color: COLORS.text, textAlign: "center", marginBottom: 8 },
  confirmSub: { fontSize: 14, color: COLORS.muted, textAlign: "center", marginBottom: 24 },
  confirmBtn: { backgroundColor: "#D32F2F", borderRadius: 14, paddingVertical: 14, alignItems: "center", marginBottom: 10 },
  confirmBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  cancelBtn: { alignItems: "center", padding: 10 },
  cancelBtnText: { color: COLORS.muted, fontSize: 14 },
});
