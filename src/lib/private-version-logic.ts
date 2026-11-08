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
  /** מה שהמורה כתבה (ההודעה שלה בשרשור) */
  requestText: string;
  /** מזהה ההערה הראשונה בשרשור (null = זו ההערה הראשונה עצמה) */
  parentId: number | null;
  /** מספר ההודעה של המורה בשרשור (1..MAX_THREAD_TURNS) */
  turn: number;
  /** בקשה למפרשים נוספים (reason=commentators) */
  commentators: boolean;
};

/** כמה הודעות של המורה מותרות בשרשור אחד (ההערה הראשונה + שאלות המשך) */
export const MAX_THREAD_TURNS = 5;

/** מזהה השרשור של שורת הערה (ההערה הראשונה בשרשור) */
export const threadRootId = (g: { id: number; parentId: number | null }): number => g.parentId ?? g.id;

export type GeneralThread = {
  rootId: number;
  /** ההודעות בסדר כרונולוגי (turn עולה) */
  items: GeneralComplaintView[];
  commentators: boolean;
};

/** מקבץ את ההערות הכלליות לשרשורים (לפי ההערה הראשונה), כרונולוגית; השרשורים בסדר פתיחתם */
export function groupThreads(list: GeneralComplaintView[]): GeneralThread[] {
  const byRoot = new Map<number, GeneralComplaintView[]>();
  for (const g of list) {
    const r = threadRootId(g);
    byRoot.set(r, [...(byRoot.get(r) ?? []), g]);
  }
  return [...byRoot.entries()]
    .map(([rootId, items]) => {
      const sorted = [...items].sort((a, b) => a.turn - b.turn || a.id - b.id);
      return { rootId, items: sorted, commentators: sorted[0]?.commentators ?? false };
    })
    .sort((a, b) => a.rootId - b.rootId);
}

/** שרשור כפי שהוא עובר לדפדפן (רכיב לקוח של חלון עריכת השינויים): רק נתונים פשוטים, בלי Date */
export type ThreadView = {
  rootId: number;
  commentators: boolean;
  items: { id: number; turn: number; status: string; text: string; reply: string | null; at: string }[];
};

export function threadViews(list: GeneralComplaintView[]): ThreadView[] {
  return groupThreads(list).map((t) => ({
    rootId: t.rootId,
    commentators: t.commentators,
    items: t.items.map((g) => ({ id: g.id, turn: g.turn, status: g.status, text: g.requestText, reply: g.replyText, at: g.createdAt.toISOString() })),
  }));
}

/** מה אפשר לעשות עכשיו בשרשור: ממתין לתשובה / אפשר להמשיך (כמה הודעות נשארו) / מוצה */
export function threadState(t: GeneralThread): { waiting: boolean; used: number; left: number; canReply: boolean } {
  const used = t.items.length;
  const last = t.items[t.items.length - 1];
  const waiting = !!last && last.status === "pending";
  const left = Math.max(0, MAX_THREAD_TURNS - used);
  return { waiting, used, left, canReply: !waiting && left > 0 };
}

/** מצב התיקונים הכלליים של חומר אחד עבור המבקרת – מועבר לכרטיסייה */
export type CorrectionState = {
  privateVersion: PrivateVersionInfo | null;
  general: GeneralComplaintView[];
};

/**
 * חתימה קצרה של מצב ההערות הכלליות של חומר אחד: משתנה כשהסוכן ענה / נוצרה גרסה פרטית / שולבה לכולן.
 * הלקוח משווה אותה (ר' /api/my-correction-status) ורק כשהיא משתנה מרענן את הדף – בלי להוריד את כל המצב בכל בדיקה.
 */
export function correctionSignature(state: CorrectionState | undefined): string {
  if (!state) return "none";
  return correctionSignatureOf(state.privateVersion?.id ?? null, state.general);
}

/** אותה חתימה מנתונים גולמיים (לשאילתת הסטטוס הקלה – בלי להוריד את כל המצב). ממוין לפי id, כדי שסדר שורות לא ישנה את החתימה */
export function correctionSignatureOf(pvId: number | null, general: { id: number; status: string }[]): string {
  const gen = [...general]
    .sort((a, b) => a.id - b.id)
    .map((g) => `${g.id}:${g.status}`)
    .join(",");
  return `${pvId ? `pv${pvId}` : "pv0"}|${gen}`;
}

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
      return { text: "ההערה שלך נבדקת – אם צריך, תקבלי כאן קובץ מתוקן", tone: "wait" };
    case "private":
      return { text: "הקובץ תוקן עבורך לפי ההערה שלך", tone: "done" };
    case "merged":
      return { text: "ההערה שלך שולבה בקובץ לכל המורות", tone: "done" };
    case "answered":
      return { text: "ההערה שלך נבדקה", tone: "info" };
    default:
      return null;
  }
}

/** "לפני 5 דקות" / "לפני שעתיים" / "לפני 3 ימים" – עד כחודש וחצי; אחרי זה מחזיר null (והמסך מציג תאריך עברי) */
export function timeAgoHe(then: Date, now: Date = new Date()): string | null {
  const min = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (min < 1) return "לפני רגע";
  if (min < 60) return min === 1 ? "לפני דקה" : `לפני ${min} דקות`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return hours === 1 ? "לפני שעה" : hours === 2 ? "לפני שעתיים" : `לפני ${hours} שעות`;
  const days = Math.floor(hours / 24);
  if (days <= 45) return days === 1 ? "לפני יום" : days === 2 ? "לפני יומיים" : `לפני ${days} ימים`;
  return null;
}

/** התלונה הכללית הרלוונטית להצגה: האחרונה שעוד לא הוסתרה (לפי createdAt, ואז מזהה) */
export function latestGeneral(list: GeneralComplaintView[]): GeneralComplaintView | undefined {
  return [...list].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id)[0];
}
