/**
 * מייצר את src/lib/inline-images.generated.ts: בתי המקצועות ואייקוני השיעור כ-WebP בקידוד base64 (data URI).
 *
 * למה: מסנן התוכן (אתרוג) מחליף קובצי תמונה רגילים מסוימים בריבוע ריק / מטושטש, אבל תמונת WebP שמוטמעת בתוך
 * ה-HTML עוברת (נבדק ב-/img-test.html, 2026-11-01). המודול מיובא רק מקומפוננטות שרת (server-only).
 *
 * הרצה אחרי הוספה / שינוי של תמונה בתיקיות public/images/houses או public/images/lesson-icons-v2:
 *   node scripts/gen-inline-images.cjs
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.join(__dirname, "..");
const HOUSES = path.join(root, "public/images/houses");
const ICONS = path.join(root, "public/images/lesson-icons-v2");
const OUT = path.join(root, "src/lib/inline-images.generated.ts");

// רק התמונות שהמסנן חוסם בפועל (נבדק אצל המורה, 2026-11-01) — כדי לא לנפח את ה-HTML. שאר התמונות נשארות קבצים רגילים.
// אם מסנן חוסם עוד תמונות — מוסיפים לכאן ומריצים את הסקריפט מחדש.
const HOUSE_FILES = ["house-yahadut.png", "house-lashon-tachbir.png", "house-lashon-tzurot.png", "house-dinim.png", "house-ezrachut.png", "house-minhal.png", "house-sicha.png", "house-chevra.png", "house-kishurei-chaim.png"];
const ICON_NAMES = ["enrichment"];

async function toDataUri(file, { resize, ...opts }) {
  let img = sharp(fs.readFileSync(file));
  if (resize) img = img.resize({ width: resize, withoutEnlargement: true });
  const buf = await img.webp(opts).toBuffer();
  return `data:image/webp;base64,${buf.toString("base64")}`;
}

(async () => {
  const houses = {};
  for (const f of HOUSE_FILES) {
    houses[f] = await toDataUri(path.join(HOUSES, f), { quality: 74, resize: 320 });
  }
  const icons = {};
  for (const f of ICON_NAMES.map((n) => n + ".png")) {
    icons[f.replace(/\.png$/, "")] = await toDataUri(path.join(ICONS, f), { quality: 92, alphaQuality: 100 });
  }
  const body =
    "// קובץ שנוצר אוטומטית ע״י scripts/gen-inline-images.cjs — לא לערוך ידנית.\n" +
    `export const INLINE_HOUSES: Record<string, string> = ${JSON.stringify(houses)};\n` +
    `export const INLINE_LESSON_ICONS: Record<string, string> = ${JSON.stringify(icons)};\n`;
  fs.writeFileSync(OUT, body, "utf8");
  const kb = (n) => Math.round(n / 1024);
  console.log(`houses: ${Object.keys(houses).length}, icons: ${Object.keys(icons).length}, file: ${kb(fs.statSync(OUT).size)}KB`);
})();
