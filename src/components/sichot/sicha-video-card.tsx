import { inlineUi } from "@/lib/inline-images";
import Link from "next/link";
import { ExternalLink, Folder, Video } from "lucide-react";
import { driveLinkUrl } from "@/lib/drive-link";
import { EmailMaterialButton } from "@/components/email-material-button";
import { MailNut } from "@/components/material-type-card";
import { DeleteMyVideoButton } from "./delete-my-video-button";
import { VideoViewerButton } from "./sicha-video-viewer";
import { IdeaBox, UsageToggle } from "./sicha-interactions";
import { CopyrightReport } from "./copyright-report";
import { EnjoyedBadge } from "./enjoyed-badge";
import { VIDEO_IDEA_BOX_COLORS } from "@/lib/sicha-colors";

export type SichaVideoCardData = {
  id: number;
  title: string;
  description: string;
  driveId: string;
  linkKind: string;
  teacherName: string;
  /** מחיקה – רק מנהלת האתר */
  canDelete: boolean;
  /** רעיונות המורות "למה זה מתאים" (מוצגים בדף הסרטון עצמו) */
  ideas?: { id: number; body: string; teacherName: string }[];
  /** מורות שונות שסימנו שהשתמשו בשיעורים שהסרטון מעשיר */
  usageCount?: number;
  /** המורה הנוכחית סימנה לייק */
  usedByMe?: boolean;
  /** השיעורים שהסרטון מתאים להם, עם קישור לדף השיעור (מוצגים רק בדף הסרטון עצמו) */
  lessons?: { id: number; title: string; href: string }[];
};

function VideoHead({ video, title }: { video: SichaVideoCardData; title: React.ReactNode }) {
  const isFolder = video.linkKind === "folder";
  const n = video.usageCount ?? 0;
  return (
    <header className="sicha-head">
      <span className="sicha-video-icon" aria-hidden>
        {isFolder ? <Folder className="h-5 w-5" /> : <Video className="h-5 w-5" />}
      </span>
      <h3 className="sicha-title leading-snug">{title}</h3>
      <p className="mt-1 text-lg flex items-center gap-2">
        <span className="sicha-avatar" aria-hidden>
          {video.teacherName.trim().charAt(0)}
        </span>
        {video.teacherName}
      </p>
      <EnjoyedBadge count={n} tip={n === 1 ? "מורה אחת השתמשה בסרטון הזה!" : `${n} מורות השתמשו בסרטון הזה!`} />
    </header>
  );
}

/** כרטיס קטן ברשימת הסרטונים: מה הסרטון – הפירוט בדף הסרטון עצמו (?video=) */
export function SichaVideoListCard({ video, href }: { video: SichaVideoCardData; href: string }) {
  return (
    <article id={`video-${video.id}`} className="gate-card sicha-card sicha-video-card !p-0 overflow-hidden flex flex-col">
      <VideoHead
        video={video}
        title={
          <Link href={href} className="hover:underline">
            {video.title}
          </Link>
        }
      />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="text-base gate-soft leading-relaxed line-clamp-3">{video.description}</p>
        <Link href={href} className="btn btn-gold btn-gate !px-4 !py-1 !text-lg mt-auto self-start">
          לפתיחת הסרטון
        </Link>
      </div>
    </article>
  );
}

/** דף הסרטון עצמו: התיאור, ומתחתיו השיעורים שהסרטון מתאים להם (לחיצה מובילה לשיעור) */
export function SichaVideoCard({ video, path }: { video: SichaVideoCardData; path: string }) {
  const isFolder = video.linkKind === "folder";

  return (
    <article id={`video-${video.id}`} className="gate-card sicha-card sicha-video-card !p-0 overflow-hidden flex flex-col">
      <VideoHead video={video} title={video.title} />

      <div className="flex flex-col gap-3 p-4">
        <p className="text-base gate-soft leading-relaxed whitespace-pre-line">{video.description}</p>

        {!!video.lessons?.length && (
          <div className="sicha-lessons-panel space-y-2">
            <p className="text-lg">מתאים לשיעורים:</p>
            <ul className="flex flex-col items-start gap-2">
              {video.lessons.map((l) => (
                <li key={l.id} className="max-w-full">
                  <Link href={l.href} className="sicha-gold-pill max-w-full">
                    <span className="truncate">{l.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* למה הסרטון מתאים: רעיונות המורות (מופיע גם בלי שיעור מקושר) */}
        <div className="mtc sicha-idea-card" style={VIDEO_IDEA_BOX_COLORS}>
          <div className="mtc-lower">
            <div className="mtc-tools">
              <IdeaBox sichaId={0} videoId={video.id} path={path} ideas={video.ideas ?? []} defaultOpen />
            </div>
          </div>
        </div>

        {/* לייק: השתמשת? נהנית? (כמו בשיעורי יהדות) */}
        <UsageToggle sichaId={0} videoId={video.id} path={path} used={!!video.usedByMe} />

        {/* כמו בכל קובץ: הורדה, צפייה באתר, שליחת קישור למייל */}
        <div className="flex flex-wrap items-center gap-3">
          {isFolder ? (
            <a href={driveLinkUrl(video.driveId, video.linkKind)} target="_blank" rel="noopener noreferrer" className="btn btn-gold btn-gate py-2">
              <ExternalLink className="h-4 w-4" aria-hidden /> פתיחת התיקייה
            </a>
          ) : (
            <>
              <a href={`/api/sichot/video/${video.id}`} className="mtc-download sicha-video-download" data-tip="להורדת הסרטון למחשב" aria-label={`הורדת ${video.title}`}>
                <img src={inlineUi("/images/mat-cards/nut-download.webp")} alt="" width={84} height={67} className="mtc-nut" aria-hidden />
                <span>להורדה</span>
              </a>

              <VideoViewerButton
                src={`/api/sichot/video/${video.id}?inline=1`}
                title={video.title}
                className="mtc-download sicha-video-download"
                tip="לצפייה בסרטון כאן באתר"
                label={`צפייה ב${video.title} באתר`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={inlineUi("/images/nuts/one-10.webp")} alt="" width={40} height={40} className="mtc-nut" aria-hidden />
                <span>לצפייה</span>
              </VideoViewerButton>

              <span className="mtc-mail-wrap">
                <EmailMaterialButton
                  url={`/api/sichot/video/${video.id}`}
                  className="mtc-download sicha-video-download"
                  tip="קישור לסרטון ישלח אליך למייל."
                  ariaLabel={`שליחת קישור ל${video.title} למייל`}
                  sentText="הקישור נשלח אל"
                >
                  <MailNut />
                  <span>לשליחה למייל</span>
                </EmailMaterialButton>
              </span>
            </>
          )}
          {video.canDelete && <DeleteMyVideoButton id={video.id} path={path} />}
        </div>
        <CopyrightReport videoId={video.id} />
      </div>
    </article>
  );
}
