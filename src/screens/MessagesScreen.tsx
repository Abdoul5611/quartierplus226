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
import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import { useRoute } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { BASE_URL } from "../services/api";

const COLORS = {
  primary: "#2E7D32",
  bg: "#F0F2F5",
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

interface DMConversation {
  channel: string;
  partner_id: string;
  partner_name: string;
  partner_avatar?: string | null;
  last_message: string;
  last_message_type: string;
  last_message_at: string;
  last_sender_id: string;
}

interface GroupChannel {
  id: string;
  label: string;
  icon: string;
  description: string;
}

const GROUP_CHANNELS: GroupChannel[] = [
  { id: "general", label: "Général", icon: "🏘️", description: "Discussions du quartier" },
  { id: "urgences", label: "Urgences", icon: "🚨", description: "Alertes & urgences" },
  { id: "evenements", label: "Événements", icon: "🎉", description: "Fêtes & événements" },
  { id: "entraide", label: "Entraide", icon: "🤝", description: "Demandes d'aide" },
  { id: "annonces", label: "Annonces", icon: "📢", description: "Annonces officielles" },
];

function dmChannel(uid1: string, uid2: string): string {
  return "dm:" + [uid1, uid2].sort().join(":");
}

async function fetchMessages(channel: string): Promise<Message[]> {
  const res = await fetch(`${BASE_URL}/api/messages/${channel}`);
  if (!res.ok) throw new Error("Erreur chargement messages");
  return res.json();
}

async function fetchDMConversations(userId: string): Promise<DMConversation[]> {
  const res = await fetch(`${BASE_URL}/api/dm/conversations/${userId}`);
  if (!res.ok) return [];
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
  if (!res.ok) throw new Error("Erreur envoi");
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

function formatPreviewTime(dateStr: string): string {
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
}

function formatMsgTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

function Avatar({ uri, name, size = 50 }: { uri?: string | null; name: string; size?: number }) {
  const letter = (name || "?")[0].toUpperCase();
  const initials = name?.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase() || letter;
  return (
    <View style={[avs.wrap, { width: size, height: size, borderRadius: size / 2 }]}>
      {uri ? (
        <Image source={{ uri }} style={[avs.img, { width: size, height: size, borderRadius: size / 2 }]} />
      ) : (
        <Text style={[avs.letter, { fontSize: size * 0.38 }]}>{initials}</Text>
      )}
    </View>
  );
}
const avs = StyleSheet.create({
  wrap: { backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  img: {},
  letter: { color: "#fff", fontWeight: "700" },
});

function AudioPlayer({ audioUrl, isMe }: { audioUrl: string; isMe: boolean }) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "playing" | "paused" | "error">("idle");
  useEffect(() => { return () => { soundRef.current?.unloadAsync().catch(() => {}); }; }, []);

  const handleToggle = async () => {
    if (status === "playing") { await soundRef.current?.pauseAsync(); setStatus("paused"); return; }
    if (status === "paused" && soundRef.current) { await soundRef.current.playAsync(); setStatus("playing"); return; }
    setStatus("loading");
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true, staysActiveInBackground: false });
      if (soundRef.current) { await soundRef.current.unloadAsync(); soundRef.current = null; }
      const { sound } = await Audio.Sound.createAsync({ uri: audioUrl }, { shouldPlay: true }, (s) => {
        if (s.isLoaded && s.didJustFinish) { setStatus("idle"); soundRef.current?.unloadAsync().catch(() => {}); soundRef.current = null; }
      });
      soundRef.current = sound;
      setStatus("playing");
    } catch { setStatus("error"); Alert.alert("Erreur", "Impossible de lire ce message vocal."); }
  };

  const iconColor = isMe ? "#fff" : COLORS.primary;
  return (
    <TouchableOpacity style={aps.row} onPress={handleToggle} activeOpacity={0.75} disabled={status === "loading"}>
      <View style={[aps.btn, { borderColor: isMe ? "rgba(255,255,255,0.6)" : COLORS.primary }]}>
        {status === "loading" ? <ActivityIndicator size="small" color={iconColor} /> :
          <Text style={{ color: iconColor, fontSize: 16 }}>{status === "playing" ? "⏸" : "▶"}</Text>}
      </View>
      <View style={aps.waveRow}>
        {[5, 10, 7, 14, 9, 12, 6, 11, 8, 13, 5, 9, 7].map((h, i) => (
          <View key={i} style={[aps.bar, { height: h * 2, backgroundColor: isMe ? "rgba(255,255,255,0.6)" : "#A5D6A7" }]} />
        ))}
      </View>
      <Text style={{ color: isMe ? "rgba(255,255,255,0.85)" : COLORS.muted, fontSize: 12 }}>
        {status === "playing" ? "Lecture..." : "Vocal"}
      </Text>
    </TouchableOpacity>
  );
}
const aps = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 140 },
  btn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  waveRow: { flexDirection: "row", alignItems: "center", gap: 2, flex: 1 },
  bar: { width: 3, borderRadius: 2, opacity: 0.7 },
});

