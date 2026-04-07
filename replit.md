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

## Google AdMob

- Package : `react-native-google-mobile-ads`
- IDs de test Google (remplacer par vrais IDs après validation) :
  - Android App ID : `ca-app-pub-3940256099942544~3347511713`
  - iOS App ID : `ca-app-pub-3940256099942544~1458002511`
  - Banner ID : `TestIds.BANNER` (ca-app-pub-3940256099942544/6300978111)
- Composant : `src/components/AdBanner.tsx` (natif) + `AdBanner.web.tsx` (stub vide pour le web)
- Placement : Bannière fixe en bas de AccueilScreen et MarcheScreen
- Fonctionne uniquement dans l'APK/build natif (pas dans Expo Go ni le web)
- Plugin configuré dans `app.json` → section `plugins`

## Boost Annonce (FedaPay)

- Prix : 500 FCFA / 48h
- Bouton "🚀 Propulser" visible sur les posts de l'auteur dans PostCard
- Ouvre `BoostPaymentModal` → paiement Mobile Money via FedaPay
- Une fois payé, `isBoosted=true` et l'annonce remonte automatiquement en tête du fil
- Endpoint : `POST /api/payment/boost/initiate` + `GET /api/payment/boost/status/:txId`
- Config publique disponible : `GET /api/config/payment`

## Corrections appliquées (nouveau compte Replit)

- **app.json** : Nom corrigé → "Quartier Plus", URL hardcodée de l'ancien compte supprimée
- **api.ts** : PROD_URL mis à jour vers le nouveau domaine Replit, simplifié sans expo-constants
- **start.sh** : Utilise `npx expo start` (plus `./node_modules/.bin/expo` qui échouait)
- **metro.config.js** : Resolver personnalisé pour `expo-modules-core` (résolution web)
- **eas.json** : Ajout de `EXPO_PUBLIC_DOMAIN` + `buildType: apk` pour preview/production
- **Domaine actuel** : `59d71096-599a-4b46-9f60-6f5ff458e92e-00-yjuayaaw6lwg.kirk.replit.dev`

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
