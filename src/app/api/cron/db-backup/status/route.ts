import { NextResponse } from "next/server";
import { bearerFrom, verifyAgentToken } from "@/lib/agent-api-auth";
import { getBackupState, listBackups } from "@/lib/db-backup/run";

/** סטטוס הגיבוי (לבדיקה מרחוק): Authorization: Bearer <CRON_SECRET>. מחזיר מצב אחרון + רשימת הקבצים בדרייב (שם, גודל לא נטען). */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const expected = (process.env.CRON_SECRET ?? "").trim();
  if (!expected) return NextResponse.json({ ok: false, error: "CRON_SECRET לא מוגדר" }, { status: 503 });
  if (!verifyAgentToken(bearerFrom(req.headers.get("authorization")), expected)) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 401 });
  try {
    const state = await getBackupState();
    let files: { name: string; at: string }[] = [];
    let listError: string | null = null;
    try {
      files = (await listBackups()).map((b) => ({ name: b.name, at: b.at.toISOString() }));
    } catch (e) {
      listError = e instanceof Error ? e.message.slice(0, 200) : "error";
    }
    return NextResponse.json({ ok: true, state, files, listError });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "error" }, { status: 500 });
  }
}
