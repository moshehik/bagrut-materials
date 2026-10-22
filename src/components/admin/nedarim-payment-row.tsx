"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Ban, BadgeCheck, History, RefreshCw } from "lucide-react";
import type { Plan } from "@/db/schema";
import { PLANS, formatPrice } from "@/lib/constants";
import { STATUS_LABEL_HE, VERIFY_LABEL_HE, isNedarimStatus, type VerifyMethod } from "@/lib/nedarim/logic";
import { cancelNedarimPayment, manualSettleNedarimPayment, reverifyNedarimPayment } from "@/lib/actions/nedarim-admin";

export type NedarimPaymentRowData = {
  id: number;
  reference: string;
  status: string;
  plan: Plan;
  subjectTitles: string[];
  subjectsPending: boolean;
  /** רכישת פריט (single/bundle): שם החומר/התיקייה בזמן הבקשה */
  itemTitle: string | null;
  materialId: number | null;
  itemCategoryId: number | null;
  amount: number;
  listAmount: number;
  couponPercent: number | null;
  userId: number;
  userName: string;
  userEmail: string;
  phone: string | null;
  transactionId: string | null;
  confirmation: string | null;
  cardLast4: string | null;
  verified: boolean;
  verifyMethod: string | null;
  errorMessage: string | null;
  assistRequestedAt: Date | null;
  purchaseId: number | null;
  paidAt: Date | null;
  createdAt: Date;
  /** processing מעל 48 שעות (N10) */
  stale: boolean;
  events: { id: number; kind: string; message: string | null; detail: string | null; createdAt: Date }[];
};

const STATUS_CLS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  processing: "bg-yellow-100 text-yellow-800",
  paid: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-700",
  expired: "bg-oak-soft text-oak-deep",
  cancelled: "bg-gray-100 text-gray-700",
};

