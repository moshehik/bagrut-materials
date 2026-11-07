/**
 * מייצר את src/lib/pdf-logo.generated.ts: שני לוגואים כנתיבים וקטוריים בצבעים שטוחים, כמחרוזת אופרטורים של PDF
 * בריבוע יחידה (0..1, y למעלה):
 *   PDF_LOGO_*        – לוגו הכותרת הצבעוני של דפי Word (word/media/logoLozHainyan.png) על רקע לבן;
 *   PDF_LOGO_WHITE_*  – הלוגו הלבן (public/images/logo-white.png) של כותרת המצגות, על רקע כהה, בלי רקע (שקוף).
 * למה: נטפרי מחליף כל תמונה בתוך PDF ב"התמונה לא נבדקה", אבל נתיבים וקטוריים עוברים (נבדק 2026-11-08).
 * הרצה (potrace מותקן כ-devDependency):  node scripts/gen-pdf-logo.cjs [נתיב ל-logoLozHainyan.png]
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const potrace = require("potrace");

const COLOR_SRC = process.argv[2] || path.join(__dirname, "..", "public", "images", "logo.png");
const WHITE_SRC = path.join(__dirname, "..", "public", "images", "logo-white.png");
const DECK_BG = [41, 26, 15]; // צבע פס הכותרת של המצגות
const trace = (buf, opts) => new Promise((res, rej) => potrace.trace(buf, opts, (e, s) => (e ? rej(e) : res(s))));
const f3 = (v) => (Math.round(v * 1000) / 1000).toString();

/** k-means (farthest-point init) על התמונה, potrace לכל צבע; bg = צבע הרקע שמשטחים עליו (ומדלגים עליו) */
async function build(src, bg, K, W) {
  const meta = await sharp(src).metadata();
  const H = Math.round((W * meta.height) / meta.width);
  const { data } = await sharp(src).flatten({ background: { r: bg[0], g: bg[1], b: bg[2] } }).resize({ width: W, height: H }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = W * H;
  const px = (i) => [data[i * 3], data[i * 3 + 1], data[i * 3 + 2]];
  const sample = [];
  for (let i = 0; i < n; i += 7) sample.push(px(i));
  let centers = [bg];
  while (centers.length < K) {
    let best = null, bd = -1;
    for (const p of sample) {
      let m = 1e9;
      for (const c of centers) m = Math.min(m, (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2);
      if (m > bd) { bd = m; best = p; }
    }
    centers.push(best);
  }
  const assign = new Uint8Array(n);
  for (let it = 0; it < 12; it++) {
    const sum = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) {
      const p = px(i);
      let b = 0, bd = 1e9;
      for (let c = 0; c < centers.length; c++) {
        const d = (p[0] - centers[c][0]) ** 2 + (p[1] - centers[c][1]) ** 2 + (p[2] - centers[c][2]) ** 2;
        if (d < bd) { bd = d; b = c; }
      }
      assign[i] = b;
      sum[b][0] += p[0]; sum[b][1] += p[1]; sum[b][2] += p[2]; sum[b][3]++;
    }
    centers = centers.map((c, i) => (sum[i][3] ? [sum[i][0] / sum[i][3], sum[i][1] / sum[i][3], sum[i][2] / sum[i][3]] : c));
    centers[0] = bg; // הרקע נשאר כמו שהוא
  }
  let ops = "";
  for (let c = 1; c < centers.length; c++) {
    const mask = Buffer.alloc(n);
    let cnt = 0;
    for (let i = 0; i < n; i++) { if (assign[i] === c) { mask[i] = 0; cnt++; } else mask[i] = 255; }
    if (cnt < 40) continue;
    const png = await sharp(mask, { raw: { width: W, height: H, channels: 1 } }).png().toBuffer();
    const svg = await trace(png, { threshold: 128, turdSize: 8, optTolerance: 1.0, blackOnWhite: true });
    const d = [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]).join(" ");
    const tok = d.match(/[MLCZmlcz]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
    let k = 0, cmd = "", body = "";
    const num = () => parseFloat(tok[k++]);
    const X = (x) => f3(x / W), Y = (y) => f3(1 - y / H);
    while (k < tok.length) {
      if (/[MLCZmlcz]/.test(tok[k])) cmd = tok[k++];
      if (cmd === "M") { body += `${X(num())} ${Y(num())} m `; cmd = "L"; }
      else if (cmd === "L") { body += `${X(num())} ${Y(num())} l `; }
      else if (cmd === "C") { const a = [num(), num(), num(), num(), num(), num()]; body += `${X(a[0])} ${Y(a[1])} ${X(a[2])} ${Y(a[3])} ${X(a[4])} ${Y(a[5])} c `; }
      else if (cmd === "Z" || cmd === "z") { body += "h "; }
      else throw new Error("cmd " + cmd);
    }
    ops += `${centers[c].map((v) => f3(v / 255)).join(" ")} rg ${body}f*\n`;
  }
  return { aspect: meta.width / meta.height, ops };
}

(async () => {
  const color = await build(COLOR_SRC, [255, 255, 255], 11, 760);
  const white = await build(WHITE_SRC, DECK_BG, 9, 520);
  console.log("color ops bytes", color.ops.length, "white ops bytes", white.ops.length);
  fs.writeFileSync(
    path.join(__dirname, "..", "src/lib/pdf-logo.generated.ts"),
    "// קובץ שנוצר אוטומטית ע״י scripts/gen-pdf-logo.cjs — לא לערוך ידנית.\n" +
      `export const PDF_LOGO_ASPECT = ${color.aspect.toFixed(4)};\n` +
      `export const PDF_LOGO_OPS = ${JSON.stringify(color.ops)};\n` +
      `export const PDF_LOGO_WHITE_ASPECT = ${white.aspect.toFixed(4)};\n` +
      `export const PDF_LOGO_WHITE_OPS = ${JSON.stringify(white.ops)};\n`,
  );
})();
