import "server-only";
import sharp from "sharp";
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  PDFString,
  decodePDFRawStream,
} from "pdf-lib";
import { PDF_LOGO_ASPECT, PDF_LOGO_WHITE_ASPECT } from "./pdf-logo.generated";
import { vectorizeRgbaToPdfOps } from "./image-vectorize";

/**
 * מחליף תמונות גוף בתוך PDF שהומר (איורים, דיאגרמות, מפות) בציור וקטורי שלהן.
 *
 * למה: נטפרי מחליף כל תמונה בתוך PDF ב"התמונה לא נבדקה", אבל נתיבים וקטוריים עוברים (ר' docs/netfree.md).
 * לוגו הכותרת לא נוגעים בו כאן (נשאר ל-replaceHeaderLogoWithVector שרץ בהטבעת סימן המים).
 *
 * שיטה (באותה צורה כמו pdf-vector-logo.ts): ב-content stream של כל עמוד מחפשים `<שרשרת cm> /ImX Do`, מפענחים את
 * פיקסלי התמונה (DCT דרך sharp; Flate: RGB/Gray/Indexed + SMask/Mask), ממירים ל-Form XObject וקטורי יחיד לכל תמונה
 * (BBox [0 0 1 1] – אותו ריבוע יחידה שהתמונה מציירת) ומחליפים את `/ImX Do` ב-`/VecImgN Do` באותה מטריצת מיקום.
 * LibreOffice משתף לעיתים אותו מילון Resources בין כל העמודים, לכן תמונות ישנות נמחקות רק אחרי שעברנו על כולם
 * ורק אם אין להן שימוש שנשאר. לעולם לא זורק: כשל בתמונה בודדת – התמונה נשארת כמות שהיא.
 */

const NUM = String.raw`-?[\d.]+`;
const CM = String.raw`(?:${NUM}\s+){6}cm\s+`;
/** הוראות מצב גרפי שמותר שיופיעו בין ה-cm ל-Do (צבעי מילוי/קו, gs) – כך ב-PDF שהומר דרך Google Drive */
const STATE_OPS = String.raw`(?:(?:${NUM}\s+){1,4}(?:RG|rg|G|g|K|k)\s+|/[\w.+-]+\s+gs\s+|EMC\s+|/[\w.+-]+\s*(?:<<[^>]*>>\s*)?(?:BDC|BMC)\s+)*`;
type M = [number, number, number, number, number, number];
const mul = (m: M, e: M): M => [
  m[0] * e[0] + m[1] * e[2],
  m[0] * e[1] + m[1] * e[3],
  m[2] * e[0] + m[3] * e[2],
  m[2] * e[1] + m[3] * e[3],
  m[4] * e[0] + m[5] * e[2] + e[4],
  m[4] * e[1] + m[5] * e[3] + e[5],
];
function chainMatrix(chain: string): M {
  let e: M = [1, 0, 0, 1, 0, 0];
  for (const m of chain.matchAll(new RegExp(String.raw`(${NUM})\s+(${NUM})\s+(${NUM})\s+(${NUM})\s+(${NUM})\s+(${NUM})\s+cm`, "g"))) {
    e = mul([+m[1], +m[2], +m[3], +m[4], +m[5], +m[6]], e);
  }
  return e;
}

const MAX_PIXELS = 3_000_000;

/** בדיקה זולה על הבייטים הגולמיים: האם יש ב-PDF משהו מלבד לוגו הכותרת (תמונה אחת) – כדי לא לטעון/לפענח סתם */
export function pdfMayHaveBodyImages(pdf: Uint8Array): boolean {
  const text = Buffer.from(pdf.buffer, pdf.byteOffset, pdf.byteLength).toString("latin1");
  let n = 0;
  for (const _ of text.matchAll(/\/Subtype\s*\/Image\b/g)) {
    void _;
    if (++n >= 2) return true;
  }
  return false;
}

/* ------------------------------ פענוח פיקסלים ------------------------------ */
type Cs = { kind: "rgb" } | { kind: "gray" } | { kind: "indexed"; hival: number; palette: Uint8Array; base: "rgb" | "gray" };

