/**
 * בפורום מורות לא מוצג שם – כל מורה מופיעה לפי המספר האישי שלה (users.personalCode),
 * כדי לשמור על פרטיות ולהחזיק שיח ענייני.
 */
export const forumAuthor = (personalCode: string) => `מורה מס׳ ${personalCode}`;

/** סוגי ההודעות בפורום. תשובה אינה "סוג" של הודעה חדשה – היא תמיד תגובה לשאלה (forum_posts). */
export const FORUM_KINDS = ["question", "note", "tip"] as const;
export type ForumKind = (typeof FORUM_KINDS)[number];

/** תווית מעל הריבוע: שאלה / הערה / טיפ, ו"תשובה" לתגובה על שאלה */
export const FORUM_LABEL: Record<ForumKind | "answer", string> = {
  question: "שאלה",
  note: "הערה",
  tip: "טיפ",
  answer: "תשובה",
};

export const isForumKind = (v: unknown): v is ForumKind => FORUM_KINDS.includes(v as ForumKind);

/** כותרת קצרה מהטקסט (העמודה title נשארת למנהלת ולמייל) */
export const forumTitleFrom = (body: string) => {
  const one = body.replace(/\s+/g, " ").trim();
  return one.length > 80 ? `${one.slice(0, 77)}…` : one;
};

/** תאריך ושעה לתצוגה בפורום – תמיד בשעון ישראל (השרת רץ ב-UTC) */
export const forumWhen = (d: Date) =>
  d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "Asia/Jerusalem" }) +
  " " +
  d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" });
