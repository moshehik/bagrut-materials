"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Highlighter, Minus, Plus, X } from "lucide-react";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * צופה PDF משלנו (במקום הצופה המובנה של הדפדפן): העמודים מצוירים על קנבס, בלי סרגל כלים,
 * כך שאין כפתורי הורדה / הדפסה / שמירה – ההורדה רק דרך כפתורי ההורדה של האתר (עם סימן המים האישי).
 * ספריית pdf.js מוגשת מהדומיין שלנו (public/pdfjs) – בגלל נטפרי, שחוסם דומיינים חיצוניים.
 *
 * במצב selectable (חלון "לעריכת שינויים") אפשר לסמן טקסט בקובץ ולהוסיף אותו כ"מה שצריך תיקון":
 * שכבת טקסט שקופה מעל הקנבס, וסימון ורוד שנשאר על הטקסט שנבחר.
 */

const PDFJS_URL = "/pdfjs/pdf.min.mjs";
const WORKER_URL = "/pdfjs/pdf.worker.min.mjs";

let pdfjsPromise: Promise<any> | null = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    const url = PDFJS_URL; // משתנה (ולא מחרוזת) כדי שה-bundler לא ינסה לארוז את הספרייה
    pdfjsPromise = import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url).then((mod: any) => {
      mod.GlobalWorkerOptions.workerSrc = WORKER_URL;
      return mod;
    });
  }
  return pdfjsPromise;
}

const ZOOM_STEP = 0.25;
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 3;

/** מלבן בשברי העמוד (0-1), כך שהסימון נשאר במקומו בכל זום */
export type MarkRect = { x: number; y: number; w: number; h: number };
export type PdfMark = { id: number; page: number; rects: MarkRect[]; text: string };

type PendingSelection = { text: string; page: number; rects: MarkRect[]; left: number; top: number };

