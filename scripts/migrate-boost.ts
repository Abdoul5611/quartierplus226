import { neon } from "@neondatabase/serverless";
import * as dotenv from "dotenv";

dotenv.config();

const sql = neon(process.env.DATABASE_URL!);

async function migrate() {
  console.log("🚀 Migration boost colonnes...");

  await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_boosted boolean DEFAULT false`;
  await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS boost_expires_at timestamp`;
  console.log("✅ posts: is_boosted + boost_expires_at ajoutés");

  await sql`ALTER TABLE marche ADD COLUMN IF NOT EXISTS is_boosted boolean DEFAULT false`;
  await sql`ALTER TABLE marche ADD COLUMN IF NOT EXISTS boost_expires_at timestamp`;
  console.log("✅ marche: is_boosted + boost_expires_at ajoutés");

  console.log("✅ Migration boost terminée !");
}

migrate().catch((err) => {
  console.error("❌ Erreur migration:", err);
  process.exit(1);
});
