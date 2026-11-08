import { CheckCircle2, Hourglass, MessageSquareText } from "lucide-react";
import { formatHebrewDate } from "@/lib/hebrew-date";
import { correctionSignature, generalStatusLabel, latestGeneral, timeAgoHe, type CorrectionState } from "@/lib/private-version-logic";
import { CorrectionLive } from "@/components/correction-live";
import { sanitizeReplyForDisplay } from "@/lib/reply-text";

/**
 * השורה בכרטיסייה שמספרת למורה מה קרה עם "ההערה הכללית על הקובץ" שלה (material_fixes kind=general):
 * ממתינה / נבדקה (עם תשובה) / שולבה לכולן / תוקנה רק עבורה – ואז ההורדה, הצפייה והמייל שלה כבר מקבלים את
 * הגרסה המתוקנת (ר' src/lib/private-versions.ts), וכאן יש גם קישור לקובץ המקורי (?original=1).
 * רכיב שרת (בלי מצב) – מוצג רק למי שמורשית לקובץ ויש לה הערה/גרסה. מנהלת רואה ומוחקת גרסאות ב-/admin/fixes.
 */
export function PrivateVersionNote({ state, downloadHref, materialId }: { state: CorrectionState | undefined; downloadHref: string | null; materialId?: number }) {
  if (!state) return null;
  const pv = state.privateVersion;
  const latest = latestGeneral(state.general);
  // הודעה שממתינה לסוכן (גם הודעת המשך בשיחה) גוברת: השעון. אחרת – גרסה פרטית פעילה גוברת על מצב התלונה (גם אם התלונה המקורית כבר לא מוצגת)
  const label = latest?.status === "pending" ? generalStatusLabel(latest) : pv ? { text: "הקובץ תוקן עבורך לפי ההערה שלך", tone: "done" as const } : generalStatusLabel(latest);
  if (!label) return null;
  const Icon = label.tone === "wait" ? Hourglass : label.tone === "done" ? CheckCircle2 : MessageSquareText;
  // התשובה האחרונה של הסוכן (בשיחה – על ההודעה האחרונה שנענתה); הערת הגרסה הפרטית כשאין
  const lastAnswered = [...state.general].filter((g) => g.status !== "pending" && g.replyText).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id - a.id)[0];
  const reply = latest?.status === "pending" ? null : (lastAnswered?.replyText ?? pv?.note ?? null);
  const date = (() => { const d = pv?.createdAt ?? latest?.createdAt; return d ? (timeAgoHe(d) ?? formatHebrewDate(d)) : null; })();
  return (
    <div className={`mtc-note mtc-note-${label.tone}`} role="status">
      {/* ממתינה לסוכן: בדיקה ברקע (קלה, עם backoff) ורענון אוטומטי כשהגיעה תשובה */}
      {label.tone === "wait" && materialId ? <CorrectionLive materialId={materialId} signature={correctionSignature(state)} /> : null}
      <p className="mtc-note-head">
        <Icon className="mtc-note-icon" strokeWidth={1.75} aria-hidden />
        <span>{label.text}</span>
        {date ? <span className="mtc-note-date">({date})</span> : null}
      </p>
      {/* רשת ביטחון בתצוגה: בלי אזכור ספריית המקור ("ספריא") בתשובה, גם אם נשמרה כך בעבר */}
      {reply ? <p className="mtc-note-reply">{sanitizeReplyForDisplay(reply)}</p> : null}
      {pv && downloadHref ? (
        <a href={`${downloadHref}?original=1`} className="mtc-note-link" data-tip="הקובץ כפי שהוא לכל המורות, בלי התיקון שנעשה עבורך">
          להורדת הקובץ המקורי (בלי התיקון)
        </a>
      ) : null}
    </div>
  );
}
