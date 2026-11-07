import "server-only";
import { driveFetchAuthed } from "@/lib/driveBridgeCore";

/**
 * משתף קובץ דרייב עם משתמשת ספציפית (צפייה בלבד, בלי מייל הודעה מגוגל – האתר שולח מייל משלו) ומחזיר קישור ישיר לקובץ.
 * מחזיר null אם השיתוף נכשל (למשל כתובת מייל שאינה חשבון גוגל) – הקורא חוזר לקישור לאתר.
 * הרשאה פר-משתמשת: רק מי שנרשמה באתר עם אותה כתובת (ומחוברת אליה בגוגל) יכולה לפתוח.
 */
export async function shareDriveFileWithUser(fileId: string, email: string): Promise<{ link: string; alreadyShared: boolean } | null> {
  try {
    const res = await driveFetchAuthed(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions?sendNotificationEmail=false&supportsAllDrives=true&fields=id,role`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "user", role: "reader", emailAddress: email }) },
      { tries: 1, timeoutMs: 20_000 },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("drive share failed", res.status, body.slice(0, 200));
      return null;
    }
    return { link: `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`, alreadyShared: false };
  } catch (e) {
    console.error("drive share error", e instanceof Error ? e.message : e);
    return null;
  }
}
