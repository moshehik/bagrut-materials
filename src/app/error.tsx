"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RefreshCw, Home } from "lucide-react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <span className="grid h-20 w-20 place-items-center rounded-3xl bg-pink-soft text-5xl animate-pop">
        😥
      </span>
      <h1 className="font-display mt-6 text-3xl font-bold">משהו השתבש</h1>
      <p className="mt-2 max-w-md text-muted leading-relaxed">
        סליחה על התקלה. אפשר לנסות שוב – ואם זה חוזר, כתבי לנו ונטפל בזה מהר.
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-muted" dir="ltr">
          קוד שגיאה: {error.digest}
        </p>
      )}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className="btn btn-primary">
          <RefreshCw className="h-4 w-4" aria-hidden /> נסי שוב
        </button>
        <Link href="/" className="btn btn-ghost">
          <Home className="h-4 w-4" aria-hidden /> לדף הבית
        </Link>
        <Link href="/contact" className="btn btn-ghost">
          צרי קשר
        </Link>
      </div>
    </div>
  );
}
