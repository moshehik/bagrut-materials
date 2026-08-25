import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { getRootSubjects, getHomeStats } from "@/lib/data";
import { getPlanPrices } from "@/lib/pricing";
import { PLANS, SUBJECT_HOUSES, SUBJECT_HOUSE_COLORS, formatPrice } from "@/lib/constants";
import type { Category } from "@/db/schema";
import type { CSSProperties } from "react";
import Image from "next/image";
import { AnimatedGrid, Reveal } from "@/components/animated-grid";
import { HeroTitle } from "@/components/hero-title";
import { TypewriterLead } from "@/components/typewriter-lead";
import { GoatCalendarArt } from "@/components/goat-calendar-art";
import { IconStudentPage, IconTeacherPage, IconPresentation, IconPastExams } from "@/components/kind-icons";
import { SubjectIcon } from "@/components/subject-icons";
import s from "./home.module.css";

export const dynamic = "force-dynamic";

async function safeRootSubjects(): Promise<Category[]> {
  try {
    return await getRootSubjects();
  } catch {
    return [];
  }
}
async function safeStats() {
  try {
    return await getHomeStats();
  } catch {
    return { subjects: 0, folders: 0, files: 0, downloads: 0 };
  }
}
async function safePrices() {
  try {
    return await getPlanPrices();
  } catch {
    return null;
  }
}

const num = (n: number) => n.toLocaleString("he-IL");

