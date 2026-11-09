import { NextResponse } from "next/server";
import { bearerFrom, verifyAgentToken } from "@/lib/agent-api-auth";
import { runDbBackup } from "@/lib/db-backup/run";
import { adminEmail, sendMail } from "@/lib/mail";

/**
 * כרון של Vercel (vercel.json, כל 6 שעות): גיבוי מסד הנתונים (Neon) לדרייב. ה-run עצמו מחליט אם צריך — גיבוי אחד ביום, וניסיון חוזר
 * בכרון הבא אם נכשל; נעילה ב-settings (db_backup_state) מונעת ריצה כפולה. Vercel שולח Authorization: Bearer <CRON_SECRET>.
 * ?force=1 — גיבוי מיידי בלי קשר לגיבוי האחרון (אותו אימות). ר' docs/db-backup.md.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const expected = (process.env.CRON_SECRET ?? "").trim();
  if (!expected) return NextResponse.json({ ok: false, error: "CRON_SECRET לא מוגדר" }, { status: 503 });
  if (expected.length < 32) return NextResponse.json({ ok: false, error: "CRON_SECRET קצר מ-32 תווים" }, { status: 503 });
  if (!verifyAgentToken(bearerFrom(req.headers.get("authorization")), expected)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 401 });
  const force = new URL(req.url).searchParams.get("force") === "1";
  try {
    const r = await runDbBackup({
      force,
      trigger: force ? "manual" : "cron",
      notify: async (subject, text) => {
        const to = adminEmail();
        if (!to) throw new Error("ADMIN_EMAILS ריק");
        const res = await sendMail({ to, subject, text, kind: "system" });
        if (!res.ok) throw new Error(res.error || "שליחת המייל נכשלה");
      },
    });
    return NextResponse.json({ ok: r.status !== "failed", ...r }, { status: r.status === "failed" ? 500 : 200 });
  } catch (e) {
    console.error("[db-backup] crashed:", e instanceof Error ? e.message : "error");
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "error" }, { status: 500 });
  }
}
