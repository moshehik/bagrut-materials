import "server-only";
import { db } from "@/db";
import { emailLogs } from "@/db/schema";
import { SITE_NAME } from "./constants";

/**
 * מערכת המייל – לפי המודל של מערכת הגמ"ח:
 * השליחה עוברת דרך Google Apps Script (Web App) ששולח מ-Gmail, כולל קובץ מצורף ב-base64,
 * וכל שליחה נרשמת בטבלת email_logs (הצלחה / שגיאה).
 *
 * הגדרות (משתני סביבה):
 *   MAIL_SCRIPT_URL   – כתובת ה-Web App של ה-Apps Script (ראי docs/google-apps-script.gs)
 *   MAIL_FROM_NAME    – שם השולח שיופיע (ברירת מחדל: שם האתר)
 *   ADMIN_EMAILS      – לאן נשלחות התראות מנהל (הראשון ברשימה)
 */

export type MailAttachment = { fileName: string; base64: string; mimeType?: string };

export type SendMailInput = {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  /** טקסט רגיל (חובה) */
  text: string;
  /** גרסת HTML (רשות) */
  html?: string;
  attachment?: MailAttachment;
  kind?: string;
  userId?: number | null;
  sentById?: number | null;
};

export type SendMailResult = { ok: true; logId: number } | { ok: false; error: string; logId: number };

const joinAddr = (a?: string | string[]) => (Array.isArray(a) ? a.filter(Boolean).join(",") : a ?? "");

/**
 * לפני הרישום ב-email_logs: מסתיר את ערך ה-token בקישורים (איפוס סיסמה / אימות / שינוי מייל),
 * כדי ש-/admin/mail לא יציג קישורים חיים שאפשר להשתמש בהם. המייל עצמו נשלח עם הקישור המלא.
 */
const redactTokens = (s: string) => s.replace(/([?&]token=)[^&\s"'<>]+/g, "$1***");

export function siteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000")
  );
}

export function adminEmail() {
  return (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim()).filter(Boolean)[0] ?? null;
}

