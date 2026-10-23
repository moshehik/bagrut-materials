/**
 * תיקיות הקבצים (יחידות/פרקים שיש בהם חומרים, לא תיקיות-אב) שהמשתמשת ביקרה בהן לאחרונה – נשמרות בדפדפן בלבד (localStorage),
 * ומוצגות בחלון החיפוש לפני שמקלידים. לא נשלח לשרת ולא נשמר בחשבון, ולכן עובד גם לאורחות. בטוח לקריאה מצד לקוח בלבד.
 */
export type RecentFolder = { href: string; title: string; path: string; ts: number };

const KEY = "recent-folders-v1";
const MAX = 8;
/** אירוע שמודיע לחלון החיפוש (באותו עמוד) שהרשימה השתנתה */
export const RECENT_FOLDERS_EVENT = "recent-folders-changed";

export function readRecentFolders(): RecentFolder[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(list)) return [];
    return list
      .filter((x): x is RecentFolder => !!x && typeof x === "object" && typeof (x as RecentFolder).href === "string" && typeof (x as RecentFolder).title === "string")
      .map((x) => ({ href: x.href, title: x.title, path: typeof x.path === "string" ? x.path : "", ts: Number(x.ts) || 0 }))
      .filter((x) => x.href.startsWith("/subjects/"))
      .slice(0, MAX);
  } catch {
    return [];
  }
}

export function rememberFolder(entry: Omit<RecentFolder, "ts">) {
  try {
    const rest = readRecentFolders().filter((x) => x.href !== entry.href);
    window.localStorage.setItem(KEY, JSON.stringify([{ ...entry, ts: Date.now() }, ...rest].slice(0, MAX)));
    window.dispatchEvent(new Event(RECENT_FOLDERS_EVENT));
  } catch {
    /* אחסון חסום (מצב פרטי וכד') – מדלגים */
  }
}

export function clearRecentFolders() {
  try {
    window.localStorage.removeItem(KEY);
    window.dispatchEvent(new Event(RECENT_FOLDERS_EVENT));
  } catch {
    /* ignore */
  }
}
