import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Alert,
} from "react-native";
import { Audio } from "expo-av";
import { useRoute } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { BASE_URL } from "../services/api";

const COLORS = {
  primary: "#2E7D32",
  bg: "#F8F9FA",
  card: "#FFFFFF",
  text: "#1A1A2E",
  muted: "#6C757D",
  border: "#E9ECEF",
  myMsg: "#2E7D32",
};

interface Message {
  id: string;
  channel: string;
  sender_id: string;
  sender_name: string;
  sender_avatar?: string;
  text?: string;
  audio_url?: string;
  message_type: string;
  created_at: string;
}

interface Channel {
  id: string;
  label: string;
  icon: string;
  description: string;
}

const CHANNELS: Channel[] = [
  { id: "general", label: "Général", icon: "🏘️", description: "Discussions du quartier" },
  { id: "urgences", label: "Urgences", icon: "🚨", description: "Alertes & urgences" },
  { id: "evenements", label: "Événements", icon: "🎉", description: "Fêtes & événements" },
  { id: "entraide", label: "Entraide", icon: "🤝", description: "Demandes d'aide" },
  { id: "annonces", label: "Annonces", icon: "📢", description: "Annonces officielles" },
];

async function fetchMessages(channel: string): Promise<Message[]> {
  const res = await fetch(`${BASE_URL}/api/messages/${channel}`);
  if (!res.ok) throw new Error("Erreur chargement messages");
  return res.json();
}

async function postMessage(data: {
  channel: string;
  sender_id: string;
  sender_name: string;
  sender_avatar?: string;
  text?: string;
  audio_url?: string;
  message_type?: string;
}): Promise<Message> {
  const res = await fetch(`${BASE_URL}/api/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || "Erreur envoi");
  }
  return res.json();
}

async function uploadAudio(base64: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/upload/audio`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base64, folder: "quartierplus/audio" }),
  });
  if (!res.ok) throw new Error("Erreur upload audio");
  const data = await res.json();
  return data.url;
}

function AudioPlayer({ audioUrl, isMe }: { audioUrl: string; isMe: boolean }) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "playing" | "paused" | "error">("idle");

  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  const handleToggle = async () => {
    if (!audioUrl) {
      Alert.alert("Erreur", "URL audio introuvable.");
      return;
    }

    if (status === "playing") {
      await soundRef.current?.pauseAsync();
      setStatus("paused");
      return;
    }

    if (status === "paused" && soundRef.current) {
      await soundRef.current.playAsync();
      setStatus("playing");
      return;
    }

    setStatus("loading");
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });

      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }

      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUrl },
        { shouldPlay: true },
        (playbackStatus) => {
          if (!playbackStatus.isLoaded) return;
          if (playbackStatus.didJustFinish) {
            setStatus("idle");
            soundRef.current?.unloadAsync().catch(() => {});
            soundRef.current = null;
          }
        }
      );
      soundRef.current = sound;
      setStatus("playing");
    } catch (e) {
      console.error("Erreur lecture audio:", e);
      setStatus("error");
      Alert.alert("Erreur", "Impossible de lire ce message vocal.");
    }
  };

  const iconColor = isMe ? "#fff" : COLORS.primary;
  const labelColor = isMe ? "rgba(255,255,255,0.9)" : COLORS.text;
  const waveColor = isMe ? "rgba(255,255,255,0.5)" : "#A5D6A7";
  const waveActiveColor = isMe ? "#fff" : COLORS.primary;

  return (
    <TouchableOpacity
      style={styles.audioPlayerRow}
      onPress={handleToggle}
      activeOpacity={0.75}
      disabled={status === "loading"}
    >
      <View style={[styles.playIconWrap, { borderColor: isMe ? "rgba(255,255,255,0.6)" : COLORS.primary }]}>
        {status === "loading" ? (
          <ActivityIndicator size="small" color={iconColor} />
        ) : (
          <Text style={[styles.playIconText, { color: iconColor }]}>
            {status === "playing" ? "⏸" : "▶"}
          </Text>
        )}
      </View>

      <View style={styles.waveformRow}>
        {[5, 10, 7, 14, 9, 12, 6, 11, 8, 13, 5, 9, 7].map((h, i) => (
          <View
            key={i}
            style={[
              styles.waveBar,
              {
                height: h * 2,
                backgroundColor:
                  status === "playing" && i % 3 !== 0 ? waveActiveColor : waveColor,
              },
            ]}
          />
        ))}
      </View>

      <Text style={[styles.audioLabel, { color: labelColor }]}>
        {status === "playing" ? "En lecture..." : status === "loading" ? "Chargement..." : status === "error" ? "Erreur" : "Vocal"}
      </Text>
    </TouchableOpacity>
  );
}

