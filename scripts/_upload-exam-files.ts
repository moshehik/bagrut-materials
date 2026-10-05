/**
 * מעלה את קבצי "שאלות מבגרויות" / "תשובות לשאלות מבגרויות" (שנבנו ע"י _tools/exam-build-all.js) לדרייב
 * ויוצר להם שורות materials (status=draft — לא עולה לחיים בלי סקירה) תחת אותה קטגוריה של שאר קבצי אותו פרק.
 *
 * הקטגוריה נקבעת לפי "קבצי אחים" באותה תיקיית פרק (דף למורה וכו') — מחפשים אותם ב-materials לפי fileName /
 * drive_original_name / title, ובחירה לפי רוב. גיבוי: מיפוי-מאוחד.json.
 * אידמפוטנטי: מדלג על קובץ שכבר קיימת לו שורה (אותה קטגוריה + אותו fileName). יומן: _exam_work/upload_log.json.
 *
 * הרצה: npx tsx scripts/_upload-exam-files.ts [--apply] [--limit N] [--only <חלק מנתיב>]
 */
import "dotenv/config";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { materials, categories } from "../src/db/schema";
import { driveUpload, driveUrlFor } from "../src/lib/driveBridgeCore";
import { logDriveEvent, placeMaterial } from "../src/lib/driveTreeCore";
import { detectKind, stripExtension } from "../src/lib/admin-utils";
import { eq } from "drizzle-orm";

const MAT = path.resolve("חומרים מוכנים מחדש");
const LOG = path.resolve("_exam_work/upload_log.json");
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const APPLY = process.argv.includes("--apply");

