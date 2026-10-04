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

// ה-echo endpoint שה-exec מפנה אליו (script.googleusercontent.com/macros/echo)
// לפעמים מחזיר 404 (עמוד שגיאה גנרי של גוגל, לא תשובת ה-doPost) ברגע הראשון
// אחרי ההפניה - כנראה עניין של consistency זמני בצד גוגל, לא שגיאה אמיתית.
// נצפה אמפירית: ~40-50% מהקריאות נכשלות ככה, וכמעט כולן מצליחות בניסיון חוזר
// מיידי (GET חוזר לאותה כתובת, ואם גם זה נכשל - POST חדש מקבל הפניה טרייה).
async function fetchOnceThroughRedirect(
  url: string,
  body: string,
  signal: AbortSignal,
): Promise<{ res: Response; text: string }> {
  let res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal,
    redirect: "manual",
  });
  // ה-exec של Apps Script מריץ את doPost ומחזיר 302 להפניה שמגישה את
  // התוצאה בפועל — ההפניה הזו עונה רק ל-GET (POST אליה מחזיר 405).
  // מעקב-הפניות האוטומטי של fetch לא אמין מול זה (מגיע לפעמים ל-doGet
  // הכללי במקום לתוצאה), אז עוקבים אחריה ידנית עם GET דווקא.
  if (res.status >= 300 && res.status < 400) {
    const location = res.headers.get("location");
    if (!location) throw new Error(`הפניה מהגשר בלי כתובת יעד (${res.status})`);
    res = await fetch(location, { method: "GET", signal });
    if (!res.ok) {
      // ניסיון חוזר אחד לאותה כתובת-הפניה לפני שמוותרים עליה
      await sleep(400);
      res = await fetch(location, { method: "GET", signal });
    }
  }
  const text = await res.text();
  return { res, text };
}

async function callBridge(action: string, payload: Record<string, unknown> = {}) {
  const { url, secret, root } = cfg();
  if (!url || !secret) {
    throw new Error("גשר הדרייב לא מוגדר (חסרים DRIVE_BRIDGE_URL / DRIVE_BRIDGE_SECRET)");
  }
  const body = JSON.stringify({ secret, action, root, ...payload });
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), BRIDGE_TIMEOUT_MS);
  try {
    let lastErr: Error | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      let res: Response;
      let text: string;
      try {
        ({ res, text } = await fetchOnceThroughRedirect(url, body, ctrl.signal));
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") throw e;
        lastErr = e instanceof Error ? e : new Error(String(e));
        continue;
      }
      let json: Record<string, unknown>;
      try {
        json = JSON.parse(text);
      } catch {
        lastErr = new Error(`תשובה לא תקינה מהגשר (${res.status}): ${text.slice(0, 200)}`);
        if (attempt < 3) await sleep(500 * attempt);
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
export async function getAccessToken() {
  if (tokenCache && Date.now() < tokenCache.exp) return tokenCache.token;
  const r = await callBridge("archive_token", {});
  if (!r.token) throw new Error("הגשר לא החזיר טוקן גישה לדרייב");
  tokenCache = { token: r.token as string, exp: Date.now() + 50 * 60 * 1000 };
  return tokenCache.token;
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
  const token = await getAccessToken();
  const q = `name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const params = new URLSearchParams({ q, fields: "files(id,name)", pageSize: "20" });
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`חיפוש תיקייה בדרייב נכשל (${res.status})`);
  const json = (await res.json()) as { files?: { id: string; name: string }[] };
  return json.files ?? [];
}

/** רשימת הילדים הישירים (קבצים ותיקיות) של תיקייה נתונה בדרייב. */
export async function driveListChildren(
  folderId: string,
): Promise<{ id: string; name: string; mimeType: string }[]> {
  const token = await getAccessToken();
  const out: { id: string; name: string; mimeType: string }[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken,files(id,name,mimeType)",
      pageSize: "1000",
      ...(pageToken ? { pageToken } : {}),
    });
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
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
  const token = await getAccessToken();
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/copy?fields=id,size`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name, parents: [parentId] }),
    },
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
  const token = await getAccessToken();
  const rootId = await getRootFolderId();
  const total = bytes.length;
  const init = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": mimeType || "application/octet-stream",
      "X-Upload-Content-Length": String(total),
    },
    body: JSON.stringify({ name, mimeType: mimeType || "application/octet-stream", parents: [rootId], description: "bagrut-materials-archive" }),
  });
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
  const token = await getAccessToken();
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
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
  if (bytes.length > 150 * 1024 * 1024) throw new Error("הקובץ גדול מ-150MB — מעל תקרת הארכיון, נשאר באחסון החם (Blob)");
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