export default async function HomePage() {
  const [subjects, stats, prices] = await Promise.all([safeRootSubjects(), safeStats(), safePrices()]);
  const customPrice = prices?.plans.custom_monthly ?? PLANS.custom_monthly.price ?? 0;

  return (
    <div className="overflow-x-clip">
      {/* ================= HERO ================= */}
      <div className={s.hero}>
        <div className={s.heroBg} aria-hidden>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/goat-run.png" alt="" className={s.heroGoat} width={428} height={443} />
        </div>
        <div className={s.wrap}>
          <div className={s.heroGrid}>
            <div className={s.heroIn}>
              <HeroTitle />
              <TypewriterLead
                className={s.lead}
                text="לראשונה! אתר חדשני ומקצועי שמאגד את כל חומרי הבגרות ללמידה בכיתה, שכפול למורה ולתלמידה, חומר העשרה מגוון ומרתק, בוחן מסכם עם תשובון למורה ודף עם מיומנויות למידה המותאמות ליחידת החומר! תוספים מרעננים ומרגשים למנויות פרימיום. כן. הגיע הזמן להוציא את העז מהלו״ז, שתוכלי להתמקד בלוז העניין ולתת מעבר."
              />
              <div className={s.acts}>
                <Link href="/subjects" className="btn btn-primary text-base">
                  למאגר המקצועות
                </Link>
                <Link href="/pricing" className="btn btn-ghost text-base">
                  מסלולים ומחירים
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={s.wrap}>
        {/* ================= STATS ================= */}
        <div className={s.stats}>
          <div className={s.stat}>
            <b>{num(stats.subjects)}</b>
            <span>מקצועות</span>
          </div>
          <div className={s.stat}>
            <b>{num(stats.folders)}</b>
            <span>יחידות, נושאים ופרקים</span>
          </div>
          <div className={s.stat}>
            <b>{num(stats.files)}</b>
            <span>קבצי שיעור מוכנים</span>
          </div>
          {stats.downloads > 0 ? (
            <div className={s.stat}>
              <b>{num(stats.downloads)}</b>
              <span>הורדות של מורות</span>
            </div>
          ) : (
            <div className={s.stat}>
              <b>{formatPrice(prices?.defaultSingle ?? 1500)}</b>
              <span>החל מ־ להורדת פרק בודד</span>
            </div>
          )}
        </div>

        {/* ================= SUBJECTS ================= */}
        <Reveal>
          <h2 className="sec-h" id="subjects-h">
            המקצועות
          </h2>
          <p className="sec-sub" style={{ marginBottom: 46 }}>
            בחרי לך בית, היכנסי — ומהמקצוע יורדים ליחידות, לפנימי/חיצוני, לנושא ועד לפרק שאת
            מלמדת מחר.
          </p>
        </Reveal>
        {subjects.length === 0 ? (
          <EmptySubjects />
        ) : (
          <AnimatedGrid className={s.subjects}>
            {subjects.map((c) => (
              <Link
                key={c.id}
                href={`/subjects/${encodeURIComponent(c.slug)}`}
                className={s.subj}
                aria-label={`פתיחת ${c.title}`}
              >
                <div
                  className={s.arch}
                  style={
                    SUBJECT_HOUSE_COLORS[c.slug]
                      ? ({ "--accent": SUBJECT_HOUSE_COLORS[c.slug] } as CSSProperties)
                      : undefined
                  }
                >
                  {SUBJECT_HOUSES[c.slug] ? (
                    <div className={s.houseWrap}>
                      <img
                        className={s.house}
                        src={SUBJECT_HOUSES[c.slug]}
                        alt={c.title}
                        width={356}
                        height={266}
                      />
                    </div>
                  ) : (
                    <SubjectIcon slug={c.slug} className={s.folderIcon} />
                  )}
                </div>
                {!SUBJECT_HOUSES[c.slug] && <h3>{c.title}</h3>}
                {c.questionnaireCode && <span className={s.code}>שאלון {c.questionnaireCode}</span>}
                <em>לחומרים ←</em>
              </Link>
            ))}
          </AnimatedGrid>
        )}

        {/* ================= PACK ================= */}
        <Reveal>
          <div className={s.packWrap}>
            <div className={s.pack}>
              <div className={s.packBody}>
                <h3>{PLANS.custom_monthly.label}</h3>
                <ul>
                  <li>עד 3 מקצועות לפי המערכת</li>
                  <li>עד {PLANS.custom_monthly.downloadsLimit} הורדות בחודש</li>
                  <li>רק הפרקים שאת מלמדת</li>
                  <li>פורום מורות לשאלות</li>
                </ul>
                <div className={s.price}>
                  {formatPrice(customPrice)} <small>· לחודש</small>
                </div>
                <Link href="/pricing" className="btn btn-gold">
                  לכל המסלולים
                </Link>
              </div>
            </div>
          </div>
        </Reveal>

        {/* ================= KINDS ================= */}
        <Reveal>
          <div className={s.kindsHeadWrap}>
            <img src="/images/markers-arc.png" alt="" className={s.kindsHeadImg} />
            <h2 className={`sec-h ${s.kindsHeadTitle}`}>מה בכל ערכת שיעור</h2>
          </div>
          <div className={s.kindsNote}>
            <img src="/images/pen-note.png" alt="" className={s.kindsNoteImg} />
            <p className={s.kindsNoteText}>כל מה שצריך כדי להרים בכיתה שיעור מעולה, במינימום מאמץ.</p>
          </div>
        </Reveal>
        <AnimatedGrid className={s.kinds}>
          <div className={s.kind}>
            <img src="/images/kind-blob-1.png" alt="" className={s.kindBlob} />
            <IconStudentPage className={s.kindIcon} />
            <b>דף לתלמידה</b>
            <span>משפטים להשלמה תוך כדי השיעור — הכיתה נשארת ערנית</span>
          </div>
          <div className={s.kind}>
            <img src="/images/kind-blob-2.png" alt="" className={s.kindBlob} />
            <IconTeacherPage className={s.kindIcon} />
            <b>דף למורה</b>
            <span>אותו דף עם התשובות, סיפורים, שאלות לחידוד וחידות</span>
          </div>
          <div className={s.kind}>
            <img src="/images/kind-blob-3.png" alt="" className={s.kindBlob} />
            <IconPresentation className={s.kindIcon} />
            <b>מצגת מלווה</b>
            <span>לפי מהלך השיעור, למקרן או ללוח חכם</span>
          </div>
          <div className={s.kind}>
            <img src="/images/kind-blob-4.png" alt="" className={s.kindBlob} />
            <IconPastExams className={s.kindIcon} />
            <b>בגרויות קודמות</b>
            <span>שאלות לפי פרק עם פתרונות — לפרימיום</span>
          </div>
        </AnimatedGrid>

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
                <span className={s.av}>ש</span>שרה, מורה להיסטוריה
              </div>
            </div>
          </div>
        </AnimatedGrid>

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
            <p>תורה, נביא, כתובים, לשון, ספרות, אנגלית, יהדות, מתמטיקה, דינים, היסטוריה ועוד.</p>
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
            </div>
          </div>
        </Reveal>

        {/* ================= SECURITY ================= */}
        <Reveal>
          <div className={`sea-panel ${s.secure}`}>
            <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-white/15">
              <ShieldCheck className={`h-9 w-9 ${s.shieldIcon}`} aria-hidden />
            </span>
            <div className="flex-1 relative">
              <h3>כל קובץ מוטבע במספר האישי שלך</h3>
              <p>
                בכל הורדה מוטבעים בקובץ המספר האישי של המורידה והודעת זכויות יוצרים. כך אנחנו
                שומרות על היוצרות — ועל המחירים הנמוכים.
              </p>
            </div>
            <Link href="/terms" className="btn btn-gold relative">
              לתנאי השימוש
            </Link>
          </div>
        </Reveal>

        {/* ================= LOGO OUTRO ================= */}
        <Reveal>
          <div className={s.logoOutro}>
            <GoatCalendarArt />
          </div>
        </Reveal>
      </div>
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
