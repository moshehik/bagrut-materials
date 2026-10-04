import "server-only";

/** מזהה סשן העלאה בטוח (חתיכות ההעלאה נשמרות בדרייב, ר' docs/drive-storage.md) */
export function isSafeId(s: unknown): s is string {
  return /^[A-Za-z0-9_-]{6,64}$/.test(String(s ?? ""));
}
