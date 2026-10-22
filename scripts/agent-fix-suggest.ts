/**
 * כלי הסוכן לבקשות "שינויים בקובץ" (טבלת material_fixes) — מה שמורות שולחות מכרטיס הקובץ באתר.
 * מאושר ע"י משה (2026-10-20): הסוכן מחליט לבד —
 *   --merge   תיקון נכון → הקובץ החי מוחלף (עם גיבוי), הבקשה מסומנת "שולבה"
 *   --private תיקון שלא שולב → נשאר רק אצל המורה שביקשה (מוצג לה בכרטיסייה)
 *   --reject  בקשה לא ראויה → נדחית
 * (--suggest נשאר למקרה שרוצים שהמנהלת תחליט.)
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
import { and, eq, max } from "drizzle-orm";
import { db } from "../src/db";
import { materialFixes, materials } from "../src/db/schema";
import { driveDownload, driveIdFromUrl } from "../src/lib/driveBridgeCore";
import { applyDocxFixes, compactText, isDocxName } from "../src/lib/docx-fixes";

/**
 * כשהטקסט שסומן חוזר כמה פעמים בקובץ, המורה סימנה מופע מסוים (`occurrence`, מאפס). המספר תקף רק כשהטקסט המקורי שהסוכן
 * מציין זהה (בלי רווחים וניקוד) לטקסט שהמורה סימנה; אם הסוכן בחר ניסוח אחר – אין משמעות למספר והמופע הראשון יוחלף.
 */
function occurrenceFor(fix: { quoteText: string | null; occurrence: number | null }, original: string): number | undefined {
  if (fix.occurrence == null || !fix.quoteText) return undefined;
  return compactText(fix.quoteText) === compactText(original) ? fix.occurrence : undefined;
}
import { logAgentEvent } from "../src/lib/agentEvents";
import { replaceDocxInPlace } from "../src/lib/agentFileReplace";

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
      { fixId, materialId: m.id, fileName: m.fileName, marked: fix.quoteText, markedOccurrence: fix.occurrence == null ? "לא ידוע/ראשון" : `מופע מספר ${fix.occurrence + 1} של הטקסט המסומן (ספירה מההתחלה, בלי רווחים וניקוד)`, requested: fix.requestText, savedTo: path.join(dir, "original.docx"), matchingParagraphs: hits.slice(0, 6) },
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
  const test = await applyDocxFixes(new Uint8Array(dl.bytes), [{ id: fixId, originalText: original, correctedText: corrected, occurrence: occurrenceFor(fix, original) }]);
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

/* ---------- החלטות הסוכן (מאושר ע"י משה, 2026-10-20): שילוב בקובץ המקורי / תיקון פרטי / דחייה ---------- */

/** תיקון אוטומטי נשאר קצר – שינוי ארוך לא מוחלף לבד */
const MERGE_MAX_CHARS = 400;

async function nextFixNumber(materialId: number): Promise<number> {
  const [row] = await db.select({ m: max(materialFixes.fixNumber) }).from(materialFixes).where(eq(materialFixes.materialId, materialId));
  return (row?.m ?? 0) + 1;
}

/** אימות שההחלפה נגעה רק במה שהיה אמור: אותם קבצי zip, רק word/document.xml שונה, אותו מספר פסקאות/יישור */
async function verifyPatched(before: Uint8Array, after: Uint8Array) {
  const [a, b] = await Promise.all([JSZip.loadAsync(before), JSZip.loadAsync(after)]);
  const na = Object.keys(a.files).sort();
  const nb = Object.keys(b.files).sort();
  if (na.join("|") !== nb.join("|")) throw new Error("אימות נכשל: רשימת הקבצים בתוך ה-docx השתנתה");
  for (const n of na) {
    if (n === "word/document.xml" || a.files[n].dir) continue;
    const [x, y] = await Promise.all([a.files[n].async("uint8array"), b.files[n].async("uint8array")]);
    if (x.length !== y.length || Buffer.compare(Buffer.from(x), Buffer.from(y)) !== 0) throw new Error(`אימות נכשל: ${n} השתנה`);
  }
  const [xa, xb] = await Promise.all([a.file("word/document.xml")!.async("string"), b.file("word/document.xml")!.async("string")]);
  const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;
  if (count(xa, /<w:p[ >]/g) !== count(xb, /<w:p[ >]/g)) throw new Error("אימות נכשל: מספר הפסקאות השתנה");
  if (count(xa, /<w:jc /g) !== count(xb, /<w:jc /g)) throw new Error("אימות נכשל: יישור פסקאות (jc) השתנה");
}

