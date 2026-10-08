"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { BookOpen, BookOpenCheck, ClipboardCheck, FileText, Layers, ListChecks, Mic, School, Sparkles, X } from "lucide-react";
import { KIND_LABEL, type ExplainGroup, type ExplainPart, type Explainer, type PartKind } from "@/lib/bagrut-explainers";

const KIND_ICON: Record<PartKind, typeof FileText> = {
  external: FileText,
  school: School,
  task: ClipboardCheck,
  oral: Mic,
  module: Layers,
  topic: BookOpen,
};

/** גוונים של זהב לפס ההמחשה — הכול בצבע זהב, מבדיל רק בבהירות */
const KIND_SHADE: Record<PartKind, string> = {
  external: "#ffd45a",
  school: "#e0b23c",
  task: "#f3dc8f",
  oral: "#c99a2a",
  module: "#ffe9a8",
  topic: "#ffd45a",
};

/** מפצל טקסט הסבר לשורות קצרות: לפי שורה חדשה, ואם אין – לפי נקודה-פסיק / סוף משפט (בקשת המורה: "לרדת שורות") */
/** משפט שמסביר מהו הסימון ✂ / קו חוצה — הוסר מההסברים (מוסבר במקרא התרשים; לא חוזרים עליו) */
const isScissorsLegend = (t: string) => /(מסומנ|שמסומנ).*(✂|קו חוצה)|הוצאו ממיקוד/.test(t) && !/^✂ לא נדרש/.test(t);

/** משפט "נבחנים בו יחד גם …" / "אותו שאלון בודק גם …" — מוצג בסוגריים ובחום בהיר יותר */
const isSharedNote = (t: string) => /^\(?(נבחנים (בו|בה|בהם) יחד|אותו שאלון (בודק|נבחן))/.test(t.trim());
function Line({ text }: { text: string }) {
  if (!isSharedNote(text)) return <p>{text}</p>;
  const bare = text.trim().replace(/^\(/, "").replace(/\)$/, "");
  return <p className="explain-aside">({bare})</p>;
}

/** שורות בתבנית "22% · הבנת הנקרא" מוצגות כטבלת חלוקה; שאר השורות — כרגיל */
export function Lines({ lines }: { lines: string[] }) {
  const out: React.ReactNode[] = [];
  let rows: { pct: string; label: string }[] = [];
  const flush = (key: string) => {
    if (!rows.length) return;
    out.push(
      <table key={key} className="explain-table">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="explain-table-pct">{r.pct}</td>
              <td>{r.label}</td>
            </tr>
          ))}
        </tbody>
      </table>,
    );
    rows = [];
  };
  lines.forEach((line, i) => {
    const m = /^(\d{1,3}%)\s*·\s*(.+)$/.exec(line.trim());
    if (m) rows.push({ pct: m[1], label: m[2] });
    else {
      flush("t" + i);
      out.push(<Line key={i} text={line} />);
    }
  });
  flush("tend");
  return <>{out}</>;
}

export function splitLines(text: string): string[] {
  return splitRaw(text).filter((t) => !isScissorsLegend(t));
}

