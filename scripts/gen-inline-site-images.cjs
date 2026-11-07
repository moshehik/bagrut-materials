/**
 * מייצר את src/lib/inline-site-images.generated.ts (+ את src/lib/inline-site-logo.generated.ts — לוגו קטן שמותר גם בקומפוננטות לקוח):
 * תמונות אתר סטטיות (לוגואים, תמונות דף הבית, אגוזי כרטיסי התיקיות) כ-WebP בקידוד base64 (data URI).
 *
 * למה: מסנן התוכן (אתרוג) מחליף קובצי תמונה רגילים מסוימים בריבוע ריק / מטושטש, אבל תמונה שמוטמעת בתוך ה-HTML עוברת.
 * התמונות מוקטנות לכ-2× הגודל המוצג כדי לא לנפח את ה-HTML. דפוס זהה ל-scripts/gen-inline-images.cjs.
 *
 * הרצה אחרי הוספה / שינוי של תמונה ברשימה:   node scripts/gen-inline-site-images.cjs
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.join(__dirname, "..");
const IMG = path.join(root, "public/images");
const OUT = path.join(root, "src/lib/inline-site-images.generated.ts");
const OUT_LOGO = path.join(root, "src/lib/inline-site-logo.generated.ts");

// [נתיב יחסי ל-public/images, רוחב מוקטן, איכות, שם גרסה (אופציונלי: מפתח "path@variant")]
const SPECS = [
  // לוגואים (מקור 1491×871, ~600KB כל אחד)
  ["logo-white.png", 300, 80],            // פוטר (192px), פורומים (176px)
  ["logo-white.png", 210, 85, "sm"],      // כותרת האתר (82px), כותרת חלון העריכה (104px)
  ["logo-black.png", 480, 85],            // דפי חשבון / תשלום / הרשמה / מסלולים (עד 256px)
  ["logo-black.png", 300, 85, "sm"],       // קופונים (144px), עמוד "אין תוכן" (240px)
  ["logo.png", 320, 85],                  // לוגו צבעוני בדפי כניסה
  ["logo.png", 440, 70, "home"],          // לוגו הסיום בדף הבית (עד 460px)
  // דף הבית
  ["kind-blob-1.png", 260, 70],
  ["kind-blob-2.png", 260, 70],
  ["kind-blob-3.png", 260, 70],
  ["kind-blob-4.png", 260, 70],
  ["marker-1.png", 240, 75],
  ["marker-2.png", 240, 75],
  ["marker-3.png", 240, 75],
  ["luz-house-only.png", 420, 65],
  ["snow-mountain.webp", 520, 45],
  ["hero-pen-draw.webp", 160, 80],
  ["hero-intro-noclockhands.webp", 1200, 72],
  ["step-circle-1.png", 220, 78],
  ["step-circle-2.png", 220, 78],
  ["step-circle-3.png", 220, 78],
  ["check-brush.png", 224, 90],
];
// אגוזי כרטיסי התיקיות (nut-images.ts) — נבחרים לפי מקצוע+עומק
const NUT_KINDS = { one: 10, two: 7, many: 16 };
for (const [kind, n] of Object.entries(NUT_KINDS)) {
  for (let i = 1; i <= n; i++) SPECS.push([`nuts/${kind}-${String(i).padStart(2, "0")}.webp`, 200, 85]);
}

async function toDataUri(file, w, q) {
  const buf = await sharp(fs.readFileSync(file))
    .resize({ width: w, withoutEnlargement: true })
    .webp({ quality: q, alphaQuality: 100 })
    .toBuffer();
  return { uri: `data:image/webp;base64,${buf.toString("base64")}`, bytes: buf.length };
}

(async () => {
  const map = {};
  const sizes = [];
  for (const [rel, w, q, variant] of SPECS) {
    const key = variant ? `${rel}@${variant}` : rel;
    const { uri, bytes } = await toDataUri(path.join(IMG, rel), w, q);
    map[key] = uri;
    sizes.push([key, bytes]);
  }
  const body =
    "// קובץ שנוצר אוטומטית ע״י scripts/gen-inline-site-images.cjs — לא לערוך ידנית.\n" +
    `export const INLINE_SITE: Record<string, string> = ${JSON.stringify(map)};\n`;
  fs.writeFileSync(OUT, body, "utf8");
  // הלוגו הלבן הקטן — קובץ נפרד בלי server-only, כדי שהכותרת וחלון העריכה (קומפוננטות לקוח) יוכלו להשתמש בו
  fs.writeFileSync(
    OUT_LOGO,
    "// קובץ שנוצר אוטומטית ע״י scripts/gen-inline-site-images.cjs — לא לערוך ידנית.\n" +
      `export const LOGO_WHITE_SM = ${JSON.stringify(map["logo-white.png@sm"])};\n`,
    "utf8",
  );
  const kb = (n) => (n / 1024).toFixed(1);
  for (const [k, b] of sizes) console.log(k.padEnd(40), kb(b), "KB (base64 ~", kb(b * 1.37), ")");
  console.log("file:", kb(fs.statSync(OUT).size), "KB");
})();
