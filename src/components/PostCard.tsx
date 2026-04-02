import React, { useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { Post, api } from "../services/api";
import { useAuth } from "../context/AuthContext";

const COLORS = {
  primary: "#2E7D32",
  accent: "#FF6B35",
  bg: "#F8F9FA",
  card: "#FFFFFF",
  text: "#1A1A2E",
  muted: "#6C757D",
  border: "#E9ECEF",
  emergency: "#D32F2F",
  like: "#E91E63",
};

interface PostCardProps {
  post: Post;
  onLiked?: () => void;
}

export default function PostCard({ post, onLiked }: PostCardProps) {
  const { firebaseUser } = useAuth();
  const [likes, setLikes] = useState<string[]>(
    Array.isArray(post.likes) ? post.likes : []
  );
  const isLiked = firebaseUser ? likes.includes(firebaseUser.uid) : false;

  const handleLike = async () => {
    if (!firebaseUser) return;
    try {
      const updated = await api.likePost(post.id, firebaseUser.uid);
      setLikes(Array.isArray(updated.likes) ? updated.likes : []);
      onLiked?.();
    } catch (e) {
      Alert.alert("Erreur", "Impossible de liker");
    }
  };

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
    <View style={[styles.card, post.is_emergency && styles.emergencyCard]}>
      {post.is_emergency && (
        <View style={styles.emergencyBadge}>
          <Text style={styles.emergencyText}>🚨 URGENT</Text>
        </View>
      )}
      <View style={styles.header}>
        <View style={styles.avatar}>
          {post.author_avatar ? (
            <Image source={{ uri: post.author_avatar }} style={styles.avatarImg} />
          ) : (
            <Text style={styles.avatarLetter}>
              {(post.author_name || "?")[0].toUpperCase()}
            </Text>
          )}
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.authorName}>{post.author_name || "Voisin"}</Text>
          <Text style={styles.timeText}>{timeAgo(post.created_at)}</Text>
        </View>
        <View style={[styles.categoryBadge, { backgroundColor: getCategoryColor(post.category) }]}>
          <Text style={styles.categoryText}>{getCategoryLabel(post.category)}</Text>
        </View>
      </View>

      <Text style={styles.content}>{post.content}</Text>

      {post.image_uri ? (
        <Image source={{ uri: post.image_uri }} style={styles.postImage} resizeMode="cover" />
      ) : null}

      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={handleLike}>
          <Text style={[styles.actionIcon, isLiked && { color: COLORS.like }]}>
            {isLiked ? "❤️" : "🤍"}
          </Text>
          <Text style={[styles.actionCount, isLiked && { color: COLORS.like }]}>
            {likes.length}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn}>
          <Text style={styles.actionIcon}>💬</Text>
          <Text style={styles.actionCount}>
            {Array.isArray(post.comments) ? post.comments.length : 0}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn}>
          <Text style={styles.actionIcon}>📤</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function getCategoryColor(cat: string) {
  const map: Record<string, string> = {
    general: "#4CAF50",
    urgence: "#F44336",
    evenement: "#2196F3",
    marche: "#FF9800",
    aide: "#9C27B0",
  };
  return map[cat] || "#607D8B";
}

function getCategoryLabel(cat: string) {
  const map: Record<string, string> = {
    general: "Général",
    urgence: "Urgence",
    evenement: "Événement",
    marche: "Marché",
    aide: "Aide",
  };
  return map[cat] || cat;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  emergencyCard: {
    borderLeftWidth: 4,
    borderLeftColor: COLORS.emergency,
  },
  emergencyBadge: {
    backgroundColor: "#FFEBEE",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
    marginBottom: 10,
  },
  emergencyText: {
    color: COLORS.emergency,
    fontWeight: "700",
    fontSize: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    overflow: "hidden",
  },
  avatarImg: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarLetter: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  headerInfo: {
    flex: 1,
  },
  authorName: {
    fontWeight: "700",
    fontSize: 15,
    color: COLORS.text,
  },
  timeText: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 2,
  },
  categoryBadge: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  categoryText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  content: {
    fontSize: 15,
    color: COLORS.text,
    lineHeight: 22,
    marginBottom: 12,
  },
  postImage: {
    width: "100%",
    height: 220,
    borderRadius: 12,
    marginBottom: 12,
  },
  actions: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 10,
    gap: 20,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  actionIcon: {
    fontSize: 20,
  },
  actionCount: {
    fontSize: 14,
    color: COLORS.muted,
    fontWeight: "600",
  },
});
