/**
 * לוגיקה טהורה (בלי DB/דרייב/server-only) של "גרסה פרטית מתוקנת" של חומר למורה אחת – משותפת למסלולי ההגשה
 * (/api/preview, /api/download, /api/download-folder), לכרטיסייה ולסקריפט הסוכן. נבדקת ב-scripts/private-versions.test.ts.
 * הרקע: src/lib/private-versions.ts (קריאה/כתיבה) ו-scripts/agent-general-fix.ts (הסוכן).
 */

/** גרסה פרטית פעילה כפי שהיא מגיעה למסלולי ההגשה ולכרטיסייה */
export type PrivateVersionInfo = {
  id: number;
  fileUrl: string;
  fileName: string;
  note: string | null;
  createdAt: Date;
  fixId: number | null;
};

/** מה שהמורה המבקשת רואה בכרטיסייה על התלונה הכללית שלה (ר' material_fixes kind=general) */
export type GeneralComplaintView = {
  id: number;
  /** pending / answered / private / merged (rejected/cancelled לא מוצגים) */
  status: string;
  /** reply_text – ניסוח אל המורה; null כל עוד ממתינה */
  replyText: string | null;
  createdAt: Date;
};

/** מצב התיקונים הכלליים של חומר אחד עבור המבקרת – מועבר לכרטיסייה */
export type CorrectionState = {
  privateVersion: PrivateVersionInfo | null;
  general: GeneralComplaintView[];
};

export const GENERAL_VISIBLE_STATUSES = ["pending", "answered", "private", "merged"] as const;

/**
 * איזה קובץ להגיש למבקרת: הגרסה הפרטית שלה (אם יש) במקום הקובץ המשותף, אלא אם ביקשה במפורש את המקור (?original=1).
 * המנהלת מקבלת תמיד את המשותף, אלא אם ביקשה לבדוק גרסה פרטית מסוימת (?pv=<id>) – הבדיקה שה-id שייך לחומר
 * נעשית בצד הקורא (resolvePrivateVersionForAdmin). קובץ שאינו docx לא מקבל גרסה פרטית (הסוכן עורך רק docx).
 */
export function chooseServedFile(input: {
  material: { fileUrl: string; fileName: string };
  privateVersion: PrivateVersionInfo | null;
  wantOriginal: boolean;
}): { fileUrl: string; fileName: string; privateVersion: PrivateVersionInfo | null } {
  const pv = input.privateVersion;
  if (!pv || input.wantOriginal || !isDriveUrlStrict(pv.fileUrl) || !/\.docx$/i.test(input.material.fileName)) {
    return { fileUrl: input.material.fileUrl, fileName: input.material.fileName, privateVersion: null };
  }
  return { fileUrl: pv.fileUrl, fileName: pv.fileName || input.material.fileName, privateVersion: pv };
}

/** drive://<id> עם מזהה חוקי בלבד – לעולם לא כתובת צד-שלישי (נטפרי) */
export function isDriveUrlStrict(url: string): boolean {
  return /^drive:\/\/[A-Za-z0-9_-]{10,}$/.test(url);
}

/** מפרסר ?original=1 / ?original=true */
export function parseOriginalParam(v: string | null): boolean {
  return v === "1" || v === "true";
}

/** שם קובץ הגרסה הפרטית בדרייב (בתיקיית הארכיון – לא בתיקיית הקטגוריה, כדי שסנכרון הדרייב לא יאמץ אותו כחומר) */
export function privateVersionDriveName(fileName: string, userId: number, fixId: number): string {
  const dot = fileName.lastIndexOf(".");
  const ext = dot > 0 ? fileName.slice(dot) : ".docx";
  const base = (dot > 0 ? fileName.slice(0, dot) : fileName).replace(/\s*\(נערך \d{2}\.\d{2}\.\d{4}\)\s*$/, "").trim();
  return `${base} (גרסה פרטית למשתמשת #${userId}, הערה #${fixId})${ext}`.replace(/[\\/:*?"<>|]+/g, "_").slice(0, 200);
}

/** תווית קצרה לכרטיסייה לפי מצב התלונה הכללית האחרונה של המורה (null = אין מה להציג) */
export function generalStatusLabel(c: GeneralComplaintView | undefined): { text: string; tone: "wait" | "done" | "info" } | null {
  if (!c) return null;
  switch (c.status) {
    case "pending":
      return { text: "ההערה שלך על הקובץ התקבלה ונבדקת מול הקובץ – אם צריך תיקון תקבלי כאן גרסה מתוקנת", tone: "wait" };
    case "private":
      return { text: "הקובץ תוקן עבורך לפי ההערה שלך – ההורדה והצפייה שלך מקבלות את הגרסה המתוקנת", tone: "done" };
    case "merged":
      return { text: "ההערה שלך שולבה בקובץ – הוא עודכן לכל המורות", tone: "done" };
    case "answered":
      return { text: "ההערה שלך נבדקה מול הקובץ", tone: "info" };
    default:
      return null;
  }
}

/** התלונה הכללית הרלוונטית להצגה: האחרונה שעוד לא הוסתרה (לפי createdAt) */
export function latestGeneral(list: GeneralComplaintView[]): GeneralComplaintView | undefined {
  return [...list].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
}
