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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * תצוגה מקדימה בדפדפן (inline, לא הורדה):
 * - חומר עם allowPreview=true: עמוד ראשון בלבד, לכל מבקרת (גם לא מחוברת), ללא זיהוי אישי.
 * - חומר עם allowDownload=false שהמשתמשת זכאית אליו: המסמך המלא, מוטבע במספר האישי
 *   (בדיוק כמו הורדה) - "צפייה בלבד" אומר לא ניתן להוריד, לא שלא ניתן לראות.
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
  if (material.status !== "active" && !isAdmin) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const ent = await checkEntitlement(user, material);
  const fullView = isAdmin || (ent.ok && material.allowDownload === false);

  if (!fullView && !material.allowPreview) {
    return NextResponse.json({ error: "אין תצוגה מקדימה לחומר זה" }, { status: 403 });
  }

  const isOffice = isOfficeMime(material.mime) || /\.(docx?|pptx?)$/i.test(material.fileName);
  const isPdfSource =
    !isOffice &&
    (material.mime === "application/pdf" || material.fileName.toLowerCase().endsWith(".pdf"));
  if (!isOffice && !isPdfSource) {
    return NextResponse.json({ error: "אין תצוגה מקדימה לסוג קובץ זה" }, { status: 400 });
  }

  const file = await fetchFile(material.fileUrl);
  if (!file) {
    return NextResponse.json({ error: "הקובץ אינו זמין כרגע, נסי שוב מאוחר יותר" }, { status: 502 });
  }
  const raw = new Uint8Array(await new Response(file.stream).arrayBuffer());

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = isOffice
      ? await convertOfficeToPdf({ bytes: raw, mimeType: material.mime, name: material.fileName })
      : raw;
  } catch (e) {
    console.error("preview conversion failed", e);
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
    out = pdfBytes;
  }

  try {
    await db
      .update(materials)
      .set({ views: sql`${materials.views} + 1` })
      .where(eq(materials.id, material.id));
    if (user) {
      void logAudit({
        actorId: user.id,
        action: "preview",
        entityType: "material",
        entityId: material.id,
        details: { title: material.title, fullView },
      });
    }
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
