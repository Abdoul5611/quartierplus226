import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Video, ResizeMode } from "expo-av";
import { useNavigation } from "@react-navigation/native";
import { api, Post } from "../services/api";
import { useAuth } from "../context/AuthContext";
import PostCard from "../components/PostCard";
import PublicProfilModal from "../components/PublicProfilModal";
import AdBanner from "../components/AdBanner";

const COLORS = {
  primary: "#2E7D32",
  bg: "#F8F9FA",
  card: "#FFFFFF",
  text: "#1A1A2E",
  muted: "#6C757D",
  border: "#E9ECEF",
  emergency: "#D32F2F",
};

const CATEGORIES = [
  { key: "tous", label: "Tous" },
  { key: "general", label: "Général" },
  { key: "evenement", label: "Événement" },
  { key: "aide", label: "Aide" },
  { key: "urgence", label: "Urgence" },
  { key: "marche", label: "Marché" },
];

export default function AccueilScreen() {
  const navigation = useNavigation();
  const { firebaseUser, dbUser } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState("tous");
  const [modalVisible, setModalVisible] = useState(false);
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("general");
  const [isEmergency, setIsEmergency] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<{ base64: string; type: "image" | "video"; uri: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [publicProfil, setPublicProfil] = useState<{ authorId: string; authorName: string; authorAvatar?: string } | null>(null);
  const [pollMode, setPollMode] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollChoices, setPollChoices] = useState(["Oui", "Non"]);
  const [coursMode, setCoursMode] = useState(false);
  const [coursPrice, setCoursPrice] = useState("");

  useEffect(() => {
    (async () => {
      if (Platform.OS === "web") return;
      try {
        const Location = await import("expo-location");
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== "granted") return;
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      } catch {
      }
    })();
  }, []);

  const fetchPosts = useCallback(async () => {
    try {
      const data = await api.getPosts();
      setPosts(data);
    } catch (e) {
      console.error("Erreur posts:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const pickMedia = async (type: "image" | "video" | "both") => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission refusée", "Autorisez l'accès à la galerie dans les réglages.");
        return;
      }
      const mediaTypes: ImagePicker.MediaType[] =
        type === "image" ? ["images"] : type === "video" ? ["videos"] : ["images", "videos"];

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes,
        quality: 0.7,
        base64: true,
        videoMaxDuration: 60,
      });

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const isVideo = asset.type === "video";
        if (!asset.base64) {
          Alert.alert("Erreur", "Impossible de lire le fichier. Réessayez.");
          return;
        }
        setSelectedMedia({
          base64: asset.base64,
          type: isVideo ? "video" : "image",
          uri: asset.uri,
        });
      }
    } catch (err) {
      Alert.alert("Erreur", "Impossible d'accéder à la galerie.");
    }
  };

  const handlePublish = async () => {
    if (pollMode) {
      if (!pollQuestion.trim()) { Alert.alert("", "Écrivez la question du sondage !"); return; }
      if (pollChoices.some((c) => !c.trim())) { Alert.alert("", "Renseignez tous les choix du sondage."); return; }
    } else if (!newContent.trim()) {
      Alert.alert("", "Écrivez quelque chose d'abord !");
      return;
    }
    if (!firebaseUser) {
      Alert.alert("Connexion requise", "Connectez-vous pour publier.");
      return;
    }
    setUploading(true);
    try {
      let imageUri: string | undefined;
      let videoUri: string | undefined;

      if (selectedMedia && !pollMode) {
        if (selectedMedia.type === "video") {
          const uploaded = await api.uploadVideo(selectedMedia.base64, "quartierplus/videos");
          videoUri = uploaded.url;
        } else {
          const uploaded = await api.uploadImage(selectedMedia.base64, "quartierplus/posts");
          imageUri = uploaded.url;
        }
      }

      await api.createPost({
        author_id: firebaseUser.uid,
        author_name: firebaseUser.displayName || dbUser?.display_name || "Voisin",
        author_avatar: firebaseUser.photoURL || dbUser?.profile_photo || undefined,
        content: pollMode ? pollQuestion.trim() : newContent.trim(),
        category: newCategory,
        is_emergency: isEmergency,
        image_uri: imageUri,
        video_uri: videoUri,
        latitude: userLocation?.latitude,
        longitude: userLocation?.longitude,
        poll_options: pollMode ? pollChoices.map((c) => ({ label: c.trim() })) : undefined,
        is_cours: coursMode,
        cours_price: coursMode ? (parseInt(coursPrice) || 0) : undefined,
      } as any);

      setNewContent("");
      setNewCategory("general");
      setIsEmergency(false);
      setSelectedMedia(null);
      setCoursMode(false);
      setCoursPrice("");
      setModalVisible(false);
      fetchPosts();
    } catch (e: any) {
      Alert.alert("Erreur", e.message || "Publication échouée. Réessayez.");
    } finally {
      setUploading(false);
    }
  };

  const resetModal = () => {
    setModalVisible(false);
    setNewContent("");
    setNewCategory("general");
    setIsEmergency(false);
    setSelectedMedia(null);
    setPollMode(false);
    setPollQuestion("");
    setPollChoices(["Oui", "Non"]);
    setCoursMode(false);
    setCoursPrice("");
  };

  const nowAcc = new Date();
  const filteredPosts = (filter === "tous"
    ? posts
    : filter === "urgence"
    ? posts.filter((p) => p.is_emergency || p.category === "urgence")
    : posts.filter((p) => p.category === filter)
  ).sort((a, b) => {
    const aB = a.is_boosted && a.boost_expires_at && new Date(a.boost_expires_at) > nowAcc ? 1 : 0;
    const bB = b.is_boosted && b.boost_expires_at && new Date(b.boost_expires_at) > nowAcc ? 1 : 0;
    return bB - aB;
  });

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>QuartierPlus</Text>
          <Text style={styles.headerSub}>
            {dbUser?.quartier || "Mon quartier"}
            {userLocation ? "  📍" : ""}
          </Text>
        </View>
        <TouchableOpacity style={styles.publishBtn} onPress={() => setModalVisible(true)}>
          <Text style={styles.publishBtnText}>+ Publier</Text>
        </TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={styles.filterBarContent}>
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat.key}
            style={[styles.filterChip, filter === cat.key && styles.filterChipActive]}
            onPress={() => setFilter(cat.key)}
          >
            <Text style={[styles.filterChipText, filter === cat.key && styles.filterChipTextActive]}>{cat.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={filteredPosts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <PostCard
              post={item}
              onLiked={fetchPosts}
              userLocation={userLocation}
              onAuthorPress={(authorId, authorName, authorAvatar) =>
                setPublicProfil({ authorId, authorName, authorAvatar })
              }
            />
          )}
          ListHeaderComponent={
            firebaseUser ? (
              <TouchableOpacity
                style={styles.pointsBanner}
                onPress={() => navigation.navigate("Portefeuille" as never)}
                activeOpacity={0.85}
              >
                <Text style={styles.pointsBannerIcon}>💰</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pointsBannerTitle}>
                    {(dbUser?.points ?? 0).toLocaleString("fr-FR")} pts · {Math.floor((dbUser?.points ?? 0) * 0.25)} FCFA
                  </Text>
                  <Text style={styles.pointsBannerSub}>Regardez des vidéos pour gagner des points →</Text>
                </View>
                <Text style={styles.pointsBannerArrow}>▶</Text>
              </TouchableOpacity>
            ) : null
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchPosts(); }} tintColor={COLORS.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🏘️</Text>
              <Text style={styles.emptyText}>Aucune publication pour le moment</Text>
              <Text style={styles.emptySubText}>Soyez le premier à partager avec vos voisins !</Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 100 }}
        />
      )}

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={resetModal}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nouvelle publication</Text>
              <TouchableOpacity onPress={resetModal}>
                <Text style={styles.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>

            {userLocation && (
              <View style={styles.locationBadge}>
                <Text style={styles.locationBadgeText}>📍 Position GPS capturée — distance visible par les voisins</Text>
              </View>
            )}

            <Text style={styles.sectionLabel}>Catégorie</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {CATEGORIES.filter((c) => c.key !== "tous").map((cat) => (
                <TouchableOpacity
                  key={cat.key}
                  style={[styles.catChip, newCategory === cat.key && styles.catChipActive]}
                  onPress={() => setNewCategory(cat.key)}
                >
                  <Text style={[styles.catChipText, newCategory === cat.key && styles.catChipTextActive]}>{cat.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {!pollMode && (
              <TextInput
                style={styles.textarea}
                placeholder="Partagez quelque chose avec vos voisins..."
                multiline
                numberOfLines={4}
                value={newContent}
                onChangeText={setNewContent}
                placeholderTextColor={COLORS.muted}
              />
            )}

            {pollMode && (
              <View style={styles.pollBox}>
                <Text style={styles.pollBoxTitle}>📊 Sondage</Text>
                <TextInput
                  style={styles.pollQuestion}
                  placeholder="Votre question..."
                  value={pollQuestion}
                  onChangeText={setPollQuestion}
                  placeholderTextColor={COLORS.muted}
                  maxLength={140}
                />
                {pollChoices.map((choice, i) => (
                  <View key={i} style={styles.pollChoiceRow}>
                    <Text style={styles.pollChoiceNum}>{i + 1}</Text>
                    <TextInput
                      style={styles.pollChoiceInput}
                      placeholder={`Choix ${i + 1}...`}
                      value={choice}
                      onChangeText={(t) => {
                        const next = [...pollChoices];
                        next[i] = t;
                        setPollChoices(next);
                      }}
                      placeholderTextColor={COLORS.muted}
                      maxLength={60}
                    />
                  </View>
                ))}
                {pollChoices.length < 4 && (
                  <TouchableOpacity style={styles.addChoiceBtn} onPress={() => setPollChoices([...pollChoices, ""])}>
                    <Text style={styles.addChoiceBtnText}>+ Ajouter un choix</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <View style={styles.optionsRow}>
              {!pollMode && (
                <>
                  <TouchableOpacity style={styles.optionBtn} onPress={() => pickMedia("image")}>
                    <Text style={styles.optionIcon}>📷</Text>
                    <Text style={styles.optionLabel}>Photo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.optionBtn} onPress={() => pickMedia("video")}>
                    <Text style={styles.optionIcon}>🎥</Text>
                    <Text style={styles.optionLabel}>Vidéo</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.optionBtn, isEmergency && styles.optionBtnDanger]}
                    onPress={() => setIsEmergency(!isEmergency)}
                  >
                    <Text style={styles.optionIcon}>🚨</Text>
                    <Text style={[styles.optionLabel, isEmergency && { color: COLORS.emergency }]}>Urgent</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.optionBtn, coursMode && { borderColor: "#F57F17", backgroundColor: "#FFF9C4" }]}
                    onPress={() => { setCoursMode(!coursMode); setCoursPrice(""); }}
                  >
                    <Text style={styles.optionIcon}>🎓</Text>
                    <Text style={[styles.optionLabel, coursMode && { color: "#F57F17" }]}>Cours</Text>
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity
                style={[styles.optionBtn, pollMode && { borderColor: "#2196F3", backgroundColor: "#E3F2FD" }]}
                onPress={() => { setPollMode(!pollMode); setSelectedMedia(null); setCoursMode(false); }}
              >
                <Text style={styles.optionIcon}>📊</Text>
                <Text style={[styles.optionLabel, pollMode && { color: "#1565C0" }]}>Sondage</Text>
              </TouchableOpacity>
            </View>

            {coursMode && !pollMode && (
              <View style={styles.coursBox}>
                <Text style={styles.coursBoxTitle}>🎓 Mode Cours payant</Text>
                <Text style={styles.coursBoxSub}>Les voisins devront payer pour accéder au contenu média de ce post</Text>
                <TextInput
                  style={styles.coursInput}
                  value={coursPrice}
                  onChangeText={setCoursPrice}
                  keyboardType="numeric"
                  placeholder="Prix du cours (FCFA)"
                  placeholderTextColor={COLORS.muted}
                />
                {coursPrice ? (
                  <Text style={styles.coursNote}>
                    Les élèves paieront {parseInt(coursPrice || "0").toLocaleString("fr-FR")} FCFA depuis leur wallet
                  </Text>
                ) : null}
              </View>
            )}

            {selectedMedia && !pollMode && (
              <View style={styles.mediaPreviewContainer}>
                {selectedMedia.type === "image" ? (
                  <Image source={{ uri: selectedMedia.uri }} style={styles.mediaPreview} resizeMode="cover" />
                ) : (
                  <View style={styles.videoPreviewBox}>
                    <Video
                      source={{ uri: selectedMedia.uri }}
                      style={{ width: "100%", height: "100%", borderRadius: 12 }}
                      resizeMode={ResizeMode.CONTAIN}
                      shouldPlay={false}
                      useNativeControls={true}
                    />
                    <View style={styles.videoPreviewLabel}>
                      <Text style={styles.videoPreviewText}>🎥 Vidéo sélectionnée</Text>
                    </View>
                  </View>
                )}
                <TouchableOpacity style={styles.removeMediaBtn} onPress={() => setSelectedMedia(null)}>
                  <Text style={{ color: "#fff", fontWeight: "700" }}>✕</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              style={[styles.submitBtn, ((!pollMode && !newContent.trim()) || (pollMode && !pollQuestion.trim()) || uploading) && styles.submitBtnDisabled]}
              onPress={handlePublish}
              disabled={(!pollMode && !newContent.trim()) || (pollMode && !pollQuestion.trim()) || uploading}
            >
              {uploading ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.submitBtnText}>
                    {selectedMedia?.type === "video" ? "Upload vidéo..." : "Publication..."}
                  </Text>
                </View>
              ) : (
                <Text style={styles.submitBtnText}>Publier</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <PublicProfilModal
        visible={!!publicProfil}
        authorId={publicProfil?.authorId ?? ""}
        authorName={publicProfil?.authorName ?? ""}
        authorAvatar={publicProfil?.authorAvatar}
        onClose={() => setPublicProfil(null)}
      />

      <AdBanner />
    </View>
  );
}

const styles = StyleSheet.create({
  pointsBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#1B5E20",
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  pointsBannerIcon: { fontSize: 26 },
  pointsBannerTitle: { fontSize: 14, fontWeight: "800", color: "#fff" },
  pointsBannerSub: { fontSize: 11, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  pointsBannerArrow: { fontSize: 18, color: "rgba(255,255,255,0.8)", fontWeight: "700" },
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 16,
    backgroundColor: COLORS.card,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  headerTitle: { fontSize: 22, fontWeight: "800", color: COLORS.primary },
  headerSub: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  publishBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  publishBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  filterBar: { maxHeight: 52 },
  filterBarContent: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border, marginRight: 8 },
  filterChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterChipText: { color: COLORS.muted, fontSize: 13, fontWeight: "600" },
  filterChipTextActive: { color: "#fff" },
  empty: { alignItems: "center", paddingTop: 80, paddingHorizontal: 40 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyText: { fontSize: 18, fontWeight: "700", color: COLORS.text, textAlign: "center" },
  emptySubText: { fontSize: 14, color: COLORS.muted, textAlign: "center", marginTop: 8 },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalCard: { backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 44 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: COLORS.text },
  closeBtn: { fontSize: 22, color: COLORS.muted, padding: 4 },
  locationBadge: { backgroundColor: "#E8F5E9", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 12 },
  locationBadgeText: { fontSize: 12, color: COLORS.primary, fontWeight: "600" },
  textarea: { backgroundColor: COLORS.bg, borderRadius: 12, padding: 14, fontSize: 15, color: COLORS.text, minHeight: 100, textAlignVertical: "top", marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
  sectionLabel: { fontSize: 13, fontWeight: "700", color: COLORS.muted, marginBottom: 8 },
  catChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border, marginRight: 8 },
  catChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  catChipText: { color: COLORS.muted, fontWeight: "600", fontSize: 13 },
  catChipTextActive: { color: "#fff" },
  optionsRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  optionBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: COLORS.bg, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: COLORS.border },
  optionBtnDanger: { borderColor: COLORS.emergency, backgroundColor: "#FFEBEE" },
  optionIcon: { fontSize: 18 },
  optionLabel: { fontSize: 13, fontWeight: "600", color: COLORS.text },
  mediaPreviewContainer: { position: "relative", marginBottom: 16 },
  mediaPreview: { width: "100%", height: 180, borderRadius: 12 },
  videoPreviewBox: { height: 160, borderRadius: 12, backgroundColor: "#000", overflow: "hidden", justifyContent: "flex-end" },
  videoPreviewLabel: { position: "absolute", bottom: 8, left: 8, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  videoPreviewText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  removeMediaBtn: { position: "absolute", top: 8, right: 8, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 14, width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  submitBtn: { backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  submitBtnDisabled: { backgroundColor: "#A5D6A7" },
  submitBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
  pollBox: { backgroundColor: "#EEF7FF", borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: "#90CAF9" },
  pollBoxTitle: { fontSize: 14, fontWeight: "800", color: "#1565C0", marginBottom: 10 },
  pollQuestion: { backgroundColor: "#fff", borderRadius: 10, padding: 10, fontSize: 14, color: COLORS.text, borderWidth: 1, borderColor: "#BBDEFB", marginBottom: 10 },
  pollChoiceRow: { flexDirection: "row", alignItems: "center", marginBottom: 8, gap: 8 },
  pollChoiceNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#1565C0", color: "#fff", fontWeight: "800", fontSize: 12, textAlign: "center", lineHeight: 24 },
  pollChoiceInput: { flex: 1, backgroundColor: "#fff", borderRadius: 10, padding: 9, fontSize: 14, color: COLORS.text, borderWidth: 1, borderColor: "#BBDEFB" },
  addChoiceBtn: { alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#BBDEFB", borderRadius: 8, marginTop: 4 },
  addChoiceBtnText: { color: "#1565C0", fontWeight: "700", fontSize: 13 },
  coursBox: { backgroundColor: "#FFF9C4", borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: "#F9A825" },
  coursBoxTitle: { fontSize: 14, fontWeight: "800", color: "#F57F17", marginBottom: 4 },
  coursBoxSub: { fontSize: 12, color: "#795548", marginBottom: 10 },
  coursInput: { backgroundColor: "#fff", borderRadius: 10, padding: 10, fontSize: 14, color: COLORS.text, borderWidth: 1, borderColor: "#F9A825" },
  coursNote: { fontSize: 12, color: "#2E7D32", fontWeight: "600", marginTop: 6 },
});
