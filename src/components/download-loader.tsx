"use client";

import { useEffect, useState } from "react";

// כל קישורי ההורדה באתר (חומרים + מאגר שיחות)
const DOWNLOAD_LINK = /^\/api\/(sichot\/)?download\/\d+/;
const POLL_MS = 300;
// רשת ביטחון: המרת Word ל-PDF מוגבלת ל-60 שניות בשרת
const GIVE_UP_MS = 75_000;

function readCookie(name: string) {
  return document.cookie.split("; ").some((c) => c.startsWith(`${name}=`));
}

function clearCookie(name: string) {
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax`;
}

/**
 * אגוז מסתובב בזמן שהשרת מכין קובץ להורדה (הטבעת מספר אישי / המרה ל-PDF).
 * מאזין ללחיצות על כל קישור הורדה באתר, ונעלם ברגע שהשרת מחזיר את הקובץ
 * (ר' markDownloadReady ב-src/lib/download-ready.ts).
 */
export function DownloadLoader() {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement)) return;
      if (a.target && a.target !== "_self") return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || !DOWNLOAD_LINK.test(url.pathname)) return;

      const t = Math.random().toString(36).slice(2, 12).padEnd(8, "0");
      url.searchParams.set("dlt", t);
      // הניווט ברירת המחדל קורה אחרי המאזין, כך שהוא כבר ישתמש בכתובת המעודכנת
      a.href = url.pathname + url.search;
      setToken(t);
    }
    // חזרה לדף מה-bfcache (למשל אחרי הפניה להתחברות) – לא להשאיר אגוז תקוע
    function onPageShow() {
      setToken(null);
    }
    document.addEventListener("click", onClick, true);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    const name = `dl_${token}`;
    const started = Date.now();
    const id = window.setInterval(() => {
      if (readCookie(name) || Date.now() - started > GIVE_UP_MS) {
        clearCookie(name);
        setToken(null);
      }
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [token]);

  if (!token) return null;

  return (
    <div className="download-loader" role="status" aria-live="polite">
      <div className="download-loader-card">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/nut-loader.webp" alt="" width={40} height={40} className="download-loader-nut" />
        <span className="download-loader-text">מכינים את הקובץ להורדה…</span>
      </div>
    </div>
  );
}
