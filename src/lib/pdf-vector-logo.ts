import "server-only";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef, decodePDFRawStream } from "pdf-lib";
import { PDF_LOGO_ASPECT, PDF_LOGO_OPS } from "./pdf-logo.generated";

/**
 * מחליף את תמונת לוגו הכותרת ב-PDF שהומר מ-Word בציור וקטורי שלו (נתיבי PDF בצבעים שטוחים).
 *
 * למה: נטפרי מחליף כל תמונה בתוך PDF ב"התמונה לא נבדקה לפי הגדרותיך" (נראה כריבוע מטושטש במקום הלוגו),
 * אבל נתיבים וקטוריים ויזואליים עוברים בלי שינוי (נבדק ב-/netfree-test/pdf-1-plain.pdf, 2026-11-08).
 * הלוגו מצויר פעם אחת כ-Form XObject (נוצר ע"י scripts/gen-pdf-logo.cjs) ומוזכר מכל עמוד באותה מטריצת מיקום
 * (`q a 0 0 d e f cm /ImX Do Q` → `/LuzLogoVec Do`), כך שהמיקום והגודל נשארים כמו בתמונה.
 *
 * מזהה את הלוגו לפי יחס 16:9 של התמונה + גודל מוצג קטן (30–200 נק' רוחב) בחלק העליון של העמוד – כדי לא לגעת
 * באיורים בתוכן הדף. מחזיר כמה מקומות הוחלפו.
 */
const FORM_NAME = "LuzLogoVec";

export function replaceHeaderLogoWithVector(pdf: PDFDocument): number {
  const ctx = pdf.context;
  let formRef: PDFRef | null = null;
  let replaced = 0;
  const candidateRefs = new Set<PDFRef>();
  const stillUsed = new Set<PDFRef>();
  // LibreOffice משתף לעיתים אותו מילון Resources בין כל העמודים: מוחקים את התמונה רק אחרי שעברנו על כל העמודים
  const pendingDeletes: { xo: PDFDict; name: string }[] = [];

  for (const page of pdf.getPages()) {
    const resources = page.node.Resources();
    const xo = resources?.lookupMaybe(PDFName.of("XObject"), PDFDict);
    if (!xo) continue;
    // תמונות 16:9 קטנות (מועמדות ללוגו)
    const cands: { name: string; ref: PDFRef }[] = [];
    for (const key of xo.keys()) {
      const raw = xo.get(key);
      if (!(raw instanceof PDFRef)) continue;
      const obj = ctx.lookup(raw);
      if (!(obj instanceof PDFRawStream)) continue;
      if (String(obj.dict.get(PDFName.of("Subtype"))) !== "/Image") continue;
      const w = Number(String(obj.dict.get(PDFName.of("Width"))));
      const h = Number(String(obj.dict.get(PDFName.of("Height"))));
      if (!w || !h || Math.abs(w / h - PDF_LOGO_ASPECT) > 0.03 || w > 1600) continue;
      cands.push({ name: key.decodeText(), ref: raw });
    }
    if (cands.length === 0) continue;

    const contents = page.node.Contents();
    const refs: PDFRef[] = contents instanceof PDFArray ? (contents.asArray() as PDFRef[]) : contents ? [page.node.get(PDFName.of("Contents")) as PDFRef] : [];
    const pageH = page.getHeight();
    const usedNames = new Set<string>();
    const newRefs: PDFRef[] = [];
    let pageChanged = false;

    for (const sref of refs) {
      const s = ctx.lookup(sref);
      if (!(s instanceof PDFRawStream)) { newRefs.push(sref); continue; }
      let text: string;
      try {
        text = Buffer.from(decodePDFRawStream(s).decode()).toString("latin1");
      } catch {
        newRefs.push(sref);
        continue;
      }
      let changed = false;
      for (const c of cands) {
        const num = String.raw`(-?[\d.]+)`;
        const nameRe = c.name.replace(/[^\w]/g, (ch) => "\\" + ch);
        const re = new RegExp(String.raw`${num}\s+${num}\s+${num}\s+${num}\s+${num}\s+${num}\s+cm\s+/${nameRe}\s+Do`, "g");
        text = text.replace(re, (all, a, b, cc, d, e, f) => {
          const [A, B, C, D, F] = [a, b, cc, d, f].map(Number);
          const widthPt = Math.hypot(A, B);
          // לוגו הכותרת: רוחב 30–200 נק', ללא הטיה, בשליש העליון של העמוד
          if (widthPt < 30 || widthPt > 200 || Math.abs(B) > 0.01 || Math.abs(C) > 0.01 || !(F > pageH * 0.66 || F + D > pageH * 0.66)) return all;
          changed = true;
          usedNames.add(c.name);
          return `${a} ${b} ${cc} ${d} ${e} ${f} cm /${FORM_NAME} Do`;
        });
      }
      if (!changed) { newRefs.push(sref); continue; }
      newRefs.push(ctx.register(ctx.flateStream(Buffer.from(text, "latin1"))));
      pageChanged = true;
    }
    if (!pageChanged) {
      for (const c of cands) stillUsed.add(c.ref);
      continue;
    }

    if (!formRef) {
      formRef = ctx.register(
        ctx.flateStream(Buffer.from(PDF_LOGO_OPS, "latin1"), {
          Type: "XObject",
          Subtype: "Form",
          BBox: [0, 0, 1, 1],
          Resources: ctx.obj({}),
        }),
      );
    }
    page.node.set(PDFName.of("Contents"), ctx.obj(newRefs));
    xo.set(PDFName.of(FORM_NAME), formRef);
    for (const c of cands) {
      if (usedNames.has(c.name)) {
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
