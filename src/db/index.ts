import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type DB = NeonHttpDatabase<typeof schema>;

let _db: DB | null = null;

function getDb(): DB {
  if (_db) return _db;
  const url = process.env.DATABASE_URL?.trim().replace(/^"|"$/g, "");
  if (!url) throw new Error("DATABASE_URL is not set");
  _db = drizzle(neon(url), { schema });
  return _db;
}

/** חיבור עצל – נוצר רק בשימוש הראשון (לא בזמן build) */
export const db: DB = new Proxy({} as DB, {
  get(_t, prop) {
    const real = getDb() as unknown as Record<PropertyKey, unknown>;
    const v = real[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(real) : v;
  },
});

export { schema };