function splitRaw(text: string): string[] {
  const byNl = text.split(String.fromCharCode(10)).map((t) => t.trim()).filter(Boolean);
  if (byNl.length > 1) return byNl;
  return text
    .split(/(?<=[.!?])\s+(?=\S)|;\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}


/** פס המחשה של חלוקת הציון — רק כשכל הרכיבים בקבוצה יחד נותנים בדיוק 100% */
function ScoreBar({ group }: { group: ExplainGroup }) {
  const total = group.parts.reduce((sum, p) => sum + (p.pct ?? 0), 0);
  if (total !== 100 || group.parts.some((p) => p.pct === undefined)) return null;
  return (
    <div className="explain-bar" role="img" aria-label="חלוקת הציון">
      {group.parts.map((p, i) => (
        <span key={i} className="explain-bar-seg" style={{ flexGrow: p.pct, backgroundColor: KIND_SHADE[p.kind] }}>
          {p.pct}%
        </span>
      ))}
    </div>
  );
}

/** כרטיס רכיב בציון: סוג, שם, מה כולל, ובצד — משקל וסמל שאלון */
function Ticket({ part }: { part: ExplainPart }) {
  const Icon = KIND_ICON[part.kind];
  return (
    <div className="explain-ticket-wrap">
      <div className="gate-card explain-ticket">
        <div className="explain-ticket-main">
          <span className="explain-kind">
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {KIND_LABEL[part.kind]}
          </span>
          <h5 className="explain-ticket-name">{part.name}</h5>
          <div className="explain-ticket-covers">
            {splitLines(part.covers).map((line, i) => (
              <Line key={i} text={line} />
            ))}
          </div>
        </div>
        <div className="explain-stub">
          <span className="explain-weight">{part.weight}</span>
          {part.code && <span className="explain-code">שאלון {part.code}</span>}
        </div>
      </div>
    </div>
  );
}

function Group({ group }: { group: ExplainGroup }) {
  return (
    <section className="explain-group">
      {group.label && <h4 className="explain-group-title">{group.label}</h4>}
      {group.hint && (
        <div className="explain-hint">
          {splitLines(group.hint).map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      )}
      <ScoreBar group={group} />
      <div className="explain-tickets">
        {group.parts.map((p, i) => (
          <Ticket key={i} part={p} />
        ))}
      </div>
    </section>
  );
}

/**
 * חלונית "הסבר" לבגרות בתרשים: מסגרת כחולה כהה עם טבעת זהב (כותרת בלבד), ובתוכה דף בהיר עם כרטיסי רכיבים —
 * אותו סגנון של עמוד המסלולים והמחירים (אבל כרטיסים רגילים — לא קופונים), הכול בכתב גברת לוין.
 * את הפירוט המלא של מה ללמד מוצאים בחלונות שבתרשים עצמו. נסגרת ב-Esc, בלחיצה על הרקע או בכפתור.
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

  // כל משפט בשורה משלו (גם בהערות ובצעדים), בלי המשפט שמסביר את סימון ✂
  const noteLines = (explainer.notes ?? []).flatMap(splitLines);
  const stepLines = (explainer.steps ?? []).flatMap(splitLines);

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
            {explainer.subtitle && <p className="explain-subtitle">{explainer.subtitle}</p>}
          </div>
        </header>

        {explainer.generic ? (
          /* הסבר כללי: שורות פשוטות, בלי כרטיסים */
          <div className="explain-sheet explain-plain">
            {explainer.groups[0].parts[0].code && (
              <span className="explain-tiles-code q-code-tag">שאלון {explainer.groups[0].parts[0].code}</span>
            )}
            <Lines lines={splitLines(explainer.groups[0].parts[0].covers)} />
            <p className="explain-continue">לפירוט מלא של מה ללמד — המשיכי ללחוץ על החלונות בתרשים.</p>
          </div>
        ) : (
        <div className="explain-sheet">
        <h4 className="explain-section">איך הציון בנוי</h4>
        {explainer.groups.map((g, i) => <Group key={i} group={g} />)}

        {stepLines.length > 0 && (
          <>
            <h4 className="explain-section">
              <ListChecks className="inline h-5 w-5" aria-hidden /> מה זה אומר בפועל
            </h4>
            <ol className="explain-steps">
              {stepLines.map((s, i) => (
                <li key={i}>
                  <span className="explain-step-num">{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          </>
        )}

        {noteLines.length > 0 && (
          <div className="explain-notes gate-strip">
            <Sparkles className="h-5 w-5 shrink-0" aria-hidden />
            <ul>
              {noteLines.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
        )}

        <p className="explain-continue">לפירוט מלא של מה ללמד — המשיכי ללחוץ על החלונות בתרשים.</p>
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
