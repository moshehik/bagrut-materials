import Link from "next/link";
import { ArrowLeft, BookOpen, Tags } from "lucide-react";
import { FingerprintMark, WatermarkText } from "@/components/watermark-notice";
import { getRootSubjects, getHomeStats } from "@/lib/data";
import { getCurrentUser } from "@/lib/session";
import { SUBJECT_HOUSES, SUBJECT_HOUSE_COLORS } from "@/lib/constants";
import type { Category } from "@/db/schema";
import type { CSSProperties } from "react";
import Image from "next/image";
import { AnimatedGrid, Reveal } from "@/components/animated-grid";
import { HeroTitle } from "@/components/hero-title";
import { TypewriterLead } from "@/components/typewriter-lead";
import { GoatCalendarArt } from "@/components/goat-calendar-art";
import { IconMaterials, IconSubjects, IconDownloads, IconVisits } from "@/components/kind-icons";
import { CountUp } from "@/components/count-up";
import { nutForLevel } from "@/lib/nut-images";
import { CARD_ROWS, CARD_STYLES, type CardType } from "@/lib/material-card-types";
import { FaqSection } from "@/components/faq-section";
import { HomePopup, type HomePopupData } from "@/components/home-popup";
import { getSettings } from "@/lib/settings";
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
    return { subjects: 0, folders: 0, files: 0, downloads: 0, visits: 0 };
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

  const body = (
    <>
      {/* ================= HERO ================= */}
      <div className={s.hero}>
        <div className={s.heroBg} aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <span className={s.heroPen}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/hero-pen.png" alt="" className={s.heroPenImg} width={260} height={352} />
          </span>
          <span className={s.heroGoatRun}>
            <img src="/images/goat-run.png" alt="" className={s.heroGoat} width={428} height={443} />
          </span>
        </div>
        <div className={s.wrap}>
          <div className={s.heroGrid}>
            <div className={s.heroIn}>
              <HeroTitle />
              <TypewriterLead
                className={s.lead}
                text={'בלו"ז העניין תקבלי את המעטפת המושלמת לשיעור מעולה, כזה שמכין את התלמידות שלך למבחני הבגרות בצורה יסודית, מעשירה וחוויתית בלחיצת כפתור! בואי להיות חלק ממשהו גדול, להוציא את העז מהלו"ז, ולתת לתלמידות שלך מעבר.'}
              />
              <div className={s.acts}>
                <Link href="/subjects" className="btn btn-gold btn-gate">
                  <BookOpen className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                  למאגר המקצועות
                  <ArrowLeft className="h-4 w-4 fix-gate-arrow" strokeWidth={1.75} aria-hidden />
                </Link>
                <Link href="/pricing" className="btn btn-ghost btn-plans text-base">
                  <Tags className="h-5 w-5 plans-icon" strokeWidth={1.75} aria-hidden />
                  מסלולים ומחירים
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={s.wrap}>
        {/* ================= KINDS — הנתונים המשתנים של האתר (קופצים מ-0 בכל כניסה, לפי העדכון האחרון) ================= */}
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
            <span>מקצועות</span>
          </div>
          <div className={s.kind}>
            <img src="/images/kind-blob-3.png" alt="" className={s.kindBlob} />
            <IconDownloads className={s.kindIcon} />
            <b><CountUp value={stats.downloads} /></b>
            <span>הורדות</span>
          </div>
          <div className={s.kind}>
            <img src="/images/kind-blob-4.png" alt="" className={s.kindBlob} />
            <IconVisits className={s.kindIcon} />
            <b><CountUp value={stats.visits} /></b>
            <span>כניסות לאתר</span>
          </div>
        </AnimatedGrid>

        {/* ================= LESSON CONTENTS (לו"ז השיעור) ================= */}
        <Reveal>
          <h2 className="sec-h" style={{ marginBottom: 40 }}>
            מה לו״ז השיעור שלנו?
          </h2>
        </Reveal>
        <AnimatedGrid className={s.lessonItems}>
          {LESSON_ITEMS.map((t, i) => {
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
        <div className={s.lessonNuts} aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/nuts/many-05.webp" alt="" width={282} height={141} />
        </div>

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

        {/* ================= QUOTES ================= */}
        <Reveal>
          <h2 className="sec-h">מה מורות אומרות</h2>
          <p className="sec-sub" style={{ marginBottom: 46 }}>
            כשהחומר מסודר — נשאר מקום לכל מה שבין השורות.
          </p>
        </Reveal>
        <AnimatedGrid className={s.quotes}>
          <div className={s.q}>
            <img src="/images/memo/memo-cream.png" alt="" className={s.memoImg} />
            <div className={s.qBody}>
              <p>
                במקום לבנות כל ערב דף עבודה מאפס, אני פותחת את הפרק ומדפיסה. את הזמן שהתפנה אני
                משקיעה בבנות שצריכות אותי יותר.
              </p>
              <div className={s.who}>
                <span className={s.av}>ר</span>רבקה, מורה ללשון
              </div>
            </div>
          </div>
          <div className={s.q}>
            <img src="/images/memo/memo-blue.png" alt="" className={s.memoImg} />
            <div className={s.qBody}>
              <p>
                המצגת מסודרת בדיוק לפי מהלך השיעור, אז אני לא &quot;מלמדת מהדף&quot; — אני מלמדת את הכיתה.
                זה ההבדל.
              </p>
              <div className={s.who}>
                <span className={s.av}>מ</span>מלכה, מורה לנביא
              </div>
            </div>
          </div>
          <div className={s.q}>
            <img src="/images/memo/memo-pink.png" alt="" className={s.memoImg} />
            <div className={s.qBody}>
              <p>
                שאלות הבגרויות הקודמות לפי פרק חסכו לי שעות של חיפוש. סוף סוף יש לי זמן גם
                לסיפור, גם לחידה — וגם לבגרות.
              </p>
              <div className={s.who}>
                <span className={s.av}>ש</span>שרה, מורה לתהילים
              </div>
            </div>
          </div>
        </AnimatedGrid>

        {/* ================= ABOUT ================= */}
        <Reveal>
          <h2 className="sec-h" style={{ marginBottom: 36 }}>
            מי אנחנו?
          </h2>
          <div className={s.aboutLetter}>
            <img src="/images/about-letter.png" alt="" className={s.aboutLetterImg} aria-hidden />
            <div className={s.aboutText}>
              <p>הכל התחיל כשהבנו שהגיע הזמן.</p>
              <p>
                אולי זאת הייתה שוועת ממלאות המקום היומיות-
                <br />
                שבהתראות קצרות נדרשו למלא לו״ז?
              </p>
              <p>
                או שאולי דווקא התקופתיות-
                <br />
                כל שלושה חודשים יצאו למסע יש מאין של איסוף, איתור ואילתור?
              </p>
              <p>
                ייתכן וזה היה קולו הדחוק של החלום ההוא, להוסיף שעות,
                <br />
                חלום שנגדע עקב אימת הכנת השיעורים מחדש.
              </p>
              <p>
                או אולי משרות נחשקות שאוישו בלעדינו,
                <br />
                רק כי פחדנו להירטב שוב מהמים הקרים.
              </p>
              <p>
                זה לא סוד.
                <br />
                להכין שיעור טוב- זה אתגר.
                <br />
                להפוך אותו למיוחד ואטרקטיבי - זה בונוס לפריווילגיות.
              </p>
              <p>
                והגיע לנו, בדור שזקוק אפילו ליותר מזה, לקבל במתנה את-
                <br />
                <b className={s.aboutBrand}>לו״ז העניין.</b>
                <br />
                <b className={s.aboutBrand}>הבית של הבגרויות.</b>
              </p>
              <p>
                אנחנו כאן, אחיות להוראה,
                <br />
                ממנעד סמינרים רחב ומגוון.
                <br />
                רוצות להעניק לך את השלווה של הפת בסלה.
              </p>
              <p className={s.aboutClose}>
                בואי הצטרפי אלינו,
                <br />
                ובשטח הלו״ז הפנוי,
                <br />
                מלאי אותו באין סוף דברים טובים,
                <br />
                כאלה, שרק מורה יכולה לתת.
              </p>
              <p className={s.aboutSign}>
                בהערכה,
                <br />
                <span className={s.aboutHeart} aria-hidden="true">
                  ♥
                </span>
                <br />
                <b className={s.aboutBrand}>צוות לו״ז העניין</b>
                <br />
                בהנהלת חיה שיינווטר
              </p>
              <img src="/images/logo.png" alt="לו״ז העניין — בית לחומרי הבגרות" className={s.aboutLogo} />
            </div>
          </div>
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

  // עם הודעה פעילה – העוטף מקרין אותה מעל הדף, ומפעיל את אנימציות הדף מחדש כשהיא נעלמת
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
