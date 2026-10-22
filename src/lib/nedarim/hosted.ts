import "server-only";
import type { NedarimPayment } from "@/db/schema";
import { PLANS, SITE_NAME } from "@/lib/constants";
import { siteUrl } from "@/lib/mail";
import { buildTransactionComment, hostedPaymentUrl } from "./logic";

/**
 * הקישור לדף התשלום המתארח של נדרים לבקשה נתונה (נבנה מחדש בכל פעם – אין צורך לשמור אותו; הפרמטרים ב-logic.ts).
 * הזיהוי: Analytic = מזהה הבקשה (נכנס ל-Comments). שם/טלפון/מייל נשלחים כנוחות בלבד – המשלמת מזינה אותם בעצמה.
 */
export function hostedUrlFor(row: Pick<NedarimPayment, "reference" | "amount" | "plan" | "firstName" | "lastName" | "phone" | "email">, mosadId: string): string {
  return hostedPaymentUrl({
    mosadId,
    amountAgorot: row.amount,
    reference: row.reference,
    clientName: [row.firstName, row.lastName].filter(Boolean).join(" ").trim(),
    phone: row.phone ?? "",
    email: row.email ?? "",
    planKey: row.plan,
    description: buildTransactionComment(SITE_NAME, PLANS[row.plan].label),
    redirectUrl: `${siteUrl()}/pay?ref=${encodeURIComponent(row.reference)}`,
  });
}
