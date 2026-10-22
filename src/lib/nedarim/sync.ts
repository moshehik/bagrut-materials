import "server-only";
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { nedarimPayments, nedarimSyncState, nedarimTransactions, type NedarimSyncState } from "@/db/schema";
import { getTransactionHistory } from "./manage";
import { getNedarimApiPassword, redactNedarim } from "./secrets";
import {
  INTENT_TTL_HOURS,
  OPEN_STATUSES,
  decideAutoMatches,
  parseHistoryRow,
  type OpenPaymentForMatch,
  type TxForMatch,
} from "./logic";
import { appendEvent, settleFromTransaction, touchPayment } from "./store";

/**
 * שער הקריאה הגלובלי ל-GetHistoryJson (נדרים: 20 קריאות בשעה למוסד) + ההתאמה האוטומטית.
 *
 * - שורה יחידה nedarim_sync_state (id=1): נעילה אטומית (UPDATE מותנה – קריאה אחת בכל רגע, גם בין instances), מרווח מינימלי
 *   בין קריאות (SYNC_MIN_INTERVAL_SEC = 4 דק' → ≤15 בשעה), LastId אינקרמנטלי, backoff מעריכי אחרי שגיאה.
 * - polling של מורות ו"שילמתי – בדקי עכשיו" לעולם לא קוראים ישירות ל-API: הם מפעילים refreshHistory, שקורא רק אם עבר המרווח,
 *   ואחרת מחזיר את המצב מה-DB. "שילמתי" מקבל רצפה קצרה יותר (3 דק' → עדיין ≤20 בשעה), מנהלת/CallBack/בדיקת מפתח – דקה.
 * - העסקאות שנקראו נשמרות ב-nedarim_transactions (מנורמל + raw אחרי הסתרת סודות) ומהן נעשית ההתאמה (matchPendingPayments) –
 *   בלי עוד קריאות ל-API. ההתאמה: decideAutoMatches (logic.ts); רק התאמה חד-משמעית משדרגת; ספק → "ממתין לאישור ידני".
 */
export const SYNC_MIN_INTERVAL_SEC = 240;
export const SYNC_USER_FLOOR_SEC = 180;
export const SYNC_ADMIN_FLOOR_SEC = 60;
const LOCK_SEC = 90;
const MAX_ROWS = 2000;
const MAX_BACKOFF_SEC = 60 * 60;

export type SyncReason = "poll" | "user" | "admin" | "callback" | "test";
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

/** מתי מותר לקרוא שוב (לתצוגה): המאוחר מבין last_fetch + מרווח ו-next_allowed */
export function nextAllowedAt(state: NedarimSyncState | null, minIntervalSec = SYNC_MIN_INTERVAL_SEC): Date | null {
  if (!state) return null;
  const a = state.lastFetchAt ? state.lastFetchAt.getTime() + minIntervalSec * 1000 : 0;
  const b = state.nextAllowedAt?.getTime() ?? 0;
  const t = Math.max(a, b);
  return t ? new Date(t) : null;
}

const floorFor = (reason: SyncReason) =>
  reason === "poll" ? SYNC_MIN_INTERVAL_SEC : reason === "user" ? SYNC_USER_FLOOR_SEC : SYNC_ADMIN_FLOOR_SEC;

/**
 * קריאה אחת ל-GetHistoryJson אם השער מרשה (נעילה + מרווח + backoff). לא זורק.
 * אחרי קריאה מוצלחת – שומר את העסקאות ומריץ matchPendingPayments.
 */
