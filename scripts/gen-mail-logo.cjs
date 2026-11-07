/**
 * מייצר את src/lib/mail-logo.generated.ts: לוגו האתר (בית + שעון + אגוזים + הכיתוב "לו״ז העניין" והסלוגן) כטבלת HTML אחת של
 * תאים צבעוניים (פיקסל-ארט, תא = 1px), להצגה בגוף מייל. למה: בלקוחות מייל אי אפשר SVG מוטבע (ג'ימייל מסיר), ותמונות מוחלפות/מטושטשות
 * בנטפרי; טבלה צבעונית היא HTML רגיל שעובד בכל לקוח וגם בנטפרי. מגבלת ג'ימייל: ~102KB למייל כולו (מעבר לזה הוא נחתך) – לכן המשקל חשוב.
 *
 * שיטה (גרסת 2026-11-08, הרבה יותר קל ובאיכות גבוהה יותר מהקודמת):
 *   1. חיתוך הדוק לתוכן (בלי שוליים לבנים) – יותר פירוט לאותו מספר תאים;
 *   2. פלטת צבעים נפרדת לכל אזור (אגוזים / בית / כיתוב) ב-Lab (median-cut + k-means), לבן = בלי bgcolor;
 *   3. ניקוי רכיבי רעש קטנים (1-8 תאים) ו"סבילות" בגידול מלבנים – מיזוג תאים שמוסיף שגיאת צבע קטנה בלבד, בלי לגעת בקווים הדקים;
 *   4. פירוק לצבעים-רציפים במלבנים (colspan+rowspan) בשיטה חמדנית גלובלית: תמיד המלבן הגדול ביותר שנשאר;
 *   5. טבלה אחת (שורת מידות אחת במקום ארבע), בלי מרכאות ובלי תגי סגירה (אופציונליים ב-HTML).
 * הרצה: node scripts/gen-mail-logo.cjs [נתיב ללוגו] [--preset=std|mid|hi] [--out=נתיב]   (ברירת מחדל: mid, מקור public/images/logo.png)
 *   std ≈ 60KB, mid ≈ 69KB, hi ≈ 78KB (ללוגו בלבד).
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const PRESETS = {
  std: { zones: [
    { name: "text", K: 5, cleanThr: [30, 24, 18], growSlack: 5 },
    { name: "nuts", K: 14, cleanThr: [40, 34, 28, 24, 20, 16, 12, 10], growSlack: 8, whiteGrow: 10 },
    { name: "house", K: 4, cleanThr: [35, 28, 22, 16], growSlack: 9, whiteGrow: 14 } ] },
  mid: { zones: [
    { name: "text", K: 5, cleanThr: [25, 20], growSlack: 4 },
    { name: "nuts", K: 20, cleanThr: [30, 25, 20, 16, 12], growSlack: 4, whiteGrow: 8 },
    { name: "house", K: 4, cleanThr: [25, 20, 16], growSlack: 6, whiteGrow: 12 } ] },
  hi: { zones: [
    { name: "text", K: 6, cleanThr: [25], growSlack: 3 },
    { name: "nuts", K: 24, cleanThr: [25, 20, 16], growSlack: 3, whiteGrow: 8 },
    { name: "house", K: 5, cleanThr: [25, 20], growSlack: 4, whiteGrow: 8 } ] },
};
const BASE = { init: "mc", whiteTol: 4 };
const CROP = { x0: 0.068, x1: 0.855, y0: 0.098, y1: 0.924 }; // חיתוך הדוק לתוכן הלוגו (1920x1080)
const WIDTH_PX = 280;

// ---------- colour helpers ----------
function srgb2lin(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
function rgb2lab(r, g, b) {
  const R = srgb2lin(r), G = srgb2lin(g), B = srgb2lin(b);
  let x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  let y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  let z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  x = f(x); y = f(y); z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
function lab2rgb(L, a, b) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const finv = (t) => (t * t * t > 0.008856 ? t * t * t : (t - 16 / 116) / 7.787);
  const X = finv(fx) * 0.95047, Y = finv(fy), Z = finv(fz) * 1.08883;
  let R = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
  let G = -0.969266 * X + 1.8760108 * Y + 0.041556 * Z;
  let B = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
  const g = (c) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055);
  return [g(R), g(G), g(B)].map((v) => Math.max(0, Math.min(255, Math.round(v))));
}
const d2 = (p, q) => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
const hex6 = (c) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
function hexShort(c) {
  // #rgb when each channel is a multiple of 17
  if (c.every((v) => v % 17 === 0)) return "#" + c.map((v) => (v / 17).toString(16)).join("");
  return hex6(c);
}
const WHITE_LAB = rgb2lab(255, 255, 255);

// ---------- target ----------
async function buildTarget(SRC, { x0, x1, y0, y1, W, S = 3, thin = 0.65, thinThr = 18 }) {
  const meta = await sharp(SRC).metadata();
  const crop = { left: Math.round(meta.width * x0), top: Math.round(meta.height * y0), width: Math.round(meta.width * (x1 - x0)), height: Math.round(meta.height * (y1 - y0)) };
  const H = Math.round((W * crop.height) / crop.width);
  const big = await sharp(SRC).flatten({ background: "#ffffff" }).extract(crop).resize({ width: W * S, height: H * S, fit: "fill", kernel: "lanczos3" }).removeAlpha().raw().toBuffer();
  const rgb = new Float32Array(W * H * 3);
  const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let sr = 0, sg = 0, sb = 0, dark = null, dl = 1e9;
    for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
      const p = ((y * S + dy) * W * S + (x * S + dx)) * 3;
      const r = big[p], g = big[p + 1], b = big[p + 2];
      sr += r; sg += g; sb += b;
      const l = lum(r, g, b);
      if (l < dl) { dl = l; dark = [r, g, b]; }
    }
    const n9 = S * S, avg = [sr / n9, sg / n9, sb / n9];
    const w = dl < lum(avg[0], avg[1], avg[2]) - thinThr ? thin : 0;
    const q = (y * W + x) * 3;
    for (let k = 0; k < 3; k++) rgb[q + k] = avg[k] * (1 - w) + dark[k] * w;
  }
  return { W, H, rgb };
}

// ---------- palette ----------
function kmeansLab(pts, k, { init = "ff", iters = 14 } = {}) {
  // pts: array of lab triples. returns centres (lab) excluding white (caller adds white)
  let centers = [];
  if (init === "mc") {
    let boxes = [pts.slice()];
    while (boxes.length < k) {
      let bi = -1, bs = -1;
      boxes.forEach((b, i) => {
        if (b.length < 2) return;
        const m = [0, 0, 0]; b.forEach((p) => { m[0] += p[0]; m[1] += p[1]; m[2] += p[2]; }); m[0] /= b.length; m[1] /= b.length; m[2] /= b.length;
        let s = 0; b.forEach((p) => (s += d2(p, m)));
        if (s > bs) { bs = s; bi = i; }
      });
      if (bi < 0) break;
      const b = boxes[bi];
      const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
      b.forEach((p) => { for (let c = 0; c < 3; c++) { mn[c] = Math.min(mn[c], p[c]); mx[c] = Math.max(mx[c], p[c]); } });
      let ax = 0; for (let c = 1; c < 3; c++) if (mx[c] - mn[c] > mx[ax] - mn[ax]) ax = c;
      b.sort((p, q) => p[ax] - q[ax]);
      const mid = b.length >> 1;
      boxes.splice(bi, 1, b.slice(0, mid), b.slice(mid));
    }
    centers = boxes.map((b) => { const m = [0, 0, 0]; b.forEach((p) => { m[0] += p[0]; m[1] += p[1]; m[2] += p[2]; }); return m.map((v) => v / b.length); });
  } else {
    // farthest-first seeded from the global mean's nearest point; ignore outliers: use only points whose 3x3-ish popularity is high (caller pre-filters)
    centers = [pts[0]];
    while (centers.length < k) {
      let best = null, bd = -1;
      for (const p of pts) { let m = 1e18; for (const c of centers) m = Math.min(m, d2(p, c)); if (m > bd) { bd = m; best = p; } }
      centers.push(best);
    }
  }
  for (let it = 0; it < iters; it++) {
    const sum = centers.map(() => [0, 0, 0, 0]);
    for (const p of pts) {
      let b = 0, bd = 1e18;
      for (let c = 0; c < centers.length; c++) { const d = d2(p, centers[c]); if (d < bd) { bd = d; b = c; } }
      sum[b][0] += p[0]; sum[b][1] += p[1]; sum[b][2] += p[2]; sum[b][3]++;
    }
    centers = centers.map((c, i) => (sum[i][3] ? [sum[i][0] / sum[i][3], sum[i][1] / sum[i][3], sum[i][2] / sum[i][3]] : c));
  }
  return centers;
}

/** global greedy: repeatedly take the largest monochrome rectangle (per colour cached) */
function decomposeGlobal(W, H, lab0, allow, K, opts = {}) {
  const N = W * H;
  const used = new Uint8Array(N);
  const final = new Int16Array(N).fill(-1);
  const rects = [];
  // mask per colour: cells usable for that colour
  const masks = [];
  for (let c = 0; c < K; c++) { const m = new Uint8Array(N); for (let i = 0; i < N; i++) m[i] = lab0[i] === c || allow(i, c) ? 1 : 0; masks.push(m); }
  const cache = new Array(K).fill(null); // {area,x,y,w,h} or {area:0}
  const hist = new Int32Array(W);
  const stackIdx = new Int32Array(W + 1);
  function bestRect(c) {
    const m = masks[c]; hist.fill(0);
    let best = { area: 0 };
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) { const i = y * W + x; hist[x] = m[i] && !used[i] ? hist[x] + 1 : 0; }
      let sp = 0;
      for (let x = 0; x <= W; x++) {
        const h = x < W ? hist[x] : 0;
        let start = x;
        while (sp > 0 && hist[stackIdx[sp - 1]] >= h) {
          const top = stackIdx[sp - 1]; sp--;
          const left = sp > 0 ? stackIdx[sp - 1] + 1 : 0;
          const ht = hist[top], wd = x - left;
          // prefer larger area; tie-break: wider
          const area = ht * wd;
          if (area > best.area) best = { area, x: left, y: y - ht + 1, w: wd, h: ht };
        }
        if (x < W) stackIdx[sp++] = x;
      }
    }
    return best;
  }
  let remaining = N;
  while (remaining > 0) {
    let bc = -1, ba = 0;
    for (let c = 0; c < K; c++) {
      if (!cache[c]) cache[c] = bestRect(c);
      if (cache[c].area > ba) { ba = cache[c].area; bc = c; }
    }
    if (bc < 0) throw new Error("no rect found, remaining " + remaining);
    const r = cache[bc];
    // dirty colours: those whose mask covers any cell of r
    const dirty = new Set();
    for (let j = 0; j < r.h; j++) for (let i = 0; i < r.w; i++) {
      const idx = (r.y + j) * W + r.x + i; used[idx] = 1; final[idx] = bc; remaining--;
    }
    for (let c = 0; c < K; c++) {
      if (c === bc) { cache[c] = null; continue; }
      const cr = cache[c];
      if (!cr || cr.area === 0) continue;
      // if the cached rect overlaps r → invalid
      if (cr.x < r.x + r.w && r.x < cr.x + cr.w && cr.y < r.y + r.h && r.y < cr.y + cr.h) cache[c] = null;
    }
    rects.push({ x: r.x, y: r.y, w: r.w, h: r.h, c: bc });
  }
  rects.sort((a, b) => a.y - b.y || a.x - b.x);
  return { rects, final };
}

