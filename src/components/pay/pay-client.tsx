"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, CalendarDays, Check, CreditCard, Crown, Loader2, Lock, ShieldCheck } from "lucide-react";
import { GateShekel } from "@/components/gate-shekel";
import { GateField, LocationFields } from "@/components/auth-forms";
import { SUBJECT_HOUSES, YEARLY_INCLUDED_SUBJECTS } from "@/lib/constants";
import {
  FRAME_LOAD_TIMEOUT_MS,
  NEDARIM_IFRAME_URL,
  NEDARIM_ORIGINS,
  type FinishTransactionValue,
  type PayablePlan,
} from "@/lib/nedarim/logic";

/*
 * דף התשלום (/pay) – צד הדפדפן. ארבעה שלבים:
 *   plan    – בחירת מסלול (מדולג כשהגיעו עם ?plan=).
 *   details – מקצועות (שנתי 1–3 / ממלאת מקום 3 חודשים = 1 / יומית = בלי), פרטים חסרים (טלפון, עיר, תיכון), סיכום →
 *             POST /api/pay/intent (יוצר בקשה עם מזהה NP-… ומחזיר את ערך FinishTransaction2).
 *   pay     – ה-iframe המאובטח של נדרים פלוס (matara.pro): הכרטיס מוקלד שם בלבד. "לתשלום" שולח postMessage FinishTransaction2
 *             (לפי הדוגמה הרשמית sample2.html); ה-iframe עונה ב-Height / TransactionResponse / ValidateFields.
 *   done    – הדפדפן מדווח ל-POST /api/pay/complete; השרת מאמת מול נדרים (או ממתין ל-CallBack / אישור) ומחזיר סטטוס.
 * נטפרי: הדפדפן של חלק מהמורות חסום לכל דומיין שאינו האתר – ה-iframe של matara.pro פשוט לא נטען, בלי שגיאה. לכן: אם לא הגיעה
 * הודעת Height תוך FRAME_LOAD_TIMEOUT_MS מוצגת חלופה – ניסיון חוזר, או "בקשה להשלמת התשלום דרך המנהלת" (POST /api/pay/assist).
 * הערה מהתיעוד של נדרים: postMessage ל-iframe לא עובד מ-localhost – לבדיקה מקומית יש מצב דמה (NEDARIM_SIMULATE=1).
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
type Step = "plan" | "details" | "pay" | "done";
type Intent = {
  reference: string;
  amount: number;
  listAmount: number;
  couponPercent: number | null;
  finish: FinishTransactionValue;
  simulate: boolean;
};
type Result = { reference: string; status: string; text: string; assistRequested?: boolean };

const MAX_STATUS_POLLS = 10;

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
  simulate: boolean;
  substituteMonths: number;
  substituteDailyDownloads: number;
  yearlyListMonthly: number;
  substituteMonthly: number;
}) {
  const { plans, subjects, user, coupon } = props;
  const [step, setStep] = useState<Step>(props.initialRef ? "done" : props.initialPlan ? "details" : "plan");
  const [planKey, setPlanKey] = useState<PayablePlan>(props.initialPlan ?? "yearly");
  const [selected, setSelected] = useState<number[]>(props.preselected.slice(0, YEARLY_INCLUDED_SUBJECTS));
  const [skip, setSkip] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [intent, setIntent] = useState<Intent | null>(null);
  const [frameReady, setFrameReady] = useState(false);
  const [frameStuck, setFrameStuck] = useState(false);
  const [frameKey, setFrameKey] = useState(0);
  const [paying, setPaying] = useState(false);
  const [result, setResult] = useState<Result | null>(
    props.initialRef ? { reference: props.initialRef, status: "pending", text: "בודקת את מצב התשלום…" } : null,
  );
  const frameRef = useRef<HTMLIFrameElement>(null);
  const intentRef = useRef<Intent | null>(null);
  useEffect(() => {
    intentRef.current = intent;
  }, [intent]);

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

  // --- דיווח לשרת על תוצאת ה-iframe ---
  const sendComplete = useCallback(async (payload: { reference: string; response?: unknown; simulate?: true }) => {
    try {
      const res = await fetch("/api/pay/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "שגיאה ברישום התשלום");
      setResult({ reference: data.reference, status: data.status, text: data.text });
    } catch (e) {
      setResult({
        reference: payload.reference,
        status: "processing",
        text: e instanceof Error ? e.message : "אירעה שגיאה. אם חויבת – התשלום יירשם, אין צורך לשלם שוב.",
      });
    } finally {
      setPaying(false);
      setStep("done");
    }
  }, []);

  // --- הודעות מה-iframe של נדרים פלוס (רק ממקור matara.pro) ---
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!NEDARIM_ORIGINS.includes(event.origin)) return;
      const data = event.data as { Name?: string; Value?: unknown } | null;
      if (!data || typeof data !== "object") return;
      if (data.Name === "Height") {
        if (frameRef.current) frameRef.current.style.height = `${parseInt(String(data.Value), 10) + 15}px`;
        setFrameReady(true);
        setFrameStuck(false);
      } else if (data.Name === "TransactionResponse") {
        const current = intentRef.current;
        if (!current) return;
        const value = data.Value && typeof data.Value === "object" ? (data.Value as Record<string, unknown>) : {};
        if (String(value.Status ?? "").toUpperCase() === "ERROR") {
          setPaying(false);
          setError(String(value.Message ?? "") || "התשלום לא אושר. אפשר לנסות שוב.");
          // גם כישלון נרשם בשרת (בלי לעבור לשלב הסיום) כדי שיופיע ביומן
          fetch("/api/pay/complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reference: current.reference, response: value }),
          }).catch(() => {});
          return;
        }
        void sendComplete({ reference: current.reference, response: value });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [sendComplete]);

  // --- שעון: ה-iframe לא ענה Height → כנראה חסום (נטפרי) ---
  useEffect(() => {
    if (step !== "pay" || frameReady) return;
    const t = setTimeout(() => setFrameStuck(true), FRAME_LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [step, frameReady, frameKey]);

  // --- בדיקת סטטוס בדף הסיום (אחרי רענון / בזמן אימות) ---
  useEffect(() => {
    if (step !== "done" || !result?.reference) return;
    if (["paid", "failed", "cancelled", "expired"].includes(result.status) || result.assistRequested) return;
    let tries = 0;
    const timer = setInterval(async () => {
      tries += 1;
      try {
        const res = await fetch(`/api/pay/status?ref=${encodeURIComponent(result.reference)}`, { cache: "no-store" });
        const data = await res.json();
        if (res.ok) setResult((r) => (r ? { ...r, status: data.status, text: data.text, assistRequested: data.assistRequested } : r));
      } catch {
        /* ננסה שוב */
      }
      if (tries >= MAX_STATUS_POLLS) clearInterval(timer);
    }, 4000);
    return () => clearInterval(timer);
  }, [step, result?.reference, result?.status, result?.assistRequested]);

  // --- שלב 2 → יצירת בקשה ---
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
      setFrameReady(false);
      setFrameStuck(false);
      setFrameKey((k) => k + 1);
      setStep("pay");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאת רשת");
    } finally {
      setBusy(false);
    }
  }

  const postToFrame = (msg: unknown) => {
    const win = frameRef.current?.contentWindow;
    if (!win) return false;
    // ה-iframe עונה ל-event.origin של ההורה; את היעד אנחנו מצמצמים לדומיין של נדרים (לא '*' כמו בדוגמה)
    win.postMessage(msg, NEDARIM_ORIGINS[0]);
    return true;
  };

  const pay = () => {
    if (!intent || paying) return;
    setError("");
    setPaying(true);
    if (!postToFrame({ Name: "FinishTransaction2", Value: intent.finish })) {
      setPaying(false);
      setError("טופס הסליקה עדיין לא נטען. נסי שוב בעוד רגע.");
    }
  };

  const simulatePay = async () => {
    if (!intent) return;
    setPaying(true);
    await sendComplete({ reference: intent.reference, simulate: true });
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
      setResult({ reference: intent.reference, status: data.status, text: data.text, assistRequested: true });
      setStep("done");
    } catch {
      setError("שגיאת רשת – נסי שוב");
    } finally {
      setBusy(false);
    }
  };

  const restart = () => {
    setStep(props.initialPlan ? "details" : "plan");
    setIntent(null);
    setResult(null);
    setError("");
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
  if (step === "done" && result) {
    const paid = result.status === "paid";
    const failed = result.status === "failed";
    return (
      <section className="gate-panel mx-auto mt-8 max-w-2xl sm:!p-8" aria-live="polite">
        <span className="gold-ring" aria-hidden="true" />
        <div className="gate-card text-center">
          <span className="gate-icon mx-auto">
            {paid ? <Check className="h-6 w-6" strokeWidth={2} aria-hidden /> : failed ? <AlertCircle className="h-6 w-6" aria-hidden /> : <Loader2 className="h-6 w-6 animate-spin" aria-hidden />}
          </span>
          <h2 className="mt-2 text-2xl">{paid ? "המנוי שלך פעיל!" : failed ? "התשלום לא אושר" : "הבקשה התקבלה"}</h2>
          <p className="gate-soft mt-2 text-lg">{result.text}</p>
          <p className="mt-3 text-base">
            מזהה הבקשה: <b dir="ltr">{result.reference}</b> – כדאי לשמור אותו לכל פנייה.
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

  /* ---------- שלב התשלום (iframe) ---------- */
  if (step === "pay" && intent) {
    return (
      <section className="gate-panel mx-auto mt-8 max-w-2xl sm:!p-8" aria-labelledby="pay-h">
        <span className="gold-ring" aria-hidden="true" />
        <div className="gate-strip gate-total">
          <div className="flex w-full items-baseline justify-between gap-4">
            <span id="pay-h" className="text-2xl">
              לתשלום – {plan.label}
            </span>
            <span className="gate-price">
              <GateShekel agorot={intent.amount} />
            </span>
          </div>
          {intent.couponPercent ? (
            <div className="w-full text-base">
              כולל {intent.couponPercent}% הנחה מהקופון שלך (במקום <GateShekel agorot={intent.listAmount} />)
            </div>
          ) : null}
        </div>
        <p className="mt-3 text-base">
          מזהה הבקשה: <b dir="ltr">{intent.reference}</b>. פרטי הכרטיס מוקלדים בטופס המאובטח של נדרים פלוס ואינם נשמרים
          אצלנו.
        </p>

        <div className="relative mt-4 overflow-hidden rounded-xl border-[2.5px] border-[#0a0a0a] bg-white">
          <iframe
            key={frameKey}
            ref={frameRef}
            title="טופס סליקה מאובטח – נדרים פלוס"
            src={NEDARIM_IFRAME_URL}
            scrolling="no"
            className="block w-full"
            style={{ height: frameReady ? undefined : "0px", border: 0 }}
            onLoad={() => postToFrame({ Name: "GetHeight" })}
          />
          {!frameReady && (
            <div className="flex items-center justify-center gap-2 px-4 py-8 text-center text-base text-[#3b3000]" role="status">
              {frameStuck ? (
                <AlertCircle className="h-5 w-5 shrink-0" aria-hidden />
              ) : (
                <Loader2 className="h-5 w-5 shrink-0 animate-spin" aria-hidden />
              )}
              {frameStuck ? "טופס התשלום לא נטען" : "מתחברת לשרת הסליקה המאובטח…"}
            </div>
          )}
        </div>

        {frameStuck && !frameReady && (
          <div className="gate-card mt-4 space-y-3" role="alert">
            <h3 className="text-xl">טופס התשלום לא נטען אצלך</h3>
            <p className="gate-soft text-base leading-relaxed">
              הטופס מגיע מהשרת המאובטח של נדרים פלוס (matara.pro). אם את גולשת דרך נטפרי או סינון אחר, ייתכן שהוא חסום
              אצלך – אפשר לבקש מהסינון לפתוח את האתר matara.pro ולנסות שוב, או להשלים את התשלום דרך מנהלת האתר: היא
              תיצור איתך קשר, ואחרי התשלום המנוי ייפתח לך.
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-gold py-2" onClick={() => { setFrameStuck(false); setFrameKey((k) => k + 1); }} disabled={busy}>
                לנסות לטעון שוב
              </button>
              <button type="button" className="btn gate-skip py-2 !border-[#0a0a0a] !text-[#0a0a0a]" onClick={requestAssist} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} להשלים את התשלום דרך המנהלת
              </button>
            </div>
          </div>
        )}

        <div className="mt-4">{errorStrip}</div>

        <div className="mt-4 text-center">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button type="button" className="btn btn-gold btn-gate py-2 disabled:opacity-50" onClick={pay} disabled={paying || !frameReady}>
              {paying ? <Loader2 className="h-5 w-5 animate-spin" /> : <CreditCard className="h-5 w-5" aria-hidden />}
              {paying ? "מבצעת חיוב, נא להמתין…" : "לתשלום"} {!paying && arrow}
            </button>
            <button type="button" className="btn gate-skip py-2" onClick={() => { setStep("details"); setIntent(null); setError(""); }} disabled={paying}>
              חזרה לפרטים
            </button>
          </div>
          {!frameStuck && !frameReady && (
            <button type="button" className="mt-3 text-base underline opacity-80" onClick={() => setFrameStuck(true)}>
              הטופס לא נטען אצלך?
            </button>
          )}
          {intent.simulate && (
            <div className="gate-strip mt-4 text-base">
              <span>מצב דמה (פיתוח בלבד) – טופס נדרים לא מקבל הודעות מ-localhost:</span>
              <button type="button" className="btn gate-skip py-1" onClick={simulatePay} disabled={paying}>
                סימולציית תשלום מוצלח
              </button>
            </div>
          )}
          <p className="mt-3 flex items-center justify-center gap-1.5 text-base opacity-80">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            הסליקה מתבצעת בשרת המאובטח של נדרים פלוס (תקן PCI) – מספר הכרטיס לא עובר דרך האתר.
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
                hint="מוטבע בסימן המים של הקבצים שלך, ונשלח לחברת הסליקה"
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
            בלחיצה על «המשך» ייפתח טופס הסליקה המאובטח של נדרים פלוס. פרטי הכרטיס אינם עוברים דרך האתר.
          </p>
        </div>
      </form>
    </section>
  );
}
