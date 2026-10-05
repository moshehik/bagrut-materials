import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { sessionSecretString } from "@/lib/session";

/** מזהה סשן העלאה בטוח (חתיכות ההעלאה נשמרות בדרייב, ר' docs/drive-storage.md) */
export function isSafeId(s: unknown): s is string {
  return /^[A-Za-z0-9_-]{6,64}$/.test(String(s ?? ""));
}

/** מספר החתיכות המרבי להעלאה אחת: 200MB בחתיכות של 4MB */
export const MAX_CHUNK_INDEX = 50;

/**
 * חתימה שקושרת קובץ שהועלה למשתמשת שהעלתה אותו. /finish מחזיר אותה, והפעולה
 * שיוצרת את השורה ב-DB דורשת אותה - כך אי אפשר לרשום drive://<fileId> של קובץ
 * שלא הועלה ע"י אותה משתמשת (למשל חומר בתשלום).
 */
export function signUpload(userId: number, fileUrl: string): string {
  return createHmac("sha256", sessionSecretString()).update(`upload:${userId}:${fileUrl}`).digest("hex");
}

export function verifyUpload(userId: number, fileUrl: string, sig: unknown): boolean {
  if (typeof sig !== "string" || !/^[0-9a-f]{64}$/.test(sig)) return false;
  return timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(signUpload(userId, fileUrl), "hex"));
}
