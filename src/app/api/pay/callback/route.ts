import { NextResponse, type NextRequest } from "next/server";
import { limitKey, rateLimit } from "@/lib/rate-limit";
import { requestMeta } from "@/lib/audit";
import { loadNedarimConfig } from "@/lib/nedarim/config";
import { MAX_BODY_BYTES, parseCallbackBody } from "@/lib/nedarim/logic";
import { secretsEqual } from "@/lib/nedarim/secret-crypto";
import { redactNedarim } from "@/lib/nedarim/secrets";
import { recordCallback } from "@/lib/nedarim/store";
import { refreshHistory } from "@/lib/nedarim/sync";

/*
 * /api/pay/callback – אופציונלי: WEBHOOK (CallBack) של נדרים פלוס, אם מגדירים אותו בפורטל שלהם ברמת המוסד (לדף התשלום המתארח
 * אין פרמטר CallBack). הוא **לא משלים תשלום** – רק רושם את הגוף על הבקשה (אם יש מזהה) ומפעיל רענון של שער הקריאה
 * (היסטוריית ה-API היא מקור האמת). אבטחה: הסוד מושווה באורך קבוע (SHA-256 + timingSafeEqual); מתקבל בכותרת X-Nedarim-Key
 * או ב-?key= (query עלול להופיע בלוגי גישה – הסיכון מתועד ב-docs). rate-limit לפי IP, מגבלת גודל גוף, תשובה אחידה "OK"
 * (גם על גוף לא מזוהה) – חוץ מסוד שגוי (403) ועומס (429). docs/nedarim-payments.md
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ok = () => new NextResponse("OK", { status: 200, headers: { "Cache-Control": "no-store" } });

async function handle(req: NextRequest) {
  const { ip } = await requestMeta();
  const rl = await rateLimit({ key: limitKey("pay-callback", "ip", ip ?? "unknown"), limit: 60, windowSec: 600 });
  if (!rl.ok) return new NextResponse("rate limited", { status: 429 });

  const cfg = await loadNedarimConfig();
  const given = req.headers.get("x-nedarim-key") ?? req.nextUrl.searchParams.get("key");
  if (!cfg.callbackSecret || !secretsEqual(given, cfg.callbackSecret)) {
    console.warn("[pay callback] bad key from", ip);
    return new NextResponse("forbidden", { status: 403 });
  }

  const raw = req.method === "GET" ? "" : await req.text();
  if (raw.length > MAX_BODY_BYTES * 4) return ok();
  const body = parseCallbackBody(req.headers.get("content-type"), raw);
  for (const [k, v] of req.nextUrl.searchParams) if (k !== "key" && body[k] === undefined) body[k] = v;

  try {
    await recordCallback(body, redactNedarim(raw || req.nextUrl.search));
    await refreshHistory("callback"); // רצפה של דקה; כולל התאמה
  } catch (e) {
    console.error("[pay callback] failed", redactNedarim(e instanceof Error ? e.message : String(e)));
  }
  return ok();
}

export const POST = handle;
export const GET = handle;
