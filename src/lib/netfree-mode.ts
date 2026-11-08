import "server-only";
import type { MeshOptions } from "./pdf-mesh-images";

/**
 * איך מכינים את רקעי השקפים בהורדה / צפייה במצגת – לפי מי שמורידה (2026-11-09):
 *  - לא בנטפרי (הדפדפן קבע nf=0 ברקע, ר' netfree-probe.ts): בלי המרה – התמונות המקוריות (~5MB למצגת של 18 שקפים).
 *  - בנטפרי (nf=1) או לא ידוע: רקעים וקטוריים (נטפרי מחליף תמונות ב-PDF), בגודל מוגבל לפי סולם הגדרות (ר' ladder ב-pdf-mesh-images.ts):
 *      הורדה רגילה – עד ~20MB; "הורדה בחדות מלאה" (?hq=1) – עד ~35MB; צפייה באתר – 512 עמודות רגיל (קל).
 *    כרום: אפשר predictor (קל יותר); קורא אחר (Edge וכו'): רק בלי predictor ועם רשתות עד ~150 אלף קודקודים (tiles) – נבדק, docs/netfree-techniques.md.
 * ערך הקוקי נקבע בדפדפן ולכן ניתן לזיוף; ההשלכה רק על איכות הקובץ, לא על הרשאות. מצב ההורדה נרשם ביומן (details.presentation ב-action download).
 */
export type PresentationMesh = false | MeshOptions;
export const HQ_MAX_BYTES = 35 * 1024 * 1024;
export const STD_MAX_BYTES = 20 * 1024 * 1024;

type Reqish = { headers: Headers; nextUrl?: { searchParams: URLSearchParams }; cookies?: { get(name: string): { value: string } | undefined } };

function cookieValue(req: Reqish, name: string): string | undefined {
  const viaApi = req.cookies?.get(name)?.value;
  if (viaApi !== undefined) return viaApi;
  const raw = req.headers.get("cookie") ?? "";
  const m = raw.split(";").map((p) => p.trim()).find((p) => p.startsWith(name + "="));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : undefined;
}

/** nf מהקוקי: "1" = מסנן זוהה, "0" = לא, null = לא ידוע (עוד לא נבדק / בלי קוקיז) */
export function netfreeState(req: Reqish): "1" | "0" | null {
  const v = cookieValue(req, "nf");
  return v === "1" || v === "0" ? v : null;
}

function isChromeOnly(req: Reqish) {
  const ua = req.headers.get("user-agent") ?? "";
  return /Chrome\//.test(ua) && !/Edg(e|A|iOS)?\//.test(ua) && !/OPR\//.test(ua);
}

const MB = 1048576;
// הערכות גודל לתמונה, נמדדו על מצגת "פרק י" (18 שקפים, 2026-11-09)
const CHROME_LADDER = [
  { opts: { cols: 1578, predictor: true }, estBytesPerImage: 1.75 * MB },
  { opts: { cols: 1280, predictor: true }, estBytesPerImage: 1.45 * MB },
  { opts: { cols: 1024, predictor: true }, estBytesPerImage: 1.0 * MB },
  { opts: { cols: 512, predictor: false }, estBytesPerImage: 0.8 * MB },
];
const OTHER_LADDER = [
  { opts: { cols: 1577, tiles: 4, predictor: false }, estBytesPerImage: 6.5 * MB },
  { opts: { cols: 1023, tiles: 2, predictor: false }, estBytesPerImage: 2.85 * MB },
  { opts: { cols: 1023, tiles: 2, predictor: false, quant: 4 }, estBytesPerImage: 2.2 * MB },
  { opts: { cols: 1023, tiles: 2, predictor: false, quant: 8 }, estBytesPerImage: 1.9 * MB },
  { opts: { cols: 767, tiles: 2, predictor: false, quant: 4 }, estBytesPerImage: 1.35 * MB },
  { opts: { cols: 512, predictor: false }, estBytesPerImage: 0.8 * MB },
];

/** הורדת מצגת (וגם תיקיית קבצים) */
export function presentationMeshFor(req: Reqish): PresentationMesh {
  const hq = req.nextUrl?.searchParams.get("hq") === "1";
  if (!hq && netfreeState(req) === "0") return false;
  return { ladder: isChromeOnly(req) ? CHROME_LADDER : OTHER_LADDER, maxBytes: hq ? HQ_MAX_BYTES : STD_MAX_BYTES };
}

/** צפייה במצגת באתר: מי שלא בנטפרי – הקובץ כמו שהוא; מי שבנטפרי – 512 עמודות (קל ומוצג בכל קורא) */
export function presentationPreviewMeshFor(req: Reqish): PresentationMesh {
  return netfreeState(req) === "0" ? false : { cols: 512, predictor: false };
}

/** לתיעוד ביומן: האם המחשב היה מאחורי נטפרי (לפי הבדיקה ברקע בדפדפן), באיזה דפדפן ואיך הוכן הקובץ */
export function describeMeshMode(req: Reqish, mesh: PresentationMesh) {
  const nf = netfreeState(req);
  const ua = req.headers.get("user-agent") ?? "";
  return {
    netfree: nf === "1" ? "yes" : nf === "0" ? "no" : "unknown",
    hq: req.nextUrl?.searchParams.get("hq") === "1",
    browser: isChromeOnly(req) ? "chrome" : /Edg\//.test(ua) ? "edge" : "other",
    mesh: mesh === false ? "original-images" : mesh.ladder ? `ladder(${Math.round((mesh.maxBytes ?? 0) / MB)}MB)` : `cols${mesh.cols ?? ""}`,
  };
}
