import Link from "next/link";
import { ArrowLeft, BookOpen, Gift, Tags } from "lucide-react";
import { getFreeTrialState } from "@/lib/free-trial";
import { FingerprintMark, WatermarkText } from "@/components/watermark-notice";
import { getRootSubjects, getHomeStats } from "@/lib/data";
import { getCurrentUser } from "@/lib/session";
import { SUBJECT_HOUSES } from "@/lib/constants";
import type { Category } from "@/db/schema";
import type { CSSProperties } from "react";
import Image from "next/image";
import { AnimatedGrid, Reveal } from "@/components/animated-grid";
import { HeroTitle } from "@/components/hero-title";
import { HeroClock } from "@/components/hero-clock";
import { AboutWriting } from "@/components/about-writing";
import { TypewriterLead } from "@/components/typewriter-lead";
import { GoatCalendarArt } from "@/components/goat-calendar-art";
import { IconMaterials, IconSubjects, IconLessonTypes, IconFree } from "@/components/kind-icons";
import { CountUp } from "@/components/count-up";
import { nutForLevel } from "@/lib/nut-images";
import { CARD_ROWS, CARD_STYLES, type CardType } from "@/lib/material-card-types";
import { MapDraw } from "@/components/map-draw";
import { FaqSection } from "@/components/faq-section";
import { HomePopup, type HomePopupData } from "@/components/home-popup";
import { getSettings } from "@/lib/settings";
import { getMySubjects } from "@/lib/home-personal";
import { NextLessonButton } from "@/components/next-lesson-button";
import s from "./home.module.css";

export const dynamic = "force-dynamic";

async function safeRootSubjects(isAdmin: boolean): Promise<Category[]> {
  try {
    return await getRootSubjects(isAdmin);
  } catch {
    return [];
  }
}

async function safeStats() {
  try {
    return await getHomeStats();
  } catch {
    return { subjects: 0, folders: 0, files: 0, downloads: 0, freeFiles: 0, visits: 0 };
  }
}

