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
const ICON_NAMES = ["student", "teacher", "quiz", "quiz-answers", "exam", "exam-answers", "dictation", "discussions", "enrichment", "skills", "prep", "presentation"];

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
    icons[f.replace(/\.png$/, "")] = await toDataUri(path.join(ICONS, f), { quality: 92, alphaQuality: 100, resize: 240 });
  }
  // תמונות הממשק של כרטיסיות החומרים (דמויות הכותרת, שמות הסוגים, אגוזי הורדה/צפייה/מייל) — גם הן נחסמות כקבצים רגילים
  const ui = {};
  const IMG = path.join(root, 'public/images');
  const uiFiles = [];
  for (const f of fs.readdirSync(path.join(IMG, 'mat-cards/art4'))) uiFiles.push('mat-cards/art4/' + f);
  for (const f of fs.readdirSync(path.join(IMG, 'mat-cards'))) if (/^(label-.*|nut-download.*)\.webp$/.test(f)) uiFiles.push('mat-cards/' + f);
  for (const f of fs.readdirSync(path.join(IMG, 'nuts'))) if (f.endsWith('.webp')) uiFiles.push('nuts/' + f);
  for (const f of fs.readdirSync(path.join(IMG, 'plan-nuts'))) uiFiles.push('plan-nuts/' + f);
  for (const rel of uiFiles) {
    const file = path.join(IMG, rel);
    if (rel.endsWith('.svg')) ui[rel] = 'data:image/svg+xml;base64,' + fs.readFileSync(file).toString('base64');
    else ui[rel] = await toDataUri(file, { quality: 82, alphaQuality: 100, resize: rel.startsWith('mat-cards/art4') ? 160 : rel.includes('label-') ? 500 : rel.includes('light') ? 120 : 200 });
  }
  const body =
    "// קובץ שנוצר אוטומטית ע״י scripts/gen-inline-images.cjs — לא לערוך ידנית.\n" +
    `export const INLINE_HOUSES: Record<string, string> = ${JSON.stringify(houses)};\n` +
    `export const INLINE_LESSON_ICONS: Record<string, string> = ${JSON.stringify(icons)};\n` +
    `export const INLINE_UI: Record<string, string> = ${JSON.stringify(ui)};\n`;
  fs.writeFileSync(OUT, body, "utf8");
  const kb = (n) => Math.round(n / 1024);
  console.log(`houses: ${Object.keys(houses).length}, icons: ${Object.keys(icons).length}, file: ${kb(fs.statSync(OUT).size)}KB`);
})();
