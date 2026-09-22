import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sichot, sichaTeacherStatus } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { fetchFile } from "@/lib/file-source";

// מוריד קובץ שיחה מהדרייב (fileUrl בפורמט drive://<fileId>, ר' driveBridgeCore.ts) —
// כמו /api/download/[id] של חומרים רגילים, אך בלי הטבעת מספר אישי/רכישה/מכסה:
// מאגר השיחות פתוח בחינם לכל מורה מחוברת. חוסם בכל זאת מורה שנחסמה ממאגר השיחות
// (sichaTeacherStatus.blocked) גם אם היא ניגשת ישירות לקישור, לא רק כשה-UI מסתיר אותו.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function contentDisposition(fileName: string) {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  if (!isAdmin) {
    const [status] = await db
      .select({ blocked: sichaTeacherStatus.blocked })
      .from(sichaTeacherStatus)
      .where(eq(sichaTeacherStatus.teacherId, user.id))
      .limit(1);
    if (status?.blocked) {
      return NextResponse.json(
        { error: "הגישה למאגר השיחות חסומה זמנית — כדי לפתוח אותה מחדש יש להעלות שיחה חדשה" },
        { status: 403 },
      );
    }
  }

  const file = await fetchFile(sicha.fileUrl);
  if (!file) {
    return NextResponse.json({ error: "הקובץ אינו זמין כרגע, נסי שוב מאוחר יותר" }, { status: 502 });
  }

  return new Response(file.stream, {
    headers: {
      "Content-Type": file.contentType ?? sicha.mime ?? "application/octet-stream",
      "Content-Disposition": contentDisposition(sicha.fileName),
      "Cache-Control": "private, no-store",
    },
  });
}
