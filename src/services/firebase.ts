import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "";
const authDomain = process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "";
const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "";
const appId = process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "";

if (!apiKey || !projectId || !appId) {
  console.warn("[QuartierPlus] Firebase: variables d'environnement manquantes. Vérifiez EXPO_PUBLIC_FIREBASE_* dans EAS.");
}

const firebaseConfig = { apiKey, authDomain, projectId, appId };

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export default app;
