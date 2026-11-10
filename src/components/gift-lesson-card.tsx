"use client";

import { useState, useTransition } from "react";
import { redeemGiftLessonAction } from "@/lib/actions/lesson-gift";

/** כרטיס "פתחי את השיעור במתנה" בדף התשלום של פרק – מוצג רק למורה שיש לה יתרת שיעורים במתנה */
export function GiftLessonCard({ categoryId, title, credits }: { categoryId: number; title: string; credits: number }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function redeem() {
    setError(null);
    start(async () => {
      const r = await redeemGiftLessonAction(categoryId);
      if (r.ok) window.location.href = r.href;
      else setError(r.error);
    });
  }

  return (
    <section className="gate-panel mx-auto mt-8 max-w-2xl text-center sm:!p-8">
      <span className="gold-ring" aria-hidden="true" />
      <div className="gate-card">
        <h2 className="text-2xl">🎁 שיעור במתנה</h2>
        <p className="gate-soft mt-2 text-lg">
          יש לך {credits === 1 ? "שיעור אחד" : `${credits} שיעורים`} במתנה. אפשר לפתוח את <b>{title}</b> בחינם, עם כל הקבצים שבו.
        </p>
        <div className="mt-4 flex justify-center">
          <button type="button" className="btn btn-gold btn-gate py-2" onClick={redeem} disabled={pending}>
            {pending ? "פותחת…" : "פתחי לי את השיעור במתנה"}
          </button>
        </div>
        {error && <p className="mt-3 text-red-600">{error}</p>}
        <p className="gate-soft mt-3 text-sm">אחרי הפתיחה השיעור שלך לתמיד, והיתרה יורדת ב־1. אפשר גם לשלם על השיעור במקום, למטה.</p>
      </div>
    </section>
  );
}