const asNum = (v: unknown): number | undefined => (v instanceof PDFNumber ? v.asNumber() : undefined);
const nameOf = (v: unknown): string => (v instanceof PDFName ? v.decodeText() : "");

function filtersOf(dict: PDFDict, ctx: PDFDocument["context"]): string[] {
  const f = ctx.lookup(dict.get(PDFName.of("Filter")));
  if (f instanceof PDFName) return [f.decodeText()];
  if (f instanceof PDFArray) return f.asArray().map((x) => nameOf(ctx.lookup(x)));
  return [];
}

function csInfo(ctx: PDFDocument["context"], raw: unknown, depth = 0): Cs | null {
  const cs = ctx.lookup(raw as PDFRef);
  if (cs instanceof PDFName) {
    const n = cs.decodeText();
    if (n === "DeviceRGB" || n === "CalRGB") return { kind: "rgb" };
    if (n === "DeviceGray" || n === "CalGray") return { kind: "gray" };
    return null;
  }
  if (cs instanceof PDFArray && depth < 3) {
    const head = nameOf(ctx.lookup(cs.get(0)));
    if (head === "ICCBased") {
      const prof = ctx.lookup(cs.get(1));
      const dict = prof instanceof PDFRawStream ? prof.dict : prof instanceof PDFDict ? prof : null;
      const n = dict ? asNum(ctx.lookup(dict.get(PDFName.of("N")))) : undefined;
      return n === 3 ? { kind: "rgb" } : n === 1 ? { kind: "gray" } : null;
    }
    if (head === "CalRGB") return { kind: "rgb" };
    if (head === "CalGray") return { kind: "gray" };
    if (head === "Indexed" || head === "I") {
      const base = csInfo(ctx, cs.get(1), depth + 1);
      const hival = asNum(ctx.lookup(cs.get(2)));
      if (!base || base.kind === "indexed" || hival === undefined) return null;
      const lk = ctx.lookup(cs.get(3));
      let bytes: Uint8Array | null = null;
      if (lk instanceof PDFHexString || lk instanceof PDFString) bytes = lk.asBytes();
      else if (lk instanceof PDFRawStream) bytes = decodePDFRawStream(lk).decode();
      if (!bytes) return null;
      return { kind: "indexed", hival, palette: bytes, base: base.kind };
    }
  }
  return null;
}

/** מפרק שורות דחוסות-בתים של bpc ביטים לדגימות (ערך אחד לפיקסל) */
function unpackSamples(data: Uint8Array, w: number, h: number, ncomp: number, bpc: number): Uint8Array | null {
  const rowBytes = Math.ceil((w * ncomp * bpc) / 8);
  if (data.length < rowBytes * h) return null;
  const out = new Uint8Array(w * h * ncomp);
  if (bpc === 8) {
    for (let y = 0; y < h; y++) out.set(data.subarray(y * rowBytes, y * rowBytes + w * ncomp), y * w * ncomp);
    return out;
  }
  if (bpc !== 1 && bpc !== 2 && bpc !== 4) return null;
  const mask = (1 << bpc) - 1;
  for (let y = 0; y < h; y++) {
    for (let i = 0; i < w * ncomp; i++) {
      const bit = i * bpc;
      out[y * w * ncomp + i] = (data[y * rowBytes + (bit >> 3)] >> (8 - bpc - (bit & 7))) & mask;
    }
  }
  return out;
}

function flateBytes(stream: PDFRawStream): Uint8Array | null {
  try {
    return decodePDFRawStream(stream).decode();
  } catch {
    return null;
  }
}

/**
 * מפענח זרם CCITT Group 4 (K<0) של מסכת 1-ביט: עוטפים אותו במכולת TIFF מינימלית ונותנים ל-libtiff שבתוך sharp לפענח.
 * מחזיר דגימות PDF (0/1 לפיקסל; לפי BlackIs1 – ברירת מחדל שחור=0, לבן=1) או null אם לא נתמך.
 */
