"use client";

import { useEffect, useRef } from "react";

const GAP = 10;
const EDGE = 8;

type Side = "left" | "right" | "above" | "below";

function overlapArea(a: DOMRect | { left: number; top: number; right: number; bottom: number }, b: DOMRect) {
  const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * טולטיפ צף לכל אלמנט עם data-tip (אגוזי-הכפתורים בכרטיסיות). בכל פעם נבחר הצד שבו הוא
 * מסתיר הכי פחות טקסט (שמאל / ימין / מעל / מתחת לכפתור), בלי לחרוג מהמסך.
 */
export function NutTooltip() {
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tip = tipRef.current;
    if (!tip) return;
    let current: Element | null = null;

    /** כמה טקסט (בצמתי טקסט) נחתך ע"י המלבן – ללא הכפתור עצמו */
    function textCovered(rect: { left: number; top: number; right: number; bottom: number }, target: Element) {
      const root = target.closest("main") ?? document.body;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      let covered = 0;
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.textContent?.trim();
        if (!text) continue;
        const parent = n.parentElement;
        if (!parent || target.contains(parent) || tip!.contains(parent)) continue;
        if (parent.closest("script,style,noscript")) continue;
        range.selectNodeContents(n);
        for (const r of range.getClientRects()) {
          if (r.width < 2 || r.height < 2) continue;
          if (overlapArea(rect, r) > 12) {
            covered += Math.min(text.length, 40);
            break;
          }
        }
      }
      return covered;
    }

    function place(target: Element) {
      const t = target.getBoundingClientRect();
      const w = tip!.offsetWidth;
      const h = tip!.offsetHeight;
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const midY = t.top + t.height / 2 - h / 2;
      const midX = t.left + t.width / 2 - w / 2;
      const cands: Record<Side, { left: number; top: number }> = {
        left: { left: t.left - GAP - w, top: midY },
        right: { left: t.right + GAP, top: midY },
        above: { left: midX, top: t.top - GAP - h },
        below: { left: midX, top: t.bottom + GAP },
      };
      let best: { side: Side; left: number; top: number; score: number } | null = null;
      (["left", "right", "above", "below"] as Side[]).forEach((side, order) => {
        const c = cands[side];
        // מחזירים לתוך המסך אם חורג מעט; חריגה גדולה נענשת
        const left = Math.min(Math.max(c.left, EDGE), vw - w - EDGE);
        const top = Math.min(Math.max(c.top, EDGE), vh - h - EDGE);
        const shift = Math.abs(left - c.left) + Math.abs(top - c.top);
        const rect = { left, top, right: left + w, bottom: top + h };
        const score = textCovered(rect, target) * 10 + shift * 2 + order; // order = שובר שוויון
        if (!best || score < best.score) best = { side, left, top, score };
      });
      if (best) {
        const b: { left: number; top: number } = best;
        tip!.style.left = `${Math.round(b.left)}px`;
        tip!.style.top = `${Math.round(b.top)}px`;
      }
    }

    function show(target: Element) {
      const text = target.getAttribute("data-tip");
      if (!text) return;
      current = target;
      tip!.textContent = text;
      tip!.style.visibility = "hidden";
      tip!.dataset.on = "1";
      place(target);
      tip!.style.visibility = "";
      tip!.dataset.show = "1";
    }
    function hide() {
      current = null;
      delete tip!.dataset.show;
      delete tip!.dataset.on;
    }

    const SEL = "[data-tip]";
    const onOver = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.(SEL);
      if (el && el !== current) show(el);
    };
    const onOut = (e: Event) => {
      const el = (e.target as Element | null)?.closest?.(SEL);
      if (el && el === current) {
        const to = (e as MouseEvent).relatedTarget as Node | null;
        if (!to || !el.contains(to)) hide();
      }
    };
    document.addEventListener("mouseover", onOver);
    document.addEventListener("mouseout", onOut);
    document.addEventListener("focusin", onOver);
    document.addEventListener("focusout", hide);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    return () => {
      document.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseout", onOut);
      document.removeEventListener("focusin", onOver);
      document.removeEventListener("focusout", hide);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
    };
  }, []);

  return <div ref={tipRef} className="nut-tip" role="tooltip" aria-hidden />;
}