export function PdfViewer({
  src,
  className = "",
  selectable = false,
  marks = [],
  onMark,
}: {
  src: string;
  className?: string;
  /** מאפשר לסמן טקסט בקובץ (שכבת טקסט + כפתור "סימון לתיקון") */
  selectable?: boolean;
  /** סימונים להצגה על העמודים */
  marks?: PdfMark[];
  /** נקרא כשהמורה לוחצת "סימון לתיקון" על טקסט שבחרה */
  onMark?: (mark: PdfMark) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<HTMLDivElement>(null);
  const wrapsRef = useRef<HTMLDivElement[]>([]);
  const docRef = useRef<any>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const [renderVersion, setRenderVersion] = useState(0);
  const [pending, setPending] = useState<PendingSelection | null>(null);
  const renderToken = useRef(0);

  // טעינת המסמך
  useEffect(() => {
    let cancelled = false;
    docRef.current = null;
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const task = pdfjs.getDocument({ url: src, withCredentials: true });
        const doc = await task.promise;
        if (cancelled) {
          void doc.destroy();
          return;
        }
        docRef.current = doc;
        setStatus("ready");
      } catch (e) {
        console.error("pdf viewer load failed", e);
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
      void docRef.current?.destroy?.();
      docRef.current = null;
    };
  }, [src]);

  // רוחב המיכל (להתאמת העמוד לרוחב)
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let t: ReturnType<typeof setTimeout>;
    const measure = () => setWidth(host.clientWidth);
    measure();
    const ro = new ResizeObserver(() => {
      clearTimeout(t);
      t = setTimeout(measure, 150);
    });
    ro.observe(host);
    return () => {
      clearTimeout(t);
      ro.disconnect();
    };
  }, []);

  // ציור העמודים (מחדש בשינוי זום / רוחב)
  const renderAll = useCallback(async () => {
    const doc = docRef.current;
    const holder = pagesRef.current;
    if (!doc || !holder || width <= 0) return;
    const pdfjs = await loadPdfjs();
    const token = ++renderToken.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const target = Math.max(240, width - 24) * zoom;
    const fragment = document.createDocumentFragment();
    const wraps: HTMLDivElement[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      if (token !== renderToken.current) return;
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const cssScale = target / base.width;
      const cssViewport = page.getViewport({ scale: cssScale });
      const viewport = page.getViewport({ scale: cssScale * dpr });

      const wrap = document.createElement("div");
      wrap.className = "pdfv-pagewrap";
      wrap.dataset.page = String(n);
      wrap.style.width = `${Math.floor(cssViewport.width)}px`;
      wrap.style.height = `${Math.floor(cssViewport.height)}px`;

      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.className = "pdfv-page";
      canvas.oncontextmenu = (e) => e.preventDefault();
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      wrap.appendChild(canvas);

      const markLayer = document.createElement("div");
      markLayer.className = "pdfv-marks";
      wrap.appendChild(markLayer);

      await page.render({ canvasContext: ctx, viewport }).promise;

      if (selectable) {
        const textDiv = document.createElement("div");
        textDiv.className = "textLayer";
        textDiv.style.setProperty("--scale-factor", String(cssScale));
        wrap.appendChild(textDiv);
        try {
          const layer = new pdfjs.TextLayer({
            textContentSource: page.streamTextContent(),
            container: textDiv,
            viewport: cssViewport,
          });
          await layer.render();
        } catch (e) {
          console.error("pdf text layer failed", e);
        }
      }
      fragment.appendChild(wrap);
      wraps.push(wrap);
    }
    if (token !== renderToken.current) return;
    holder.replaceChildren(fragment);
    wrapsRef.current = wraps;
    setRenderVersion((v) => v + 1);
  }, [width, zoom, selectable]);

  useEffect(() => {
    if (status === "ready") void renderAll();
  }, [status, renderAll]);

  // ציור הסימונים הוורודים על העמודים
  useEffect(() => {
    for (const wrap of wrapsRef.current) {
      const layer = wrap.querySelector(".pdfv-marks");
      if (!layer) continue;
      layer.replaceChildren();
      for (const m of marks) {
        if (m.page !== Number(wrap.dataset.page)) continue;
        for (const r of m.rects) {
          const d = document.createElement("div");
          d.className = "pdfv-mark";
          d.style.left = `${r.x * 100}%`;
          d.style.top = `${r.y * 100}%`;
          d.style.width = `${r.w * 100}%`;
          d.style.height = `${r.h * 100}%`;
          layer.appendChild(d);
        }
      }
    }
  }, [marks, renderVersion]);

  // לכידת בחירת טקסט (מצב סימון)
  const captureSelection = useCallback(() => {
    if (!selectable) return;
    const sel = window.getSelection();
    const holder = pagesRef.current;
    const root = rootRef.current;
    if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !holder || !root) {
      setPending(null);
      return;
    }
    const range = sel.getRangeAt(0);
    if (!holder.contains(range.commonAncestorContainer)) {
      setPending(null);
      return;
    }
    const text = sel.toString().replace(/\s+/g, " ").trim();
    if (text.length < 2) {
      setPending(null);
      return;
    }
    const startEl =
      range.startContainer.nodeType === 1 ? (range.startContainer as Element) : range.startContainer.parentElement;
    const wrap = startEl?.closest(".pdfv-pagewrap") as HTMLElement | null;
    if (!wrap) {
      setPending(null);
      return;
    }
    const wr = wrap.getBoundingClientRect();
    const rects: MarkRect[] = [];
    for (const r of Array.from(range.getClientRects())) {
      if (r.width < 2 || r.height < 2) continue;
      if (r.height > wr.height * 0.2) continue; // מסננים מלבני מיכל גדולים
      if (r.top < wr.top - 2 || r.bottom > wr.bottom + 2) continue; // רק העמוד הראשון שנבחר
      const rect = { x: (r.left - wr.left) / wr.width, y: (r.top - wr.top) / wr.height, w: r.width / wr.width, h: r.height / wr.height };
      const covered = rects.some(
        (o) => rect.x >= o.x - 0.002 && rect.y >= o.y - 0.002 && rect.x + rect.w <= o.x + o.w + 0.002 && rect.y + rect.h <= o.y + o.h + 0.002,
      );
      if (!covered) rects.push(rect);
    }
    const bb = range.getBoundingClientRect();
    const rr = root.getBoundingClientRect();
    setPending({
      text,
      page: Number(wrap.dataset.page),
      rects,
      left: Math.min(Math.max(bb.left - rr.left, 8), Math.max(rr.width - 170, 8)),
      top: bb.bottom - rr.top + 8,
    });
  }, [selectable]);

  useEffect(() => {
    if (!selectable) return;
    const onSelChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) setPending(null);
    };
    document.addEventListener("selectionchange", onSelChange);
    return () => document.removeEventListener("selectionchange", onSelChange);
  }, [selectable]);

  const confirmMark = () => {
    if (!pending || !onMark) return;
    onMark({ id: Date.now(), page: pending.page, rects: pending.rects, text: pending.text });
    window.getSelection()?.removeAllRanges();
    setPending(null);
  };

  return (
    <div ref={rootRef} className={`pdfv ${selectable ? "pdfv-selectable" : ""} ${className}`}>
      <div className="pdfv-bar">
        <button type="button" aria-label="הקטנה" onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP))}>
          <Minus className="h-4 w-4" aria-hidden />
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" aria-label="הגדלה" onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP))}>
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div
        ref={hostRef}
        className="pdfv-scroll"
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
        onMouseUp={() => window.setTimeout(captureSelection, 0)}
        onTouchEnd={() => window.setTimeout(captureSelection, 350)}
      >
        {status === "loading" && (
          <div className="pdfv-msg" role="status">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/nut-loader.webp" alt="" width={36} height={36} className="download-loader-nut" />
            <span>טוענת את הקובץ…</span>
          </div>
        )}
        {status === "error" && <div className="pdfv-msg">לא ניתן להציג את הקובץ כרגע, נסי שוב מאוחר יותר.</div>}
        <div ref={pagesRef} className="pdfv-pages" />
      </div>
      {selectable && pending && (
        <button
          type="button"
          className="pdfv-markbtn"
          style={{ left: pending.left, top: pending.top }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={confirmMark}
        >
          <Highlighter className="h-4 w-4" strokeWidth={1.75} aria-hidden />
          סימון לתיקון
        </button>
      )}
    </div>
  );
}

/**
 * כפתור שפותח את הקובץ בצופה שלנו בתוך חלון באתר (במקום לשונית עם הצופה של הדפדפן).
 * מקבל את העיצוב של הכפתור/הקישור שהוא מחליף דרך className.
 */
export function FileViewerButton({
  src,
  title,
  className,
  children,
  tip,
  label,
}: {
  src: string;
  title: string;
  className?: string;
  children: React.ReactNode;
  tip?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onClose = () => setOpen(false);
    d.addEventListener("close", onClose);
    return () => d.removeEventListener("close", onClose);
  }, []);

  return (
    <>
      <button type="button" className={className} data-tip={tip} aria-label={label} onClick={() => setOpen(true)}>
        {children}
      </button>
      <dialog ref={ref} className="view-dialog">
        <div className="view-dialog-head">
          <h3>{title}</h3>
          <button type="button" className="fix-close" aria-label="סגירה" onClick={() => setOpen(false)}>
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        {open && <PdfViewer src={src} className="view-dialog-viewer" />}
      </dialog>
    </>
  );
}
