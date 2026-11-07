import "server-only";
import sharp from "sharp";
import potrace from "potrace";

/**
 * ממיר תמונה רסטרית (RGBA) לציור וקטורי בצבעים שטוחים, כמחרוזת אופרטורים של PDF בריבוע יחידה (0..1, y למעלה).
 *
 * למה: נטפרי מחליף כל תמונה בתוך PDF ב"התמונה לא נבדקה", אבל נתיבים וקטוריים עוברים (ר' docs/netfree.md).
 * שיטה: k-means בצבע (אתחול farthest-point) ← potrace לכל שכבת צבע. השכבות "מוערמות": שכבה j = כל הפיקסלים של
 * צבע j ושל כל הצבעים הקטנים ממנו, מצוירות מהגדול לקטן – כך אין חריצי רקע בין אזורים סמוכים ואין צורך בהרחבת מסכות
 * (שהייתה מעבה כתב יד דק). פיקסלים עם alpha<128 לא מצוירים (שקופים); אם כל התמונה אטומה – שכבת הבסיס היא ריבוע מלא
 * `0 0 1 1 re f` בצבע הדומיננטי.
 */
export type VectorizeOpts = {
  /** מספר צבעים (ברירת מחדל 16) */
  colors?: number;
  /** הצלע הארוכה של התמונה שעליה מריצים potrace (ברירת מחדל: ~1.15 מהמקור, עד 1400) */
  traceSide?: number;
  /** potrace turdSize – כתמים קטנים מזה נזרקים (ברירת מחדל 3) */
  turdSize?: number;
  /** optTolerance של potrace (גבוה = פחות קטעים; ברירת מחדל 0.6) */
  optTolerance?: number;
  /** צבע שמכסה פחות מהשבר הזה של התמונה לא מקבל שכבה (ברירת מחדל 0.0004) */
  minLayerFrac?: number;
  /** תקרת גודל רכה (הערכה מראש של ה-ops לפני דחיסה) שמעליה מורידים צבעים/רזולוציה (ברירת מחדל 1000000) */
  maxOpsBytes?: number;
  /** פנימי: עומק רקורסיית הקטנת הרזולוציה */
  _depth?: number;
  _baseColors?: number;
  /** סדר ההערמה: "lum" = מהבהיר לכהה (ברירת מחדל; הדיו הכהה למעלה), "area" = מהגדול לקטן */
  order?: "lum" | "area";
  /** גבול זמן רך (ms מעכשיו); אחרי שעבר מפסיקים להוסיף שכבות (התוצאה עדיין תקינה, רק פחות מפורטת) */
  deadline?: number;
};

/** כמה בתי ops לכל יחידת "עלות גבול" (כויל על איורי קריקטורה ומפה; ר' VEC_DEBUG) */
const OPS_PER_COST = 4;
/** מדרגות הקטנה כשההערכה חורגת מהתקציב: [חלק מהצבעים, חלק מרזולוציית ה-trace] */
const DEGRADE_STEPS: [number, number][] = [[1, 1], [0.5, 1], [0.32, 0.85], [0.25, 0.6]];

const trace = (buf: Buffer, opts: Record<string, unknown>) =>
  new Promise<string>((res, rej) => potrace.trace(buf, opts, (e: Error | null, s: string) => (e ? rej(e) : res(s))));

/** מספר עם עד 3 ספרות אחרי הנקודה, בלי אפסים מיותרים */
const fmt = (v: number) => {
  const s = (Math.round(v * 1000) / 1000).toString();
  return s.startsWith("0.") ? s.slice(1) : s.startsWith("-0.") ? "-" + s.slice(2) : s;
};

