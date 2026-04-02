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
import { api, Post } from "../services/api";
import { useAuth } from "../context/AuthContext";
import PostCard from "../components/PostCard";

const COLORS = {
  primary: "#2E7D32",
  accent: "#FF6B35",
  bg: "#F8F9FA",
  card: "#FFFFFF",
  text: "#1A1A2E",
  muted: "#6C757D",
  border: "#E9ECEF",
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
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const fetchPosts = useCallback(async () => {
    try {
      const data = await api.getPosts();
      setPosts(data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    } catch (e) {
      console.error("Erreur chargement posts:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchPosts();
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission refusée", "Accès à la galerie requis.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      base64: true,
    });
    if (!result.canceled && result.assets[0].base64) {
      setSelectedImage(result.assets[0].base64);
    }
  };

  const handlePublish = async () => {
    if (!newContent.trim()) {
      Alert.alert("Erreur", "Écrivez quelque chose d'abord !");
      return;
    }
    if (!firebaseUser) {
      Alert.alert("Erreur", "Vous devez être connecté pour publier.");
      return;
    }
    setUploading(true);
    try {
      let imageUri: string | undefined;
      if (selectedImage) {
        const uploaded = await api.uploadImage(selectedImage, "quartierplus/posts");
        imageUri = uploaded.url;
      }
      await api.createPost({
        author_id: firebaseUser.uid,
        author_name: firebaseUser.displayName || "Voisin",
        author_avatar: firebaseUser.photoURL || undefined,
        content: newContent.trim(),
        category: newCategory,
        is_emergency: isEmergency,
        image_uri: imageUri,
      } as any);
      setNewContent("");
      setNewCategory("general");
      setIsEmergency(false);
      setSelectedImage(null);
      setModalVisible(false);
      fetchPosts();
    } catch (e: any) {
      Alert.alert("Erreur", e.message || "Publication échouée");
    } finally {
      setUploading(false);
    }
  };

  const filteredPosts = filter === "tous"
    ? posts
    : posts.filter((p) => p.category === filter || (filter === "urgence" && p.is_emergency));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>QuartierPlus</Text>
          <Text style={styles.headerSub}>
            {dbUser?.quartier || "Mon quartier"}
          </Text>
        </View>
        <TouchableOpacity style={styles.publishBtn} onPress={() => setModalVisible(true)}>
          <Text style={styles.publishBtnText}>+ Publier</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterBar}
        contentContainerStyle={styles.filterBarContent}
      >
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat.key}
            style={[styles.filterChip, filter === cat.key && styles.filterChipActive]}
            onPress={() => setFilter(cat.key)}
          >
            <Text style={[styles.filterChipText, filter === cat.key && styles.filterChipTextActive]}>
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filteredPosts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <PostCard post={item} onLiked={fetchPosts} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.primary} />}
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

      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nouvelle publication</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
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
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catPicker}>
              {CATEGORIES.filter((c) => c.key !== "tous").map((cat) => (
                <TouchableOpacity
                  key={cat.key}
                  style={[styles.catChip, newCategory === cat.key && styles.catChipActive]}
                  onPress={() => setNewCategory(cat.key)}
                >
                  <Text style={[styles.catChipText, newCategory === cat.key && styles.catChipTextActive]}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.optionsRow}>
              <TouchableOpacity style={styles.optionBtn} onPress={pickImage}>
                <Text style={styles.optionIcon}>📷</Text>
                <Text style={styles.optionLabel}>Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.optionBtn, isEmergency && styles.optionBtnDanger]}
                onPress={() => setIsEmergency(!isEmergency)}
              >
                <Text style={styles.optionIcon}>🚨</Text>
                <Text style={[styles.optionLabel, isEmergency && { color: "#D32F2F" }]}>Urgent</Text>
              </TouchableOpacity>
            </View>

            {selectedImage && (
              <View style={styles.imagePreviewContainer}>
                <Image
                  source={{ uri: `data:image/jpeg;base64,${selectedImage}` }}
                  style={styles.imagePreview}
                  resizeMode="cover"
                />
                <TouchableOpacity style={styles.removeImageBtn} onPress={() => setSelectedImage(null)}>
                  <Text style={{ color: "#fff", fontWeight: "700" }}>✕</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              style={[styles.submitBtn, (!newContent.trim() || uploading) && styles.submitBtnDisabled]}
              onPress={handlePublish}
              disabled={!newContent.trim() || uploading}
            >
              {uploading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.submitBtnText}>Publier</Text>
              )}
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
  publishBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  publishBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  filterBar: { maxHeight: 50 },
  filterBarContent: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: 8,
  },
  filterChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterChipText: { color: COLORS.muted, fontSize: 13, fontWeight: "600" },
  filterChipTextActive: { color: "#fff" },
  empty: { alignItems: "center", paddingTop: 80, paddingHorizontal: 40 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyText: { fontSize: 18, fontWeight: "700", color: COLORS.text, textAlign: "center" },
  emptySubText: { fontSize: 14, color: COLORS.muted, textAlign: "center", marginTop: 8 },
  modalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  modalCard: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: COLORS.text },
  closeBtn: { fontSize: 20, color: COLORS.muted },
  textarea: {
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: COLORS.text,
    minHeight: 100,
    textAlignVertical: "top",
    marginBottom: 16,
  },
  sectionLabel: { fontSize: 13, fontWeight: "700", color: COLORS.muted, marginBottom: 8 },
  catPicker: { marginBottom: 16 },
  catChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: COLORS.bg,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: 8,
  },
  catChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  catChipText: { color: COLORS.muted, fontWeight: "600", fontSize: 13 },
  catChipTextActive: { color: "#fff" },
  optionsRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  optionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: COLORS.bg,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  optionBtnDanger: { borderColor: "#D32F2F", backgroundColor: "#FFEBEE" },
  optionIcon: { fontSize: 18 },
  optionLabel: { fontSize: 13, fontWeight: "600", color: COLORS.text },
  imagePreviewContainer: { position: "relative", marginBottom: 16 },
  imagePreview: { width: "100%", height: 180, borderRadius: 12 },
  removeImageBtn: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
    borderRadius: 14,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  submitBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  submitBtnDisabled: { backgroundColor: "#A5D6A7" },
  submitBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
});
