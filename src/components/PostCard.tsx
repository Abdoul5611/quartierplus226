import React, { useState, useRef } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Modal,
  Share,
  Dimensions,
  Platform,
} from "react-native";
import { Video, ResizeMode, AVPlaybackStatus } from "expo-av";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
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

const SCREEN_W = Dimensions.get("window").width;
const SCREEN_H = Dimensions.get("window").height;

interface PostCardProps {
  post: Post;
  onLiked?: () => void;
  onDeleted?: () => void;
  userLocation?: { latitude: number; longitude: number } | null;
  onAuthorPress?: (authorId: string, authorName: string, authorAvatar?: string) => void;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(m: number): string {
  return m < 1000 ? `À ${Math.round(m)}m de vous` : `À ${(m / 1000).toFixed(1)}km de vous`;
}

function FullscreenMedia({
  visible,
  mediaUrl,
  mediaType,
  postId,
  isAuthor,
  onClose,
  onDeleted,
}: {
  visible: boolean;
  mediaUrl: string;
  mediaType: "image" | "video";
  postId: string;
  isAuthor: boolean;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const { firebaseUser } = useAuth();
  const videoRef = useRef<Video>(null);
  const [downloading, setDownloading] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission refusée", "Autorisez l'accès à la galerie dans les réglages.");
        return;
      }
      const ext = mediaType === "video" ? "mp4" : "jpg";
      const filename = `quartierplus_${Date.now()}.${ext}`;
      const localUri = FileSystem.documentDirectory + filename;

      await FileSystem.downloadAsync(mediaUrl, localUri);
      await MediaLibrary.saveToLibraryAsync(localUri);
      FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => {});

