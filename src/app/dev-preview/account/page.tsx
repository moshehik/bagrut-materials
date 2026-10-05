import { notFound } from "next/navigation";
import { Check, Heart, ShoppingBag, UserRound, Fingerprint, XCircle, CheckCircle2, Settings2, ChevronDown } from "lucide-react";
import { VerifyEmailBanner } from "@/components/verify-email-banner";
import { EditNameForm, EditPhoneForm, ChangePasswordForm, ChangeEmailForm } from "@/components/profile-forms";
import { AccountMenu, AccountTitle, Notice, Panel, PlanNut, TypeFilter } from "@/components/account-ui";
import { SUBJECT_HOUSES, subjectDisplayTitle } from "@/lib/constants";
import { getRootSubjects } from "@/lib/data";
import { DownloadsCalendar } from "@/components/downloads-calendar";
import type { CalGroup } from "@/lib/download-groups";
import type { CalPurchase } from "@/lib/purchase-calendar";
import { HebrewDateField } from "@/components/hebrew-date-field";
import { formatHebrewDate, hebrewMonths, hebrewToday } from "@/lib/hebrew-date";

export const dynamic = "force-dynamic";

const BACK = "/dev-preview/account";
/** בהדמיה כל חלון בתפריט פותח את עמוד ההדמיה שלו */
const HREFS: Record<string, string> = {
  "/account/downloads/calendar": "/dev-preview/account?p=calendar",
  "/account/details": "/dev-preview/account?p=details",
  "/account/interests": "/dev-preview/account?p=interests",
  "/account/purchases": "/dev-preview/account?p=purchases",
  "/account/payments": "/dev-preview/account?p=payments",
};

