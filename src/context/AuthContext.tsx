import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import {
  User as FirebaseUser,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "firebase/auth";
import { Platform } from "react-native";
import { auth } from "../services/firebase";
import { api, User } from "../services/api";
import { registerForPushNotifications } from "../services/notifications";

const ADMIN_EMAIL = "administrateurquartierplus@gmail.com";

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  dbUser: User | null;
  loading: boolean;
  isAdmin: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string, referralCode?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

function getWsUrl(): string {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}`;
  }
  const apiUrl = process.env.EXPO_PUBLIC_API_URL || "";
  if (apiUrl) {
    const clean = apiUrl.trim().replace(/^https?:\/\//, "").replace(/:5000\/?$/, "").replace(/\/$/, "");
    return `wss://${clean}`;
  }
  const domain = process.env.EXPO_PUBLIC_DOMAIN || "";
  if (domain) {
    const clean = domain.trim().replace(/^https?:\/\//, "").replace(/:5000\/?$/, "").replace(/\/$/, "");
    if (clean && !clean.includes("kirk") && !clean.includes("picard")) {
      return `wss://${clean}`;
    }
  }
  return "wss://12847caf-4d28-463d-8405-0c7da09cdd7f-00-1wsfgibjmoy0i.worf.replit.dev";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [dbUser, setDbUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const isAdmin = firebaseUser?.email === ADMIN_EMAIL || dbUser?.is_admin === true;
  const wsRef = useRef<WebSocket | null>(null);

  const fetchDbUser = async (uid: string, firebaseUserRef?: { email?: string | null; displayName?: string | null }) => {
    try {
      const user = await api.getUserByFirebaseUid(uid);
      setDbUser(user);
    } catch (err: any) {
      const msg = String(err?.message || err);
      const isNotFound = msg.includes("404") || msg.includes("introuvable") || msg.includes("Not Found");
      if (isNotFound && firebaseUserRef) {
        try {
          const created = await api.createUser({
            firebase_uid: uid,
            email: firebaseUserRef.email ?? undefined,
            display_name: firebaseUserRef.displayName || firebaseUserRef.email?.split("@")[0] || "Utilisateur",
          } as any);
          setDbUser(created);
        } catch {
          setDbUser(null);
        }
      } else {
        setDbUser(null);
      }
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        await fetchDbUser(user.uid, user);
        registerForPushNotifications(user.uid).catch(() => {});
      } else {
        setDbUser(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!firebaseUser?.uid) {
      wsRef.current?.close();
      wsRef.current = null;
      return;
    }

    let alive = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (!alive) return;
      try {
        const ws = new WebSocket(getWsUrl());
        wsRef.current = ws;

        ws.onopen = () => {
          ws.send(JSON.stringify({ type: "register", uid: firebaseUser!.uid }));
        };

        ws.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data.type === "balance_update" && typeof data.balance === "number") {
              setDbUser((prev) =>
                prev ? { ...prev, wallet_balance: data.balance } : prev
              );
            }
          } catch {}
        };

        ws.onclose = () => {
          if (alive) reconnectTimer = setTimeout(connect, 5000);
        };
        ws.onerror = () => ws.close();
      } catch {}
    }

    connect();
    return () => {
      alive = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [firebaseUser?.uid]);

  const signIn = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    await fetchDbUser(cred.user.uid, cred.user);
  };

  const signUp = async (email: string, password: string, displayName: string, referralCode?: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName });
    try {
      const newUser = await api.createUser({
        firebase_uid: cred.user.uid,
        email,
        display_name: displayName,
        ...(referralCode ? { referral_code: referralCode.trim().toUpperCase() } : {}),
      } as any);
      setDbUser(newUser);
    } catch {}
  };

  const logout = async () => {
    await signOut(auth);
    setDbUser(null);
  };

  const refreshUser = async () => {
    if (firebaseUser) await fetchDbUser(firebaseUser.uid, firebaseUser);
  };

  return (
    <AuthContext.Provider value={{ firebaseUser, dbUser, loading, isAdmin, signIn, signUp, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
