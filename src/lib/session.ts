import "server-only";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type User } from "@/db/schema";

const COOKIE = "bagrut_session";
/**
 * סוד החתימה. ה-repo ציבורי, ולכן ברירת־המחדל של הפיתוח אסורה בפרודקשן:
 * בלי SESSION_SECRET אמיתי כל אחד יכול לזייף session של מנהלת.
 */
export function sessionSecretString(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET חסר או קצר מדי (נדרשים 32 תווים לפחות)");
  }
  return s || "dev-secret-change-me";
}
const secret = () => new TextEncoder().encode(sessionSecretString());

type Payload = { uid: number; exp?: number };

export async function createSession(uid: number) {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const token = await new SignJWT({ uid } satisfies Payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

async function readUid(): Promise<number | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return typeof payload.uid === "number" ? payload.uid : null;
  } catch {
    return null;
  }
}

export const getCurrentUser = cache(async (): Promise<User | null> => {
  const uid = await readUid();
  if (!uid) return null;
  const [u] = await db.select().from(users).where(eq(users.id, uid)).limit(1);
  return u ?? null;
});

export async function requireUser(): Promise<User> {
  const u = await getCurrentUser();
  if (!u) throw new Error("UNAUTHENTICATED");
  return u;
}

export async function requireAdmin(): Promise<User> {
  const u = await getCurrentUser();
  if (!u || u.role !== "admin") throw new Error("FORBIDDEN");
  return u;
}

/**
 * שומר לעמודי הניהול. חובה בראש כל page תחת /admin: ה-layout לבדו אינו מגן,
 * כי בניווט RSC חלקי השרת מרנדר את העמוד בלי להריץ את ה-layout.
 */
export async function requireAdminPage(): Promise<User> {
  const u = await getCurrentUser();
  if (!u) redirect("/login?next=/admin");
  if (u.role !== "admin") notFound();
  return u;
}
