import Image from "next/image";
import { Eye, Fingerprint, PauseCircle } from "lucide-react";
import type { Material } from "@/db/schema";
import type { Entitlement } from "@/lib/data";
import { CARD_STYLES, LABEL_SIZES, type CardType } from "@/lib/material-card-types";
import { FileViewerButton } from "@/components/pdf-viewer";
import { FIX_TIPS, FixRequestButton, FixViewer, type CardFix } from "@/components/material-fixes";
import { FreeTrialDownload } from "@/components/free-trial-download";
import type { FreeTrialState } from "@/lib/free-trial";

type Props = {
  material: Material;
  entitlement: Entitlement;
  type: CardType;
  /** שם הפרק / היחידה (שם התיקייה) – מופיע בכותרת אחרי המקף, בגופן גברת לוין */
  folderTitle: string;
  currentPath: string;
  /** רכישת כל התיקייה (15 ש"ח) – לשם מובילה ההורדה למי שעוד לא רכשה */
  bundleHref: string;
  myDownloadCount?: number;
  /** תיקונים מפורסמים לקובץ (ר' src/lib/fixes.ts) – מציגים אגוזי "קובץ מתוקן" ו"בחירת שינויים" */
  fixes?: CardFix[];
  /** רק לדוגמאות פיתוח (card-preview): PDF קבוע בחלון הצפייה בשינויים */
  fixesViewSrc?: string;
  /** רק לדוגמאות פיתוח: PDF נקי (בלי סימונים) בחלון העריכה */
  plainViewSrc?: string;
  /** מנויה במסלול "ממלאת מקום יומית" (סל צפיות/הורדות) – רק לה מוצג הטולטיפ על ספירת הצפיות. המסלול עוד לא נבנה, לכן ברירת המחדל false */
  isDailySubstitute?: boolean;
  /** מצב ההורדה החינמית האחת של המשתמשת (ר' src/lib/free-trial.ts) – כשזמינה, על קובץ בתשלום מוצג "הורדה אחת חינם" */
  freeTrial?: FreeTrialState;
};

const DAILY_SUBSTITUTE_VIEW_TIP =
  "אם תורידי את החומר – הצפייה לא תחושב בסל ההורדות. אם צפית ולא הורדת – הצפייה תחושב בסל ההורדות.";

/** לאן מובילה לחיצה על האגוז האדום – הורדה למי שמורשית, אחרת הצעד החסר (התחברות / רכישת התיקייה) */
function downloadTarget(m: Material, ent: Entitlement, currentPath: string, bundleHref: string): string | null {
  if (ent.ok) return m.allowDownload || ent.via === "admin" ? `/api/download/${m.id}` : null;
  switch (ent.reason) {
    case "login":
      return `/login?next=${encodeURIComponent(currentPath)}`;
    case "premium":
    case "purchase":
      return bundleHref;
    case "quota":
      return "/pricing";
    default:
      return null; // suspended
  }
}

