import "server-only";
import { PDFDocument } from "pdf-lib";

/**
 * "הורדה בחדות מלאה בשני חלקים": נטפרי חוסם PDF מעל ~20MB, ולכן מצגת בחדות גבוהה (שמוצגת גם ב-Edge) יורדת בכמה קבצים.
 * מחזירה PDF שמכיל רק את חלק `part` מתוך `of` (חלוקה לטווחי עמודים רצופים, כמעט שווים). בלי חלוקה – הקובץ כמו שהוא.
 */
export function pageRangeOfPart(totalPages: number, part: number, of: number): [number, number] {
  const per = Math.ceil(totalPages / of);
  const from = (part - 1) * per;
  return [from, Math.min(totalPages, from + per)]; // [from, to) לפי אינדקס מאפס
}

export async function pdfPart(bytes: Uint8Array, part: number, of: number): Promise<Uint8Array> {
  if (of <= 1) return bytes;
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const total = pdf.getPageCount();
  const [from, to] = pageRangeOfPart(total, part, of);
  for (let i = total - 1; i >= 0; i--) if (i < from || i >= to) pdf.removePage(i);
  return await pdf.save();
}
