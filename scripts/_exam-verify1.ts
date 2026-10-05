import "dotenv/config"; import dotenv from "dotenv"; dotenv.config({ path: ".env.local" });
import { db } from "../src/db"; import { materials } from "../src/db/schema"; import { inArray } from "drizzle-orm";
import { driveGet, ensureCategoryFolder } from "../src/lib/driveTreeCore"; import { driveIdFromUrl, driveDownload } from "../src/lib/driveBridgeCore";
(async () => {
  const rows = await db.select().from(materials).where(inArray(materials.id, [1938, 1939]));
  for (const r of rows) {
    const id = driveIdFromUrl(r.fileUrl)!; const d = await driveGet(id); const folder = await ensureCategoryFolder(r.categoryId);
    const bytes = await driveDownload(id);
    console.log(r.id, r.status, r.kind, r.title, "| drive name:", d?.name, "| inCatFolder:", d?.parents.includes(folder), "| size db/drive/dl:", r.size, d?.size, (bytes as any).length ?? (bytes as any).byteLength);
  }
  process.exit(0);
})();
