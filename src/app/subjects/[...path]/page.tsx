import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FolderOpen, Package, ArrowRight, Crown, ShieldCheck } from "lucide-react";
import {
  resolvePath,
  getVisibleChildren,
  getVisibleMaterials,
  chainSuspended,
  chainToHref,
  countMaterialsUnder,
  checkEntitlement,
  type Entitlement,
} from "@/lib/data";
import { getCurrentUser } from "@/lib/session";
import { MATERIAL_KINDS, PREMIUM_KINDS, SUBJECT_ICONS, formatPrice } from "@/lib/constants";
import type { Material, MaterialKind } from "@/db/schema";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SubjectCard } from "@/components/subject-card";
import { MaterialCard } from "@/components/material-card";
import { AnimatedGrid, Reveal } from "@/components/animated-grid";
import { UnitForum } from "@/components/unit-forum";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ path: string[] }> };

const KIND_ORDER: MaterialKind[] = [
  "student_sheet",
  "teacher_sheet",
  "presentation",
  "past_exam",
  "tips",
  "ideas",
  "other",
];

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

export default async function CategoryPage({ params }: Props) {
  const { path } = await params;
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
    children.map((c) => countMaterialsUnder(c.id).catch(() => 0)),
  );

  const entitlements: Entitlement[] = await Promise.all(
    mats.map((m) => checkEntitlement(user, m)),
  );

  const groups = KIND_ORDER.map((kind) => ({
    kind,
    items: mats
      .map((m, i) => ({ m, ent: entitlements[i] }))
      .filter((x) => x.m.kind === kind),
  })).filter((g) => g.items.length > 0);

  const icon = category.icon || SUBJECT_ICONS[category.slug] || (chain.length === 1 ? "📘" : "📁");
  const accent = category.color || root.color || "var(--blue)";
  const parentHref = chain.length > 1 ? chainToHref(chain.slice(0, -1)) : "/subjects";

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
              className="grid h-20 w-20 shrink-0 place-items-center rounded-3xl text-5xl animate-float"
              style={{ background: `color-mix(in srgb, ${accent} 12%, white)` }}
            >
              {icon}
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
              <div className="mt-3 flex flex-wrap gap-2 text-sm text-muted">
                <span className="chip bg-blue-soft text-blue-deep">
                  <FolderOpen className="h-3.5 w-3.5" aria-hidden /> {children.length} תיקיות
                </span>
                <span className="chip bg-pink-soft text-[#9d4a2a]">{mats.length} חומרים כאן</span>
              </div>
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
                icon={c.icon}
                description={c.description}
                questionnaireCode={c.questionnaireCode}
                count={childCounts[i]}
                color={c.color || accent}
              />
            ))}
          </AnimatedGrid>
        </section>
      )}

      {/* חומרים */}
      {groups.length > 0 && (
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

          <p className="mt-4 flex items-start gap-2.5 rounded-2xl bg-blue-soft/60 px-4 py-3 text-sm leading-relaxed text-blue-deep">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
            <span>
              בכל הורדה מוטבעים בקובץ המספר האישי של המורידה והודעת זכויות יוצרים. כך אנחנו
              שומרות על היוצרות — ועל המחירים הנמוכים.
            </span>
          </p>

          <div className="mt-6 space-y-10">
            {groups.map((g) => {
              const meta = MATERIAL_KINDS[g.kind];
              const premium = PREMIUM_KINDS.includes(g.kind);
              return (
                <Reveal key={g.kind}>
                  <div className="mb-4 flex flex-wrap items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-soft text-xl" aria-hidden>
                      {meta.icon}
                    </span>
                    <div>
                      <h3 className="text-lg font-bold flex items-center gap-2">
                        {meta.label}
                        {premium && (
                          <span className="chip btn-gold text-[11px]">
                            <Crown className="h-3 w-3" aria-hidden /> פרימיום
                          </span>
                        )}
                      </h3>
                      {meta.hint && <p className="text-sm text-muted">{meta.hint}</p>}
                    </div>
                  </div>
                  <AnimatedGrid className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                    {g.items.map(({ m, ent }: { m: Material; ent: Entitlement }) => (
                      <MaterialCard
                        key={m.id}
                        material={m}
                        entitlement={ent}
                        loggedIn={!!user}
                        currentPath={here}
                      />
                    ))}
                  </AnimatedGrid>
                </Reveal>
              );
            })}
          </div>
        </section>
      )}

      {/* ריק */}
      {children.length === 0 && mats.length === 0 && (
        <div className="card mt-10 p-12 text-center animate-pop">
          <div className="text-6xl animate-float">🪄</div>
          <h2 className="mt-4 text-2xl font-bold">התיקייה הזו עדיין ריקה</h2>
          <p className="mt-2 text-muted">החומרים לפרק הזה בהכנה. שווה לחזור בקרוב.</p>
          <Link href={parentHref} className="btn btn-ghost mt-6">
            <ArrowRight className="h-4 w-4" aria-hidden /> חזרה לתיקייה הקודמת
          </Link>
        </div>
      )}

      {/* פורום מורות – רק ביחידות עצמן (תיקיות ללא תתי-תיקיות) */}
      {children.length === 0 && <UnitForum category={category} here={here} user={user} />}
    </div>
  );
}
