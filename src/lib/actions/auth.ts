"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, destroySession, getCurrentUser } from "@/lib/session";
import { sendMailInBackground, templates } from "@/lib/mail";
import { logAudit } from "@/lib/audit";
import { getBool } from "@/lib/settings";
import { genPersonalCode, safeNextPath } from "@/lib/auth-utils";
import { personName, phoneSchema } from "@/lib/profile-validation";
import { TOO_MANY_MESSAGE, clientIp, limitKey, tooMany } from "@/lib/rate-limit";

export type ActionState = { error?: string } | undefined;

const registerSchema = z.object({
  firstName: personName("יש להזין שם פרטי תקין"),
  lastName: personName("יש להזין שם משפחה תקין"),
  email: z.string().trim().toLowerCase().email("כתובת מייל לא תקינה"),
  phone: phoneSchema,
  password: z.string().min(6, "סיסמה של 6 תווים לפחות"),
  /** אישור דיוור – אופציונלי */
  marketing: z.string().optional(),
  /** התחייבות לתקנון – חובה */
  terms: z.literal("on", { message: "כדי להירשם יש לאשר את תקנון האתר" }),
});

export async function registerAction(_: ActionState, form: FormData): Promise<ActionState> {
  if (!(await getBool("registration_open"))) {
    await logAudit({ action: "register.failed", entityType: "user", details: { reason: "closed" } });
    return { error: "ההרשמה סגורה כרגע" };
  }
  const parsed = registerSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    await logAudit({ action: "register.failed", entityType: "user", details: { reason: "invalid_input" } });
    return { error: parsed.error.issues[0].message };
  }
  const { firstName, lastName, email, phone, password, marketing } = parsed.data;
  // הגבלת קצב: 5 הרשמות לשעה מאותו IP (בוטים שיוצרים חשבונות בכמות)
  if (await tooMany(limitKey("register", "ip", await clientIp()), 5, 3600)) {
    await logAudit({ action: "register.failed", entityType: "user", details: { reason: "rate_limited" } });
    return { error: TOO_MANY_MESSAGE };
  }
  const name = `${firstName} ${lastName}`;

  const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (exists) {
    await logAudit({ action: "register.failed", entityType: "user", details: { reason: "duplicate_email" } });
    return { error: "כתובת המייל כבר רשומה. אפשר להתחבר." };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  let personalCode = genPersonalCode();
  for (let i = 0; i < 5; i++) {
    const [dup] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.personalCode, personalCode));
    if (!dup) break;
    personalCode = genPersonalCode();
  }

  const [u] = await db
    .insert(users)
    .values({
      name,
      firstName,
      lastName,
      marketingConsent: marketing === "on",
      termsAcceptedAt: new Date(),
      email,
      phone,
      passwordHash,
      personalCode,
      // הרשמה בסיסמה לעולם אינה מעניקה ניהול – הכתובת לא אומתה, וכל אחד יכול להקליד כתובת
      // מ-ADMIN_EMAILS. ניהול דרך ADMIN_EMAILS ניתן רק בקולבק של גוגל (עם email_verified)
      role: "user",
    })
    .returning({ id: users.id, sessionVersion: users.sessionVersion });

  await createSession(u.id, u.sessionVersion);
  await logAudit({ actorId: u.id, action: "register", entityType: "user", entityId: u.id });
  sendMailInBackground({
    to: email,
    ...templates.welcome(name, personalCode),
    kind: "welcome",
    userId: u.id,
  });
  redirect("/");
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("כתובת מייל לא תקינה"),
  password: z.string().min(1, "נא להזין סיסמה"),
  next: z.string().optional(),
});

/**
 * hash "דמה" להשוואה כשהמייל לא קיים – כדי שזמן התגובה לא יסגיר אם הכתובת רשומה
 * (bcrypt.compare לוקח ~100ms; בלעדיו מייל לא-קיים חוזר מיד). מחושב פעם אחת לכל instance.
 */
let dummyHash: Promise<string> | null = null;
const getDummyHash = () => (dummyHash ??= bcrypt.hash("dummy-password-for-timing", 10));

export async function loginAction(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    await logAudit({ action: "login.failed", entityType: "user", details: { reason: "invalid_input" } });
    return { error: parsed.error.issues[0].message };
  }
  const { email, password, next } = parsed.data;
  // הגבלת קצב: 8 ניסיונות ל-15 דקות לכל כתובת מייל, 30 לכל IP (ניחוש סיסמאות)
  if (
    (await tooMany(limitKey("login", "email", email), 8, 900)) ||
    (await tooMany(limitKey("login", "ip", await clientIp()), 30, 900))
  ) {
    await logAudit({ action: "login.failed", entityType: "user", details: { email, reason: "rate_limited" } });
    return { error: TOO_MANY_MESSAGE };
  }

  const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  const passwordOk = u ? await bcrypt.compare(password, u.passwordHash) : false;
  if (!u) await bcrypt.compare(password, await getDummyHash()); // השוואת דמה – ר' למעלה
  if (!u || !passwordOk) {
    await logAudit({
      actorId: u?.id ?? null,
      action: "login.failed",
      entityType: "user",
      entityId: u?.id ?? null,
      details: { email },
    });
    return { error: "מייל או סיסמה שגויים" };
  }
  if (u.suspended) {
    await logAudit({
      actorId: u.id,
      action: "login.failed",
      entityType: "user",
      entityId: u.id,
      details: { reason: "suspended" },
    });
    return { error: "החשבון מושהה. פני למנהלת האתר." };
  }
  await createSession(u.id, u.sessionVersion);
  await logAudit({ actorId: u.id, action: "login", entityType: "user", entityId: u.id });
  redirect(safeNextPath(next));
}

export async function logoutAction() {
  // קוראים את המשתמשת לפני שהסשן נהרס, כדי לדעת מי התנתקה
  // אם ה-DB נופל כרגע — היציאה חייבת להצליח בכל זאת, אז הזיהוי לצורך הלוג הוא best-effort
  const current = await getCurrentUser().catch(() => null);
  await destroySession();
  await logAudit({
    actorId: current?.id ?? null,
    action: "logout",
    entityType: "user",
    entityId: current?.id ?? null,
  });
  redirect("/");
}
