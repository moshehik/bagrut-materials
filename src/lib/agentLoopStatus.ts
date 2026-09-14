import { eq } from "drizzle-orm";
import { db } from "@/db";
import { agentLoopStatus } from "@/db/schema";

/**
 * דגל הפעלה/כיבוי ("המתג") + "שעון שקט" של סוכן ה-fix-reports האוטומטי — שורה
 * יחידה ב-DB (id קבוע = 1). היה מאוחסן ב-Vercel Blob; הועבר ל-Postgres (Neon)
 * ב-09.2026 אחרי שה-Blob store הושעה (מכסה). ר' .claude/commands/fix-reports.md
 * לפרוטוקול המלא.
 *
 * חשוב: `enabled` משתנה **רק** דרך `setLoopEnabled` (לוח בקרה של אדמין, או
 * הוראת-עצירה מפורשת שקלוד מקבל בתוך דיווח/יומן) — לעולם לא אוטומטית משום שקט.
 * שעון השקט (`lastActivityAt`/`idleMinutes`) משמש את השלב הזול ב-workflow
 * (`scripts/agent-loop-status.ts --should-run`) כדי להחליט אם *להריץ את קלוד*
 * בטיק cron רגיל, בלי לגעת ב-`enabled` עצמו.
 */

const ROW_ID = 1;

async function readState() {
  const [row] = await db.select().from(agentLoopStatus).where(eq(agentLoopStatus.id, ROW_ID));
  return row ?? null;
}

async function ensureRow() {
  const existing = await readState();
  if (existing) return existing;
  const [row] = await db
    .insert(agentLoopStatus)
    .values({ id: ROW_ID, enabled: false, lastActivityAt: null })
    .onConflictDoNothing()
    .returning();
  return row ?? (await readState())!;
}

/** האם הלולאה האוטומטית דלוקה כרגע (נבדק ע"י ה-workflow לפני שהוא בכלל מפעיל את קלוד). */
export async function isLoopEnabled(): Promise<boolean> {
  const row = await readState();
  return row?.enabled ?? false;
}

/** מדליק/מכבה את הלולאה. מדליקים = גם מאפס את שעון השקט (כאילו הייתה פעילות עכשיו). */
export async function setLoopEnabled(enabled: boolean): Promise<void> {
  await ensureRow();
  await db
    .update(agentLoopStatus)
    .set({ enabled, ...(enabled ? { lastActivityAt: new Date() } : {}) })
    .where(eq(agentLoopStatus.id, ROW_ID));
}

/** מאפס את שעון השקט — קוראים לזה אחרי כל דיווח שבאמת טופל (לא רק "נבדק ואין כלום"). */
export async function touchActivity(): Promise<void> {
  await ensureRow();
  await db.update(agentLoopStatus).set({ lastActivityAt: new Date() }).where(eq(agentLoopStatus.id, ROW_ID));
}

/** כמה דקות עברו מאז הפעילות האחרונה. -1 אם עוד אין תיעוד פעילות. */
export async function idleMinutes(): Promise<number> {
  const row = await readState();
  if (!row?.lastActivityAt) return -1;
  const ms = Date.now() - row.lastActivityAt.getTime();
  return Math.floor(ms / 60000);
}
