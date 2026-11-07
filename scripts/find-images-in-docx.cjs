/**
 * סורק את כל קובצי ה-docx ב"חומרים מוכנים מחדש" ומוצא אילו מהם מכילים תמונות בגוף המסמך (לא בכותרת/תחתית –
 * לוגו הכותרת מוחלף בשרת). תמונות בתוך PDF מוחלפות ע"י נטפרי ב"התמונה לא נבדקה", ולכן צריך לדעת איפה הן.
 *
 * הרצה:  node scripts/find-images-in-docx.cjs [תת-תיקייה, למשל "ראה"]
 * פלט: סיכום בקונסול + _images-in-lessons-report.json (מתעלם ע"י git) עם כל קובץ, מספר התמונות, שמות הקבצים וגדלים.
 */
const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");

const ROOT = path.join(__dirname, "..", "חומרים מוכנים מחדש");
const FILTER = process.argv[2] || "";
const OUT = path.join(__dirname, "..", "_images-in-lessons-report.json");

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const f = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (/^(_|\.)/.test(e.name) || /מטמון|BACKUP|גיבוי/i.test(e.name)) continue;
      yield* walk(f);
    } else if (/\.docx$/i.test(e.name) && !/^~\$/.test(e.name) && !/BACKUP|BEFORE|\.bak/i.test(e.name)) {
      yield f;
    }
  }
}

(async () => {
  const rows = [];
  let scanned = 0;
  for (const file of walk(ROOT)) {
    if (FILTER && !file.includes(FILTER)) continue;
    scanned++;
    let zip;
    try {
      zip = await JSZip.loadAsync(fs.readFileSync(file));
    } catch {
      continue;
    }
    const doc = zip.file("word/document.xml");
    const rels = zip.file("word/_rels/document.xml.rels");
    if (!doc || !rels) continue;
    const xml = await doc.async("string");
    const relXml = await rels.async("string");
    const media = {};
    for (const m of relXml.matchAll(/<Relationship\b[^>]*>/g)) {
      const id = (m[0].match(/\bId="([^"]+)"/) || [])[1];
      const target = (m[0].match(/\bTarget="([^"]+)"/) || [])[1];
      const type = (m[0].match(/\bType="([^"]+)"/) || [])[1] || "";
      if (id && target && /\/image$/.test(type)) media[id] = target;
    }
    // תמונות שבפועל מוצבות בגוף: r:embed / r:id בתוך a:blip / v:imagedata
    const used = new Set();
    for (const m of xml.matchAll(/<a:blip\b[^>]*\br:embed="([^"]+)"/g)) used.add(m[1]);
    for (const m of xml.matchAll(/<v:imagedata\b[^>]*\br:id="([^"]+)"/g)) used.add(m[1]);
    const items = [];
    for (const id of used) {
      const target = media[id];
      if (!target) continue;
      const entry = zip.file("word/" + target.replace(/^\.?\//, "")) || zip.file(target.replace(/^\//, ""));
      let bytes = 0;
      if (entry) bytes = (await entry.async("nodebuffer")).length;
      items.push({ id, target, bytes });
    }
    if (items.length === 0) continue;
    rows.push({ file: path.relative(ROOT, file), images: items.length, totalBytes: items.reduce((a, b) => a + b.bytes, 0), items });
  }
  rows.sort((a, b) => b.images - a.images);
  fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));
  console.log(`נסרקו ${scanned} קבצים; ${rows.length} מכילים תמונות בגוף.`);
  const byFolder = {};
  for (const r of rows) {
    const parts = r.file.split(path.sep);
    const key = parts.slice(0, Math.min(parts.length - 1, 5)).join(" / ");
    byFolder[key] = (byFolder[key] || 0) + 1;
  }
  console.log("\nלפי תיקייה (עד 5 רמות):");
  for (const [k, v] of Object.entries(byFolder).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(String(v).padStart(4), k);
  console.log("\n10 הקבצים עם הכי הרבה תמונות:");
  for (const r of rows.slice(0, 10)) console.log(String(r.images).padStart(3), "תמונות |", Math.round(r.totalBytes / 1024) + "KB |", r.file);
  console.log("\nדוח מלא:", OUT);
})();
