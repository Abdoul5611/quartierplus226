# QuartierPlus

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

## Tables de base de données

- `users` - Utilisateurs (Firebase UID, profil, points, wallet)
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
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
- `EXPO_PUBLIC_FIREBASE_API_KEY`, `EXPO_PUBLIC_FIREBASE_APP_ID`, etc.
- `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`

## Scripts

- `npm start` / `npm run web` - Lance Expo directement
- `bash start.sh` - Lance Expo (8081) + serveur proxy (5000) ensemble
- `npm run db:generate` - Génère les migrations Drizzle
- `npm run db:push` - Pousse le schéma vers Neon
