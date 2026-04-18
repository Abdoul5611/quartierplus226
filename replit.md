# Quartier Plus

Application communautaire de quartier construite avec Expo (React Native) et un serveur Express. Architecture 100% native mobile (APK Android).

## Architecture

- **Frontend** : Expo (React Native) — navigation Bottom Tabs avec Ionicons, composants natifs (FlatList, KeyboardAvoidingView, Modal)
- **Serveur** : Express.js + HTTP Server + WebSocket (ws) sur le port 5000 (sert le web-dist Expo + API REST + Quiz temps réel)
- **Base de données** : Neon PostgreSQL via Drizzle ORM
- **Stockage** : Cloudinary (images, vidéos)
- **Auth** : Firebase Authentication
- **Paiements** : FedaPay (Mobile Money FCFA)

## Design Natif (style Instagram/Facebook)
- **Tab bar** : Ionicons vectoriels professionnels avec highlight pill vert sur l'onglet actif
- **Feed** : Cards pleine largeur (edge-to-edge), images/vidéos sans marges ni border-radius
- **Séparateurs** : Gris système (#F0F2F5) entre les posts, style Facebook
- **Médias** : Pleine largeur 100% de l'écran, aspect ratio 16:9 pour vidéos

## Structure du projet

```
├── App.tsx              # Point d'entrée Expo
├── app.json             # Configuration Expo
├── start.sh             # Script de démarrage (build web + serveur)
├── tsconfig.server.json # Config TypeScript pour le serveur
├── drizzle.config.ts    # Configuration Drizzle
├── db/
│   ├── index.ts         # Connexion Neon via drizzle-orm/neon-http
│   └── schema.ts        # Schéma Drizzle (toutes les tables)
├── lib/
│   └── cloudinary.ts    # Configuration et helpers Cloudinary
└── server/
    └── index.ts         # Serveur Express + API REST
```

## Emails importants

- **Admin Dashboard** : `administrateurquartierplus@gmail.com`, `quartierplussanna@gmail.com`
- **Support** : `abdoulquartierplus@gmail.com`

## Système Financier Unifié (Avril 2026)

### Portefeuille unique (wallet_balance en FCFA)
- **Un seul portefeuille** dans le Profil gère tout l'argent (Retraits, Dépôts, futurs Jeux).
- L'ancien onglet "Portefeuille" (points vidéo séparé) a été **supprimé**.
- Navigation : Accueil, Carte, Marché, Messages, Profil (5 onglets).

### Conversion Publicités → FCFA
- Regarder une vidéo AdMob → **+2 FCFA** directement dans wallet_balance.
- Règle : 20 pts × 0.1 FCFA/pt = 2 FCFA/vidéo. Max 15 vidéos/jour = 30 FCFA/jour.
- Chaque gain enregistré dans `transactions` (type: `video_reward`).
- Anti-fraude : limite journalière + délai 30s entre vidéos + ban auto si abus.

### Bouton vidéo fonctionnel (RewardedVideoButton)
- Simulation : countdown 5 secondes → appel API → crédit immédiat dans wallet.
- Fonctionne sur web (`.web.tsx`) et mobile (même logique).
- Accessible depuis le wallet modal dans le Profil.

### Crédit insuffisant pour les jeux
- Si solde < 500 FCFA, message "Regarder une vidéo pour gagner du crédit" s'affiche.
- Bouton vidéo toujours visible dans le wallet modal.

### Sécurité
- Toute transaction (pub, dépôt, retrait) → enregistrée dans table `transactions`.
- Retraits → table `wallet_transactions` en attente admin + alerte console.
- Minimum retrait : 1 000 FCFA.

## Système Wallet Production (Avril 2026 — Phase 2)

### OTP 2-étapes (Wave/Orange Money style)
- **Dépôt** : `POST /api/wallet/deposit/request` → génère OTP 6 chiffres (15min) → utilisateur confirme avec `POST /api/wallet/deposit/confirm` → solde mis à jour + broadcast WebSocket.
- **Retrait** : `POST /api/wallet/withdraw/request` → OTP (10min) → `POST /api/wallet/withdraw/confirm` → débit solde + notification admin.
- OTP stocké dans `wallet_transactions` (`otp_code`, `otp_expires_at`) — colonnes ajoutées par migration automatique au démarrage.
- Validation admin : `POST /api/admin/wallet/deposit/validate?email=...` avec `transaction_id`.

### Colonnes wallet_transactions (DB réelle)
- `mobile_money_number` (pas `mobile_money`) — schéma Drizzle : `mobileMoney: text("mobile_money_number")`.
- `otp_code`, `otp_expires_at`, `metadata` (jsonb) — ajoutés via ALTER TABLE IF NOT EXISTS.
- `metadata` doit être un objet JS brut (pas JSON.stringify) pour les colonnes jsonb Drizzle.

### WebSocket temps réel
- Chaque client se connecte et envoie `{type:"register", uid}`.
- `broadcastToUser(uid, msg)` envoie `{type:"balance_update", balance}` après chaque transaction confirmée.
- `WalletScreen` écoute en temps réel + animation pulsée sur le solde.
- `useRealtimeBalance()` hook dans ProfilScreen pour affichage cross-screen.

### Admin Cockpit (onglet Admin)
- 5 modules : toggle jeux, validation retraits, flash broadcast, ban utilisateurs, paramètres commissions.
- `GlobalFlashListener` dans TabNavigator pour les notifications push globales.
- Accès réservé aux emails dans `ADMIN_EMAILS` + flag `is_admin` en DB.

## Publicité

- `RewardedVideoButton` : simulation web (countdown 5s) + future intégration AdMob mobile.
- Le package natif `react-native-google-mobile-ads` n'est pas encore installé.
- Avant d'activer AdMob réel : réinstaller le package, ajouter son plugin Expo avec les App IDs Android/iOS, refaire un build Android propre.

## Boost Annonce (FedaPay)

- Prix : 500 FCFA / 48h
- Bouton "🚀 Propulser" visible sur les posts de l'auteur dans PostCard
- Ouvre `BoostPaymentModal` → paiement Mobile Money via FedaPay
- Une fois payé, `isBoosted=true` et l'annonce remonte automatiquement en tête du fil
- Endpoint : `POST /api/payment/boost/initiate` + `GET /api/payment/boost/status/:txId`
- Config publique disponible : `GET /api/config/payment`

## Corrections appliquées (nouveau compte Replit - Avril 2026)

- **db/index.ts** : SSL configuré pour Neon PostgreSQL (`rejectUnauthorized: false`)
- **db/schema.ts** : Colonnes manquantes ajoutées : `is_admin`, `two_factor_enabled`, `two_factor_secret`
- **Base de données** : Table `help_requests` créée avec le bon schéma
- **api.ts** : Utilise des URLs relatives sur web (vide), domaine mis à jour pour le natif
- **metro.config.js** : `allowedHosts: "all"` ajouté pour compatibilité proxy Replit
- **start.sh** : Build Expo web automatique avant démarrage du serveur

## Live Quiz (Avril 2026)

### Fonctionnement
- **WebSocket** : `ws` sur le même port 5000 (HTTP Server partagé avec Express)
- **Sas publicitaire** : 5 pubs simulées (10s chacune) obligatoires avant d'entrer
- **Salle d'attente** : Joueurs connectés via WS, compteur temps réel
- **Quiz** : 10 questions, 10s par question, chrono visible
- **Élimination** : Mauvaise réponse ou temps écoulé = éliminé
- **Grand Partage** : Cagnotte ÷ nb de survivants → créditée sur wallet de chaque gagnant
- **Scheduling** : Admin crée une session avec prize_pool et scheduled_at
- **Bannière Accueil** : Affiche le prochain quiz programmé si un existe

### Endpoints Quiz
- `GET /api/quiz/next` — Prochain quiz actif/programmé
- `GET /api/quiz/sessions` — Toutes les sessions (admin)
- `POST /api/quiz/sessions` — Créer une session (admin)
- `PATCH /api/quiz/sessions/:id/schedule` — Reprogrammer (admin)

### WebSocket Protocol
- Client → Server : `join`, `answer`, `admin_start`, `admin_end`
- Server → Client : `joined`, `player_count`, `question`, `timer`, `answer_ack`, `answer_reveal`, `eliminated`, `quiz_end`

## Tables de base de données

- `users` - Utilisateurs (Firebase UID, profil, quartier, points, wallet_balance)
- `posts` - Publications du fil d'actualité
- `lending_items` - Objets à prêter/louer
- `service_missions` - Missions de service entre voisins
- `premium_subscriptions` - Abonnements Stripe
- `wallet_transactions` - Retraits en attente (admin)
- `sponsored_posts` - Publicités sponsorisées
- `referral_bonuses` - Bonus de parrainage
- `publications` - Publications QuartierPlus (avec audio)
- `marche` - Marché local (produits à vendre)
- `help_requests` - Demandes d'aide/support (admin)
- `messages` - Messages dans les canaux
- `votes` - Votes sur les sondages
- `transactions` - Toutes les transactions financières (video_reward, withdrawal, boost, etc.)
- `video_views` - Vues de vidéos (anti-fraude)

## API Routes Financières

- `POST /api/rewards/video-complete` — Crédite +2 FCFA dans wallet_balance après une vidéo
- `GET /api/rewards/status/:uid` — Statut vidéo du jour (vues, solde, limite)
- `POST /api/rewards/withdraw` — Demande de retrait depuis le wallet vidéo
- `GET /api/rewards/history/:uid` — Historique des vidéos et retraits
- `POST /api/wallet/pay-course` — Paiement de cours (wallet FCFA)
- `POST /api/wallet/withdraw` — Retrait avec commission 10%
- `GET /api/wallet/transactions/:uid` — Historique transactions
- `POST /api/payment/mm/initiate` — Initier un dépôt Mobile Money (FedaPay)

## Secrets requis

- `DATABASE_URL` - URL Neon PostgreSQL
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_URL`
- `EXPO_PUBLIC_FIREBASE_API_KEY`, `EXPO_PUBLIC_FIREBASE_APP_ID`, `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`, `EXPO_PUBLIC_FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_PROJECT_ID`
- `FEDAPAY_SECRET_KEY` - Clé secrète FedaPay (server-side)
- `FEDAPAY_PUBLIC_KEY` - Clé publique FedaPay
- `EXPO_PUBLIC_DOMAIN` - Domaine Replit (ex: `af2d56f6-....replit.dev`) — utilisé par l'APK pour construire les URLs API

## Scripts

- `npm start` / `npm run web` - Lance Expo directement
- `bash start.sh` - Build web Expo + serveur Express (5000)
- `npm run db:generate` - Génère les migrations Drizzle
- `npm run db:push` - Pousse le schéma vers Neon
