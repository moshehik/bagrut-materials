import { isOfficeMime } from "./driveBridgeCore";

/** סוגי Office לפי סיומת – כשה-mime שנשמר בחומר אינו של Office (למשל octet-stream מסנכרון הדרייב) */
const MIME_BY_EXT: Record<string, string> = {
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".ppt": "application/vnd.ms-powerpoint",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
};

/**
 * ה-mime שנשלח להמרה ל-PDF: אם material.mime הוא mime של Office – הוא; אחרת נגזר מסיומת
 * הקובץ (.docx/.pptx/.xlsx וכו'); ואם גם זה לא – המקורי כפי שהוא.
 */
export function officeMimeFor(mime: string, fileName: string): string {
  if (isOfficeMime(mime)) return mime;
  const dot = fileName.lastIndexOf(".");
  const ext = dot > 0 ? fileName.slice(dot).toLowerCase() : "";
  return MIME_BY_EXT[ext] ?? mime;
}