async function transportAppsScript(input: SendMailInput): Promise<{ ok: boolean; error?: string }> {
  const url = process.env.MAIL_SCRIPT_URL;
  if (!url) return { ok: false, error: "MAIL_SCRIPT_URL לא מוגדר" };

  // הסקריפט דורש קובץ – אם אין, שולחים קובץ טקסט זעיר (כמו במודל)
  const attachment = input.attachment ?? {
    fileName: "message.txt",
    base64: Buffer.from(`נשלח ממערכת ${SITE_NAME}`).toString("base64"),
    mimeType: "text/plain",
  };

  const payload = {
    to: joinAddr(input.to),
    cc: joinAddr(input.cc),
    subject: input.subject,
    body: input.text,
    htmlBody: input.html ?? "",
    fromName: process.env.MAIL_FROM_NAME ?? SITE_NAME,
    // הסקריפט המשותף ("מערכת מייל פתוח") מכבד senderName בלבד; בלעדיו השם נשאר 'גמ"ח שמלות'
    senderName: process.env.MAIL_FROM_NAME ?? SITE_NAME,
    fileName: attachment.fileName,
    fileContent: attachment.base64,
    mimeType: attachment.mimeType ?? "application/octet-stream",
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      redirect: "follow",
    });
    const txt = await res.text();
    let result: { status?: string; message?: string };
    try {
      result = JSON.parse(txt);
    } catch {
      result = { status: "error", message: txt.slice(0, 500) };
    }
    if (result.status === "success") return { ok: true };
    return { ok: false, error: result.message || `HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** שולח מייל ורושם בלוג. לעולם לא זורק – מחזיר תוצאה. */
export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  const r = await transportAppsScript(input);
  // כשל ברישום הלוג לא אמור להפיל את השליחה (ולא להסתיר את תוצאתה) – logId=0 אם הרישום נכשל
  let logId = 0;
  try {
    const [log] = await db
      .insert(emailLogs)
      .values({
        to: joinAddr(input.to),
        cc: joinAddr(input.cc) || null,
        subject: input.subject,
        body: redactTokens(input.text),
        fileName: input.attachment?.fileName ?? null,
        kind: input.kind ?? "manual",
        status: r.ok ? "success" : "error",
        errorMessage: r.ok ? null : r.error ?? "Unknown error",
        userId: input.userId ?? null,
        sentById: input.sentById ?? null,
      })
      .returning({ id: emailLogs.id });
    logId = log?.id ?? 0;
  } catch (e) {
    console.error("[mail] email_logs insert failed", e);
  }
  if (!r.ok) console.error("[mail] failed:", r.error, "->", joinAddr(input.to));
  return r.ok ? { ok: true, logId } : { ok: false, error: r.error ?? "", logId };
}

/** שליחה "ברקע" – לא מעכבת את הפעולה של המשתמשת ולא מפילה אותה */
export function sendMailInBackground(input: SendMailInput) {
  void sendMail(input).catch((e) => console.error("[mail] background error", e));
}

/* ---------- תבניות ---------- */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function layoutHtml(title: string, bodyHtml: string, cta?: { label: string; href: string }) {
  return `<!doctype html><html dir="rtl" lang="he"><body style="margin:0;background:#faf6ef;font-family:Arial,Assistant,sans-serif;color:#1f2d33">
<div style="max-width:600px;margin:0 auto;padding:24px">
  <div style="background:linear-gradient(135deg,#1aa6b7,#0e7f8f);color:#fff;border-radius:18px 18px 0 0;padding:22px 26px">
    <div style="font-size:22px;font-weight:800">${esc(SITE_NAME)}</div>
    <div style="font-size:12px;opacity:.85">מתמקדים בעיקר · שיעורים מוכנים</div>
  </div>
  <div style="background:#fff;border:1px solid #e6e9f2;border-top:0;padding:26px;border-radius:0 0 18px 18px;line-height:1.7;font-size:15px">
    <h2 style="margin:0 0 12px;color:#0e7f8f;font-size:20px">${esc(title)}</h2>
    ${bodyHtml}
    ${
      cta
        ? `<p style="margin:22px 0 6px"><a href="${cta.href}" style="display:inline-block;background:#f5c542;color:#1f2d33;text-decoration:none;font-weight:700;padding:11px 22px;border-radius:999px">${esc(cta.label)}</a></p>`
        : ""
    }
  </div>
  <p style="text-align:center;color:#0e7f8f;font-size:11px;margin-top:14px">© ${esc(SITE_NAME)} · כל הזכויות שמורות · כל קובץ מוטבע במספר אישי של המורידה</p>
</div></body></html>`;
}

export const templates = {
  welcome(name: string, personalCode: string) {
    const url = siteUrl();
    return {
      subject: `ברוכה הבאה ל${SITE_NAME}!`,
      text: `שלום ${name},\n\nנרשמת בהצלחה לאתר ${SITE_NAME}.\nהמספר האישי שלך: ${personalCode}\nמספר זה מוטבע על כל קובץ שאת מורידה – שמרי עליו ואל תעבירי קבצים הלאה.\n\nלכניסה: ${url}/account\n\nבהצלחה בשיעורים!`,
      html: layoutHtml(
        `שלום ${esc(name)}, ברוכה הבאה!`,
        `<p>נרשמת בהצלחה לאתר <b>${esc(SITE_NAME)}</b>.</p>
         <p>המספר האישי שלך: <b style="font-size:18px;letter-spacing:1px;color:#0e7f8f">${esc(personalCode)}</b><br>
         <span style="color:#64748b;font-size:13px">מספר זה מוטבע על כל קובץ שאת מורידה – שמרי עליו ואל תעבירי קבצים הלאה.</span></p>`,
        { label: "לאזור האישי", href: `${url}/account` },
      ),
    };
  },
  purchase(name: string, description: string, amountText: string, endsAt?: Date | null) {
    const url = siteUrl();
    const until = endsAt ? `\nבתוקף עד: ${endsAt.toLocaleDateString("he-IL")}` : "";
    return {
      subject: `אישור רכישה – ${SITE_NAME}`,
      text: `שלום ${name},\n\nהרכישה נקלטה בהצלחה:\n${description}\nסכום: ${amountText}${until}\n\nלהורדות: ${url}/account`,
      html: layoutHtml(
        "הרכישה נקלטה בהצלחה",
        `<p>שלום ${esc(name)},</p><p><b>${esc(description)}</b><br>סכום: ${esc(amountText)}${
          endsAt ? `<br>בתוקף עד: ${endsAt.toLocaleDateString("he-IL")}` : ""
        }</p>`,
        { label: "לאזור האישי ולהורדות", href: `${url}/account` },
      ),
    };
  },
  sellOfferUser(name: string, title: string) {
    return {
      subject: `קיבלנו את הצעת המכירה שלך – ${title}`,
      text: `שלום ${name},\n\nהצעת המכירה "${title}" התקבלה. מנהל האתר יעבור עליה ויחזור אלייך במייל.\n\nתודה!`,
      html: layoutHtml(
        "הצעת המכירה התקבלה",
        `<p>שלום ${esc(name)},</p><p>ההצעה <b>"${esc(title)}"</b> נקלטה. מנהל האתר יעבור עליה ויחזור אלייך במייל.</p>`,
      ),
    };
  },
  sellOfferAdmin(userName: string, userEmail: string, subject: string, title: string, description: string, price?: number | null) {
    const url = siteUrl();
    return {
      subject: `הצעת מכירה חדשה: ${title}`,
      text: `הצעה חדשה מ-${userName} (${userEmail})\nמקצוע: ${subject}\nכותרת: ${title}\nמחיר מבוקש: ${price ? `₪${price / 100}` : "לא צוין"}\n\n${description}\n\nלניהול: ${url}/admin/offers`,
      html: layoutHtml(
        "הצעת מכירה חדשה",
        `<p><b>${esc(userName)}</b> (${esc(userEmail)})</p><p>מקצוע: ${esc(subject)}<br>כותרת: ${esc(title)}<br>מחיר מבוקש: ${
          price ? `₪${price / 100}` : "לא צוין"
        }</p><p style="white-space:pre-wrap">${esc(description)}</p>`,
        { label: "להצעות המכירה", href: `${url}/admin/offers` },
      ),
    };
  },
  forumReply(name: string, threadTitle: string, replier: string, threadId: number) {
    const url = `${siteUrl()}/forum/${threadId}`;
    return {
      subject: `תגובה חדשה בפורום: ${threadTitle}`,
      text: `שלום ${name},\n\n${replier} הגיבה לשאלה שלך "${threadTitle}".\n${url}`,
      html: layoutHtml(
        "תגובה חדשה לשאלה שלך",
        `<p>שלום ${esc(name)},</p><p><b>${esc(replier)}</b> הגיבה לשאלה <b>"${esc(threadTitle)}"</b>.</p>`,
        { label: "לצפייה בתגובה", href: url },
      ),
    };
  },
  contact(name: string, email: string, message: string) {
    return {
      subject: `פנייה מהאתר: ${name}`,
      text: `פנייה חדשה מטופס צור קשר\nשם: ${name}\nמייל: ${email}\n\n${message}`,
      html: layoutHtml(
        "פנייה חדשה מטופס צור קשר",
        `<p>שם: <b>${esc(name)}</b><br>מייל: <a href="mailto:${esc(email)}">${esc(email)}</a></p><p style="white-space:pre-wrap">${esc(message)}</p>`,
      ),
    };
  },
  faqQuestion(name: string | null, email: string | null, question: string) {
    const who = name ? `${name}${email ? ` – ${email}` : ""}` : "אורחת שלא מחוברת לחשבון";
    const whoHtml = name
      ? `${esc(name)}${email ? ` – <a href="mailto:${esc(email)}">${esc(email)}</a>` : ""}`
      : "אורחת שלא מחוברת לחשבון";
    return {
      subject: `שאלה חדשה מתיבת "יש לי עוד שאלה" בעמוד הבית`,
      text: `שאלה חדשה נשלחה מהתיבה "יש לי עוד שאלה" בעמוד הבית\nמאת: ${who}\n\n${question}`,
      html: layoutHtml(
        "שאלה חדשה מעמוד השאלות והתשובות",
        `<p>מאת: <b>${whoHtml}</b></p><p style="white-space:pre-wrap">${esc(question)}</p>`,
      ),
    };
  },
  manual(subject: string, body: string) {
    return {
      subject,
      text: body,
      html: layoutHtml(subject, `<div style="white-space:pre-wrap">${esc(body)}</div>`),
    };
  },
  passwordReset(name: string, url: string) {
    return {
      subject: `איפוס סיסמה – ${SITE_NAME}`,
      text: `שלום ${name},\n\nקיבלנו בקשה לאיפוס הסיסמה שלך באתר ${SITE_NAME}.\nלבחירת סיסמה חדשה היכנסי לקישור (בתוקף לשעה):\n${url}\n\nאם לא ביקשת איפוס – אפשר להתעלם מהודעה זו, הסיסמה שלך נשארת ללא שינוי.`,
      html: layoutHtml(
        "איפוס סיסמה",
        `<p>שלום ${esc(name)},</p><p>קיבלנו בקשה לאיפוס הסיסמה שלך. לחצי על הכפתור לבחירת סיסמה חדשה. הקישור בתוקף <b>לשעה אחת</b>.</p>
         <p style="color:#64748b;font-size:13px">אם לא ביקשת איפוס – אפשר להתעלם מהודעה זו, הסיסמה שלך נשארת ללא שינוי.</p>`,
        { label: "לבחירת סיסמה חדשה", href: url },
      ),
    };
  },
  changeEmailVerify(name: string, newEmail: string, url: string) {
    return {
      subject: `אימות כתובת מייל חדשה – ${SITE_NAME}`,
      text: `שלום ${name},\n\nביקשת לשנות את כתובת המייל שלך באתר ${SITE_NAME} לכתובת: ${newEmail}\nכדי לאשר את השינוי היכנסי לקישור (בתוקף ל-24 שעות):\n${url}\n\nאם לא ביקשת זאת – אפשר להתעלם מהודעה זו, כתובת המייל שלך לא תשתנה.`,
      html: layoutHtml(
        "אימות כתובת מייל חדשה",
        `<p>שלום ${esc(name)},</p><p>ביקשת לשנות את כתובת המייל שלך לכתובת <b dir="ltr">${esc(newEmail)}</b>. לחצי על הכפתור כדי לאשר. הקישור בתוקף ל-24 שעות.</p>
         <p style="color:#64748b;font-size:13px">אם לא ביקשת זאת – אפשר להתעלם מהודעה זו, כתובת המייל שלך לא תשתנה.</p>`,
        { label: "אישור כתובת המייל החדשה", href: url },
      ),
    };
  },
  verifyEmail(name: string, url: string) {
    return {
      subject: `אימות כתובת המייל – ${SITE_NAME}`,
      text: `שלום ${name},\n\nכדי לאמת את כתובת המייל שלך באתר ${SITE_NAME} היכנסי לקישור (בתוקף ל-24 שעות):\n${url}\n\nתודה!`,
      html: layoutHtml(
        "אימות כתובת המייל",
        `<p>שלום ${esc(name)},</p><p>לחצי על הכפתור כדי לאמת את כתובת המייל שלך. הקישור בתוקף ל-24 שעות.</p>`,
        { label: "אימות המייל שלי", href: url },
      ),
    };
  },
};
