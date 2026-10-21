import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { limitKey, rateLimit } from "@/lib/rate-limit";
import { requestMeta } from "@/lib/audit";
import { loadNedarimConfig } from "@/lib/nedarim/config";
import { MAX_BODY_BYTES, parseCallbackBody } from "@/lib/nedarim/logic";
import { recordCallback } from "@/lib/nedarim/store";

/*
 * /api/pay/callback?key=<NEDARIM_CALLBACK_SECRET> – ה-WEBHOOK (CallBack) של נדרים פלוס אחרי כל עסקה / סירוב. הכתובת נשלחת להם
 * בכל עסקה בשדה CallBack של FinishTransaction2 (ואפשר/רצוי להגדיר אותה גם בפורטל שלהם). השדות שנדרים שולחים אינם מתועדים
 * בדוגמאות הפומביות – הגוף הגולמי נשמר כפי שהוא, ומזהה הבקשה מחולץ מ-Param1 (או מההערה).
 * הסוד ב-URL מגן מפני קריאות מזויפות; ובכל מקרה ההשלמה דורשת אימות מול ה-API של נדרים (או אישור ידני) – גוף ה-CallBack לבדו
 * לעולם לא מספיק אלא אם NEDARIM_TRUST_CALLBACK=1. עונים תמיד 200 (גם על בקשה לא מזוהה) כדי שנדרים לא ישלחו "תקלת CallBack"
 * למייל המוסד על עסקאות שאינן מהאתר. docs/nedarim-payments.md
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function keyMatches(given: string | null, expected: string) {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(req: NextRequest) {
  const { ip } = await requestMeta();
  const rl = await rateLimit({ key: limitKey("pay-callback", "ip", ip ?? "unknown"), limit: 120, windowSec: 600 });
  if (!rl.ok) return new NextResponse("rate limited", { status: 429 });

  const cfg = await loadNedarimConfig();
  const key = req.nextUrl.searchParams.get("key");
  if (!cfg.callbackSecret || !keyMatches(key, cfg.callbackSecret)) {
    console.warn("[pay callback] bad key from", ip);
    return new NextResponse("forbidden", { status: 403 });
  }

  const raw = req.method === "GET" ? "" : await req.text();
  if (raw.length > MAX_BODY_BYTES * 4) return new NextResponse("too large", { status: 413 });
  const body = parseCallbackBody(req.headers.get("content-type"), raw);
  // גם פרמטרים ב-query (למקרה שנדרים שולחים GET / חלק מהשדות ב-URL)
  for (const [k, v] of req.nextUrl.searchParams) if (k !== "key" && body[k] === undefined) body[k] = v;

  try {
    const result = await recordCallback(body, raw || req.nextUrl.search.replace(/([?&])key=[^&]*/g, "$1key=***"), cfg);
    if (!result.ok) {
      console.warn("[pay callback] not matched", result.error, JSON.stringify("fields" in result ? result.fields : null));
      return new NextResponse("OK (unmatched)", { status: 200 });
    }
    return new NextResponse(`OK ${result.status ?? ""}`.trim(), { status: 200 });
  } catch (e) {
    console.error("[pay callback] failed", e);
    return new NextResponse("error", { status: 500 });
  }
}

export const POST = handle;
export const GET = handle;
