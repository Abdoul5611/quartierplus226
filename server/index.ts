import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { db } from "../db";
import { users, posts, marche, publications, messages } from "../db/schema";
import { eq, desc, sql as drizzleSql } from "drizzle-orm";
import { cloudinary } from "../lib/cloudinary";

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
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/posts", async (req, res) => {
  try {
    const { author_id, author_name, author_avatar, content, image_uri, video_uri, category, is_emergency } = req.body;
    const [post] = await db.insert(posts).values({
      author_id,
      author_name,
      author_avatar,
      content,
      image_uri,
      video_uri,
      category: category || "general",
      is_emergency: is_emergency || false,
      likes: [],
      comments: [],
    } as any).returning();
    res.json(post);
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
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Users ────────────────────────────────────────────────────────────
app.get("/api/users", async (_req, res) => {
  try {
    const result = await db.select().from(users).limit(50);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/users/firebase/:uid", async (req, res) => {
  try {
    const { uid } = req.params;
    const [user] = await db.select().from(users).where(eq(users.firebaseUid, uid));
    if (!user) return res.status(404).json({ error: "Utilisateur introuvable" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/users", async (req, res) => {
  try {
    const { firebase_uid, email, display_name } = req.body;
    const existing = await db.select().from(users).where(eq(users.firebaseUid, firebase_uid));
    if (existing.length > 0) return res.json(existing[0]);
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
    res.json(user);
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
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.patch("/api/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = mapUserBody(req.body);
    const [user] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── Marché ───────────────────────────────────────────────────────────
app.get("/api/marche", async (_req, res) => {
  try {
    const result = await db.select().from(marche).orderBy(desc(marche.createdAt)).limit(100);
    res.json(result);
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
    res.json(item);
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
    res.json(result);
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
    res.json(msg);
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
