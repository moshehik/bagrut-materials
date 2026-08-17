"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

/** רענון אוטומטי של עמוד שרת כל N שניות + ספירה לאחור */
export function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  const [left, setLeft] = useState(seconds);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => {
      setLeft((l) => {
        if (l <= 1) {
          router.refresh();
          return seconds;
        }
        return l - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [paused, router, seconds]);

  return (
    <div className="flex items-center gap-2 text-xs text-muted">
      <button
        type="button"
        onClick={() => {
          router.refresh();
          setLeft(seconds);
        }}
        className="btn btn-ghost !py-1 !px-2.5 text-xs"
        title="רענון עכשיו"
      >
        <RefreshCw className="h-3.5 w-3.5" aria-hidden />
        רענון
      </button>
      <label className="flex items-center gap-1 cursor-pointer">
        <input type="checkbox" checked={!paused} onChange={(e) => setPaused(!e.target.checked)} className="accent-oak" />
        אוטומטי
      </label>
      {!paused && <span className="tabular-nums">בעוד {left} שנ׳</span>}
    </div>
  );
}