/** מתרגם את ה-d של SVG מ-potrace (M/L/C/Z מוחלטים) לאופרטורי PDF בריבוע יחידה */
function svgPathToOps(d: string, W: number, H: number): string {
  const tok = d.match(/[MLCZmlcz]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
  let k = 0;
  let cmd = "";
  let body = "";
  const num = () => parseFloat(tok[k++]);
  const X = (x: number) => fmt(x / W);
  const Y = (y: number) => fmt(1 - y / H);
  while (k < tok.length) {
    if (/[MLCZmlcz]/.test(tok[k])) cmd = tok[k++];
    if (cmd === "M") {
      body += `${X(num())} ${Y(num())} m `;
      cmd = "L";
    } else if (cmd === "L") {
      body += `${X(num())} ${Y(num())} l `;
    } else if (cmd === "C") {
      const a = [num(), num(), num(), num(), num(), num()];
      body += `${X(a[0])} ${Y(a[1])} ${X(a[2])} ${Y(a[3])} ${X(a[4])} ${Y(a[5])} c `;
    } else if (cmd === "Z" || cmd === "z") {
      body += "h ";
    } else throw new Error("unexpected svg path command " + cmd);
  }
  return body;
}

const f3 = (v: number) => (Math.round((v / 255) * 1000) / 1000).toString();

export async function vectorizeRgbaToPdfOps(rgba: Buffer, w: number, h: number, opts: VectorizeOpts = {}): Promise<string | null> {
  return vectorizeOnce(rgba, w, h, opts);
}

async function vectorizeOnce(rgba: Buffer, w: number, h: number, opts: VectorizeOpts): Promise<string | null> {
  if (!w || !h || rgba.length < w * h * 4) return null;
  const K = Math.max(2, opts.colors ?? 16);
  const longSide = Math.max(w, h);
  // תמונה קטנה מאוד (אייקון 15x15) לא מוגדלת ל-520: מספיק פי 4
  const side = Math.round(opts.traceSide ?? Math.max(Math.min(longSide * 2.5, 520), Math.min(1400, longSide * 1.15)));
  const scale = side / longSide;
  const W = Math.max(2, Math.round(w * scale));
  const H = Math.max(2, Math.round(h * scale));
  const { data } = await sharp(rgba, { raw: { width: w, height: h, channels: 4 } })
    .resize({ width: W, height: H, kernel: "lanczos3", fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const n = W * H;
  const opaque = new Uint8Array(n);
  let opaqueCount = 0;
  for (let i = 0; i < n; i++) {
    if (data[i * 4 + 3] >= 128) {
      opaque[i] = 1;
      opaqueCount++;
    }
  }
  if (opaqueCount < 40) return null; // כמעט שקוף – אין מה לצייר
  const fullyOpaque = opaqueCount === n;

  // --- k-means ---
  const R = (i: number) => data[i * 4];
  const G = (i: number) => data[i * 4 + 1];
  const B = (i: number) => data[i * 4 + 2];
  // דגימה (כל פיקסל ~7 מהאטומים)
  const sample: number[] = [];
  for (let i = 0; i < n; i += 5) if (opaque[i]) sample.push(i);
  if (sample.length < K) for (let i = 0; i < n; i++) if (opaque[i]) sample.push(i);
  // צבע דומיננטי (היסטוגרמה 4 ביט לערוץ) כמרכז ראשון
  const hist = new Map<number, number>();
  for (const i of sample) {
    const key = ((R(i) >> 4) << 8) | ((G(i) >> 4) << 4) | (B(i) >> 4);
    hist.set(key, (hist.get(key) ?? 0) + 1);
  }
  let domKey = 0;
  let domCnt = -1;
  for (const [k2, c] of hist) if (c > domCnt) { domCnt = c; domKey = k2; }
  const centers: [number, number, number][] = [[((domKey >> 8) << 4) + 8, (((domKey >> 4) & 15) << 4) + 8, ((domKey & 15) << 4) + 8]];
  const minD = new Float64Array(sample.length).fill(1e12);
  // משקל לכל דגימה = כמה דגימות באותו תא צבע (כדי שצבעים נפוצים-אך-בהירים, כמו עור, לא ידלגו מתחת לקיצוניים נדירים)
  const binOf = (i: number) => ((R(i) >> 4) << 8) | ((G(i) >> 4) << 4) | (B(i) >> 4);
  const wgt = sample.map((i) => Math.sqrt(hist.get(binOf(i)) ?? 1));
  while (centers.length < K) {
    const c = centers[centers.length - 1];
    let best = -1;
    let bd = -1;
    for (let s = 0; s < sample.length; s++) {
      const i = sample[s];
      const d = (R(i) - c[0]) ** 2 + (G(i) - c[1]) ** 2 + (B(i) - c[2]) ** 2;
      if (d < minD[s]) minD[s] = d;
      const score = minD[s] * wgt[s];
      if (score > bd) { bd = score; best = s; }
    }
    if (bd < 64) break; // אין עוד צבעים שונים משמעותית
    centers.push([R(sample[best]), G(sample[best]), B(sample[best])]);
  }
  const KK = centers.length;
  for (let it = 0; it < 8; it++) {
    const sum = Array.from({ length: KK }, () => [0, 0, 0, 0]);
    for (const i of sample) {
      const r = R(i), g = G(i), b = B(i);
      let bi = 0, bd = 1e12;
      for (let c = 0; c < KK; c++) {
        const d = (r - centers[c][0]) ** 2 + (g - centers[c][1]) ** 2 + (b - centers[c][2]) ** 2;
        if (d < bd) { bd = d; bi = c; }
      }
      sum[bi][0] += r; sum[bi][1] += g; sum[bi][2] += b; sum[bi][3]++;
    }
    for (let c = 0; c < KK; c++) if (sum[c][3]) centers[c] = [sum[c][0] / sum[c][3], sum[c][1] / sum[c][3], sum[c][2] / sum[c][3]];
  }
  const assign = new Uint8Array(n);
  const counts = new Float64Array(KK);
  for (let i = 0; i < n; i++) {
    if (!opaque[i]) continue;
    const r = R(i), g = G(i), b = B(i);
    let bi = 0, bd = 1e12;
    for (let c = 0; c < KK; c++) {
      const d = (r - centers[c][0]) ** 2 + (g - centers[c][1]) ** 2 + (b - centers[c][2]) ** 2;
      if (d < bd) { bd = d; bi = c; }
    }
    assign[i] = bi;
    counts[bi]++;
  }

  // --- דירוג צבעים לפי שטח (גדול ראשון, מצויר ראשון) ---
  const lum = (c: number) => 0.299 * centers[c][0] + 0.587 * centers[c][1] + 0.114 * centers[c][2];
  const byLum = opts.order !== "area";
  const order = Array.from({ length: KK }, (_, c) => c)
    .filter((c) => counts[c] > 0)
    .sort((a, b) => (byLum ? lum(b) - lum(a) : counts[b] - counts[a]));
  const rank = new Int16Array(KK).fill(-1);
  order.forEach((c, r) => (rank[c] = r));

  // --- הערכת מורכבות לפני ה-trace היקר: אורך הגבולות בין צבעים (מוכפל במרחק הדרגות, כי בהערמה גבול מופיע בכל השכבות שבין השניים) ---
  let cost = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!opaque[i]) continue;
      const r0 = rank[assign[i]];
      if (x + 1 < W && opaque[i + 1]) cost += Math.abs(r0 - rank[assign[i + 1]]);
      if (y + 1 < H && opaque[i + W]) cost += Math.abs(r0 - rank[assign[i + W]]);
    }
  }
  const predicted = cost * OPS_PER_COST;
  if (process.env.VEC_DEBUG) console.log("[vec] W", W, "H", H, "cost", cost, "predicted", Math.round(predicted));
  const maxOps = opts.maxOpsBytes ?? 1_000_000;
  const depth = opts._depth ?? 0;
  if (predicted > maxOps * 1.15 && depth + 1 < DEGRADE_STEPS.length) {
    // יקר מדי (דף סרוק / תצלום / טקסטורה): פחות צבעים (כל שכבה מוערמת משכפלת את הגבולות), ואם צריך – גם פחות רזולוציה
    const [kf, sf] = DEGRADE_STEPS[depth + 1];
    const [, sfNow] = DEGRADE_STEPS[depth];
    return vectorizeOnce(rgba, w, h, {
      ...opts,
      colors: Math.max(4, Math.round((opts._baseColors ?? K) * kf)),
      _baseColors: opts._baseColors ?? K,
      traceSide: Math.round(side * (sf / sfNow)),
      _depth: depth + 1,
    });
  }

  const minPixels = Math.max(12, Math.round(n * (opts.minLayerFrac ?? 0.0004)));
  const deadline = opts.deadline ?? Infinity;
  let ops = "";
  for (let j = 0; j < order.length; j++) {
    const c = order[j];
    if (j > 0 && counts[c] < minPixels) continue; // צבע זניח – הפיקסלים שלו נצבעים בצבע השכבה שמתחתיו
    if (j > 0 && Date.now() > deadline) return null; // חצי תמונה (בלי שכבות הדיו הכהות) גרועה מרסטר – מוותרים
    const color = `${f3(centers[c][0])} ${f3(centers[c][1])} ${f3(centers[c][2])} rg `;
    if (j === 0 && fullyOpaque) {
      ops += `${color}0 0 1 1 re f\n`;
      continue;
    }
    // מסכה מוערמת: אטום ודרגה >= j (potrace מתחקה אחרי הפיקסלים השחורים = 0)
    const mask = Buffer.alloc(n, 255);
    let cnt = 0;
    for (let i = 0; i < n; i++) {
      if (opaque[i] && rank[assign[i]] >= j) { mask[i] = 0; cnt++; }
    }
    if (cnt < minPixels) continue;
    const png = await sharp(mask, { raw: { width: W, height: H, channels: 1 } }).png({ compressionLevel: 3 }).toBuffer();
    const svg = await trace(png, { threshold: 128, turdSize: opts.turdSize ?? 3, alphaMax: 1, optTolerance: opts.optTolerance ?? 0.6, blackOnWhite: true });
    const d = [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]).join(" ");
    if (!d) continue;
    ops += `${color}${svgPathToOps(d, W, H)}f*\n`;
  }
  if (process.env.VEC_DEBUG) console.log("[vec] actual ops", ops.length, "ratio", (ops.length / cost).toFixed(2));
  return ops || null;
}
