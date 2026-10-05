/**
 * גשר Google Drive דרך אותו פרויקט Apps Script שמריץ את print-center
 * (apps-script-send/ArchiveBridge.js, פרוסה ב-/exec אחד, מוגנת ב-ADMIN_SECRET
 * משותף). אין פרויקט GAS חדש, אין URL חדש, אין סוד חדש — לפי אותו עיקרון
 * שכבר קיים שם. זה האחסון היחיד של האתר: כל החומרים (טיוטה ופעילים) יושבים כאן
 * כ-drive://<fileId>. Vercel Blob בוטל לחלוטין ואין בו שימוש.
 *
 * root folder נפרד (DRIVE_ROOT_FOLDER, ברירת מחדל "bagrut-materials-archive")
 * כדי לא לערבב עם print-center-archive באותו חשבון דרייב.
 *
 * הקובץ הזה בלי "server-only" בכוונה - כדי שסקריפטים עצמאיים (scripts/*.ts,
 * מורצים ב-tsx מחוץ ל-Next) יוכלו לייבא אותו ישירות. קוד האתר עצמו מייבא
 * מ-driveBridge.ts (עם השומר), לא מכאן.
 */

import { createHash } from "node:crypto";

const BRIDGE_TIMEOUT_MS = 55000; // מתחת ל-60s של Vercel

function cfg() {
  const url = (process.env.DRIVE_BRIDGE_URL || "").trim();
  const secret = (process.env.DRIVE_BRIDGE_SECRET || "").trim();
  const root = (process.env.DRIVE_ROOT_FOLDER || "bagrut-materials-archive").trim() || "bagrut-materials-archive";
  return { url, secret, root };
}

export function isDriveConfigured() {
  const { url, secret } = cfg();
  return Boolean(url && secret);
}

export function driveConfigStatus() {
  const { url, secret, root } = cfg();
  return { configured: Boolean(url && secret), hasUrl: Boolean(url), hasSecret: Boolean(secret), root };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * פעולות גשר שמותר לשלוח מחדש (POST חוזר) כי הן קריאה-בלבד / אידמפוטנטיות.
 * כל השאר (archive_upload_small, archive_append, archive_finish, archive_delete…)
 * משנות מצב בדרייב: POST חוזר אחרי ש-doPost כבר רץ = קובץ כפול, או "finish" שני
 * שנכשל כי חלקי-הביניים כבר אוחדו ונמחקו (ההעלאה "נכשלת" ומשאירה קובץ יתום).
 */
const IDEMPOTENT_BRIDGE_ACTIONS: ReadonlySet<string> = new Set(["archive_ping", "archive_token", "archive_info", "archive_download"]);

/** השהיות בין ניסיונות ה-GET החוזרים לכתובת ההפניה (echo) — 4 ניסיונות סה"כ. */
const ECHO_RETRY_BACKOFF_MS = [300, 600, 1200];

type BridgeReply = { res: Response; text: string; json: Record<string, unknown> | null };

/** POST אחד לגשר. זורק רק על שגיאת רשת לפני שהתקבלה תשובה כלשהי. */
async function postToBridge(url: string, body: string, signal: AbortSignal): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal,
    redirect: "manual",
  });
}

