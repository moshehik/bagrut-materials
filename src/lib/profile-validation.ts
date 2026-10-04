import { z } from "zod";
import { canonicalCity } from "@/lib/israel-cities";
import { normalizeIsraeliPhone, PHONE_ERROR } from "@/lib/phone";

/** שם אדם: אותיות עבריות/לטיניות, רווח, גרש, גרשיים ומקף בלבד (בלי ספרות/סימנים), ולא אות אחת שחוזרת */
const NAME_RE = /^[א-תa-zA-Z][א-תa-zA-Z '"׳״\-]*$/;
export const personName = (msg: string) =>
  z
    .string()
    .trim()
    .min(2, msg)
    .max(60)
    .refine((s) => NAME_RE.test(s) && !/^(.)\1+$/.test(s.replace(/\s/g, "")), `${msg} (אותיות בלבד)`);

/** עיר מגורים: חייבת להיות יישוב מהרשימה הרשמית; הערך שנשמר הוא השם הרשמי */
export const citySchema = z.string().transform((s, ctx) => {
  const c = canonicalCity(s);
  if (!c) ctx.addIssue({ code: "custom", message: "יש לבחור עיר מהרשימה" });
  return c ?? "";
});

/** שם התיכון/הסמינר: טקסט חופשי (אין רשימה עדכנית), אבל עם אותיות ובלי קישורים */
export const schoolSchema = z
  .string()
  .trim()
  .min(2, "יש להזין את שם התיכון בו את מלמדת")
  .max(120)
  .refine((s) => /[א-תa-zA-Z]{2}/.test(s) && !/https?:|www\./i.test(s), "שם התיכון לא תקין");

/** טלפון ישראלי תקין, מנורמל לספרות בלבד */
export const phoneSchema = z.string().transform((s, ctx) => {
  const p = normalizeIsraeliPhone(s);
  if (!p) ctx.addIssue({ code: "custom", message: PHONE_ERROR });
  return p ?? "";
});
