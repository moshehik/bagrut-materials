import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type DB = NeonHttpDatabase<typeof schema>;

let _db: DB | null = null;

// בלי timeout, בקשה שנתקעת ברשת (Neon לא עונה) תתלה לנצח את ה-render בצד השרת
// (מסך "טוען..." שלא נגמר) במקום ליפול לשגיאה/ברירת מחדל.
const QUERY_TIMEOUT_MS = 10_000;
neonConfig.fetchFunction = (url: string, options: RequestInit) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
};

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
