import "server-only";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef, decodePDFRawStream } from "pdf-lib";
import { PDF_LOGO_ASPECT, PDF_LOGO_OPS, PDF_LOGO_WHITE_ASPECT, PDF_LOGO_WHITE_OPS } from "./pdf-logo.generated";

/**
 * מחליף את תמונת לוגו הכותרת ב-PDF בציור וקטורי שלו (נתיבי PDF בצבעים שטוחים).
 *
 * למה: נטפרי מחליף כל תמונה בתוך PDF ב"התמונה לא נבדקה לפי הגדרותיך" (נראה כריבוע מטושטש במקום הלוגו),
 * אבל נתיבים וקטוריים עוברים בלי שינוי (נבדק ב-/netfree-test/, 2026-11-08). ר' docs/netfree.md.
 *
 * שני לוגואים (נוצרים ב-scripts/gen-pdf-logo.cjs), כל אחד כ-Form XObject שנוצר פעם אחת ומוזכר מכל עמוד באותה מטריצת
 * מיקום של התמונה:
 *  - הלוגו הצבעוני בכותרת דפי Word שהומרו (יחס 16:9): `… cm /ImX Do` → `… cm /LuzLogoVec Do`;
 *  - הלוגו הלבן בכותרת מצגות (יחס 1491:871): המצגת מציירת אותו 7 פעמים בהיסט קטן (אפקט קו מתאר) – משאירים ציור אחד.
 * זיהוי: יחס התמונה + רוחב מוצג 30–200 נק' + שליש עליון של העמוד – כדי לא לגעת באיורים בתוכן.
 * מטריצות cm עוקבות (שרשרת) מחושבות יחד. מחזיר כמה עמודים השתנו.
 */
type Kind = { name: string; aspect: number; ops: string; dedupe: boolean };
const KINDS: Kind[] = [
  { name: "LuzLogoVec", aspect: PDF_LOGO_ASPECT, ops: PDF_LOGO_OPS, dedupe: false },
  { name: "LuzLogoWhiteVec", aspect: PDF_LOGO_WHITE_ASPECT, ops: PDF_LOGO_WHITE_OPS, dedupe: true },
];

type M = [number, number, number, number, number, number];
/** CTM' = M × CTM (סדר ההחלה של cm ב-PDF) */
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

export function replaceHeaderLogoWithVector(pdf: PDFDocument): number {
  const ctx = pdf.context;
  const formRefs = new Map<string, PDFRef>();
  const formFor = (k: Kind) => {
    let r = formRefs.get(k.name);
    if (!r) {
      r = ctx.register(
        ctx.flateStream(Buffer.from(k.ops, "latin1"), { Type: "XObject", Subtype: "Form", BBox: [0, 0, 1, 1], Resources: ctx.obj({}) }),
      );
      formRefs.set(k.name, r);
    }
    return r;
  };
  let replaced = 0;
  const candidateRefs = new Set<PDFRef>();
  const stillUsed = new Set<PDFRef>();
  // LibreOffice משתף לעיתים אותו מילון Resources בין כל העמודים: מוחקים את התמונה רק אחרי שעברנו על כל העמודים
  const pendingDeletes: { xo: PDFDict; name: string }[] = [];

  for (const page of pdf.getPages()) {
    const resources = page.node.Resources();
    const xo = resources?.lookupMaybe(PDFName.of("XObject"), PDFDict);
    if (!xo) continue;
    // תמונות שיחס הצלעות שלהן כמו של אחד הלוגואים (מועמדות)
    const cands: { name: string; ref: PDFRef; kind: Kind }[] = [];
    for (const key of xo.keys()) {
      const raw = xo.get(key);
      if (!(raw instanceof PDFRef)) continue;
      const obj = ctx.lookup(raw);
      if (!(obj instanceof PDFRawStream)) continue;
      if (String(obj.dict.get(PDFName.of("Subtype"))) !== "/Image") continue;
      const w = Number(String(obj.dict.get(PDFName.of("Width"))));
      const h = Number(String(obj.dict.get(PDFName.of("Height"))));
      if (!w || !h || w > 2000) continue;
      const kind = KINDS.find((k) => Math.abs(w / h - k.aspect) <= 0.03);
      if (kind) cands.push({ name: key.decodeText(), ref: raw, kind });
    }
    if (cands.length === 0) continue;

    const contents = page.node.Contents();
    const refs: PDFRef[] = contents instanceof PDFArray ? (contents.asArray() as PDFRef[]) : contents ? [page.node.get(PDFName.of("Contents")) as PDFRef] : [];
    const pageH = page.getHeight();
    const usedNames = new Set<string>();
    const doneKinds = new Set<string>(); // לוגו שכבר צויר בעמוד הזה (לכפילויות)
    const newRefs: PDFRef[] = [];
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
        text = text.replace(re, (all, chain: string) => {
          let e: M = [1, 0, 0, 1, 0, 0];
          for (const m of chain.matchAll(new RegExp(String.raw`(${NUM})\s+(${NUM})\s+(${NUM})\s+(${NUM})\s+(${NUM})\s+(${NUM})\s+cm`, "g"))) {
            e = mul([+m[1], +m[2], +m[3], +m[4], +m[5], +m[6]], e);
          }
          const widthPt = Math.hypot(e[0], e[1]);
          if (widthPt < 30 || widthPt > 200 || Math.abs(e[1]) > 0.01 || Math.abs(e[2]) > 0.01 || !(e[5] > pageH * 0.66 || e[5] + e[3] > pageH * 0.66)) return all;
          changed = true;
          usedNames.add(c.name);
          if (c.kind.dedupe && doneKinds.has(c.kind.name)) return ""; // עותק נוסף של אותו לוגו – מוסרים
          doneKinds.add(c.kind.name);
          return `${chain}/${c.kind.name} Do`;
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
    for (const c of cands) {
      if (usedNames.has(c.name)) {
        xo.set(PDFName.of(c.kind.name), formFor(c.kind));
        pendingDeletes.push({ xo, name: c.name });
        candidateRefs.add(c.ref);
      } else {
        stillUsed.add(c.ref);
      }
    }
    replaced++;
  }
  for (const { xo, name } of pendingDeletes) xo.delete(PDFName.of(name));
  // תמונות הלוגו שכבר אין להן הפניה – מוחקים מהקובץ (חוסך מקום ולא משאיר תמונה ש"תטושטש")
  for (const ref of candidateRefs) if (!stillUsed.has(ref)) ctx.delete(ref);
  return replaced;
}
