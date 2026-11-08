import { Eye, PauseCircle } from "lucide-react";
import { MailIcon, PrintIcon } from "@/components/card-icons";
import { EmailMaterialButton } from "@/components/email-material-button";
import type { Material } from "@/db/schema";
import type { Entitlement } from "@/lib/data";
import { CARD_STYLES, LABEL_SIZES, cardHeading, type CardType } from "@/lib/material-card-types";
import { FileViewerButton } from "@/components/pdf-viewer";
import { NetfreeDownloadGate, NetfreeHqRow } from "@/components/netfree-download-gate";
import { PresentationDownloadGate } from "@/components/presentation-download";
import { VideoViewerButton } from "@/components/sichot/sicha-video-viewer";
import { FIX_TIPS, FixRequestButton, type CardFix } from "@/components/material-fixes";
import { ColourSvg } from "@/components/colour-svg";
import { inlineUi } from "@/lib/inline-images";
import { LineIcon, hasLineIcon } from "@/components/line-icon";
import { PrivateVersionNote } from "@/components/material-private-version";
import type { CorrectionState } from "@/lib/private-version-logic";
import { FreeTrialDownload } from "@/components/free-trial-download";
import type { FreeTrialState } from "@/lib/free-trial";

type Props = {
  material: Material;
  entitlement: Entitlement;
  type: CardType;
  /** שם הפרק / היחידה (שם התיקייה) – מופיע בכותרת אחרי המקף, בגופן גברת לוין */
  folderTitle: string;
  /** שורה קטנה מתחת לכותרת – למשל טווח הפסוקים של מצגת ("פסוקים א-טו") כשיש כמה מצגות בפרק */
  subtitle?: string;
  currentPath: string;
  /** רכישת כל התיקייה (15 ש"ח) – לשם מובילה ההורדה למי שעוד לא רכשה */
  bundleHref: string;
  myDownloadCount?: number;
  /** תיקונים מפורסמים לקובץ (ר' src/lib/fixes.ts) – מציגים אגוזי "קובץ מתוקן" ו"בחירת שינויים" */
  fixes?: CardFix[];
  /** ההערה הכללית של המבקרת על הקובץ וגרסה פרטית מתוקנת שלה, אם יש (ר' src/lib/private-versions.ts) */
  correction?: CorrectionState;
  /** רק לדוגמאות פיתוח (card-preview): PDF קבוע בחלון הצפייה בשינויים */
  fixesViewSrc?: string;
  /** רק לדוגמאות פיתוח: PDF נקי (בלי סימונים) בחלון העריכה */
  plainViewSrc?: string;
  /** הדגמה לסיור באתר: חלון עריכת השינויים עובד על המסך בלבד ולא שולח לשרת */
  fixDemo?: boolean;
  /** מנויה במסלול "ממלאת מקום יומית" (סל צפיות/הורדות) – רק לה מוצג הטולטיפ על ספירת הצפיות. המסלול עוד לא נבנה, לכן ברירת המחדל false */
  isDailySubstitute?: boolean;
  /** מצב ההורדה החינמית האחת של המשתמשת (ר' src/lib/free-trial.ts) – כשזמינה, על קובץ בתשלום מוצג "הורדה אחת חינם" */
  freeTrial?: FreeTrialState;
};

const DAILY_SUBSTITUTE_VIEW_TIP =
  "אם תורידי את החומר – הצפייה לא תחושב בסל ההורדות. אם צפית ולא הורדת – הצפייה תחושב בסל ההורדות.";

const MAIL_TIP = "הקובץ ישלח אליך ישירות למייל.";

/** אגוז הלוז המקורי (one-01) עם אייקון מייל דק-קווים שחור, כאילו נחרט עליו */
export function MailNut() {
  return (
    <span className="mtc-nut mtc-mailnut" aria-hidden>
      <ColourSvg src="/images/nuts/one-01.webp" width={40} height={40} shared small />
      <MailIcon className="mtc-mailnut-icon" />
    </span>
  );
}

