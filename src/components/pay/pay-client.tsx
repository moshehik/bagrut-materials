"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, CalendarDays, Check, CreditCard, Crown, ExternalLink, Loader2, Lock, RefreshCw } from "lucide-react";
import { GateShekel } from "@/components/gate-shekel";
import { GateField, LocationFields } from "@/components/auth-forms";
import { SUBJECT_HOUSES, YEARLY_INCLUDED_SUBJECTS } from "@/lib/constants";
import type { PayablePlan } from "@/lib/nedarim/logic";

/*
 * דף התשלום (/pay) – צד הדפדפן. ארבעה שלבים:
 *   plan    – בחירת מסלול (מדולג כשהגיעו עם ?plan=).
 *   details – מקצועות (שנתי 1–3 / ממלאת מקום 3 חודשים = 1 / יומית = בלי), פרטים חסרים (טלפון, עיר, תיכון), סיכום →
 *             POST /api/pay/intent (יוצר בקשה NP-… ומחזיר את הקישור לדף התשלום המתארח של נדרים פלוס).
 *   waiting – הקישור לדף התשלום (נפתח בלשונית חדשה), "שילמתי – בדקי עכשיו" (POST /api/pay/check), polling רגוע של
 *             GET /api/pay/status (השרת קורא לנדרים לכל היותר פעם ב-4 דק' – לכולן ביחד), "לפתוח שוב את דף התשלום", ופנייה למנהלת.
 *   done    – המנוי פעיל / נכשל / ממתין לאישור ידני.
 * האתר לא מקבל פרטי כרטיס בשום שלב – ההקלדה היא בדף של נדרים (matara.pro).
 */

export type PayPlanOption = {
  key: PayablePlan;
  label: string;
  description: string;
  /** באגורות */
  price: number;
  downloadsLimit: number | null;
  days: number | null;
};
type Subject = { id: number; title: string; slug: string; icon: string };
type Step = "plan" | "details" | "waiting" | "done";
type Intent = { reference: string; amount: number; listAmount: number; couponPercent: number | null; hostedUrl: string | null; simulate: boolean };
type StatusInfo = {
  status: string;
  text: string;
  assistRequested: boolean;
  hostedUrl?: string | null;
  lastCheckedAt?: string | null;
  nextCheckAt?: string | null;
  note?: string;
};

const POLL_MS = 30_000;
const MAX_POLL_MINUTES = 40;
const FINAL = ["paid", "failed", "cancelled", "expired"];

const fmtTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" }) : null);

