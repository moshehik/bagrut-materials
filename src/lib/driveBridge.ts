import "server-only";

/**
 * נקודת הכניסה לקוד האתר (Server Components/Actions/Route Handlers) — עם
 * שומר server-only שמונע ייבוא בטעות מקוד לקוח. המימוש עצמו ב-driveBridgeCore.ts
 * (בלי השומר, כדי שסקריפטים עצמאיים כמו scripts/migrate-drafts-to-drive.ts
 * יוכלו לייבא אותו ישירות מחוץ ל-Next).
 */
export * from "./driveBridgeCore";
