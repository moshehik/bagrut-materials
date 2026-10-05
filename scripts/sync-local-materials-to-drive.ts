/**
 * מסנכרן את החומר הגמור המקומי ("חומרים מוכנים מחדש/") אל עץ הדרייב של האתר — ומשם לאתר (שורות materials בסטטוס draft).
 * נכתב 2026-10-05 אחרי שנמצא שכ-1,300 קבצי docx מקומיים לא קיימים בדרייב או שונים מהעותק שבו.
 *
 * לכל קובץ docx מקומי (בלי גיבויי BEFORE/SUPERSEDED וקבצי עבודה):
 *   1. הקטגוריה נקבעת לפי הנתיב (scripts/local-category-resolver.cjs — נבדק מול ייבוא 14.9: 0 שגיאות).
 *   2. מחפשים בתיקיית הדרייב של הקטגוריה קובץ באותו שם:
 *        אין            → "new":     מעלים לתיקייה + שורת materials (draft) דרך adoptFiles
 *        זהה (md5)      → "same":    לא נוגעים
 *        שונה, המקומי חדש מהגרסה האחרונה בדרייב (revisions) → "replace": גיבוי של גרסת הדרייב + החלפת תוכן באותו fileId
 *        שונה, הדרייב חדש/שווה → "drive-newer": לא נוגעים (מדווח לבדיקה ידנית)
 *   3. קבצי "שאלות מבגרויות"/"תשובות לשאלות מבגרויות" מדולגים כברירת מחדל (מועלים ע"י scripts/_upload-exam-files.ts) — --include-exam לכלול.
 * אחרי ההרצה: npx tsx scripts/drive-sync.ts (dry-run) לאימות שאין שינויי DB נוספים.
 *
 *   npx tsx scripts/sync-local-materials-to-drive.ts --plan            → כותב תוכנית (לא משנה כלום)
 *   npx tsx scripts/sync-local-materials-to-drive.ts --apply           → מבצע (בודק שוב מצב חי לפני כל פעולה)
 *   אפשרויות: --only <חלק מנתיב> · --limit N · --include-exam · --no-replace (רק קבצים חדשים)
 * לעולם לא מוחק. החלפה שומרת גיבוי מקומי של גרסת הדרייב + גרסה קודמת נשארת בהיסטוריית הגרסאות של Drive.
 */
import "dotenv/config";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import JSZip from "jszip";
dotenv.config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { auditLogs, categories, materials } from "../src/db/schema";
import { adoptFiles, cleanName, cmpName, type SyncAudit } from "../src/lib/driveSyncCore";
import { FOLDER_MIME, driveApi, ensureCategoryFolder, loadCategories, logDriveEvent, mapPool, withFolderLock } from "../src/lib/driveTreeCore";
import { getRootFolderId } from "../src/lib/driveBridgeCore";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const makeResolver = require("./local-category-resolver.cjs") as (cats: unknown[]) => { resolve: (rel: string) => { cat?: number; why?: string; path?: string } };

const ROOT = path.resolve("חומרים מוכנים מחדש");
const DATE = "2026-10-05";
const PLAN = path.join(ROOT, "_ייבוא-לאתר", `תוכנית-סנכרון-${DATE}.json`);
const LOG = path.join(ROOT, "_ייבוא-לאתר", `יומן-סנכרון-${DATE}.json`);
const BACKUP = path.join(ROOT, `_גיבוי-דרייב-לפני-עדכון-${DATE}`);
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const PLAN_ONLY = args.includes("--plan");
const INCLUDE_EXAM = args.includes("--include-exam");
const NO_REPLACE = args.includes("--no-replace");
const arg = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const ONLY = arg("only");
const LIMIT = arg("limit") ? Number(arg("limit")) : Infinity;

const audit: SyncAudit = async (a) => {
  try {
    await db.insert(auditLogs).values({ actorId: null, action: a.action, entityType: a.entityType ?? null, entityId: a.entityId ?? null, details: a.details === undefined ? null : JSON.stringify(a.details), ip: null });
  } catch (e) {
    console.error("[audit] failed", e instanceof Error ? e.message : e);
  }
};

