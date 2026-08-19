import Link from "next/link";
import Image from "next/image";
import { ChevronLeft } from "lucide-react";
import { SUBJECT_ICONS, SUBJECT_HOUSES } from "@/lib/constants";

type Props = {
  href: string;
  title: string;
  slug?: string;
  icon?: string | null;
  description?: string | null;
  questionnaireCode?: string | null;
  count?: number;
  countLabel?: string;
  color?: string | null;
  size?: "md" | "lg";
};

/**
 * כרטיס בסגנון תיקייה – משמש למקצועות, יחידות, נושאים ופרקים.
 */
export function SubjectCard({
  href,
  title,
  slug,
  icon,
  description,
  questionnaireCode,
  count,
  countLabel = "חומרים",
  color,
  size = "md",
}: Props) {
  const emoji = icon || (slug ? SUBJECT_ICONS[slug] : undefined) || "📘";
  const house = slug ? SUBJECT_HOUSES[slug] : undefined;
  const accent = color || "var(--blue)";
  const big = size === "lg";

  return (
    <Link
      href={href}
      className="group block h-full focus-visible:outline-none"
      aria-label={`פתיחת ${title}`}
    >
      <div className="relative h-full pt-3">
        {/* לשונית התיקייה */}
        <span
          aria-hidden
          className="absolute top-0 right-5 h-5 w-24 rounded-t-xl border border-b-0 border-black/5 transition-transform group-hover:-translate-y-0.5"
          style={{ background: `color-mix(in srgb, ${accent} 18%, white)` }}
        />
        <div
          className={`card card-hover relative h-full overflow-hidden ${
            big ? "p-6" : "p-5"
          } group-focus-visible:ring-4 group-focus-visible:ring-blue/30`}
        >
          <span
            aria-hidden
            className="absolute inset-x-0 top-0 h-1.5"
            style={{
              background: `linear-gradient(90deg, ${accent}, color-mix(in srgb, ${accent} 30%, white))`,
            }}
          />
          <div className="flex items-start gap-4">
            {house ? (
              <span
                className={`relative grid shrink-0 place-items-center ${
                  big ? "h-16 w-16" : "h-12 w-12"
                } transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3`}
              >
                <Image
                  src={house}
                  alt=""
                  fill
                  sizes={big ? "64px" : "48px"}
                  className="object-contain"
                />
              </span>
            ) : (
              <span
                className={`grid shrink-0 place-items-center rounded-2xl ${
                  big ? "h-16 w-16 text-4xl" : "h-12 w-12 text-2xl"
                } transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3`}
                style={{ background: `color-mix(in srgb, ${accent} 12%, white)` }}
              >
                {emoji}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <h3
                className={`font-display font-bold leading-tight ${
                  big ? "text-2xl" : "text-lg"
                }`}
              >
                {title}
              </h3>
              {description && (
                <p className="mt-1 text-sm text-muted line-clamp-2 leading-relaxed">
                  {description}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {questionnaireCode && (
                  <span className="chip bg-oak-soft text-oak-deep" title="סמל שאלון">
                    שאלון {questionnaireCode}
                  </span>
                )}
                {typeof count === "number" && (
                  <span className="chip bg-blue-soft text-blue-deep">
                    {count} {countLabel}
                  </span>
                )}
              </div>
            </div>
            <ChevronLeft
              className="mt-1 h-5 w-5 shrink-0 text-muted transition-transform group-hover:-translate-x-1 group-hover:text-blue"
              aria-hidden
            />
          </div>
        </div>
      </div>
    </Link>
  );
}
