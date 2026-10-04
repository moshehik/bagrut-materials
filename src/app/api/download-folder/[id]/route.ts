import { NextResponse, type NextRequest } from "next/server";
import JSZip from "jszip";
import { and, asc, count, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { categories, downloads, materials, purchases, type Material } from "@/db/schema";
import { getCurrentUser } from "@/lib/session";
import { checkEntitlement, getDescendantIds, getCategoryChain, chainToHref } from "@/lib/data";
import { stampPdf, stampImage } from "@/lib/watermark";
import { logAudit, requestMeta } from "@/lib/audit";
import { getNumber } from "@/lib/settings";
import { fetchFile } from "@/lib/file-source";
import { isOfficeMime, convertOfficeToPdf, isDriveConfigured } from "@/lib/driveBridge";
import { markDownloadReady } from "@/lib/download-ready";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// המרת כמה קבצי Word ל-PDF במקביל דרך Drive
export const maxDuration = 300;

const CONCURRENCY = 4;

function contentDisposition(fileName: string) {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function stem(fileName: string) {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(0, dot) : fileName;
}
function ext(fileName: string) {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(dot) : "";
}

type Who = { personalCode: string; name: string; email: string; phone: string | null };

/** מכינה קובץ אחד לזיפ: אותה לוגיקה כמו /api/download/[id] – המרת Office ל-PDF + הטבעת מספר אישי */
async function prepare(m: Material, u: Who): Promise<{ name: string; bytes: Uint8Array } | null> {
  const file = await fetchFile(m.fileUrl);
  if (!file) return null;
  const stampInfo = { personalCode: u.personalCode, userName: u.name, email: u.email, phone: u.phone };
  const isOffice = isOfficeMime(m.mime) || /\.(docx?|pptx?)$/i.test(m.fileName);
  const isPdf =
    !isOffice &&
    (m.mime === "application/pdf" ||
      m.fileName.toLowerCase().endsWith(".pdf") ||
      (file.contentType ?? "").startsWith("application/pdf"));
  const isImage = /^image\/(png|jpe?g)$/.test(file.contentType ?? m.mime ?? "");
  const raw = new Uint8Array(await new Response(file.stream).arrayBuffer());
  const tag = u.personalCode;

  if (isOffice && isDriveConfigured()) {
    try {
      const pdf = await convertOfficeToPdf({ bytes: raw, mimeType: m.mime, name: m.fileName });
      return { name: `${stem(m.fileName)}-${tag}.pdf`, bytes: await stampPdf(pdf, stampInfo) };
    } catch (e) {
      console.error("folder zip: office->pdf failed, using original", e);
      return { name: `${stem(m.fileName)}-${tag}${ext(m.fileName)}`, bytes: raw };
    }
  }
  if (isPdf) {
    try {
      return { name: `${stem(m.fileName)}-${tag}.pdf`, bytes: await stampPdf(raw, stampInfo) };
    } catch {
      return { name: `${stem(m.fileName)}-${tag}${ext(m.fileName)}`, bytes: raw };
    }
  }
  if (isImage) {
    try {
      return { name: `${stem(m.fileName)}-${tag}${ext(m.fileName)}`, bytes: await stampImage(raw, { personalCode: tag }) };
    } catch {
      return { name: `${stem(m.fileName)}-${tag}${ext(m.fileName)}`, bytes: raw };
    }
  }
  return { name: `${stem(m.fileName)}-${tag}${ext(m.fileName)}`, bytes: raw };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const categoryId = Number(id);
  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }
  const origin = req.nextUrl.origin;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(`/api/download-folder/${categoryId}`)}`, origin));
  }
  if (user.suspended) return NextResponse.redirect(new URL("/login?suspended=1", origin));
  const isAdmin = user.role === "admin";

  const [cat] = await db.select().from(categories).where(eq(categories.id, categoryId)).limit(1);
  if (!cat) return NextResponse.json({ error: "not found" }, { status: 404 });
  const chain = await getCategoryChain(categoryId);
  const here = chainToHref(chain);

  if (!user.phone && !isAdmin) {
    return NextResponse.redirect(
      new URL(`/account/phone?next=${encodeURIComponent(`/api/download-folder/${categoryId}`)}`, origin),
    );
  }

  const ids = await getDescendantIds(categoryId);
  const all = ids.length
    ? await db
        .select()
        .from(materials)
        .where(inArray(materials.categoryId, ids))
        .orderBy(asc(materials.categoryId), asc(materials.id))
    : [];
  const candidates = all.filter((m) => (m.status === "active" || isAdmin) && (m.allowDownload || isAdmin));

  const ents = await Promise.all(candidates.map((m) => checkEntitlement(user, m)));
  const owned = candidates.filter((_, i) => ents[i].ok);
  if (owned.length === 0) {
    // אין הרשאה לאף קובץ – מפנים לרכישת התיקייה
    return NextResponse.redirect(new URL(`/checkout?bundle=${categoryId}`, origin));
  }

  if (!isAdmin) {
    try {
      const globalLimit = await getNumber("daily_download_limit");
      const dailyLimit = user.dailyDownloadLimit ?? globalLimit;
      if (dailyLimit > 0) {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const [row] = await db
          .select({ n: count() })
          .from(downloads)
          .where(and(eq(downloads.userId, user.id), gte(downloads.createdAt, startOfDay)));
        if (Number(row?.n ?? 0) + owned.length > dailyLimit) {
          return NextResponse.redirect(new URL("/account?limit=1", origin));
        }
      }
    } catch (e) {
      console.error("folder download limit check failed", e);
    }
  }

  const who: Who = { personalCode: user.personalCode, name: user.name, email: user.email, phone: user.phone };
  type Ready = { name: string; bytes: Uint8Array; m: Material; via: string };
  const results: (Ready | null)[] = new Array(owned.length).fill(null);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, owned.length) }, async () => {
      while (next < owned.length) {
        const i = next++;
        try {
          const out = await prepare(owned[i], who);
          const ent = ents[candidates.indexOf(owned[i])];
          if (out) results[i] = { ...out, m: owned[i], via: ent.ok ? ent.via : "single" };
        } catch (e) {
          console.error("folder zip: file failed", owned[i].id, e);
        }
      }
    }),
  );

  const ready = results.filter((r): r is Ready => !!r);
  if (ready.length === 0) {
    return NextResponse.json({ error: "הקבצים אינם זמינים כרגע, נסי שוב מאוחר יותר" }, { status: 502 });
  }

  const zip = new JSZip();
  const used = new Set<string>();
  for (const r of ready) {
    let name = r.name;
    if (used.has(name)) name = `${r.m.id}-${name}`;
    used.add(name);
    zip.file(name, r.bytes);
  }
  const body = await zip.generateAsync({ type: "uint8array", compression: "STORE" });

  try {
    const { ip, userAgent } = await requestMeta();
    await db.insert(downloads).values(
      ready.map((r) => ({
        userId: user.id,
        materialId: r.m.id,
        watermark: user.personalCode,
        ip,
        userAgent,
        via: r.via as "admin" | "single" | "bundle" | "subscription" | "free" | "tier",
      })),
    );
    await db
      .update(materials)
      .set({ downloads: sql`${materials.downloads} + 1` })
      .where(inArray(materials.id, ready.map((r) => r.m.id)));
    // מנוי עם מכסת הורדות: כל קובץ בזיפ נספר, כמו בהורדה בודדת
    const subUse = new Map<number, number>();
    ready.forEach((r) => {
      const ent = ents[candidates.indexOf(r.m)];
      if (ent.ok && ent.via === "subscription" && ent.purchaseId) {
        subUse.set(ent.purchaseId, (subUse.get(ent.purchaseId) ?? 0) + 1);
      }
    });
    for (const [pid, n] of subUse) {
      await db
        .update(purchases)
        .set({ downloadsUsed: sql`${purchases.downloadsUsed} + ${n}` })
        .where(eq(purchases.id, pid));
    }
    void logAudit({
      actorId: user.id,
      action: "download",
      entityType: "category",
      entityId: categoryId,
      details: { folder: cat.title, files: ready.length, here },
    });
  } catch (e) {
    console.error("folder download log failed", e);
  }

  const res = new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(body.byteLength),
      "Content-Disposition": contentDisposition(`${cat.title}.zip`),
      "Cache-Control": "private, no-store",
    },
  });
  return markDownloadReady(req.nextUrl, res);
}
