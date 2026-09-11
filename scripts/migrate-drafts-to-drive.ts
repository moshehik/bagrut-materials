/**
 * מעביר קבצי חומרים מ-Vercel Blob לארכיון Drive (דרך src/lib/driveBridgeCore.ts),
 * ומעדכן materials.fileUrl ל-drive://<fileId>.
 * 09.2026: חנות ה-Blob הושעתה ("This store has been suspended" / 403 "Your store
 * is blocked") - מעבירים הכל, לא רק טיוטות. מדלג על drive://* (כבר הועבר) ועל
 * example.com/* (נתוני seed/דמו, לא קבצים אמיתיים).
 *
 * הרצה:
 *   npx tsx scripts/migrate-drafts-to-drive.ts --dry-run        (בדיקה בלי שינויים)
 *   npx tsx scripts/migrate-drafts-to-drive.ts --limit 5        (רק 5 קבצים ראשונים)
 *   npx tsx scripts/migrate-drafts-to-drive.ts                  (הכל)
 *
 * למה לא מקבילי: archiveRoot_ ב-Apps Script יוצר את תיקיית השורש בפעם הראשונה
 * (getFoldersByName || createFolder) - קריאות מקבילות עלולות ליצור תיקייה כפולה.
 * רצים אחד-אחד; לוקח יותר זמן אבל בטוח.
 */
import "dotenv/config";
import dotenv from "dotenv";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { and, eq, not, like } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { get, del } from "@vercel/blob";
import { driveUpload, driveUrlFor } from "../src/lib/driveBridgeCore";

dotenv.config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (check .env.local)");
  process.exit(1);
}
const db = drizzle(neon(url), { schema });
const { materials } = schema;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

async function main() {
  const rows = await db
    .select({ id: materials.id, title: materials.title, fileUrl: materials.fileUrl, fileName: materials.fileName, mime: materials.mime, size: materials.size, status: materials.status })
    .from(materials)
    .where(
      and(
        not(like(materials.fileUrl, "drive://%")),
        not(like(materials.fileUrl, "%example.com%"))
      )
    );

  const todo = rows.slice(0, Number.isFinite(limit) ? limit : rows.length);
  console.log(`נמצאו ${rows.length} חומרים ב-Blob (כולל active). ${dryRun ? "(dry-run) " : ""}מעבדים ${todo.length}.`);

  let okCount = 0;
  let failCount = 0;
  let bytesMoved = 0;
  const failures: { id: number; title: string; error: string }[] = [];

  for (const [idx, m] of todo.entries()) {
    const label = `[${idx + 1}/${todo.length}] #${m.id} ${m.title}`;
    try {
      if (dryRun) {
        console.log(`${label} — יעבור (dry-run, לא בוצע שינוי)`);
        continue;
      }
      const blob = await get(m.fileUrl, { access: "private" });
      if (!blob || !blob.stream) throw new Error("קובץ לא נמצא ב-Blob");
      const bytes = Buffer.from(await new Response(blob.stream).arrayBuffer());
      const { fileId } = await driveUpload({ name: m.fileName, mimeType: m.mime, bytes });
      const driveUrl = driveUrlFor(fileId);
      await db.update(materials).set({ fileUrl: driveUrl }).where(eq(materials.id, m.id));
      await del(m.fileUrl).catch(() => {});
      bytesMoved += bytes.byteLength;
      okCount++;
      console.log(`${label} — הועבר (${(bytes.byteLength / 1024 / 1024).toFixed(1)}MB) -> ${driveUrl}`);
    } catch (e) {
      failCount++;
      const msg = e instanceof Error ? e.message : String(e);
      failures.push({ id: m.id, title: m.title, error: msg });
      console.error(`${label} — נכשל: ${msg}`);
    }
  }

  console.log("---");
  console.log(`הושלם: ${okCount} הצליחו, ${failCount} נכשלו, ${(bytesMoved / 1024 / 1024).toFixed(1)}MB הועברו מ-Blob.`);
  if (failures.length) {
    console.log("כשלונות:", JSON.stringify(failures, null, 2));
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("שגיאה כללית:", e);
  process.exit(1);
});
