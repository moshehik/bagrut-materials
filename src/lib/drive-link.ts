/**
 * ניתוח קישור שיתוף של גוגל דרייב שמורה הדביקה (סרטון לשיעור). מקבל רק drive.google.com,
 * מחלץ מזהה + סוג (קובץ/תיקייה) + resourcekey (קישורי שיתוף חדשים) ובונה מחדש קישור נקי —
 * כך לא נשמר ולא מוצג URL שרירותי.
 */
export type DriveLink = { id: string; kind: "file" | "folder"; resourceKey?: string };

const ID_RE = /^[A-Za-z0-9_-]{10,100}$/;
const KEY_RE = /^[A-Za-z0-9_-]{5,60}$/;

export function parseDriveLink(raw: string): DriveLink | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.hostname !== "drive.google.com") return null;

  const rk = url.searchParams.get("resourcekey");
  const resourceKey = rk && KEY_RE.test(rk) ? rk : undefined;
  const withKey = (l: DriveLink): DriveLink => (resourceKey ? { ...l, resourceKey } : l);

  const folder = url.pathname.match(/\/folders\/([^/?#]+)/);
  if (folder && ID_RE.test(folder[1])) return withKey({ id: folder[1], kind: "folder" });

  const file = url.pathname.match(/\/file\/(?:u\/\d+\/)?d\/([^/?#]+)/);
  if (file && ID_RE.test(file[1])) return withKey({ id: file[1], kind: "file" });

  const qid = url.searchParams.get("id");
  if (qid && ID_RE.test(qid)) {
    // open?id= / uc?id= = קובץ; folderview?id= = תיקייה
    const isFolder = url.pathname.startsWith("/drive/folderview") || url.pathname === "/folderview";
    return withKey({ id: qid, kind: isFolder ? "folder" : "file" });
  }
  return null;
}

export function driveLinkUrl(id: string, kind: string): string {
  return kind === "folder"
    ? `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`
    : `https://drive.google.com/file/d/${encodeURIComponent(id)}/view`;
}
