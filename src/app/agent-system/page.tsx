import type { Metadata } from "next";
import { Bot, GitBranch, MessageCircleQuestion, ShieldAlert, FileCode2, ListChecks, LockKeyhole } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { AgentSystemPanel } from "@/components/admin/agent-system-panel";

export const metadata: Metadata = {
  title: "מערכת הסוכן האוטומטי",
  robots: { index: false, follow: false },
};

function Path({ children }: { children: string }) {
  return (
    <code dir="ltr" className="rounded bg-black/5 px-1.5 py-0.5 text-[13px] font-mono">
      {children}
    </code>
  );
}

export default async function AgentSystemPage() {
  const user = await getCurrentUser();
  const isAdmin = user?.role === "admin";

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12">
      <div className="animate-fade-up">
        <span className="chip bg-blue-soft text-blue-deep">
          <Bot className="h-3.5 w-3.5" aria-hidden /> תיעוד פנימי
        </span>
        <h1 className="font-display mt-3 text-4xl font-black">מערכת הסוכן האוטומטי (fix-reports)</h1>
        <p className="mt-3 leading-relaxed text-muted">
          דף זה לא מקושר מהתפריט הראשי בכוונה — הוא תיעוד טכני פנימי לגבי מנגנון אוטומציה
          שהועתק והותאם מפרויקט אחר (<Path>gemach-app</Path>) לתוך האתר הזה. הוא מתאר איך
          המערכת עובדת, אילו קבצים נוספו, ומה עוד צריך להגדיר כדי שתהיה פעילה בפועל.
        </p>
      </div>

      <section className="card mt-8 p-8" aria-labelledby="panel-h">
        <h2 id="panel-h" className="text-xl font-bold flex items-center gap-2">
          <LockKeyhole className="h-5 w-5 text-green-600" aria-hidden /> לוח בקרה ובדיקה
        </h2>
        {isAdmin ? (
          <div className="mt-4">
            <AgentSystemPanel />
          </div>
        ) : (
          <p className="mt-2 text-muted leading-relaxed">
            החלק הזה — הדלקה/כיבוי, יצירת דיווחי-בדיקה, חיפוש קבצים בדרייב, וצפייה
            בדיווחים בפועל — מוצג רק למנהלת מחוברת (זה בכוונה, גם אם הדף עצמו פתוח
            לכולם: זו יכולת שיכולה לגעת בנתוני האתר, אז היא דורשת התחברות בפועל).{" "}
            <a href="/login" className="text-blue-deep underline">התחברי</a> כדי לראות אותו.
          </p>
        )}
      </section>

      <section className="card mt-6 p-8" aria-labelledby="what-h">
        <h2 id="what-h" className="text-xl font-bold flex items-center gap-2">
          <GitBranch className="h-5 w-5 text-pink" aria-hidden /> מה זה בכלל
        </h2>
        <p className="mt-2 text-muted leading-relaxed">
          סוכן קלוד-קוד שרץ אוטומטית (לא בשיחה אינטראקטיבית), קורא דיווחי תקלות/שאלות
          שנפתחו על האתר, מנסה לתקן אותם בעצמו, ופותח <strong>ענף git חדש + Pull Request</strong>{" "}
          לכל תיקון — לעולם לא דוחף ישירות ל-<Path>main</Path>. המיזוג בפועל (ומכאן הפריסה
          האוטומטית ב-Vercel) נשאר תמיד ביד אדם.
        </p>
        <p className="mt-2 text-muted leading-relaxed">
          התבנית המקורית פועלת כבר בפרויקט <Path>gemach-app</Path> (מערכת השכרת שמלות) עם
          שכבת &quot;11 סוכני ביקורת&quot; ייעודיים לעסק הזה (מלאי, הזמנות, תשלומים וכו׳). את שכבת
          הביקורת הזו <strong>לא</strong> העתקנו לכאן — התוכן שלה ספציפי לעסק שמלות ולא
          רלוונטי לאתר בגרות. מה שכן הועתק הוא ה&quot;מנוע&quot; הכללי: הרצה מתוזמנת + פרוטוקול תיקון
          מתועד.
        </p>
      </section>

      <section className="card mt-6 p-8" aria-labelledby="flow-h">
        <h2 id="flow-h" className="text-xl font-bold flex items-center gap-2">
          <MessageCircleQuestion className="h-5 w-5 text-blue" aria-hidden /> איך זה עובד, שלב אחר שלב
        </h2>
        <ol className="mt-3 space-y-3 text-muted leading-relaxed list-decimal ps-5">
          <li>
            דיווח תקלה/שאלה נוצר ונשמר בטבלת <Path>error_reports</Path> ב-Postgres (Neon)
            דרך <Path>src/lib/errorReports.ts</Path>. <strong>לא</strong> ב-Vercel Blob — ה-Blob
            store של הפרויקט הושעה (מכסה), אז המערכת נבנתה ישר על ה-DB הקיים.
          </li>
          <li>
            <Path>.github/workflows/claude-fix-reports.yml</Path> רץ כל 5 דקות (cron) או ידנית.
            לפני שהוא מפעיל את קלוד בכלל, הוא בודק בזול דגל הפעלה ב-DB (
            <Path>agent_loop_status</Path>) — אם כבוי, ה-workflow יוצא מיד כמעט בלי עלות.
          </li>
          <li>
            אם דלוק — הוא מפעיל את <Path>claude-code-action</Path>, שמריץ את הפקודה{" "}
            <Path>/fix-reports</Path> המתועדת ב-<Path>.claude/commands/fix-reports.md</Path>.
          </li>
          <li>
            קלוד קורא את הדיווחים הפתוחים, חוקר בקוד/ב-audit_logs, ואם צריך שואל שאלה
            בתגובה (מסומנת <code dir="ltr" className="text-[13px]">isQuestion</code>) וממתין
            לריצה הבאה. אם הדיווח מתייחס לקובץ מסוים (למשל &quot;החומר של פרק ה לא נפתח&quot;) —
            הוא יכול לזהות אותו בארכיון הדרייב לפי שם (<Path>scripts/drive-search.ts</Path>,
            מטא-דאטה בלבד — ר׳ &quot;גישה לדרייב&quot; למטה).
          </li>
          <li>
            אם הוא מתקן בפועל — הוא פותח ענף + PR, מגיב בשרשור הדיווח עם הסבר קצר, ואחרי
            שכל הסבב מסתיים גם עם קישור Preview זמני (רק לתיקונים &quot;בטוחים להצגה&quot;, לא
            לתיקונים שנוגעים בכתיבת נתונים אמיתית).
          </li>
          <li>מיזוג ה-PR נשאר תמיד החלטה ידנית.</li>
        </ol>
      </section>

      <section className="card mt-6 p-8" aria-labelledby="drive-h">
        <h2 id="drive-h" className="text-xl font-bold flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-red-600" aria-hidden /> גישה לדרייב — מה מותר ומה אסור לסוכן
        </h2>
        <p className="mt-2 text-muted leading-relaxed">
          לסוכן יש גישת <strong>זיהוי-בלבד</strong> לארכיון הדרייב (<Path>driveListFiles</Path>/
          <Path>scoreDriveFilesByQuery</Path> ב-<Path>src/lib/driveBridgeCore.ts</Path>, נבנה על
          גבי הגשר שכבר קיים לצורך אחסון חומרים) — הוא יכול לקבל רשימת קבצים ולדרג אותם לפי
          דמיון-שם לתיאור חופשי, כדי &quot;להבין&quot; לאיזה קובץ דיווח מתייחס. הפלט הוא תמיד{" "}
          <strong>מטא-דאטה בלבד</strong>: שם, מזהה, גודל, קישור צפייה בדרייב עצמו.
        </p>
        <p className="mt-2 text-muted leading-relaxed">
          <strong>כלל קשיח, מתועד גם ב-.claude/commands/fix-reports.md:</strong> הסוכן{" "}
          <strong>אסור לו בשום אופן</strong> להעתיק/לצרף/להדביק תוכן קובץ בפועל (בייטים, טקסט
          מחולץ, קישור הורדה ישיר) לתוך תגובה בשרשור דיווח — כי שרשור דיווח יכול להיקרא ע&quot;י
          מדווח/ת אנונימי/ת שלא בהכרח שילמ/ה על החומר. זיהוי &quot;איזה קובץ&quot; מותר, החזרת התוכן
          עצמו למדווח/ת אסורה תמיד. עריכה בפועל של קובץ Word (לא רק זיהוי) חסומה עד שימולאו
          הכללים ב-<Path>כללי עריכת קבצי וורד מבוקשים באתר.md</Path> (עדיין תבנית ריקה).
        </p>
      </section>

      <section className="card mt-6 p-8" aria-labelledby="files-h">
        <h2 id="files-h" className="text-xl font-bold flex items-center gap-2">
          <FileCode2 className="h-5 w-5 text-gold" aria-hidden /> קבצים שנוספו/שונו
        </h2>
        <ul className="mt-3 space-y-2 text-muted leading-relaxed">
          <li><Path>.github/workflows/claude-fix-reports.yml</Path> — ה-workflow המתוזמן</li>
          <li><Path>.claude/commands/fix-reports.md</Path> — הפרוטוקול המלא שקלוד עוקב אחריו</li>
          <li><Path>src/db/schema.ts</Path> — טבלאות <Path>error_reports</Path>/<Path>error_report_notes</Path>/<Path>agent_loop_status</Path> (חדש)</li>
          <li><Path>src/lib/errorReports.ts</Path> — Postgres במקום Blob; תגובות עם <code dir="ltr" className="text-[13px]">role</code>/<code dir="ltr" className="text-[13px]">isQuestion</code>/<code dir="ltr" className="text-[13px]">previewUrl</code>, ושרשור-על קבוע</li>
          <li><Path>src/lib/agentLoopStatus.ts</Path> — דגל הפעלה/כיבוי + שעון שקט, Postgres (חדש)</li>
          <li><Path>src/lib/driveBridgeCore.ts</Path> — הורחב: <Path>driveListFiles</Path>/<Path>scoreDriveFilesByQuery</Path> (מטא-דאטה בלבד)</li>
          <li><Path>src/lib/actions/agentSystem.ts</Path>, <Path>src/components/admin/agent-system-panel.tsx</Path> — לוח הבקרה למעלה (אדמין-בלבד, חדש)</li>
          <li>
            <Path>scripts/read-error-reports.ts</Path>,{" "}
            <Path>scripts/error-report-reply.ts</Path>,{" "}
            <Path>scripts/agent-log-report.ts</Path>,{" "}
            <Path>scripts/agent-loop-status.ts</Path>,{" "}
            <Path>scripts/get-preview-deployment-url.ts</Path>,{" "}
            <Path>scripts/drive-search.ts</Path> — כלי ה-CLI שהפקודה משתמשת בהם
          </li>
          <li><Path>כללי עריכת קבצי וורד מבוקשים באתר.md</Path> (שורש הריפו) — תבנית ריקה, ר׳ למעלה</li>
        </ul>
      </section>

      <section className="card mt-6 p-8" aria-labelledby="setup-h">
        <h2 id="setup-h" className="text-xl font-bold flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-blue-deep" aria-hidden /> מה עוד צריך להגדיר (ידני, לא בקוד)
        </h2>
        <p className="mt-2 text-muted leading-relaxed">
          הקבצים כבר בריפו והטבלאות כבר נוצרו ב-DB, אבל ה-workflow ב-GitHub{" "}
          <strong>לא פעיל</strong> עד שמוסיפים את אלה ב-GitHub (Settings → Secrets and
          variables → Actions):
        </p>
        <ul className="mt-3 space-y-2 text-muted leading-relaxed list-disc ps-5">
          <li><code dir="ltr" className="text-[13px]">CLAUDE_CODE_OAUTH_TOKEN</code> — נוצר עם <Path>claude setup-token</Path> מהמנוי הרגיל</li>
          <li><code dir="ltr" className="text-[13px]">DATABASE_URL</code> — connection string של ה-Neon (כבר קיים ב-Vercel, צריך להעתיק ל-GitHub secret נפרד — ה-runner שם לא רואה משתני סביבה של Vercel)</li>
          <li><code dir="ltr" className="text-[13px]">DRIVE_BRIDGE_URL</code> / <code dir="ltr" className="text-[13px]">DRIVE_BRIDGE_SECRET</code> — אותם ערכים שכבר מוגדרים ב-Vercel, כדי שהסוכן יוכל לזהות קבצים (ר׳ למעלה). בלעדיהם <Path>drive-search.ts</Path> פשוט מדווח שהדרייב לא מוגדר, לא נכשל קשות.</li>
          <li>התקנת אפליקציית GitHub &quot;Claude Code&quot; על הריפו — <span dir="ltr">github.com/apps/claude</span></li>
        </ul>
        <p className="mt-3 text-muted leading-relaxed">
          הדגל מתחיל <strong>כבוי</strong> כברירת מחדל. אפשר להדליק/לכבות אותו ולעשות ניסויים
          (ליצור דיווח-בדיקה, לחפש קובץ, לענות ידנית) ישירות מלוח הבקרה למעלה — לא צריך
          לגעת בסקריפטים בשביל זה.
        </p>
      </section>
    </div>
  );
}
