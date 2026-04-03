import { db } from "../db";
import { sql } from "drizzle-orm";

async function run() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS votes (
      id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      post_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      option_index INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(post_id, user_id)
    )
  `);
  console.log("Table votes créée avec succès");
  process.exit(0);
}

run().catch((e) => { console.error(e.message); process.exit(1); });
