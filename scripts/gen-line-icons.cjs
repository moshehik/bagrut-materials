/**
 * מייצר את src/lib/line-icons.generated.ts: איורי הקו השחורים (שכפול למורה / לתלמידה) כנתיבי SVG (potrace).
 * למה: נטפרי חוסם כל תמונה (גם data URI), אבל SVG מוטמע בדף נטען כטקסט ועובר (נבדק ב-/netfree-test/icons.html, 2026-11-08).
 * שימוש בתוצאה: src/components/line-icon.tsx. הרצה (potrace לא מותקן בפרויקט): npm i potrace --no-save && node scripts/gen-line-icons.cjs
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const potrace = require("potrace");

const root = path.join(__dirname, "..");
const NAMES = ["teacher", "student"];
// איורי הכותרת הלבנים של כרטיסיות (art4/*.webp, צורה לבנה על שקוף) – נתיב לפי ערוץ השקיפות; המפתח "card-<שם>"
const CARD_ART = ["presentation"];
const trace = (buf, opts) => new Promise((res, rej) => potrace.trace(buf, opts, (e, s) => (e ? rej(e) : res(s))));

(async () => {
  const out = {};
  for (const n of NAMES) {
    let img = await sharp(path.join(root, "public/images/lesson-icons-v2", n + ".png"))
      .flatten({ background: "#ffffff" })
      .resize({ width: 420 })
      .toBuffer();
    // שארית טקסט חתוכה בתחתית האיור של המורה – חותכים
    if (n === "teacher") img = await sharp(img).extract({ left: 0, top: 0, width: 420, height: 396 }).toBuffer();
    const raw = await sharp(img).grayscale().png().toBuffer();
    const svg = await trace(raw, { threshold: 170, turdSize: 10, optTolerance: 1.0, blackOnWhite: true });
    const vb = svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
    const d = [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]).join(" ");
    out[n] = { w: vb[2], h: vb[3], d };
    console.log(n, vb.join("x"), "path bytes", d.length);
  }
  for (const n of CARD_ART) {
    const alpha = await sharp(path.join(root, "public/images/mat-cards/art4", n + ".webp")).resize({ width: 320 }).ensureAlpha().extractChannel(3).toBuffer();
    // שקוף = לבן, אטום = שחור – potrace מצייר את השחור
    const raw = await sharp(alpha).negate().png().toBuffer();
    const svg = await trace(raw, { threshold: 160, turdSize: 8, optTolerance: 1.0, blackOnWhite: true });
    const vb = svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
    const d = [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]).join(" ");
    out["card-" + n] = { w: vb[2], h: vb[3], d };
    console.log("card-" + n, vb.join("x"), "path bytes", d.length);
  }
  fs.writeFileSync(
    path.join(root, "src/lib/line-icons.generated.ts"),
    "// קובץ שנוצר אוטומטית ע״י scripts/gen-line-icons.cjs — לא לערוך ידנית.\n" +
      `export const LINE_ICONS: Record<string, { w: number; h: number; d: string }> = ${JSON.stringify(out)};\n`,
  );
})();
