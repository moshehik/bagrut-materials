/**
 * מייצר את שני קובצי הנתונים של "מגן נטפרי" (src/components/netfree-image-guard.tsx):
 *   src/lib/netfree-dims.generated.ts  – מידות וגודל-קובץ המקור של כל תמונה ("/images/..." → [רוחב, גובה, בתים]); קטן, נטען תמיד.
 *   src/lib/netfree-data.generated.ts  – אותן תמונות כ-WebP בקידוד base64 (data URI); גדול, נטען בדפדפן רק אם נמצאה תמונה שנטפרי החליף.
 *
 * למה ככה (ולא data URI בתוך ה-HTML): מסנן התוכן (אתרוג/נטפרי) סורק גם תמונות מוטמעות ב-HTML ומשבש חלק מהן – והעתק
 * של אותה מחרוזת נמצא גם בנתוני ה-RSC שבתוך העמוד, ושם השיבוש שבר את ה-JSON והדף קרס בטעינה ישירה (React #412 /
 * "enqueueModel is not a function", 2026-11-07). לכן ה-HTML מכיל רק נתיב קובץ רגיל; אם אחרי הטעינה התברר
 * שהדפדפן קיבל תמונה במידות אחרות מהמקור (תחליף של נטפרי) – הקוד מחליף את ה-src ב-data URI שנוצר בדפדפן עצמו.
 *
 * הרצה אחרי הוספה / שינוי של תמונה:   node scripts/gen-netfree-images.cjs
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.join(__dirname, "..");
const IMG = path.join(root, "public/images");

/** [תיקייה/קובץ יחסי, רוחב מוקטן, איכות] */
const specs = [];
const addDir = (dir, re, w, q) => {
  for (const f of fs.readdirSync(path.join(IMG, dir))) if (re.test(f)) specs.push([`${dir}/${f}`, w, q]);
};
addDir("houses", /\.png$/, 320, 74);
addDir("lesson-icons-v2", /\.png$/, 240, 92);
addDir("mat-cards/art4", /\.(webp|svg)$/, 160, 82);
addDir("mat-cards", /^(label-.*|nut-download.*)\.webp$/, 500, 88);
addDir("nuts", /\.webp$/, 200, 85);
addDir("plan-nuts", /\.png$/, 200, 85);
specs.push(["logo-white.png", 300, 85], ["logo-black.png", 480, 85], ["logo.png", 320, 85]);

(async () => {
  const dims = {};
  const data = {};
  let bytes = 0;
  for (const [rel, w, q] of specs) {
    const file = path.join(IMG, rel);
    const key = `/images/${rel}`;
    if (rel.endsWith(".svg")) {
      data[key] = "data:image/svg+xml;base64," + fs.readFileSync(file).toString("base64");
      continue; // בלי מידות – מגן הנטפרי לא בודק SVG (קבצים זעירים, אין תחליף מוכר)
    }
    const meta = await sharp(file).metadata();
    dims[key] = [meta.width, meta.height, fs.statSync(file).size];
    const buf = await sharp(file).resize({ width: w, withoutEnlargement: true }).webp({ quality: q, alphaQuality: 100 }).toBuffer();
    data[key] = `data:image/webp;base64,${buf.toString("base64")}`;
    bytes += buf.length;
  }
  const head = "// קובץ שנוצר אוטומטית ע״י scripts/gen-netfree-images.cjs — לא לערוך ידנית.\n";
  fs.writeFileSync(path.join(root, "src/lib/netfree-dims.generated.ts"), head + `export const NF_DIMS: Record<string, [number, number, number]> = ${JSON.stringify(dims)};\n`);
  fs.writeFileSync(path.join(root, "src/lib/netfree-data.generated.ts"), head + `export const NF_DATA: Record<string, string> = ${JSON.stringify(data)};\n`);
  console.log(`images: ${specs.length}, data ≈ ${Math.round(bytes / 1024)}KB`);
})();
