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
import { api, MarcheItem } from "../services/api";
import { useAuth } from "../context/AuthContext";
import MarcheCard from "../components/MarcheCard";

const COLORS = {
  primary: "#2E7D32",
  bg: "#F8F9FA",
  card: "#FFFFFF",
  text: "#1A1A2E",
  muted: "#6C757D",
  border: "#E9ECEF",
};

const CATEGORIES = ["Alimentation", "Électronique", "Vêtements", "Mobilier", "Services", "Autre"];

export default function MarcheScreen() {
  const { firebaseUser, dbUser } = useAuth();
  const [items, setItems] = useState<MarcheItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [search, setSearch] = useState("");
  const [newItem, setNewItem] = useState({
    titre: "",
    description: "",
    prix: "",
    categorie: "",
    quartier: "",
  });
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<MarcheItem | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const data = await api.getMarche();
      setItems(data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    } catch (e) {
      console.error("Erreur marché:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      base64: true,
    });
    if (!result.canceled && result.assets[0].base64) {
      setSelectedImage(result.assets[0].base64);
    }
  };

  const handleCreate = async () => {
    if (!newItem.titre.trim()) {
      Alert.alert("Erreur", "Le titre est obligatoire.");
      return;
    }
    if (!firebaseUser) {
      Alert.alert("Connexion requise", "Connectez-vous pour vendre.");
      return;
    }
    setUploading(true);
    try {
      let imageUrl: string | undefined;
      if (selectedImage) {
        const uploaded = await api.uploadImage(selectedImage, "quartierplus/marche");
        imageUrl = uploaded.url;
      }
      await api.createMarcheItem({
        vendeur_id: firebaseUser.uid,
        titre: newItem.titre.trim(),
        description: newItem.description.trim() || undefined,
        prix: newItem.prix || undefined,
        categorie: newItem.categorie || undefined,
        quartier: newItem.quartier || dbUser?.quartier || undefined,
        image_url: imageUrl,
        disponible: true,
      } as any);
      setNewItem({ titre: "", description: "", prix: "", categorie: "", quartier: "" });
      setSelectedImage(null);
      setModalVisible(false);
      fetchItems();
    } catch (e: any) {
      Alert.alert("Erreur", e.message || "Impossible de publier l'annonce");
    } finally {
      setUploading(false);
    }
  };

  const filtered = items.filter(
    (i) =>
      i.titre.toLowerCase().includes(search.toLowerCase()) ||
      (i.description || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Marché Local</Text>
          <Text style={styles.headerSub}>{items.length} annonce{items.length !== 1 ? "s" : ""}</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => setModalVisible(true)}>
          <Text style={styles.addBtnText}>+ Vendre</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher un article..."
          value={search}
          onChangeText={setSearch}
          placeholderTextColor={COLORS.muted}
        />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          renderItem={({ item }) => <MarcheCard item={item} onPress={() => setSelected(item)} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchItems(); }} tintColor={COLORS.primary} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🛒</Text>
              <Text style={styles.emptyText}>Le marché est vide</Text>
              <Text style={styles.emptySubText}>Soyez le premier à mettre une annonce !</Text>
            </View>
          }
          contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 100, paddingTop: 8 }}
        />
      )}

      <Modal visible={!!selected} transparent animationType="fade">
        <View style={styles.detailOverlay}>
          <View style={styles.detailCard}>
            {selected?.image_url && (
              <Image source={{ uri: selected.image_url }} style={styles.detailImage} resizeMode="cover" />
            )}
            <View style={{ padding: 20 }}>
              <Text style={styles.detailTitle}>{selected?.titre}</Text>
              {selected?.description && (
                <Text style={styles.detailDesc}>{selected.description}</Text>
              )}
              <Text style={styles.detailPrix}>
                {selected?.prix ? `${Number(selected.prix).toLocaleString("fr-FR")} FCFA` : "Gratuit"}
              </Text>
              {selected?.quartier && (
                <Text style={styles.detailQuartier}>📍 {selected.quartier}</Text>
              )}
              <TouchableOpacity style={styles.contactBtn}>
                <Text style={styles.contactBtnText}>💬 Contacter le vendeur</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.closeDetailBtn} onPress={() => setSelected(null)}>
                <Text style={styles.closeDetailBtnText}>Fermer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <ScrollView>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Nouvelle annonce</Text>
                <TouchableOpacity onPress={() => setModalVisible(false)}>
                  <Text style={styles.closeBtn}>✕</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.imagePicker} onPress={pickImage}>
                {selectedImage ? (
                  <Image source={{ uri: `data:image/jpeg;base64,${selectedImage}` }} style={styles.pickedImage} resizeMode="cover" />
                ) : (
                  <>
                    <Text style={styles.imagePickerIcon}>📷</Text>
                    <Text style={styles.imagePickerText}>Ajouter une photo</Text>
                  </>
                )}
              </TouchableOpacity>

              {[
                { key: "titre", label: "Titre *", placeholder: "Que vendez-vous ?" },
                { key: "description", label: "Description", placeholder: "Décrivez l'article..." },
                { key: "prix", label: "Prix (FCFA)", placeholder: "Laisser vide si gratuit" },
                { key: "quartier", label: "Quartier", placeholder: dbUser?.quartier || "Votre quartier" },
              ].map((field) => (
                <View key={field.key} style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>{field.label}</Text>
                  <TextInput
                    style={[styles.input, field.key === "description" && { height: 80, textAlignVertical: "top" }]}
                    placeholder={field.placeholder}
                    value={(newItem as any)[field.key]}
                    onChangeText={(v) => setNewItem((prev) => ({ ...prev, [field.key]: v }))}
                    keyboardType={field.key === "prix" ? "numeric" : "default"}
                    multiline={field.key === "description"}
                    placeholderTextColor={COLORS.muted}
                  />
                </View>
              ))}

              <Text style={styles.fieldLabel}>Catégorie</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catPicker}>
                {CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.catChip, newItem.categorie === cat && styles.catChipActive]}
                    onPress={() => setNewItem((prev) => ({ ...prev, categorie: cat }))}
                  >
                    <Text style={[styles.catChipText, newItem.categorie === cat && styles.catChipTextActive]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity
                style={[styles.submitBtn, (!newItem.titre.trim() || uploading) && styles.submitBtnDisabled]}
                onPress={handleCreate}
                disabled={!newItem.titre.trim() || uploading}
              >
                {uploading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Publier l'annonce</Text>}
              </TouchableOpacity>
            </View>
          </ScrollView>
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
  addBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.card,
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, height: 44, fontSize: 14, color: COLORS.text },
  row: { justifyContent: "space-between" },
  empty: { alignItems: "center", paddingTop: 80 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyText: { fontSize: 18, fontWeight: "700", color: COLORS.text, textAlign: "center" },
  emptySubText: { fontSize: 14, color: COLORS.muted, textAlign: "center", marginTop: 8 },
  detailOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 },
  detailCard: { backgroundColor: COLORS.card, borderRadius: 20, overflow: "hidden" },
  detailImage: { width: "100%", height: 220 },
  detailTitle: { fontSize: 20, fontWeight: "800", color: COLORS.text, marginBottom: 8 },
  detailDesc: { fontSize: 14, color: COLORS.muted, marginBottom: 12, lineHeight: 22 },
  detailPrix: { fontSize: 22, fontWeight: "800", color: COLORS.primary, marginBottom: 8 },
  detailQuartier: { fontSize: 13, color: COLORS.muted, marginBottom: 16 },
  contactBtn: { backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 14, alignItems: "center", marginBottom: 10 },
  contactBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  closeDetailBtn: { alignItems: "center", paddingVertical: 10 },
  closeDetailBtnText: { color: COLORS.muted, fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 50 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: COLORS.text },
  closeBtn: { fontSize: 20, color: COLORS.muted },
  imagePicker: { backgroundColor: COLORS.bg, borderRadius: 14, height: 160, alignItems: "center", justifyContent: "center", marginBottom: 16, borderWidth: 2, borderColor: COLORS.border, borderStyle: "dashed", overflow: "hidden" },
  imagePickerIcon: { fontSize: 40, marginBottom: 8 },
  imagePickerText: { color: COLORS.muted, fontSize: 14 },
  pickedImage: { width: "100%", height: 160 },
  fieldGroup: { marginBottom: 14 },
  fieldLabel: { fontSize: 13, fontWeight: "700", color: COLORS.muted, marginBottom: 6 },
  input: { backgroundColor: COLORS.bg, borderRadius: 12, padding: 12, fontSize: 14, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border },
  catPicker: { marginBottom: 20 },
  catChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border, marginRight: 8 },
  catChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  catChipText: { color: COLORS.muted, fontWeight: "600", fontSize: 13 },
  catChipTextActive: { color: "#fff" },
  submitBtn: { backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  submitBtnDisabled: { backgroundColor: "#A5D6A7" },
  submitBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
});
