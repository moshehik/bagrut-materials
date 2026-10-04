/**
 * ביקורת קריאה-בלבד: מצליב את תוכן תיקיית הארכיון בדרייב מול טבלת materials.
 * לא כותב כלום (לא לדרייב ולא ל-DB). פלט JSON + סיכום לקונסול.
 * הרצה: npx tsx scripts/_drive-audit.ts <outFile.json>
 */
import "dotenv/config";
import dotenv from "dotenv";
import fs from "node:fs";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../src/db/schema";
import { driveListChildren, getRootFolderId, driveIdFromUrl } from "../src/lib/driveBridgeCore";

dotenv.config({ path: ".env.local" });

async function main() {
  const out = process.argv[2] || "drive-audit.json";
  const db = drizzle(neon(process.env.DATABASE_URL!), { schema });
  const { materials, categories } = schema;

  const rootId = await getRootFolderId();
  const children = await driveListChildren(rootId);
  const folders = children.filter((c) => c.mimeType === "application/vnd.google-apps.folder");
  const driveFiles = children.filter((c) => c.mimeType !== "application/vnd.google-apps.folder");

  const cats = await db.select().from(categories);
  const catById = new Map(cats.map((c) => [c.id, c]));
  const pathOf = (id: number) => {
    const parts: string[] = [];
    let cur = catById.get(id);
    let guard = 0;
    while (cur && guard++ < 20) {
      parts.unshift(cur.title);
      cur = cur.parentId ? catById.get(cur.parentId) : undefined;
    }
    return parts.join(" / ");
  };

  const rows = await db.select().from(materials);
  const driveIds = new Set(driveFiles.map((f) => f.id));
  const referenced = new Set<string>();

  const dbRows = rows.map((m) => {
    const id = driveIdFromUrl(m.fileUrl);
    if (id) referenced.add(id);
    let storage: "drive-ok" | "drive-missing" | "dead-blob" | "other";
    if (id) storage = driveIds.has(id) ? "drive-ok" : "drive-missing";
    else if (/vercel-storage\.com/.test(m.fileUrl)) storage = "dead-blob";
    else storage = "other";
    return {
      id: m.id,
      categoryId: m.categoryId,
      categoryPath: pathOf(m.categoryId),
      title: m.title,
      kind: m.kind,
      status: m.status,
      access: m.access,
      fileName: m.fileName,
      size: m.size,
      driveId: id,
      storage,
      createdAt: m.createdAt,
    };
  });

  const orphans = driveFiles.filter((f) => !referenced.has(f.id));
  // כפילויות: אותו driveId בכמה שורות
  const byDrive = new Map<string, number[]>();
  for (const r of dbRows) if (r.driveId) byDrive.set(r.driveId, [...(byDrive.get(r.driveId) ?? []), r.id]);
  const sharedDriveIds = [...byDrive.entries()].filter(([, v]) => v.length > 1);

  const count = <T,>(arr: T[], key: (t: T) => string) => {
    const o: Record<string, number> = {};
    for (const a of arr) o[key(a)] = (o[key(a)] ?? 0) + 1;
    return o;
  };

  const summary = {
    rootId,
    driveFolders: folders,
    driveFileCount: driveFiles.length,
    driveBytes: driveFiles.length ? await sumSizes(rootId) : 0,
    dbRowCount: rows.length,
    byStorage: count(dbRows, (r) => r.storage),
    byStatus: count(dbRows, (r) => r.status),
    byStatusAndStorage: count(dbRows, (r) => `${r.status}/${r.storage}`),
    orphanCount: orphans.length,
    sharedDriveIds: sharedDriveIds.length,
    categoriesTotal: cats.length,
    categoriesWithMaterials: new Set(rows.map((r) => r.categoryId)).size,
  };

  fs.writeFileSync(out, JSON.stringify({ summary, orphans, sharedDriveIds, dbRows, driveFiles }, null, 2), "utf8");
  console.log(JSON.stringify(summary, null, 2));
}

async function sumSizes(rootId: string) {
  // size לא מוחזר ב-driveListChildren — משתמשים ב-driveListFiles (אותו root)
  const { driveListFiles } = await import("../src/lib/driveBridgeCore");
  void rootId;
  const f = await driveListFiles();
  return f.reduce((a, x) => a + (x.size ?? 0), 0);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