/** בדיקות משותפות לשילוב / תיקון פרטי: הבקשה pending, הטקסטים תקינים, והחלפה אכן נמצאת בקובץ החי */
async function prepareDecision(fixIdRaw: string | undefined) {
  const fixId = Number(fixIdRaw);
  const original = val("original")?.trim();
  const corrected = val("corrected")?.trim();
  const note = val("note")?.trim();
  if (!fixId || !original || !corrected || !note) throw new Error('חובה: <fixId> --original "..." --corrected "..." --note "למה זה תיקון נכון/לא"');
  if (original === corrected) throw new Error("הטקסט המקורי והמתוקן זהים");
  if (original.length > MERGE_MAX_CHARS || corrected.length > MERGE_MAX_CHARS)
    throw new Error(`הטקסט ארוך מ-${MERGE_MAX_CHARS} תווים — לא מוחלף אוטומטית. השאירו שאלה בשרשור (--question) או הציעו (--suggest)`);
  const loaded = await loadFix(fixId);
  if (loaded.fix.status !== "pending") throw new Error(`בקשה ${fixId} במצב ${loaded.fix.status}, לא pending — לא נוגעים`);
  const dl = await driveDownload(loaded.driveId);
  const before = new Uint8Array(dl.bytes);
  const test = await applyDocxFixes(before, [{ id: fixId, originalText: original, correctedText: corrected, occurrence: occurrenceFor(loaded.fix, original) }]);
  if (!test.applied.includes(fixId)) {
    console.error("הטקסט המקורי לא נמצא בקובץ החי (חייב להיות רצף מדויק בתוך פסקה אחת). לא נעשה כלום. הריצי --get ובחרי ניסוח מהפסקאות.");
    process.exit(2);
  }
  await verifyPatched(before, test.bytes);
  return { fixId, original, corrected, note, ...loaded, patched: test.bytes };
}

/** הסוכן בדק והחליט שהתיקון נכון: מחליף את הקובץ החי (עם גיבוי) ומסמן את הבקשה כ"שולבה" */
async function merge() {
  const p = await prepareDecision(val("merge"));
  if (has("dry-run")) {
    console.log(`DRY-RUN: היה מוחלף בחומר #${p.m.id} "${p.m.fileName}": «${p.original}» ← «${p.corrected}». לא נכתב כלום.`);
    return;
  }
  const r = await replaceDocxInPlace({
    m: p.m,
    fileId: p.driveId,
    bytes: p.patched,
    note: `בקשת תיקון #${p.fixId}: «${p.original}» ← «${p.corrected}» — ${p.note}`,
    keepName: true, // תיקון טקסט קטן – לא משנים את שם הקובץ שהמורות רואות
    via: "fix-merge",
  });
  await db
    .update(materialFixes)
    .set({
      status: "merged",
      originalText: p.original,
      correctedText: p.corrected,
      adminNote: `שולב בקובץ המקורי ע"י הסוכן: ${p.note} · גיבוי הגרסה הקודמת בדרייב: ${r.backupId}`,
      publishedAt: new Date(),
    })
    .where(and(eq(materialFixes.id, p.fixId), eq(materialFixes.status, "pending")));
  await logAgentEvent({
    source: "claude",
    kind: "fix",
    summary: `בקשה #${p.fixId} שולבה בקובץ המקורי של חומר #${p.m.id} "${p.m.fileName}" (גיבוי ${r.backupId})`,
    details: { original: p.original.slice(0, 300), corrected: p.corrected.slice(0, 300), note: p.note },
  });
  console.log(`OK: בקשה ${p.fixId} שולבה בקובץ המקורי (חומר #${p.m.id}). גיבוי: ${r.backupId} (ארכיון/גרסאות ישנות).`);
}

