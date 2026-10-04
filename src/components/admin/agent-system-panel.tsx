"use client";

import { useEffect, useState, useTransition } from "react";
import { FlaskConical, Search, FolderOpen, MessageSquare } from "lucide-react";
import {
  getAgentSystemStatus,
  createTestReportAction,
  replyToReportAction,
  searchDriveFilesAction,
  type DriveSearchResult,
} from "@/lib/actions/agentSystem";

type Report = Awaited<ReturnType<typeof getAgentSystemStatus>>["reports"][number];

function fmtSize(n: number | null) {
  if (n === null) return "";
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}

export function AgentSystemPanel() {
  const [status, setStatus] = useState<{ loopEnabled: boolean; idle: number; reports: Report[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [testText, setTestText] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [driveQuery, setDriveQuery] = useState("");
  const [driveResults, setDriveResults] = useState<DriveSearchResult[] | null>(null);
  const [driveConfigured, setDriveConfigured] = useState(true);
  const [driveSearching, setDriveSearching] = useState(false);

  function refresh() {
    getAgentSystemStatus()
      .then((s) => {
        setStatus(s);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }

  useEffect(() => {
    refresh();
  }, []);

  if (error) {
    return <p className="text-sm text-red-600">שגיאה בטעינת סטטוס המערכת: {error}</p>;
  }
  if (!status) {
    return <p className="text-sm text-muted">טוען סטטוס…</p>;
  }

  async function closeReport(id: string) {
    await replyToReportAction(id, "נסגר ידנית מהלוח.", { archive: true });
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <FlaskConical className="h-4 w-4 text-pink" aria-hidden /> יצירת דיווח-בדיקה
        </h3>
        <p className="mt-1 text-xs text-muted">
          יוצר דיווח כאילו הגיע מהאתר, כדי לראות איך הסוכן מטפל בו בריצה הבאה. מיידי
          אם <code dir="ltr">GH_DISPATCH_TOKEN</code> מוגדר ב-Vercel, אחרת עד 5 דק׳
          (cron) — או הפעלה ידנית מ-GitHub Actions.
        </p>
        <div className="mt-2 flex gap-2">
          <input
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
            placeholder="לדוגמה: הדף של פרק ה יחזקאל לא נטען"
            className="flex-1 rounded-xl border px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={pending || !testText.trim()}
            onClick={() =>
              startTransition(async () => {
                await createTestReportAction(testText);
                setTestText("");
                refresh();
              })
            }
            className="rounded-xl bg-blue-deep px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            צור דיווח
          </button>
        </div>
      </div>

      <div>
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <FolderOpen className="h-4 w-4 text-gold" aria-hidden /> חיפוש קובץ בארכיון הדרייב
        </h3>
        <p className="mt-1 text-xs text-muted">
          מזהה קבצים לפי דמיון-שם בלבד (לא תוכן). לעולם לא מציג/מוריד תוכן דרך הדף הזה — רק קישור לפתיחה בדרייב עצמו.
        </p>
        <div className="mt-2 flex gap-2">
          <input
            value={driveQuery}
            onChange={(e) => setDriveQuery(e.target.value)}
            placeholder="לדוגמה: יחזקאל פרק ה שכפול"
            className="flex-1 rounded-xl border px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={driveSearching}
            onClick={() => {
              setDriveSearching(true);
              searchDriveFilesAction(driveQuery)
                .then((r) => {
                  setDriveConfigured(r.configured);
                  setDriveResults(r.results);
                })
                .finally(() => setDriveSearching(false));
            }}
            className="flex items-center gap-1 rounded-xl bg-gold px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            <Search className="h-4 w-4" aria-hidden /> חפש
          </button>
        </div>
        {!driveConfigured && (
          <p className="mt-2 text-xs text-red-600">גשר הדרייב לא מוגדר (DRIVE_BRIDGE_URL / DRIVE_BRIDGE_SECRET).</p>
        )}
        {driveResults && (
          <ul className="mt-3 space-y-1">
            {driveResults.length === 0 && <li className="text-xs text-muted">אין תוצאות.</li>}
            {driveResults.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2 rounded-xl bg-black/5 px-3 py-2 text-xs">
                <span className="truncate" title={f.name}>
                  {f.name} <span className="text-muted">({fmtSize(f.size)})</span>
                </span>
                {f.webViewLink && (
                  <a href={f.webViewLink} target="_blank" rel="noreferrer" className="shrink-0 text-blue-deep underline">
                    פתח בדרייב
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <MessageSquare className="h-4 w-4 text-blue" aria-hidden /> דיווחים ({status.reports.length})
        </h3>
        <ul className="mt-2 space-y-3">
          {status.reports.map((r) => (
            <li key={r.id} className="card p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-sm">
                  {r.title || "(ללא כותרת)"} {r.kind === "agentLog" && <span className="chip bg-blue-soft text-blue-deep">יומן הסוכן</span>}
                </span>
                <span className={`chip ${r.status === "OPEN" ? "bg-gold/20 text-gold" : "bg-black/5 text-muted"}`}>
                  {r.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted">{r.userText}</p>
              {r.notes.length > 0 && (
                <ul className="mt-2 space-y-1 border-t pt-2">
                  {r.notes.map((n) => (
                    <li key={n.id} className="text-xs">
                      <span className="font-bold">
                        {n.role === "reporter" ? "מדווח/ת" : "תמיכה"}
                        {n.role === "support" && n.authorKind === "admin" && (
                          <span className="text-muted font-normal"> (ידני)</span>
                        )}
                        :
                      </span>{" "}
                      {n.text}
                      {n.isQuestion && <span className="ms-1 chip bg-gold/20 text-gold">ממתין לתשובה</span>}
                      {n.previewUrl && (
                        <a href={n.previewUrl} target="_blank" rel="noreferrer" className="ms-1 text-blue-deep underline">
                          preview
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-2 flex gap-2">
                <input
                  value={replyDrafts[r.id] ?? ""}
                  onChange={(e) => setReplyDrafts((d) => ({ ...d, [r.id]: e.target.value }))}
                  placeholder="תגובה ידנית…"
                  className="flex-1 rounded-lg border px-2 py-1 text-xs"
                />
                <button
                  type="button"
                  disabled={pending || !replyDrafts[r.id]?.trim()}
                  onClick={() =>
                    startTransition(async () => {
                      await replyToReportAction(r.id, replyDrafts[r.id]);
                      setReplyDrafts((d) => ({ ...d, [r.id]: "" }));
                      refresh();
                    })
                  }
                  className="rounded-lg bg-black/10 px-3 py-1 text-xs font-bold"
                >
                  שלח
                </button>
                {r.status === "OPEN" && r.kind !== "agentLog" && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        await closeReport(r.id);
                        refresh();
                      })
                    }
                    className="rounded-lg bg-black/10 px-3 py-1 text-xs font-bold"
                  >
                    סגור
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
