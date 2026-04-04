import { db } from "../db";
import { sql } from "drizzle-orm";

async function run() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS transactions (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      type TEXT NOT NULL,
      from_uid TEXT,
      to_uid TEXT,
      amount INTEGER NOT NULL,
      commission INTEGER DEFAULT 0,
      description TEXT,
      related_id TEXT,
      status TEXT DEFAULT 'completed',
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.execute(sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_cours BOOLEAN DEFAULT FALSE`);
  await db.execute(sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS cours_price INTEGER`);
  await db.execute(sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS paid_by JSONB DEFAULT '[]'`);

  await db.execute(sql`ALTER TABLE marche ADD COLUMN IF NOT EXISTS prime_partage BOOLEAN DEFAULT FALSE`);
  await db.execute(sql`ALTER TABLE marche ADD COLUMN IF NOT EXISTS prime_amount INTEGER DEFAULT 0`);
  await db.execute(sql`ALTER TABLE marche ADD COLUMN IF NOT EXISTS vendeur_firebase_uid TEXT`);

  await db.execute(sql`
    INSERT INTO users (id, firebase_uid, display_name, email, wallet_balance)
    VALUES (gen_random_uuid(), 'quartierplus-admin', 'Admin QuartierPlus', 'admin@quartierplus.app', 0)
    ON CONFLICT DO NOTHING
  `);

  console.log("Migration monétisation terminée avec succès ✅");
  process.exit(0);
}

run().catch((e) => { console.error(e.message); process.exit(1); });
