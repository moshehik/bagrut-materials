import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

/** מספר אישי – 8 תווים קריאים (ללא O/0/I/1) בפורמט XXXX-XXXX */
export function genPersonalCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

/** מספר אישי ייחודי (בודק כפילויות במסד) */
export async function uniquePersonalCode() {
  let personalCode = genPersonalCode();
  for (let i = 0; i < 5; i++) {
    const [dup] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.personalCode, personalCode));
    if (!dup) break;
    personalCode = genPersonalCode();
  }
  return personalCode;
}

/** האם המייל שייך למנהלת (ADMIN_EMAILS) */
export function isAdminEmail(email: string) {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

/** טוקן אקראי (hex) */
export function randomToken(bytes = 24) {
  return randomBytes(bytes).toString("hex");
}

/** נתיב חזרה בטוח – רק נתיב יחסי באותו origin */
export function safeNextPath(next: string | null | undefined, fallback = "/account") {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
