/**
 * כלי הסוכן לבקשות "שינויים בקובץ" (טבלת material_fixes) — מה שמורות שולחות מכרטיס הקובץ באתר.
 * הסוכן לא מפרסם תיקון בעצמו: הוא מציע ניסוח מדויק, והמנהלת מאשרת ב-/admin/fixes ("פרסום כתיקון").
 *
 *   npx tsx --conditions=react-server scripts/agent-fix-suggest.ts --list
 *       בקשות ממתינות (JSON): fixId, materialId, כותרת/שם קובץ, מה המורה סימנה, מה ביקשה, והצעה קודמת אם יש.
 *   npx tsx --conditions=react-server scripts/agent-fix-suggest.ts --get <fixId>
 *       מוריד את קובץ ה-docx החי ל-_agent_work/fix-<fixId>/original.docx ומדפיס את הפסקאות שמכילות את הטקסט שסומן.
 *   npx tsx --conditions=react-server scripts/agent-fix-suggest.ts --suggest <fixId> --original "<טקסט מדויק בקובץ>" --corrected "<הטקסט המתוקן>" [--note "<הסבר>"]
 *       בודק מול הקובץ החי שהטקסט המקורי באמת נמצא (אותה בדיקה שהמנהלת תעבור בפרסום). אם נמצא — שומר את ההצעה
 *       על הבקשה (הסטטוס נשאר pending, שום דבר לא מתפרסם ושום קובץ לא משתנה). אם לא — שגיאה, לא נשמר כלום.
 * (--conditions=react-server נדרש כי docx-fixes.ts מייבא "server-only".) דורש DATABASE_URL + DRIVE_BRIDGE_*.
 */
import "dotenv/config";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
dotenv.config({ path: ".env.local" });

import JSZip from "jszip";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db";
import { materialFixes, materials } from "../src/db/schema";
import { driveDownload, driveIdFromUrl } from "../src/lib/driveBridgeCore";
import { applyDocxFixes, isDocxName } from "../src/lib/docx-fixes";
import { logAgentEvent } from "../src/lib/agentEvents";

const args = process.argv.slice(2);
const has = (k: string) => args.includes(`--${k}`);
const val = (k: string) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : undefined;
};

async function loadFix(fixId: number) {
  const [row] = await db
    .select({ fix: materialFixes, m: materials })
    .from(materialFixes)
    .innerJoin(materials, eq(materials.id, materialFixes.materialId))
    .where(eq(materialFixes.id, fixId));
  if (!row) throw new Error(`בקשה ${fixId} לא נמצאה`);
  if (!isDocxName(row.m.fileName)) throw new Error(`הקובץ "${row.m.fileName}" אינו docx — אי אפשר להציע תיקון מסומן`);
  const driveId = driveIdFromUrl(row.m.fileUrl);
  if (!driveId) throw new Error(`לחומר ${row.m.id} אין קובץ דרייב`);
  return { ...row, driveId };
}

async function list() {
  const rows = await db
    .select({ fix: materialFixes, m: materials })
    .from(materialFixes)
    .innerJoin(materials, eq(materials.id, materialFixes.materialId))
    .where(eq(materialFixes.status, "pending"))
    .orderBy(materialFixes.createdAt);
  console.log(
    JSON.stringify(
      rows.map(({ fix, m }) => ({
        fixId: fix.id,
        materialId: m.id,
        title: m.title,
        fileName: m.fileName,
        isDocx: isDocxName(m.fileName),
        marked: fix.quoteText,
        requested: fix.requestText,
        previousSuggestion: fix.originalText ? { original: fix.originalText, corrected: fix.correctedText, note: fix.adminNote } : null,
        createdAt: fix.createdAt,
      })),
      null,
      1,
    ),
  );
}

/** פסקאות (טקסט שטוח) מתוך document.xml — כדי שהסוכן יראה את הניסוח המדויק, כולל מקרה שהסימון נחתך באמצע מילה */
function paragraphs(xml: string): string[] {
  const out: string[] = [];
  for (const p of xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []) {
    const t = [...p.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)]
      .map((m) => m[1])
      .join("")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
    if (t.trim()) out.push(t);
  }
  return out;
}

async function get() {
  const fixId = Number(val("get"));
  const { fix, m, driveId } = await loadFix(fixId);
  const dl = await driveDownload(driveId);
  const dir = path.resolve("_agent_work", `fix-${fixId}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "original.docx"), Buffer.from(dl.bytes));
  const zip = await JSZip.loadAsync(dl.bytes);
  const xml = await zip.file("word/document.xml")!.async("string");
  const paras = paragraphs(xml);
  // מילות מפתח מהטקסט שסומן: מחפשים פסקאות שמכילות חלק ממנו (הסימון עלול להיות חתוך/מלוכלך)
  const marked = (fix.quoteText ?? "").replace(/\s+/g, " ").trim();
  const probes = [marked.slice(0, 25), marked.slice(Math.max(0, marked.length - 25))].filter((s) => s.length >= 6);
  const hits = paras.map((t, i) => ({ i, t })).filter((p) => probes.some((s) => p.t.includes(s)));
  await logAgentEvent({ source: "claude", kind: "cli", summary: `agent-fix-suggest --get fix#${fixId} material#${m.id} "${m.fileName}"` });
  console.log(
    JSON.stringify(
      { fixId, materialId: m.id, fileName: m.fileName, marked: fix.quoteText, requested: fix.requestText, savedTo: path.join(dir, "original.docx"), matchingParagraphs: hits.slice(0, 6) },
      null,
      1,
    ),
  );
}

async function suggest() {
  const fixId = Number(val("suggest"));
  const original = val("original")?.trim();
  const corrected = val("corrected")?.trim();
  const note = val("note")?.trim();
  if (!original || !corrected) throw new Error("חובה --original ו---corrected");
  const { fix, m, driveId } = await loadFix(fixId);
  if (fix.status !== "pending") throw new Error(`בקשה ${fixId} במצב ${fix.status}, לא pending — לא נוגעים`);
  const dl = await driveDownload(driveId);
  const test = await applyDocxFixes(new Uint8Array(dl.bytes), [{ id: fixId, originalText: original, correctedText: corrected }]);
  if (!test.applied.includes(fixId)) {
    console.error("הטקסט המקורי לא נמצא בקובץ החי (חייב להיות רצף מדויק בתוך פסקה אחת). לא נשמר כלום. הריצי --get ובחרי ניסוח מהפסקאות.");
    process.exit(2);
  }
  await db
    .update(materialFixes)
    .set({ originalText: original, correctedText: corrected, adminNote: note ? `הצעת הסוכן: ${note}` : "הצעת הסוכן (אומתה מול הקובץ החי)" })
    .where(and(eq(materialFixes.id, fixId), eq(materialFixes.status, "pending")));
  await logAgentEvent({
    source: "claude",
    kind: "fix",
    summary: `הצעת תיקון לבקשה #${fixId} בחומר #${m.id} "${m.fileName}" (אומתה מול הקובץ החי, ממתין לפרסום ע"י המנהלת)`,
    details: { original: original.slice(0, 300), corrected: corrected.slice(0, 300), note },
  });
  console.log(`נשמרה הצעה לבקשה ${fixId}. המנהלת תראה אותה ממולאת ב-/admin/fixes ותפרסם בלחיצה. שום קובץ לא שונה.`);
}

(async () => {
  if (has("list")) await list();
  else if (has("get")) await get();
  else if (has("suggest")) await suggest();
  else throw new Error("שימוש: --list | --get <fixId> | --suggest <fixId> --original ... --corrected ... [--note ...]");
})()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
