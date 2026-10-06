"use server";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { materials, purchases } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { checkEntitlement } from "@/lib/data";
import { logAudit } from "@/lib/audit";
import { FREE_TRIAL_REF, getFreeTrialState } from "@/lib/free-trial";

export type FreeTrialResult = { ok: true; href: string } | { ok: false; error: string };

/** מימוש ההורדה החינמית האחת: יוצר רכישה בודדת של 0 ₪ על החומר שנבחר ומחזיר את כתובת ההורדה */
export async function claimFreeTrialAction(materialId: number): Promise<FreeTrialResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "צריך להתחבר כדי להוריד." };

  const state = await getFreeTrialState(user);
  if (state === "used") return { ok: false, error: "ההורדה החינמית כבר מומשה." };
  if (state === "unverified") return { ok: false, error: "צריך לאמת את כתובת המייל קודם." };
  if (state !== "available") return { ok: false, error: "ההורדה החינמית אינה זמינה כרגע." };

  const [m] = await db.select().from(materials).where(eq(materials.id, materialId)).limit(1);
  if (!m || m.status !== "active") return { ok: false, error: "החומר אינו זמין כרגע." };
  if (!m.allowDownload) return { ok: false, error: "החומר הזה לצפייה בלבד." };

  // מממשים רק כשבלי זה ההורדה הייתה דורשת רכישה – כך ההורדה החינמית לא "נשרפת" על קובץ שנעול ממילא
  const ent = await checkEntitlement(user, m);
  const href = `/api/download/${m.id}`;
  if (ent.ok) return { ok: true, href };
  if (ent.reason !== "purchase") return { ok: false, error: "אי אפשר להשתמש בהורדה החינמית על הקובץ הזה." };

  const [row] = await db
    .insert(purchases)
    .values({
      userId: user.id,
      plan: "single",
      materialId: m.id,
      categoryId: m.categoryId,
      amount: 0,
      downloadsLimit: null,
      endsAt: null,
      paymentRef: FREE_TRIAL_REF,
      notes: "הורדה חינמית אחת",
    })
    .returning({ id: purchases.id });

  // לחיצה כפולה / שתי לשוניות במקביל: נשארת רק השורה הראשונה
  const mine = await db
    .select({ id: purchases.id })
    .from(purchases)
    .where(and(eq(purchases.userId, user.id), eq(purchases.paymentRef, FREE_TRIAL_REF)))
    .orderBy(purchases.id);
  if (mine[0] && mine[0].id !== row.id) {
    await db.delete(purchases).where(eq(purchases.id, row.id));
    return { ok: false, error: "ההורדה החינמית כבר מומשה." };
  }

  await logAudit({
    actorId: user.id,
    action: "free_trial.claim",
    entityType: "material",
    entityId: m.id,
    details: { purchaseId: row.id, title: m.title },
  });
  return { ok: true, href };
}
