import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActionSheetIOS,
  ActivityIndicator,
  ScrollView,
  Image,
  KeyboardAvoidingView,
  Platform,
  Switch,
  Linking,
  Share,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";
import { useAuth } from "../context/AuthContext";
import { api, Post, Transaction } from "../services/api";

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
  const [photoKey, setPhotoKey] = useState<number>(Date.now());
  const [myPosts, setMyPosts] = useState<Post[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [rulesModal, setRulesModal] = useState(false);
  const [faqModal, setFaqModal] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [walletModal, setWalletModal] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [withdrawModal, setWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [adminModal, setAdminModal] = useState(false);
  const [adminData, setAdminData] = useState<any>(null);
  const [adminLoading, setAdminLoading] = useState(false);

  const ADMIN_EMAIL = "quartierplusadministrateur@gmail.com";
  const isAdmin = firebaseUser?.email === ADMIN_EMAIL;

  const [editForm, setEditForm] = useState({
    display_name: "",
    quartier: "",
    hometown: "",
    work: "",
    bio: "",
  });

  const notificationsOn = dbUser?.notifications_enabled !== false;
  const locationVisible = dbUser?.location_visible !== false;

  const loadMyPosts = useCallback(async () => {
    if (!firebaseUser) return;
    setPostsLoading(true);
    try {
      const data = await api.getPostsByAuthor(firebaseUser.uid);
      setMyPosts(data);
    } catch {
      setMyPosts([]);
    } finally {
      setPostsLoading(false);
    }
  }, [firebaseUser]);

  // ─── Forcer le chargement immédiat au montage (fix "Non renseigné") ───
  useEffect(() => {
    if (firebaseUser) {
      refreshUser().then(() => setPhotoKey(Date.now()));
      loadMyPosts();
    }
  }, [firebaseUser]);

  // ─── Rafraîchissement à chaque ouverture de l'onglet Profil ───────────
  useFocusEffect(
    useCallback(() => {
      if (firebaseUser) {
        refreshUser().then(() => setPhotoKey(Date.now()));
        loadMyPosts();
      }
    }, [firebaseUser, loadMyPosts])
  );

  // ─── Menu Paramètres (iOS: ActionSheet natif / Android+Web: Modal) ─────
  const openSettingsSheet = () => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [
            "Modifier le profil",
            "Inviter un voisin",
            "Signaler un abus",
            "Règles du quartier",
            "Aide / FAQ",
            "Contact Admin",
            "Supprimer mon compte",
            "Déconnexion",
            "Annuler",
          ],
          cancelButtonIndex: 8,
          destructiveButtonIndex: 6,
          title: "Paramètres",
        },
        (idx) => {
          if (idx === 0) openEditModal();
          if (idx === 1) handleInvite();
          if (idx === 2) handleReport();
          if (idx === 3) setRulesModal(true);
          if (idx === 4) setFaqModal(true);
          if (idx === 5) handleContactAdmin();
          if (idx === 6) setDeleteModal(true);
          if (idx === 7) setLogoutModal(true);
        }
      );
    } else {
      setSettingsModal(true);
    }
  };

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

  const handleInvite = async () => {
    try {
      await Share.share({
        title: "QuartierPlus — Rejoignez votre quartier !",
        message:
          "🏘️ Rejoignez QuartierPlus, l'appli qui connecte les voisins !\n" +
          "Discutez, achetez, vendez et entraidez-vous avec vos voisins.\n\n" +
          "👉 Téléchargez l'app : https://quartierplus.app",
      });
    } catch {}
  };

  const handleReport = () => {
    if (!firebaseUser) return;
    const userId = firebaseUser.uid;
    const userName = firebaseUser.displayName || dbUser?.display_name || "Inconnu";
    const waText = encodeURIComponent(
      `🚨 Signalement d'abus sur QuartierPlus\nUtilisateur : ${userName}\nID : ${userId}\nMotif : comportement abusif.`
    );
    const mailBody = encodeURIComponent(
      `Signalement d'abus\n\nUtilisateur : ${userName}\nID : ${userId}\n\nMotif : comportement abusif.`
    );
    Alert.alert("Signaler un abus", "Choisissez votre mode d'envoi :", [
      { text: "WhatsApp", onPress: () => Linking.openURL(`https://wa.me/+2250101010101?text=${waText}`) },
      { text: "Email", onPress: () => Linking.openURL(`mailto:admin@quartierplus.app?subject=Signalement%20abus&body=${mailBody}`) },
      { text: "Annuler", style: "cancel" },
    ]);
  };

  const handleDeleteAccount = async () => {
    if (!firebaseUser) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/users/firebase/${firebaseUser.uid}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erreur serveur");
      setDeleteModal(false);
      await logout();
      Alert.alert("✅ Compte supprimé", "Vos données ont été effacées. Au revoir !");
    } catch {
      Alert.alert("Erreur", "Impossible de supprimer le compte. Réessayez.");
    } finally {
      setDeleting(false);
    }
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
          setPhotoKey(Date.now());
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
        <TouchableOpacity style={styles.settingsBtn} onPress={openSettingsSheet}>
          <Text style={styles.settingsBtnText}>•••</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.avatarContainer} onPress={handlePickProfilePhoto} disabled={photoUploading}>
          <View style={styles.avatarLarge}>
            {profilePhoto ? (
              <Image
                key={photoKey}
                source={{ uri: `${profilePhoto}?v=${photoKey}` }}
                style={styles.avatarImg}
                defaultSource={undefined}
                onError={() => setPhotoKey(Date.now())}
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarInitial}>{displayNameText[0]?.toUpperCase() ?? "?"}</Text>
              </View>
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
          { label: "Points", value: dbUser?.points ?? 10, icon: "⭐", onPress: undefined },
          { label: "Mercis", value: dbUser?.merci_count ?? 0, icon: "🙏", onPress: undefined },
          { label: "Wallet", value: `${(dbUser?.wallet_balance ?? 0).toLocaleString()} F`, icon: "💰", onPress: async () => {
            setWalletModal(true);
            setTxLoading(true);
            try {
              const data = await api.getTransactions(firebaseUser.uid);
              setTransactions(data);
            } catch { setTransactions([]); }
            finally { setTxLoading(false); }
          }},
        ].map((stat, i) => (
          <TouchableOpacity key={i} style={styles.statCard} onPress={stat.onPress} activeOpacity={stat.onPress ? 0.7 : 1}>
            <Text style={styles.statIcon}>{stat.icon}</Text>
            <Text style={styles.statValue}>{stat.value}</Text>
            <Text style={styles.statLabel}>{stat.label}</Text>
          </TouchableOpacity>
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

      {isAdmin && (
        <TouchableOpacity
          style={styles.adminBtn}
          onPress={async () => {
            setAdminModal(true);
            setAdminLoading(true);
            try {
              const data = await api.getAdminDashboard(ADMIN_EMAIL);
              setAdminData(data);
            } catch (e: any) {
              Alert.alert("Erreur", e.message || "Impossible de charger le tableau de bord.");
            } finally {
              setAdminLoading(false);
            }
          }}
        >
          <Text style={styles.adminBtnIcon}>👑</Text>
          <Text style={styles.adminBtnText}>Tableau de Bord Admin</Text>
        </TouchableOpacity>
      )}

      {/* ─── Mes Publications ─── */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Mes publications ({myPosts.length})</Text>
        {postsLoading ? (
          <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 20 }} />
        ) : myPosts.length === 0 ? (
          <View style={styles.emptyPostsBox}>
            <Text style={styles.emptyPostsIcon}>📭</Text>
            <Text style={styles.emptyPostsText}>Aucune publication pour le moment</Text>
          </View>
        ) : (
          myPosts.map((p) => (
            <View key={p.id} style={styles.myPostItem}>
              <View style={styles.myPostHeader}>
                <View style={[styles.myPostCatBadge, { backgroundColor: getCatColor(p.category) }]}>
                  <Text style={styles.myPostCatText}>{getCatLabel(p.category)}</Text>
                </View>
                <Text style={styles.myPostTime}>{timeAgoStr(p.created_at)}</Text>
              </View>
              <Text style={styles.myPostContent} numberOfLines={3}>{p.content}</Text>
              {p.image_uri ? (
                <Image source={{ uri: p.image_uri }} style={styles.myPostThumb} resizeMode="cover" />
              ) : null}
              {p.video_uri ? (
                <View style={styles.myPostVideoTag}>
                  <Text style={styles.myPostVideoTagText}>📹 Vidéo</Text>
                </View>
              ) : null}
            </View>
          ))
        )}
      </View>

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

      {/* ─── Modal Paramètres (Android / Web) ─── */}
      <Modal visible={settingsModal} transparent animationType="slide" onRequestClose={() => setSettingsModal(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setSettingsModal(false)}>
          <View style={styles.settingsCard}>
            <View style={styles.settingsHandle} />
            <Text style={styles.settingsTitle}>Paramètres</Text>

            <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
              <TouchableOpacity style={styles.settingsItem} onPress={() => { setSettingsModal(false); openEditModal(); }}>
                <Text style={styles.settingsItemIcon}>✏️</Text>
                <View style={styles.settingsItemInfo}>
                  <Text style={styles.settingsItemLabel}>Modifier le profil</Text>
                  <Text style={styles.settingsItemSub}>Nom, quartier, bio...</Text>
                </View>
                <Text style={styles.settingsChevron}>›</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.settingsItem} onPress={() => { setSettingsModal(false); handleInvite(); }}>
                <Text style={styles.settingsItemIcon}>🤝</Text>
                <View style={styles.settingsItemInfo}>
                  <Text style={styles.settingsItemLabel}>Inviter un voisin</Text>
                  <Text style={styles.settingsItemSub}>Partager le lien de l'application</Text>
                </View>
                <Text style={styles.settingsChevron}>›</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.settingsItem} onPress={() => { setSettingsModal(false); handleReport(); }}>
                <Text style={styles.settingsItemIcon}>🚩</Text>
                <View style={styles.settingsItemInfo}>
                  <Text style={styles.settingsItemLabel}>Signaler un abus</Text>
                  <Text style={styles.settingsItemSub}>Envoyer un signalement à l'admin</Text>
                </View>
                <Text style={styles.settingsChevron}>›</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.settingsItem} onPress={() => { setSettingsModal(false); setRulesModal(true); }}>
                <Text style={styles.settingsItemIcon}>📋</Text>
                <View style={styles.settingsItemInfo}>
                  <Text style={styles.settingsItemLabel}>Règles du quartier</Text>
                  <Text style={styles.settingsItemSub}>Bonne conduite & charte</Text>
                </View>
                <Text style={styles.settingsChevron}>›</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.settingsItem} onPress={() => { setSettingsModal(false); setFaqModal(true); }}>
                <Text style={styles.settingsItemIcon}>❓</Text>
                <View style={styles.settingsItemInfo}>
                  <Text style={styles.settingsItemLabel}>Aide / FAQ</Text>
                  <Text style={styles.settingsItemSub}>Questions fréquentes</Text>
                </View>
                <Text style={styles.settingsChevron}>›</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.settingsItem} onPress={() => { setSettingsModal(false); handleContactAdmin(); }}>
                <Text style={styles.settingsItemIcon}>📱</Text>
                <View style={styles.settingsItemInfo}>
                  <Text style={styles.settingsItemLabel}>Contact Admin</Text>
                  <Text style={styles.settingsItemSub}>WhatsApp ou Email</Text>
                </View>
                <Text style={styles.settingsChevron}>›</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.settingsItem} onPress={() => { setSettingsModal(false); setLogoutModal(true); }}>
                <Text style={styles.settingsItemIcon}>🚪</Text>
                <View style={styles.settingsItemInfo}>
                  <Text style={styles.settingsItemLabel}>Déconnexion</Text>
                  <Text style={styles.settingsItemSub}>Quitter mon compte</Text>
                </View>
                <Text style={styles.settingsChevron}>›</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.settingsItem, styles.settingsItemDanger]} onPress={() => { setSettingsModal(false); setDeleteModal(true); }}>
                <Text style={styles.settingsItemIcon}>🗑️</Text>
                <View style={styles.settingsItemInfo}>
                  <Text style={[styles.settingsItemLabel, { color: COLORS.danger }]}>Supprimer mon compte</Text>
                  <Text style={styles.settingsItemSub}>Effacer toutes mes données</Text>
                </View>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ─── Modal Règles du quartier ─── */}
      <Modal visible={rulesModal} animationType="slide" onRequestClose={() => setRulesModal(false)}>
        <View style={styles.fullModalContainer}>
          <View style={styles.fullModalHeader}>
            <TouchableOpacity onPress={() => setRulesModal(false)} style={styles.fullModalBack}>
              <Text style={styles.fullModalBackText}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.fullModalTitle}>📋 Règles du quartier</Text>
          </View>
          <ScrollView contentContainerStyle={styles.fullModalContent}>
            {[
              { num: "1", title: "Respect mutuel", body: "Traitez chaque voisin avec courtoisie et bienveillance. Les insultes, discriminations et propos haineux sont strictement interdits." },
              { num: "2", title: "Publications appropriées", body: "Partagez uniquement des contenus liés à la vie du quartier. Évitez les publicités non sollicitées, informations fausses ou contenus choquants." },
              { num: "3", title: "Confidentialité", body: "Ne partagez pas les informations personnelles d'autres voisins sans leur consentement explicite." },
              { num: "4", title: "Marché honnête", body: "Décrivez vos articles fidèlement. Toute arnaque ou tromperie entraîne la suspension du compte." },
              { num: "5", title: "Signalement", body: "En cas de comportement abusif, utilisez l'option 'Signaler un abus' pour alerter les administrateurs." },
              { num: "6", title: "Urgences", body: "La catégorie Urgences 🚨 est réservée aux situations réelles nécessitant une aide immédiate. Tout abus sera sanctionné." },
            ].map((rule) => (
              <View key={rule.num} style={styles.ruleCard}>
                <View style={styles.ruleNum}>
                  <Text style={styles.ruleNumText}>{rule.num}</Text>
                </View>
                <View style={styles.ruleBody}>
                  <Text style={styles.ruleTitle}>{rule.title}</Text>
                  <Text style={styles.ruleText}>{rule.body}</Text>
                </View>
              </View>
            ))}
            <View style={styles.ruleFooter}>
              <Text style={styles.ruleFooterText}>Le non-respect de ces règles peut entraîner la suspension ou la suppression de votre compte. Merci de contribuer à un quartier positif ! 🏘️</Text>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ─── Modal Aide / FAQ ─── */}
      <Modal visible={faqModal} animationType="slide" onRequestClose={() => setFaqModal(false)}>
        <View style={styles.fullModalContainer}>
          <View style={styles.fullModalHeader}>
            <TouchableOpacity onPress={() => setFaqModal(false)} style={styles.fullModalBack}>
              <Text style={styles.fullModalBackText}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.fullModalTitle}>❓ Aide / FAQ</Text>
          </View>
          <ScrollView contentContainerStyle={styles.fullModalContent}>
            {[
              {
                q: "Comment publier une vidéo ?",
                a: "Depuis l'accueil, appuyez sur le bouton 📹 dans le formulaire de publication. Choisissez une vidéo depuis votre galerie. Elle sera automatiquement uploadée et visible par vos voisins.",
              },
              {
                q: "Comment fonctionne le Wallet ?",
                a: "Le Wallet affiche votre solde de points QuartierPlus. Le système de paiement complet (transferts, achats) sera disponible prochainement. Restez connecté !",
              },
              {
                q: "Comment envoyer un message vocal ?",
                a: "Dans l'onglet Messages, appuyez longuement sur le bouton 🎤 pour commencer l'enregistrement, relâchez pour envoyer.",
              },
              {
                q: "Comment contacter un voisin ?",
                a: "Appuyez sur la photo de profil d'un voisin dans le fil d'actualité. Son profil s'ouvre avec un bouton 💬 Message et 📱 WhatsApp.",
              },
              {
                q: "Comment mettre à jour mon profil ?",
                a: "Allez dans l'onglet Profil → appuyez sur le bouton ••• en haut à droite → Modifier le profil.",
              },
              {
                q: "Comment signaler un problème ?",
                a: "Utilisez l'option 'Signaler un abus' dans le menu ••• ou contactez directement l'Admin via WhatsApp.",
              },
              {
                q: "Pourquoi mes données affichent 'Non renseigné' ?",
                a: "Complétez votre profil via ••• → Modifier le profil. Renseignez votre quartier, ville natale et bio.",
              },
            ].map((item, i) => (
              <View key={i} style={styles.faqItem}>
                <Text style={styles.faqQ}>💬 {item.q}</Text>
                <Text style={styles.faqA}>{item.a}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>

      {/* ─── Modal Supprimer le compte ─── */}
      <Modal visible={deleteModal} transparent animationType="fade" onRequestClose={() => setDeleteModal(false)}>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.deleteTitle}>🗑️ Supprimer mon compte</Text>
            <Text style={styles.deleteSub}>
              Cette action est <Text style={{ fontWeight: "800", color: COLORS.danger }}>irréversible</Text>.{"\n\n"}
              Toutes vos publications, annonces et données personnelles seront supprimées définitivement de nos serveurs.
            </Text>
            <TouchableOpacity
              style={[styles.confirmBtn, deleting && { backgroundColor: "#E57373" }]}
              onPress={handleDeleteAccount}
              disabled={deleting}
            >
              {deleting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.confirmBtnText}>Oui, supprimer mon compte</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setDeleteModal(false)} disabled={deleting}>
              <Text style={styles.cancelBtnText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </View>
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

      {/* ─── Modal Wallet ─── */}
      <Modal visible={walletModal} animationType="slide" transparent onRequestClose={() => setWalletModal(false)}>
        <View style={styles.walletOverlay}>
          <View style={styles.walletSheet}>
            <View style={styles.walletHeader}>
              <Text style={styles.walletTitle}>💰 Mon Wallet</Text>
              <TouchableOpacity onPress={() => setWalletModal(false)}>
                <Text style={styles.walletClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.walletBalanceBox}>
              <Text style={styles.walletBalanceLabel}>Solde disponible</Text>
              <Text style={styles.walletBalanceAmount}>{(dbUser?.wallet_balance ?? 0).toLocaleString("fr-FR")} FCFA</Text>
              <TouchableOpacity style={styles.walletWithdrawBtn} onPress={() => { setWithdrawModal(true); }}>
                <Text style={styles.walletWithdrawBtnText}>🏦 Faire un retrait</Text>
              </TouchableOpacity>
              <Text style={styles.walletCommissionNote}>Commission de 10% appliquée sur chaque retrait</Text>
            </View>
            <Text style={styles.walletTxTitle}>Historique des transactions</Text>
            {txLoading ? (
              <ActivityIndicator color={COLORS.primary} style={{ marginTop: 20 }} />
            ) : transactions.length === 0 ? (
              <Text style={styles.walletEmpty}>Aucune transaction pour le moment</Text>
            ) : (
              <ScrollView style={styles.walletTxList}>
                {transactions.map((tx) => {
                  const isDebit = tx.from_uid === firebaseUser?.uid;
                  const typeLabel: Record<string, string> = {
                    course_payment: "Cours payé",
                    prime_transfer: "Prime de partage",
                    withdrawal: "Retrait",
                    commission: "Commission admin",
                  };
                  return (
                    <View key={tx.id} style={styles.txRow}>
                      <View style={styles.txLeft}>
                        <Text style={styles.txType}>{typeLabel[tx.type] || tx.type}</Text>
                        <Text style={styles.txDesc} numberOfLines={1}>{tx.description || ""}</Text>
                        <Text style={styles.txDate}>{new Date(tx.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}</Text>
                      </View>
                      <Text style={[styles.txAmount, isDebit ? styles.txDebit : styles.txCredit]}>
                        {isDebit ? "-" : "+"}{(tx.amount).toLocaleString("fr-FR")} F
                      </Text>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ─── Modal Admin Dashboard ─── */}
      <Modal visible={adminModal} animationType="slide" onRequestClose={() => setAdminModal(false)}>
        <View style={styles.fullModalContainer}>
          <View style={styles.fullModalHeader}>
            <TouchableOpacity onPress={() => setAdminModal(false)} style={styles.fullModalBack}>
              <Text style={styles.fullModalBackText}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.fullModalTitle}>👑 Dashboard Admin</Text>
          </View>
          <ScrollView contentContainerStyle={styles.fullModalContent}>
            {adminLoading ? (
              <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
            ) : adminData ? (
              <>
                <Text style={styles.adminDashTitle}>Tableau de bord · QuartierPlus</Text>
                <Text style={styles.adminDashSub}>{adminData.user_count} utilisateurs inscrits · {adminData.transaction_count} transactions</Text>

                <View style={styles.adminStatsGrid}>
                  {[
                    { label: "Commissions totales", value: `${(adminData.total_commissions ?? 0).toLocaleString("fr-FR")} F`, icon: "💰", color: "#4CAF50" },
                    { label: "Comm. sur retraits", value: `${(adminData.commissions_by_withdrawal ?? 0).toLocaleString("fr-FR")} F`, icon: "🏦", color: "#2196F3" },
                    { label: "Cours payés", value: `${(adminData.total_course_payments ?? 0).toLocaleString("fr-FR")} F`, icon: "🎓", color: "#FF9800" },
                    { label: "Primes partagées", value: `${(adminData.total_primes ?? 0).toLocaleString("fr-FR")} F`, icon: "🎁", color: "#9C27B0" },
                    { label: "Total retraits", value: `${(adminData.total_withdrawals ?? 0).toLocaleString("fr-FR")} F`, icon: "📤", color: "#F44336" },
                  ].map((stat, i) => (
                    <View key={i} style={[styles.adminStatCard, { borderLeftColor: stat.color }]}>
                      <Text style={styles.adminStatIcon}>{stat.icon}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.adminStatValue}>{stat.value}</Text>
                        <Text style={styles.adminStatLabel}>{stat.label}</Text>
                      </View>
                    </View>
                  ))}
                </View>

                <Text style={styles.adminSectionTitle}>Transactions récentes</Text>
                {(adminData.recent_transactions ?? []).slice(0, 30).map((tx: Transaction) => {
                  const typeLabel: Record<string, string> = {
                    course_payment: "Cours payé",
                    prime_transfer: "Prime partage",
                    withdrawal: "Retrait",
                    commission: "Commission admin",
                  };
                  return (
                    <View key={tx.id} style={styles.adminTxRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.adminTxType}>{typeLabel[tx.type] || tx.type}</Text>
                        <Text style={styles.adminTxDesc} numberOfLines={1}>{tx.description || ""}</Text>
                        <Text style={styles.adminTxDate}>{new Date(tx.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}</Text>
                      </View>
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={styles.adminTxAmount}>{tx.amount.toLocaleString("fr-FR")} F</Text>
                        {(tx.commission ?? 0) > 0 && (
                          <Text style={styles.adminTxComm}>+{(tx.commission ?? 0).toLocaleString("fr-FR")} F comm.</Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </>
            ) : (
              <Text style={{ textAlign: "center", color: COLORS.muted, marginTop: 40 }}>Aucune donnée disponible</Text>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* ─── Modal Retrait ─── */}
      <Modal visible={withdrawModal} animationType="fade" transparent onRequestClose={() => setWithdrawModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.confirmOverlay}>
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>🏦 Retrait</Text>
            <Text style={styles.confirmSub}>
              Solde: {(dbUser?.wallet_balance ?? 0).toLocaleString("fr-FR")} FCFA{"\n"}
              Commission 10% déduite. Montant net = 90% du retrait.
            </Text>
            <TextInput
              style={styles.withdrawInput}
              value={withdrawAmount}
              onChangeText={setWithdrawAmount}
              keyboardType="numeric"
              placeholder="Montant à retirer (FCFA)"
              placeholderTextColor={COLORS.muted}
            />
            {withdrawAmount ? (
              <Text style={styles.withdrawNet}>
                Vous recevrez: {(parseInt(withdrawAmount || "0") * 0.9).toLocaleString("fr-FR")} FCFA
              </Text>
            ) : null}
            <TouchableOpacity
              style={[styles.confirmBtn, (!withdrawAmount || withdrawing) && { opacity: 0.6 }]}
              disabled={!withdrawAmount || withdrawing}
              onPress={async () => {
                const amount = parseInt(withdrawAmount);
                if (!amount || amount <= 0) return;
                setWithdrawing(true);
                try {
                  const result = await api.withdraw(firebaseUser!.uid, amount);
                  setWithdrawModal(false);
                  setWithdrawAmount("");
                  setWalletModal(false);
                  await refreshUser();
                  Alert.alert("✅ Retrait effectué", `Vous recevrez ${result.net.toLocaleString("fr-FR")} FCFA.\nCommission prélevée: ${result.commission.toLocaleString("fr-FR")} FCFA.`);
                } catch (e: any) {
                  Alert.alert("Erreur", e.message || "Impossible d'effectuer le retrait.");
                } finally {
                  setWithdrawing(false);
                }
              }}
            >
              {withdrawing ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmBtnText}>Confirmer le retrait</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => { setWithdrawModal(false); setWithdrawAmount(""); }}>
              <Text style={styles.cancelBtnText}>Annuler</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
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
  avatarPlaceholder: { width: 100, height: 100, borderRadius: 50, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
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
  emptyPostsBox: { alignItems: "center", paddingVertical: 28 },
  emptyPostsIcon: { fontSize: 36, marginBottom: 8 },
  emptyPostsText: { fontSize: 14, color: COLORS.muted },
  myPostItem: { padding: 16, borderTopWidth: 1, borderTopColor: COLORS.border },
  myPostHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  myPostCatBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  myPostCatText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  myPostTime: { fontSize: 11, color: COLORS.muted },
  myPostContent: { fontSize: 14, color: COLORS.text, lineHeight: 20, marginBottom: 8 },
  myPostThumb: { width: "100%", height: 140, borderRadius: 10 },
  myPostVideoTag: { backgroundColor: "#000", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start" },
  myPostVideoTagText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  walletOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  walletSheet: { backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 50, maxHeight: "85%" },
  walletHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  walletTitle: { fontSize: 20, fontWeight: "800", color: COLORS.text },
  walletClose: { fontSize: 22, color: COLORS.muted, padding: 4 },
  walletBalanceBox: { backgroundColor: COLORS.primary, borderRadius: 18, padding: 20, alignItems: "center", marginBottom: 20 },
  walletBalanceLabel: { color: "rgba(255,255,255,0.8)", fontSize: 13, fontWeight: "600", marginBottom: 4 },
  walletBalanceAmount: { color: "#fff", fontSize: 32, fontWeight: "900", marginBottom: 14 },
  walletWithdrawBtn: { backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 12, paddingVertical: 10, paddingHorizontal: 20, marginBottom: 8 },
  walletWithdrawBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  walletCommissionNote: { color: "rgba(255,255,255,0.7)", fontSize: 11, textAlign: "center" },
  walletTxTitle: { fontSize: 16, fontWeight: "700", color: COLORS.text, marginBottom: 12 },
  walletEmpty: { color: COLORS.muted, textAlign: "center", fontSize: 14, marginTop: 20, marginBottom: 20 },
  walletTxList: { maxHeight: 320 },
  txRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  txLeft: { flex: 1, marginRight: 12 },
  txType: { fontSize: 13, fontWeight: "700", color: COLORS.text },
  txDesc: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  txDate: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  txAmount: { fontSize: 15, fontWeight: "800" },
  txDebit: { color: "#D32F2F" },
  txCredit: { color: "#2E7D32" },
  withdrawInput: { backgroundColor: COLORS.bg, borderRadius: 12, padding: 12, fontSize: 16, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border, marginBottom: 8, textAlign: "center" },
  withdrawNet: { fontSize: 13, color: COLORS.primary, fontWeight: "600", textAlign: "center", marginBottom: 16 },
  fullModalContainer: { flex: 1, backgroundColor: COLORS.bg },
  fullModalHeader: {
    flexDirection: "row", alignItems: "center",
    paddingTop: Platform.OS === "ios" ? 54 : 20, paddingHorizontal: 16, paddingBottom: 16,
    backgroundColor: COLORS.card,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  fullModalBack: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.bg, alignItems: "center", justifyContent: "center", marginRight: 12 },
  fullModalBackText: { fontSize: 16, fontWeight: "700", color: COLORS.text },
  fullModalTitle: { fontSize: 18, fontWeight: "800", color: COLORS.text, flex: 1 },
  fullModalContent: { padding: 20, paddingBottom: 60 },
  ruleCard: { flexDirection: "row", backgroundColor: COLORS.card, borderRadius: 14, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  ruleNum: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center", marginRight: 14, flexShrink: 0 },
  ruleNumText: { color: "#fff", fontWeight: "800", fontSize: 14 },
  ruleBody: { flex: 1 },
  ruleTitle: { fontSize: 15, fontWeight: "800", color: COLORS.text, marginBottom: 6 },
  ruleText: { fontSize: 13, color: COLORS.muted, lineHeight: 20 },
  ruleFooter: { backgroundColor: "#E8F5E9", borderRadius: 14, padding: 16, marginTop: 8 },
  ruleFooterText: { fontSize: 13, color: COLORS.primary, fontWeight: "600", lineHeight: 20, textAlign: "center" },
  faqItem: { backgroundColor: COLORS.card, borderRadius: 14, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  faqQ: { fontSize: 15, fontWeight: "800", color: COLORS.text, marginBottom: 8 },
  faqA: { fontSize: 13, color: COLORS.muted, lineHeight: 20 },
  deleteTitle: { fontSize: 20, fontWeight: "800", color: COLORS.danger, textAlign: "center", marginBottom: 12 },
  deleteSub: { fontSize: 14, color: COLORS.muted, textAlign: "center", marginBottom: 24, lineHeight: 22 },
  adminBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", marginHorizontal: 16, marginBottom: 8, padding: 16, backgroundColor: "#1A237E", borderRadius: 14, gap: 10 },
  adminBtnIcon: { fontSize: 20 },
  adminBtnText: { fontWeight: "700", color: "#fff", fontSize: 15 },
  adminDashTitle: { fontSize: 20, fontWeight: "800", color: COLORS.text, marginBottom: 4 },
  adminDashSub: { fontSize: 13, color: COLORS.muted, marginBottom: 20 },
  adminStatsGrid: { gap: 10, marginBottom: 24 },
  adminStatCard: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.card, borderRadius: 14, padding: 16, gap: 14, borderLeftWidth: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  adminStatIcon: { fontSize: 28 },
  adminStatValue: { fontSize: 18, fontWeight: "800", color: COLORS.text },
  adminStatLabel: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  adminSectionTitle: { fontSize: 16, fontWeight: "800", color: COLORS.text, marginBottom: 12 },
  adminTxRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: COLORS.card, borderRadius: 12, padding: 14, marginBottom: 8 },
  adminTxType: { fontSize: 13, fontWeight: "700", color: COLORS.text },
  adminTxDesc: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  adminTxDate: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  adminTxAmount: { fontSize: 15, fontWeight: "800", color: COLORS.text },
  adminTxComm: { fontSize: 11, color: "#2E7D32", fontWeight: "700", marginTop: 2 },
});

function getCatColor(cat: string) {
  const m: Record<string, string> = { general: "#4CAF50", urgence: "#F44336", evenement: "#2196F3", marche: "#FF9800", aide: "#9C27B0" };
  return m[cat] || "#607D8B";
}
function getCatLabel(cat: string) {
  const m: Record<string, string> = { general: "Général", urgence: "Urgence", evenement: "Événement", marche: "Marché", aide: "Aide" };
  return m[cat] || cat;
}
function timeAgoStr(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "à l'instant";
  if (mins < 60) return `il y a ${mins}min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `il y a ${hrs}h`;
  return `il y a ${Math.floor(hrs / 24)}j`;
}
