"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { authTokens, purchases, users, userInterests } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { sendMail, sendMailInBackground, adminEmail, siteUrl, templates } from "@/lib/mail";
import { logAudit } from "@/lib/audit";
import { randomToken } from "@/lib/auth-utils";
import { PLANS } from "@/lib/constants";
import { normalizeIsraeliPhone, PHONE_ERROR } from "@/lib/phone";
import { citySchema, phoneSchema, schoolSchema } from "@/lib/profile-validation";

export type ProfileState = { error?: string; ok?: boolean; message?: string } | undefined;

const EMAIL_CHANGE_TTL_MS = 24 * 60 * 60 * 1000;

/** מסכה לטלפון ביומן – רק 3 הספרות האחרונות */
function maskPhone(p: string | null | undefined): string | null {
  if (!p) return null;
  const digits = p.replace(/\D/g, "");
  return `***${digits.slice(-3)}`;
}

const nameSchema =z.object({ name: z.string().trim().min(2, "שם קצר מדי").max(120) });

/** עדכון שם תצוגה */
export async function updateNameAction(_: ProfileState, form: FormData): Promise<ProfileState> {
  const user = await requireUser();
  const parsed = nameSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  await db.update(users).set({ name: parsed.data.name }).where(eq(users.id, user.id));
  await logAudit({
    actorId: user.id,
    action: "profile.update_name",
    entityType: "user",
    entityId: user.id,
    details: { from: user.name, to: parsed.data.name },
  });
  return { ok: true, message: "השם עודכן בהצלחה." };
}

/** עדכון/השלמת טלפון. עם next (מעמוד ההשלמה שלפני הורדה) – מפנה לשם אחרי השמירה */
export async function updatePhoneAction(_: ProfileState, form: FormData): Promise<ProfileState> {
  const user = await requireUser();
  const phone = normalizeIsraeliPhone(String(form.get("phone") ?? ""));
  if (!phone) return { error: PHONE_ERROR };

  await db.update(users).set({ phone }).where(eq(users.id, user.id));
  await logAudit({
    actorId: user.id,
    action: "profile.update_phone",
    entityType: "user",
    entityId: user.id,
    details: { from: maskPhone(user.phone), to: maskPhone(phone) },
  });

  const next = String(form.get("next") ?? "");
  if (next.startsWith("/") && !next.startsWith("//")) redirect(next);
  return { ok: true, message: "הטלפון עודכן בהצלחה." };
}

const completeSchema = z.object({ city: citySchema, school: schoolSchema, phone: phoneSchema });

/** השלמת פרטים אחרי הרשמה דרך גוגל (גוגל לא מוסר עיר, תיכון וטלפון) – הכל חובה */
export async function completeProfileAction(_: ProfileState, form: FormData): Promise<ProfileState> {
  const user = await requireUser();
  const parsed = completeSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { city, school, phone } = parsed.data;

  await db.update(users).set({ city, school, phone }).where(eq(users.id, user.id));
  await logAudit({
    actorId: user.id,
    action: "profile.complete",
    entityType: "user",
    entityId: user.id,
    details: { city, school, phone: maskPhone(phone) },
  });

  const next = String(form.get("next") ?? "");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/account");
}

