import { notFound } from "next/navigation";
import { ColourSvgDefs, CARD_NUT_SRCS } from "@/components/colour-svg";
import { PartyPopper } from "lucide-react";
import { SichaIntro } from "@/components/sichot/sicha-intro";
import { SichaUploadForm } from "@/components/sichot/sicha-upload-form";
import { SichaCard, SichaListCard, type SichaCardData } from "@/components/sichot/sicha-card";
import { SichotVideosView } from "@/components/sichot/sichot-videos";
import { SichaVideoCard } from "@/components/sichot/sicha-video-card";

export const dynamic = "force-dynamic";

/**
 * עמוד דוגמה למאגר השיחות עם נתוני דמה – זמין רק בפיתוח מקומי, לא באתר החי (כמו card-preview).
 * אותם רכיבים כמו ב-SichotModule האמיתי; כפתורי הדירוג/שימוש/רעיון/העלאה פונים לשרת ולכן יציגו
 * "יש להתחבר" כשאין משתמשת מחוברת.
 */
export default function SichotPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const folder = "חגים";
  const path = "/sichot-preview";

  const sicha: SichaCardData = {
    id: 1,
    title: "סוכות – שמחה בלי סיבה?",
    description:
      "שיעור מוכן של 45 דקות: פתיחה, סיפור, דיון בקבוצות וסיכום על הכתב. מתאים לכיתות ט׳–י״א.",
    seminarType: "mainstream",
    fileName: "סוכות - שמחה בלי סיבה.docx",
    extraFiles: [
      { id: 1, fileName: "מצגת לשיעור.pptx" },
      { id: 2, fileName: "דף עבודה.docx" },
    ],
    teacherName: "שרה ל.",
    usageCount: 3,
    usedByMe: false,
    ideas: [{ id: 1, body: "אפשר לסיים בשיר משותף על ענני הכבוד.", teacherName: "מרים ב." }],
    ideaContributorCount: 1,
    videos: [
      { id: 1, title: "סוכות – סרטון קצר להעשרה", href: "#video-1" },
      { id: 2, title: "ענני הכבוד – אנימציה", href: "#video-2" },
    ],
  };

  const other: SichaCardData = {
    id: 2,
    title: "חנוכה – מה מאיר בתוך החושך",
    description: "שיחה על כוחה של נקודת אור קטנה, עם שני סיפורים ופעילות לסיום.",
    seminarType: "kiruv",
    fileName: "חנוכה.docx",
    teacherName: "לאה ג.",
    usageCount: 1,
    usedByMe: false,
    ideas: [],
    ideaContributorCount: 0,
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 space-y-14">
      <ColourSvgDefs srcs={CARD_NUT_SRCS} />
      <div>
        <h1 className="font-display text-3xl font-black">דוגמת מאגר שיחות – {folder}</h1>
        <p className="mt-2 text-muted">נתוני דמה בלבד. עמוד זה לא קיים באתר החי.</p>
      </div>

      <section className="space-y-6">
        <h2 className="text-xl font-bold">1. המורה שהעלתה: אחרי ההעלאה</h2>
        <SichaIntro folderTitle={folder} />
        <div className="flex items-start gap-2 rounded-xl bg-green-50 text-green-800 px-4 py-3 text-sm animate-pop">
          <PartyPopper className="h-4 w-4 mt-0.5 shrink-0" />
          <span>השיחה עלתה בהצלחה!</span>
        </div>
        <SichaUploadForm categoryId={1} path={path} />
        <div className="max-w-lg">
          <SichaCard sicha={sicha} path={path} />
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-xl font-bold">2. מורה אחרת בתיקייה: כך נראית הרשימה</h2>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          <SichaListCard sicha={sicha} href="#lesson" />
          <SichaListCard sicha={other} href="#lesson" />
        </div>
        <div id="lesson" className="max-w-lg">
          <SichaCard sicha={sicha} path={path} />
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-xl font-bold">4. חלק הסרטונים לשיעורים</h2>
        <SichotVideosView
          categoryId={1}
          path={path}
          canShare
          cards={[
            {
              id: 1,
              title: "סוכות – סרטון קצר להעשרה",
              description: "סרטון של כמה דקות שמעשיר את השיעור על סוכות. מתאים לכיתות ט׳–י״א.",
              driveId: "1AbCdEfGhIjKlMnOpQrStUv",
              linkKind: "file",
              teacherName: "שרה ל.",
              canDelete: false,
              ideas: [{ id: 1, body: "מתאים לפתיחת השיעור, לפני הדיון בקבוצות.", teacherName: "מרים ב." }],
              usageCount: 3,
              lessons: [
                { id: 1, title: "סוכות – שמחה בלי סיבה?", href: "#" },
                { id: 2, title: "חנוכה – מה מאיר בתוך החושך", href: "#" },
              ],
            },
            {
              id: 2,
              title: "חנוכה – סרטון פתיחה",
              description: "שלושה סרטונים קצרים לפתיחת השיעור.",
              driveId: "1ZyXwVuTsRqPoNmLkJiHgFe",
              linkKind: "file",
              teacherName: "מורה מהצפון",
              canDelete: false,
            },
          ]}
        />
      </section>

      <section className="space-y-6" id="video-inside">
        <h2 className="text-xl font-bold">5. כרטיס הסרטון מבפנים (דף הסרטון)</h2>
        <div className="max-w-lg">
          <SichaVideoCard
            path={path}
            video={{
              id: 1,
              title: "סוכות – סרטון קצר להעשרה",
              description: "סרטון של כמה דקות שמעשיר את השיעור על סוכות. מתאים לכיתות ט׳–י״א.",
              driveId: "1AbCdEfGhIjKlMnOpQrStUv",
              linkKind: "file",
              teacherName: "שרה ל.",
              canDelete: false,
              usageCount: 3,
              lessons: [
                { id: 1, title: "סוכות – שמחה בלי סיבה?", href: "#" },
                { id: 2, title: "חנוכה – מה מאיר בתוך החושך", href: "#" },
              ],
              ideas: [{ id: 1, body: "מתאים לפתיחת השיעור, לפני הדיון בקבוצות.", teacherName: "מרים ב." }],
            }}
          />
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-xl font-bold">3. מי שלא מחוברת</h2>
        <div className="card p-5 text-sm text-muted">יש להתחבר כדי להעלות שיחה, להוריד ולהוסיף רעיונות.</div>
        <div className="max-w-lg">
          <SichaCard sicha={sicha} path={path} />
        </div>
      </section>
    </div>
  );
}
