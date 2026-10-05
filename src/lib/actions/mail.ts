"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, gt, isNull, or, inArray } from "drizzle-orm";
import { db } from "@/db";
import { users, purchases } from "@/db/schema";
import { requireAdmin, getCurrentUser } from "@/lib/session";
import { adminEmail, sendMail, templates, type MailAttachment } from "@/lib/mail";
import { logAudit } from "@/lib/audit";
import { TOO_MANY_MESSAGE, clientIp, limitKey, tooMany } from "@/lib/rate-limit";

export type MailState = { error?: string; ok?: string } | undefined;

const MAX_ATTACHMENT = 20 * 1024 * 1024;

async function readAttachment(form: FormData): Promise<MailAttachment | undefined> {
  const f = form.get("attachment");
  if (!(f instanceof File) || f.size === 0) return undefined;
  if (f.size > MAX_ATTACHMENT) throw new Error("הקובץ המצורף גדול מ-20MB");
  const buf = Buffer.from(await f.arrayBuffer());
  return { fileName: f.name, base64: buf.toString("base64"), mimeType: f.type || "application/octet-stream" };
}

const emailList = z
  .string()
  .trim()
  .transform((s) => s.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean))
  .pipe(z.array(z.string().email("כתובת מייל לא תקינה")));

const sendSchema = z.object({
  to: emailList,
  cc: z.string().trim().optional(),
  subject: z.string().trim().min(1, "נא להזין נושא").max(300),
  body: z.string().trim().min(1, "נא להזין תוכן").max(20000),
});