interface LastMsg { text: string; time: string; sender: string; unread: number }

export default function MessagesScreen() {
  const { firebaseUser } = useAuth();
  const route = useRoute<any>();
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [lastMessages, setLastMessages] = useState<Record<string, LastMsg>>({});
  const flatListRef = useRef<FlatList>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const handledParamRef = useRef<string | null>(null);

  // Charge l'aperçu du dernier message pour chaque canal (liste WhatsApp)
  const loadPreviews = useCallback(async () => {
    const results: Record<string, LastMsg> = {};
    await Promise.all(
      CHANNELS.map(async (ch) => {
        try {
          const msgs = await fetchMessages(ch.id);
          if (msgs.length > 0) {
            const last = msgs[msgs.length - 1];
            results[ch.id] = {
              text: last.message_type === "audio" ? "🎵 Message vocal" : (last.text || ""),
              time: last.created_at,
              sender: last.sender_name,
              unread: 0,
            };
          }
        } catch {}
      })
    );
    setLastMessages(results);
  }, []);

  useEffect(() => {
    loadPreviews();
    const interval = setInterval(loadPreviews, 15000);
    return () => clearInterval(interval);
  }, [loadPreviews]);

  useEffect(() => {
    const params = route.params as { initialChannel?: string; prefillText?: string } | undefined;
    if (!params?.initialChannel) return;
    const paramKey = `${params.initialChannel}:${params.prefillText ?? ""}`;
    if (handledParamRef.current === paramKey) return;
    handledParamRef.current = paramKey;
    const channel = CHANNELS.find((c) => c.id === params.initialChannel) || CHANNELS[0];
    setActiveChannel(channel);
    if (params.prefillText) setText(params.prefillText);
  }, [route.params]);

  const loadMessages = useCallback(async (channel: string) => {
    try {
      const data = await fetchMessages(channel);
      setMessages(data);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 50);
    } catch (e) {
      console.error("Erreur messages:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!activeChannel) {
      if (pollingRef.current) clearInterval(pollingRef.current);
      return;
    }
    setLoading(true);
    loadMessages(activeChannel.id);
    pollingRef.current = setInterval(() => loadMessages(activeChannel.id), 4000);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [activeChannel, loadMessages]);

  const sendMessage = async () => {
    if (!text.trim() || !firebaseUser || !activeChannel) return;
    const textToSend = text.trim();
    setText("");
    setSending(true);
    try {
      const msg = await postMessage({
        channel: activeChannel.id,
        sender_id: firebaseUser.uid,
        sender_name: firebaseUser.displayName || "Voisin",
        sender_avatar: firebaseUser.photoURL || undefined,
        text: textToSend,
        message_type: "text",
      });
      setMessages((prev) => [...prev, msg]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) {
      Alert.alert("Erreur", e.message || "Message non envoyé. Réessayez.");
      setText(textToSend);
    } finally {
      setSending(false);
    }
  };

  const startRecording = async () => {
    if (!firebaseUser) {
      Alert.alert("Connexion requise", "Connectez-vous pour envoyer des messages vocaux.");
      return;
    }
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permission refusée", "Autorisez le micro dans les réglages.");
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: newRec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(newRec);
      setIsRecording(true);
    } catch (e) {
      Alert.alert("Erreur", "Impossible de démarrer l'enregistrement.");
    }
  };

  const stopAndSendRecording = async () => {
    if (!recording || !firebaseUser || !activeChannel) return;
    setIsRecording(false);
    setSending(true);
    try {
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      if (!uri) throw new Error("Fichier audio introuvable");

      const response = await fetch(uri);
      const blob = await response.blob();
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      await new Promise<void>((resolve) => { reader.onloadend = () => resolve(); });
      const base64 = (reader.result as string).split(",")[1];
      const audioUrl = await uploadAudio(base64);

      const msg = await postMessage({
        channel: activeChannel.id,
        sender_id: firebaseUser.uid,
        sender_name: firebaseUser.displayName || "Voisin",
        sender_avatar: firebaseUser.photoURL || undefined,
        audio_url: audioUrl,
        message_type: "audio",
      });
      setMessages((prev) => [...prev, msg]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) {
      Alert.alert("Erreur", "Impossible d'envoyer le message vocal.");
    } finally {
      setSending(false);
    }
  };

  const formatTime = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  };

  const formatPreviewTime = (dateStr: string) => {
    if (!dateStr) return "";
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
      if (diffDays === 0) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
      if (diffDays === 1) return "Hier";
      if (diffDays < 7) return d.toLocaleDateString("fr-FR", { weekday: "short" });
      return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
    } catch { return ""; }
  };

  if (!activeChannel) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Messages</Text>
          <Text style={styles.headerSub}>{CHANNELS.length} discussions du quartier</Text>
        </View>

        {!firebaseUser && (
          <View style={styles.loginBanner}>
            <Text style={styles.loginBannerText}>
              🔒 Connectez-vous dans l'onglet Profil pour envoyer des messages
            </Text>
          </View>
        )}

        <FlatList
          data={CHANNELS}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => {
            const preview = lastMessages[item.id];
            return (
              <TouchableOpacity
                style={styles.waRow}
                onPress={() => setActiveChannel(item)}
                activeOpacity={0.75}
              >
                <View style={styles.waAvatar}>
                  <Text style={styles.waAvatarText}>{item.icon}</Text>
                </View>
                <View style={styles.waBody}>
                  <View style={styles.waTopRow}>
                    <Text style={styles.waName}>{item.label}</Text>
                    {preview?.time ? (
                      <Text style={styles.waTime}>{formatPreviewTime(preview.time)}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.waPreview} numberOfLines={1}>
                    {preview
                      ? `${preview.sender} : ${preview.text}`
                      : item.description}
                  </Text>
                </View>
                <Text style={styles.waChevron}>›</Text>
              </TouchableOpacity>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.waSeparator} />}
          contentContainerStyle={{ paddingBottom: 120 }}
          ListEmptyComponent={
            <View style={styles.emptyList}>
              <Text style={styles.emptyListIcon}>💬</Text>
              <Text style={styles.emptyListText}>Aucun canal disponible</Text>
            </View>
          }
        />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={80}
    >
      <View style={styles.chatHeader}>
        <TouchableOpacity onPress={() => setActiveChannel(null)} style={styles.backBtn}>
          <Text style={styles.backBtnText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.chatHeaderIcon}>{activeChannel.icon}</Text>
        <View>
          <Text style={styles.chatHeaderTitle}>{activeChannel.label}</Text>
          <Text style={styles.chatHeaderSub}>{activeChannel.description}</Text>
        </View>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ flex: 1 }} />
      ) : (
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => {
            const isMe = item.sender_id === firebaseUser?.uid;
            return (
              <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
                {!isMe && (
                  <View style={styles.msgAvatar}>
                    {item.sender_avatar ? (
                      <Image source={{ uri: item.sender_avatar }} style={styles.msgAvatarImg} />
                    ) : (
                      <Text style={styles.msgAvatarLetter}>{(item.sender_name || "?")[0].toUpperCase()}</Text>
                    )}
                  </View>
                )}
                <View style={[styles.msgBubble, isMe ? styles.myBubble : styles.otherBubble]}>
                  {!isMe && <Text style={styles.msgSender}>{item.sender_name}</Text>}
                  {item.message_type === "audio" && item.audio_url ? (
                    <AudioPlayer audioUrl={item.audio_url} isMe={isMe} />
                  ) : item.message_type === "audio" ? (
                    <View style={styles.audioPlayerRow}>
                      <Text style={{ color: isMe ? "#fff" : COLORS.muted, fontSize: 13 }}>🎵 Message vocal</Text>
                    </View>
                  ) : (
                    <Text style={[styles.msgText, isMe && styles.msgTextMe]}>{item.text}</Text>
                  )}
                  <Text style={[styles.msgTime, isMe && { color: "rgba(255,255,255,0.7)" }]}>
                    {formatTime(item.created_at)}
                  </Text>
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Text style={styles.emptyChatIcon}>{activeChannel.icon}</Text>
              <Text style={styles.emptyChatText}>Aucun message</Text>
              <Text style={styles.emptyChatSub}>Soyez le premier à écrire !</Text>
            </View>
          }
          contentContainerStyle={{ padding: 16, paddingBottom: 16 }}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
        />
      )}

      {firebaseUser ? (
        <View style={styles.inputRow}>
          <TextInput
            style={styles.msgInput}
            placeholder={isRecording ? "🔴 Enregistrement en cours..." : "Écrire un message..."}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={500}
            placeholderTextColor={isRecording ? "#D32F2F" : COLORS.muted}
            editable={!isRecording}
          />
          {text.trim().length > 0 ? (
            <TouchableOpacity
              style={[styles.sendBtn, sending && styles.sendBtnDisabled]}
              onPress={sendMessage}
              disabled={sending}
            >
              {sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.sendBtnIcon}>➤</Text>}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.sendBtn, isRecording ? styles.recordingBtn : {}]}
              onPress={isRecording ? stopAndSendRecording : startRecording}
              disabled={sending}
            >
              <Text style={styles.sendBtnIcon}>{isRecording ? "⏹" : "🎤"}</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={styles.loginInputBanner}>
          <Text style={styles.loginBannerText}>
            🔒 Connectez-vous dans Profil pour participer
          </Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    paddingHorizontal: 20, paddingTop: 50, paddingBottom: 16, backgroundColor: COLORS.card,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  headerTitle: { fontSize: 22, fontWeight: "800", color: COLORS.primary },
  headerSub: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  // ─── Styles WhatsApp conversation list ───────────────────────────────────
  waRow: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 13, backgroundColor: COLORS.card,
  },
  waAvatar: {
    width: 54, height: 54, borderRadius: 27, backgroundColor: "#E8F5E9",
    alignItems: "center", justifyContent: "center", marginRight: 14,
  },
  waAvatarText: { fontSize: 26 },
  waBody: { flex: 1 },
  waTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
  waName: { fontSize: 16, fontWeight: "700", color: COLORS.text, flex: 1 },
  waTime: { fontSize: 11, color: COLORS.muted, marginLeft: 8 },
  waPreview: { fontSize: 13, color: COLORS.muted, flex: 1 },
  waSeparator: { height: 1, backgroundColor: COLORS.border, marginLeft: 84 },
  waChevron: { fontSize: 22, color: COLORS.muted, marginLeft: 8 },
  emptyList: { alignItems: "center", paddingTop: 80 },
  emptyListIcon: { fontSize: 48, marginBottom: 12 },
  emptyListText: { fontSize: 15, color: COLORS.muted, fontWeight: "600" },
  // ─── (Legacy - kept for possible reuse) ──────────────────────────────────
  channelCard: {
    backgroundColor: COLORS.card, borderRadius: 16, padding: 16,
    flexDirection: "row", alignItems: "center", marginBottom: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  channelIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#E8F5E9", alignItems: "center", justifyContent: "center", marginRight: 14 },
  channelIconText: { fontSize: 26 },
  channelInfo: { flex: 1 },
  channelLabel: { fontSize: 16, fontWeight: "700", color: COLORS.text },
  channelDesc: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  chevron: { fontSize: 24, color: COLORS.muted },
  loginBanner: { backgroundColor: "#FFF9C4", padding: 16, marginHorizontal: 16, marginBottom: 100, borderRadius: 12 },
  loginBannerText: { textAlign: "center", color: "#795548", fontSize: 13, fontWeight: "600" },
  chatHeader: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 50,
    paddingBottom: 14, backgroundColor: COLORS.card, shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2, gap: 12,
  },
  backBtn: { padding: 4 },
  backBtnText: { fontSize: 32, color: COLORS.primary, lineHeight: 36 },
  chatHeaderIcon: { fontSize: 28 },
  chatHeaderTitle: { fontSize: 16, fontWeight: "700", color: COLORS.text },
  chatHeaderSub: { fontSize: 12, color: COLORS.muted },
  msgRow: { flexDirection: "row", marginBottom: 12, alignItems: "flex-end" },
  msgRowMe: { flexDirection: "row-reverse" },
  msgAvatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.primary,
    alignItems: "center", justifyContent: "center", marginRight: 8, overflow: "hidden",
  },
  msgAvatarImg: { width: 36, height: 36, borderRadius: 18 },
  msgAvatarLetter: { color: "#fff", fontWeight: "700", fontSize: 14 },
  msgBubble: {
    maxWidth: "75%", borderRadius: 16, padding: 12,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1,
  },
  myBubble: { backgroundColor: COLORS.myMsg, borderBottomRightRadius: 4 },
  otherBubble: { backgroundColor: COLORS.card, borderBottomLeftRadius: 4 },
  msgSender: { fontSize: 11, fontWeight: "700", color: COLORS.primary, marginBottom: 4 },
  msgText: { fontSize: 14, color: COLORS.text, lineHeight: 20 },
  msgTextMe: { color: "#fff" },
  msgTime: { fontSize: 10, color: COLORS.muted, marginTop: 4, alignSelf: "flex-end" },
  audioPlayerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 2,
    minWidth: 160,
  },
  playIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  playIconText: { fontSize: 14, marginLeft: 2 },
  waveformRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flex: 1,
  },
  waveBar: {
    width: 3,
    borderRadius: 2,
  },
  audioLabel: {
    fontSize: 11,
    fontWeight: "600",
    minWidth: 50,
  },
  emptyChat: { alignItems: "center", paddingTop: 80 },
  emptyChatIcon: { fontSize: 60, marginBottom: 12 },
  emptyChatText: { fontSize: 18, fontWeight: "700", color: COLORS.text },
  emptyChatSub: { fontSize: 13, color: COLORS.muted, marginTop: 6 },
  inputRow: {
    flexDirection: "row", alignItems: "flex-end", padding: 12,
    backgroundColor: COLORS.card, borderTopWidth: 1, borderTopColor: COLORS.border, gap: 10,
  },
  msgInput: {
    flex: 1, backgroundColor: COLORS.bg, borderRadius: 20, paddingHorizontal: 16,
    paddingVertical: 10, fontSize: 14, color: COLORS.text, maxHeight: 100,
    borderWidth: 1, borderColor: COLORS.border,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  sendBtnDisabled: { backgroundColor: "#A5D6A7" },
  recordingBtn: { backgroundColor: "#D32F2F" },
  sendBtnIcon: { color: "#fff", fontSize: 18 },
  loginInputBanner: { backgroundColor: "#FFF9C4", padding: 14, margin: 12, borderRadius: 12 },
});
