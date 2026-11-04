"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { geminiPoolStatus, setGeminiKeys, testGeminiKeys } from "@/lib/gemini-pool";

export type GeminiAdminState = {
  error?: string;
  ok?: boolean;
  message?: string;
  tests?: { key: string; status: number | "error"; ms: number }[];
} | undefined;

async function admin() {
  try {
    return await requireAdmin();
  } catch {
    return null;
  }
}

/** בדיקת כל מפתח בקריאה קטנה (מציג רק סיומות של 4 תווים) */
export async function testGeminiPool(): Promise<GeminiAdminState> {
  if (!(await admin())) return { error: "אין הרשאה" };
  const tests = await testGeminiKeys();
  if (tests.length === 0) return { error: "אין מפתחות מוגדרים" };
  return { ok: true, tests };
}

/** החלפת המאגר (מוצפן בבסיס הנתונים, בלי פריסה). שדה ריק = מחיקת המאגר מהבסיס (env, אם קיים, ממשיך לפעול) */
export async function saveGeminiKeys(_prev: GeminiAdminState, form: FormData): Promise<GeminiAdminState> {
  const me = await admin();
  if (!me) return { error: "אין הרשאה" };
  const raw = String(form.get("keys") ?? "");
  if (raw.length > 20_000) return { error: "הקלט ארוך מדי" };
  if (raw.trim() && !/^[A-Za-z0-9_\-\s,;]+$/.test(raw)) return { error: "המפתחות מכילים תווים לא תקינים" };
  const n = await setGeminiKeys(raw, me.id);
  // בלי המפתחות עצמם: רק כמות
  await logAudit({ actorId: me.id, action: "gemini.keys_set", entityType: "settings", entityId: 0, details: { count: n } });
  revalidatePath("/admin/fixes");
  return { ok: true, message: n ? `נשמרו ${n} מפתחות (מוצפנים)` : "המאגר נמחק מהבסיס" };
}

export async function getGeminiPoolStatus() {
  if (!(await admin())) return null;
  return geminiPoolStatus();
}
