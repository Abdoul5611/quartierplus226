import express from "express";
import path from "path";
import { db } from "../db";
import { users, posts, marche, publications, messages, votes, transactions, videoViews, walletTransactions, helpRequests } from "../db/schema";
import { eq, desc, sql as drizzleSql } from "drizzle-orm";
import { cloudinary } from "../lib/cloudinary";
import { verify as totpVerify, generate as totpGenerate, generateSecret } from "otplib";
const ADMIN_EMAIL = "administrateurquartierplus@gmail.com";

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
const FEDAPAY_ENV = process.env.FEDAPAY_ENV || "production";
const FEDAPAY_BASE = FEDAPAY_ENV === "production" ? "https://api.fedapay.com/v1" : "https://sandbox.fedapay.com/v1";

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
const POINTS_PER_VIDEO = 20;
const MAX_DAILY_VIDEOS = 15;
const MIN_SECS_BETWEEN_VIEWS = 30;
const MIN_WITHDRAWAL_POINTS = 10000;
const POINTS_TO_FCFA = 0.1; // 10 000 pts = 1 000 FCFA

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

    await db.insert(videoViews).values({ userUid, pointsEarned: POINTS_PER_VIDEO } as any);
    const newPoints = (user.points ?? 0) + POINTS_PER_VIDEO;
    await db.update(users).set({ points: newPoints } as any).where(eq(users.firebaseUid, userUid));
    await logTransaction("video_reward", "admob", userUid, POINTS_PER_VIDEO, 0, `Vidéo récompensée #${todayViews.length + 1}`);

    const freshViews = await db.select().from(videoViews)
      .where(drizzleSql`${videoViews.userUid} = ${userUid} AND ${videoViews.viewedAt} > ${since24h}`);

    res.json({
      success: true,
      pointsEarned: POINTS_PER_VIDEO,
      totalPoints: newPoints,
      todayViews: freshViews.length,
      fcfaEquivalent: Math.floor(newPoints * POINTS_TO_FCFA),
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

    const totalPoints = user.points ?? 0;
    res.json({
      totalPoints,
      todayViews: todayViews.length,
      maxDaily: MAX_DAILY_VIDEOS,
      fcfaEquivalent: Math.floor(totalPoints * POINTS_TO_FCFA),
      canWithdraw: totalPoints >= MIN_WITHDRAWAL_POINTS,
      minWithdrawalPoints: MIN_WITHDRAWAL_POINTS,
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

    const totalPoints = user.points ?? 0;
    if (totalPoints < MIN_WITHDRAWAL_POINTS) {
      return res.status(402).json({ error: `Solde insuffisant. Vous avez ${totalPoints} pts, minimum requis : ${MIN_WITHDRAWAL_POINTS} pts.` });
    }

    const fcfaAmount = Math.floor(totalPoints * POINTS_TO_FCFA);
    await db.update(users).set({ points: 0 } as any).where(eq(users.firebaseUid, userUid));
    await db.insert(walletTransactions).values({
      userId: userUid,
      type: "withdrawal_request",
      amount: fcfaAmount,
      description: `Retrait points: ${totalPoints} pts → ${fcfaAmount} FCFA`,
      mobileMoney: phoneNumber,
      mobileMoneyProvider: provider,
      status: "pending",
    } as any);
    await logTransaction("withdrawal_request", userUid, "admin", fcfaAmount, 0,
      `RETRAIT ADMIN: ${totalPoints} pts = ${fcfaAmount} FCFA → ${provider} ${phoneNumber}`);

    console.log(`\n🔔 ALERTE RETRAIT — À traiter par l'admin (${ADMIN_EMAILS[0]})`);
    console.log(`   Utilisateur : ${user.email || user.displayName || userUid}`);
    console.log(`   Montant : ${fcfaAmount} FCFA (${totalPoints} pts)`);
    console.log(`   ${provider.toUpperCase()} : ${phoneNumber}\n`);

    res.json({
      success: true,
      fcfaAmount,
      pointsDeducted: totalPoints,
      message: `Votre demande de ${fcfaAmount} FCFA a été enregistrée. L'administrateur vous contactera dans 24-48h sur ${provider} (${phoneNumber}).`,
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
const ADMIN_EMAILS = [ADMIN_EMAIL];

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

// ─── Build Web Statique ────────────────────────────────────────────────
const WEB_DIST = path.join(__dirname, "..", "..", "web-dist");

// index.html : jamais en cache navigateur (toujours la version fraîche)
app.get("/", (_req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.sendFile(path.join(WEB_DIST, "index.html"));
});

// Fichiers JS/CSS/images : cachés par hash, servis normalement
app.use(express.static(WEB_DIST, { maxAge: "1d", etag: true }));

// SPA fallback : toutes les routes inconnues renvoient index.html sans cache
app.use((_req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.sendFile(path.join(WEB_DIST, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Serveur QuartierPlus démarré sur le port ${PORT}`);
  console.log(`📦 Serve fichiers statiques depuis web-dist/`);
  console.log(`🔗 API: http://localhost:${PORT}/api/health`);
});
