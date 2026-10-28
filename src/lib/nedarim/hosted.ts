import "server-only";
import type { NedarimPayment } from "@/db/schema";
import { PLANS, SITE_NAME } from "@/lib/constants";
import { siteUrl } from "@/lib/mail";
import { buildTransactionComment, hostedPaymentUrl, termsOfPayment } from "./logic";

/**
 * הקישור לדף התשלום המתארח של נדרים לבקשה נתונה (נבנה מחדש בכל פעם – אין צורך לשמור אותו; הפרמטרים ב-logic.ts).
 * הזיהוי: Analytic = מזהה הבקשה (נכנס ל-Comments). שם/טלפון/מייל נשלחים כנוחות בלבד – המשלמת מזינה אותם בעצמה.
 */
export function hostedUrlFor(row: Pick<NedarimPayment, "reference" | "amount" | "plan" | "firstName" | "lastName" | "phone" | "email"> & { itemTitle?: string | null; chargeMode?: string | null; installments?: number | null; chargeAmount?: number | null }, mosadId: string): string {
  // תנאי התשלום שננעלו על הבקשה: תשלום אחד / N תשלומים / הוראת קבע של N חיובים חודשיים (Amount = החיוב החודשי)
  const terms = termsOfPayment(row);
  return hostedPaymentUrl({
    mosadId,
    amountAgorot: row.amount,
    mode: terms.mode,
    installments: terms.installments,
    chargeAgorot: terms.chargeAmount,
    reference: row.reference,
    clientName: [row.firstName, row.lastName].filter(Boolean).join(" ").trim(),
    phone: row.phone ?? "",
    email: row.email ?? "",
    planKey: row.plan,
    // avour: שם האתר + המסלול (+ שם החומר/התיקייה ברכישת פריט) – בלי PII
    description: buildTransactionComment(SITE_NAME, PLANS[row.plan].label, row.itemTitle ?? ""),
    // from=nedarim: סימון החזרה מדף התשלום – רק מפעיל בדיקה מיידית אחת מול ה-API (ר' RETURN_CHECK_BUDGET); התשלום נקבע לפי ה-API בלבד
    redirectUrl: `${siteUrl()}/pay?ref=${encodeURIComponent(row.reference)}&from=nedarim`,
  });
}
