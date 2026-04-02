import React from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { MarcheItem } from "../services/api";

const COLORS = {
  primary: "#2E7D32",
  card: "#FFFFFF",
  text: "#1A1A2E",
  muted: "#6C757D",
  border: "#E9ECEF",
  badge: "#E8F5E9",
  badgeText: "#2E7D32",
};

interface MarcheCardProps {
  item: MarcheItem;
  onPress?: () => void;
}

export default function MarcheCard({ item, onPress }: MarcheCardProps) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} style={styles.image} resizeMode="cover" />
      ) : (
        <View style={styles.imagePlaceholder}>
          <Text style={styles.imagePlaceholderText}>🛍️</Text>
        </View>
      )}
      <View style={styles.body}>
        <Text style={styles.titre} numberOfLines={2}>{item.titre}</Text>
        {item.description ? (
          <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
        ) : null}
        <View style={styles.footer}>
          {item.prix ? (
            <Text style={styles.prix}>{Number(item.prix).toLocaleString("fr-FR")} FCFA</Text>
          ) : (
            <Text style={styles.gratuit}>Gratuit</Text>
          )}
          {item.categorie ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{item.categorie}</Text>
            </View>
          ) : null}
        </View>
        {item.quartier ? (
          <Text style={styles.quartier}>📍 {item.quartier}</Text>
        ) : null}
        <View style={[styles.dispoTag, { backgroundColor: item.disponible ? "#E8F5E9" : "#FFEBEE" }]}>
          <Text style={{ color: item.disponible ? "#2E7D32" : "#D32F2F", fontSize: 11, fontWeight: "700" }}>
            {item.disponible ? "✓ Disponible" : "✗ Indisponible"}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    width: "48%",
    marginBottom: 12,
  },
  image: {
    width: "100%",
    height: 140,
  },
  imagePlaceholder: {
    width: "100%",
    height: 140,
    backgroundColor: "#F1F8E9",
    alignItems: "center",
    justifyContent: "center",
  },
  imagePlaceholderText: {
    fontSize: 48,
  },
  body: {
    padding: 12,
  },
  titre: {
    fontWeight: "700",
    fontSize: 14,
    color: COLORS.text,
    marginBottom: 4,
  },
  description: {
    fontSize: 12,
    color: COLORS.muted,
    marginBottom: 8,
    lineHeight: 18,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  prix: {
    fontWeight: "700",
    color: COLORS.primary,
    fontSize: 14,
  },
  gratuit: {
    fontWeight: "700",
    color: "#1565C0",
    fontSize: 14,
  },
  badge: {
    backgroundColor: COLORS.badge,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    color: COLORS.badgeText,
    fontSize: 11,
    fontWeight: "600",
  },
  quartier: {
    fontSize: 11,
    color: COLORS.muted,
    marginBottom: 6,
  },
  dispoTag: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-start",
  },
});
