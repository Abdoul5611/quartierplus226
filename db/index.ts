import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL est requis");
}

function buildConnectionString(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    parsed.searchParams.delete("sslmode");
    return parsed.toString();
  } catch {
    return rawUrl;
  }
}

const connectionString = buildConnectionString(process.env.DATABASE_URL);

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

export const db = drizzle(pool, { schema });
export * from "./schema";
