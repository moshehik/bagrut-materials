"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/*
 * המונה החי + כפתור תפיסת המקום של דף המבצע (/offer/<slug>). המונה נטען מהשרת (initial) ומתעדכן כל כמה שניות מ-/api/campaign/<slug>;
 * הלחיצה על "תפסי מקום" קוראת ל-/api/campaign/<slug>/claim (אטומי בשרת) ואז ממשיכה לתשלום.
 */
export function OfferLive({
  slug,
  total,
  initialRemaining,
  loggedIn,
  hasSeat,
}: {
  slug: string;
  total: number;
  initialRemaining: number;
  loggedIn: boolean;
  hasSeat: boolean;
}) {
  const router = useRouter();
  const [remaining, setRemaining] = useState(initialRemaining);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/campaign/${slug}`, { cache: "no-store" });
        if (!res.ok) return;
        const d = (await res.json()) as { remaining: number };
        if (!stop) setRemaining(d.remaining);
      } catch {
        /* המונה ימשיך להציג את הערך האחרון */
      }
    };
    const t = setInterval(tick, 8000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [slug]);

  const soldOut = remaining <= 0 && !hasSeat;
  const next = `/offer/${slug}`;

  async function claim() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/campaign/${slug}/claim`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { next?: string; error?: string; soldOut?: boolean };
      if (res.ok && data.next) {
        router.push(data.next);
        return;
      }
      if (data.soldOut) setRemaining(0);
      setError(data.error || "לא הצלחנו לתפוס מקום. נסי שוב.");
    } catch {
      setError("שגיאת רשת – נסי שוב.");
    } finally {
      setBusy(false);
    }
  }

  const taken = Math.max(0, Math.min(total, total - remaining));
  const arrow = <ArrowLeft className="h-4 w-4 fix-gate-arrow" strokeWidth={1.75} aria-hidden />;

  return (
    <div className="offer-live text-center">
      <div className="offer-seats" role="img" aria-label={`נשארו ${remaining} מקומות מתוך ${total}`}>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={i < taken ? "offer-seat offer-seat-taken" : "offer-seat"} aria-hidden="true" />
        ))}
      </div>
      <p className="offer-count" aria-live="polite">
        {soldOut ? (
          <>כל {total} המקומות נתפסו</>
        ) : (
          <>
            נשארו <b className="offer-count-num">{remaining}</b> מקומות מתוך {total}
          </>
        )}
      </p>

      <div className="mt-4 flex flex-col items-center gap-2">
        {soldOut ? (
          <>
            <p className="gate-soft text-lg">המבצע הסתיים – כל המקומות נתפסו. אפשר לראות את המסלולים והמחירים הרגילים.</p>
            <Link href="/pricing" className="btn btn-gold btn-gate py-2">
              למסלולים ומחירים {arrow}
            </Link>
          </>
        ) : loggedIn ? (
          <button type="button" onClick={claim} disabled={busy} className="btn btn-gold btn-gate py-2 text-xl">
            {busy ? "תופסים לך מקום…" : hasSeat ? "להמשך לתשלום – המקום שלך שמור" : "תפסי מקום והמשיכי לתשלום"} {arrow}
          </button>
        ) : (
          <>
            <Link href={`/register?next=${encodeURIComponent(next)}`} className="btn btn-gold btn-gate py-2 text-xl">
              הרשמה ותפיסת מקום {arrow}
            </Link>
            <Link href={`/login?next=${encodeURIComponent(next)}`} className="gate-soft underline">
              כבר רשומה? התחברי
            </Link>
          </>
        )}
        {error && (
          <p role="alert" className="text-base" style={{ color: "#a02020" }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
