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
import { api, Post } from "../services/api";
import { useAuth } from "../context/AuthContext";
import PostCard from "../components/PostCard";

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
    if (!newContent.trim()) {
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

      if (selectedMedia) {
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
        content: newContent.trim(),
        category: newCategory,
        is_emergency: isEmergency,
        image_uri: imageUri,
        video_uri: videoUri,
      } as any);

      setNewContent("");
      setNewCategory("general");
      setIsEmergency(false);
      setSelectedMedia(null);
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
  };

  const filteredPosts = filter === "tous"
    ? posts
    : filter === "urgence"
    ? posts.filter((p) => p.is_emergency || p.category === "urgence")
    : posts.filter((p) => p.category === filter);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>QuartierPlus</Text>
          <Text style={styles.headerSub}>{dbUser?.quartier || "Mon quartier"}</Text>
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
          renderItem={({ item }) => <PostCard post={item} onLiked={fetchPosts} />}
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

      {/* ─── Modal Nouvelle publication ─── */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={resetModal}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nouvelle publication</Text>
              <TouchableOpacity onPress={resetModal}>
                <Text style={styles.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.textarea}
              placeholder="Partagez quelque chose avec vos voisins..."
              multiline
              numberOfLines={4}
              value={newContent}
              onChangeText={setNewContent}
              placeholderTextColor={COLORS.muted}
            />

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

            <View style={styles.optionsRow}>
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
            </View>

            {selectedMedia && (
              <View style={styles.mediaPreviewContainer}>
                {selectedMedia.type === "image" ? (
                  <Image source={{ uri: selectedMedia.uri }} style={styles.mediaPreview} resizeMode="cover" />
                ) : (
                  <View style={styles.videoPreviewBox}>
                    <Text style={styles.videoPreviewIcon}>🎥</Text>
                    <Text style={styles.videoPreviewText}>Vidéo sélectionnée</Text>
                  </View>
                )}
                <TouchableOpacity style={styles.removeMediaBtn} onPress={() => setSelectedMedia(null)}>
                  <Text style={{ color: "#fff", fontWeight: "700" }}>✕</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              style={[styles.submitBtn, (!newContent.trim() || uploading) && styles.submitBtnDisabled]}
              onPress={handlePublish}
              disabled={!newContent.trim() || uploading}
            >
              {uploading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Publier</Text>}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
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
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: COLORS.text },
  closeBtn: { fontSize: 22, color: COLORS.muted, padding: 4 },
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
  videoPreviewBox: { backgroundColor: "#000", height: 120, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  videoPreviewIcon: { fontSize: 40 },
  videoPreviewText: { color: "#fff", marginTop: 8, fontWeight: "600" },
  removeMediaBtn: { position: "absolute", top: 8, right: 8, backgroundColor: "rgba(0,0,0,0.6)", borderRadius: 14, width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  submitBtn: { backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  submitBtnDisabled: { backgroundColor: "#A5D6A7" },
  submitBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
});
