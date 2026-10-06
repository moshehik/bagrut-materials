"use client";

import { useState, useTransition } from "react";
import { CalendarPlus, Ban, Undo2, StickyNote, Gauge } from "lucide-react";
import type { Plan, PurchaseStatus } from "@/db/schema";
import { PLANS, formatPrice } from "@/lib/constants";
import {
  extendPurchase,
  setPurchaseDownloadsLimit,
  cancelPurchase,
  refundPurchase,
  updatePurchaseNotes,
} from "@/lib/actions/admin";

export type SubscriptionRowData = {
  id: number;
  userId: number;
  userName: string;
  userEmail: string;
  plan: Plan;
  scopeTitle: string | null;
  amount: number;
  downloadsUsed: number;
  downloadsLimit: number | null;
  startsAt: Date;
  endsAt: Date | null;
  status: PurchaseStatus;
  paymentRef: string | null;
  notes: string | null;
};

const STATUS: Record<PurchaseStatus, { label: string; className: string }> = {
  active: { label: "פעיל", className: "bg-green-100 text-green-800" },
  cancelled: { label: "בוטל", className: "bg-gray-100 text-gray-700" },
  refunded: { label: "זוכה", className: "bg-red-100 text-red-700" },
  expired: { label: "פג", className: "bg-oak-soft text-oak-deep" },
};

function fmt(d: Date | null) {
  return d ? d.toLocaleDateString("he-IL") : "—";
}

/** תווית המסלול; שורת "פרימיום בלבד" ישנה (מלפני ביטול הפרימיום) = single בלי חומר ועם מכסה 0 */
function planLabel(p: SubscriptionRowData) {
  if (p.plan === "single" && p.scopeTitle === null && p.downloadsLimit === 0) return "פרימיום בלבד (מסלול ישן)";
  return PLANS[p.plan].label;
}