/** הכרטיסייה מבפנים: כותרת כהה עם דמות ושם הסוג (בכתב מהעיצוב) + שם הפרק, וגוף צבעוני עם הורדה באגוז */
export function MaterialTypeCard({
  material: m,
  entitlement,
  type,
  folderTitle,
  currentPath,
  bundleHref,
  myDownloadCount = 0,
  fixes = [],
  fixesViewSrc,
  plainViewSrc,
  isDailySubstitute = false,
  freeTrial = "off",
}: Props) {
  const s = CARD_STYLES[type];
  const target = downloadTarget(m, entitlement, currentPath, bundleHref);
  const viewOnly = entitlement.ok && !m.allowDownload && entitlement.via !== "admin";
  const size = LABEL_SIZES[type];
  // אגוזי התיקונים רק למי שמורשית להוריד, ורק בקובץ Word (שם התיקונים מוחלים)
  const canFix = entitlement.ok && !viewOnly && !!target && /\.docx$/i.test(m.fileName) && fixes.length > 0;
  // בלי גישה לקובץ: "שינויים בקובץ" מוביל לאותו צעד חסר כמו ההורדה (התחברות / רכישה)
  const lockedHref = entitlement.ok ? null : target;
  // צפייה בקובץ באתר – רק למי שמורשית לקובץ (שילמה / מנוי / חינם למחוברת / מנהלת)
  const canView = entitlement.ok && !viewOnly;
  // אורחת על קובץ חינמי: הכפתור אומר במפורש שהוא חינם (ההרשמה פותחת אותו), כדי שתראה איפה השיעור הפתוח
  const guestFree = !entitlement.ok && entitlement.reason === "login" && m.access === "free";
  // מחוברת שעוד לא רכשה את הקובץ ועדיין יש לה הורדה חינמית אחת (או שחסר לה רק אימות מייל)
  const trialOffer =
    !entitlement.ok &&
    entitlement.reason === "purchase" &&
    m.allowDownload &&
    (freeTrial === "available" || freeTrial === "unverified")
      ? freeTrial
      : null;

  return (
    <article
      id={`material-${m.id}`}
      className="mtc relative scroll-mt-24"
      style={{ "--mtc-body": s.body, "--mtc-strip": s.strip } as React.CSSProperties}
    >
      {guestFree && <span className="mtc-free">חינם בהרשמה</span>}
      <header className="mtc-head">
        <Image
          src={`/images/mat-cards/art4/${s.art}.webp`}
          alt=""
          width={120}
          height={120}
          className={`mtc-art ${s.artWide ? "mtc-art-wide" : ""}`}
          aria-hidden
        />
        <h3 className="mtc-title" aria-label={`${s.label} - ${folderTitle}`}>
          {/* שם הסוג: הכתב המדויק מהעיצוב, כתמונה שקופה */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/images/mat-cards/label-${type}.webp`}
            alt=""
            width={size[0]}
            height={size[1]}
            className="mtc-label"
            style={{ "--w": size[0] } as React.CSSProperties}
            aria-hidden
          />
          <span className="mtc-chapter" aria-hidden>
            - {folderTitle}
          </span>
        </h3>
      </header>

      <div className="mtc-body">
        <div className={`mtc-print ${s.lightPrint ? "mtc-print-light" : ""}`}>
          <Fingerprint className="mtc-print-icon" strokeWidth={1.4} aria-hidden />
          <span>הדף שלך נשאר שלך</span>
        </div>

        {viewOnly ? (
          <FileViewerButton src={`/api/preview/${m.id}`} title={`${s.label} - ${folderTitle}`} className="mtc-download">
            <Eye className="mtc-nut" aria-hidden />
            <span>לצפייה</span>
          </FileViewerButton>
        ) : trialOffer ? (
          <FreeTrialDownload
            materialId={m.id}
            title={`${s.label} - ${folderTitle}`}
            state={trialOffer}
            className="mtc-download"
          >
            <Image src="/images/mat-cards/nut-download.webp" alt="" width={84} height={67} className="mtc-nut" aria-hidden />
            <span>להורדה חינם</span>
          </FreeTrialDownload>
        ) : target ? (
          <a
            href={target}
            className="mtc-download"
            title={
              entitlement.ok
                ? "הדף שלך נשאר שלך"
                : guestFree
                  ? "הקובץ חינם לכל מורה שנרשמה – ההרשמה חינמית"
                  : "כדי להוריד צריך קודם להשלים את השלב הבא"
            }
            aria-label={`הורדת ${s.label}${guestFree ? " – חינם בהרשמה" : ""}`}
          >
            <Image src="/images/mat-cards/nut-download.webp" alt="" width={84} height={67} className="mtc-nut" aria-hidden />
            <span>להורדה</span>
          </a>
        ) : (
          <span className="mtc-download mtc-disabled">
            <PauseCircle className="mtc-nut" aria-hidden />
            <span>מושהה</span>
          </span>
        )}

        {/* מי שלא שילמה: האגוז מוביל לאותו צעד חסר כמו ההורדה (התחברות / רכישה); הצפייה עצמה נאכפת בשרת */}
        {canView ? (
          <FileViewerButton
            src={`/api/preview/${m.id}`}
            title={`${s.label} - ${folderTitle}`}
            className="mtc-download"
            tip={isDailySubstitute ? DAILY_SUBSTITUTE_VIEW_TIP : undefined}
            label={`צפייה ב${s.label} באתר`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/nuts/one-10.webp" alt="" width={40} height={40} className="mtc-nut" aria-hidden />
            <span>לצפייה</span>
          </FileViewerButton>
        ) : (
          !viewOnly &&
          target && (
            <a
              href={target}
              className="mtc-download"
              data-tip="לצפייה בקובץ צריך קודם להשלים את השלב הבא"
              aria-label={`צפייה ב${s.label} באתר`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/nuts/one-10.webp" alt="" width={40} height={40} className="mtc-nut" aria-hidden />
              <span>לצפייה</span>
            </a>
          )
        )}
      </div>

      {/* הריבוע התחתון: עריכת שינויים תמיד; ואם כבר נעשו תיקונים – גם צפייה בהם והורדת הקובץ המתוקן */}
      <div className="mtc-lower">
        <div className="mtc-tools">
          <FixRequestButton
            materialId={m.id}
            materialTitle={`${s.label} - ${folderTitle}`}
            lockedHref={lockedHref}
            nutSrc="/images/nuts/one-02.webp"
            viewSrc={plainViewSrc}
          />
          {canFix && (
            <>
              <FixViewer materialId={m.id} fixes={fixes} downloadHref={target!} nutSrc="/images/nuts/one-06.webp" viewSrc={fixesViewSrc} />
              <a href={`${target}?fixes=all`} className="mtc-row" data-tip={FIX_TIPS.download}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/images/mat-cards/nut-download-light.webp" alt="" width={40} height={40} className="mtc-rownut" aria-hidden />
                <span>להורדת הקובץ המתוקן</span>
              </a>
            </>
          )}
        </div>
      </div>

      {(m.status !== "active" || myDownloadCount > 0 || (m.allowPreview && !entitlement.ok)) && (
        <div className="mtc-foot">
          {m.status !== "active" && (
            <span className="inline-flex items-center gap-1 text-red-700">
              <PauseCircle className="h-3.5 w-3.5" aria-hidden /> {m.status === "draft" ? "טיוטה – מוצג רק למנהלת" : "מושהה"}
            </span>
          )}
          {m.allowPreview && !entitlement.ok && (
            <FileViewerButton src={`/api/preview/${m.id}`} title={`${s.label} - ${folderTitle}`} className="underline">
              תצוגה מקדימה (עמוד ראשון)
            </FileViewerButton>
          )}
          {myDownloadCount > 0 && <span>הורדת קובץ זה {myDownloadCount.toLocaleString("he-IL")} פעמים</span>}
        </div>
      )}
    </article>
  );
}
