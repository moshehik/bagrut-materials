import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { TOO_MANY_MESSAGE, limitKey, tooMany } from "@/lib/rate-limit";
import { runAssistant } from "@/lib/admin-assistant/engine";
import { MAX_QUESTION_CHARS, cleanText, sanitizeHistory } from "@/lib/admin-assistant/logic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// שני קריאות לג'מיני + שאילתות מסד
export const maxDuration = 60;

/**
 * עוזר ה-AI למנהלת – POST {question, history}. למנהלות בלבד (role === "admin"), מאותו דומיין בלבד, עם הגבלת קצב
 * ורישום ב-audit (action "admin.assistant": אורך השאלה והכלים שהורצו, לא התוכן). בלי טבלאות חדשות: ההיסטוריה חיה בדפדפן.
 */
export async function POST(req: NextRequest) {
  const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

  // הגנת CSRF: רק בקשה מאותו דומיין
  if (req.headers.get("origin") !== req.nextUrl.origin) return json({ ok: false, error: "forbidden" }, 403);

  const user = await getCurrentUser();
  if (!user) return json({ ok: false, error: "צריך להתחבר" }, 401);
  if (user.role !== "admin") return json({ ok: false, error: "forbidden" }, 403);

  if ((await tooMany(limitKey("admin-assistant", user.id), 20, 600)) || (await tooMany(limitKey("admin-assistant-day", user.id), 300, 86400))) {
    return json({ ok: false, error: TOO_MANY_MESSAGE }, 429);
  }

  let body: { question?: unknown; history?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json({ ok: false, error: "בקשה לא תקינה" }, 400);
  }
  const question = cleanText(body.question, MAX_QUESTION_CHARS);
  if (!question) return json({ ok: false, error: "כתבי שאלה" }, 400);
  const history = sanitizeHistory(body.history);

  const res = await runAssistant(history, question);

  await logAudit({
    actorId: user.id,
    action: "admin.assistant",
    details: res.ok
      ? { qLen: question.length, turns: history.length, tools: res.tools.map((t) => t.name), ms: res.ms, model: res.model }
      : { qLen: question.length, turns: history.length, error: res.code },
  });

  if (!res.ok) return json({ ok: false, error: res.error }, res.code === "no_keys" ? 503 : 502);
  return json({ ok: true, answer: res.answer, tools: res.tools, ms: res.ms });
}