function tryParseJson(text: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// ה-echo endpoint שה-exec מפנה אליו (script.googleusercontent.com/macros/echo)
// לפעמים מחזיר 404 (עמוד שגיאה גנרי של גוגל, לא תשובת ה-doPost) ברגע הראשון
// אחרי ההפניה - כנראה עניין של consistency זמני בצד גוגל, לא שגיאה אמיתית.
// נצפה אמפירית: ~40-50% מהקריאות נכשלות ככה, וכמעט כולן מצליחות ב-GET חוזר
// לאותה כתובת. חשוב: ברגע שהתקבלה ההפניה, doPost כבר רץ בצד גוגל — לכן
// הניסיונות החוזרים כאן הם תמיד GET בלבד לכתובת ההפניה, לעולם לא POST חדש.
async function fetchOnceThroughRedirect(url: string, body: string, signal: AbortSignal): Promise<BridgeReply> {
  const first = await postToBridge(url, body, signal);
  // ה-exec של Apps Script מריץ את doPost ומחזיר 302 להפניה שמגישה את
  // התוצאה בפועל — ההפניה הזו עונה רק ל-GET (POST אליה מחזיר 405).
  // מעקב-הפניות האוטומטי של fetch לא אמין מול זה (מגיע לפעמים ל-doGet
  // הכללי במקום לתוצאה), אז עוקבים אחריה ידנית עם GET דווקא.
  if (!(first.status >= 300 && first.status < 400)) {
    const text = await first.text();
    return { res: first, text, json: tryParseJson(text) };
  }
  const location = first.headers.get("location");
  if (!location) throw new Error(`הפניה מהגשר בלי כתובת יעד (${first.status})`);
  let last: BridgeReply | null = null;
  for (let attempt = 0; attempt <= ECHO_RETRY_BACKOFF_MS.length; attempt++) {
    if (attempt > 0) await sleep(ECHO_RETRY_BACKOFF_MS[attempt - 1]);
    try {
      const res = await fetch(location, { method: "GET", signal });
      const text = await res.text();
      last = { res, text, json: tryParseJson(text) };
      if (last.json) return last;
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") throw e;
      // שגיאת רשת ב-GET להפניה — מנסים שוב את אותה כתובת (לא POST חדש)
      last = last ?? { res: new Response(null, { status: 0 }), text: e instanceof Error ? e.message : String(e), json: null };
    }
  }
  return last!;
}

async function callBridge(action: string, payload: Record<string, unknown> = {}) {
  const { url, secret, root } = cfg();
  if (!url || !secret) {
    throw new Error("גשר הדרייב לא מוגדר (חסרים DRIVE_BRIDGE_URL / DRIVE_BRIDGE_SECRET)");
  }
  const body = JSON.stringify({ secret, action, root, ...payload });
  const idempotent = IDEMPOTENT_BRIDGE_ACTIONS.has(action);
  const maxPosts = idempotent ? 3 : 1;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), BRIDGE_TIMEOUT_MS);
  try {
    let lastErr: Error | null = null;
    for (let attempt = 1; attempt <= maxPosts; attempt++) {
      let reply: BridgeReply;
      try {
        reply = await fetchOnceThroughRedirect(url, body, ctrl.signal);
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") throw e;
        // שגיאת רשת לפני שהתקבלה תשובה — POST חוזר מותר רק לפעולות אידמפוטנטיות
        lastErr = e instanceof Error ? e : new Error(String(e));
        if (attempt < maxPosts) await sleep(500 * attempt);
        continue;
      }
      const { res, text, json } = reply;
      if (!json) {
        lastErr = new Error(
          `תשובה לא תקינה מהגשר (${res.status}): ${text.slice(0, 200)}` +
            (idempotent ? "" : " — ייתכן שהפעולה בוצעה בדרייב למרות השגיאה"),
        );
        if (attempt < maxPosts) await sleep(500 * attempt);
        continue;
      }
      if (!res.ok || json.ok === false) {
        throw new Error((json.error as string) || `שגיאת גשר (${res.status})`);
      }
      return json;
    }
    throw lastErr ?? new Error("שגיאת גשר לא ידועה");
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error("גשר הדרייב לא ענה בזמן (timeout) — נסי שוב");
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export async function drivePing() {
  const r = await callBridge("archive_ping");
  return { ok: true, email: (r.email as string) ?? null, rootFolderId: (r.rootFolderId as string) ?? null };
}

function b64encode(u8: Uint8Array) {
  return Buffer.from(u8).toString("base64");
}

async function uploadSmall({ name, mimeType, bytes }: { name: string; mimeType: string; bytes: Uint8Array }) {
  const r = await callBridge("archive_upload_small", { name, mimeType, base64: b64encode(bytes) });
  return { fileId: r.fileId as string, size: r.size as number };
}

// --- מסלול ישיר מול Drive REST (קבצים גדולים, עוקף תקרת ~50MB של GAS) ---
let tokenCache: { token: string; exp: number } | null = null;
/** מאלץ שליפת טוקן חדש (אחרי 401 בריצה ארוכה) */
export function resetAccessToken() {
  tokenCache = null;
}
export async function getAccessToken() {
  if (tokenCache && Date.now() < tokenCache.exp) return tokenCache.token;
  const r = await callBridge("archive_token", {});
  if (!r.token) throw new Error("הגשר לא החזיר טוקן גישה לדרייב");
  tokenCache = { token: r.token as string, exp: Date.now() + 50 * 60 * 1000 };
  return tokenCache.token;
}

/* ------------------------------ קריאה מאומתת ל-Drive REST ------------------------------ */

/** 401, או 403 עם גוף שמעיד על טוקן פג/לא תקף (ולא על מכסה/הרשאת קובץ). */
async function isAuthFailure(res: Response): Promise<boolean> {
  if (res.status === 401) return true;
  if (res.status !== 403) return false;
  const body = await res.clone().text().catch(() => "");
  return /authError|invalid[_ ]?(token|credentials)|ACCESS_TOKEN|insufficient.*scope|Login Required/i.test(body);
}

async function isRateLimit(res: Response): Promise<boolean> {
  if (res.status === 429) return true;
  if (res.status !== 403) return false;
  const body = await res.clone().text().catch(() => "");
  return /userRateLimitExceeded|rateLimitExceeded|Rate Limit Exceeded/i.test(body);
}

/**
 * fetch מול Drive REST v3 עם הטוקן של הגשר. העזר המשותף לכל הקריאות הישירות (גם driveTreeCore.driveApi):
 *  - 401 / 403-אימות: הטוקן השמור נזרק (resetAccessToken) ומנסים שוב פעם אחת עם טוקן טרי — בלי זה
 *    טוקן שפג מוקדם היה שולח אותנו למסלול האיטי (גשר GAS) עד 50 דקות.
 *  - 429 / 5xx / 403-מכסה: ניסיון חוזר עם backoff, עד `tries` (ברירת מחדל 1 — בלי ניסיון חוזר, כי
 *    POST/PATCH חוזרים אחרי תשובה שאבדה עלולים לכפול פעולה; הקורא מחליט).
 *  - timeout: AbortSignal.timeout(timeoutMs) אלא אם init.signal סופק.
 * הניסיון החוזר של האימות לא נספר ב-tries (הבקשה נדחתה לפני שבוצעה — תמיד בטוח לשלוח שוב).
 */
export async function driveFetchAuthed(
  url: string,
  init: RequestInit = {},
  opts: { tries?: number; timeoutMs?: number } = {},
): Promise<Response> {
  const tries = Math.max(1, opts.tries ?? 1);
  const timeoutMs = opts.timeoutMs ?? 90_000;
  let authRetried = false;
  let attempt = 0;
  let lastErr: unknown;
  while (attempt < tries) {
    attempt++;
    try {
      const token = await getAccessToken();
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        ...init,
        headers: { Authorization: `Bearer ${token}`, ...(init.headers as Record<string, string> | undefined) },
      });
      if (await isAuthFailure(res)) {
        resetAccessToken();
        lastErr = new Error(`${res.status} (אימות מול דרייב נכשל)`);
        if (!authRetried) {
          authRetried = true;
          attempt--; // ניסיון האימות לא נספר
        }
        continue;
      }
      if (res.status >= 500 || (await isRateLimit(res))) {
        lastErr = new Error(`${res.status} ${(await res.clone().text().catch(() => "")).slice(0, 120)}`);
        if (attempt < tries) {
          await sleep(Math.min(15_000, 400 * 2 ** attempt) + Math.random() * 300);
          continue;
        }
        return res; // הקורא מטפל ב-!ok
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (attempt < tries) await sleep(400 * attempt);
    }
  }
  throw new Error(`קריאת Drive נכשלה: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}

/* ------------------------------ תקציבי זמן ------------------------------ */
// ה-routes של הורדה/תצוגה מקדימה רצים עם maxDuration=60s. כל מסלול ההמרה (Oracle ← Drive) חייב
// להסתיים בפחות מזה, אחרת Vercel הורג את הבקשה באמצע בלי תשובה. כל fetch במסלול מקבל timeout,
// ומתוכנן כך שהמקרה הגרוע (Oracle נתקע + Drive איטי) נשאר בתוך CONVERT_TOTAL_BUDGET_MS.
export const CONVERT_TOTAL_BUDGET_MS = 55_000;
export const ORACLE_CONVERT_TIMEOUT_MS = 25_000;
export const DRIVE_CONVERT_UPLOAD_TIMEOUT_MS = 12_000;
export const DRIVE_CONVERT_EXPORT_TIMEOUT_MS = 15_000;
export const PDF_CACHE_LOOKUP_TIMEOUT_MS = 4_000;
export const PDF_CACHE_DOWNLOAD_TIMEOUT_MS = 8_000;
export const DRIVE_REST_DOWNLOAD_TIMEOUT_MS = 50_000;
export const DRIVE_REST_META_TIMEOUT_MS = 20_000;

/** שעון-תקציב פשוט: כמה זמן נשאר מתוך total מאז start, עם רצפה כדי שלא נשלח fetch עם timeout אפס. */
function budgetClock(totalMs: number) {
  const start = Date.now();
  return {
    remaining: () => Math.max(0, totalMs - (Date.now() - start)),
    /** timeout לשלב הבא: המינימום בין התקרה של השלב למה שנשאר (לפחות floorMs). */
    slice: (capMs: number, floorMs = 1_500) => Math.max(floorMs, Math.min(capMs, totalMs - (Date.now() - start))),
  };
}

let rootCache: string | null = null;
export async function getRootFolderId() {
  if (rootCache) return rootCache;
  const p = await drivePing();
  if (!p.rootFolderId) throw new Error("לא נמצאה תיקיית ארכיון בדרייב");
  rootCache = p.rootFolderId;
  return rootCache;
}

/** מוצא תיקיות בדרייב לפי שם מדויק (לאיתור עץ-מקור, למשל גיבוי מקומי). */
export async function driveFindFoldersByName(name: string): Promise<{ id: string; name: string }[]> {
  const q = `name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const params = new URLSearchParams({ q, fields: "files(id,name)", pageSize: "20" });
  const res = await driveFetchAuthed(`https://www.googleapis.com/drive/v3/files?${params}`, {}, { tries: 3, timeoutMs: DRIVE_REST_META_TIMEOUT_MS });
  if (!res.ok) throw new Error(`חיפוש תיקייה בדרייב נכשל (${res.status})`);
  const json = (await res.json()) as { files?: { id: string; name: string }[] };
  return json.files ?? [];
}

/** רשימת הילדים הישירים (קבצים ותיקיות) של תיקייה נתונה בדרייב. */
export async function driveListChildren(
  folderId: string,
): Promise<{ id: string; name: string; mimeType: string }[]> {
  const out: { id: string; name: string; mimeType: string }[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken,files(id,name,mimeType)",
      pageSize: "1000",
      ...(pageToken ? { pageToken } : {}),
    });
    const res = await driveFetchAuthed(`https://www.googleapis.com/drive/v3/files?${params}`, {}, { tries: 3, timeoutMs: DRIVE_REST_META_TIMEOUT_MS });
    if (!res.ok) throw new Error(`רשימת קבצי תיקייה בדרייב נכשלה (${res.status})`);
    const json = (await res.json()) as {
      files?: { id: string; name: string; mimeType: string }[];
      nextPageToken?: string;
    };
    for (const f of json.files ?? []) out.push(f);
    pageToken = json.nextPageToken;
  } while (pageToken);
  return out;
}

