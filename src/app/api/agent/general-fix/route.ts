import { NextResponse, type NextRequest } from "next/server";
import { authorizeAgentRequest } from "@/lib/agent-api-auth";
import { decodeDocxBase64, parseAgentRequest, MAX_BODY_BYTES } from "@/lib/general-fix-protocol";
import { checkEdited, decideAnswer, decideMerge, decidePrivate, decideReject, decideRemoveVersion, getComplaint, listPendingGeneral, type Actor } from "@/lib/general-fix";
import { requestMeta } from "@/lib/audit";
import { logAgentEvent } from "@/lib/agentEvents";
import { limitKey, tooMany } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// הורדה מהדרייב + המרה ב-Oracle/LibreOffice + העלאות לארכיון – כמו /api/download
export const maxDuration = 120;

/**
 * ה-API של הסוכן ל"הערה כללית על הקובץ": האתר עושה את העבודה הכבדה בעצמו, עם ההרשאות שלו (דרייב, Oracle, DB), כך שהסוכן
 * ב-GitHub Actions לא צריך סודות דרייב/Oracle – רק AGENT_API_TOKEN (ר' src/lib/agent-api-auth.ts) וכתובת האתר.
 * POST JSON ‎{ action: list|get|check|private|merge|answer|reject|removeVersion, ... }‎ (הסכימה: src/lib/general-fix-protocol.ts).
 * אותו קוד בדיוק כמו הסקריפט במצב ישיר (src/lib/general-fix.ts) – אותן בדיקות, אותם יומנים, אותם קבצי עבודה שנשמרים.
 * קבצים עוברים כ-base64 בתוך ה-JSON (עד ~3MB docx; גדול יותר → 413 עם הסבר). dry-run אלא אם apply=true.
 * הכול דרך הדומיין של האתר (נטפרי). כל קריאה נרשמת ביומן הסוכן; פעולות ההערה – גם ב-audit_logs (logFixEvent).
 */
export async function POST(req: NextRequest) {
  const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

  const auth = authorizeAgentRequest(req.headers.get("authorization"));
  if (!auth.ok) {
    const { ip } = await requestMeta();
    if (auth.status !== 503 && (await tooMany(limitKey("agent-api-denied", ip), 30, 600))) return json({ ok: false, error: "יותר מדי ניסיונות" }, 429);
    return json({ ok: false, error: auth.error }, auth.status);
  }
  const { ip } = await requestMeta();
  if (await tooMany(limitKey("agent-api", ip ?? "agent"), 120, 600)) return json({ ok: false, error: "יותר מדי קריאות – נסי שוב בעוד כמה דקות" }, 429);

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return json({ ok: false, error: `גוף הבקשה ${declared} בתים – מעל המגבלה (${MAX_BODY_BYTES}). docx גדול לא עובר ב-API; עבדו במצב ישיר` }, 413);
  let body: unknown;
  let raw = "";
  try {
    raw = await req.text();
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: "גוף הבקשה אינו JSON תקין" }, 400);
  }
  const parsed = parseAgentRequest(body, Buffer.byteLength(raw));
  if (!parsed.ok) return json({ ok: false, error: parsed.error }, parsed.status);
  const r = parsed.req;
  const actor: Actor = { actorId: null, source: "site", ip, via: "api" };
  await logAgentEvent({ source: "site", kind: "cli", summary: `agent-api general-fix: ${r.action}${"fixId" in r ? ` הערה#${r.fixId}` : ""}${"apply" in r && r.apply ? " (apply)" : ""}`, details: { ip } });

  const docx = (b64: string) => {
    const d = decodeDocxBase64(b64);
    if (!d.ok) throw Object.assign(new Error(d.error), { status: 413 });
    return d.bytes;
  };
  try {
    switch (r.action) {
      case "list":
        return json({ ok: true, pending: await listPendingGeneral() });
      case "get": {
        const g = await getComplaint(r.fixId, actor);
        const { bytes, ...info } = g;
        if (bytes.length > 3 * 1024 * 1024) return json({ ok: true, ...info, docxBase64: null, tooLarge: true, error: `הקובץ ${bytes.length} בתים – גדול מדי ל-API; עבדו במצב ישיר` });
        return json({ ok: true, ...info, docxBase64: Buffer.from(bytes).toString("base64") });
      }
      case "check": {
        const c = await checkEdited({ fixId: r.fixId, bytes: docx(r.docxBase64), render: r.render, actor });
        const { pdf, ok: checkOk, ...rest } = c;
        // ok של התשובה = הקריאה הצליחה; תוצאת הבדיקה עצמה ב-checkOk (הסקריפט יוצא עם 2 כשהיא false)
        return json({ ok: true, ...rest, checkOk, pdfBase64: pdf ? Buffer.from(pdf).toString("base64") : null, pageImages: null, pageImagesNote: "אין ממיר PDF→תמונה בשרת (pdf-lib/sharp לא מרנדרים PDF) – לפתוח את ה-PDF מקומית" });
      }
      case "private":
        return json({ ok: true, result: await decidePrivate({ fixId: r.fixId, bytes: docx(r.docxBase64), note: r.note, apply: r.apply, actor }) });
      case "merge":
        return json({ ok: true, result: await decideMerge({ fixId: r.fixId, bytes: docx(r.docxBase64), note: r.note, why: r.why, apply: r.apply, actor }) });
      case "answer":
        return json({ ok: true, result: await decideAnswer({ fixId: r.fixId, note: r.note, apply: r.apply, actor }) });
      case "reject":
        return json({ ok: true, result: await decideReject({ fixId: r.fixId, note: r.note, apply: r.apply, actor }) });
      case "removeVersion":
        return json({ ok: true, result: await decideRemoveVersion({ versionId: r.versionId, note: r.note, apply: r.apply, actor }) });
    }
  } catch (e) {
    const status = (e as { status?: number }).status ?? 422;
    const msg = e instanceof Error ? e.message : String(e);
    console.error("agent-api general-fix failed", r.action, msg);
    await logAgentEvent({ source: "site", kind: "error", summary: `agent-api general-fix ${r.action} נכשל: ${msg.slice(0, 300)}`, details: { ip } });
    return json({ ok: false, error: msg }, status);
  }
}
