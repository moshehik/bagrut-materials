"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { contactInquiries, contactInquiryMessages } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { sendMail } from "@/lib/mail";
import { logAudit } from "@/lib/audit";
import { MAX_REPLY, buildReplyBody, cleanSubject, isInquiryStatus } from "@/lib/inquiry-logic";

export type InquiryState = { error?: string; ok?: string } | undefined;

const replySchema = z.object({
  id: z.coerce.number().int().positive(),
  subject: z.string().transform(cleanSubject).pipe(z.string().min(2, "נא להזין נושא")),
  body: z.string().trim().min(2, "כתבי כמה מילים בתשובה").max(MAX_REPLY, "התשובה ארוכה מדי"),
});

/** שליחת תשובה לפונה במייל (מכתובת האתר) ושמירתה בשיחה. אם השליחה נכשלה – הסטטוס לא משתנה */
export async function replyToInquiryAction(_prev: InquiryState, form: FormData): Promise<InquiryState> {
  const admin = await requireAdmin();
  const parsed = replySchema.safeParse({
    id: form.get("id"),
    subject: form.get("subject") ?? "",
    body: form.get("body") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { id, subject, body } = parsed.data;

  const [inquiry] = await db.select().from(contactInquiries).where(eq(contactInquiries.id, id)).limit(1);
  if (!inquiry) return { error: "הפנייה לא נמצאה" };

  const text = buildReplyBody(body);
  const r = await sendMail({
    to: inquiry.email,
    subject,
    text,
    kind: "inquiry-reply",
    userId: inquiry.userId,
    sentById: admin.id,
  });

  await db.insert(contactInquiryMessages).values({
    inquiryId: id,
    direction: "out",
    subject,
    body: text,
    sentOk: r.ok,
    emailLogId: r.logId || null,
    authorId: admin.id,
  });
  await logAudit({
    actorId: admin.id,
    action: "inquiry.reply",
    entityType: "contact_inquiry",
    entityId: id,
    details: { result: r.ok ? "success" : "error", error: r.ok ? null : r.error },
  });

  if (!r.ok) {
    revalidatePath("/admin/inquiries");
    return { error: "השליחה נכשלה, הפנייה נשארה ממתינה. אפשר לנסות שוב (ר׳ שגיאה בלוג המיילים)." };
  }
  await db
    .update(contactInquiries)
    .set({ status: "answered", answeredAt: new Date(), answeredBy: admin.id })
    .where(eq(contactInquiries.id, id));
  revalidatePath("/admin/inquiries");
  return { ok: `התשובה נשלחה ל-${inquiry.email}` };
}

/** סגירה בלי מענה / סימון כספאם / פתיחה מחדש */
export async function setInquiryStatusAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = Number(form.get("id"));
  const status = form.get("status");
  if (!Number.isInteger(id) || id <= 0 || !isInquiryStatus(status) || status === "answered") return;
  await db
    .update(contactInquiries)
    .set({ status })
    .where(eq(contactInquiries.id, id));
  await logAudit({
    actorId: admin.id,
    action: "inquiry.status",
    entityType: "contact_inquiry",
    entityId: id,
    details: { status },
  });
  revalidatePath("/admin/inquiries");
}