/**
 * מעתיק קובץ קיים בדרייב לתיקיית יעד (פעולה בצד השרת של גוגל - אלפיות שנייה,
 * בלי להעביר בייטים מהמחשב המקומי). שימושי כשיש כבר עותק של הקובץ בדרייב
 * (למשל גיבוי מקומי לאותו חשבון) - הרבה יותר מהיר מ-driveUpload.
 */
export async function driveCopyFile(
  fileId: string,
  { name, parentId }: { name: string; parentId: string },
): Promise<{ fileId: string; size: number }> {
  // tries=1: העתקה יוצרת קובץ — ניסיון חוזר אחרי תשובה שאבדה היה מכפיל אותו (401 עדיין מנוסה שוב)
  const res = await driveFetchAuthed(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/copy?fields=id,size`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parents: [parentId] }),
    },
    { tries: 1 },
  );
  if (!res.ok) throw new Error(`העתקת קובץ בדרייב נכשלה (${res.status})`);
  const json = (await res.json()) as { id: string; size?: string };
  return { fileId: json.id, size: json.size ? Number(json.size) : 0 };
}

async function driveUploadRest({
  name,
  mimeType,
  bytes,
  onProgress,
}: {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
  onProgress?: (p: { done: number; total: number }) => void;
}): Promise<{ fileId: string; size: number }> {
  const rootId = await getRootFolderId();
  const total = bytes.length;
  // פתיחת session להעלאה עוד לא יוצרת קובץ — בטוח לנסות שוב (וגם לרענן טוקן ב-401)
  const init = await driveFetchAuthed(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType || "application/octet-stream",
        "X-Upload-Content-Length": String(total),
      },
      body: JSON.stringify({ name, mimeType: mimeType || "application/octet-stream", parents: [rootId], description: "bagrut-materials-archive" }),
    },
    { tries: 3, timeoutMs: DRIVE_REST_META_TIMEOUT_MS },
  );
  if (!init.ok) throw new Error(`פתיחת העלאה ישירה לדרייב נכשלה (${init.status})`);
  const sessionUri = init.headers.get("location");
  if (!sessionUri) throw new Error("דרייב לא החזיר session להעלאה");
  const STEP = 8 * 1024 * 1024;
  let off = 0;
  for (;;) {
    const end = Math.min(off + STEP, total);
    const chunk = Buffer.from(bytes.slice(off, end));
    const put = await fetch(sessionUri, {
      method: "PUT",
      headers: { "Content-Length": String(chunk.length), "Content-Range": `bytes ${off}-${end - 1}/${total}` },
      body: chunk,
    });
    if (put.status === 308) {
      off = end;
      onProgress?.({ done: off, total });
      continue;
    }
    if (!put.ok) throw new Error(`נתח העלאה ישירה נכשל (${put.status})`);
    const meta = (await put.json()) as { id: string; size?: string };
    onProgress?.({ done: total, total });
    return { fileId: meta.id, size: parseInt(meta.size || String(total), 10) || total };
  }
}

async function driveDownloadRest(fileId: string, { maxBytes = 150 * 1024 * 1024 } = {}) {
  // 401 → טוקן טרי וניסיון נוסף (בתוך driveFetchAuthed) לפני שנופלים לגשר האיטי; tries=2 גם ל-5xx חולף
  const res = await driveFetchAuthed(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
    {},
    { tries: 2, timeoutMs: DRIVE_REST_DOWNLOAD_TIMEOUT_MS },
  );
  if (!res.ok) throw new Error(`הורדה ישירה מדרייב נכשלה (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > maxBytes) throw new Error(`הקובץ גדול מ-${Math.round(maxBytes / 1048576)}MB — מעל התקרה לשרת`);
  return { bytes: new Uint8Array(buf), size: buf.length, mimeType: res.headers.get("content-type") };
}

async function driveDownloadGas(fileId: string, { maxBytes = 110 * 1024 * 1024 } = {}) {
  const step = 6 * 1024 * 1024;
  const parts: Buffer[] = [];
  let offset = 0;
  let total: number | null = null;
  for (;;) {
    const r = await callBridge("archive_download", { fileId, offset, length: step });
    const buf = Buffer.from((r.base64 as string) || "", "base64");
    if (total === null) total = (r.totalSize as number) ?? offset + buf.length;
    if (buf.length) {
      parts.push(buf);
      offset += buf.length;
    }
    if (r.done || !buf.length || offset >= (total || Infinity)) break;
    if (offset > maxBytes) throw new Error(`הקובץ גדול מ-${Math.round(maxBytes / 1048576)}MB — מעל התקרה לשרת`);
    if (parts.length > 60) throw new Error("הורדה ארוכה מדי — הקובץ חריג בגודלו");
  }
  const out = Buffer.concat(parts);
  return { bytes: new Uint8Array(out), size: out.length, mimeType: null as string | null };
}

/** מעלה קובץ לדרייב. עד 25MB בקריאת GAS אחת, מעל זה REST resumable ישיר. תקרה 150MB. */
export async function driveUpload({
  name,
  mimeType,
  bytes,
  onProgress,
}: {
  name: string;
  mimeType?: string;
  bytes: Uint8Array;
  onProgress?: (p: { done: number; total: number }) => void;
}): Promise<{ fileId: string; size: number }> {
  if (!bytes.length) throw new Error("אין תוכן להעלאה");
  if (bytes.length > 150 * 1024 * 1024) throw new Error("הקובץ גדול מ-150MB — מעל תקרת הארכיון בדרייב; יש לפצל או לדחוס את הקובץ");
  if (!name) throw new Error("חסר שם קובץ");
  const cleanName = String(name).replace(/[\\/:*?"<>|]+/g, "_").slice(0, 180);

  if (bytes.length <= 25 * 1024 * 1024) {
    const r = await uploadSmall({ name: cleanName, mimeType: mimeType || "application/octet-stream", bytes });
    onProgress?.({ done: bytes.length, total: bytes.length });
    return r;
  }
  return driveUploadRest({ name: cleanName, mimeType: mimeType || "application/octet-stream", bytes, onProgress });
}

/** מוריד קובץ מהדרייב: קודם ישיר מול Drive REST, נפילה לגשר GAS כגיבוי. */
export async function driveDownload(fileId: string, opts: { maxBytes?: number } = {}) {
  if (!fileId) throw new Error("חסר fileId");
  try {
    return await driveDownloadRest(fileId, opts);
  } catch (e) {
    console.warn("[drive] הורדה ישירה נכשלה, עובר לגשר:", e instanceof Error ? e.message : e);
    return driveDownloadGas(fileId, opts);
  }
}

export async function driveInfo(fileId: string) {
  const r = await callBridge("archive_info", { fileId });
  return { name: r.name as string, mimeType: r.mimeType as string, size: r.size as number };
}

export async function driveDelete(fileId: string) {
  await callBridge("archive_delete", { fileId });
  return { ok: true };
}

// --- העלאה בחתיכות דרך ה-GAS bridge עצמו (archive_init/append/finish) ---
// אחסון-ביניים בין קריאות /chunk נפרדות (כל קריאה היא
// invocation סרברלס נפרד וחסר זיכרון-משותף) - לא היה בשימוש שוטף אצל
// print-center ("נתיב חירום ישן"), פה הוא הנתיב הרגיל והיחיד.
export async function driveChunkAppend(uploadId: string, index: number, bytes: Uint8Array) {
  await callBridge("archive_append", { uploadId, index, base64: b64encode(bytes) });
}

export async function driveChunkFinish(uploadId: string, name: string, mimeType: string) {
  const cleanName = String(name).replace(/[\\/:*?"<>|]+/g, "_").slice(0, 180);
  const r = await callBridge("archive_finish", { uploadId, name: cleanName, mimeType: mimeType || "application/octet-stream" });
  return { fileId: r.fileId as string, size: r.size as number };
}

// --- המרת Word/PowerPoint ל-PDF, דרך מנוע ההמרה המובנה של Google Drive ---
// (לא LibreOffice, לא שירות חיצוני בתשלום, ואין צורך בהתקנת גופנים — Drive
// ממיר לפורמט Google Docs/Slides עם מנוע הגופנים הפנימי שלו ומייצא PDF).
// הקובץ המומר הוא עותק זמני בלבד: נוצר, מיוצא ל-PDF, ונמחק תמיד ב-finally.
// קובץ ה-Word/PowerPoint המקורי באחסון (Drive) לא נוגע בו כלל.
const OFFICE_TO_GOOGLE_MIME: Record<string, string> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    "application/vnd.google-apps.document",
  "application/msword": "application/vnd.google-apps.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    "application/vnd.google-apps.presentation",
  "application/vnd.ms-powerpoint": "application/vnd.google-apps.presentation",
};

export function isOfficeMime(mimeType: string) {
  return mimeType in OFFICE_TO_GOOGLE_MIME;
}

type ConvertArgs = { bytes: Uint8Array; mimeType: string; name: string };
type Budget = ReturnType<typeof budgetClock>;

async function convertOfficeToPdfViaDrive({ bytes, mimeType, name }: ConvertArgs, budget: Budget): Promise<Uint8Array> {
  const googleMime = OFFICE_TO_GOOGLE_MIME[mimeType];
  if (!googleMime) throw new Error(`סוג קובץ לא נתמך להמרה ל-PDF: ${mimeType}`);

  const rootId = await getRootFolderId();

  const boundary = `bagrut-convert-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const metadata = JSON.stringify({ name, mimeType: googleMime, parents: [rootId] });
  const preamble =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const closing = `\r\n--${boundary}--`;
  const body = Buffer.concat([
    Buffer.from(preamble, "utf-8"),
    Buffer.from(bytes),
    Buffer.from(closing, "utf-8"),
  ]);

  let fileId: string | null = null;
  try {
    // tries=1: ההעלאה יוצרת מסמך זמני — ניסיון חוזר היה משאיר עותקים יתומים; 401 עדיין מרוענן בתוך העזר
    const uploadRes = await driveFetchAuthed(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
      { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body },
      { tries: 1, timeoutMs: budget.slice(DRIVE_CONVERT_UPLOAD_TIMEOUT_MS) },
    );
    if (!uploadRes.ok) {
      throw new Error(`המרת הקובץ נכשלה בהעלאה לדרייב (${uploadRes.status})`);
    }
    const uploaded = (await uploadRes.json()) as { id: string };
    fileId = uploaded.id;

    const exportRes = await driveFetchAuthed(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=application/pdf`,
      {},
      { tries: 1, timeoutMs: budget.slice(DRIVE_CONVERT_EXPORT_TIMEOUT_MS) },
    );
    if (!exportRes.ok) {
      throw new Error(`יצוא ה-PDF מהדרייב נכשל (${exportRes.status})`);
    }
    return new Uint8Array(await exportRes.arrayBuffer());
  } finally {
    if (fileId) {
      // ניקוי העותק הזמני — best-effort, לא מחכים לו (לא חלק מתקציב הבקשה)
      driveFetchAuthed(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`, { method: "DELETE" }, { tries: 1, timeoutMs: 15_000 }).catch(() => {});
    }
  }
}

// --- המרת Word/PowerPoint ל-PDF דרך LibreOffice אמיתי, על שרת Oracle קבוע (משותף
// עם print-center) - שומר על גופנים עבריים מסחריים (FbPgisha/FbToccido/Kapriza/David
// וכו') שמותקנים בפועל בשרת, בניגוד להמרה דרך Drive שמחליפה בשקט כל גופן שלא
// בקטלוג שלה (ר' זיכרון drive-pdf-conversion-font-limitation). זו לא תחליף מלא
// ל-Drive: אם השרת לא מוגדר/לא מגיב, נופלים חזרה ל-Drive באופן שקוף.
function oracleConvertCfg() {
  const url = (process.env.ORACLE_CONVERT_URL || "").trim().replace(/\/+$/, "");
  const key = (process.env.ORACLE_CONVERT_API_KEY || "").trim();
  return { url, key };
}

export function isOracleConvertConfigured() {
  const { url, key } = oracleConvertCfg();
  return Boolean(url && key);
}

// docx/pptx שנבנו ע"י סקריפט ה-JSZip הפנימי (ר' "Lesson-material authoring" ב-CLAUDE.md)
// לפעמים נשמרים עם ערכי-נתיב עם backslash בתוך ה-zip (למשל "word\document.xml"
// במקום "word/document.xml") - Word/Drive סולחים על זה, אבל LibreOffice מסרב לפתוח
// את הקובץ כלל ("source file could not be loaded"). מנרמלים תמיד לפני שליחה ל-Oracle,
// בלי תלות בזיהוי אם הקובץ הספציפי פגום - זה זול ובטוח להריץ גם על קובץ תקין.
async function normalizeDocxZipPaths(bytes: Uint8Array): Promise<Uint8Array> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(bytes);
  const backslash = String.fromCharCode(92);
  let changed = false;
  const out = new JSZip();
  for (const [entryName, file] of Object.entries(zip.files)) {
    const fixedName = entryName.split(backslash).join("/");
    if (fixedName !== entryName) changed = true;
    const content = await file.async("uint8array");
    out.file(fixedName, content, { binary: true });
  }
  if (!changed) return bytes;
  return await out.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

async function convertOfficeToPdfViaOracle({ bytes, mimeType, name }: ConvertArgs, budget: Budget): Promise<Uint8Array> {
  const { url, key } = oracleConvertCfg();
  if (!url || !key) throw new Error("שרת ההמרה של Oracle לא מוגדר");
  const normalized = await normalizeDocxZipPaths(bytes);
  // 25s ולא 55s: אם Oracle תקוע חייב להישאר זמן לנפילה ל-Drive בתוך ה-60s של ה-route
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), budget.slice(ORACLE_CONVERT_TIMEOUT_MS));
  try {
    const res = await fetch(`${url}/docx-to-pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": key },
      body: JSON.stringify({
        fileDataBase64: b64encode(normalized),
        fileName: name,
        mimeType,
      }),
      signal: ctrl.signal,
    });
    const json = (await res.json().catch(() => ({}))) as { status?: string; error?: string; data?: { data: string } };
    if (!res.ok || json.status !== "success" || !json.data?.data) {
      throw new Error(json.error || `שרת ההמרה של Oracle החזיר שגיאה (${res.status})`);
    }
    return new Uint8Array(Buffer.from(json.data.data, "base64"));
  } finally {
    clearTimeout(t);
  }
}

async function convertWithBudget(args: ConvertArgs, budget: Budget): Promise<Uint8Array> {
  if (isOracleConvertConfigured()) {
    try {
      return await convertOfficeToPdfViaOracle(args, budget);
    } catch (e) {
      console.warn("[convert] Oracle/LibreOffice נכשל, עובר ל-Drive:", e instanceof Error ? e.message : e);
    }
  }
  return convertOfficeToPdfViaDrive(args, budget);
}

/** המרה "לפי דרישה" בלי מטמון — ההתנהגות המקורית. כל המסלול (Oracle ← Drive) בתוך CONVERT_TOTAL_BUDGET_MS. */
export async function convertOfficeToPdf(args: ConvertArgs): Promise<Uint8Array> {
  return convertWithBudget(args, budgetClock(CONVERT_TOTAL_BUDGET_MS));
}

// --- מטמון ה-PDF המומר (לא מוטבע) בדרייב ---
// כל הורדה/תצוגה מקדימה של docx המירה מחדש (10-20 שניות). עכשיו: ה-PDF המומר, *לפני* הטבעת סימן
// המים, נשמר כקובץ בתיקיית `_pdf-cache` תחת שורש הארכיון, מתויג ב-appProperties:
//   pdfOf = fileId של המקור,  md5 = md5 של הבייטים שהומרו,  pdfCache = "1"
// המפתח הוא תוכן ולא גרסה: md5 מחושב מקומית על הבייטים שמגיעים להמרה — לקובץ שלא שונה הוא זהה
// ל-md5Checksum של הדרייב (אין צורך בקריאת מטא-דאטה נוספת), ולקובץ שעבר "תיקונים" (applyDocxFixes)
// הוא שונה, ולכן מקבל רשומת מטמון נפרדת ולעולם לא מוגש PDF של תוכן אחר. ההרשאה והטבעת
// הקוד האישי נשארות ב-route לכל בקשה — המטמון מכיל רק את מה שכל מורשית הייתה מקבלת ממילא.
// כתיבה למטמון = best-effort: אף פעם לא מפילה בקשה; מומלץ להריץ אותה אחרי התשובה (defer=after).
export const PDF_CACHE_FOLDER_NAME = "_pdf-cache";
const PDF_CACHE_KEEP_PER_FILE = 3; // כמה גרסאות (md5 שונים) לשמור לכל קובץ מקור — הישנות נזרקות לאשפה
const DRIVE_API = "https://www.googleapis.com/drive/v3/files";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

function md5Hex(bytes: Uint8Array): string {
  return createHash("md5").update(bytes).digest("hex");
}

let pdfCacheFolderId: string | null = null;
/** תיקיית המטמון (נוצרת פעם אחת תחת שורש הארכיון). */
async function getPdfCacheFolderId(): Promise<string> {
  if (pdfCacheFolderId) return pdfCacheFolderId;
  const rootId = await getRootFolderId();
  const q = `name = '${PDF_CACHE_FOLDER_NAME}' and '${rootId}' in parents and mimeType = '${FOLDER_MIME_TYPE}' and trashed = false`;
  const found = await driveFetchAuthed(`${DRIVE_API}?${new URLSearchParams({ q, fields: "files(id)", pageSize: "1" })}`, {}, { tries: 2, timeoutMs: DRIVE_REST_META_TIMEOUT_MS });
  if (found.ok) {
    const j = (await found.json()) as { files?: { id: string }[] };
    if (j.files?.[0]?.id) return (pdfCacheFolderId = j.files[0].id);
  }
  const created = await driveFetchAuthed(
    `${DRIVE_API}?fields=id`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: PDF_CACHE_FOLDER_NAME, mimeType: FOLDER_MIME_TYPE, parents: [rootId], appProperties: { pdfCache: "1" }, description: "מטמון PDF מומר של האתר — ניתן למחוק בכל עת, נבנה מחדש אוטומטית" }),
    },
    { tries: 1, timeoutMs: DRIVE_REST_META_TIMEOUT_MS },
  );
  if (!created.ok) throw new Error(`יצירת תיקיית המטמון נכשלה (${created.status})`);
  return (pdfCacheFolderId = ((await created.json()) as { id: string }).id);
}

