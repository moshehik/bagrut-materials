/**
 * סנכרון מהדרייב לכל העץ (אותה לוגיקה כמו כפתור "סנכרון עם הדרייב" בסייר — src/lib/driveSyncCore.ts).
 * לעולם לא מוחק. ברירת מחדל: DRY-RUN (מדפיס מה *היה* קורה, לא כותב כלום).
 *
 *   npx tsx scripts/drive-sync.ts                      → dry-run על כל העץ
 *   npx tsx scripts/drive-sync.ts --category=<id>      → dry-run לקטגוריה אחת
 *   npx tsx scripts/drive-sync.ts --apply              → מחיל בפועל
 *   npx tsx scripts/drive-sync.ts --should-run         → "true"/"false": האם ההגדרה drive_auto_sync דלוקה (ל-workflow)
 *
 * הסנכרון האוטומטי (.github/workflows/drive-sync.yml) כבוי כברירת מחדל: אין בו תזמון פעיל, והוא רץ אוטומטית
 * רק אם ההגדרה "drive_auto_sync" (ב-/admin/settings) דלוקה. דורש DATABASE_URL + DRIVE_BRIDGE_URL/SECRET.
 */
import "dotenv/config";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { auditLogs, settings } from "../src/db/schema";
import { syncBatch, type SyncAudit } from "../src/lib/driveSyncCore";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const ONLY = args.find((a) => a.startsWith("--category="))?.slice("--category=".length);

/** כתיבה ישירה ל-audit_logs (logAudit של האתר הוא server-only ולא רץ תחת tsx). */
const audit: SyncAudit = async (a) => {
  try {
    await db.insert(auditLogs).values({
      actorId: null,
      action: a.action,
      entityType: a.entityType ?? null,
      entityId: a.entityId ?? null,
      details: a.details === undefined ? null : JSON.stringify(a.details),
      ip: null,
    });
  } catch (e) {
    console.error("[audit] failed", e instanceof Error ? e.message : e);
  }
};

async function main() {
  if (args.includes("--should-run")) {
    const [row] = await db.select().from(settings).where(eq(settings.key, "drive_auto_sync"));
    console.log(String(row?.value === "true"));
    return;
  }

  console.log(APPLY ? "== APPLY ==" : "== DRY-RUN (לא נכתב כלום) ==");
  let cursor: number | null = 0;
  const total = { scanned: 0, adopted: 0, moved: 0, relinked: 0, resized: 0 };
  const notes: string[] = [];
  const errors: string[] = [];
  while (cursor !== null) {
    const r = await syncBatch(cursor, ONLY ? Number(ONLY) : undefined, { actorId: null, via: "auto-sync", audit, dryRun: !APPLY });
    total.scanned += r.scanned;
    total.adopted += r.adopted;
    total.moved += r.moved;
    total.relinked += r.relinked;
    total.resized += r.resized;
    notes.push(...r.notes);
    errors.push(...r.errors);
    cursor = r.nextCursor;
    console.log(`  נסרקו ${total.scanned} תיקיות…`);
  }
  for (const n of notes.slice(0, 100)) console.log(" •", n);
  if (notes.length > 100) console.log(`  … ועוד ${notes.length - 100}`);
  for (const e of errors) console.error(" ✖", e);
  console.log("סיכום:", JSON.stringify(total), errors.length ? `· ${errors.length} שגיאות` : "");
  if (APPLY && (notes.length || errors.length)) {
    await audit({ action: "drive.auto_sync", entityType: "drive", details: { ...total, errors: errors.length } });
  }
  if (errors.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
