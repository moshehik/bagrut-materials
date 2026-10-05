"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/db";
import { categories, purchases } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { logAudit } from "@/lib/audit";
import { YEARLY_INCLUDED_SUBJECTS } from "@/lib/constants";

/*
 * מקצועות המנוי השנתי: נבחרים ברכישה, או אחר כך (כפתור "דלג" בקופה).
 * כל מקצוע = שורה ב-purchases (אותו paymentRef). שורה "ממתינה" = subjectsPending (אין גישה עד הבחירה).
 * כל עוד לא בוצעה הורדה בשורה (downloadsUsed = 0) אפשר להחליף בה מקצוע.
 */

export type SubjectsState = { error?: string; ok?: boolean } | undefined;

const idNum = z.coerce.number().int().positive();

async function rootSubjectIds(ids: number[]) {
  if (!ids.length) return [];
  const rows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(inArray(categories.id, ids), isNull(categories.parentId), eq(categories.status, "active")));
  return rows.map((r) => r.id);
}

/** בחירת המקצועות במנוי שנתי שנרכש עם "דלג" */
export async function chooseYearlySubjectsAction(
  _prev: SubjectsState,
  form: FormData,
): Promise<SubjectsState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account/subjects");

  // תיעוד סירוב בחירת מקצועות (לא משנה את התשובה)
  const denied = async (reason: string, error: string, extra?: Record<string, unknown>): Promise<SubjectsState> => {
    await logAudit({
      actorId: user.id,
      action: "purchase.subjects_denied",
      entityType: "purchase",
      details: { reason, op: "choose", ...extra },
    });
    return { error };
  };

  const purchaseId = idNum.safeParse(form.get("purchaseId"));
  const ids = z.array(idNum).safeParse(form.getAll("categoryIds").map(String).filter(Boolean));
  if (!purchaseId.success || !ids.success) return denied("invalid_input", "נתונים לא תקינים");
  const uniq = [...new Set(ids.data)];
  if (uniq.length !== YEARLY_INCLUDED_SUBJECTS) {
    return denied("wrong_subject_count", `יש לבחור בדיוק ${YEARLY_INCLUDED_SUBJECTS} מקצועות`, {
      purchaseId: purchaseId.data,
      selected: uniq.length,
    });
  }

  const [p] = await db
    .select()
    .from(purchases)
    .where(and(eq(purchases.id, purchaseId.data), eq(purchases.userId, user.id)))
    .limit(1);
  if (!p || p.plan !== "yearly" || !p.subjectsPending || p.status !== "active") {
    return denied("no_pending_subscription", "לא נמצא מנוי שממתין לבחירת מקצועות", { purchaseId: purchaseId.data });
  }
  if ((await rootSubjectIds(uniq)).length !== uniq.length) {
    return denied("not_root_subject", "יש לבחור מקצועות ראשיים בלבד", { purchaseId: p.id, categoryIds: uniq });
  }

  const [first, ...rest] = uniq;
  // המעבר ממתין → נבחר הוא UPDATE מותנה (אטומי): שתי שליחות במקביל לא ייצרו 6 שורות במקום 3
  const claimed = await db
    .update(purchases)
    .set({ categoryId: first, subjectsPending: false })
    .where(and(eq(purchases.id, p.id), eq(purchases.subjectsPending, true), eq(purchases.status, "active")))
    .returning({ id: purchases.id });
  if (!claimed.length) {
    return denied("already_chosen", "המקצועות למנוי הזה כבר נבחרו", { purchaseId: p.id });
  }
  if (rest.length) {
    await db.insert(purchases).values(
      rest.map((categoryId) => ({
        userId: user.id,
        plan: "yearly" as const,
        categoryId,
        amount: 0,
        downloadsLimit: p.downloadsLimit,
        startsAt: p.startsAt,
        endsAt: p.endsAt,
        premium: false,
        paymentRef: p.paymentRef,
      })),
    );
  }
  await logAudit({
    actorId: user.id,
    action: "purchase.subjects_chosen",
    entityType: "purchase",
    entityId: p.id,
    details: { categoryIds: uniq },
  });
  revalidatePath("/account", "layout");
  return { ok: true };
}

/** החלפת מקצוע במנוי שנתי – רק בשורה שלא בוצעה בה הורדה */
export async function swapYearlySubjectAction(form: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/account/subjects");

  const back = (msg: string) => redirect(`/account/subjects?msg=${encodeURIComponent(msg)}`);
  // תיעוד סירוב החלפה ואז חזרה עם ההודעה כרגיל
  const deny = async (reason: string, msg: string, extra?: Record<string, unknown>) => {
    await logAudit({
      actorId: user.id,
      action: "purchase.subjects_denied",
      entityType: "purchase",
      details: { reason, op: "swap", ...extra },
    });
    return back(msg);
  };
  const purchaseId = idNum.safeParse(form.get("purchaseId"));
  const newId = idNum.safeParse(form.get("categoryId"));
  if (!purchaseId.success || !newId.success) return deny("invalid_input", "נתונים לא תקינים");

  const [p] = await db
    .select()
    .from(purchases)
    .where(and(eq(purchases.id, purchaseId.data), eq(purchases.userId, user.id)))
    .limit(1);
  if (!p || p.plan !== "yearly" || p.status !== "active" || p.categoryId === null || p.subjectsPending) {
    return deny("not_swappable", "לא ניתן להחליף מקצוע במנוי הזה", { purchaseId: purchaseId.data });
  }
  if (p.downloadsUsed > 0) {
    return deny("already_downloaded", "כבר בוצעה הורדה במקצוע הזה, ולכן אי אפשר להחליף אותו", { purchaseId: p.id });
  }
  if (p.categoryId === newId.data) return deny("same_subject", "בחרת את אותו מקצוע", { purchaseId: p.id });
  if ((await rootSubjectIds([newId.data])).length !== 1) {
    return deny("not_root_subject", "יש לבחור מקצוע ראשי", { purchaseId: p.id, categoryId: newId.data });
  }

  // לא מחזיקה כבר את המקצוע החדש באותו מנוי
  const mine = await db
    .select({ categoryId: purchases.categoryId })
    .from(purchases)
    .where(
      and(
        eq(purchases.userId, user.id),
        eq(purchases.plan, "yearly"),
        eq(purchases.status, "active"),
        p.paymentRef ? eq(purchases.paymentRef, p.paymentRef) : eq(purchases.id, p.id),
      ),
    );
  if (mine.some((m) => m.categoryId === newId.data)) {
    return deny("already_included", "המקצוע הזה כבר כלול במנוי שלך", { purchaseId: p.id, categoryId: newId.data });
  }

  await db.update(purchases).set({ categoryId: newId.data }).where(eq(purchases.id, p.id));
  await logAudit({
    actorId: user.id,
    action: "purchase.subject_swapped",
    entityType: "purchase",
    entityId: p.id,
    details: { from: p.categoryId, to: newId.data },
  });
  revalidatePath("/account", "layout");
  return back("המקצוע הוחלף");
}