      Alert.alert("✅ Enregistré", "Média sauvegardé dans votre galerie !");
    } catch (e) {
      Alert.alert("Erreur", "Impossible de télécharger le média.");
    } finally {
      setDownloading(false);
    }
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Regardez cette publication sur QuartierPlus ! ${mediaUrl}`,
        url: mediaUrl,
      });
    } catch {
    }
  };

  const handleDelete = () => {
    if (!firebaseUser) return;
    Alert.alert(
      "Supprimer la publication",
      "Cette action est irréversible. Le média sera supprimé de Cloudinary.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            try {
              const res = await fetch(`/api/posts/${postId}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userId: firebaseUser.uid }),
              });
              if (!res.ok) throw new Error("Suppression échouée");
              onClose();
              onDeleted?.();
            } catch {
              Alert.alert("Erreur", "Impossible de supprimer la publication.");
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={fs.container}>
        <TouchableOpacity style={fs.closeBtn} onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <View style={fs.closeBtnCircle}>
            <Text style={fs.closeBtnText}>✕</Text>
          </View>
        </TouchableOpacity>

        <View style={fs.mediaArea}>
          {mediaType === "image" ? (
            <Image source={{ uri: mediaUrl }} style={fs.image} resizeMode="contain" />
          ) : (
            <Video
              ref={videoRef}
              source={{ uri: mediaUrl }}
              style={fs.video}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={true}
              isLooping={false}
              useNativeControls={true}
              onError={() => Alert.alert("Erreur", "Impossible de charger la vidéo.")}
            />
          )}
        </View>

        <View style={fs.toolbar}>
          <TouchableOpacity style={fs.toolBtn} onPress={handleDownload} disabled={downloading}>
            <View style={fs.toolIcon}>
              {downloading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={fs.toolEmoji}>💾</Text>
              )}
            </View>
            <Text style={fs.toolLabel}>Enregistrer</Text>
          </TouchableOpacity>

          <TouchableOpacity style={fs.toolBtn} onPress={handleShare}>
            <View style={fs.toolIcon}>
              <Text style={fs.toolEmoji}>🔗</Text>
            </View>
            <Text style={fs.toolLabel}>Partager</Text>
          </TouchableOpacity>

          {isAuthor && (
            <TouchableOpacity style={[fs.toolBtn, fs.toolBtnDanger]} onPress={handleDelete} disabled={deleting}>
              <View style={[fs.toolIcon, fs.toolIconDanger]}>
                {deleting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={fs.toolEmoji}>🗑️</Text>
                )}
              </View>
              <Text style={[fs.toolLabel, { color: "#FF5252" }]}>Supprimer</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

function MiniVideo({ uri, onPress }: { uri: string; onPress: () => void }) {
  const videoRef = useRef<Video>(null);
  const [loaded, setLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const toggle = async () => {
    if (!videoRef.current || !loaded) return;
    if (isPlaying) {
      await videoRef.current.pauseAsync();
    } else {
      await videoRef.current.playAsync();
    }
  };

  return (
    <TouchableOpacity activeOpacity={0.9} onPress={onPress} style={styles.videoContainer}>
      <Video
        ref={videoRef}
        source={{ uri }}
        style={styles.video}
        resizeMode={ResizeMode.COVER}
        shouldPlay={false}
        isLooping={false}
        useNativeControls={false}
        onPlaybackStatusUpdate={(s: AVPlaybackStatus) => {
          if (s.isLoaded) {
            setLoaded(true);
            setIsPlaying((s as any).isPlaying === true);
          }
        }}
      />
      <View style={styles.videoOverlay}>
        <TouchableOpacity style={styles.videoPlayCircle} onPress={toggle} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.videoPlayIcon}>{isPlaying ? "⏸" : "▶"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.videoExpandBtn} onPress={onPress}>
          <Text style={styles.videoExpandIcon}>⛶</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.videoLabel}>
        <Text style={styles.videoLabelText}>📹 Vidéo</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function PostCard({ post, onLiked, onDeleted, userLocation, onAuthorPress }: PostCardProps) {
  const { firebaseUser } = useAuth();
  const [likes, setLikes] = useState<string[]>(Array.isArray(post.likes) ? post.likes : []);
  const [fullscreenVisible, setFullscreenVisible] = useState(false);
  const isLiked = firebaseUser ? likes.includes(firebaseUser.uid) : false;
  const isAuthor = firebaseUser?.uid === post.author_id;

  const mediaUrl = post.video_uri || post.image_uri || "";
  const mediaType: "image" | "video" = post.video_uri ? "video" : "image";

  const handleLike = async () => {
    if (!firebaseUser) return;
    try {
      const updated = await api.likePost(post.id, firebaseUser.uid);
      setLikes(Array.isArray(updated.likes) ? updated.likes : []);
      onLiked?.();
    } catch {
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
    if (!userLocation || !post.latitude || !post.longitude) return null;
    const lat2 = parseFloat(post.latitude);
    const lon2 = parseFloat(post.longitude);
    if (isNaN(lat2) || isNaN(lon2)) return null;
    return formatDistance(haversineMeters(userLocation.latitude, userLocation.longitude, lat2, lon2));
  })();

  return (
    <View style={[styles.card, post.is_emergency && styles.emergencyCard]}>
      {post.is_emergency && (
        <View style={styles.emergencyBadge}>
          <Text style={styles.emergencyText}>🚨 URGENT</Text>
        </View>
      )}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.authorTouchable}
          onPress={() => onAuthorPress?.(post.author_id, post.author_name || "Voisin", post.author_avatar)}
          disabled={!onAuthorPress}
        >
          <View style={styles.avatar}>
            {post.author_avatar ? (
              <Image source={{ uri: post.author_avatar }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarLetter}>{(post.author_name || "?")[0].toUpperCase()}</Text>
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
        </TouchableOpacity>
        <View style={[styles.categoryBadge, { backgroundColor: getCategoryColor(post.category) }]}>
          <Text style={styles.categoryText}>{getCategoryLabel(post.category)}</Text>
        </View>
      </View>

      <Text style={styles.content}>{post.content}</Text>

      {post.video_uri ? (
        <MiniVideo uri={post.video_uri} onPress={() => setFullscreenVisible(true)} />
      ) : post.image_uri ? (
        <TouchableOpacity activeOpacity={0.9} onPress={() => setFullscreenVisible(true)}>
          <Image source={{ uri: post.image_uri }} style={styles.postImage} resizeMode="cover" />
          <View style={styles.imageExpandHint}>
            <Text style={styles.imageExpandIcon}>⛶</Text>
          </View>
        </TouchableOpacity>
      ) : null}

      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={handleLike}>
          <Text style={[styles.actionIcon, isLiked && { color: COLORS.like }]}>{isLiked ? "❤️" : "🤍"}</Text>
          <Text style={[styles.actionCount, isLiked && { color: COLORS.like }]}>{likes.length}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn}>
          <Text style={styles.actionIcon}>💬</Text>
          <Text style={styles.actionCount}>{Array.isArray(post.comments) ? post.comments.length : 0}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => {
          if (mediaUrl) setFullscreenVisible(true);
          else Share.share({ message: post.content });
        }}>
          <Text style={styles.actionIcon}>📤</Text>
        </TouchableOpacity>
        {isAuthor && (mediaUrl) && (
          <TouchableOpacity style={[styles.actionBtn, { marginLeft: "auto" }]} onPress={() => setFullscreenVisible(true)}>
            <Text style={styles.actionIcon}>🗑️</Text>
          </TouchableOpacity>
        )}
      </View>

      {mediaUrl ? (
        <FullscreenMedia
          visible={fullscreenVisible}
          mediaUrl={mediaUrl}
          mediaType={mediaType}
          postId={post.id}
          isAuthor={isAuthor}
          onClose={() => setFullscreenVisible(false)}
          onDeleted={onDeleted || onLiked}
        />
      ) : null}
    </View>
  );
}

function getCategoryColor(cat: string) {
  const map: Record<string, string> = { general: "#4CAF50", urgence: "#F44336", evenement: "#2196F3", marche: "#FF9800", aide: "#9C27B0" };
  return map[cat] || "#607D8B";
}

function getCategoryLabel(cat: string) {
  const map: Record<string, string> = { general: "Général", urgence: "Urgence", evenement: "Événement", marche: "Marché", aide: "Aide" };
  return map[cat] || cat;
}

const fs = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  closeBtn: { position: "absolute", top: Platform.OS === "ios" ? 54 : 20, right: 16, zIndex: 100 },
  closeBtnCircle: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.3)",
  },
  closeBtnText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  mediaArea: {
    flex: 1,
    width: SCREEN_W,
    alignItems: "center",
    justifyContent: "center",
  },
  image: { width: SCREEN_W, height: SCREEN_H * 0.75 },
  video: { width: SCREEN_W, height: SCREEN_H * 0.72 },
  toolbar: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 32,
    paddingVertical: 20,
    paddingBottom: Platform.OS === "ios" ? 36 : 20,
    backgroundColor: "rgba(0,0,0,0.85)",
  },
  toolBtn: { alignItems: "center", gap: 6 },
  toolBtnDanger: {},
  toolIcon: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.2)",
  },
  toolIconDanger: {
    backgroundColor: "rgba(255,82,82,0.15)",
    borderColor: "rgba(255,82,82,0.4)",
  },
  toolEmoji: { fontSize: 22 },
  toolLabel: { fontSize: 11, color: "rgba(255,255,255,0.8)", fontWeight: "600" },
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.card, borderRadius: 16, marginHorizontal: 16, marginVertical: 8,
    padding: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  emergencyCard: { borderLeftWidth: 4, borderLeftColor: COLORS.emergency },
  emergencyBadge: { backgroundColor: "#FFEBEE", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start", marginBottom: 10 },
  emergencyText: { color: COLORS.emergency, fontWeight: "700", fontSize: 12 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  authorTouchable: { flexDirection: "row", alignItems: "center", flex: 1 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center", marginRight: 10, overflow: "hidden" },
  avatarImg: { width: 44, height: 44, borderRadius: 22 },
  avatarLetter: { color: "#fff", fontSize: 18, fontWeight: "700" },
  headerInfo: { flex: 1 },
  authorName: { fontWeight: "700", fontSize: 15, color: COLORS.text },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 4, marginTop: 2 },
  timeText: { fontSize: 12, color: COLORS.muted },
  metaDot: { fontSize: 12, color: COLORS.muted },
  distanceText: { fontSize: 12, color: COLORS.primary, fontWeight: "600" },
  categoryBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  categoryText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  content: { fontSize: 15, color: COLORS.text, lineHeight: 22, marginBottom: 12 },
  postImage: { width: "100%", height: 220, borderRadius: 12, marginBottom: 12 },
  imageExpandHint: {
    position: "absolute", bottom: 20, right: 10,
    backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4,
  },
  imageExpandIcon: { color: "#fff", fontSize: 14 },
  videoContainer: { width: "100%", height: 220, borderRadius: 12, backgroundColor: "#000", marginBottom: 12, overflow: "hidden" },
  video: { width: "100%", height: "100%" },
  videoOverlay: { ...StyleSheet.absoluteFillObject, flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", padding: 10 },
  videoPlayCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(0,0,0,0.65)", alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.6)" },
  videoPlayIcon: { color: "#fff", fontSize: 16, marginLeft: 2 },
  videoExpandBtn: { backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  videoExpandIcon: { color: "#fff", fontSize: 16 },
  videoLabel: { position: "absolute", top: 10, left: 10, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  videoLabelText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  actions: { flexDirection: "row", borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 10, gap: 20, alignItems: "center" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  actionIcon: { fontSize: 20 },
  actionCount: { fontSize: 14, color: COLORS.muted, fontWeight: "600" },
});
