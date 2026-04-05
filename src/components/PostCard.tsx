import React, { useState, useRef, useEffect } from "react";
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
  TextInput,
  KeyboardAvoidingView,
  FlatList,
  SafeAreaView,
} from "react-native";
import { Video, ResizeMode, AVPlaybackStatus } from "expo-av";
import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { Post, api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import BoostPaymentModal from "./BoostPaymentModal";

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

interface Comment {
  id: string;
  author_id: string;
  author_name: string;
  author_avatar?: string | null;
  text: string;
  created_at: string;
}

function CommentsModal({ visible, post, onClose, onCommentAdded }: {
  visible: boolean;
  post: Post;
  onClose: () => void;
  onCommentAdded: (updatedPost: Post) => void;
}) {
  const { firebaseUser } = useAuth();
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const comments: Comment[] = Array.isArray(post.comments) ? (post.comments as Comment[]) : [];

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "à l'instant";
    if (mins < 60) return `il y a ${mins}min`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `il y a ${hrs}h`;
    return `il y a ${Math.floor(hrs / 24)}j`;
  };

  const handleSend = async () => {
    if (!text.trim() || !firebaseUser) return;
    setSending(true);
    try {
      const updated = await api.addComment(post.id, {
        author_id: firebaseUser.uid,
        author_name: firebaseUser.displayName || "Voisin",
        author_avatar: firebaseUser.photoURL || undefined,
        text: text.trim(),
      });
      setText("");
      onCommentAdded(updated);
    } catch {
      Alert.alert("Erreur", "Impossible d'envoyer le commentaire.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <TouchableOpacity style={cm.overlay} activeOpacity={1} onPress={onClose} />
        <SafeAreaView style={cm.sheet}>
          <View style={cm.handle} />
          <View style={cm.sheetHeader}>
            <Text style={cm.sheetTitle}>Commentaires ({comments.length})</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={cm.sheetClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={comments}
            keyExtractor={(c) => c.id}
            style={cm.list}
            contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 8 }}
            ListEmptyComponent={
              <Text style={cm.empty}>Aucun commentaire. Soyez le premier !</Text>
            }
            renderItem={({ item }) => (
              <View style={cm.commentRow}>
                <View style={cm.commentAvatar}>
                  {item.author_avatar ? (
                    <Image source={{ uri: item.author_avatar }} style={cm.commentAvatarImg} />
                  ) : (
                    <Text style={cm.commentAvatarLetter}>{(item.author_name || "?")[0].toUpperCase()}</Text>
                  )}
                </View>
                <View style={cm.commentBody}>
                  <View style={cm.commentMeta}>
                    <Text style={cm.commentAuthor}>{item.author_name}</Text>
                    <Text style={cm.commentTime}>{timeAgo(item.created_at)}</Text>
                  </View>
                  <Text style={cm.commentText}>{item.text}</Text>
                </View>
              </View>
            )}
          />

          <View style={cm.inputRow}>
            <TextInput
              style={cm.input}
              placeholder={firebaseUser ? "Écrire un commentaire..." : "Connectez-vous pour commenter"}
              placeholderTextColor="#9E9E9E"
              value={text}
              onChangeText={setText}
              multiline
              maxLength={500}
              editable={!!firebaseUser}
            />
            <TouchableOpacity
              style={[cm.sendBtn, (!text.trim() || sending) && cm.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!text.trim() || sending || !firebaseUser}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={cm.sendBtnText}>↑</Text>
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function PollWidget({ post }: { post: Post }) {
  const { firebaseUser } = useAuth();
  const options: { label: string }[] = Array.isArray(post.poll_options) ? (post.poll_options as any) : [];
  const [results, setResults] = useState<number[]>(options.map(() => 0));
  const [userVote, setUserVote] = useState<number | null>(null);
  const [voting, setVoting] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!options.length) return;
    api.getPollResults(post.id, firebaseUser?.uid).then((data) => {
      setResults(data.results);
      setUserVote(data.userVote);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [post.id]);

  const totalVotes = results.reduce((a, b) => a + b, 0);

  const handleVote = async (index: number) => {
    if (!firebaseUser) { Alert.alert("Connexion requise", "Connectez-vous pour voter."); return; }
    if (userVote !== null) return;
    setVoting(true);
    try {
      const data = await api.votePoll(post.id, firebaseUser.uid, index);
      setResults(data.results);
      setUserVote(index);
    } catch (e: any) {
      if (e.message?.includes("409") || e.message?.includes("déjà voté")) {
        Alert.alert("Déjà voté", "Vous avez déjà participé à ce sondage.");
      } else {
        Alert.alert("Erreur", "Impossible de voter. Réessayez.");
      }
    } finally {
      setVoting(false);
    }
  };

  if (!loaded || !options.length) return null;

  return (
    <View style={pw.container}>
      <Text style={pw.label}>📊 Sondage · {totalVotes} vote{totalVotes !== 1 ? "s" : ""}</Text>
      {options.map((opt, i) => {
        const count = results[i] || 0;
        const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
        const isMyVote = userVote === i;
        const voted = userVote !== null;
        return (
          <TouchableOpacity
            key={i}
            style={[pw.optionBtn, isMyVote && pw.optionBtnChosen, voted && { opacity: 1 }]}
            onPress={() => handleVote(i)}
            disabled={voted || voting}
            activeOpacity={voted ? 1 : 0.7}
          >
            <View style={pw.optionInner}>
              {voted && (
                <View style={[pw.bar, { width: `${pct}%` as any, backgroundColor: isMyVote ? "#1565C0" : "#BBDEFB" }]} />
              )}
              <View style={pw.optionRow}>
                <Text style={[pw.optionLabel, isMyVote && pw.optionLabelChosen]}>
                  {isMyVote ? "✓ " : ""}{opt.label}
                </Text>
                {voted && <Text style={[pw.pct, isMyVote && pw.pctChosen]}>{pct}%</Text>}
              </View>
            </View>
          </TouchableOpacity>
        );
      })}
      {!firebaseUser && <Text style={pw.loginHint}>Connectez-vous pour voter</Text>}
    </View>
  );
}

export default function PostCard({ post, onLiked, onDeleted, userLocation, onAuthorPress }: PostCardProps) {
  const { firebaseUser } = useAuth();
  const [likes, setLikes] = useState<string[]>(Array.isArray(post.likes) ? post.likes : []);
  const [comments, setComments] = useState<any[]>(Array.isArray(post.comments) ? post.comments : []);
  const [fullscreenVisible, setFullscreenVisible] = useState(false);
  const [commentsVisible, setCommentsVisible] = useState(false);
  const [payingCours, setPayingCours] = useState(false);
  const [boosting, setBoosting] = useState(false);
  const [boostModalVisible, setBoostModalVisible] = useState(false);
  const [isBoostedLocal, setIsBoostedLocal] = useState<boolean>(() => {
    if (!post.is_boosted) return false;
    if (!post.boost_expires_at) return false;
    return new Date(post.boost_expires_at) > new Date();
  });
  const [hasPaid, setHasPaid] = useState<boolean>(() => {
    if (!firebaseUser || !post.is_cours) return false;
    return Array.isArray(post.paid_by) && post.paid_by.includes(firebaseUser.uid);
  });
  const isLiked = firebaseUser ? likes.includes(firebaseUser.uid) : false;
  const isAuthor = firebaseUser?.uid === post.author_id;

  const handleBoost = () => {
    if (!firebaseUser) { Alert.alert("Connexion requise", "Connectez-vous pour propulser votre annonce."); return; }
    if (isBoostedLocal) { Alert.alert("Déjà propulsé", "Cette publication est déjà sponsorisée et en tête de fil."); return; }
    setBoostModalVisible(true);
  };

  const handlePayCours = async () => {
    if (!firebaseUser) { Alert.alert("Connexion requise", "Connectez-vous pour accéder à ce cours."); return; }
    const price = post.cours_price || 0;
    Alert.alert(
      "💳 Accéder au cours",
      `Ce cours coûte ${price.toLocaleString("fr-FR")} FCFA. Le montant sera débité de votre wallet.\n\nConfirmer ?`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: `Payer ${price.toLocaleString("fr-FR")} FCFA`,
          onPress: async () => {
            setPayingCours(true);
            try {
              await api.payCourse(post.id, firebaseUser.uid, post.author_id, price);
              setHasPaid(true);
              Alert.alert("✅ Accès accordé !", "Vous avez maintenant accès à ce cours. Votre wallet a été débité.");
            } catch (e: any) {
              Alert.alert("Erreur de paiement", e.message || "Impossible de traiter le paiement.");
            } finally {
              setPayingCours(false);
            }
          },
        },
      ]
    );
  };

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

  const postWithComments = { ...post, comments };

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
    <View style={[styles.card, post.is_emergency && styles.emergencyCard, isBoostedLocal && styles.boostedCard]}>
      {isBoostedLocal && (
        <View style={styles.sponsoredBadge}>
          <Text style={styles.sponsoredText}>⚡ Sponsorisé</Text>
        </View>
      )}
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

      {post.is_cours && (
        <View style={styles.coursBadge}>
          <Text style={styles.coursBadgeText}>🎓 Cours · {(post.cours_price || 0).toLocaleString("fr-FR")} FCFA</Text>
          {(hasPaid || isAuthor) && <Text style={styles.coursAccessLabel}>✓ Accès débloqué</Text>}
        </View>
      )}

      <Text style={styles.content}>{post.content}</Text>

      {post.poll_options && Array.isArray(post.poll_options) && (post.poll_options as any[]).length > 0 && (
        <PollWidget post={post} />
      )}

      {post.is_cours && !hasPaid && !isAuthor ? (
        <View style={styles.coursGate}>
          <Text style={styles.coursGateIcon}>🔒</Text>
          <Text style={styles.coursGateText}>Contenu réservé aux élèves inscrits</Text>
          <Text style={styles.coursGateSub}>Payez pour accéder aux médias et détails complets de ce cours</Text>
          <TouchableOpacity style={styles.coursPayBtn} onPress={handlePayCours} disabled={payingCours}>
            {payingCours ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.coursPayBtnText}>💳 Payer {(post.cours_price || 0).toLocaleString("fr-FR")} FCFA pour accéder</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <>
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
        </>
      )}

      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={handleLike}>
          <Text style={[styles.actionIcon, isLiked && { color: COLORS.like }]}>{isLiked ? "❤️" : "🤍"}</Text>
          <Text style={[styles.actionCount, isLiked && { color: COLORS.like }]}>{likes.length}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => setCommentsVisible(true)}>
          <Text style={styles.actionIcon}>💬</Text>
          <Text style={styles.actionCount}>{comments.length}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => {
          if (mediaUrl) setFullscreenVisible(true);
          else Share.share({ message: post.content });
        }}>
          <Text style={styles.actionIcon}>📤</Text>
        </TouchableOpacity>
        {isAuthor && (
          <TouchableOpacity
            style={[styles.actionBtn, styles.boostBtn, isBoostedLocal && styles.boostBtnActive, { marginLeft: "auto" }]}
            onPress={handleBoost}
            disabled={boosting}
          >
            {boosting ? (
              <ActivityIndicator size="small" color="#FF6D00" />
            ) : (
              <Text style={[styles.boostBtnText, isBoostedLocal && styles.boostBtnTextActive]}>
                {isBoostedLocal ? "⚡ Propulsé" : "🚀 Propulser"}
              </Text>
            )}
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

      <CommentsModal
        visible={commentsVisible}
        post={postWithComments}
        onClose={() => setCommentsVisible(false)}
        onCommentAdded={(updated) => {
          setComments(Array.isArray(updated.comments) ? updated.comments : []);
        }}
      />

      <BoostPaymentModal
        visible={boostModalVisible}
        userUid={firebaseUser?.uid || ""}
        userEmail={firebaseUser?.email || ""}
        targetId={post.id}
        targetType="post"
        onClose={() => setBoostModalVisible(false)}
        onBoosted={() => {
          setIsBoostedLocal(true);
          setBoostModalVisible(false);
          onLiked?.();
        }}
      />
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

const pw = StyleSheet.create({
  container: { backgroundColor: "#EEF7FF", borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: "#90CAF9" },
  label: { fontSize: 13, fontWeight: "700", color: "#1565C0", marginBottom: 10 },
  optionBtn: {
    borderRadius: 10, borderWidth: 1.5, borderColor: "#90CAF9",
    marginBottom: 8, overflow: "hidden",
    backgroundColor: "#fff",
  },
  optionBtnChosen: { borderColor: "#1565C0" },
  optionInner: { position: "relative", minHeight: 40 },
  bar: { position: "absolute", top: 0, left: 0, bottom: 0, borderRadius: 9, opacity: 0.35 },
  optionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10 },
  optionLabel: { fontSize: 14, fontWeight: "600", color: COLORS.text, flex: 1 },
  optionLabelChosen: { color: "#1565C0", fontWeight: "800" },
  pct: { fontSize: 14, fontWeight: "700", color: COLORS.muted, marginLeft: 8 },
  pctChosen: { color: "#1565C0" },
  loginHint: { fontSize: 12, color: COLORS.muted, textAlign: "center", marginTop: 4 },
});

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
  coursBadge: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#E8F5E9", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 10 },
  coursBadgeText: { color: COLORS.primary, fontWeight: "700", fontSize: 13 },
  coursAccessLabel: { color: "#2E7D32", fontSize: 12, fontWeight: "600" },
  coursGate: { backgroundColor: "#F3F4F6", borderRadius: 14, padding: 18, marginBottom: 12, alignItems: "center", borderWidth: 1, borderColor: "#E9ECEF", borderStyle: "dashed" as any },
  coursGateIcon: { fontSize: 36, marginBottom: 8 },
  coursGateText: { fontSize: 15, fontWeight: "700", color: COLORS.text, textAlign: "center", marginBottom: 4 },
  coursGateSub: { fontSize: 13, color: COLORS.muted, textAlign: "center", marginBottom: 14 },
  coursPayBtn: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20, alignItems: "center", width: "100%" },
  coursPayBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  boostedCard: { borderLeftWidth: 4, borderLeftColor: "#FF6D00" },
  sponsoredBadge: { backgroundColor: "#FFF3E0", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, alignSelf: "flex-start", marginBottom: 8, borderWidth: 1, borderColor: "#FFCC80" },
  sponsoredText: { color: "#E65100", fontWeight: "700", fontSize: 12 },
  boostBtn: { borderRadius: 16, paddingHorizontal: 12, paddingVertical: 5, backgroundColor: "#FFF3E0", borderWidth: 1, borderColor: "#FFCC80" },
  boostBtnActive: { backgroundColor: "#E65100", borderColor: "#E65100" },
  boostBtnText: { color: "#E65100", fontWeight: "700", fontSize: 12 },
  boostBtnTextActive: { color: "#fff" },
});