const fmt = (d: Date | null) => (d ? d.toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" }) : "—");

export function NedarimPaymentRow({ p, hasApi, highlight }: { p: NedarimPaymentRowData; hasApi: boolean; highlight?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ error?: string; ok?: string; mismatch?: { tid: string; reason: string } } | null>(null);
  const [showEvents, setShowEvents] = useState(false);
  const open = p.status === "pending" || p.status === "processing";
  const label = isNedarimStatus(p.status) ? STATUS_LABEL_HE[p.status] : p.status;

  const run = (fn: () => Promise<{ error?: string; ok?: true; status?: string; reason?: string; mismatch?: string }>, tid?: string) => {
    setMsg(null);
    startTransition(async () => {
      const r = await fn();
      if (r.error) setMsg({ error: r.error, mismatch: r.mismatch && tid ? { tid, reason: r.mismatch } : undefined });
      else setMsg({ ok: `${isNedarimStatus(r.status) ? STATUS_LABEL_HE[r.status] : (r.status ?? "בוצע")}${r.reason ? ` – ${r.reason}` : ""}` });
    });
  };

  return (
    <>
      <tr className={`border-t border-foreground/5 align-top ${highlight ? "bg-gold-soft/40" : ""} ${!open && p.status !== "paid" ? "opacity-70" : ""}`}>
        <td className="py-2 pe-3 font-mono text-[11px] whitespace-nowrap" dir="ltr">
          {p.reference}
          <div className="text-muted">{fmt(p.createdAt)}</div>
        </td>
        <td className="py-2 pe-3">
          <div className="font-semibold">{p.userName}</div>
          <div className="text-xs text-muted" dir="ltr">
            {p.userEmail}
          </div>
          {p.phone && (
            <div className="text-xs text-muted" dir="ltr">
              {p.phone}
            </div>
          )}
        </td>
        <td className="py-2 pe-3">
          <div>{PLANS[p.plan].label}</div>
          <div className="text-xs text-muted">
            {p.plan === "single" || p.plan === "bundle"
              ? `${p.itemTitle ?? "—"}${p.plan === "single" && p.materialId ? ` (חומר #${p.materialId})` : p.itemCategoryId ? ` (תיקייה #${p.itemCategoryId})` : ""}`
              : p.subjectsPending
                ? "המקצועות ייבחרו בחשבון"
                : p.subjectTitles.join(", ") || (p.plan === "substitute_daily" ? "כל המקצועות" : "—")}
          </div>
        </td>
        <td className="py-2 pe-3 whitespace-nowrap">
          {formatPrice(p.amount)}
          {p.couponPercent ? <div className="text-xs text-muted">קופון {p.couponPercent}% (מ-{formatPrice(p.listAmount)})</div> : null}
        </td>
        <td className="py-2 pe-3">
          <span className={`chip ${STATUS_CLS[p.status] ?? ""}`}>{label}</span>
          {p.status === "paid" && p.verifyMethod === "api_weak" && (
            <span className="chip bg-yellow-100 text-yellow-800 ms-1" title="הותאם לפי טלפון/מייל + סכום זהה (התאמה ייחודית), בלי מזהה הבקשה בהערה">זוהה לפי טלפון/מייל</span>
          )}
          {p.assistRequestedAt && open && (
            <div className="mt-1 text-xs font-semibold text-red-700">ביקשה עזרה ({fmt(p.assistRequestedAt)}) – לא תותאם אוטומטית</div>
          )}
          {p.status === "paid" && (
            <div className="mt-1 text-xs text-muted">
              {p.verifyMethod ? VERIFY_LABEL_HE[p.verifyMethod as VerifyMethod] ?? p.verifyMethod : ""} · {fmt(p.paidAt)}
            </div>
          )}
          {p.status === "paid" && !p.purchaseId && (
            <div className="mt-1 text-xs font-semibold text-red-700">שולם אבל אין מנוי מקושר – «תקן מנוי» יוצר אותו</div>
          )}
          {p.stale && <div className="mt-1 text-xs font-semibold text-red-700">ממתין לאישור ידני מעל 48 שעות – דורש טיפול</div>}
          {p.errorMessage && p.status !== "paid" && <div className="mt-1 text-xs text-red-700">{p.errorMessage}</div>}
        </td>
        <td className="py-2 pe-3 text-xs" dir="ltr">
          {p.transactionId && <div>tx {p.transactionId}</div>}
          {p.confirmation && <div>conf {p.confirmation}</div>}
          {p.cardLast4 && <div>•••• {p.cardLast4}</div>}
          {!p.transactionId && !p.confirmation && "—"}
        </td>
        <td className="py-2 pe-3">
          <div className="flex flex-wrap gap-1">
            {open && hasApi && (
              <button type="button" className="btn btn-ghost text-xs py-1 px-2" disabled={pending} onClick={() => run(() => reverifyNedarimPayment(p.id))} title="רענון היסטוריה (אם עברה דקה) + התאמה">
                <RefreshCw className="h-3.5 w-3.5" /> בדוק שוב
              </button>
            )}
            {open && (
              <button
                type="button"
                className="btn btn-oak text-xs py-1 px-2"
                disabled={pending}
                onClick={() => {
                  const tid = prompt(`לאשר ידנית את התשלום ${p.reference} (${formatPrice(p.amount)}) ולפתוח את המנוי?\nרק אחרי שראית את התשלום בפורטל נדרים / קיבלת אותו בדרך אחרת.\n\nמספר העסקה בנדרים (לא חובה, ספרות בלבד):`, "");
                  if (tid !== null) run(() => manualSettleNedarimPayment(p.id, tid), tid.trim());
                }}
              >
                <BadgeCheck className="h-3.5 w-3.5" /> אשר ידנית
              </button>
            )}
            {open && (
              <button
                type="button"
                className="btn text-xs py-1 px-2 text-red-700 border border-red-200 hover:bg-red-50"
                disabled={pending}
                onClick={() => {
                  const reason = prompt("סיבת הביטול (לא חובה):") ?? null;
                  if (reason !== null) run(() => cancelNedarimPayment(p.id, reason));
                }}
              >
                <Ban className="h-3.5 w-3.5" /> ביטול
              </button>
            )}
            {p.purchaseId && (
              <Link href={`/admin/subscriptions?user=${p.userId}`} className="btn btn-ghost text-xs py-1 px-2">
                למנוי #{p.purchaseId}
              </Link>
            )}
            {p.status === "paid" && !p.purchaseId && (
              <button
                type="button"
                className="btn btn-oak text-xs py-1 px-2"
                disabled={pending}
                onClick={() => {
                  if (confirm(`ליצור את המנוי החסר לבקשה ${p.reference}? (אם כבר קיים לפי מזהה הבקשה – רק יקושר)`)) run(() => manualSettleNedarimPayment(p.id));
                }}
              >
                <BadgeCheck className="h-3.5 w-3.5" /> תקן מנוי
              </button>
            )}
            <button type="button" className="btn btn-ghost text-xs py-1 px-2" onClick={() => setShowEvents((v) => !v)}>
              <History className="h-3.5 w-3.5" /> יומן ({p.events.length})
            </button>
          </div>
          {msg?.error && <div className="text-xs text-red-600 mt-1">{msg.error}</div>}
          {msg?.mismatch && open && (
            <button
              type="button"
              className="btn text-xs py-1 px-2 mt-1 text-red-700 border border-red-300 hover:bg-red-50"
              disabled={pending}
              onClick={() => {
                const m = msg.mismatch!;
                if (confirm(`אישור חריג: ${m.reason}.\nלפתוח את המנוי בכל זאת? הפעולה והסכומים יירשמו בלוג הפעולות.`)) run(() => manualSettleNedarimPayment(p.id, m.tid, true));
              }}
            >
              אשר כחריג בכל זאת
            </button>
          )}
          {msg?.ok && <div className="text-xs text-green-700 mt-1">{msg.ok}</div>}
        </td>
      </tr>
      {showEvents && (
        <tr className="bg-oak-soft/30">
          <td colSpan={7} className="p-3">
            {p.events.length === 0 ? (
              <p className="text-xs text-muted">אין אירועים.</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {p.events.map((e) => (
                  <li key={e.id} className="flex flex-wrap gap-2">
                    <span className="text-muted whitespace-nowrap">{fmt(e.createdAt)}</span>
                    <span className="font-mono">{e.kind}</span>
                    <span>{e.message}</span>
                    {e.detail && (
                      <details className="w-full">
                        <summary className="cursor-pointer text-muted">פרטים</summary>
                        <pre className="mt-1 max-h-48 overflow-auto rounded bg-white/70 p-2 text-[11px]" dir="ltr">
                          {e.detail}
                        </pre>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
