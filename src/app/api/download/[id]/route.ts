import { NextResponse, type NextRequest } from "next/server";
import { and, count, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { downloads, materials, purchases } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { checkEntitlement } from "@/lib/data";
import { stampPdf, stampImage } from "@/lib/watermark";
import { logAudit, requestMeta } from "@/lib/audit";
import { getNumber } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** בונה כותרת Content-Disposition עם שם קובץ בעברית (RFC 5987) */
function contentDisposition(fileName: string) {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function withSuffix(fileName: string, suffix: string) {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0) return `${fileName}-${suffix}`;
  return `${fileName.slice(0, dot)}-${suffix}${fileName.slice(dot)}`;
}

async function fetchFile(url: string): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string | null } | null> {
  // קבצים ב-Vercel Blob פרטי; אם אין טוקן / נכשל – נופלים ל-fetch רגיל
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const { get } = await import("@vercel/blob");
      const res = await get(url, { access: "private" });
      if (res && res.stream) {
        return { stream: res.stream, contentType: res.blob.contentType ?? null };
      }
    } catch {
      /* fallback below */
    }
  }
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok || !r.body) return null;
    return { stream: r.body, contentType: r.headers.get("content-type") };
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const materialId = Number(id);
  if (!Number.isInteger(materialId) || materialId <= 0) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }

  const [material] = await db.select().from(materials).where(eq(materials.id, materialId)).limit(1);
  if (!material) return NextResponse.json({ error: "not found" }, { status: 404 });

  const user = await getCurrentUser();
  const origin = req.nextUrl.origin;
  const isAdmin = user?.role === "admin";

  if (user?.suspended) {
    return NextResponse.redirect(new URL("/login?suspended=1", origin));
  }
  if (material.status !== "active" && !isAdmin) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  if (material.allowDownload === false && !isAdmin) {
    return NextResponse.json({ error: "צפייה בלבד" }, { status: 403 });
  }

  const ent = await checkEntitlement(user, material);

  if (!ent.ok) {
    switch (ent.reason) {
      case "login":
        return NextResponse.redirect(
          new URL(`/login?next=${encodeURIComponent(`/api/download/${materialId}`)}`, origin),
        );
      case "premium":
        return NextResponse.redirect(new URL("/checkout?premium=1", origin));
      case "purchase":
        return NextResponse.redirect(new URL(`/checkout?material=${materialId}`, origin));
      default:
        return NextResponse.redirect(new URL(`/pricing?reason=${ent.reason}`, origin));
    }
  }
  // הורדה חופשית ללא התחברות (free_downloads_require_login=false): אין מספר אישי להטביע → מפנים להתחברות
  if (!user) return NextResponse.redirect(new URL(`/login?next=/api/download/${id}`, origin));
  const u = user;

  // מגבלות הורדה (לא חלות על מנהלת)
  if (!isAdmin) {
    try {
      const globalLimit = await getNumber("daily_download_limit");
      const dailyLimit = u.dailyDownloadLimit ?? globalLimit;
      if (dailyLimit > 0) {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const [row] = await db
          .select({ n: count() })
          .from(downloads)
          .where(and(eq(downloads.userId, u.id), gte(downloads.createdAt, startOfDay)));
        if (Number(row?.n ?? 0) >= dailyLimit) {
          return NextResponse.redirect(new URL("/account?limit=1", origin));
        }
      }
      if (material.maxDownloadsPerUser !== null && material.maxDownloadsPerUser > 0) {
        const [row] = await db
          .select({ n: count() })
          .from(downloads)
          .where(and(eq(downloads.userId, u.id), eq(downloads.materialId, material.id)));
        if (Number(row?.n ?? 0) >= material.maxDownloadsPerUser) {
          return NextResponse.redirect(new URL("/account?limit=1&material=" + material.id, origin));
        }
      }
    } catch (e) {
      console.error("download limit check failed", e);
    }
  }

  const file = await fetchFile(material.fileUrl);
  if (!file) {
    return NextResponse.json({ error: "הקובץ אינו זמין כרגע, נסי שוב מאוחר יותר" }, { status: 502 });
  }

  const isPdf =
    material.mime === "application/pdf" ||
    material.fileName.toLowerCase().endsWith(".pdf") ||
    (file.contentType ?? "").startsWith("application/pdf");
  const isImage = /^image\/(png|jpe?g)$/.test(file.contentType ?? material.mime ?? "");

  const outName = withSuffix(material.fileName, u.personalCode);
  let response: Response;

  if (isPdf) {
    const bytes = new Uint8Array(await new Response(file.stream).arrayBuffer());
    let out: Uint8Array;
    try {
      out = await stampPdf(bytes, {
        personalCode: u.personalCode,
        userName: u.name,
        email: u.email,
      });
    } catch {
      // אם ההטבעה נכשלה (PDF פגום/מוצפן) – מחזירים את המקור
      out = bytes;
    }
    response = new Response(new Uint8Array(out), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(out.byteLength),
        "Content-Disposition": contentDisposition(outName),
        "Cache-Control": "private, no-store",
      },
    });
  } else if (isImage) {
    const bytes = new Uint8Array(await new Response(file.stream).arrayBuffer());
    let out: Uint8Array;
    try {
      out = await stampImage(bytes, { personalCode: u.personalCode });
    } catch {
      // אם ההטבעה נכשלה (תמונה פגומה/פורמט לא נתמך) – מחזירים את המקור
      out = bytes;
    }
    response = new Response(new Uint8Array(out), {
      headers: {
        "Content-Type": file.contentType ?? material.mime ?? "application/octet-stream",
        "Content-Length": String(out.byteLength),
        "Content-Disposition": contentDisposition(outName),
        "Cache-Control": "private, no-store",
      },
    });
  } else {
    response = new Response(file.stream, {
      headers: {
        "Content-Type": file.contentType ?? material.mime ?? "application/octet-stream",
        "Content-Disposition": contentDisposition(outName),
        "Cache-Control": "private, no-store",
      },
    });
  }

  // תיעוד ההורדה
  try {
    const { ip, userAgent } = await requestMeta();
    await db.insert(downloads).values({
      userId: u.id,
      materialId: material.id,
      watermark: u.personalCode,
      ip,
      userAgent,
      via: ent.via,
    });
    void logAudit({
      actorId: u.id,
      action: "download",
      entityType: "material",
      entityId: material.id,
      details: { via: ent.via, title: material.title },
    });
    await db
      .update(materials)
      .set({ downloads: sql`${materials.downloads} + 1` })
      .where(eq(materials.id, material.id));
    if (ent.via === "subscription" && ent.purchaseId) {
      await db
        .update(purchases)
        .set({ downloadsUsed: sql`${purchases.downloadsUsed} + 1` })
        .where(eq(purchases.id, ent.purchaseId));
    }
  } catch (e) {
    console.error("download log failed", e);
  }

  return response;
}
