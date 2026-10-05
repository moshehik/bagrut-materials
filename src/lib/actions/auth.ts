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
  const name = `${firstName} ${lastName}`;

  const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (exists) {
    await logAudit({ action: "register.failed", entityType: "user", details: { reason: "duplicate_email" } });
    return { error: "כתובת המייל כבר רשומה. אפשר להתחבר." };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

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
      role: adminEmails.includes(email) ? "admin" : "user",
    })
    .returning({ id: users.id });

  await createSession(u.id);
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

export async function loginAction(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    await logAudit({ action: "login.failed", entityType: "user", details: { reason: "invalid_input" } });
    return { error: parsed.error.issues[0].message };
  }
  const { email, password, next } = parsed.data;

  const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!u || !(await bcrypt.compare(password, u.passwordHash))) {
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
  await createSession(u.id);
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
