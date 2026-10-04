import "dotenv/config";
import dotenv from "dotenv";
import fs from "node:fs";
dotenv.config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";
import { driveListFiles } from "../src/lib/driveBridgeCore";
(async () => {
  const sql = neon(process.env.DATABASE_URL!);
  const odd = await sql`select id, status, file_url from materials where file_url not like 'drive://%' and file_url not like '%vercel-storage.com%'`;
  console.log("non-drive/non-blob rows:", odd);
  const files = await driveListFiles();
  const rows = await sql`select id, file_url, file_name, category_id, status, created_at from materials where file_url like 'drive://%'`;
  const linked = new Set(rows.map((r: any) => r.file_url.slice(8)));
  const nameToLinked = new Map<string, any[]>();
  for (const f of files) if (linked.has(f.id)) nameToLinked.set(f.name, [...(nameToLinked.get(f.name) ?? []), f]);
  const orphans = files.filter((f) => !linked.has(f.id));
  let sameNameAsLinked = 0;
  const out: any[] = [];
  for (const o of orphans) {
    const twins = nameToLinked.get(o.name) ?? [];
    if (twins.length) sameNameAsLinked++;
    out.push({ id: o.id, name: o.name, size: o.size, modified: o.modifiedTime, twins: twins.map((t) => ({ id: t.id, size: t.size, modified: t.modifiedTime })) });
  }
  const bytes = orphans.reduce((a, f) => a + (f.size ?? 0), 0);
  console.log("drive files:", files.length, "orphans:", orphans.length, "orphan bytes:", bytes, "orphans w/ same-name linked twin:", sameNameAsLinked);
  const dates: Record<string, number> = {};
  for (const f of files) { const k = (f.modifiedTime ?? "").slice(0, 10); dates[k] = (dates[k] ?? 0) + 1; }
  console.log("files by modified date:", Object.entries(dates).sort().slice(-12));
  const sizes = files.map((f) => f.size ?? 0).sort((a, b) => b - a);
  console.log("largest 5:", sizes.slice(0, 5), "total:", sizes.reduce((a, b) => a + b, 0));
  const nameCount: Record<string, number> = {};
  for (const f of files) nameCount[f.name] = (nameCount[f.name] ?? 0) + 1;
  console.log("duplicate-name groups in Drive:", Object.values(nameCount).filter((n) => n > 1).length);
  fs.writeFileSync(process.argv[2], JSON.stringify({ orphans: out }, null, 1), "utf8");
})();
