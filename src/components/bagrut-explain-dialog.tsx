"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { BookOpenCheck, ClipboardCheck, FileText, Layers, ListChecks, Mic, School, Sparkles, X } from "lucide-react";
import { KIND_LABEL, type ExplainGroup, type Explainer, type PartKind } from "@/lib/bagrut-explainers";

const KIND_ICON: Record<PartKind, typeof FileText> = {
  external: FileText,
  school: School,
  task: ClipboardCheck,
  oral: Mic,
  module: Layers,
};

/** צבע הפס והתגית לכל סוג רכיב (על רקע חלונית כחולה כהה) */
const KIND_COLOR: Record<PartKind, string> = {
  external: "#ffd45a",
  school: "#fbefc2",
  task: "#9fc3ff",
  oral: "#ffb5a0",
  module: "#cfe3a8",
};

/** פס המחשה של חלוקת הציון — רק כשכל הרכיבים בקבוצה יחד נותנים בדיוק 100% */
function ScoreBar({ group }: { group: ExplainGroup }) {
  const total = group.parts.reduce((sum, p) => sum + (p.pct ?? 0), 0);
  if (total !== 100 || group.parts.some((p) => p.pct === undefined)) return null;
  return (
    <div className="explain-bar" role="img" aria-label="חלוקת הציון">
      {group.parts.map((p, i) => (
        <span
          key={i}
          className="explain-bar-seg"
          style={{ flexGrow: p.pct, backgroundColor: KIND_COLOR[p.kind] }}
        >
          {p.pct}%
        </span>
      ))}
    </div>
  );
}

function Group({ group }: { group: ExplainGroup }) {
  return (
    <section className="explain-group">
      {group.label && <h4 className="explain-group-title">{group.label}</h4>}
      {group.hint && <p className="explain-hint">{group.hint}</p>}
      <ScoreBar group={group} />
      <div className="explain-tickets">
        {group.parts.map((p, i) => {
          const Icon = KIND_ICON[p.kind];
          return (
            <div key={i} className="gate-card coupon explain-ticket">
              <div className="coupon-main explain-ticket-main">
                <div className="explain-ticket-head">
                  <span className="explain-kind" style={{ backgroundColor: KIND_COLOR[p.kind] }}>
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    {KIND_LABEL[p.kind]}
                  </span>
                </div>
                <h5 className="explain-ticket-name">{p.name}</h5>
                <p className="explain-ticket-covers">{p.covers}</p>
              </div>
              <div className="coupon-stub explain-stub">
                <span className="explain-weight">{p.weight}</span>
                {p.code && <span className="explain-code">שאלון {p.code}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/**
 * חלונית "הסבר" לבגרות בתרשים: חלונית כחולה כהה עם טבעת זהב, קופוני זהב עם ספח תלוש —
 * אותו סגנון של עמוד המסלולים והמחירים. נסגרת ב-Esc, בלחיצה על הרקע או בכפתור.
 */
export function BagrutExplainDialog({ explainer, onClose }: { explainer: Explainer; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div className="explain-backdrop" onClick={onClose}>
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="explain-title"
        className="gate-panel explain-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="gold-ring" aria-hidden="true" />
        <button type="button" onClick={onClose} className="explain-close" aria-label="סגירה">
          <X className="h-5 w-5" aria-hidden />
        </button>

        <header className="explain-header">
          <span className="gate-icon">
            <BookOpenCheck className="h-6 w-6" strokeWidth={1.5} aria-hidden />
          </span>
          <div>
            <h3 id="explain-title" className="explain-title">
              {explainer.title}
            </h3>
            <p className="explain-subtitle">{explainer.subtitle}</p>
          </div>
        </header>

        <h4 className="explain-section">איך הציון בנוי</h4>
        {explainer.groups.map((g, i) => (
          <Group key={i} group={g} />
        ))}

        {explainer.steps && explainer.steps.length > 0 && (
          <>
            <h4 className="explain-section">
              <ListChecks className="inline h-5 w-5" aria-hidden /> מה זה אומר בפועל
            </h4>
            <ol className="explain-steps">
              {explainer.steps.map((s, i) => (
                <li key={i}>
                  <span className="explain-step-num">{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          </>
        )}

        {explainer.notes && explainer.notes.length > 0 && (
          <div className="explain-notes gate-strip">
            <Sparkles className="h-5 w-5 shrink-0" aria-hidden />
            <ul>
              {explainer.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 text-center">
          <button type="button" onClick={onClose} className="btn btn-gold btn-gate py-2">
            הבנתי, תודה
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