const pwSchema = z
  .object({
    current: z.string().min(1, "נא להזין את הסיסמה הנוכחית"),
    password: z.string().min(6, "סיסמה של 6 תווים לפחות"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: "הסיסמאות אינן תואמות", path: ["confirm"] });

/** שינוי סיסמה (מזוהה, עם אימות הסיסמה הנוכחית) */
export async function changePasswordAction(_: ProfileState, form: FormData): Promise<ProfileState> {
  const user = await requireUser();
  const parsed = pwSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const ok = await bcrypt.compare(parsed.data.current, user.passwordHash);
  if (!ok) {
    await logAudit({
      actorId: user.id,
      action: "profile.change_password_failed",
      entityType: "user",
      entityId: user.id,
      details: { reason: "wrong_current_password" },
    });
    return { error: "הסיסמה הנוכחית שגויה" };
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await db.update(users).set({ passwordHash }).where(eq(users.id, user.id));
  await logAudit({ actorId: user.id, action: "profile.change_password", entityType: "user", entityId: user.id });
  return { ok: true, message: "הסיסמה עודכנה בהצלחה." };
}

const emailSchema = z.object({ email: z.string().trim().toLowerCase().email("כתובת מייל לא תקינה") });

/** בקשת שינוי כתובת מייל – שולחת קישור אימות לכתובת החדשה, לא משנה מיד */
export async function requestEmailChangeAction(_: ProfileState, form: FormData): Promise<ProfileState> {
  const user = await requireUser();
  const parsed = emailSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const email = parsed.data.email;

  if (email === user.email) return { error: "זו כבר כתובת המייל שלך" };
  const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (exists) return { error: "כתובת המייל כבר בשימוש על ידי חשבון אחר" };

  await db.update(users).set({ pendingEmail: email }).where(eq(users.id, user.id));
  const token = randomToken(24);
  await db.insert(authTokens).values({
    userId: user.id,
    token,
    purpose: "change_email",
    expiresAt: new Date(Date.now() + EMAIL_CHANGE_TTL_MS),
  });
  const url = `${siteUrl()}/api/auth/confirm-email-change?token=${token}`;
  const r = await sendMail({
    to: email,
    ...templates.changeEmailVerify(user.name, email, url),
    kind: "change_email",
    userId: user.id,
  });
  if (!r.ok) return { error: "שליחת המייל נכשלה. נסי שוב מאוחר יותר." };
  await logAudit({
    actorId: user.id,
    action: "profile.email_change_request",
    entityType: "user",
    entityId: user.id,
    details: { newEmail: email },
  });
  return { ok: true, message: `שלחנו קישור אימות לכתובת ${email}. יש ללחוץ עליו כדי להשלים את השינוי.` };
}

/** עדכון נושאי הלימוד שמעניינים את המשתמשת */
export async function updateInterestsAction(form: FormData) {
  const user = await requireUser();
  const ids = form
    .getAll("categoryIds")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);

  await db.delete(userInterests).where(eq(userInterests.userId, user.id));
  if (ids.length) {
    await db.insert(userInterests).values(ids.map((categoryId) => ({ userId: user.id, categoryId })));
  }
  await logAudit({
    actorId: user.id,
    action: "profile.update_interests",
    entityType: "user",
    entityId: user.id,
    details: { categoryIds: ids },
  });
  redirect("/account?interests=1");
}

/** בקשת ביטול מנוי – לא מבטלת מיידית, פונה למנהלת האתר */
export async function requestCancelSubscriptionAction(form: FormData) {
  const user = await requireUser();
  const purchaseId = Number(form.get("purchaseId"));
  if (!Number.isInteger(purchaseId)) redirect("/account");

  const [p] = await db
    .select()
    .from(purchases)
    .where(and(eq(purchases.id, purchaseId), eq(purchases.userId, user.id)));
  if (!p) {
    await logAudit({
      actorId: user.id,
      action: "purchase.cancel_request_failed",
      entityType: "purchase",
      entityId: purchaseId,
      details: { reason: "not_found" },
    });
    redirect("/account");
  }

  await logAudit({
    actorId: user.id,
    action: "purchase.cancel_requested",
    entityType: "purchase",
    entityId: p.id,
    details: { plan: p.plan, premium: p.premium },
  });
  const admin = adminEmail();
  if (admin) {
    sendMailInBackground({
      to: admin,
      subject: `בקשת ביטול מנוי – ${user.name}`,
      text: `${user.name} (${user.email}) ביקשה לבטל את המנוי #${p.id} (${PLANS[p.plan].label}, ${p.premium ? "כולל פרימיום" : "ללא פרימיום"}).\n\nלטיפול: ${siteUrl()}/admin/subscriptions?user=${user.id}`,
      kind: "manual",
      userId: user.id,
    });
  }
  redirect("/account?cancelreq=1");
}