const isValidDriveId = (id: string) => /^[A-Za-z0-9_-]{10,}$/.test(id);

/** מחפש PDF במטמון לפי (fileId, md5). מחזיר null בכל כשל — הקורא ממיר רגיל. */
async function findCachedPdf(fileId: string, md5: string, budget: Budget): Promise<Uint8Array | null> {
  const q = `appProperties has { key='pdfOf' and value='${fileId}' } and appProperties has { key='md5' and value='${md5}' } and trashed = false`;
  const res = await driveFetchAuthed(
    `${DRIVE_API}?${new URLSearchParams({ q, fields: "files(id,size)", pageSize: "1" })}`,
    {},
    { tries: 1, timeoutMs: budget.slice(PDF_CACHE_LOOKUP_TIMEOUT_MS) },
  );
  if (!res.ok) return null;
  const hit = ((await res.json()) as { files?: { id: string; size?: string }[] }).files?.[0];
  if (!hit?.id) return null;
  const dl = await driveFetchAuthed(`${DRIVE_API}/${encodeURIComponent(hit.id)}?alt=media`, {}, { tries: 1, timeoutMs: budget.slice(PDF_CACHE_DOWNLOAD_TIMEOUT_MS) });
  if (!dl.ok) return null;
  const buf = new Uint8Array(await dl.arrayBuffer());
  // הגנה מפני רשומה פגומה/ריקה: חייב להיראות כמו PDF
  if (buf.length < 8 || String.fromCharCode(...buf.subarray(0, 4)) !== "%PDF") return null;
  return buf;
}

