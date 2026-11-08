"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Highlighter, Maximize, Minimize, Minus, Plus, Presentation, X } from "lucide-react";

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

/**
 * האם פריט טקסט הוא חלק מסימן המים של האתר (ר' stampPdf ב-src/lib/watermark.ts):
 * שורות אלכסוניות (32°), הודעת ה-AI בגופן 5.5, שורות הכותרת התחתונה (גופן 8, צמוד לתחתית העמוד)
 * והמספר האישי הקטן בראש העמוד (#קוד, גופן 7).
 */
function isWatermarkItem(it: any, pageBottom: number, pageTop: number): boolean {
  if (typeof it.str !== "string" || !Array.isArray(it.transform)) return false;
  const [a, b, , , , f] = it.transform as number[];
  const size = Math.hypot(a, b);
  if (Math.abs(b) > 0.05 * size) return true; // אלכסוני
  if (Math.abs(size - 5.5) < 0.2) return true; // הודעת זכויות יוצרים ל-AI
  if (Math.abs(size - 8) < 0.2 && f - pageBottom < 36) return true; // שורות תחתונות
  if (Math.abs(size - 7) < 0.2 && it.str.startsWith("#") && pageTop - f < 22) return true; // מספר אישי עליון
  return false;
}

/** מלבן בשברי העמוד (0-1), כך שהסימון נשאר במקומו בכל זום */
export type MarkRect = { x: number; y: number; w: number; h: number };
export type PdfMark = {
  id: number;
  page: number;
  rects: MarkRect[];
  text: string;
  /** כמה מופעים של אותו טקסט (בלי רווחים וניקוד) קדמו לסימון בכל המסמך, מאפס – לבחירת המופע הנכון בקובץ ה-Word */
  occurrence: number;
};

const COMPACT_IGNORED = /[\s֑-ׇ‎‏‪-‮]/g;
/** אותו נרמול כמו docx-fixes.ts (compactText): גרשיים/מקפים אחידים, בלי רווחים וניקוד */
const compact = (s: string) =>
  s
    .replace(/[“”״„]/g, '"')
    .replace(/[‘’׳]/g, "'")
    .replace(/[–—־]/g, "-")
    .replace(COMPACT_IGNORED, "");

/**
 * כמה מופעים של הטקסט שנבחר מופיעים בשכבת הטקסט לפני נקודת ההתחלה של הבחירה (בסדר המסמך). כשהטקסט חוזר
 * כמה פעמים בקובץ, זה מאפשר להחיל את התיקון על המופע שהמורה סימנה ולא על הראשון. כשל – 0 (הראשון).
 */
function selectionOccurrence(holder: HTMLElement, range: Range, selectedText: string): number {
  try {
    const needle = compact(selectedText);
    if (needle.length < 2) return 0;
    const leaves = Array.from(holder.querySelectorAll(".textLayer span")).filter((s) => s.children.length === 0);
    let full = "";
    let selStart = -1;
    for (const s of leaves) {
      const t = s.textContent ?? "";
      if (selStart < 0 && range.intersectsNode(s)) {
        let from = 0;
        const tn = s.firstChild;
        if (tn && tn.nodeType === 3 && range.startContainer === tn) from = range.startOffset;
        selStart = full.length + compact(t.slice(0, from)).length;
      }
      full += compact(t);
    }
    if (selStart < 0) return 0;
    let count = 0;
    for (let i = full.indexOf(needle); i >= 0 && i < selStart; i = full.indexOf(needle, i + needle.length)) count++;
    return count;
  } catch {
    return 0;
  }
}

/**
 * הטקסט שנבחר משכבת הטקסט של ה-PDF. לכל מילה/קטע יש שם `<span>` נפרד בלי תו רווח ביניהם, ולכן
 * `selection.toString()` מדביק מילים ("כוונהלמשפחת"). כאן עוברים על ה-spans שבתוך הבחירה (בסדר המסמך) ומחברים
 * ברווח; בתוך span חלקי (תחילת/סוף הבחירה) חותכים לפי נקודות הבחירה. אם משהו נכשל – נופלים לטקסט הרגיל.
 */
