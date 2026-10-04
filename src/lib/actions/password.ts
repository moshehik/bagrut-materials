"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "@/db";
import { authTokens, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { sendMail, sendMailInBackground, siteUrl, templates } from "@/lib/mail";
import { logAudit } from "@/lib/audit";
import { randomToken } from "@/lib/auth-utils";

export type PasswordState = { error?: string; ok?: boolean; message?: string } | undefined;

const RESET_TTL_MS = 60 * 60 * 1000; // שעה
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // יממה

/** בקשת איפוס סיסמה – תמיד מחזירה הצלחה (בלי לחשוף אם המייל קיים) */
export async function requestPasswordReset(_: PasswordState, form: FormData): Promise<PasswordState> {
  const parsed = z.string().trim().toLowerCase().email("כתובת מייל לא תקינה").safeParse(form.get("email"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const email = parsed.data;

  const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (u && !u.suspended) {
    const token = randomToken(24);
    await db.insert(authTokens).values({
      userId: u.id,
      token,
      purpose: "reset",
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    });
    const url = `${siteUrl()}/reset-password?token=${token}`;
    sendMailInBackground({
      to: u.email,
      ...templates.passwordReset(u.name, url),
      kind: "password_reset",
      userId: u.id,
    });
    await logAudit({ actorId: u.id, action: "password.reset_request", entityType: "user", entityId: u.id });
  } else {
    // לא חושפים כלום למשתמשת – התגובה זהה; הרישום פנימי בלבד
    await logAudit({
      actorId: u?.id ?? null,
      action: "password.reset_request",
      entityType: "user",
      entityId: u?.id ?? null,
      details: u ? { unknown: true, suspended: true } : { unknown: true },
    });
  }
  return { ok: true, message: "אם הכתובת רשומה אצלנו – שלחנו אלייך מייל עם קישור לאיפוס הסיסמה." };
}

const resetSchema = z
  .object({
    token: z.string().min(10, "קישור לא תקין"),
    password: z.string().min(6, "סיסמה של 6 תווים לפחות"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { message: "הסיסמאות אינן תואמות", path: ["confirm"] });

/** איפוס סיסמה בעזרת טוקן */
export async function resetPassword(_: PasswordState, form: FormData): Promise<PasswordState> {
  const parsed = resetSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { token, password } = parsed.data;

  const [t] = await db
    .select()
    .from(authTokens)
    .where(
      and(
        eq(authTokens.token, token),
        eq(authTokens.purpose, "reset"),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!t) {
    await logAudit({ action: "password.reset_failed", entityType: "user", details: { reason: "invalid_or_expired" } });
    return { error: "הקישור אינו תקף או שפג תוקפו. בקשי קישור חדש." };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await db.update(users).set({ passwordHash }).where(eq(users.id, t.userId));
  await db.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, t.id));
  await logAudit({ actorId: t.userId, action: "password.reset", entityType: "user", entityId: t.userId });
  return { ok: true, message: "הסיסמה עודכנה בהצלחה. אפשר להתחבר עם הסיסמה החדשה." };
}

/** שליחת מייל אימות למשתמשת המחוברת */
export async function sendVerificationEmail(): Promise<PasswordState> {
  const user = await getCurrentUser();
  if (!user) return { error: "יש להתחבר" };
  if (user.emailVerified) return { ok: true, message: "כתובת המייל כבר מאומתת." };

  const token = randomToken(24);
  await db.insert(authTokens).values({
    userId: user.id,
    token,
    purpose: "verify",
    expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
  });
  const url = `${siteUrl()}/api/auth/verify?token=${token}`;
  const r = await sendMail({
    to: user.email,
    ...templates.verifyEmail(user.name, url),
    kind: "verify_email",
    userId: user.id,
  });
  if (!r.ok) return { error: "שליחת המייל נכשלה. נסי שוב מאוחר יותר." };
  await logAudit({ actorId: user.id, action: "email.verify_request", entityType: "user", entityId: user.id });
  return { ok: true, message: `שלחנו מייל אימות אל ${user.email}. בדקי גם בתיקיית הספאם.` };
}