export async function refreshHistory(reason: SyncReason): Promise<RefreshResult> {
  const minInterval = floorFor(reason);
  let claimed: NedarimSyncState | undefined;
  try {
    await db.insert(nedarimSyncState).values({ id: 1 }).onConflictDoNothing();
    const interval = `${minInterval} seconds`;
    const lock = `${LOCK_SEC} seconds`;
    const rows = await db
      .update(nedarimSyncState)
      .set({ lockUntil: sql`now() + ${lock}::interval`, updatedAt: new Date() })
      .where(
        and(
          eq(nedarimSyncState.id, 1),
          sql`(${nedarimSyncState.lockUntil} IS NULL OR ${nedarimSyncState.lockUntil} < now())`,
          sql`(${nedarimSyncState.lastFetchAt} IS NULL OR ${nedarimSyncState.lastFetchAt} < now() - ${interval}::interval)`,
          sql`(${nedarimSyncState.nextAllowedAt} IS NULL OR ${nedarimSyncState.nextAllowedAt} < now())`,
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
    return { ran: false, ok: true, reason: state?.lockUntil && state.lockUntil > new Date() ? "קריאה אחרת רצה כרגע" : `הקריאה האחרונה הייתה לפני פחות מ-${Math.ceil(minInterval / 60)} דק' (עוד ~${wait} דק')`, fetched: 0, state };
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
    const { json } = await getTransactionHistory({
      mosadId,
      lastId: claimed.lastTransactionId ?? undefined,
      maxId: MAX_ROWS,
    });
    const rows = Array.isArray(json)
      ? json
      : json && typeof json === "object" && Array.isArray((json as { Data?: unknown }).Data)
        ? (json as { Data: unknown[] }).Data
        : null;
    if (!rows) return fail("תשובה לא צפויה מנדרים פלוס (לא רשימת עסקאות) – מפתח/קוד מוסד שגויים?");
    rawRows = rows;
    parsed = rows.map(parseHistoryRow);
  } catch (e) {
    return fail(`שגיאת רשת: ${e instanceof Error ? e.message : String(e)}`);
  }

  // שמירה במטמון העסקאות (upsert – עסקה שכבר קיימת לא משתנה, כדי לא לדרוס שיוך)
  let maxId = claimed.lastTransactionId ?? 0;
  const fetchedAt = new Date();
  for (let i = 0; i < parsed.length; i++) {
    const t = parsed[i];
    if (!t) continue;
    const idNum = Number(t.transactionId);
    if (Number.isFinite(idNum) && idNum > maxId) maxId = idNum;
    try {
      await db
        .insert(nedarimTransactions)
        .values({
          transactionId: t.transactionId,
          amount: t.amount,
          currency: t.currency,
          phone: t.phone || null,
          email: t.email || null,
          clientName: t.clientName,
          comments: t.comments ? redactNedarim(t.comments) : null,
          confirmation: t.confirmation,
          last4: t.last4,
          transactionAt: t.transactionAt,
          raw: redactNedarim(JSON.stringify(rawRows[i] ?? null)).slice(0, 4000),
          fetchedAt,
        })
        .onConflictDoNothing();
    } catch (e) {
      console.error("[nedarim sync] tx insert failed", redactNedarim(e instanceof Error ? e.message : "error").slice(0, 200));
    }
  }
  await db
    .update(nedarimSyncState)
    .set({ lastTransactionId: maxId || null, lastFetchAt: fetchedAt, lastSuccessAt: fetchedAt, lockUntil: null, consecutiveErrors: 0, lastError: null, nextAllowedAt: null, lastFetchCount: parsed.length, updatedAt: fetchedAt })
    .where(eq(nedarimSyncState.id, 1));

  try {
    await matchPendingPayments();
  } catch (e) {
    console.error("[nedarim sync] match failed", redactNedarim(e instanceof Error ? e.message : "error").slice(0, 200));
  }
  return { ran: true, ok: true, reason: `נקראו ${parsed.length} עסקאות`, fetched: parsed.length, state: await getSyncState() };
}

/**
 * ההתאמה (DB בלבד, בלי API): בקשות פתוחות מ-INTENT_TTL_HOURS האחרונות מול עסקאות לא-משויכות שנקראו מאז. התאמה חד-משמעית →
 * settleFromTransaction (אידמפוטנטי, תופס קודם את העסקה). ספק → processing + הודעה (אישור ידני במסך הניהול).
 */
export async function matchPendingPayments(): Promise<{ settled: number[]; ambiguous: number[] }> {
  const since = new Date(Date.now() - INTENT_TTL_HOURS * 60 * 60 * 1000);
  const open = await db
    .select()
    .from(nedarimPayments)
    .where(and(inArray(nedarimPayments.status, [...OPEN_STATUSES]), gte(nedarimPayments.createdAt, since), isNull(nedarimPayments.assistRequestedAt)));
  if (!open.length) return { settled: [], ambiguous: [] };
  const txs = await db
    .select()
    .from(nedarimTransactions)
    .where(and(isNull(nedarimTransactions.matchedPaymentId), gte(nedarimTransactions.fetchedAt, new Date(since.getTime() - 60 * 60 * 1000))))
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
    transactionAt: t.transactionAt,
    fetchedAt: t.fetchedAt,
    matchedPaymentId: t.matchedPaymentId,
  }));
  const { matches, ambiguous } = decideAutoMatches(payments, forMatch);

  const settled: number[] = [];
  for (const m of matches) {
    const row = open.find((p) => p.id === m.paymentId);
    if (!row) continue;
    const r = await settleFromTransaction(row, m.tx, m.kind);
    if (r.ok && r.status === "paid") settled.push(m.paymentId);
  }
  const ambiguousIds: number[] = [];
  for (const a of ambiguous) {
    const row = open.find((p) => p.id === a.paymentId);
    if (!row) continue;
    ambiguousIds.push(a.paymentId);
    if (row.status !== "processing" || row.errorMessage !== a.reason) {
      await touchPayment(row.id, { status: "processing", errorMessage: a.reason });
      await appendEvent(row.id, "ambiguous", `לא שודרג אוטומטית: ${a.reason} – ממתין לאישור ידני`);
    }
  }
  return { settled, ambiguous: ambiguousIds };
}

/** עסקאות שעדיין לא שויכו לשום בקשה (למסך הניהול) */
export async function listUnmatchedTransactions(limit = 50) {
  try {
    return await db.select().from(nedarimTransactions).where(isNull(nedarimTransactions.matchedPaymentId)).orderBy(desc(nedarimTransactions.fetchedAt)).limit(limit);
  } catch {
    return [];
  }
}
