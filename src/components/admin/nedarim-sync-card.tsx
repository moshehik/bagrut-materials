"use client";

import { useActionState, useState, useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { refreshNedarimNow, setNedarimStartId, type NedarimAdminState } from "@/lib/actions/nedarim-admin";

export type SyncCardData = {
  lastSuccessAt: Date | null;
  lastFetchAt: Date | null;
  lastTransactionId: number | null;
  lastFetchCount: number | null;
  consecutiveErrors: number;
  lastError: string | null;
  nextAllowedAt: Date | null;
  cutoffAt: Date | null;
  hourCalls: number;
  hourCap: number;
  cachedTransactions: number;
  /** עסקאות במטמון בלי מועד מפוענח (N4) – סימן לפורמט תאריך לא מוכר */
  withoutDate: number;
  maxRows: number;
  unmatched: { transactionId: string; amount: number; phone: string | null; email: string | null; comments: string | null; transactionAt: Date | null; fetchedAt: Date; approved: boolean }[];
};

const fmt = (d: Date | null) => (d ? d.toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" }) : "—");

/** כרטיס "זיהוי תשלומים מול נדרים פלוס": מצב שער הקריאה (20 בשעה), רענון ידני, ועסקאות שעדיין לא שויכו */
export function NedarimSyncCard({ data, hasApi, minIntervalMin }: { data: SyncCardData; hasApi: boolean; minIntervalMin: number }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ error?: string; ok?: string } | null>(null);
  const [startState, startAction, startPending] = useActionState<NedarimAdminState, FormData>(setNedarimStartId, {});
  return (
    <div className="card p-4 space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-bold">זיהוי תשלומים מול נדרים פלוס (GetHistoryJson)</h3>
        <span className={`chip ${data.consecutiveErrors ? "bg-red-100 text-red-700" : data.lastSuccessAt ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"}`}>
          {data.consecutiveErrors ? `${data.consecutiveErrors} שגיאות ברצף` : data.lastSuccessAt ? "תקין" : "עוד לא נקרא"}
        </span>
        <button
          type="button"
          className="btn btn-oak text-xs py-1 px-3 ms-auto"
          disabled={pending || !hasApi}
          onClick={() => {
            setMsg(null);
            startTransition(async () => {
              const r = await refreshNedarimNow();
              setMsg(r.error ? { error: r.error } : { ok: r.reason ?? "בוצע" });
            });
          }}
          title="קריאה אחת ל-API (אם עברה דקה מהקריאה הקודמת) + התאמה"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} רענון עכשיו
        </button>
      </div>
      <p className="text-xs text-muted">
        נדרים מגבילים ל-20 קריאות בשעה למוסד. האתר קורא לכל היותר פעם ב-{minIntervalMin} דקות (לכל המורות ביחד), תמיד מהעסקה האחרונה
        שנקראה (LastId), עד {data.hourCap} קריאות בשעה מכל הסיבות, ומתאים בקשות פתוחות לעסקאות מאושרות (יש מספר אישור) לפי מזהה
        הבקשה בהערת העסקה. רק התאמה חד-משמעית כזו פותחת מנוי; התאמה לפי טלפון/מייל בלבד, כמה מועמדות, או קופון שכבר נוצל →
        "ממתין לאישור ידני" עם מספרי העסקאות.
      </p>
      <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 text-xs">
        <div>קריאה מוצלחת אחרונה: <b>{fmt(data.lastSuccessAt)}</b>{data.lastFetchCount !== null ? ` (${data.lastFetchCount} עסקאות)` : ""}</div>
        <div>ניסיון אחרון: {fmt(data.lastFetchAt)}</div>
        <div>LastId: <code dir="ltr">{data.lastTransactionId ?? "—"}</code></div>
        <div>הקריאה הבאה מותרת: {fmt(data.nextAllowedAt)}</div>
        <div>עסקאות במטמון: {data.cachedTransactions}{data.withoutDate > 0 && <span className="text-red-700"> · {data.withoutDate} בלי מועד מפוענח (פורמט תאריך לא מוכר – לבדוק raw)</span>}</div>
        <div>קריאות בשעה הנוכחית: {data.hourCalls} / {data.hourCap} · {data.maxRows} שורות לקריאה</div>
        <div>מועד חיתוך (עסקאות ישנות יותר לא מתאימות): {fmt(data.cutoffAt)}</div>
        {data.lastError && <div className="sm:col-span-2 text-red-700">שגיאה אחרונה: {data.lastError}</div>}
      </div>
      <form action={startAction} className="flex flex-wrap items-end gap-2 rounded-xl border border-foreground/10 p-3 text-xs">
        <label className="min-w-[220px]">
          <span className="block text-muted mb-1">נקודת התחלה – מספר העסקה האחרון בפורטל נדרים (לפני ההדלקה הראשונה, כדי לא לסרוק שנים של היסטוריה)</span>
          <input name="lastId" type="text" inputMode="numeric" pattern="[0-9]*" className="input py-1 text-xs" dir="ltr" placeholder={data.lastTransactionId ? String(data.lastTransactionId) : "למשל 123456"} />
        </label>
        <label className="flex items-center gap-1 text-muted">
          <input type="checkbox" name="force" value="1" /> לאפשר גם הורדה (קריאה חוזרת)
        </label>
        <button type="submit" className="btn btn-ghost text-xs py-1.5 px-3" disabled={startPending}>
          {startPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} קביעת נקודת התחלה
        </button>
        {startState?.error && <span className="text-red-600">{startState.error}</span>}
        {startState?.ok && <span className="text-green-700">{startState.reason}</span>}
      </form>
      {msg?.error && <p className="text-xs text-red-600">{msg.error}</p>}
      {msg?.ok && <p className="text-xs text-green-700">{msg.ok}</p>}
      {data.unmatched.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-semibold">עסקאות שעדיין לא שויכו לבקשה ({data.unmatched.length} אחרונות)</summary>
          <table className="mt-2 w-full">
            <thead className="text-muted text-right">
              <tr>
                <th className="py-1 pe-2 font-medium">עסקה</th>
                <th className="py-1 pe-2 font-medium">סכום</th>
                <th className="py-1 pe-2 font-medium">טלפון / מייל</th>
                <th className="py-1 pe-2 font-medium">הערה</th>
                <th className="py-1 pe-2 font-medium">מועד</th>
              </tr>
            </thead>
            <tbody>
              {data.unmatched.map((t) => (
                <tr key={t.transactionId} className="border-t border-foreground/5">
                  <td className="py-1 pe-2 font-mono" dir="ltr">{t.transactionId}{!t.approved && <span className="ms-1 text-red-700" title="בלי מספר אישור / סטטוס לא הצלחה – לא מתאימה אוטומטית">!</span>}</td>
                  <td className="py-1 pe-2 whitespace-nowrap">₪{(t.amount / 100).toLocaleString("he-IL")}</td>
                  <td className="py-1 pe-2" dir="ltr">{[t.phone, t.email].filter(Boolean).join(" · ") || "—"}</td>
                  <td className="py-1 pe-2">{t.comments ?? "—"}</td>
                  <td className="py-1 pe-2 whitespace-nowrap">{fmt(t.transactionAt ?? t.fetchedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-muted">כדי לשייך ידנית: «אשר ידנית» על הבקשה המתאימה והזנת מספר העסקה.</p>
        </details>
      )}
    </div>
  );
}
