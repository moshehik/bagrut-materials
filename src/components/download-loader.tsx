"use client";

import { useEffect, useRef, useState } from "react";

// כל קישורי ההורדה באתר (חומרים + מאגר שיחות)
const DOWNLOAD_LINK = /^\/api\/(sichot\/download|download|download-folder)\/\d+/;
const POLL_MS = 300;
// רשת ביטחון: המרת Word ל-PDF מוגבלת ל-60 שניות בשרת
const GIVE_UP_MS = 75_000;
// כמה זמן ההודעה "החומר שלך מחכה לך!" נשארת על המסך אחרי שהקובץ הגיע
const DONE_MS = 3200;

/**
 * התחלת הורדת קובץ מקוד (לא מלחיצה של המשתמשת על קישור): למשל אחרי שמירת טלפון/התחברות
 * שהגיעו עם next=/api/download/…. מדמה לחיצה על קישור הורדה, כך שהאגוז מופיע ונעלם כרגיל.
 * חשוב: לא להשתמש ב-redirect() של server action לנתיב קובץ – הראוטר מנווט "רך", מריץ את
 * נתיב ההורדה כמה פעמים, ומשאיר את הטופס במצב "טוען" לנצח (הדף לא נפרק אחרי הורדת attachment).
 */
export function startFileDownload(href: string) {
  const a = document.createElement("a");
  a.href = href;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** מפעיל startFileDownload פעם אחת כש-href מתקבל (למשל מתוצאת server action) */
export function useFileDownload(href: string | undefined) {
  // הגנה מהרצה כפולה של האפקט (StrictMode בפיתוח) – כל href מוריד פעם אחת בלבד
  const started = useRef<string | null>(null);
  useEffect(() => {
    if (!href || started.current === href) return;
    started.current = href;
    startFileDownload(href);
  }, [href]);
}

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
  // הקובץ הגיע: במקום האגוז המסתובב מופיעה הודעת "החומר שלך מחכה לך!" לכמה שניות
  const [done, setDone] = useState(false);

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
      setDone(false);
      setToken(t);
    }
    // חזרה לדף מה-bfcache (למשל אחרי הפניה להתחברות) – לא להשאיר אגוז תקוע
    function onPageShow() {
      setToken(null);
      setDone(false);
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
      const ready = readCookie(name);
      if (ready || Date.now() - started > GIVE_UP_MS) {
        clearCookie(name);
        window.clearInterval(id);
        if (ready) setDone(true);
        else setToken(null);
      }
    }, POLL_MS);
    return () => window.clearInterval(id);
  }, [token]);

  useEffect(() => {
    if (!done) return;
    const id = window.setTimeout(() => {
      setDone(false);
      setToken(null);
    }, DONE_MS);
    return () => window.clearTimeout(id);
  }, [done]);

  if (!token) return null;

  if (done) {
    return (
      <div className="download-loader download-loader-done" role="status" aria-live="polite">
        <div className="download-loader-card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/nut-loader.webp" alt="" width={40} height={40} className="download-loader-nut download-loader-nut-still" />
          <span className="download-loader-ready">החומר שלך מחכה לך!</span>
        </div>
      </div>
    );
  }

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