// תווי "גרשיים" שונים (כולל PUA של WSL) מנורמלים לריק לצורך השוואה
const normPath = (s: string) => s.normalize("NFC").replace(/[\"'״׳’“”]/g, "").replace(/\\/g, "/");
const BAD = /BEFORE|BACKUP|SUPERSEDED|\.docx\./i;

function walk(d: string): string[] {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((x) => (x.isDirectory() ? walk(path.join(d, x.name)) : [path.join(d, x.name)]));
}

async function main() {
  const files = walk(MAT).filter((f) => /(^|[\\/])(שאלות מבגרויות|תשובות לשאלות מבגרויות) - פרק[^\\/]*\.docx$/.test(f));
  const only = arg("only");
  const limit = arg("limit") ? Number(arg("limit")) : Infinity;
  console.log(`נמצאו ${files.length} קבצי שאלות/תשובות מקומיים`);

  const rows = await db.select().from(materials);
  const cats = await db.select().from(categories);
  const catIds = new Set(cats.map((c) => c.id));
  const catById = new Map(cats.map((c) => [c.id, c]));
  const catPath = (id: number): string => { const out: string[] = []; let c = catById.get(id); while (c) { out.unshift(c.title); c = c.parentId ? catById.get(c.parentId) : undefined; } return out.join(" > "); };
  const byName = new Map<string, typeof rows>();
  const add = (k: string | null | undefined, r: (typeof rows)[number]) => { if (!k) return; const key = normPath(k); if (!byName.has(key)) byName.set(key, []); byName.get(key)!.push(r); };
  for (const r of rows) { add(r.fileName, r); add(r.driveOriginalName, r); add(r.title + ".docx", r); }

  // גיבוי: מיפוי-מאוחד.json (נתיב → categoryId)
  const unified: { categoryId: number | null; files: string[] }[] = JSON.parse(fs.readFileSync(path.join(MAT, "_ייבוא-לאתר/מיפוי-מאוחד.json"), "utf8"));
  const pathToCat = new Map<string, number>();
  for (const g of unified) if (g.categoryId) for (const f of g.files) pathToCat.set(normPath(f), g.categoryId);

  const log: Record<string, unknown>[] = fs.existsSync(LOG) ? JSON.parse(fs.readFileSync(LOG, "utf8")) : [];
  const done = new Set(log.filter((l) => l.ok).map((l) => l.file as string));
  let n = 0, uploaded = 0, skipped = 0, unresolved = 0;
  const dirCache = new Map<string, { cat: number | null; why: string }>();

  // ---- קביעת קטגוריה לפי עץ הקטגוריות (לא לפי קבצי אחים — שמות קבצים זהים בין ספרים) ----
  const nrm = (t: string) => normPath(t).replace(/\s+/g, " ").trim();
  const catPathN = (id: number) => nrm(catPath(id));
  const childrenOf = new Map<number, number[]>();
  for (const c of cats) if (c.parentId) { if (!childrenOf.has(c.parentId)) childrenOf.set(c.parentId, []); childrenOf.get(c.parentId)!.push(c.id); }
  const descendants = (id: number): number[] => (childrenOf.get(id) ?? []).flatMap((k) => [k, ...descendants(k)]);
  const LET: Record<string, number> = { א: 1, ב: 2, ג: 3, ד: 4, ה: 5, ו: 6, ז: 7, ח: 8, ט: 9, י: 10, כ: 20, ל: 30, מ: 40, נ: 50, ס: 60, ע: 70, פ: 80, צ: 90, ק: 100, ר: 200, ש: 300, ת: 400 };
  const num = (t: string) => [...t.replace(/[^א-ת]/g, "")].reduce((a, ch) => a + (LET[ch] ?? 0), 0);
  const chapRange = (title: string): [number, number] | null => {
    const m = [...title.matchAll(/פרק\s+([א-ת"'״׳\uF022]+)/g)].map((x) => num(x[1]));
    return m.length ? [m[0], m[m.length - 1]] : null;
  };
  const folderRange = (name: string): [number, number] | null => {
    const m = name.match(/^פרק ([א-ת"״׳'\uF022]+?)(?:\s*[-–]\s*([א-ת"״׳'\uF022]+))?$/);
    return m ? [num(m[1]), num(m[2] ?? m[1])] : null;
  };
  const T3 = 'שאלון חיצוני 3 יחל – נביאים אחרונים', T5 = 'יחידת הגבר (5 יחל) – עיון בנביאים';
  // תיקיית ספר → (נתיב קטגוריית-שורש מנורמל, מילת-מפתח אופציונלית באבות)
  function rootFor(dir: string): { root: string; mid?: string } | null {
    const r = nrm(path.relative(MAT, dir)).split("/");
    const [t1, t2, t3, t4] = r;
    if (t1 === "כתובים" && t2 === "תהילים 3 יחידות") return { root: nrm('כתובים > תהלים – שאלון חיצוני 3 יח"ל') };
    if (t1 === "כתובים" && t2 === "תהילים 5 יחידות") return { root: nrm('כתובים > תהלים – יחידת הגבר (5 יח"ל)') };
    if (t1 === "נביא" && t2 === "נביא 3 יחידות") return { root: nrm('נביא > שאלון חיצוני 3 יח"ל – נביאים אחרונים > ' + t3) };
    if (t1 === "נביא" && t2 === "נביא 5 יחידות") {
      const base = 'נביא > יחידת הגבר (5 יח"ל) – עיון בנביאים > ';
      if (t3 === "ישעיה") return { root: nrm(base + "ישעיה – פרקי הגבר") };
      if (t3 === "זכריה") return { root: nrm(base + "תרי עשר > זכריה") };
      if (t3 === "תרי עשר") return { root: nrm(base + "תרי עשר > " + t4) };
      return { root: nrm(base + t3 + "'") };   // מלכים א / מלכים ב
    }
    if (t1 === "תורה 3 יחידות" && t2 === "בגרות חיצונית") return { root: nrm('תורה > בגרות 3 יחידות > בגרות חיצונית – עיון בשמות'), mid: "פרשת " + t3 };
    if (t1 === "תורה 5 יחידות" && /בראשית חיצוני/.test(t2)) return { root: nrm('תורה > בגרות 5 יחידות > יחידת הגבר – בחינה חיצונית > עיון בראשית') };
    if (t1 === "תורה 5 יחידות" && /דברים חיצוני/.test(t2)) return { root: nrm('תורה > בגרות 5 יחידות > יחידת הגבר – בחינה חיצונית > עיון דברים'), mid: t3 };
    return null;
  }
  function resolveCategory(dir: string): { cat: number | null; why: string } {
    if (dirCache.has(dir)) return dirCache.get(dir)!;
    const rf = rootFor(dir), fr = folderRange(path.basename(dir));
    let res: { cat: number | null; why: string };
    if (!rf || !fr) res = { cat: null, why: "תיקייה לא מזוהה" };
    else {
      const roots = cats.filter((c) => catPathN(c.id) === rf.root);
      if (roots.length !== 1) res = { cat: null, why: `שורש לא חד-משמעי (${roots.length}): ${rf.root}` };
      else {
        const cands = descendants(roots[0].id).filter((id) => {
          const cr = chapRange(catById.get(id)!.title);
          return cr && cr[0] === fr[0] && cr[1] === fr[1] && (!rf.mid || catPathN(id).includes(nrm(rf.mid)));
        });
        // אם יש גם צומת-פרשה וגם ילדיה — מעדיפים את העמוק ביותר
        if (cands.length === 1) res = { cat: cands[0], why: "עץ" };
        else if (cands.length === 0) res = { cat: null, why: "אין צומת פרק תואם בעץ" };
        else { const depthOf = (id: number) => catPathN(id).split(" > ").length; const mx = Math.max(...cands.map(depthOf)); const deep = cands.filter((x) => depthOf(x) === mx); res = deep.length === 1 ? { cat: deep[0], why: "עץ (העמוק ביותר)" } : { cat: null, why: "כמה מועמדים: " + cands.map((x) => "#" + x).join(",") }; }
      }
    }
    dirCache.set(dir, res);
    return res;
  }

  for (const f of files) {
    if (only && !f.includes(only)) continue;
    if (n >= limit) break;
    const rel = path.relative(MAT, f);
    const fileName = path.basename(f);
    const { cat, why } = resolveCategory(path.dirname(f));
    if (!cat) { unresolved++; console.log(`✗ ללא קטגוריה: ${rel} — ${why}`); log.push({ file: rel, ok: false, why }); continue; }
    const exists = rows.find((r) => r.categoryId === cat && normPath(r.fileName).startsWith(normPath(stripExtension(fileName))) && !/\.BEFORE/.test(r.fileName));
    if (exists || done.has(rel)) { skipped++; continue; }
    n++;
    if (!APPLY) { console.log(`[dry] ${rel.split("\\").slice(0, -1).join("/")} :: ${fileName.startsWith("ת") ? "ת" : "ש"} → #${cat} ${catPath(cat)}`); continue; }
    const bytes = fs.readFileSync(f);
    const { fileId } = await driveUpload({ name: fileName, mimeType: DOCX, bytes });
    const [row] = await db.insert(materials).values({
      categoryId: cat, title: stripExtension(fileName), kind: detectKind(fileName), fileUrl: driveUrlFor(fileId),
      fileName, mime: DOCX, size: bytes.length, price: 1500, premiumOnly: false, minTier: "none", access: "paid", status: "draft",
    }).returning({ id: materials.id });
    try {
      await logDriveEvent({ kind: "file.add", materialId: row.id, categoryId: cat, driveId: fileId, newValue: fileName, details: { via: "exam-files-upload-script" } });
      await placeMaterial(row.id, {});
    } catch (e) { console.log(`  (אזהרה: placeMaterial נכשל ל-#${row.id}: ${(e as Error).message})`); }
    uploaded++;
    log.push({ file: rel, ok: true, materialId: row.id, categoryId: cat, fileId });
    fs.writeFileSync(LOG, JSON.stringify(log, null, 1));
    console.log(`✓ #${row.id} ${rel}`);
  }
  console.log(`סיכום: ${APPLY ? "הועלו" : "היו מועלים"} ${APPLY ? uploaded : n}, דולגו (כבר קיימים) ${skipped}, ללא קטגוריה ${unresolved}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
