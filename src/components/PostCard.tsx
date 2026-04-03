import React, { useState, useRef } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Video, ResizeMode, AVPlaybackStatus } from "expo-av";
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
  userLocation?: { latitude: number; longitude: number } | null;
}

function haversineMeters(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `À ${Math.round(meters)}m de vous`;
  return `À ${(meters / 1000).toFixed(1)}km de vous`;
}

function VideoPlayer({ uri }: { uri: string }) {
  const videoRef = useRef<Video>(null);
  const [status, setStatus] = useState<AVPlaybackStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const isPlaying =
    status?.isLoaded && (status as any).isPlaying === true;

  const togglePlay = async () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      await videoRef.current.pauseAsync();
    } else {
      await videoRef.current.playAsync();
    }
  };

  return (
    <View style={styles.videoContainer}>
      <Video
        ref={videoRef}
        source={{ uri }}
        style={styles.video}
        resizeMode={ResizeMode.CONTAIN}
        onPlaybackStatusUpdate={(s) => {
          setStatus(s);
          if (s.isLoaded) setLoading(false);
        }}
        onError={() => setLoading(false)}
        useNativeControls={false}
        isLooping={false}
      />
      {loading && (
        <View style={styles.videoOverlay}>
          <ActivityIndicator color="#fff" size="large" />
        </View>
      )}
      <TouchableOpacity style={styles.videoPlayBtn} onPress={togglePlay} activeOpacity={0.8}>
        <View style={styles.videoPlayCircle}>
          <Text style={styles.videoPlayIcon}>{isPlaying ? "⏸" : "▶"}</Text>
        </View>
      </TouchableOpacity>
      <View style={styles.videoLabel}>
        <Text style={styles.videoLabelText}>📹 Vidéo</Text>
      </View>
    </View>
  );
}

export default function PostCard({ post, onLiked, userLocation }: PostCardProps) {
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

  const distanceLabel: string | null = (() => {
    if (!userLocation) return null;
    if (!post.latitude || !post.longitude) return null;
    const lat2 = parseFloat(post.latitude);
    const lon2 = parseFloat(post.longitude);
    if (isNaN(lat2) || isNaN(lon2)) return null;
    const meters = haversineMeters(
      userLocation.latitude, userLocation.longitude,
      lat2, lon2
    );
    return formatDistance(meters);
  })();

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
          <View style={styles.metaRow}>
            <Text style={styles.timeText}>{timeAgo(post.created_at)}</Text>
            {distanceLabel && (
              <>
                <Text style={styles.metaDot}>·</Text>
                <Text style={styles.distanceText}>📍 {distanceLabel}</Text>
              </>
            )}
          </View>
        </View>
        <View style={[styles.categoryBadge, { backgroundColor: getCategoryColor(post.category) }]}>
          <Text style={styles.categoryText}>{getCategoryLabel(post.category)}</Text>
        </View>
      </View>

      <Text style={styles.content}>{post.content}</Text>

      {post.video_uri ? (
        <VideoPlayer uri={post.video_uri} />
      ) : post.image_uri ? (
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
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 2,
  },
  timeText: {
    fontSize: 12,
    color: COLORS.muted,
  },
  metaDot: {
    fontSize: 12,
    color: COLORS.muted,
  },
  distanceText: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: "600",
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
  videoContainer: {
    width: "100%",
    height: 220,
    borderRadius: 12,
    backgroundColor: "#000",
    marginBottom: 12,
    overflow: "hidden",
    position: "relative",
  },
  video: {
    width: "100%",
    height: "100%",
  },
  videoOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  videoPlayBtn: {
    position: "absolute",
    bottom: 12,
    right: 12,
  },
  videoPlayCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.6)",
  },
  videoPlayIcon: {
    color: "#fff",
    fontSize: 16,
    marginLeft: 2,
  },
  videoLabel: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  videoLabelText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
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
