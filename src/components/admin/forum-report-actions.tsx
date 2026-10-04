"use client";

import { useState, useTransition } from "react";
import { Check, Trash2 } from "lucide-react";
import { closeForumReport, deleteForumPost, deleteThread } from "@/lib/actions/admin";

/** פעולות על דיווח בפורום: מחיקת התוכן המדווח, או סגירת הדיווח כשהתוכן תקין */
export function ForumReportActions({
  reportId,
  threadId,
  postId,
}: {
  reportId: number;
  threadId: number | null;
  postId: number | null;
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const run = (fn: () => Promise<{ error?: string } | undefined>) =>
    start(async () => {
      const r = await fn();
      if (r?.error) setErr(r.error);
    });

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {(threadId || postId) && (
          <button
            type="button"
            className="btn text-xs py-1 px-2.5 text-red-700 border border-red-200 hover:bg-red-50"
            disabled={pending}
            onClick={() => {
              if (!confirm(threadId ? "למחוק את ההודעה (וכל התשובות עליה)?" : "למחוק את התשובה?")) return;
              run(() => (threadId ? deleteThread(threadId) : deleteForumPost(postId!)));
            }}
          >
            <Trash2 className="h-3.5 w-3.5" /> מחיקת התוכן
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost text-xs py-1 px-2.5"
          disabled={pending}
          onClick={() => run(() => closeForumReport(reportId))}
        >
          <Check className="h-3.5 w-3.5" /> {threadId || postId ? "התוכן תקין – סגירה" : "סגירה"}
        </button>
      </div>
      {err && <span className="text-xs text-red-600">{err}</span>}
    </div>
  );
}
