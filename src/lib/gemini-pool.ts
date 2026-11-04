import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { appSecrets } from "@/db/schema";
import { decryptSecret, deriveSecretsKey, encryptSecret, last4Of } from "@/lib/nedarim/secret-crypto";

/**
 * מנוע ג'מיני עם מאגר מפתחות – פורט (TypeScript) של api/_gemini.js באתר האימון, שהוא פורט של print-center/lib/ai.js.
 * תיעוד מלא להעברה למערכות אחרות: docs/gemini-connection-system.md (+ docs/gemini-pool-portable.mjs).
 *
 * העיקרון: רשימת מודלים מסודרת; לכל מודל מנסים את כל המפתחות, וכשמפתח נכשל הוא יוצא ל"התקררות" ועוברים לבא.
 *  - 429 = מכסה של זוג (מפתח, מודל) → התקררות לזוג בלבד (דקה)
 *  - 402/403, או 400 "API key not valid" = מפתח פגום → התקררות לכל המודלים (10 דק' / שעה)
 *  - 503 = עומס על המודל עצמו (החלפת מפתח לא תעזור) → אחרי שני 503 עוברים למודל הבא
 *  - 400/404/500/זמן/תשובה ריקה = מעבר מיידי למודל הבא
 *  - `accept` = בדיקת תקינות של התשובה (למשל בלי אותיות זרות): נדחתה פעמיים → מודל הבא; ממצאים נשארים ב-rejectedText
 *  - דדליין כולל לקריאה, כדי שבקשת משתמשת לא תתלה
 * מפתחות: env GEMINI_API_KEYS (פסיק/רווח/שורה) | GEMINI_API_KEY | GOOGLE_API_KEY ← אחרת app_secrets "gemini_keys" (מוצפן).
 * הסטטיסטיקה וההתקררות נשמרות בזיכרון של המופע בלבד (serverless), ולכן זו אינדיקציה ולא מקור אמת.
 */

export const GEMINI_MODELS = [
  "models/gemini-3-flash-preview",
  "models/gemini-2.5-flash",
  "models/gemini-3.5-flash-lite",
  "models/gemini-2.5-flash-lite",
  "models/gemini-3.1-flash-lite-preview",
  "models/gemini-3.5-flash",
  "models/gemini-3.6-flash",
];

/** מודלים שגוגל מכבה בתאריך מסוים – מדלגים עליהם אחריו */
const MODEL_EXPIRATION: Record<string, string> = {
  "models/gemini-2.5-flash": "2027-06-17",
  "models/gemini-3-flash-preview": "2027-06-17",
  "models/gemini-2.5-flash-lite": "2027-07-22",
  "models/gemini-3.1-flash-lite-preview": "2027-07-22",
};
const isExpired = (m: string) => (MODEL_EXPIRATION[m] ? Date.now() > new Date(MODEL_EXPIRATION[m]).getTime() : false);

const COOL_MS = { quota: 60_000, key: 10 * 60_000, badKey: 60 * 60_000 };
const SECRET_NAME = "gemini_keys";
const ENV_NAMES = ["GEMINI_API_KEYS", "GEMINI_API_KEY", "GOOGLE_API_KEY"] as const;

type KeyStat = { ok: number; fail: number; last: number | string | null; lastAt: string | null; coolUntil: number; coolModel: Record<string, number> };
const stats = new Map<string, KeyStat>();
let cache: { at: number; keys: string[]; source: "env" | "db" | "none" } = { at: 0, keys: [], source: "none" };
let keyIndex = 0;

const parse = (raw: string | null | undefined) => [...new Set(String(raw ?? "").split(/[\s,;]+/).map((k) => k.trim()).filter(Boolean))];
const suffix = (k: string) => k.slice(-4);
const statOf = (k: string): KeyStat => {
  const s = suffix(k);
  let st = stats.get(s);
  if (!st) stats.set(s, (st = { ok: 0, fail: 0, last: null, lastAt: null, coolUntil: 0, coolModel: {} }));
  return st;
};
/** ייבוא עצל: session טוען את next/navigation, ובמסלול בלי DB (env בלבד) אין בו צורך */
async function masterKey() {
  const { sessionSecretString } = await import("@/lib/session");
  return deriveSecretsKey((process.env.NEDARIM_SECRETS_KEY ?? "").trim() || sessionSecretString());
}

