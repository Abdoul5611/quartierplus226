import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Linking,
  Alert,
} from "react-native";
import * as Location from "expo-location";
import { api, MarcheItem, Post } from "../services/api";

const COLORS = {
  primary: "#2E7D32",
  bg: "#F8F9FA",
  card: "#FFFFFF",
  text: "#1A1A2E",
  muted: "#6C757D",
  border: "#E9ECEF",
};

const POINTS_INTERET = [
  { id: "1", type: "ecole",    label: "École Primaire Centrale", icon: "🏫", desc: "100m de vous",  lat: 5.3600, lng: -4.0080 },
  { id: "2", type: "marche",   label: "Marché du quartier",      icon: "🛒", desc: "250m de vous",  lat: 5.3614, lng: -4.0102 },
  { id: "3", type: "sante",    label: "Centre de santé",          icon: "🏥", desc: "400m de vous",  lat: 5.3630, lng: -4.0120 },
  { id: "4", type: "mosquee",  label: "Grande Mosquée",          icon: "🕌", desc: "180m de vous",  lat: 5.3606, lng: -4.0090 },
  { id: "5", type: "eglise",   label: "Église Saint-Pierre",     icon: "⛪", desc: "320m de vous",  lat: 5.3620, lng: -4.0110 },
  { id: "6", type: "mairie",   label: "Mairie du quartier",      icon: "🏛️", desc: "500m de vous",  lat: 5.3645, lng: -4.0135 },
  { id: "7", type: "police",   label: "Commissariat",            icon: "👮", desc: "600m de vous",  lat: 5.3655, lng: -4.0150 },
  { id: "8", type: "pharmacie",label: "Pharmacie Du Peuple",     icon: "💊", desc: "150m de vous",  lat: 5.3603, lng: -4.0085 },
];

const TYPE_FILTERS = [
  { key: "tous", label: "Tout" },
  { key: "marche", label: "Marchés 🛒" },
  { key: "sante", label: "Santé 🏥" },
  { key: "ecole", label: "Écoles 🏫" },
  { key: "services", label: "Services 🏛️" },
];

