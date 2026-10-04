import { NextResponse, type NextRequest } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { materials } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { checkEntitlement } from "@/lib/data";
import { stampPdf, stampPreview, firstPageOnly } from "@/lib/watermark";
import { fetchFile } from "@/lib/file-source";
import { isOfficeMime, convertOfficeToPdf } from "@/lib/driveBridge";
import { logAudit } from "@/lib/audit";
import { applyDocxFixes, isDocxName } from "@/lib/docx-fixes";
import { getPublishedFixes, parseFixesParam } from "@/lib/fixes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * תצוגה מקדימה בדפדפן (inline, לא הורדה):
 * - חומר עם allowPreview=true: עמוד ראשון בלבד, לכל מבקרת (גם לא מחוברת), ללא זיהוי אישי.
 * - משתמשת עם גישה לחומר (גם כשמותר להוריד): המסמך המלא, מוטבע במספר האישי (בדיוק כמו הורדה).
 *   "צפייה בלבד" (allowDownload=false) אומר לא ניתן להוריד, לא שלא ניתן לראות.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const materialId = Number(id);
  if (!Number.isInteger(materialId) || materialId <= 0) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  const [material] = await db.select().from(materials).where(eq(materials.id, materialId)).limit(1);
  if (!material) return NextResponse.json({ error: "not found" }, { status: 404 });

  const user = await getCurrentUser();
  const isAdmin = user?.role === "admin";

  // תיעוד סירוב/כשל בתצוגה מקדימה (גם למבקרת אנונימית; לא זורק)
  const fail = (action: "preview.denied" | "preview.failed", reason: string) =>
    logAudit({
      actorId: user?.id ?? null,
      action,
      entityType: "material",
      entityId: material.id,
      details: { reason },
    });

  if (material.status !== "active" && !isAdmin) {
    await fail("preview.denied", "material_inactive");
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const ent = await checkEntitlement(user, material);
  // מורה עם גישה לקובץ רואה אותו במלואו באתר (גם אם מותר להוריד) – הכפתור "לצפייה בקובץ" בכרטיסייה
  const fullView = isAdmin || (ent.ok && !!user);

  if (!fullView && !material.allowPreview) {
    await fail("preview.denied", "no_preview_allowed");
    return NextResponse.json({ error: "אין תצוגה מקדימה לחומר זה" }, { status: 403 });
  }

  const isOffice = isOfficeMime(material.mime) || /\.(docx?|pptx?)$/i.test(material.fileName);
  const isPdfSource =
    !isOffice &&
    (material.mime === "application/pdf" || material.fileName.toLowerCase().endsWith(".pdf"));
  if (!isOffice && !isPdfSource) {
    await fail("preview.denied", "unsupported_type");
    return NextResponse.json({ error: "אין תצוגה מקדימה לסוג קובץ זה" }, { status: 400 });
  }

  const file = await fetchFile(material.fileUrl);
  if (!file) {
    await fail("preview.failed", "file_missing");
    return NextResponse.json({ error: "הקובץ אינו זמין כרגע, נסי שוב מאוחר יותר" }, { status: 502 });
  }
  let raw = new Uint8Array(await new Response(file.stream).arrayBuffer());

  // ?fixes=all | ?fixes=1,3 – הצפייה בשינויים: הדף במלואו, מה שהתבקש לתקן בזהב והתיקון בתכלת, עם מספר ליד כל תיקון.
  // הסימון קיים רק בצפייה באתר; ההורדה (api/download) מחליפה את הטקסט בנראות רגילה.
  const wantFixes = fullView ? parseFixesParam(req.nextUrl.searchParams.get("fixes")) : null;
  if (wantFixes && isDocxName(material.fileName)) {
    try {
      const published = (await getPublishedFixes([material.id])).get(material.id) ?? [];
      const chosen = wantFixes === "all" ? published : published.filter((f) => wantFixes.includes(f.number));
      if (chosen.length > 0) {
        const r = await applyDocxFixes(
          raw,
          chosen.map((f) => ({ id: f.id, originalText: f.originalText, correctedText: f.correctedText, number: f.number })),
          "marked",
        );
        if (r.applied.length > 0) raw = new Uint8Array(r.bytes);
      }
    } catch (e) {
      console.error("preview: applying marked fixes failed, showing original", e);
    }
  }

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = isOffice
      ? await convertOfficeToPdf({ bytes: raw, mimeType: material.mime, name: material.fileName })
      : raw;
  } catch (e) {
    console.error("preview conversion failed", e);
    await fail("preview.failed", "conversion_failed");
    return NextResponse.json({ error: "לא ניתן להציג תצוגה מקדימה כרגע" }, { status: 502 });
  }

  let out: Uint8Array;
  try {
    out =
      fullView && user
        ? await stampPdf(pdfBytes, { personalCode: user.personalCode, userName: user.name, email: user.email, phone: user.phone })
        : await stampPreview(await firstPageOnly(pdfBytes));
  } catch (e) {
    console.error("preview stamp failed", e);
    await fail("preview.failed", "stamp_failed");
    out = pdfBytes;
  }

  try {
    await db
      .update(materials)
      .set({ views: sql`${materials.views} + 1` })
      .where(eq(materials.id, material.id));
    // גם מבקרת אנונימית (actorId null) – תצוגה מקדימה ציבורית
    await logAudit({
      actorId: user?.id ?? null,
      action: "preview",
      entityType: "material",
      entityId: material.id,
      details: { title: material.title, fullView },
    });
  } catch (e) {
    console.error("preview view log failed", e);
  }

  return new Response(new Uint8Array(out), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(out.byteLength),
      "Content-Disposition": `inline; filename="preview-${material.id}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