export async function getGeminiKeys(force = false): Promise<string[]> {
  if (!force && Date.now() - cache.at < 60_000 && cache.keys.length) return cache.keys;
  const fromEnv = ENV_NAMES.flatMap((n) => parse(process.env[n]));
  let keys = [...new Set(fromEnv)];
  let source: "env" | "db" | "none" = keys.length ? "env" : "none";
  if (!keys.length) {
    try {
      const [row] = await db.select().from(appSecrets).where(eq(appSecrets.name, SECRET_NAME)).limit(1);
      if (row) {
        keys = parse(decryptSecret(await masterKey(), SECRET_NAME, row.ciphertext));
        if (keys.length) source = "db";
      }
    } catch (e) {
      console.error("[gemini] key read from DB failed", e instanceof Error ? e.message : "error");
    }
  }
  cache = { at: Date.now(), keys, source };
  return keys;
}

export async function geminiConfigured() {
  return (await getGeminiKeys()).length > 0;
}

export type GeminiContent = { role: "user" | "model"; parts: { text: string }[] };
export type GeminiAttempt = { model: string; key: string; status: number | "timeout" | "error" | "rejected" };
export type GeminiOk = { text: string; model: string; key: string; attempts: GeminiAttempt[] };
export class GeminiError extends Error {
  attempts: GeminiAttempt[] = [];
  /** התשובה האחרונה שנדחתה על ידי accept – שימושית כמוצא אחרון אחרי ניקוי */
  rejectedText: string | null = null;
  code?: "NO_KEYS";
}

function extractText(data: unknown): string | null {
  const parts = (data as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] })?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  const t = parts.filter((p) => !p.thought).map((p) => p.text ?? "").join("");
  return t.trim() ? t : null;
}

