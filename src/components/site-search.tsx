"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { FolderOpen, Loader2, Search, X } from "lucide-react";
import { MATERIAL_KINDS, formatPrice } from "@/lib/constants";
import type { SearchResult } from "@/lib/data";

const SEARCH_OPEN_EVENT = "site-search:open";

/** פותחת את חלון החיפוש מכל מקום באתר (כמו emitCartChanged לעגלה) */
export function openSiteSearch() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(SEARCH_OPEN_EVENT));
  }
}

export function SearchTriggerButton({
  className,
  label,
  onClick,
}: {
  className?: string;
  label?: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        onClick?.();
        openSiteSearch();
      }}
      aria-label="חיפוש באתר"
      title="חיפוש (/)"
      className={className}
    >
      <Search className="h-5 w-5" aria-hidden />
      {label && <span>{label}</span>}
    </button>
  );
}

/** חלון החיפוש עצמו – רכיב יחיד שמאזין לאירוע הפתיחה (רנדר פעם אחת ב-Header) */
export function SiteSearchOverlay() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setResults(null);
  }, []);

  useEffect(() => {
    const onOpenEvent = () => setOpen(true);
    window.addEventListener(SEARCH_OPEN_EVENT, onOpenEvent);
    return () => window.removeEventListener(SEARCH_OPEN_EVENT, onOpenEvent);
  }, []);

  // קיצור מקלדת "/" לפתיחה (כשלא כותבים בשדה אחר) + Escape לסגירה
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        close();
        return;
      }
      if (e.key === "/" && !open) {
        const t = e.target as HTMLElement | null;
        if (t?.tagName === "INPUT" || t?.tagName === "TEXTAREA" || t?.isContentEditable) return;
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // שהיה קצרה + ביטול בקשה קודמת, כדי לא להציף את השרת בכל הקשה
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((r) => (r.ok ? r.json() : { results: [] }))
        .then((d: { results?: SearchResult[] }) => setResults(d.results ?? []))
        .catch((e: unknown) => {
          if ((e as { name?: string })?.name !== "AbortError") setResults([]);
        })
        .finally(() => setLoading(false));
    }, 220);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  if (!open) return null;

  const categoryResults = results?.filter((r) => r.type === "category") ?? [];
  const materialResults = results?.filter((r) => r.type === "material") ?? [];

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-20 backdrop-blur-sm sm:pt-28"
      onMouseDown={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="חיפוש באתר"
        className="card w-full max-w-lg animate-pop overflow-hidden p-0"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-black/10 px-4 py-3">
          <Search className="h-5 w-5 shrink-0 text-muted" aria-hidden />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="חיפוש חומרים, מקצועות, פרקים..."
            className="min-w-0 flex-1 bg-transparent text-base outline-none"
          />
          {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted" aria-hidden />}
          <button
            type="button"
            onClick={close}
            aria-label="סגירת חיפוש"
            className="shrink-0 rounded-full p-1 transition-transform hover:scale-110 hover:bg-blue-soft"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto p-2">
          {q.trim().length < 2 ? (
            <p className="px-3 py-6 text-center text-sm text-muted">הקלידי לפחות 2 תווים כדי לחפש</p>
          ) : results === null ? (
            <p className="px-3 py-6 text-center text-sm text-muted">מחפשת…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted">
              לא נמצאו תוצאות עבור &quot;{q.trim()}&quot;
            </p>
          ) : (
            <>
              {categoryResults.length > 0 && (
                <ResultGroup title="מקצועות ותיקיות" items={categoryResults} onNavigate={close} />
              )}
              {materialResults.length > 0 && (
                <ResultGroup title="חומרים" items={materialResults} onNavigate={close} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultGroup({
  title,
  items,
  onNavigate,
}: {
  title: string;
  items: SearchResult[];
  onNavigate: () => void;
}) {
  return (
    <div className="mb-1 last:mb-0">
      <p className="px-3 pb-1 pt-2 text-xs font-semibold text-muted">{title}</p>
      <ul>
        {items.map((r) => (
          <li key={`${r.type}-${r.id}`}>
            <Link
              href={r.href}
              onClick={onNavigate}
              className="flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-blue-soft/60"
            >
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-soft text-lg"
                aria-hidden
              >
                {r.type === "category" ? <FolderOpen className="h-4 w-4 text-blue-deep" /> : MATERIAL_KINDS[r.kind].icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold leading-snug">{r.title}</span>
                <span className="block truncate text-xs text-muted">
                  {r.type === "category" ? "תיקייה" : r.categoryTitle}
                </span>
              </span>
              {r.type === "material" && (
                <span
                  className={`chip shrink-0 text-[11px] ${
                    r.access === "free" ? "bg-green-100 text-green-800" : "bg-gold-soft text-[#7a5b00]"
                  }`}
                >
                  {r.access === "free" ? "חינם" : formatPrice(r.price)}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