export function PayClient(props: {
  plans: PayPlanOption[];
  initialPlan: PayablePlan | null;
  subjects: Subject[];
  preselected: number[];
  needsPhone: boolean;
  needsLocation: boolean;
  user: { firstName: string; fullName: string; email: string; phone: string | null; personalCode: string };
  coupon: { label: string; percent: number } | null;
  initialRef: string | null;
  substituteMonths: number;
  substituteDailyDownloads: number;
  yearlyListMonthly: number;
  substituteMonthly: number;
}) {
  const { plans, subjects, user, coupon } = props;
  const [step, setStep] = useState<Step>(props.initialRef ? "waiting" : props.initialPlan ? "details" : "plan");
  const [planKey, setPlanKey] = useState<PayablePlan>(props.initialPlan ?? "yearly");
  const [selected, setSelected] = useState<number[]>(props.preselected.slice(0, YEARLY_INCLUDED_SUBJECTS));
  const [skip, setSkip] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [intent, setIntent] = useState<Intent | null>(props.initialRef ? { reference: props.initialRef, amount: 0, listAmount: 0, couponPercent: null, hostedUrl: null, simulate: false } : null);
  const [info, setInfo] = useState<StatusInfo | null>(null);
  const [opened, setOpened] = useState(false);
  const [startedAt] = useState(() => Date.now());

  const plan = useMemo(() => plans.find((p) => p.key === planKey) ?? plans[0], [plans, planKey]);
  const isYearly = plan.key === "yearly";
  const isSub3 = plan.key === "substitute_3m";
  const isDaily = plan.key === "substitute_daily";
  const needsSubjects = isYearly || isSub3;
  const maxPick = isSub3 ? 1 : YEARLY_INCLUDED_SUBJECTS;
  const discounted = coupon ? Math.round((plan.price * (100 - coupon.percent)) / 100) : plan.price;
  const canSubmit = !needsSubjects || skip || (selected.length >= 1 && selected.length <= maxPick);
  const check = <Check className="mt-1 h-4 w-4 shrink-0" aria-hidden />;
  const arrow = <ArrowLeft className="h-4 w-4 fix-gate-arrow" strokeWidth={1.75} aria-hidden />;

  function toggle(id: number) {
    setSelected((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= maxPick) return isSub3 ? [id] : cur;
      return [...cur, id];
    });
  }

  /* ---------- סטטוס ---------- */
  const applyInfo = useCallback((data: StatusInfo) => {
    setInfo(data);
    if (FINAL.includes(data.status) || data.assistRequested) setStep("done");
  }, []);

  const fetchStatus = useCallback(async () => {
    if (!intent) return;
    try {
      const res = await fetch(`/api/pay/status?ref=${encodeURIComponent(intent.reference)}`, { cache: "no-store" });
      const data = await res.json();
      if (res.ok) applyInfo(data);
    } catch {
      /* ננסה שוב */
    }
  }, [intent, applyInfo]);

  useEffect(() => {
    if (step !== "waiting" || !intent) return;
    const first = setTimeout(() => void fetchStatus(), 0);
    const timer = setInterval(() => {
      if (Date.now() - startedAt > MAX_POLL_MINUTES * 60_000) {
        clearInterval(timer);
        return;
      }
      void fetchStatus();
    }, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [step, intent, fetchStatus, startedAt]);

  const checkNow = async (simulate = false) => {
    if (!intent || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/pay/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(simulate ? { reference: intent.reference, simulate: true } : { reference: intent.reference }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "הבדיקה נכשלה – נסי שוב בעוד רגע");
        return;
      }
      applyInfo(data);
    } catch {
      setError("שגיאת רשת – נסי שוב");
    } finally {
      setBusy(false);
    }
  };

  const requestAssist = async () => {
    if (!intent || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/pay/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: intent.reference }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "לא הצלחנו לשלוח את הבקשה");
        return;
      }
      applyInfo({ status: data.status, text: data.text, assistRequested: true });
    } catch {
      setError("שגיאת רשת – נסי שוב");
    } finally {
      setBusy(false);
    }
  };

  /* ---------- שלב 2 → יצירת בקשה ---------- */
  async function submitDetails(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const fd = new FormData(e.currentTarget);
      const body = {
        plan: plan.key,
        categoryIds: needsSubjects && !skip ? selected : [],
        skipSubjects: isYearly && skip,
        phone: props.needsPhone ? String(fd.get("phone") ?? "") : undefined,
        city: props.needsLocation ? String(fd.get("city") ?? "") : undefined,
        school: props.needsLocation ? String(fd.get("school") ?? "") : undefined,
      };
      const res = await fetch("/api/pay/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.reference) {
        setError(data.error || "שגיאה ביצירת בקשת התשלום");
        return;
      }
      setIntent(data);
      setInfo(null);
      setOpened(false);
      setStep("waiting");
      // מעדכנים את הכתובת כדי שרענון/חזרה מנדרים יחזירו לאותה בקשה
      window.history.replaceState(null, "", `/pay?ref=${encodeURIComponent(data.reference)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאת רשת");
    } finally {
      setBusy(false);
    }
  }

  const restart = () => {
    setStep(props.initialPlan ? "details" : "plan");
    setIntent(null);
    setInfo(null);
    setError("");
    window.history.replaceState(null, "", "/pay");
  };

  /* ---------- כרטיס המסלול (כמו בעמוד השלמת הרשמה) ---------- */
  const planCard = (
    <div className="gate-card gate-plan gate-plan-featured">
      <span className="gate-icon">
        {isYearly ? <Crown className="h-6 w-6" strokeWidth={1.5} aria-hidden /> : <CalendarDays className="h-6 w-6" strokeWidth={1.5} aria-hidden />}
      </span>
      <h2 className="mt-2 text-2xl">{plan.label}</h2>
      <p className="gate-soft">{plan.description}</p>
      {isYearly ? (
        <>
          <div className="gate-price gate-price-lg mt-2">
            <GateShekel agorot={Math.round(plan.price / 12)} />
            {plan.price / 12 < props.yearlyListMonthly && (
              <>
                {" "}
                <s className="gate-old-price text-[0.6em]">
                  <GateShekel agorot={props.yearlyListMonthly} />
                </s>
              </>
            )}
          </div>
          <p>לחודש × 12 חודשים</p>
          <p className="gate-soft text-base">
            סה״כ <GateShekel agorot={plan.price} /> לשנה
          </p>
        </>
      ) : isSub3 ? (
        <>
          <div className="gate-price gate-price-lg mt-2">
            <GateShekel agorot={Math.round(plan.price / props.substituteMonths)} />{" "}
            {plan.price / props.substituteMonths < props.substituteMonthly && (
              <s className="gate-old-price text-[0.6em]">
                <GateShekel agorot={props.substituteMonthly} />
              </s>
            )}
          </div>
          <p>לחודש × {props.substituteMonths} חודשים</p>
          <p className="gate-soft text-base">
            סה״כ <GateShekel agorot={plan.price} />
          </p>
        </>
      ) : (
        <>
          <div className="gate-price gate-price-lg mt-2">
            <GateShekel agorot={plan.price} />
          </div>
          <p>עבור {props.substituteDailyDownloads} צפיות או הורדות</p>
          <p className="gate-soft text-base">לשימוש מתי שצריך, בלי הגבלת זמן</p>
        </>
      )}
      <hr className="gate-divider" />
      <ul className="space-y-1 text-start">
        {isYearly && (
          <>
            <li className="flex gap-2">{check} מנוי למקצוע – ואפשר להרחיב עד {YEARLY_INCLUDED_SUBJECTS} מקצועות באותו מחיר</li>
            <li className="flex gap-2">
              {check}
              <span>אפשר להתחיל במקצוע אחד ולהוסיף עוד במהלך השנה – המקצוע הנוסף יסתיים יחד עם המנוי</span>
            </li>
          </>
        )}
        {isSub3 && (
          <>
            <li className="flex gap-2">
              {check}
              <span>מקצוע אחד – המסלול אינו ניתן להרחבה למקצועות נוספים</span>
            </li>
            {plan.downloadsLimit && (
              <li className="flex gap-2">
                {check}
                <span>המסלול מוגבל ל-{plan.downloadsLimit} הורדות או צפיות</span>
              </li>
            )}
          </>
        )}
        {(isYearly || isSub3) && (
          <li className="flex gap-2">
            {check}
            <span>התקופה מתחילה מההורדה הראשונה, לא ממועד הרכישה</span>
          </li>
        )}
        {isDaily && (
          <li className="flex gap-2">
            {check}
            <span>אפשר לשדרג בכל שלב למנוי שנתי – תשלמי רק את ההפרש</span>
          </li>
        )}
      </ul>
      <div className="mt-5 space-y-2 text-start text-base leading-loose !text-[#6b3f1d]">
        <p className="font-bold">כל קובץ שתורידי יוטבע:</p>
        <ul className="space-y-1">
          <li>
            בשמך (<b>{user.fullName}</b>)
          </li>
          <li>
            בכתובת המייל שלך (<b dir="ltr">{user.email}</b>)
          </li>
          <li>{user.phone ? <>במספר הטלפון שלך (<b dir="ltr">{user.phone}</b>)</> : "במספר הטלפון שלך"}</li>
          <li>
            ובמספר האישי שלך (<b dir="ltr">{user.personalCode}</b>)
          </li>
        </ul>
        <p>כך אנחנו שומרים על זכויות היוצרים של הכותבות.</p>
      </div>
    </div>
  );

  const errorStrip = error ? (
    <div role="alert" className="gate-strip gate-strip-alert animate-pop">
      <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
      <span className="flex-1">{error}</span>
    </div>
  ) : null;

  /* ---------- שלב סיום ---------- */
  if (step === "done" && intent && info) {
    const paid = info.status === "paid";
    const failed = info.status === "failed" || info.status === "cancelled" || info.status === "expired";
    return (
      <section className="gate-panel mx-auto mt-8 max-w-2xl sm:!p-8" aria-live="polite">
        <span className="gold-ring" aria-hidden="true" />
        <div className="gate-card text-center">
          <span className="gate-icon mx-auto">
            {paid ? <Check className="h-6 w-6" strokeWidth={2} aria-hidden /> : failed ? <AlertCircle className="h-6 w-6" aria-hidden /> : <Loader2 className="h-6 w-6 animate-spin" aria-hidden />}
          </span>
          <h2 className="mt-2 text-2xl">{paid ? "המנוי שלך פעיל!" : failed ? "התשלום לא הושלם" : "הבקשה בטיפול"}</h2>
          <p className="gate-soft mt-2 text-lg">{info.text}</p>
          <p className="mt-3 text-base">
            מזהה הבקשה: <b dir="ltr">{intent.reference}</b> – כדאי לשמור אותו לכל פנייה.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {paid && (
              <Link href="/account" className="btn btn-gold btn-gate py-2">
                לאזור האישי ולהורדות {arrow}
              </Link>
            )}
            {failed && (
              <button type="button" className="btn btn-gold btn-gate py-2" onClick={restart}>
                לנסות שוב {arrow}
              </button>
            )}
            {!paid && (
              <Link href="/contact" className="btn gate-skip py-2">
                צור קשר
              </Link>
            )}
          </div>
        </div>
      </section>
    );
  }

  /* ---------- שלב ההמתנה (אחרי יצירת הבקשה / חזרה מנדרים) ---------- */
  if (step === "waiting" && intent) {
    const hostedUrl = info?.hostedUrl ?? intent.hostedUrl;
    const amount = intent.amount || 0;
    const last = fmtTime(info?.lastCheckedAt);
    const next = fmtTime(info?.nextCheckAt);
    return (
      <section className="gate-panel mx-auto mt-8 max-w-2xl sm:!p-8" aria-labelledby="pay-h" aria-live="polite">
        <span className="gold-ring" aria-hidden="true" />
        <div className="gate-strip gate-total">
          <div className="flex w-full items-baseline justify-between gap-4">
            <span id="pay-h" className="text-2xl">
              {amount ? `לתשלום – ${plan.label}` : "בקשת התשלום שלך"}
            </span>
            {amount > 0 && (
              <span className="gate-price">
                <GateShekel agorot={amount} />
              </span>
            )}
          </div>
          {intent.couponPercent ? (
            <div className="w-full text-base">
              כולל {intent.couponPercent}% הנחה מהקופון שלך (במקום <GateShekel agorot={intent.listAmount} />)
            </div>
          ) : null}
        </div>

        <div className="gate-card mt-4 space-y-3">
          <h3 className="text-xl">{opened ? "שילמת? נבדוק מול נדרים פלוס" : "שלב 1 – התשלום בדף המאובטח של נדרים פלוס"}</h3>
          <p className="gate-soft text-base leading-relaxed">
            הדף נפתח בלשונית חדשה עם הסכום נעול. <b>חשוב: מלאי בטופס של נדרים פלוס את אותו מספר טלפון ואותה כתובת מייל שרשומים
            אצלך באתר</b>{user.phone ? <> (<span dir="ltr">{user.phone}</span>, <span dir="ltr">{user.email}</span>)</> : <> (<span dir="ltr">{user.email}</span>)</>} – כך נזהה את התשלום שלך גם אם משהו ישתבש. אחרי התשלום חזרי לכאן – המנוי ייפתח אוטומטית ברגע
            שהתשלום יזוהה. <b>הבדיקה מול נדרים פלוס מתבצעת פעם בכמה דקות</b>, אז ייתכן שתצטרכי להמתין קצת. אין צורך לשלם פעמיים.
          </p>
          <div className="flex flex-wrap gap-2">
            {hostedUrl ? (
              <a href={hostedUrl} target="_blank" rel="noopener noreferrer" className="btn btn-gold btn-gate py-2" onClick={() => setOpened(true)}>
                <ExternalLink className="h-5 w-5" aria-hidden /> {opened ? "לפתוח שוב את דף התשלום" : "לדף התשלום של נדרים פלוס"} {arrow}
              </a>
            ) : (
              <span className="text-base">טוענת את הקישור לדף התשלום…</span>
            )}
            <button type="button" className="btn gate-skip py-2 !border-[#0a0a0a] !text-[#0a0a0a]" onClick={() => checkNow()} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" aria-hidden />} שילמתי – בדקי עכשיו
            </button>
          </div>
          <p className="text-sm text-[#3b3000]">
            {info?.status === "processing" ? info.text : info?.note ? info.note : last ? `נבדק לאחרונה ב-${last}${next ? ` · הבדיקה הבאה אחרי ${next}` : ""}` : "ממתינים לאישור התשלום…"}
          </p>
        </div>

        <div className="mt-4">{errorStrip}</div>

        <div className="mt-4 text-center text-base">
          <p>
            מזהה הבקשה: <b dir="ltr">{intent.reference}</b>. הדף לא נפתח או יש בעיה?{" "}
            <button type="button" className="underline" onClick={requestAssist} disabled={busy}>
              כתבי לנו ונעזור להשלים את התשלום
            </button>
          </p>
          <button type="button" className="mt-2 underline opacity-80" onClick={restart} disabled={busy}>
            ביטול והתחלה מחדש
          </button>
          {intent.simulate && (
            <div className="gate-strip mt-4 text-base">
              <span>מצב דמה (פיתוח בלבד):</span>
              <button type="button" className="btn gate-skip py-1" onClick={() => checkNow(true)} disabled={busy}>
                סימולציית תשלום מוצלח
              </button>
            </div>
          )}
          <p className="mt-3 flex items-center justify-center gap-1.5 text-base opacity-80">
            <Lock className="h-4 w-4" aria-hidden />
            פרטי הכרטיס מוקלדים רק בדף של נדרים פלוס (תקן PCI) – האתר לא מקבל ולא שומר אותם.
          </p>
        </div>
      </section>
    );
  }

  /* ---------- שלב בחירת מסלול ---------- */
  if (step === "plan") {
    return (
      <section className="gate-panel mx-auto mt-8 max-w-3xl sm:!p-8" aria-labelledby="plan-h">
        <span className="gold-ring" aria-hidden="true" />
        <h2 id="plan-h" className="text-3xl">
          בחרי מסלול
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {plans.map((p) => (
            <button
              key={p.key}
              type="button"
              className={`gate-card gate-pick flex-col items-start text-start ${planKey === p.key ? "gate-pick-on" : ""}`}
              onClick={() => setPlanKey(p.key)}
              aria-pressed={planKey === p.key}
            >
              <span className="text-xl">{p.label}</span>
              <span className="gate-soft text-base">{p.description}</span>
              <span className="gate-price mt-1">
                <GateShekel agorot={p.price} />
              </span>
            </button>
          ))}
        </div>
        <div className="mt-6 text-center">
          <button type="button" className="btn btn-gold btn-gate py-2" onClick={() => { setSelected([]); setSkip(false); setStep("details"); }}>
            המשך {arrow}
          </button>
        </div>
      </section>
    );
  }

  /* ---------- שלב הפרטים ---------- */
  return (
    <section className="gate-panel mx-auto mt-8 max-w-2xl sm:!p-8" aria-labelledby="order-h">
      <span className="gold-ring" aria-hidden="true" />
      {coupon && (
        <div className="gate-strip mb-4 text-base">
          🎟️ יש לך קופון «{coupon.label}» – {coupon.percent}% הנחה יורדים אוטומטית מהסכום.
        </div>
      )}
      {planCard}
      <form onSubmit={submitDetails} className="mt-8 space-y-8">
        {errorStrip}

        {needsSubjects && (
          <section aria-labelledby="pick-h">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id="pick-h" className="text-3xl">
                בחרי מקצוע
              </h3>
              {selected.length > 0 && !skip && (
                <span className="gate-badge" aria-live="polite">
                  {selected.length === 1 ? "נבחר מקצוע" : `מקצוע + ${selected.length - 1} נוספים – כלולים במחיר`}
                </span>
              )}
            </div>
            <p className="mt-1 text-[#ffd45a]">סמני וי על המקצוע שאת מלמדת.</p>
            {subjects.length === 0 ? (
              <p className="mt-3">עדיין אין מקצועות במאגר.</p>
            ) : (
              <div className={`mt-4 grid gap-3 sm:grid-cols-2 ${skip ? "opacity-50" : ""}`}>
                {subjects.map((s) => {
                  const on = selected.includes(s.id);
                  const disabled = skip || (!on && selected.length >= maxPick && !isSub3);
                  return (
                    <label key={s.id} className={`gate-card gate-pick ${on ? "gate-pick-on" : ""} ${disabled ? "gate-pick-off" : ""}`}>
                      <input type="checkbox" className="sr-only" checked={on} disabled={disabled} onChange={() => toggle(s.id)} />
                      <span className="gate-check" aria-hidden>
                        {on && <Check className="h-5 w-5" strokeWidth={3} />}
                      </span>
                      {SUBJECT_HOUSES[s.slug] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className="gate-pick-house" src={SUBJECT_HOUSES[s.slug]} alt="" width={356} height={266} />
                      ) : (
                        <span className="text-2xl leading-none" aria-hidden>
                          {s.icon}
                        </span>
                      )}
                      <span className="text-xl">{s.title}</span>
                    </label>
                  );
                })}
              </div>
            )}
            {isYearly && (
              <label className="mt-4 flex cursor-pointer items-center gap-2 text-[#ffd45a]">
                <input type="checkbox" className="accent-[#ffd45a]" checked={skip} onChange={(e) => setSkip(e.target.checked)} />
                <span>אבחר את המקצועות מאוחר יותר, בחשבון שלי (עד הבחירה אין גישה להורדות)</span>
              </label>
            )}
            {isYearly && !skip && selected.length > 0 && selected.length < YEARLY_INCLUDED_SUBJECTS && (
              <p className="mt-3 text-[#ffd45a]">
                תרצי עוד? מקצוע נוסף כלול במחיר – אפשר לסמן אותו עכשיו, או להוסיף בכל שלב במהלך השנה (הוא יסתיים יחד עם
                המנוי).
              </p>
            )}
          </section>
        )}

        {(props.needsPhone || props.needsLocation) && (
          <section className="space-y-4" aria-labelledby="loc-h">
            <h3 id="loc-h" className="text-3xl">
              עוד כמה פרטים לרכישה הראשונה
            </h3>
            {props.needsPhone && (
              <GateField
                label="טלפון נייד"
                name="phone"
                type="tel"
                required
                ltr
                autoComplete="tel"
                inputMode="tel"
                hint="מוטבע בסימן המים של הקבצים שלך, ומשמש לזיהוי התשלום בנדרים פלוס"
              />
            )}
            {props.needsLocation && <LocationFields />}
          </section>
        )}

        <div className="gate-strip gate-total">
          <div className="w-full space-y-1">
            <div className="flex justify-between gap-4">
              <span>מחיר המסלול</span>
              <GateShekel agorot={plan.price} />
            </div>
            {coupon && (
              <div className="flex justify-between gap-4">
                <span>קופון {coupon.percent}% הנחה</span>
                <span>
                  −<GateShekel agorot={plan.price - discounted} />
                </span>
              </div>
            )}
          </div>
          <div className="flex w-full items-baseline justify-between gap-4 border-t-2 border-dashed border-[#ffd45a]/60 pt-2">
            <span className="text-2xl">סה״כ לתשלום</span>
            <span className="gate-price">
              <GateShekel agorot={discounted} />
            </span>
          </div>
        </div>

        <div className="text-center">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button type="submit" disabled={busy || !canSubmit} className="btn btn-gold btn-gate py-2 disabled:opacity-50">
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <CreditCard className="h-5 w-5" aria-hidden />}
              המשך לתשלום מאובטח {arrow}
            </button>
            {!props.initialPlan && (
              <button type="button" className="btn gate-skip py-2" onClick={() => setStep("plan")} disabled={busy}>
                החלפת מסלול
              </button>
            )}
          </div>
          {!canSubmit && needsSubjects && <p className="mt-2 text-[#ffd45a]">יש לבחור לפחות מקצוע אחד כדי להמשיך.</p>}
          <p className="mt-3 flex items-center justify-center gap-1.5 text-base opacity-80">
            <Lock className="h-4 w-4" aria-hidden />
            בלחיצה על «המשך» ייפתח דף התשלום המאובטח של נדרים פלוס. פרטי הכרטיס אינם עוברים דרך האתר.
          </p>
        </div>
      </form>
    </section>
  );
}