// ---------- HTML emit ----------
function emit(W, H, rects, pal, { short3 = false, spacerHeight = false, wrapperAttrs = true } = {}) {
  const rows = Array.from({ length: H }, () => "");
  const hx = short3 ? hexShort : hex6;
  for (const r of rects) {
    rows[r.y] += `<td${r.w > 1 ? ` colspan=${r.w}` : ""}${r.h > 1 ? ` rowspan=${r.h}` : ""}${r.c === 0 ? "" : ` bgcolor=${hx(pal[r.c])}`}>`;
  }
  // rects are pushed in raster order so each row's cells are left-to-right already
  let html = `<table role=presentation dir=ltr cellpadding=0 cellspacing=0 border=0 align=center width=${W} style="width:${W}px;max-width:100%;margin:0 auto;border-collapse:collapse;font-size:0;line-height:0" aria-label="לו״ז העניין – בית לחומרי הבגרות">`;
  html += `<tr height=1>${(spacerHeight ? "<td width=1 height=1>" : "<td width=1>").repeat(W)}`;
  for (let r = 0; r < H; r++) html += `<tr height=1>${rows[r]}`;
  html += "</table>";
  return html;
}

// ---------- full variant run ----------
function run(T, cfg) {
  const { W, H, rgb } = T;
  const N = W * H;
  const CW = cfg.chromaW || 1;
  const rgb2labS = (r, g, b) => { const l = rgb2lab(r, g, b); return [l[0], l[1] * CW, l[2] * CW]; };
  const lab = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { const l = rgb2labS(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]); lab[i * 3] = l[0]; lab[i * 3 + 1] = l[1]; lab[i * 3 + 2] = l[2]; }
  const px = (i) => [lab[i * 3], lab[i * 3 + 1], lab[i * 3 + 2]];
  const dWhite = new Float32Array(N);
  for (let i = 0; i < N; i++) dWhite[i] = Math.sqrt(d2(px(i), WHITE_LAB));
  const isWhite = (i) => dWhite[i] < cfg.whiteTol;
  // zones
  const ZT = {
    text: (x, y) => (y > 0.765 && x > 0.57) || (y > 0.865 && x > 0.36),
    nuts: (x, y) => x < 0.45 && y > 0.38,
    house: () => true,
    all: () => true,
  };
  const zoneDefs = cfg.zones ? cfg.zones : [{ name: "all", K: cfg.K }];
  const zid = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const x = (i % W) / W, y = ((i / W) | 0) / H;
    let z = zoneDefs.findIndex((zd) => ZT[zd.name](x, y)); if (z < 0) z = zoneDefs.length - 1; zid[i] = z;
  }
  const snap = (c) => {
    const tl = rgb2lab(c[0], c[1], c[2]);
    let best = null, bd = 1e18;
    const cand = (v) => [Math.floor(v / 17) * 17, Math.ceil(v / 17) * 17];
    for (const r of cand(c[0])) for (const g of cand(c[1])) for (const b of cand(c[2])) { const l = rgb2lab(r, g, b); const d = d2(l, tl); if (d < bd) { bd = d; best = [r, g, b]; } }
    return best;
  };
  const pal = [[255, 255, 255]];
  const zoneLabels = zoneDefs.map(() => [0]);
  zoneDefs.forEach((zd, z) => {
    const pts = [];
    for (let i = 0; i < N; i++) if (zid[i] === z && !isWhite(i)) pts.push(px(i));
    const cents = kmeansLab(pts, (zd.K || cfg.K) - 1, { init: cfg.init });
    for (const c of cents) { let rgbc = lab2rgb(c[0], c[1] / CW, c[2] / CW); if (cfg.snap3) rgbc = snap(rgbc); zoneLabels[z].push(pal.length); pal.push(rgbc); }
  });
  const palLab = pal.map((c) => rgb2labS(c[0], c[1], c[2]));
  const K = pal.length;
  const D = new Float32Array(N * K).fill(1e4);
  const best = new Int16Array(N);
  const eb = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let b = 0, bd = 1e18; const p = px(i);
    for (const c of zoneLabels[zid[i]]) { const d = Math.sqrt(d2(p, palLab[c])); D[i * K + c] = d; if (d < bd) { bd = d; b = c; } }
    best[i] = b; eb[i] = bd;
  }
  let lab0 = Int16Array.from(best);
  // white snap
  for (let i = 0; i < N; i++) if (isWhite(i)) lab0[i] = 0;
  // small-component cleanup: relabel components of <= maxSize cells to a neighbouring label when the mean extra error <= thr[size-1]
  const maxClean = Math.max(cfg.cleanThr ? cfg.cleanThr.length : 0, ...zoneDefs.map((zd) => (zd.cleanThr || []).length));
  if (maxClean > 0) {
    for (let pass = 0; pass < (cfg.cleanPasses || 3); pass++) {
      let changed = 0;
      const seen = new Uint8Array(N);
      const comps = [];
      for (let s = 0; s < N; s++) {
        if (seen[s]) continue;
        const lab = lab0[s]; const comp = [s]; seen[s] = 1;
        for (let q = 0; q < comp.length && comp.length <= maxClean; q++) {
          const i = comp[q], x = i % W, y = (i / W) | 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const j = yy * W + xx; if (!seen[j] && lab0[j] === lab) { seen[j] = 1; comp.push(j); }
          }
        }
        // if we stopped early (comp too big) the BFS is incomplete; mark rest by continuing without recording
        if (comp.length <= maxClean) {
          // verify completeness: no unseen same-label neighbour left
          let complete = true;
          for (const i of comp) {
            const x = i % W, y = (i / W) | 0;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
              const j = yy * W + xx; if (lab0[j] === lab && !seen[j]) complete = false;
            }
          }
          if (complete) comps.push({ comp, lab });
        } else {
          // too big: flood the rest cheaply so we do not revisit
          for (let q = 0; q < comp.length; q++) {
            const i = comp[q], x = i % W, y = (i / W) | 0;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
              const j = yy * W + xx; if (!seen[j] && lab0[j] === lab) { seen[j] = 1; comp.push(j); }
            }
          }
        }
      }
      comps.sort((a, b) => a.comp.length - b.comp.length);
      for (const { comp, lab } of comps) {
        // component may have changed already in this pass: skip if any cell's label differs
        if (comp.some((i) => lab0[i] !== lab)) continue;
        const cand = new Set();
        for (const i of comp) {
          const x = i % W, y = (i / W) | 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const l = lab0[yy * W + xx]; if (l !== lab) cand.add(l);
          }
        }
        let bl = -1, bcst = 1e18;
        for (const l of cand) { let s = 0; for (const i of comp) s += D[i * K + l] - D[i * K + lab]; if (s < bcst) { bcst = s; bl = l; } }
        const zt = zoneDefs[zid[comp[0]]].cleanThr || cfg.cleanThr || []; if (bl >= 0 && comp.length <= zt.length && bcst / comp.length <= zt[comp.length - 1]) { for (const i of comp) lab0[i] = bl; changed++; }
      }
      if (!changed) break;
    }
  }
  const zSlack = zoneDefs.map((zd) => (zd.growSlack ?? cfg.growSlack ?? 0));
  const allow = (i, c) => { const sl = zSlack[zid[i]]; return sl > 0 && D[i * K + c] <= eb[i] + sl && (c !== 0 || dWhite[i] < (zoneDefs[zid[i]].whiteGrow ?? cfg.whiteGrow ?? 8)); };
  const { rects, final } = decomposeGlobal(W, H, lab0, allow, K);
  const html = emit(W, H, rects, pal, cfg);
  // error
  let sumE = 0;
  const out = Buffer.alloc(N * 3);
  for (let i = 0; i < N; i++) {
    const c = final[i]; const e = D[i * K + c]; sumE += e;
    out[i * 3] = pal[c][0]; out[i * 3 + 1] = pal[c][1]; out[i * 3 + 2] = pal[c][2];
  }
  return { html, bytes: Buffer.byteLength(html), rects: rects.length, meanE: sumE / N, raster: out, W, H };
}


