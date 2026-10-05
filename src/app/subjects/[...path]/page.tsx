import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FolderOpen, Package, ArrowRight } from "lucide-react";
import { FingerprintMark, WatermarkText } from "@/components/watermark-notice";
import {
  resolvePath,
  getVisibleChildren,
  getVisibleMaterials,
  chainSuspended,
  chainToHref,
  countMaterialsUnder,
  checkEntitlement,
  getUserDownloadCounts,
  type Entitlement,
} from "@/lib/data";
import { getCurrentUser } from "@/lib/session";
import { UNIT_BUNDLE_PRICE, formatPrice } from "@/lib/constants";
import type { Material } from "@/db/schema";
import { CARD_ROWS, classifyMaterial, type CardType } from "@/lib/material-card-types";
import { MaterialTypeCard } from "@/components/material-type-card";
import { ForumCard } from "@/components/forum-card";
import { FolderBundleBanner } from "@/components/folder-bundle-banner";
import { AutoFolderDownload } from "@/components/auto-folder-download";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SubjectCard } from "@/components/subject-card";
import { MaterialCard } from "@/components/material-card";
import { getPublishedFixes } from "@/lib/fixes";
import { AnimatedGrid, Reveal } from "@/components/animated-grid";
import { UnitForum } from "@/components/unit-forum";
import { SichotModule } from "@/components/sichot/sichot-module";
import Image from "next/image";
import { nutForLevel } from "@/lib/nut-images";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ path: string[] }>;
  searchParams: Promise<{ dlall?: string }>;
};

/**
 * כוכב בשרבוט עט: שלושה קווים שחוצים זה את זה ליד (cx, cy), ברדיוס r.
 * כל קו קצת עקום, באורך ובזווית לא מדויקים, כמו שרבוט ביד – לניצוצות שליד הלוגו בהודעת "תיקייה ריקה".
 * ה"רעש" דטרמיניסטי (לפי seed) כדי שה-HTML מהשרת וה-HTML בדפדפן יהיו זהים.
 */
function starPath(cx: number, cy: number, r: number, seed: number) {
  const n = (k: number) => Math.sin(seed * 12.9898 + k * 78.233); // בין -1 ל-1
  return [90, 30, -30]
    .map((deg, i) => {
      const a = (deg + n(i) * 9) * (Math.PI / 180);
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      const r1 = r * (0.8 + 0.25 * n(i + 3)); // קצה אחד
      const r2 = r * (0.8 + 0.25 * n(i + 6)); // הקצה השני
      const bend = r * 0.22 * n(i + 9); // עקמומיות הקו
      const sx = cx - ux * r1;
      const sy = cy - uy * r1;
      const ex = cx + ux * r2;
      const ey = cy + uy * r2;
      const qx = cx - uy * bend;
      const qy = cy + ux * bend;
      return `M${sx.toFixed(2)} ${sy.toFixed(2)}Q${qx.toFixed(2)} ${qy.toFixed(2)} ${ex.toFixed(2)} ${ey.toFixed(2)}`;
    })
    .join("");
}

