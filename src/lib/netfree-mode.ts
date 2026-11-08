import "server-only";
import type { MeshOptions } from "./pdf-mesh-images";

/**
 * איך מכינים את רקעי השקפים בהורדת מצגת – לפי מי שמורידה (2026-11-09):
 *  - לא נטפרי (הדפדפן קבע nf=0 ברקע, ר' netfree-probe.ts): בלי המרה – התמונות המקוריות, ברזולוציה מלאה (~5MB).
 *  - נטפרי (nf=1) או לא ידוע: רקעים וקטוריים (נטפרי מחליף תמונות ב-PDF). כרום: 1024 עמודות + predictor (קל, ~18MB);
 *    כל קורא אחר (Edge וכו'): 2×2 רשתות של ~512 עמודות בלי predictor, עם כימות צבע (~39MB) – רק זה מוצג ב-Edge (נבדק, docs/netfree-techniques.md).
 *  - ?hq=1 ("הורדה בחדות מלאה"): רזולוציית המקור (1577 עמודות, 4×4 רשתות בלי predictor ובלי כימות) – כבד מאוד (~115MB).
 * ערך הקוקי נקבע בדפדפן ולכן ניתן לזיוף; ההשלכה היא רק על איכות הקובץ, לא על הרשאות.
 */
export type PresentationMesh = false | MeshOptions;

type Reqish = { headers: Headers; nextUrl?: { searchParams: URLSearchParams }; cookies?: { get(name: string): { value: string } | undefined } };

function cookieValue(req: Reqish, name: string): string | undefined {
  const viaApi = req.cookies?.get(name)?.value;
  if (viaApi !== undefined) return viaApi;
  const raw = req.headers.get("cookie") ?? "";
  const m = raw.split(";").map((p) => p.trim()).find((p) => p.startsWith(name + "="));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : undefined;
}

export function presentationMeshFor(req: Reqish): PresentationMesh {
  if (req.nextUrl?.searchParams.get("hq") === "1") return { cols: 1577, tiles: 4, predictor: false };
  if (cookieValue(req, "nf") === "0") return false;
  const ua = req.headers.get("user-agent") ?? "";
  const chromeOnly = /Chrome\//.test(ua) && !/Edg(e|A|iOS)?\//.test(ua) && !/OPR\//.test(ua);
  return chromeOnly ? { cols: 1024, predictor: true } : { cols: 1023, tiles: 2, predictor: false, quant: 4 };
}