export function SubscriptionRow({ p }: { p: SubscriptionRowData }) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [panel, setPanel] = useState<"none" | "extend" | "limit" | "refund" | "notes">("none");
  const [days, setDays] = useState("30");
  const [limit, setLimit] = useState(p.downloadsLimit === null ? "" : String(p.downloadsLimit));
  const [refundNote, setRefundNote] = useState("");
  const [refundAmount, setRefundAmount] = useState(String(p.amount / 100));
  const [notes, setNotes] = useState(p.notes ?? "");

  const now = new Date();
  const expired = p.endsAt !== null && p.endsAt < now;
  const effectiveStatus: PurchaseStatus = p.status === "active" && expired ? "expired" : p.status;
  const st = STATUS[effectiveStatus];
  const soon =
    p.status === "active" &&
    p.endsAt !== null &&
    !expired &&
    p.endsAt.getTime() - now.getTime() < 7 * 24 * 60 * 60 * 1000;

  const run = (fn: () => Promise<{ error?: string; ok?: boolean } | undefined>) => {
    setErr(null);
    startTransition(async () => {
      const r = await fn();
      if (r?.error) setErr(r.error);
      else setPanel("none");
    });
  };

  return (
    <>
      <tr className={`border-t border-foreground/5 align-top ${p.status !== "active" ? "opacity-70" : ""}`}>
        <td className="py-2 pe-3">
          <div className="font-semibold">{p.userName}</div>
          <div className="text-xs text-muted" dir="ltr">
            {p.userEmail}
          </div>
        </td>
        <td className="py-2 pe-3">
          <div>{planLabel(p)}</div>
          {p.scopeTitle && <div className="text-xs text-muted">{p.scopeTitle}</div>}
        </td>
        <td className="py-2 pe-3 whitespace-nowrap">{formatPrice(p.amount)}</td>
        <td className="py-2 pe-3 whitespace-nowrap">
          {p.downloadsUsed} / {p.downloadsLimit === null ? "∞" : p.downloadsLimit}
        </td>
        <td className="py-2 pe-3 whitespace-nowrap text-xs">
          <div>{fmt(p.startsAt)}</div>
          <div className={soon ? "text-red-700 font-semibold" : "text-muted"}>
            עד {fmt(p.endsAt)}
            {soon && " · פג בקרוב"}
          </div>
        </td>
        <td className="py-2 pe-3">
          <span className={`chip ${st.className}`}>{st.label}</span>
        </td>
        <td className="py-2 pe-3 font-mono text-[11px]" dir="ltr">
          {p.paymentRef ?? "—"}
        </td>
        <td className="py-2 pe-3">
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              className="btn btn-ghost text-xs py-1 px-2"
              onClick={() => setPanel(panel === "extend" ? "none" : "extend")}
              disabled={pending}
              title="הארכת תוקף"
            >
              <CalendarPlus className="h-3.5 w-3.5" /> הארכה
            </button>
            <button
              type="button"
              className="btn btn-ghost text-xs py-1 px-2"
              onClick={() => setPanel(panel === "limit" ? "none" : "limit")}
              disabled={pending}
              title="מכסת הורדות"
            >
              <Gauge className="h-3.5 w-3.5" /> מכסה
            </button>
            <button
              type="button"
              className="btn btn-ghost text-xs py-1 px-2"
              onClick={() => setPanel(panel === "notes" ? "none" : "notes")}
              disabled={pending}
              title="הערות"
            >
              <StickyNote className="h-3.5 w-3.5" /> הערות
            </button>
            {p.status === "active" && (
              <button
                type="button"
                className="btn text-xs py-1 px-2 text-red-700 border border-red-200 hover:bg-red-50"
                onClick={() => {
                  if (confirm("לבטל את המנוי? (ללא זיכוי כספי)")) run(() => cancelPurchase(p.id));
                }}
                disabled={pending}
              >
                <Ban className="h-3.5 w-3.5" /> ביטול
              </button>
            )}
            {p.status !== "refunded" && (
              <button
                type="button"
                className="btn text-xs py-1 px-2 text-red-700 border border-red-200 hover:bg-red-50"
                onClick={() => setPanel(panel === "refund" ? "none" : "refund")}
                disabled={pending}
              >
                <Undo2 className="h-3.5 w-3.5" /> זיכוי
              </button>
            )}
          </div>
          {err && <div className="text-xs text-red-600 mt-1">{err}</div>}
        </td>
      </tr>
      {panel !== "none" && (
        <tr className="bg-oak-soft/30">
          <td colSpan={8} className="p-3">
            {panel === "extend" && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">הארכת תוקף:</span>
                {[30, 90, 365].map((d) => (
                  <button
                    key={d}
                    type="button"
                    className="btn btn-oak text-xs py-1 px-2.5"
                    disabled={pending}
                    onClick={() => run(() => extendPurchase(p.id, d))}
                  >
                    +{d} ימים
                  </button>
                ))}
                <span className="text-muted">או</span>
                <input
                  type="number"
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  className="input py-1 text-xs w-24"
                  placeholder="ימים"
                />
                <button
                  type="button"
                  className="btn btn-ghost text-xs py-1 px-2.5"
                  disabled={pending || !Number.isInteger(Number(days)) || Number(days) === 0}
                  onClick={() => run(() => extendPurchase(p.id, Number(days)))}
                >
                  החלה
                </button>
                <span className="text-xs text-muted">(מספר שלילי מקצר; מנוי ללא תאריך סיום יקבל תאריך מהיום)</span>
              </div>
            )}
            {panel === "limit" && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">מכסת הורדות:</span>
                <input
                  type="number"
                  min={0}
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                  className="input py-1 text-xs w-28"
                  placeholder="ריק = ללא הגבלה"
                />
                <button
                  type="button"
                  className="btn btn-oak text-xs py-1 px-2.5"
                  disabled={pending}
                  onClick={() =>
                    run(() =>
                      setPurchaseDownloadsLimit(p.id, limit.trim() === "" ? null : Number(limit)),
                    )
                  }
                >
                  שמירה
                </button>
                <span className="text-xs text-muted">נוצלו עד כה: {p.downloadsUsed}</span>
              </div>
            )}
            {panel === "refund" && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-red-700">זיכוי:</span>
                <label className="flex items-center gap-1 text-xs">
                  סכום (₪)
                  <input
                    type="number"
                    step="0.5"
                    min={0}
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    className="input py-1 text-xs w-24"
                  />
                </label>
                <input
                  value={refundNote}
                  onChange={(e) => setRefundNote(e.target.value)}
                  className="input py-1 text-xs w-64"
                  placeholder="הערה (סיבת הזיכוי)"
                />
                <button
                  type="button"
                  className="btn text-xs py-1 px-2.5 text-red-700 border border-red-200 hover:bg-red-50"
                  disabled={pending}
                  onClick={() => {
                    if (!confirm("לסמן כזוכה ולרשום תנועת זיכוי?")) return;
                    run(() =>
                      refundPurchase(p.id, refundNote, Math.round(Number(refundAmount || 0) * 100)),
                    );
                  }}
                >
                  אישור זיכוי
                </button>
                <span className="text-xs text-muted">המנוי יסומן &quot;זוכה&quot; ותירשם תנועה שלילית בכספים.</span>
              </div>
            )}
            {panel === "notes" && (
              <div className="flex flex-wrap items-start gap-2 text-sm">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="input py-1 text-xs flex-1 min-w-[240px]"
                  placeholder="הערות פנימיות למנוי"
                />
                <button
                  type="button"
                  className="btn btn-oak text-xs py-1 px-2.5"
                  disabled={pending}
                  onClick={() => run(() => updatePurchaseNotes(p.id, notes))}
                >
                  שמירת הערות
                </button>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
