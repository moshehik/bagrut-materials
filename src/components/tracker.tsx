"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const HEARTBEAT_MS = 60_000;

/** רישום צפיות בדפים + נוכחות. שקט לחלוטין – לא זורק ולא מציג דבר. */
export function Tracker() {
  const pathname = usePathname();
  const search = useSearchParams();
  const viewIdRef = useRef<number | null>(null);
  const startRef = useRef<number>(0);
  const pathRef = useRef<string>("");

  useEffect(() => {
    const path = pathname + (search?.toString() ? `?${search.toString()}` : "");
    pathRef.current = path;

    // סיום הצפייה הקודמת (משך שהייה)
    const prevId = viewIdRef.current;
    if (prevId) {
      sendBeacon("/api/track", { viewId: prevId, duration: elapsed(startRef.current) });
    }
    viewIdRef.current = null;
    startRef.current = Date.now();

    let cancelled = false;
    fetch("/api/track", {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, referer: document.referrer || null }),
    })
      .then((r) => (r.ok && r.status !== 204 ? r.json() : null))
      .then((d: { viewId?: number | null } | null) => {
        if (!cancelled && d && typeof d.viewId === "number") viewIdRef.current = d.viewId;
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [pathname, search]);

  useEffect(() => {
    const beat = () => {
      if (document.visibilityState === "hidden") return;
      const payload: Record<string, unknown> = { lastPath: pathRef.current };
      if (viewIdRef.current) {
        payload.viewId = viewIdRef.current;
        payload.duration = elapsed(startRef.current);
      }
      fetch("/api/presence", {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {});
    };
    const timer = setInterval(beat, HEARTBEAT_MS);

    const onHide = () => {
      if (document.visibilityState !== "hidden") return;
      if (viewIdRef.current) {
        sendBeacon("/api/track", { viewId: viewIdRef.current, duration: elapsed(startRef.current) });
      }
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  return null;
}

function elapsed(start: number) {
  return Math.max(0, Math.round((Date.now() - start) / 1000));
}

function sendBeacon(url: string, data: unknown) {
  try {
    const body = JSON.stringify(data);
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(url, blob)) return;
    }
    fetch(url, { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body }).catch(
      () => {},
    );
  } catch {
    /* ignore */
  }
}