/** סדר הכרטיסיות בתוך תיקיית שיעור (אותו סדר כמו CARD_ROWS) */
const LESSON_ITEMS: CardType[] = CARD_ROWS.flat();

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ popupPreview?: string }>;
}) {
  const user = await getCurrentUser().catch(() => null);
  const isAdmin = user?.role === "admin";
  const [subjects, stats] = await Promise.all([safeRootSubjects(isAdmin), safeStats()]);

  // הודעה צפה בדף הבית (מקצוע חדש / קופונים וכו') – נכתבת ב"הגדרות" → "הודעת דף הבית"
  const cfg = await getSettings();
  const popupItems = cfg.home_popup_items
    .split(/\r?\n\s*\r?\n/)
    .map((t) => t.trim())
    .filter(Boolean);
  let popup: HomePopupData | null =
    cfg.home_popup_enabled === "true" && popupItems.length > 0
      ? { title: cfg.home_popup_title, items: popupItems }
      : null;
  // הדמיה בפיתוח מקומי בלבד: /?popupPreview=1 מציג הודעה לדוגמה גם כשההגדרה כבויה
  if (process.env.NODE_ENV !== "production" && (await searchParams).popupPreview) {
    popup = {
      title: "",
      items: [
        "מקצוע חדש עלה לאתר!\nכל החומרים של המקצוע החדש מוכנים ומחכים לך, פרק אחרי פרק.",
        "קופונים חדשים\nהכנו לך קופונים מיוחדים להנחה ברכישה הבאה.",
      ],
    };
  }

  // כפתור "נסי שיעור אחד בחינם": לאורחת (ההרשמה פותחת אותו) ולמחוברת שעוד לא מימשה; אחרת חוזרים ל"מסלולים ומחירים"
  const trialState = await getFreeTrialState(user).catch(() => "off" as const);
  const trialCta =
    cfg.free_trial_enabled === "true" && (!user || trialState === "available" || trialState === "unverified");

  // מורה מחוברת: ברכה אישית + קיצורי דרך למקצועות שלה ולשיעור הבא בתור
  const greetName = user ? user.firstName?.trim() || user.name.trim().split(/\s+/)[0] || undefined : undefined;
  const mySubjects = user ? await getMySubjects(user).catch(() => []) : [];
  const personal = mySubjects.length > 0;

  const body = (
    <>
      {/* ================= HERO ================= */}
      <div className={s.hero}>
        <div className={s.heroBg} aria-hidden>
          <HeroClock />
        </div>
        <div className={s.wrap}>
          <div className={s.heroGrid}>
            <div className={s.heroIn}>
              <HeroTitle name={greetName} />
              <TypewriterLead
                className={s.lead}
                text={'כאן תקבלי את המעטפת המושלמת לשיעור מעולה, כזה שמכין את התלמידות שלך למבחני הבגרות בצורה יסודית, מעשירה וחוויתית בלחיצת כפתור!'}
              />
              <div className={s.acts}>
                <Link href={personal ? "/subjects?mine=1" : "/subjects"} className="btn btn-gold btn-gate">
                  <BookOpen className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                  {personal ? "למקצועות שלך" : "למאגר המקצועות"}
                  <ArrowLeft className="h-4 w-4 fix-gate-arrow" strokeWidth={1.75} aria-hidden />
                </Link>
                {personal ? (
                  <NextLessonButton options={mySubjects} />
                ) : trialCta ? (
                  <Link href={user ? "/subjects" : "/register"} className="btn btn-ghost btn-plans text-base">
                    <Gift className="h-5 w-5 plans-icon" strokeWidth={1.75} aria-hidden />
                    נסי שיעור אחד בחינם
                  </Link>
                ) : (
                  <Link href="/pricing" className="btn btn-ghost btn-plans text-base">
                    <Tags className="h-5 w-5 plans-icon" strokeWidth={1.75} aria-hidden />
                    מסלולים ומחירים
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={s.wrap}>
        {/* ================= KINDS — נתוני האתר (קופצים מ-0 בכל כניסה). ההורדות והכניסות הוסתרו בכוונה עד שהמספרים יגדלו — stats.downloads/visits עדיין מחושבים ב-getHomeStats ================= */}
        <AnimatedGrid className={s.kinds}>
          <div className={s.kind}>
            <img src="/images/kind-blob-1.png" alt="" className={s.kindBlob} />
            <IconMaterials className={s.kindIcon} />
            <b><CountUp value={stats.files} /></b>
            <span>חומרים באתר</span>
          </div>
          <div className={s.kind}>
            <img src="/images/kind-blob-2.png" alt="" className={s.kindBlob} />
            <IconSubjects className={s.kindIcon} />
            <b><CountUp value={stats.subjects} /></b>
            <span>מקצועות בפריסה</span>
          </div>
          <div className={s.kind}>
            <img src="/images/kind-blob-3.png" alt="" className={s.kindBlob} />
            <IconLessonTypes className={s.kindIcon} />
            {/* "עד": המפרט משתנה לפי סוג השיעור (ר' ההערה מתחת ל"מה לו״ז השיעור שלנו?"), לא בכל שיעור יש את כל הסוגים */}
            <b>עד <CountUp value={LESSON_ITEMS.filter((t) => t !== "presentation").length} /></b>
            <span>קבצי תוכן לשיעור</span>
          </div>
          <div className={s.kind}>
            <img src="/images/kind-blob-4.png" alt="" className={s.kindBlob} />
            <IconFree className={s.kindIcon} />
            <b><CountUp value={stats.freeFiles} /></b>
            <span>קבצים חינמיים</span>
          </div>
        </AnimatedGrid>
        {/* ================= LESSON CONTENTS (לו"ז השיעור) ================= */}
        <Reveal>
          <h2 className="sec-h" style={{ marginBottom: 40 }}>
            מה לו״ז השיעור שלנו?
          </h2>
        </Reveal>
        <AnimatedGrid className={s.lessonItems}>
          {LESSON_ITEMS.map((t) => {
            const st = CARD_STYLES[t];
            const soon = t === "presentation";
            // הכיתוב והוי באותו צבע — צבע התיקייה (לכל סוג צבע ייחודי ב-CARD_STYLES)
            const chk = st.chk ?? st.strip;
            return (
              <div
                key={t}
                className={s.lessonItem}
                style={{ "--chk": chk } as CSSProperties}
              >
                <div className={s.lessonArtBox}>
                  {!soon && <span className={s.lessonCheck} aria-hidden />}
                  <Image
                    src={`/images/lesson-icons-v2/${st.art}.png`}
                    alt=""
                    width={120}
                    height={120}
                    className={s.lessonArt}
                    aria-hidden
                  />
                  {soon && <span className={s.lessonSoon}>בקרוב!</span>}
                </div>
                <b>{st.label}</b>
              </div>
            );
          })}
        </AnimatedGrid>
        <p className={s.lessonNote}>המפרט מתעדכן לפי סוג השיעור</p>

        {/* ================= STEPS ================= */}
        <Reveal>
          <h2 className="sec-h">איך זה עובד</h2>
          <p className="sec-sub" style={{ marginBottom: 46 }}>
            שלושה צעדים — והשיעור של מחר מוכן.
          </p>
        </Reveal>
        <AnimatedGrid className={s.steps}>
          <div className={s.step}>
            <div className={s.n}>
              <span>1</span>
            </div>
            <h4>
              <img src="/images/marker-1.png" alt="" className={s.stepMarker} />
              <mark className={s.highlight}>בוחרים מקצוע</mark>
            </h4>
            <p>תורה, נביא, כתובים, לשון, ספרות, אנגלית, מחשבת ישראל, מתמטיקה, דינים, היסטוריה ועוד.</p>
          </div>
          <div className={s.step}>
            <div className={s.n}>
              <span>2</span>
            </div>
            <h4>
              <img src="/images/marker-2.png" alt="" className={s.stepMarker} />
              <mark className={s.highlight}>יורדים עד לפרק</mark>
            </h4>
            <p>יחידות ← פנימי/חיצוני ← נושא ← פרשה/פרק. כל תיקייה עם סמל שאלון ותיאור קצר.</p>
          </div>
          <div className={s.step}>
            <div className={s.n}>
              <span>3</span>
            </div>
            <h4>
              <img src="/images/marker-3.png" alt="" className={s.stepMarker} />
              <mark className={s.highlight}>מורידים ומלמדים</mark>
            </h4>
            <p>הקובץ מוטבע במספר האישי שלך ונשמר באזור האישי. מדפיסים — ונכנסים לכיתה.</p>
          </div>
        </AnimatedGrid>

        {/* ================= SUBJECTS ================= */}
        <Reveal className={s.subjectsTitle}>
          <h2 className="sec-h" id="subjects-h" style={{ marginBottom: 0 }}>
            המקצועות
          </h2>
        </Reveal>
        {subjects.length === 0 ? (
          <EmptySubjects />
        ) : (
          <div className={s.snowScene}>
            <HouseCluster subjects={subjects} />
            <img
              src="/images/luz-house-only.png"
              alt=""
              aria-hidden
              className={s.snowLogo}
              width={1451}
              height={800}
            />
          </div>
        )}

        {/* ================= מפת הבגרויות ================= */}
        <Reveal>
          <div className={s.mapSec}>
            <MapDraw className={s.mapArt} />
            <div className={s.mapText}>
              <h2>מפת הבגרויות</h2>
              <p>
                פריסה מדויקת עד אחרון הפרטים בכל מקצוע.
                <br />
                מה צריך ללמד בסמל השאלון שלו.
              </p>
              <Link href="/map" className="btn btn-gold btn-gate">
                למפת הבגרויות
                <ArrowLeft className="h-4 w-4 fix-gate-arrow" strokeWidth={1.75} aria-hidden />
              </Link>
            </div>
          </div>
        </Reveal>

        {/* ================= ABOUT ================= */}
        <Reveal>
          <h2 className="sec-h" style={{ marginBottom: 36 }}>
            מי אנחנו?
          </h2>
          <AboutWriting />
        </Reveal>

        {/* ================= SECURITY ================= */}
        <Reveal>
          <div className={`sea-panel ${s.secure}`}>
            <span className="gold-ring" aria-hidden="true" />
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-white/15">
              <FingerprintMark className={`h-10 w-10 ${s.shieldIcon}`} />
            </span>
            <div className="flex-1 relative">
              <h3>כל קובץ מוטבע בפרטי המורה</h3>
              <p>
                <WatermarkText />
              </p>
            </div>
            <Link href="/terms" className="btn btn-gold btn-gate text-sm py-2 relative">
              לתנאי השימוש
              <ArrowLeft className="h-4 w-4 fix-gate-arrow" strokeWidth={1.75} aria-hidden />
            </Link>
          </div>
        </Reveal>

        {/* ================= FAQ ================= */}
        <Reveal>
          <FaqSection />
        </Reveal>

        {/* ================= LOGO OUTRO ================= */}
        <Reveal>
          <div className={s.logoOutro}>
            <GoatCalendarArt />
          </div>
        </Reveal>
      </div>
    </>
  );

  // עם הודעה פעילה – העוטף מקרין אותה מעל הדף אחרי שהכיתוב הזהב של הדף נגמר (או שנייה אחרי שמתחילים לגלול)
  return popup ? (
    <HomePopup data={popup}>{body}</HomePopup>
  ) : (
    <div className="overflow-x-clip">{body}</div>
  );
}

/** כל הבתים בשתי שורות — העליונה קצרה בבית אחד, כך שהן מוסטות זו מול זו כמו בעיצוב */
function HouseCluster({ subjects }: { subjects: Category[] }) {
  const items: { key: string; c: Category; title: string }[] = subjects.map((c) => ({
    key: String(c.id),
    c,
    title: c.title,
  }));
  const half = Math.floor(items.length / 2);
  return (
    <div className={s.snowHouses}>
      <img
        src="/images/snow-mountain.webp"
        alt=""
        aria-hidden
        className={s.snowMountain}
        width={700}
        height={402}
      />
      {[items.slice(0, half), items.slice(half)].map((row, i) => (
        <AnimatedGrid key={i} className={s.snowRow}>
          {row.map(({ key, c, title }) => (
            <Link
              key={key}
              href={`/subjects/${encodeURIComponent(c.slug)}`}
              className={s.snowHouse}
              aria-label={`פתיחת ${title}`}
            >
              {SUBJECT_HOUSES[c.slug] ? (
                <img
                  className={s.snowHouseImg}
                  src={SUBJECT_HOUSES[c.slug]}
                  alt=""
                  width={356}
                  height={266}
                />
              ) : (
                <Image className={s.snowNut} src={nutForLevel(c.slug, 0)} alt="" aria-hidden />
              )}
              <span className={s.houseLabel}>{title}</span>
            </Link>
          ))}
        </AnimatedGrid>
      ))}
    </div>
  );
}

function EmptySubjects() {
  return (
    <div className="card mt-2 mb-24 p-10 text-center">
      <div className="text-5xl animate-float">📂</div>
      <h3 className="font-display mt-3 text-2xl text-sea2">המדפים עוד מתמלאים</h3>
      <p className="mt-1 text-muted">
        המקצועות יופיעו כאן בקרוב. בינתיים אפשר להכיר את{" "}
        <Link href="/pricing" className="text-sea2 underline">
          המסלולים והמחירים
        </Link>
        .
      </p>
    </div>
  );
}
