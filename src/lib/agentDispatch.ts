/**
 * שולח repository_dispatch לגיטהאב כדי להפעיל את .github/workflows/claude-fix-reports.yml
 * מיד כשנוצר דיווח חדש — בלי לחכות עד 5 דקות ל-cron הבא. אותו דפוס בדיוק כמו
 * gemach-app (app/api/error-report/route.js שם) ו-print-center.
 *
 * דורש שני env vars ב-Vercel (לא GitHub secrets — אלה נקראים מתוך האתר עצמו):
 * - GH_DISPATCH_TOKEN: GitHub PAT עם הרשאת "repo" (classic) או "Contents: Read & write"
 *   + "Actions: Read & write" (fine-grained) על הריפו הזה.
 * - GH_DISPATCH_REPO: "moshehik/bagrut-materials" (ברירת מחדל, אפשר לדרוס).
 * בלי אלה: לא קורה כלום (שקט, לא נכשל) — ה-cron כל 5 דק' עדיין מכסה הכל,
 * פשוט בלי תגובה מיידית.
 */

const EVENT_TYPE = "new-error-report";

export async function dispatchFixReportsAgent(): Promise<void> {
  const token = process.env.GH_DISPATCH_TOKEN;
  const repo = process.env.GH_DISPATCH_REPO || "moshehik/bagrut-materials";
  if (!token) return;

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ event_type: EVENT_TYPE }),
    });
    if (!res.ok) {
      console.error(`[agentDispatch] repository_dispatch failed: ${res.status} ${await res.text().catch(() => "")}`);
    }
  } catch (e) {
    console.error("[agentDispatch] repository_dispatch request failed", e);
  }
}
