/**
 * מייצר את src/lib/colour-svgs.generated.ts: איורי האגוזים והאיורים הצבעוניים הקטנים של הממשק כצורות צבע שטוחות (SVG).
 * למה: נטפרי חוסם כל תמונה (גם data URI), אבל SVG מוטמע בדף (<path>) נטען כטקסט ועובר (נבדק 2026-11-08, docs/netfree.md).
 * שיטה: k-means על הפיקסלים האטומים (רקע שקוף נשאר שקוף) → לכל צבע מסכה → potrace → שכבות <path> בסדר שטח יורד
 * (שכבת בסיס = כל הצללית בצבע הכהה, והמסכות מורחבות במעט כדי שלא יישארו חריצים בין צורות).
 * שימוש בתוצאה: src/components/colour-svg.tsx. הרצה (potrace לא מותקן בפרויקט — מצביעים אליו ב-NODE_PATH, או npm i potrace --no-save):
 *   node scripts/gen-colour-svgs.cjs            — כל התמונות
 *   node scripts/gen-colour-svgs.cjs nuts/many  — רק תמונות שהנתיב שלהן מכיל את הטקסט (לבדיקה; לא כותב את קובץ ה-ts)
 *   PREVIEW=<תיקייה> node ...                   — שומר גם PNG להשוואה (מקור | SVG על רקע בהיר | SVG על רקע כהה)
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const potrace = require("potrace");

const root = path.join(__dirname, "..");
const PUB = path.join(root, "public");
const trace = (buf, opts) => new Promise((res, rej) => potrace.trace(buf, opts, (e, s) => (e ? rej(e) : res(s))));

/** קבוצות: תיקייה, סיומות, מספר צבעים, רוחב מרבי של העקיבה, תקציב נתיב (בתים) */
const GROUPS = [
  { dir: "images/nuts", k: 10, w: 140, budget: 16000, median: 3, modeR: 1 },
  // גרסאות קטנות (מפתח "…@s") לאגוזים שמוצגים עד ~80px: כפתורי כרטיסיות, אגוז כרטיס תיקייה/פרק — פי ~2-3 פחות נתונים
  { dir: "images/nuts", suffix: "@s", k: 8, w: 80, budget: 6500, median: 3, modeR: 1 },
  { dir: "images/mat-cards", suffix: "@s", only: ["nut-download.webp", "nut-download-light.webp"], k: 6, w: 64, budget: 4000, median: 3, modeR: 1 },
  { dir: "images/mat-cards", only: ["nut-download.webp", "nut-download-light.webp"], k: 8, w: 110, budget: 9000, median: 3, modeR: 1 },
  { dir: "images/plan-nuts", k: 10, w: 170, budget: 16000, median: 3, modeR: 1 },
  { dir: "images/houses", k: 14, w: 320, budget: 25000, median: 5, modeR: 1 },
  // גרסה קטנה של הבתים (מפתח "…png@s") לתצוגה ברוחב ~64px ברשימות בחירה — פי ~4 פחות בתים
  // סמל Microsoft Edge בהודעת ההורדה של מצגת (נטפרי חוסם תמונות – מוטמע כ-SVG)
  { dir: "images", only: ["edge-logo.png"], k: 10, w: 200, budget: 14000, median: 1, modeR: 1 },
  { dir: "images/houses", suffix: "@s", k: 9, w: 110, budget: 5500, median: 3, modeR: 1 },
];

if (process.env.K) for (const g of GROUPS) { g.k = +process.env.K; if (process.env.W) g.w = +process.env.W; if (process.env.MR) g.modeR = +process.env.MR; if (process.env.MP) g.modePasses = +process.env.MP; if (process.env.MED) g.median = +process.env.MED; if (process.env.BUD) g.budget = +process.env.BUD; }
const hex = (c) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

/** קיצור מחרוזת הנתיב של potrace: עיגול לספרה אחת אחרי הנקודה, בלי אפסים מיותרים */
function compactPath(d, dec) {
  const P = Math.pow(10, dec);
  return d
    .replace(/-?\d+\.\d+/g, (m) => {
      let s = (Math.round(parseFloat(m) * P) / P).toString();
      if (s.startsWith("0.")) s = s.slice(1);
      else if (s.startsWith("-0.")) s = "-" + s.slice(2);
      return s;
    })
    .replace(/, /g, " ")
    .replace(/ ?([MLCZ]) ?/g, "$1")
    .replace(/ -/g, "-");
}

