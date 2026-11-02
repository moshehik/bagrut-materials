import Image from "next/image";
import { Download } from "lucide-react";
import { EmailMaterialButton } from "@/components/email-material-button";
import { FileViewerButton } from "@/components/pdf-viewer";
import { MailNut } from "@/components/material-type-card";
import { stripExtension } from "@/lib/admin-utils";
import { fileColor } from "@/lib/sicha-colors";

// כרטיס קובץ אחד בשיעור-שיחה, באותו עיצוב כמו כרטיסיית חומר רגיל (.mtc):
// הכותרת בראש, ומתחתיה שלוש האפשרויות – הורדה, צפייה באתר, שליחה למייל.
// כל קובץ בצבע אחר (ר' sicha-colors.ts), לפי הסדר – שלא יהיה הכול תכלת
const styleFor = (i: number) =>
  ({ "--mtc-body": fileColor(i).body, "--mtc-strip": fileColor(i).strip }) as React.CSSProperties;

/** צפייה באתר נתמכת רק ב-PDF / Word / PowerPoint (כמו בתצוגה של חומרים רגילים) */
const canViewInSite = (fileName: string) => /\.(pdf|docx?|pptx?)$/i.test(fileName);

export function SichaFileCard({
  sichaId,
  fileId,
  fileName,
  colorIndex = 0,
}: {
  sichaId: number;
  fileId?: number;
  fileName: string;
  colorIndex?: number;
}) {
  const q = fileId ? `?file=${fileId}` : "";
  const title = stripExtension(fileName);

  return (
    <article className="mtc sicha-file-card" style={styleFor(colorIndex)}>
      <header className="mtc-head">
        <h4 className="mtc-title" aria-label={title}>
          <span className="mtc-label-text mtc-label-long" title={fileName}>
            {title}
          </span>
        </h4>
      </header>

      <div className="mtc-body sicha-file-body">
        <a href={`/api/sichot/download/${sichaId}${q}`} className="mtc-download" data-tip="להורדת הקובץ למחשב" aria-label={`הורדת ${title}`}>
          <Image src="/images/mat-cards/nut-download.webp" alt="" width={84} height={67} className="mtc-nut" aria-hidden />
          <span>להורדה</span>
        </a>

        {canViewInSite(fileName) && (
          <FileViewerButton src={`/api/sichot/preview/${sichaId}${q}`} title={title} className="mtc-download" label={`צפייה ב${title} באתר`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/nuts/one-10.webp" alt="" width={40} height={40} className="mtc-nut" aria-hidden />
            <span>לצפייה</span>
          </FileViewerButton>
        )}

        <span className="mtc-mail-wrap">
          <EmailMaterialButton
            url={`/api/sichot/download/${sichaId}${q}`}
            className="mtc-download"
            tip="הקובץ ישלח אליך ישירות למייל."
            ariaLabel={`שליחת ${title} למייל`}
          >
            <MailNut />
            <span>לשליחה למייל</span>
          </EmailMaterialButton>
        </span>
      </div>
    </article>
  );
}
