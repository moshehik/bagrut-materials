import "dotenv/config"; import dotenv from "dotenv"; dotenv.config({ path: ".env.local" });
import { db } from "../src/db"; import { categories } from "../src/db/schema";
(async () => {
  const cats = await db.select().from(categories);
  const by = new Map(cats.map((c) => [c.id, c]));
  const depth = (c: any) => { let d = 0; let x = c; while (x.parentId) { d++; x = by.get(x.parentId)!; } return d; };
  const path = (c: any) => { const o: string[] = []; let x = c; while (x) { o.unshift(x.title); x = x.parentId ? by.get(x.parentId) : undefined; } return o.join(" > "); };
  for (const c of cats) { if (depth(c) <= 3) console.log(c.id, depth(c), path(c)); }
  process.exit(0);
})();
