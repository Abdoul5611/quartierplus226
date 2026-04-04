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
  Switch,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useNavigation } from "@react-navigation/native";
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
  const navigation = useNavigation<any>();
  const [items, setItems] = useState<MarcheItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [search, setSearch] = useState("");
  const [newItem, setNewItem] = useState({ titre: "", description: "", prix: "", categorie: "", quartier: "" });
  const [selectedImage, setSelectedImage] = useState<{ base64: string; uri: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<MarcheItem | null>(null);
  const [primePartage, setPrimePartage] = useState(false);
  const [primeAmount, setPrimeAmount] = useState("");

  const fetchItems = useCallback(async () => {
    try {
      const data = await api.getMarche();
      setItems(data);
    } catch (e) {
      console.error("Erreur marché:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const pickImage = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission refusée", "Autorisez l'accès à la galerie dans les réglages.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.75,
        base64: true,
      });
      if (!result.canceled && result.assets[0]?.base64) {
        setSelectedImage({ base64: result.assets[0].base64, uri: result.assets[0].uri });
      }
    } catch (err) {
      Alert.alert("Erreur", "Impossible d'accéder à la galerie.");
    }
  };

  const handleCreate = async () => {
    if (!newItem.titre.trim()) {
      Alert.alert("", "Le titre est obligatoire.");
      return;
    }
    if (!firebaseUser) {
      Alert.alert("Connexion requise", "Connectez-vous dans l'onglet Profil pour vendre.");
      return;
    }
    setUploading(true);
    try {
      let imageUrl: string | undefined;
      if (selectedImage) {
        const uploaded = await api.uploadImage(selectedImage.base64, "quartierplus/marche");
        imageUrl = uploaded.url;
      }
      await api.createMarcheItem({
        vendeur_id: firebaseUser.uid,
        vendeur_firebase_uid: firebaseUser.uid,
        titre: newItem.titre.trim(),
        description: newItem.description.trim() || undefined,
        prix: newItem.prix.trim() || undefined,
        categorie: newItem.categorie || undefined,
        quartier: newItem.quartier.trim() || dbUser?.quartier || undefined,
        image_url: imageUrl,
        disponible: true,
        prime_partage: primePartage,
        prime_amount: primePartage ? (parseInt(primeAmount) || 0) : 0,
      } as any);
      setNewItem({ titre: "", description: "", prix: "", categorie: "", quartier: "" });
      setSelectedImage(null);
      setPrimePartage(false);
      setPrimeAmount("");
      setModalVisible(false);
      fetchItems();
      Alert.alert("✅", "Votre annonce a été publiée !");
    } catch (e: any) {
      Alert.alert("Erreur", e.message || "Impossible de publier l'annonce. Réessayez.");
    } finally {
      setUploading(false);
    }
  };

  const resetForm = () => {
    setNewItem({ titre: "", description: "", prix: "", categorie: "", quartier: "" });
    setSelectedImage(null);
    setModalVisible(false);
  };

  const filtered = items.filter(
    (i) =>
      i.titre.toLowerCase().includes(search.toLowerCase()) ||
      (i.description || "").toLowerCase().includes(search.toLowerCase()) ||
      (i.categorie || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Marché Local</Text>
          <Text style={styles.headerSub}>{filtered.length} annonce{filtered.length !== 1 ? "s" : ""}</Text>
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
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")}>
            <Text style={{ color: COLORS.muted, fontSize: 18, paddingHorizontal: 4 }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 60 }} />
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

      {/* ─── Détail produit ─── */}
      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <View style={styles.detailOverlay}>
          <View style={styles.detailCard}>
            {selected?.image_url ? (
              <Image source={{ uri: selected.image_url }} style={styles.detailImage} resizeMode="cover" />
            ) : (
              <View style={[styles.detailImage, { backgroundColor: "#E8F5E9", alignItems: "center", justifyContent: "center" }]}>
                <Text style={{ fontSize: 64 }}>🛍️</Text>
              </View>
            )}
            <ScrollView style={{ padding: 20 }}>
              <Text style={styles.detailTitle}>{selected?.titre}</Text>
              {selected?.description ? <Text style={styles.detailDesc}>{selected.description}</Text> : null}
              <Text style={styles.detailPrix}>
                {selected?.prix ? `${Number(selected.prix).toLocaleString("fr-FR")} FCFA` : "Gratuit"}
              </Text>
              {selected?.quartier ? <Text style={styles.detailQuartier}>📍 {selected.quartier}</Text> : null}
              {selected?.categorie ? (
                <View style={styles.detailCatBadge}>
                  <Text style={styles.detailCatText}>{selected.categorie}</Text>
                </View>
              ) : null}
              {selected?.prime_partage && (
                <View style={styles.primeBadge}>
                  <Text style={styles.primeBadgeText}>🎁 Prime de partage : {(selected.prime_amount || 0).toLocaleString("fr-FR")} FCFA</Text>
                </View>
              )}
              <TouchableOpacity
                style={styles.contactBtn}
                onPress={() => {
                  const titre = selected?.titre ?? "";
                  setSelected(null);
                  navigation.navigate("Messages", {
                    initialChannel: "general",
                    prefillText: titre ? `Je suis intéressé(e) par : ${titre} ` : "",
                  });
                }}
              >
                <Text style={styles.contactBtnText}>💬 Contacter le vendeur</Text>
              </TouchableOpacity>
              {selected?.prime_partage && selected?.vendeur_firebase_uid && firebaseUser && selected.vendeur_firebase_uid !== firebaseUser.uid && (
                <TouchableOpacity
                  style={styles.primeBtn}
                  onPress={async () => {
                    const amount = selected.prime_amount || 0;
                    if (amount <= 0) return Alert.alert("", "Aucune prime définie pour cet article.");
                    Alert.alert(
                      "Recevoir la prime",
                      `Le vendeur vous proposait ${amount.toLocaleString("fr-FR")} FCFA si vous l'avez aidé à vendre. Confirmer ?`,
                      [
                        { text: "Annuler", style: "cancel" },
                        {
                          text: "Confirmer",
                          onPress: async () => {
                            try {
                              await api.transferPrime(selected.id, selected.vendeur_firebase_uid!, firebaseUser.uid, amount);
                              Alert.alert("✅ Prime reçue !", `${amount.toLocaleString("fr-FR")} FCFA ajoutés à votre wallet.`);
                            } catch (e: any) {
                              Alert.alert("Erreur", e.message || "Impossible de transférer la prime.");
                            }
                          },
                        },
                      ]
                    );
                  }}
                >
                  <Text style={styles.primeBtnText}>🎁 Recevoir ma prime ({(selected.prime_amount || 0).toLocaleString("fr-FR")} FCFA)</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.closeDetailBtn} onPress={() => setSelected(null)}>
                <Text style={styles.closeDetailBtnText}>Fermer</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ─── Modal Nouvelle annonce ─── */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={resetForm}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Nouvelle annonce</Text>
                <TouchableOpacity onPress={resetForm}>
                  <Text style={styles.closeBtn}>✕</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.imagePicker} onPress={pickImage} activeOpacity={0.7}>
                {selectedImage ? (
                  <View>
                    <Image source={{ uri: selectedImage.uri }} style={styles.pickedImage} resizeMode="cover" />
                    <View style={styles.changePhotoOverlay}>
                      <Text style={styles.changePhotoText}>📷 Changer</Text>
                    </View>
                  </View>
                ) : (
                  <>
                    <Text style={styles.imagePickerIcon}>📷</Text>
                    <Text style={styles.imagePickerText}>Ajouter une photo</Text>
                    <Text style={styles.imagePickerSub}>Appuyez pour choisir</Text>
                  </>
                )}
              </TouchableOpacity>

              {[
                { key: "titre", label: "Titre *", placeholder: "Que vendez-vous ?", keyboard: "default" as any },
                { key: "description", label: "Description", placeholder: "État, détails de l'article...", keyboard: "default" as any },
                { key: "prix", label: "Prix (FCFA)", placeholder: "Laisser vide si gratuit / échange", keyboard: "numeric" as any },
                { key: "quartier", label: "Quartier", placeholder: dbUser?.quartier || "Votre quartier", keyboard: "default" as any },
              ].map((field) => (
                <View key={field.key} style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>{field.label}</Text>
                  <TextInput
                    style={[styles.input, field.key === "description" && { height: 80, textAlignVertical: "top" }]}
                    placeholder={field.placeholder}
                    value={(newItem as any)[field.key]}
                    onChangeText={(v) => setNewItem((prev) => ({ ...prev, [field.key]: v }))}
                    keyboardType={field.keyboard}
                    multiline={field.key === "description"}
                    placeholderTextColor={COLORS.muted}
                  />
                </View>
              ))}

              <Text style={styles.fieldLabel}>Catégorie</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
                {CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.catChip, newItem.categorie === cat && styles.catChipActive]}
                    onPress={() => setNewItem((prev) => ({ ...prev, categorie: cat }))}
                  >
                    <Text style={[styles.catChipText, newItem.categorie === cat && styles.catChipTextActive]}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* ─── Prime de partage ─── */}
              <View style={styles.primeBox}>
                <View style={styles.primeRow}>
                  <View style={styles.primeInfo}>
                    <Text style={styles.primeTitle}>🎁 Prime de partage</Text>
                    <Text style={styles.primeSub}>Récompensez un voisin qui vous aide à vendre</Text>
                  </View>
                  <Switch
                    value={primePartage}
                    onValueChange={setPrimePartage}
                    trackColor={{ false: COLORS.border, true: "#A5D6A7" }}
                    thumbColor={primePartage ? COLORS.primary : "#f4f3f4"}
                  />
                </View>
                {primePartage && (
                  <View style={styles.primeAmountRow}>
                    <Text style={styles.primeAmountLabel}>Montant de la prime (FCFA)</Text>
                    <TextInput
                      style={styles.primeAmountInput}
                      value={primeAmount}
                      onChangeText={setPrimeAmount}
                      keyboardType="numeric"
                      placeholder="ex: 500"
                      placeholderTextColor={COLORS.muted}
                    />
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={[styles.submitBtn, (!newItem.titre.trim() || uploading) && styles.submitBtnDisabled]}
                onPress={handleCreate}
                disabled={!newItem.titre.trim() || uploading}
              >
                {uploading ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <ActivityIndicator color="#fff" />
                    <Text style={styles.submitBtnText}>Publication en cours...</Text>
                  </View>
                ) : (
                  <Text style={styles.submitBtnText}>Publier l'annonce</Text>
                )}
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
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 20, paddingTop: 50, paddingBottom: 16, backgroundColor: COLORS.card,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  headerTitle: { fontSize: 22, fontWeight: "800", color: COLORS.primary },
  headerSub: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  addBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  searchBar: {
    flexDirection: "row", alignItems: "center", backgroundColor: COLORS.card,
    marginHorizontal: 16, marginVertical: 12, borderRadius: 14, paddingHorizontal: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, height: 44, fontSize: 14, color: COLORS.text },
  row: { justifyContent: "space-between" },
  empty: { alignItems: "center", paddingTop: 80 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyText: { fontSize: 18, fontWeight: "700", color: COLORS.text, textAlign: "center" },
  emptySubText: { fontSize: 14, color: COLORS.muted, textAlign: "center", marginTop: 8 },
  detailOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", padding: 20 },
  detailCard: { backgroundColor: COLORS.card, borderRadius: 20, overflow: "hidden", maxHeight: "85%" },
  detailImage: { width: "100%", height: 240 },
  detailTitle: { fontSize: 20, fontWeight: "800", color: COLORS.text, marginBottom: 8 },
  detailDesc: { fontSize: 14, color: COLORS.muted, marginBottom: 12, lineHeight: 22 },
  detailPrix: { fontSize: 24, fontWeight: "800", color: COLORS.primary, marginBottom: 8 },
  detailQuartier: { fontSize: 13, color: COLORS.muted, marginBottom: 12 },
  detailCatBadge: { backgroundColor: "#E8F5E9", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 4, alignSelf: "flex-start", marginBottom: 16 },
  detailCatText: { color: COLORS.primary, fontWeight: "700", fontSize: 12 },
  contactBtn: { backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 14, alignItems: "center", marginBottom: 10 },
  contactBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  closeDetailBtn: { alignItems: "center", paddingVertical: 10 },
  closeDetailBtnText: { color: COLORS.muted, fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: COLORS.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 50 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: "800", color: COLORS.text },
  closeBtn: { fontSize: 22, color: COLORS.muted, padding: 4 },
  imagePicker: {
    backgroundColor: COLORS.bg, borderRadius: 14, height: 160,
    alignItems: "center", justifyContent: "center", marginBottom: 16,
    borderWidth: 2, borderColor: COLORS.border, borderStyle: "dashed", overflow: "hidden",
  },
  imagePickerIcon: { fontSize: 40, marginBottom: 6 },
  imagePickerText: { color: COLORS.text, fontSize: 14, fontWeight: "600" },
  imagePickerSub: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  pickedImage: { width: "100%", height: 160 },
  changePhotoOverlay: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    backgroundColor: "rgba(0,0,0,0.5)", paddingVertical: 8, alignItems: "center",
  },
  changePhotoText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  fieldGroup: { marginBottom: 14 },
  fieldLabel: { fontSize: 13, fontWeight: "700", color: COLORS.muted, marginBottom: 6 },
  input: { backgroundColor: COLORS.bg, borderRadius: 12, padding: 12, fontSize: 14, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border },
  primeBox: { backgroundColor: "#F1F8F1", borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: "#A5D6A7" },
  primeRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  primeInfo: { flex: 1, marginRight: 10 },
  primeTitle: { fontSize: 14, fontWeight: "700", color: COLORS.primary },
  primeSub: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  primeAmountRow: { marginTop: 12 },
  primeAmountLabel: { fontSize: 13, fontWeight: "600", color: COLORS.muted, marginBottom: 6 },
  primeAmountInput: { backgroundColor: COLORS.card, borderRadius: 10, padding: 10, fontSize: 14, color: COLORS.text, borderWidth: 1, borderColor: COLORS.border },
  primeBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "#E8F5E9", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, alignSelf: "flex-start", marginBottom: 14, gap: 6 },
  primeBadgeText: { color: COLORS.primary, fontWeight: "700", fontSize: 13 },
  primeBtn: { backgroundColor: "#1B5E20", borderRadius: 14, paddingVertical: 13, alignItems: "center", marginBottom: 10 },
  primeBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  catChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border, marginRight: 8 },
  catChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  catChipText: { color: COLORS.muted, fontWeight: "600", fontSize: 13 },
  catChipTextActive: { color: "#fff" },
  submitBtn: { backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  submitBtnDisabled: { backgroundColor: "#A5D6A7" },
  submitBtnText: { color: "#fff", fontWeight: "800", fontSize: 16 },
});
