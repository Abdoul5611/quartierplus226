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

export interface Post {
  id: string;
  author_id: string;
  author_name: string;
  author_avatar?: string;
  content: string;
  image_uri?: string;
  category: string;
  is_emergency: boolean;
  likes: string[];
  comments: any[];
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
}

export const api = {
  getPosts: () => fetchAPI<Post[]>("/api/posts"),
  createPost: (data: Partial<Post>) =>
    fetchAPI<Post>("/api/posts", { method: "POST", body: JSON.stringify(data) }),
  likePost: (id: string, userId: string) =>
    fetchAPI<Post>(`/api/posts/${id}/like`, { method: "POST", body: JSON.stringify({ userId }) }),

  getMarche: () => fetchAPI<MarcheItem[]>("/api/marche"),
  createMarcheItem: (data: Partial<MarcheItem>) =>
    fetchAPI<MarcheItem>("/api/marche", { method: "POST", body: JSON.stringify(data) }),

  getUsers: () => fetchAPI<User[]>("/api/users"),
  getUserByFirebaseUid: (uid: string) => fetchAPI<User>(`/api/users/firebase/${uid}`),
  createUser: (data: Partial<User>) =>
    fetchAPI<User>("/api/users", { method: "POST", body: JSON.stringify(data) }),
  updateUser: (id: string, data: Partial<User>) =>
    fetchAPI<User>(`/api/users/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

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
};
