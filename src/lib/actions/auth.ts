"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, destroySession } from "@/lib/session";

export type ActionState = { error?: string } | undefined;

function genPersonalCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

const registerSchema = z.object({
  name: z.string().trim().min(2, "שם קצר מדי").max(120),
  email: z.string().trim().toLowerCase().email("כתובת מייל לא תקינה"),
  password: z.string().min(6, "סיסמה של 6 תווים לפחות"),
});

export async function registerAction(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, email, password } = parsed.data;

  const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (exists) return { error: "כתובת המייל כבר רשומה. אפשר להתחבר." };

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
      email,
      passwordHash,
      personalCode,
      role: adminEmails.includes(email) ? "admin" : "user",
    })
    .returning({ id: users.id });

  await createSession(u.id);
  redirect("/account");
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("כתובת מייל לא תקינה"),
  password: z.string().min(1, "נא להזין סיסמה"),
  next: z.string().optional(),
});

export async function loginAction(_: ActionState, form: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { email, password, next } = parsed.data;

  const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!u || !(await bcrypt.compare(password, u.passwordHash))) {
    return { error: "מייל או סיסמה שגויים" };
  }
  await createSession(u.id);
  redirect(next && next.startsWith("/") ? next : "/account");
}

export async function logoutAction() {
  await destroySession();
  redirect("/");
}