const SKIP_DIR = /^_|גיבוי|backup|scratch|bank1|bank2|quiz_ref|micha-vav|^הוראות|^מאגר שאלות/i;
const BAD_FILE = /BEFORE|backup|גיבוי|מבוטל|SUPERSEDED|STALE|WRONG|\.[A-Z]{3,}-|^~\$|\.docx\.|^\.tmp/;
const EXAM = /^(שאלות מבגרויות|תשובות לשאלות מבגרויות) - /;

function walk(dir: string, rel: string, out: string[]) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) {
      if (SKIP_DIR.test(e.name)) continue;
      walk(path.join(dir, e.name), r, out);
    } else if (/\.docx$/i.test(e.name) && !BAD_FILE.test(e.name)) out.push(r);
  }
}

type DItem = { id: string; name: string; size: number | null; md5: string | null; modified: string | null };
async function listFolder(folderId: string): Promise<DItem[]> {
  const out: DItem[] = [];
  let pt: string | undefined;
  do {
    const params = new URLSearchParams({ q: `'${folderId}' in parents and trashed = false and mimeType != '${FOLDER_MIME}'`, fields: "nextPageToken,files(id,name,size,md5Checksum,modifiedTime)", pageSize: "1000", ...(pt ? { pageToken: pt } : {}) });
    const r = await driveApi(`${API}?${params}`);
    if (!r.ok) throw new Error(`list ${r.status}`);
    const j = (await r.json()) as { files?: { id: string; name: string; size?: string; md5Checksum?: string; modifiedTime?: string }[]; nextPageToken?: string };
    for (const f of j.files ?? []) out.push({ id: f.id, name: f.name, size: f.size ? Number(f.size) : null, md5: f.md5Checksum ?? null, modified: f.modifiedTime ?? null });
    pt = j.nextPageToken;
  } while (pt);
  return out;
}

/** זמן העדכון האחרון של *התוכן* (revisions — לא מושפע משינויי מטא-דאטה כמו שינוי שם/העברה). */
async function lastContentRevision(fileId: string): Promise<string | null> {
  const r = await driveApi(`${API}/${encodeURIComponent(fileId)}/revisions?fields=revisions(id,modifiedTime)&pageSize=200`);
  if (!r.ok) return null;
  const j = (await r.json()) as { revisions?: { modifiedTime?: string }[] };
  const t = (j.revisions ?? []).map((x) => x.modifiedTime ?? "").sort().pop();
  return t || null;
}

