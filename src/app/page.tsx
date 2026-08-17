import Link from "next/link";
import {
  ArrowLeft,
  FolderTree,
  GitBranch,
  ShieldCheck,
  Download,
  Sparkles,
  Crown,
  FileText,
  Presentation,
  BookOpenCheck,
} from "lucide-react";
import { getRootSubjects } from "@/lib/data";
import {
  SITE_TAGLINE,
  SUBJECT_ICONS,
  TIERS,
  PREMIUM_ADDON_PRICE,
  formatPrice,
} from "@/lib/constants";
import type { Category, Tier } from "@/db/schema";
import { AnimatedGrid, Reveal } from "@/components/animated-grid";
import { SubjectCard } from "@/components/subject-card";

export const dynamic = "force-dynamic";

async function safeRootSubjects(): Promise<Category[]> {
  try {
    return await getRootSubjects();
  } catch {
    return [];
  }
}

const TIER_ORDER: Tier[] = ["iron", "copper", "silver", "gold", "diamond"];

export default async function HomePage() {
  const subjects = await safeRootSubjects();

  return (
    <div className="overflow-x-clip">
      {/* ---------- HERO ---------- */}
      <section className="relative mx-auto max-w-7xl px-4 sm:px-6 pt-14 pb-16 md:pt-20 md:pb-24">
        <FloatingShapes />
        <div className="relative grid items-center gap-10 md:grid-cols-2">
          <div className="animate-fade-up">
            <span className="chip bg-pink-soft text-[#9d174d]">
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> חדש: מפת הבגרות המלאה בתרשים זרימה
            </span>
            <h1 className="font-display mt-4 text-4xl font-black leading-[1.15] sm:text-5xl md:text-6xl">
              שיעור מוכן לכל פרק
              <span className="block text-blue-deep">בלחיצה אחת</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted">
              {SITE_TAGLINE}. דף שכפול לתלמידה, דף מלא למורה עם תשובות, מצגת מלווה,
              שאלות מבגרויות קודמות וטיפים – מסודר לפי מקצוע, יחידות, פנימי/חיצוני ופרקים.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/subjects" className="btn btn-primary text-base">
                <FolderTree className="h-5 w-5" aria-hidden /> למאגר המקצועות
              </Link>
              <Link href="/pricing" className="btn btn-gold text-base">
                <Crown className="h-5 w-5" aria-hidden /> מסלולים ומחירים
              </Link>
            </div>
            <ViewToggle />
          </div>

          <HeroIllustration />
        </div>
      </section>

      {/* ---------- SUBJECTS ---------- */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-10" aria-labelledby="subjects-h">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="subjects-h" className="font-display text-3xl font-bold">
              המקצועות
            </h2>
            <p className="mt-1 text-muted">בחרי מקצוע ופתחי את התיקיות עד לפרק שאת מלמדת מחר.</p>
          </div>
          <Link href="/subjects" className="btn btn-ghost text-sm">
            לכל המקצועות <ArrowLeft className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        {subjects.length === 0 ? (
          <EmptySubjects />
        ) : (
          <AnimatedGrid className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {subjects.map((s) => (
              <SubjectCard
                key={s.id}
                href={`/subjects/${encodeURIComponent(s.slug)}`}
                title={s.title}
                slug={s.slug}
                icon={s.icon || SUBJECT_ICONS[s.slug]}
                description={s.description}
                questionnaireCode={s.questionnaireCode}
                color={s.color}
              />
            ))}
          </AnimatedGrid>
        )}
      </section>

      {/* ---------- HOW IT WORKS ---------- */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-16" aria-labelledby="how-h">
        <Reveal>
          <h2 id="how-h" className="font-display text-center text-3xl font-bold">
            איך זה עובד?
          </h2>
          <p className="mt-2 text-center text-muted">שלושה צעדים – והשיעור של מחר מוכן.</p>
        </Reveal>
        <AnimatedGrid className="mt-10 grid gap-6 md:grid-cols-3">
          {[
            {
              n: "1",
              icon: <FolderTree className="h-7 w-7" aria-hidden />,
              title: "בוחרים מקצוע",
              text: "תורה, נביא, כתובים, לשון, ספרות, אנגלית, יהדות, מתמטיקה, דינים, היסטוריה, אזרחות ועוד.",
              tone: "from-blue to-blue-deep",
            },
            {
              n: "2",
              icon: <GitBranch className="h-7 w-7" aria-hidden />,
              title: "יורדים עד לפרק",
              text: "יחידות → פנימי/חיצוני → נושא → פרשה/פרק. כל תיקייה עם סמל שאלון ותיאור קצר.",
              tone: "from-pink to-[#db2777]",
            },
            {
              n: "3",
              icon: <Download className="h-7 w-7" aria-hidden />,
              title: "מורידים ומלמדים",
              text: "דף שכפול לתלמידה, דף למורה עם תשובות, ומצגת מלווה – מוטבעים במספר האישי שלך.",
              tone: "from-[#f2c94c] to-gold",
            },
          ].map((s) => (
            <div key={s.n} className="card card-hover relative h-full p-6 pt-8">
              <span
                className={`absolute -top-5 right-6 grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br ${s.tone} text-white shadow-lg`}
              >
                {s.icon}
              </span>
              <span className="font-display absolute left-5 top-3 text-5xl font-black text-blue-soft select-none">
                {s.n}
              </span>
              <h3 className="mt-2 text-xl font-bold">{s.title}</h3>
              <p className="mt-2 leading-relaxed text-muted">{s.text}</p>
            </div>
          ))}
        </AnimatedGrid>
      </section>

      {/* ---------- WHAT'S INSIDE ---------- */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-10" aria-labelledby="inside-h">
        <div className="card overflow-hidden">
          <div className="grid md:grid-cols-2">
            <div className="p-8 md:p-10">
              <Reveal>
                <h2 id="inside-h" className="font-display text-3xl font-bold">
                  מה יש בכל קובץ שיעור?
                </h2>
                <p className="mt-2 text-muted">
                  כל פרק מגיע כערכה שלמה, כך שאת נכנסת לכיתה רגועה ומוכנה.
                </p>
              </Reveal>
              <ul className="mt-6 space-y-4">
                {[
                  {
                    icon: <FileText className="h-5 w-5" aria-hidden />,
                    t: "דף שכפול לתלמידה",
                    d: "משפטים עם מילים חסרות – התלמידה משלימה תוך כדי השיעור ונשארת ערנית.",
                    c: "bg-blue-soft text-blue-deep",
                  },
                  {
                    icon: <BookOpenCheck className="h-5 w-5" aria-hidden />,
                    t: "דף שכפול למורה",
                    d: "אותו דף – עם התשובות מסומנות בקו תחתון, סיפורים, שאלות לחידוד וחידות.",
                    c: "bg-pink-soft text-[#9d174d]",
                  },
                  {
                    icon: <Presentation className="h-5 w-5" aria-hidden />,
                    t: "מצגת מלווה",
                    d: "מצגת מסודרת לפי מהלך השיעור, למקרן או ללוח חכם.",
                    c: "bg-gold-soft text-[#7a5b00]",
                  },
                ].map((i) => (
                  <li key={i.t} className="flex gap-4">
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${i.c}`}>
                      {i.icon}
                    </span>
                    <div>
                      <div className="font-bold">{i.t}</div>
                      <div className="text-sm text-muted leading-relaxed">{i.d}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <SheetPreview />
          </div>
        </div>
      </section>

      {/* ---------- PREMIUM TIERS ---------- */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-16" aria-labelledby="tiers-h">
        <Reveal className="text-center">
          <span className="chip btn-gold">
            <Crown className="h-3.5 w-3.5" aria-hidden /> תוספת פרימיום ·{" "}
            {formatPrice(PREMIUM_ADDON_PRICE)} לחודש
          </span>
          <h2 id="tiers-h" className="font-display mt-3 text-3xl font-bold">
            סולם הפרימיום: <span className="gold-text">מברזל ועד יהלום</span>
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-muted">
            פרימיום פותח את המצגות, שאלות הבגרויות הקודמות, הטיפים, הרעיונות והפורום. ככל
            שאת פעילה יותר – הרמה עולה וההטבות מתרחבות.
          </p>
        </Reveal>
        <AnimatedGrid className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {TIER_ORDER.map((t, i) => {
            const tier = TIERS[t];
            return (
              <div
                key={t}
                className="card card-hover flex h-full flex-col items-center p-5 text-center"
                style={{ borderTop: `4px solid ${tier.color}` }}
              >
                <span
                  className="grid h-14 w-14 place-items-center rounded-full text-3xl animate-float"
                  style={{ background: tier.color + "22", animationDelay: `${i * 0.4}s` }}
                >
                  {tier.icon}
                </span>
                <div className="mt-3 font-display text-xl font-bold" style={{ color: tier.color }}>
                  {tier.label}
                </div>
                <div className="text-xs text-muted">רמה {tier.order}</div>
              </div>
            );
          })}
        </AnimatedGrid>
        <div className="mt-8 text-center">
          <Link href="/pricing" className="btn btn-gold">
            לפרטי המסלולים <ArrowLeft className="h-4 w-4" aria-hidden />
          </Link>
        </div>
      </section>

      {/* ---------- SECURITY ---------- */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 pb-16">
        <Reveal>
          <div className="wood relative overflow-hidden rounded-3xl p-8 text-white md:p-10">
            <div className="relative flex flex-col items-start gap-6 md:flex-row md:items-center">
              <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white/15 backdrop-blur">
                <ShieldCheck className="h-9 w-9" aria-hidden />
              </span>
              <div className="flex-1">
                <h2 className="font-display text-2xl font-bold">כל קובץ מוטבע במספר האישי שלך</h2>
                <p className="mt-2 max-w-2xl leading-relaxed text-white/90">
                  בכל הורדה מוטבעים בקובץ המספר האישי של המורידה והודעת זכויות יוצרים. העברת
                  הקובץ הלאה חושפת את המעבירה לתביעה. כך אנחנו שומרות על היוצרות – ועל המחירים
                  הנמוכים.
                </p>
              </div>
              <Link href="/terms" className="btn bg-white text-oak-deep shadow-lg">
                לתנאי השימוש
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}

/* ---------- small pieces ---------- */

function ViewToggle() {
  return (
    <div className="mt-8 inline-flex items-center gap-1 rounded-full border border-blue/15 bg-white/70 p-1 text-sm shadow-sm backdrop-blur">
      <span className="px-3 text-muted">פתיחה</span>
      <Link
        href="/subjects"
        className="inline-flex items-center gap-1.5 rounded-full bg-blue-soft px-3 py-1.5 font-semibold text-blue-deep"
      >
        <FolderTree className="h-4 w-4" aria-hidden /> לפי תיקיות
      </Link>
      <Link
        href="/map"
        className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold hover:bg-pink-soft"
      >
        <GitBranch className="h-4 w-4" aria-hidden /> לפי תרשים זרימה
      </Link>
    </div>
  );
}

function FloatingShapes() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <span className="absolute -top-6 right-[8%] h-28 w-28 rounded-[2rem] bg-blue-soft opacity-80 animate-float" />
      <span
        className="absolute top-24 left-[6%] h-20 w-20 rounded-full bg-pink-soft animate-float"
        style={{ animationDelay: "1.2s" }}
      />
      <span
        className="absolute bottom-6 right-[35%] h-16 w-16 rotate-12 rounded-2xl bg-gold-soft animate-float"
        style={{ animationDelay: "2s" }}
      />
      <span
        className="absolute bottom-16 left-[30%] h-10 w-10 rounded-full bg-oak-soft animate-float"
        style={{ animationDelay: "0.6s" }}
      />
    </div>
  );
}

function HeroIllustration() {
  return (
    <div className="relative mx-auto w-full max-w-md animate-fade-up" style={{ animationDelay: "0.15s" }}>
      {/* מדף עץ */}
      <div className="wood absolute inset-x-6 bottom-8 h-4 rounded-full shadow-lg" aria-hidden />
      <div className="relative grid grid-cols-3 gap-4 px-6 pb-14 pt-6">
        {[
          { icon: "📝", t: "לתלמידה", c: "bg-blue-soft", d: "0s" },
          { icon: "👩‍🏫", t: "למורה", c: "bg-pink-soft", d: "0.5s" },
          { icon: "🖥️", t: "מצגת", c: "bg-gold-soft", d: "1s" },
        ].map((f) => (
          <div
            key={f.t}
            className={`card flex flex-col items-center gap-2 p-4 animate-float ${f.c}`}
            style={{ animationDelay: f.d }}
          >
            <span className="text-4xl">{f.icon}</span>
            <span className="text-sm font-bold">{f.t}</span>
            <span className="h-1.5 w-12 rounded-full bg-white/80" />
            <span className="h-1.5 w-8 rounded-full bg-white/80" />
          </div>
        ))}
      </div>
      <div className="card absolute -bottom-2 right-2 flex items-center gap-2 px-4 py-2 text-sm shadow-lg animate-pop" style={{ animationDelay: "0.6s" }}>
        <ShieldCheck className="h-4 w-4 text-blue" aria-hidden />
        מוטבע במספר אישי
      </div>
    </div>
  );
}

function SheetPreview() {
  const lines = [
    { t: "וַיֹּאמֶר ה' אֶל ______ לֶךְ לְךָ", a: "אַבְרָם" },
    { t: "מֵאַרְצְךָ וּמִמּוֹלַדְתְּךָ וּמִבֵּית ______", a: "אָבִיךָ" },
    { t: "אֶל הָאָרֶץ אֲשֶׁר ______", a: "אַרְאֶךָּ" },
  ];
  return (
    <div className="relative flex items-center justify-center bg-gradient-to-br from-blue-soft via-white to-pink-soft px-8 pt-8 pb-20 min-h-[22rem]" aria-hidden>
      <div className="relative w-full max-w-xs">
        <div className="card rotate-[-4deg] p-5 text-sm">
          <div className="mb-3 flex items-center justify-between text-xs text-muted">
            <span className="chip bg-blue-soft text-blue-deep">📝 לתלמידה</span>
            <span>שם: ________</span>
          </div>
          {lines.map((l) => (
            <p key={l.t} className="my-2 leading-7">
              {l.t}
            </p>
          ))}
        </div>
        <div className="card absolute -bottom-8 -left-6 w-full rotate-[5deg] p-5 text-sm shadow-lift">
          <div className="mb-3 flex items-center justify-between text-xs text-muted">
            <span className="chip bg-pink-soft text-[#9d174d]">👩‍🏫 למורה</span>
            <span>תשובות</span>
          </div>
          {lines.map((l) => (
            <p key={l.a} className="my-2 leading-7">
              {l.t.replace("______", "")}
              <span className="font-bold text-blue-deep underline decoration-2 underline-offset-4">
                {l.a}
              </span>
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptySubjects() {
  return (
    <div className="card mt-8 p-10 text-center">
      <div className="text-5xl animate-float">📂</div>
      <h3 className="mt-3 text-xl font-bold">המדפים עוד מתמלאים</h3>
      <p className="mt-1 text-muted">
        המקצועות יופיעו כאן בקרוב. בינתיים אפשר להכיר את{" "}
        <Link href="/pricing" className="text-blue-deep underline">
          המסלולים והמחירים
        </Link>
        .
      </p>
    </div>
  );
}
