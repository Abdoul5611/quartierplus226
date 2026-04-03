const BASE_URL = typeof window !== "undefined" ? "" : "http://localhost:5000";

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
  likes: string[];
  comments: any[];
  latitude?: string | null;
  longitude?: string | null;
  created_at: string;
}

export interface MarcheItem {
  id: string;
  vendeur_id: string;
  titre: string;
  description?: string;
  prix?: string;
  image_url?: string;
  categorie?: string;
  disponible: boolean;
  quartier?: string;
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
};