async function decodeCcittG4(ctx: PDFDocument["context"], stream: PDFRawStream, w: number, h: number): Promise<Uint8Array | null> {
  const dp0 = ctx.lookup(stream.dict.get(PDFName.of("DecodeParms")));
  const dp = dp0 instanceof PDFArray ? ctx.lookup(dp0.get(0)) : dp0;
  if (!(dp instanceof PDFDict)) return null;
  const K = asNum(ctx.lookup(dp.get(PDFName.of("K")))) ?? 0;
  const cols = asNum(ctx.lookup(dp.get(PDFName.of("Columns")))) ?? 1728;
  const blackIs1 = String(ctx.lookup(dp.get(PDFName.of("BlackIs1")))) === "true";
  const aligned = String(ctx.lookup(dp.get(PDFName.of("EncodedByteAlign")))) === "true";
  if (K >= 0 || aligned || cols !== w) return null;
  const data = stream.contents;
  // TIFF קטן-אנדיאן: כותרת 8 בתים | נתונים (מיושר ל-2) | IFD
  const dataLen = data.length + (data.length & 1);
  const ifdOff = 8 + dataLen;
  const entries: [number, number, number][] = [ // tag, type(3=SHORT,4=LONG), value
    [256, 4, w], [257, 4, h], [258, 3, 1], [259, 3, 4], [262, 3, 0], [273, 4, 8], [277, 3, 1], [278, 4, h], [279, 4, data.length], [293, 4, 0],
  ];
  const tiff = Buffer.alloc(ifdOff + 2 + entries.length * 12 + 4);
  tiff.write("II", 0, "latin1");
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(ifdOff, 4);
  Buffer.from(data).copy(tiff, 8);
  tiff.writeUInt16LE(entries.length, ifdOff);
  entries.forEach(([tag, type, val], i) => {
    const o = ifdOff + 2 + i * 12;
    tiff.writeUInt16LE(tag, o);
    tiff.writeUInt16LE(type, o + 2);
    tiff.writeUInt32LE(1, o + 4);
    if (type === 3) tiff.writeUInt16LE(val, o + 8);
    else tiff.writeUInt32LE(val, o + 8);
  });
  tiff.writeUInt32LE(0, ifdOff + 2 + entries.length * 12);
  const out = await sharp(tiff, { failOn: "none" }).greyscale().raw().toBuffer({ resolveWithObject: true });
  if (out.info.width !== w || out.info.height !== h || out.info.channels !== 1) return null;
  // sharp: לבן=255. דגימת PDF עם BlackIs1=false: לבן=1, שחור=0
  const res = new Uint8Array(w * h);
  for (let i = 0; i < res.length; i++) {
    const white = out.data[i] >= 128;
    res[i] = blackIs1 ? (white ? 0 : 1) : white ? 1 : 0;
  }
  return res;
}

