import "server-only";
import { driveFetchAuthed } from "@/lib/driveBridgeCore";

/**
 * שמירת התמונות הגולמיות (images.pdf, ~25-30MB) של תור ההפקות בדרייב של חשבון הארכיון. התיקייה בשורש ה-My Drive,
 * **מחוץ** לתיקיית הארכיון של האתר (bagrut-materials-archive) כדי ש-drive-sync לא יצרף אותן לאתר כחומרים.
 * ב-DB נשמר רק ה-fileId (deck_jobs.images_file_id); המערכת המקומית מורידה לפי ה-id.
 */
export const RAW_IMAGES_FOLDER = "נוטבוק - תמונות גולמיות (תור הפקות)";
const API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const STEP = 8 * 1024 * 1024;
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

let folderPromise: Promise<string> | null = null;

/** מזהה תיקייה; ה-promise נשמר כדי שחמש העלאות במקביל לא ייצרו חמש תיקיות; כשל מנקה את המטמון */
function ensureRawFolder(): Promise<string> {
  if (!folderPromise) folderPromise = findOrCreateRawFolder().catch((e) => { folderPromise = null; throw e; });
  return folderPromise;
}

async function findOrCreateRawFolder(): Promise<string> {
  const q = `'root' in parents and trashed = false and name = '${esc(RAW_IMAGES_FOLDER)}' and mimeType = '${FOLDER_MIME}'`;
  const r = await driveFetchAuthed(`${API}?${new URLSearchParams({ q, fields: "files(id)", pageSize: "2" })}`, {}, { tries: 3, timeoutMs: 20_000 });
  if (!r.ok) throw new Error(`חיפוש תיקיית תמונות נכשל (${r.status})`);
  const found = ((await r.json()) as { files?: { id: string }[] }).files?.[0]?.id;
  if (found) return found;
  const c = await driveFetchAuthed(`${API}?fields=id`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: RAW_IMAGES_FOLDER, mimeType: FOLDER_MIME, parents: ["root"] }) }, { tries: 3, timeoutMs: 20_000 });
  if (!c.ok) throw new Error(`יצירת תיקיית תמונות נכשלה (${c.status})`);
  return ((await c.json()) as { id: string }).id;
}

/** מעלה את ה-PDF (resumable, נתחים של 8MB). שם קובץ זהה לא נדרס: כל העלאה יוצרת קובץ חדש (הקורא שומר את ה-id) */
export async function uploadRawImages(name: string, bytes: Uint8Array): Promise<{ fileId: string; size: number }> {
  const folderId = await ensureRawFolder();
  const total = bytes.length;
  const init = await driveFetchAuthed(
    `${UPLOAD}?uploadType=resumable&fields=id,size`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "application/pdf", "X-Upload-Content-Length": String(total) },
      body: JSON.stringify({ name, mimeType: "application/pdf", parents: [folderId] }),
    },
    { tries: 3, timeoutMs: 30_000 },
  );
  if (!init.ok) {
    if (init.status === 404) folderPromise = null; // התיקייה נמחקה – ננסה ליצור מחדש בניסיון הבא
    throw new Error(`פתיחת העלאה לדרייב נכשלה (${init.status})`);
  }
  const session = init.headers.get("location");
  if (!session) throw new Error("דרייב לא החזיר session להעלאה");
  let off = 0;
  for (;;) {
    const end = Math.min(off + STEP, total);
    const chunk = Buffer.from(bytes.subarray(off, end));
    const put = await fetch(session, {
      method: "PUT",
      headers: { "Content-Length": String(chunk.length), "Content-Range": `bytes ${off}-${end - 1}/${total}` },
      body: chunk,
      signal: AbortSignal.timeout(120_000),
    });
    if (put.status === 308) {
      off = end;
      continue;
    }
    if (!put.ok) throw new Error(`נתח העלאה נכשל (${put.status})`);
    const meta = (await put.json()) as { id: string; size?: string };
    return { fileId: meta.id, size: parseInt(meta.size || String(total), 10) || total };
  }
}

/** מוחק קובץ תמונות גולמיות (אחרי שהמצגת נבנתה). דורש הרשאת מחיקה; כשל נבלע */
export async function trashRawImages(fileId: string): Promise<boolean> {
  try {
    const r = await driveFetchAuthed(`${API}/${encodeURIComponent(fileId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ trashed: true }) }, { tries: 2, timeoutMs: 20_000 });
    return r.ok;
  } catch {
    return false;
  }
}
