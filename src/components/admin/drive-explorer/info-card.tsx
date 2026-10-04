"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, Download, FileText, LoaderCircle, RefreshCw, Upload } from "lucide-react";
import type { FolderView } from "@/lib/actions/driveExplorer";
import { fmtDate, relTime } from "./shared";

type Props = {
  view: FolderView;
  text: string;
  uploadedAt: string | null; // override אחרי העלאה מהסשן הנוכחי
  fileId: string | null;
  busy: "refresh" | "upload" | null;
  onRefresh: () => void;
  onUpload: () => void;
  onDownload: () => void;
  onSync?: () => void;
};

type Line = { cls: string; s: string };

function classify(text: string): Line[] {
  const lines = text.split("\n");
  const isRule = (s: string | undefined) => !!s && /^[─═]{8,}$/.test(s.trim());
  return lines.map((s, i) => {
    if (isRule(s)) return { cls: "dim", s };
    if (isRule(lines[i - 1]) || isRule(lines[i + 1])) return { cls: "h", s };
    const t = s.trimStart();
    if (t.startsWith("✔")) return { cls: "ok", s };
    if (t.startsWith("✖")) return { cls: "bad", s };
    return { cls: "", s };
  });
}

export function InfoCard({ view, text, uploadedAt, fileId, busy, onRefresh, onUpload, onDownload, onSync }: Props) {
  const [big, setBig] = useState(false);
  const [nowMs] = useState(() => Date.now());
  const lines = useMemo(() => classify(text), [text]);

  const modified = uploadedAt ?? view.info.modified;
  // היוריסטיקה: אם יש קובץ שנוסף/עודכן אחרי עדכון קובץ המידע — ייתכן שהוא לא מעודכן
  const latestChange = useMemo(() => {
    let max = 0;
    for (const f of view.files) {
      max = Math.max(max, +new Date(f.createdAt) || 0, +new Date(f.driveModified ?? 0) || 0);
    }
    return max;
  }, [view.files]);
  const stale = !!fileId && !!modified && !uploadedAt && latestChange > +new Date(modified);

  const none = !fileId;
  const miss = view.missing?.missing.length ?? 0;
  const present = view.missing?.present.length ?? 0;
  const statusCounts = useMemo(() => {
    const c = { active: 0, draft: 0, suspended: 0 };
    for (const f of view.files) if (f.status in c) c[f.status as keyof typeof c]++;
    return c;
  }, [view.files]);
  const lastWeek = view.files.filter((f) => nowMs - +new Date(f.createdAt) < 7 * 864e5).length;
  const renamed = view.files.filter((f) => f.originalName && f.originalName !== f.fileName).length;

  return (
    <section className="card info" aria-label="קובץ מידע של התיקייה">
      <div className="info-h">
        <FileText className="ic" aria-hidden style={{ width: "1.4rem", height: "1.4rem", color: "var(--sea2)" }} />
        <h3>קובץ מידע של התיקייה</h3>
        <span className="fname">_מידע.txt</span>
        {none ? (
          <span className="upl none"><AlertTriangle className="ic" aria-hidden />טרם הועלה לדרייב</span>
        ) : stale ? (
          <span className="upl stale">
            <AlertTriangle className="ic" aria-hidden />
            בדרייב: ייתכן שלא מעודכן · הועלה {fmtDate(modified, true)} ({relTime(modified)}), ויש שינויים מאז
          </span>
        ) : (
          <span className="upl ok">
            <Check className="ic" aria-hidden />
            הקובץ בדרייב · עודכן {fmtDate(modified, true)} ({relTime(modified)})
          </span>
        )}
      </div>
      <div className="info-body">
        <div className={`paper ${big ? "big" : ""}`}>
          <div className="paper-scroll">
            <pre dir="rtl">
              {lines.map((l, i) => (
                <span key={i}>
                  {l.cls ? <span className={l.cls}>{l.s}</span> : l.s}
                  {"\n"}
                </span>
              ))}
            </pre>
          </div>
          {lines.length > 12 && (
            <div className="paper-more">
              <button type="button" onClick={() => setBig((b) => !b)} aria-expanded={big}>
                {big ? "הקטן תצוגה ↑" : "הצג את כל הקובץ ↓"}
              </button>
            </div>
          )}
        </div>
        <div className="info-side">
          <div className="stats">
            {view.missing ? (
              <div className={`stat ${miss ? "bad" : "good"}`}>
                <b>{miss}</b>
                <span>{miss ? "קבצי חבילה חסרים" : "החבילה שלמה"}</span>
              </div>
            ) : (
              <div className="stat"><b>{view.folders.length}</b><span>תיקיות משנה</span></div>
            )}
            <div className="stat"><b>{view.files.length}</b><span>קבצים בתיקייה</span></div>
            <div className="stat"><b>{lastWeek}</b><span>נוספו השבוע</span></div>
            <div className="stat"><b>{renamed}</b><span>עם שם ישן</span></div>
          </div>
          {view.missing && (
            <p className="info-note">
              {present} מתוך {present + miss} סוגי קבצים קיימים · פעיל {statusCounts.active} · טיוטה {statusCounts.draft} · מושהה {statusCounts.suspended}
            </p>
          )}
          <div className="info-actions">
            <button type="button" className="btn btn-ghost" onClick={onRefresh} disabled={!!busy} aria-busy={busy === "refresh"}>
              {busy === "refresh" ? <LoaderCircle className="ic spin-ic" aria-hidden /> : <RefreshCw className="ic" aria-hidden />}
              רענן מהאתר
            </button>
            <button type="button" className="btn btn-primary" onClick={onUpload} disabled={!!busy} aria-busy={busy === "upload"}>
              {busy === "upload" ? <LoaderCircle className="ic spin-ic" aria-hidden /> : <Upload className="ic" aria-hidden />}
              {busy === "upload" ? "מעלה…" : "העלה לדרייב"}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onDownload}>
              <Download className="ic" aria-hidden />
              הורד .txt
            </button>
            {onSync && (
              <button type="button" className="btn btn-ghost" onClick={onSync} disabled={!!busy} title="מצרף קבצים חדשים שנוספו לתיקייה בדרייב, ומעדכן קבצים שנגררו ידנית">
                <RefreshCw className="ic" aria-hidden />
                סנכרן תיקייה זו מהדרייב
              </button>
            )}
          </div>
          <p className="info-note">
            ההעלאה יוצרת/מחליפה בדרייב את <code>_מידע.txt</code> בתיקייה הזו. האתר הוא מקור האמת — עריכה ידנית של הקובץ בדרייב תידרס.
          </p>
        </div>
      </div>
    </section>
  );
}
