import "server-only";
import { createHash } from "crypto";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type User } from "@/db/schema";

const COOKIE = "bagrut_session";

/**
 * טוקני אימות (איפוס סיסמה / אימות מייל / שינוי מייל) נשמרים ב-auth_tokens כ-SHA-256 של הטוקן
 * הגולמי, כך שדליפת הטבלה (או יומן המיילים) לא מאפשרת להשתמש בהם. הטוקן הגולמי נשלח במייל בלבד.
 */
export function hashAuthToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
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

/** uid = מזהה המשתמשת; sv = users.session_version בזמן ההנפקה – סשן עם sv ישן נפסל */
type Payload = { uid: number; sv: number; exp?: number };

export async function createSession(uid: number, sessionVersion = 1) {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const token = await new SignJWT({ uid, sv: sessionVersion } satisfies Payload)
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

async function readPayload(): Promise<{ uid: number; sv: number } | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    // סשנים מלפני הוספת sv נפסלים (התחברות מחדש חד-פעמית) – עדיף מלהשאיר אותם בלתי-ניתנים לביטול
    if (typeof payload.uid !== "number" || typeof payload.sv !== "number") return null;
    return { uid: payload.uid, sv: payload.sv };
  } catch {
    return null;
  }
}

/**
 * המשתמשת המחוברת, או null. מחזיר null גם כשהחשבון מושהה (ההשהיה מנתקת מיד, לא רק חוסמת
 * התחברות) וכש-sv בסשן אינו הגרסה הנוכחית (סיסמה שונתה/אופסה, השהיה).
 * הודעת "החשבון מושהה" בהתחברות עדיין עובדת – loginAction קורא את המשתמשת ישירות מה-DB.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const p = await readPayload();
  if (!p) return null;
  const [u] = await db.select().from(users).where(eq(users.id, p.uid)).limit(1);
  if (!u || u.suspended || u.sessionVersion !== p.sv) return null;
  return u;
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
