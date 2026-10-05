import "dotenv/config"; import dotenv from "dotenv"; dotenv.config({ path: ".env.local" });
import { db } from "../src/db"; import { materials } from "../src/db/schema";
(async () => {
  const rows = await db.select().from(materials);
  const hit = rows.filter((r) => /בגרו|מבגרויות/.test(r.fileName + r.title) && /פרק/.test(r.fileName));
  console.log("rows with בגרו in name:", hit.length);
  for (const r of hit.slice(0, 40)) console.log(r.id, r.categoryId, r.status, r.fileName, r.fileUrl.slice(0, 22));
  const mal = rows.filter((r) => r.categoryId === 582);
  console.log("malachi cat 582:", mal.map((r) => `${r.id}:${r.status}:${r.fileName}`).join(" | "));
  const stat: Record<string, number> = {}; for (const r of rows) stat[r.status] = (stat[r.status] || 0) + 1; console.log(stat);
  process.exit(0);
})();
