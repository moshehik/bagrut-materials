import "server-only";
import sharp from "sharp";
import { deflate } from "node:zlib";
import { promisify } from "node:util";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef, decodePDFRawStream } from "pdf-lib";

/**
 * מחליף תמונות גדולות (רקעי שקפים) ב-PDF ברשת צבעים חלקה (Gouraud lattice mesh – shading מסוג 5): אובייקט וקטורי שאינו תמונה.
 *
 * למה: נטפרי מחליף כל תמונה בתוך PDF ב"התמונה לא נבדקה", אבל נתיבים/הצללות וקטוריים עוברים. המרה לנתיבי צבע (potrace) נראתה
 * כמו כרזה עם פסי צבע, ורשת הצללה חלקה נראית כמעט כמו המקור (נבדק אצל המורה ב-/netfree-test/, 2026-11-08, אפשרות י').
 * ר' docs/netfree.md.
 *
 * כל תמונה "גדולה" (רוחב מוצג ≥ MIN_PLACED_PT נק', בלי מסכת שקיפות, ‏DeviceRGB/‏DeviceGray, JPEG או Flate) → רשת של
 * GRID_COLS × (לפי יחס התמונה) קודקודים (1024 – ב-512 השקף נראה מטושטש לעומת המקור, 2026-11-09; הקובץ נשאר קטן בזכות Predictor, ר' packMesh), כל אחד עם צבע (RGB). `cm … /ImX Do` ← `cm … 0 0 1 1 re W n /LuzMeshN sh`
 * (חיתוך לריבוע היחידה, כדי שההצללה לא תצבע את כל העמוד). תמונות עם שקיפות / קטנות / בפורמט אחר – לא נוגעים בהן.
 * מחזיר כמה תמונות הוחלפו. לעולם לא זורק החוצה (כשל בתמונה אחת משאיר אותה כמו שהיא).
 */
const deflateAsync = promisify(deflate);
/**
 * ברירת מחדל: 1024 עמודות + predictor. נבדק בנטפרי אצל המורה (2026-11-09, /netfree-test/index.html, גרסאות ד׳ ו-ה׳): שתיהן מציגות רקע.
 * שימי לב: בהורדה מלאה אחת (18 שקפים, ~20MB) הרקעים הופיעו לבנים בנטפרי והסיבה לא הוכחה (ייתכן גודל הקובץ / תמונות רסטר שנשארו) – לאמת בהורדה אמיתית.
 */
/** tiles: מחלק את התמונה ל-tiles×tiles רשתות נפרדות (כל אחת עד cols/tiles עמודות) – לבדיקת מגבלת הנקודות של הקורא של Edge */
export type MeshOptions = { cols?: number; predictor?: boolean; tiles?: number; /** סולם הגדרות (מהחדה לקלה) עם הערכת גודל לתמונה, ותקציב כולל: נבחרת ההגדרה החדה ביותר שמספר התמונות × ההערכה נכנס בתקציב */ ladder?: { opts: MeshOptions; estBytesPerImage: number }[]; maxBytes?: number; /** שלב כימות הצבע (למשל 4): ערכים זהים ברצף = דחיסה טובה יותר בלי predictor */ quant?: number };
const GRID_COLS = 1024;
const MAX_VERTICES = 1_600_000;
const MIN_PLACED_PT = 150;
const MIN_IMAGE_PX = 500;
const TIME_BUDGET_MS = 25_000;

type M = [number, number, number, number, number, number];
const mul = (m: M, e: M): M => [
  m[0] * e[0] + m[1] * e[2],
  m[0] * e[1] + m[1] * e[3],
  m[2] * e[0] + m[3] * e[2],
  m[2] * e[1] + m[3] * e[3],
  m[4] * e[0] + m[5] * e[2] + e[4],
  m[4] * e[1] + m[5] * e[3] + e[5],
];
const NUM = String.raw`-?[\d.]+`;
const CM = String.raw`(?:${NUM}\s+){6}cm\s+`;

