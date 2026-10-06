import "dotenv/config"; import dotenv from "dotenv"; dotenv.config({ path: ".env.local" });
import { db } from "../src/db"; import { categories, materials } from "../src/db/schema";
import fs from "node:fs";
const OUT = "C:/Users/MOSHE/AppData/Local/Temp/claude/C--Users-MOSHE-Desktop------------------/65e638b4-c146-4a05-b64c-12aea7a88062/scratchpad/a1-site/";
(async () => {
  const cats = await db.select().from(categories);
  const mats = await db.select({ id: materials.id, categoryId: materials.categoryId, title: materials.title, kind: materials.kind, fileUrl: materials.fileUrl, fileName: materials.fileName, mime: materials.mime, size: materials.size, access: materials.access, status: materials.status, allowDownload: materials.allowDownload, allowPreview: materials.allowPreview, driveOriginalName: materials.driveOriginalName, createdAt: materials.createdAt, downloads: materials.downloads, price: materials.price }).from(materials);
  fs.writeFileSync(OUT + "categories.json", JSON.stringify(cats));
  fs.writeFileSync(OUT + "materials.json", JSON.stringify(mats));
  console.log("cats", cats.length, "mats", mats.length);
  process.exit(0);
})();
