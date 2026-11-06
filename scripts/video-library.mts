/**
 * מאגר סרטונים: התאמת סרטון לפרק באתר בלי לקרוא את כל החומר בכל פעם.
 *
 * הרצה (מתיקיית השורש; NODE_OPTIONS=--use-system-ca):
 *   npx tsx --conditions=react-server scripts/video-library.mts <פקודה> ...
 *
 *   index [--only "תורה 5 יחידות,תורה 3 יחידות"] [--force]   סורק את קבצי docx המקומיים ושומר מטמון טקסט (מצטבר: רק קבצים חדשים/ששונו)
 *   match <מילה|"צירוף מילים"> ... [--top N]                  מדרג פרקים לפי מקום ההופעה של מילות המפתח (מקבל גם סיומות/תחיליות עבריות)
 *   status                                                      סרטונים בתיקיית המאגר שעוד אינם ביומן
 *   upload <קובץ> <categoryId> <כותרת>                          מעלה לדרייב + שורת חומר כטיוטה + הצבה בתיקייה + רישום ביומן (לא מפרסם)
 *   record <שם סרטון> <materialId> ...                          רושם ביומן הצבה שכבר קיימת
 *
 * המטמון (טקסט שחולץ מהקבצים) ב-_tmp_video-library/ (לא ב-git). היומן docs/video-library.json נשמר ב-git: בלי מזהי דרייב.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { createRequire } from "module";
import { neon } from "@neondatabase/serverless";
import JSZip from "jszip";

const require = createRequire(import.meta.url);
const makeResolver = require("./local-category-resolver.cjs");

const ROOT = process.cwd();
const BASE = path.join(ROOT, "חומרים מוכנים מחדש");
const CACHE = path.join(ROOT, "_tmp_video-library");
const INDEX_FILE = path.join(CACHE, "index.json");
const MANIFEST = path.join(ROOT, "docs", "video-library.json");
const VIDEO_ROOT = process.env.VIDEO_LIBRARY_DIR || "C:/Users/MOSHE/Videos/סרטונים לשיעורים";
const VIDEO_EXT = /\.(mp4|m4v|mov|mkv|webm|avi|wmv|mpg|mpeg|3gp)$/i;

type Cat = { id: number; parent_id: number | null; title: string };
type IndexEntry = { size: number; mtimeMs: number; cat: number | null; dir: string; txt: string };
type Placement = { materialId: number; categoryId: number; path: string; title: string; at: string };
type VideoRec = { sizeMB: number; note?: string; status: "placed" | "pending" | "no-match"; placements: Placement[] };
type Manifest = { videos: Record<string, VideoRec> };

const args = process.argv.slice(2);
const cmd = args.shift();
const flag = (name: string) => {
  const i = args.indexOf(name);
  if (i < 0) return null;
  const next = args[i + 1];
  const hasValue = next !== undefined && !next.startsWith("--");
  args.splice(i, hasValue ? 2 : 1);
  return hasValue ? next : "1";
};

const norm = (s: string) =>
  s
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/[\u0591-\u05C7]/g, "").replace(/[\u200E\u200F\u200B]/g, "");

async function loadCats() {
  const sql = neon(process.env.DATABASE_URL!);
  const rows = (await sql`select id, parent_id, title from categories`) as Cat[];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const pathOf = (r: Cat) => { const out: string[] = []; let x: Cat | undefined = r; while (x) { out.unshift(x.title); x = x.parent_id ? byId.get(x.parent_id) : undefined; } return out; };
  return { rows, byId, pathOf, sql };
}

function readManifest(): Manifest {
  try { return JSON.parse(fs.readFileSync(MANIFEST, "utf-8")); } catch { return { videos: {} }; }
}
function writeManifest(m: Manifest) {
  fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
  fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2) + "\n", "utf-8");
}
function readIndex(): Record<string, IndexEntry> {
  try { return JSON.parse(fs.readFileSync(INDEX_FILE, "utf-8")); } catch { return {}; }
}

function listDocx(dir: string, out: string[] = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith("_") || e.name.startsWith("~$") || e.name.includes(".BEFORE") || e.name.includes("BACKUP")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listDocx(p, out);
    else if (/\.docx$/i.test(e.name)) out.push(p);
  }
  return out;
}

async function cmdIndex() {
  const only = (flag("--only") ?? "תורה 5 יחידות,תורה 3 יחידות").split(",").map((s) => s.trim()).filter(Boolean);
  const force = !!flag("--force");
  const { rows, byId, pathOf } = await loadCats();
  const resolver = makeResolver(rows.map((r) => ({ id: r.id, parent: r.parent_id, title: r.title, path: pathOf(r) })));
  fs.mkdirSync(path.join(CACHE, "text"), { recursive: true });
  const index = readIndex();
  const files = only.flatMap((d) => (fs.existsSync(path.join(BASE, d)) ? listDocx(path.join(BASE, d)) : []));
  let added = 0, kept = 0, failed = 0;
  const unresolved = new Set<string>();
  for (const f of files) {
    const rel = path.relative(BASE, f).split(path.sep).join("/");
    const st = fs.statSync(f);
    const prev = index[rel];
    if (!force && prev && prev.size === st.size && prev.mtimeMs === st.mtimeMs) { kept++; continue; }
    try {
      const z = await JSZip.loadAsync(fs.readFileSync(f));
      // חלק מהקבצים נשמרו עם נתיבי zip בסלאש הפוך (word\document.xml) – האתר מנרמל את זה בהורדה
      const entry = z.file("word/document.xml") ?? z.file("word\\document.xml");
      const xml = await entry!.async("string");
      const text = norm(xml.replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, ""));
      const dir = path.dirname(rel);
      const r = resolver.resolve(rel); // הפונקציה מצפה לנתיב הקובץ המלא (היא חותכת את שם הקובץ בעצמה)
      const txt = crypto.createHash("sha1").update(rel).digest("hex") + ".txt";
      fs.writeFileSync(path.join(CACHE, "text", txt), text, "utf-8");
      index[rel] = { size: st.size, mtimeMs: st.mtimeMs, cat: r.cat ?? null, dir, txt };
      if (!r.cat) unresolved.add(dir);
      added++;
    } catch { failed++; }
  }
  // קבצים שנמחקו מהדיסק
  for (const rel of Object.keys(index)) if (!fs.existsSync(path.join(BASE, rel))) { fs.rmSync(path.join(CACHE, "text", index[rel].txt), { force: true }); delete index[rel]; }
  fs.writeFileSync(INDEX_FILE, JSON.stringify(index));
  const mapped = Object.values(index).filter((e) => e.cat).length;
  console.log(`index: ${files.length} files | new/changed ${added} | unchanged ${kept} | failed ${failed} | mapped to a category ${mapped}/${Object.keys(index).length}`);
  if (unresolved.size) console.log(`folders not mapped to a category (${unresolved.size}):\n  ` + [...unresolved].slice(0, 12).join("\n  "));
  void byId;
}

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function termRegex(t: string) {
  const core = escRe(norm(t).trim()).replace(/\s+/g, "\\s+");
  const suffix = t.replace(/\s/g, "").length >= 4 ? "[א-ת]{0,2}" : "";
  return new RegExp(`(?<![א-ת])[בהלומשכ]{0,3}${core}${suffix}(?![א-ת])`, "g");
}

async function cmdMatch() {
  const top = Number(flag("--top") ?? 8);
  const terms = args.filter(Boolean);
  if (!terms.length) throw new Error('usage: match <מילה|"צירוף"> ...');
  const index = readIndex();
  if (!Object.keys(index).length) throw new Error("אין מטמון: להריץ קודם index");
  const { rows, byId, pathOf } = await loadCats();
  const res = terms.map(termRegex);
  type Agg = { files: Set<string>; counts: number[]; snippet: (string | null)[]; score: number };
  const agg = new Map<number, Agg>();
  for (const [rel, e] of Object.entries(index)) {
    if (!e.cat) continue;
    const text = fs.readFileSync(path.join(CACHE, "text", e.txt), "utf-8");
    const a = agg.get(e.cat) ?? { files: new Set(), counts: terms.map(() => 0), snippet: terms.map(() => null), score: 0 };
    res.forEach((re, i) => {
      const m = [...text.matchAll(re)];
      if (!m.length) return;
      a.files.add(rel);
      a.counts[i] += m.length;
      if (!a.snippet[i]) { const at = m[0].index!; a.snippet[i] = text.slice(Math.max(0, at - 70), at + 90).replace(/\s+/g, " "); }
    });
    agg.set(e.cat, a);
  }
  const scored = [...agg].map(([cat, a]) => {
    const matched = a.counts.filter((c) => c > 0).length;
    const score = a.counts.reduce((s, c) => s + (c ? 2 + Math.log2(1 + c) : 0), 0) + (matched === terms.length ? 3 : 0);
    return { cat, a, matched, score };
  }).filter((x) => x.matched > 0).sort((x, y) => y.score - x.score).slice(0, top);
  for (const s of scored) {
    const c = byId.get(s.cat)!;
    console.log(`\n#${s.cat}  [${s.matched}/${terms.length} מילים | ${s.a.files.size} קבצים | ציון ${s.score.toFixed(1)}]  ${pathOf(c).slice(1).join(" › ")}`);
    terms.forEach((t, i) => { if (s.a.counts[i]) console.log(`    ${t} ×${s.a.counts[i]}: …${s.a.snippet[i]}…`); });
  }
  if (!scored.length) console.log("אין התאמה (להוסיף לרשימת 'ממתין' ביומן ולבדוק שוב אחרי עדכון המטמון)");
  void rows;
}

function cmdStatus() {
  const m = readManifest();
  const found: { rel: string; mb: number }[] = [];
  (function walk(d: string) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (VIDEO_EXT.test(e.name)) found.push({ rel: path.relative(VIDEO_ROOT, p).split(path.sep).join("/"), mb: fs.statSync(p).size / 1048576 });
    }
  })(VIDEO_ROOT);
  const base = (rel: string) => rel.split("/").pop()!;
  const known = new Set(Object.keys(m.videos).map(base));
  const fresh = found.filter((v) => !known.has(base(v.rel)));
  console.log(`videos in library: ${found.length} | in manifest: ${Object.keys(m.videos).length} | new: ${fresh.length}`);
  for (const v of fresh) console.log(`  ${v.mb.toFixed(1).padStart(7)}MB  ${v.rel}`);
  const byStatus = Object.entries(m.videos).filter(([, v]) => v.status !== "placed");
  if (byStatus.length) console.log("\nwaiting:\n" + byStatus.map(([k, v]) => `  ${v.status}  ${k}`).join("\n"));
}

async function addPlacement(name: string, p: Placement, sizeMB: number) {
  const m = readManifest();
  const rec = (m.videos[name] ??= { sizeMB: Math.round(sizeMB * 10) / 10, status: "placed", placements: [] });
  if (!rec.placements.some((x) => x.materialId === p.materialId)) rec.placements.push(p);
  rec.status = "placed";
  writeManifest(m);
}

async function cmdUpload() {
  const [file, catArg, ...titleParts] = args;
  const categoryId = Number(catArg);
  const title = titleParts.join(" ");
  if (!file || !categoryId || !title) throw new Error("usage: upload <file> <categoryId> <title>");
  const { schema, db } = await import("../src/db");
  const { driveUpload, driveUploadRest, driveUrlFor } = await import("../src/lib/driveBridgeCore");
  const { placeMaterial } = await import("../src/lib/driveTreeCore");
  const { and, eq } = await import("drizzle-orm");
  const { byId, pathOf } = await loadCats();
  if (!byId.has(categoryId)) throw new Error(`קטגוריה ${categoryId} לא קיימת`);
  const dup = await db.select({ id: schema.materials.id }).from(schema.materials).where(and(eq(schema.materials.categoryId, categoryId), eq(schema.materials.title, title)));
  if (dup.length) throw new Error(`כבר קיים חומר בשם הזה בקטגוריה: ${dup.map((d) => d.id).join(",")}`);

  const bytes = new Uint8Array(fs.readFileSync(file));
  const fileName = path.basename(file);
  const mime = /\.webm$/i.test(fileName) ? "video/webm" : /\.mov$/i.test(fileName) ? "video/quicktime" : /\.mkv$/i.test(fileName) ? "video/x-matroska" : /\.wmv$/i.test(fileName) ? "video/x-ms-wmv" : "video/mp4";
  console.log("uploading:", fileName, bytes.length, "bytes");
  // driveUpload שולח עד 25MB דרך גשר ה-GAS האיטי (שגיאת timeout בקבצים של ~20-25MB); לסרטונים תמיד ישירות ל-REST
  const { fileId, size } = bytes.length > 8 * 1024 * 1024 ? await driveUploadRest({ name: fileName, mimeType: mime, bytes }) : await driveUpload({ name: fileName, mimeType: mime, bytes });
  const [row] = await db.insert(schema.materials).values({
    categoryId, title, description: null, kind: "other", fileUrl: driveUrlFor(fileId), fileName, mime, size,
    price: 1500, minTier: "none", sort: 0, access: "paid", status: "draft", allowDownload: true, allowPreview: false,
  }).returning({ id: schema.materials.id });
  const placed = await placeMaterial(row.id);
  console.log("material", row.id, "draft | placed:", JSON.stringify(placed));
  const rel = path.relative(VIDEO_ROOT, path.resolve(file)).split(path.sep).join("/");
  await addPlacement(rel.startsWith("..") ? fileName : rel, { materialId: row.id, categoryId, path: pathOf(byId.get(categoryId)!).slice(1).join(" › "), title, at: new Date().toISOString().slice(0, 10) }, size / 1048576);
}

async function cmdRecord() {
  const [name, ...ids] = args;
  if (!name || !ids.length) throw new Error("usage: record <video name> <materialId> ...");
  const sql = neon(process.env.DATABASE_URL!);
  const { byId, pathOf } = await loadCats();
  for (const id of ids.map(Number)) {
    const [m] = (await sql`select id, category_id, title, size from materials where id = ${id}`) as { id: number; category_id: number; title: string; size: number }[];
    if (!m) throw new Error(`חומר ${id} לא נמצא`);
    await addPlacement(name, { materialId: m.id, categoryId: m.category_id, path: pathOf(byId.get(m.category_id)!).slice(1).join(" › "), title: m.title, at: new Date().toISOString().slice(0, 10) }, m.size / 1048576);
    console.log("recorded", name, "->", m.id);
  }
}

const commands: Record<string, () => unknown> = { index: cmdIndex, match: cmdMatch, status: cmdStatus, upload: cmdUpload, record: cmdRecord };
if (!cmd || !commands[cmd]) { console.log("commands:", Object.keys(commands).join(" | ")); process.exit(1); }
await commands[cmd]();
process.exit(0);
