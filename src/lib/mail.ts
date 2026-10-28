import "server-only";
import { db } from "@/db";
import { emailLogs } from "@/db/schema";
import { SITE_MOTTO, SITE_NAME } from "./constants";

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

/** גרסת הטקסט הרגיל: סימן כיוון ימין-לשמאל (RLM) בתחילת כל שורה, כדי שגם היא תוצג מימין לשמאל */
const rtlPlain = (t: string) => t.split("\n").map((l) => (l.trim() ? "\u200F" + l : l)).join("\n");

async function transportAppsScript(input: SendMailInput): Promise<{ ok: boolean; error?: string }> {
  const url = process.env.MAIL_SCRIPT_URL;
  if (!url) return { ok: false, error: "MAIL_SCRIPT_URL לא מוגדר" };

  // הסקריפט מפענח fileName/fileContent תמיד – אם אין קובץ אמיתי שולחים placeholder זעיר, ו-noAttachment:true גורם לסקריפט לא לצרף אותו למייל
  const attachment = input.attachment ?? {
    fileName: "message.txt",
    base64: Buffer.from(`נשלח ממערכת ${SITE_NAME}`).toString("base64"),
    mimeType: "text/plain",
  };

  const payload = {
    to: joinAddr(input.to),
    cc: joinAddr(input.cc),
    subject: input.subject,
    body: rtlPlain(input.text),
    htmlBody: input.html ?? "",
    fromName: process.env.MAIL_FROM_NAME ?? SITE_NAME,
    // הסקריפט המשותף ("מערכת מייל פתוח") מכבד senderName בלבד; בלעדיו השם נשאר 'גמ"ח שמלות'
    senderName: process.env.MAIL_FROM_NAME ?? SITE_NAME,
    fileName: attachment.fileName,
    fileContent: attachment.base64,
    mimeType: attachment.mimeType ?? "application/octet-stream",
    ...(input.attachment ? {} : { noAttachment: true }),
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

/**
 * עיצוב המייל – בסגנון האתר ("פנקס המורה"): נייר קרמי, כותרת בדיו כחול-נייבי, קו שוליים אדום,
 * קו מכחול אדום מתחת לכותרת (public/images/mail-underline.png), ובסוף – הלוגו של האתר (public/images/mail-logo.png, גרסה קלה של הלוגו).
 * הכול inline + טבלאות, כדי שיוצג נכון ב-Gmail/Outlook.
 */
const MAIL = {
  navy: "#33456e",
  navyDeep: "#212f4d",
  paper: "#fbf9f5",
  red: "#b23a2e",
  mustard: "#d9a441",
  ink: "#2e2a20",
  muted: "#756b57",
  line: "#e6dfd0",
};

export function layoutHtml(title: string, bodyHtml: string, cta?: { label: string; href: string }) {
  const site = siteUrl();
  // אותם פונטים כמו באתר (Assistant לגוף, גברת לוין לכותרות). נטענים מ-Google Fonts בלקוחות שתומכים (Apple Mail, Outlook חדש, אפליקציות מובייל);
  // ב-Gmail הם נחסמים, ולכן יש גיבוי ל-Arial/Segoe UI.
  const font = "Assistant,'Segoe UI',Arial,sans-serif";
  const hand = "'Gveret Levin',Assistant,'Segoe UI',Arial,sans-serif";
  return `<!doctype html><html dir="rtl" lang="he"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><link href="https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700;800&family=Gveret+Levin&display=swap" rel="stylesheet"><style>@import url('https://fonts.googleapis.com/css2?family=Assistant:wght@400;600;700;800&family=Gveret+Levin&display=swap');</style></head>
<body dir="rtl" style="margin:0;padding:0;background:${MAIL.paper};font-family:${font};color:${MAIL.ink};direction:rtl;text-align:right">
<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${MAIL.paper};direction:rtl"><tr><td align="center" style="padding:28px 14px;direction:rtl">
 <table role="presentation" dir="rtl" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;direction:rtl;text-align:right">
  <tr><td dir="rtl" align="right" style="direction:rtl;text-align:right;background:${MAIL.navy};border-radius:16px 16px 0 0;padding:20px 28px;border-bottom:4px solid ${MAIL.mustard}">
    <div style="font-family:${hand};font-size:28px;font-weight:400;color:#ffffff">${esc(SITE_NAME)}</div>
    <div style="font-size:13px;color:#dbe1ee;margin-top:2px">בית לחומרי הבגרות</div>
  </td></tr>
  <tr><td dir="rtl" align="right" style="direction:rtl;text-align:right;background:#ffffff;border:1px solid ${MAIL.line};border-top:0;border-right:5px solid ${MAIL.red};padding:30px 30px 8px;line-height:1.75;font-size:17px;color:${MAIL.ink}">
    <h2 style="margin:0 0 16px;font-family:${hand};color:${MAIL.navy};font-size:26px;line-height:1.35;font-weight:400">
      <span style="display:inline-block">${esc(title.replace(/[!?.]+$/, ""))}<span style="color:${MAIL.red}">!</span><img src="${site}/images/mail-underline.png" width="100%" height="12" alt="" style="display:block;width:100%;height:12px;margin-top:3px;border:0"></span>
    </h2>
    ${bodyHtml}
    ${
      cta
        ? `<table role="presentation" dir="rtl" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 10px;direction:rtl"><tr><td style="background:${MAIL.navy};border-radius:999px;border-bottom:3px solid ${MAIL.mustard}"><a href="${cta.href}" style="display:inline-block;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;padding:12px 30px">${esc(cta.label)}</a></td></tr></table>`
        : ""
    }
  </td></tr>
  <tr><td style="background:#ffffff;border:1px solid ${MAIL.line};border-top:0;border-right:5px solid ${MAIL.red};border-radius:0 0 16px 16px;padding:8px 30px 26px" align="center">
    <div style="border-top:1px dashed ${MAIL.line};margin:0 0 18px"></div>
    <a href="${site}" style="text-decoration:none"><img src="${site}/images/mail-logo.png" width="220" alt="${esc(SITE_NAME)} – בית לחומרי הבגרות" style="display:block;margin:0 auto;width:220px;max-width:100%;height:auto;border:0"></a>
    <div style="font-size:13px;color:${MAIL.navy};font-weight:700;margin-top:10px">${esc(SITE_MOTTO)}</div>
  </td></tr>
  <tr><td align="center" style="padding:16px 10px 0;color:${MAIL.muted};font-size:11.5px;line-height:1.6">
    © ${esc(SITE_NAME)} · כל הזכויות שמורות<br>כל קובץ מוטבע במספר אישי של המורידה
  </td></tr>
 </table>
</td></tr></table></body></html>`;
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
         <p>המספר האישי שלך: <b style="font-size:18px;letter-spacing:1px;color:#33456e">${esc(personalCode)}</b><br>
         <span style="color:#756b57;font-size:13px">מספר זה מוטבע על כל קובץ שאת מורידה – שמרי עליו ואל תעבירי קבצים הלאה.</span></p>`,
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
  /** למנהלת: מורה ביקשה עזרה בהשלמת התשלום בנדרים פלוס (דף התשלום לא נפתח / בעיה אחרת) */
  payAssistAdmin(raw: { userName: string; email: string; phone: string | null; reference: string; planLabel: string; amountText: string }) {
    // נתוני משתמשת נכנסים לשורת הנושא – בלי שורות חדשות (הזרקת כותרות מייל) ובאורך סביר
    const line = (s: string | null | undefined, max = 80) => String(s ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, max);
    const input = { ...raw, userName: line(raw.userName), email: line(raw.email, 120), reference: line(raw.reference, 16), planLabel: line(raw.planLabel) };
    const url = `${siteUrl()}/admin/payments?ref=${encodeURIComponent(input.reference)}`;
    const phone = line(input.phone, 20) || "לא ידוע";
    return {
      subject: `בקשה להשלמת תשלום דרך המנהלת – ${input.userName} (${input.reference})`,
      text: `${input.userName} (${input.email}, טלפון ${phone}) התחילה תשלום באתר על ${input.planLabel} (${input.amountText}) וביקשה עזרה בהשלמתו (דף התשלום של נדרים פלוס לא נפתח או בעיה אחרת).\n\nמזהה הבקשה: ${input.reference}\nאחרי שהתשלום יתקבל (בנדרים / טלפונית / העברה) – לאשר ידנית במסך "תשלומים (נדרים)": ${url}`,
      html: layoutHtml(
        "בקשה להשלמת תשלום דרך המנהלת",
        `<p><b>${esc(input.userName)}</b> (<a href="mailto:${esc(input.email)}">${esc(input.email)}</a>, טלפון <b dir="ltr">${esc(phone)}</b>) התחילה תשלום באתר על <b>${esc(input.planLabel)}</b> (${esc(input.amountText)}) וביקשה עזרה בהשלמתו (דף התשלום של נדרים פלוס לא נפתח או בעיה אחרת).</p>
         <p>מזהה הבקשה: <b dir="ltr">${esc(input.reference)}</b><br><span style="color:#756b57;font-size:13px">אחרי שהתשלום יתקבל (בנדרים / טלפונית / העברה) – לאשר ידנית במסך "תשלומים (נדרים)", והמנוי ייפתח אוטומטית.</span></p>`,
        { label: "לבקשת התשלום", href: url },
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
      text: `שלום ${name},\n\n${replier} הגיבה להודעה שלך "${threadTitle}".\n${url}`,
      html: layoutHtml(
        "תגובה חדשה להודעה שלך",
        `<p>שלום ${esc(name)},</p><p><b>${esc(replier)}</b> הגיבה להודעה <b>"${esc(threadTitle)}"</b>.</p>`,
        { label: "לצפייה בתגובה", href: url },
      ),
    };
  },
  contact(name: string, email: string, message: string, topic?: string) {
    const topicText = topic ? `נושא: ${topic}\n` : "";
    const topicHtml = topic ? `<br>נושא: <b>${esc(topic)}</b>` : "";
    return {
      subject: `פנייה מהאתר${topic ? ` (${topic})` : ""}: ${name}`,
      text: `פנייה חדשה מטופס צור קשר\nשם: ${name}\nמייל: ${email}\n${topicText}\n${message}`,
      html: layoutHtml(
        "פנייה חדשה מטופס צור קשר",
        `<p>שם: <b>${esc(name)}</b><br>מייל: <a href="mailto:${esc(email)}">${esc(email)}</a>${topicHtml}</p><p style="white-space:pre-wrap">${esc(message)}</p>`,
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
         <p style="color:#756b57;font-size:13px">אם לא ביקשת איפוס – אפשר להתעלם מהודעה זו, הסיסמה שלך נשארת ללא שינוי.</p>`,
        { label: "לבחירת סיסמה חדשה", href: url },
      ),
    };
  },
  /** הגדרת/שינוי סיסמה לחשבון מחובר (בעיקר מי שנכנסת עם גוגל ואין לה סיסמה) – מהאזור האישי */
  passwordSetup(name: string, url: string) {
    return {
      subject: `הגדרת סיסמה לחשבון – ${SITE_NAME}`,
      text: `שלום ${name},\n\nביקשת להגדיר סיסמה לחשבון שלך באתר ${SITE_NAME}, כדי שתוכלי להתחבר גם עם המייל והסיסמה (ההתחברות עם Google תמשיך לעבוד כרגיל).\nלבחירת הסיסמה היכנסי לקישור (בתוקף לשעה):\n${url}\n\nאם לא ביקשת זאת – אפשר להתעלם מהודעה זו, שום דבר בחשבון לא ישתנה.`,
      html: layoutHtml(
        "הגדרת סיסמה לחשבון",
        `<p>שלום ${esc(name)},</p><p>ביקשת להגדיר סיסמה לחשבון שלך, כדי שתוכלי להתחבר גם עם המייל והסיסמה. ההתחברות עם Google תמשיך לעבוד כרגיל. הקישור בתוקף <b>לשעה אחת</b>.</p>
         <p style="color:#756b57;font-size:13px">אם לא ביקשת זאת – אפשר להתעלם מהודעה זו, שום דבר בחשבון לא ישתנה.</p>`,
        { label: "לבחירת סיסמה", href: url },
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
         <p style="color:#756b57;font-size:13px">אם לא ביקשת זאת – אפשר להתעלם מהודעה זו, כתובת המייל שלך לא תשתנה.</p>`,
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
