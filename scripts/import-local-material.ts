/**
 * מעלה קובץ בודד מהמחשב המקומי (מ"חומרים מוכנים מחדש/...") לדרייב, ויוצר
 * עבורו שורת materials תחת קטגוריה קיימת. האחסון הוא Google Drive בלבד (Vercel Blob בוטל לחלוטין).
 *
 * הרצה:
 *   npx tsx scripts/import-local-material.ts \
 *     --file "חומרים מוכנים מחדש/נביא/נביא הערכה חילופית/אהוד בן גרא (פרק ג)/דף למורה - אהוד בן גרא.docx" \
 *     --category ehud \
 *     [--title "..."] [--kind teacher_sheet|student_sheet|presentation|past_exam|tips|ideas|other] \
 *     [--status draft|active|suspended] [--access free|paid|premium] [--price 15]
 *
 * ברירות מחדל: status=draft (בטוח - לא עולה לחיים בלי סקירה), access=paid,
 * price=15, kind מזוהה אוטומטית מהשם (כמו טופס ההעלאה באתר, ר' admin-utils.ts).
 * --category מקבל slug בודד (מחפש קטגוריה עם ה-slug הזה, בכל מקום בעץ - צריך
 * להיות ייחודי; אם יש כמה עם אותו slug, מדפיס את כולן ויוצא בלי לבחור).
 */
import "dotenv/config";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { driveUpload, driveUrlFor } from "../src/lib/driveBridgeCore";
import { detectKind, stripExtension, slugify } from "../src/lib/admin-utils";

dotenv.config({ path: ".env.local" });

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set (check .env.local)");
  process.exit(1);
}
const db = drizzle(neon(url), { schema });
const { materials, categories } = schema;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".ppt": "application/vnd.ms-powerpoint",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

async function main() {
  const filePath = arg("file");
  const categorySlug = arg("category");
  if (!filePath || !categorySlug) {
    console.error("חובה: --file <path> --category <slug>");
    process.exit(1);
  }
  if (!fs.existsSync(filePath)) {
    console.error(`הקובץ לא נמצא: ${filePath}`);
    process.exit(1);
  }

  const matches = await db.select().from(categories).where(eq(categories.slug, categorySlug));
  if (matches.length === 0) {
    console.error(`לא נמצאה קטגוריה עם slug="${categorySlug}"`);
    process.exit(1);
  }
  if (matches.length > 1) {
    console.error(`יש כמה קטגוריות עם slug="${categorySlug}": ${matches.map((m) => `#${m.id}`).join(", ")} - חדד את הבחירה`);
    process.exit(1);
  }
  const category = matches[0];

  const fileName = path.basename(filePath);
  const ext = path.extname(fileName).toLowerCase();
  const mime = MIME_BY_EXT[ext] || "application/octet-stream";
  const bytes = fs.readFileSync(filePath);

  const title = arg("title") || stripExtension(fileName);
  const kind = (arg("kind") as schema.MaterialKind | undefined) || detectKind(fileName);
  const status = (arg("status") as schema.Status | undefined) || "draft";
  const access = (arg("access") as schema.Access | undefined) || "paid";
  const price = arg("price") ? Number(arg("price")) : 15;

  console.log(`מעלה "${fileName}" (${(bytes.length / 1024).toFixed(0)}KB) לדרייב...`);
  const { fileId } = await driveUpload({ name: fileName, mimeType: mime, bytes });
  const fileUrl = driveUrlFor(fileId);
  console.log(`הועלה: ${fileUrl}`);

  const [row] = await db
    .insert(materials)
    .values({
      categoryId: category.id,
      title,
      kind,
      fileUrl,
      fileName,
      mime,
      size: bytes.length,
      price: Math.round(price * 100),
      premiumOnly: false,
      access,
      status,
    })
    .returning({ id: materials.id });

  console.log(`נוצרה שורת materials #${row.id}: "${title}" תחת קטגוריה #${category.id} "${category.title}" (slug=${categorySlug}), status=${status}`);
}

main().catch((e) => {
  console.error("שגיאה:", e);
  process.exit(1);
});
