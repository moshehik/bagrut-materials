/**
 * זיהוי חסימת סרטונים של נטפרי מצד הדפדפן (נבדק אצל המורה, 2026-11-08, /netfree-test/detect.html):
 * בקשה לקובץ וידאו/שמע מוחזרת בסטטוס HTTP 418 עם דף HTML קצר של נטפרי (מכיל netfree.link), גם בבקשת Range; אלמנט video נכשל תוך כ-100ms.
 * בלי נטפרי השרת שלנו מחזיר 206/200. אין שום כותרת/API מתועדים לזיהוי נטפרי – זו בדיקת התנהגות בלבד, ולכן תוצאה לא ברורה (שגיאת רשת וכו') = "לא חסום".
 */
const KEY = "nf-video-probe-v1";
const TTL_OK_MS = 6 * 60 * 60 * 1000;
const TTL_BLOCKED_MS = 20 * 60 * 1000; // קצר: ייתכן שהסינון הוגדר מחדש / הסרטונים אושרו

export async function probeNetfreeVideo(): Promise<boolean> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const c = JSON.parse(raw) as { t: number; blocked: boolean };
      if (Date.now() - c.t < (c.blocked ? TTL_BLOCKED_MS : TTL_OK_MS)) return c.blocked;
    }
  } catch {}
  let blocked = false;
  try {
    const res = await fetch("/netfree-probe.mp4", { headers: { Range: "bytes=0-0" }, cache: "no-store" });
    if (res.status === 418) blocked = true;
    else if ((res.headers.get("content-type") ?? "").includes("text/html")) blocked = /netfree/i.test(await res.text());
  } catch {
    blocked = false;
  }
  try {
    localStorage.setItem(KEY, JSON.stringify({ t: Date.now(), blocked }));
  } catch {}
  return blocked;
}