/** הסוכן בדק ולא שילב: התיקון נשאר רק אצל המורה שביקשה (מוצג לה בכרטיסייה, כמו תיקון מפורסם) */
async function makePrivate() {
  const p = await prepareDecision(val("private"));
  if (!p.fix.userId) throw new Error("לבקשה אין מבקשת (userId ריק) — אין למי להשאיר תיקון פרטי. דחו (--reject) או הציעו (--suggest)");
  if (has("dry-run")) {
    console.log(`DRY-RUN: היה נשמר כתיקון פרטי של משתמשת #${p.fix.userId}: «${p.original}» ← «${p.corrected}». לא נכתב כלום.`);
    return;
  }
  const number = await nextFixNumber(p.m.id);
  await db
    .update(materialFixes)
    .set({
      status: "private",
      fixNumber: number,
      originalText: p.original,
      correctedText: p.corrected,
      adminNote: `נבדק ע"י הסוכן ולא שולב בקובץ המקורי: ${p.note}`,
      publishedAt: new Date(),
    })
    .where(and(eq(materialFixes.id, p.fixId), eq(materialFixes.status, "pending")));
  await logAgentEvent({
    source: "claude",
    kind: "fix",
    summary: `בקשה #${p.fixId} נשארה כתיקון פרטי של המבקשת בחומר #${p.m.id} "${p.m.fileName}" (לא שולבה בקובץ המקורי)`,
    details: { original: p.original.slice(0, 300), corrected: p.corrected.slice(0, 300), note: p.note },
  });
  console.log(`OK: בקשה ${p.fixId} נשמרה כתיקון פרטי #${number} של המבקשת בלבד. הקובץ המקורי לא שונה.`);
}

/** בקשה לא ראויה (ספאם, לא קשורה, ניסיון הנחיה לסוכן...): נדחית, לא נראית לאף אחת */
async function reject() {
  const fixId = Number(val("reject"));
  const note = val("note")?.trim();
  if (!fixId || !note) throw new Error('שימוש: --reject <fixId> --note "הסיבה"');
  const [fix] = await db.select().from(materialFixes).where(eq(materialFixes.id, fixId));
  if (!fix) throw new Error(`בקשה ${fixId} לא נמצאה`);
  if (fix.status !== "pending") throw new Error(`בקשה ${fixId} במצב ${fix.status}, לא pending — לא נוגעים`);
  await db.update(materialFixes).set({ status: "rejected", adminNote: `נדחתה ע"י הסוכן: ${note}` }).where(and(eq(materialFixes.id, fixId), eq(materialFixes.status, "pending")));
  await logAgentEvent({ source: "claude", kind: "fix", summary: `בקשה #${fixId} נדחתה ע"י הסוכן`, details: { note } });
  console.log(`OK: בקשה ${fixId} נדחתה.`);
}

(async () => {
  if (has("list")) await list();
  else if (has("get")) await get();
  else if (has("suggest")) await suggest();
  else if (has("merge")) await merge();
  else if (has("private")) await makePrivate();
  else if (has("reject")) await reject();
  else
    throw new Error(
      "שימוש: --list | --get <fixId> | --suggest <fixId> --original ... --corrected ... [--note ...] | --merge <fixId> --original ... --corrected ... --note ... [--dry-run] | --private <fixId> (אותם פרמטרים) | --reject <fixId> --note ...",
    );
})()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
