import "server-only";
import { driveFetchAuthed } from "@/lib/driveBridgeCore";

/** תקרת גודל לסרטון שמועתק לדרייב של האתר (מכסת האחסון של הדרייב משותפת לכל הארכיון) */
export const MAX_VIDEO_BYTES = 10 * 1024 * 1024 * 1024;
const API = "https://www.googleapis.com/drive/v3";
const META_TIMEOUT_MS = 20_000;
const COPY_TIMEOUT_MS = 55_000;

export class VideoCopyError extends Error {}

function keyHeader(id: string, resourceKey?: string): Record<string, string> {
  return resourceKey ? { "X-Goog-Drive-Resource-Keys": `${id}/${resourceKey}` } : {};
}

/**
 * מעתיק סרטון ששותף ב"כל מי שיש לו הקישור" מהדרייב של מורה לתיקייה בדרייב של האתר
 * (העתקה בצד השרת של גוגל — בלי להעביר את הבייטים דרכנו), ופותח לעותק צפייה בקישור.
 * מחזיר את מזהה העותק. כל כשל זורק VideoCopyError עם הודעה שמותר להציג למורה.
 */
export async function copySharedVideo(args: {
  sourceId: string;
  resourceKey?: string;
  name: string;
  parentId: string;
}): Promise<{ fileId: string; size: number }> {
  const { sourceId, resourceKey, name, parentId } = args;
  const hdr = keyHeader(sourceId, resourceKey);

  const metaRes = await driveFetchAuthed(
    `${API}/files/${encodeURIComponent(sourceId)}?fields=id,mimeType,size,capabilities(canCopy)&supportsAllDrives=true`,
    { headers: hdr },
    { tries: 2, timeoutMs: META_TIMEOUT_MS },
  );
  if (metaRes.status === 404 || metaRes.status === 403) {
    throw new VideoCopyError(
      "אין לנו גישה לקובץ. בדרייב: שיתוף ← \"כל מי שיש לו את הקישור\" (צופה), ואז להעתיק את הקישור שוב.",
    );
  }
  if (!metaRes.ok) throw new VideoCopyError(`לא הצלחנו לקרוא את הקובץ בדרייב (${metaRes.status}). נסי שוב בעוד רגע.`);
  const meta = (await metaRes.json()) as { mimeType?: string; size?: string; capabilities?: { canCopy?: boolean } };

  if (!meta.mimeType?.startsWith("video/")) throw new VideoCopyError("הקישור הזה אינו של קובץ וידאו.");
  const size = meta.size ? Number(meta.size) : 0;
  if (size > MAX_VIDEO_BYTES) throw new VideoCopyError("הסרטון גדול במיוחד (מעל 10GB). אפשר לשתף גרסה מכווצת יותר.");
  if (meta.capabilities?.canCopy === false) {
    throw new VideoCopyError("הבעלים חסם העתקה של הקובץ בדרייב. צריך לבטל את החסימה (הגדרות שיתוף) ולנסות שוב.");
  }

  // tries=1: העתקה יוצרת קובץ — ניסיון חוזר אחרי תשובה שאבדה היה מכפיל אותו
  let copyRes: Response;
  try {
    copyRes = await driveFetchAuthed(
      `${API}/files/${encodeURIComponent(sourceId)}/copy?fields=id,size&supportsAllDrives=true`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...hdr },
        body: JSON.stringify({ name, parents: [parentId], description: "bagrut-sichot-video" }),
      },
      { tries: 1, timeoutMs: COPY_TIMEOUT_MS },
    );
  } catch {
    throw new VideoCopyError("ההעתקה לקחה יותר מדי זמן. נסי שוב, ואם זה חוזר — שתפי סרטון קטן יותר.");
  }
  if (!copyRes.ok) throw new VideoCopyError(`ההעתקה לדרייב של האתר נכשלה (${copyRes.status}).`);
  const copy = (await copyRes.json()) as { id: string; size?: string };

  // צפייה בקישור — רק לעותק שלנו (לא לאף קובץ אחר בארכיון)
  const permRes = await driveFetchAuthed(
    `${API}/files/${encodeURIComponent(copy.id)}/permissions?supportsAllDrives=true`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "anyone", role: "reader", allowFileDiscovery: false }),
    },
    { tries: 3, timeoutMs: META_TIMEOUT_MS },
  ).catch(() => null);
  if (!permRes || !permRes.ok) {
    await driveFetchAuthed(`${API}/files/${encodeURIComponent(copy.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trashed: true }),
    }).catch(() => null);
    throw new VideoCopyError("העתקנו את הסרטון אך לא הצלחנו לפתוח אותו לצפייה. נסי שוב.");
  }
  return { fileId: copy.id, size: copy.size ? Number(copy.size) : size };
}
