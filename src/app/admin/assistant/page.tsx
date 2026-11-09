import { requireAdminPage } from "@/lib/session";
import { geminiConfigured } from "@/lib/gemini-pool";
import { AssistantChat } from "@/components/admin/assistant-chat";

export const dynamic = "force-dynamic";

export const metadata = { title: "עוזרת הניהול" };

export default async function AdminAssistantPage() {
  await requireAdminPage();
  const configured = await geminiConfigured().catch(() => false);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-display text-2xl font-bold">עוזרת הניהול (AI)</h2>
      </div>
      <p className="text-sm text-muted max-w-3xl">
        עוזרת מבוססת ג'מיני, למנהלת בלבד. היא עונה על שאלות על האתר מתוך נתונים אמיתיים: סטטיסטיקות, הורדות, משתמשות ומנויים, חומרים, תשלומים, דיווחי תקלות ובדיקת הרשאות הורדה.
        היא עובדת בקריאה בלבד: לא משנה נתונים, לא שולחת מיילים ולא מבצעת תשלומים. בפרטי משתמשות היא מקבלת שם ומזהה בלבד (המייל מוסתר, בלי טלפון). השיחה נשמרת בדפדפן הזה בלבד.
      </p>
      {!configured && (
        <div role="alert" className="card p-4 text-red-800 bg-red-50 text-sm">
          חיבור ג'מיני עדיין לא הוגדר באתר. אפשר להגדיר מפתחות בכרטיס "חיבור ג'מיני" במסך בקשות שינוי.
        </div>
      )}
      <AssistantChat />
    </div>
  );
}
