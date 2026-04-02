import React, { useEffect, useState, useRef } from "react";
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
} from "react-native";
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db as firestore } from "../services/firebase";
import { useAuth } from "../context/AuthContext";

const COLORS = {
  primary: "#2E7D32",
  bg: "#F8F9FA",
  card: "#FFFFFF",
  text: "#1A1A2E",
  muted: "#6C757D",
  border: "#E9ECEF",
  myMsg: "#2E7D32",
  otherMsg: "#FFFFFF",
};

interface Message {
  id: string;
  text: string;
  sender_id: string;
  sender_name: string;
  sender_avatar?: string;
  created_at: any;
  channel: string;
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

export default function MessagesScreen() {
  const { firebaseUser } = useAuth();
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (!activeChannel) return;
    setLoading(true);
    const q = query(
      collection(firestore, "messages"),
      where("channel", "==", activeChannel.id),
      orderBy("created_at", "asc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const msgs = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Message));
      setMessages(msgs);
      setLoading(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    });
    return unsub;
  }, [activeChannel]);

  const sendMessage = async () => {
    if (!text.trim() || !firebaseUser || !activeChannel) return;
    setSending(true);
    try {
      await addDoc(collection(firestore, "messages"), {
        text: text.trim(),
        sender_id: firebaseUser.uid,
        sender_name: firebaseUser.displayName || "Voisin",
        sender_avatar: firebaseUser.photoURL || null,
        channel: activeChannel.id,
        created_at: serverTimestamp(),
      });
      setText("");
    } catch (e) {
      console.error("Erreur envoi:", e);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (ts: any) => {
    if (!ts) return "";
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  };

  if (!activeChannel) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Messages</Text>
          <Text style={styles.headerSub}>Canaux du quartier</Text>
        </View>
        <FlatList
          data={CHANNELS}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.channelCard} onPress={() => setActiveChannel(item)} activeOpacity={0.7}>
              <View style={styles.channelIcon}>
                <Text style={styles.channelIconText}>{item.icon}</Text>
              </View>
              <View style={styles.channelInfo}>
                <Text style={styles.channelLabel}>{item.label}</Text>
                <Text style={styles.channelDesc}>{item.description}</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          )}
          contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        />
        {!firebaseUser && (
          <View style={styles.loginBanner}>
            <Text style={styles.loginBannerText}>
              🔒 Connectez-vous dans votre Profil pour envoyer des messages
            </Text>
          </View>
        )}
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
                      <Text style={styles.msgAvatarLetter}>
                        {(item.sender_name || "?")[0].toUpperCase()}
                      </Text>
                    )}
                  </View>
                )}
                <View style={[styles.msgBubble, isMe ? styles.myBubble : styles.otherBubble]}>
                  {!isMe && (
                    <Text style={styles.msgSender}>{item.sender_name}</Text>
                  )}
                  <Text style={[styles.msgText, isMe && styles.msgTextMe]}>{item.text}</Text>
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
              <Text style={styles.emptyChatText}>Pas encore de messages</Text>
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
            placeholder="Écrire un message..."
            value={text}
            onChangeText={setText}
            multiline
            maxLength={500}
            placeholderTextColor={COLORS.muted}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={!text.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.sendBtnIcon}>➤</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.loginInputBanner}>
          <Text style={styles.loginBannerText}>
            🔒 Connectez-vous pour participer à la discussion
          </Text>
        </View>
      )}
    </KeyboardAvoidingView>
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
  channelCard: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  channelIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#E8F5E9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  channelIconText: { fontSize: 26 },
  channelInfo: { flex: 1 },
  channelLabel: { fontSize: 16, fontWeight: "700", color: COLORS.text },
  channelDesc: { fontSize: 12, color: COLORS.muted, marginTop: 2 },
  chevron: { fontSize: 24, color: COLORS.muted },
  loginBanner: {
    backgroundColor: "#FFF9C4",
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 100,
    borderRadius: 12,
  },
  loginBannerText: { textAlign: "center", color: "#795548", fontSize: 13, fontWeight: "600" },
  chatHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 14,
    backgroundColor: COLORS.card,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    gap: 12,
  },
  backBtn: { padding: 4 },
  backBtnText: { fontSize: 32, color: COLORS.primary, lineHeight: 36 },
  chatHeaderIcon: { fontSize: 28 },
  chatHeaderTitle: { fontSize: 16, fontWeight: "700", color: COLORS.text },
  chatHeaderSub: { fontSize: 12, color: COLORS.muted },
  msgRow: { flexDirection: "row", marginBottom: 12, alignItems: "flex-end" },
  msgRowMe: { flexDirection: "row-reverse" },
  msgAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    overflow: "hidden",
  },
  msgAvatarImg: { width: 36, height: 36, borderRadius: 18 },
  msgAvatarLetter: { color: "#fff", fontWeight: "700", fontSize: 14 },
  msgBubble: {
    maxWidth: "75%",
    borderRadius: 16,
    padding: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  myBubble: { backgroundColor: COLORS.myMsg, borderBottomRightRadius: 4 },
  otherBubble: { backgroundColor: COLORS.otherMsg, borderBottomLeftRadius: 4 },
  msgSender: { fontSize: 11, fontWeight: "700", color: COLORS.primary, marginBottom: 4 },
  msgText: { fontSize: 14, color: COLORS.text, lineHeight: 20 },
  msgTextMe: { color: "#fff" },
  msgTime: { fontSize: 10, color: COLORS.muted, marginTop: 4, alignSelf: "flex-end" },
  emptyChat: { alignItems: "center", paddingTop: 80 },
  emptyChatIcon: { fontSize: 60, marginBottom: 12 },
  emptyChatText: { fontSize: 18, fontWeight: "700", color: COLORS.text },
  emptyChatSub: { fontSize: 13, color: COLORS.muted, marginTop: 6 },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: 12,
    backgroundColor: COLORS.card,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 10,
  },
  msgInput: {
    flex: 1,
    backgroundColor: COLORS.bg,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.text,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { backgroundColor: "#A5D6A7" },
  sendBtnIcon: { color: "#fff", fontSize: 18 },
  loginInputBanner: {
    backgroundColor: "#FFF9C4",
    padding: 14,
    margin: 12,
    borderRadius: 12,
  },
});