function decode(path: string[]) {
  return path.map((p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  });
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { path } = await params;
  const chain = await resolvePath(decode(path)).catch(() => null);
  if (!chain) return { title: "לא נמצא" };
  return {
    title: chain.map((c) => c.title).reverse().join(" · "),
    description: chain[chain.length - 1].description ?? undefined,
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { path } = await params;
  const { dlall } = await searchParams;
  const chain = await resolvePath(decode(path)).catch(() => null);
  if (!chain || chain.length === 0) notFound();

  const category = chain[chain.length - 1];
  const root = chain[0];
  const here = chainToHref(chain);

  const user = await getCurrentUser();
  const isAdmin = user?.role === "admin";

  // תיקייה מושהית – מוסתרת מהמשתמשות (מנהלת רואה)
  if (!isAdmin && chainSuspended(chain)) {
    return (
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
        <Breadcrumbs chain={chain.filter((c) => c.status === "active")} />
        <div className="card mt-10 p-12 text-center animate-pop">
          <div className="text-6xl">⏸️</div>
          <h1 className="mt-4 text-2xl font-bold">הדף מושהה זמנית</h1>
          <p className="mt-2 text-muted">התיקייה הזו אינה זמינה כרגע. נסי שוב מאוחר יותר.</p>
          <Link href="/subjects" className="btn btn-ghost mt-6">
            <ArrowRight className="h-4 w-4" aria-hidden /> לכל המקצועות
          </Link>
        </div>
      </div>
    );
  }

  const [children, mats] = await Promise.all([
    getVisibleChildren(category.id, isAdmin),
    getVisibleMaterials(category.id, isAdmin),
  ]);

  const childCounts = await Promise.all(
    children.map((c) => countMaterialsUnder(c.id, isAdmin).catch(() => 0)),
  );

  const entitlements: Entitlement[] = await Promise.all(
    mats.map((m) => checkEntitlement(user, m)),
  );

  const downloadCounts = user
    ? await getUserDownloadCounts(user.id, mats.map((m) => m.id))
    : new Map<number, number>();

  const fixesByMaterial = await getPublishedFixes(mats.map((m) => m.id));

  // כל חומר מסווג לסוג כרטיסייה לפי שמו; מה ששייך לאותה שורה בעיצוב מוצג יחד
  type Item = { m: Material; ent: Entitlement };
  const byType = new Map<CardType, Item[]>();
  const generic: Item[] = [];
  mats.forEach((m, i) => {
    const t = classifyMaterial(m);
    const item = { m, ent: entitlements[i] };
    if (!t) generic.push(item);
    else byType.set(t, [...(byType.get(t) ?? []), item]);
  });
  const cardRows = CARD_ROWS.flatMap((types) => {
    const n = Math.max(0, ...types.map((t) => byType.get(t)?.length ?? 0));
    return Array.from({ length: n }, (_, i) =>
      types.map((t) => ({ type: t, item: byType.get(t)?.[i] ?? null })),
    );
  });

  // יחידה (תיקייה בלי תתי-תיקיות) עם חומרים בתשלום: רכישה חד-פעמית של כל הקבצים
  const isUnit = children.length === 0 && category.contentModule !== "sichot";
  const hasPaid = mats.some((m) => m.access !== "free");
  const ownsAll = mats.length > 0 && entitlements.every((e) => e.ok);
  const showBundle = isUnit && hasPaid && mats.length > 0;
  const bundlePrice = category.bundlePrice || UNIT_BUNDLE_PRICE;

  const accent = category.color || root.color || "var(--blue)";
  const parentHref = chain.length > 1 ? chainToHref(chain.slice(0, -1)) : "/subjects";

  // האגוז נקבע לפי המקצוע והעומק בלבד: כל התיקיות באותה רמה באותו מקצוע מקבלות בדיוק אותה תמונה,
  // רמה אחת פנימה מקבלת תמונה אחרת, וכל מקצוע רץ על מסלול תמונות משלו
  const depth = chain.length - 1;
  const nutImg = nutForLevel(root.slug, depth);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-8">
      <Breadcrumbs chain={chain} />

      {/* כותרת */}
      <header className="mt-5 animate-fade-up">
        <div className="card relative overflow-hidden p-6 md:p-8">
          <span
            aria-hidden
            className="absolute inset-y-0 right-0 w-2"
            style={{ background: `linear-gradient(180deg, ${accent}, color-mix(in srgb, ${accent} 30%, white))` }}
          />
          <div className="flex flex-col gap-5 md:flex-row md:items-center">
            <span
              className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-3xl animate-float"
              style={{ background: `color-mix(in srgb, ${accent} 12%, white)` }}
            >
              <Image src={nutImg} alt="" className="h-9 w-9 object-contain" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-3xl font-black md:text-4xl">{category.title}</h1>
                {category.status !== "active" && (
                  <span className="chip bg-red-100 text-red-700" title="מוצג רק למנהלת">
                    {category.status === "suspended" ? "מושהה" : "טיוטה"} · מוסתר מהמשתמשות
                  </span>
                )}
                {category.questionnaireCode && (
                  <span className="chip bg-oak-soft text-oak-deep">
                    סמל שאלון {category.questionnaireCode}
                  </span>
                )}
              </div>
              {category.description && (
                <p className="mt-2 max-w-3xl leading-relaxed text-muted">{category.description}</p>
              )}
              {category.contentModule !== "sichot" && (
                <div className="mt-3 flex flex-wrap gap-2 text-sm text-muted">
                  <span className="chip bg-blue-soft text-blue-deep">
                    <FolderOpen className="h-3.5 w-3.5" aria-hidden /> {children.length} תיקיות
                  </span>
                  <span className="chip bg-pink-soft text-[#9d4a2a]">{mats.length} חומרים כאן</span>
                </div>
              )}
            </div>
            {category.bundlePrice !== null && (
              <Link
                href={`/checkout?bundle=${category.id}`}
                className="btn btn-oak shrink-0 self-start md:self-center"
              >
                <Package className="h-5 w-5" aria-hidden />
                הורידי את כל התיקייה · {formatPrice(category.bundlePrice)}
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* מאגר שיחות מורות (שיחה / חברה / כישורי חיים) – מציג מודול ייעודי במקום עמוד חומרים רגיל */}
      {category.contentModule === "sichot" ? (
        <div className="mt-10">
          <SichotModule categoryId={category.id} folderTitle={category.title} path={here} user={user} />
        </div>
      ) : (
        <>
      {/* תיקיות משנה */}
      {children.length > 0 && (
        <section className="mt-10" aria-labelledby="children-h">
          <h2 id="children-h" className="font-display text-2xl font-bold">
            תיקיות בתוך {category.title}
          </h2>
          <AnimatedGrid className="mt-5 grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {children.map((c, i) => (
              <SubjectCard
                key={c.id}
                href={chainToHref([...chain, c])}
                title={c.title}
                slug={c.slug}
                rootSlug={root.slug}
                description={c.description}
                questionnaireCode={c.questionnaireCode}
                count={childCounts[i]}
                color={c.color || accent}
                nutKey={root.slug}
                nutDepth={depth + 1}
              />
            ))}
          </AnimatedGrid>
        </section>
      )}

      {/* חומרים */}
      {mats.length > 0 && (
        <section className="mt-12" aria-labelledby="materials-h">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="materials-h" className="font-display text-2xl font-bold">
              החומרים בפרק
            </h2>
            {!user && (
              <span className="text-sm text-muted">
                <Link href={`/login?next=${encodeURIComponent(here)}`} className="text-blue-deep underline">
                  התחברי
                </Link>{" "}
                כדי להוריד קבצים
              </span>
            )}
          </div>

          <p className="relative mt-4 flex items-start gap-2.5 rounded-2xl bg-blue-soft/60 px-4 py-3 text-sm leading-relaxed text-blue-deep">
            <span className="gold-ring" aria-hidden="true" />
            <FingerprintMark className="mt-0.5 h-7 w-7 shrink-0" />
            <WatermarkText />
          </p>

          {showBundle && (
            <div className="mt-6">
              <FolderBundleBanner categoryId={category.id} price={bundlePrice} owned={ownsAll} />
            </div>
          )}
          {showBundle && ownsAll && dlall === "1" && <AutoFolderDownload href={`/api/download-folder/${category.id}`} />}

          {cardRows.length > 0 && (
            <div className="mtc-grid mt-8">
              {cardRows.flatMap((row, ri) =>
                // כל שורה תופסת שתי עמודות בדיוק, כך ששורה של כרטיס בודד לא "נבלעת" בשורה הבאה
                [...row, ...(row.length < 2 ? [{ type: "pad" as const, item: null }] : [])].map(({ type, item }) =>
                  item ? (
                    <Reveal key={item.m.id}>
                      <MaterialTypeCard
                        material={item.m}
                        entitlement={item.ent}
                        type={type}
                        bundleHref={`/checkout?bundle=${category.id}`}
                        folderTitle={category.title}
                        currentPath={here}
                        myDownloadCount={downloadCounts.get(item.m.id) ?? 0}
                        fixes={fixesByMaterial.get(item.m.id)?.map((f) => ({
                          number: f.number,
                          originalText: f.originalText,
                          correctedText: f.correctedText,
                        }))}
                      />
                    </Reveal>
                  ) : (
                    <div key={`empty-${ri}-${type}`} aria-hidden className="hidden md:block" />
                  ),
                ),
              )}
              {isUnit && <ForumCard folderTitle={category.title} />}
            </div>
          )}

          {generic.length > 0 && (
            <div className="mt-10">
              <h3 className="mb-4 text-lg font-bold">חומרים נוספים</h3>
              <AnimatedGrid className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {generic.map(({ m, ent }) => (
                  <MaterialCard
                    key={m.id}
                    material={m}
                    entitlement={ent}
                    loggedIn={!!user}
                    currentPath={here}
                    myDownloadCount={downloadCounts.get(m.id) ?? 0}
                  />
                ))}
              </AnimatedGrid>
            </div>
          )}
        </section>
      )}

      {/* ריק */}
      {children.length === 0 && mats.length === 0 && (
        // בסגנון ההודעה "שימי לב!": חלונית כחולה כהה עם ניצוץ זהב, כרטיס זהב בהיר במסגרת שחורה
        <div className="gate-panel mx-auto mt-10 max-w-2xl text-center animate-pop sm:!p-8">
          <span className="gold-ring" aria-hidden="true" />
          <div className="gate-card py-8">
            {/* הלוגו בראש ההודעה (במקום האייקון), עם ניצוצות מנצנצים סביבו */}
            <div className="empty-logo-wrap">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/logo-black.png" alt="לו״ז העניין" width={1491} height={871} className="empty-logo" />
              <svg className="empty-art empty-sparks" viewBox="0 0 171 100" aria-hidden>
                <path className="empty-spark" d={starPath(162, 14, 6, 1)} />
                <path className="empty-spark" d={starPath(9, 16, 4.5, 2)} />
                <path className="empty-spark" d={starPath(165, 52, 4, 3)} />
              </svg>
            </div>
            <h2 className="empty-title mt-4 text-3xl">התיקייה הזו עדיין ריקה</h2>
            <p className="empty-soft mx-auto mt-2 max-w-md">
              החומרים לפרק הזה בהכנה. שווה לחזור בקרוב.
            </p>
            <Link href={parentHref} className="btn btn-gold btn-gate mt-6 py-2">
              <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden /> חזרה לתיקייה הקודמת
            </Link>
          </div>
        </div>
      )}

      {/* פורום מורות – רק ביחידות עצמן (תיקיות ללא תתי-תיקיות) */}
      {children.length === 0 && <UnitForum category={category} here={here} user={user} />}
        </>
      )}
    </div>
  );
}
