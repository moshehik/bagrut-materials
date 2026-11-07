import type { FixTimelineEntry } from "@/lib/fix-events";

const LABELS: Record<string, string> = {
  "fix.general.received": "ההערה התקבלה מהמורה",
  "fix.general.get": "הסוכן הוריד את הקובץ החי",
  "fix.general.check": "בדיקת קובץ ערוך + המרה",
  "fix.general.artifact.original": "נשמר: הקובץ המקורי",
  "fix.general.artifact.edited": "נשמר: הקובץ הערוך",
  "fix.general.artifact.rendered": "נשמר: ה-PDF המומר",
  "fix.general.artifact.published": "נשמר: הקובץ שפורסם",
  "fix.general.artifact.failed": "שמירת קובץ עבודה נכשלה",
  "fix.general.private.dryrun": "dry-run: גרסה פרטית",
  "fix.general.private": "החלטה: גרסה פרטית למבקשת",
  "fix.general.private.published": "גרסה פרטית פורסמה",
  "fix.general.private.removed": "גרסה פרטית הוסרה (הקובץ נשמר)",
  "fix.general.merge.dryrun": "dry-run: החלפת הקובץ המשותף",
  "fix.general.merge": "החלטה: הקובץ המשותף הוחלף לכולן",
  "fix.general.answer.dryrun": "dry-run: תשובה",
  "fix.general.answer": "החלטה: תשובה בלי שינוי",
  "fix.general.reject.dryrun": "dry-run: דחייה",
  "fix.general.reject": "החלטה: נדחתה",
  "fix.general.original_download": "המורה הורידה את הקובץ המקורי (בלי התיקון)",
};

/** ציר זמן לקריאה בלבד של הערה אחת (audit_logs, entity material_fix) – /admin/fixes. שום דבר לא נמחק משם. */
export function FixTimeline({ entries }: { entries: FixTimelineEntry[] }) {
  if (entries.length === 0) return <p className="mt-1 text-xs text-muted">אין עדיין אירועים מתועדים להערה הזו.</p>;
  return (
    <ol className="mt-2 space-y-1 border-s-2 border-foreground/10 ps-3 text-xs">
      {entries.map((e) => {
        const ids = ["driveId", "fileId", "versionId", "backupId", "publishedArtifact"].filter((k) => e.details[k]).map((k) => `${k}: ${String(e.details[k])}`);
        const reason = (e.details.why ?? e.details.note ?? e.details.reason) as string | undefined;
        return (
          <li key={e.id}>
            <span className="text-muted">{e.createdAt.toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })}</span> · <b>{LABELS[e.action] ?? e.action}</b>
            {e.actorId ? <span className="text-muted"> · משתמשת #{e.actorId}</span> : null}
            <div className="whitespace-pre-wrap">{e.summary}</div>
            {reason && <div className="text-muted">סיבה/הערה: {reason}</div>}
            {ids.length > 0 && <div className="text-muted" dir="ltr">{ids.join(" · ")}</div>}
          </li>
        );
      })}
    </ol>
  );
}
