import React, { createContext, useContext, useEffect, useState } from "react";
import {
  User as FirebaseUser,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "firebase/auth";
import { auth } from "../services/firebase";
import { api, User } from "../services/api";
import { registerForPushNotifications } from "../services/notifications";

interface AuthContextType {
  firebaseUser: FirebaseUser | null;
  dbUser: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [dbUser, setDbUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchDbUser = async (uid: string) => {
    try {
      const user = await api.getUserByFirebaseUid(uid);
      setDbUser(user);
    } catch {
      setDbUser(null);
    }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        await fetchDbUser(user.uid);
        registerForPushNotifications(user.uid).catch(() => {});
      } else {
        setDbUser(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  const signIn = async (email: string, password: string) => {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    await fetchDbUser(cred.user.uid);
  };

  const signUp = async (email: string, password: string, displayName: string) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName });
    try {
      const newUser = await api.createUser({
        firebase_uid: cred.user.uid,
        email,
        display_name: displayName,
      } as any);
      setDbUser(newUser);
    } catch {}
  };

  const logout = async () => {
    await signOut(auth);
    setDbUser(null);
  };

  const refreshUser = async () => {
    if (firebaseUser) await fetchDbUser(firebaseUser.uid);
  };

  return (
    <AuthContext.Provider value={{ firebaseUser, dbUser, loading, signIn, signUp, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