/** שליחה ידנית מאזור הניהול (כמו מודאל "שליחת מייל" במודל) */
export async function sendManualMail(_prev: MailState, form: FormData): Promise<MailState> {
  const admin = await requireAdmin();
  const parsed = sendSchema.safeParse({
    to: form.get("to"),
    cc: form.get("cc") ?? "",
    subject: form.get("subject"),
    body: form.get("body"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { to, cc, subject, body } = parsed.data;
  if (!to.length) return { error: "נא להזין נמען" };

  let attachment: MailAttachment | undefined;
  try {
    attachment = await readAttachment(form);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה בקובץ" };
  }

  const r = await sendMail({
    to,
    cc: cc ? cc.split(/[,;\s]+/).filter(Boolean) : undefined,
    ...templates.manual(subject, body),
    attachment,
    kind: "manual",
    sentById: admin.id,
  });
  await logAudit({
    actorId: admin.id,
    action: "mail.manual",
    entityType: "email",
    entityId: r.logId || null,
    details: {
      to,
      cc: cc || null,
      subject,
      attachment: attachment?.fileName ?? null,
      result: r.ok ? "success" : "error",
      error: r.ok ? null : r.error,
    },
  });
  revalidatePath("/admin/mail");
  return r.ok ? { ok: "המייל נשלח בהצלחה" } : { error: "השליחה נכשלה: " + r.error };
}

const broadcastSchema = z.object({
  audience: z.enum(["all", "premium", "subscribers"]),
  subject: z.string().trim().min(1, "נא להזין נושא").max(300),
  body: z.string().trim().min(1, "נא להזין תוכן").max(20000),
});

/** דיוור לקבוצת משתמשות: כולן / פרימיום / מנויות פעילות */
export async function broadcastMail(_prev: MailState, form: FormData): Promise<MailState> {
  const admin = await requireAdmin();
  const parsed = broadcastSchema.safeParse({
    audience: form.get("audience"),
    subject: form.get("subject"),
    body: form.get("body"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { audience, subject, body } = parsed.data;

  let recipients: { id: number; email: string; name: string }[] = [];
  const base = db.select({ id: users.id, email: users.email, name: users.name }).from(users);
  if (audience === "all") {
    recipients = await base;
  } else {
    const now = new Date();
    const cond =
      audience === "premium"
        ? and(eq(purchases.premium, true), or(isNull(purchases.endsAt), gt(purchases.endsAt, now)))
        : and(
            inArray(purchases.plan, ["subject_monthly", "custom_monthly", "yearly"]),
            or(isNull(purchases.endsAt), gt(purchases.endsAt, now)),
          );
    const ids = await db.selectDistinct({ id: purchases.userId }).from(purchases).where(cond);
    if (ids.length) recipients = await base.where(inArray(users.id, ids.map((r) => r.id)));
  }

  if (!recipients.length) {
    await logAudit({
      actorId: admin.id,
      action: "mail.broadcast_denied",
      entityType: "email",
      details: { audience, subject, reason: "no_recipients" },
    });
    return { error: "לא נמצאו נמענות בקבוצה שנבחרה" };
  }

  let attachment: MailAttachment | undefined;
  try {
    attachment = await readAttachment(form);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "שגיאה בקובץ" };
  }

  let ok = 0;
  let fail = 0;
  for (const r of recipients) {
    const res = await sendMail({
      to: r.email,
      ...templates.manual(subject, body.replaceAll("{שם}", r.name)),
      attachment,
      kind: "broadcast",
      userId: r.id,
      sentById: admin.id,
    });
    if (res.ok) ok++;
    else fail++;
  }
  await logAudit({
    actorId: admin.id,
    action: "mail.broadcast",
    entityType: "email",
    details: {
      audience,
      subject,
      attachment: attachment?.fileName ?? null,
      recipients: recipients.length,
      ok,
      fail,
    },
  });
  revalidatePath("/admin/mail");
  return fail ? { error: `נשלחו ${ok}, נכשלו ${fail} (ראי בלוג)` } : { ok: `נשלחו ${ok} מיילים בהצלחה` };
}

const contactSchema = z.object({
  name: z.string().trim().min(2, "נא להזין שם").max(120),
  email: z.string().trim().toLowerCase().email("כתובת מייל לא תקינה"),
  message: z.string().trim().min(5, "כתבי כמה מילים").max(5000),
  website: z.string().max(0).optional(), // honeypot
});

/** טופס צור קשר (ציבורי) – נשלח למנהל */
export async function contactAction(_prev: MailState, form: FormData): Promise<MailState> {
  const parsed = contactSchema.safeParse({
    name: form.get("name"),
    email: form.get("email"),
    message: form.get("message"),
    website: form.get("website") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  // הגבלת קצב (בנוסף ל-honeypot): 3 פניות לשעה לכל IP
  if (await tooMany(limitKey("contact", "ip", await clientIp()), 3, 3600)) return { error: TOO_MANY_MESSAGE };
  const admin = adminEmail();
  if (!admin) return { error: "כתובת המנהל לא מוגדרת" };
  const { name, email, message } = parsed.data;
  const r = await sendMail({ to: admin, ...templates.contact(name, email, message), kind: "contact" });
  return r.ok ? { ok: "הפנייה נשלחה, נחזור אלייך בהקדם" } : { error: "השליחה נכשלה, נסי שוב מאוחר יותר" };
}

const faqQuestionSchema = z.object({
  question: z.string().trim().min(5, "כתבי כמה מילים").max(2000),
  website: z.string().max(0).optional(), // honeypot
});

/** "השאלה שלי" בתיבת השאלות ותשובות בעמוד הבית – נשלח למנהל */
export async function faqQuestionAction(_prev: MailState, form: FormData): Promise<MailState> {
  const parsed = faqQuestionSchema.safeParse({
    question: form.get("question"),
    website: form.get("website") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  // הגבלת קצב (בנוסף ל-honeypot): 3 שאלות לשעה לכל IP
  if (await tooMany(limitKey("faq-question", "ip", await clientIp()), 3, 3600)) return { error: TOO_MANY_MESSAGE };
  const admin = adminEmail();
  if (!admin) return { error: "כתובת המנהל לא מוגדרת" };
  const user = await getCurrentUser();
  const r = await sendMail({
    to: admin,
    ...templates.faqQuestion(user?.name ?? null, user?.email ?? null, parsed.data.question),
    kind: "faq_question",
    userId: user?.id ?? null,
  });
  return r.ok ? { ok: "השאלה נשלחה, תודה! נשמח לענות לך ואולי גם להוסיף אותה כאן" } : { error: "השליחה נכשלה, נסי שוב מאוחר יותר" };
}