module.exports = { buildTarget, run, PRESETS, BASE, CROP };

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const opt = (n) => (args.find((a) => a.startsWith("--" + n + "=")) || "").split("=")[1];
    const SRC = args.find((a) => !a.startsWith("--")) || path.join(__dirname, "..", "public", "images", "logo.png");
    const preset = opt("preset") || "mid";
    if (!PRESETS[preset]) throw new Error("unknown preset " + preset);
    const T = await buildTarget(SRC, { ...CROP, W: WIDTH_PX });
    const res = run(T, { ...BASE, ...PRESETS[preset] });
    const out = opt("out") || path.join(__dirname, "..", "src/lib/mail-logo.generated.ts");
    fs.writeFileSync(out, "// קובץ שנוצר אוטומטית ע״י scripts/gen-mail-logo.cjs — לא לערוך ידנית.\n" + `export const MAIL_LOGO_HTML = ${JSON.stringify(res.html)};\n`);
    if (opt("png")) await sharp(res.raster, { raw: { width: res.W, height: res.H, channels: 3 } }).resize({ width: res.W * 3, kernel: "nearest" }).png().toFile(opt("png"));
    console.log(preset, res.W + "x" + res.H, "rects", res.rects, "html bytes", res.bytes, "meanE", res.meanE.toFixed(2));
  })();
}
