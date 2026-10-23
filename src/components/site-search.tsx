"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { FolderOpen, Loader2, Search, X } from "lucide-react";
import { MATERIAL_KINDS, formatPrice } from "@/lib/constants";
import type { SearchResult } from "@/lib/data";
import { RECENT_FOLDERS_EVENT, clearRecentFolders, readRecentFolders, type RecentFolder } from "@/lib/recent-folders";

const SEARCH_OPEN_EVENT = "site-search:open";

/** פותחת את חלון החיפוש מכל מקום באתר */
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
      data-tip="חיפוש (/)"
      data-tip-side="below"
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
  const [recents, setRecents] = useState<RecentFolder[]>([]);
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

  // "ביקרת לאחרונה": תיקיות הקבצים האחרונות מהדפדפן (ר' recent-folders.ts)
  useEffect(() => {
    if (!open) return;
    const load = () => setRecents(readRecentFolders().slice(0, 5));
    load();
    window.addEventListener(RECENT_FOLDERS_EVENT, load);
    return () => window.removeEventListener(RECENT_FOLDERS_EVENT, load);
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

  const words = q
    .trim()
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  return (
    <div dir="rtl" className="ss-backdrop" onMouseDown={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="חיפוש באתר"
        className="ss-panel"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="ss-head">
          <h2>חיפוש באתר</h2>
          <button type="button" onClick={close} aria-label="סגירת חיפוש" className="ss-close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="ss-inner">
          <label className="ss-field">
            <Search className="ss-mag" aria-hidden />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="חיפוש חומרים, מקצועות, פרקים..."
              className="ss-input"
              autoComplete="off"
            />
            {loading && <Loader2 className="ss-spin" aria-hidden />}
          </label>

          <div className="ss-results">
            {q.trim().length < 2 ? (
              recents.length > 0 ? (
                <div className="ss-group">
                  <div className="ss-group-head">
                    <h3>ביקרת לאחרונה</h3>
                    <button type="button" onClick={clearRecentFolders} className="ss-clear">
                      ניקוי
                    </button>
                  </div>
                  {recents.map((r) => (
                    <Link key={r.href} href={r.href} onClick={close} className="ss-row">
                      <span className="ss-ico" aria-hidden>
                        <FolderOpen className="h-4 w-4" />
                      </span>
                      <span className="ss-txt">
                        <span className="ss-title">{r.title}</span>
                        {r.path && <span className="ss-sub">{r.path}</span>}
                      </span>
                    </Link>
                  ))}
                  <p className="ss-note">או הקלידי כדי לחפש, למשל: פרשת בא פרק יג לתלמידה</p>
                </div>
              ) : (
                <p className="ss-note">הקלידי לפחות 2 תווים כדי לחפש, למשל: פרשת בא פרק יג לתלמידה</p>
              )
            ) : results === null ? (
              <p className="ss-note">מחפשת…</p>
            ) : results.length === 0 ? (
              <p className="ss-note">לא נמצאו תוצאות עבור &quot;{q.trim()}&quot;</p>
            ) : (
              <>
                {results.some((r) => r.approx) && <p className="ss-approx">לא נמצאה התאמה מלאה – אלה התוצאות הקרובות ביותר</p>}
                {categoryResults.length > 0 && (
                  <ResultGroup title="מקצועות ותיקיות" items={categoryResults} words={words} onNavigate={close} />
                )}
                {materialResults.length > 0 && (
                  <ResultGroup title="חומרים" items={materialResults} words={words} onNavigate={close} />
                )}
              </>
            )}
          </div>

          <div className="ss-foot">
            קיצור מהיר לפתיחה: <kbd>/</kbd> · לסגירה: <kbd>Esc</kbd>
          </div>
        </div>
      </div>
    </div>
  );
}

/** מסמן בזהב את המילים שחיפשו בתוך הכותרת (התאמה פשוטה, לפי הטקסט כמות שהוא) */
function Highlight({ text, words }: { text: string; words: string[] }) {
  if (words.length === 0) return <>{text}</>;
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const parts = text.split(new RegExp(`(${escaped.join("|")})`, "gi"));
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1 ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>))}
    </>
  );
}

function ResultGroup({
  title,
  items,
  words,
  onNavigate,
}: {
  title: string;
  items: SearchResult[];
  words: string[];
  onNavigate: () => void;
}) {
  return (
    <div className="ss-group">
      <h3>{title}</h3>
      {items.map((r) => (
        <Link key={`${r.type}-${r.id}`} href={r.href} onClick={onNavigate} className="ss-row">
          <span className="ss-ico" aria-hidden>
            {r.type === "category" ? <FolderOpen className="h-4 w-4" /> : MATERIAL_KINDS[r.kind].icon}
          </span>
          <span className="ss-txt">
            <span className="ss-title">
              <Highlight text={r.title} words={words} />
            </span>
            <span className="ss-sub">{r.path || (r.type === "category" ? "תיקייה" : r.categoryTitle)}</span>
          </span>
          {r.type === "material" && (
            <span className={`ss-chip ${r.access === "free" ? "free" : "price"}`}>
              {r.access === "free" ? "חינם" : formatPrice(r.price)}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