async function convertOfficeToPdfViaDrive({
  bytes,
  mimeType,
  name,
}: {
  bytes: Uint8Array;
  mimeType: string;
  name: string;
}): Promise<Uint8Array> {
  const googleMime = OFFICE_TO_GOOGLE_MIME[mimeType];
  if (!googleMime) throw new Error(`סוג קובץ לא נתמך להמרה ל-PDF: ${mimeType}`);

  const token = await getAccessToken();
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
    const uploadRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    });
    if (!uploadRes.ok) {
      throw new Error(`המרת הקובץ נכשלה בהעלאה לדרייב (${uploadRes.status})`);
    }
    const uploaded = (await uploadRes.json()) as { id: string };
    fileId = uploaded.id;

    const exportRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=application/pdf`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!exportRes.ok) {
      throw new Error(`יצוא ה-PDF מהדרייב נכשל (${exportRes.status})`);
    }
    return new Uint8Array(await exportRes.arrayBuffer());
  } finally {
    if (fileId) {
      const id = fileId;
      fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
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

async function convertOfficeToPdfViaOracle({
  bytes,
  mimeType,
  name,
}: {
  bytes: Uint8Array;
  mimeType: string;
  name: string;
}): Promise<Uint8Array> {
  const { url, key } = oracleConvertCfg();
  if (!url || !key) throw new Error("שרת ההמרה של Oracle לא מוגדר");
  const normalized = await normalizeDocxZipPaths(bytes);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 55000);
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

export async function convertOfficeToPdf(args: { bytes: Uint8Array; mimeType: string; name: string }): Promise<Uint8Array> {
  if (isOracleConvertConfigured()) {
    try {
      return await convertOfficeToPdfViaOracle(args);
    } catch (e) {
      console.warn("[convert] Oracle/LibreOffice נכשל, עובר ל-Drive:", e instanceof Error ? e.message : e);
    }
  }
  return convertOfficeToPdfViaDrive(args);
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
};

/** רשימת כל הקבצים בתיקיית הארכיון (שטוחה - driveUpload תמיד מעלה ישירות ל-root, אין תיקיות-משנה) */
export async function driveListFiles(): Promise<DriveFileMeta[]> {
  const token = await getAccessToken();
  const rootId = await getRootFolderId();
  const files: DriveFileMeta[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${rootId}' in parents and trashed=false`,
      fields: "nextPageToken,files(id,name,mimeType,size,modifiedTime,webViewLink)",
      pageSize: "1000",
      ...(pageToken ? { pageToken } : {}),
    });
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`רשימת קבצי דרייב נכשלה (${res.status})`);
    const json = (await res.json()) as {
      files?: { id: string; name: string; mimeType: string; size?: string; modifiedTime?: string; webViewLink?: string }[];
      nextPageToken?: string;
    };
    for (const f of json.files ?? []) {
      files.push({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: f.size ? Number(f.size) : null,
        modifiedTime: f.modifiedTime ?? null,
        webViewLink: f.webViewLink ?? null,
      });
    }
    pageToken = json.nextPageToken;
  } while (pageToken);
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
