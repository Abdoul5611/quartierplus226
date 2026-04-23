import express from "express";
import http from "http";
import WebSocket from "ws";
import path from "path";
import { db } from "../db";
import { users, posts, marche, publications, messages, votes, transactions, videoViews, walletTransactions, helpRequests, lotoTickets, courses, courseParis, quizSessions } from "../db/schema";
import { eq, desc, sql as drizzleSql } from "drizzle-orm";
import { cloudinary } from "../lib/cloudinary";
import { verify as totpVerify, generate as totpGenerate, generateSecret } from "otplib";
import * as admin from "firebase-admin";

const ADMIN_EMAIL = "administrateurquartierplus@gmail.com";
const ADMIN_EMAILS = [ADMIN_EMAIL];

// ─── Firebase Admin Init ───────────────────────────────────────────────
(function initFirebaseAdmin() {
  if (admin.apps.length) return;
  try {
    const raw = (process.env.FIREBASE_SERVICE_ACCOUNT_KEY || "").trim();
    const isValidJson = raw.startsWith("{") && raw.endsWith("}");
    if (isValidJson) {
      const serviceAccount = JSON.parse(raw);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      console.log("[Firebase Admin] Initialisé via SERVICE_ACCOUNT_KEY");
      return;
    }
    const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
    const projectId = process.env.FIREBASE_PROJECT_ID || "quartierplus2026";
    if (privateKey && privateKey.includes("PRIVATE KEY")) {
      const clientEmail = `firebase-adminsdk@${projectId}.iam.gserviceaccount.com`;
      admin.initializeApp({
        credential: admin.credential.cert({ projectId, privateKey, clientEmail }),
      });
      console.log("[Firebase Admin] Initialisé via FIREBASE_PRIVATE_KEY");
    } else {
      console.warn("[Firebase Admin] Credentials invalides — push FCM via Expo Push Service uniquement.");
    }
  } catch (e: any) {
    console.error("[Firebase Admin] Erreur init:", e?.message);
  }
})();

let wss: WebSocket.Server | null = null;

function broadcastToAll(msg: object) {
  if (!wss) return;
  const payload = JSON.stringify(msg);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

const gameEnabled: { course: boolean; quiz: boolean; loto: boolean } = { course: true, quiz: true, loto: true };
let serviceFeePercent: number = 0.20;
let serviceFcfa: number | null = null;

const userConnections = new Map<string, Set<WebSocket>>();

function broadcastToUser(uid: string, msg: object) {
  const conns = userConnections.get(uid);
  if (!conns) return;
  const payload = JSON.stringify(msg);
  conns.forEach((ws) => { if (ws.readyState === WebSocket.OPEN) ws.send(payload); });
}

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function getOtpExpiry(minutes = 10): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}

function toSnake(obj: any): any {
  if (Array.isArray(obj)) return obj.map(toSnake);
  if (obj === null || typeof obj !== "object" || obj instanceof Date) return obj;
  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    const snakeKey = k.replace(/([A-Z])/g, "_$1").toLowerCase();
    result[snakeKey] = toSnake(v);
  }
  return result;
}