function selectedTextWithSpaces(range: Range, fallback: string): string {
  const plain = fallback.replace(/\s+/g, " ").trim();
  try {
    const root = range.commonAncestorContainer;
    const scope = root.nodeType === 1 ? (root as Element) : root.parentElement;
    if (!scope) return plain;
    const spans = Array.from(scope.querySelectorAll(".textLayer span")).filter(
      (s) => s.childNodes.length > 0 && range.intersectsNode(s),
    );
    if (spans.length === 0) return plain;
    const parts: string[] = [];
    for (const s of spans) {
      const text = s.textContent ?? "";
      if (!text) continue;
      const r = document.createRange();
      r.selectNodeContents(s);
      let from = 0;
      let to = text.length;
      const textNode = s.firstChild;
      if (textNode && textNode.nodeType === 3) {
        if (range.compareBoundaryPoints(Range.START_TO_START, r) > 0 && range.startContainer === textNode) from = range.startOffset;
        if (range.compareBoundaryPoints(Range.END_TO_END, r) < 0 && range.endContainer === textNode) to = range.endOffset;
      }
      const piece = text.slice(from, to);
      if (piece.trim()) parts.push(piece.trim());
    }
    const joined = parts.join(" ").replace(/\s+/g, " ").trim();
    // אם החיבור יצא קצר בהרבה/ריק – משאירים את הטקסט הרגיל
    return joined.length >= plain.length * 0.8 ? joined : plain;
  } catch {
    return plain;
  }
}

type PendingSelection = { text: string; page: number; rects: MarkRect[]; left: number; top: number; occurrence: number };

