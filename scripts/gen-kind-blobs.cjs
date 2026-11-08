/**
 * מייצר את src/lib/kind-blobs.generated.ts: ארבעת כתמי הרקע של מספרי הדף הראשי (public/images/kind-blob-N.png) כ-SVG מוטמע.
 * למה: מסנן אתרוג/נטפרי הציג את הכתם הראשון כריבוע בהיר במקום הכתם (תמונה שלא נבדקה / נחסמה) – נבדק אצל המורה, 2026-11-09.
 * ה-PNG שקוף למחצה (כתם צבעוני) + טבעת כהה אטומה מעליו. לכן שתי שכבות: הכתם (צבע ממוצע + שקיפות ממוצעת) והטבעת (נתיב כהה).
 * הרצה: node scripts/gen-kind-blobs.cjs   (potrace + sharp בפרויקט)
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const potrace = require("potrace");

const root = path.join(__dirname, "..");
const trace = (buf, opts) => new Promise((res, rej) => potrace.trace(buf, opts, (e, s) => (e ? rej(e) : res(s))));
const hex = (c) => "#" + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

/** קיצור מחרוזת נתיב: עיגול לספרה אחת אחרי הנקודה */
function compact(d) {
  return d
    .replace(/-?\d+\.\d+/g, (m) => {
      let s = (Math.round(parseFloat(m) * 10) / 10).toString();
      if (s.startsWith("0.")) s = s.slice(1);
      else if (s.startsWith("-0.")) s = "-" + s.slice(2);
      return s;
    })
    .replace(/, /g, " ")
    .replace(/ ?([MLCZ]) ?/g, "$1")
    .replace(/ -/g, "-");
}

async function maskToPath(mask, W, H) {
  // potrace מעקב אחרי השחור: ממירים את המסכה לתמונה שחור-על-לבן
  const img = Buffer.alloc(W * H);
  for (let i = 0; i < W * H; i++) img[i] = mask[i] ? 0 : 255;
  const svg = await trace(await sharp(img, { raw: { width: W, height: H, channels: 1 } }).png().toBuffer(), { turdSize: 2, optTolerance: 0.3, threshold: 128 });
  const ds = [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
  return compact(ds.join(" "));
}

(async () => {
  const out = {};
  for (const n of [1, 2, 3, 4]) {
    const file = path.join(root, "public/images", `kind-blob-${n}.png`);
    const meta = await sharp(file).metadata();
    const scale = Math.min(1, 340 / meta.width);
    const W = Math.round(meta.width * scale);
    const H = Math.round(meta.height * scale);
    const { data } = await sharp(file).ensureAlpha().resize(W, H, { kernel: "lanczos3" }).raw().toBuffer({ resolveWithObject: true });
    const blob = new Uint8Array(W * H);
    const ring = new Uint8Array(W * H);
    let r = 0, g = 0, b = 0, a = 0, c = 0;
    let rr = 0, rg = 0, rb = 0, rc = 0;
    for (let i = 0; i < W * H; i++) {
      const al = data[i * 4 + 3];
      if (al > 20) blob[i] = 1;
      if (al >= 160) {
        ring[i] = 1;
        rr += data[i * 4]; rg += data[i * 4 + 1]; rb += data[i * 4 + 2]; rc++;
      } else if (al > 20 && al < 160) {
        r += data[i * 4]; g += data[i * 4 + 1]; b += data[i * 4 + 2]; a += al; c++;
      }
    }
    out[n] = {
      w: W,
      h: H,
      blobFill: hex([r / c, g / c, b / c]),
      blobOpacity: Math.round((a / c / 255) * 100) / 100,
      blobD: await maskToPath(blob, W, H),
      ringFill: rc ? hex([rr / rc, rg / rc, rb / rc]) : "#3b2a1a",
      ringD: await maskToPath(ring, W, H),
    };
    console.log(n, `${W}x${H}`, out[n].blobFill, out[n].blobOpacity, "blob", out[n].blobD.length, "ring", out[n].ringD.length);
  }
  fs.writeFileSync(
    path.join(root, "src/lib/kind-blobs.generated.ts"),
    "// קובץ שנוצר אוטומטית ע״י scripts/gen-kind-blobs.cjs — לא לערוך ידנית.\n" +
      "export type KindBlobData = { w: number; h: number; blobFill: string; blobOpacity: number; blobD: string; ringFill: string; ringD: string };\n" +
      `export const KIND_BLOBS: Record<number, KindBlobData> = ${JSON.stringify(out)};\n`,
  );
})();
