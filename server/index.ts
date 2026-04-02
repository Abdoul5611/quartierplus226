import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { db } from "../db";
import { users, posts, marche, publications } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import { cloudinary } from "../lib/cloudinary";

const app = express();
const PORT = 5000;
const EXPO_PORT = 8081;

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (_req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.get("/api/health", async (_req, res) => {
  try {
    await db.select().from(users).limit(1);
    res.json({ status: "ok", services: { database: "connected", cloudinary: "configured" } });
  } catch (err) {
    res.status(500).json({ status: "error", message: String(err) });
  }
});

app.get("/api/posts", async (_req, res) => {
  try {
    const result = await db.select().from(posts).limit(100);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/posts", async (req, res) => {
  try {
    const { author_id, author_name, author_avatar, content, image_uri, category, is_emergency, poll_options } = req.body;
    const [post] = await db.insert(posts).values({
      author_id,
      author_name,
      author_avatar,
      content,
      image_uri,
      category: category || "general",
      is_emergency: is_emergency || false,
      poll_options: poll_options || null,
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
    const [updated] = await db
      .update(posts)
      .set({ likes: likes as any })
      .where(eq(posts.id, id))
      .returning();
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

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

app.patch("/api/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const [user] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/marche", async (_req, res) => {
  try {
    const result = await db.select().from(marche).limit(100);
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
      prix,
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

app.get("/api/publications", async (_req, res) => {
  try {
    const result = await db.select().from(publications).limit(100);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

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

app.use(
  "/",
  createProxyMiddleware({
    target: `http://localhost:${EXPO_PORT}`,
    changeOrigin: true,
    ws: true,
    on: {
      error: (_err, _req, res: any) => {
        res.writeHead?.(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          message: "Interface Expo en cours de chargement. Patientez quelques secondes et rafraîchissez.",
        }));
      },
    },
  })
);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Serveur QuartierPlus démarré sur le port ${PORT}`);
  console.log(`🔄 Proxy vers Expo sur le port ${EXPO_PORT}`);
  console.log(`🔗 API: http://localhost:${PORT}/api/health`);
});