const app = express();
const PORT = 5000;
const EXPO_PORT = 8081;

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type,Authorization,X-Requested-With,Accept");
  res.header("Access-Control-Max-Age", "86400");
  if (_req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ─── Health ───────────────────────────────────────────────────────────
app.get("/api/health", async (_req, res) => {
  try {
    await db.select().from(users).limit(1);
    res.json({ status: "ok", services: { database: "connected", cloudinary: "configured" } });
  } catch (err: any) {
    console.error("[Health] DB error:", err?.message, err?.cause?.message);
    res.status(500).json({ status: "error", message: String(err) });
  }
});

// ─── Posts ────────────────────────────────────────────────────────────
app.get("/api/posts", async (_req, res) => {
  try {
    const result = await db.select().from(posts).orderBy(desc(posts.createdAt)).limit(100);
    const now = new Date();
    const boosted = result.filter(p => p.isBoosted && p.boostExpiresAt && new Date(p.boostExpiresAt) > now);
    const normal = result.filter(p => !(p.isBoosted && p.boostExpiresAt && new Date(p.boostExpiresAt) > now));
    res.json(toSnake([...boosted, ...normal]));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/posts/author/:uid", async (req, res) => {
  try {
    const { uid } = req.params;
    const result = await db.select().from(posts)
      .where(eq(posts.authorId, uid))
      .orderBy(desc(posts.createdAt))
      .limit(50);
    res.json(toSnake(result));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

async function sendExpoPushNotifications(tokens: string[], title: string, body: string, data?: object) {
  if (!tokens.length) return;
  const messages = tokens.map((to) => ({ to, sound: "default", title, body, data: data || {} }));
  const chunks: typeof messages[] = [];
  for (let i = 0; i < messages.length; i += 100) chunks.push(messages.slice(i, i + 100));
  for (const chunk of chunks) {
    fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Accept": "application/json", "Accept-Encoding": "gzip, deflate", "Content-Type": "application/json" },
      body: JSON.stringify(chunk),
    }).catch(() => {});
  }
}

app.post("/api/posts", async (req, res) => {
  try {
    const { author_id, author_name, author_avatar, content, image_uri, video_uri, category, is_emergency, latitude, longitude, poll_options, is_cours, cours_price } = req.body;
    const [post] = await db.insert(posts).values({
      authorId: author_id,
      authorName: author_name,
      authorAvatar: author_avatar || null,
      content,
      imageUri: image_uri || null,
      videoUri: video_uri || null,
      category: category || "general",
      isEmergency: is_emergency || false,
      pollOptions: poll_options || null,
      isCours: is_cours || false,
      coursPrice: cours_price || null,
      paidBy: [],
      likes: [],
      comments: [],
      latitude: latitude != null ? String(latitude) : null,
      longitude: longitude != null ? String(longitude) : null,
    } as any).returning();
    res.json(toSnake(post));

    db.select({ pushToken: users.pushToken })
      .from(users)
      .then((allUsers) => {
        const tokens = allUsers
          .map((u) => u.pushToken)
          .filter((t): t is string => !!t && t !== "" && t.startsWith("ExponentPushToken"));
        const emoji = is_emergency ? "🚨" : "🏘️";
        sendExpoPushNotifications(
          tokens,
          `${emoji} ${author_name || "Voisin"} a publié`,
          content?.slice(0, 80) || "Nouvelle publication dans le quartier",
          { postId: post.id, type: "new_post" }
        );
      })
      .catch(() => {});
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.delete("/api/posts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    const [post] = await db.select().from(posts).where(eq(posts.id, id));
    if (!post) return res.status(404).json({ error: "Post introuvable" });
    if (post.authorId !== userId) return res.status(403).json({ error: "Non autorisé" });

    const extractPublicId = (url: string): string | null => {
      const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[^.]+$/);
      return match ? match[1] : null;
    };

    if (post.imageUri) {
      const pid = extractPublicId(post.imageUri);
      if (pid) await cloudinary.uploader.destroy(pid, { resource_type: "image" }).catch(() => {});
    }
    if (post.videoUri) {
      const pid = extractPublicId(post.videoUri);
      if (pid) await cloudinary.uploader.destroy(pid, { resource_type: "video" }).catch(() => {});
    }

    await db.delete(posts).where(eq(posts.id, id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/posts/:id/like", async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;
    const [post] = await db.select().from(posts).where(eq(posts.id, id));
    if (!post) return res.status(404).json({ error: "Post introuvable" });
    let likes: string[] = Array.isArray(post.likes) ? (post.likes as string[]) : [];
    const wasAlreadyLiked = likes.includes(userId);
    if (wasAlreadyLiked) {
      likes = likes.filter((l) => l !== userId);
    } else {
      likes = [...likes, userId];
    }
    const [updated] = await db.update(posts).set({ likes: likes as any }).where(eq(posts.id, id)).returning();
    res.json(toSnake(updated));

    if (!wasAlreadyLiked && post.authorId && post.authorId !== userId) {
      db.select({ pushToken: users.pushToken })
        .from(users)
        .where(eq(users.firebaseUid, post.authorId))
        .then(([author]) => {
          if (author?.pushToken?.startsWith("ExponentPushToken")) {
            sendExpoPushNotifications(
              [author.pushToken],
              "❤️ Nouveau like",
              `Quelqu'un a aimé votre publication`,
              { postId: post.id, type: "new_like" }
            );
          }
        })
        .catch(() => {});
    }
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/posts/:id/comments", async (req, res) => {
  try {
    const { id } = req.params;
    const { author_id, author_name, author_avatar, text } = req.body;
    if (!author_id || !text?.trim()) return res.status(400).json({ error: "author_id et text requis" });

    const [post] = await db.select().from(posts).where(eq(posts.id, id));
    if (!post) return res.status(404).json({ error: "Post introuvable" });

    const existing: any[] = Array.isArray(post.comments) ? (post.comments as any[]) : [];
    const newComment = {
      id: require("crypto").randomUUID(),
      author_id,
      author_name,
      author_avatar: author_avatar || null,
      text: text.trim(),
      created_at: new Date().toISOString(),
    };
    const updated_comments = [...existing, newComment];
    const [updated] = await db
      .update(posts)
      .set({ comments: updated_comments as any })
      .where(eq(posts.id, id))
      .returning();
    res.json(toSnake(updated));

    if (post.authorId && post.authorId !== author_id) {
      db.select({ pushToken: users.pushToken })
        .from(users)
        .where(eq(users.firebaseUid, post.authorId))
        .then(([author]) => {
          if (author?.pushToken?.startsWith("ExponentPushToken")) {
            sendExpoPushNotifications(
              [author.pushToken],
              `💬 ${author_name || "Un voisin"} a commenté`,
              text?.slice(0, 80) || "a commenté votre publication",
              { postId: id, type: "new_comment" }
            );
          }
        })
        .catch(() => {});
    }
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Polls ────────────────────────────────────────────────────────────
app.get("/api/polls/:postId/results", async (req, res) => {
  try {
    const { postId } = req.params;
    const { userId } = req.query as { userId?: string };

    const [post] = await db.select({ pollOptions: posts.pollOptions }).from(posts).where(eq(posts.id, postId));
    if (!post || !post.pollOptions) return res.status(404).json({ error: "Sondage introuvable" });

    const options = post.pollOptions as { label: string }[];
    const allVotes = await db.select().from(votes).where(eq(votes.postId, postId));

    const results = options.map((_: any, i: number) => allVotes.filter((v: any) => v.optionIndex === i).length);

    let userVote: number | null = null;
    if (userId) {
      const myVote = allVotes.find((v: any) => v.userId === userId);
      if (myVote) userVote = myVote.optionIndex;
    }

    res.json({ results, userVote });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/polls/:postId/vote", async (req, res) => {
  try {
    const { postId } = req.params;
    const { userId, optionIndex } = req.body;
    if (!userId || optionIndex === undefined) return res.status(400).json({ error: "userId et optionIndex requis" });

    const [post] = await db.select({ pollOptions: posts.pollOptions }).from(posts).where(eq(posts.id, postId));
    if (!post || !post.pollOptions) return res.status(404).json({ error: "Sondage introuvable" });

    const existing = await db.select().from(votes).where(eq(votes.postId, postId));
    const alreadyVoted = existing.find((v: any) => v.userId === userId);
    if (alreadyVoted) return res.status(409).json({ error: "Vous avez déjà voté pour ce sondage" });

    await db.insert(votes).values({ postId, userId, optionIndex });

    const options = post.pollOptions as { label: string }[];
    const allVotes = await db.select().from(votes).where(eq(votes.postId, postId));
    const results = options.map((_: any, i: number) => allVotes.filter((v: any) => v.optionIndex === i).length);

    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Users ────────────────────────────────────────────────────────────
app.get("/api/users", async (_req, res) => {
  try {
    const result = await db.select().from(users).limit(50);
    res.json(toSnake(result));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/users/firebase/:uid", async (req, res) => {
  try {
    const { uid } = req.params;
    const [user] = await db.select().from(users).where(eq(users.firebaseUid, uid));
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
    res.json(toSnake(user));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

const REFERRAL_BONUS_POINTS = 10;

app.post("/api/users", async (req, res) => {
  try {
    const { firebase_uid, email, display_name, referral_code } = req.body;
    const existing = await db.select().from(users).where(eq(users.firebaseUid, firebase_uid));
    if (existing.length > 0) return res.json(toSnake(existing[0]));

    let referrerId: string | null = null;
    if (referral_code) {
      const [referrer] = await db.select().from(users).where(eq(users.referralCode, referral_code));
      if (referrer) referrerId = referrer.firebaseUid!;
    }

    const generatedCode = Math.random().toString(36).substring(2, 8).toUpperCase();

    const [user] = await db.insert(users).values({
      firebaseUid: firebase_uid,
      email,
      displayName: display_name,
      username: display_name?.toLowerCase().replace(/\s+/g, "_"),
      referralCode: generatedCode,
      referredBy: referral_code || null,
      points: 10,
      merciCount: 0,
      lendingCount: 0,
      walletBalance: 0,
      isPremium: false,
      isVerified: false,
      isBanned: false,
    } as any).returning();

    if (referrerId) {
      const [referrer] = await db.select().from(users).where(eq(users.firebaseUid, referrerId));
      if (referrer) {
        const newPoints = (referrer.points ?? 0) + REFERRAL_BONUS_POINTS;
        await db.update(users).set({ points: newPoints } as any).where(eq(users.firebaseUid, referrerId));
        await logTransaction("referral_bonus", "system", referrerId, REFERRAL_BONUS_POINTS, 0, `Parrainage : ${email} a rejoint via votre code`);
      }
    }

    res.json(toSnake(user));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

function mapUserBody(body: Record<string, any>): Record<string, any> {
  const map: Record<string, string> = {
    display_name: "displayName",
    profile_photo: "profilePhoto",
    cover_photo: "coverPhoto",
    hometown: "hometown",
    work: "work",
    bio: "bio",
    quartier: "quartier",
    avatar: "avatar",
    is_premium: "isPremium",
    is_verified: "isVerified",
    points: "points",
    wallet_balance: "walletBalance",
    merci_count: "merciCount",
    lending_count: "lendingCount",
    stripe_customer_id: "stripeCustomerId",
    referral_code: "referralCode",
    referred_by: "referredBy",
    firebase_uid: "firebaseUid",
  };
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(body)) {
    out[map[k] ?? k] = v;
  }
  return out;
}

app.patch("/api/users/firebase/:uid", async (req, res) => {
  try {
    const { uid } = req.params;
    const updates = mapUserBody(req.body);
    const [user] = await db.update(users).set(updates).where(eq(users.firebaseUid, uid)).returning();
    res.json(toSnake(user));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/users/:uid/push-token", async (req, res) => {
  try {
    const { uid } = req.params;
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "Token manquant" });
    await db.update(users).set({ pushToken: token } as any).where(eq(users.firebaseUid, uid));
    res.json({ success: true, token });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.patch("/api/users/:uid/settings", async (req, res) => {
  try {
    const { uid } = req.params;
    const { notifications_enabled, location_visible } = req.body;
    const updates: Record<string, any> = {};
    if (notifications_enabled !== undefined) updates.notificationsEnabled = notifications_enabled;
    if (location_visible !== undefined) updates.locationVisible = location_visible;
    const [user] = await db.update(users).set(updates).where(eq(users.firebaseUid, uid)).returning();
    res.json(toSnake(user));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.patch("/api/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = mapUserBody(req.body);
    const [user] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    res.json(toSnake(user));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Suppression de compte utilisateur ────────────────────────────────
app.delete("/api/users/firebase/:uid", async (req, res) => {
  try {
    const { uid } = req.params;
    await db.delete(posts).where(eq(posts.authorId, uid));
    await db.delete(marche).where(eq(marche.vendeurId, uid));
    await db.delete(users).where(eq(users.firebaseUid, uid));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Marché ───────────────────────────────────────────────────────────
app.get("/api/marche", async (_req, res) => {
  try {
    const result = await db.select().from(marche).orderBy(desc(marche.createdAt)).limit(100);
    res.json(toSnake(result));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/marche", async (req, res) => {
  try {
    const { vendeur_id, titre, description, prix, categorie, quartier, image_url, disponible } = req.body;
    const { prime_partage, prime_amount, vendeur_firebase_uid } = req.body;
    const [item] = await db.insert(marche).values({
      vendeurId: vendeur_id,
      vendeurFirebaseUid: vendeur_firebase_uid || null,
      titre,
      description,
      prix: prix || null,
      categorie,
      quartier,
      imageUrl: image_url,
      disponible: disponible !== false,
      primePartage: prime_partage || false,
      primeAmount: prime_amount || 0,
    } as any).returning();
    res.json(toSnake(item));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Messages ─────────────────────────────────────────────────────────
app.get("/api/messages/:channel", async (req, res) => {
  try {
    const { channel } = req.params;
    const result = await db
      .select()
      .from(messages)
      .where(eq(messages.channel, channel))
      .orderBy(messages.createdAt)
      .limit(100);
    res.json(toSnake(result));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/messages", async (req, res) => {
  try {
    const { channel, sender_id, sender_name, sender_avatar, text, audio_url, message_type } = req.body;
    if (!sender_id || !sender_name) return res.status(400).json({ error: "sender_id et sender_name requis" });
    if (!text && !audio_url) return res.status(400).json({ error: "text ou audio_url requis" });
    const [msg] = await db.insert(messages).values({
      channel: channel || "general",
      senderId: sender_id,
      senderName: sender_name,
      senderAvatar: sender_avatar || null,
      text: text || null,
      audioUrl: audio_url || null,
      messageType: message_type || "text",
    } as any).returning();
    res.json(toSnake(msg));

    if (channel?.startsWith("dm:")) {
      const parts = (channel as string).split(":");
      const recipientUid = parts.find((p) => p !== "dm" && p !== sender_id);
      if (recipientUid) {
        db.select({ pushToken: users.pushToken })
          .from(users)
          .where(eq(users.firebaseUid, recipientUid))
          .then(([recipient]) => {
            if (recipient?.pushToken?.startsWith("ExponentPushToken")) {
              sendExpoPushNotifications(
                [recipient.pushToken],
                `✉️ ${sender_name || "Un voisin"}`,
                text?.slice(0, 80) || "Vous avez un nouveau message",
                { channel, type: "new_dm" }
              );
            }
          })
          .catch(() => {});
      }
    }
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── DM : liste des conversations d'un utilisateur ───────────────────
app.get("/api/dm/conversations/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: "userId requis" });

    // Trouver tous les canaux DM où l'utilisateur a envoyé au moins un message
    const sentChannels = await db
      .selectDistinct({ channel: messages.channel })
      .from(messages)
      .where(drizzleSql`${messages.channel} LIKE ${'dm:%'} AND ${messages.senderId} = ${userId}`);

    // Trouver aussi les canaux DM où le canal contient l'userId (reçus)
    const receivedChannels = await db
      .selectDistinct({ channel: messages.channel })
      .from(messages)
      .where(drizzleSql`${messages.channel} LIKE ${'dm:' + userId + ':%'} OR ${messages.channel} LIKE ${'dm:%:' + userId}`);

    const allChannels = Array.from(
      new Set([...sentChannels, ...receivedChannels].map((r) => r.channel))
    );

    if (!allChannels.length) return res.json([]);

    // Pour chaque canal, récupérer le dernier message + infos du partenaire
    const conversations = await Promise.all(
      allChannels.map(async (channel) => {
        const [latest] = await db
          .select()
          .from(messages)
          .where(eq(messages.channel, channel))
          .orderBy(desc(messages.createdAt))
          .limit(1);

        const [partnerMsg] = await db
          .select()
          .from(messages)
          .where(drizzleSql`${messages.channel} = ${channel} AND ${messages.senderId} != ${userId}`)
          .orderBy(desc(messages.createdAt))
          .limit(1);

        if (!latest) return null;

        const partnerParts = channel.replace("dm:", "").split(":");
        const partnerId = partnerParts.find((p) => p !== userId) || partnerMsg?.senderId || "";

        return {
          channel,
          partner_id: partnerId,
          partner_name: partnerMsg?.senderName || "Voisin",
          partner_avatar: partnerMsg?.senderAvatar || null,
          last_message:
            latest.messageType === "audio" ? "🎵 Message vocal" : latest.text || "",
          last_message_type: latest.messageType,
          last_message_at: latest.createdAt,
          last_sender_id: latest.senderId,
        };
      })
    );

    const result = conversations
      .filter(Boolean)
      .sort(
        (a: any, b: any) =>
          new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
      );

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Profile update (POST alias) ─────────────────────────────────────
app.post("/api/profile/update", async (req, res) => {
  try {
    const { firebase_uid, ...fields } = req.body;
    if (!firebase_uid) return res.status(400).json({ error: "firebase_uid requis" });
    const updates = mapUserBody(fields);
    const [user] = await db.update(users).set(updates).where(eq(users.firebaseUid, firebase_uid)).returning();
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
    res.json(toSnake(user));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Messages vocaux (combiné upload + sauvegarde Neon) ───────────────
app.post("/api/voice-messages", async (req, res) => {
  try {
    const { base64, channel, sender_id, sender_name, sender_avatar } = req.body;
    if (!base64) return res.status(400).json({ error: "base64 audio requis" });
    if (!sender_id || !sender_name) return res.status(400).json({ error: "sender_id et sender_name requis" });
    const uploadResult = await cloudinary.uploader.upload(
      `data:audio/mpeg;base64,${base64}`,
      { folder: "quartierplus/audio", resource_type: "video" }
    );
    const audioUrl = uploadResult.secure_url;
    const [msg] = await db.insert(messages).values({
      channel: channel || "general",
      senderId: sender_id,
      senderName: sender_name,
      senderAvatar: sender_avatar || null,
      text: null,
      audioUrl,
      messageType: "audio",
    } as any).returning();
    res.json(toSnake(msg));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Wallet / Monétisation ─────────────────────────────────────────────
const COMMISSION_RATE = 0.10; // 10%
const ADMIN_UID = "quartierplus-admin";

async function logTransaction(type: string, fromUid: string | null, toUid: string | null, amount: number, commission: number, description: string, relatedId?: string) {
  await db.insert(transactions).values({
    type, fromUid, toUid, amount, commission, description,
    relatedId: relatedId || null,
    status: "completed",
  } as any);
}

// Payer pour un cours
app.post("/api/wallet/pay-course", async (req, res) => {
  try {
    const { postId, studentUid, teacherUid, amount } = req.body;
    if (!postId || !studentUid || !teacherUid || !amount) return res.status(400).json({ error: "Paramètres manquants" });

    const [student] = await db.select().from(users).where(eq(users.firebaseUid, studentUid));
    const [teacher] = await db.select().from(users).where(eq(users.firebaseUid, teacherUid));
    if (!student) return res.status(404).json({ error: "Élève introuvable" });
    if (!teacher) return res.status(404).json({ error: "Professeur introuvable" });

    const studentBalance = student.walletBalance ?? 0;
    if (studentBalance < amount) return res.status(402).json({ error: `Solde insuffisant. Vous avez ${studentBalance} F, cours coûte ${amount} F.` });

    const [post] = await db.select().from(posts).where(eq(posts.id, postId));
    if (!post) return res.status(404).json({ error: "Cours introuvable" });
    const alreadyPaid: string[] = Array.isArray(post.paidBy) ? (post.paidBy as string[]) : [];
    if (alreadyPaid.includes(studentUid)) return res.status(409).json({ error: "Vous avez déjà payé ce cours" });

    await db.update(users).set({ walletBalance: studentBalance - amount } as any).where(eq(users.firebaseUid, studentUid));
    await db.update(users).set({ walletBalance: (teacher.walletBalance ?? 0) + amount } as any).where(eq(users.firebaseUid, teacherUid));
    await db.update(posts).set({ paidBy: [...alreadyPaid, studentUid] } as any).where(eq(posts.id, postId));

    await logTransaction("course_payment", studentUid, teacherUid, amount, 0,
      `Paiement cours: "${post.content?.slice(0, 40) || "Cours"}"`, postId);

    res.json({ success: true, newBalance: studentBalance - amount });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Transférer une prime de partage
app.post("/api/wallet/transfer-prime", async (req, res) => {
  try {
    const { itemId, vendeurUid, helperUid, amount } = req.body;
    if (!itemId || !vendeurUid || !helperUid || !amount) return res.status(400).json({ error: "Paramètres manquants" });

    const [vendeur] = await db.select().from(users).where(eq(users.firebaseUid, vendeurUid));
    const [helper] = await db.select().from(users).where(eq(users.firebaseUid, helperUid));
    if (!vendeur) return res.status(404).json({ error: "Vendeur introuvable" });
    if (!helper) return res.status(404).json({ error: "Aidant introuvable" });

    const vendeurBalance = vendeur.walletBalance ?? 0;
    if (vendeurBalance < amount) return res.status(402).json({ error: `Solde vendeur insuffisant (${vendeurBalance} F disponibles)` });

    const [item] = await db.select().from(marche).where(eq(marche.id, itemId));
    if (!item) return res.status(404).json({ error: "Article introuvable" });

    await db.update(users).set({ walletBalance: vendeurBalance - amount } as any).where(eq(users.firebaseUid, vendeurUid));
    await db.update(users).set({ walletBalance: (helper.walletBalance ?? 0) + amount } as any).where(eq(users.firebaseUid, helperUid));

    await logTransaction("prime_transfer", vendeurUid, helperUid, amount, 0,
      `Prime de partage: "${item.titre?.slice(0, 40) || "Article"}"`, itemId);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Retrait avec commission 10%
app.post("/api/wallet/withdraw", async (req, res) => {
  try {
    const { userUid, amount } = req.body;
    if (!userUid || !amount || amount <= 0) return res.status(400).json({ error: "Paramètres invalides" });

    const [user] = await db.select().from(users).where(eq(users.firebaseUid, userUid));
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });

    const balance = user.walletBalance ?? 0;
    if (balance < amount) return res.status(402).json({ error: `Solde insuffisant (${balance} F disponibles)` });

    const commission = Math.ceil(amount * COMMISSION_RATE);
    const net = amount - commission;

    await db.update(users).set({ walletBalance: balance - amount } as any).where(eq(users.firebaseUid, userUid));

    const [admin] = await db.select().from(users).where(eq(users.firebaseUid, ADMIN_UID));
    if (admin) {
      await db.update(users).set({ walletBalance: (admin.walletBalance ?? 0) + commission } as any).where(eq(users.firebaseUid, ADMIN_UID));
    }

    await logTransaction("withdrawal", userUid, null, net, commission,
      `Retrait de ${amount.toLocaleString("fr-FR")} F (commission: ${commission} F)`, undefined);
    await logTransaction("commission", userUid, ADMIN_UID, commission, 0,
      `Commission retrait ${user.displayName || userUid}`, undefined);

    res.json({ success: true, net, commission, newBalance: balance - amount });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Historique des transactions
app.get("/api/wallet/transactions/:uid", async (req, res) => {
  try {
    const { uid } = req.params;
    const result = await db.select().from(transactions)
      .where(drizzleSql`${transactions.fromUid} = ${uid} OR ${transactions.toUid} = ${uid}`)
      .orderBy(desc(transactions.createdAt))
      .limit(50);
    res.json(toSnake(result));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Mobile Money (FedaPay) ─────────────────────────────────────────────
const FEDAPAY_SECRET_KEY = process.env.FEDAPAY_SECRET_KEY || process.env.FEDAPAY_API_KEY || "";
const FEDAPAY_PUBLIC_KEY = process.env.FEDAPAY_PUBLIC_KEY || "";
const SUPPORT_EMAIL = "abdoulquartierplus@gmail.com";

// Auto-détection sandbox/production selon le préfixe de la clé
// sk_sandbox_... → sandbox | sk_live_... → production | FEDAPAY_ENV force si défini
function detectFedapayEnv(): "production" | "sandbox" {
  const forced = process.env.FEDAPAY_ENV;
  if (forced === "sandbox") return "sandbox";
  if (forced === "production") return "production";
  if (FEDAPAY_SECRET_KEY.startsWith("sk_sandbox_") || FEDAPAY_SECRET_KEY.startsWith("sk_test_")) return "sandbox";
  if (FEDAPAY_SECRET_KEY.startsWith("sk_live_")) return "production";
  return "sandbox";
}
const FEDAPAY_ENV = detectFedapayEnv();
const FEDAPAY_BASE = FEDAPAY_ENV === "production" ? "https://api.fedapay.com/v1" : "https://sandbox.fedapay.com/v1";
console.log(`[FedaPay] Environnement: ${FEDAPAY_ENV} → ${FEDAPAY_BASE}`);

const REPLIT_BASE_URL = process.env.REPLIT_DEV_DOMAIN
  ? `https://${process.env.REPLIT_DEV_DOMAIN}`
  : process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
    : "https://af2d56f6-fd65-4578-aadc-fc30403c16f9-00-1dh6u2qesxr4w.janeway.replit.dev";

app.get("/api/config/payment", (_req, res) => {
  res.json({
    fedapay_public_key: FEDAPAY_PUBLIC_KEY,
    support_email: SUPPORT_EMAIL,
    boost_price: 500,
  });
});

async function fedapayRequest(method: string, path: string, body?: Record<string, any>) {
  const res = await fetch(`${FEDAPAY_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${FEDAPAY_SECRET_KEY}`,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json() as any;
  if (!res.ok) throw new Error(data?.message || data?.error || `FedaPay error ${res.status}`);
  return data;
}

app.post("/api/payment/mm/initiate", async (req, res) => {
  try {
    if (!FEDAPAY_SECRET_KEY) return res.status(503).json({ error: "Paiement Mobile Money non configuré. Contactez l'administrateur." });
    const { userUid, userEmail, amount, phoneNumber, countryCode, operatorId } = req.body;
    if (!userUid || !amount || !phoneNumber || !operatorId) return res.status(400).json({ error: "Paramètres manquants" });

    const [user] = await db.select().from(users).where(eq(users.firebaseUid, userUid));
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });

    const txData = await fedapayRequest("POST", "/transactions", {
      description: "Recharge Wallet QuartierPlus",
      amount,
      currency: { iso: "XOF" },
      callback_url: `${REPLIT_BASE_URL}/api/payment/mm/webhook`,
      customer: {
        email: userEmail || `user-${userUid}@quartierplus.app`,
        phone_number: { number: phoneNumber, country: countryCode },
      },
    });
    const fedaTxId = txData.v1?.transaction?.id || txData.transaction?.id;
    if (!fedaTxId) throw new Error("Impossible de créer la transaction FedaPay");

    await fedapayRequest("POST", `/transactions/${fedaTxId}/pay`, {
      payment_method: operatorId,
      customer_info: { phone_number: phoneNumber },
    });

    res.json({ txId: String(fedaTxId), status: "pending" });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Erreur paiement Mobile Money" });
  }
});

app.get("/api/payment/mm/status/:txId", async (req, res) => {
  try {
    if (!FEDAPAY_SECRET_KEY) return res.status(503).json({ error: "Non configuré" });
    const { txId } = req.params;
    const { userUid, amount } = req.query as { userUid?: string; amount?: string };
    if (!userUid || !amount) return res.status(400).json({ error: "Paramètres manquants" });

    const txData = await fedapayRequest("GET", `/transactions/${txId}`);
    const tx = txData.v1?.transaction || txData.transaction;
    const status: string = tx?.status || "pending";

    if (status === "approved") {
      const [user] = await db.select().from(users).where(eq(users.firebaseUid, userUid));
      if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });

      const credited = await db.select().from(transactions).where(
        eq(transactions.description, `MM-${txId}`)
      );
      if (credited.length === 0) {
        const amountNum = parseInt(amount as string, 10);
        await db.update(users).set({ walletBalance: (user.walletBalance ?? 0) + amountNum } as any).where(eq(users.firebaseUid, userUid));
        await logTransaction("mobile_money_deposit", "fedapay", userUid, amountNum, 0, `MM-${txId}`, txId);
        const [updated] = await db.select().from(users).where(eq(users.firebaseUid, userUid));
        return res.json({ status: "approved", newBalance: updated.walletBalance ?? 0 });
      }
      const [updated] = await db.select().from(users).where(eq(users.firebaseUid, userUid));
      return res.json({ status: "approved", newBalance: updated.walletBalance ?? 0 });
    }

    res.json({ status });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Erreur vérification" });
  }
});

// ─── Boost Annonce via FedaPay ─────────────────────────────────────────
const BOOST_PRICE = 500;
const BOOST_DURATION_HOURS = 48;

async function applyBoostToItem(targetId: string, targetType: string) {
  const boostExpiresAt = new Date(Date.now() + BOOST_DURATION_HOURS * 3600 * 1000);
  if (targetType === "post") {
    await db.update(posts).set({ isBoosted: true, boostExpiresAt } as any).where(eq(posts.id, targetId));
  } else {
    await db.update(marche).set({ isBoosted: true, boostExpiresAt } as any).where(eq(marche.id, targetId));
  }
  return boostExpiresAt;
}

async function creditAdminsForBoost(fromUid: string, targetId: string) {
  const share = Math.floor(BOOST_PRICE / ADMIN_EMAILS.length);
  for (const adminEmail of ADMIN_EMAILS) {
    const [adminUser] = await db.select().from(users).where(eq(users.email, adminEmail));
    if (adminUser) {
      await db.update(users).set({ walletBalance: (adminUser.walletBalance ?? 0) + share } as any).where(eq(users.email, adminEmail));
      await logTransaction("boost", fromUid, adminUser.firebaseUid || ADMIN_UID, share, 0,
        `Boost publicitaire — propulsé 48h`, targetId);
    }
  }
}

app.post("/api/payment/boost/initiate", async (req, res) => {
  try {
    if (!FEDAPAY_SECRET_KEY) return res.status(503).json({ error: "Paiement non configuré. Contactez l'administrateur." });
    const { userUid, userEmail, phoneNumber, countryCode, operatorId, targetId, targetType } = req.body;
    if (!userUid || !phoneNumber || !operatorId || !targetId || !targetType) {
      return res.status(400).json({ error: "Paramètres manquants" });
    }
    if (!["post", "marche"].includes(targetType)) return res.status(400).json({ error: "targetType invalide" });

    const [user] = await db.select().from(users).where(eq(users.firebaseUid, userUid));
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });

    const txData = await fedapayRequest("POST", "/transactions", {
      description: "Boost QuartierPlus — 48h Sponsorisé",
      amount: BOOST_PRICE,
      currency: { iso: "XOF" },
      customer: {
        email: userEmail || `user-${userUid}@quartierplus.app`,
        phone_number: { number: phoneNumber, country: countryCode },
      },
    });
    const fedaTxId = txData.v1?.transaction?.id || txData.transaction?.id;
    if (!fedaTxId) throw new Error("Impossible de créer la transaction FedaPay");

    await fedapayRequest("POST", `/transactions/${fedaTxId}/pay`, {
      payment_method: operatorId,
      customer_info: { phone_number: phoneNumber },
    });

    res.json({ txId: String(fedaTxId), status: "pending" });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Erreur paiement Boost" });
  }
});

app.get("/api/payment/boost/status/:txId", async (req, res) => {
  try {
    if (!FEDAPAY_SECRET_KEY) return res.status(503).json({ error: "Non configuré" });
    const { txId } = req.params;
    const { userUid, targetId, targetType } = req.query as { userUid?: string; targetId?: string; targetType?: string };
    if (!userUid || !targetId || !targetType) return res.status(400).json({ error: "Paramètres manquants" });

    const txData = await fedapayRequest("GET", `/transactions/${txId}`);
    const tx = txData.v1?.transaction || txData.transaction;
    const status: string = tx?.status || "pending";

    if (status === "approved") {
      const alreadyBoosted = await db.select().from(transactions).where(eq(transactions.description, `BOOST-${txId}`));
      if (alreadyBoosted.length === 0) {
        const boostExpiresAt = await applyBoostToItem(targetId, targetType);
        await creditAdminsForBoost(userUid, targetId);
        await logTransaction("boost", userUid, ADMIN_UID, BOOST_PRICE, 0, `BOOST-${txId}`, targetId);
        return res.json({ status: "approved", boostExpiresAt: boostExpiresAt.toISOString() });
      }
      return res.json({ status: "approved" });
    }

    res.json({ status });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Erreur vérification" });
  }
});

app.post("/api/wallet/boost", async (req, res) => {
  try {
    const { userUid, targetId, targetType } = req.body;
    if (!userUid || !targetId || !targetType) return res.status(400).json({ error: "Paramètres manquants" });
    if (!["post", "marche"].includes(targetType)) return res.status(400).json({ error: "targetType invalide" });

    const [user] = await db.select().from(users).where(eq(users.firebaseUid, userUid));
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });

    const balance = user.walletBalance ?? 0;
    if (balance < BOOST_PRICE) return res.status(402).json({ error: `Solde insuffisant. Vous avez ${balance} FCFA, le boost coûte ${BOOST_PRICE} FCFA.` });

    await db.update(users).set({ walletBalance: balance - BOOST_PRICE } as any).where(eq(users.firebaseUid, userUid));
    const boostExpiresAt = await applyBoostToItem(targetId, targetType);
    await creditAdminsForBoost(userUid, targetId);

    res.json({ success: true, newBalance: balance - BOOST_PRICE, boostExpiresAt: boostExpiresAt.toISOString() });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Vidéos Récompensées (Rewarded Ads) ──────────────────────────────
const FCFA_PER_VIDEO = 2; // 20 pts × 0.1 FCFA/pt = 2 FCFA par vidéo
const MAX_DAILY_VIDEOS = 15;
const MIN_SECS_BETWEEN_VIEWS = 30;
const MIN_WITHDRAWAL_FCFA = 1000; // Minimum 1 000 FCFA pour retirer

app.post("/api/rewards/video-complete", async (req, res) => {
  try {
    const { userUid } = req.body;
    if (!userUid) return res.status(400).json({ error: "userUid requis" });

    const [user] = await db.select().from(users).where(eq(users.firebaseUid, userUid));
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
    if (user.isBanned) return res.status(403).json({ error: "Compte bloqué pour activité suspecte. Contactez le support." });

    const since24h = new Date(Date.now() - 24 * 3600 * 1000);
    const todayViews = await db.select().from(videoViews)
      .where(drizzleSql`${videoViews.userUid} = ${userUid} AND ${videoViews.viewedAt} > ${since24h}`);

    if (todayViews.length >= MAX_DAILY_VIDEOS) {
      return res.status(429).json({ error: `Limite de ${MAX_DAILY_VIDEOS} vidéos par 24h atteinte. Revenez demain !`, todayViews: todayViews.length });
    }

    if (todayViews.length > 0) {
      const lastView = todayViews[todayViews.length - 1];
      const secsSinceLast = (Date.now() - new Date(lastView.viewedAt!).getTime()) / 1000;
      if (secsSinceLast < MIN_SECS_BETWEEN_VIEWS) {
        if (todayViews.length >= 3) {
          await db.update(users).set({ isBanned: true } as any).where(eq(users.firebaseUid, userUid));
          return res.status(403).json({ error: "Activité suspecte détectée. Compte bloqué." });
        }
        return res.status(429).json({ error: `Attendez encore ${Math.ceil(MIN_SECS_BETWEEN_VIEWS - secsSinceLast)} secondes avant la prochaine vidéo.` });
      }
    }

    await db.insert(videoViews).values({ userUid, pointsEarned: FCFA_PER_VIDEO } as any);
    const newBalance = (user.walletBalance ?? 0) + FCFA_PER_VIDEO;
    await db.update(users).set({ walletBalance: newBalance } as any).where(eq(users.firebaseUid, userUid));
    await logTransaction("video_reward", "admob", userUid, FCFA_PER_VIDEO, 0, `Vidéo récompensée #${todayViews.length + 1} (+${FCFA_PER_VIDEO} FCFA)`);

    const freshViews = await db.select().from(videoViews)
      .where(drizzleSql`${videoViews.userUid} = ${userUid} AND ${videoViews.viewedAt} > ${since24h}`);

    res.json({
      success: true,
      fcfaEarned: FCFA_PER_VIDEO,
      newWalletBalance: newBalance,
      todayViews: freshViews.length,
      maxDaily: MAX_DAILY_VIDEOS,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Erreur serveur" });
  }
});

app.get("/api/rewards/status/:uid", async (req, res) => {
  try {
    const { uid } = req.params;
    const [user] = await db.select().from(users).where(eq(users.firebaseUid, uid));
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });

    const since24h = new Date(Date.now() - 24 * 3600 * 1000);
    const todayViews = await db.select().from(videoViews)
      .where(drizzleSql`${videoViews.userUid} = ${uid} AND ${videoViews.viewedAt} > ${since24h}`);

    const walletBalance = user.walletBalance ?? 0;
    res.json({
      walletBalance,
      todayViews: todayViews.length,
      maxDaily: MAX_DAILY_VIDEOS,
      fcfaPerVideo: FCFA_PER_VIDEO,
      canWithdraw: walletBalance >= MIN_WITHDRAWAL_FCFA,
      minWithdrawalFcfa: MIN_WITHDRAWAL_FCFA,
      isBanned: user.isBanned ?? false,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Erreur serveur" });
  }
});

app.post("/api/rewards/withdraw", async (req, res) => {
  try {
    const { userUid, phoneNumber, provider } = req.body;
    if (!userUid || !phoneNumber || !provider) return res.status(400).json({ error: "Paramètres manquants" });

    const [user] = await db.select().from(users).where(eq(users.firebaseUid, userUid));
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
    if (user.isBanned) return res.status(403).json({ error: "Compte bloqué." });

    const walletBalance = user.walletBalance ?? 0;
    if (walletBalance < MIN_WITHDRAWAL_FCFA) {
      return res.status(402).json({ error: `Solde insuffisant. Vous avez ${walletBalance} FCFA, minimum requis : ${MIN_WITHDRAWAL_FCFA} FCFA.` });
    }

    await db.update(users).set({ walletBalance: 0 } as any).where(eq(users.firebaseUid, userUid));
    await db.insert(walletTransactions).values({
      userId: userUid,
      type: "withdrawal_request",
      amount: walletBalance,
      description: `Retrait wallet: ${walletBalance} FCFA`,
      mobileMoney: phoneNumber,
      mobileMoneyProvider: provider,
      status: "pending",
    } as any);
    await logTransaction("withdrawal_request", userUid, "admin", walletBalance, 0,
      `RETRAIT ADMIN: ${walletBalance} FCFA → ${provider} ${phoneNumber}`);

    console.log(`\n🔔 ALERTE RETRAIT — À traiter par l'admin (${ADMIN_EMAILS[0]})`);
    console.log(`   Utilisateur : ${user.email || user.displayName || userUid}`);
    console.log(`   Montant : ${walletBalance} FCFA`);
    console.log(`   ${provider.toUpperCase()} : ${phoneNumber}\n`);

    res.json({
      success: true,
      fcfaAmount: walletBalance,
      message: `Votre demande de ${walletBalance} FCFA a été enregistrée. L'administrateur vous contactera dans 24-48h sur ${provider} (${phoneNumber}).`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Erreur serveur" });
  }
});

app.get("/api/rewards/history/:uid", async (req, res) => {
  try {
    const { uid } = req.params;
    const history = await db.select().from(videoViews)
      .where(eq(videoViews.userUid, uid))
      .orderBy(desc(videoViews.viewedAt))
      .limit(50);
    const withdrawals = await db.select().from(walletTransactions)
      .where(drizzleSql`${walletTransactions.userId} = ${uid} AND ${walletTransactions.type} = 'withdrawal_request'`)
      .orderBy(desc(walletTransactions.createdAt))
      .limit(20);
    res.json({ videoHistory: toSnake(history), withdrawals: toSnake(withdrawals) });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Erreur serveur" });
  }
});

// ─── Wallet Pro : Solde temps réel (server-side only) ────────────────
app.get("/api/wallet/balance/:uid", async (req, res) => {
  try {
    const { uid } = req.params;
    const [user] = await db.select({ walletBalance: users.walletBalance, isBanned: users.isBanned })
      .from(users).where(eq(users.firebaseUid, uid)).limit(1);
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
    res.json({ uid, balance: user.walletBalance ?? 0, is_banned: user.isBanned ?? false, fetched_at: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Wallet Pro : Historique complet transactions ─────────────────────
app.get("/api/wallet/transactions/:uid", async (req, res) => {
  try {
    const { uid } = req.params;
    const txList = await db.select({
      id: walletTransactions.id,
      type: walletTransactions.type,
      amount: walletTransactions.amount,
      description: walletTransactions.description,
      mobileMoney: walletTransactions.mobileMoney,
      mobileMoneyProvider: walletTransactions.mobileMoneyProvider,
      status: walletTransactions.status,
      createdAt: walletTransactions.createdAt,
    }).from(walletTransactions)
      .where(eq(walletTransactions.userId, uid))
      .orderBy(desc(walletTransactions.createdAt))
      .limit(50);
    res.json(toSnake(txList));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Wallet Pro : Demande de retrait → crée pending + OTP ─────────────
app.post("/api/wallet/withdraw/request", async (req, res) => {
  try {
    const { user_uid, phone_number, provider, amount } = req.body;
    if (!user_uid || !phone_number || !provider) {
      return res.status(400).json({ error: "user_uid, phone_number et provider requis" });
    }

    const [user] = await db.select().from(users).where(eq(users.firebaseUid, user_uid)).limit(1);
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
    if (user.isBanned) return res.status(403).json({ error: "Compte suspendu. Contactez le support." });

    const balance = user.walletBalance ?? 0;
    const withdrawAmount = amount ? Number(amount) : balance;
    if (withdrawAmount < 1000) return res.status(402).json({ error: "Montant minimum de retrait : 1 000 FCFA" });
    if (balance < withdrawAmount) return res.status(402).json({ error: `Solde insuffisant. Disponible : ${balance.toLocaleString()} FCFA` });

    const existingPending = await db.select({ id: walletTransactions.id }).from(walletTransactions)
      .where(drizzleSql`${walletTransactions.userId} = ${user_uid} AND ${walletTransactions.status} = 'pending' AND ${walletTransactions.type} = 'withdrawal_request'`)
      .limit(1);
    if (existingPending.length > 0) {
      return res.status(409).json({ error: "Vous avez déjà une demande en attente de confirmation OTP." });
    }

    const otp = generateOTP();
    const otpExpiry = getOtpExpiry(10);

    const [tx] = await (db.insert(walletTransactions) as any).values({
      userId: user_uid,
      type: "withdrawal_request",
      amount: withdrawAmount,
      description: `Retrait ${provider.toUpperCase()} · ${phone_number}`,
      mobileMoney: phone_number,
      mobileMoneyProvider: provider,
      status: "pending",
      otpCode: otp,
      otpExpiresAt: otpExpiry,
      metadata: { phone_number, provider, amount: withdrawAmount, requested_at: new Date().toISOString() } as any,
    }).returning();

    console.log(`[WALLET] OTP retrait pour ${user.displayName || user_uid}: ${otp} | ${withdrawAmount} FCFA → ${provider} ${phone_number}`);

    res.json({
      success: true,
      transaction_id: tx.id,
      otp,
      amount: withdrawAmount,
      expires_at: otpExpiry.toISOString(),
      message: `Code de confirmation généré. Valide 10 minutes.`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Wallet Pro : Confirmation OTP retrait → déduit le solde ──────────
app.post("/api/wallet/withdraw/confirm", async (req, res) => {
  try {
    const { user_uid, transaction_id, otp_code } = req.body;
    if (!user_uid || !transaction_id || !otp_code) {
      return res.status(400).json({ error: "user_uid, transaction_id et otp_code requis" });
    }

    const [tx] = await db.select().from(walletTransactions)
      .where(drizzleSql`${walletTransactions.id} = ${transaction_id} AND ${walletTransactions.userId} = ${user_uid}`)
      .limit(1);

    if (!tx) return res.status(404).json({ error: "Transaction introuvable" });
    if (tx.status !== "pending") return res.status(409).json({ error: tx.status === "completed" ? "Cette transaction a déjà été confirmée." : "Transaction annulée ou expirée." });

    const otpInDB = (tx as any).otp_code || (tx as any).otpCode;
    const expiresAt = (tx as any).otp_expires_at || (tx as any).otpExpiresAt;

    if (!otpInDB) return res.status(400).json({ error: "Aucun OTP associé à cette transaction." });
    if (new Date() > new Date(expiresAt)) {
      await db.update(walletTransactions).set({ status: "expired" } as any).where(eq(walletTransactions.id, transaction_id));
      return res.status(410).json({ error: "Code OTP expiré. Veuillez refaire la demande." });
    }
    if (otp_code.trim() !== otpInDB.trim()) {
      return res.status(401).json({ error: "Code OTP incorrect. Vérifiez et réessayez." });
    }

    const [user] = await db.select().from(users).where(eq(users.firebaseUid, user_uid)).limit(1);
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });

    const balance = user.walletBalance ?? 0;
    const amount = tx.amount ?? 0;
    if (balance < amount) return res.status(402).json({ error: `Solde insuffisant au moment de la confirmation : ${balance.toLocaleString()} FCFA disponibles.` });

    const newBalance = balance - amount;
    await db.update(users).set({ walletBalance: newBalance } as any).where(eq(users.firebaseUid, user_uid));
    await db.update(walletTransactions).set({ status: "awaiting_admin" } as any).where(eq(walletTransactions.id, transaction_id));
    await logTransaction("withdrawal_request", user_uid, "admin", amount, 0, `RETRAIT CONFIRMÉ: ${amount.toLocaleString()} FCFA → ${tx.mobileMoneyProvider?.toUpperCase()} ${tx.mobileMoney}`);

    broadcastToUser(user_uid, { type: "balance_update", balance: newBalance, reason: "withdrawal_confirmed", amount });
    broadcastToAll({ type: "admin_new_withdrawal", uid: user_uid, amount, provider: tx.mobileMoneyProvider });

    console.log(`[WALLET] Retrait confirmé: ${user.displayName || user_uid} | ${amount} FCFA | nouveau solde: ${newBalance}`);

    res.json({
      success: true,
      new_balance: newBalance,
      amount_withdrawn: amount,
      message: `Retrait de ${amount.toLocaleString()} FCFA confirmé. Votre paiement sera effectué sous 24-48h par l'administrateur.`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Wallet Pro : Demande de dépôt → OTP (admin confirme ensuite) ─────
app.post("/api/wallet/deposit/request", async (req, res) => {
  try {
    const { user_uid, amount, phone_number, provider } = req.body;
    if (!user_uid || !amount || !phone_number || !provider) {
      return res.status(400).json({ error: "user_uid, amount, phone_number et provider requis" });
    }
    const depositAmount = Number(amount);
    if (depositAmount < 500) return res.status(400).json({ error: "Dépôt minimum : 500 FCFA" });

    const [user] = await db.select({ displayName: users.displayName, isBanned: users.isBanned }).from(users)
      .where(eq(users.firebaseUid, user_uid)).limit(1);
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
    if (user.isBanned) return res.status(403).json({ error: "Compte suspendu." });

    const otp = generateOTP();
    const otpExpiry = getOtpExpiry(15);

    const [tx] = await (db.insert(walletTransactions) as any).values({
      userId: user_uid,
      type: "deposit_request",
      amount: depositAmount,
      description: `Dépôt ${provider.toUpperCase()} · ${phone_number} · ${depositAmount.toLocaleString()} FCFA`,
      mobileMoney: phone_number,
      mobileMoneyProvider: provider,
      status: "pending",
      otpCode: otp,
      otpExpiresAt: otpExpiry,
      metadata: { phone_number, provider, amount: depositAmount, requested_at: new Date().toISOString() } as any,
    }).returning();

    console.log(`[WALLET] OTP dépôt pour ${user.displayName || user_uid}: ${otp} | ${depositAmount} FCFA depuis ${provider}`);

    broadcastToAll({ type: "admin_new_deposit", uid: user_uid, amount: depositAmount, provider, tx_id: tx.id });

    res.json({
      success: true,
      transaction_id: tx.id,
      otp,
      amount: depositAmount,
      expires_at: otpExpiry.toISOString(),
      message: `Envoyez ${depositAmount.toLocaleString()} FCFA sur ${provider.toUpperCase()} et entrez votre code de confirmation.`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Wallet Pro : Confirmation OTP dépôt → crédite le solde ──────────
app.post("/api/wallet/deposit/confirm", async (req, res) => {
  try {
    const { user_uid, transaction_id, otp_code } = req.body;
    if (!user_uid || !transaction_id || !otp_code) {
      return res.status(400).json({ error: "user_uid, transaction_id et otp_code requis" });
    }

    const [tx] = await db.select().from(walletTransactions)
      .where(drizzleSql`${walletTransactions.id} = ${transaction_id} AND ${walletTransactions.userId} = ${user_uid} AND ${walletTransactions.type} = 'deposit_request'`)
      .limit(1);

    if (!tx) return res.status(404).json({ error: "Transaction introuvable" });
    if (tx.status !== "pending") return res.status(409).json({ error: "Cette transaction a déjà été traitée." });

    const otpInDB = (tx as any).otp_code || (tx as any).otpCode;
    const expiresAt = (tx as any).otp_expires_at || (tx as any).otpExpiresAt;

    if (new Date() > new Date(expiresAt)) {
      await db.update(walletTransactions).set({ status: "expired" } as any).where(eq(walletTransactions.id, transaction_id));
      return res.status(410).json({ error: "Code OTP expiré. Veuillez refaire la demande de dépôt." });
    }
    if (otp_code.trim() !== otpInDB.trim()) {
      return res.status(401).json({ error: "Code OTP incorrect." });
    }

    const [user] = await db.select().from(users).where(eq(users.firebaseUid, user_uid)).limit(1);
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });

    const newBalance = (user.walletBalance ?? 0) + (tx.amount ?? 0);
    await db.update(users).set({ walletBalance: newBalance } as any).where(eq(users.firebaseUid, user_uid));
    await db.update(walletTransactions).set({ status: "completed" } as any).where(eq(walletTransactions.id, transaction_id));
    await logTransaction("deposit", tx.mobileMoneyProvider || "mm", user_uid, tx.amount ?? 0, 0,
      `Dépôt confirmé: ${(tx.amount ?? 0).toLocaleString()} FCFA via ${tx.mobileMoneyProvider?.toUpperCase()}`);

    broadcastToUser(user_uid, { type: "balance_update", balance: newBalance, reason: "deposit_confirmed", amount: tx.amount ?? 0 });

    console.log(`[WALLET] Dépôt confirmé: ${user.displayName || user_uid} | +${tx.amount} FCFA | nouveau solde: ${newBalance}`);

    res.json({
      success: true,
      new_balance: newBalance,
      amount_deposited: tx.amount,
      message: `Dépôt de ${(tx.amount ?? 0).toLocaleString()} FCFA confirmé. Votre solde a été mis à jour.`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Wallet Pro : Admin confirme dépôt manuellement ──────────────────
app.post("/api/admin/wallet/deposit/validate", async (req, res) => {
  try {
    const { email, transaction_id, action } = req.body;
    if (!email || !ADMIN_EMAILS.includes(email)) return res.status(403).json({ error: "Accès refusé" });
    if (!["approve", "reject"].includes(action)) return res.status(400).json({ error: "action: 'approve' ou 'reject'" });

    const [tx] = await db.select().from(walletTransactions).where(eq(walletTransactions.id, transaction_id)).limit(1);
    if (!tx) return res.status(404).json({ error: "Transaction introuvable" });
    if (tx.status === "completed" || tx.status === "rejected") return res.status(409).json({ error: "Transaction déjà traitée" });

    if (action === "approve") {
      const [user] = await db.select().from(users).where(eq(users.firebaseUid, tx.userId!)).limit(1);
      if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
      const newBalance = (user.walletBalance ?? 0) + (tx.amount ?? 0);
      await db.update(users).set({ walletBalance: newBalance } as any).where(eq(users.firebaseUid, tx.userId!));
      await db.update(walletTransactions).set({ status: "completed" } as any).where(eq(walletTransactions.id, transaction_id));
      await logTransaction("deposit", "admin", tx.userId!, tx.amount ?? 0, 0, `Dépôt validé admin: ${tx.amount} FCFA`);
      broadcastToUser(tx.userId!, { type: "balance_update", balance: newBalance, reason: "deposit_approved_admin", amount: tx.amount ?? 0 });
      res.json({ success: true, new_balance: newBalance });
    } else {
      await db.update(walletTransactions).set({ status: "rejected" } as any).where(eq(walletTransactions.id, transaction_id));
      broadcastToUser(tx.userId!, { type: "transaction_rejected", transaction_id, reason: "Dépôt refusé par l'administrateur." });
      res.json({ success: true, status: "rejected" });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Middleware Admin ───────────────────────────────────────────────────
function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const email = (req.query.email || req.body?.email || req.headers["x-admin-email"]) as string;
  if (!email || email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: "Accès réservé à l'administrateur" });
  }
  next();
}

// ─── 2FA Routes ────────────────────────────────────────────────────────
app.post("/api/auth/2fa/setup", async (req, res) => {
  try {
    const { firebaseUid } = req.body;
    const [user] = await db.select().from(users).where(eq(users.firebaseUid, firebaseUid));
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });

    const secret = generateSecret();
    const label = encodeURIComponent(user.email || firebaseUid);
    const otpauthUrl = `otpauth://totp/QuartierPlus:${label}?secret=${secret}&issuer=QuartierPlus&algorithm=SHA1&digits=6&period=30`;

    await db.update(users)
      .set({ twoFactorSecret: secret } as any)
      .where(eq(users.firebaseUid, firebaseUid));

    res.json({ secret, otpauthUrl });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/auth/2fa/verify", async (req, res) => {
  try {
    const { firebaseUid, token } = req.body;
    if (!firebaseUid || !token) return res.status(400).json({ error: "firebaseUid et token requis" });

    const [user] = await db.select().from(users).where(eq(users.firebaseUid, firebaseUid));
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
    if (!user.twoFactorSecret) return res.status(400).json({ error: "2FA non configuré" });

    const result = await totpVerify({ token, secret: user.twoFactorSecret as string });
    const isValid = result && typeof result === "object" ? result.valid : result;
    if (!isValid) return res.status(401).json({ error: "Code invalide" });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/auth/2fa/toggle", async (req, res) => {
  try {
    const { firebaseUid, enabled } = req.body;
    const [user] = await db.select().from(users).where(eq(users.firebaseUid, firebaseUid));
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });

    if (user.email === ADMIN_EMAIL && !enabled) {
      return res.status(400).json({ error: "Le 2FA ne peut pas être désactivé pour le compte administrateur" });
    }

    await db.update(users)
      .set({ twoFactorEnabled: enabled } as any)
      .where(eq(users.firebaseUid, firebaseUid));

    res.json({ success: true, twoFactorEnabled: enabled });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Admin - Demandes de retrait ────────────────────────────────────────
app.get("/api/admin/withdrawals", requireAdmin, async (req, res) => {
  try {
    const withdrawals = await db.select({
      id: walletTransactions.id,
      userId: walletTransactions.userId,
      amount: walletTransactions.amount,
      description: walletTransactions.description,
      mobileMoney: walletTransactions.mobileMoney,
      mobileMoneyProvider: walletTransactions.mobileMoneyProvider,
      status: walletTransactions.status,
      createdAt: walletTransactions.createdAt,
    })
      .from(walletTransactions)
      .where(eq(walletTransactions.type, "withdrawal_request"))
      .orderBy(desc(walletTransactions.createdAt))
      .limit(100);

    const enriched = await Promise.all(
      withdrawals.map(async (w) => {
        const [u] = await db.select({ email: users.email, displayName: users.displayName })
          .from(users).where(eq(users.firebaseUid, w.userId || ""));
        return { ...toSnake(w), user_email: u?.email, user_name: u?.displayName };
      })
    );
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.patch("/api/admin/withdrawals/:id", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id);
    const { status } = req.body;
    if (!["pending", "approved", "rejected"].includes(status)) {
      return res.status(400).json({ error: "Statut invalide" });
    }
    const [updated] = await db.update(walletTransactions)
      .set({ status } as any)
      .where(eq(walletTransactions.id, id))
      .returning();
    res.json(toSnake(updated));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Admin - Demandes d'aide ────────────────────────────────────────────
app.get("/api/admin/help-requests", requireAdmin, async (req, res) => {
  try {
    const requests = await db.select().from(helpRequests)
      .orderBy(desc(helpRequests.createdAt))
      .limit(100);
    res.json(toSnake(requests));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.patch("/api/admin/help-requests/:id", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id);
    const { status, adminResponse } = req.body;
    const [updated] = await db.update(helpRequests)
      .set({
        status: status || "closed",
        adminResponse: adminResponse || null,
        respondedAt: new Date(),
      } as any)
      .where(eq(helpRequests.id, id))
      .returning();
    res.json(toSnake(updated));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/help-requests", async (req, res) => {
  try {
    const { userId, userEmail, userName, subject, message } = req.body;
    if (!userId || !subject || !message) return res.status(400).json({ error: "Paramètres manquants" });
    const [request] = await db.insert(helpRequests).values({
      userId, userEmail, userName, subject, message, status: "open",
    } as any).returning();
    res.json(toSnake(request));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Admin - Validations annonces commerçants ───────────────────────────
app.get("/api/admin/merchant-validations", requireAdmin, async (req, res) => {
  try {
    const items = await db.select().from(marche)
      .orderBy(desc(marche.createdAt))
      .limit(100);
    res.json(toSnake(items));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.patch("/api/admin/merchant-validations/:id", requireAdmin, async (req, res) => {
  try {
    const id = String(req.params.id);
    const { validationStatus } = req.body;
    if (!["pending", "approved", "rejected"].includes(validationStatus)) {
      return res.status(400).json({ error: "Statut invalide" });
    }
    const [updated] = await db.update(marche)
      .set({ validationStatus } as any)
      .where(eq(marche.id, id))
      .returning();
    res.json(toSnake(updated));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Admin Dashboard ───────────────────────────────────────────────────

app.get("/api/admin/dashboard", async (req, res) => {
  try {
    const { email } = req.query as { email?: string };
    if (!email || !ADMIN_EMAILS.includes(email)) return res.status(403).json({ error: "Accès refusé" });

    const allTx = await db.select().from(transactions).orderBy(desc(transactions.createdAt)).limit(200);

    const totalCommissions = allTx.reduce((sum, tx) => sum + (tx.commission ?? 0), 0);
    const totalCoursePayments = allTx.filter((tx) => tx.type === "course_payment").reduce((sum, tx) => sum + tx.amount, 0);
    const totalPrimes = allTx.filter((tx) => tx.type === "prime_transfer").reduce((sum, tx) => sum + tx.amount, 0);
    const totalWithdrawals = allTx.filter((tx) => tx.type === "withdrawal").reduce((sum, tx) => sum + tx.amount, 0);
    const commissionsByWithdrawal = allTx.filter((tx) => tx.type === "commission").reduce((sum, tx) => sum + tx.amount, 0);
    const totalBoostRevenue = allTx.filter((tx) => tx.type === "boost").reduce((sum, tx) => sum + tx.amount, 0);

    const userCount = await db.select({ count: drizzleSql<number>`count(*)` }).from(users);
    const txByType: Record<string, number> = {};
    for (const tx of allTx) {
      txByType[tx.type] = (txByType[tx.type] || 0) + 1;
    }

    res.json({
      total_commissions: totalCommissions,
      commissions_by_withdrawal: commissionsByWithdrawal,
      total_course_payments: totalCoursePayments,
      total_primes: totalPrimes,
      total_withdrawals: totalWithdrawals,
      total_boost_revenue: totalBoostRevenue,
      transaction_count: allTx.length,
      transactions_by_type: txByType,
      user_count: Number(userCount[0]?.count ?? 0),
      recent_transactions: toSnake(allTx.slice(0, 50)),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Upload ───────────────────────────────────────────────────────────
app.post("/api/upload/image", async (req, res) => {
  try {
    const { base64, folder } = req.body;
    if (!base64) return res.status(400).json({ error: "base64 requis" });
    const result = await cloudinary.uploader.upload(
      `data:image/jpeg;base64,${base64}`,
      { folder: folder || "quartierplus/produits", resource_type: "image" }
    );
    res.json({ url: result.secure_url, public_id: result.public_id });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/upload/video", async (req, res) => {
  try {
    const { base64, folder } = req.body;
    if (!base64) return res.status(400).json({ error: "base64 requis" });
    const result = await cloudinary.uploader.upload(
      `data:video/mp4;base64,${base64}`,
      {
        folder: folder || "quartierplus/videos",
        resource_type: "video",
        // Compression automatique : qualité auto + codec H.264 + max 720p
        transformation: [
          { quality: "auto", video_codec: "auto", width: 720, crop: "limit" },
        ],
        // Génération immédiate d'une miniature JPEG au temps 0
        eager: [
          { format: "jpg", transformation: [{ width: 480, crop: "fill", start_offset: "0" }] },
        ],
        eager_async: false,
      }
    );
    const thumbnailUrl = (result as any).eager?.[0]?.secure_url ?? null;
    res.json({ url: result.secure_url, public_id: result.public_id, thumbnail_url: thumbnailUrl });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/upload/audio", async (req, res) => {
  try {
    const { base64, folder } = req.body;
    if (!base64) return res.status(400).json({ error: "base64 requis" });
    const result = await cloudinary.uploader.upload(
      `data:audio/mpeg;base64,${base64}`,
      { folder: folder || "quartierplus/audio", resource_type: "video" }
    );
    res.json({ url: result.secure_url, public_id: result.public_id });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/upload/profile", async (req, res) => {
  try {
    const { base64, user_id } = req.body;
    if (!base64) return res.status(400).json({ error: "base64 requis" });
    const result = await cloudinary.uploader.upload(
      `data:image/jpeg;base64,${base64}`,
      {
        folder: "quartierplus/avatars",
        resource_type: "image",
        transformation: [{ width: 400, height: 400, crop: "fill", gravity: "face" }],
      }
    );
    if (user_id) {
      await db.update(users).set({ profilePhoto: result.secure_url, avatar: result.secure_url } as any).where(eq(users.firebaseUid, user_id));
    }
    res.json({ url: result.secure_url, public_id: result.public_id });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Loto 5/30 ────────────────────────────────────────────────────────
const LOTO_TICKET_PRICE = 100;
const LOTO_PRIZES: Record<number, number> = { 3: 300, 4: 1500, 5: 50000 };
const LOTO_NUMBERS_TOTAL = 30;
const LOTO_PICK_COUNT = 5;

function drawLotoNumbers(): number[] {
  const pool = Array.from({ length: LOTO_NUMBERS_TOTAL }, (_, i) => i + 1);
  const drawn: number[] = [];
  for (let i = 0; i < LOTO_PICK_COUNT; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    drawn.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return drawn.sort((a, b) => a - b);
}

app.post("/api/loto/buy", async (req, res) => {
  try {
    if (!gameEnabled.loto) return res.status(503).json({ error: "Le Loto est temporairement désactivé par l'administrateur." });
    const { userUid, chosenNumbers } = req.body;
    if (!userUid || !Array.isArray(chosenNumbers)) {
      return res.status(400).json({ error: "userUid et chosenNumbers requis" });
    }
    if (chosenNumbers.length !== LOTO_PICK_COUNT) {
      return res.status(400).json({ error: `Vous devez choisir exactement ${LOTO_PICK_COUNT} numéros` });
    }
    const unique = new Set(chosenNumbers);
    if (unique.size !== LOTO_PICK_COUNT) {
      return res.status(400).json({ error: "Les numéros doivent être uniques" });
    }
    if (chosenNumbers.some((n: number) => n < 1 || n > LOTO_NUMBERS_TOTAL)) {
      return res.status(400).json({ error: `Les numéros doivent être entre 1 et ${LOTO_NUMBERS_TOTAL}` });
    }

    const [user] = await db.select().from(users).where(eq(users.firebaseUid, userUid)).limit(1);
    if (!user) return res.status(404).json({ error: "Utilisateur non trouvé" });
    if (user.isBanned) return res.status(403).json({ error: "Compte suspendu" });
    if ((user.walletBalance ?? 0) < LOTO_TICKET_PRICE) {
      return res.status(400).json({ error: `Solde insuffisant. Il vous faut au moins ${LOTO_TICKET_PRICE} FCFA.` });
    }

    // Déduire le prix immédiatement — le tirage se fait lors du prochain tirage admin
    const newBalance = (user.walletBalance ?? 0) - LOTO_TICKET_PRICE;
    await db.update(users).set({ walletBalance: newBalance } as any).where(eq(users.firebaseUid, userUid));

    await logTransaction("loto_bet", userUid, null, LOTO_TICKET_PRICE, 0,
      `Ticket Loto 5/30 — numéros: ${chosenNumbers.join(",")} [en attente tirage]`, undefined);

    // Ticket saved as "pending" — drawnNumbers=[] until admin triggers draw
    const [ticket] = await db.insert(lotoTickets).values({
      userUid,
      chosenNumbers: chosenNumbers as any,
      drawnNumbers: [] as any,
      matchedCount: 0,
      prizeAmount: 0,
      status: "pending",
    }).returning();

    broadcastToAll({ type: "loto_ticket_sold", ticket_id: ticket.id, user_uid: userUid });

    res.json(toSnake({
      success: true,
      pending: true,
      ticket: toSnake(ticket),
      newBalance,
      message: `🎟️ Ticket enregistré ! Numéros : ${chosenNumbers.join(" - ")}. Résultat au prochain tirage admin.`,
    }));
  } catch (err) {
    console.error("[Loto] buy error:", err);
    res.status(500).json({ error: String(err) });
  }
});

// ─── Admin: Statistiques des tickets en attente ────────────────────────
app.get("/api/admin/loto/stats", async (req, res) => {
  try {
    const { email } = req.query as { email?: string };
    if (!email || !ADMIN_EMAILS.includes(email)) return res.status(403).json({ error: "Accès refusé" });

    const pending = await db.select().from(lotoTickets).where(eq(lotoTickets.status as any, "pending"));
    const [lastDraw] = await db.select().from(lotoTickets)
      .where(eq(lotoTickets.status as any, "completed"))
      .orderBy(desc(lotoTickets.createdAt))
      .limit(1);

    res.json({
      pending_count: pending.length,
      pot_total: pending.length * LOTO_TICKET_PRICE,
      last_draw_at: lastDraw?.createdAt || null,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Admin: Lancer le tirage Loto ─────────────────────────────────────
app.post("/api/admin/loto/draw", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !ADMIN_EMAILS.includes(email)) return res.status(403).json({ error: "Accès refusé" });

    const pendingTickets = await db.select().from(lotoTickets).where(eq(lotoTickets.status as any, "pending"));
    if (pendingTickets.length === 0) return res.status(400).json({ error: "Aucun ticket en attente. Attendez que des joueurs achètent des tickets." });

    const drawnNumbers = drawLotoNumbers();
    const drawnSet = new Set(drawnNumbers);
    let totalPrizesPaid = 0;
    const winners: { uid: string; matched: number; prize: number }[] = [];

    for (const ticket of pendingTickets) {
      const chosen = Array.isArray(ticket.chosenNumbers) ? ticket.chosenNumbers as number[] : [];
      const matchedCount = chosen.filter((n) => drawnSet.has(n)).length;
      const prizeAmount = LOTO_PRIZES[matchedCount] ?? 0;

      await db.update(lotoTickets)
        .set({ drawnNumbers: drawnNumbers as any, matchedCount, prizeAmount, status: "completed" } as any)
        .where(eq(lotoTickets.id, ticket.id));

      if (prizeAmount > 0) {
        const [winner] = await db.select().from(users).where(eq(users.firebaseUid, ticket.userUid!)).limit(1);
        if (winner) {
          const newBal = (winner.walletBalance ?? 0) + prizeAmount;
          await db.update(users).set({ walletBalance: newBal } as any).where(eq(users.firebaseUid, ticket.userUid!));
          const label = matchedCount === LOTO_PICK_COUNT ? "🎉 JACKPOT Loto 5/30 !" : `🎰 Gain Loto (${matchedCount} bons numéros)`;
          await logTransaction("loto_win", "loto_system", ticket.userUid!, prizeAmount, 0, label, undefined);
          broadcastToUser(ticket.userUid!, {
            type: "loto_result",
            drawn_numbers: drawnNumbers,
            chosen_numbers: chosen,
            matched_count: matchedCount,
            prize_amount: prizeAmount,
            new_balance: newBal,
            is_jackpot: matchedCount === LOTO_PICK_COUNT,
            message: label,
          });
          winners.push({ uid: ticket.userUid!, matched: matchedCount, prize: prizeAmount });
          totalPrizesPaid += prizeAmount;
        }
      } else {
        broadcastToUser(ticket.userUid!, {
          type: "loto_result",
          drawn_numbers: drawnNumbers,
          chosen_numbers: chosen,
          matched_count: matchedCount,
          prize_amount: 0,
          message: `🎰 Tirage Loto : ${drawnNumbers.join(" - ")} — ${matchedCount} bon${matchedCount > 1 ? "s" : ""} numéro${matchedCount > 1 ? "s" : ""}`,
        });
      }
    }

    // Broadcast le résultat global à tous
    broadcastToAll({
      type: "loto_draw_complete",
      drawn_numbers: drawnNumbers,
      nb_participants: pendingTickets.length,
      nb_winners: winners.length,
      total_prizes_paid: totalPrizesPaid,
    });

    console.log(`[ADMIN LOTO] Tirage effectué: ${drawnNumbers.join("-")} | ${pendingTickets.length} tickets | ${winners.length} gagnants | ${totalPrizesPaid} FCFA distribués`);
    res.json({
      success: true,
      drawn_numbers: drawnNumbers,
      nb_participants: pendingTickets.length,
      nb_winners: winners.length,
      total_prizes_paid: totalPrizesPaid,
      winners,
    });
  } catch (err) {
    console.error("[Admin Loto Draw]", err);
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/loto/history/:uid", async (req, res) => {
  try {
    const { uid } = req.params;
    const tickets = await db.select().from(lotoTickets)
      .where(eq(lotoTickets.userUid, uid))
      .orderBy(desc(lotoTickets.createdAt))
      .limit(30);
    res.json(toSnake(tickets));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/loto/stats", async (_req, res) => {
  try {
    const total = await db.select({ count: drizzleSql<number>`count(*)` }).from(lotoTickets);
    const wins = await db.select({ count: drizzleSql<number>`count(*)`, total: drizzleSql<number>`sum(prize_amount)` })
      .from(lotoTickets)
      .where(drizzleSql`matched_count >= 3`);
    res.json({
      total_tickets: Number(total[0]?.count ?? 0),
      total_wins: Number(wins[0]?.count ?? 0),
      total_prizes_paid: Number(wins[0]?.total ?? 0),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Course de Rue — Init tables ─────────────────────────────────────
(async () => {
  try {
    await db.execute(drizzleSql`
      CREATE TABLE IF NOT EXISTS courses (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        titre TEXT NOT NULL DEFAULT 'Course de Rue',
        coureurs JSONB NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'open',
        winner_coureur_id TEXT,
        total_mises INTEGER NOT NULL DEFAULT 0,
        cagnotte_amount INTEGER NOT NULL DEFAULT 0,
        admin_cut INTEGER NOT NULL DEFAULT 0,
        carryover_amount INTEGER NOT NULL DEFAULT 0,
        finished_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await db.execute(drizzleSql`
      CREATE TABLE IF NOT EXISTS course_paris (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        course_id TEXT NOT NULL,
        user_uid TEXT NOT NULL,
        user_name TEXT,
        coureur_id TEXT NOT NULL,
        montant INTEGER NOT NULL,
        gain INTEGER DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
  } catch (e) {
    console.error("[Course] Table init error:", e);
  }
})();

// ─── Migration : colonnes OTP wallet_transactions ────────────────────
(async () => {
  try {
    await db.execute(drizzleSql`ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS otp_code TEXT`);
    await db.execute(drizzleSql`ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMP`);
    await db.execute(drizzleSql`ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS metadata JSONB`);
    console.log("[Wallet] OTP columns ready");
  } catch (e) {
    console.error("[Wallet] Migration error:", e);
  }
})();

const COURSE_ADMIN_PERCENT = 0.20;
function getCourseAdminPercent() { return serviceFeePercent > 0 ? serviceFeePercent : COURSE_ADMIN_PERCENT; }

const COUREURS_AUTO = [
  { id: "c1", name: "Kofi le Rapide", emoji: "🏃" },
  { id: "c2", name: "Awa la Gazelle", emoji: "💨" },
  { id: "c3", name: "Moussa l'Éclair", emoji: "⚡" },
  { id: "c4", name: "Fatou la Tornade", emoji: "🌪️" },
  { id: "c5", name: "Ibra le Lion", emoji: "🦁" },
];

async function autoCreateCourseIfNone() {
  try {
    const [active] = await db.select({ id: courses.id }).from(courses)
      .where(drizzleSql`status IN ('open', 'running')`)
      .limit(1);
    if (active) return;

    const [last] = await db.select({ carryoverAmount: courses.carryoverAmount })
      .from(courses)
      .where(eq(courses.status, "finished"))
      .orderBy(desc(courses.finishedAt))
      .limit(1);

    const carryover = last?.carryoverAmount ?? 0;

    await db.insert(courses).values({
      titre: "Course de Rue",
      coureurs: COUREURS_AUTO as any,
      status: "open",
      carryoverAmount: carryover,
      totalMises: 0,
      cagnotteAmount: 0,
      adminCut: 0,
    } as any);

    console.log(`[Course] Nouvelle course créée automatiquement${carryover > 0 ? ` (report: ${carryover} FCFA)` : ""}`);
  } catch (e) {
    console.error("[Course] Erreur création auto:", e);
  }
}

setTimeout(() => {
  autoCreateCourseIfNone();
  setInterval(autoCreateCourseIfNone, 5 * 60 * 1000);
}, 5000);

// GET /api/courses/active
app.get("/api/courses/active", async (_req, res) => {
  try {
    const [course] = await db.select().from(courses)
      .where(drizzleSql`status IN ('open', 'running')`)
      .orderBy(desc(courses.createdAt))
      .limit(1);
    if (!course) return res.json(null);

    const paris = await db.select().from(courseParis).where(eq(courseParis.courseId, course.id));
    const totalMises = paris.reduce((s, p) => s + p.montant, 0);
    const cagnotte = Math.floor(totalMises * (1 - COURSE_ADMIN_PERCENT)) + (course.carryoverAmount ?? 0);

    const repartition: Record<string, number> = {};
    for (const p of paris) {
      repartition[p.coureurId] = (repartition[p.coureurId] ?? 0) + 1;
    }

    res.json(toSnake({ ...course, totalMises, cagnotteAmount: cagnotte, repartition }));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/courses/history
app.get("/api/courses/history", async (_req, res) => {
  try {
    const history = await db.select().from(courses)
      .where(eq(courses.status, "finished"))
      .orderBy(desc(courses.finishedAt))
      .limit(10);
    res.json(toSnake(history));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/courses/:id/paris
app.get("/api/courses/:id/paris", async (req, res) => {
  try {
    const { id } = req.params;
    const paris = await db.select().from(courseParis).where(eq(courseParis.courseId, id));
    res.json(toSnake(paris));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/courses — Admin crée une course
app.post("/api/courses", async (req, res) => {
  try {
    const { titre, coureurs, admin_uid, carryover_amount } = req.body;
    const [admin] = await db.select().from(users).where(eq(users.firebaseUid, admin_uid)).limit(1);
    if (!admin?.isAdmin) return res.status(403).json({ error: "Admin requis" });

    const [course] = await db.insert(courses).values({
      titre: titre || "Course de Rue",
      coureurs: coureurs as any,
      status: "open",
      carryoverAmount: carryover_amount ?? 0,
      totalMises: 0,
      cagnotteAmount: 0,
      adminCut: 0,
    } as any).returning();

    res.json(toSnake(course));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PATCH /api/courses/:id/status — Admin passe en running
app.patch("/api/courses/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status, admin_uid, admin_email } = req.body;
    const emailOk = admin_email && ADMIN_EMAILS.includes(admin_email);
    let isAdminOk = emailOk;
    if (!isAdminOk && admin_uid) {
      const [admin] = await db.select().from(users).where(eq(users.firebaseUid, admin_uid)).limit(1);
      isAdminOk = !!admin?.isAdmin;
    }
    if (!isAdminOk) return res.status(403).json({ error: "Admin requis" });
    if (!["open", "running"].includes(status)) return res.status(400).json({ error: "Status invalide" });
    const [course] = await db.update(courses).set({ status } as any).where(eq(courses.id, id)).returning();
    broadcastToAll({ type: "course_status", courseId: id, status });
    res.json(toSnake(course));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/courses/pari — Un utilisateur mise
app.post("/api/courses/pari", async (req, res) => {
  try {
    if (!gameEnabled.course) return res.status(503).json({ error: "La Course de Rue est temporairement désactivée par l'administrateur." });
    const { course_id, user_uid, user_name, coureur_id, montant } = req.body;
    if (!course_id || !user_uid || !coureur_id || !montant) {
      return res.status(400).json({ error: "course_id, user_uid, coureur_id et montant requis" });
    }
    if (montant < 50) return res.status(400).json({ error: "Mise minimum : 50 FCFA" });

    const [course] = await db.select().from(courses).where(eq(courses.id, course_id)).limit(1);
    if (!course) return res.status(404).json({ error: "Course introuvable" });
    if (course.status === "finished") return res.status(400).json({ error: "Cette course est terminée" });

    const [user] = await db.select().from(users).where(eq(users.firebaseUid, user_uid)).limit(1);
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
    if (user.isBanned) return res.status(403).json({ error: "Compte suspendu" });
    if ((user.walletBalance ?? 0) < montant) {
      return res.status(400).json({ error: `Solde insuffisant. Vous avez ${user.walletBalance} FCFA.` });
    }

    const alreadyBet = await db.select().from(courseParis)
      .where(drizzleSql`course_id = ${course_id} AND user_uid = ${user_uid}`)
      .limit(1);
    if (alreadyBet.length > 0) return res.status(409).json({ error: "Vous avez déjà misé sur cette course" });

    const newBalance = (user.walletBalance ?? 0) - montant;
    await db.update(users).set({ walletBalance: newBalance } as any).where(eq(users.firebaseUid, user_uid));

    const [pari] = await db.insert(courseParis).values({
      courseId: course_id,
      userUid: user_uid,
      userName: user_name || "Voisin",
      coureurId: coureur_id,
      montant,
      status: "pending",
    } as any).returning();

    await logTransaction("course_pari", user_uid, "course_system", montant, 0,
      `Mise Course de Rue — Coureur: ${coureur_id}`, course_id);

    const allParis = await db.select().from(courseParis).where(eq(courseParis.courseId, course_id));
    const totalMises = allParis.reduce((s, p) => s + p.montant, 0);
    const cagnotte = Math.floor(totalMises * (1 - COURSE_ADMIN_PERCENT)) + (course.carryoverAmount ?? 0);

    res.json(toSnake({ pari, newBalance, totalMises, cagnotteAmount: cagnotte }));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/courses/:id/finish — Admin termine la course (Pari Mutuel)
app.post("/api/courses/:id/finish", async (req, res) => {
  try {
    const { id } = req.params;
    const { winner_coureur_id, admin_uid, admin_email } = req.body;
    if (!winner_coureur_id) return res.status(400).json({ error: "winner_coureur_id requis" });

    const emailOk = admin_email && ADMIN_EMAILS.includes(admin_email);
    let isAdminOk = emailOk;
    if (!isAdminOk && admin_uid) {
      const [admin] = await db.select().from(users).where(eq(users.firebaseUid, admin_uid)).limit(1);
      isAdminOk = !!admin?.isAdmin;
    }
    if (!isAdminOk) return res.status(403).json({ error: "Admin requis" });

    const [course] = await db.select().from(courses).where(eq(courses.id, id)).limit(1);
    if (!course) return res.status(404).json({ error: "Course introuvable" });
    if (course.status === "finished") return res.status(400).json({ error: "Course déjà terminée" });

    const allParis = await db.select().from(courseParis).where(eq(courseParis.courseId, id));
    const totalMises = allParis.reduce((s, p) => s + p.montant, 0);
    const adminCut = Math.floor(totalMises * COURSE_ADMIN_PERCENT);
    const cagnotte = totalMises - adminCut + (course.carryoverAmount ?? 0);

    const parisGagnants = allParis.filter((p) => p.coureurId === winner_coureur_id);
    let carryoverAmount = 0;
    let gainParGagnant = 0;

    if (parisGagnants.length === 0) {
      carryoverAmount = cagnotte;
    } else {
      gainParGagnant = Math.floor(cagnotte / parisGagnants.length);
    }

    for (const pari of allParis) {
      const isWinner = pari.coureurId === winner_coureur_id;
      const gain = isWinner ? gainParGagnant : 0;
      await db.update(courseParis)
        .set({ status: isWinner ? "won" : "lost", gain } as any)
        .where(eq(courseParis.id, pari.id));

      if (isWinner && gain > 0) {
        const [u] = await db.select().from(users).where(eq(users.firebaseUid, pari.userUid)).limit(1);
        if (u) {
          await db.update(users)
            .set({ walletBalance: (u.walletBalance ?? 0) + gain } as any)
            .where(eq(users.firebaseUid, pari.userUid));
          await logTransaction("course_gain", "course_system", pari.userUid, gain, 0,
            `Gain Course de Rue — Coureur gagnant: ${winner_coureur_id}`, id);
        }
      }
    }

    const [updatedCourse] = await db.update(courses).set({
      status: "finished",
      winnerCoureurId: winner_coureur_id,
      totalMises,
      cagnotteAmount: cagnotte,
      adminCut,
      carryoverAmount,
      finishedAt: new Date(),
    } as any).where(eq(courses.id, id)).returning();

    broadcastToAll({
      type: "course_finished",
      courseId: id,
      winnerCoureurId: winner_coureur_id,
      gainParGagnant,
      nbGagnants: parisGagnants.length,
      hasCarryover: carryoverAmount > 0,
      carryoverAmount,
    });

    res.json(toSnake({
      course: updatedCourse,
      totalMises,
      cagnotte,
      adminCut,
      gainParGagnant,
      nbGagnants: parisGagnants.length,
      carryoverAmount,
      hasCarryover: carryoverAmount > 0,
    }));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Admin : Statistiques Système ────────────────────────────────────
app.get("/api/admin/system-stats", async (req, res) => {
  try {
    const { email } = req.query as { email?: string };
    if (!email || !ADMIN_EMAILS.includes(email)) return res.status(403).json({ error: "Accès refusé" });

    const allUsers = await db.select({ walletBalance: users.walletBalance }).from(users);
    const totalWallets = allUsers.reduce((s, u) => s + (u.walletBalance ?? 0), 0);

    const activeCourse = await db.select().from(courses)
      .where(drizzleSql`status IN ('open', 'running')`)
      .limit(1);

    let totalParisCours = 0;
    if (activeCourse.length > 0) {
      const paris = await db.select({ montant: courseParis.montant })
        .from(courseParis)
        .where(eq(courseParis.courseId, activeCourse[0].id));
      totalParisCours = paris.reduce((s, p) => s + p.montant, 0);
    }

    const userCount = allUsers.length;

    res.json({
      total_wallets: totalWallets,
      total_paris_en_cours: totalParisCours,
      user_count: userCount,
      active_course: activeCourse.length > 0 ? toSnake(activeCourse[0]) : null,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Admin : Historique des Gains ────────────────────────────────────
app.get("/api/admin/gains-history", async (req, res) => {
  try {
    const { email } = req.query as { email?: string };
    if (!email || !ADMIN_EMAILS.includes(email)) return res.status(403).json({ error: "Accès refusé" });

    const recentWins = await db.select().from(transactions)
      .where(drizzleSql`type IN ('course_gain', 'quiz_win', 'loto_win')`)
      .orderBy(desc(transactions.createdAt))
      .limit(50);

    res.json(toSnake(recentWins));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Admin : Créer un Quiz en lot (10 questions) ─────────────────────
app.post("/api/admin/quiz/create-batch", async (req, res) => {
  try {
    const { email, titre, prize_pool, questions } = req.body;
    if (!email || !ADMIN_EMAILS.includes(email)) return res.status(403).json({ error: "Accès refusé" });
    if (!Array.isArray(questions) || questions.length === 0) {
      return res.status(400).json({ error: "Au moins 1 question requise" });
    }
    const cleaned: { question: string; options: string[]; correct: number }[] = [];
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const text = (q?.question || "").trim();
      const opts = Array.isArray(q?.options) ? q.options.map((o: string) => (o || "").trim()) : [];
      const correct = Number(q?.correct_index ?? q?.correct);
      if (!text) return res.status(400).json({ error: `Question ${i + 1} : texte manquant` });
      if (opts.length !== 4 || opts.some((o: string) => !o)) {
        return res.status(400).json({ error: `Question ${i + 1} : 4 options non vides requises` });
      }
      if (!Number.isInteger(correct) || correct < 0 || correct > 3) {
        return res.status(400).json({ error: `Question ${i + 1} : bonne réponse invalide` });
      }
      cleaned.push({ question: text, options: opts, correct });
    }

    QUIZ_QUESTIONS.length = 0;
    for (const q of cleaned) QUIZ_QUESTIONS.push(q);

    const [session] = await db.insert(quizSessions).values({
      titre: (titre || "Live Quiz QuartierPlus").toString().trim(),
      prizePool: Number(prize_pool) || 10000,
      totalQuestions: cleaned.length,
      status: "scheduled",
    } as any).returning();

    quizGame = {
      sessionId: session.id,
      status: "waiting",
      currentQuestionIndex: 0,
      players: new Map(),
      timerRef: null,
      tickRef: null,
      secondsLeft: 10,
    };

    broadcastToAll({ type: "quiz_created", session_id: session.id, total_questions: cleaned.length });
    console.log(`[Quiz] Lot créé: ${session.id} — ${cleaned.length} questions — prize: ${session.prizePool} FCFA`);
    res.json({ success: true, session: toSnake(session), total_questions: cleaned.length });
  } catch (err) {
    console.error("[Admin Quiz Create Batch]", err);
    res.status(500).json({ error: String(err) });
  }
});

// ─── Admin : Quiz actif courant ──────────────────────────────────────
app.get("/api/admin/quiz/active", async (req, res) => {
  try {
    const { email } = req.query as { email?: string };
    if (!email || !ADMIN_EMAILS.includes(email)) return res.status(403).json({ error: "Accès refusé" });
    const sessions = await db.select().from(quizSessions)
      .where(drizzleSql`status IN ('scheduled', 'live')`)
      .orderBy(desc(quizSessions.createdAt))
      .limit(1);
    const active = sessions[0] || null;
    res.json({
      active: active ? toSnake(active) : null,
      total_questions: QUIZ_QUESTIONS.length,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Admin : Ajouter une question Quiz personnalisée ─────────────────
app.post("/api/admin/quiz/add-question", async (req, res) => {
  try {
    const { email, question, options, correct_index } = req.body;
    if (!email || !ADMIN_EMAILS.includes(email)) return res.status(403).json({ error: "Accès refusé" });
    if (!question || !Array.isArray(options) || options.length !== 4) {
      return res.status(400).json({ error: "question et 4 options requis" });
    }
    if (correct_index === undefined || correct_index < 0 || correct_index > 3) {
      return res.status(400).json({ error: "correct_index entre 0 et 3 requis" });
    }
    const newQ = { question: question.trim(), options: options.map((o: string) => o.trim()), correct: correct_index };
    QUIZ_QUESTIONS.unshift(newQ);
    if (QUIZ_QUESTIONS.length > 20) QUIZ_QUESTIONS.pop();
    res.json({ success: true, total_questions: QUIZ_QUESTIONS.length, question: newQ });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Admin : Flash Message Broadcast ────────────────────────────────
app.post("/api/admin/flash-message", async (req, res) => {
  try {
    const { email, message, title } = req.body;
    if (!email || !ADMIN_EMAILS.includes(email)) return res.status(403).json({ error: "Accès refusé" });
    if (!message?.trim()) return res.status(400).json({ error: "message requis" });
    broadcastToAll({
      type: "flash_message",
      title: title?.trim() || "📢 Message du Quartier",
      message: message.trim(),
      sentAt: new Date().toISOString(),
    });
    res.json({ success: true, recipients: wss?.clients.size ?? 0 });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Admin : Bannir / Débannir un utilisateur ────────────────────────
app.patch("/api/admin/users/:uid/ban", async (req, res) => {
  try {
    const { email, ban } = req.body;
    const { uid } = req.params;
    if (!email || !ADMIN_EMAILS.includes(email)) return res.status(403).json({ error: "Accès refusé" });
    const [user] = await db.update(users)
      .set({ isBanned: ban === true } as any)
      .where(eq(users.firebaseUid, uid))
      .returning();
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
    if (ban === true) {
      broadcastToAll({ type: "user_banned", uid });
    }
    res.json({ success: true, uid, isBanned: user.isBanned });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Admin : Recherche d'utilisateurs ───────────────────────────────
app.get("/api/admin/users/search", async (req, res) => {
  try {
    const { email, q } = req.query as { email?: string; q?: string };
    if (!email || !ADMIN_EMAILS.includes(email)) return res.status(403).json({ error: "Accès refusé" });
    if (!q || q.trim().length < 2) return res.status(400).json({ error: "Terme de recherche requis (min 2 caractères)" });
    const term = `%${q.trim().toLowerCase()}%`;
    const results = await db.select({
      firebaseUid: users.firebaseUid,
      displayName: users.displayName,
      email: users.email,
      walletBalance: users.walletBalance,
      isBanned: users.isBanned,
      isAdmin: users.isAdmin,
    }).from(users)
      .where(drizzleSql`LOWER(display_name) LIKE ${term} OR LOWER(email) LIKE ${term}`)
      .limit(20);
    res.json(toSnake(results));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Admin : État des jeux ───────────────────────────────────────────
app.get("/api/admin/game-status", async (req, res) => {
  try {
    const { email } = req.query as { email?: string };
    if (!email || !ADMIN_EMAILS.includes(email)) return res.status(403).json({ error: "Accès refusé" });
    res.json({ course: gameEnabled.course, quiz: gameEnabled.quiz, loto: gameEnabled.loto });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Admin : Toggle jeu ──────────────────────────────────────────────
app.post("/api/admin/game-toggle", async (req, res) => {
  try {
    const { email, game, enabled } = req.body;
    if (!email || !ADMIN_EMAILS.includes(email)) return res.status(403).json({ error: "Accès refusé" });
    if (!["course", "quiz", "loto"].includes(game)) return res.status(400).json({ error: "game doit être 'course', 'quiz' ou 'loto'" });
    gameEnabled[game as "course" | "quiz" | "loto"] = enabled === true;
    broadcastToAll({ type: "game_toggle", game, enabled: gameEnabled[game as "course" | "quiz" | "loto"] });
    res.json({ success: true, game, enabled: gameEnabled[game as "course" | "quiz" | "loto"] });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Admin : Reset scores de jeu ─────────────────────────────────────
app.post("/api/admin/game-reset", async (req, res) => {
  try {
    const { email, game } = req.body;
    if (!email || !ADMIN_EMAILS.includes(email)) return res.status(403).json({ error: "Accès refusé" });
    if (game === "course") {
      await db.execute(drizzleSql`UPDATE course_paris SET status = 'reset', gain = 0 WHERE status = 'pending'`);
      await db.execute(drizzleSql`UPDATE courses SET status = 'finished', finished_at = NOW() WHERE status IN ('open', 'running')`);
      broadcastToAll({ type: "course_reset" });
    } else if (game === "quiz") {
      if (quizGame) {
        quizGame.players.clear();
        quizGame = null;
      }
      broadcastToAll({ type: "quiz_reset" });
    }
    res.json({ success: true, game, message: `${game} réinitialisé avec succès` });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Admin : Lire commission ──────────────────────────────────────────
app.get("/api/admin/commission", async (req, res) => {
  try {
    const { email } = req.query as { email?: string };
    if (!email || !ADMIN_EMAILS.includes(email)) return res.status(403).json({ error: "Accès refusé" });
    res.json({
      mode: serviceFcfa !== null ? "fixed" : "percent",
      fcfa: serviceFcfa,
      percent: Math.round(serviceFeePercent * 100),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Admin : Définir commission ───────────────────────────────────────
app.post("/api/admin/commission", async (req, res) => {
  try {
    const { email, mode, value } = req.body;
    if (!email || !ADMIN_EMAILS.includes(email)) return res.status(403).json({ error: "Accès refusé" });
    if (mode === "fixed") {
      serviceFcfa = Number(value) || 0;
      serviceFeePercent = 0.20;
    } else {
      serviceFcfa = null;
      serviceFeePercent = (Number(value) || 20) / 100;
    }
    res.json({
      success: true,
      mode,
      fcfa: serviceFcfa,
      percent: Math.round(serviceFeePercent * 100),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Admin : Contrôle Course de Rue (sans admin_uid, via email) ──────
app.get("/api/admin/course-active", async (req, res) => {
  try {
    const { email } = req.query as { email?: string };
    if (!email || !ADMIN_EMAILS.includes(email)) return res.status(403).json({ error: "Accès refusé" });

    const [course] = await db.select().from(courses)
      .where(drizzleSql`status IN ('open', 'running')`)
      .orderBy(desc(courses.createdAt))
      .limit(1);

    if (!course) return res.json(null);

    const paris = await db.select().from(courseParis).where(eq(courseParis.courseId, course.id));
    const repartition: Record<string, number> = {};
    for (const p of paris) {
      repartition[p.coureurId] = (repartition[p.coureurId] ?? 0) + 1;
    }
    const totalMises = paris.reduce((s, p) => s + p.montant, 0);
    const cagnotte = Math.floor(totalMises * (1 - COURSE_ADMIN_PERCENT)) + (course.carryoverAmount ?? 0);

    res.json(toSnake({ ...course, totalMises, cagnotteAmount: cagnotte, repartition, paris: toSnake(paris) }));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Build Web Statique ────────────────────────────────────────────────
const WEB_DIST = path.join(process.cwd(), "web-dist");

// index.html : jamais en cache navigateur (toujours la version fraîche)
app.get("/", (_req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.sendFile(path.join(WEB_DIST, "index.html"));
});

// Fichiers JS/CSS/images : no-cache pour garantir la fraîcheur à chaque build
app.use(express.static(WEB_DIST, { maxAge: 0, etag: false, lastModified: false, setHeaders: (res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}}));

// ─── Quiz REST Endpoints (doit être avant le catch-all SPA) ──────────
app.get("/api/quiz/next", async (_req, res) => {
  try {
    const [session] = await db.select().from(quizSessions)
      .where(drizzleSql`status IN ('scheduled', 'waiting', 'active')`)
      .orderBy(quizSessions.scheduledAt)
      .limit(1);
    res.json(session ? toSnake(session) : null);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/quiz/sessions", async (_req, res) => {
  try {
    const sessions = await db.select().from(quizSessions)
      .orderBy(desc(quizSessions.createdAt))
      .limit(20);
    res.json(toSnake(sessions));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/quiz/sessions", async (req, res) => {
  try {
    if (!gameEnabled.quiz) return res.status(503).json({ error: "Le Quiz est temporairement désactivé par l'administrateur." });
    const { titre, prize_pool, scheduled_at, admin_uid } = req.body;
    const [admin] = await db.select().from(users).where(eq(users.firebaseUid, admin_uid)).limit(1);
    if (!admin?.isAdmin) return res.status(403).json({ error: "Admin requis" });

    const [session] = await db.insert(quizSessions).values({
      titre: titre || "Live Quiz QuartierPlus",
      prizePool: prize_pool || 10000,
      totalQuestions: QUIZ_QUESTIONS.length,
      scheduledAt: scheduled_at ? new Date(scheduled_at) : null,
      status: "scheduled",
    } as any).returning();

    quizGame = {
      sessionId: session.id,
      status: "waiting",
      currentQuestionIndex: 0,
      players: new Map(),
      timerRef: null,
      tickRef: null,
      secondsLeft: 10,
    };

    console.log(`[Quiz] Session créée: ${session.id} — prize: ${prize_pool} FCFA`);
    res.json(toSnake(session));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.patch("/api/quiz/sessions/:id/schedule", async (req, res) => {
  try {
    const { id } = req.params;
    const { scheduled_at, admin_uid } = req.body;
    const [admin] = await db.select().from(users).where(eq(users.firebaseUid, admin_uid)).limit(1);
    if (!admin?.isAdmin) return res.status(403).json({ error: "Admin requis" });
    const [session] = await db.update(quizSessions)
      .set({ scheduledAt: new Date(scheduled_at) } as any)
      .where(eq(quizSessions.id, id))
      .returning();
    res.json(toSnake(session));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Scratch Card Game ────────────────────────────────────────────────
const SCRATCH_SYMBOLS = ["🍋", "🍊", "🍇", "⭐", "💎", "🎯", "🔔", "🌸", "🍀"];
const SCRATCH_PRIZES: Record<string, number> = {
  "🍋": 200, "🍊": 300, "🍇": 500, "⭐": 750, "💎": 2000, "🎯": 1500, "🔔": 400, "🌸": 350, "🍀": 1000,
};
const SCRATCH_COST = 50;

function generateScratchGrid(): string[] {
  const grid: string[] = [];
  const rand = Math.random();
  if (rand < 0.30) {
    const winSymbol = SCRATCH_SYMBOLS[Math.floor(Math.random() * SCRATCH_SYMBOLS.length)];
    const winRow = Math.floor(Math.random() * 3);
    for (let i = 0; i < 9; i++) {
      const row = Math.floor(i / 3);
      if (row === winRow) { grid.push(winSymbol); }
      else {
        let s: string;
        do { s = SCRATCH_SYMBOLS[Math.floor(Math.random() * SCRATCH_SYMBOLS.length)]; } while (s === winSymbol);
        grid.push(s);
      }
    }
  } else {
    for (let i = 0; i < 9; i++) grid.push(SCRATCH_SYMBOLS[Math.floor(Math.random() * SCRATCH_SYMBOLS.length)]);
    const rows = [[0,1,2],[3,4,5],[6,7,8]];
    rows.forEach(r => {
      if (grid[r[0]] === grid[r[1]] && grid[r[1]] === grid[r[2]]) grid[r[2]] = SCRATCH_SYMBOLS.find(s => s !== grid[r[0]])!;
    });
  }
  return grid;
}

function checkScratchWin(grid: string[]): { won: boolean; prize: number; winLine: number[] } {
  const rows = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const line of rows) {
    const [a,b,c] = line;
    if (grid[a] === grid[b] && grid[b] === grid[c]) {
      return { won: true, prize: SCRATCH_PRIZES[grid[a]] || 200, winLine: line };
    }
  }
  return { won: false, prize: 0, winLine: [] };
}

app.post("/api/games/scratch/play", async (req, res) => {
  const { uid } = req.body;
  if (!uid) return res.status(400).json({ error: "uid requis" });
  try {
    const [user] = await db.select().from(users).where(eq(users.firebaseUid, uid)).limit(1);
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
    if (user.walletBalance < SCRATCH_COST) return res.status(400).json({ error: `Solde insuffisant. Il vous faut ${SCRATCH_COST} FCFA.` });
    const newBalance = user.walletBalance - SCRATCH_COST;
    await db.update(users).set({ walletBalance: newBalance }).where(eq(users.firebaseUid, uid));
    await db.insert(walletTransactions).values({ userId: uid, type: "scratch_play", amount: -SCRATCH_COST, description: "Ticket grattage" });
    const grid = generateScratchGrid();
    const { won, prize, winLine } = checkScratchWin(grid);
    let finalBalance = newBalance;
    if (won && prize > 0) {
      finalBalance = newBalance + prize;
      await db.update(users).set({ walletBalance: finalBalance }).where(eq(users.firebaseUid, uid));
      await db.insert(walletTransactions).values({ userId: uid, type: "scratch_win", amount: prize, description: `Gain grattage : ${prize} FCFA` });
    }
    broadcastToUser(uid, { type: "balance_update", balance: finalBalance });
    res.json({ grid, won, prize, winLine, balance: finalBalance });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ─── Quiz Quartier Game ────────────────────────────────────────────────
const QUIZ_BANK = [
  { q: "Quelle est la monnaie officielle du Sénégal ?", opts: ["Franc CFA", "Dalasi", "Cedi", "Naira"], a: 0 },
  { q: "Quelle ville est la capitale économique de la Côte d'Ivoire ?", opts: ["Yamoussoukro", "Abidjan", "Bouaké", "Man"], a: 1 },
  { q: "Combien de joueurs composent une équipe de football ?", opts: ["9", "10", "11", "12"], a: 2 },
  { q: "Quel fruit est le plus consommé en Afrique de l'Ouest ?", opts: ["Mangue", "Ananas", "Banane plantain", "Orange"], a: 2 },
  { q: "Le marché de gros sert à quoi principalement ?", opts: ["Achats en détail", "Vente en gros aux marchands", "Restauration", "Location"], a: 1 },
  { q: "Quel est le rôle d'un chef de quartier ?", opts: ["Collecter les impôts", "Gérer les litiges locaux", "Diriger la mairie", "Enseigner"], a: 1 },
  { q: "Quelle cérémonie marque la fin du mois de Ramadan ?", opts: ["Noël", "Tabaski", "Aïd El Fitr", "Magal"], a: 2 },
  { q: "En quelle année l'Afrique du Sud a-t-elle accueilli la Coupe du Monde ?", opts: ["2006", "2008", "2010", "2014"], a: 2 },
  { q: "Le tontine est un système de quoi ?", opts: ["Épargne collective", "Transport", "Vente groupée", "Jeu de hasard"], a: 0 },
  { q: "Quel organe filtre le sang dans le corps humain ?", opts: ["Foie", "Rein", "Poumon", "Cœur"], a: 1 },
  { q: "Quel est le principal ingrédient du thiéboudienne ?", opts: ["Poulet", "Riz", "Mil", "Igname"], a: 1 },
  { q: "Combien de jours dure un mois lunaire approximativement ?", opts: ["28", "29.5", "31", "30"], a: 1 },
  { q: "La téléphonie mobile permet principalement de faire quoi avec Mobile Money ?", opts: ["Regarder des films", "Transférer de l'argent", "Jouer aux jeux vidéo", "Envoyer des emails"], a: 1 },
  { q: "Le soleil se lève à quel point cardinal ?", opts: ["Nord", "Sud", "Est", "Ouest"], a: 2 },
  { q: "Quel sport est le plus populaire en Afrique ?", opts: ["Basketball", "Football", "Lutte", "Athlétisme"], a: 1 },
  { q: "Combien vaut 1 FCFA en centimes CFA ?", opts: ["50", "100", "1", "10"], a: 2 },
  { q: "Un marché hebdomadaire a lieu combien de fois par semaine ?", opts: ["Tous les jours", "1 fois", "3 fois", "5 fois"], a: 1 },
  { q: "Quel animal est l'emblème de la Côte d'Ivoire ?", opts: ["Lion", "Éléphant", "Panthère", "Gazelle"], a: 1 },
  { q: "Qu'est-ce qu'un griot traditionnel ?", opts: ["Un artisan", "Un gardien de la tradition orale", "Un chef religieux", "Un commerçant"], a: 1 },
  { q: "Le boubou est quel type de vêtement ?", opts: ["Chaussure", "Vêtement traditionnel", "Coiffure", "Bijou"], a: 1 },
];
const QUIZ_COST = 25;
const QUIZ_WIN = 100;

app.get("/api/games/quiz-quartier/question", async (req, res) => {
  const idx = Math.floor(Math.random() * QUIZ_BANK.length);
  const { q, opts, a } = QUIZ_BANK[idx];
  res.json({ id: idx, question: q, options: opts, correctIndex: a });
});

app.post("/api/games/quiz-quartier/play", async (req, res) => {
  const { uid, questionId, answerIndex } = req.body;
  if (uid === undefined || questionId === undefined || answerIndex === undefined) return res.status(400).json({ error: "uid, questionId, answerIndex requis" });
  try {
    const [user] = await db.select().from(users).where(eq(users.firebaseUid, uid)).limit(1);
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
    if (user.walletBalance < QUIZ_COST) return res.status(400).json({ error: `Solde insuffisant. Il vous faut ${QUIZ_COST} FCFA.` });
    const question = QUIZ_BANK[questionId];
    if (!question) return res.status(400).json({ error: "Question introuvable" });
    const correct = question.a === answerIndex;
    const debited = user.walletBalance - QUIZ_COST;
    await db.update(users).set({ walletBalance: debited }).where(eq(users.firebaseUid, uid));
    await db.insert(walletTransactions).values({ userId: uid, type: "quiz_quartier_play", amount: -QUIZ_COST, description: "Quiz Quartier — mise" });
    let finalBalance = debited;
    if (correct) {
      finalBalance = debited + QUIZ_WIN;
      await db.update(users).set({ walletBalance: finalBalance }).where(eq(users.firebaseUid, uid));
      await db.insert(walletTransactions).values({ userId: uid, type: "quiz_quartier_win", amount: QUIZ_WIN, description: "Quiz Quartier — bonne réponse" });
    }
    broadcastToUser(uid, { type: "balance_update", balance: finalBalance });
    res.json({ correct, correctIndex: question.a, prize: correct ? QUIZ_WIN : 0, balance: finalBalance });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// ─── Keno Express Game ─────────────────────────────────────────────────
const KENO_COST = 75;
const KENO_PRIZES: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 150, 4: 750, 5: 5000 };

app.post("/api/games/keno/play", async (req, res) => {
  const { uid, picks } = req.body;
  if (!uid || !Array.isArray(picks) || picks.length !== 5) return res.status(400).json({ error: "uid + picks[5] requis" });
  if (picks.some((n: any) => typeof n !== "number" || n < 1 || n > 30)) return res.status(400).json({ error: "picks: 5 numéros entre 1 et 30" });
  try {
    const [user] = await db.select().from(users).where(eq(users.firebaseUid, uid)).limit(1);
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
    if (user.walletBalance < KENO_COST) return res.status(400).json({ error: `Solde insuffisant. Il vous faut ${KENO_COST} FCFA.` });
    const all = Array.from({ length: 30 }, (_, i) => i + 1);
    const drawn: number[] = [];
    while (drawn.length < 10) {
      const idx = Math.floor(Math.random() * all.length);
      drawn.push(all.splice(idx, 1)[0]);
    }
    drawn.sort((a, b) => a - b);
    const matches = picks.filter((p: number) => drawn.includes(p)).length;
    const prize = KENO_PRIZES[matches] || 0;
    const debited = user.walletBalance - KENO_COST;
    await db.update(users).set({ walletBalance: debited }).where(eq(users.firebaseUid, uid));
    await db.insert(walletTransactions).values({ userId: uid, type: "keno_play", amount: -KENO_COST, description: "Keno Express — mise" });
    let finalBalance = debited;
    if (prize > 0) {
      finalBalance = debited + prize;
      await db.update(users).set({ walletBalance: finalBalance }).where(eq(users.firebaseUid, uid));
      await db.insert(walletTransactions).values({ userId: uid, type: "keno_win", amount: prize, description: `Keno Express — ${matches} numéro(s) : ${prize} FCFA` });
    }
    broadcastToUser(uid, { type: "balance_update", balance: finalBalance });
    res.json({ drawn, picks, matches, prize, balance: finalBalance });
  } catch (err) { res.status(500).json({ error: String(err) }); }
});

// SPA fallback : toutes les routes inconnues renvoient index.html sans cache
app.use((_req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.sendFile(path.join(WEB_DIST, "index.html"));
});

// ─── HTTP Server + WebSocket ──────────────────────────────────────────
const httpServer = http.createServer(app);
wss = new WebSocket.Server({ server: httpServer });

// ─── Quiz Question Bank ───────────────────────────────────────────────
const QUIZ_QUESTIONS = [
  { question: "Quelle est la capitale du Sénégal ?", options: ["Dakar", "Abidjan", "Accra", "Bamako"], correct: 0 },
  { question: "Quelle monnaie est utilisée en Afrique de l'Ouest francophone ?", options: ["Euro", "Naira", "Franc CFA", "Cedi"], correct: 2 },
  { question: "Le concept de 'téranga' en Sénégal signifie :", options: ["Travail", "Hospitalité", "Courage", "Commerce"], correct: 1 },
  { question: "Combien de pays membres compte la CEDEAO ?", options: ["12", "13", "15", "17"], correct: 2 },
  { question: "Le baobab est surnommé l'arbre à... ?", options: ["Vie", "Pain", "Eau", "Lumière"], correct: 1 },
  { question: "Quel est le plus grand désert du monde ?", options: ["Kalahari", "Namib", "Sahara", "Gobi"], correct: 2 },
  { question: "Quelle ville africaine est surnommée 'la perle de l'Atlantique' ?", options: ["Abidjan", "Libreville", "Dakar", "Lomé"], correct: 2 },
  { question: "La médina est traditionnellement :", options: ["Un marché", "Un quartier ancien", "Une mosquée", "Un palais"], correct: 1 },
  { question: "Le manioc est également appelé :", options: ["Igname", "Cassave", "Taro", "Plantain"], correct: 1 },
  { question: "Quel pays africain a obtenu l'indépendance en premier au sud du Sahara ?", options: ["Nigeria", "Ghana", "Côte d'Ivoire", "Sénégal"], correct: 1 },
];

// ─── Quiz In-Memory State ─────────────────────────────────────────────
interface QuizPlayer {
  ws: WebSocket;
  userUid: string;
  userName: string;
  eliminated: boolean;
  answered: boolean;
  answeredCorrectly: boolean;
  isAdmin: boolean;
}

interface QuizGame {
  sessionId: string;
  status: "waiting" | "question" | "reviewing" | "finished";
  currentQuestionIndex: number;
  players: Map<string, QuizPlayer>;
  timerRef: ReturnType<typeof setTimeout> | null;
  tickRef: ReturnType<typeof setInterval> | null;
  secondsLeft: number;
}

let quizGame: QuizGame | null = null;

function broadcast(game: QuizGame, msg: object, onlyActive = false) {
  const payload = JSON.stringify(msg);
  game.players.forEach((p) => {
    if (onlyActive && p.eliminated) return;
    if (p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(payload);
    }
  });
}

function broadcastPlayerCount(game: QuizGame) {
  const active = Array.from(game.players.values()).filter((p) => !p.eliminated).length;
  broadcast(game, { type: "player_count", count: active });
}

function sendToPlayer(player: QuizPlayer, msg: object) {
  if (player.ws.readyState === WebSocket.OPEN) {
    player.ws.send(JSON.stringify(msg));
  }
}

async function endQuiz(game: QuizGame) {
  if (game.timerRef) clearTimeout(game.timerRef);
  if (game.tickRef) clearInterval(game.tickRef);
  game.status = "finished";

  const winners = Array.from(game.players.values()).filter((p) => !p.eliminated);
  const winnerCount = winners.length;

  try {
    const [session] = await db.select().from(quizSessions).where(eq(quizSessions.id, game.sessionId)).limit(1);
    const prizePool = session?.prizePool ?? 0;
    const prizePerWinner = winnerCount > 0 ? Math.floor(prizePool / winnerCount) : 0;

    if (prizePerWinner > 0) {
      for (const w of winners) {
        const [u] = await db.select().from(users).where(eq(users.firebaseUid, w.userUid)).limit(1);
        if (u) {
          await db.update(users)
            .set({ walletBalance: (u.walletBalance ?? 0) + prizePerWinner } as any)
            .where(eq(users.firebaseUid, w.userUid));
          await logTransaction("quiz_win", "quiz_system", w.userUid, prizePerWinner, 0,
            `Gain Live Quiz — Grand Partage: ${winnerCount} gagnant(s)`, game.sessionId);
        }
      }
    }

    await db.update(quizSessions)
      .set({ status: "finished", winnerCount, prizePerWinner } as any)
      .where(eq(quizSessions.id, game.sessionId));

    game.players.forEach((p) => {
      const won = !p.eliminated;
      sendToPlayer(p, {
        type: "quiz_end",
        won,
        prize: won ? prizePerWinner : 0,
        winner_count: winnerCount,
        total_players: game.players.size,
      });
    });
    console.log(`[Quiz] Terminé — ${winnerCount} gagnants, ${prizePerWinner} FCFA chacun`);
  } catch (e) {
    console.error("[Quiz] Erreur fin de quiz:", e);
  }

  quizGame = null;
}

async function startQuestion(game: QuizGame) {
  if (game.timerRef) clearTimeout(game.timerRef);
  if (game.tickRef) clearInterval(game.tickRef);

  const activePlayers = Array.from(game.players.values()).filter((p) => !p.eliminated);
  if (activePlayers.length === 0) {
    await endQuiz(game);
    return;
  }

  if (game.currentQuestionIndex >= QUIZ_QUESTIONS.length) {
    await endQuiz(game);
    return;
  }

  game.status = "question";
  game.secondsLeft = 10;
  const q = QUIZ_QUESTIONS[game.currentQuestionIndex];

  game.players.forEach((p) => {
    p.answered = false;
    p.answeredCorrectly = false;
  });

  broadcast(game, {
    type: "question",
    index: game.currentQuestionIndex,
    total: QUIZ_QUESTIONS.length,
    question: q.question,
    options: q.options,
    seconds: 10,
  });

  await db.update(quizSessions)
    .set({ currentQuestionIndex: game.currentQuestionIndex } as any)
    .where(eq(quizSessions.id, game.sessionId));

  game.tickRef = setInterval(() => {
    game.secondsLeft--;
    broadcast(game, { type: "timer", seconds: game.secondsLeft });
    if (game.secondsLeft <= 0) {
      if (game.tickRef) clearInterval(game.tickRef);
    }
  }, 1000);

  game.timerRef = setTimeout(async () => {
    if (game.tickRef) clearInterval(game.tickRef);
    game.status = "reviewing";

    const q2 = QUIZ_QUESTIONS[game.currentQuestionIndex];
    const eliminatedNow: string[] = [];

    game.players.forEach((p) => {
      if (!p.eliminated && !p.answeredCorrectly) {
        p.eliminated = true;
        eliminatedNow.push(p.userUid);
        sendToPlayer(p, { type: "eliminated", reason: p.answered ? "wrong_answer" : "timeout" });
      }
    });

    broadcast(game, {
      type: "answer_reveal",
      correct_index: q2.correct,
      eliminated: eliminatedNow,
    });

    const stillActive = Array.from(game.players.values()).filter((p) => !p.eliminated).length;
    broadcast(game, { type: "player_count", count: stillActive });

    await new Promise((r) => setTimeout(r, 3000));
    game.currentQuestionIndex++;
    await startQuestion(game);
  }, 10000);
}

// ─── WebSocket Handler ────────────────────────────────────────────────
wss.on("connection", (ws: WebSocket) => {
  let playerUid: string | null = null;
  let registeredUid: string | null = null;

  ws.on("close", () => {
    if (registeredUid) {
      const conns = userConnections.get(registeredUid);
      if (conns) { conns.delete(ws); if (conns.size === 0) userConnections.delete(registeredUid); }
    }
  });

  ws.on("message", async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      const { type } = msg;

      // ─── Enregistrement connexion utilisateur (pour broadcastToUser) ──
      if (type === "register") {
        const { uid } = msg;
        if (uid) {
          registeredUid = uid;
          if (!userConnections.has(uid)) userConnections.set(uid, new Set());
          userConnections.get(uid)!.add(ws);
          ws.send(JSON.stringify({ type: "registered", uid }));
        }
        return;
      }

      if (type === "join") {
        const { sessionId, userUid, userName } = msg;
        playerUid = userUid;

        if (!quizGame || quizGame.sessionId !== sessionId) {
          ws.send(JSON.stringify({ type: "error", message: "Session introuvable ou inactive" }));
          return;
        }

        const [u] = await db.select({ isAdmin: users.isAdmin }).from(users)
          .where(eq(users.firebaseUid, userUid)).limit(1);

        const player: QuizPlayer = {
          ws,
          userUid,
          userName,
          eliminated: false,
          answered: false,
          answeredCorrectly: false,
          isAdmin: u?.isAdmin ?? false,
        };
        quizGame.players.set(userUid, player);

        const activeCount = Array.from(quizGame.players.values()).filter((p) => !p.eliminated).length;
        ws.send(JSON.stringify({
          type: "joined",
          status: quizGame.status,
          player_count: activeCount,
          current_question: quizGame.currentQuestionIndex,
        }));
        broadcastPlayerCount(quizGame);
        return;
      }

      if (type === "answer") {
        if (!quizGame || !playerUid) return;
        const player = quizGame.players.get(playerUid);
        if (!player || player.eliminated || player.answered) return;
        if (quizGame.status !== "question") return;

        player.answered = true;
        const q = QUIZ_QUESTIONS[quizGame.currentQuestionIndex];
        player.answeredCorrectly = msg.answer_index === q.correct;

        ws.send(JSON.stringify({
          type: "answer_ack",
          correct: player.answeredCorrectly,
        }));

        const allAnswered = Array.from(quizGame.players.values())
          .filter((p) => !p.eliminated)
          .every((p) => p.answered);

        if (allAnswered && quizGame.timerRef) {
          clearTimeout(quizGame.timerRef);
          if (quizGame.tickRef) clearInterval(quizGame.tickRef);
          quizGame.status = "reviewing";

          const eliminatedNow: string[] = [];
          quizGame.players.forEach((p) => {
            if (!p.eliminated && !p.answeredCorrectly) {
              p.eliminated = true;
              eliminatedNow.push(p.userUid);
              sendToPlayer(p, { type: "eliminated", reason: "wrong_answer" });
            }
          });

          broadcast(quizGame, { type: "answer_reveal", correct_index: q.correct, eliminated: eliminatedNow });
          const stillActive = Array.from(quizGame.players.values()).filter((p) => !p.eliminated).length;
          broadcast(quizGame, { type: "player_count", count: stillActive });

          await new Promise((r) => setTimeout(r, 3000));
          quizGame.currentQuestionIndex++;
          await startQuestion(quizGame);
        }
        return;
      }

      if (type === "admin_start") {
        if (!quizGame || !playerUid) return;
        const player = quizGame.players.get(playerUid);
        if (!player?.isAdmin) { ws.send(JSON.stringify({ type: "error", message: "Admin requis" })); return; }
        await db.update(quizSessions).set({ status: "active" } as any).where(eq(quizSessions.id, quizGame.sessionId));
        broadcast(quizGame, { type: "quiz_starting", countdown: 3 });
        await new Promise((r) => setTimeout(r, 3000));
        await startQuestion(quizGame);
        return;
      }

      if (type === "admin_end") {
        if (!quizGame || !playerUid) return;
        const player = quizGame.players.get(playerUid);
        if (!player?.isAdmin) { ws.send(JSON.stringify({ type: "error", message: "Admin requis" })); return; }
        await endQuiz(quizGame);
        return;
      }
    } catch (e) {
      console.error("[WS] Erreur message:", e);
    }
  });

  ws.on("close", () => {
    if (playerUid && quizGame) {
      quizGame.players.delete(playerUid);
      broadcastPlayerCount(quizGame);
    }
  });
});

// ─── Quiz REST Endpoints ──────────────────────────────────────────────
(async () => {
  try {
    await db.execute(drizzleSql`
      CREATE TABLE IF NOT EXISTS quiz_sessions (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        titre TEXT NOT NULL DEFAULT 'Live Quiz QuartierPlus',
        status TEXT NOT NULL DEFAULT 'scheduled',
        scheduled_at TIMESTAMP,
        prize_pool INTEGER NOT NULL DEFAULT 10000,
        total_questions INTEGER NOT NULL DEFAULT 10,
        current_question_index INTEGER NOT NULL DEFAULT 0,
        winner_count INTEGER DEFAULT 0,
        prize_per_winner INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
  } catch (e) {
    console.error("[Quiz] Table init error:", e);
  }
})();

// ─── Admin : Liste des dépôts en attente ──────────────────────────────
app.get("/api/admin/deposits", async (req, res) => {
  try {
    const { email } = req.query as { email?: string };
    if (!email || !ADMIN_EMAILS.includes(email)) return res.status(403).json({ error: "Accès refusé" });

    const deposits = await db.select({
      id: walletTransactions.id,
      userId: walletTransactions.userId,
      amount: walletTransactions.amount,
      description: walletTransactions.description,
      mobileMoney: walletTransactions.mobileMoney,
      mobileMoneyProvider: walletTransactions.mobileMoneyProvider,
      status: walletTransactions.status,
      createdAt: walletTransactions.createdAt,
    })
      .from(walletTransactions)
      .where(eq(walletTransactions.type, "deposit_request"))
      .orderBy(desc(walletTransactions.createdAt))
      .limit(100);

    const enriched = await Promise.all(
      deposits.map(async (d) => {
        const [u] = await db.select({ email: users.email, displayName: users.displayName })
          .from(users).where(eq(users.firebaseUid, d.userId || ""));
        return { ...toSnake(d), user_email: u?.email, user_name: u?.displayName };
      })
    );
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Admin : Valider / Refuser un dépôt ───────────────────────────────
app.patch("/api/admin/deposits/:id", async (req, res) => {
  try {
    const { email, action } = req.body;
    if (!email || !ADMIN_EMAILS.includes(email)) return res.status(403).json({ error: "Accès refusé" });
    if (!["approved", "rejected"].includes(action)) return res.status(400).json({ error: "action: 'approved' ou 'rejected'" });

    const id = String(req.params.id);
    const [tx] = await db.select().from(walletTransactions).where(eq(walletTransactions.id, id)).limit(1);
    if (!tx) return res.status(404).json({ error: "Transaction introuvable" });
    if (tx.status === "completed" || tx.status === "rejected") return res.status(409).json({ error: "Transaction déjà traitée" });

    if (action === "approved") {
      const [user] = await db.select().from(users).where(eq(users.firebaseUid, tx.userId!)).limit(1);
      if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
      const newBalance = (user.walletBalance ?? 0) + (tx.amount ?? 0);
      await db.update(users).set({ walletBalance: newBalance } as any).where(eq(users.firebaseUid, tx.userId!));
      await db.update(walletTransactions).set({ status: "completed" } as any).where(eq(walletTransactions.id, id));
      await logTransaction("deposit", "admin", tx.userId!, tx.amount ?? 0, 0, `Dépôt validé admin: ${tx.amount} FCFA via ${tx.mobileMoneyProvider?.toUpperCase()}`);
      broadcastToUser(tx.userId!, { type: "balance_update", balance: newBalance, reason: "deposit_approved_admin", amount: tx.amount ?? 0 });
      console.log(`[ADMIN] Dépôt approuvé: ${tx.userId} | +${tx.amount} FCFA | nouveau solde: ${newBalance}`);
      res.json({ success: true, new_balance: newBalance, message: `Dépôt de ${(tx.amount ?? 0).toLocaleString()} FCFA approuvé.` });
    } else {
      await db.update(walletTransactions).set({ status: "rejected" } as any).where(eq(walletTransactions.id, id));
      broadcastToUser(tx.userId!, { type: "transaction_rejected", transaction_id: id, reason: "Dépôt refusé par l'administrateur." });
      res.json({ success: true, status: "rejected" });
    }
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Admin : Crédit direct sur un compte utilisateur ──────────────────
app.post("/api/admin/users/:uid/credit", async (req, res) => {
  try {
    const { email, amount, reason } = req.body;
    if (!email || !ADMIN_EMAILS.includes(email)) return res.status(403).json({ error: "Accès refusé" });
    const { uid } = req.params;
    const creditAmount = Number(amount);
    if (!creditAmount || creditAmount <= 0) return res.status(400).json({ error: "Montant invalide" });

    const [user] = await db.select().from(users).where(eq(users.firebaseUid, uid)).limit(1);
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });

    const newBalance = (user.walletBalance ?? 0) + creditAmount;
    await db.update(users).set({ walletBalance: newBalance } as any).where(eq(users.firebaseUid, uid));
    await logTransaction("deposit", "admin_credit", uid, creditAmount, 0, reason || `Crédit admin: ${creditAmount.toLocaleString()} FCFA`);

    // Enregistrer dans wallet_transactions pour l'historique
    await (db.insert(walletTransactions) as any).values({
      userId: uid,
      type: "deposit_request",
      amount: creditAmount,
      description: reason || `Crédit direct admin`,
      status: "completed",
    });

    broadcastToUser(uid, { type: "balance_update", balance: newBalance, reason: "admin_credit", amount: creditAmount });
    console.log(`[ADMIN] Crédit direct: ${user.displayName || uid} | +${creditAmount} FCFA | nouveau solde: ${newBalance}`);
    res.json({ success: true, new_balance: newBalance, user_name: user.displayName, message: `${creditAmount.toLocaleString()} FCFA crédités sur le compte de ${user.displayName || uid}.` });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Admin : Notifier via WebSocket un retrait approuvé ───────────────
app.post("/api/admin/withdrawals/:id/notify", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !ADMIN_EMAILS.includes(email)) return res.status(403).json({ error: "Accès refusé" });
    const id = String(req.params.id);
    const [tx] = await db.select().from(walletTransactions).where(eq(walletTransactions.id, id)).limit(1);
    if (!tx) return res.status(404).json({ error: "Transaction introuvable" });
    broadcastToUser(tx.userId!, { type: "withdrawal_processed", transaction_id: id, message: "Votre retrait a été traité par l'administrateur." });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Serveur QuartierPlus démarré sur le port ${PORT}`);
  console.log(`📦 Serve fichiers statiques depuis web-dist/`);
  console.log(`🔗 API: http://localhost:${PORT}/api/health`);
  console.log(`🔌 WebSocket Live Quiz actif`);
});