const cm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 16,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#E0E0E0", alignSelf: "center", marginTop: 10, marginBottom: 4 },
  sheetHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#F0F0F0" },
  sheetTitle: { fontSize: 16, fontWeight: "700", color: "#1A1A2E" },
  sheetClose: { fontSize: 18, color: "#9E9E9E", padding: 4 },
  list: { maxHeight: 320 },
  empty: { textAlign: "center", color: "#9E9E9E", marginTop: 24, fontSize: 14 },
  commentRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  commentAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center", overflow: "hidden", flexShrink: 0 },
  commentAvatarImg: { width: 36, height: 36, borderRadius: 18 },
  commentAvatarLetter: { color: "#fff", fontSize: 14, fontWeight: "700" },
  commentBody: { flex: 1, backgroundColor: "#F8F9FA", borderRadius: 12, padding: 10 },
  commentMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 4 },
  commentAuthor: { fontWeight: "700", fontSize: 13, color: "#1A1A2E" },
  commentTime: { fontSize: 11, color: "#9E9E9E" },
  commentText: { fontSize: 14, color: "#1A1A2E", lineHeight: 20 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: "#F0F0F0", gap: 10 },
  input: { flex: 1, backgroundColor: "#F8F9FA", borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, fontSize: 14, color: "#1A1A2E", maxHeight: 100, borderWidth: 1, borderColor: "#E9ECEF" },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  sendBtnDisabled: { backgroundColor: "#C8E6C9" },
  sendBtnText: { color: "#fff", fontSize: 18, fontWeight: "700" },
});