async function vectorise(file, g) {
  const meta = await sharp(file).metadata();
  const scale = Math.min(g.w / meta.width, g.maxUp ?? 2);
  const W = Math.round(meta.width * scale);
  const H = Math.round(meta.height * scale);
  const { data } = await sharp(file).ensureAlpha().resize(W, H, { kernel: "lanczos3" }).median(g.median ?? 3).raw().toBuffer({ resolveWithObject: true });
  const n = W * H;
  const opaque = new Uint8Array(n);
  let nOpaque = 0;
  for (let i = 0; i < n; i++) if (data[i * 4 + 3] >= 128) { opaque[i] = 1; nOpaque++; }
  const px = (i) => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]];
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

  // אתחול farthest-point על דגימה של פיקסלים אטומים (כדי שצבע דומיננטי אחד לא ייקח את כל המרכזים)
  const sample = [];
  for (let i = 0; i < n; i += 5) if (opaque[i]) sample.push(px(i));
  // מתחילים מהצבע הממוצע-כהה ביותר: הקו החיצוני הכהה חייב לקבל מרכז משלו
  let centers = [sample.reduce((a, b) => (a[0] + a[1] + a[2] < b[0] + b[1] + b[2] ? a : b))];
  while (centers.length < g.k) {
    let best = null, bd = -1;
    for (const p of sample) {
      let m = 1e9;
      for (const c of centers) m = Math.min(m, d2(p, c));
      if (m > bd) { bd = m; best = p; }
    }
    centers.push(best);
  }
  const assign = new Int16Array(n).fill(-1);
  for (let it = 0; it < 14; it++) {
    const sum = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) {
      if (!opaque[i]) continue;
      const p = px(i);
      let best = 0, bd = 1e9;
      for (let c = 0; c < centers.length; c++) { const d = d2(p, centers[c]); if (d < bd) { bd = d; best = c; } }
      assign[i] = best;
      sum[best][0] += p[0]; sum[best][1] += p[1]; sum[best][2] += p[2]; sum[best][3]++;
    }
    centers = centers.map((c, i) => (sum[i][3] ? [sum[i][0] / sum[i][3], sum[i][1] / sum[i][3], sum[i][2] / sum[i][3]] : c));
  }
  // החלקת התוויות: פילטר רוב (רדיוס modeR) (מסיר כתמים קטנים שמנפחים את הנתיב)
  for (let pass = 0; pass < (g.modePasses ?? 1); pass++) {
    const next = Int16Array.from(assign);
    const votes = new Int32Array(centers.length);
    const R = g.modeR ?? 1;
    for (let y = R; y < H - R; y++) for (let x = R; x < W - R; x++) {
      const i = y * W + x;
      if (!opaque[i]) continue;
      votes.fill(0);
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const a = assign[i + dy * W + dx]; if (a >= 0) votes[a]++; }
      let best = assign[i], bv = votes[best];
      for (let c = 0; c < votes.length; c++) if (votes[c] > bv) { bv = votes[c]; best = c; }
      next[i] = best;
    }
    assign.set(next);
  }
  const counts = centers.map(() => 0);
  for (let i = 0; i < n; i++) if (assign[i] >= 0) counts[assign[i]]++;

  const maskPng = async (mask, grow) => {
    // mask: Uint8Array 0/1 → שחור על לבן; grow>0 מרחיב ב~grow פיקסלים (טשטוש + סף נמוך)
    const buf = Buffer.alloc(n);
    for (let i = 0; i < n; i++) buf[i] = mask[i] ? 0 : 255;
    let s = sharp(buf, { raw: { width: W, height: H, channels: 1 } });
    if (grow > 0) s = s.blur(grow * 1.2).threshold(230); // כהה < 230 → שחור: מתרחב החוצה
    return s.png().toBuffer();
  };
  const growMask = async (mask, grow) => {
    const { data: o, info } = await sharp(await maskPng(mask, grow)).raw().toBuffer({ resolveWithObject: true });
    const ch = info.channels;
    const r = new Uint8Array(n);
    for (let i = 0; i < n; i++) r[i] = o[i * ch] < 128 ? 1 : 0;
    return r;
  };
  const run = async (mask, grow, turd, opt) => {
    const svg = await trace(await maskPng(mask, grow), { threshold: 128, turdSize: turd, optTolerance: opt, alphaMax: 1.1, blackOnWhite: true });
    return compactPath([...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]).join(" "), g.dec ?? 0);
  };

  // סדר שכבות: שטח יורד (פרטים קטנים מצוירים אחרונים); כל מסכה מורחבת מעט וחתוכה לצללית – בלי חריצים בין צורות
  const order = centers.map((_, i) => i).filter((i) => counts[i] > Math.max(12, nOpaque * 0.002)).sort((a, b) => counts[b] - counts[a]);
  const mean = [0, 0, 0];
  for (let i = 0; i < n; i++) if (opaque[i]) { mean[0] += data[i * 4]; mean[1] += data[i * 4 + 1]; mean[2] += data[i * 4 + 2]; }
  for (let k = 0; k < 3; k++) mean[k] /= nOpaque;
  let turd = 6, opt = 1.0, layers;
  for (let attempt = 0; attempt < 6; attempt++) {
    layers = [{ fill: hex(mean), d: await run(opaque, 0, 12, opt) }];
    for (const c of order) {
      const mask = new Uint8Array(n);
      for (let i = 0; i < n; i++) if (assign[i] === c) mask[i] = 1;
      const grown = await growMask(mask, 0.7);
      for (let i = 0; i < n; i++) mask[i] = grown[i] && opaque[i] ? 1 : 0;
      const d = await run(mask, 0, turd, opt);
      if (d) layers.push({ fill: hex(centers[c]), d });
    }
    const bytes = layers.reduce((a, l) => a + l.d.length, 0);
    if (bytes <= g.budget) break;
    turd = Math.round(turd * 1.8 + 2);
    opt = Math.min(opt * 1.6, 3);
  }
  return { w: W, h: H, layers, turd, opt, srcW: meta.width, srcH: meta.height };
}

