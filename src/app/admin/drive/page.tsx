import { DriveExplorer } from "@/components/admin/drive-explorer";

export const dynamic = "force-dynamic";

export const metadata = { title: "סייר קבצי דרייב" };

export default function AdminDrivePage() {
  return (
    <>
      <details className="card" style={{ padding: "0.9rem 1.1rem", marginBottom: "1rem" }}>
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>איך מנהלים קבצים בדרייב כך שיופיעו באתר? (מדריך קצר)</summary>
        <ol style={{ margin: "0.7rem 0 0", paddingInlineStart: "1.3rem", display: "grid", gap: "0.35rem", lineHeight: 1.7 }}>
          <li><b>קובץ חדש:</b> מעתיקים אותו לתיקיית הפרק (בסייר הקבצים, בתיקיית Drive המסונכרנת, או בדרייב באינטרנט), בשם <code>סוג - שם הפרק.docx</code> (למשל <code>דף העשרה - פרק ט.docx</code>), ואז כאן: &quot;סנכרון עם הדרייב&quot;. הוא מופיע כ<b>טיוטה</b> — צריך להפעיל אותו (סטטוס &quot;פעיל&quot;) כדי שיראו אותו באתר.</li>
          <li><b>להחליף תוכן של קובץ קיים (Drive for desktop):</b> פותחים את הקובץ מתיקיית Drive בסייר הקבצים, עורכים ו<b>שומרים</b> — או גוררים קובץ עם <b>אותו שם</b> מעל הקיים ובוחרים &quot;החלף&quot;. כך נשאר אותו קובץ והאתר מגיש את התוכן החדש מיד. אם בכל זאת מחקתם והדבקתם חדש (קובץ חדש בעיני הדרייב), &quot;סנכרון עם הדרייב&quot; מזהה שזו החלפה לפי השם (גם &quot;- עותק&quot; / &quot;(1)&quot;) ומחבר אותו לחומר הקיים, בלי ליצור כפילות.</li>
          <li><b>שינוי שם / העברה בין פרקים / תיקייה חדשה:</b> עושים כאן בסייר (גרירה או ⋯). שם שמשנים ישירות בדרייב לא מגיע לאתר ועלול לחזור.</li>
          <li><b>להוריד חומר מהאתר:</b> &quot;העבר לארכיון&quot; (לא מוחקים בדרייב — מחיקה שוברת את ההורדה). אפשר לשחזר מהארכיון.</li>
          <li><b>פורמט:</b> להישאר ב-<code>.docx</code> (לא להמיר ל-Google Docs).</li>
          <li><b>קובץ המידע <code>_מידע.txt</code>:</b> האתר מייצר אותו ודורס אותו — לא עורכים אותו ידנית.</li>
        </ol>
      </details>
      <DriveExplorer />
    </>
  );
}
