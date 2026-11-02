import { NextResponse, after, type NextRequest } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { sichot, sichaFiles } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { fetchFile } from "@/lib/file-source";
import { fileRouteError } from "@/lib/http-utils";
import { isOfficeMime, convertOfficeToPdfCached, driveIdFromUrl } from "@/lib/driveBridge";
import { officeMimeFor } from "@/lib/office-mime";
import { stampPdf } from "@/lib/watermark";
import { logAudit } from "@/lib/audit";

// צפייה בקובץ שיחה בתוך האתר (PDF inline, מוטבע במספר האישי) — כמו /api/preview/[id] של חומרים רגילים.
// ?file=<id> = אחד הקבצים הנוספים של השיחה; בלי פרמטר = הקובץ הראשי. פתוח לכל מורה מחוברת (כמו ההורדה).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sichaId = Number(id);
  if (!Number.isInteger(sichaId) || sichaId <= 0) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const user = await getCurrentUser();
  if (!user) return fileRouteError(req, "צריך להתחבר כדי לצפות בקובץ", 401);

  const [sicha] = await db.select().from(sichot).where(eq(sichot.id, sichaId)).limit(1);
  if (!sicha || (sicha.status !== "active" && user.role !== "admin")) {
    return fileRouteError(req, "הקובץ לא נמצא", 404);
  }

  let target = { fileUrl: sicha.fileUrl, fileName: sicha.fileName, mime: sicha.mime };
  if (req.nextUrl.searchParams.has("file")) {
    const extraId = Number(req.nextUrl.searchParams.get("file"));
    if (!Number.isInteger(extraId) || extraId <= 0) return fileRouteError(req, "קובץ לא תקין", 400);
    const [extra] = await db
      .select()
      .from(sichaFiles)
      .where(and(eq(sichaFiles.id, extraId), eq(sichaFiles.sichaId, sichaId)))
      .limit(1);
    if (!extra) return fileRouteError(req, "הקובץ לא נמצא", 404);
    target = { fileUrl: extra.fileUrl, fileName: extra.fileName, mime: extra.mime };
  }

  const isOffice = isOfficeMime(target.mime) || /\.(docx?|pptx?)$/i.test(target.fileName);
  const isPdf = !isOffice && (target.mime === "application/pdf" || target.fileName.toLowerCase().endsWith(".pdf"));
  if (!isOffice && !isPdf) return fileRouteError(req, "אין צפייה באתר לסוג קובץ זה – אפשר להוריד אותו", 400);

  const file = await fetchFile(target.fileUrl);
  if (!file) return fileRouteError(req, "הקובץ אינו זמין כרגע, נסי שוב מאוחר יותר", 502);
  const raw = new Uint8Array(await new Response(file.stream).arrayBuffer());

  let pdf: Uint8Array;
  try {
    pdf = isOffice
      ? await convertOfficeToPdfCached({
          bytes: raw,
          fileId: driveIdFromUrl(target.fileUrl),
          defer: after,
          mimeType: officeMimeFor(target.mime, target.fileName),
          name: target.fileName,
        })
      : raw;
    pdf = await stampPdf(pdf, { personalCode: user.personalCode, userName: user.name, email: user.email, phone: user.phone });
  } catch (e) {
    console.error("sicha preview failed", e);
    return fileRouteError(req, "לא ניתן להציג את הקובץ כרגע – אפשר להוריד אותו", 502);
  }

  await logAudit({
    actorId: user.id,
    action: "sicha.preview",
    entityType: "sicha",
    entityId: sichaId,
    details: { fileName: target.fileName },
  }).catch(() => {});

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.byteLength),
      "Content-Disposition": `inline; filename="sicha-${sichaId}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
