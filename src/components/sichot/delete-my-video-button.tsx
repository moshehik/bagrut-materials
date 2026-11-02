"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteSichaVideo } from "@/lib/actions/sichot-videos";

export function DeleteMyVideoButton({ id, path }: { id: number; path: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className="sicha-tag"
        onClick={() => {
          if (!confirm("למחוק את הסרטון מהמאגר? (הקובץ המקורי בדרייב של המורה לא יימחק)")) return;
          start(async () => {
            const r = await deleteSichaVideo(id, path);
            if ("error" in r) setErr(r.error);
            else router.refresh();
          });
        }}
      >
        <Trash2 className="h-4 w-4" aria-hidden /> {pending ? "מוחקת…" : "מחיקה"}
      </button>
      {err && <span className="text-sm text-red-700">{err}</span>}
    </span>
  );
}