async function download(fileId: string): Promise<Buffer> {
  const r = await driveApi(`${API}/${encodeURIComponent(fileId)}?alt=media`);
  if (!r.ok) throw new Error(`download ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

async function uploadNew(folderId: string, name: string, bytes: Buffer): Promise<string> {
  const boundary = `up-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const meta = JSON.stringify({ name, mimeType: DOCX, parents: [folderId] });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${DOCX}\r\n\r\n`, "utf-8"),
    bytes,
    Buffer.from(`\r\n--${boundary}--`, "utf-8"),
  ]);
  const r = await driveApi(`${UPLOAD}?uploadType=multipart&fields=id`, { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body }, 3);
  if (!r.ok) throw new Error(`upload ${r.status} ${(await r.text()).slice(0, 150)}`);
  return ((await r.json()) as { id: string }).id;
}

async function replaceContent(fileId: string, bytes: Buffer) {
  const r = await driveApi(`${UPLOAD}/${encodeURIComponent(fileId)}?uploadType=media&fields=id,size,md5Checksum`, { method: "PATCH", headers: { "Content-Type": DOCX }, body: bytes }, 3);
  if (!r.ok) throw new Error(`replace ${r.status} ${(await r.text()).slice(0, 150)}`);
  return (await r.json()) as { id: string; size?: string; md5Checksum?: string };
}

const norm = (s: string) => cleanName(s).normalize("NFC").replace(/\s*\(#\d+\)\s*(?=\.[^.]+$|$)/, "");
const md5 = (b: Buffer) => crypto.createHash("md5").update(b).digest("hex");

type Row = { rel: string; cat?: number; catPath?: string; action: string; why?: string; driveId?: string; localMtime: string; driveRev?: string | null; folderId?: string };

async function buildPlan(): Promise<Row[]> {
  const { all, byId } = await loadCategories();
  const pathOf = (id: number) => { const o: string[] = []; let c = byId.get(id); while (c) { o.unshift(c.title); c = c.parentId ? byId.get(c.parentId) : undefined; } return o; };
  const resolver = makeResolver(all.map((c) => ({ id: c.id, parent: c.parentId, title: c.title, path: pathOf(c.id) })));
  const files: string[] = [];
  walk(ROOT, "", files);
  let sel = files.filter((r) => (INCLUDE_EXAM || !EXAM.test(path.basename(r))) && (!ONLY || r.includes(ONLY)));
  console.log(`נמצאו ${files.length} קבצי docx מקומיים; בטיפול ${sel.length}`);
  const rows: Row[] = [];
  const byCat = new Map<number, string[]>();
  for (const rel of sel) {
    const res = resolver.resolve(rel);
    const mt = fs.statSync(path.join(ROOT, rel)).mtime.toISOString();
    if (!res.cat) { rows.push({ rel, action: "unresolved", why: res.why, localMtime: mt }); continue; }
    rows.push({ rel, cat: res.cat, catPath: pathOf(res.cat).join(" > "), action: "?", localMtime: mt });
    byCat.set(res.cat, [...(byCat.get(res.cat) ?? []), rel]);
  }
  const listing = new Map<number, DItem[]>();
  await mapPool([...byCat.keys()], 6, async (cid) => {
    const c = byId.get(cid)!;
    const fid = c.driveFolderId ?? (APPLY ? await ensureCategoryFolder(cid) : null);
    listing.set(cid, fid ? await listFolder(fid) : []);
  });
  // כשכמה קבצים מקומיים (עותקים מקבילים בתיקיות שונות) ממופים לאותה קטגוריה ואותו שם — הגרסה העדכנית ביותר מנצחת
  rows.sort((a, b) => b.localMtime.localeCompare(a.localMtime));
  const seen = new Map<string, string>();
  for (const row of rows) {
    if (row.action === "unresolved") continue;
    const c = byId.get(row.cat!)!;
    row.folderId = c.driveFolderId ?? undefined;
    const name = norm(path.basename(row.rel));
    const key = `${row.cat}|${name}`;
    if (seen.has(key)) { row.action = "dup-in-plan"; row.why = `עותק מקביל ישן יותר — נבחרה הגרסה העדכנית: ${seen.get(key)}`; continue; }
    seen.set(key, row.rel);
    const matches = (listing.get(row.cat!) ?? []).filter((d) => cmpName(norm(d.name)) === cmpName(name));
    if (!matches.length) { row.action = "new"; continue; }
    if (matches.length > 1) { row.action = "ambiguous"; row.why = `${matches.length} קבצים באותו שם בתיקייה`; continue; }
    const d = matches[0];
    row.driveId = d.id;
    const bytes = fs.readFileSync(path.join(ROOT, row.rel));
    if (d.md5 && d.md5 === md5(bytes)) { row.action = "same"; continue; }
    row.driveRev = await lastContentRevision(d.id);
    row.action = !row.driveRev || new Date(row.localMtime).getTime() > new Date(row.driveRev).getTime() + 60_000 ? "replace" : "drive-newer";
    if (!row.driveRev) row.why = "אין revisions — מניחים שהמקומי חדש";
  }
  return rows;
}

function summarize(rows: Row[]) {
  const s: Record<string, number> = {};
  for (const r of rows) s[r.action] = (s[r.action] ?? 0) + 1;
  return s;
}

async function main() {
  console.log(APPLY ? "== APPLY ==" : "== PLAN ==");
  const rows = await buildPlan();
  fs.writeFileSync(PLAN, JSON.stringify(rows, null, 1), "utf8");
  console.log("תוכנית:", JSON.stringify(summarize(rows)), "→", path.relative(process.cwd(), PLAN));
  if (!APPLY || PLAN_ONLY) return;

  const log: Record<string, unknown>[] = fs.existsSync(LOG) ? JSON.parse(fs.readFileSync(LOG, "utf8")) : [];
  const save = () => fs.writeFileSync(LOG, JSON.stringify(log, null, 1), "utf8");
  const { byId } = await loadCategories();
  const todo = rows.filter((r) => r.action === "new" || (r.action === "replace" && !NO_REPLACE)).slice(0, LIMIT);
  console.log(`מבצע ${todo.length} פעולות (${todo.filter((r) => r.action === "new").length} חדשים, ${todo.filter((r) => r.action === "replace").length} החלפות)`);
  let done = 0;
  await getRootFolderId();
  const { errors } = await mapPool(todo, 4, async (row) => {
    const abs = path.join(ROOT, row.rel);
    const name = cleanName(path.basename(row.rel));
    const bytes = fs.readFileSync(abs);
    const folderId = await ensureCategoryFolder(row.cat!);
    // הנעילה מכסה רק בדיקה+העלאה. adoptFiles→placeMaterial לוקח את אותה נעילה (withFolderLock) — לקרוא לו מתוכה = deadlock.
    let adoptId: string | null = null;
    await withFolderLock(folderId, async () => {
      const cur = (await listFolder(folderId)).filter((d) => cmpName(norm(d.name)) === cmpName(norm(name)));
      if (row.action === "new") {
        if (cur.length) { log.push({ rel: row.rel, result: "skipped-appeared", driveId: cur[0].id }); return; }
        adoptId = await uploadNew(folderId, name, bytes);
      } else {
        if (cur.length !== 1) { log.push({ rel: row.rel, result: "skipped-ambiguous", n: cur.length }); return; }
        const d = cur[0];
        if (d.md5 === md5(bytes)) { log.push({ rel: row.rel, result: "skipped-same" }); return; }
        const rev = await lastContentRevision(d.id);
        if (rev && new Date(fs.statSync(abs).mtime).getTime() <= new Date(rev).getTime() + 60_000) { log.push({ rel: row.rel, result: "skipped-drive-newer", rev }); return; }
        const old = await download(d.id);
        const bk = path.join(BACKUP, row.rel);
        fs.mkdirSync(path.dirname(bk), { recursive: true });
        fs.writeFileSync(bk, old);
        const up = await replaceContent(d.id, bytes);
        const [m] = await db.select({ id: materials.id }).from(materials).where(eq(materials.fileUrl, `drive://${d.id}`));
        if (m) {
          await db.update(materials).set({ size: Number(up.size ?? bytes.length) }).where(eq(materials.id, m.id));
          await logDriveEvent({ kind: "file.content-update", materialId: m.id, categoryId: row.cat!, driveId: d.id, oldValue: String(d.size ?? ""), newValue: String(up.size ?? ""), details: { via: "local-sync-2026-10-05", backup: path.relative(process.cwd(), bk) } });
          await audit({ action: "material.content_update", entityType: "material", entityId: m.id, details: { via: "local-sync-2026-10-05", driveId: d.id } });
        }
        log.push({ rel: row.rel, result: "replaced", driveId: d.id, materialId: m?.id, backup: path.relative(process.cwd(), bk) });
      }
    });
    if (adoptId) {
      const fid: string = adoptId;
      const r = await adoptFiles([fid], row.cat!, { actorId: null, via: "local-sync-2026-10-05", audit });
      log.push({ rel: row.rel, result: r[0]?.error ? "uploaded-adopt-failed" : "new", driveId: fid, materialId: r[0]?.materialId, cat: row.cat, error: r[0]?.error });
    }
    done++;
    if (done % 25 === 0) { save(); console.log(`  ${done}/${todo.length}`); }
  });
  save();
  for (const e of errors) { log.push({ rel: e.item.rel, result: "error", error: e.error }); console.error(" ✖", e.item.rel, e.error); }
  save();
  const sum: Record<string, number> = {};
  for (const l of log) sum[String(l.result)] = (sum[String(l.result)] ?? 0) + 1;
  console.log("סיכום יומן:", JSON.stringify(sum));
  await audit({ action: "drive.local_sync", entityType: "drive", details: sum });
  void categories;
}

main().then(() => process.exit(0)).catch((e) => { console.error("FAILED:", e instanceof Error ? e.stack : e); process.exit(1); });