/** לאן מובילה לחיצה על האגוז האדום – הורדה למי שמורשית, אחרת הצעד החסר (התחברות / רכישת התיקייה) */
function downloadTarget(m: Material, ent: Entitlement, currentPath: string, bundleHref: string, isVideo: boolean): string | null {
  if (ent.ok) return m.allowDownload || ent.via === "admin" ? (isVideo ? `/api/material-video/${m.id}` : `/api/download/${m.id}`) : null;
  switch (ent.reason) {
    case "login":
      return `/login?next=${encodeURIComponent(currentPath)}`;
    case "purchase":
      return bundleHref;
    case "quota":
      return "/pricing";
    default:
      return null; // suspended
  }
}

/** כפתור הצפייה באתר: נגן וידאו לסרטון (מוזרם מ-/api/material-video), אחרת חלון ה-PDF */
function CardViewer({
  isVideo,
  materialId,
  title,
  className,
  tip,
  label,
  presentation = false,
  children,
}: {
  isVideo: boolean;
  materialId: number;
  title: string;
  className?: string;
  tip?: string;
  label?: string;
  presentation?: boolean;
  children: React.ReactNode;
}) {
  return isVideo ? (
    <VideoViewerButton src={`/api/material-video/${materialId}?inline=1`} title={title} className={className} tip="לצפייה בסרטון כאן באתר" label={label}>
      {children}
    </VideoViewerButton>
  ) : (
    <FileViewerButton src={`/api/preview/${materialId}`} title={title} className={className} tip={tip} label={label} presentation={presentation}>
      {children}
    </FileViewerButton>
  );
}

