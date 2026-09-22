"use client";

import { useState, useTransition } from "react";
import { PauseCircle, PlayCircle, Trash2 } from "lucide-react";
import type { Status } from "@/db/schema";
import { setSichaStatus, deleteSicha } from "@/lib/actions/admin-sichot";

export function SichaModerationButtons({ id, title, status }: { id: number; title: string; status: Status }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      <div className="flex gap-1.5">
        <button
          type="button"
          className="btn text-xs py-1 px-2.5 border border-oak/30"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await setSichaStatus(id, status === "active" ? "suspended" : "active");
              if (r?.error) setErr(r.error);
            })
          }
        >
          {status === "active" ? (
            <>
              <PauseCircle className="h-3.5 w-3.5" /> השעיה
            </>
          ) : (
            <>
              <PlayCircle className="h-3.5 w-3.5" /> הפעלה
            </>
          )}
        </button>
        <button
          type="button"
          className="btn text-xs py-1 px-2.5 text-red-700 border border-red-200 hover:bg-red-50"
          disabled={pending}
          onClick={() => {
            if (!confirm(`למחוק לצמיתות את השיחה "${title}"?`)) return;
            start(async () => {
              const r = await deleteSicha(id);
              if (r?.error) setErr(r.error);
            });
          }}
        >
          <Trash2 className="h-3.5 w-3.5" /> {pending ? "מוחקת…" : "מחיקה"}
        </button>
      </div>
      {err && <span className="text-xs text-red-600">{err}</span>}
    </div>
  );
}