/** פיקסלים של תמונת PDF → RGB בגודל הרשת (או null אם הפורמט לא נתמך) */
async function gridPixels(obj: PDFRawStream, cols: number, rows: number): Promise<Buffer | null> {
  const filter = String(obj.dict.get(PDFName.of("Filter")));
  const cs = String(obj.dict.get(PDFName.of("ColorSpace")));
  const w = Number(String(obj.dict.get(PDFName.of("Width"))));
  const h = Number(String(obj.dict.get(PDFName.of("Height"))));
  const bpc = Number(String(obj.dict.get(PDFName.of("BitsPerComponent")) ?? "8"));
  if (!w || !h) return null;
  let img: ReturnType<typeof sharp>;
  if (filter.includes("DCTDecode")) {
    img = sharp(Buffer.from(obj.contents));
  } else if (filter.includes("FlateDecode") && bpc === 8 && (cs === "/DeviceRGB" || cs === "/DeviceGray")) {
    const raw = Buffer.from(decodePDFRawStream(obj).decode());
    const channels = cs === "/DeviceRGB" ? 3 : 1;
    if (raw.length < w * h * channels) return null;
    img = sharp(raw, { raw: { width: w, height: h, channels: channels as 1 | 3 } });
  } else {
    return null;
  }
  return img.resize({ width: cols, height: rows, fit: "fill", kernel: "lanczos3" }).toColourspace("srgb").removeAlpha().raw().toBuffer();
}

/**
 * דחיסה: ‏PNG-predictor מסוג Up (שורה פחות השורה שמעליה, ‏Colors=7 = בתים לקודקוד). קואורדינטות הקודקודים הופכות לאפסים והצבעים לדלתאות –
 * קובץ קטן פי ~2.5 (1024 עמודות: ~1MB לשקף במקום ~2.8MB). פענוח הפרדיקטור סטנדרטי בכל קורא PDF.
 */
function packMesh(raw: Buffer, cols: number): Buffer {
  const rowLen = cols * 7;
  const rows = raw.length / rowLen;
  const out = Buffer.alloc(rows * (rowLen + 1));
  for (let r = 0; r < rows; r++) {
    const o = r * (rowLen + 1);
    out[o] = 2;
    const base = r * rowLen;
    for (let i = 0; i < rowLen; i++) out[o + 1 + i] = (raw[base + i] - (r > 0 ? raw[base - rowLen + i] : 0)) & 255;
  }
  return out;
}

/** רשת Gouraud (shading 5): קודקוד = x(16) y(16) r g b; שורה ראשונה למעלה (y=1) בריבוע יחידה */
function meshBytes(rgb: Buffer, cols: number, rows: number): Buffer {
  const out = Buffer.alloc(cols * rows * 7);
  let o = 0;
  for (let r = 0; r < rows; r++) {
    const yi = Math.round((1 - r / (rows - 1)) * 65535);
    for (let c = 0; c < cols; c++) {
      const xi = Math.round((c / (cols - 1)) * 65535);
      out[o++] = xi >> 8;
      out[o++] = xi & 255;
      out[o++] = yi >> 8;
      out[o++] = yi & 255;
      const p = (r * cols + c) * 3;
      out[o++] = rgb[p];
      out[o++] = rgb[p + 1];
      out[o++] = rgb[p + 2];
    }
  }
  return out;
}

type MeshPart = { bytes: Buffer; cols: number };
type Built = { parts: MeshPart[]; tiles: number; predictor: boolean } | null;

/** רשת מכווצת לתמונה אחת (או null אם לא נתמכת / חורגת מהמגבלות) */
async function buildMesh(obj: PDFRawStream, started: number, opts: MeshOptions): Promise<Built> {
  try {
    const w = Number(String(obj.dict.get(PDFName.of("Width"))));
    const h = Number(String(obj.dict.get(PDFName.of("Height"))));
    const T = Math.max(1, Math.floor(opts.tiles ?? 1));
    const predictor = opts.predictor ?? true;
    const total = Math.min(opts.cols ?? GRID_COLS, w);
    // עמודות/שורות לכל אריח; אריחים סמוכים חולקים עמודת/שורת קודקודים אחת, כדי שהצבעים יתחברו בלי תפר
    const perCols = T === 1 ? total : Math.max(2, Math.round((total - 1) / T) + 1);
    const perRows = Math.max(2, Math.round((perCols * h) / w));
    const fullCols = T * (perCols - 1) + 1;
    const fullRows = T * (perRows - 1) + 1;
    if (fullCols * fullRows > MAX_VERTICES || Date.now() - started > TIME_BUDGET_MS) return null;
    const rgb = await gridPixels(obj, fullCols, fullRows);
    if (!rgb) return null;
    const q = opts.quant ?? 0;
    if (q > 1) for (let i = 0; i < rgb.length; i++) rgb[i] = Math.min(255, Math.round(rgb[i] / q) * q);
    const parts: MeshPart[] = [];
    for (let ty = 0; ty < T; ty++) {
      for (let tx = 0; tx < T; tx++) {
        const sub = Buffer.alloc(perCols * perRows * 3);
        for (let r = 0; r < perRows; r++) {
          const from = ((ty * (perRows - 1) + r) * fullCols + tx * (perCols - 1)) * 3;
          rgb.copy(sub, r * perCols * 3, from, from + perCols * 3);
        }
        const raw = meshBytes(sub, perCols, perRows);
        parts.push({ bytes: await deflateAsync(predictor ? packMesh(raw, perCols) : raw), cols: perCols });
      }
    }
    return { parts, tiles: T, predictor };
  } catch (e) {
    console.error("pdf mesh: image failed", e instanceof Error ? e.message : e);
    return null;
  }
}

