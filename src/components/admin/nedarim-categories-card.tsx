"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Pencil, RefreshCw, Trash2, X } from "lucide-react";
import type { NedarimCategory, SyncPlanRow } from "@/lib/nedarim/groupe-logic";
import { deleteNedarimCategory, saveNedarimCategory, syncNedarimPlanAmounts, type GroupeActionState } from "@/lib/actions/nedarim-admin";

/**
 * כרטיס "קטגוריות בנדרים פלוס" ב-/admin/payments: הרשימה מנדרים (נטענת עם הדף, בלי polling), הוספה, עריכה inline, מחיקה
 * עם אישור, וסנכרון סכומי המינימום עם מחירי האתר (רק בלחיצה). Amount בנדרים = *מינימום תרומה* – ר' האזהרה על קופונים.
 */
const money = (agorot: number | null) => (agorot === null ? "—" : `₪${(agorot / 100).toLocaleString("he-IL", { maximumFractionDigits: 2 })}`);
const shekels = (agorot: number | null) => (agorot === null ? "" : String(agorot / 100));

function CategoryRow({ c }: { c: NedarimCategory }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState<GroupeActionState, FormData>(saveNedarimCategory, undefined);
  const [busy, startTransition] = useTransition();
  const [msg, setMsg] = useState<GroupeActionState>(undefined);
  const shown = msg ?? state;
  if (editing) {
    return (
      <tr className="border-t border-foreground/5 bg-oak-soft/30">
        <td colSpan={5} className="p-2">
          <form action={(fd) => { setMsg(undefined); action(fd); setEditing(false); }} className="flex flex-wrap items-end gap-2 text-xs">
            <input type="hidden" name="id" value={c.id} />
            <label>
              <span className="block text-muted mb-1">שם</span>
              <input name="name" defaultValue={c.name} required maxLength={100} className="input py-1 text-xs min-w-[200px]" />
            </label>
            <label>
              <span className="block text-muted mb-1">סכום מינימלי (₪)</span>
              <input name="amount" defaultValue={shekels(c.amount)} inputMode="decimal" className="input py-1 text-xs w-28" dir="ltr" />
            </label>
            <label>
              <span className="block text-muted mb-1">יעד (₪)</span>
              <input name="goal" defaultValue={shekels(c.goal)} inputMode="decimal" className="input py-1 text-xs w-28" dir="ltr" />
            </label>
            <button type="submit" className="btn btn-oak text-xs py-1.5 px-3" disabled={pending}>
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} שמירה בנדרים
            </button>
            <button type="button" className="btn btn-ghost text-xs py-1.5 px-2" onClick={() => setEditing(false)}>
              <X className="h-3.5 w-3.5" /> ביטול
            </button>
          </form>
        </td>
      </tr>
    );
  }
  return (
    <tr className="border-t border-foreground/5">
      <td className="py-1.5 pe-3">
        {c.hidden && <span className="chip bg-gray-100 text-gray-700 me-1">מוסתרת</span>}
        {c.name}
        <span className="text-muted font-mono text-[11px] ms-2" dir="ltr">#{c.id}</span>
      </td>
      <td className="py-1.5 pe-3 whitespace-nowrap">{money(c.amount)}</td>
      <td className="py-1.5 pe-3 whitespace-nowrap">{money(c.goal)}</td>
      <td className="py-1.5 pe-3 whitespace-nowrap">{money(c.cumule)}</td>
      <td className="py-1.5 pe-3">
        <div className="flex flex-wrap gap-1">
          <button type="button" className="btn btn-ghost text-xs py-1 px-2" onClick={() => setEditing(true)} disabled={busy || pending}>
            <Pencil className="h-3.5 w-3.5" /> עריכה
          </button>
          <button
            type="button"
            className="btn text-xs py-1 px-2 text-red-700 border border-red-200 hover:bg-red-50"
            disabled={busy || pending}
            onClick={() => {
              if (!confirm(`למחוק את הקטגוריה «${c.name}» בנדרים פלוס?`)) return;
              setMsg(undefined);
              startTransition(async () => setMsg(await deleteNedarimCategory(c.id)));
            }}
          >
            <Trash2 className="h-3.5 w-3.5" /> מחיקה
          </button>
        </div>
        {shown?.error && <div className="text-xs text-red-600 mt-1">{shown.error}</div>}
        {shown?.ok && <div className="text-xs text-green-700 mt-1">{shown.message}</div>}
      </td>
    </tr>
  );
}

