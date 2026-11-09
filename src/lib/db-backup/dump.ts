/**
 * הפקת גיבוי של כל טבלאות ה-public ב-Neon לקובץ JSON דחוס (gzip). ר' docs/db-backup.md.
 * אין תלות ב-pg_dump (לא קיים בסביבת ורסל): כל טבלה נקראת כ-to_jsonb בחלקים של PAGE_ROWS, ממוינת לפי ה-PK.
 * שחזור: scripts/restore-db-backup.ts (json_populate_recordset — שומר טיפוסים). אין כאן שום תלות ב-Next / server-only,
 * כדי שגם סקריפטים (שחזור, אימות) יוכלו להשתמש.
 */
import { gzipSync } from "node:zlib";
import { PAGE_ROWS, quoteIdent } from "./logic";

export type QueryFn = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

export type TableMeta = { name: string; rows: number; columns: { name: string; type: string }[]; pk: string[] };

export type DumpResult = {
  gz: Buffer;
  jsonBytes: number;
  tables: TableMeta[];
  totalRows: number;
};

/** חיבור Neon HTTP כ-QueryFn (לשימוש הכרון והסקריפטים) */
export async function neonQueryFn(url: string): Promise<QueryFn> {
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(url);
  return async (text, params = []) => (await sql.query(text, params)) as Record<string, unknown>[];
}

/** ניסיון חוזר לשאילתה (ה-fetch של האתר מוגבל ל-10 שנ' לבקשה; Neon לפעמים מתעורר לאט) */
async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw last instanceof Error ? last : new Error(String(last));
}

export async function listTables(q: QueryFn): Promise<TableMeta[]> {
  const tabs = await withRetry(() =>
    q(`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name`),
  );
  const cols = await withRetry(() =>
    q(`select table_name, column_name, data_type, udt_name from information_schema.columns where table_schema='public' order by table_name, ordinal_position`),
  );
  const pks = await withRetry(() =>
    q(`select tc.table_name, kcu.column_name, kcu.ordinal_position
       from information_schema.table_constraints tc
       join information_schema.key_column_usage kcu on kcu.constraint_name = tc.constraint_name and kcu.table_schema = tc.table_schema and kcu.table_name = tc.table_name
       where tc.table_schema='public' and tc.constraint_type='PRIMARY KEY' order by tc.table_name, kcu.ordinal_position`),
  );
  return tabs.map((t) => {
    const name = String(t.table_name);
    return {
      name,
      rows: 0,
      columns: cols.filter((c) => c.table_name === name).map((c) => ({ name: String(c.column_name), type: String(c.data_type === "USER-DEFINED" ? c.udt_name : c.data_type) })),
      pk: pks.filter((p) => p.table_name === name).map((p) => String(p.column_name)),
    };
  });
}

/** כל השורות של טבלה, בחלקים; מחזיר מערך אובייקטים (JSON) */
export async function readTable(q: QueryFn, t: TableMeta): Promise<unknown[]> {
  const order = t.pk.length ? t.pk.map(quoteIdent).join(", ") : "ctid";
  const out: unknown[] = [];
  for (let offset = 0; ; offset += PAGE_ROWS) {
    const rows = await withRetry(() =>
      q(`select to_jsonb(x) as r from (select * from ${quoteIdent(t.name)} order by ${order} limit ${PAGE_ROWS} offset ${offset}) x`),
    );
    for (const r of rows) out.push(r.r);
    if (rows.length < PAGE_ROWS) break;
  }
  return out;
}

export async function dumpDatabase(q: QueryFn, opts: { exclude?: string[]; log?: (s: string) => void } = {}): Promise<DumpResult> {
  const startedAt = new Date().toISOString();
  const all = (await listTables(q)).filter((t) => !(opts.exclude ?? []).includes(t.name));
  if (!all.length) throw new Error("לא נמצאו טבלאות ב-public — המסד ריק או החיבור שגוי");
  const parts: string[] = [`{"format":"bagrut-db-backup/1","startedAt":${JSON.stringify(startedAt)},"tables":{`];
  let totalRows = 0;
  let first = true;
  // קוראים 4 טבלאות במקביל (כל קריאה היא בקשת HTTP נפרדת), ומרכיבים את הקובץ לפי סדר ה-א"ב
  const CONCURRENCY = 4;
  for (let i = 0; i < all.length; i += CONCURRENCY) {
    const batch = all.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((t) => readTable(q, t)));
    batch.forEach((t, j) => {
      const rows = results[j];
      t.rows = rows.length;
      totalRows += rows.length;
      opts.log?.(`${t.name}: ${rows.length}`);
      parts.push(`${first ? "" : ","}${JSON.stringify(t.name)}:{"columns":${JSON.stringify(t.columns)},"pk":${JSON.stringify(t.pk)},"rows":${JSON.stringify(rows)}}`);
      first = false;
    });
  }
  const meta = { finishedAt: new Date().toISOString(), totalRows, tables: all.map((t) => ({ name: t.name, rows: t.rows })) };
  parts.push(`},"meta":${JSON.stringify(meta)}}`);
  const json = Buffer.from(parts.join(""), "utf8");
  return { gz: gzipSync(json, { level: 9 }), jsonBytes: json.length, tables: all, totalRows };
}