export default function CarteScreen() {
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<string>("pending");
  const [filter, setFilter] = useState("tous");
  const [stats, setStats] = useState({ posts: 0, marche: 0 });

  useEffect(() => {
    requestLocation();
    loadStats();
  }, []);

  const requestLocation = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    setPermissionStatus(status);
    if (status === "granted") {
      try {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setLocation(loc);
      } catch (e) {
        console.error("Erreur géolocalisation:", e);
      }
    }
  };

  const loadStats = async () => {
    try {
      const [posts, marche] = await Promise.all([api.getPosts(), api.getMarche()]);
      setStats({ posts: posts.length, marche: marche.filter((m) => m.disponible).length });
    } catch {}
  };

  const openGoogleMaps = async (label: string, lat: number, lng: number) => {
    const encodedLabel = encodeURIComponent(label);
    const googleMapsUrl = Platform.select({
      ios: `comgooglemaps://?daddr=${lat},${lng}&directionsmode=walking`,
      android: `google.navigation:q=${lat},${lng}`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&destination_place_id=${encodedLabel}`,
    });
    const webFallback = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

    try {
      const supported = await Linking.canOpenURL(googleMapsUrl!);
      if (supported) {
        await Linking.openURL(googleMapsUrl!);
      } else {
        await Linking.openURL(webFallback);
      }
    } catch {
      Alert.alert("Erreur", "Impossible d'ouvrir Google Maps.");
    }
  };

  const filteredPoints = filter === "tous"
    ? POINTS_INTERET
    : POINTS_INTERET.filter((p) => p.type === filter);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Carte du Quartier</Text>
        <Text style={styles.headerSub}>
          {location
            ? `📍 ${location.coords.latitude.toFixed(4)}, ${location.coords.longitude.toFixed(4)}`
            : permissionStatus === "denied"
            ? "📍 Position non disponible"
            : "📍 Localisation en cours..."}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.mapPlaceholder}>
          {Platform.OS === "web" ? (
            <View style={styles.mapWebContainer}>
              <Text style={styles.mapIcon}>🗺️</Text>
              <Text style={styles.mapTitle}>Carte interactive</Text>
              {location ? (
                <>
                  <Text style={styles.mapCoords}>
                    Lat: {location.coords.latitude.toFixed(5)}
                  </Text>
                  <Text style={styles.mapCoords}>
                    Lng: {location.coords.longitude.toFixed(5)}
                  </Text>
                  <View style={styles.mapAccuracyBadge}>
                    <Text style={styles.mapAccuracyText}>
                      ✓ GPS actif · Précision {Math.round(location.coords.accuracy || 0)}m
                    </Text>
                  </View>
                </>
              ) : (
                <TouchableOpacity style={styles.gpsBtn} onPress={requestLocation}>
                  <Text style={styles.gpsBtnText}>📍 Activer la géolocalisation</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={styles.mapNativeContainer}>
              <Text style={styles.mapIcon}>🗺️</Text>
              <Text style={styles.mapTitle}>Carte du quartier</Text>
              <Text style={styles.mapSubtitle}>Carte disponible sur mobile</Text>
            </View>
          )}
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats.posts}</Text>
            <Text style={styles.statLabel}>Publications</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats.marche}</Text>
            <Text style={styles.statLabel}>Produits dispo.</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{POINTS_INTERET.length}</Text>
            <Text style={styles.statLabel}>Points d'intérêt</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Points d'intérêt</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={styles.filterContent}>
          {TYPE_FILTERS.map((f) => (
            <TouchableOpacity
              key={f.key}
              style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
              onPress={() => setFilter(f.key)}
            >
              <Text style={[styles.filterChipText, filter === f.key && styles.filterChipTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {filteredPoints.map((point) => (
          <TouchableOpacity key={point.id} style={styles.pointCard} activeOpacity={0.7}>
            <View style={styles.pointIcon}>
              <Text style={styles.pointIconText}>{point.icon}</Text>
            </View>
            <View style={styles.pointInfo}>
              <Text style={styles.pointLabel}>{point.label}</Text>
              <Text style={styles.pointDist}>{point.desc}</Text>
            </View>
            <TouchableOpacity style={styles.dirBtn} onPress={() => openGoogleMaps(point.label, point.lat, point.lng)}>
              <Text style={styles.dirBtnText}>Itinéraire</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        ))}

        <View style={styles.alertSection}>
          <Text style={styles.alertTitle}>🚨 Alertes de zone</Text>
          <View style={styles.alertCard}>
            <Text style={styles.alertIcon}>⚠️</Text>
            <View style={styles.alertInfo}>
              <Text style={styles.alertLabel}>Travaux — Rue Principale</Text>
              <Text style={styles.alertSub}>Impact circulation · En cours</Text>
            </View>
            <View style={styles.alertBadge}>
              <Text style={styles.alertBadgeText}>ACTIF</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
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
  scrollContent: { paddingBottom: 100 },
  mapPlaceholder: {
    margin: 16,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#E8F5E9",
    height: 220,
  },
  mapWebContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#C8E6C9",
    padding: 20,
  },
  mapNativeContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#C8E6C9",
  },
  mapIcon: { fontSize: 48, marginBottom: 8 },
  mapTitle: { fontSize: 16, fontWeight: "700", color: COLORS.primary },
  mapSubtitle: { fontSize: 12, color: COLORS.muted, marginTop: 4 },
  mapCoords: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  mapAccuracyBadge: {
    backgroundColor: "#4CAF50",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginTop: 10,
  },
  mapAccuracyText: { color: "#fff", fontSize: 12, fontWeight: "700" },
  gpsBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 12,
  },
  gpsBtnText: { color: "#fff", fontWeight: "700" },
  statsRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 20,
    gap: 10,
  },
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
  statNumber: { fontSize: 24, fontWeight: "800", color: COLORS.primary },
  statLabel: { fontSize: 11, color: COLORS.muted, textAlign: "center", marginTop: 2 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.text,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  filterBar: { marginHorizontal: 16, marginBottom: 12 },
  filterContent: { gap: 8 },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: 8,
  },
  filterChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  filterChipText: { color: COLORS.muted, fontWeight: "600", fontSize: 12 },
  filterChipTextActive: { color: "#fff" },
  pointCard: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  pointIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#E8F5E9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  pointIconText: { fontSize: 24 },
  pointInfo: { flex: 1 },
  pointLabel: { fontSize: 14, fontWeight: "700", color: COLORS.text },
  pointDist: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  dirBtn: {
    backgroundColor: "#E8F5E9",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  dirBtnText: { color: COLORS.primary, fontWeight: "700", fontSize: 12 },
  alertSection: { marginHorizontal: 16, marginTop: 20 },
  alertTitle: { fontSize: 16, fontWeight: "700", color: COLORS.text, marginBottom: 10 },
  alertCard: {
    backgroundColor: "#FFF3E0",
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    borderLeftWidth: 4,
    borderLeftColor: "#FF9800",
  },
  alertIcon: { fontSize: 28, marginRight: 12 },
  alertInfo: { flex: 1 },
  alertLabel: { fontSize: 14, fontWeight: "700", color: "#E65100" },
  alertSub: { fontSize: 12, color: "#BF360C", marginTop: 2 },
  alertBadge: { backgroundColor: "#FF9800", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  alertBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
});