/** שומר PDF במטמון ומגזם גרסאות ישנות של אותו מקור. זורק על כשל — הקורא עוטף ב-catch. */
async function storeCachedPdf(fileId: string, md5: string, name: string, pdf: Uint8Array): Promise<void> {
  const folderId = await getPdfCacheFolderId();
  const dot = name.lastIndexOf(".");
  const pdfName = `${(dot > 0 ? name.slice(0, dot) : name).replace(/[\\/:*?"<>|]+/g, "_").slice(0, 150)}.pdf`;
  const boundary = `pdf-cache-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const meta = JSON.stringify({
    name: pdfName,
    mimeType: "application/pdf",
    parents: [folderId],
    appProperties: { pdfOf: fileId, md5, pdfCache: "1" },
    description: `מטמון PDF של drive://${fileId} (md5 ${md5}) — נוצר אוטומטית, אפשר למחוק`,
  });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`, "utf-8"),
    Buffer.from(pdf),
    Buffer.from(`\r\n--${boundary}--`, "utf-8"),
  ]);
  const up = await driveFetchAuthed(
    `${DRIVE_UPLOAD_API}?uploadType=multipart&fields=id`,
    { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body },
    { tries: 1, timeoutMs: 30_000 },
  );
  if (!up.ok) throw new Error(`שמירה במטמון נכשלה (${up.status})`);

  // גיזום: לכל מקור נשמרות רק PDF_CACHE_KEEP_PER_FILE הרשומות החדשות (גרסה ישנה של הקובץ / תיקונים ישנים)
  const q = `appProperties has { key='pdfOf' and value='${fileId}' } and trashed = false`;
  const list = await driveFetchAuthed(
    `${DRIVE_API}?${new URLSearchParams({ q, fields: "files(id,createdTime)", orderBy: "createdTime desc", pageSize: "50" })}`,
    {},
    { tries: 1, timeoutMs: DRIVE_REST_META_TIMEOUT_MS },
  );
  if (!list.ok) return;
  const stale = (((await list.json()) as { files?: { id: string }[] }).files ?? []).slice(PDF_CACHE_KEEP_PER_FILE);
  for (const f of stale) {
    await driveFetchAuthed(`${DRIVE_API}/${encodeURIComponent(f.id)}?fields=id`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) }, { tries: 1, timeoutMs: DRIVE_REST_META_TIMEOUT_MS }).catch(() => {});
  }
}

/**
 * כמו convertOfficeToPdf, עם מטמון בדרייב (ר' ההסבר מעל). ללא `fileId` תקין מתנהג בדיוק כמו המקור.
 * `defer` (אופציונלי): איך להריץ את הכתיבה למטמון — למשל `after` מ-next/server כדי שתרוץ אחרי
 * שהתשובה נשלחה; בלי זה — fire-and-forget עם לוג שגיאה (ב-Vercel עלול להיקטע עם סיום הבקשה).
 */
export async function convertOfficeToPdfCached(
  args: ConvertArgs & { fileId?: string | null; defer?: (task: () => Promise<void>) => void },
): Promise<Uint8Array> {
  const { fileId, defer, ...rest } = args;
  const budget = budgetClock(CONVERT_TOTAL_BUDGET_MS);
  const key = fileId && isValidDriveId(fileId) ? { fileId, md5: md5Hex(rest.bytes) } : null;
  if (key) {
    try {
      const hit = await findCachedPdf(key.fileId, key.md5, budget);
      if (hit) return hit;
    } catch (e) {
      console.warn("[pdf-cache] חיפוש במטמון נכשל, ממירים רגיל:", e instanceof Error ? e.message : e);
    }
  }
  const pdf = await convertWithBudget(rest, budget);
  if (key) {
    const task = () =>
      storeCachedPdf(key.fileId, key.md5, rest.name, pdf).catch((e) => {
        console.warn("[pdf-cache] שמירה במטמון נכשלה (לא משפיע על הבקשה):", e instanceof Error ? e.message : e);
      });
    if (defer) defer(task);
    else void task();
  }
  return pdf;
}

// --- רשימת/חיפוש קבצים בארכיון — לסוכן ה-fix-reports, כדי "להבין" לאיזה קובץ
// דיווח/שאלה מתייחסים (ר' .claude/commands/fix-reports.md, /agent-system, ו-
// "כללי עריכת קבצי וורד מבוקשים באתר.md"). מחזיר מטא-דאטה בלבד (שם/id/גודל/
// קישור) - אף פעם לא תוכן/בייטים של הקובץ. חובה: אין כאן, ובשום מקום שקורא
// לפונקציות האלה, זרימה שמחזירה בייטים של קובץ למדווח/ת (visitor אנונימי) -
// זיהוי קובץ מותר, שליחת תוכן/הורדה ישירה למדווח/ת אסורה לגמרי.
export type DriveFileMeta = {
  id: string;
  name: string;
  mimeType: string;
  size: number | null;
  modifiedTime: string | null;
  webViewLink: string | null;
  /** התיקייה שבה הקובץ יושב (null = שורש הארכיון) */
  parentId: string | null;
};

// כמה תיקיות-הורה בשאילתת q אחת ("'a' in parents or 'b' in parents …") — מגביל את אורך ה-URL
const PARENTS_PER_QUERY = 40;

/**
 * רשימת כל הקבצים בארכיון. הארכיון הוא עץ (תיקייה לכל קטגוריה, ר' driveTreeCore), לכן ברירת המחדל
 * רקורסיבית: BFS לפי רמות, כשכל רמה נשאלת בקבוצות של PARENTS_PER_QUERY תיקיות בשאילתה אחת
 * (מאות תיקיות ← עשרות קריאות, לא מאות). `recursive: false` = רק הילדים הישירים של השורש (ההתנהגות הישנה).
 * מדלג על תיקיית מטמון ה-PDF ועל קובצי _מידע.txt של האתר. מטא-דאטה בלבד — אף פעם לא תוכן.
 */
export async function driveListFiles(opts: { recursive?: boolean } = {}): Promise<DriveFileMeta[]> {
  const recursive = opts.recursive ?? true;
  const rootId = await getRootFolderId();
  const files: DriveFileMeta[] = [];
  let frontier = [rootId];
  for (let depth = 0; frontier.length && depth < 25; depth++) {
    const nextFrontier: string[] = [];
    for (let i = 0; i < frontier.length; i += PARENTS_PER_QUERY) {
      const chunk = frontier.slice(i, i + PARENTS_PER_QUERY);
      const parentsQ = chunk.map((id) => `'${id}' in parents`).join(" or ");
      let pageToken: string | undefined;
      do {
        const params = new URLSearchParams({
          q: `(${parentsQ}) and trashed = false`,
          fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink,parents,appProperties)",
          pageSize: "1000",
          ...(pageToken ? { pageToken } : {}),
        });
        const res = await driveFetchAuthed(`${DRIVE_API}?${params}`, {}, { tries: 3, timeoutMs: DRIVE_REST_META_TIMEOUT_MS });
        if (!res.ok) throw new Error(`רשימת קבצי דרייב נכשלה (${res.status})`);
        const json = (await res.json()) as {
          files?: { id: string; name: string; mimeType: string; size?: string; modifiedTime?: string; webViewLink?: string; parents?: string[]; appProperties?: Record<string, string> }[];
          nextPageToken?: string;
        };
        for (const f of json.files ?? []) {
          if (f.mimeType === FOLDER_MIME_TYPE) {
            if (recursive && f.name !== PDF_CACHE_FOLDER_NAME && f.appProperties?.pdfCache !== "1") nextFrontier.push(f.id);
            continue;
          }
          if (f.appProperties?.siteInfo === "1" || f.appProperties?.pdfCache === "1") continue;
          const parent = f.parents?.[0] ?? null;
          files.push({
            id: f.id,
            name: f.name,
            mimeType: f.mimeType,
            size: f.size ? Number(f.size) : null,
            modifiedTime: f.modifiedTime ?? null,
            webViewLink: f.webViewLink ?? null,
            parentId: parent === rootId ? null : parent,
          });
        }
        pageToken = json.nextPageToken;
      } while (pageToken);
    }
    frontier = nextFrontier;
  }
  return files;
}

/**
 * מדרג קבצים מהארכיון לפי דמיון-שם לטקסט חיפוש חופשי — התאמת טוקנים פשוטה
 * (לא AI/embeddings): "הבנה" בפועל של איזה קובץ מדובר נשארת אצל הסוכן (קלוד)
 * שמפעיל את הפונקציה הזו ושופט את התוצאות, לא כאן.
 */
export function scoreDriveFilesByQuery(files: DriveFileMeta[], query: string) {
  const tokens = query
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 2);
  return files
    .map((f) => {
      const name = f.name.toLowerCase();
      const score = tokens.reduce((acc, t) => acc + (name.includes(t) ? 1 : 0), 0);
      return { ...f, score };
    })
    .sort((a, b) => b.score - a.score);
}

// --- עזרי drive:// URL (נשמר ב-materials.fileUrl כשמאוחסן בדרייב) ---
export const DRIVE_URL_PREFIX = "drive://";
export function isDriveUrl(url: string | null | undefined) {
  return String(url || "").startsWith(DRIVE_URL_PREFIX);
}
export function driveIdFromUrl(url: string) {
  return url.startsWith(DRIVE_URL_PREFIX) ? url.slice(DRIVE_URL_PREFIX.length).split("?")[0] : null;
}
export function driveUrlFor(fileId: string) {
  return `${DRIVE_URL_PREFIX}${fileId}`;
}
