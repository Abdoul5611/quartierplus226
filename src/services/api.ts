import { Platform } from "react-native";

const REPLIT_API_URL = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "https://af2d56f6-fd65-4578-aadc-fc30403c16f9-00-1dh6u2qesxr4w.janeway.replit.dev";
const BASE_URL = Platform.OS === "web" ? "" : REPLIT_API_URL;

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `Erreur ${res.status}`);
  }
  return res.json();
}

export interface PollOption {
  label: string;
}

export interface Post {
  id: string;
  author_id: string;
  author_name: string;
  author_avatar?: string;
  content: string;
  image_uri?: string;
  video_uri?: string;
  category: string;
  is_emergency: boolean;
  poll_options?: PollOption[] | null;
  is_cours?: boolean;
  cours_price?: number | null;
  paid_by?: string[];
  likes: string[];
  comments: any[];
  latitude?: string | null;
  longitude?: string | null;
  is_boosted?: boolean;
  boost_expires_at?: string | null;
  created_at: string;
}

export interface Transaction {
  id: string;
  type: string;
  from_uid?: string;
  to_uid?: string;
  amount: number;
  commission?: number;
  description?: string;
  related_id?: string;
  status: string;
  created_at: string;
}

export interface MarcheItem {
  id: string;
  vendeur_id: string;
  vendeur_firebase_uid?: string;
  titre: string;
  description?: string;
  prix?: string;
  image_url?: string;
  categorie?: string;
  disponible: boolean;
  quartier?: string;
  prime_partage?: boolean;
  prime_amount?: number;
  is_boosted?: boolean;
  boost_expires_at?: string | null;
  created_at: string;
}

export interface User {
  id: string;
  firebase_uid?: string;
  email?: string;
  display_name?: string;
  avatar?: string;
  profile_photo?: string;
  points: number;
  merci_count: number;
  wallet_balance: number;
  is_premium: boolean;
  is_verified: boolean;
  quartier?: string;
  hometown?: string;
  work?: string;
  bio?: string;
  push_token?: string | null;
  notifications_enabled?: boolean;
  location_visible?: boolean;
}