/** מסכת אלפא 8-ביט (w*h) מ-SMask (Gray) או מ-/Mask (ImageMask); null = לא נתמך; undefined = אין (אטום) */
async function decodeAlpha(ctx: PDFDocument["context"], dict: PDFDict, w: number, h: number): Promise<Uint8Array | null | undefined> {
  const sm = ctx.lookup(dict.get(PDFName.of("SMask")));
  if (sm instanceof PDFRawStream) {
    const mw = asNum(ctx.lookup(sm.dict.get(PDFName.of("Width")))) ?? 0;
    const mh = asNum(ctx.lookup(sm.dict.get(PDFName.of("Height")))) ?? 0;
    const bpc = asNum(ctx.lookup(sm.dict.get(PDFName.of("BitsPerComponent")))) ?? 8;
    const flt = filtersOf(sm.dict, ctx);
    if (!mw || !mh || flt.some((x) => x !== "FlateDecode")) return null;
    const raw = flateBytes(sm);
    if (!raw) return null;
    const samples = unpackSamples(raw, mw, mh, 1, bpc);
    if (!samples) return null;
    const dec = ctx.lookup(sm.dict.get(PDFName.of("Decode")));
    const inv = dec instanceof PDFArray && asNum(ctx.lookup(dec.get(0))) === 1; // LibreOffice כותב /Decode [1 0]: 0 = אטום
    const scaled = samples.map((v) => {
      const a = bpc === 8 ? v : Math.round((v * 255) / ((1 << bpc) - 1));
      return inv ? 255 - a : a;
    });
    if (mw === w && mh === h) return scaled;
    const r = await sharp(Buffer.from(scaled), { raw: { width: mw, height: mh, channels: 1 } }).resize({ width: w, height: h, fit: "fill" }).raw().toBuffer();
    return new Uint8Array(r);
  }
  const mk = ctx.lookup(dict.get(PDFName.of("Mask")));
  if (mk instanceof PDFRawStream) {
    const mw = asNum(ctx.lookup(mk.dict.get(PDFName.of("Width")))) ?? 0;
    const mh = asNum(ctx.lookup(mk.dict.get(PDFName.of("Height")))) ?? 0;
    const flt = filtersOf(mk.dict, ctx);
    if (flt.length === 1 && (flt[0] === "FlateDecode" || flt[0] === "CCITTFaxDecode") && mw && mh) {
      let bits: Uint8Array | null;
      if (flt[0] === "CCITTFaxDecode") bits = await decodeCcittG4(ctx, mk, mw, mh);
      else {
        const raw = flateBytes(mk);
        bits = raw ? unpackSamples(raw, mw, mh, 1, 1) : null;
      }
      if (!bits) return mk.contents.length <= 64 ? undefined : null;
      const dec = ctx.lookup(mk.dict.get(PDFName.of("Decode")));
      const inverted = dec instanceof PDFArray && asNum(dec.get(0)) === 1;
      // ברירת מחדל: 1 = מוסתר
      const a = new Uint8Array(mw * mh);
      for (let i = 0; i < a.length; i++) a[i] = (bits[i] === 1) !== inverted ? 0 : 255;
      if (mw === w && mh === h) return a;
      const r = await sharp(Buffer.from(a), { raw: { width: mw, height: mh, channels: 1 } }).resize({ width: w, height: h, fit: "fill", kernel: "nearest" }).raw().toBuffer();
      return new Uint8Array(r);
    }
    // מסכה דחוסה בצורה שלא מפוענחת כאן (CCITT וכו'): זעירה מאוד = אחידה (כל התמונה גלויה) – אחרת לא נוגעים בתמונה
    return mk.contents.length <= 64 ? undefined : null;
  }
  return undefined; // /Mask כמערך (color-key) או חסר – מתעלמים
}

