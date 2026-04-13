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
const authDomain = process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "";
const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "";
const appId = process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "";

if (!apiKey || !projectId || !appId) {
  console.warn("[QuartierPlus] Firebase: variables d'environnement manquantes.");
}

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;
let storage: FirebaseStorage;

try {
  const isNewApp = getApps().length === 0;
  const firebaseConfig = { apiKey, authDomain, projectId, appId };
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