export const api = {
  getPosts: () => fetchAPI<Post[]>("/api/posts"),
  getPostsByAuthor: (uid: string) => fetchAPI<Post[]>(`/api/posts/author/${uid}`),
  createPost: (data: Partial<Post>) =>
    fetchAPI<Post>("/api/posts", { method: "POST", body: JSON.stringify(data) }),
  likePost: (id: string, userId: string) =>
    fetchAPI<Post>(`/api/posts/${id}/like`, { method: "POST", body: JSON.stringify({ userId }) }),
  addComment: (postId: string, data: { author_id: string; author_name: string; author_avatar?: string; text: string }) =>
    fetchAPI<Post>(`/api/posts/${postId}/comments`, { method: "POST", body: JSON.stringify(data) }),

  getMarche: () => fetchAPI<MarcheItem[]>("/api/marche"),
  createMarcheItem: (data: Partial<MarcheItem>) =>
    fetchAPI<MarcheItem>("/api/marche", { method: "POST", body: JSON.stringify(data) }),

  getUsers: () => fetchAPI<User[]>("/api/users"),
  getUserByFirebaseUid: (uid: string) => fetchAPI<User>(`/api/users/firebase/${uid}`),
  createUser: (data: Partial<User>) =>
    fetchAPI<User>("/api/users", { method: "POST", body: JSON.stringify(data) }),
  updateUser: (id: string, data: Partial<User>) =>
    fetchAPI<User>(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  savePushToken: (firebaseUid: string, token: string) =>
    fetchAPI<{ success: boolean }>(`/api/users/${firebaseUid}/push-token`, {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  updateUserSettings: (firebaseUid: string, settings: { notifications_enabled?: boolean; location_visible?: boolean }) =>
    fetchAPI<User>(`/api/users/${firebaseUid}/settings`, {
      method: "PATCH",
      body: JSON.stringify(settings),
    }),

  uploadImage: (base64: string, folder?: string) =>
    fetchAPI<{ url: string; public_id: string }>("/api/upload/image", {
      method: "POST",
      body: JSON.stringify({ base64, folder }),
    }),
  uploadVideo: (base64: string, folder?: string) =>
    fetchAPI<{ url: string; public_id: string }>("/api/upload/video", {
      method: "POST",
      body: JSON.stringify({ base64, folder }),
    }),
  uploadAudio: (base64: string, folder?: string) =>
    fetchAPI<{ url: string; public_id: string }>("/api/upload/audio", {
      method: "POST",
      body: JSON.stringify({ base64, folder }),
    }),

  votePoll: (postId: string, userId: string, optionIndex: number) =>
    fetchAPI<{ success: boolean; results: number[] }>(`/api/polls/${postId}/vote`, {
      method: "POST",
      body: JSON.stringify({ userId, optionIndex }),
    }),

  getPollResults: (postId: string, userId?: string) =>
    fetchAPI<{ results: number[]; userVote: number | null }>(`/api/polls/${postId}/results?userId=${userId || ""}`),

  payCourse: (postId: string, studentUid: string, teacherUid: string, amount: number) =>
    fetchAPI<{ success: boolean; newBalance: number }>("/api/wallet/pay-course", {
      method: "POST",
      body: JSON.stringify({ postId, studentUid, teacherUid, amount }),
    }),

  transferPrime: (itemId: string, vendeurUid: string, helperUid: string, amount: number) =>
    fetchAPI<{ success: boolean }>("/api/wallet/transfer-prime", {
      method: "POST",
      body: JSON.stringify({ itemId, vendeurUid, helperUid, amount }),
    }),

  withdraw: (userUid: string, amount: number) =>
    fetchAPI<{ success: boolean; net: number; commission: number }>("/api/wallet/withdraw", {
      method: "POST",
      body: JSON.stringify({ userUid, amount }),
    }),

  getTransactions: (uid: string) =>
    fetchAPI<Transaction[]>(`/api/wallet/transactions/${uid}`),

  initiateMobileMoneyPayment: (data: { userUid: string; userEmail: string; amount: number; phoneNumber: string; countryCode: string; operatorId: string }) =>
    fetchAPI<{ txId: string; status: string }>("/api/payment/mm/initiate", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  checkMMPaymentStatus: (txId: string, userUid: string, amount: number) =>
    fetchAPI<{ status: string; newBalance?: number }>(`/api/payment/mm/status/${txId}?userUid=${userUid}&amount=${amount}`),

  boostItem: (userUid: string, targetId: string, targetType: "post" | "marche") =>
    fetchAPI<{ success: boolean; newBalance: number; boostExpiresAt: string }>("/api/wallet/boost", {
      method: "POST",
      body: JSON.stringify({ userUid, targetId, targetType }),
    }),

  initiateBoostPayment: (data: { userUid: string; userEmail: string; phoneNumber: string; countryCode: string; operatorId: string; targetId: string; targetType: string }) =>
    fetchAPI<{ txId: string; status: string }>("/api/payment/boost/initiate", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  checkBoostPaymentStatus: (txId: string, userUid: string, targetId: string, targetType: string) =>
    fetchAPI<{ status: string; boostExpiresAt?: string }>(`/api/payment/boost/status/${txId}?userUid=${encodeURIComponent(userUid)}&targetId=${encodeURIComponent(targetId)}&targetType=${encodeURIComponent(targetType)}`),

  getAdminDashboard: (email: string) =>
    fetchAPI<{
      total_commissions: number;
      commissions_by_withdrawal: number;
      total_course_payments: number;
      total_primes: number;
      total_withdrawals: number;
      total_boost_revenue: number;
      transaction_count: number;
      transactions_by_type: Record<string, number>;
      user_count: number;
      recent_transactions: Transaction[];
    }>(`/api/admin/dashboard?email=${encodeURIComponent(email)}`),
};
