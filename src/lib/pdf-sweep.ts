import "server-only";
import { PDFArray, PDFDict, PDFDocument, PDFObject, PDFRef, PDFStream } from "pdf-lib";

/**
 * מוחק מה-PDF כל אובייקט שאין אליו הפניה מהמסמך (mark & sweep מהקטלוג וה-trailer).
 *
 * למה: כשמחליפים תמונה בציור וקטורי (לוגו / רקעי שקפים / איורים) מוחקים את אובייקט התמונה, אבל מסכת השקיפות שלה (SMask) ושאר
 * "יתומים" נשארים בקובץ. נטפרי סורק את כל אובייקטי ה-PDF, ושלושה אובייקטי תמונה יתומים מספיקים כדי שיציג בהורדה
 * "הקובץ יסונן" (נמצא במצגות, 2026-11-09). אחרי הניקוי גם הקובץ קטן יותר.
 * מחזיר כמה אובייקטים נמחקו.
 */
export function sweepUnreferencedObjects(pdf: PDFDocument): number {
  const ctx = pdf.context;
  const seen = new Set<string>();
  const stack: PDFObject[] = [];
  const push = (o: PDFObject | undefined) => {
    if (o) stack.push(o);
  };
  push(ctx.trailerInfo.Root);
  push(ctx.trailerInfo.Info);
  push(ctx.trailerInfo.Encrypt);
  push(ctx.trailerInfo.ID);

  while (stack.length) {
    const o = stack.pop()!;
    if (o instanceof PDFRef) {
      const key = o.toString();
      if (seen.has(key)) continue;
      seen.add(key);
      const target = ctx.lookup(o);
      if (target) stack.push(target);
    } else if (o instanceof PDFDict) {
      for (const v of o.values()) stack.push(v);
    } else if (o instanceof PDFArray) {
      for (const v of o.asArray()) stack.push(v);
    } else if (o instanceof PDFStream) {
      stack.push(o.dict);
    }
  }

  let removed = 0;
  for (const [ref] of ctx.enumerateIndirectObjects()) {
    if (!seen.has(ref.toString())) {
      ctx.delete(ref);
      removed++;
    }
  }
  return removed;
}
