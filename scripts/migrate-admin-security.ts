import { db } from "../db";
import { sql } from "drizzle-orm";

async function run() {
  console.log("🔐 Migration sécurité admin + initialisation schéma...");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS users (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      username text,
      password text DEFAULT 'firebase',
      email text,
      firebase_uid text,
      display_name text,
      address text,
      quartier text,
      avatar text,
      bio text,
      profile_photo text,
      cover_photo text,
      hometown text,
      work text,
      education text,
      points integer DEFAULT 10,
      merci_count integer DEFAULT 0,
      lending_count integer DEFAULT 0,
      wallet_balance integer DEFAULT 0,
      is_premium boolean DEFAULT false,
      is_verified boolean DEFAULT false,
      is_banned boolean DEFAULT false,
      is_admin boolean DEFAULT false,
      two_factor_enabled boolean DEFAULT false,
      two_factor_secret text,
      stripe_customer_id text,
      referral_code text,
      referred_by text,
      push_token text,
      notifications_enabled boolean DEFAULT true,
      location_visible boolean DEFAULT true,
      created_at timestamp DEFAULT now()
    )
  `);
  console.log("✅ Table users créée/vérifiée");

  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled boolean DEFAULT false`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_secret text`);
  console.log("✅ users: colonnes admin + 2FA ajoutées");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS posts (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      author_id text,
      author_name text,
      author_avatar text,
      content text,
      image_uri text,
      video_uri text,
      category text DEFAULT 'general',
      is_emergency boolean DEFAULT false,
      poll_options jsonb,
      is_cours boolean DEFAULT false,
      cours_price integer,
      paid_by jsonb DEFAULT '[]',
      likes jsonb DEFAULT '[]',
      comments jsonb DEFAULT '[]',
      latitude decimal,
      longitude decimal,
      is_boosted boolean DEFAULT false,
      boost_expires_at timestamp,
      created_at timestamp DEFAULT now()
    )
  `);
  console.log("✅ Table posts créée/vérifiée");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS marche (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      vendeur_id text,
      titre text NOT NULL,
      description text,
      prix decimal(10,2),
      image_url text,
      categorie text,
      disponible boolean DEFAULT true,
      quartier text,
      prime_partage boolean DEFAULT false,
      prime_amount integer DEFAULT 0,
      vendeur_firebase_uid text,
      is_boosted boolean DEFAULT false,
      boost_expires_at timestamp,
      validation_status text DEFAULT 'pending',
      created_at timestamp DEFAULT now()
    )
  `);
  await db.execute(sql`ALTER TABLE marche ADD COLUMN IF NOT EXISTS validation_status text DEFAULT 'pending'`);
  console.log("✅ Table marche créée/vérifiée + validation_status");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS transactions (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      type text NOT NULL,
      from_uid text,
      to_uid text,
      amount integer NOT NULL,
      commission integer DEFAULT 0,
      description text,
      related_id text,
      status text DEFAULT 'completed',
      created_at timestamp DEFAULT now()
    )
  `);
  console.log("✅ Table transactions créée/vérifiée");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id text,
      type text,
      amount integer,
      description text,
      related_item_id text,
      status text DEFAULT 'completed',
      mobile_money text,
      mobile_money_provider text,
      created_at timestamp DEFAULT now()
    )
  `);
  console.log("✅ Table wallet_transactions créée/vérifiée");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS video_views (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      user_uid text NOT NULL,
      points_earned integer DEFAULT 100,
      viewed_at timestamp DEFAULT now()
    )
  `);
  console.log("✅ Table video_views créée/vérifiée");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS messages (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      channel text NOT NULL DEFAULT 'general',
      sender_id text NOT NULL,
      sender_name text NOT NULL,
      sender_avatar text,
      text text,
      audio_url text,
      message_type text DEFAULT 'text',
      created_at timestamp DEFAULT now()
    )
  `);
  console.log("✅ Table messages créée/vérifiée");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS publications (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id text,
      titre text NOT NULL,
      contenu text,
      image_url text,
      audio_url text,
      quartier text,
      likes integer DEFAULT 0,
      created_at timestamp DEFAULT now()
    )
  `);
  console.log("✅ Table publications créée/vérifiée");

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS help_requests (
      id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id text NOT NULL,
      user_email text,
      user_name text,
      subject text NOT NULL,
      message text NOT NULL,
      status text DEFAULT 'open',
      admin_response text,
      responded_at timestamp,
      created_at timestamp DEFAULT now()
    )
  `);
  console.log("✅ Table help_requests créée");

  await db.execute(sql`
    UPDATE users SET is_admin = true, two_factor_enabled = true
    WHERE email = 'administrateurquartierplus@gmail.com'
  `);
  console.log("✅ Compte admin marqué pour administrateurquartierplus@gmail.com");

  console.log("\n✅ Migration sécurité admin terminée !");
}

run().catch((err) => {
  console.error("❌ Erreur migration:", err.message || err);
  process.exit(1);
});
