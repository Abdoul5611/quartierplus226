
import { Platform } from "react-native";

const PRODUCTION_URL = "https://replit-export-quartierpluszip-1-zipzipzipzipzipzi--quartieraziz.replit.app";

function buildApiUrl(): string {
  if (Platform.OS === "web") {
    return "";
  }
  // Priorité : EXPO_PUBLIC_API_URL → EXPO_PUBLIC_DOMAIN → URL de production
  const apiUrl = process.env.EXPO_PUBLIC_API_URL || "";
  if (apiUrl) {
    return apiUrl.trim().replace(/\/$/, "");
  }
  const domain = process.env.EXPO_PUBLIC_DOMAIN || "";
  if (domain) {
    let url = domain.trim().replace(/^https?:\/\//, "").replace(/:5000\/?$/, "").replace(/\/$/, "");
    if (url && !url.includes("kirk") && !url.includes("picard")) {
      return `https://${url}`;
    }
  }
  return PRODUCTION_URL;
}

export const BASE_URL = buildApiUrl();

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
  is_admin?: boolean;
  two_factor_enabled?: boolean;
  quartier?: string;
  hometown?: string;
  work?: string;
  bio?: string;
  push_token?: string | null;
  notifications_enabled?: boolean;
  location_visible?: boolean;
  referral_code?: string | null;
  referred_by?: string | null;
  is_banned?: boolean;
}

export interface LotoTicket {
  id: string;
  user_uid: string;
  chosen_numbers: number[];
  drawn_numbers: number[];
  matched_count: number;
  prize_amount: number;
  status: string;
  created_at: string;
}

export interface WithdrawalRequest {
  id: string;
  user_id: string;
  user_email?: string;
  user_name?: string;
  amount: number;
  description?: string;
  mobile_money?: string;
  mobile_money_provider?: string;
  status: string;
  created_at: string;
}

export interface HelpRequest {
  id: string;
  user_id: string;
  user_email?: string;
  user_name?: string;
  subject: string;
  message: string;
  status: string;
  admin_response?: string;
  responded_at?: string;
  created_at: string;
}

export interface MerchantValidation {
  id: string;
  vendeur_id?: string;
  titre: string;
  description?: string;
  prix?: string;
  image_url?: string;
  categorie?: string;
  disponible: boolean;
  validation_status: string;
  created_at: string;
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

  rewardVideoComplete: (userUid: string) =>
    fetchAPI<{ success: boolean; fcfaEarned: number; newWalletBalance: number; todayViews: number; maxDaily: number }>("/api/rewards/video-complete", {
      method: "POST",
      body: JSON.stringify({ userUid }),
    }),

  getRewardStatus: (uid: string) =>
    fetchAPI<{ walletBalance: number; todayViews: number; maxDaily: number; fcfaPerVideo: number; canWithdraw: boolean; minWithdrawalFcfa: number; isBanned: boolean }>(`/api/rewards/status/${uid}`),

  requestWithdrawal: (data: { userUid: string; phoneNumber: string; provider: string }) =>
    fetchAPI<{ success: boolean; fcfaAmount: number; message: string }>("/api/rewards/withdraw", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getRewardHistory: (uid: string) =>
    fetchAPI<{ videoHistory: any[]; withdrawals: any[] }>(`/api/rewards/history/${uid}`),

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

  getAdminWithdrawals: (email: string) =>
    fetchAPI<WithdrawalRequest[]>(`/api/admin/withdrawals?email=${encodeURIComponent(email)}`),

  updateWithdrawalStatus: (id: string, status: string, email: string) =>
    fetchAPI<WithdrawalRequest>(`/api/admin/withdrawals/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status, email }),
    }),

  getAdminHelpRequests: (email: string) =>
    fetchAPI<HelpRequest[]>(`/api/admin/help-requests?email=${encodeURIComponent(email)}`),

  respondToHelpRequest: (id: string, adminResponse: string, email: string) =>
    fetchAPI<HelpRequest>(`/api/admin/help-requests/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "closed", adminResponse, email }),
    }),

  getAdminMerchantValidations: (email: string) =>
    fetchAPI<MerchantValidation[]>(`/api/admin/merchant-validations?email=${encodeURIComponent(email)}`),

  updateMerchantValidation: (id: string, validationStatus: string, email: string) =>
    fetchAPI<MerchantValidation>(`/api/admin/merchant-validations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ validationStatus, email }),
    }),

  submitHelpRequest: (data: { userId: string; userEmail?: string; userName?: string; subject: string; message: string }) =>
    fetchAPI<HelpRequest>("/api/help-requests", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  buyLotoTicket: (userUid: string, chosenNumbers: number[]) =>
    fetchAPI<{
      success: boolean;
      ticket: LotoTicket;
      drawnNumbers: number[];
      matchedCount: number;
      prizeAmount: number;
      newBalance: number;
      isJackpot: boolean;
    }>("/api/loto/buy", {
      method: "POST",
      body: JSON.stringify({ userUid, chosenNumbers }),
    }),

  getLotoHistory: (uid: string) =>
    fetchAPI<LotoTicket[]>(`/api/loto/history/${uid}`),

  getLotoStats: () =>
    fetchAPI<{ total_tickets: number; total_wins: number; total_prizes_paid: number }>("/api/loto/stats"),

  setup2FA: (firebaseUid: string) =>
    fetchAPI<{ secret: string; otpauthUrl: string }>("/api/auth/2fa/setup", {
      method: "POST",
      body: JSON.stringify({ firebaseUid }),
    }),

  verify2FA: (firebaseUid: string, token: string) =>
    fetchAPI<{ success: boolean }>("/api/auth/2fa/verify", {
      method: "POST",
      body: JSON.stringify({ firebaseUid, token }),
    }),

  toggle2FA: (firebaseUid: string, enabled: boolean) =>
    fetchAPI<{ success: boolean; twoFactorEnabled: boolean }>("/api/auth/2fa/toggle", {
      method: "POST",
      body: JSON.stringify({ firebaseUid, enabled }),
    }),
};