async function decodeImageToRgba(ctx: PDFDocument["context"], stream: PDFRawStream): Promise<{ rgba: Buffer; w: number; h: number } | null> {
  const d = stream.dict;
  const w = asNum(ctx.lookup(d.get(PDFName.of("Width")))) ?? 0;
  const h = asNum(ctx.lookup(d.get(PDFName.of("Height")))) ?? 0;
  if (!w || !h || w * h > MAX_PIXELS) return null;
  if (String(ctx.lookup(d.get(PDFName.of("ImageMask")))) === "true") return null; // תמונת-מסכה (סטנסיל) – לא נתמך
  const flt = filtersOf(d, ctx);
  const alpha = await decodeAlpha(ctx, d, w, h);
  if (alpha === null) return null;

  let rgb: Buffer; // w*h*3
  if (flt.length === 1 && flt[0] === "DCTDecode") {
    const cs = csInfo(ctx, d.get(PDFName.of("ColorSpace")));
    if (!cs || (cs.kind !== "rgb" && cs.kind !== "gray")) return null; // CMYK וכו' – לא נתמך
    const out = await sharp(Buffer.from(stream.contents), { failOn: "none" }).removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
    if (out.info.width !== w || out.info.height !== h || out.info.channels !== 3) return null;
    rgb = out.data;
  } else if (flt.length === 1 && flt[0] === "FlateDecode") {
    const cs = csInfo(ctx, d.get(PDFName.of("ColorSpace")));
    if (!cs) return null;
    const bpc = asNum(ctx.lookup(d.get(PDFName.of("BitsPerComponent")))) ?? 8;
    const raw = flateBytes(stream);
    if (!raw) return null;
    const ncomp = cs.kind === "rgb" ? 3 : 1;
    const samples = unpackSamples(raw, w, h, ncomp, bpc);
    if (!samples) return null;
    rgb = Buffer.alloc(w * h * 3);
    const scale = cs.kind === "indexed" ? 1 : 255 / ((1 << bpc) - 1);
    if (cs.kind === "rgb") {
      for (let i = 0; i < w * h * 3; i++) rgb[i] = Math.round(samples[i] * scale);
    } else if (cs.kind === "gray") {
      for (let i = 0; i < w * h; i++) rgb[i * 3] = rgb[i * 3 + 1] = rgb[i * 3 + 2] = Math.round(samples[i] * scale);
    } else {
      const pal = cs.palette;
      for (let i = 0; i < w * h; i++) {
        const idx = Math.min(samples[i], cs.hival);
        if (cs.base === "rgb") {
          rgb[i * 3] = pal[idx * 3] ?? 0;
          rgb[i * 3 + 1] = pal[idx * 3 + 1] ?? 0;
          rgb[i * 3 + 2] = pal[idx * 3 + 2] ?? 0;
        } else rgb[i * 3] = rgb[i * 3 + 1] = rgb[i * 3 + 2] = pal[idx] ?? 0;
      }
    }
  } else return null;

  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = rgb[i * 3];
    rgba[i * 4 + 1] = rgb[i * 3 + 1];
    rgba[i * 4 + 2] = rgb[i * 3 + 2];
    rgba[i * 4 + 3] = alpha ? alpha[i] : 255;
  }
  return { rgba, w, h };
}

/* ------------------------------ ההחלפה בעמודים ------------------------------ */
export type VectorizePdfOpts = {
  /** גבול זמן מוחלט (Date.now()+ms); אחרי שעבר לא מתחילים תמונות חדשות */
  deadline?: number;
  /** פלט: timedOut=true אם נשארו תמונות שלא טופלו כי נגמר הזמן (התוצאה חלקית – לא לשמור במטמון) */
  stats?: { timedOut: boolean };
  /** לוג פר-תמונה (לדיבוג/סקריפט) */
  onImage?: (info: { ref: string; w: number; h: number; ms: number; opsBytes: number; ok: boolean; reason?: string }) => void;
};

const isLogoAspect = (w: number, h: number) => {
  const a = w / h;
  return Math.abs(a - PDF_LOGO_ASPECT) <= 0.03 || Math.abs(a - PDF_LOGO_WHITE_ASPECT) <= 0.03;
};

/** מחזיר כמה תמונות (ייחודיות) הוחלפו בציור וקטורי. לא זורק. */
export async function vectorizePdfImages(pdf: PDFDocument, opts: VectorizePdfOpts = {}): Promise<number> {
  try {
    return await vectorizeInner(pdf, opts);
  } catch (e) {
    console.warn("[pdf-vectorize] נכשל, ה-PDF נשאר כפי שהוא:", e instanceof Error ? e.message : e);
    return 0;
  }
}

