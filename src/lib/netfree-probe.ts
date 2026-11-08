/**
 * זיהוי חסימת סרטונים של מסנן תוכן מצד הדפדפן (נבדק אצל המורה, 2026-11-08, /netfree-test/detect.html):
 * בנטפרי, בקשה לקובץ וידאו/שמע מוחזרת בסטטוס HTTP 418 עם דף HTML קצר של נטפרי (מכיל netfree.link), גם בבקשת Range; אלמנט video נכשל תוך כ-100ms.
 * בלי מסנן השרת שלנו מחזיר 206/200 עם סוג video/*. אין שום כותרת/API מתועדים לזיהוי נטפרי – זו בדיקת התנהגות בלבד.
 * מסננים אחרים (רימון / אתרוג / נתיב): אין מידע ציבורי על דפי החסימה שלהם, ולכן כל תשובה שאינה וידאו תקין (שגיאת HTTP, או HTML/סוג אחר)
 * נחשבת "חסום – מסנן אחר". שגיאת רשת (אין חיבור) = לא חסום.
 */
const KEY = "nf-video-probe-v2";
const TTL_OK_MS = 6 * 60 * 60 * 1000;
const TTL_BLOCKED_MS = 20 * 60 * 1000; // קצר: ייתכן שהסינון הוגדר מחדש / הסרטונים אושרו

export type FilterKind = "netfree" | "other" | null;

function publish(kind: FilterKind) {
  // הקוקי מגיע לשרת בהורדת מצגת (netfree-mode.ts): nf=1 חסום, nf=0 לא. חיי הקוקי כמו המטמון
  try {
    const ttl = kind ? TTL_BLOCKED_MS : TTL_OK_MS;
    document.cookie = `nf=${kind ? 1 : 0}; path=/; max-age=${Math.round(ttl / 1000)}; SameSite=Lax`;
  } catch {}
}

/** סוג המסנן שזוהה בבדיקה האחרונה (מהמטמון בדפדפן) – לניסוח ההודעה */
export function lastFilterKind(): FilterKind {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) ?? "null") as { kind?: FilterKind } | null;
    return c?.kind ?? null;
  } catch {
    return null;
  }
}

export async function probeNetfreeVideo(): Promise<boolean> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const c = JSON.parse(raw) as { t: number; kind: FilterKind };
      if (Date.now() - c.t < (c.kind ? TTL_BLOCKED_MS : TTL_OK_MS)) {
        publish(c.kind);
        return c.kind !== null;
      }
    }
  } catch {}
  let kind: FilterKind = null;
  try {
    const res = await fetch("/netfree-probe.mp4", { headers: { Range: "bytes=0-0" }, cache: "no-store" });
    const ct = res.headers.get("content-type") ?? "";
    if (res.status === 418) kind = "netfree";
    else if (ct.includes("text/html") && /netfree/i.test(await res.text())) kind = "netfree";
    else if ((res.status !== 200 && res.status !== 206) || !ct.startsWith("video/")) kind = "other";
  } catch {
    kind = null;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify({ t: Date.now(), kind }));
  } catch {}
  publish(kind);
  return kind !== null;
}
