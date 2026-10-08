"use client";

import { Lines, splitLines } from "@/components/bagrut-explain-dialog";
import type { Explainer } from "@/lib/bagrut-explainers";

/**
 * תוכן ההסבר ישירות בשטח הריבוע (בלי חלונית ובלי לחיצה): אותם משפטים כמו בחלונית של התרשים.
 * הסבר כללי — השורות עצמן; הסבר בגרות מפורט — שורה לכל רכיב (שם · סמל שאלון · משקל).
 */
export function ExplainInline({ explainer, showTitle = true }: { explainer: Explainer; showTitle?: boolean }) {
  const first = explainer.groups[0]?.parts[0];
  return (
    <div className="folder-explain-inline">
      {showTitle && <h4 className="folder-explain-title">{explainer.title}</h4>}
      {explainer.generic && first ? (
        <>
          {showTitle && first.code && <span className="q-code-tag folder-explain-code">שאלון {first.code}</span>}
          <Lines lines={splitLines(first.covers)} />
        </>
      ) : (
        <>
          {explainer.subtitle && <p>{explainer.subtitle}</p>}
          {explainer.groups.map((g, i) => (
            <div key={i}>
              {g.label && <p className="folder-explain-label">{g.label}</p>}
              <ul>
                {g.parts.map((p, j) => (
                  <li key={j}>
                    {p.name}
                    {p.code ? ` · ${p.code}` : ""} · {p.weight}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
