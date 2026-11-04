// מנוע חיבור לג'מיני עם מאגר מפתחות – גרסה ניידת (ESM, בלי תלויות; דורשת Node 18+ / סביבה עם fetch ו-AbortController).
// זו אותה לוגיקה בדיוק כמו src/lib/gemini-pool.ts באתר חומרי הבגרות, api/_gemini.js באתר האימון ו-lib/ai.js ב-print-center.
// תיעוד מלא: docs/gemini-connection-system.md
//
// שימוש מינימלי:
//   import { createGeminiPool } from './gemini-pool-portable.mjs';
//   const gemini = createGeminiPool();                       // מפתחות מ-GEMINI_API_KEYS
//   const r = await gemini.generate({ prompt: 'שלום' });      // → { text, model, key, attempts }
//
// הרחבות: loadKeysFallback (למשל קריאה מבסיס נתונים), models, now/fetch (להזרקה בבדיקות), isExpired.

export const DEFAULT_MODELS = [
  'models/gemini-3-flash-preview',
  'models/gemini-2.5-flash',
  'models/gemini-3.5-flash-lite',
  'models/gemini-2.5-flash-lite',
  'models/gemini-3.1-flash-lite-preview',
  'models/gemini-3.5-flash',
  'models/gemini-3.6-flash',
];

// מודלים שגוגל מכבה בתאריך מסוים (מדלגים עליהם אחריו)
export const MODEL_EXPIRATION = {
  'models/gemini-2.5-flash': '2027-06-17',
  'models/gemini-3-flash-preview': '2027-06-17',
  'models/gemini-2.5-flash-lite': '2027-07-22',
  'models/gemini-3.1-flash-lite-preview': '2027-07-22',
};

export const COOL_MS = { quota: 60_000, key: 10 * 60_000, badKey: 60 * 60_000 };
const ENV_NAMES = ['GEMINI_API_KEYS', 'GEMINI_API_KEY', 'GOOGLE_API_KEY'];
const API = 'https://generativelanguage.googleapis.com/v1beta/';

/** פירוק מחרוזת מפתחות (פסיק / נקודה-פסיק / רווח / שורה) לרשימה בלי כפילויות */
export const parseKeys = (raw) => [...new Set(String(raw || '').split(/[\s,;]+/).map((k) => k.trim()).filter(Boolean))];

