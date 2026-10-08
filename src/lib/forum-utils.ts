import { downloadDayName, formatHebrewDate, jerusalemIso } from "@/lib/hebrew-date";

/**
 * בפורום מורות לא מוצג שם – כל מורה מופיעה לפי המספר האישי שלה (users.personalCode),
 * כדי לשמור על פרטיות ולהחזיק שיח ענייני.
 */
export const forumAuthor = (personalCode: string) => `מורה מס׳ ${personalCode}`;

/** סוגי ההודעות בפורום. תשובה אינה "סוג" של הודעה חדשה – היא תמיד תגובה לשאלה (forum_posts). */
export const FORUM_KINDS = ["question", "note", "tip"] as const;
export type ForumKind = (typeof FORUM_KINDS)[number];

/** תווית מעל הריבוע: שאלה / הערה / טיפ, "תשובה" לתגובה על שאלה ו"תגובה" לתגובה על הערה או טיפ */
export const FORUM_LABEL: Record<ForumKind | "answer" | "reply", string> = {
  question: "שאלה",
  note: "הערה",
  tip: "טיפ",
  answer: "תשובה",
  reply: "תגובה",
};

export const isForumKind = (v: unknown): v is ForumKind => FORUM_KINDS.includes(v as ForumKind);

/** כותרת קצרה מהטקסט (העמודה title נשארת למנהלת ולמייל) */
export const forumTitleFrom = (body: string) => {
  const one = body.replace(/\s+/g, " ").trim();
  return one.length > 80 ? `${one.slice(0, 77)}…` : one;
};

/** "לפני X ..." בעברית תקנית (יחיד/זוגי/רבים) */
function unitAgo(n: number, one: string, two: string, many: string): string {
  if (n === 1) return `לפני ${one}`;
  if (n === 2) return `לפני ${two}`;
  return `לפני ${n} ${many}`;
}

/** כמה זמן עבר: דקות אם פחות משעה, שעות אם פחות מיום, ואז ימים/שבועות/חודשים/שנים */
export function forumAgo(d: Date, now: Date = new Date()): string {
  const sec = Math.max(0, Math.floor((now.getTime() - d.getTime()) / 1000));
  if (sec < 60) return "הרגע";
  const min = Math.floor(sec / 60);
  if (min < 60) return unitAgo(min, "דקה", "שתי דקות", "דקות");
  const hours = Math.floor(min / 60);
  if (hours < 24) return unitAgo(hours, "שעה", "שעתיים", "שעות");
  const days = Math.floor(hours / 24);
  if (days < 7) return unitAgo(days, "יום", "יומיים", "ימים");
  if (days < 30) {
    const w = Math.floor(days / 7);
    return unitAgo(w, "שבוע", "שבועיים", "שבועות");
  }
  if (days < 365) {
    const m = Math.floor(days / 30);
    return unitAgo(m, "חודש", "חודשיים", "חודשים");
  }
  const y = Math.floor(days / 365);
  return unitAgo(y, "שנה", "שנתיים", "שנים");
}

/**
 * תאריך לתצוגה בפורום – תמיד בשעון ישראל (השרת רץ ב-UTC):
 * "לפני 5 דקות · יום רביעי, כ״ה בתשרי תשפ״ז · 14:05". בשבת: "מוצאי שבת" (אף מורה לא כותבת בשבת עצמה).
 */
export const forumWhen = (d: Date, now: Date = new Date()) => {
  const iso = jerusalemIso(d);
  const time = d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jerusalem" });
  return `${forumAgo(d, now)} · ${downloadDayName(iso)}, ${formatHebrewDate(d)} · ${time}`;
};
