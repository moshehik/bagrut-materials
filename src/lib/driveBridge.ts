import "server-only";

/**
 * נקודת הכניסה לקוד האתר (Server Components/Actions/Route Handlers) — עם
 * שומר server-only שמונע ייבוא בטעות מקוד לקוח. המימוש עצמו ב-driveBridgeCore.ts
 * (בלי השומר, כדי שסקריפטים עצמאיים כמו scripts/import-local-material.ts
 * ו-scripts/sync-local-materials-to-drive.ts יוכלו לייבא אותו ישירות מחוץ ל-Next).
 */
export * from "./driveBridgeCore";
