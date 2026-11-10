import Link from "next/link";
import { and, asc, desc, eq, gte, ilike, inArray, or, sql, count } from "drizzle-orm";
import { Mail, Search } from "lucide-react";
import { db } from "@/db";
import { contactInquiries, contactInquiryMessages, type ContactInquiry, type ContactInquiryMessage } from "@/db/schema";
import { requireAdminPage } from "@/lib/session";
import { siteUrl } from "@/lib/mail";
import { DT } from "@/components/admin/date-tip";
import { InquiryReplyForm } from "@/components/admin/inquiry-reply-form";
import { INQUIRY_TEMPLATES } from "@/lib/inquiry-templates";
import {
  STATUS_LABEL,
  averageResponseMs,
  defaultReplySubject,
  formatResponseTime,
  isInquiryStatus,
  previewText,
  renderTemplate,
  type InquiryStatus,
} from "@/lib/inquiry-logic";

export const dynamic = "force-dynamic";

const LIST_LIMIT = 100;
const TABS = [
  { key: "open", label: "ממתינות" },
  { key: "answered", label: "נענו" },
  { key: "closed", label: "סגורות" },
  { key: "all", label: "הכל" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const TAG_BG: Record<InquiryStatus, string> = {
  open: "!bg-[#f4c4bb]",
  answered: "!bg-[#cfe3b9]",
  closed: "!bg-[#e5e0d0]",
  spam: "!bg-[#e5e0d0]",
};

function qs(p: { tab?: string; q?: string; id?: number | string }) {
  const u = new URLSearchParams();
  if (p.tab && p.tab !== "open") u.set("tab", p.tab);
  if (p.q) u.set("q", p.q);
  if (p.id) u.set("id", String(p.id));
  const s = u.toString();
  return `/admin/inquiries${s ? `?${s}` : ""}`;
}

function errText(e: unknown): string {
  const parts: string[] = [];
  let cur: unknown = e;
  for (let i = 0; i < 4 && cur; i++) {
    parts.push(cur instanceof Error ? cur.message : String(cur));
    cur = cur instanceof Error ? (cur as Error & { cause?: unknown }).cause : undefined;
  }
  return parts.join(" | ");
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="gate-panel mx-auto max-w-2xl" role="alert">
      <span className="gold-ring" aria-hidden="true" />
      <h2 className="text-2xl">{title}</h2>
      <div className="mt-2 text-base">{children}</div>
    </section>
  );
}

export default async function AdminInquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; id?: string }>;
}) {
  await requireAdminPage();
  const sp = await searchParams;
  const tab: TabKey = TABS.some((t) => t.key === sp.tab) ? (sp.tab as TabKey) : "open";
  const q = (sp.q ?? "").trim().slice(0, 100);
  const selectedId = Number(sp.id) > 0 ? Number(sp.id) : null;

  let data: {
    counts: Record<string, number>;
    answered30: number;
    avgMs: number | null;
    list: ContactInquiry[];
    firstMsg: Map<number, ContactInquiryMessage>;
    selected: ContactInquiry | null;
    thread: ContactInquiryMessage[];
  };
  try {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const statusFilter =
      tab === "all"
        ? undefined
        : tab === "closed"
          ? inArray(contactInquiries.status, ["closed", "spam"])
          : eq(contactInquiries.status, tab);
    const like = q ? `%${q.replace(/[%_\\]/g, "\\$&")}%` : null;
    const searchFilter = like
      ? or(
          ilike(contactInquiries.name, like),
          ilike(contactInquiries.email, like),
          ilike(contactInquiries.topic, like),
          sql`exists (select 1 from ${contactInquiryMessages} m where m.inquiry_id = ${contactInquiries.id} and m.body ilike ${like})`,
        )
      : undefined;

    const [countRows, answeredRows, list, selectedRows] = await Promise.all([
      db.select({ status: contactInquiries.status, n: count() }).from(contactInquiries).groupBy(contactInquiries.status),
      db
        .select({ createdAt: contactInquiries.createdAt, answeredAt: contactInquiries.answeredAt })
        .from(contactInquiries)
        .where(and(eq(contactInquiries.status, "answered"), gte(contactInquiries.answeredAt, since))),
      db
        .select()
        .from(contactInquiries)
        .where(and(statusFilter, searchFilter))
        .orderBy(desc(contactInquiries.createdAt))
        .limit(LIST_LIMIT),
      selectedId
        ? db.select().from(contactInquiries).where(eq(contactInquiries.id, selectedId)).limit(1)
        : Promise.resolve([] as ContactInquiry[]),
    ]);
    const counts: Record<string, number> = {};
    for (const r of countRows) counts[r.status] = Number(r.n);
    const selected = selectedRows[0] ?? null;

    const ids = list.map((l) => l.id);
    const [firstRows, thread] = await Promise.all([
      ids.length
        ? db
            .select()
            .from(contactInquiryMessages)
            .where(and(inArray(contactInquiryMessages.inquiryId, ids), eq(contactInquiryMessages.direction, "in")))
            .orderBy(asc(contactInquiryMessages.createdAt))
        : Promise.resolve([] as ContactInquiryMessage[]),
      selected
        ? db
            .select()
            .from(contactInquiryMessages)
            .where(eq(contactInquiryMessages.inquiryId, selected.id))
            .orderBy(asc(contactInquiryMessages.createdAt))
        : Promise.resolve([] as ContactInquiryMessage[]),
    ]);
    const firstMsg = new Map<number, ContactInquiryMessage>();
    for (const m of firstRows) if (!firstMsg.has(m.inquiryId)) firstMsg.set(m.inquiryId, m);

    data = { counts, answered30: answeredRows.length, avgMs: averageResponseMs(answeredRows), list, firstMsg, selected, thread };
  } catch (e) {
    const msg = errText(e);
    console.error("[admin/inquiries] load failed", msg);
    if (/contact_inquir/i.test(msg) && /does not exist|relation/i.test(msg)) {
      return (
        <Notice title="טבלת הפניות עוד לא נוצרה">
          טבלת הפניות עוד לא נוצרה ב-Neon (ר׳ <code dir="ltr">scripts/create-inquiries-tables.ts</code>). עד שתיווצר, פניות
          מ&quot;צרי קשר&quot; ממשיכות להגיע אלייך במייל כרגיל.
        </Notice>
      );
    }
    return <Notice title="שגיאה בטעינת הפניות">לא הצלחנו לטעון את הפניות כרגע (שגיאת מסד נתונים). נסי לרענן עוד רגע.</Notice>;
  }

  const { counts, answered30, avgMs, list, firstMsg, selected, thread } = data;
  const tabCount = (k: TabKey) =>
    k === "all"
      ? Object.values(counts).reduce((a, b) => a + b, 0)
      : k === "closed"
        ? (counts.closed ?? 0) + (counts.spam ?? 0)
        : (counts[k] ?? 0);
  const pricingUrl = `${siteUrl()}/pricing`;
  const selStatus: InquiryStatus = selected && isInquiryStatus(selected.status) ? selected.status : "open";

  return (
    <div className="space-y-5">
      <div className="gate-title text-center">
        <h2 className="text-4xl">פניות מהאתר</h2>
        <p className="mt-1 text-base">מה כתבו לנו המורות, ומה ענינו להן. התשובה יוצאת ישר למייל שלהן.</p>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        {[
          { n: String(counts.open ?? 0), t: "ממתינות למענה" },
          { n: String(answered30), t: "נענו ב-30 יום" },
          { n: formatResponseTime(avgMs), t: "זמן מענה ממוצע (30 יום)" },
        ].map((s) => (
          <div key={s.t} className="gate-card min-w-[9.5rem] text-center" style={{ fontFamily: "var(--font-hand)" }}>
            <b className="block text-4xl font-normal leading-none">{s.n}</b>
            <span className="gate-soft text-lg">{s.t}</span>
          </div>
        ))}
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">
        <section className="gate-panel" aria-label="רשימת פניות">
          <span className="gold-ring" aria-hidden="true" />
          <h3 className="text-2xl">הפניות</h3>
          <nav className="mt-3 flex flex-wrap gap-2" aria-label="סינון לפי סטטוס">
            {TABS.map((t) => (
              <Link
                key={t.key}
                href={qs({ tab: t.key, q })}
                aria-current={t.key === tab ? "page" : undefined}
                className={`rounded-full border-2 border-[#ffd45a] px-3 text-base ${
                  t.key === tab ? "bg-[#ffd45a] text-black" : "text-[#ffd45a]"
                }`}
              >
                {t.label} ({tabCount(t.key)})
              </Link>
            ))}
          </nav>
          <form method="get" action="/admin/inquiries" className="mt-3 flex gap-2">
            {tab !== "open" && <input type="hidden" name="tab" value={tab} />}
            <input
              name="q"
              defaultValue={q}
              placeholder="חיפוש בשם / מייל / תוכן"
              aria-label="חיפוש בפניות"
              className="gate-input"
            />
            <button type="submit" className="btn gate-skip px-3" aria-label="חיפוש">
              <Search className="h-5 w-5" aria-hidden />
            </button>
          </form>

          {list.length === 0 ? (
            <p className="mt-4 text-center text-base text-[#ffd45a]">
              {q ? "לא נמצאו פניות שמתאימות לחיפוש." : tab === "open" ? "אין פניות שממתינות למענה." : "אין פניות להצגה."}
            </p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {list.map((it) => {
                const st: InquiryStatus = isInquiryStatus(it.status) ? it.status : "open";
                const first = firstMsg.get(it.id);
                return (
                  <li key={it.id}>
                    <Link
                      href={qs({ tab, q, id: it.id })}
                      aria-current={selected?.id === it.id ? "true" : undefined}
                      className={`gate-card block ${selected?.id === it.id ? "outline outline-4 outline-offset-2 outline-[#ffd45a]" : ""}`}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xl">
                          <span
                            aria-hidden
                            className={`me-1.5 inline-block h-2.5 w-2.5 rounded-full border-2 border-black ${
                              st === "open" ? "bg-[#b23a2e]" : "bg-[#6e8b54]"
                            }`}
                          />
                          {it.name}
                        </span>
                        <DT value={it.createdAt} time className="gate-soft shrink-0 text-sm" />
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <span className={`sicha-tag !text-base ${TAG_BG[st]}`}>{STATUS_LABEL[st]}</span>
                        {it.topic && <span className="sicha-tag !bg-[#d6e2fb] !text-base">{it.topic}</span>}
                      </div>
                      {first && (
                        <p className="mt-1 text-sm" style={{ fontFamily: "var(--font-sans)" }}>
                          {previewText(first.body)}
                        </p>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {list.length === LIST_LIMIT && (
            <p className="mt-3 text-center text-sm text-[#ffd45a]">
              מוצגות {LIST_LIMIT} הפניות האחרונות. לחיפוש ישן יותר – להשתמש בחיפוש.
            </p>
          )}
        </section>

        <section className="gate-panel" aria-label="שיחה">
          <span className="gold-ring" aria-hidden="true" />
          {!selected ? (
            <div className="py-16 text-center">
              <Mail className="mx-auto h-10 w-10 text-[#ffd45a]" strokeWidth={1.5} aria-hidden />
              <p className="mt-2 text-2xl">בחרי פנייה מהרשימה</p>
              {selectedId && <p className="mt-1 text-base text-[#ffd45a]">הפנייה שביקשת (מס׳ {selectedId}) לא נמצאה.</p>}
            </div>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-2.5 border-b-2 border-dashed border-[#ffd45a]/45 pb-3">
                <div>
                  <h3 className="text-3xl">{selected.name}</h3>
                  <a
                    href={`mailto:${selected.email}`}
                    dir="ltr"
                    className="text-base text-[#ffd45a] underline"
                    style={{ fontFamily: "var(--font-sans)" }}
                  >
                    {selected.email}
                  </a>
                </div>
                {selected.topic && <span className="sicha-tag !bg-[#d6e2fb]">{selected.topic}</span>}
                <span className={`sicha-tag ms-auto ${TAG_BG[selStatus]}`}>{STATUS_LABEL[selStatus]}</span>
              </div>

              <div className="space-y-2.5">
                {thread.length === 0 && <p className="text-base text-[#ffd45a]">אין הודעות שמורות בפנייה הזו.</p>}
                {thread.map((m) => (
                  <article
                    key={m.id}
                    className={`gate-card max-w-[92%] ${m.direction === "out" ? "ms-auto !bg-[#eef3fc]" : ""}`}
                  >
                    <small className="gate-soft block text-sm" style={{ fontFamily: "var(--font-sans)" }}>
                      {m.direction === "out" ? "את" : selected.name} · <DT value={m.createdAt} time />
                      {m.direction === "out" && (m.sentOk ? " · נשלח למייל של הפונה" : " · לא נשלח (השליחה נכשלה)")}
                    </small>
                    {m.direction === "out" && m.subject && (
                      <p className="text-base" style={{ fontFamily: "var(--font-sans)" }}>
                        <b>{m.subject}</b>
                      </p>
                    )}
                    <p className="whitespace-pre-wrap text-lg" style={{ fontFamily: "var(--font-sans)" }}>
                      {m.body}
                    </p>
                  </article>
                ))}
              </div>

              <InquiryReplyForm
                key={selected.id}
                inquiry={{ id: selected.id, name: selected.name, email: selected.email, status: selStatus }}
                defaultSubject={defaultReplySubject(selected.topic)}
                templates={INQUIRY_TEMPLATES.map((t) => ({
                  id: t.id,
                  label: t.label,
                  text: renderTemplate(t, { name: selected.name, pricingUrl }),
                }))}
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
