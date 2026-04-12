# Quartier Plus

Application communautaire de quartier construite avec Expo (React Native) et un serveur Express proxy.

## Architecture

- **Frontend** : Expo (React Native Web) sur le port 8081
- **Serveur** : Express.js sur le port 5000 (proxy vers Expo + API REST)
- **Base de données** : Neon PostgreSQL via Drizzle ORM
- **Stockage** : Cloudinary (images produits + messages vocaux)
- **Auth** : Firebase Authentication
- **Paiements** : Stripe

## Structure du projet

```
├── App.tsx              # Point d'entrée Expo
├── app.json             # Configuration Expo
├── start.sh             # Script de démarrage (Expo + serveur proxy)
├── tsconfig.server.json # Config TypeScript pour le serveur
├── drizzle.config.ts    # Configuration Drizzle
├── db/
│   ├── index.ts         # Connexion Neon via drizzle-orm/neon-http
│   └── schema.ts        # Schéma Drizzle (toutes les tables)
├── lib/
│   └── cloudinary.ts    # Configuration et helpers Cloudinary
└── server/
    └── index.ts         # Serveur Express + proxy vers Expo port 8081
```

## Emails importants

- **Admin Dashboard** : `administrateurquartierplus@gmail.com`, `quartierplussanna@gmail.com`
- **Support** : `abdoulquartierplus@gmail.com`

## Publicité

- Les composants `src/components/AdBanner.tsx` et `src/components/RewardedVideoButton.tsx` affichent actuellement des placeholders.
- Le package natif `react-native-google-mobile-ads` a été retiré temporairement pour éviter les erreurs Android `compileReleaseKotlin` tant que les publicités réelles ne sont pas activées.
- Avant d’activer AdMob, réinstaller le package, ajouter son plugin Expo avec les App IDs Android/iOS, puis refaire un build Android propre.

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
- **Domaine actuel** : `20949130-e227-47cc-8ac4-6d0a17b56e8a-00-2uucs99lk5vth.picard.replit.dev`
- **Préparation APK Android** : profil EAS `preview` configuré en `buildType: "apk"` ; nettoyage `.expo`/`web-build` effectué ; imports `expo-notifications`, `expo-location`, `expo-file-system` et `expo-media-library` chargés uniquement côté natif/à l’usage pour éviter les blocages Web `requireOptionalNativeModule` sans casser l’APK.

## Tables de base de données

- `users` - Utilisateurs (Firebase UID, profil, quartier, points, wallet)
- `posts` - Publications du fil d'actualité
- `lending_items` - Objets à prêter/louer
- `service_missions` - Missions de service entre voisins
- `premium_subscriptions` - Abonnements Stripe
- `wallet_transactions` - Transactions du portefeuille
- `sponsored_posts` - Publicités sponsorisées
- `referral_bonuses` - Bonus de parrainage
- `publications` - Publications QuartierPlus (avec audio)
- `marche` - Marché local (produits à vendre)
- `help_requests` - Demandes d'aide/support (admin)
- `messages` - Messages dans les canaux
- `votes` - Votes sur les sondages
- `transactions` - Transactions financières
- `video_views` - Vues de vidéos (pour points)

## API Routes

- `GET /api/health` - Vérifie la connexion à la base de données
- `GET /api/users` - Liste des utilisateurs
- `GET /api/publications` - Publications
- `GET /api/marche` - Produits du marché
- `POST /api/upload/image` - Upload image vers Cloudinary (base64)
- `POST /api/upload/audio` - Upload audio vers Cloudinary (base64)

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
- `bash start.sh` - Lance Expo (8081) + serveur proxy (5000) ensemble
- `npm run db:generate` - Génère les migrations Drizzle
- `npm run db:push` - Pousse le schéma vers Neon
