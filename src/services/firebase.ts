import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import {
  getAuth,
  Auth,
  initializeAuth,
  getReactNativePersistence,
  browserLocalPersistence,
} from "firebase/auth";
import { getFirestore, Firestore } from "firebase/firestore";
import { getStorage, FirebaseStorage } from "firebase/storage";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "";
const authDomain =
  process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ||
  `${process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "quartierplus2026"}.firebaseapp.com`;
const projectId =
  process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ||
  process.env.EXPO_PUBLIC_PROJECT_ID ||
  process.env.FIREBASE_PROJECT_ID ||
  "quartierplus2026";
const appId =
  process.env.EXPO_PUBLIC_FIREBASE_APP_ID ||
  process.env.FIREBASE_APP_ID ||
  "";
const messagingSenderId =
  process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ||
  process.env.FIREBASE_MESSAGING_SENDER_ID ||
  "505879462771";
const storageBucket = `${projectId}.firebasestorage.app`;

if (!apiKey || !appId) {
  console.warn("[QuartierPlus] Firebase: variables d'environnement manquantes.");
}

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;

try {
  const isNewApp = getApps().length === 0;
  const firebaseConfig = { apiKey, authDomain, projectId, appId, messagingSenderId, storageBucket };
  app = isNewApp ? initializeApp(firebaseConfig) : getApps()[0];

  if (isNewApp) {
    if (Platform.OS === "web") {
      auth = initializeAuth(app, { persistence: browserLocalPersistence });
    } else {
      auth = initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });
    }
  } else {
    auth = getAuth(app);
  }

  db = getFirestore(app);
  storage = getStorage(app);
} catch (e: any) {
  console.error("[QuartierPlus] Firebase init error:", e?.message);
  app = getApps()[0];
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
}

export { auth, db, storage };
export default app;