export async function geminiGenerate(opts: {
  system?: string;
  /** קיצור: הודעת משתמש אחת */
  prompt?: string;
  contents?: GeminiContent[];
  temperature?: number;
  maxOutputTokens?: number;
  /** JSON בלבד בתשובה */
  json?: boolean;
  /** מבקש בלי "חשיבה" (thinkingBudget 0) – מהיר יותר בעריכה קצרה; מודל שלא תומך מחזיר 400 והמנוע עובר הלאה */
  noThinking?: boolean;
  models?: string[];
  /** דדליין כולל לכל הקריאה, במילישניות */
  timeoutMs?: number;
  accept?: (text: string) => boolean;
}): Promise<GeminiOk> {
  const keys = await getGeminiKeys();
  if (!keys.length) {
    const e = new GeminiError("no gemini keys");
    e.code = "NO_KEYS";
    throw e;
  }
  const contents = opts.contents ?? [{ role: "user" as const, parts: [{ text: opts.prompt ?? "" }] }];
  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: opts.temperature ?? 0.4,
      maxOutputTokens: opts.maxOutputTokens ?? 2048,
      ...(opts.json ? { responseMimeType: "application/json" } : {}),
      ...(opts.noThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
  };
  if (opts.system) body.system_instruction = { parts: [{ text: opts.system }] };
  const payload = JSON.stringify(body);

  const attempts: GeminiAttempt[] = [];
  let lastError: Error | null = null;
  let rejectedText: string | null = null;
  let totalRej = 0;
  const deadline = Date.now() + (opts.timeoutMs ?? 40_000);

  for (const model of (opts.models ?? GEMINI_MODELS).filter((m) => !isExpired(m))) {
    let skipModel = false;
    let overloaded = 0;
    let rejected = 0;
    for (let i = 0; i < keys.length && !skipModel; i++) {
      const idx = (keyIndex + i) % keys.length;
      const key = keys[idx];
      const st = statOf(key);
      if (st.coolUntil > Date.now() || (st.coolModel[model] ?? 0) > Date.now()) continue;
      const left = deadline - Date.now();
      if (left < 2000 || totalRej >= 4) {
        lastError = lastError ?? new Error("timeout");
        break;
      }
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), Math.min(left, 25_000));
      const shortModel = model.replace("models/", "");
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/${model}:generateContent`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-goog-api-key": key },
          body: payload,
          signal: ctrl.signal,
        });
        const raw = await res.text();
        let data: unknown = null;
        try {
          data = JSON.parse(raw);
        } catch {
          /* לא JSON */
        }
        attempts.push({ model: shortModel, key: suffix(key), status: res.status });
        st.last = res.status;
        st.lastAt = new Date().toISOString();
        if (res.status === 200) {
          const text = extractText(data);
          if (text && opts.accept && !opts.accept(text)) {
            attempts[attempts.length - 1].status = "rejected";
            rejectedText = text;
            lastError = new Error("rejected by validator");
            totalRej++;
            if (++rejected >= 2) skipModel = true;
            continue;
          }
          if (text) {
            st.ok++;
            keyIndex = (idx + 1) % keys.length;
            return { text: text.trim(), model: shortModel, key: suffix(key), attempts };
          }
          const d = data as { promptFeedback?: { blockReason?: string }; candidates?: { finishReason?: string }[] };
          lastError = new Error("empty: " + (d?.promptFeedback?.blockReason || d?.candidates?.[0]?.finishReason || "?"));
          skipModel = true;
          continue;
        }
        const msg = String((data as { error?: { message?: string } })?.error?.message ?? "");
        if (res.status === 400 && /API key not valid|API_KEY_INVALID/i.test(raw)) {
          st.fail++;
          st.coolUntil = Date.now() + COOL_MS.badKey;
          lastError = new Error("invalid key …" + suffix(key));
          continue;
        }
        if (res.status === 429) {
          st.fail++;
          st.coolModel[model] = Date.now() + COOL_MS.quota;
          lastError = new Error("quota 429");
          continue;
        }
        if (res.status === 402 || res.status === 403) {
          st.fail++;
          st.coolUntil = Date.now() + COOL_MS.key;
          lastError = new Error("key " + res.status);
          continue;
        }
        if (res.status === 503) {
          lastError = new Error("overloaded 503");
          if (++overloaded >= 2) skipModel = true;
          continue;
        }
        lastError = new Error(`API ${res.status}: ${msg.slice(0, 160)}`);
        skipModel = true;
      } catch (e) {
        const aborted = e instanceof Error && e.name === "AbortError";
        attempts.push({ model: shortModel, key: suffix(key), status: aborted ? "timeout" : "error" });
        lastError = aborted ? new Error("timeout") : (e as Error);
        skipModel = true;
      } finally {
        clearTimeout(timer);
      }
    }
  }
  const err = new GeminiError("all models/keys failed: " + (lastError?.message ?? "?"));
  err.attempts = attempts;
  err.rejectedText = rejectedText;
  throw err;
}

/** בדיקת כל מפתח בקריאה קטנה אחת (לדף הניהול) */
export async function testGeminiKeys(): Promise<{ key: string; status: number | "error"; ms: number }[]> {
  const keys = await getGeminiKeys(true);
  const out: { key: string; status: number | "error"; ms: number }[] = [];
  for (const key of keys) {
    const t0 = Date.now();
    try {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: "ok" }] }], generationConfig: { maxOutputTokens: 8 } }),
        signal: AbortSignal.timeout(15_000),
      });
      out.push({ key: "…" + suffix(key), status: r.status, ms: Date.now() - t0 });
    } catch {
      out.push({ key: "…" + suffix(key), status: "error", ms: Date.now() - t0 });
    }
  }
  return out;
}

/** שמירת המפתחות מוצפנת ב-app_secrets (בלי פריסה מחדש). env, אם מוגדר, דורס. מחזיר כמה מפתחות נשמרו */
export async function setGeminiKeys(raw: string, adminId: number): Promise<number> {
  const keys = parse(raw);
  if (keys.length === 0) {
    await db.delete(appSecrets).where(eq(appSecrets.name, SECRET_NAME));
  } else {
    const joined = keys.join(",");
    const ciphertext = encryptSecret(await masterKey(), SECRET_NAME, joined);
    const now = new Date();
    await db
      .insert(appSecrets)
      .values({ name: SECRET_NAME, ciphertext, keyVersion: 1, last4: last4Of(joined), updatedAt: now, updatedById: adminId })
      .onConflictDoUpdate({
        target: appSecrets.name,
        set: { ciphertext, keyVersion: 1, last4: last4Of(joined), updatedAt: now, updatedById: adminId },
      });
  }
  cache = { at: 0, keys: [], source: "none" };
  return keys.length;
}

/** מצב המאגר לדף הניהול – רק סיומות של 4 תווים, לעולם לא המפתח המלא */
export async function geminiPoolStatus() {
  const keys = await getGeminiKeys();
  return {
    source: cache.source,
    envOverridesDb: ENV_NAMES.some((n) => !!process.env[n]),
    models: GEMINI_MODELS.filter((m) => !isExpired(m)).map((m) => m.replace("models/", "")),
    keys: keys.map((k) => {
      const s = statOf(k);
      return {
        key: "…" + suffix(k),
        ok: s.ok,
        fail: s.fail,
        last: s.last,
        lastAt: s.lastAt,
        coolingSec: Math.max(0, Math.round((s.coolUntil - Date.now()) / 1000)),
      };
    }),
  };
}
