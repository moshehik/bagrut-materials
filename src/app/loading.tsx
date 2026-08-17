export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-10" aria-busy="true" aria-live="polite">
      <span className="sr-only">טוען...</span>
      <div className="h-4 w-48 rounded-full bg-blue-soft" />
      <div className="mt-5 h-10 w-2/3 max-w-md rounded-2xl bg-blue-soft/70" />
      <div className="mt-3 h-4 w-1/2 max-w-sm rounded-full bg-pink-soft" />

      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="card relative overflow-hidden p-5"
            style={{ animationDelay: `${i * 0.08}s` }}
          >
            <div className="flex gap-4">
              <div className="h-12 w-12 rounded-2xl bg-blue-soft" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-2/3 rounded-full bg-blue-soft" />
                <div className="h-3 w-full rounded-full bg-gray-100" />
                <div className="h-3 w-4/5 rounded-full bg-gray-100" />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <div className="h-6 w-16 rounded-full bg-oak-soft" />
              <div className="h-6 w-20 rounded-full bg-gold-soft" />
            </div>
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 animate-shimmer"
              style={{
                background:
                  "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.7) 50%, transparent 100%)",
                backgroundSize: "200% 100%",
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