export function NedarimCategoriesCard({
  categories,
  loadError,
  sync,
  maxCouponPercent,
}: {
  categories: NedarimCategory[];
  loadError: string | null;
  /** מצב הסנכרון לכל מסלול, מחושב בשרת לפי הקופון הפעיל הגבוה ביותר */
  sync: SyncPlanRow[];
  maxCouponPercent: number;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [addState, addAction, addPending] = useActionState<GroupeActionState, FormData>(saveNedarimCategory, undefined);
  const [syncState, syncAction, syncPending] = useActionState<GroupeActionState, FormData>(syncNedarimPlanAmounts, undefined);
  const [mode, setMode] = useState<"coupon" | "percent" | "none">("coupon");
  const [addKey, setAddKey] = useState(0);

  return (
    <div className="card p-4 space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-bold">קטגוריות בנדרים פלוס (Groupe)</h3>
        <span className="chip bg-gray-100 text-gray-700">{categories.length} קטגוריות</span>
        <button type="button" className="btn btn-ghost text-xs py-1 px-3 ms-auto" disabled={refreshing} onClick={() => startRefresh(() => router.refresh())}>
          {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} רענון
        </button>
      </div>
      <p className="text-xs text-muted">
        הקטגוריות שמופיעות בדף התשלום של נדרים. הקישור מהאתר מעביר את שם המסלול (או «הורדה בודדת» / «קובץ מורחב») כקטגוריה
        (<code>groupe</code>) – לדוחות בלבד, הזיהוי לא נשען על זה. «סכום מינימלי» הוא ה-Amount של נדרים: הסכום הנמוך ביותר שהדף שלהם
        מקבל לקטגוריה; לקטגוריות הפריטים המחיר משתנה, לכן הן נוצרות בלי מינימום.
      </p>
      {loadError && (
        <p className="text-red-700 text-xs">
          לא הצלחנו לקרוא את הקטגוריות מנדרים: {loadError}
        </p>
      )}

      {/* סנכרון עם מחירי האתר */}
      <div className="rounded-xl border border-yellow-300 bg-yellow-50/60 p-3 space-y-2 text-xs">
        <div className="flex items-start gap-2 text-yellow-900">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
          <p>
            <b>אזהרת קופון:</b> הסכום בקטגוריה הוא <b>מינימום תרומה</b>. קופון פרטי מוריד את הסכום שהאתר מבקש מתחת למחיר המסלול – ואם
            המינימום בנדרים גבוה ממנו, הדף של נדרים יחסום את התשלום המוזל. לכן ברירת המחדל: מינימום = המחיר אחרי ההנחה הגבוהה ביותר
            בקופון פעיל (כרגע {maxCouponPercent}%).
          </p>
        </div>
        <table className="w-full">
          <thead className="text-muted text-right">
            <tr>
              <th className="py-1 pe-2 font-medium">מסלול (שם הקטגוריה)</th>
              <th className="py-1 pe-2 font-medium">מחיר באתר</th>
              <th className="py-1 pe-2 font-medium">מינימום יעד</th>
              <th className="py-1 pe-2 font-medium">בנדרים כעת</th>
              <th className="py-1 pe-2 font-medium">מצב</th>
            </tr>
          </thead>
          <tbody>
            {sync.map((r) => (
              <tr key={r.plan} className="border-t border-yellow-200/60">
                <td className="py-1 pe-2">{r.name}{!r.category && <span className="text-muted"> (תיווצר)</span>}</td>
                <td className="py-1 pe-2 whitespace-nowrap">{r.priceAgorot === null ? <span className="text-muted">לפי הפריט</span> : money(r.priceAgorot)}</td>
                <td className="py-1 pe-2 whitespace-nowrap">{r.targetAgorot === null ? <span className="text-muted">בלי מינימום</span> : money(r.targetAgorot)}</td>
                <td className="py-1 pe-2 whitespace-nowrap">{r.category ? money(r.category.amount) : "—"}</td>
                <td className="py-1 pe-2">
                  {r.inSync ? <span className="chip bg-green-100 text-green-800">מסונכרן</span> : <span className="chip bg-red-100 text-red-700">לא מסונכרן</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form action={syncAction} className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1">
            <input type="radio" name="mode" value="coupon" checked={mode === "coupon"} onChange={() => setMode("coupon")} />
            מינימום = המחיר אחרי הנחת הקופון הפעיל הגבוהה ביותר ({maxCouponPercent}%)
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" name="mode" value="percent" checked={mode === "percent"} onChange={() => setMode("percent")} />
            אחוז הנחה מקסימלי לאפשר:
            <input name="percent" type="number" min={0} max={100} step={1} defaultValue={maxCouponPercent} className="input py-0.5 text-xs w-16" dir="ltr" disabled={mode !== "percent"} />
            %
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" name="mode" value="none" checked={mode === "none"} onChange={() => setMode("none")} />
            מינימום = המחיר המלא (קופונים ייחסמו)
          </label>
          <button type="submit" className="btn btn-oak text-xs py-1.5 px-3" disabled={syncPending || !!loadError}>
            {syncPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} סנכרן סכומים עם מחירי האתר
          </button>
          {syncState?.error && <span className="text-red-600">{syncState.error}</span>}
          {syncState?.ok && <span className="text-green-700">{syncState.message}</span>}
        </form>
      </div>

      {/* הרשימה */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-muted text-right">
            <tr>
              <th className="py-1 pe-3 font-medium">שם</th>
              <th className="py-1 pe-3 font-medium">סכום מינימלי</th>
              <th className="py-1 pe-3 font-medium">יעד</th>
              <th className="py-1 pe-3 font-medium">עד כה נתרם</th>
              <th className="py-1 pe-3 font-medium">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {categories.length === 0 && (
              <tr>
                <td colSpan={5} className="py-2 text-muted">{loadError ? "—" : "אין קטגוריות במוסד."}</td>
              </tr>
            )}
            {categories.map((c) => (
              <CategoryRow key={c.id} c={c} />
            ))}
          </tbody>
        </table>
      </div>

      {/* הוספה */}
      <form key={addKey} action={(fd) => { addAction(fd); setAddKey((k) => k + 1); }} className="flex flex-wrap items-end gap-2 rounded-xl border border-foreground/10 p-3 text-xs">
        <span className="w-full font-semibold">הוספת קטגוריה</span>
        <label>
          <span className="block text-muted mb-1">שם (שם שמתחיל ב-* = מוסתרת)</span>
          <input name="name" required maxLength={100} className="input py-1 text-xs min-w-[220px]" placeholder="למשל: מנוי שנתי" />
        </label>
        <label>
          <span className="block text-muted mb-1">סכום מינימלי (₪)</span>
          <input name="amount" inputMode="decimal" className="input py-1 text-xs w-28" dir="ltr" placeholder="ריק = בלי" />
        </label>
        <label>
          <span className="block text-muted mb-1">יעד (₪)</span>
          <input name="goal" inputMode="decimal" className="input py-1 text-xs w-28" dir="ltr" placeholder="ריק = בלי" />
        </label>
        <button type="submit" className="btn btn-oak text-xs py-1.5 px-3" disabled={addPending}>
          {addPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} יצירה בנדרים
        </button>
        {addState?.error && <span className="text-red-600">{addState.error}</span>}
        {addState?.ok && <span className="text-green-700">{addState.message}</span>}
      </form>
    </div>
  );
}
