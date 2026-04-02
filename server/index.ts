import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { db } from "../db";
import { users, publications, marche } from "../db/schema";
import { cloudinary } from "../lib/cloudinary";

const app = express();
const PORT = 5000;
const EXPO_PORT = 8081;

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.get("/api/health", async (_req, res) => {
  try {
    await db.select().from(users).limit(1);
    res.json({
      status: "ok",
      services: {
        database: "connected",
        cloudinary: "configured",
      },
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: String(err) });
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

app.get("/api/publications", async (_req, res) => {
  try {
    const result = await db.select().from(publications).limit(50);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/marche", async (_req, res) => {
  try {
    const result = await db.select().from(marche).limit(50);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/upload/image", async (req, res) => {
  try {
    const { base64, folder } = req.body;
    if (!base64) {
      return res.status(400).json({ error: "base64 requis" });
    }
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
    if (!base64) {
      return res.status(400).json({ error: "base64 requis" });
    }
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
        res.end(
          JSON.stringify({
            message: `Expo non démarré. Lancez 'npm run web' pour démarrer l'interface.`,
          })
        );
      },
    },
  })
);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Serveur QuartierPlus démarré sur le port ${PORT}`);
  console.log(`Proxy vers Expo sur le port ${EXPO_PORT}`);
  console.log(`API disponible sur http://localhost:${PORT}/api/health`);
});