export function PdfViewer({
  src,
  className = "",
  selectable = false,
  marks = [],
  onMark,
  presentation = false,
}: {
  src: string;
  className?: string;
  /** מצגת: מוסיף לסרגל כפתור "צפייה כמצגת" (שקופית אחת במסך מלא, מעבר עם חיצים) */
  presentation?: boolean;
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
  /** עולה בכל מסמך שנטען (גם כש-src מתחלף והמצב נשאר "ready") – כדי שהעמודים יצוירו מחדש */
  const [docVersion, setDocVersion] = useState(0);
  const [pending, setPending] = useState<PendingSelection | null>(null);
  const renderToken = useRef(0);
  // מסך מלא / צפייה כמצגת. האינדקס נשמר ב-state וב-ref (לא ב-DOM) כדי לשרוד ציור-מחדש בכניסה למסך מלא
  const [fsSupported, setFsSupported] = useState(false);
  const [isFs, setIsFs] = useState(false);
  const [numPages, setNumPages] = useState(0);
  const [slideshow, setSlideshow] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  const slideRef = useRef(0);
  const [ctrlShown, setCtrlShown] = useState(true);
  const ctrlTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const showSlides = slideshow && !selectable;

  // מצגת במחשב מאחורי נטפרי: הצפייה נטענת קלה (512), ואפשר לבקש "חדות מלאה" (1024) ואז "חדות מלאה ממש" (רזולוציית המקור).
  // נטפרי חוסם קבצים גדולים מאוד – אם הטעינה בחדות הגבוהה נכשלת חוזרים לרמה הקודמת ומציגים הודעה.
  const [sharp, setSharp] = useState(0);
  const [sharpNote, setSharpNote] = useState("");
  const [isNf, setIsNf] = useState(false);
  useEffect(() => {
    if (!presentation) return;
    const read = () => /(?:^|;\s*)nf=1(?:;|$)/.test(document.cookie);
    setIsNf(read());
    const h = (e: Event) => setIsNf(Boolean((e as CustomEvent).detail));
    window.addEventListener("nf-detected", h);
    return () => window.removeEventListener("nf-detected", h);
  }, [presentation]);
  const effSrc = sharp ? `${src}${src.includes("?") ? "&" : "?"}sharp=${sharp}` : src;

  // טעינת המסמך
  useEffect(() => {
    let cancelled = false;
    docRef.current = null;
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const task = pdfjs.getDocument({ url: effSrc, withCredentials: true });
        const doc = await task.promise;
        if (cancelled) {
          void doc.destroy();
          return;
        }
        docRef.current = doc;
        setNumPages(doc.numPages);
        slideRef.current = 0;
        setSlideIndex(0);
        setStatus("ready");
        setDocVersion((v) => v + 1);
      } catch (e) {
        console.error("pdf viewer load failed", e);
        if (!cancelled) {
          if (sharp > 0) {
            // הטעינה בחדות הגבוהה נכשלה (בנטפרי קובץ גדול נחסם): חוזרים לרמה הקודמת
            setSharpNote("הטעינה בחדות הגבוהה נכשלה (נטפרי חוסם קבצים גדולים)");
            setSharp(sharp - 1);
          } else setStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
      void docRef.current?.destroy?.();
      docRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effSrc]);

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
    // במצגת: בגודל כל הרוחב (ה-CSS מכווץ לפי הגובה); בגלילה רגילה: רוחב פחות שוליים כפול הזום
    const target = showSlides ? Math.max(240, width) : Math.max(240, width - 24) * zoom;
    const curSlide = Math.min(slideRef.current, Math.max(0, doc.numPages - 1));
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
      wrap.style.setProperty("--r", String(base.width / base.height));
      if (n - 1 === curSlide) wrap.classList.add("is-current");
      wrap.style.width = `${Math.floor(cssViewport.width)}px`;
      wrap.style.height = `${Math.floor(cssViewport.height)}px`;

      const canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      canvas.className = "pdfv-page";
      // גודל התצוגה ב-CSS = גודל העטיפה. בלי זה הקנבס מוצג ברוחב הפיקסלים שלו (css × devicePixelRatio) –
      // במסכים עם סקלה (125%/150%) העמוד גדול מהחלון, נחתך בצד, והסימונים/שכבת הטקסט לא מתיישרים איתו
      canvas.style.width = "100%";
      canvas.style.height = "100%";
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
          // סימן המים (שקוף) הוא טקסט אמיתי בקובץ – בלי סינון הוא נבחר יחד עם הטקסט הרגיל בסימון
          const textContent = await page.getTextContent();
          const [, vy0, , vy1] = page.view as number[];
          textContent.items = textContent.items.filter((it: any) => !isWatermarkItem(it, vy0, vy1));
          const layer = new pdfjs.TextLayer({
            textContentSource: textContent,
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
  }, [width, zoom, selectable, showSlides]);

  useEffect(() => {
    if (status === "ready") void renderAll();
  }, [status, renderAll, docVersion]);

  // סימון השקופית הנוכחית (CSS מציג רק אותה במצב מצגת)
  useEffect(() => {
    wrapsRef.current.forEach((w, i) => w.classList.toggle("is-current", i === slideIndex));
  }, [slideIndex, renderVersion, showSlides]);

  // כניסה למצגת: מתחילים מראש הרשימה; יציאה: חוזרים לגלילה אל השקופית שנראתה
  const prevShow = useRef(false);
  useEffect(() => {
    const host = hostRef.current;
    if (showSlides && !prevShow.current && host) {
      host.scrollTop = 0;
      host.scrollLeft = 0;
    }
    if (!showSlides && prevShow.current) wrapsRef.current[slideRef.current]?.scrollIntoView({ block: "start" });
    prevShow.current = showSlides;
  }, [showSlides]);

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
    const text = selectedTextWithSpaces(range, sel.toString());
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
      occurrence: selectionOccurrence(holder, range, text),
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
    onMark({ id: Date.now(), page: pending.page, rects: pending.rects, text: pending.text, occurrence: pending.occurrence });
    window.getSelection()?.removeAllRanges();
    setPending(null);
  };

  const goTo = useCallback((i: number) => {
    const n = docRef.current?.numPages ?? 1;
    const c = Math.max(0, Math.min(n - 1, i));
    slideRef.current = c;
    setSlideIndex(c);
  }, []);

  const showControls = useCallback(() => {
    setCtrlShown(true);
    clearTimeout(ctrlTimer.current);
    ctrlTimer.current = setTimeout(() => setCtrlShown(false), 2500);
  }, []);

  useEffect(() => {
    setFsSupported(typeof document !== "undefined" && !!document.fullscreenEnabled);
  }, []);

  // מעקב אחרי מצב מסך מלא (גם יציאה ב-Esc): יציאה ממסך מלא מסיימת גם את המצגת
  useEffect(() => {
    const el = rootRef.current;
    const onFs = () => {
      setIsFs(document.fullscreenElement === rootRef.current);
      if (!document.fullscreenElement) setSlideshow(false);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      if (el && document.fullscreenElement === el) void document.exitFullscreen().catch(() => {});
    };
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void rootRef.current?.requestFullscreen?.().catch(() => {});
  };

  const startSlideshow = () => {
    goTo(0);
    setSlideshow(true);
    showControls();
    if (!document.fullscreenElement) void rootRef.current?.requestFullscreen?.().catch(() => {});
  };

  const exitSlideshow = () => {
    setSlideshow(false);
    clearTimeout(ctrlTimer.current);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  };

  // מקשי מצגת (אתר ב-RTL: חץ שמאלה = הבאה, חץ ימינה = הקודמת). מחובר רק בזמן מצגת
  useEffect(() => {
    if (!showSlides) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      let next: number;
      switch (e.key) {
        case "ArrowLeft":
        case "ArrowDown":
        case "PageDown":
        case " ":
          next = slideRef.current + 1;
          break;
        case "ArrowRight":
        case "ArrowUp":
        case "PageUp":
          next = slideRef.current - 1;
          break;
        case "Home":
          next = 0;
          break;
        case "End":
          next = (docRef.current?.numPages ?? 1) - 1;
          break;
        default:
          return;
      }
      e.preventDefault();
      e.stopPropagation();
      goTo(next);
      showControls();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [showSlides, goTo, showControls]);

  useEffect(() => () => clearTimeout(ctrlTimer.current), []);

  const onSlideClick = (e: React.MouseEvent) => {
    if (!showSlides) return;
    const r = e.currentTarget.getBoundingClientRect();
    // חצי שמאלי = הבאה, חצי ימני = הקודמת
    goTo(slideRef.current + (e.clientX < r.left + r.width / 2 ? 1 : -1));
    showControls();
  };

  return (
    <div
      ref={rootRef}
      className={`pdfv ${selectable ? "pdfv-selectable" : ""} ${showSlides ? "pdfv-slides" : ""} ${showSlides && !ctrlShown ? "pdfv-slides-idle" : ""} ${className}`}
      onMouseMove={showSlides ? showControls : undefined}
      onTouchStart={showSlides ? showControls : undefined}
    >
      <div className="pdfv-bar">
        <button type="button" aria-label="הקטנה" onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP))}>
          <Minus className="h-4 w-4" aria-hidden />
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button type="button" aria-label="הגדלה" onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP))}>
          <Plus className="h-4 w-4" aria-hidden />
        </button>
        {!selectable && fsSupported && (
          <button
            type="button"
            className="pdfv-fs-btn"
            aria-label={isFs ? "יציאה ממסך מלא" : "מסך מלא"}
            data-tip={isFs ? "יציאה ממסך מלא" : "מסך מלא"}
            onClick={toggleFullscreen}
          >
            {isFs ? <Minimize className="h-4 w-4" aria-hidden /> : <Maximize className="h-4 w-4" aria-hidden />}
          </button>
        )}
        {!selectable && presentation && isNf && sharp < 2 && (
          <button
            type="button"
            className="pdfv-sharp-btn"
            data-tip={sharp === 0 ? "טעינה בחדות גבוהה יותר (קובץ כבד יותר)" : "טעינה ברזולוציית המקור (קובץ כבד מאוד, ייתכן שנטפרי יחסום)"}
            disabled={status === "loading"}
            onClick={() => {
              setSharpNote("");
              setStatus("loading");
              setSharp(sharp + 1);
            }}
          >
            {sharp === 0 ? "טען בחדות מלאה" : "טען בחדות מלאה ממש"}
          </button>
        )}
        {sharpNote && <span className="pdfv-sharp-note">{sharpNote}</span>}
        {!selectable && presentation && status === "ready" && numPages > 0 && (
          <button type="button" className="pdfv-fs-btn" aria-label="צפייה כמצגת" data-tip="צפייה כמצגת" onClick={startSlideshow}>
            <Presentation className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
      {showSlides && (
        <div className="pdfv-slide-ui">
          <button type="button" className="pdfv-slide-btn pdfv-slide-exit" aria-label="יציאה מהמצגת" data-tip="יציאה מהמצגת" onClick={exitSlideshow}>
            <X className="h-5 w-5" aria-hidden />
          </button>
          <div className="pdfv-slide-nav">
            <button
              type="button"
              className="pdfv-slide-btn"
              aria-label="שקופית קודמת"
              data-tip="שקופית קודמת"
              disabled={slideIndex <= 0}
              onClick={() => goTo(slideRef.current - 1)}
            >
              <ChevronRight className="h-5 w-5" aria-hidden />
            </button>
            <span className="pdfv-slide-count" dir="ltr">
              {slideIndex + 1} / {numPages}
            </span>
            <button
              type="button"
              className="pdfv-slide-btn"
              aria-label="שקופית הבאה"
              data-tip="שקופית הבאה"
              disabled={slideIndex >= numPages - 1}
              onClick={() => goTo(slideRef.current + 1)}
            >
              <ChevronLeft className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>
      )}
      <div
        ref={hostRef}
        className="pdfv-scroll"
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
        onClick={showSlides ? onSlideClick : undefined}
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
  presentation,
}: {
  src: string;
  title: string;
  className?: string;
  children: React.ReactNode;
  tip?: string;
  label?: string;
  /** מצגת – מוסיף בצופה כפתור "צפייה כמצגת" */
  presentation?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // ה-<dialog> נכנס ל-HTML רק אחרי הלחיצה הראשונה (בדף יחידה יש כרטיס לכל קובץ, וכל מסמך קטן יותר = טעינה מהירה יותר בנטפרי)
  const [armed, setArmed] = useState(false);
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
  }, [armed]);

  return (
    <>
      <button
        type="button"
        className={className}
        data-tip={tip}
        aria-label={label}
        onClick={() => {
          setArmed(true);
          setOpen(true);
        }}
      >
        {children}
      </button>
      {armed && (
        <dialog ref={ref} className="view-dialog">
          <div className="view-dialog-head">
            <h3>{title}</h3>
            <button type="button" className="fix-close" aria-label="סגירה" onClick={() => setOpen(false)}>
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          {open && <PdfViewer src={src} className="view-dialog-viewer" presentation={presentation} />}
        </dialog>
      )}
    </>
  );
}
