import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { db } from "../db";
import { users, posts, marche, publications, messages, votes } from "../db/schema";
import { eq, desc, sql as drizzleSql } from "drizzle-orm";
import { cloudinary } from "../lib/cloudinary";

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

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));

app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (_req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ─── Health ───────────────────────────────────────────────────────────
app.get("/api/health", async (_req, res) => {
  try {
    await db.select().from(users).limit(1);
    res.json({ status: "ok", services: { database: "connected", cloudinary: "configured" } });
  } catch (err) {
    res.status(500).json({ status: "error", message: String(err) });
  }
});

// ─── Posts ────────────────────────────────────────────────────────────
app.get("/api/posts", async (_req, res) => {
  try {
    const result = await db.select().from(posts).orderBy(desc(posts.createdAt)).limit(100);
    res.json(toSnake(result));
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
    const { author_id, author_name, author_avatar, content, image_uri, video_uri, category, is_emergency, latitude, longitude, poll_options } = req.body;
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
    if (likes.includes(userId)) {
      likes = likes.filter((l) => l !== userId);
    } else {
      likes = [...likes, userId];
    }
    const [updated] = await db.update(posts).set({ likes: likes as any }).where(eq(posts.id, id)).returning();
    res.json(toSnake(updated));
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

app.post("/api/users", async (req, res) => {
  try {
    const { firebase_uid, email, display_name } = req.body;
    const existing = await db.select().from(users).where(eq(users.firebaseUid, firebase_uid));
    if (existing.length > 0) return res.json(toSnake(existing[0]));
    const [user] = await db.insert(users).values({
      firebaseUid: firebase_uid,
      email,
      displayName: display_name,
      username: display_name?.toLowerCase().replace(/\s+/g, "_"),
      points: 10,
      merciCount: 0,
      lendingCount: 0,
      walletBalance: 0,
      isPremium: false,
      isVerified: false,
      isBanned: false,
    } as any).returning();
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
    const [item] = await db.insert(marche).values({
      vendeurId: vendeur_id,
      titre,
      description,
      prix: prix || null,
      categorie,
      quartier,
      imageUrl: image_url,
      disponible: disponible !== false,
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

// ─── Upload ───────────────────────────────────────────────────────────
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
      { folder: folder || "quartierplus/videos", resource_type: "video" }
    );
    res.json({ url: result.secure_url, public_id: result.public_id });
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

// ─── Proxy → Expo ─────────────────────────────────────────────────────
app.use(
  "/",
  createProxyMiddleware({
    target: `http://localhost:${EXPO_PORT}`,
    changeOrigin: true,
    ws: true,
    on: {
      error: (_err, _req, res: any) => {
        res.writeHead?.(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Interface en cours de chargement, patientez..." }));
      },
    },
  })
);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Serveur QuartierPlus démarré sur le port ${PORT}`);
  console.log(`🔄 Proxy vers Expo sur le port ${EXPO_PORT}`);
  console.log(`🔗 API: http://localhost:${PORT}/api/health`);
});
