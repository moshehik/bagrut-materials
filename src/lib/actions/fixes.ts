"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, count, eq, max } from "drizzle-orm";
import { db } from "@/db";
import { materialFixes, materials } from "@/db/schema";
import { getCurrentUser, requireAdmin } from "@/lib/session";
import { checkEntitlement } from "@/lib/data";
import { logAudit } from "@/lib/audit";
import { createReport } from "@/lib/errorReports";
import { fetchFile } from "@/lib/file-source";
import { applyDocxFixes, isDocxName } from "@/lib/docx-fixes";

export type FixState = { error?: string; ok?: boolean } | undefined;

const MAX_PENDING_PER_MATERIAL = 10;

const emptyToUndef = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const requestSchema = z.object({
  materialId: z.coerce.number().int().positive(),
  items: z
    .array(
      z.object({
        /** מה שהמורה סימנה בקובץ כטעות */
        quote: z.string().trim().min(2, "יש לסמן בקובץ את הטקסט שצריך תיקון").max(1000, "הטקסט המסומן ארוך מדי"),
        /** התיקון שהמורה כתבה */
        correction: z.string().trim().min(1, "יש לכתוב את התיקון").max(2000, "התיקון ארוך מדי"),
      }),
    )
    .min(1, "הוסיפי לפחות תיקון אחד")
    .max(10, "אפשר לשלוח עד 10 תיקונים בבת אחת"),
});

/**
 * מורה שולחת תיקון אחד או יותר: לכל אחד – הטקסט שסימנה בקובץ והתיקון שכתבה. נשמר לטיפול המנהלת
 * (quoteText = מה שסומן, requestText = התיקון המוצע).
 */
export async function submitFixRequests(input: {
  materialId: number;
  items: { quote: string; correction: string }[];
}): Promise<FixState> {
  const user = await getCurrentUser();
  if (!user) return { error: "יש להתחבר כדי לבקש שינוי" };
  if (user.suspended) return { error: "החשבון מושהה" };

  const parsed = requestSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { materialId, items } = parsed.data;

  const [material] = await db.select().from(materials).where(eq(materials.id, materialId)).limit(1);
  if (!material) return { error: "הקובץ לא נמצא" };
  const ent = await checkEntitlement(user, material);
  if (!ent.ok) return { error: "בקשת שינוי זמינה למי שיש לה גישה לקובץ" };

  const [pending] = await db
    .select({ n: count() })
    .from(materialFixes)
    .where(
      and(
        eq(materialFixes.materialId, materialId),
        eq(materialFixes.userId, user.id),
        eq(materialFixes.status, "pending"),
      ),
    );
  if (Number(pending?.n ?? 0) + items.length > MAX_PENDING_PER_MATERIAL) {
    return { error: "יש כבר כמה בקשות שממתינות לטיפול בקובץ הזה – נחכה שנטפל בהן" };
  }

  const inserted = await db
    .insert(materialFixes)
    .values(
      items.map((it) => ({
        materialId,
        userId: user.id,
        requestText: it.correction,
        quoteText: it.quote,
      })),
    )
    .returning({ id: materialFixes.id });

  // מעירה את הסוכן האוטומטי: דיווח במערכת התמיכה שמפנה לבקשות (הסוכן מכין הצעת תיקון מאומתת, המנהלת מפרסמת)
  try {
    const lines = items.map((it, i) => `בקשה #${inserted[i]?.id}: סומן «${it.quote}» ← תיקון מבוקש: «${it.correction}»`);
    await createReport({
      title: "בקשת שינוי בקובץ",
      url: "/admin/fixes",
      userText:
        `[material-fixes] מורה ביקשה שינוי בקובץ «${material.title}» (חומר #${materialId}, ${material.fileName}).\n` +
        `${lines.join("\n")}\n` +
        `לטיפול לפי הסעיף "בקשות שינוי בקובץ (material_fixes)" ב-fix-reports.md: scripts/agent-fix-suggest.ts. אל תפרסמי ואל תחליפי קובץ חי.`,
    });
  } catch (e) {
    console.error("submitFixRequests: agent report failed", e); // הבקשה עצמה כבר נשמרה – ממשיכים
  }
  await logAudit({
    actorId: user.id,
    action: "fix.request",
    entityType: "material",
    entityId: materialId,
    details: { title: material.title, count: items.length },
  });
  revalidatePath("/admin/fixes");
  return { ok: true };
}

/* ---------- מנהלת ---------- */

async function admin() {
  try {
    return await requireAdmin();
  } catch {
    return null;
  }
}

const publishSchema = z.object({
  originalText: z.string().trim().min(2, "נא להזין את הטקסט המקורי כפי שהוא מופיע בקובץ").max(2000),
  correctedText: z.string().trim().min(1, "נא להזין את הטקסט המתוקן").max(2000),
  adminNote: z.preprocess(emptyToUndef, z.string().trim().max(1000).optional()),
});

