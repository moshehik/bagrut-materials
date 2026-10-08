"use client";

import { useEffect } from "react";
import { ErrorSheet } from "@/components/error-sheet";

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

  return <ErrorSheet onRetry={reset} />;
}
