import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { api, User, Post } from "../services/api";

const COLORS = {
  primary: "#2E7D32",
  bg: "#F8F9FA",
  card: "#FFFFFF",
  text: "#1A1A2E",
  muted: "#6C757D",
  border: "#E9ECEF",
};

interface Props {
  visible: boolean;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  onClose: () => void;
}

export default function PublicProfilModal({ visible, authorId, authorName, authorAvatar, onClose }: Props) {
  const [user, setUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!visible || !authorId) return;
    setLoading(true);
    setUser(null);
    setPosts([]);

    Promise.all([
      api.getUserByFirebaseUid(authorId).catch(() => null),
      api.getPostsByAuthor(authorId).catch(() => []),
    ]).then(([u, p]) => {
      setUser(u);
      setPosts(p as Post[]);
    }).finally(() => setLoading(false));
  }, [visible, authorId]);

  const handleContact = () => {
    Alert.alert(
      `Contacter ${authorName}`,
      "Comment souhaitez-vous le contacter ?",
      [
        {
          text: "💬 Message dans le quartier",
          onPress: () => {
            onClose();
            Alert.alert("Messages", "Rendez-vous dans l'onglet Messages pour discuter avec vos voisins !");
          },
        },
        {
          text: "📱 WhatsApp",
          onPress: () => Linking.openURL(`https://wa.me/?text=Bonjour%20${encodeURIComponent(authorName)}%2C%20je%20vous%20contacte%20via%20QuartierPlus%20!`),
        },
        { text: "Annuler", style: "cancel" },
      ]
    );
  };

  const photo = user?.profile_photo || user?.avatar || authorAvatar;
  const displayName = user?.display_name || authorName;
  const initials = displayName[0]?.toUpperCase() ?? "?";

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "à l'instant";
    if (mins < 60) return `il y a ${mins}min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `il y a ${hrs}h`;
    return `il y a ${Math.floor(hrs / 24)}j`;
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* ── Header barre ── */}
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Profil du voisin</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
          {loading ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 80 }} />
          ) : (
            <>
              {/* ── Avatar + nom ── */}
              <View style={styles.profileHeader}>
                <View style={styles.avatarWrap}>
                  {photo ? (
                    <Image source={{ uri: photo }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatarFallback}>
                      <Text style={styles.avatarInitial}>{initials}</Text>
                    </View>
                  )}
                  {user?.is_verified && (
                    <View style={styles.verifiedBadge}>
                      <Text style={styles.verifiedText}>✓</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.profileName}>{displayName}</Text>
                {user?.quartier ? <Text style={styles.quartierText}>📍 {user.quartier}</Text> : null}
                <View style={styles.statsRow}>
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{user?.points ?? 0}</Text>
                    <Text style={styles.statLabel}>Points</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{user?.merci_count ?? 0}</Text>
                    <Text style={styles.statLabel}>Mercis</Text>
                  </View>
                  <View style={styles.statDivider} />
                  <View style={styles.statItem}>
                    <Text style={styles.statValue}>{posts.length}</Text>
                    <Text style={styles.statLabel}>Posts</Text>
                  </View>
                </View>
              </View>

              {/* ── Bouton Contacter ── */}
              <TouchableOpacity style={styles.contactBtn} onPress={handleContact}>
                <Text style={styles.contactBtnIcon}>💬</Text>
                <Text style={styles.contactBtnText}>Contacter {displayName.split(" ")[0]}</Text>
              </TouchableOpacity>

              {/* ── Infos ── */}
              {(user?.bio || user?.work || user?.hometown) ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>À propos</Text>
                  {user?.bio ? (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoIcon}>📝</Text>
                      <Text style={styles.infoValue}>{user.bio}</Text>
                    </View>
                  ) : null}
                  {user?.work ? (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoIcon}>💼</Text>
                      <Text style={styles.infoValue}>{user.work}</Text>
                    </View>
                  ) : null}
                  {user?.hometown ? (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoIcon}>🏠</Text>
                      <Text style={styles.infoValue}>{user.hometown}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {/* ── Publications ── */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  Publications ({posts.length})
                </Text>
                {posts.length === 0 ? (
                  <Text style={styles.emptyText}>Aucune publication pour le moment</Text>
                ) : (
                  posts.map((p) => (
                    <View key={p.id} style={styles.postItem}>
                      <View style={styles.postItemHeader}>
                        <View style={[styles.catBadge, { backgroundColor: getCategoryColor(p.category) }]}>
                          <Text style={styles.catText}>{getCategoryLabel(p.category)}</Text>
                        </View>
                        <Text style={styles.postTime}>{timeAgo(p.created_at)}</Text>
                      </View>
                      <Text style={styles.postContent} numberOfLines={3}>{p.content}</Text>
                      {p.image_uri ? (
                        <Image source={{ uri: p.image_uri }} style={styles.postThumb} resizeMode="cover" />
                      ) : null}
                    </View>
                  ))
                )}
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function getCategoryColor(cat: string) {
  const m: Record<string, string> = { general: "#4CAF50", urgence: "#F44336", evenement: "#2196F3", marche: "#FF9800", aide: "#9C27B0" };
  return m[cat] || "#607D8B";
}
function getCategoryLabel(cat: string) {
  const m: Record<string, string> = { general: "Général", urgence: "Urgence", evenement: "Événement", marche: "Marché", aide: "Aide" };
  return m[cat] || cat;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  topBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingTop: Platform.OS === "ios" ? 54 : 20, paddingBottom: 12,
    paddingHorizontal: 16, backgroundColor: COLORS.card,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  closeBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.bg, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: COLORS.border,
  },
  closeBtnText: { fontSize: 16, color: COLORS.text, fontWeight: "700" },
  topBarTitle: { fontSize: 16, fontWeight: "800", color: COLORS.text },
  profileHeader: { alignItems: "center", paddingTop: 32, paddingBottom: 24, backgroundColor: COLORS.card },
  avatarWrap: { position: "relative", marginBottom: 12 },
  avatar: { width: 96, height: 96, borderRadius: 48, borderWidth: 3, borderColor: "#E8F5E9" },
  avatarFallback: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center",
    borderWidth: 3, borderColor: "#E8F5E9",
  },
  avatarInitial: { color: "#fff", fontSize: 38, fontWeight: "800" },
  verifiedBadge: {
    position: "absolute", bottom: 2, right: 2,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: "#fff",
  },
  verifiedText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  profileName: { fontSize: 22, fontWeight: "800", color: COLORS.text, marginBottom: 4 },
  quartierText: { fontSize: 14, color: COLORS.muted, marginBottom: 16 },
  statsRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 32 },
  statItem: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 20, fontWeight: "800", color: COLORS.primary },
  statLabel: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  statDivider: { width: 1, height: 32, backgroundColor: COLORS.border, marginHorizontal: 16 },
  contactBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    marginHorizontal: 20, marginTop: 16, marginBottom: 4,
    backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 15,
  },
  contactBtnIcon: { fontSize: 20 },
  contactBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  section: { margin: 16, backgroundColor: COLORS.card, borderRadius: 16, overflow: "hidden", padding: 16 },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: COLORS.muted, marginBottom: 12 },
  infoRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 10, gap: 10 },
  infoIcon: { fontSize: 18 },
  infoValue: { flex: 1, fontSize: 14, color: COLORS.text, fontWeight: "500", lineHeight: 20 },
  emptyText: { fontSize: 14, color: COLORS.muted, textAlign: "center", paddingVertical: 20 },
  postItem: {
    borderTopWidth: 1, borderTopColor: COLORS.border,
    paddingTop: 14, marginTop: 12,
  },
  postItemHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  catBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  catText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  postTime: { fontSize: 11, color: COLORS.muted },
  postContent: { fontSize: 14, color: COLORS.text, lineHeight: 20, marginBottom: 8 },
  postThumb: { width: "100%", height: 140, borderRadius: 10 },
});
