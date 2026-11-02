import { NextResponse, type NextRequest } from "next/server";
import { contentDisposition } from "@/lib/http-utils";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { sichot, sichaFiles } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { fetchFile } from "@/lib/file-source";
import { markDownloadReady } from "@/lib/download-ready";
import { logAudit } from "@/lib/audit";
import { sendMail, templates } from "@/lib/mail";
import { SITE_NAME } from "@/lib/constants";
import { TOO_MANY_MESSAGE, limitKey, tooMany } from "@/lib/rate-limit";

// מוריד קובץ שיחה מהדרייב (fileUrl בפורמט drive://<fileId>, ר' driveBridgeCore.ts) —
// כמו /api/download/[id] של חומרים רגילים, אך בלי הטבעת מספר אישי/רכישה/מכסה:
// מאגר השיחות פתוח בחינם לכל מורה מחוברת (אין חובת העלאה תקופתית).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  return serve(req, ctx);
}

// "שליחה למייל": אותו קובץ בדיוק כמו בהורדה, מצורף למייל לכתובת המאומתת של המורה
export async function POST(req: NextRequest, ctx: Ctx) {
  const json = (body: Record<string, unknown>, status = 200) =>
    NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

  // הגנת CSRF: רק בקשה מאותו דומיין (הפעולה שולחת מייל)
  if (req.headers.get("origin") !== req.nextUrl.origin) return json({ ok: false, error: "forbidden" }, 403);

  const user = await getCurrentUser();
  if (!user) return json({ ok: false, error: "צריך להתחבר", redirect: "/login" }, 401);
  if (user.role !== "admin" && !user.emailVerified) {
    return json(
      { ok: false, error: "כדי לקבל קבצים במייל צריך קודם לאמת את כתובת המייל באזור האישי", redirect: "/account" },
      403,
    );
  }
  if (await tooMany(limitKey("email-material", user.id), 15, 600)) return json({ ok: false, error: TOO_MANY_MESSAGE }, 429);

  const res = await serve(req, ctx);
  if (res.status >= 300 && res.status < 400) {
    return json({ ok: false, error: "לא ניתן לשלוח את הקובץ כרגע", redirect: res.headers.get("location") }, 409);
  }
  if (!res.ok) {
    let error = "השליחה נכשלה, נסי שוב בעוד רגע";
    try {
      const b = (await res.json()) as { error?: string };
      if (b.error) error = b.error;
    } catch {}
    return json({ ok: false, error }, res.status);
  }

  const cd = res.headers.get("content-disposition") ?? "";
  const m = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  const fileName = m ? decodeURIComponent(m[1]) : "file";
  const bytes = Buffer.from(await res.arrayBuffer());
  // סקריפט המייל (Apps Script) מוגבל בגודל בקשה
  if (bytes.length > 20 * 1024 * 1024) return json({ ok: false, error: "הקובץ גדול מדי לשליחה במייל – אפשר להוריד אותו" }, 413);

  const [row] = await db
    .select({ title: sichot.title })
    .from(sichot)
    .where(eq(sichot.id, Number((await ctx.params).id)))
    .limit(1);
  const title = row?.title ?? fileName;
  const tpl = templates.manual(
    `${title} – ${SITE_NAME}`,
    `שלום ${user.name},\n\nכמבוקש, הקובץ "${fileName}" מהשיחה "${title}" מצורף למייל זה.\n\nבהצלחה בשיעור!`,
  );
  const r = await sendMail({
    to: user.email,
    subject: tpl.subject,
    text: tpl.text,
    html: tpl.html,
    attachment: {
      fileName,
      base64: bytes.toString("base64"),
      mimeType: res.headers.get("content-type") ?? "application/octet-stream",
    },
    kind: "material",
    userId: user.id,
  });
  if (!r.ok) return json({ ok: false, error: "שליחת המייל נכשלה, נסי שוב בעוד רגע או הורידי את הקובץ" }, 502);
  return json({ ok: true, email: user.email });
}

async function serve(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const sichaId = Number(id);
  if (!Number.isInteger(sichaId) || sichaId <= 0) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  const [sicha] = await db.select().from(sichot).where(eq(sichot.id, sichaId)).limit(1);
  if (!sicha) return NextResponse.json({ error: "not found" }, { status: 404 });

  const user = await getCurrentUser();
  const origin = req.nextUrl.origin;
  const isAdmin = user?.role === "admin";

  if (!user) {
    return NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent(`/api/sichot/download/${sichaId}`)}`, origin),
    );
  }
  if (sicha.status !== "active" && !isAdmin) {
    await logAudit({
      actorId: user.id,
      action: "sicha.download.denied",
      entityType: "sicha",
      entityId: sichaId,
      details: { reason: "inactive" },
    });
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // ?file=<id> = אחד הקבצים הנוספים של אותה שיחה (הקובץ הראשי: בלי פרמטר)
  let target = { fileUrl: sicha.fileUrl, fileName: sicha.fileName, mime: sicha.mime, size: sicha.size };
  const extraId = Number(req.nextUrl.searchParams.get("file") ?? "");
  if (req.nextUrl.searchParams.has("file")) {
    if (!Number.isInteger(extraId) || extraId <= 0) return NextResponse.json({ error: "bad file" }, { status: 400 });
    const [extra] = await db
      .select()
      .from(sichaFiles)
      .where(and(eq(sichaFiles.id, extraId), eq(sichaFiles.sichaId, sichaId)))
      .limit(1);
    if (!extra) return NextResponse.json({ error: "not found" }, { status: 404 });
    target = { fileUrl: extra.fileUrl, fileName: extra.fileName, mime: extra.mime, size: extra.size };
  }

  const file = await fetchFile(target.fileUrl);
  if (!file) {
    await logAudit({
      actorId: user.id,
      action: "sicha.download.failed",
      entityType: "sicha",
      entityId: sichaId,
      details: { reason: "file_unavailable" },
    });
    return NextResponse.json({ error: "הקובץ אינו זמין כרגע, נסי שוב מאוחר יותר" }, { status: 502 });
  }

  await logAudit({
    actorId: user.id,
    action: "sicha.download",
    entityType: "sicha",
    entityId: sichaId,
    details: { fileName: target.fileName, size: target.size, extraFileId: req.nextUrl.searchParams.has("file") ? extraId : null },
  });

  return markDownloadReady(req.nextUrl, new Response(file.stream, {
    headers: {
      "Content-Type": file.contentType ?? target.mime ?? "application/octet-stream",
      "Content-Disposition": contentDisposition(target.fileName),
      "Cache-Control": "private, no-store",
    },
  }));
}