export function createGeminiPool({
  env = (typeof process !== 'undefined' ? process.env : {}),
  models = DEFAULT_MODELS,
  loadKeysFallback = null, // async () => string | string[] | null — מקור מפתחות חלופי כש-env ריק (למשל DB)
  fetchImpl = (...a) => fetch(...a),
  now = () => Date.now(),
  keysCacheMs = 60_000,
} = {}) {
  const stats = new Map(); // סיומת מפתח (4 תווים) → { ok, fail, last, lastAt, coolUntil, coolModel }
  let cache = { at: 0, keys: [], source: 'none' };
  let keyIndex = 0;

  const suffix = (k) => k.slice(-4);
  const statOf = (k) => {
    const s = suffix(k);
    if (!stats.has(s)) stats.set(s, { ok: 0, fail: 0, last: null, lastAt: null, coolUntil: 0, coolModel: {} });
    return stats.get(s);
  };
  const isExpired = (m) => (MODEL_EXPIRATION[m] ? now() > new Date(MODEL_EXPIRATION[m]).getTime() : false);

  async function getKeys(force = false) {
    if (!force && now() - cache.at < keysCacheMs && cache.keys.length) return cache.keys;
    let keys = [...new Set(ENV_NAMES.flatMap((n) => parseKeys(env[n])))];
    let source = keys.length ? 'env' : 'none';
    if (!keys.length && loadKeysFallback) {
      try {
        const v = await loadKeysFallback();
        keys = Array.isArray(v) ? parseKeys(v.join(',')) : parseKeys(v);
        if (keys.length) source = 'fallback';
      } catch { /* אין מקור חלופי – ממשיכים בלי */ }
    }
    cache = { at: now(), keys, source };
    return keys;
  }

  const extractText = (data) => {
    const parts = data?.candidates?.[0]?.content?.parts;
    if (!Array.isArray(parts)) return null;
    const t = parts.filter((p) => !p.thought).map((p) => p.text || '').join(''); // מדלגים על "מחשבות" של מודלי חשיבה
    return t.trim() ? t : null;
  };

  /**
   * generate({ system, prompt | contents, temperature, maxOutputTokens, json, noThinking, models, timeoutMs, accept })
   *   → { text, model, key, attempts }
   * נזרקת שגיאה (עם .attempts, .rejectedText, ו-.code === 'NO_KEYS' כשאין מפתחות) רק אם כל המודלים × כל המפתחות נכשלו.
   *   contents: [{ role: 'user'|'model', parts: [{ text }] }]   (prompt = קיצור להודעת משתמש אחת)
   *   accept(text) → boolean: בדיקת תקינות; נדחה פעמיים באותו מודל → מודל הבא; בסוף rejectedText נשאר על השגיאה
   */
  async function generate(opts = {}) {
    const keys = await getKeys();
    if (!keys.length) {
      const e = new Error('no gemini keys');
      e.code = 'NO_KEYS';
      e.attempts = [];
      throw e;
    }
    const contents = opts.contents || [{ role: 'user', parts: [{ text: String(opts.prompt || '') }] }];
    const body = {
      contents,
      generationConfig: {
        temperature: opts.temperature ?? 0.4,
        maxOutputTokens: opts.maxOutputTokens ?? 2048,
        ...(opts.json ? { responseMimeType: 'application/json' } : {}),
        ...(opts.noThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}), // בלי "חשיבה": מהיר בהרבה בעריכה קצרה; מודל שלא תומך מחזיר 400 והמנוע עובר הלאה
      },
    };
    if (opts.system) body.system_instruction = { parts: [{ text: opts.system }] };
    const payload = JSON.stringify(body);

    const attempts = [];
    let lastError = null;
    let rejectedText = null;
    let totalRej = 0;
    const deadline = now() + (opts.timeoutMs ?? 40_000);

    for (const model of (opts.models || models).filter((m) => !isExpired(m))) {
      let skipModel = false;
      let overloaded = 0;
      let rejected = 0;
      for (let i = 0; i < keys.length && !skipModel; i++) {
        const idx = (keyIndex + i) % keys.length;
        const key = keys[idx];
        const st = statOf(key);
        if (st.coolUntil > now() || (st.coolModel[model] || 0) > now()) continue; // מפתח בהתקררות
        const left = deadline - now();
        if (left < 2000 || totalRej >= 4) {
          lastError = lastError || new Error('timeout');
          break;
        }
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), Math.min(left, 25_000));
        const shortModel = model.replace('models/', '');
        try {
          // המפתח נשלח בכותרת (לא ב-URL), כדי שלא יידלף ללוגים של פרוקסי/שרת
          const res = await fetchImpl(`${API}${model}:generateContent`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
            body: payload,
            signal: ctrl.signal,
          });
          const raw = await res.text();
          let data = null;
          try { data = JSON.parse(raw); } catch { /* לא JSON */ }
          attempts.push({ model: shortModel, key: suffix(key), status: res.status });
          st.last = res.status;
          st.lastAt = new Date(now()).toISOString();

          if (res.status === 200) {
            const text = extractText(data);
            if (text && opts.accept && !opts.accept(text)) {
              attempts[attempts.length - 1].status = 'rejected';
              rejectedText = text;
              lastError = new Error('rejected by validator');
              totalRej++;
              if (++rejected >= 2) skipModel = true;
              continue;
            }
            if (text) {
              st.ok++;
              keyIndex = (idx + 1) % keys.length; // הקריאה הבאה מתחילה מהמפתח הבא – פיזור עומס
              return { text: text.trim(), model: shortModel, key: suffix(key), attempts };
            }
            lastError = new Error('empty: ' + (data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason || '?'));
            skipModel = true; // חסימת בטיחות / תשובה ריקה – מפתח אחר לא יעזור
            continue;
          }
          const msg = String(data?.error?.message || '');
          if (res.status === 400 && /API key not valid|API_KEY_INVALID/i.test(raw)) {
            st.fail++; st.coolUntil = now() + COOL_MS.badKey; lastError = new Error('invalid key …' + suffix(key)); continue;
          }
          if (res.status === 429) { st.fail++; st.coolModel[model] = now() + COOL_MS.quota; lastError = new Error('quota 429'); continue; }
          if (res.status === 402 || res.status === 403) { st.fail++; st.coolUntil = now() + COOL_MS.key; lastError = new Error('key ' + res.status); continue; }
          if (res.status === 503) { lastError = new Error('overloaded 503'); if (++overloaded >= 2) skipModel = true; continue; }
          lastError = new Error(`API ${res.status}: ${msg.slice(0, 160)}`);
          skipModel = true; // 400/404/500 – החלפת מפתח לא תעזור
        } catch (e) {
          const aborted = e && e.name === 'AbortError';
          attempts.push({ model: shortModel, key: suffix(key), status: aborted ? 'timeout' : 'error' });
          lastError = aborted ? new Error('timeout') : e;
          skipModel = true;
        } finally {
          clearTimeout(timer);
        }
      }
    }
    const err = new Error('all models/keys failed: ' + ((lastError && lastError.message) || '?'));
    err.attempts = attempts;
    err.rejectedText = rejectedText;
    throw err;
  }

  /** בדיקת כל מפתח בקריאה קטנה אחת (לדף ניהול) */
  async function testKeys() {
    const keys = await getKeys(true);
    const out = [];
    for (const key of keys) {
      const t0 = now();
      try {
        const r = await fetchImpl(`${API}models/gemini-2.5-flash:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'ok' }] }], generationConfig: { maxOutputTokens: 8 } }),
          signal: AbortSignal.timeout(15_000),
        });
        out.push({ key: '…' + suffix(key), status: r.status, ms: now() - t0 });
      } catch {
        out.push({ key: '…' + suffix(key), status: 'error', ms: now() - t0 });
      }
    }
    return out;
  }

  /** מצב המאגר – רק סיומות של 4 תווים, לעולם לא המפתח המלא */
  async function status() {
    const keys = await getKeys();
    return {
      source: cache.source,
      models: models.filter((m) => !isExpired(m)).map((m) => m.replace('models/', '')),
      keys: keys.map((k) => {
        const s = statOf(k);
        return { key: '…' + suffix(k), ok: s.ok, fail: s.fail, last: s.last, lastAt: s.lastAt, coolingSec: Math.max(0, Math.round((s.coolUntil - now()) / 1000)) };
      }),
    };
  }

  const reset = () => { cache = { at: 0, keys: [], source: 'none' }; };
  return { generate, getKeys, testKeys, status, reset };
}

/** חילוץ JSON מתשובה גם אם עטופה ב-```json או עם טקסט מסביב */
export function parseJsonLoose(text) {
  if (!text) return null;
  let s = String(text).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  try { return JSON.parse(s); } catch { /* ממשיכים */ }
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch { /* ממשיכים */ } }
  return null;
}
