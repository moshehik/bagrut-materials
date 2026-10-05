import "dotenv/config"; import dotenv from "dotenv"; dotenv.config({ path: ".env.local" });
import fs from "node:fs";
import { db } from "../src/db"; import { materials } from "../src/db/schema"; import { inArray } from "drizzle-orm";
import { driveGet, ensureCategoryFolder, mapPool } from "../src/lib/driveTreeCore"; import { driveIdFromUrl } from "../src/lib/driveBridgeCore";
(async () => {
  const log = JSON.parse(fs.readFileSync("_exam_work/upload_log.json", "utf8")).filter((l: any) => l.ok);
  const ids: number[] = [...new Set<number>(log.map((l: any) => l.materialId))];
  const rows = await db.select().from(materials).where(inArray(materials.id, ids));
  console.log("logged", log.length, "unique ids", ids.length, "rows in DB", rows.length);
  const bad: string[] = []; const stat: Record<string, number> = {};
  const folderCache = new Map<number, string>();
  await mapPool(rows, 6, async (r) => {
    stat[r.status] = (stat[r.status] || 0) + 1;
    const fid = driveIdFromUrl(r.fileUrl)!;
    const d = await driveGet(fid);
    if (!folderCache.has(r.categoryId)) folderCache.set(r.categoryId, await ensureCategoryFolder(r.categoryId));
    const ok = !!d && d.parents.length === 1 && d.parents[0] === folderCache.get(r.categoryId) && d.size === r.size && d.name === r.fileName;
    if (!ok) bad.push(`${r.id} ${r.fileName} drive=${d?.name} parents=${d?.parents.length} size ${r.size}/${d?.size}`);
  });
  console.log("status", JSON.stringify(stat), "problems", bad.length); bad.slice(0, 10).forEach((b) => console.log(" ", b));
  const dupKey = new Map<string, number>(); for (const r of rows) { const k = r.categoryId + "|" + r.fileName; dupKey.set(k, (dupKey.get(k) || 0) + 1); }
  console.log("duplicate (category,fileName):", [...dupKey.values()].filter((v) => v > 1).length);
  process.exit(0);
})();