async function preview(file, svgData, outFile) {
  const { w, h, layers } = svgData;
  const body = layers.map((l) => `<path fill="${l.fill}" fill-rule="evenodd" d="${l.d}"/>`).join("");
  const svgBuf = (bg) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w * 2}" height="${h * 2}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${bg}"/>${body}</svg>`);
  const orig = await sharp(file).resize(w * 2, h * 2).flatten({ background: "#ffffff" }).png().toBuffer();
  const light = await sharp(svgBuf("#fff8e1")).png().toBuffer();
  const dark = await sharp(svgBuf("#12233f")).png().toBuffer();
  await sharp({ create: { width: w * 6 + 40, height: h * 2, channels: 3, background: "#888" } })
    .composite([{ input: orig, left: 0, top: 0 }, { input: light, left: w * 2 + 20, top: 0 }, { input: dark, left: w * 4 + 40, top: 0 }])
    .png().toFile(outFile);
}

(async () => {
  const filter = process.argv[2];
  const previewDir = process.env.PREVIEW;
  if (previewDir) fs.mkdirSync(previewDir, { recursive: true });
  const out = {};
  let total = 0;
  for (const g of GROUPS) {
    if (process.env.ONLY_SUFFIX && !g.suffix) continue;
    const dirAbs = path.join(PUB, g.dir);
    for (const f of fs.readdirSync(dirAbs).sort()) {
      if (!/\.(webp|png)$/.test(f)) continue;
      if (g.only && !g.only.includes(f)) continue;
      const key = "/" + g.dir + "/" + f + (g.suffix || "");
      if (filter && !key.includes(filter)) continue;
      const file = path.join(dirAbs, f);
      const r = await vectorise(file, g);
      const bytes = r.layers.reduce((a, l) => a + l.d.length, 0);
      total += bytes;
      out[key] = { w: r.w, h: r.h, layers: r.layers };
      console.log(r.layers.map(l=>l.d.length+":"+(l.d.match(/M/g)||[]).length).join(" "));console.log(key.padEnd(40), `${r.w}x${r.h}`, "layers", r.layers.length, "bytes", bytes, `turd=${r.turd} opt=${r.opt.toFixed(2)}`);
      if (previewDir) await preview(file, r, path.join(previewDir, key.slice(1).replace(/[\\/]/g, "_") + ".png"));
    }
  }
  console.log("TOTAL path bytes", total, "images", Object.keys(out).length);
  if (!filter || process.env.WRITE) {
    if (filter) {
      // מיזוג לקובץ הקיים (הרצה חלקית): מחליפים רק את המפתחות שנוצרו עכשיו
      const prev = fs.readFileSync(path.join(root, "src/lib/colour-svgs.generated.ts"), "utf8");
      const old = JSON.parse(prev.slice(prev.indexOf("= {", prev.indexOf("COLOUR_SVGS")) + 2, prev.lastIndexOf("};") + 1));
      Object.assign(old, out);
      for (const k of Object.keys(out)) delete out[k];
      Object.assign(out, old);
    }
    fs.writeFileSync(
      path.join(root, "src/lib/colour-svgs.generated.ts"),
      "// קובץ שנוצר אוטומטית ע״י scripts/gen-colour-svgs.cjs — לא לערוך ידנית.\n" +
        "export type ColourSvgData = { w: number; h: number; layers: { fill: string; d: string }[] };\n" +
        `export const COLOUR_SVGS: Record<string, ColourSvgData> = ${JSON.stringify(out)};\n`,
    );
  }
})();