/** מגבלת מקביליות פשוטה: שינוי הגודל והדחיסה רצים ב-threadpool, ולכן כמה במקביל מקצר מצגת גדולה משמעותית */
function limiter(max: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return <T,>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const run = () => {
        active++;
        fn()
          .then(resolve, reject)
          .finally(() => {
            active--;
            queue.shift()?.();
          });
      };
      if (active < max) run();
      else queue.push(run);
    });
}

export async function meshifyLargeImages(pdf: PDFDocument, optsIn: MeshOptions = {}): Promise<number> {
  const started = Date.now();
  const ctx = pdf.context;
  let opts = optsIn;
  // בונים את כל הרשתות מראש במקביל (3 בו-זמנית); הלולאה שלמטה רק ממתינה לתוצאה של כל תמונה
  const limit = limiter(3);
  const built = new Map<PDFRef, Promise<Built>>();
  const pending: [PDFRef, PDFRawStream][] = [];
  for (const page of pdf.getPages()) {
    const xo0 = page.node.Resources()?.lookupMaybe(PDFName.of("XObject"), PDFDict);
    if (!xo0) continue;
    for (const key of xo0.keys()) {
      const raw = xo0.get(key);
      if (!(raw instanceof PDFRef) || built.has(raw)) continue;
      const obj = ctx.lookup(raw);
      if (!(obj instanceof PDFRawStream)) continue;
      if (String(obj.dict.get(PDFName.of("Subtype"))) !== "/Image") continue;
      if (obj.dict.get(PDFName.of("SMask")) || obj.dict.get(PDFName.of("Mask"))) continue;
      const w = Number(String(obj.dict.get(PDFName.of("Width"))));
      const h = Number(String(obj.dict.get(PDFName.of("Height"))));
      if (w < MIN_IMAGE_PX || h < MIN_IMAGE_PX * 0.3) continue;
      if (!pending.some(([r]) => r === raw)) pending.push([raw, obj]);
    }
  }
  // בחירת ההגדרה מהסולם לפי מספר התמונות והתקציב (הערכה גסה: גודל לתמונה כפי שנמדד על מצגת של 18 שקפים)
  if (opts.ladder?.length && opts.maxBytes) {
    const budget = opts.maxBytes;
    const pick = opts.ladder.find((l) => l.estBytesPerImage * pending.length <= budget) ?? opts.ladder[opts.ladder.length - 1];
    opts = { ...pick.opts };
  }
  for (const [raw, obj] of pending) built.set(raw, limit(() => buildMesh(obj, started, opts)));
  const shadingFor = new Map<PDFRef, { names: string[]; tiles: number } | null>(); // ref תמונה → שמות ההצללות (אריח אחד או יותר), או null אם לא נתמכת
  const shadingRefs = new Map<string, PDFRef>();
  const candidateRefs = new Set<PDFRef>();
  const stillUsed = new Set<PDFRef>();
  const pendingDeletes: { xo: PDFDict; name: string }[] = [];
  let counter = 0;
  let replaced = 0;

  for (const page of pdf.getPages()) {
    if (Date.now() - started > TIME_BUDGET_MS) break;
    const resources = page.node.Resources();
    const xo = resources?.lookupMaybe(PDFName.of("XObject"), PDFDict);
    if (!resources || !xo) continue;
    const cands: { name: string; ref: PDFRef; obj: PDFRawStream }[] = [];
    for (const key of xo.keys()) {
      const raw = xo.get(key);
      if (!(raw instanceof PDFRef)) continue;
      const obj = ctx.lookup(raw);
      if (!(obj instanceof PDFRawStream)) continue;
      if (String(obj.dict.get(PDFName.of("Subtype"))) !== "/Image") continue;
      if (obj.dict.get(PDFName.of("SMask")) || obj.dict.get(PDFName.of("Mask"))) continue;
      const w = Number(String(obj.dict.get(PDFName.of("Width"))));
      const h = Number(String(obj.dict.get(PDFName.of("Height"))));
      if (w < MIN_IMAGE_PX || h < MIN_IMAGE_PX * 0.3) continue;
      cands.push({ name: key.decodeText(), ref: raw, obj });
    }
    if (cands.length === 0) continue;

    const contents = page.node.Contents();
    const refs: PDFRef[] = contents instanceof PDFArray ? (contents.asArray() as PDFRef[]) : contents ? [page.node.get(PDFName.of("Contents")) as PDFRef] : [];
    const newRefs: PDFRef[] = [];
    const usedNames = new Set<string>();
    let pageChanged = false;

    for (const sref of refs) {
      const s = ctx.lookup(sref);
      if (!(s instanceof PDFRawStream)) {
        newRefs.push(sref);
        continue;
      }
      let text: string;
      try {
        text = Buffer.from(decodePDFRawStream(s).decode()).toString("latin1");
      } catch {
        newRefs.push(sref);
        continue;
      }
      let changed = false;
      for (const c of cands) {
        const nameRe = c.name.replace(/[^\w]/g, (ch) => "\\" + ch);
        const re = new RegExp(String.raw`((?:${CM})+)/${nameRe}\s+Do`, "g");
        const matches = [...text.matchAll(re)];
        if (matches.length === 0) continue;
        // הרשת נבנית פעם אחת לכל תמונה (גם אם מופיעה בכמה עמודים)
        if (!shadingFor.has(c.ref)) {
          let entry: { names: string[]; tiles: number } | null = null;
          const mesh = await built.get(c.ref);
          if (mesh) {
            const names: string[] = [];
            for (const part of mesh.parts) {
              const ref = ctx.register(
                ctx.stream(part.bytes, {
                  Filter: "FlateDecode",
                  ...(mesh.predictor ? { DecodeParms: { Predictor: 12, Colors: 7, BitsPerComponent: 8, Columns: part.cols } } : {}),
                  ShadingType: 5,
                  ColorSpace: "DeviceRGB",
                  BitsPerCoordinate: 16,
                  BitsPerComponent: 8,
                  VerticesPerRow: part.cols,
                  Decode: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
                }),
              );
              const nm = `LuzMesh${++counter}`;
              shadingRefs.set(nm, ref);
              names.push(nm);
            }
            entry = { names, tiles: mesh.tiles };
          }
          shadingFor.set(c.ref, entry);
        }
        const shEntry = shadingFor.get(c.ref);
        if (!shEntry) continue;
        text = text.replace(re, (all, chain: string) => {
          let e: M = [1, 0, 0, 1, 0, 0];
          for (const m of chain.matchAll(new RegExp(String.raw`(${NUM})\s+(${NUM})\s+(${NUM})\s+(${NUM})\s+(${NUM})\s+(${NUM})\s+cm`, "g"))) {
            e = mul([+m[1], +m[2], +m[3], +m[4], +m[5], +m[6]], e);
          }
          if (Math.hypot(e[0], e[1]) < MIN_PLACED_PT) return all; // תמונה קטנה בעמוד – משאירים
          changed = true;
          usedNames.add(c.name);
          const T = shEntry.tiles;
          if (T === 1) return `${chain}0 0 1 1 re W n /${shEntry.names[0]} sh`;
          // כל אריח: q [הסטה וקנה מידה] cm → חיתוך לריבוע היחידה → sh → Q (שורה ראשונה למעלה, y גדל כלפי מעלה)
          const k = 1 / T;
          const tilesOut = shEntry.names.map((nm, i) => {
            const tx = i % T;
            const ty = Math.floor(i / T);
            return `q ${k} 0 0 ${k} ${tx * k} ${1 - (ty + 1) * k} cm 0 0 1 1 re W n /${nm} sh Q`;
          });
          return `${chain}${tilesOut.join(" ")} `;
        });
      }
      if (!changed) {
        newRefs.push(sref);
        continue;
      }
      newRefs.push(ctx.register(ctx.flateStream(Buffer.from(text, "latin1"))));
      pageChanged = true;
    }
    if (!pageChanged) {
      for (const c of cands) stillUsed.add(c.ref);
      continue;
    }
    page.node.set(PDFName.of("Contents"), ctx.obj(newRefs));
    let shDict = resources.lookupMaybe(PDFName.of("Shading"), PDFDict);
    if (!shDict) {
      shDict = ctx.obj({});
      resources.set(PDFName.of("Shading"), shDict);
    }
    for (const c of cands) {
      if (usedNames.has(c.name)) {
        const shEntry = shadingFor.get(c.ref);
        if (shEntry) for (const nm of shEntry.names) shDict.set(PDFName.of(nm), shadingRefs.get(nm)!);
        pendingDeletes.push({ xo, name: c.name });
        candidateRefs.add(c.ref);
      } else {
        stillUsed.add(c.ref);
      }
    }
    replaced++;
  }
  for (const { xo, name } of pendingDeletes) xo.delete(PDFName.of(name));
  for (const ref of candidateRefs) if (!stillUsed.has(ref)) ctx.delete(ref);
  return replaced;
}
