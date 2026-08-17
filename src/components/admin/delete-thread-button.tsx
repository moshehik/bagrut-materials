"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteThread } from "@/lib/actions/admin";

export function DeleteThreadButton({ id, title }: { id: number; title: string }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className="btn text-xs py-1 px-2.5 text-red-700 border border-red-200 hover:bg-red-50"
        disabled={pending}
        onClick={() => {
          if (!confirm(`למחוק את הדיון "${title}" על כל תגובותיו?`)) return;
          start(async () => {
            const r = await deleteThread(id);
            if (r?.error) setErr(r.error);
          });
        }}
      >
        <Trash2 className="h-3.5 w-3.5" /> {pending ? "מוחקת…" : "מחיקה"}
      </button>
      {err && <span className="text-xs text-red-600">{err}</span>}
    </div>
  );
}
