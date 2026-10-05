/**
 * אימות (קריאה בלבד) אחרי scripts/sync-local-materials-to-drive.ts:
 * לכל קובץ מקומי שהיה בתוכנית כ-new/replace/same — בודק שבדרייב (בתיקיית הקטגוריה) יש קובץ בשם הזה עם אותו md5,
 * ושקיימת שורת materials המצביעה עליו, בקטגוריה הנכונה. כותב דוח JSON + מדפיס סיכום.
 * בנוסף מפיק קובץ זוגות (קובץ ↔ קטגוריה ↔ כותרת בתוך ה-docx) לבדיקה סמנטית ע"י סוכני QA.
 *   npx tsx scripts/verify-local-drive-sync.ts
 */
import "dotenv/config";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import JSZip from "jszip";
dotenv.config({ path: ".env.local" });

import { db } from "../src/db";
import { materials } from "../src/db/schema";
import { cleanName, cmpName } from "../src/lib/driveSyncCore";
import { FOLDER_MIME, driveApi, loadCategories, mapPool } from "../src/lib/driveTreeCore";
import { driveIdFromUrl } from "../src/lib/driveBridgeCore";

const ROOT = path.resolve("חומרים מוכנים מחדש");
const IMP = path.join(ROOT, "_ייבוא-לאתר");
const DATE = "2026-10-05";
const API = "https://www.googleapis.com/drive/v3/files";
const norm = (s: string) => cleanName(s).normalize("NFC").replace(/\s*\(#\d+\)\s*(?=\.[^.]+$|$)/, "");
const md5 = (b: Buffer) => crypto.createHash("md5").update(b).digest("hex");

async function docTitle(abs: string): Promise<string> {
  try {
    const z = await JSZip.loadAsync(fs.readFileSync(abs));
    const x = await z.file("word/document.xml")!.async("string");
    return x.replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim().slice(0, 260);
  } catch {
    return "";
  }
}

async function main() {
  // תוכנית מלאה (--plan מחדש לא נדרש): ריצת התוכנית האחרונה נשמרה ב-תוכנית-סנכרון; אם נכתבה חלקית — מחשבים מחדש מהיומן+דיסק
  const plan: { rel: string; cat?: number; action: string }[] = JSON.parse(fs.readFileSync(path.join(IMP, `תוכנית-סנכרון-${DATE}.json`), "utf8"));
  const rows = plan.filter((r) => ["new", "replace", "same"].includes(r.action) && r.cat);
  const { byId } = await loadCategories();
  const pathOf = (id: number) => { const o: string[] = []; let c = byId.get(id); while (c) { o.unshift(c.title); c = c.parentId ? byId.get(c.parentId) : undefined; } return o.join(" > "); };
  const mats = await db.select({ id: materials.id, categoryId: materials.categoryId, fileUrl: materials.fileUrl, fileName: materials.fileName, status: materials.status }).from(materials);
  const byDrive = new Map(mats.map((m) => [driveIdFromUrl(m.fileUrl) ?? "", m]));
  const folderCache = new Map<number, { id: string; name: string; md5Checksum?: string }[]>();
  const cats = [...new Set(rows.map((r) => r.cat!))];
  await mapPool(cats, 6, async (cid) => {
    const fid = byId.get(cid)?.driveFolderId;
    if (!fid) return;
    const out: { id: string; name: string; md5Checksum?: string }[] = [];
    let pt: string | undefined;
    do {
      const params = new URLSearchParams({ q: `'${fid}' in parents and trashed = false and mimeType != '${FOLDER_MIME}'`, fields: "nextPageToken,files(id,name,md5Checksum)", pageSize: "1000", ...(pt ? { pageToken: pt } : {}) });
      const j = (await (await driveApi(`${API}?${params}`)).json()) as { files?: typeof out; nextPageToken?: string };
      out.push(...(j.files ?? []));
      pt = j.nextPageToken;
    } while (pt);
    folderCache.set(cid, out);
  });
  const res: Record<string, { rel: string; problem?: string; materialId?: number; catPath: string }[]> = { ok: [], problem: [] };
  const pairs: { rel: string; materialId?: number; catPath: string; title: string }[] = [];
  for (const r of rows) {
    const abs = path.join(ROOT, r.rel);
    const name = norm(path.basename(r.rel));
    const local = md5(fs.readFileSync(abs));
    const cands = (folderCache.get(r.cat!) ?? []).filter((d) => cmpName(norm(d.name)) === cmpName(name));
    let problem: string | undefined;
    const d = cands.find((x) => x.md5Checksum === local) ?? cands[0];
    if (!d) problem = "לא נמצא בדרייב בתיקיית הקטגוריה";
    else if (d.md5Checksum !== local) problem = "קיים בדרייב אבל תוכן שונה מהמקומי";
    const m = d ? byDrive.get(d.id) : undefined;
    if (!problem && !m) problem = "אין שורת materials לקובץ";
    if (!problem && m && m.categoryId !== r.cat) problem = `שורת materials בקטגוריה אחרת (#${m.categoryId})`;
    const entry = { rel: r.rel, problem, materialId: m?.id, catPath: pathOf(r.cat!) };
    (problem ? res.problem : res.ok).push(entry);
    if (r.action !== "same") pairs.push({ rel: r.rel, materialId: m?.id, catPath: entry.catPath, title: await docTitle(abs) });
  }
  fs.writeFileSync(path.join(IMP, `אימות-סנכרון-${DATE}.json`), JSON.stringify(res, null, 1));
  fs.writeFileSync(path.join(IMP, `זוגות-QA-${DATE}.json`), JSON.stringify(pairs, null, 1));
  console.log(`נבדקו ${rows.length}: תקין ${res.ok.length}, בעיות ${res.problem.length}; זוגות ל-QA סמנטי: ${pairs.length}`);
  const g: Record<string, number> = {};
  for (const p of res.problem) g[p.problem!] = (g[p.problem!] ?? 0) + 1;
  console.log(g);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