interface ActiveChat {
  channel: string;
  title: string;
  subtitle?: string;
  partnerAvatar?: string | null;
  isGroup: boolean;
}

export default function MessagesScreen() {
  const { firebaseUser, dbUser } = useAuth();
  const route = useRoute<any>();

  const [tab, setTab] = useState<"dm" | "groups">("dm");
  const [activeChat, setActiveChat] = useState<ActiveChat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [dmConversations, setDmConversations] = useState<DMConversation[]>([]);
  const [dmLoading, setDmLoading] = useState(false);
  const [text, setText] = useState("");
  const [msgLoading, setMsgLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadDMConversations = useCallback(async () => {
    if (!firebaseUser) return;
    setDmLoading(true);
    try {
      const convs = await fetchDMConversations(firebaseUser.uid);
      const sorted = [...convs].sort(
        (a, b) =>
          new Date(b.last_message_at || 0).getTime() -
          new Date(a.last_message_at || 0).getTime()
      );
      setDmConversations(sorted);
    } catch {}
    finally { setDmLoading(false); }
  }, [firebaseUser]);

  useEffect(() => {
    loadDMConversations();
    const interval = setInterval(loadDMConversations, 15000);
    return () => clearInterval(interval);
  }, [loadDMConversations]);

  useEffect(() => {
    const params = route.params as { dmUserId?: string; dmUserName?: string; dmUserAvatar?: string } | undefined;
    if (!params?.dmUserId || !firebaseUser) return;
    const channel = dmChannel(firebaseUser.uid, params.dmUserId);
    setActiveChat({
      channel,
      title: params.dmUserName || "Voisin",
      partnerAvatar: params.dmUserAvatar,
      isGroup: false,
    });
    setTab("dm");
  }, [route.params, firebaseUser]);

  const loadMessages = useCallback(async (channel: string) => {
    try {
      const data = await fetchMessages(channel);
      setMessages(data);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 50);
    } catch {}
    finally { setMsgLoading(false); }
  }, []);

  useEffect(() => {
    if (!activeChat) { if (pollingRef.current) clearInterval(pollingRef.current); return; }
    setMsgLoading(true);
    loadMessages(activeChat.channel);
    pollingRef.current = setInterval(() => loadMessages(activeChat.channel), 4000);
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [activeChat, loadMessages]);

  const sendMessage = async () => {
    if (!text.trim() || !firebaseUser || !activeChat) return;
    const textToSend = text.trim();
    setText("");
    setSending(true);
    try {
      const msg = await postMessage({
        channel: activeChat.channel,
        sender_id: firebaseUser.uid,
        sender_name: firebaseUser.displayName || dbUser?.display_name || "Voisin",
        sender_avatar: firebaseUser.photoURL || dbUser?.profile_photo || undefined,
        text: textToSend,
        message_type: "text",
      });
      setMessages((prev) => [...prev, msg]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      loadDMConversations();
    } catch (e: any) { Alert.alert("Erreur", "Message non envoyé. Réessayez."); setText(textToSend); }
    finally { setSending(false); }
  };

  const startRecording = async () => {
    if (!firebaseUser) { Alert.alert("Connexion requise", "Connectez-vous pour envoyer des messages vocaux."); return; }
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") { Alert.alert("Permission refusée", "Autorisez le micro dans les réglages."); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: newRec } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(newRec);
      setIsRecording(true);
    } catch { Alert.alert("Erreur", "Impossible de démarrer l'enregistrement."); }
  };

  const stopAndSendRecording = async () => {
    if (!recording || !firebaseUser || !activeChat) return;
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
        channel: activeChat.channel,
        sender_id: firebaseUser.uid,
        sender_name: firebaseUser.displayName || dbUser?.display_name || "Voisin",
        sender_avatar: firebaseUser.photoURL || dbUser?.profile_photo || undefined,
        audio_url: audioUrl,
        message_type: "audio",
      });
      setMessages((prev) => [...prev, msg]);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch { Alert.alert("Erreur", "Impossible d'envoyer le message vocal."); }
    finally { setSending(false); }
  };

  // ─── Écran de chat (ouvert) ───────────────────────────────────────────
  if (activeChat) {
    return (
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={80}>
        <View style={styles.chatHeader}>
          <TouchableOpacity onPress={() => { setActiveChat(null); setMessages([]); loadDMConversations(); }} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={COLORS.primary} />
          </TouchableOpacity>
          <Avatar uri={activeChat.partnerAvatar} name={activeChat.title} size={40} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.chatHeaderTitle} numberOfLines={1}>{activeChat.title}</Text>
            {activeChat.subtitle ? <Text style={styles.chatHeaderSub}>{activeChat.subtitle}</Text> : null}
          </View>
        </View>

        {msgLoading ? (
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
                  {!isMe && <Avatar uri={item.sender_avatar} name={item.sender_name} size={32} />}
                  <View style={[styles.msgBubble, isMe ? styles.myBubble : styles.otherBubble, !isMe && { marginLeft: 8 }]}>
                    {!isMe && !activeChat.isGroup === false && (
                      <Text style={styles.msgSender}>{item.sender_name}</Text>
                    )}
                    {activeChat.isGroup && !isMe && (
                      <Text style={styles.msgSender}>{item.sender_name}</Text>
                    )}
                    {item.message_type === "audio" && item.audio_url ? (
                      <AudioPlayer audioUrl={item.audio_url} isMe={isMe} />
                    ) : (
                      <Text style={[styles.msgText, isMe && styles.msgTextMe]}>{item.text}</Text>
                    )}
                    <Text style={[styles.msgTime, isMe && { color: "rgba(255,255,255,0.7)" }]}>
                      {formatMsgTime(item.created_at)}
                    </Text>
                  </View>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyChat}>
                <Ionicons name="chatbubble-ellipses-outline" size={64} color="#C8E6C9" />
                <Text style={styles.emptyChatText}>Aucun message</Text>
                <Text style={styles.emptyChatSub}>Envoyez le premier message !</Text>
              </View>
            }
            contentContainerStyle={{ padding: 12, paddingBottom: 16 }}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        {firebaseUser ? (
          <View style={styles.inputRow}>
            <TextInput
              style={styles.msgInput}
              placeholder={isRecording ? "🔴 Enregistrement..." : "Message..."}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={500}
              placeholderTextColor={isRecording ? "#D32F2F" : COLORS.muted}
              editable={!isRecording}
            />
            {text.trim().length > 0 ? (
              <TouchableOpacity style={styles.sendBtn} onPress={sendMessage} disabled={sending}>
                {sending ? <ActivityIndicator color="#fff" size="small" /> :
                  <Ionicons name="send" size={20} color="#fff" />}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.sendBtn, isRecording && styles.recordingBtn]}
                onPress={isRecording ? stopAndSendRecording : startRecording}
                disabled={sending}
              >
                <Ionicons name={isRecording ? "stop" : "mic"} size={20} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.loginInputBanner}>
            <Text style={styles.loginBannerText}>🔒 Connectez-vous dans Profil pour participer</Text>
          </View>
        )}
      </KeyboardAvoidingView>
    );
  }

  // ─── Écran liste des conversations ────────────────────────────────────
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages</Text>
      </View>

      {/* Onglets DM / Groupes */}
      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tabBtn, tab === "dm" && styles.tabBtnActive]} onPress={() => setTab("dm")}>
          <Ionicons name={tab === "dm" ? "person" : "person-outline"} size={16} color={tab === "dm" ? COLORS.primary : COLORS.muted} />
          <Text style={[styles.tabBtnText, tab === "dm" && styles.tabBtnTextActive]}>Privés</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, tab === "groups" && styles.tabBtnActive]} onPress={() => setTab("groups")}>
          <Ionicons name={tab === "groups" ? "people" : "people-outline"} size={16} color={tab === "groups" ? COLORS.primary : COLORS.muted} />
          <Text style={[styles.tabBtnText, tab === "groups" && styles.tabBtnTextActive]}>Canaux</Text>
        </TouchableOpacity>
      </View>

      {/* ── ONGLET DM ───────────────────────────────────────────────────── */}
      {tab === "dm" && (
        <>
          {!firebaseUser ? (
            <View style={styles.loginFullBanner}>
              <Ionicons name="lock-closed-outline" size={48} color="#C8E6C9" />
              <Text style={styles.loginFullTitle}>Connectez-vous pour voir vos messages</Text>
              <Text style={styles.loginFullSub}>Allez dans l'onglet Profil pour vous connecter</Text>
            </View>
          ) : dmLoading ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 60 }} />
          ) : (
            <FlatList
              data={dmConversations}
              keyExtractor={(c) => c.channel}
              refreshing={dmLoading}
              onRefresh={loadDMConversations}
              renderItem={({ item }) => {
                const isMe = item.last_sender_id === firebaseUser?.uid;
                return (
                  <TouchableOpacity
                    style={styles.waRow}
                    onPress={() =>
                      setActiveChat({
                        channel: item.channel,
                        title: item.partner_name,
                        partnerAvatar: item.partner_avatar,
                        isGroup: false,
                      })
                    }
                    activeOpacity={0.75}
                  >
                    <Avatar uri={item.partner_avatar} name={item.partner_name} size={54} />
                    <View style={styles.waBody}>
                      <View style={styles.waTopRow}>
                        <Text style={styles.waName} numberOfLines={1}>{item.partner_name}</Text>
                        <Text style={styles.waTime}>{formatPreviewTime(item.last_message_at)}</Text>
                      </View>
                      <Text style={styles.waPreview} numberOfLines={1}>
                        {isMe ? `Vous : ${item.last_message}` : item.last_message}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              }}
              ItemSeparatorComponent={() => <View style={styles.waSeparator} />}
              contentContainerStyle={{ paddingBottom: 120 }}
              ListEmptyComponent={
                <View style={styles.emptyDM}>
                  <Ionicons name="chatbubbles-outline" size={72} color="#C8E6C9" />
                  <Text style={styles.emptyDMTitle}>Aucune conversation</Text>
                  <Text style={styles.emptyDMSub}>
                    Envoyez un message à quelqu'un depuis son profil pour démarrer une discussion
                  </Text>
                </View>
              }
            />
          )}
        </>
      )}

      {/* ── ONGLET CANAUX ───────────────────────────────────────────────── */}
      {tab === "groups" && (
        <FlatList
          data={GROUP_CHANNELS}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.waRow}
              onPress={() =>
                setActiveChat({
                  channel: item.id,
                  title: item.label,
                  subtitle: item.description,
                  isGroup: true,
                })
              }
              activeOpacity={0.75}
            >
              <View style={styles.groupAvatarWrap}>
                <Text style={styles.groupAvatarText}>{item.icon}</Text>
              </View>
              <View style={styles.waBody}>
                <View style={styles.waTopRow}>
                  <Text style={styles.waName}>{item.label}</Text>
                </View>
                <Text style={styles.waPreview} numberOfLines={1}>{item.description}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.muted} />
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={styles.waSeparator} />}
          contentContainerStyle={{ paddingBottom: 120 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.card },
  header: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 54 : 20,
    paddingBottom: 12,
    backgroundColor: COLORS.card,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
  },
  headerTitle: { fontSize: 26, fontWeight: "800", color: COLORS.text },
  tabRow: {
    flexDirection: "row",
    backgroundColor: COLORS.card,
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: "#F0F2F5",
  },
  tabBtnActive: { backgroundColor: "#E8F5E9" },
  tabBtnText: { fontSize: 14, fontWeight: "600", color: COLORS.muted },
  tabBtnTextActive: { color: COLORS.primary },
  waRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: COLORS.card,
  },
  waBody: { flex: 1, marginLeft: 14 },
  waTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 },
  waName: { fontSize: 16, fontWeight: "700", color: COLORS.text, flex: 1 },
  waTime: { fontSize: 12, color: COLORS.muted, marginLeft: 8 },
  waPreview: { fontSize: 14, color: COLORS.muted },
  waSeparator: { height: 1, backgroundColor: COLORS.border, marginLeft: 82 },
  groupAvatarWrap: {
    width: 54, height: 54, borderRadius: 27, backgroundColor: "#E8F5E9",
    alignItems: "center", justifyContent: "center",
  },
  groupAvatarText: { fontSize: 26 },
  loginFullBanner: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 },
  loginFullTitle: { fontSize: 18, fontWeight: "700", color: COLORS.text, textAlign: "center" },
  loginFullSub: { fontSize: 14, color: COLORS.muted, textAlign: "center" },
  loginInputBanner: { backgroundColor: "#FFF9C4", padding: 16, alignItems: "center" },
  loginBannerText: { color: "#795548", fontSize: 13, fontWeight: "600" },
  emptyDM: { alignItems: "center", paddingTop: 80, paddingHorizontal: 32, gap: 12 },
  emptyDMTitle: { fontSize: 18, fontWeight: "700", color: COLORS.text },
  emptyDMSub: { fontSize: 14, color: COLORS.muted, textAlign: "center", lineHeight: 20 },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingTop: Platform.OS === "ios" ? 54 : 16,
    paddingBottom: 12,
    backgroundColor: COLORS.card,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: 8,
  },
  backBtn: { padding: 4 },
  chatHeaderTitle: { fontSize: 16, fontWeight: "700", color: COLORS.text },
  chatHeaderSub: { fontSize: 12, color: COLORS.muted },
  msgRow: { flexDirection: "row", marginBottom: 10, alignItems: "flex-end" },
  msgRowMe: { flexDirection: "row-reverse" },
  msgBubble: {
    maxWidth: "75%", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10,
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  myBubble: { backgroundColor: COLORS.myMsg, borderBottomRightRadius: 4, marginRight: 8 },
  otherBubble: { backgroundColor: "#F0F2F5", borderBottomLeftRadius: 4 },
  msgSender: { fontSize: 11, fontWeight: "700", color: COLORS.primary, marginBottom: 4 },
  msgText: { fontSize: 15, color: COLORS.text, lineHeight: 21 },
  msgTextMe: { color: "#fff" },
  msgTime: { fontSize: 10, color: COLORS.muted, marginTop: 4, alignSelf: "flex-end" },
  emptyChat: { alignItems: "center", paddingTop: 80, gap: 10 },
  emptyChatText: { fontSize: 17, fontWeight: "700", color: COLORS.text },
  emptyChatSub: { fontSize: 14, color: COLORS.muted },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 10,
    backgroundColor: COLORS.card,
  },
  msgInput: {
    flex: 1, backgroundColor: "#F0F2F5", borderRadius: 22, paddingHorizontal: 16,
    paddingVertical: 10, fontSize: 15, color: COLORS.text, maxHeight: 100,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary,
    alignItems: "center", justifyContent: "center",
  },
  recordingBtn: { backgroundColor: "#D32F2F" },
});