/** הכרטיסייה מבפנים: כותרת כהה עם דמות ושם הסוג (בכתב מהעיצוב) + שם הפרק, וגוף צבעוני עם הורדה באגוז */
export function MaterialTypeCard({
  material: m,
  entitlement,
  type,
  folderTitle,
  subtitle,
  currentPath,
  bundleHref,
  myDownloadCount = 0,
  fixes = [],
  correction,
  fixesViewSrc,
  plainViewSrc,
  fixDemo = false,
  isDailySubstitute = false,
  freeTrial = "off",
}: Props) {
  const s = CARD_STYLES[type];
  // סרטון: מוזרם ישר מדרייב (צפייה / הורדה / קישור למייל) דרך /api/material-video – בלי המרה וסימן מים
  const isVideo = type === "video";
  const target = downloadTarget(m, entitlement, currentPath, bundleHref, isVideo);
  const viewOnly = entitlement.ok && !m.allowDownload && entitlement.via !== "admin";
  const size = LABEL_SIZES[type];
  const base = cardHeading(type, m.title, folderTitle);
  // בלי הריבוע התחתון (סרטון / מצגת) גוף הכרטיס הוא סופו, אז פינותיו התחתונות מעוגלות
  const noFixBox = isVideo || type === "presentation";
  const heading = subtitle ? { ...base, full: `${base.full} (${subtitle})` } : base;
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
    !isVideo &&
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
      {m.access === "free" && <span className="mtc-free">{guestFree ? "חינם בהרשמה" : "חינם"}</span>}
      <header className="mtc-head">
        {hasLineIcon(s.art) || hasLineIcon(`card-${s.art}`) ? (
          // איור קו כ-SVG בתוך הדף (נטפרי חוסם תמונות)
          <LineIcon name={hasLineIcon(s.art) ? s.art : `card-${s.art}`} className="mtc-art" color="#fff" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={inlineUi(`/images/mat-cards/art4/${s.art}.${s.extra ? "svg" : "webp"}`)}
            alt=""
            width={120}
            height={120}
            className={`mtc-art ${s.artWide ? "mtc-art-wide" : ""}`}
            aria-hidden
          />
        )}
        <h3 className="mtc-title" aria-label={heading.full}>
          {size ? (
            <>
              {/* שם הסוג: הכתב המדויק מהעיצוב, כתמונה שקופה */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={inlineUi(`/images/mat-cards/label-${type}.webp`)}
                alt=""
                width={size[0]}
                height={size[1]}
                className="mtc-label"
                style={{ "--w": size[0] } as React.CSSProperties}
                aria-hidden
              />
              <span className="mtc-chapter" aria-hidden>
                - {heading.suffix}
              </span>
            </>
          ) : (
            // סוגים בלי תמונת כתב: השם בגופן גברת לוין, באותו לבן
            <>
              <span className={`mtc-label-text${heading.suffix === null ? " mtc-label-long" : ""}`} aria-hidden>
                {heading.label}
              </span>
              {heading.suffix !== null && (
                <span className="mtc-chapter" aria-hidden>
                  - {heading.suffix}
                </span>
              )}
            </>
          )}
          {subtitle && (
            <span className="mtc-subtitle" aria-hidden>
              {subtitle}
            </span>
          )}
        </h3>
      </header>

      <div className={`mtc-body${noFixBox ? " mtc-body-end" : ""}`}>
        <div
          className={`mtc-print ${s.lightPrint ? "mtc-print-light" : ""}`}
          data-tip="החומר שלך, נשאר שלך:)"
          aria-label="החומר שלך, נשאר שלך"
          tabIndex={0}
        >
          <PrintIcon className="mtc-print-icon" />
        </div>

        {viewOnly ? (
          <CardViewer isVideo={isVideo} materialId={m.id} title={heading.full} className="mtc-download" presentation={type === "presentation"}>
            <Eye className="mtc-nut" aria-hidden />
            <span>לצפייה</span>
          </CardViewer>
        ) : trialOffer ? (
          <FreeTrialDownload
            materialId={m.id}
            title={heading.full}
            state={trialOffer}
            className="mtc-download"
          >
            <ColourSvg src="/images/mat-cards/nut-download.webp" width={84} height={67} className="mtc-nut" shared small />
            <span>להורדה חינם</span>
          </FreeTrialDownload>
        ) : target && isVideo && entitlement.ok ? (
          <NetfreeDownloadGate href={target} mailUrl={`/api/material-video/${m.id}`} className="mtc-download" tip="להורדת הקובץ למחשב" label={`הורדת ${s.label}`}>
            <ColourSvg src="/images/mat-cards/nut-download.webp" width={84} height={67} className="mtc-nut" shared small />
            <span>להורדה</span>
          </NetfreeDownloadGate>
        ) : target && type === "presentation" && entitlement.ok ? (
          <PresentationDownloadGate href={target} className="mtc-download" tip="להורדת הקובץ למחשב" label={`הורדת ${s.label}`} edgeMark={<ColourSvg src="/images/edge-logo.png" width={56} height={56} style={{ width: 56, height: 56 }} />} chromeMark={<ColourSvg src="/images/chrome-logo.png" width={22} height={22} style={{ width: 22, height: 22 }} />}>
            <ColourSvg src="/images/mat-cards/nut-download.webp" width={84} height={67} className="mtc-nut" shared small />
            <span>להורדה</span>
          </PresentationDownloadGate>
        ) : target ? (
          <a
            href={target}
            className="mtc-download"
            data-tip={
              entitlement.ok
                ? "להורדת הקובץ למחשב"
                : guestFree
                  ? "הקובץ חינם לכל מורה שנרשמה – ההרשמה חינמית"
                  : "כדי להוריד צריך קודם להשלים את השלב הבא"
            }
            aria-label={`הורדת ${s.label}${guestFree ? " – חינם בהרשמה" : ""}`}
          >
            <ColourSvg src="/images/mat-cards/nut-download.webp" width={84} height={67} className="mtc-nut" shared small />
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
          <CardViewer
            isVideo={isVideo}
            materialId={m.id}
            title={heading.full}
            className="mtc-download"
            tip={isDailySubstitute ? DAILY_SUBSTITUTE_VIEW_TIP : undefined}
            label={`צפייה ב${s.label} באתר`}
            presentation={type === "presentation"}
          >
            <ColourSvg src="/images/nuts/one-10.webp" width={40} height={40} className="mtc-nut" shared small />
            <span>לצפייה</span>
          </CardViewer>
        ) : (
          !viewOnly &&
          target && (
            <a
              href={target}
              className="mtc-download"
              data-tip="לצפייה בקובץ צריך קודם להשלים את השלב הבא"
              aria-label={`צפייה ב${s.label} באתר`}
            >
              <ColourSvg src="/images/nuts/one-10.webp" width={40} height={40} className="mtc-nut" shared small />
              <span>לצפייה</span>
            </a>
          )
        )}

        {/* שליחה ישירה למייל: מי שמורשית – שולחת (POST ל-/api/download/[id]); אחרת – אותו צעד חסר כמו ההורדה */}
        {canView ? (
          <span className="mtc-mail-wrap">
            <EmailMaterialButton
              materialId={m.id}
              {...(isVideo ? { url: `/api/material-video/${m.id}`, sentText: "הקישור נשלח אל" } : {})}
              className="mtc-download"
              tip={isVideo ? "קישור לסרטון ישלח אליך למייל." : MAIL_TIP}
              ariaLabel={`שליחת ${s.label} למייל`}
            >
              <MailNut />
              <span>לשליחה למייל</span>
            </EmailMaterialButton>
          </span>
        ) : (
          !viewOnly &&
          target && (
            <a
              href={target}
              className="mtc-download"
              data-tip="כדי לקבל את הקובץ במייל צריך קודם להשלים את השלב הבא"
              aria-label={`שליחת ${s.label} למייל`}
            >
              <MailNut />
              <span>לשליחה למייל</span>
            </a>
          )
        )}
      </div>

      {/* מצגת למי שזוהתה כנטפרי: שורת הורדה בחדות מלאה (ההורדה הרגילה אצלה בגרסה קלה יותר) */}
      {type === "presentation" && entitlement.ok && !viewOnly && target && (
        <NetfreeHqRow href={target} nut={<ColourSvg src="/images/mat-cards/nut-download-light.webp" width={40} height={40} className="mtc-rownut" shared small />} />
      )}

      {/* הריבוע התחתון: עריכת שינויים (בתוכה גם התיקונים שכבר נעשו: בחירה, ביטול של שלה, הורדה עם הנבחרים); ואם נעשו תיקונים – גם להורדת הקובץ המתוקן */}
      {/* סרטון ומצגת (קובץ PDF, לא Word) – אין בהם עריכת שינויים */}
      {!noFixBox && (
      <div className="mtc-lower">
        <div className="mtc-tools">
          <FixRequestButton
            materialId={m.id}
            materialTitle={heading.full}
            lockedHref={lockedHref}
            nut={<ColourSvg src="/images/nuts/one-02.webp" width={40} height={40} className="mtc-rownut" shared small />}
            viewSrc={canFix ? (fixesViewSrc ?? plainViewSrc) : plainViewSrc}
            demo={fixDemo}
            fixes={canFix ? fixes : []}
            downloadHref={canFix ? target : null}
          />
          {canFix && (
            <a href={`${target}?fixes=all`} className="mtc-row" data-tip={FIX_TIPS.download}>
              <ColourSvg src="/images/mat-cards/nut-download-light.webp" width={40} height={40} className="mtc-rownut" shared small />
              <span>להורדת הקובץ המתוקן</span>
            </a>
          )}
          {/* מצב ההערה הכללית של המורה / הגרסה הפרטית המתוקנת שלה – רק למי שמורשית לקובץ */}
          {entitlement.ok && !viewOnly && <PrivateVersionNote state={correction} downloadHref={target} materialId={m.id} />}
        </div>
      </div>
      )}

      {(m.status !== "active" || myDownloadCount > 0 || (m.allowPreview && !entitlement.ok && !isVideo)) && (
        <div className="mtc-foot">
          {m.status !== "active" && (
            <span className="inline-flex items-center gap-1 text-red-700">
              <PauseCircle className="h-3.5 w-3.5" aria-hidden /> {m.status === "draft" ? "טיוטה – מוצג רק למנהלת" : "מושהה"}
            </span>
          )}
          {m.allowPreview && !entitlement.ok && !isVideo && (
            <FileViewerButton src={`/api/preview/${m.id}`} title={heading.full} className="underline">
              תצוגה מקדימה (עמוד ראשון)
            </FileViewerButton>
          )}
          {myDownloadCount > 0 && <span>הורדת קובץ זה {myDownloadCount.toLocaleString("he-IL")} פעמים</span>}
        </div>
      )}
    </article>
  );
}
