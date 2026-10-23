import "server-only";
import { and, desc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { nedarimPayments, nedarimSyncState, nedarimTransactions, type NedarimSyncState } from "@/db/schema";
import { getTransactionHistory } from "./manage";
import { getNedarimApiPassword, redactNedarim } from "./secrets";
import {
  INTENT_TTL_HOURS,
  OPEN_STATUSES,
  TX_RETENTION_DAYS,
  advanceLastId,
  chunk,
  decideAutoMatches,
  parseHistoryRow,
  pickRawFields,
  type OpenPaymentForMatch,
  type TxForMatch,
} from "./logic";
import { appendEvent, settleFromTransaction, touchPayment } from "./store";

/**
 * שער הקריאה הגלובלי ל-GetHistoryJson (נדרים: 20 קריאות בשעה למוסד) + ההתאמה האוטומטית.
 *
 * - שורה יחידה nedarim_sync_state (id=1): נעילה אטומית (UPDATE מותנה – קריאה אחת בכל רגע, גם בין instances), מרווח מינימלי
 *   בין קריאות (4 דק' ל-polling; 3 דק' ל"שילמתי"/CallBack; דקה למנהלת/בדיקת מפתח), **מונה שעתי גלובלי ≤ HOURLY_CALL_CAP מכל
 *   הסיבות** (L3), LastId אינקרמנטלי, backoff מעריכי אחרי שגיאה, cutoff_at = מועד ההדלקה (עסקאות שקדמו לו הן היסטוריות).
 * - polling של מורות ו"שילמתי" לעולם לא קוראים ישירות ל-API: הם מפעילים refreshHistory, שקורא רק אם השער מרשה, ואחרת
 *   מחזיר את המצב מה-DB.
 * - העסקאות נשמרות ב-nedarim_transactions (מנורמל + raw של שדות נבחרים בלבד, אחרי הסתרת סודות; לא-משויכות ישנות מ-30 יום
 *   נמחקות) ומהן נעשית ההתאמה (matchPendingPayments) – בלי עוד קריאות ל-API. רק התאמה strong חד-משמעית משדרגת; כל השאר
 *   → "ממתין לאישור ידני" עם מספרי העסקאות המועמדות.
 */
export const SYNC_MIN_INTERVAL_SEC = 240;
export const SYNC_USER_FLOOR_SEC = 180;
export const SYNC_ADMIN_FLOOR_SEC = 60;
/** חזרה מדף התשלום של נדרים: כמעט בלי רצפה (נשארת רק למנוע שתי קריאות באותן שניות); המונה השעתי והנעילה נשארים */
export const SYNC_RETURN_FLOOR_SEC = 8;
export const HOURLY_CALL_CAP = 18;
const LOCK_SEC = 90;
/** שורות לקריאה (N1): קטן, כדי שהסבב יסתיים בתוך 60 שנ' של ה-route גם עם שמירה ל-DB */
export const MAX_ROWS = 500;
const INSERT_CHUNK = 150;
const MAX_BACKOFF_SEC = 60 * 60;

export type SyncReason = "poll" | "user" | "admin" | "callback" | "test" | "return";
export type RefreshResult = {
  /** האם בוצעה קריאה ל-API בפועל */
  ran: boolean;
  ok: boolean;
  reason: string;
  fetched: number;
  state: NedarimSyncState | null;
};

export async function getSyncState(): Promise<NedarimSyncState | null> {
  try {
    const [row] = await db.select().from(nedarimSyncState).where(eq(nedarimSyncState.id, 1)).limit(1);
    return row ?? null;
  } catch {
    return null;
  }
}

/** מתי מותר לקרוא שוב (לתצוגה): המאוחר מבין last_fetch + מרווח, next_allowed, וסוף חלון השעה אם המונה מלא */
export function nextAllowedAt(state: NedarimSyncState | null, minIntervalSec = SYNC_MIN_INTERVAL_SEC): Date | null {
  if (!state) return null;
  const a = state.lastFetchAt ? state.lastFetchAt.getTime() + minIntervalSec * 1000 : 0;
  const b = state.nextAllowedAt?.getTime() ?? 0;
  const windowOpen = state.hourWindowStart && state.hourWindowStart.getTime() + 3600_000 > Date.now();
  const c = windowOpen && state.hourCalls >= HOURLY_CALL_CAP ? state.hourWindowStart!.getTime() + 3600_000 : 0;
  const t = Math.max(a, b, c);
  return t ? new Date(t) : null;
}

/** כמה קריאות נספרו בחלון השעה הנוכחי (0 אם החלון פג) */
export function currentHourCalls(state: NedarimSyncState | null, now = Date.now()): number {
  if (!state?.hourWindowStart) return 0;
  return state.hourWindowStart.getTime() + 3600_000 > now ? state.hourCalls : 0;
}

export const floorFor = (reason: SyncReason) =>
  reason === "poll"
    ? SYNC_MIN_INTERVAL_SEC
    : reason === "user" || reason === "callback"
      ? SYNC_USER_FLOOR_SEC
      : reason === "return"
        ? SYNC_RETURN_FLOOR_SEC
        : SYNC_ADMIN_FLOOR_SEC;

/**
 * קריאה אחת ל-GetHistoryJson אם השער מרשה (נעילה + מרווח + backoff + מונה שעתי). לא זורק.
 * אחרי קריאה מוצלחת – שומר את העסקאות, מנקה ישנות, ומריץ matchPendingPayments.
 */
export async function refreshHistory(reason: SyncReason): Promise<RefreshResult> {
  const minInterval = floorFor(reason);
  let claimed: NedarimSyncState | undefined;
  try {
    await db.insert(nedarimSyncState).values({ id: 1, cutoffAt: new Date() }).onConflictDoNothing();
    const interval = `${minInterval} seconds`;
    const lock = `${LOCK_SEC} seconds`;
    const rows = await db
      .update(nedarimSyncState)
      .set({
        lockUntil: sql`now() + ${lock}::interval`,
        // המונה השעתי מתעדכן באותו UPDATE אטומי: חלון חדש אם עברה שעה, אחרת +1
        hourWindowStart: sql`CASE WHEN ${nedarimSyncState.hourWindowStart} IS NULL OR ${nedarimSyncState.hourWindowStart} < now() - interval '1 hour' THEN now() ELSE ${nedarimSyncState.hourWindowStart} END`,
        hourCalls: sql`CASE WHEN ${nedarimSyncState.hourWindowStart} IS NULL OR ${nedarimSyncState.hourWindowStart} < now() - interval '1 hour' THEN 1 ELSE ${nedarimSyncState.hourCalls} + 1 END`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(nedarimSyncState.id, 1),
          sql`(${nedarimSyncState.lockUntil} IS NULL OR ${nedarimSyncState.lockUntil} < now())`,
          sql`(${nedarimSyncState.lastFetchAt} IS NULL OR ${nedarimSyncState.lastFetchAt} < now() - ${interval}::interval)`,
          sql`(${nedarimSyncState.nextAllowedAt} IS NULL OR ${nedarimSyncState.nextAllowedAt} < now())`,
          sql`(${nedarimSyncState.hourWindowStart} IS NULL OR ${nedarimSyncState.hourWindowStart} < now() - interval '1 hour' OR ${nedarimSyncState.hourCalls} < ${HOURLY_CALL_CAP})`,
        ),
      )
      .returning();
    claimed = rows[0];
  } catch (e) {
    return { ran: false, ok: false, reason: `שער הקריאה לא זמין: ${redactNedarim(e instanceof Error ? e.message : "error").slice(0, 160)}`, fetched: 0, state: null };
  }
  if (!claimed) {
    const state = await getSyncState();
    const next = nextAllowedAt(state, minInterval);
    const wait = next ? Math.max(0, Math.ceil((next.getTime() - Date.now()) / 60000)) : 0;
    const capped = !!state?.hourWindowStart && state.hourWindowStart.getTime() + 3600_000 > Date.now() && state.hourCalls >= HOURLY_CALL_CAP;
    const reasonText = state?.lockUntil && state.lockUntil > new Date()
      ? "קריאה אחרת רצה כרגע"
      : capped
        ? `הגענו למכסת ${HOURLY_CALL_CAP} קריאות בשעה – הקריאה הבאה בעוד ~${wait} דק'`
        : `הקריאה האחרונה הייתה לפני פחות מ-${Math.ceil(minInterval / 60)} דק' (עוד ~${wait} דק')`;
    return { ran: false, ok: true, reason: reasonText, fetched: 0, state };
  }

  const mosadId = (process.env.NEDARIM_MOSAD_ID ?? "").trim();
  const pw = await getNedarimApiPassword();
  const fail = async (msg: string) => {
    const errors = (claimed?.consecutiveErrors ?? 0) + 1;
    const backoffSec = Math.min(MAX_BACKOFF_SEC, SYNC_MIN_INTERVAL_SEC * 2 ** Math.min(errors - 1, 6));
    const clean = redactNedarim(msg).slice(0, 300);
    await db
      .update(nedarimSyncState)
      .set({ lastFetchAt: new Date(), lockUntil: null, consecutiveErrors: errors, lastError: clean, nextAllowedAt: new Date(Date.now() + backoffSec * 1000), lastFetchCount: 0, updatedAt: new Date() })
      .where(eq(nedarimSyncState.id, 1));
    return { ran: true, ok: false, reason: clean, fetched: 0, state: await getSyncState() };
  };
  if (!mosadId) return fail("קוד מוסד (NEDARIM_MOSAD_ID) חסר");
  if (!pw) return fail("מפתח ה-API של נדרים אינו מוגדר");

  let parsed: ReturnType<typeof parseHistoryRow>[] = [];
  let rawRows: unknown[] = [];
  try {
    const { json } = await getTransactionHistory({ mosadId, lastId: claimed.lastTransactionId ?? undefined, maxId: MAX_ROWS });
    const rows = Array.isArray(json)
      ? json
      : json && typeof json === "object" && Array.isArray((json as { Data?: unknown }).Data)
        ? (json as { Data: unknown[] }).Data
        : null;
    if (!rows) return fail("תשובה לא צפויה מנדרים פלוס (לא רשימת עסקאות) – מפתח/קוד מוסד שגויים?");
    rawRows = rows.slice(0, MAX_ROWS);
    parsed = rawRows.map((r) => parseHistoryRow(r));
  } catch (e) {
    return fail(`שגיאת רשת: ${e instanceof Error ? e.message : String(e)}`);
  }

  // שמירה במטמון (N1/N5): insert ב-batch, upsert (עסקה קיימת לא משתנה – לא דורסים שיוך); last_transaction_id מתקדם אחרי כל chunk
  // שנשמר, ולעולם לא מעבר לשורה שנכשלה – כישלון עוצר את הסבב (lastError), והסבב הבא ממשיך מאותה נקודה. אין לולאה בלי התקדמות:
  // כל chunk שהצליח מקדם את המצב מיד, גם אם ה-route ייהרג אחר כך.
  const fetchedAt = new Date();
  const items = parsed
    .map((t, i) => (t ? { t, raw: rawRows[i] } : null))
    .filter((x): x is { t: NonNullable<(typeof parsed)[number]>; raw: unknown } => !!x);
  const toRow = (x: { t: NonNullable<(typeof parsed)[number]>; raw: unknown }) => ({
    transactionId: x.t.transactionId,
    amount: x.t.amount,
    currency: x.t.currency,
    phone: x.t.phone || null,
    email: x.t.email || null,
    clientName: x.t.clientName,
    comments: x.t.comments ? redactNedarim(x.t.comments).slice(0, 2000) : null,
    confirmation: x.t.confirmation,
    last4: x.t.last4,
    status: x.t.status,
    approved: x.t.approved,
    transactionAt: x.t.transactionAt,
    raw: redactNedarim(JSON.stringify(pickRawFields(x.raw))).slice(0, 2000),
    fetchedAt,
  });
  let lastId = claimed.lastTransactionId ?? null;
  let saved = 0;
  let insertError: string | null = null;
  const ids = items.map((x) => x.t.transactionId);
  outer: for (const part of chunk(items, INSERT_CHUNK)) {
    try {
      await db.insert(nedarimTransactions).values(part.map(toRow)).onConflictDoNothing();
      saved += part.length;
    } catch (e) {
      // ה-chunk נכשל – שורה-שורה כדי לשמור מה שאפשר ולעצור בדיוק בשורה הבעייתית
      for (const x of part) {
        try {
          await db.insert(nedarimTransactions).values(toRow(x)).onConflictDoNothing();
          saved += 1;
        } catch (e2) {
          insertError = `שמירת עסקה ${x.t.transactionId} נכשלה: ${redactNedarim(e2 instanceof Error ? e2.message : String(e2)).slice(0, 200)}`;
          break outer;
        }
      }
      void e;
    }
    lastId = advanceLastId(ids, insertError ? saved : -1, lastId);
    await db.update(nedarimSyncState).set({ lastTransactionId: lastId, updatedAt: new Date() }).where(eq(nedarimSyncState.id, 1));
  }
  lastId = advanceLastId(ids, insertError ? saved : -1, lastId);
  // שורות שלא פוענחו (בלי מזהה/סכום) לא נשמרות אבל כן מקדמות את המצב – אחרת ייקראו שוב לנצח
  if (!insertError) lastId = advanceLastId(rawRows.map((r) => String((r as Record<string, unknown> | null)?.TransactionId ?? "")), -1, lastId);
  await db
    .update(nedarimSyncState)
    .set({
      lastTransactionId: lastId,
      lastFetchAt: fetchedAt,
      lastSuccessAt: fetchedAt,
      lockUntil: null,
      consecutiveErrors: 0,
      lastError: insertError,
      nextAllowedAt: null,
      lastFetchCount: saved,
      updatedAt: fetchedAt,
    })
    .where(eq(nedarimSyncState.id, 1));

  // ניקוי (M6): עסקאות לא-משויכות ישנות מ-TX_RETENTION_DAYS
  try {
    await db
      .delete(nedarimTransactions)
      .where(and(isNull(nedarimTransactions.matchedPaymentId), lt(nedarimTransactions.fetchedAt, new Date(Date.now() - TX_RETENTION_DAYS * 86400_000))));
  } catch (e) {
    console.error("[nedarim sync] cleanup failed", redactNedarim(e instanceof Error ? e.message : "error").slice(0, 200));
  }

  try {
    await matchPendingPayments();
  } catch (e) {
    console.error("[nedarim sync] match failed", redactNedarim(e instanceof Error ? e.message : "error").slice(0, 200));
  }
  return { ran: true, ok: !insertError, reason: insertError ? `נקראו ${parsed.length}, נשמרו ${saved}; ${insertError}` : `נקראו ${parsed.length} עסקאות`, fetched: saved, state: await getSyncState() };
}

/**
 * נקודת התחלה ידנית (N1): המנהלת מזינה את מספר העסקה האחרון מהפורטל של נדרים, כדי שהקריאה הבאה תתחיל אחריו ולא תסרוק
 * שנים של היסטוריה (500 שורות לקריאה, ≤18 בשעה). מותר רק להעלות (או כשאין ערך) – כדי לא לדלג אחורה על עסקאות שכבר נקראו.
 */
export async function setStartId(lastId: number, force = false): Promise<{ ok: boolean; reason: string }> {
  if (!Number.isInteger(lastId) || lastId < 0) return { ok: false, reason: "מספר עסקה לא תקין" };
  await db.insert(nedarimSyncState).values({ id: 1, cutoffAt: new Date() }).onConflictDoNothing();
  const state = await getSyncState();
  if (state?.lastTransactionId && lastId < state.lastTransactionId && !force) {
    return { ok: false, reason: `נקודת ההתחלה הנוכחית (${state.lastTransactionId}) גבוהה יותר – הורדה תגרום לקריאה חוזרת של עסקאות (אפשר לכפות)` };
  }
  await db.update(nedarimSyncState).set({ lastTransactionId: lastId || null, updatedAt: new Date() }).where(eq(nedarimSyncState.id, 1));
  return { ok: true, reason: `הקריאה הבאה תתחיל אחרי עסקה ${lastId}` };
}

/** כמה עסקאות במטמון בלי מועד מפוענח (N4) – מוצג באדמין כדי לזהות פורמט תאריך לא מוכר */
export async function countTxWithoutDate(): Promise<number> {
  try {
    const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(nedarimTransactions).where(isNull(nedarimTransactions.transactionAt));
    return Number(r?.n ?? 0);
  } catch {
    return 0;
  }
}

/**
 * ההתאמה (DB בלבד, בלי API): בקשות פתוחות מ-INTENT_TTL_HOURS האחרונות מול עסקאות לא-משויכות. התאמה strong חד-משמעית →
 * settleFromTransaction. כל השאר → processing + סיבה + מספרי העסקאות (אישור ידני במסך הניהול).
 */
export async function matchPendingPayments(): Promise<{ settled: number[]; review: number[] }> {
  const since = new Date(Date.now() - INTENT_TTL_HOURS * 60 * 60 * 1000);
  const open = await db
    .select()
    .from(nedarimPayments)
    .where(and(inArray(nedarimPayments.status, [...OPEN_STATUSES]), gte(nedarimPayments.createdAt, since), isNull(nedarimPayments.assistRequestedAt)));
  if (!open.length) return { settled: [], review: [] };
  const state = await getSyncState();
  const txs = await db
    .select()
    .from(nedarimTransactions)
    .where(and(isNull(nedarimTransactions.matchedPaymentId), eq(nedarimTransactions.approved, true), gte(nedarimTransactions.fetchedAt, new Date(since.getTime() - 60 * 60 * 1000))))
    .orderBy(desc(nedarimTransactions.fetchedAt));

  const payments: OpenPaymentForMatch[] = open.map((p) => ({ id: p.id, reference: p.reference, amount: p.amount, phone: p.phone, email: p.email, createdAt: p.createdAt }));
  const forMatch: TxForMatch[] = txs.map((t) => ({
    transactionId: t.transactionId,
    amount: t.amount,
    currency: t.currency,
    phone: t.phone ?? "",
    email: t.email ?? "",
    clientName: t.clientName,
    comments: t.comments,
    confirmation: t.confirmation,
    last4: t.last4,
    status: t.status,
    approved: t.approved,
    transactionAt: t.transactionAt,
    fetchedAt: t.fetchedAt,
    matchedPaymentId: t.matchedPaymentId,
  }));
  const { matches, review } = decideAutoMatches(payments, forMatch, state?.cutoffAt ?? null);

  const settled: number[] = [];
  for (const m of matches) {
    const row = open.find((p) => p.id === m.paymentId);
    if (!row) continue;
    const r = await settleFromTransaction(row, m.tx, m.kind);
    if (r.ok && r.status === "paid") settled.push(m.paymentId);
  }
  const reviewIds: number[] = [];
  for (const a of review) {
    const row = open.find((p) => p.id === a.paymentId);
    if (!row) continue;
    reviewIds.push(a.paymentId);
    const msg = `${a.reason} (עסקאות: ${a.transactionIds.join(", ")})`;
    if (row.status !== "processing" || row.errorMessage !== msg) {
      await touchPayment(row.id, { status: "processing", errorMessage: msg });
      await appendEvent(row.id, "review", `לא שודרג אוטומטית: ${msg} – ממתין לאישור ידני`, { transactionIds: a.transactionIds });
    }
  }
  return { settled, review: reviewIds };
}

/** עסקאות שעדיין לא שויכו לשום בקשה (למסך הניהול) */
export async function listUnmatchedTransactions(limit = 50) {
  try {
    return await db.select().from(nedarimTransactions).where(isNull(nedarimTransactions.matchedPaymentId)).orderBy(desc(nedarimTransactions.fetchedAt)).limit(limit);
  } catch {
    return [];
  }
}