async function vectorizeInner(pdf: PDFDocument, opts: VectorizePdfOpts): Promise<number> {
  const ctx = pdf.context;
  const deadline = opts.deadline ?? Infinity;
  const formOf = new Map<string, PDFRef | null>(); // ref.tag -> Form (null = כשל/לא נתמך)
  const formNameOf = new Map<string, string>(); // ref.tag -> שם ה-Form (VecImgN)
  const pendingDeletes: { xo: PDFDict; name: string; ref: PDFRef }[] = [];
  const refTag = (r: PDFRef) => r.toString();

  const ensureForm = async (ref: PDFRef, stream: PDFRawStream): Promise<PDFRef | null> => {
    const tag = refTag(ref);
    if (formOf.has(tag)) return formOf.get(tag)!;
    if (Date.now() > deadline) {
      if (opts.stats) opts.stats.timedOut = true;
      return null; // הזמן נגמר – התמונה נשארת רסטר
    }
    const t0 = Date.now();
    let result: PDFRef | null = null;
    let info: { w: number; h: number; opsBytes: number; ok: boolean; reason?: string } = { w: 0, h: 0, opsBytes: 0, ok: false };
    try {
      const img = await decodeImageToRgba(ctx, stream);
      if (!img) {
        info = { ...info, reason: "unsupported" };
      } else {
        const ops = await vectorizeRgbaToPdfOps(img.rgba, img.w, img.h, { deadline: Math.min(deadline, Date.now() + 25_000) });
        if (opts.stats && Date.now() > deadline) opts.stats.timedOut = true;
        if (!ops) info = { w: img.w, h: img.h, opsBytes: 0, ok: false, reason: "empty" };
        else {
          result = ctx.register(
            ctx.flateStream(Buffer.from(ops, "latin1"), { Type: "XObject", Subtype: "Form", BBox: [0, 0, 1, 1], Resources: ctx.obj({}) }),
          );
          info = { w: img.w, h: img.h, opsBytes: ops.length, ok: true };
        }
      }
    } catch (e) {
      console.warn("[pdf-vectorize] תמונה נכשלה:", e instanceof Error ? e.message : e);
      info = { ...info, reason: "error: " + (e instanceof Error ? e.message : String(e)) };
    }
    formOf.set(tag, result);
    if (result) formNameOf.set(tag, `VecImg${formNameOf.size + 1}`);
    opts.onImage?.({ ref: tag, ms: Date.now() - t0, ...info });
    return result;
  };

  const pageData: { page: ReturnType<PDFDocument["getPages"]>[number]; xo: PDFDict; cands: { name: string; ref: PDFRef; stream: PDFRawStream; w: number; h: number }[] }[] = [];
  for (const page of pdf.getPages()) {
    const xo = page.node.Resources()?.lookupMaybe(PDFName.of("XObject"), PDFDict);
    if (!xo) continue;
    const cands: { name: string; ref: PDFRef; stream: PDFRawStream; w: number; h: number }[] = [];
    for (const key of xo.keys()) {
      const raw = xo.get(key);
      if (!(raw instanceof PDFRef)) continue;
      const obj = ctx.lookup(raw);
      if (!(obj instanceof PDFRawStream) || nameOf(obj.dict.get(PDFName.of("Subtype"))) !== "Image") continue;
      const w = asNum(ctx.lookup(obj.dict.get(PDFName.of("Width")))) ?? 0;
      const h = asNum(ctx.lookup(obj.dict.get(PDFName.of("Height")))) ?? 0;
      if (!w || !h) continue;
      cands.push({ name: key.decodeText(), ref: raw, stream: obj, w, h });
    }
    if (cands.length) pageData.push({ page, xo, cands });
  }

  // (מיקום: קצה עליון בעשירית העליונה של העמוד – כדי שאייקון נורה בגודל ובפרופורציות של הלוגו, שיושב בשליש העליון, לא ייחשב לוגו.)
  // לוגו כותרת שחוזר ברוב העמודים (גם ב-PDF של Google Drive, שבו מערכת הצירים הפוכה ולכן בדיקת המיקום לא תופסת אותו) – לא נוגעים
  const drawnOnPages = new Map<string, number>();
  for (const { page, cands } of pageData) {
    const contents = page.node.Contents();
    const prefs: PDFRef[] = contents instanceof PDFArray ? (contents.asArray() as PDFRef[]) : contents ? [page.node.get(PDFName.of("Contents")) as PDFRef] : [];
    const seen = new Set<string>();
    for (const sref of prefs) {
      const st = ctx.lookup(sref);
      if (!(st instanceof PDFRawStream)) continue;
      let tx: string;
      try {
        tx = Buffer.from(decodePDFRawStream(st).decode()).toString("latin1");
      } catch {
        continue;
      }
      for (const c of cands) {
        if (isLogoAspect(c.w, c.h) && new RegExp(String.raw`/${c.name.replace(/[^\w]/g, (ch) => "\\" + ch)}\s+Do\b`).test(tx)) seen.add(refTag(c.ref));
      }
    }
    for (const t of seen) drawnOnPages.set(t, (drawnOnPages.get(t) ?? 0) + 1);
  }
  const pageCount = pdf.getPageCount();

  const touchedRefs = new Map<string, PDFRef>(); // תמונות שהוחלפו בלפחות עמוד אחד
  for (const { page, xo, cands } of pageData) {
    const contents = page.node.Contents();
    const refs: PDFRef[] = contents instanceof PDFArray ? (contents.asArray() as PDFRef[]) : contents ? [page.node.get(PDFName.of("Contents")) as PDFRef] : [];
    const pageH = page.getHeight();
    const texts: (string | null)[] = refs.map((sref) => {
      const s = ctx.lookup(sref);
      if (!(s instanceof PDFRawStream)) return null;
      try {
        return Buffer.from(decodePDFRawStream(s).decode()).toString("latin1");
      } catch {
        return null;
      }
    });

    // שלב א: אילו תמונות באמת מצוירות בעמוד הזה (ולא כלוגו כותרת)
    type Hit = { cand: (typeof cands)[number]; re: RegExp };
    const hits: Hit[] = [];
    for (const c of cands) {
      const nameRe = c.name.replace(/[^\w]/g, (ch) => "\\" + ch);
      hits.push({ cand: c, re: new RegExp(String.raw`((?:${CM})+)(${STATE_OPS})/${nameRe}\s+Do`, "g") });
    }
    const isLogoPlacement = (c: (typeof cands)[number], chain: string) => {
      if (!isLogoAspect(c.w, c.h)) return false;
      const e = chainMatrix(chain);
      const widthPt = Math.hypot(e[0], e[1]);
      if (widthPt >= 30 && widthPt <= 200 && (drawnOnPages.get(refTag(c.ref)) ?? 0) >= Math.max(2, pageCount * 0.5)) return true;
      return widthPt >= 30 && widthPt <= 200 && Math.abs(e[1]) <= 0.01 && Math.abs(e[2]) <= 0.01 && Math.max(e[5], e[5] + e[3]) > pageH * 0.9;
    };
    const skipChain = (chain: string) => {
      const e = chainMatrix(chain);
      return Math.hypot(e[0], e[1]) < 2 || Math.hypot(e[2], e[3]) < 2;
    };
    const wanted = new Map<string, (typeof cands)[number]>();
    for (const t of texts) {
      if (t === null) continue;
      for (const { cand, re } of hits) {
        for (const m of t.matchAll(re)) {
          if (isLogoPlacement(cand, m[1]) || skipChain(m[1])) continue;
          wanted.set(cand.name, cand);
        }
      }
    }
    if (wanted.size === 0) continue;

    // שלב ב: יצירת הציורים הוקטוריים (פעם אחת לכל תמונה)
    const formName = new Map<string, string>(); // שם תמונה בעמוד -> שם ה-Form
    for (const c of wanted.values()) {
      const form = await ensureForm(c.ref, c.stream);
      if (!form) continue;
      const nm = formNameOf.get(refTag(c.ref))!;
      formName.set(c.name, nm);
      xo.set(PDFName.of(nm), form);
    }
    if (formName.size === 0) continue;

    // שלב ג: החלפה בפועל
    const newRefs: PDFRef[] = [];
    let pageChanged = false;
    for (let i = 0; i < refs.length; i++) {
      let t = texts[i];
      if (t === null) {
        newRefs.push(refs[i]);
        continue;
      }
      let changed = false;
      for (const { cand, re } of hits) {
        const nm = formName.get(cand.name);
        if (!nm) continue;
        t = t.replace(re, (all, chain: string, mid: string) => {
          if (isLogoPlacement(cand, chain) || skipChain(chain)) return all;
          changed = true;
          touchedRefs.set(refTag(cand.ref), cand.ref);
          return `${chain}${mid}/${nm} Do`;
        });
      }
      if (!changed) {
        newRefs.push(refs[i]);
        continue;
      }
      texts[i] = t;
      newRefs.push(ctx.register(ctx.flateStream(Buffer.from(t, "latin1"))));
      pageChanged = true;
    }
    if (!pageChanged) continue;
    page.node.set(PDFName.of("Contents"), ctx.obj(newRefs));
    for (const c of cands) if (formName.has(c.name)) pendingDeletes.push({ xo, name: c.name, ref: c.ref });
  }

  // מחיקת הפניות התמונה המקורית רק אחרי שעברנו על כל העמודים, ורק לתמונות שאין להן שימוש שנשאר באף עמוד
  // (תמונה שעמוד כלשהו עדיין מציג – כולל עמוד שלא עובד – נשארת)
  const keepKeys = new Set<string>(); // "ref|name" שעדיין מופיע ב-content stream כלשהו
  for (const { page, cands } of pageData) {
    const contents = page.node.Contents();
    const refs: PDFRef[] = contents instanceof PDFArray ? (contents.asArray() as PDFRef[]) : contents ? [page.node.get(PDFName.of("Contents")) as PDFRef] : [];
    for (const sref of refs) {
      const s = ctx.lookup(sref);
      if (!(s instanceof PDFRawStream)) continue;
      let t: string;
      try {
        t = Buffer.from(decodePDFRawStream(s).decode()).toString("latin1");
      } catch {
        continue;
      }
      for (const c of cands) {
        if (new RegExp(String.raw`/${c.name.replace(/[^\w]/g, (ch) => "\\" + ch)}\s+Do\b`).test(t)) keepKeys.add(refTag(c.ref) + "|" + c.name);
      }
    }
  }
  const deletedRefs = new Map<string, PDFRef>();
  for (const pd of pendingDeletes) {
    if (keepKeys.has(refTag(pd.ref) + "|" + pd.name)) continue;
    pd.xo.delete(PDFName.of(pd.name));
    deletedRefs.set(refTag(pd.ref), pd.ref);
  }
  // תמונה שעדיין יש לה שם שמופנה אליו מאיזשהו מילון XObject – לא מוחקים את האובייקט
  const stillReferenced = new Set<string>();
  const scanXo = (xo: PDFDict) => {
    for (const k of xo.keys()) {
      const v = xo.get(k);
      if (v instanceof PDFRef) stillReferenced.add(refTag(v));
    }
  };
  for (const { xo } of pageData) scanXo(xo);

  const toDelete = [...deletedRefs.entries()].filter(([tag]) => !stillReferenced.has(tag)).map(([, r]) => r);
  // אובייקטי SMask/Mask של התמונות שנמחקות (אם לא מוזכרים על ידי תמונה שנשארה)
  const maskRefs = new Map<string, PDFRef>();
  for (const r of toDelete) {
    const s = ctx.lookup(r);
    if (!(s instanceof PDFRawStream)) continue;
    for (const k of ["SMask", "Mask"]) {
      const v = s.dict.get(PDFName.of(k));
      if (v instanceof PDFRef) maskRefs.set(refTag(v), v);
    }
  }
  const deleteTags = new Set(toDelete.map(refTag));
  if (maskRefs.size) {
    for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
      if (deleteTags.has(refTag(ref))) continue;
      if (!(obj instanceof PDFRawStream) || nameOf(obj.dict.get(PDFName.of("Subtype"))) !== "Image") continue;
      for (const k of ["SMask", "Mask"]) {
        const v = obj.dict.get(PDFName.of(k));
        if (v instanceof PDFRef) maskRefs.delete(refTag(v));
      }
    }
  }
  for (const r of toDelete) ctx.delete(r);
  for (const r of maskRefs.values()) ctx.delete(r);
  return touchedRefs.size;
}