/** הדמיה לפיתוח בלבד: האזור האישי כאילו המשתמשת מחוברת, עם נתוני דמה (לא נגיש ב-production).
 *  ברירת מחדל: התפריט. ?p=details | interests | purchases לעמודי המשנה. ?notice=1 הודעות, ?unverified=1 באנר אימות. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; notice?: string; unverified?: string; y?: string; m?: string; t?: string; d?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;
  const G = (dateIso: string, chain: string, whole: boolean, total: number, items: [CalGroup["items"][number]["type"], string, string][], who?: string): CalGroup => ({
    dateIso,
    categoryId: 1,
    folder: chain.split(" › ").pop() ?? chain,
    chain,
    who,
    whole,
    total,
    items: items.map(([type, title, time], i) => ({ materialId: i + 1, title, type, time })),
  });
  const admin0 = sp.p === "admin-calendar";
  // הדמיה של ארבעת המסלולים (ממלאת מקום 3 חודשים ו-20 הורדות עדיין לא נשמרים במסד כסוג רכישה)
  const PURCH: CalPurchase[] = [
    { dateIso: "2026-09-16", plan: "yearly", label: "מנוי שנתי", time: "10:12", who: admin0 ? "רחל כהן" : undefined },
    { dateIso: "2026-09-22", plan: "substitute", label: "ממלאת מקום 3 חודשים", time: "09:30", who: admin0 ? "שרה לוי" : undefined },
    { dateIso: "2026-10-01", plan: "daily", label: "ממלאת מקום – 20 הורדות", time: "16:20", who: admin0 ? "מירי אברהם" : undefined },
    { dateIso: "2026-10-05", plan: "single", label: "הורדה בודדת", time: "13:40", who: admin0 ? "חנה גולד" : undefined },
  ];
  const MOCK: CalGroup[] = [
    G("2026-09-14", "תורה › חומש דברים › פרשת כי תצא › פרק כ׳", false, 11, [["student", "שכפול לתלמידה – פרק כ׳", "09:12"], ["quiz", "בוחן – פרק כ׳", "09:14"]]),
    G("2026-09-26", "תורה › חומש בראשית › פרשת בראשית › פרק ז׳", true, 9, [["student", "שכפול לתלמידה – פרק ז׳", "21:40"], ["teacher", "שכפול למורה – פרק ז׳", "21:40"]]),
    G("2026-10-02", "נביא › מלכים א׳ › פרק יח", false, 8, [["exam", "שאלות מבגרויות – פרק יח", "11:03"], ["exam-answers", "תשובות לשאלות מבגרויות – פרק יח", "11:04"]]),
    G("2026-10-03", "נביא › יהושע › פרק ו׳", false, 12, [["teacher", "שכפול למורה – פרק ו׳", "20:30"]]),
    G("2026-10-05", "תורה › חומש דברים › פרשת כי תצא › פרק כ׳", true, 11, [["student", "שכפול לתלמידה – פרק כ׳", "14:05"], ["teacher", "שכפול למורה – פרק כ׳", "14:05"]]),
    G("2026-10-05", "כתובים › תהלים › פרק נ״א", false, 7, [["prep", "דף הכנה ובקיאות", "15:20"], ["enrichment", "דף העשרה", "15:21"], ["dictation", "סיכום להכתבה", "15:21"]]),
    G("2026-10-20", "כתובים › תהלים › פרק ק״ל", false, 7, [["prep", "דף הכנה ובקיאות", "10:00"]]),
  ];
  const ADMIN: CalGroup[] = [
    ...MOCK.map((g, i) => ({ ...g, who: ["רחל כהן", "שרה לוי", "מירי אברהם"][i % 3] })),
    G("2026-10-05", "נביא › יהושע › פרק ו׳", false, 12, [["student", "שכפול לתלמידה – פרק ו׳", "16:10"]], "חנה גולד"),
    G("2026-10-05", "תורה › חומש בראשית › פרשת בראשית › פרק ז׳", true, 9, [["student", "שכפול לתלמידה – פרק ז׳", "17:45"], ["teacher", "שכפול למורה – פרק ז׳", "17:45"]], "דבורה מזרחי"),
  ];
  const FORUM: CalGroup[] = [
    { dateIso: "2026-09-15", categoryId: 1, folder: "פרק כ׳", chain: "תורה › חומש דברים › פרשת כי תצא › פרק כ׳", whole: false, total: 2, forum: true, href: "/subjects/torah#unit-forum", items: [{ materialId: 1, title: "שאלה: איך מלמדים את דיני גרושה בכיתה י׳?", type: "forum", time: "21:15", href: "/forum/1" }, { materialId: 2, title: "תגובה: אני מקדימה בסיפור ואז עוברת לפסוקים.", sub: "בשרשור: איך מלמדים את דיני גרושה בכיתה י׳?", type: "forum", time: "21:40", href: "/forum/1" }] },
    { dateIso: "2026-10-03", categoryId: 2, folder: "פרק ו׳", chain: "נביא › יהושע › פרק ו׳", whole: false, total: 1, forum: true, href: "/subjects/navi#unit-forum", items: [{ materialId: 3, title: "תגובה: מצגת קצרה על חומות יריחו עבדה לי יפה.", sub: "בשרשור: רעיונות לפתיחת השיעור", type: "forum", time: "20:30", href: "/forum/2" }] },
    { dateIso: "2026-10-05", categoryId: 3, folder: "פרק נ״א", chain: "כתובים › תהלים › פרק נ״א", whole: false, total: 1, forum: true, href: "/subjects/ktuvim#unit-forum", items: [{ materialId: 4, title: "טיפ: כדאי לשיר את הפרק לפני הלימוד.", type: "forum", time: "15:50", href: "/forum/3" }] },
  ];
  const typed = (gs: CalGroup[]) =>
    sp.t === "forum" ? FORUM.map((g, i) => (admin0 ? { ...g, who: ["רחל כהן", "שרה לוי", "מירי אברהם"][i % 3] } : g)) : sp.t ? gs.map((g) => ({ ...g, items: g.items.filter((i) => (i.type ?? "other") === sp.t) })).filter((g) => g.items.length) : gs;

  if (sp.p === "calendar" || sp.p === "admin-calendar") {
    const admin = sp.p === "admin-calendar";
    const t = hebrewToday();
    const y = Number(sp.y) || t.year;
    const ms = hebrewMonths(y);
    const mk = ms.some((m) => m.key === sp.m) ? String(sp.m) : y === t.year ? t.monthKey : ms[0].key;
    const link = (yy: number, mm: string, extra = "") => `/dev-preview/account?p=${sp.p}&y=${yy}&m=${encodeURIComponent(mm)}${sp.t ? `&t=${sp.t}` : ""}${extra}`;
    return (
      <div className="acc-glass mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <AccountTitle title={admin ? "הורדות בלוח שנה (מנהלת)" : "ההורדות שלי"} subtitle={admin ? "כל ההורדות באתר, לפי לוח השנה." : "מתי הורדת, ומה – לפי לוח השנה. לחצי על יום כדי לראות את הפירוט."} back backHref={BACK} />
        <DownloadsCalendar
          year={y}
          monthKey={mk}
          groups={typed(admin ? ADMIN : MOCK)}
          hrefFor={(yy, mm) => link(yy, mm)}
          dayHref={(iso) => `${link(y, mk, `&d=${iso}`)}#day-list`}
          selectedIso={sp.d}
          mode="select"
          purchases={sp.t ? [] : PURCH}
          showRedownload={!admin}
          filter={<TypeFilter active={sp.t} hrefFor={(tt) => `/dev-preview/account?p=${sp.p}&y=${y}&m=${encodeURIComponent(mk)}${tt ? `&t=${tt}` : ""}`} />}
        />
      </div>
    );
  }

  if (sp.p === "payments") {
    return (
      <div className="acc-glass mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <AccountTitle title="היסטוריית תשלומים" subtitle="2 תנועות." back backHref={BACK} />
        <section className="gate-panel mx-auto mt-8 max-w-3xl sm:!p-8">
          <span className="gold-ring" aria-hidden="true" />
          <form className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2"><HebrewDateField name="from" label="מתאריך" /><HebrewDateField name="to" label="עד תאריך" /></div>
            <div className="flex gap-2"><button type="button" className="btn btn-gold btn-gate py-1.5">סינון</button><span className="btn gate-skip py-1.5">איפוס</span></div>
          </form>
        </section>
        <section className="gate-panel mx-auto mt-8 max-w-3xl sm:!p-8">
          <span className="gold-ring" aria-hidden="true" />
          <ul className="acc-list gate-card !py-2">
            {[["חיוב", "מנוי שנתי", formatHebrewDate("2026-10-05T11:05:00Z", true) + " · כרטיס אשראי", "₪ 1,200", false], ["זיכוי", "קופון השקה", formatHebrewDate("2026-10-05T09:30:00Z", true), "₪ 50", true]].map(([type, note, meta, amount, neg]) => (
              <li key={String(note)} className="flex items-center gap-3 py-3">
                <span className="gate-badge">{type}</span>
                <div className="min-w-0 flex-1"><p className="truncate text-lg">{note}</p><p className="gate-soft text-base">{meta}</p></div>
                <span className={`whitespace-nowrap text-xl ${neg ? "text-[#1b5e20]" : ""}`}>{neg ? "-" : ""}{amount}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    );
  }

  if (sp.p === "details") {
    return (
      <div className="acc-glass mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <AccountTitle title="הנתונים שלי" subtitle="הפרטים האישיים שלך והמספר האישי." back backHref={BACK} />
        <Panel id="d" title="הפרטים שלי" icon={UserRound}>
          <div className="gate-card">
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <div><dt className="gate-soft text-base">שם</dt><dd className="text-xl">דוגמה כהן</dd></div>
              <div><dt className="gate-soft text-base">מייל</dt><dd className="break-all text-xl"><span dir="ltr" className="inline-block">example@gmail.com</span></dd></div>
              <div><dt className="gate-soft text-base">טלפון</dt><dd className="text-xl"><span dir="ltr" className="inline-block">050-0000000</span></dd></div>
              <div><dt className="gate-soft text-base">חברה מאז</dt><dd className="text-xl">{formatHebrewDate("2026-10-05T09:00:00Z")}</dd></div>
            </dl>
          </div>
          <details className="acc-edit mt-5">
            <summary>
              <span className="btn btn-gold btn-gate py-2">
                <Settings2 className="h-5 w-5" aria-hidden /> עריכת פרטים וסיסמה
                <ChevronDown className="acc-edit-chev h-5 w-5 transition-transform" aria-hidden />
              </span>
            </summary>
            <div className="mt-6 space-y-6">
              <EditNameForm currentName="דוגמה כהן" />
              <hr className="gate-divider !border-[#ffd45a]/40" />
              <EditPhoneForm currentPhone="050-0000000" />
              <hr className="gate-divider !border-[#ffd45a]/40" />
              <ChangeEmailForm currentEmail="example@gmail.com" />
              <hr className="gate-divider !border-[#ffd45a]/40" />
              <ChangePasswordForm />
            </div>
          </details>
        </Panel>
        <Panel id="c" title="המספר האישי שלך" icon={Fingerprint}>
          <div className="gate-card">
            <div className="acc-code" dir="ltr">BG-0000</div>
            <p className="gate-soft mt-3 text-lg leading-snug">מספר זה מוטבע על כל קובץ שאת מורידה כסימן מים שקוף, יחד עם השם, המייל והטלפון שלך.</p>
          </div>
        </Panel>
      </div>
    );
  }

  if (sp.p === "interests") {
    const roots = await getRootSubjects(true);
    return (
      <div className="acc-glass mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <AccountTitle title="מקצועות שמעניינים אותי" subtitle="סמני את המקצועות שמעניינים אותך – זה יעזור לנו להתאים לך עדכונים והמלצות." back backHref={BACK} />
        <Panel id="i" title="בחירת מקצועות" icon={Heart}>
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              {roots.map((r, i) => (
                <label key={r.id} className="gate-card gate-pick acc-pick">
                  <input type="checkbox" defaultChecked={i % 3 === 0} className="sr-only" />
                  <span className="gate-check" aria-hidden><Check className="h-5 w-5" strokeWidth={3} /></span>
                  {SUBJECT_HOUSES[r.slug] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="gate-pick-house !w-16" src={SUBJECT_HOUSES[r.slug]} alt="" width={356} height={266} />
                  ) : (
                    <span className="w-16 text-center text-2xl">📘</span>
                  )}
                  <span className="flex-1 text-xl leading-snug">{subjectDisplayTitle(r.slug, r.title)}</span>
                </label>
              ))}
            </div>
            <div className="text-center"><button type="button" className="btn btn-gold btn-gate py-2"><Check className="h-5 w-5" aria-hidden /> שמירת נושאים</button></div>
          </div>
        </Panel>
      </div>
    );
  }

  if (sp.p === "purchases") {
    return (
      <div className="acc-glass mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <AccountTitle title="רכישות ומנויים" subtitle="המנויים והרכישות הפעילים שלך." back backHref={BACK} />
        <Panel id="p" title="הפעילים" icon={ShoppingBag}>
          <ul className="space-y-5">
            {[["מנוי שנתי", "כל המקצועות", "₪ 1,200", "12 / 40", 30, formatHebrewDate("2027-01-01T09:00:00Z"), "yearly"], ["מנוי חודשי לפי מערכת", "3 מקצועות", "₪ 99", "18 / 300", 6, "05/11/2026", "custom_monthly"], ["הורדה בודדת", "סיכום פרק כ׳", "₪ 12", "—", 0, "ללא הגבלה", "single"]].map(([t, s, price, usage, pct, end, plan]) => (
              <li key={String(t)} className="gate-card flex items-start gap-4">
                <PlanNut plan={String(plan)} /><div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3"><h3 className="text-2xl">{t}</h3><span className="ms-auto text-2xl">{price}</span></div>
                <p className="gate-soft">{s}</p>
                <hr className="gate-divider" />
                <dl className="grid gap-x-6 gap-y-2 text-lg sm:grid-cols-2">
                  <div><dt className="gate-soft text-base">הורדות</dt><dd><bdi dir="ltr">{usage}</bdi><span className="acc-meter mt-1 block"><span style={{ width: `${pct}%` }} /></span></dd></div>
                  <div><dt className="gate-soft text-base">בתוקף עד</dt><dd>{end}</dd></div>
                </dl>
                <div className="mt-3 flex items-center gap-5 text-lg"><span className="gate-soft ms-auto flex items-center gap-1 text-base"><XCircle className="h-4 w-4" /> בקשת ביטול</span></div>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    );
  }

  return (
    <div className="acc-glass mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <AccountTitle title="שלום, דוגמה כהן" eyebrow />
      {sp.notice && <Notice icon={CheckCircle2}><b className="font-normal text-white">ההזמנה נרשמה בהצלחה!</b> אפשר להתחיל להוריד.</Notice>}
      <VerifyEmailBanner verified={sp.unverified !== "1"} email="example@gmail.com" />
      <AccountMenu hrefs={HREFS} />
    </div>
  );
}