/** פרסום בקשה כתיקון: בודקת שהטקסט המקורי באמת נמצא בקובץ, ומקצה מספר רץ לחומר */
export async function publishFix(id: number, _prev: FixState, form: FormData): Promise<FixState> {
  const me = await admin();
  if (!me) return { error: "אין הרשאה" };

  const parsed = publishSchema.safeParse({
    originalText: form.get("originalText"),
    correctedText: form.get("correctedText"),
    adminNote: form.get("adminNote"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const [fix] = await db.select().from(materialFixes).where(eq(materialFixes.id, id)).limit(1);
  if (!fix) return { error: "הבקשה לא נמצאה" };
  const [material] = await db.select().from(materials).where(eq(materials.id, fix.materialId)).limit(1);
  if (!material) return { error: "החומר לא נמצא" };
  if (!isDocxName(material.fileName)) {
    return { error: "תיקונים מסומנים נתמכים רק בקבצי Word (docx)" };
  }

  const file = await fetchFile(material.fileUrl);
  if (!file) return { error: "הקובץ אינו זמין כרגע לבדיקה, נסי שוב" };
  const bytes = new Uint8Array(await new Response(file.stream).arrayBuffer());
  const test = await applyDocxFixes(bytes, [
    { id, originalText: parsed.data.originalText, correctedText: parsed.data.correctedText },
  ]);
  if (!test.applied.includes(id)) {
    return {
      error:
        "הטקסט המקורי לא נמצא בקובץ. יש להעתיק אותו בדיוק כפי שהוא מופיע (בתוך פסקה אחת, בלי מעבר שורה).",
    };
  }

  let number = fix.fixNumber;
  if (number == null) {
    const [row] = await db
      .select({ m: max(materialFixes.fixNumber) })
      .from(materialFixes)
      .where(eq(materialFixes.materialId, fix.materialId));
    number = (row?.m ?? 0) + 1;
  }
  try {
    await db
      .update(materialFixes)
      .set({
        status: "published",
        fixNumber: number,
        originalText: parsed.data.originalText,
        correctedText: parsed.data.correctedText,
        adminNote: parsed.data.adminNote ?? null,
        publishedAt: new Date(),
      })
      .where(eq(materialFixes.id, id));
  } catch (e) {
    console.error("publishFix failed", e);
    return { error: "השמירה נכשלה (ייתכן שפורסם תיקון אחר באותו רגע) – נסי שוב" };
  }
  // הטקסטים נחתכים ל-300 תווים כדי שהלוג לא יתנפח
  const clip = (s: string | null | undefined) => (s && s.length > 300 ? s.slice(0, 300) + "…" : (s ?? null));
  await logAudit({
    actorId: me.id,
    action: "fix.publish",
    entityType: "material",
    entityId: fix.materialId,
    details: {
      fixId: id,
      number,
      previousStatus: fix.status,
      originalText: clip(parsed.data.originalText),
      correctedText: clip(parsed.data.correctedText),
      adminNote: clip(parsed.data.adminNote),
    },
  });
  revalidatePath("/admin/fixes");
  revalidatePath("/subjects", "layout");
  return { ok: true };
}

async function setStatus(id: number, status: "pending" | "rejected" | "merged", action: string) {
  const me = await admin();
  if (!me) return;
  const [fix] = await db.select().from(materialFixes).where(eq(materialFixes.id, id)).limit(1);
  if (!fix) return;
  // המספר נשמר ב-fixNumber גם אחרי ביטול פרסום, כדי שמספרי התיקונים האחרים לא ישתנו
  await db.update(materialFixes).set({ status }).where(eq(materialFixes.id, id));
  await logAudit({
    actorId: me.id,
    action,
    entityType: "material",
    entityId: fix.materialId,
    details: { fixId: id, from: fix.status, to: status, number: fix.fixNumber },
  });
  revalidatePath("/admin/fixes");
  revalidatePath("/subjects", "layout");
}

export async function rejectFix(id: number): Promise<void> {
  await setStatus(id, "rejected", "fix.reject");
}

/**
 * התיקון שולב בקובץ המקורי (המנהלת עדכנה את הקובץ עצמו): מפסיק להופיע בכרטיסייה, כך שאין יותר צורך
 * ב"צפייה בשינויים" / "הורדת הקובץ המתוקן" עליו. אם יתקנו שוב – תיווצר בקשה חדשה ותופיע מחדש.
 */
export async function markFixMerged(id: number): Promise<void> {
  await setStatus(id, "merged", "fix.merge");
}

export async function unpublishFix(id: number): Promise<void> {
  await setStatus(id, "pending", "fix.unpublish");
}
